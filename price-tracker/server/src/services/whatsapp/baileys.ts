/**
 * Baileys speaks the WhatsApp Web protocol, which is how a phone's "Linked
 * devices" work. It is an ES module and only the one worker that holds the
 * WhatsApp connection needs it, so it is loaded on first use instead of at
 * import time: the API, the scheduler and the test suite never load it.
 *
 * `require` of an ES module needs Node 20.19+ (or 22.12+).
 */
export type Baileys = typeof import('@whiskeysockets/baileys');

let loaded: Baileys | undefined;

export function loadBaileys(): Baileys {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  loaded ??= require('@whiskeysockets/baileys') as Baileys;
  return loaded;
}
