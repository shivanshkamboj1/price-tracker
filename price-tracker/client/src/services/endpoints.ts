import { del, get, getPaged, patch, post } from './api';
import type {
  Alert,
  AlertMode,
  AlertRuleOverrides,
  AlertRules,
  ComparisonRow,
  DashboardStats,
  HistoryRange,
  HistoryResponse,
  MarketplaceSession,
  NotificationChannel,
  NotificationPrefs,
  Product,
  PriceStats,
  SystemHealth,
  TelegramChat,
  TelegramLinkStart,
  TelegramStatus,
  UrlPreview,
  User,
} from '../types';

/* --------------------------------- auth --------------------------------- */

export const authApi = {
  unlock: (body: { password: string }) =>
    post<{ user: User; csrfToken: string }>('/auth/unlock', body),

  lock: () => post<{ locked: boolean }>('/auth/lock'),

  me: () => get<{ user: User }>('/auth/me'),
};

/* ------------------------------- products -------------------------------- */

export interface ProductListParams {
  page?: number;
  limit?: number;
  status?: string;
  marketplace?: string;
  search?: string;
  sort?: string;
}

export const productApi = {
  list: (params: ProductListParams = {}) => getPaged<Product>('/products', { params }),

  get: (id: string) => get<{ product: Product; stats: PriceStats }>(`/products/${id}`),

  create: (body: {
    productUrl: string;
    targetPrice: number;
    checkInterval: number;
    nickname?: string;
    notificationChannel?: NotificationChannel;
    alertMode?: AlertMode;
    alertRules?: Partial<AlertRuleOverrides>;
    comparisonGroup?: string;
  }) => post<{ product: Product; message: string }>('/products', body),

  preview: (productUrl: string) => post<UrlPreview>('/products/preview', { productUrl }),

  update: (id: string, body: Record<string, unknown>) =>
    patch<{ product: Product }>(`/products/${id}`, body),

  updateSettings: (id: string, body: Record<string, unknown>) =>
    patch<{ product: Product }>(`/products/${id}/settings`, body),

  remove: (id: string) => del(`/products/${id}`),

  checkNow: (id: string) =>
    post<{ queued: boolean; jobId: string; remainingThisHour: number }>(`/products/${id}/check`),

  history: (id: string, range: HistoryRange) =>
    get<HistoryResponse>(`/products/${id}/history`, { params: { range } }),

  compare: (params: { ids?: string[]; group?: string }) =>
    get<ComparisonRow[]>('/products/compare', {
      params: { ids: params.ids?.join(','), group: params.group },
    }),

  comparisonGroups: () => get<Array<{ group: string; count: number }>>('/products/comparison-groups'),
};

/* ----------------------------- notifications ----------------------------- */

export const notificationApi = {
  list: (params: { page?: number; limit?: number; unreadOnly?: boolean } = {}) =>
    getPaged<Alert>('/notifications', {
      params: { ...params, unreadOnly: params.unreadOnly ? 'true' : undefined },
    }),

  update: (id: string, body: { state?: 'acknowledged' | 'reset'; read?: boolean }) =>
    patch<{ alert: Alert }>(`/notifications/${id}`, body),

  readAll: () => patch<{ markedRead: number }>('/notifications/read-all'),
};

/* --------------------------------- user ---------------------------------- */

export const userApi = {
  profile: () => get<{ user: User }>('/user'),

  updateProfile: (body: { name?: string; phone?: string | null; timezone?: string }) =>
    patch<{ user: User }>('/user', body),

  updateNotificationSettings: (
    body: Partial<Omit<NotificationPrefs, 'alertRules'>> & { alertRules?: Partial<AlertRules> },
  ) => post<{ notificationPrefs: NotificationPrefs }>('/user/notification-settings', body),

  telegramStatus: () => get<TelegramStatus>('/user/telegram'),
  telegramLink: () => post<TelegramLinkStart>('/user/telegram/link'),
  telegramCancelLink: () => del('/user/telegram/link'),
  /** Polled while someone taps Start in Telegram. */
  telegramVerify: () =>
    post<{ connected: boolean; chat: TelegramChat | null }>('/user/telegram/verify'),
  /** Tests one chat, or every linked chat when `chatId` is omitted. */
  telegramTest: (chatId?: string) =>
    post<{ sent: number; failed: Array<{ chatId: string; reason: string }> }>(
      '/user/telegram/test',
      chatId ? { chatId } : {},
    ),
  telegramRemoveChat: (chatId: string) => del(`/user/telegram/chats/${encodeURIComponent(chatId)}`),

  sessions: () => get<MarketplaceSession[]>('/user/marketplace-sessions'),

  connectSession: (body: {
    marketplace: string;
    payload: string;
    label?: string;
    expiresInDays?: number;
  }) => post<{ session: MarketplaceSession }>('/user/marketplace-sessions', body),

  disconnectSession: (marketplace: string) =>
    del(`/user/marketplace-sessions/${marketplace}`),
};

/* ------------------------------- dashboard ------------------------------- */

export const dashboardApi = {
  stats: () => get<DashboardStats>('/dashboard/stats'),
  highlights: () => get<Product[]>('/dashboard/highlights'),
  health: () => get<SystemHealth>('/system/health'),
};
