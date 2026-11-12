/**
 * PM2 process file — the three server processes, each run from `server/`.
 *
 *   pm2 startOrReload ecosystem.config.js --update-env && pm2 save
 *
 * Secrets and settings still come from `.env` (read by the app at start-up);
 * only the values below are pinned here so a stray `.env` line cannot switch a
 * production process into development mode.
 */
const path = require('node:path');

const cwd = path.join(__dirname, 'server');
const env = { NODE_ENV: 'production', LOG_PRETTY: 'false' };

module.exports = {
  apps: [
    {
      name: 'pt-api',
      cwd,
      script: 'dist/server.js',
      env: { ...env, SERVICE_NAME: 'api' },
      max_memory_restart: '400M',
      kill_timeout: 10_000,
    },
    {
      // Scale with `pm2 scale pt-worker 2` if checks start to queue up;
      // the marketplace rate limit is shared through Redis, not multiplied.
      name: 'pt-worker',
      cwd,
      script: 'dist/worker.js',
      env: { ...env, SERVICE_NAME: 'worker' },
      max_memory_restart: '500M',
      // Lets an in-flight price check or message finish before the process exits.
      kill_timeout: 30_000,
    },
    {
      // Singleton: decides which products are due. Never run more than one.
      name: 'pt-scheduler',
      cwd,
      script: 'dist/scheduler.js',
      env: { ...env, SERVICE_NAME: 'scheduler' },
      instances: 1,
      max_memory_restart: '300M',
      kill_timeout: 10_000,
    },
  ],
};
