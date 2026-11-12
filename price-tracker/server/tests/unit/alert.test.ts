import {
  evaluateAlert,
  hasDestinationFor,
  resolveAlertSettings,
  type AlertInputs,
} from '../../src/services/alert.service';
import {
  priceAlertSms,
  priceAlertTelegram,
  priceAlertWhatsApp,
} from '../../src/services/notification/templates';
import type { PriceAlertPayload } from '../../src/services/notification/types';

const base: AlertInputs = {
  price: 4_000_000, // ₹40,000
  availability: 'in_stock',
  targetPrice: 4_500_000, // ₹45,000
  alertArmed: false,
  alertMode: 'once',
  channel: 'whatsapp',
  hasDestination: true,
  minIntervalMinutes: 360,
  quietHours: { enabled: false, startHour: 22, endHour: 8 },
  timezone: 'Asia/Kolkata',
};

describe('evaluateAlert', () => {
  it('alerts when the price reaches the target', () => {
    expect(evaluateAlert(base).shouldAlert).toBe(true);
  });

  it('alerts when the price is exactly the target', () => {
    expect(evaluateAlert({ ...base, price: base.targetPrice }).shouldAlert).toBe(true);
  });

  it('does not alert while the price is above the target', () => {
    const decision = evaluateAlert({ ...base, price: 5_000_000 });
    expect(decision.shouldAlert).toBe(false);
    expect(decision.reason).toBe('above_target');
  });

  it('re-arms once the price climbs back above the target', () => {
    const decision = evaluateAlert({ ...base, price: 5_000_000, alertArmed: true });
    expect(decision.shouldAlert).toBe(false);
    expect(decision.shouldDisarm).toBe(true);
  });

  it('does not alert without a price', () => {
    expect(evaluateAlert({ ...base, price: null }).reason).toBe('no_price');
  });

  it('does not alert for an out-of-stock listing', () => {
    expect(evaluateAlert({ ...base, availability: 'out_of_stock' }).reason).toBe('out_of_stock');
  });

  describe('notify once', () => {
    it('stays quiet on the second poll of the same drop', () => {
      const decision = evaluateAlert({ ...base, alertArmed: true });
      expect(decision.shouldAlert).toBe(false);
      expect(decision.reason).toBe('already_notified');
    });
  });

  describe('notify always', () => {
    it('alerts again once the cooldown has passed', () => {
      const decision = evaluateAlert({
        ...base,
        alertMode: 'always',
        alertArmed: true,
        lastAlertAt: new Date(Date.now() - 7 * 60 * 60_000),
      });
      expect(decision.shouldAlert).toBe(true);
    });

    it('throttles repeats inside the minimum interval', () => {
      const decision = evaluateAlert({
        ...base,
        alertMode: 'always',
        alertArmed: true,
        lastAlertAt: new Date(Date.now() - 30 * 60_000),
      });
      expect(decision.shouldAlert).toBe(false);
      expect(decision.reason).toBe('cooling_down');
    });
  });

  it('skips delivery when the channel is off', () => {
    expect(evaluateAlert({ ...base, channel: 'none' }).reason).toBe('channel_disabled');
  });

  it('skips delivery when there is nowhere to send it', () => {
    expect(evaluateAlert({ ...base, hasDestination: false }).reason).toBe('no_destination');
  });

  describe('quiet hours', () => {
    // 02:00 IST is inside a 22:00 -> 08:00 window.
    const nightInIndia = new Date('2026-03-01T20:30:00.000Z');

    it('holds the alert rather than dropping it', () => {
      const decision = evaluateAlert({
        ...base,
        quietHours: { enabled: true, startHour: 22, endHour: 8 },
        now: nightInIndia,
      });
      expect(decision.shouldAlert).toBe(true);
      expect(decision.delayMs).toBeGreaterThan(0);
    });

    it('sends immediately outside the window', () => {
      const decision = evaluateAlert({
        ...base,
        quietHours: { enabled: true, startHour: 22, endHour: 8 },
        now: new Date('2026-03-01T09:00:00.000Z'), // 14:30 IST
      });
      expect(decision.shouldAlert).toBe(true);
      expect(decision.delayMs).toBe(0);
    });
  });
});

describe('smart alerts', () => {
  // Above target throughout, so only the smart rule under test can fire.
  const smart: AlertInputs = {
    ...base,
    targetPrice: 1_000_000,
    price: 4_000_000,
    rules: { dropPercent: 0, allTimeLow: false, backInStock: false },
  };

  describe('percentage drop', () => {
    const rules = { dropPercent: 10, allTimeLow: false, backInStock: false };

    it('fires once the price is the threshold below its baseline', () => {
      const decision = evaluateAlert({ ...smart, rules, dropReferencePrice: 5_000_000, price: 4_500_000 });
      expect(decision.shouldAlert).toBe(true);
      expect(decision.reasons).toEqual(['price_drop']);
      // The next alert needs a fresh 10% from here.
      expect(decision.dropReferencePrice).toBe(4_500_000);
    });

    it('does not fire for a smaller drop and keeps the baseline', () => {
      const decision = evaluateAlert({ ...smart, rules, dropReferencePrice: 5_000_000, price: 4_600_000 });
      expect(decision.shouldAlert).toBe(false);
      expect(decision.dropReferencePrice).toBe(5_000_000);
    });

    it('catches a slow slide that adds up to the threshold', () => {
      let reference: number | undefined;
      const fired: number[] = [];
      for (const price of [5_000_000, 4_850_000, 4_700_000, 4_550_000, 4_450_000]) {
        const decision = evaluateAlert({ ...smart, rules, dropReferencePrice: reference, price });
        reference = decision.dropReferencePrice;
        if (decision.shouldAlert) fired.push(price);
      }
      expect(fired).toEqual([4_450_000]);
    });

    it('ratchets the baseline up when the price rises', () => {
      const decision = evaluateAlert({ ...smart, rules, dropReferencePrice: 4_000_000, price: 4_400_000 });
      expect(decision.shouldAlert).toBe(false);
      expect(decision.dropReferencePrice).toBe(4_400_000);
    });

    it('follows the price while the rule is off, so enabling it starts from today', () => {
      const decision = evaluateAlert({ ...smart, dropReferencePrice: 5_000_000, price: 3_000_000 });
      expect(decision.shouldAlert).toBe(false);
      expect(decision.dropReferencePrice).toBe(3_000_000);
    });

    it('keeps the baseline when the alert cannot be delivered', () => {
      const decision = evaluateAlert({
        ...smart,
        rules,
        dropReferencePrice: 5_000_000,
        price: 4_000_000,
        channel: 'none',
      });
      expect(decision.shouldAlert).toBe(false);
      expect(decision.reason).toBe('channel_disabled');
      expect(decision.dropReferencePrice).toBe(5_000_000);
    });

    it('is throttled by the minimum interval', () => {
      const decision = evaluateAlert({
        ...smart,
        rules,
        dropReferencePrice: 5_000_000,
        price: 4_000_000,
        lastSmartAlertAt: { price_drop: new Date(Date.now() - 10 * 60_000) },
      });
      expect(decision.shouldAlert).toBe(false);
    });
  });

  describe('lowest price ever', () => {
    const rules = { dropPercent: 0, allTimeLow: true, backInStock: false };

    it('fires when the price beats the previous low', () => {
      const decision = evaluateAlert({ ...smart, rules, previousLowestPrice: 4_100_000 });
      expect(decision.reasons).toEqual(['all_time_low']);
    });

    it('does not fire on a tie', () => {
      expect(evaluateAlert({ ...smart, rules, previousLowestPrice: 4_000_000 }).shouldAlert).toBe(false);
    });

    it('does not fire on the very first reading', () => {
      expect(evaluateAlert({ ...smart, rules, previousLowestPrice: undefined }).shouldAlert).toBe(false);
    });

    it('does not fire for an out-of-stock listing', () => {
      const decision = evaluateAlert({
        ...smart,
        rules,
        previousLowestPrice: 4_100_000,
        availability: 'out_of_stock',
      });
      expect(decision.shouldAlert).toBe(false);
    });
  });

  describe('back in stock', () => {
    const rules = { dropPercent: 0, allTimeLow: false, backInStock: true };

    it('fires on the out-of-stock to in-stock transition', () => {
      const decision = evaluateAlert({ ...smart, rules, previousAvailability: 'out_of_stock' });
      expect(decision.reasons).toEqual(['back_in_stock']);
    });

    it('does not fire when stock status was simply unknown before', () => {
      expect(evaluateAlert({ ...smart, rules, previousAvailability: 'unknown' }).shouldAlert).toBe(false);
    });

    it('does not fire while the listing stays in stock', () => {
      expect(evaluateAlert({ ...smart, rules, previousAvailability: 'in_stock' }).shouldAlert).toBe(false);
    });
  });

  it('combines every trigger from one check into a single alert, target first', () => {
    const decision = evaluateAlert({
      ...base,
      price: 4_000_000, // below the ₹45,000 target
      rules: { dropPercent: 10, allTimeLow: true, backInStock: true },
      dropReferencePrice: 5_000_000,
      previousLowestPrice: 4_200_000,
      previousAvailability: 'out_of_stock',
    });
    expect(decision.shouldAlert).toBe(true);
    expect(decision.reasons).toEqual(['target_reached', 'all_time_low', 'price_drop', 'back_in_stock']);
  });

  it('still sends a smart alert after the target alert has been sent once', () => {
    const decision = evaluateAlert({
      ...base,
      alertArmed: true, // "once" mode, already notified for the target
      rules: { dropPercent: 0, allTimeLow: true, backInStock: false },
      previousLowestPrice: 4_100_000,
    });
    expect(decision.reasons).toEqual(['all_time_low']);
  });
});

describe('resolveAlertSettings', () => {
  const user = {
    notificationPrefs: {
      channel: 'telegram' as const,
      alertMode: 'once' as const,
      minIntervalMinutes: 360,
      quietHours: { enabled: false, startHour: 22, endHour: 8 },
      alertRules: { dropPercent: 10, allTimeLow: true, backInStock: false },
    },
  };

  it('uses the account defaults when the product has no overrides', () => {
    expect(resolveAlertSettings({}, user).rules).toEqual({
      dropPercent: 10,
      allTimeLow: true,
      backInStock: false,
    });
  });

  it('lets a product override each rule, including switching one off', () => {
    const { rules } = resolveAlertSettings(
      { alertRules: { dropPercent: 0, backInStock: true } },
      user,
    );
    expect(rules).toEqual({ dropPercent: 0, allTimeLow: true, backInStock: true });
  });

  it('falls back to built-in defaults for accounts that predate smart alerts', () => {
    const legacy = { notificationPrefs: { ...user.notificationPrefs, alertRules: undefined } };
    expect(resolveAlertSettings({}, legacy as never).rules).toEqual({
      dropPercent: 0,
      allTimeLow: false,
      backInStock: true,
    });
  });
});

describe('hasDestinationFor', () => {
  it('needs a linked chat for Telegram and a phone number for everything else', () => {
    const chat = { chatId: '42', linkedAt: new Date() };
    expect(hasDestinationFor('telegram', { phone: '+919876543210' })).toBe(false);
    expect(hasDestinationFor('telegram', { telegramChats: [chat] })).toBe(true);
    expect(hasDestinationFor('telegram', { telegramChats: [] })).toBe(false);
    expect(hasDestinationFor('whatsapp', { telegramChats: [chat] })).toBe(false);
    expect(hasDestinationFor('sms', { phone: '+919876543210' })).toBe(true);
  });
});

describe('alert templates', () => {
  const payload: PriceAlertPayload = {
    to: '42',
    channel: 'telegram',
    reasons: ['price_drop', 'back_in_stock'],
    productTitle: 'Sony WH-1000XM5 <Black> & Silver',
    marketplaceLabel: 'Amazon India',
    currentPrice: 2_499_900,
    targetPrice: 2_000_000,
    currency: 'INR',
    productUrl: 'https://www.amazon.in/dp/B0B3C2R8MP?a=1&b=2',
    dropFromPrice: 2_999_900,
  };

  it('headlines the primary trigger and explains each one', () => {
    const text = priceAlertWhatsApp(payload);
    expect(text.startsWith('Price Drop −17% 📉')).toBe(true);
    expect(text).toContain('The price fell 17% from ₹29,999.');
    expect(text).toContain('It is back in stock.');
  });

  it('escapes product text for Telegram HTML', () => {
    const html = priceAlertTelegram(payload);
    expect(html).toContain('Sony WH-1000XM5 &lt;Black&gt; &amp; Silver');
    expect(html).toContain('href="https://www.amazon.in/dp/B0B3C2R8MP?a=1&amp;b=2"');
    expect(html).not.toContain('<Black>');
  });

  it('keeps SMS short and labelled by trigger', () => {
    const sms = priceAlertSms({ ...payload, reasons: ['all_time_low'], channel: 'sms' });
    expect(sms.split('\n')[0]).toBe('Lowest price ever: Sony WH-1000XM5 <Black> & Silver');
  });

  it('reads an empty reason list as a target alert, as older alerts have', () => {
    expect(priceAlertWhatsApp({ ...payload, reasons: [] })).toContain('Price Alert 🔔');
  });
});
