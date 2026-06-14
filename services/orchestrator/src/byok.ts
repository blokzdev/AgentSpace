// Per-user BYOK key custody (M1.7). The app encrypts a provider key to the
// orchestrator's NaCl box public key (client-side); the sealed ciphertext travels
// through SpacetimeDB (never the raw key); the orchestrator decrypts in-memory here.
// The seal/open format is shared with apps/mobile/src/byok.ts — keep them in sync.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nacl from 'tweetnacl';
import type { CredentialResolver } from '@agentspace/gateway';

const EPH_LEN = 32; // box public key
const NONCE_LEN = 24;

export interface BoxKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function defaultKeyFile(db = 'agentspace'): string {
  return join(tmpdir(), `agentspace-orchestrator-${db}.boxkey`);
}

/** Load the persisted box keypair, or generate + persist a new one. */
export function loadOrCreateKeypair(file: string): BoxKeypair {
  if (existsSync(file)) {
    const sk = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
    if (sk.length === nacl.box.secretKeyLength) {
      return nacl.box.keyPair.fromSecretKey(new Uint8Array(sk));
    }
  }
  const kp = nacl.box.keyPair();
  try {
    writeFileSync(file, Buffer.from(kp.secretKey).toString('base64'));
  } catch {
    // non-fatal: keys just won't persist across restarts (users re-enter)
  }
  return kp;
}

export function pubKeyB64(kp: BoxKeypair): string {
  return Buffer.from(kp.publicKey).toString('base64');
}

/** Encrypt a raw key to a recipient box public key (base64). Mirrors the mobile seal. */
export function seal(rawKey: string, recipientPubB64: string): string {
  const recipient = new Uint8Array(Buffer.from(recipientPubB64, 'base64'));
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(NONCE_LEN);
  const ct = nacl.box(new TextEncoder().encode(rawKey), nonce, recipient, eph.secretKey);
  return Buffer.concat([Buffer.from(eph.publicKey), Buffer.from(nonce), Buffer.from(ct)]).toString('base64');
}

/** Decrypt a sealed blob with the orchestrator's secret key; throws on failure. */
export function open(blob: string, secretKey: Uint8Array): string {
  const buf = Buffer.from(blob, 'base64');
  const eph = new Uint8Array(buf.subarray(0, EPH_LEN));
  const nonce = new Uint8Array(buf.subarray(EPH_LEN, EPH_LEN + NONCE_LEN));
  const ct = new Uint8Array(buf.subarray(EPH_LEN + NONCE_LEN));
  const msg = nacl.box.open(ct, nonce, eph, secretKey);
  if (!msg) throw new Error('failed to open sealed credential');
  return new TextDecoder().decode(msg);
}

/** A sealed provider key as exposed by the `my_persona_keys` view (structural). */
export interface SealedKey {
  owner: { toHexString: () => string };
  provider: string;
  sealed: string;
}

/** Marker error for "the persona owner has no key for this provider". */
export class MissingKeyError extends Error {}

/**
 * BYOK `CredentialResolver`: `ref = "<ownerHex>:<provider>"` → the owner's sealed key
 * for that provider, decrypted in-memory. Rejects with a `MissingKeyError` when none.
 */
export function createByokResolver(opts: {
  keys: () => Iterable<SealedKey>;
  secretKey: Uint8Array;
}): CredentialResolver {
  return (ref: string) => {
    const sep = ref.indexOf(':');
    const ownerHex = sep >= 0 ? ref.slice(0, sep) : '';
    const provider = sep >= 0 ? ref.slice(sep + 1) : ref;
    for (const k of opts.keys()) {
      if (k.owner.toHexString() === ownerHex && k.provider === provider) {
        try {
          return Promise.resolve(open(k.sealed, opts.secretKey));
        } catch (err) {
          return Promise.reject(err instanceof Error ? err : new Error('credential decrypt failed'));
        }
      }
    }
    return Promise.reject(
      new MissingKeyError(`No ${provider || 'provider'} API key — the agent's owner must add one in Settings → API Keys`),
    );
  };
}
