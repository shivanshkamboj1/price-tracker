import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './Button';

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: { label: string; to: string };
  icon?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        {icon ?? <span className="text-lg">◎</span>}
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      {action && (
        <Link to={action.to} className="mt-5">
          <Button size="sm">{action.label}</Button>
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card border-bad/30 px-6 py-10 text-center">
      <p className="text-sm font-medium text-bad">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className ?? 'h-4 w-full')} />;
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'bad';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    info: 'border-brand/25 bg-brand/5',
    warn: 'border-warn/30 bg-warn/5',
    bad: 'border-bad/30 bg-bad/5',
  } as const;
  const dots = { info: 'bg-brand', warn: 'bg-warn', bad: 'bg-bad' } as const;

  return (
    <div className={clsx('rounded-xl border px-4 py-3', tones[tone])}>
      <div className="flex items-start gap-3">
        <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', dots[tone])} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          {children && <div className="mt-1 text-sm text-muted">{children}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}
