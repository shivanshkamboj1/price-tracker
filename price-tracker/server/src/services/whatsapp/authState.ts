import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataSet,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import type { AnyBulkWriteOperation } from 'mongoose';
import { WhatsAppAuthKey, type IWhatsAppAuthKey } from '../../models/WhatsApp';
import { decryptString, encryptString } from '../../utils/crypto';
import type { Baileys } from './baileys';

export interface MongoAuthState {
  state: AuthenticationState;
  saveCreds(): Promise<void>;
  /** Deletes every stored key. The in-memory state must not be used afterwards. */
  clear(): Promise<void>;
}

const CREDS_ID = 'creds';

/**
 * Baileys' auth state backed by MongoDB, every value encrypted.
 *
 * A drop-in for its `useMultiFileAuthState`: same key layout and the same
 * serialisation (`BufferJSON`), so Buffers survive the round trip.
 */
export async function useMongoAuthState(baileys: Baileys): Promise<MongoAuthState> {
  const { BufferJSON, initAuthCreds, proto } = baileys;

  const encode = (value: unknown): string =>
    encryptString(JSON.stringify(value, BufferJSON.replacer));
  const decode = (raw: string): unknown => JSON.parse(decryptString(raw), BufferJSON.reviver);

  const stored = await WhatsAppAuthKey.findById(CREDS_ID).lean();
  const creds = stored ? (decode(stored.value) as AuthenticationCreds) : initAuthCreds();

  // Credential saves are chained so a slow write can never land after a newer one.
  let credsWrite: Promise<unknown> = Promise.resolve();
  let cleared = false;

  const saveCreds = (): Promise<void> => {
    credsWrite = credsWrite
      .catch(() => undefined)
      .then(() =>
        cleared
          ? undefined
          : WhatsAppAuthKey.updateOne(
              { _id: CREDS_ID },
              { $set: { value: encode(creds) } },
              { upsert: true },
            ),
      );
    return credsWrite.then(() => undefined);
  };

  const keys = {
    async get<T extends keyof SignalDataTypeMap>(
      type: T,
      ids: string[],
    ): Promise<{ [id: string]: SignalDataTypeMap[T] }> {
      const docs = await WhatsAppAuthKey.find({ _id: { $in: ids.map((id) => `${type}-${id}`) } }).lean();
      const byId = new Map(docs.map((doc) => [doc._id, doc.value]));

      const result: Record<string, unknown> = {};
      for (const id of ids) {
        const raw = byId.get(`${type}-${id}`);
        let value: unknown = raw ? decode(raw) : null;
        if (type === 'app-state-sync-key' && value) {
          value = proto.Message.AppStateSyncKeyData.fromObject(value as Record<string, unknown>);
        }
        result[id] = value;
      }
      return result as { [id: string]: SignalDataTypeMap[T] };
    },

    async set(data: SignalDataSet): Promise<void> {
      if (cleared) return;
      const ops: AnyBulkWriteOperation<IWhatsAppAuthKey>[] = [];
      for (const [category, entries] of Object.entries(data)) {
        for (const [id, value] of Object.entries(entries ?? {})) {
          const _id = `${category}-${id}`;
          ops.push(
            value
              ? {
                  updateOne: {
                    filter: { _id },
                    update: { $set: { value: encode(value) } },
                    upsert: true,
                  },
                }
              : { deleteOne: { filter: { _id } } },
          );
        }
      }
      if (ops.length > 0) await WhatsAppAuthKey.bulkWrite(ops, { ordered: true });
    },
  };

  const clear = async (): Promise<void> => {
    cleared = true;
    await credsWrite.catch(() => undefined);
    await WhatsAppAuthKey.deleteMany({});
  };

  return { state: { creds, keys }, saveCreds, clear };
}
