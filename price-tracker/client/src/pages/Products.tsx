import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, ErrorState, Skeleton } from '../components/Feedback';
import { ConfirmDialog } from '../components/Modal';
import { Button } from '../components/Button';
import { productApi } from '../services/endpoints';
import { useToast } from '../hooks/useToast';
import { ApiError } from '../services/api';
import type { Product } from '../types';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Tracking' },
  { value: 'paused', label: 'Paused' },
  { value: 'error', label: 'Needs attention' },
];

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'closestToTarget', label: 'Closest to target' },
  { value: 'priceAsc', label: 'Price: low to high' },
  { value: 'priceDesc', label: 'Price: high to low' },
];

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const status = params.get('status') ?? '';
  const search = params.get('search') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const marketplace = params.get('marketplace') ?? '';

  const productsQuery = useQuery({
    queryKey: ['products', { status, search, sort, marketplace }],
    queryFn: () =>
      productApi.list({
        status: status || undefined,
        search: search || undefined,
        marketplace: marketplace || undefined,
        sort,
        limit: 50,
      }),
    // Products refresh in the background as checks land.
    refetchInterval: 45_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      productApi.update(id, body),
    onSuccess: invalidate,
  });

  const checkMutation = useMutation({
    mutationFn: (id: string) => productApi.checkNow(id),
    onSuccess: (result) => {
      toast(
        `Check queued. ${result.remainingThisHour} manual check${result.remainingThisHour === 1 ? '' : 's'} left this hour.`,
        'success',
      );
      window.setTimeout(invalidate, 4000);
    },
    onError: (error) =>
      toast(error instanceof ApiError ? error.message : 'Could not queue that check', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productApi.remove(id),
    onSuccess: () => {
      toast('Product removed', 'success');
      setPendingDelete(null);
      invalidate();
    },
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const products = productsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Products</h1>
          <p className="mt-1 text-sm text-muted">
            {productsQuery.data
              ? `${productsQuery.data.total} tracked`
              : 'Everything you are watching'}
          </p>
        </div>
      </header>

      {/* Filters live in one row above the list. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-line bg-raised p-0.5" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              onClick={() => setParam('status', option.value)}
              aria-pressed={status === option.value}
              className={`rounded-[0.6rem] px-3 py-1.5 text-xs font-medium transition ${
                status === option.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <select
          value={marketplace}
          onChange={(event) => setParam('marketplace', event.target.value)}
          aria-label="Marketplace"
          className="input h-9 w-auto py-0 text-xs"
        >
          <option value="">All marketplaces</option>
          <option value="amazon_in">Amazon India</option>
          <option value="flipkart">Flipkart</option>
        </select>

        <select
          value={sort}
          onChange={(event) => setParam('sort', event.target.value)}
          aria-label="Sort order"
          className="input h-9 w-auto py-0 text-xs"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <input
          type="search"
          value={search}
          onChange={(event) => setParam('search', event.target.value)}
          placeholder="Search titles…"
          aria-label="Search products"
          className="input h-9 w-full py-0 text-xs sm:w-56"
        />
      </div>

      {productsQuery.isError ? (
        <ErrorState message="Could not load your products." onRetry={() => productsQuery.refetch()} />
      ) : productsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72 w-full rounded-2xl" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title={status || search ? 'Nothing matches those filters' : 'No products yet'}
          description={
            status || search
              ? 'Try clearing the filters to see everything you track.'
              : 'Paste an Amazon India or Flipkart product link and choose the price you would be happy to pay.'
          }
          action={{ label: 'Add a product', to: '/products/add' }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              busy={busyId === product.id}
              onCheckNow={(item) => {
                setBusyId(item.id);
                checkMutation.mutate(item.id, { onSettled: () => setBusyId(null) });
              }}
              onPauseToggle={(item) => {
                setBusyId(item.id);
                updateMutation.mutate(
                  { id: item.id, body: { status: item.status === 'paused' ? 'active' : 'paused' } },
                  { onSettled: () => setBusyId(null) },
                );
              }}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Stop tracking this product?"
        description={`"${pendingDelete?.nickname ?? pendingDelete?.title ?? ''}" and its price history will be deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
        onClose={() => setPendingDelete(null)}
      />

      {productsQuery.data && productsQuery.data.total > products.length && (
        <p className="text-center text-xs text-muted">
          Showing {products.length} of {productsQuery.data.total}.{' '}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setParam('search', '')}
            className="align-baseline"
          >
            Refine with search
          </Button>
        </p>
      )}
    </div>
  );
}
