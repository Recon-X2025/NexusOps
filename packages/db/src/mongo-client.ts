import { MongoClient, type Db as MongoDb } from "mongodb";

let _mongoClient: MongoClient | undefined;
let _mongoDb: MongoDb | undefined;

function mongoDbName(): string {
  return process.env.MONGODB_DB_NAME?.trim() || "coheronconnect";
}

/** True when `MONGODB_URI` is non-empty (Mongo may still be disconnected). */
export function isMongoUriConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim());
}

/** True after `initMongoIfConfigured()` succeeded. */
export function isMongoReady(): boolean {
  return _mongoDb !== undefined;
}

async function openMongoFromEnv(): Promise<void> {
  const uri = process.env.MONGODB_URI!.trim();
  const client = new MongoClient(uri);
  await client.connect();
  _mongoClient = client;
  _mongoDb = client.db(mongoDbName());
}

/**
 * Connects to MongoDB when `MONGODB_URI` is set (e.g. ad-hoc scripts).
 * No-op if URI is unset. Safe to call multiple times.
 */
export async function initMongoIfConfigured(): Promise<void> {
  if (!isMongoUriConfigured() || _mongoDb) return;
  await openMongoFromEnv();
}

/**
 * Connects to MongoDB and throws if `MONGODB_URI` is missing or connection fails.
 * Used for `hybrid` and `mongo` API modes.
 */
export async function connectMongoOrThrow(): Promise<void> {
  if (_mongoDb) return;
  if (!isMongoUriConfigured()) {
    throw new Error("MONGODB_URI is required for this database mode");
  }
  await openMongoFromEnv();
}

/**
 * Returns the default Mongo database after a successful init.
 * @throws If Mongo was not initialized (no URI or init failed).
 */
export function getMongoDb(): MongoDb {
  if (!_mongoDb) {
    throw new Error(
      "MongoDB is not connected. Set MONGODB_URI and use DATABASE_PROVIDER=hybrid|mongo with API startup, or call connectMongoOrThrow() / initMongoIfConfigured().",
    );
  }
  return _mongoDb;
}

export async function closeMongo(): Promise<void> {
  if (_mongoClient) {
    await _mongoClient.close();
    _mongoClient = undefined;
    _mongoDb = undefined;
  }
}
