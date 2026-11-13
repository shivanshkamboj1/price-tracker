import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ApiEnvelope, ApiErrorBody, Paged } from '../types';

/**
 * One axios instance for the whole app.
 *
 * Authentication is carried by HTTP-only cookies, so no token ever reaches
 * JavaScript. The only thing the SPA handles is the CSRF token, which the server
 * sets in a readable cookie and expects back in a header.
 */
export const http: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

http.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCookie('pt_csrf');
    if (csrf) config.headers.set('x-csrf-token', csrf);
  }
  return config;
});

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Field-level messages from a Zod validation failure, keyed by field path. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return {};
  const result: Record<string, string> = {};
  for (const item of error.details as Array<{ path?: string; message?: string }>) {
    if (item.path && item.message) result[item.path] = item.message;
  }
  return result;
}

let refreshing: Promise<void> | null = null;

async function refreshSession(): Promise<void> {
  refreshing ??= http
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status ?? 0;
    const url = config?.url ?? '';

    // One transparent refresh attempt, except on the auth endpoints themselves.
    if (status === 401 && config && !config._retried && !url.startsWith('/auth/')) {
      config._retried = true;
      try {
        await refreshSession();
        return await http.request(config);
      } catch {
        /* fall through to the rejection below */
      }
    }

    const body = error.response?.data;
    throw new ApiError(
      body?.error?.message ?? error.message ?? 'Request failed',
      body?.error?.code ?? 'NETWORK_ERROR',
      status,
      body?.error?.details,
    );
  },
);

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await http.get<ApiEnvelope<T>>(url, config);
  return data.data;
}

/** GET for list endpoints, which carry pagination in `meta`. */
export async function getPaged<T>(url: string, config?: AxiosRequestConfig): Promise<Paged<T>> {
  const { data } = await http.get<ApiEnvelope<T[]>>(url, config);
  const meta = (data.meta ?? {}) as Partial<Paged<T>>;
  return {
    items: data.data,
    total: meta.total ?? data.data.length,
    page: meta.page ?? 1,
    limit: meta.limit ?? data.data.length,
    pages: meta.pages,
    unread: meta.unread,
  };
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.post<ApiEnvelope<T>>(url, body);
  return data.data;
}

export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.patch<ApiEnvelope<T>>(url, body);
  return data.data;
}

export async function del<T = void>(url: string): Promise<T> {
  const { data } = await http.delete<ApiEnvelope<T>>(url);
  return data?.data as T;
}
