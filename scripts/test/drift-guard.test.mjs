import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractSymbol, sha256, normalize } from '../drift-guard.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'drift-guard.mjs');

const TS = `
import x from 'y';
export async function handleJoin(req: { id: string }, res) {
  const s = "}{ not a brace"; // } comment brace
  const t = \`tpl \${ req.id + '}' } }\`;
  if (req.id) { res.send(t); }
  return /[}]/.test(s);
}
function handleJoin2() { return 1; }
const handleLeave = async (req) => {
  return { ok: true };
};
export const quick = (a) => a + 1;
const fnExpr = function (a) { return a; };
class Room {
  count = 0;
  constructor() { this.count = 1; }
  start(opts: { fast: boolean } = { fast: true }): void {
    this.begin();
    if (opts.fast) { this.count++; }
  }
  begin() { this.start2(); }
  start2() { return 2; }
  tick = () => { this.count++; };
}
`;

test('extracts function declaration, ignoring braces in strings/comments/templates/regex', () => {
  const b = extractSymbol(TS, 'handleJoin', 'a.ts');
  assert.match(b, /^export async function handleJoin/);
  assert.match(b, /return \/\[}\]\/\.test\(s\);\n}$/);
  assert.ok(!b.includes('handleJoin2'));
});

test('extracts const arrow, expression arrow, function expression', () => {
  assert.match(extractSymbol(TS, 'handleLeave', 'a.ts'), /return \{ ok: true \};\n\}$/);
  assert.equal(extractSymbol(TS, 'quick', 'a.ts'), 'export const quick = (a) => a + 1;');
  assert.equal(extractSymbol(TS, 'fnExpr', 'a.ts'), 'const fnExpr = function (a) { return a; }');
});

test('extracts class methods, not same-named calls or other classes', () => {
  const b = extractSymbol(TS, 'class Room.start', 'a.ts');
  assert.match(b, /^ {2}start\(opts/);
  assert.match(b, /this\.count\+\+; \}\n {2}\}$/);
  assert.ok(!b.includes('begin() {'));
  assert.match(extractSymbol(TS, 'class Room.tick', 'a.ts'), /tick = \(\) => \{ this\.count\+\+; \}/);
  assert.equal(extractSymbol(TS, 'class Room.nope', 'a.ts'), null);
  assert.equal(extractSymbol(TS, 'class Nope.start', 'a.ts'), null);
});

test('regex: symbol marks the start line', () => {
  const src = `app.post('/join', (req, res) => {\n  res.end("}");\n});\nother();\n`;
  const b = extractSymbol(src, "regex:app\\.post\\('/join'", 'a.js');
  assert.equal(b, `app.post('/join', (req, res) => {\n  res.end("}");\n}`);
});

test('missing symbol returns null', () => {
  assert.equal(extractSymbol(TS, 'doesNotExist', 'a.ts'), null);
  assert.equal(extractSymbol('const f = makeIt(1);\n', 'f', 'a.js'), null);
});

test('python: def, async def, class method, indentation end, multi-line signature', () => {
  const py = `import os

def top(a,
        b):
    x = 1

    return x

class Room:
    def start(self):
        if self.ok:
            return 1
        return 2

    async def other(self):
        pass

def after():
    pass
`;
  assert.equal(extractSymbol(py, 'top', 'a.py'), 'def top(a,\n        b):\n    x = 1\n\n    return x');
  assert.equal(extractSymbol(py, 'class Room.start', 'a.py'), '    def start(self):\n        if self.ok:\n            return 1\n        return 2');
  assert.match(extractSymbol(py, 'class Room.other', 'a.py'), /async def other/);
  assert.equal(extractSymbol(py, 'class Room.after', 'a.py'), null);
  assert.equal(extractSymbol(py, 'regex:^def after', 'a.py'), 'def after():\n    pass');
});

test('normalization: CRLF and trailing whitespace do not change the hash', () => {
  const a = 'function f() {  \r\n  return 1;\t\r\n}';
  const b = 'function f() {\n  return 1;\n}';
  assert.equal(normalize(a), b);
  assert.equal(sha256(a), sha256(b));
  assert.notEqual(sha256(b), sha256('function f() {\n  return 2;\n}'));
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'dg-'));
  mkdirSync(join(root, 'formal'));
  mkdirSync(join(root, 'server'));
  writeFileSync(join(root, 'server/index.ts'), 'function handleJoin() {\n  return 1;\n}\nfunction other() {\n  return 5;\n}\n');
  writeFileSync(join(root, 'formal/coverage.json'), JSON.stringify({
    syncCommit: 'old', model: ['formal/Lobby.tla'],
    covered: [{ file: 'server/index.ts', symbol: 'handleJoin' }],
  }));
  return root;
}
const cli = (root, ...a) => spawnSync(process.execPath, [CLI, ...a, '--root', root], { encoding: 'utf8' });

test('CLI: update then check passes; unrelated edit passes; covered edit drifts', () => {
  const root = setup();
  let r = cli(root, 'check');
  assert.equal(r.status, 1, 'no baseline hash counts as drift');
  assert.match(r.stdout, /^DRIFT server\/index\.ts handleJoin$/m);

  r = cli(root, 'update');
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(readFileSync(join(root, 'formal/coverage.json'), 'utf8'));
  assert.match(m.covered[0].hash, /^[0-9a-f]{64}$/);
  assert.equal(m.syncCommit, 'old', 'not a git repo: syncCommit left alone');

  r = cli(root, 'check');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^OK server\/index\.ts handleJoin$/m);

  writeFileSync(join(root, 'server/index.ts'), 'function handleJoin() {\n  return 1;\n}\nfunction other() {\n  return 6;\n}\n');
  assert.equal(cli(root, 'check').status, 0, 'edit outside covered body is ignored');

  writeFileSync(join(root, 'server/index.ts'), 'function handleJoin() {\n  return 2;\n}\n');
  r = cli(root, 'check');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^DRIFT server\/index\.ts handleJoin$/m);
  assert.match(r.stderr, /Maintain mode/);
  assert.match(r.stderr, /drift-guard\.mjs update/);

  const j = JSON.parse(cli(root, 'check', '--json').stdout);
  assert.equal(j.ok, false);
  assert.equal(j.results[0].status, 'DRIFT');

  writeFileSync(join(root, 'server/index.ts'), 'function renamed() {\n  return 2;\n}\n');
  r = cli(root, 'check');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^MISSING server\/index\.ts handleJoin$/m);
  r = cli(root, 'update');
  assert.equal(r.status, 1, 'update refuses when a symbol is missing');
});

test('CLI: update writes git HEAD into syncCommit inside a git repo', () => {
  const root = setup();
  const g = (...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: root, encoding: 'utf8' });
  if (g('init', '-q').status !== 0) return; // git unavailable: skip
  g('add', '.'); g('commit', '-qm', 'x');
  const head = g('rev-parse', 'HEAD').stdout.trim();
  assert.equal(cli(root, 'update').status, 0);
  assert.equal(JSON.parse(readFileSync(join(root, 'formal/coverage.json'), 'utf8')).syncCommit, head);
});

test('CLI: bad usage and manifest errors exit 2', () => {
  const root = setup();
  assert.equal(cli(root, 'bogus').status, 2);
  assert.equal(cli(root, 'check', '--manifest', 'nope.json').status, 2);
});
