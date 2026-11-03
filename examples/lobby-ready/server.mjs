// server.mjs - a toy lobby, written from scratch for this example. No framework, no database.
//
// Rules the owner would state:
//   - Players join a room and press "ready".
//   - The host can change the room's config (the mode). A ready flag only means something for the
//     config the player saw, so a config change clears every flag.
//   - The game starts only when every player is ready.
//
// The race lives in handleReady: it reads the config version, awaits the store, then writes the flag.
// Between the read and the write the host can change the config. Without the fix, the flag lands with
// the OLD version in `seen`: a player is "ready" for a config they never saw, and the game can start
// with it. `fix` is the switch the formal model mirrors (CONSTANT Fix in formal/Lobby.tla).
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const settings = JSON.parse(readFileSync(join(here, 'lobby.config.json'), 'utf8'));

/** The store: each write is one await, which is where another request can interleave. */
export function memoryStore() {
  return {
    log: [],
    async write(entry) {
      await new Promise((r) => setImmediate(r));
      this.log.push(entry);
    },
  };
}

export function createLobby({ fix = true, store = memoryStore(), maxPlayers = settings.maxPlayers } = {}) {
  const state = { config: { version: 1, mode: 'classic' }, players: new Map(), started: null };

  // Covered: a join after Start would add a player who never agreed to the started config.
  async function handleJoin(id) {
    if (state.started) return { status: 409, error: 'game already started' };
    if (state.players.has(id)) return { status: 409, error: 'already in the room' };
    if (state.players.size >= maxPlayers) return { status: 409, error: 'room is full' };
    state.players.set(id, { id, ready: false, pending: false, seen: state.config.version });
    await store.write({ op: 'join', id });
    return { status: 200, player: state.players.get(id) };
  }

  // Covered by formal/Lobby.tla as ReadyBegin (before the await) and ReadyCommit (after it).
  // ReadyBegin's guards are these four checks: not started, in the room, not already ready, no ready in flight.
  async function handleReady(id) {
    if (state.started) return { status: 409, error: 'game already started' };
    const player = state.players.get(id);
    if (!player) return { status: 404, error: 'not in the room' };
    if (player.ready) return { status: 409, error: 'already ready' };
    if (player.pending) return { status: 409, error: 'ready already in flight' };
    player.pending = true;
    const version = state.config.version;            // ReadyBegin: the version this player is agreeing to
    await store.write({ op: 'ready', id, version }); // another request can run here
    player.pending = false;
    if (fix && version !== state.config.version) {   // ReadyCommit (fixed): the room changed under us
      return { status: 409, error: 'config changed, look again' };
    }
    player.ready = true;                              // ReadyCommit: the flag lands
    player.seen = version;
    return { status: 200, player };
  }

  // Covered as HostChange: a new version, every flag cleared.
  async function handleConfig(mode) {
    if (state.started) return { status: 409, error: 'game already started' };
    state.config = { version: state.config.version + 1, mode };
    for (const p of state.players.values()) p.ready = false;
    await store.write({ op: 'config', version: state.config.version, mode });
    return { status: 200, config: state.config };
  }

  // Covered as Start: only when every player is ready.
  function handleStart() {
    if (state.started) return { status: 409, error: 'game already started' };
    if (state.players.size === 0) return { status: 409, error: 'nobody in the room' };
    for (const p of state.players.values()) if (!p.ready) return { status: 409, error: `${p.id} is not ready` };
    state.started = { ...state.config };
    return { status: 200, started: state.started };
  }

  return { state, handleJoin, handleReady, handleConfig, handleStart };
}

/** HTTP front, loopback only. POST /join {id}, /ready {id}, /config {mode}, /start; GET /state. */
export function serve(lobby, port = settings.port) {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = body ? JSON.parse(body) : {};
    const routes = {
      'POST /join': () => lobby.handleJoin(String(input.id)),
      'POST /ready': () => lobby.handleReady(String(input.id)),
      'POST /config': () => lobby.handleConfig(String(input.mode)),
      'POST /start': () => lobby.handleStart(),
      'GET /state': () => ({ status: 200, config: lobby.state.config, players: [...lobby.state.players.values()], started: lobby.state.started }),
    };
    const route = routes[`${req.method} ${req.url}`];
    const out = route ? await route() : { status: 404, error: 'no such route' };
    res.writeHead(out.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });
  server.listen(port, '127.0.0.1');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const fix = !process.argv.includes('--no-fix');
  const server = serve(createLobby({ fix }));
  server.on('listening', () => console.log(`lobby on http://127.0.0.1:${server.address().port} (fix ${fix ? 'on' : 'off'})`));
}
