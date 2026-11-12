import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { StatCard } from '../components/StatCard';
import { EmptyState, ErrorState, Skeleton } from '../components/Feedback';
import { Badge, MarketplaceBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { dashboardApi } from '../services/endpoints';
import { formatMoney, relativeTime } from '../utils/format';
import { useAuth } from '../hooks/useAuth';

export function DashboardPage() {
  const { user } = useAuth();

  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardApi.stats,
    refetchInterval: 60_000,
  });

  const highlightsQuery = useQuery({
    queryKey: ['dashboard', 'highlights'],
    queryFn: dashboardApi.highlights,
  });

  const stats = statsQuery.data;

  if (statsQuery.isError) {
    return <ErrorState message="Could not load your dashboard." onRetry={() => statsQuery.refetch()} />;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {user ? `Hello, ${user.name.split(' ')[0]}` : 'Dashboard'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {stats?.nextCheckAt
              ? `Next scheduled check ${relativeTime(stats.nextCheckAt)}.`
              : 'Add a product to start tracking prices.'}
          </p>
        </div>
        <Link to="/products/add">
          <Button size="sm">Add product</Button>
        </Link>
      </header>

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tracked products"
          value={stats?.trackedProducts ?? 0}
          detail={stats ? `${stats.activeProducts} active · ${stats.pausedProducts} paused` : undefined}
          loading={statsQuery.isLoading}
          to="/products"
        />
        <StatCard
          label="Price drops (30d)"
          value={stats?.priceDrops ?? 0}
          delta={
            stats && stats.priceDrops > 0
              ? { direction: 'down', label: 'recorded decreases' }
              : { direction: 'flat', label: 'no change yet' }
          }
          loading={statsQuery.isLoading}
        />
        <StatCard
          label="Alerts triggered"
          value={stats?.alertsTriggered ?? 0}
          detail={stats?.unreadAlerts ? `${stats.unreadAlerts} unread` : 'all caught up'}
          loading={statsQuery.isLoading}
          to="/notifications"
        />
        <StatCard
          label="Lowest price found"
          value={
            stats?.lowestPriceFound
              ? formatMoney(stats.lowestPriceFound.price, stats.lowestPriceFound.currency)
              : '—'
          }
          detail={stats?.lowestPriceFound?.title}
          loading={statsQuery.isLoading}
          to={stats?.lowestPriceFound ? `/products/${stats.lowestPriceFound.productId}` : undefined}
        />
      </section>

      {stats?.bestSaving && (
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-2xs font-medium uppercase tracking-wider text-muted">
              Biggest observed drop
            </p>
            <p className="mt-1.5 text-sm font-medium text-ink">{stats.bestSaving.title}</p>
          </div>
          <p className="tnum text-lg font-semibold text-good">
            <span aria-hidden="true">▼</span>{' '}
            {formatMoney(stats.bestSaving.amount, stats.bestSaving.currency)}
          </p>
        </section>
      )}

      <section aria-label="Closest to target" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Closest to target</h2>
          <Link to="/products" className="text-xs font-medium text-brand hover:underline">
            View all products
          </Link>
        </div>

        {highlightsQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : (highlightsQuery.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="Nothing tracked yet"
            description="Paste an Amazon India or Flipkart product link and set the price you would be happy to pay."
            action={{ label: 'Add your first product', to: '/products/add' }}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {highlightsQuery.data?.map((product) => (
              <Link
                key={product.id}
                to={`/products/${product.id}`}
                className="card p-4 transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-center justify-between gap-2">
                  <MarketplaceBadge marketplace={product.marketplace} />
                  {product.isBelowTarget && (
                    <Badge tone="good">
                      <span aria-hidden="true">▼</span> below target
                    </Badge>
                  )}
                </div>
                <p className="mt-2.5 truncate text-sm font-medium text-ink">
                  {product.nickname ?? product.title}
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="tnum text-base font-semibold text-ink">
                    {formatMoney(product.currentPrice, product.currency)}
                  </span>
                  <span className="tnum text-xs text-muted">
                    target {formatMoney(product.targetPrice, product.currency)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {stats && stats.erroredProducts > 0 && (
        <section className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3">
          <p className="text-sm font-medium text-ink">
            {stats.erroredProducts} product{stats.erroredProducts === 1 ? '' : 's'} need attention
          </p>
          <p className="mt-1 text-sm text-muted">
            Their last price check did not succeed.{' '}
            <Link to="/products?status=error" className="font-medium text-brand hover:underline">
              Review them
            </Link>
            .
          </p>
        </section>
      )}
    </div>
  );
}
