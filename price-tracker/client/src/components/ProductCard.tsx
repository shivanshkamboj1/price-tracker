import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { formatMoney, intervalLabel, relativeTime } from '../utils/format';
import { AvailabilityBadge, Badge, MarketplaceBadge, StatusBadge } from './Badge';
import { Button } from './Button';

interface ProductCardProps {
  product: Product;
  onPauseToggle: (product: Product) => void;
  onCheckNow: (product: Product) => void;
  onDelete: (product: Product) => void;
  busy?: boolean;
}

function ProductImage({ product }: { product: Product }) {
  if (!product.imageUrl) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-line bg-raised text-xs font-medium text-faint">
        No image
      </div>
    );
  }
  return (
    <img
      src={product.imageUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-16 w-16 shrink-0 rounded-xl border border-line bg-white object-contain p-1"
    />
  );
}

export function ProductCard({
  product,
  onPauseToggle,
  onCheckNow,
  onDelete,
  busy,
}: ProductCardProps) {
  const difference = product.differenceFromTarget;
  const awaitingFirstCheck = product.currentPrice === null && product.status === 'active';

  return (
    <article className="card flex flex-col p-5 transition hover:shadow-lift">
      <div className="flex items-start gap-4">
        <ProductImage product={product} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <MarketplaceBadge marketplace={product.marketplace} />
            <StatusBadge status={product.status} />
            <AvailabilityBadge availability={product.availability} />
          </div>

          <Link
            to={`/products/${product.id}`}
            className="mt-2 block truncate text-sm font-semibold text-ink hover:text-brand"
            title={product.nickname ?? product.title}
          >
            {product.nickname ?? product.title}
          </Link>
          {product.nickname && (
            <p className="truncate text-xs text-muted" title={product.title}>
              {product.title}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-2xs uppercase tracking-wider text-muted">Current</p>
          <p className="tnum mt-0.5 text-xl font-semibold tracking-tight text-ink">
            {awaitingFirstCheck ? (
              <span className="text-sm font-medium text-muted">Fetching details…</span>
            ) : (
              formatMoney(product.currentPrice, product.currency)
            )}
          </p>
        </div>

        <div className="text-right">
          <p className="text-2xs uppercase tracking-wider text-muted">Target</p>
          <p className="tnum mt-0.5 text-sm font-medium text-ink">
            {formatMoney(product.targetPrice, product.currency)}
          </p>
        </div>
      </div>

      {difference !== null && (
        <div className="mt-3">
          {product.isBelowTarget ? (
            <Badge tone="good">
              <span aria-hidden="true">▼</span> {formatMoney(Math.abs(difference), product.currency)}{' '}
              below target
            </Badge>
          ) : (
            <Badge tone="neutral">
              <span aria-hidden="true">▲</span> {formatMoney(difference, product.currency)} to go
            </Badge>
          )}
        </div>
      )}

      {product.guidance && (
        <p className="mt-3 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-xs text-warn">
          {product.guidance}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-4 text-xs">
        <div>
          <dt className="text-muted">Lowest seen</dt>
          <dd className="tnum mt-0.5 font-medium text-ink">
            {formatMoney(product.lowestPrice, product.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Frequency</dt>
          <dd className="mt-0.5 font-medium text-ink">{intervalLabel(product.checkInterval)}</dd>
        </div>
        <div>
          <dt className="text-muted">Last checked</dt>
          <dd className="mt-0.5 font-medium text-ink">{relativeTime(product.lastCheckedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">Next check</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {product.status === 'active' ? relativeTime(product.nextCheckAt) : 'Paused'}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onCheckNow(product)} disabled={busy}>
          Check now
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onPauseToggle(product)} disabled={busy}>
          {product.status === 'paused' ? 'Resume' : 'Pause'}
        </Button>
        <Link to={`/products/${product.id}`}>
          <Button size="sm" variant="ghost">
            History
          </Button>
        </Link>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-bad hover:bg-bad/10"
          onClick={() => onDelete(product)}
          disabled={busy}
        >
          Delete
        </Button>
      </div>
    </article>
  );
}
