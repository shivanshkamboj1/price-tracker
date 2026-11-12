process.env.SERVICE_NAME ??= 'create-indexes';

import '../config/runtime';

import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { logger } from '../config/logger';
// Every model must be imported so its schema (and indexes) is registered.
import '../models/Alert';
import '../models/JobLog';
import '../models/MarketplaceSession';
import '../models/PriceHistory';
import '../models/Product';
import '../models/User';

/**
 * Builds every index declared in the schemas. Production runs with
 * `autoIndex` off so a deploy never triggers an unplanned index build, so run
 * this once per deploy:
 *
 *   node dist/scripts/createIndexes.js
 *
 * `createIndexes` only adds what is missing; it never drops an index.
 */
async function main(): Promise<void> {
  await connectDatabase();
  for (const model of Object.values(mongoose.models)) {
    await model.createIndexes();
    logger.info({ model: model.modelName }, 'indexes ensured');
  }
  await disconnectDatabase();
}

main().catch((err) => {
  logger.fatal({ err }, 'index build failed');
  process.exit(1);
});
