import { useState, type FormEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from './Badge';
import { Button } from './Button';
import { Banner } from './Feedback';
import { TextInput } from './Field';
import { userApi } from '../services/endpoints';
import { ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import type { WhatsAppRecipient, WhatsAppStatus } from '../types';

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const cleanPhone = (value: string) => value.replace(/[\s()-]/g, '');

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

/** Fast while something is changing, slow otherwise. */
function pollInterval(status: WhatsAppStatus | undefined): number {
  if (!status) return 5_000;
  if (['linking', 'connecting', 'reconnecting'].includes(status.status)) return 2_000;
  if (!status.workerOnline) return 10_000;
  return 30_000;
}

function Step({
  number,
  title,
  done,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span
        className={clsx(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          done ? 'bg-good/15 text-good' : 'bg-brand/10 text-brand',
        )}
        aria-hidden
      >
        {done ? '✓' : number}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------- step 1 ------------------------------- */

function SenderStep({ status, onChanged }: { status: WhatsAppStatus; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const [codePhone, setCodePhone] = useState('');
  const [codeMode, setCodeMode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const linkMutation = useMutation({
    mutationFn: userApi.whatsappLink,
    onSuccess: onChanged,
    onError: (error) => toast(errorMessage(error, 'Could not start linking WhatsApp'), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: userApi.whatsappCancelLink,
    onSettled: onChanged,
  });

  const unlinkMutation = useMutation({
    mutationFn: userApi.whatsappUnlink,
    onSuccess: async (result) => {
      toast(
        result.removedFromPhone
          ? 'WhatsApp unlinked'
          : 'Unlinked here. Also remove it on the phone: Settings → Linked devices.',
        'success',
      );
      await onChanged();
    },
    onError: (error) => toast(errorMessage(error, 'Could not unlink WhatsApp'), 'error'),
  });

  const requestCode = (event: FormEvent) => {
    event.preventDefault();
    const phone = cleanPhone(codePhone);
    if (!PHONE_PATTERN.test(phone)) {
      setCodeError('Use international format, e.g. +919876543210');
      return;
    }
    setCodeError(null);
    linkMutation.mutate({ method: 'code', phone });
  };

  const account = status.account;

  if (status.status === 'linking') {
    return (
      <div className="space-y-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-4">
        {status.pairingCode ? (
          <>
            <p className="text-sm text-ink">
              On the phone you send from, open WhatsApp → <b>Settings</b> → <b>Linked devices</b> →{' '}
              <b>Link a device</b> → <b>Link with phone number instead</b>, and type:
            </p>
            <p className="font-mono text-2xl font-semibold tracking-[0.25em] text-ink" aria-live="polite">
              {status.pairingCode.slice(0, 4)}-{status.pairingCode.slice(4)}
            </p>
          </>
        ) : status.qrDataUrl ? (
          <div className="flex flex-wrap items-center gap-5">
            {/* QR codes need a light background to scan, in either theme. */}
            <img
              src={status.qrDataUrl}
              alt="WhatsApp link QR code"
              width={200}
              height={200}
              className="rounded-lg bg-white p-2"
            />
            <ol className="max-w-xs list-decimal space-y-1 pl-4 text-sm text-ink">
              <li>Open WhatsApp on the phone with the number you send from.</li>
              <li>
                Go to <b>Settings</b> → <b>Linked devices</b> → <b>Link a device</b>.
              </li>
              <li>Scan this code. It refreshes by itself; this page updates when linked.</li>
            </ol>
          </div>
        ) : (
          <p className="text-sm text-muted" aria-live="polite">
            Getting a code from WhatsApp…
          </p>
        )}
        {status.error && <p className="text-xs text-bad">{status.error}</p>}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate()} loading={cancelMutation.isPending}>
            Cancel
          </Button>
          <span className="text-xs text-muted">Waiting for the phone…</span>
        </div>
      </div>
    );
  }

  if (account && status.linked) {
    const state =
      status.status === 'connected'
        ? { tone: 'good' as const, label: 'connected' }
        : status.status === 'offline'
          ? { tone: 'neutral' as const, label: 'worker offline' }
          : { tone: 'warn' as const, label: 'reconnecting' };
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              {account.phone}
              <Badge tone={state.tone}>{state.label}</Badge>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {account.name ? `${account.name} · ` : ''}Alerts are sent from this account.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => unlinkMutation.mutate()} loading={unlinkMutation.isPending}>
            Unlink
          </Button>
        </div>
        {status.restricted && (
          <Banner tone="warn" title="WhatsApp is limiting this account">
            WhatsApp is temporarily stopping it from messaging people it has not chatted with. Alerts
            to those numbers will fail until the limit lifts.
          </Banner>
        )}
        {status.error && <p className="text-xs text-warn">{status.error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Link the WhatsApp account alerts are sent <em>from</em> — your spare or temporary number. It
        works like WhatsApp Web: the phone stays the main device.
      </p>
      {status.error && <p className="text-xs text-bad">{status.error}</p>}
      {codeMode ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={requestCode}>
          <div className="min-w-[14rem] flex-1">
            <TextInput
              label="Number you send from"
              type="tel"
              placeholder="+919876543210"
              value={codePhone}
              error={codeError ?? undefined}
              onChange={(event) => setCodePhone(event.target.value)}
            />
          </div>
          <Button type="submit" size="sm" loading={linkMutation.isPending} className="mb-[1px]">
            Get pairing code
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCodeMode(false)} className="mb-[1px]">
            Use QR code
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => linkMutation.mutate({ method: 'qr' })}
            loading={linkMutation.isPending}
            disabled={!status.workerOnline}
          >
            Link with QR code
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCodeMode(true)} disabled={!status.workerOnline}>
            Use a pairing code instead
          </Button>
        </div>
      )}
      <p className="text-xs text-muted">
        A pairing code suits a phone that cannot scan this screen — for example when this page is
        open on that same phone.
      </p>
    </div>
  );
}

/* ------------------------------- step 2 ------------------------------- */

function RecipientRow({
  recipient,
  onTest,
  onRemove,
  testing,
  removing,
  canTest,
}: {
  recipient: WhatsAppRecipient;
  onTest: () => void;
  onRemove: () => void;
  testing: boolean;
  removing: boolean;
  canTest: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{recipient.name ?? recipient.phone}</p>
        {recipient.name && <p className="mt-0.5 text-xs text-muted">{recipient.phone}</p>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onTest} loading={testing} disabled={!canTest}>
          Test
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove} loading={removing}>
          Remove
        </Button>
      </div>
    </li>
  );
}

function RecipientsStep({ status, onChanged }: { status: WhatsAppStatus; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const connected = status.status === 'connected';
  const { recipients, maxRecipients } = status;
  const full = recipients.length >= maxRecipients;

  const addMutation = useMutation({
    mutationFn: userApi.whatsappAddRecipient,
    onSuccess: async () => {
      toast('Number added', 'success');
      setPhone('');
      setName('');
      await onChanged();
    },
    onError: (error) => setPhoneError(errorMessage(error, 'Could not add that number')),
  });

  const removeMutation = useMutation({
    mutationFn: userApi.whatsappRemoveRecipient,
    onSuccess: async () => {
      toast('Number removed', 'success');
      await onChanged();
    },
    onError: (error) => toast(errorMessage(error, 'Could not remove that number'), 'error'),
  });

  const testMutation = useMutation({
    mutationFn: (recipientId?: string) => userApi.whatsappTest(recipientId),
    onSuccess: (result) => {
      if (result.failed.length === 0) {
        toast(result.sent === 1 ? 'Test sent — check WhatsApp' : `Test sent to ${result.sent} numbers`, 'success');
      } else {
        toast(`Sent to ${result.sent}; not delivered to ${result.failed.map((f) => f.reason).join('; ')}`, 'error');
      }
    },
    onError: (error) => toast(errorMessage(error, 'Could not send the test message'), 'error'),
  });

  const add = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = cleanPhone(phone);
    if (!PHONE_PATTERN.test(cleaned)) {
      setPhoneError('Use international format, e.g. +919876543210');
      return;
    }
    setPhoneError(null);
    addMutation.mutate({ phone: cleaned, name: name.trim() || undefined });
  };

  return (
    <div className="space-y-3">
      {recipients.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {recipients.map((recipient) => (
            <RecipientRow
              key={recipient.id}
              recipient={recipient}
              canTest={connected}
              onTest={() => testMutation.mutate(recipient.id)}
              onRemove={() => removeMutation.mutate(recipient.id)}
              testing={testMutation.isPending && testMutation.variables === recipient.id}
              removing={removeMutation.isPending && removeMutation.variables === recipient.id}
            />
          ))}
        </ul>
      )}

      {connected ? (
        full ? (
          <p className="text-xs text-muted">
            {recipients.length} of {maxRecipients} numbers — remove one to add another.
          </p>
        ) : (
          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={add}>
            <TextInput
              label="WhatsApp number"
              type="tel"
              placeholder="+919876543210"
              value={phone}
              error={phoneError ?? undefined}
              onChange={(event) => setPhone(event.target.value)}
            />
            <TextInput
              label="Name (optional)"
              placeholder="e.g. Me, Mum"
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" size="md" loading={addMutation.isPending} className={phoneError ? 'sm:mb-[1.375rem]' : ''}>
              Add number
            </Button>
          </form>
        )
      ) : (
        <p className="text-sm text-muted">
          {recipients.length > 0
            ? 'These numbers get alerts while the account above is connected.'
            : 'Link the account above first; each number is checked on WhatsApp when you add it.'}
        </p>
      )}

      {recipients.length > 1 && connected && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => testMutation.mutate(undefined)}
          loading={testMutation.isPending && testMutation.variables === undefined}
        >
          Test all
        </Button>
      )}
    </div>
  );
}

/* ------------------------------- the whole ------------------------------- */

/**
 * WhatsApp setup, in order: first link the account alerts are sent from (QR
 * code or pairing code, the WhatsApp Web way), then add the numbers they go to.
 * Every number gets every WhatsApp alert.
 */
export function WhatsAppConnect() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();

  const statusQuery = useQuery({
    queryKey: ['whatsapp'],
    queryFn: userApi.whatsappStatus,
    refetchInterval: (query) => pollInterval(query.state.data),
  });
  const status = statusQuery.data;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] }),
      queryClient.invalidateQueries({ queryKey: ['channels'] }),
    ]);
    await refreshUser();
  };

  if (statusQuery.isError) {
    const error = statusQuery.error;
    const outdated = error instanceof ApiError && error.status === 404;
    return (
      <Banner
        tone="bad"
        title="Could not load WhatsApp settings"
        action={
          <Button size="sm" variant="secondary" onClick={() => void statusQuery.refetch()}>
            Try again
          </Button>
        }
      >
        {outdated
          ? 'The API is running an older version without WhatsApp support. Rebuild the server and restart the API and worker.'
          : errorMessage(error, 'The server did not respond. Check that the API is running.')}
      </Banner>
    );
  }

  if (!status) return <p className="text-sm text-muted">Checking WhatsApp…</p>;

  if (!status.enabled) {
    return (
      <Banner tone="warn" title="WhatsApp is turned off on the server">
        Remove <code className="rounded bg-line/60 px-1 py-0.5 text-xs">WHATSAPP_ENABLED=false</code>{' '}
        from the server's <code className="rounded bg-line/60 px-1 py-0.5 text-xs">.env</code> and
        restart the API and worker.
      </Banner>
    );
  }

  const senderReady = status.linked && status.status === 'connected';

  return (
    <div className="space-y-5">
      {!status.workerOnline && (
        <Banner tone="warn" title="The worker is not running">
          The WhatsApp connection lives in the worker process. Start it (
          <code className="rounded bg-line/60 px-1 py-0.5 text-xs">npm run dev:worker</code>) and
          this page picks it up within a few seconds.
        </Banner>
      )}

      <Step number={1} title="Send from" done={senderReady}>
        <SenderStep status={status} onChanged={refresh} />
      </Step>

      <Step number={2} title="Send to" done={status.recipients.length > 0}>
        <RecipientsStep status={status} onChanged={refresh} />
      </Step>

      <p className="text-xs text-muted">
        This uses WhatsApp's linked-devices feature rather than an official business API, so
        WhatsApp may restrict or ban a number that sends automated messages. Use a number you can
        afford to lose.
      </p>
    </div>
  );
}
