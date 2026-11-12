import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Small supporting line under the value. */
  detail?: ReactNode;
  /** Change indicator; the glyph carries the meaning, not the colour alone. */
  delta?: { direction: 'up' | 'down' | 'flat'; label: string };
  to?: string;
  loading?: boolean;
}

const DELTA_TONE = {
  up: 'text-bad',
  down: 'text-good',
  flat: 'text-muted',
} as const;

const DELTA_GLYPH = { up: '▲', down: '▼', flat: '■' } as const;

/**
 * A single number is the right form here — one value, no trend to trace — so
 * these are stat tiles rather than charts.
 */
export function StatCard({ label, value, detail, delta, to, loading }: StatCardProps) {
  const body = (
    <div
      className={clsx(
        'card h-full p-5 transition',
        to && 'hover:-translate-y-0.5 hover:shadow-lift',
      )}
    >
      <p className="text-2xs font-medium uppercase tracking-wider text-muted">{label}</p>

      {loading ? (
        <div className="skeleton mt-3 h-8 w-24" />
      ) : (
        <p className="tnum mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      )}

      <div className="mt-1.5 flex items-center gap-2">
        {delta && (
          <span className={clsx('text-xs font-medium', DELTA_TONE[delta.direction])}>
            <span aria-hidden="true">{DELTA_GLYPH[delta.direction]}</span> {delta.label}
          </span>
        )}
        {detail && <span className="text-xs text-muted">{detail}</span>}
      </div>
    </div>
  );

  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
