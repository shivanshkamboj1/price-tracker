import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '../services/endpoints';
import { CHANNEL_LABELS, DELIVERY_CHANNELS } from '../utils/format';
import type { ChannelSummary, DeliveryChannel } from '../types';

/** What each channel can do right now. Invalidate ['channels'] after connecting something. */
export function useChannels() {
  return useQuery({ queryKey: ['channels'], queryFn: userApi.channels, staleTime: 15_000 });
}

/**
 * Pick any number of delivery channels; every ticked channel gets every alert.
 *
 * Channels the server cannot use (no Twilio, Telegram not set up) are hidden
 * unless already ticked, so they can still be unticked.
 */
export function ChannelPicker({
  value,
  onChange,
  summaries,
  disabled,
}: {
  value: DeliveryChannel[];
  onChange: (next: DeliveryChannel[]) => void;
  summaries: ChannelSummary[] | undefined;
  disabled?: boolean;
}) {
  const byChannel = new Map(summaries?.map((summary) => [summary.channel, summary]));
  const shown = DELIVERY_CHANNELS.filter(
    (channel) => value.includes(channel) || (byChannel.get(channel)?.available ?? !summaries),
  );

  const toggle = (channel: DeliveryChannel) => {
    const next = value.includes(channel) ? value.filter((c) => c !== channel) : [...value, channel];
    // Keep a stable order so saved lists compare equal.
    onChange(DELIVERY_CHANNELS.filter((c) => next.includes(c)));
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {shown.map((channel) => {
        const summary = byChannel.get(channel);
        const checked = value.includes(channel);
        const needsSetup = checked && summary && !summary.ready;
        return (
          <label
            key={channel}
            className={clsx(
              'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition',
              checked ? 'border-brand/40 bg-brand/5' : 'border-line hover:bg-raised',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(channel)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{CHANNEL_LABELS[channel]}</span>
              {summary && (
                <span className={clsx('mt-0.5 block truncate text-xs', needsSetup ? 'text-warn' : 'text-muted')}>
                  {needsSetup ? `Not ready: ${summary.detail.toLowerCase()}` : summary.detail}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
