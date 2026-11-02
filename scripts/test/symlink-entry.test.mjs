// A script run through a symlinked path must still run (and fail loudly when asked to check). Before this test, both
// scripts compared argv[1] with import.meta.url, printed nothing and exited 0 from a symlink: a gate read that as a pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..', '..');
for (const script of ['drift-guard.mjs', 'tlc-dot-to-mermaid.mjs']) {
  test(`${script} runs when invoked through a symlink`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffv-link-'));
    try {
      symlinkSync(repo, join(dir, 'repo'));
      const linked = spawnSync(process.execPath, [join(dir, 'repo', 'scripts', script), '--help'], { encoding: 'utf8' });
      const direct = spawnSync(process.execPath, [join(repo, 'scripts', script), '--help'], { encoding: 'utf8' });
      assert.equal(linked.stdout + linked.stderr, direct.stdout + direct.stderr, 'same output through the symlink');
      assert.ok((linked.stdout + linked.stderr).trim().length > 0, 'the script actually ran and said something');
      assert.equal(linked.status, direct.status);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
