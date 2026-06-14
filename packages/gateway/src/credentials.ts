// BYOK credential custody for the Model Gateway (BLUEPRINT §4, SPEC §4).
// Provider keys are sealed at rest with AES-256-GCM under a key-encryption-key
// (KEK) and decrypted in-memory at call time — never written to STDB, never sent
// to the device, never logged. v1 keeps sealed blobs in an in-memory map; the
// Postgres/KMS backing (`provider_keys.secret_ref`) is deferred (OT-005).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Resolves an opaque credential handle to a live API key, server-side. */
export type CredentialResolver = (ref: string) => Promise<string>;

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEK_LEN = 32;

export interface EncryptedKeyStore {
  /** Encrypt a plaintext secret to a self-describing base64 blob (iv|tag|ct). */
  seal(plaintext: string): string;
  /** Decrypt a blob produced by {@link seal}; throws on tamper or wrong KEK. */
  open(blob: string): string;
  /** Store a provider key under an opaque ref (sealed at rest). */
  putKey(ref: string, plaintext: string): void;
  /** The custody-path {@link CredentialResolver} for this store. */
  resolve: CredentialResolver;
}

export function createEncryptedKeyStore(opts: { kek: Buffer }): EncryptedKeyStore {
  const { kek } = opts;
  if (kek.length !== KEK_LEN) {
    throw new Error(`Gateway KEK must be ${KEK_LEN} bytes (AES-256), got ${kek.length}`);
  }
  const sealed = new Map<string, string>();

  function seal(plaintext: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, kek, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
  }

  function open(blob: string): string {
    const buf = Buffer.from(blob, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, kek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }

  return {
    seal,
    open,
    putKey(ref, plaintext) {
      sealed.set(ref, seal(plaintext));
    },
    resolve(ref) {
      const blob = sealed.get(ref);
      if (blob === undefined) {
        return Promise.reject(new Error(`No credential stored for ref "${ref}"`));
      }
      try {
        return Promise.resolve(open(blob));
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error('credential decrypt failed'));
      }
    },
  };
}

/** Read the base64-encoded KEK from the environment. */
export function kekFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.AGENTSPACE_GATEWAY_KEK;
  if (!raw) throw new Error('AGENTSPACE_GATEWAY_KEK is not set');
  return Buffer.from(raw, 'base64');
}

/**
 * INTERIM dev/smoke resolver (DEC-024): maps a credential ref (a provider name, e.g.
 * "anthropic") to the matching `<PROVIDER>_API_KEY` env var — one operator key per
 * provider. Backs the smoke harness (SETUP.md S-4); **not** the product model.
 * Per-user in-app BYOK (a real per-user `CredentialResolver`) is M1.7.
 */
export function envResolver(env: NodeJS.ProcessEnv = process.env): CredentialResolver {
  return (ref) => {
    const varName = `${ref.toUpperCase().replace(/-/g, '_')}_API_KEY`;
    const key = env[varName];
    if (!key) return Promise.reject(new Error(`No API key in env (${varName}) for ref "${ref}"`));
    return Promise.resolve(key);
  };
}
