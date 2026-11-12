import { useEffect, useState } from 'react';
import { useTheme } from '../hooks/useTheme';

export interface ChartColors {
  series: string;
  surface: string;
  grid: string;
  axis: string;
  target: string;
  good: string;
  bad: string;
}

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `rgb(${value})` : fallback;
}

/**
 * Recharts needs concrete colour strings, so the theme tokens are resolved from
 * the document once per theme rather than passed as `var(...)` — that keeps the
 * chart on exactly the palette the rest of the app uses, in both modes.
 */
export function useChartColors(): ChartColors {
  const { theme } = useTheme();
  const [colors, setColors] = useState<ChartColors>(() => resolve());

  useEffect(() => {
    // The class swap happens in an effect too; read on the next frame.
    const id = window.requestAnimationFrame(() => setColors(resolve()));
    return () => window.cancelAnimationFrame(id);
  }, [theme]);

  return colors;
}

function resolve(): ChartColors {
  return {
    series: readVar('--series', 'rgb(79 70 229)'),
    surface: readVar('--surface', 'rgb(255 255 255)'),
    grid: readVar('--line', 'rgb(226 232 240)'),
    axis: readVar('--faint', 'rgb(148 163 184)'),
    target: readVar('--muted', 'rgb(100 116 139)'),
    good: readVar('--good', 'rgb(4 120 87)'),
    bad: readVar('--bad', 'rgb(220 38 38)'),
  };
}
