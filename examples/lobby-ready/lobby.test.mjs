// lobby.test.mjs - the real-code reproduction of the counterexample TLC finds in formal/MC_mutant.cfg,
// and the proof that today's code (fix on) survives the same interleaving.
//
// Trace (Lobby.tla, Fix = FALSE):  ReadyBegin(p1) -> HostChange -> ReadyCommit(p1)  => ReadyMatchesConfig breaks.
// The gate store below holds handleReady's await open so the test can run HostChange in the middle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLobby } from './server.mjs';

/** A store whose writes wait until the test releases them by operation name. */
function gateStore() {
  const waiting = [];
  return {
    log: [],
    async write(entry) {
      await new Promise((release) => waiting.push({ entry, release }));
      this.log.push(entry);
    },
    release(op) {
      const i = waiting.findIndex((w) => w.entry.op === op);
      if (i < 0) throw new Error(`no ${op} write is waiting`);
      waiting.splice(i, 1)[0].release();
    },
  };
}

async function runTrace(fix) {
  const store = gateStore();
  const lobby = createLobby({ fix, store });
  const join1 = lobby.handleJoin('p1'); store.release('join'); await join1;
  const join2 = lobby.handleJoin('p2'); store.release('join'); await join2;

  const ready = lobby.handleReady('p1');             // ReadyBegin: reads version 1, then parks on the await
  const change = lobby.handleConfig('speed');        // HostChange: version 2, flags cleared
  store.release('config'); await change;
  store.release('ready'); const out = await ready;   // ReadyCommit
  return { lobby, out };
}

test('fixed code: the stale ready is rejected, nobody is ready for a config they never saw', async () => {
  const { lobby, out } = await runTrace(true);
  assert.equal(out.status, 409);
  const p1 = lobby.state.players.get('p1');
  assert.equal(p1.ready, false);
  for (const p of lobby.state.players.values()) if (p.ready) assert.equal(p.seen, lobby.state.config.version);
});

test('mutant (fix off): the trace from MC_mutant reproduces on the real code', async () => {
  const { lobby, out } = await runTrace(false);
  assert.equal(out.status, 200);
  const p1 = lobby.state.players.get('p1');
  // The decisive line: ready for version 1 while the room is at version 2.
  assert.equal(p1.ready, true);
  assert.notEqual(p1.seen, lobby.state.config.version, `p1 ready with seen=${p1.seen}, room at ${lobby.state.config.version}`);
});
