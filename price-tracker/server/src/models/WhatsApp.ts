import { Schema, model, type Model } from 'mongoose';

/**
 * The linked WhatsApp account's session keys, exactly as Baileys produces them:
 * one document per key (`creds`, `pre-key-12`, `session-…`), mirroring its own
 * file layout.
 *
 * Whoever holds these can read and send as that WhatsApp account, so `value` is
 * always AES-256-GCM encrypted with ENCRYPTION_KEY before it is written. They
 * live in MongoDB rather than on disk so they survive container rebuilds and
 * never end up in a synced or backed-up project folder.
 */
export interface IWhatsAppAuthKey {
  _id: string;
  value: string;
  updatedAt: Date;
}

const authKeySchema = new Schema<IWhatsAppAuthKey>(
  {
    _id: { type: String, required: true, maxlength: 512 },
    value: { type: String, required: true },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    versionKey: false,
    collection: 'whatsapp_auth_keys',
  },
);

export const WhatsAppAuthKey: Model<IWhatsAppAuthKey> = model<IWhatsAppAuthKey>(
  'WhatsAppAuthKey',
  authKeySchema,
);

/** The account alerts are sent from. One per deployment, present only while linked. */
export interface IWhatsAppAccount {
  _id: string;
  /** E.164 number of the sending account. */
  phone: string;
  /** Its WhatsApp profile name, when WhatsApp shares it. */
  name?: string;
  linkedAt: Date;
  updatedAt: Date;
}

export const WHATSAPP_ACCOUNT_ID = 'primary';

const accountSchema = new Schema<IWhatsAppAccount>(
  {
    _id: { type: String, required: true },
    phone: { type: String, required: true, maxlength: 24 },
    name: { type: String, maxlength: 120 },
    linkedAt: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    versionKey: false,
    collection: 'whatsapp_account',
  },
);

export const WhatsAppAccount: Model<IWhatsAppAccount> = model<IWhatsAppAccount>(
  'WhatsAppAccount',
  accountSchema,
);

export async function getLinkedWhatsAppAccount(): Promise<IWhatsAppAccount | null> {
  return WhatsAppAccount.findById(WHATSAPP_ACCOUNT_ID).lean();
}

/** Forgets the linked account and every session key. Used on unlink and on logout by WhatsApp. */
export async function forgetWhatsAppAccount(): Promise<void> {
  await Promise.all([
    WhatsAppAuthKey.deleteMany({}),
    WhatsAppAccount.deleteOne({ _id: WHATSAPP_ACCOUNT_ID }),
  ]);
}
