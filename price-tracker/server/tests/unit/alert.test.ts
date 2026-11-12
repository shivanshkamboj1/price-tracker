import { evaluateAlert, type AlertInputs } from '../../src/services/alert.service';

const base: AlertInputs = {
  price: 4_000_000, // ₹40,000
  availability: 'in_stock',
  targetPrice: 4_500_000, // ₹45,000
  alertArmed: false,
  alertMode: 'once',
  channel: 'whatsapp',
  hasPhone: true,
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

  it('skips delivery when no phone number is on file', () => {
    expect(evaluateAlert({ ...base, hasPhone: false }).reason).toBe('no_phone_number');
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
