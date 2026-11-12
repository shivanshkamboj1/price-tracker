import type { Job, Worker } from 'bullmq';
import { logger } from '../config/logger';

/**
 * Logs every job a worker runs, from the moment it is picked up to how it ended:
 *
 *   job started    attempt number and how long it waited in the queue
 *   job completed  run time and what the processor returned
 *   job failed     run time and the error; `warn` while BullMQ will retry it,
 *                  `error` once the attempts are used up
 *
 * Everything is read from BullMQ's own events and job timestamps, so processors
 * contain no logging code. The payload is never logged whole: `context` picks
 * the identifiers worth searching by.
 */
export function logJobLifecycle<D, R>(
  worker: Worker<D, R>,
  context: (data: D) => Record<string, unknown>,
): void {
  const jobLogger = (job: Job<D, R>) =>
    logger.child({ queue: worker.name, jobId: job.id, jobName: job.name, ...context(job.data) });

  const maxAttempts = (job: Job<D, R>): number => job.opts.attempts ?? 1;

  // `processedOn` is stamped when the job moves to active: the start of this attempt.
  const runTime = (job: Job<D, R>): number | undefined =>
    job.processedOn ? Date.now() - job.processedOn : undefined;

  worker.on('active', (job) => {
    // `attemptsMade` counts finished attempts, so the one starting now is the next.
    const attempt = job.attemptsMade + 1;
    const startedAt = job.processedOn ?? Date.now();

    jobLogger(job).info(
      {
        attempt,
        maxAttempts: maxAttempts(job),
        enqueuedAt: new Date(job.timestamp).toISOString(),
        // Time spent waiting after the job became due. A retry keeps the
        // original timestamp, so the figure is only meaningful on attempt one.
        waitMs:
          attempt === 1
            ? Math.max(0, startedAt - job.timestamp - (job.opts.delay ?? 0))
            : undefined,
      },
      'job started',
    );
  });

  // By the time `completed` and `failed` fire, BullMQ has already counted the
  // attempt, so `attemptsMade` is the number of the attempt that just ended.
  worker.on('completed', (job, result) => {
    jobLogger(job).info(
      { attempt: job.attemptsMade, durationMs: runTime(job), outcome: result },
      'job completed',
    );
  });

  worker.on('failed', (job, err) => {
    if (!job) {
      logger.error({ queue: worker.name, err }, 'job failed');
      return;
    }

    // `finishedOn` is only stamped when BullMQ gives up on the job.
    const willRetry = !job.finishedOn && job.attemptsMade < maxAttempts(job);
    const fields = {
      attempt: job.attemptsMade,
      maxAttempts: maxAttempts(job),
      durationMs: runTime(job),
      err,
    };

    if (willRetry) jobLogger(job).warn(fields, 'job failed, will retry');
    else jobLogger(job).error(fields, 'job failed');
  });

  // Emitted by whichever worker notices: the job's owner lost its lock (crashed
  // or blocked the event loop), and BullMQ hands the job to another run.
  worker.on('stalled', (jobId) => {
    logger.warn({ queue: worker.name, jobId }, 'job stalled');
  });
}
