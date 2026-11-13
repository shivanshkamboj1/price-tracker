import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { SelectInput, TextInput, Toggle } from '../components/Field';
import { Banner } from '../components/Feedback';
import { Badge } from '../components/Badge';
import { userApi } from '../services/endpoints';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { ApiError } from '../services/api';
import { TelegramConnect } from '../components/TelegramConnect';
import { WhatsAppConnect } from '../components/WhatsAppConnect';
import { ChannelPicker, useChannels } from '../components/ChannelPicker';
import {
  DEFAULT_ALERT_RULES,
  DROP_PERCENT_CHOICES,
  formatDateTime,
  MARKETPLACE_LABELS,
} from '../utils/format';
import type { AlertRules, DeliveryChannel, NotificationPrefs } from '../types';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

/** Every IANA zone the browser knows, with the saved one first if the list lacks it. */
function timezoneOptions(current: string): Array<{ value: string; label: string }> {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    // Older browsers: only the saved zone is offered.
  }
  const all = zones.includes(current) ? zones : [current, ...zones];
  return all.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }));
}

interface PhoneForm {
  phone: string;
}

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(user?.notificationPrefs ?? null);

  useEffect(() => {
    if (user?.notificationPrefs) setPrefs(user.notificationPrefs);
  }, [user]);

  const phoneForm = useForm<PhoneForm>({
    values: { phone: user?.phone ?? '' },
  });

  const channelsQuery = useChannels();
  const timezone = user?.timezone ?? 'Asia/Kolkata';

  const sessionsQuery = useQuery({
    queryKey: ['marketplace-sessions'],
    queryFn: userApi.sessions,
  });

  const profileMutation = useMutation({
    mutationFn: userApi.updateProfile,
    onSuccess: async () => {
      toast('Saved', 'success');
      await Promise.all([refreshUser(), queryClient.invalidateQueries({ queryKey: ['channels'] })]);
    },
    onError: (error) =>
      toast(error instanceof ApiError ? error.message : 'Could not save that', 'error'),
  });

  const prefsMutation = useMutation({
    mutationFn: userApi.updateNotificationSettings,
    onSuccess: async () => {
      toast('Notification settings saved', 'success');
      await refreshUser();
    },
    onError: (error) =>
      toast(error instanceof ApiError ? error.message : 'Could not save notification settings', 'error'),
  });

  const disconnectMutation = useMutation({
    mutationFn: userApi.disconnectSession,
    onSuccess: () => {
      toast('Marketplace session disconnected', 'success');
      void queryClient.invalidateQueries({ queryKey: ['marketplace-sessions'] });
    },
  });

  const savePrefs = (patch: Partial<Omit<NotificationPrefs, 'alertRules'>>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    prefsMutation.mutate(patch);
  };

  const rules = { ...DEFAULT_ALERT_RULES, ...prefs?.alertRules };

  const saveRules = (patch: Partial<AlertRules>) => {
    if (!prefs) return;
    setPrefs({ ...prefs, alertRules: { ...rules, ...patch } });
    prefsMutation.mutate({ alertRules: patch });
  };

  // Accounts saved before several channels were supported may lack the list for a moment.
  const channels: DeliveryChannel[] = prefs?.channels ?? [];
  const summaries = channelsQuery.data;
  const readyCount = channels.filter(
    (channel) => summaries?.find((s) => s.channel === channel)?.ready,
  ).length;
  const channelProblem =
    channels.length === 0
      ? 'No channels ticked: alerts are recorded here but not sent anywhere.'
      : summaries && readyCount === 0
        ? 'None of the ticked channels can reach anyone yet — finish setting one up above.'
        : null;

  // SMS and calls need Twilio and the account's own number; hidden otherwise.
  const phoneChannelsShown =
    summaries?.some((s) => (s.channel === 'sms' || s.channel === 'call') && s.available) ||
    channels.some((channel) => channel === 'sms' || channel === 'call');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">Where your alerts go, when, and connected sessions.</p>
      </header>

      <Section
        title="WhatsApp"
        description="Alerts sent from a WhatsApp account you link, to the numbers you choose. Each number gets every WhatsApp alert."
      >
        <WhatsAppConnect />
      </Section>

      <Section
        title="Telegram"
        description="Free, instant alerts from your own bot. Connect as many people or groups as you like — each one gets every alert."
      >
        <TelegramConnect />
      </Section>

      {phoneChannelsShown && (
        <Section title="SMS and phone calls" description="Sent through Twilio to your own number.">
          <form
            className="space-y-4"
            onSubmit={phoneForm.handleSubmit((values) =>
              profileMutation.mutate({ phone: values.phone.trim() || null }),
            )}
          >
            <TextInput
              label="Mobile number"
              type="tel"
              placeholder="+919876543210"
              hint="International format. Only used for SMS and call alerts."
              error={phoneForm.formState.errors.phone?.message}
              {...phoneForm.register('phone', {
                setValueAs: (value: string) => value.replace(/[\s()-]/g, ''),
                pattern: {
                  value: /^(\+[1-9]\d{7,14})?$/,
                  message: 'Use international format, e.g. +919876543210',
                },
              })}
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={profileMutation.isPending}>
                Save number
              </Button>
            </div>
          </form>
        </Section>
      )}

      {prefs && (
        <Section title="Alerts" description="Where and how often we reach you.">
          <div>
            <p className="label">Send alerts to</p>
            <ChannelPicker
              value={channels}
              summaries={summaries}
              onChange={(next) => savePrefs({ channels: next })}
            />
            {channelProblem ? (
              <p className="error-text">{channelProblem}</p>
            ) : (
              <p className="hint">Every ticked channel gets every alert. Products can pick their own.</p>
            )}
          </div>

          <SelectInput
            label="When a product drops below target"
            hint="“Once” waits until the price rises above your target again before alerting a second time."
            value={prefs.alertMode}
            onChange={(event) => savePrefs({ alertMode: event.target.value as NotificationPrefs['alertMode'] })}
            options={[
              { value: 'once', label: 'Notify me once' },
              { value: 'always', label: 'Notify me whenever it drops below target again' },
            ]}
          />

          <SelectInput
            label="Minimum gap between alerts for one product"
            value={String(prefs.minIntervalMinutes)}
            onChange={(event) => savePrefs({ minIntervalMinutes: Number(event.target.value) })}
            options={[
              { value: '0', label: 'No minimum' },
              { value: '60', label: '1 hour' },
              { value: '360', label: '6 hours' },
              { value: '1440', label: '1 day' },
            ]}
          />

          <div className="space-y-3 border-t border-line pt-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Smart alerts</h3>
              <p className="mt-0.5 text-xs text-muted">
                On top of your target price. These are defaults for every product; each product can
                override them. Several triggers on the same check arrive as one message.
              </p>
            </div>

            <SelectInput
              label="Alert when the price drops by"
              hint="Measured from the highest price since the last drop alert, so a slow slide counts too."
              value={String(rules.dropPercent)}
              onChange={(event) => saveRules({ dropPercent: Number(event.target.value) })}
              options={[
                { value: '0', label: 'Off' },
                ...DROP_PERCENT_CHOICES.map((percent) => ({
                  value: String(percent),
                  label: `${percent}% or more`,
                })),
              ]}
            />
            <Toggle
              label="New lowest price ever"
              description="When the price goes below the lowest price recorded for the product."
              checked={rules.allTimeLow}
              onChange={(allTimeLow) => saveRules({ allTimeLow })}
            />
            <Toggle
              label="Back in stock"
              description="When an out-of-stock product becomes available again."
              checked={rules.backInStock}
              onChange={(backInStock) => saveRules({ backInStock })}
            />
          </div>

          <div className="border-t border-line pt-4">
            <Toggle
              label="Quiet hours"
              description="Alerts raised during this window are held and delivered afterwards, not dropped."
              checked={prefs.quietHours.enabled}
              onChange={(enabled) => savePrefs({ quietHours: { ...prefs.quietHours, enabled } })}
            />

            {prefs.quietHours.enabled && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <SelectInput
                  label="From"
                  value={String(prefs.quietHours.startHour)}
                  onChange={(event) =>
                    savePrefs({
                      quietHours: { ...prefs.quietHours, startHour: Number(event.target.value) },
                    })
                  }
                  options={Array.from({ length: 24 }, (_, hour) => ({
                    value: hour,
                    label: `${String(hour).padStart(2, '0')}:00`,
                  }))}
                />
                <SelectInput
                  label="Until"
                  value={String(prefs.quietHours.endHour)}
                  onChange={(event) =>
                    savePrefs({
                      quietHours: { ...prefs.quietHours, endHour: Number(event.target.value) },
                    })
                  }
                  options={Array.from({ length: 24 }, (_, hour) => ({
                    value: hour,
                    label: `${String(hour).padStart(2, '0')}:00`,
                  }))}
                />
                <SelectInput
                  label="In timezone"
                  value={timezone}
                  onChange={(event) => profileMutation.mutate({ timezone: event.target.value })}
                  options={timezoneOptions(timezone)}
                />
              </div>
            )}
          </div>
        </Section>
      )}

      <Section
        title="Marketplace sessions"
        description="Optional. Only needed when a marketplace shows you a different price while signed in."
      >
        <Banner tone="info" title="We never handle your marketplace credentials">
          You sign in directly with Amazon or Flipkart, in your own browser. Pricewatch has no
          marketplace login form and never receives your password, OTP, CVV or payment details.
          Anything a companion browser extension hands us is stored encrypted and can be erased at
          any time.
        </Banner>

        <div className="space-y-2">
          {sessionsQuery.data?.length ? (
            sessionsQuery.data.map((session) => (
              <div
                key={session._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {MARKETPLACE_LABELS[session.marketplace] ?? session.marketplace}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {session.status === 'connected'
                      ? `Connected ${formatDateTime(session.connectedAt)}`
                      : `Not connected`}
                    {session.label ? ` · ${session.label}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={session.status === 'connected' ? 'good' : 'neutral'}>
                    {session.status}
                  </Badge>
                  {session.status === 'connected' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => disconnectMutation.mutate(session.marketplace)}
                      loading={disconnectMutation.isPending}
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">
              No marketplace sessions are connected. Everything works without them.
            </p>
          )}
        </div>
      </Section>

      <Section
        title="Access password"
        description="One password unlocks this app; it is set by whoever runs it."
      >
        <p className="text-sm text-muted">
          There are no accounts to manage. The password lives in the server's{' '}
          <code className="rounded bg-line/60 px-1 py-0.5 text-xs">APP_ACCESS_PASSWORD</code>{' '}
          setting — change it there and restart to revoke every unlocked browser.
        </p>
      </Section>
    </div>
  );
}
