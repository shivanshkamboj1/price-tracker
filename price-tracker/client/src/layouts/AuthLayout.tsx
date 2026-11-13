import { Outlet } from 'react-router-dom';

const POINTS = [
  'Track Amazon India and Flipkart listings side by side.',
  'Get a WhatsApp or Telegram alert the moment a price meets your target.',
  'See the full price history, not just today’s number.',
];

export function AuthLayout() {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* Marketing panel: hidden on small screens so the form gets the space. */}
      <aside className="relative hidden overflow-hidden bg-surface p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand/10 blur-3xl"
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white">
              ₹
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">Pricewatch</span>
          </div>

          <h1 className="mt-16 max-w-md text-3xl font-semibold leading-tight tracking-tight text-ink">
            Know the moment the price is right.
          </h1>
          <ul className="mt-8 space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3 text-sm text-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative max-w-md text-xs text-faint">
          Pricewatch never asks for your Amazon or Flipkart password. Price data comes from official
          marketplace APIs, licensed data providers, or publicly available product pages, at
          deliberately conservative request rates.
        </p>
      </aside>

      <main className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
