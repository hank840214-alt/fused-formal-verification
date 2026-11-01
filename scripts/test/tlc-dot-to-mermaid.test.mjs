import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseDot, parseState, parseValue, buildChart } from '../tlc-dot-to-mermaid.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'tlc-dot-to-mermaid.mjs');

// Hand-crafted from the documented TLC `-dump dot,actionlabels,colorize` format.
const DOT = String.raw`strict digraph DiskGraph {
nodesep=0.35;
subgraph cluster_graph {
color="white";
-5 [label="/\\ phase = \"lobby\"\n/\\ players = {1, 2}\n/\\ cfg = [n |-> 2, ok |-> TRUE]\n/\\ q = <<1, 3>>\n/\\ f = (1 :> 2)",style = filled]
7 [label="/\\ phase = \"lobby\"\n/\\ players = {1}\n/\\ cfg = [n |-> 1, ok |-> TRUE]\n/\\ q = <<>>\n/\\ f = (1 :> 2)"];
12 [label="/\\ phase = \"play\"\n/\\ players = {1, 2}\n/\\ cfg = [n |-> 2, ok |-> FALSE]\n/\\ q = <<>>\n/\\ f = (1 :> 2)",color=red];
-5 -> 7 [label="Leave",color="2",fontcolor="2"];
-5 -> 12 [label="Start",color="3",fontcolor="3"];
7 -> 12 [label="Start",color="3",fontcolor="3"];
7 -> -5 [label="Join" color="1"];
12 -> 12 [label="Tick"];
}
}
`;

test('parseValue handles ints, bools, strings, sets, records, sequences, raw', () => {
  assert.equal(parseValue('-3'), -3);
  assert.equal(parseValue('TRUE'), true);
  assert.equal(parseValue('"a b"'), 'a b');
  assert.deepEqual(parseValue('{1, 2}'), [1, 2]);
  assert.deepEqual(parseValue('{}'), []);
  assert.deepEqual(parseValue('<<1, "x">>'), [1, 'x']);
  assert.deepEqual(parseValue('[a |-> 1, b |-> {2, 3}, c |-> [d |-> "e"]]'), { a: 1, b: [2, 3], c: { d: 'e' } });
  assert.deepEqual(parseValue('<<[a |-> 1], [a |-> 2]>>'), [{ a: 1 }, { a: 2 }]);
  assert.equal(parseValue('(1 :> 2 @@ 2 :> 3)'), '(1 :> 2 @@ 2 :> 3)');
});

test('parseDot reads nodes (negative ids, initial), edges, escapes', () => {
  const d = parseDot(DOT);
  assert.deepEqual(d.nodes.map((n) => n.id), ['-5', '7', '12']);
  assert.equal(d.nodes[0].initial, true);
  assert.equal(d.nodes[1].initial, false);
  assert.equal(d.edges.length, 5);
  assert.deepEqual(d.edges[3], { from: '7', to: '-5', label: 'Join' });
  const v = parseState(d.nodes[0].label);
  assert.equal(v.phase, 'lobby');
  assert.deepEqual(v.players, [1, 2]);
  assert.deepEqual(v.cfg, { n: 2, ok: true });
  assert.deepEqual(v.q, [1, 3]);
  assert.equal(v.f, '(1 :> 2)');
});

test('no view: raw label shortened to 60 chars', () => {
  const { text } = buildChart(parseDot(DOT));
  const first = text.split('\n').find((l) => l.includes(' as s0'));
  const label = /state "(.*)" as s0/.exec(first)[1].replaceAll('#quot;', '"');
  assert.ok(label.length <= 60, label);
  assert.ok(label.endsWith('…'));
  assert.match(text, /^stateDiagram-v2$/m);
  assert.match(text, /\[\*\] --> s0/);
});

test('view merges states and arrows, hides steps, marks breaks', () => {
  const view = {
    title: 'Lobby',
    state: (v) => v.phase,
    step: (a) => (a === 'Tick' ? null : a),
  };
  const { text, arrows } = buildChart(parseDot(DOT), { view, breaks: [12] });
  assert.match(text, /^title: Lobby$/m);
  assert.equal(text.match(/^ {2}state "/gm).length, 2);
  // Leave(-5->7), Start(-5->12), Start(7->12) merge to lobby->lobby:Leave, lobby->play:Start; Join -> lobby->lobby
  assert.match(text, /s0 --> s0 : Leave/);
  assert.equal(text.match(/s0 --> s1 : Start/g).length, 1);
  assert.match(text, /s0 --> s0 : Join/);
  assert.ok(!text.includes('Tick'));
  assert.equal(arrows, 3);
  assert.match(text, /classDef breaks/);
  assert.match(text, /class s1 breaks/);
});

test('step may return undefined to keep action name, string to relabel', () => {
  const view = { state: (v) => v.phase, step: (a, f, t) => (a === 'Start' ? `go ${f.players.length}->${t.players.length}` : undefined) };
  const { text } = buildChart(parseDot(DOT), { view });
  assert.match(text, /s0 --> s1 : go 2->2/);
  assert.match(text, /s0 --> s1 : go 1->2/);
  assert.match(text, /s1 --> s1 : Tick/);
});

test('CLI: --view, --breaks, --out, --max-arrows warning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tm-'));
  writeFileSync(join(dir, 's.dot'), DOT);
  writeFileSync(join(dir, 'view.mjs'), "export const title='T'; export const state = (v) => v.phase;\n");
  writeFileSync(join(dir, 'bad.json'), '[12]');
  const out = join(dir, 'c.mmd');
  const r = spawnSync(process.execPath, [CLI, join(dir, 's.dot'), '--view', join(dir, 'view.mjs'), '--breaks', join(dir, 'bad.json'), '--max-arrows', '2', '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /exceed --max-arrows 2/);
  const t = readFileSync(out, 'utf8');
  assert.match(t, /stateDiagram-v2/);
  assert.match(t, /class s1 breaks/);

  const r2 = spawnSync(process.execPath, [CLI, join(dir, 's.dot')], { encoding: 'utf8' });
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /stateDiagram-v2/);
  assert.equal(r2.stderr, '');
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2);
});
