import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let server: MongoMemoryServer | undefined;

/** Boots an in-memory MongoDB and connects mongoose to it. */
export async function startTestDatabase(): Promise<void> {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'price_tracker_test' });
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
  await server?.stop();
  server = undefined;
}

/** Empties every collection between tests without tearing the server down. */
export async function clearDatabase(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
