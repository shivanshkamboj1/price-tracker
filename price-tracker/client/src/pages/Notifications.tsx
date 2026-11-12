import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, MarketplaceBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, Skeleton } from '../components/Feedback';
import { notificationApi } from '../services/endpoints';
import { useToast } from '../hooks/useToast';
import { formatDateTime, formatMoney } from '../utils/format';
import type { Alert } from '../types';

const DELIVERY_TONE = {
  sent: 'good',
  pending: 'neutral',
  failed: 'bad',
  skipped: 'warn',
} as const;

function AlertRow({
  alert,
  onAcknowledge,
  onReset,
}: {
  alert: Alert;
  onAcknowledge: (alert: Alert) => void;
  onReset: (alert: Alert) => void;
}) {
  const unread = !alert.readAt;

  return (
    <article className={`card p-5 ${unread ? 'border-brand/30' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {alert.product?.imageUrl ? (
            <img
              src={alert.product.imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-12 w-12 shrink-0 rounded-lg border border-line bg-white object-contain p-1"
            />
          ) : null}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {alert.product && <MarketplaceBadge marketplace={alert.product.marketplace} />}
              <Badge tone={DELIVERY_TONE[alert.status]}>{alert.status}</Badge>
              {alert.state === 'acknowledged' && <Badge tone="neutral">acknowledged</Badge>}
              {unread && <Badge tone="brand">new</Badge>}
            </div>

            <Link
              to={`/products/${alert.productId}`}
              className="mt-2 block truncate text-sm font-semibold text-ink hover:text-brand"
            >
              {alert.product?.title ?? 'Product'}
            </Link>

            <p className="tnum mt-1 text-sm text-muted">
              Hit <span className="font-semibold text-good">{formatMoney(alert.price, alert.currency)}</span>{' '}
              against a target of {formatMoney(alert.targetPrice, alert.currency)}
            </p>

            <p className="mt-1 text-xs text-faint">
              {formatDateTime(alert.sentAt ?? alert.createdAt)} · via {alert.channel}
            </p>

            {alert.failureReason && (
              <p className="mt-2 rounded-lg border border-bad/25 bg-bad/5 px-3 py-2 text-xs text-bad">
                {alert.failureReason}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {alert.state === 'triggered' && (
            <Button size="sm" variant="secondary" onClick={() => onAcknowledge(alert)}>
              Acknowledge
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onReset(alert)}>
            Re-arm
          </Button>
        </div>
      </div>
    </article>
  );
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const alertsQuery = useQuery({
    queryKey: ['notifications', { unreadOnly }],
    queryFn: () => notificationApi.list({ limit: 50, unreadOnly }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { state?: 'acknowledged' | 'reset'; read?: boolean } }) =>
      notificationApi.update(id, body),
    onSuccess: invalidate,
  });

  const readAllMutation = useMutation({
    mutationFn: notificationApi.readAll,
    onSuccess: (result) => {
      toast(`${result.markedRead} alert${result.markedRead === 1 ? '' : 's'} marked read`, 'success');
      invalidate();
    },
  });

  const alerts = alertsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Alerts</h1>
          <p className="mt-1 text-sm text-muted">
            {alertsQuery.data?.unread
              ? `${alertsQuery.data.unread} unread of ${alertsQuery.data.total}`
              : 'Every price alert we have sent you'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUnreadOnly((value) => !value)}
            aria-pressed={unreadOnly}
            className={`rounded-xl border border-line px-3 py-1.5 text-xs font-medium transition ${
              unreadOnly ? 'bg-raised text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            Unread only
          </button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => readAllMutation.mutate()}
            loading={readAllMutation.isPending}
          >
            Mark all read
          </Button>
        </div>
      </header>

      {alertsQuery.isError ? (
        <ErrorState message="Could not load your alerts." onRetry={() => alertsQuery.refetch()} />
      ) : alertsQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          title={unreadOnly ? 'Nothing unread' : 'No alerts yet'}
          description="When a tracked product reaches your target price, the alert will appear here and go out on your chosen channel."
          action={{ label: 'Add a product', to: '/products/add' }}
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onAcknowledge={(item) =>
                updateMutation.mutate({ id: item.id, body: { state: 'acknowledged', read: true } })
              }
              onReset={(item) => updateMutation.mutate({ id: item.id, body: { state: 'reset' } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
