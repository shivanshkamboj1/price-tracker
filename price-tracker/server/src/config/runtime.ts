/**
 * Runtime compatibility shim. Imported first by every process entrypoint.
 *
 * Node 18 does not expose `File` and `Blob` as globals, but some transitive
 * dependencies (cheerio's bundled undici among them) assume they exist and throw
 * at import time without them. Both are available from `node:buffer` on Node 18,
 * so this is a straight re-export, and a no-op on Node 20+ where the globals are
 * already defined.
 */
import { Blob as BufferBlob, File as BufferFile } from 'node:buffer';

const globals = globalThis as Record<string, unknown>;

globals.File ??= BufferFile;
globals.Blob ??= BufferBlob;

export {};
