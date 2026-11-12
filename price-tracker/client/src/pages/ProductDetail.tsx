import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PriceChart } from '../charts/PriceChart';
import { AvailabilityBadge, Badge, MarketplaceBadge, StatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Banner, ErrorState, Skeleton } from '../components/Feedback';
import { ConfirmDialog, Modal } from '../components/Modal';
import { SelectInput, TextInput } from '../components/Field';
import { productApi } from '../services/endpoints';
import { useToast } from '../hooks/useToast';
import { ApiError } from '../services/api';
import { CHECK_INTERVALS, formatDateTime, formatMoney, intervalLabel, relativeTime } from '../utils/format';
import type { HistoryRange } from '../types';

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <dt className="text-2xs font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd
        className={`tnum mt-1 text-sm font-semibold ${
          tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function ProductDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [range, setRange] = useState<HistoryRange>('30d');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [targetDraft, setTargetDraft] = useState('');
  const [intervalDraft, setIntervalDraft] = useState(360);

  const productQuery = useQuery({
    queryKey: ['product', id],
    queryFn: () => productApi.get(id),
    enabled: Boolean(id),
    refetchInterval: 45_000,
  });

  const historyQuery = useQuery({
    queryKey: ['product', id, 'history', range],
    queryFn: () => productApi.history(id, range),
    enabled: Boolean(id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['product', id] });
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => productApi.update(id, body),
    onSuccess: () => {
      toast('Saved', 'success');
      setEditing(false);
      invalidate();
    },
    onError: (error) =>
      toast(error instanceof ApiError ? error.message : 'Could not save changes', 'error'),
  });

  const checkMutation = useMutation({
    mutationFn: () => productApi.checkNow(id),
    onSuccess: () => {
      toast('Check queued — this usually takes under a minute.', 'success');
      window.setTimeout(invalidate, 5000);
    },
    onError: (error) =>
      toast(error instanceof ApiError ? error.message : 'Could not queue that check', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => productApi.remove(id),
    onSuccess: () => {
      toast('Product removed', 'success');
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/products');
    },
  });

  if (productQuery.isError) {
    return <ErrorState message="Could not load this product." onRetry={() => productQuery.refetch()} />;
  }

  if (productQuery.isLoading || !productQuery.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  const { product, stats } = productQuery.data;
  const history = historyQuery.data;

  const openEdit = () => {
    setTargetDraft(String(product.targetPrice));
    setIntervalDraft(product.checkInterval);
    setEditing(true);
  };

  return (
    <div className="space-y-6">
      <nav className="text-xs text-muted">
        <Link to="/products" className="hover:text-ink">
          Products
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">{product.nickname ?? product.title}</span>
      </nav>

      <header className="card p-6">
        <div className="flex flex-wrap items-start gap-5">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-24 w-24 shrink-0 rounded-xl border border-line bg-white object-contain p-2"
            />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-line bg-raised text-xs text-faint">
              No image
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <MarketplaceBadge marketplace={product.marketplace} />
              <StatusBadge status={product.status} />
              <AvailabilityBadge availability={product.availability} />
              {product.isBelowTarget && (
                <Badge tone="good">
                  <span aria-hidden="true">▼</span> below target
                </Badge>
              )}
            </div>

            <h1 className="mt-2.5 text-lg font-semibold leading-snug tracking-tight text-ink">
              {product.nickname ?? product.title}
            </h1>
            {product.nickname && <p className="mt-0.5 text-sm text-muted">{product.title}</p>}

            <a
              href={product.productUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block text-xs font-medium text-brand hover:underline"
            >
              Open on {product.marketplace === 'amazon_in' ? 'Amazon' : 'Flipkart'} ↗
            </a>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => checkMutation.mutate()} loading={checkMutation.isPending}>
              Check now
            </Button>
            <Button size="sm" variant="secondary" onClick={openEdit}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                updateMutation.mutate({ status: product.status === 'paused' ? 'active' : 'paused' })
              }
            >
              {product.status === 'paused' ? 'Resume' : 'Pause'}
            </Button>
            <Button size="sm" variant="ghost" className="text-bad hover:bg-bad/10" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>
        </div>

        {product.guidance && (
          <div className="mt-5">
            <Banner tone={product.status === 'error' ? 'bad' : 'warn'} title="Price checks are having trouble">
              {product.guidance}
              {product.status === 'error' && (
                <>
                  {' '}
                  Automatic retries have stopped after {product.consecutiveFailures} failed attempts.{' '}
                  <button
                    type="button"
                    className="font-medium text-brand hover:underline"
                    onClick={() => updateMutation.mutate({ status: 'active' })}
                  >
                    Resume tracking
                  </button>
                  .
                </>
              )}
            </Banner>
          </div>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-5 sm:grid-cols-4 lg:grid-cols-7">
          <Metric
            label="Current"
            value={formatMoney(product.currentPrice, product.currency)}
            tone={product.isBelowTarget ? 'good' : undefined}
          />
          <Metric label="Target" value={formatMoney(product.targetPrice, product.currency)} />
          <Metric label="Lowest" value={formatMoney(stats.lowest ?? product.lowestPrice, product.currency)} />
          <Metric label="Highest" value={formatMoney(stats.highest ?? product.highestPrice, product.currency)} />
          <Metric label="Average" value={formatMoney(stats.average, product.currency)} />
          <Metric
            label="Last price change"
            value={product.lastPriceChangedAt ? relativeTime(product.lastPriceChangedAt) : '—'}
          />
          <Metric
            label="Next check"
            value={product.status === 'active' ? relativeTime(product.nextCheckAt) : 'Paused'}
          />
        </dl>

        <p className="mt-4 text-xs text-muted">
          Checked {intervalLabel(product.checkInterval).toLowerCase()} · last checked{' '}
          {product.lastCheckedAt ? formatDateTime(product.lastCheckedAt) : 'never'} ·{' '}
          {product.alertCount} alert{product.alertCount === 1 ? '' : 's'} sent
        </p>
      </header>

      <PriceChart
        points={history?.points ?? []}
        targetPrice={product.targetPrice}
        currency={product.currency}
        range={range}
        onRangeChange={setRange}
        loading={historyQuery.isLoading}
      />

      <Modal
        open={editing}
        title="Edit tracking settings"
        onClose={() => setEditing(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              loading={updateMutation.isPending}
              onClick={() =>
                updateMutation.mutate({
                  targetPrice: Number.parseFloat(targetDraft),
                  checkInterval: Number(intervalDraft),
                })
              }
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput
            label="Target price"
            type="number"
            min="1"
            step="1"
            prefix="₹"
            value={targetDraft}
            onChange={(event) => setTargetDraft(event.target.value)}
            hint="Changing the target re-arms alerts for this product."
          />
          <SelectInput
            label="Check frequency"
            value={intervalDraft}
            onChange={(event) => setIntervalDraft(Number(event.target.value))}
            options={CHECK_INTERVALS.map((value) => ({ value, label: intervalLabel(value) }))}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Stop tracking this product?"
        description="The product and its price history will be deleted. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
