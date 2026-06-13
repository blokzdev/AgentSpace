// The subscribe -> react -> reduce loop agent replies will use (SPEC §6). For
// M0.4 the "reply" is a literal echo — the Model Gateway (real LLM reply) lands
// in M1.4. The orchestrator only ever sees threads it's a member of, via the
// membership-scoped my_thread_messages View.
import { Identity } from 'spacetimedb';
import { DbConnection } from '@agentspace/stdb-bindings';

const ECHO_PREFIX = '(orchestrator echo)';

export function startReplyLoop(conn: DbConnection, self: Identity): void {
  conn
    .subscriptionBuilder()
    .onApplied(() => {
      console.info('[orchestrator] subscribed to my_thread_messages');
    })
    .subscribe(['SELECT * FROM my_thread_messages']);

  conn.db.my_thread_messages.onInsert((_ctx, msg) => {
    if (msg.sender.isEqual(self)) return; // never echo ourselves
    if (msg.streamState !== 'complete') return; // ignore in-flight streams
    if (msg.text.startsWith(ECHO_PREFIX)) return; // belt-and-suspenders loop guard
    conn.reducers.sendMessage({ threadId: msg.threadId, text: `${ECHO_PREFIX} ${msg.text}` });
  });
}
