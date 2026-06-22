// Local end-to-end check for per-user BYOK + the agent reply loop (M1.7/M1.6). A user
// seals a provider key to the orchestrator's box public key and stores the CIPHERTEXT
// in STDB (`set_provider_key`); authors a persona; posts. The orchestrator resolves the
// sealed key via `createByokResolver` (the real BYOK path) and replies. We assert the
// reply streams AND that the orchestrator decrypted exactly the key the user sealed —
// proving: app seals → STDB holds only ciphertext → orchestrator decrypts in-memory.
// Needs a running local server with the `agentspace` module published. Not in CI.
//   pnpm --filter @agentspace/orchestrator integration
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Identity } from 'spacetimedb';
import type { GatewayDelta, GatewayRequest, ModelGateway } from '@agentspace/gateway';
import { DbConnection } from '@agentspace/stdb-bindings';
import { connectOrchestrator } from '../src/spacetime';
import { startReplyLoop } from '../src/replyLoop';
import { createByokResolver, loadOrCreateKeypair, pubKeyB64, seal } from '../src/byok';

const HOST = process.env.AGENTSPACE_STDB_HOST ?? 'ws://127.0.0.1:3000';
const DB = process.env.AGENTSPACE_STDB_DB ?? 'agentspace';

const PERSONA = { name: 'Pirate Pete', systemPrompt: 'You are Pirate Pete.', provider: 'anthropic', model: 'claude-opus-4-8' };
const USER_KEY = 'sk-test-byok-123';
const REPLY_CHUNKS = ['Ahoy', ', ', 'matey', '!'];
const EXPECTED = REPLY_CHUNKS.join('');

function connectUser(): Promise<{ conn: DbConnection; identity: Identity }> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .onConnect((conn, identity) => resolve({ conn, identity }))
      .onConnectError((_ctx, err: Error) => reject(err))
      .build();
  });
}

function fail(msg: string): never {
  console.error(`\n❌ integration failed: ${msg}`);
  process.exit(1);
}

async function run(): Promise<void> {
  const orch = await connectOrchestrator({
    tokenFile: join(tmpdir(), `agentspace-orch-int-${Date.now()}.token`),
  });
  const keypair = loadOrCreateKeypair(join(tmpdir(), `agentspace-orch-int-${Date.now()}.boxkey`));
  orch.conn.reducers.registerService({ encPubKey: pubKeyB64(keypair) });

  // Gateway that exercises the real BYOK resolver, then streams scripted chunks.
  const resolver = createByokResolver({ keys: () => orch.conn.db.my_persona_keys.iter(), secretKey: keypair.secretKey });
  let decryptedKey: string | undefined;
  const gateway: ModelGateway = {
    async *stream(req: GatewayRequest): AsyncIterable<GatewayDelta> {
      decryptedKey = await resolver(req.credentialRef); // ← the BYOK path
      for (const text of REPLY_CHUNKS) yield { type: 'text', text };
      yield { type: 'finish', usage: { inputTokens: 7, outputTokens: 4 }, finishReason: 'stop' };
    },
    embed: () => Promise.reject(new Error('not used')),
  };
  startReplyLoop(orch.conn, orch.identity, gateway, { flushMs: 20 });
  console.info(`orchestrator identity: ${orch.identity.toHexString()}`);

  const user = await connectUser();
  console.info(`user identity:         ${user.identity.toHexString()}`);

  await new Promise<void>((resolve) => {
    user.conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .subscribe([
        'SELECT * FROM my_thread_messages',
        'SELECT * FROM my_threads',
        'SELECT * FROM my_agents',
        'SELECT * FROM service_info',
      ]);
  });

  const done = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out (20s) waiting for the agent reply')), 20_000);
    const check = (msg: { sender: Identity; streamState: string; text: string; runId: string }): void => {
      if (!msg.sender.isEqual(orch.identity) || msg.runId === '') return;
      if (msg.streamState === 'complete') {
        clearTimeout(timer);
        resolve(msg.text);
      }
    };
    user.conn.db.my_thread_messages.onInsert((_ctx, m) => check(m));
    user.conn.db.my_thread_messages.onUpdate((_ctx, _o, m) => check(m));
  });

  // 1) once the orchestrator's pubkey is published, seal the key + author the persona.
  let seeded = false;
  const seed = (): void => {
    if (seeded) return;
    const svc = [...user.conn.db.service_info.iter()][0];
    if (!svc || svc.encPubKey.length === 0) return;
    seeded = true;
    const sealed = seal(USER_KEY, svc.encPubKey); // client-side encryption to the orchestrator
    user.conn.reducers.setProviderKey({ provider: PERSONA.provider, sealed });
    user.conn.reducers.createAgent({
      name: PERSONA.name,
      systemPrompt: PERSONA.systemPrompt,
      provider: PERSONA.provider,
      model: PERSONA.model,
      baseUrl: '',
    });
  };
  user.conn.db.service_info.onInsert(() => seed());
  user.conn.db.service_info.onUpdate(() => seed());
  seed();

  // 2) deploy the persona to a DM, then post.
  let deployed = false;
  user.conn.db.my_agents.onInsert((_ctx, a) => {
    if (deployed) return;
    deployed = true;
    user.conn.reducers.createAgentDm({ agentId: a.id });
  });
  let posted = false;
  user.conn.db.my_threads.onInsert((_ctx, th) => {
    if (posted || th.agentId === 0n) return;
    posted = true;
    user.conn.reducers.sendMessage({ threadId: th.id, text: 'hello there' });
  });

  const text = await done.catch((e: Error) => fail(e.message));
  if (text !== EXPECTED) fail(`reply text was "${text}", expected "${EXPECTED}"`);
  if (decryptedKey !== USER_KEY) fail(`orchestrator decrypted "${decryptedKey ?? '(none)'}", expected the user's sealed key`);

  console.info(`\n✅ per-user BYOK end-to-end:`);
  console.info(`   user sealed key → STDB holds only ciphertext → orchestrator decrypted "${decryptedKey}"`);
  console.info(`   persona "${PERSONA.name}" replied: "${text}" (streaming → complete)`);
  process.exit(0);
}

run().catch((e: unknown) => {
  fail(e instanceof Error ? e.message : String(e));
});
