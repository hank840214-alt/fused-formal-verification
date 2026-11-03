// The example in examples/lobby-ready must stay a working proof: its repros pass, its drift guard is in sync,
// and the guard lights up for each kind of scratch change (a covered body, the keys entry). TLC is not run here
// (Java is not a test dependency of this repo); formal/gate.sh covers it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..', '..');
const example = join(repo, 'examples', 'lobby-ready');
const guard = join(repo, 'scripts', 'drift-guard.mjs');
const check = (root) => spawnSync(process.execPath, [guard, 'check', '--manifest', 'formal/coverage.json', '--root', root], { encoding: 'utf8' });

test('lobby-ready repros pass (fixed code survives the trace, mutant reproduces it)', () => {
  // A child `node --test` inherits NODE_TEST_CONTEXT and then reports to the parent instead of printing TAP.
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(example, 'lobby.test.mjs')], { encoding: 'utf8', cwd: example, env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal((r.stdout.match(/^ok /gm) ?? []).length, 4);
});

test('lobby-ready drift guard is in sync with the committed code', () => {
  const r = check(example);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal((r.stdout.match(/^OK /gm) ?? []).length, 5, r.stdout);
});

function withCopy(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ffv-lobby-'));
  try { cpSync(example, dir, { recursive: true }); return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('removing the re-check in handleReady is reported as DRIFT on that body', () => {
  withCopy((dir) => {
    const f = join(dir, 'server.mjs');
    const src = readFileSync(f, 'utf8');
    const broken = src.replace(/\n\s*if \(fix && version !== state\.config\.version\) \{[^]*?\n\s*\}\n/, '\n');
    assert.notEqual(broken, src, 'the scratch change applied');
    writeFileSync(f, broken);
    const r = check(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^DRIFT server\.mjs handleReady$/m);
    assert.match(r.stdout, /^OK server\.mjs handleConfig$/m);
    // and the repro for the fixed code fails on that copy: the check can fail, so it proves something
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const t = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(dir, 'lobby.test.mjs')], { encoding: 'utf8', cwd: dir, env });
    assert.equal(t.status, 1);
    assert.match(t.stdout, /^not ok \d+ - fixed code/m);
    assert.match(t.stdout, /^ok \d+ - mutant/m);
  });
});

test('changing maxPlayers is reported as DRIFT on the keys entry, bodies stay OK', () => {
  withCopy((dir) => {
    const f = join(dir, 'lobby.config.json');
    writeFileSync(f, readFileSync(f, 'utf8').replace('"maxPlayers": 2', '"maxPlayers": 3'));
    const r = check(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^DRIFT lobby\.config\.json keys:maxPlayers$/m);
    assert.equal((r.stdout.match(/^OK /gm) ?? []).length, 4);
  });
});
