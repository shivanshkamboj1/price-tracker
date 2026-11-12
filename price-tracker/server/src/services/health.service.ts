import mongoose from 'mongoose';
import { redis } from '../config/redis';
import { listAdapters } from '../adapters/factory';
import { CircuitBreaker } from '../adapters/http/circuitBreaker';
import { JobLog } from '../models/JobLog';
import { Alert } from '../models/Alert';
import { notificationQueue, priceCheckQueue } from '../queues';
import { DAY_MS } from '../utils/time';

export interface QueueHealth {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: boolean;
}

export interface SystemHealth {
  status: 'ok' | 'degraded';
  checkedAt: Date;
  dependencies: { mongodb: 'up' | 'down'; redis: 'up' | 'down' };
  queues: QueueHealth[];
  checks24h: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
    successRate: number;
    averageDurationMs: number | null;
  };
  failuresByKind: Array<{ kind: string; count: number }>;
  marketplaces: Array<{
    marketplace: string;
    label: string;
    dataSource: string;
    circuit: string;
    circuitFailures: number;
    checks24h: number;
    failures24h: number;
  }>;
  notifications24h: { sent: number; failed: number; pending: number; skipped: number };
}

async function queueHealth(): Promise<QueueHealth[]> {
  const queues = [priceCheckQueue(), notificationQueue()];
  return Promise.all(
    queues.map(async (queue) => {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed',
      );
      return {
        name: queue.name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        paused: await queue.isPaused(),
      };
    }),
  );
}

/**
 * Operational snapshot for the system health page: queue depth, check outcomes,
 * per-marketplace adapter state and notification delivery. Contains no user
 * data beyond aggregate counts.
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const since = new Date(Date.now() - DAY_MS);

  const [mongoUp, redisUp, queues, outcomes, failureKinds, perMarketplace, notifications] =
    await Promise.all([
      Promise.resolve(mongoose.connection.readyState === 1),
      redis()
        .ping()
        .then(() => true)
        .catch(() => false),
      queueHealth().catch(() => [] as QueueHealth[]),

      JobLog.aggregate<{ _id: string; count: number; avgDuration: number }>([
        { $match: { startedAt: { $gte: since } } },
        {
          $group: { _id: '$result', count: { $sum: 1 }, avgDuration: { $avg: '$durationMs' } },
        },
      ]),

      JobLog.aggregate<{ _id: string; count: number }>([
        { $match: { startedAt: { $gte: since }, result: 'failed' } },
        { $group: { _id: '$errorKind', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      JobLog.aggregate<{ _id: { marketplace: string; result: string }; count: number }>([
        { $match: { startedAt: { $gte: since } } },
        {
          $group: {
            _id: { marketplace: '$marketplace', result: '$result' },
            count: { $sum: 1 },
          },
        },
      ]),

      Alert.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

  const byResult = new Map(outcomes.map((row) => [row._id, row]));
  const success = byResult.get('success')?.count ?? 0;
  const failed = byResult.get('failed')?.count ?? 0;
  const skipped = byResult.get('skipped')?.count ?? 0;
  const total = success + failed + skipped;

  const durations = outcomes
    .filter((row) => typeof row.avgDuration === 'number' && Number.isFinite(row.avgDuration))
    .map((row) => row.avgDuration * row.count);
  const averageDurationMs =
    total > 0 && durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / total)
      : null;

  const marketplaceStats = new Map<string, { checks: number; failures: number }>();
  for (const row of perMarketplace) {
    const entry = marketplaceStats.get(row._id.marketplace) ?? { checks: 0, failures: 0 };
    entry.checks += row.count;
    if (row._id.result === 'failed') entry.failures += row.count;
    marketplaceStats.set(row._id.marketplace, entry);
  }

  const marketplaces = await Promise.all(
    listAdapters().map(async (adapter) => {
      const snapshot = await new CircuitBreaker(adapter.marketplace).snapshot().catch(() => ({
        state: 'unknown' as const,
        failures: 0,
      }));
      const stats = marketplaceStats.get(adapter.marketplace) ?? { checks: 0, failures: 0 };
      return {
        marketplace: adapter.marketplace,
        label: adapter.label,
        dataSource: adapter.dataSource,
        circuit: snapshot.state,
        circuitFailures: snapshot.failures,
        checks24h: stats.checks,
        failures24h: stats.failures,
      };
    }),
  );

  const notificationCounts = new Map(notifications.map((row) => [row._id, row.count]));
  const anyCircuitOpen = marketplaces.some((m) => m.circuit === 'open');

  return {
    status: mongoUp && redisUp && !anyCircuitOpen ? 'ok' : 'degraded',
    checkedAt: new Date(),
    dependencies: { mongodb: mongoUp ? 'up' : 'down', redis: redisUp ? 'up' : 'down' },
    queues,
    checks24h: {
      total,
      success,
      failed,
      skipped,
      successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : 100,
      averageDurationMs,
    },
    failuresByKind: failureKinds.map((row) => ({ kind: row._id ?? 'unknown', count: row.count })),
    marketplaces,
    notifications24h: {
      sent: notificationCounts.get('sent') ?? 0,
      failed: notificationCounts.get('failed') ?? 0,
      pending: notificationCounts.get('pending') ?? 0,
      skipped: notificationCounts.get('skipped') ?? 0,
    },
  };
}

/** Recent failed checks for the current user, used by the product error banner. */
export async function recentFailures(userId: string, limit = 20) {
  return JobLog.find({ userId, result: 'failed' })
    .sort({ startedAt: -1 })
    .limit(limit)
    .select('productId marketplace errorKind errorMessage startedAt')
    .lean();
}
