import clsx from 'clsx';
import type { ReactNode } from 'react';
import { AVAILABILITY_LABELS, MARKETPLACE_LABELS, STATUS_LABELS } from '../utils/format';
import type { Availability, Marketplace, ProductStatus } from '../types';

type Tone = 'neutral' | 'brand' | 'good' | 'warn' | 'bad';

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-raised text-muted',
  brand: 'border-brand/25 bg-brand/10 text-brand',
  good: 'border-good/25 bg-good/10 text-good',
  warn: 'border-warn/25 bg-warn/10 text-warn',
  bad: 'border-bad/25 bg-bad/10 text-bad',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Marketplace identity is shown with a colour and a wordmark-free label. */
const MARKETPLACE_TONE: Record<Marketplace, string> = {
  amazon_in: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  flipkart: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
};

export function MarketplaceBadge({
  marketplace,
  className,
}: {
  marketplace: Marketplace;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-semibold',
        MARKETPLACE_TONE[marketplace],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {MARKETPLACE_LABELS[marketplace] ?? marketplace}
    </span>
  );
}

const STATUS_TONE: Record<ProductStatus, Tone> = {
  active: 'good',
  paused: 'neutral',
  unavailable: 'warn',
  error: 'bad',
  deleted: 'neutral',
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status] ?? status}</Badge>;
}

const AVAILABILITY_TONE: Record<Availability, Tone> = {
  in_stock: 'good',
  out_of_stock: 'bad',
  unknown: 'neutral',
};

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  return (
    <Badge tone={AVAILABILITY_TONE[availability]}>
      {AVAILABILITY_LABELS[availability] ?? availability}
    </Badge>
  );
}
