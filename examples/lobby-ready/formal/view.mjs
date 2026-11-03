// view.mjs - labels for the statechart, in the owner's words. Works with both renderers:
//   - pstack `statechart` hands the view parsed values (a TLA+ function is a JS object);
//   - scripts/tlc-dot-to-mermaid.mjs (the fallback) leaves a function as its raw text
//     "(p1 :> 1 @@ p2 :> 1)", so `fn` below parses that form too.
export const title = 'Lobby: ready flags and config changes';

function fn(v) {
  if (v && typeof v === 'object') return v;
  const out = {};
  for (const m of String(v).matchAll(/(\w+) :> ("?[\w]+"?)/g)) out[m[1]] = m[2].replace(/"/g, '');
  return out;
}
const truthy = (x) => x === true || x === 'TRUE';

export function state(vars) {
  const ready = fn(vars.ready), seen = fn(vars.seen), pc = fn(vars.pc);
  const players = Object.keys(ready).sort();
  const who = players.map((p) => {
    if (pc[p] === 'mid') return `${p} pressing ready`;
    if (!truthy(ready[p])) return `${p} not ready`;
    return String(seen[p]) === String(vars.version) ? `${p} ready` : `${p} READY FOR OLD CONFIG v${seen[p]}`;
  });
  const started = Number(vars.started) ? `, game started on v${vars.started}` : '';
  return `room v${vars.version}: ${who.join(', ')}${started}`;
}

export function step(action) {
  return { ReadyBegin: 'presses ready (reads the config)', ReadyCommit: 'ready flag lands', HostChange: 'host changes the config', Start: 'game starts', Done: null }[action];
}

/** True when the state breaks ReadyMatchesConfig; used to build the --breaks list for the fallback. */
export function breaks(vars) {
  const ready = fn(vars.ready), seen = fn(vars.seen);
  return Object.keys(ready).some((p) => truthy(ready[p]) && String(seen[p]) !== String(vars.version));
}
