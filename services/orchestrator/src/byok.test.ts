import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import {
  createByokResolver,
  MissingKeyError,
  open,
  pubKeyB64,
  seal,
  type SealedKey,
} from './byok';

const owner = (hex: string): { toHexString: () => string } => ({ toHexString: () => hex });

describe('byok seal/open', () => {
  it('round-trips a key sealed to the orchestrator pubkey', () => {
    const kp = nacl.box.keyPair();
    const sealed = seal('sk-secret-123', pubKeyB64(kp));
    expect(sealed).not.toContain('sk-secret-123');
    expect(open(sealed, kp.secretKey)).toBe('sk-secret-123');
  });

  it('fails to open under a different secret key', () => {
    const a = nacl.box.keyPair();
    const b = nacl.box.keyPair();
    const sealed = seal('sk-secret', pubKeyB64(a));
    expect(() => open(sealed, b.secretKey)).toThrow();
  });
});

describe('createByokResolver', () => {
  const kp = nacl.box.keyPair();
  const keys: SealedKey[] = [
    { owner: owner('aaaa'), provider: 'anthropic', sealed: seal('sk-ant-aaaa', pubKeyB64(kp)) },
    { owner: owner('bbbb'), provider: 'openai', sealed: seal('sk-oai-bbbb', pubKeyB64(kp)) },
  ];
  const resolve = createByokResolver({ keys: () => keys, secretKey: kp.secretKey });

  it('resolves ref "<owner>:<provider>" to the decrypted key', async () => {
    await expect(resolve('aaaa:anthropic')).resolves.toBe('sk-ant-aaaa');
    await expect(resolve('bbbb:openai')).resolves.toBe('sk-oai-bbbb');
  });

  it('rejects with MissingKeyError when the owner has no key for that provider', async () => {
    await expect(resolve('aaaa:openai')).rejects.toBeInstanceOf(MissingKeyError);
    await expect(resolve('zzzz:anthropic')).rejects.toBeInstanceOf(MissingKeyError);
  });

  it('resolves a keyless local (openai-compatible) provider to an empty credential', async () => {
    await expect(resolve('aaaa:openai-compatible')).resolves.toBe('');
    await expect(resolve('zzzz:openai-compatible')).resolves.toBe('');
  });
});
