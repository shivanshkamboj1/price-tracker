import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { notificationApi } from '../services/endpoints';
import { initials } from '../utils/format';
import { Button } from '../components/Button';

interface NavItem {
  to: string;
  label: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/products', label: 'Products' },
  { to: '/products/add', label: 'Add product' },
  { to: '/compare', label: 'Compare' },
  { to: '/notifications', label: 'Alerts' },
  { to: '/settings', label: 'Settings' },
  { to: '/system', label: 'System', adminOnly: true },
];

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted transition hover:bg-raised hover:text-ink"
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}

export function AppLayout() {
  const { user, lock } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = NAV.filter((item) => !item.adminOnly || user?.role === 'admin');

  const { data: alerts } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationApi.list({ limit: 1, unreadOnly: true }),
    refetchInterval: 60_000,
  });
  const unread = alerts?.total ?? 0;

  const handleLogout = async () => {
    await lock();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <NavLink to="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white">
              ₹
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">Pricewatch</span>
          </NavLink>

          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/products'}
                className={({ isActive }) =>
                  clsx(
                    'relative rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive ? 'bg-raised text-ink' : 'text-muted hover:text-ink',
                  )
                }
              >
                {item.label}
                {item.to === '/notifications' && unread > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-2xs font-semibold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />

            <div className="hidden items-center gap-2 sm:flex">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-xs font-semibold text-brand"
                title={user?.email}
              >
                {user ? initials(user.name) : '··'}
              </span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sign out
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label="Toggle navigation"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted md:hidden"
            >
              <span aria-hidden="true">☰</span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-line bg-surface px-4 py-2 md:hidden" aria-label="Mobile">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/products'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'block rounded-lg px-3 py-2.5 text-sm font-medium',
                    isActive ? 'bg-raised text-ink' : 'text-muted',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted"
            >
              Sign out
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
