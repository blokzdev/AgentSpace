// Client-side BYOK sealing (M1.7): encrypt a provider key to the orchestrator's NaCl
// box public key so only ciphertext ever leaves the device / reaches SpacetimeDB.
// The blob format (ephPub32 || nonce24 || ciphertext, base64) is shared with
// services/orchestrator/src/byok.ts — keep them in sync.
import 'react-native-get-random-values'; // ensure crypto.getRandomValues for nacl
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';

const NONCE_LEN = 24;

export function sealForOrchestrator(rawKey: string, recipientPubB64: string): string {
  const recipient = util.decodeBase64(recipientPubB64);
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(NONCE_LEN);
  const ct = nacl.box(util.decodeUTF8(rawKey), nonce, recipient, eph.secretKey);
  const out = new Uint8Array(eph.publicKey.length + nonce.length + ct.length);
  out.set(eph.publicKey, 0);
  out.set(nonce, eph.publicKey.length);
  out.set(ct, eph.publicKey.length + nonce.length);
  return util.encodeBase64(out);
}
