import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import type { HistoryRange, PricePoint } from '../types';
import { formatDateTime, formatMoney, formatMoneyCompact } from '../utils/format';
import { useChartColors } from './useChartColors';

export const RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '3m', label: '3 months' },
  { value: 'all', label: 'All time' },
];

interface PriceChartProps {
  points: PricePoint[];
  targetPrice: number;
  currency: string;
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
  loading?: boolean;
}

interface ChartDatum {
  t: number;
  price: number;
  availability: string;
}

function tickFormatter(range: HistoryRange) {
  const options: Intl.DateTimeFormatOptions =
    range === '24h'
      ? { hour: 'numeric', minute: '2-digit' }
      : range === '7d'
        ? { weekday: 'short', hour: 'numeric' }
        : { day: 'numeric', month: 'short' };
  const formatter = new Intl.DateTimeFormat('en-IN', options);
  return (value: number) => formatter.format(new Date(value));
}

function ChartTooltip({
  active,
  payload,
  currency,
  targetPrice,
}: TooltipProps<number, string> & { currency: string; targetPrice: number }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload as ChartDatum | undefined;
  if (!datum) return null;

  const belowTarget = datum.price <= targetPrice;

  return (
    <div className="card px-3 py-2 shadow-lift">
      <p className="text-2xs uppercase tracking-wide text-faint">
        {formatDateTime(new Date(datum.t).toISOString())}
      </p>
      <p className="tnum mt-1 text-base font-semibold text-ink">
        {formatMoney(datum.price, currency)}
      </p>
      <p className={`mt-0.5 text-xs font-medium ${belowTarget ? 'text-good' : 'text-muted'}`}>
        {belowTarget ? '▼ at or below target' : `▲ ${formatMoney(datum.price - targetPrice, currency)} above target`}
      </p>
      {datum.availability === 'out_of_stock' && (
        <p className="mt-0.5 text-xs text-warn">Out of stock at this point</p>
      )}
    </div>
  );
}

/**
 * Price history for one product.
 *
 * One series, so there is no legend: the heading names it and the latest value
 * is labelled directly. The target price is a dashed reference line rather than
 * a second series, because it is a threshold, not a measurement.
 */
export function PriceChart({
  points,
  targetPrice,
  currency,
  range,
  onRangeChange,
  loading,
}: PriceChartProps) {
  const colors = useChartColors();
  const [showTable, setShowTable] = useState(false);

  const data = useMemo<ChartDatum[]>(
    () =>
      points.map((point) => ({
        t: new Date(point.checkedAt).getTime(),
        price: point.price,
        availability: point.availability,
      })),
    [points],
  );

  const domain = useMemo<[number, number]>(() => {
    const values = data.map((d) => d.price).concat(targetPrice);
    if (values.length === 0) return [0, 100];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.12, max * 0.02, 1);
    return [Math.max(0, min - pad), max + pad];
  }, [data, targetPrice]);

  const last = data[data.length - 1];

  return (
    <section className="card p-5" aria-label="Price history">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Price history</h2>
          <p className="mt-0.5 text-xs text-muted">
            Recorded price over time, with your target shown as a dashed line.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-xl border border-line bg-raised p-0.5"
            role="group"
            aria-label="Time range"
          >
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onRangeChange(option.value)}
                aria-pressed={range === option.value}
                className={`rounded-[0.6rem] px-2.5 py-1.5 text-xs font-medium transition ${
                  range === option.value
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-ink"
            aria-pressed={showTable}
          >
            {showTable ? 'Chart' : 'Table'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-72 w-full" />
      ) : data.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-ink">No price points in this range</p>
          <p className="mt-1 max-w-xs text-xs text-muted">
            History builds up as checks run. Try a wider range, or run a check now.
          </p>
        </div>
      ) : showTable ? (
        <div className="max-h-72 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">Recorded prices in the selected range</caption>
            <thead className="sticky top-0 bg-raised text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Checked at</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
                <th scope="col" className="px-3 py-2 font-medium">Availability</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((datum) => (
                <tr key={datum.t} className="border-t border-line">
                  <td className="px-3 py-2 text-muted">
                    {formatDateTime(new Date(datum.t).toISOString())}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-medium text-ink">
                    {formatMoney(datum.price, currency)}
                  </td>
                  <td className="px-3 py-2 text-muted">{datum.availability.replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.series} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={colors.series} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke={colors.grid} strokeDasharray="0" vertical={false} />

              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={tickFormatter(range)}
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                minTickGap={32}
              />
              <YAxis
                domain={domain}
                tickFormatter={(value: number) => formatMoneyCompact(value, currency)}
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={64}
              />

              <Tooltip
                content={<ChartTooltip currency={currency} targetPrice={targetPrice} />}
                cursor={{ stroke: colors.axis, strokeWidth: 1, strokeDasharray: '4 4' }}
              />

              <ReferenceLine
                y={targetPrice}
                stroke={colors.target}
                strokeDasharray="6 5"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
                label={{
                  value: `Target ${formatMoneyCompact(targetPrice, currency)}`,
                  position: 'insideTopRight',
                  fill: colors.target,
                  fontSize: 11,
                }}
              />

              <Area
                type="monotone"
                dataKey="price"
                stroke="none"
                fill="url(#priceFill)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="price"
                name="Price"
                stroke={colors.series}
                strokeWidth={2}
                dot={data.length <= 40 ? { r: 2.5, fill: colors.series, strokeWidth: 0 } : false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: colors.surface }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {last && !showTable && (
        <p className="mt-3 text-xs text-muted">
          Latest recorded price{' '}
          <span className="tnum font-semibold text-ink">{formatMoney(last.price, currency)}</span> on{' '}
          {formatDateTime(new Date(last.t).toISOString())}.
        </p>
      )}
    </section>
  );
}
