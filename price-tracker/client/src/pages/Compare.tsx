import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MarketplaceBadge } from '../components/Badge';
import { EmptyState, Skeleton } from '../components/Feedback';
import { Banner } from '../components/Feedback';
import { productApi } from '../services/endpoints';
import { formatMoney, relativeTime } from '../utils/format';

export function ComparePage() {
  const [group, setGroup] = useState<string>('');
  const [selected, setSelected] = useState<string[]>([]);

  const groupsQuery = useQuery({
    queryKey: ['comparison-groups'],
    queryFn: productApi.comparisonGroups,
  });

  const productsQuery = useQuery({
    queryKey: ['products', 'all-for-compare'],
    queryFn: () => productApi.list({ limit: 100 }),
  });

  const comparisonQuery = useQuery({
    queryKey: ['compare', { group, selected }],
    queryFn: () => productApi.compare(group ? { group } : { ids: selected }),
    enabled: Boolean(group) || selected.length > 0,
  });

  const rows = comparisonQuery.data ?? [];

  const cheapest = useMemo(() => {
    const priced = rows.filter((row) => row.currentPrice !== null);
    if (priced.length < 2) return null;
    return priced.reduce((min, row) => ((row.currentPrice ?? 0) < (min.currentPrice ?? 0) ? row : min));
  }, [rows]);

  const toggle = (id: string) => {
    setGroup('');
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= 6
          ? current
          : [...current, id],
    );
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Compare</h1>
        <p className="mt-1 text-sm text-muted">
          Put the same product from different marketplaces side by side.
        </p>
      </header>

      <Banner tone="info" title="Comparisons are always explicit">
        Two listings are never treated as the same product just because their titles look alike.
        Group them yourself with a comparison label, or tick the ones you want to compare.
      </Banner>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="card p-5">
          <h2 className="text-sm font-semibold text-ink">Choose products</h2>

          {(groupsQuery.data?.length ?? 0) > 0 && (
            <div className="mt-4">
              <label htmlFor="group-select" className="label">
                Comparison group
              </label>
              <select
                id="group-select"
                className="input"
                value={group}
                onChange={(event) => {
                  setGroup(event.target.value);
                  setSelected([]);
                }}
              >
                <option value="">Pick products manually</option>
                {groupsQuery.data?.map((item) => (
                  <option key={item.group} value={item.group}>
                    {item.group} ({item.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4 max-h-96 space-y-1 overflow-auto">
            {productsQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              productsQuery.data?.items.map((product) => (
                <label
                  key={product.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-raised"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-line text-brand focus:ring-brand"
                    checked={selected.includes(product.id)}
                    onChange={() => toggle(product.id)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{product.nickname ?? product.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {formatMoney(product.currentPrice, product.currency)}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </aside>

        <section>
          {rows.length === 0 ? (
            <EmptyState
              title="Nothing to compare yet"
              description="Select two or more products on the left, or choose a comparison group."
            />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">Price comparison across selected products</caption>
                <thead className="border-b border-line text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Product</th>
                    <th scope="col" className="px-4 py-3 font-medium">Marketplace</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Current</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Target</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Lowest</th>
                    <th scope="col" className="px-4 py-3 font-medium">Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isCheapest = cheapest?.productId === row.productId;
                    return (
                      <tr key={row.productId} className="border-b border-line last:border-0">
                        <td className="max-w-xs px-4 py-3">
                          <Link
                            to={`/products/${row.productId}`}
                            className="block truncate font-medium text-ink hover:text-brand"
                          >
                            {row.nickname ?? row.title}
                          </Link>
                          {isCheapest && (
                            <span className="mt-1 inline-block text-2xs font-semibold text-good">
                              <span aria-hidden="true">▼</span> lowest of the selection
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <MarketplaceBadge marketplace={row.marketplace} />
                        </td>
                        <td
                          className={`tnum px-4 py-3 text-right font-semibold ${
                            isCheapest ? 'text-good' : 'text-ink'
                          }`}
                        >
                          {formatMoney(row.currentPrice, row.currency)}
                        </td>
                        <td className="tnum px-4 py-3 text-right text-muted">
                          {formatMoney(row.targetPrice, row.currency)}
                        </td>
                        <td className="tnum px-4 py-3 text-right text-muted">
                          {formatMoney(row.lowestPrice, row.currency)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {relativeTime(row.lastCheckedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
