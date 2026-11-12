import { useQuery } from '@tanstack/react-query';
import { Badge } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { ErrorState, Skeleton } from '../components/Feedback';
import { dashboardApi } from '../services/endpoints';
import { formatDateTime } from '../utils/format';

export function SystemHealthPage() {
  const healthQuery = useQuery({
    queryKey: ['system', 'health'],
    queryFn: dashboardApi.health,
    refetchInterval: 30_000,
  });

  if (healthQuery.isError) {
    return (
      <ErrorState
        message="Could not load system health. This page is restricted to administrators."
        onRetry={() => healthQuery.refetch()}
      />
    );
  }

  if (healthQuery.isLoading || !healthQuery.data) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  const health = healthQuery.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">System health</h1>
          <p className="mt-1 text-sm text-muted">
            Snapshot taken {formatDateTime(health.checkedAt)}
          </p>
        </div>
        <Badge tone={health.status === 'ok' ? 'good' : 'warn'}>
          {health.status === 'ok' ? '● operational' : '▲ degraded'}
        </Badge>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Checks (24h)"
          value={health.checks24h.total}
          detail={`${health.checks24h.success} succeeded · ${health.checks24h.failed} failed`}
        />
        <StatCard
          label="Success rate"
          value={`${health.checks24h.successRate}%`}
          delta={{
            direction: health.checks24h.successRate >= 95 ? 'flat' : 'up',
            label: health.checks24h.successRate >= 95 ? 'healthy' : 'investigate',
          }}
        />
        <StatCard
          label="Average check"
          value={
            health.checks24h.averageDurationMs === null
              ? '—'
              : `${(health.checks24h.averageDurationMs / 1000).toFixed(2)}s`
          }
          detail="end to end, per job"
        />
        <StatCard
          label="Notifications (24h)"
          value={health.notifications24h.sent}
          detail={`${health.notifications24h.failed} failed · ${health.notifications24h.pending} pending`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink">Queues</h2>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th scope="col" className="pb-2 font-medium">Queue</th>
                <th scope="col" className="pb-2 text-right font-medium">Waiting</th>
                <th scope="col" className="pb-2 text-right font-medium">Active</th>
                <th scope="col" className="pb-2 text-right font-medium">Delayed</th>
                <th scope="col" className="pb-2 text-right font-medium">Failed</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {health.queues.map((queue) => (
                <tr key={queue.name} className="border-t border-line">
                  <td className="py-2 font-medium text-ink">
                    {queue.name}
                    {queue.paused && <span className="ml-2 text-xs text-warn">paused</span>}
                  </td>
                  <td className="py-2 text-right text-muted">{queue.waiting}</td>
                  <td className="py-2 text-right text-muted">{queue.active}</td>
                  <td className="py-2 text-right text-muted">{queue.delayed}</td>
                  <td className={`py-2 text-right ${queue.failed > 0 ? 'text-bad' : 'text-muted'}`}>
                    {queue.failed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">
            Dependencies
          </h3>
          <div className="mt-2 flex gap-2">
            <Badge tone={health.dependencies.mongodb === 'up' ? 'good' : 'bad'}>
              MongoDB {health.dependencies.mongodb}
            </Badge>
            <Badge tone={health.dependencies.redis === 'up' ? 'good' : 'bad'}>
              Redis {health.dependencies.redis}
            </Badge>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink">Marketplace adapters</h2>
          <div className="mt-4 space-y-3">
            {health.marketplaces.map((marketplace) => (
              <div key={marketplace.marketplace} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{marketplace.label}</p>
                  <Badge tone={marketplace.circuit === 'closed' ? 'good' : 'bad'}>
                    circuit {marketplace.circuit}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Source: {marketplace.dataSource} · {marketplace.checks24h} checks in 24h ·{' '}
                  {marketplace.failures24h} failed
                </p>
              </div>
            ))}
          </div>

          {health.failuresByKind.length > 0 && (
            <>
              <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">
                Failures by kind (24h)
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {health.failuresByKind.map((row) => (
                  <li key={row.kind} className="flex justify-between">
                    <span className="text-muted">{row.kind.replace('_', ' ')}</span>
                    <span className="tnum font-medium text-ink">{row.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
