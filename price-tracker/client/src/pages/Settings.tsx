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
import { formatDateTime, MARKETPLACE_LABELS } from '../utils/format';
import type { NotificationPrefs } from '../types';

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

interface ProfileForm {
  name: string;
  phone: string;
  timezone: string;
}

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(user?.notificationPrefs ?? null);

  useEffect(() => {
    if (user?.notificationPrefs) setPrefs(user.notificationPrefs);
  }, [user]);

  const profileForm = useForm<ProfileForm>({
    values: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      timezone: user?.timezone ?? 'Asia/Kolkata',
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ['marketplace-sessions'],
    queryFn: userApi.sessions,
  });

  const profileMutation = useMutation({
    mutationFn: userApi.updateProfile,
    onSuccess: async () => {
      toast('Profile updated', 'success');
      await refreshUser();
    },
    onError: (error) =>
      toast(error instanceof ApiError ? error.message : 'Could not save your profile', 'error'),
  });

  const prefsMutation = useMutation({
    mutationFn: userApi.updateNotificationSettings,
    onSuccess: async () => {
      toast('Notification settings saved', 'success');
      await refreshUser();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: userApi.disconnectSession,
    onSuccess: () => {
      toast('Marketplace session disconnected', 'success');
      void queryClient.invalidateQueries({ queryKey: ['marketplace-sessions'] });
    },
  });

  const savePrefs = (patch: Partial<NotificationPrefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    prefsMutation.mutate(patch);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">Your profile, alerts and connected sessions.</p>
      </header>

      <Section title="Profile" description="Used for your alerts and to schedule quiet hours.">
        <form
          className="space-y-4"
          onSubmit={profileForm.handleSubmit((values) =>
            profileMutation.mutate({
              name: values.name,
              phone: values.phone.trim() || null,
              timezone: values.timezone,
            }),
          )}
        >
          <TextInput label="Name" {...profileForm.register('name', { required: true })} />

          <TextInput
            label="Mobile number"
            type="tel"
            placeholder="+919876543210"
            hint="International format. Required for SMS and WhatsApp alerts."
            error={profileForm.formState.errors.phone?.message}
            {...profileForm.register('phone', {
              pattern: {
                value: /^\+[1-9]\d{7,14}$/,
                message: 'Use international format, e.g. +919876543210',
              },
            })}
          />

          <TextInput
            label="Timezone"
            hint="An IANA name such as Asia/Kolkata."
            {...profileForm.register('timezone')}
          />

          {user && !user.phoneVerified && user.phone && (
            <p className="text-xs text-warn">
              This number has not been verified yet. Alerts will still be attempted.
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={profileMutation.isPending}>
              Save profile
            </Button>
          </div>
        </form>
      </Section>

      {prefs && (
        <Section title="Alerts" description="How and how often we reach you.">
          <SelectInput
            label="Delivery channel"
            value={prefs.channel}
            onChange={(event) => savePrefs({ channel: event.target.value as NotificationPrefs['channel'] })}
            options={[
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'sms', label: 'SMS' },
              { value: 'call', label: 'Phone call' },
              { value: 'none', label: 'No notifications' },
            ]}
          />

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

          <div className="border-t border-line pt-4">
            <Toggle
              label="Quiet hours"
              description="Alerts raised during this window are held and delivered afterwards, not dropped."
              checked={prefs.quietHours.enabled}
              onChange={(enabled) => savePrefs({ quietHours: { ...prefs.quietHours, enabled } })}
            />

            {prefs.quietHours.enabled && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
