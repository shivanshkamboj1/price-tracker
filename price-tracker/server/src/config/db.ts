import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);
// `sanitizeFilter` is deliberately not set globally: it wraps every operator
// object in `$eq`, which breaks the filters this server writes itself — a
// `{ $exists: false }` on a Date path becomes `{ $eq: { $exists: false } }` and
// fails to cast — and rejects `$expr` outright. Operator injection is stopped at
// the edge instead: `sanitizeInput` strips `$`/dotted keys from request input
// and Zod re-parses it into scalars, so no user value reaches a filter as an
// object. Sanitize per query with `mongoose.sanitizeFilter()` if a filter ever
// does have to be built straight from untrusted input.

export async function connectDatabase(uri: string = env.MONGO_URI): Promise<typeof mongoose> {
  mongoose.connection.on('error', (err) => logger.error({ err }, 'mongodb connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('mongodb disconnected'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    // Index builds are explicit in production (see `npm run build` docs in README).
    autoIndex: env.NODE_ENV !== 'production',
  });
  logger.info('mongodb connected');
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close();
}
