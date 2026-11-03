#!/usr/bin/env node
// drift-guard.mjs - hash the bodies of covered functions (and the lockfile/config values the
// model assumes); fail when they change without the formal verification being re-synced. Dependency-free, Node >= 20.
//
// Usage:
//   node drift-guard.mjs update [--manifest formal/coverage.json] [--root .] [--json]
//   node drift-guard.mjs check  [--manifest formal/coverage.json] [--root .] [--json]
//
// Manifest shape:
//   { "syncCommit": "abc123", "model": ["formal/Lobby.tla"],
//     "covered": [ { "file": "server/index.ts", "symbol": "handleJoin" },
//                  { "file": "src/lobby.ts", "symbol": "class Room.start" },
//                  { "file": "x.js", "symbol": "regex:^app\\.post\\('/join'" },
//                  { "file": "package-lock.json", "keys": ["packages.node_modules/ws.version"] },
//                  { "file": "config/lobby.env" } ] }
//
// Entry forms
//   file + symbol        hash one function body (the forms below).
//   file + keys          JSON file: hash only the values at these dot paths (a lockfile entry
//                        for a library whose semantics the model relies on, a timeout or limit
//                        in a config that is a model constant). A missing path is MISSING.
//   file alone           hash the whole file (a small config or env file). Use this for what
//                        the model assumes but no function body shows: changing a package
//                        version or an environment parameter changes the meaning of the code
//                        without touching a covered body, and the guard must light up.
//
// Supported symbol forms
//   name                 top-level `function name(`, `async function`, `export`/`default`
//                        variants, and `const|let|var name = (...) =>` / `= function` /
//                        `= async x =>` (arrow functions with expression bodies are
//                        supported up to the end of the statement/line).
//   class Cls.method     method (or arrow-function property) of a JS/TS class, at class
//                        top level. Python: `def method` inside `class Cls`.
//   regex:<pattern>      JS RegExp (flag m) run on the raw source; the match marks the start.
//                        The body is the first brace block found AFTER the matched text (so the
//                        pattern may stop inside a call like `app.post('/join'`); Python: indentation block.
//
// What is hashed: the text from the START OF THE LINE where the symbol is declared
// (so the signature counts) through the closing brace. CRLF -> LF, trailing whitespace
// stripped per line. Leading indentation is NOT normalized: re-indenting counts as drift.
//
// Known limits (best-effort, not a parser):
//   - Braces inside strings, template literals (incl. nested ${}), comments and simple
//     regex literals are ignored. A regex literal after `)` or `}` is read as division.
//   - Return-type annotations that contain `{` (e.g. `): Promise<{a: 1}> {`) make the
//     scanner take the wrong brace. Parameter lists are skipped by paren matching, so
//     object types / defaults INSIDE the parens are fine.
//   - Overloads: the first declaration that has a body wins.
//   - Python: block end is by indentation (lines indented deeper than the `def`, blank
//     lines inside are kept). Multi-line strings with text at lower indentation, or tab/space
//     mixing, can cut the block short. Decorators are not part of the hash.
//   - Only the covered body is hashed: a change in a helper it calls is NOT detected.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function normalize(text) {
  return text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n');
}

export const sha256 = (text) => createHash('sha256').update(normalize(text)).digest('hex');

/** Return a same-length copy of src with string/comment/regex-literal contents blanked. */
export function maskJs(src) {
  const n = src.length;
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
  const tpl = []; // brace counters for open `${ ... }` expressions
  let last = '';
  let i = 0;
  const scanTpl = (from) => {
    let j = from;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') { blank(from, j); return j + 1; }
      if (c === '$' && src[j + 1] === '{') { blank(from, j); tpl.push(1); return j + 2; }
      j++;
    }
    blank(from, n);
    return n;
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; blank(i, j); i = j; continue; }
    if (c === '/' && d === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; blank(i, j); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      blank(i + 1, j); i = j + 1; last = c; continue;
    }
    if (c === '`') { i = scanTpl(i + 1); last = '`'; continue; }
    if (c === '/' && (last === '' || '(,=:[!&|?{};+-*%<>~^'.includes(last)
        || /(?:^|[^\w$.])(?:return|typeof|case|in|of|delete|void|throw|yield|await)\s*$/.test(src.slice(Math.max(0, i - 12), i)))) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false;
        else if (src[j] === '/' && !cls) break;
        j++;
      }
      if (j < n && src[j] === '/') { blank(i + 1, j); i = j + 1; last = ')'; continue; }
    }
    if (tpl.length) {
      if (c === '{') tpl[tpl.length - 1]++;
      else if (c === '}' && --tpl[tpl.length - 1] === 0) { tpl.pop(); i = scanTpl(i + 1); continue; }
    }
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return out.join('');
}

/** Index just after the `}` matching the `{` at open, or -1. Operates on masked text. */
function matchBrace(m, open) {
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    if (m[i] === '{') depth++;
    else if (m[i] === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

function exprEnd(m, k) {
  let depth = 0;
  for (let i = k; i < m.length; i++) {
    const c = m[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (--depth < 0) return i; }
    else if (depth === 0 && c === ';') return i + 1;
    else if (depth === 0 && c === '\n') {
      let j = i + 1;
      while (j < m.length && /\s/.test(m[j])) j++;
      if (!'.?:+-*/&|,'.includes(m[j] ?? '')) return i;
    }
  }
  return m.length;
}

/** From `from`, find the function body: returns end index (exclusive) or -1. */
function findBodyEnd(m, from) {
  let depth = 0;
  for (let i = from; i < m.length; i++) {
    const c = m[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') { if (--depth < 0) return -1; }
    else if (depth === 0) {
      if (c === ';') return -1;
      if (c === '=' && m[i + 1] === '>') {
        let k = i + 2;
        while (k < m.length && /\s/.test(m[k])) k++;
        if (m[k] !== '{') return exprEnd(m, k);
        i = k - 1;
      } else if (c === '{') return matchBrace(m, i);
    }
  }
  return -1;
}

const lineStart = (s, idx) => s.lastIndexOf('\n', idx - 1) + 1;

function extractJs(src, symbol) {
  const m = maskJs(src);
  const slice = (start, end) => src.slice(lineStart(src, start), end);
  if (symbol.startsWith('regex:')) {
    const re = new RegExp(symbol.slice(6), 'm');
    const hit = re.exec(src);
    if (!hit) return null;
    const end = findBodyEnd(m, hit.index + hit[0].length);
    return end < 0 ? null : slice(hit.index, end);
  }
  const cm = /^class\s+([\w$]+)\.([\w$#]+)$/.exec(symbol);
  if (cm) {
    const [, cls, meth] = cm;
    const reCls = new RegExp(`(?<![\\w$.])class\\s+${esc(cls)}(?![\\w$])`, 'g');
    for (let c; (c = reCls.exec(m));) {
      const open = m.indexOf('{', c.index);
      if (open < 0) continue;
      const clsEnd = matchBrace(m, open);
      if (clsEnd < 0) continue;
      const reM = new RegExp(
        `^[ \\t]*(?:(?:public|private|protected|static|async|readonly|override|abstract|get|set|declare)\\s+)*\\*?\\s*${esc(meth)}\\s*[<(=:]`, 'gm');
      reM.lastIndex = open + 1;
      let depth = 1, pos = open + 1;
      for (let h; (h = reM.exec(m)) && h.index < clsEnd;) {
        for (; pos < h.index; pos++) { if (m[pos] === '{') depth++; else if (m[pos] === '}') depth--; }
        if (depth !== 1) continue;
        const from = /[<(]/.test(h[0].slice(-1)) ? h.index + h[0].length - 1 : h.index + h[0].length;
        const end = findBodyEnd(m, from);
        if (end > 0 && end <= clsEnd) return slice(h.index + (h[0].length - h[0].trimStart().length), end);
      }
    }
    return null;
  }
  const n = esc(symbol);
  const pats = [
    [`(?<![\\w$.])(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s*\\*?\\s*${n}\\s*[<(]`, -1],
    [`(?<![\\w$.])(?:export\\s+)?(?:const|let|var)\\s+${n}(?![\\w$])\\s*(?::[^=\\n]+)?=`, 0],
  ];
  for (const [p, adj] of pats) {
    const re = new RegExp(p, 'gm');
    for (let h; (h = re.exec(m));) {
      const end = findBodyEnd(m, h.index + h[0].length + adj);
      if (end > 0) return slice(h.index, end);
    }
  }
  return null;
}

const indentOf = (l) => /^[ \t]*/.exec(l)[0].length;

function pyBlock(lines, i) {
  const base = indentOf(lines[i]);
  let j = i, depth = 0;
  for (; j < lines.length; j++) {
    const code = lines[j].replace(/#.*$/, '');
    for (const c of code) { if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--; }
    if (depth <= 0 && /:\s*$/.test(code)) break;
    if (depth <= 0 && j === i && !/:\s*$/.test(code)) return lines.slice(i, i + 1); // one-liner/regex line
  }
  let last = j;
  for (let k = j + 1; k < lines.length; k++) {
    if (lines[k].trim() === '') continue;
    if (indentOf(lines[k]) > base) last = k; else break;
  }
  return lines.slice(i, last + 1);
}

function extractPy(src, symbol) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const find = (re, from, to) => { for (let i = from; i < to; i++) if (re.test(lines[i])) return i; return -1; };
  if (symbol.startsWith('regex:')) {
    const i = find(new RegExp(symbol.slice(6)), 0, lines.length);
    return i < 0 ? null : pyBlock(lines, i).join('\n');
  }
  const cm = /^class\s+([\w$]+)\.([\w$]+)$/.exec(symbol);
  if (cm) {
    const ci = find(new RegExp(`^\\s*class\\s+${esc(cm[1])}\\b`), 0, lines.length);
    if (ci < 0) return null;
    const blk = pyBlock(lines, ci);
    const di = find(new RegExp(`^\\s*(?:async\\s+)?def\\s+${esc(cm[2])}\\s*\\(`), ci + 1, ci + blk.length);
    return di < 0 ? null : pyBlock(lines, di).join('\n');
  }
  const di = find(new RegExp(`^\\s*(?:async\\s+)?def\\s+${esc(symbol)}\\s*\\(`), 0, lines.length);
  return di < 0 ? null : pyBlock(lines, di).join('\n');
}

/** Extract the covered text for a symbol, or null when not found. */
export function extractSymbol(source, symbol, file = 'x.js') {
  return /\.pyi?$/.test(file) ? extractPy(source, symbol) : extractJs(source, symbol);
}

/** Pick the values at dot paths out of a JSON text; null when a path is absent. */
export function pickJson(text, keys) {
  const obj = JSON.parse(text);
  const picked = {};
  for (const k of keys) {
    let cur = obj;
    for (const part of k.split('.')) cur = cur != null && typeof cur === 'object' ? cur[part] : undefined;
    if (cur === undefined) return null;
    picked[k] = cur;
  }
  return JSON.stringify(picked, null, 1);
}

/** What the manifest line shows after the file name. */
export const entryLabel = (e) => e.symbol ?? (e.keys ? `keys:${e.keys.join(',')}` : '(whole file)');

function computeEntry(root, entry) {
  const p = isAbsolute(entry.file) ? entry.file : resolve(root, entry.file);
  if (!existsSync(p)) return { status: 'MISSING', reason: 'file not found' };
  const src = readFileSync(p, 'utf8');
  if (entry.symbol == null) {
    if (!entry.keys) return { status: 'OK', hash: sha256(src) };
    if (!Array.isArray(entry.keys) || entry.keys.length === 0) return { status: 'MISSING', reason: '"keys" must be a non-empty array' };
    let picked;
    try { picked = pickJson(src, entry.keys); } catch (e) { return { status: 'MISSING', reason: `not JSON: ${e.message}` }; }
    if (picked == null) return { status: 'MISSING', reason: 'key not found' };
    return { status: 'OK', hash: sha256(picked) };
  }
  const text = extractSymbol(src, entry.symbol, entry.file);
  if (text == null) return { status: 'MISSING', reason: 'symbol not found' };
  return { status: 'OK', hash: sha256(text) };
}

function gitHead(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch { return null; }
}

export function run(argv, out = (s) => process.stdout.write(s + '\n'), err = (s) => process.stderr.write(s + '\n')) {
  const args = { _: [], manifest: 'formal/coverage.json', root: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') args.manifest = argv[++i];
    else if (a === '--root') args.root = resolve(argv[++i]);
    else if (a === '--json') args.json = true;
    else if (a === '-h' || a === '--help') args._.push('help');
    else args._.push(a);
  }
  const cmd = args._[0];
  if (cmd !== 'update' && cmd !== 'check') {
    err('usage: drift-guard.mjs <update|check> [--manifest formal/coverage.json] [--root dir] [--json]');
    return cmd === 'help' ? 0 : 2;
  }
  const mpath = isAbsolute(args.manifest) ? args.manifest : resolve(args.root, args.manifest);
  let manifest;
  try { manifest = JSON.parse(readFileSync(mpath, 'utf8')); } catch (e) { err(`cannot read manifest ${mpath}: ${e.message}`); return 2; }
  if (!Array.isArray(manifest.covered)) { err('manifest has no "covered" array'); return 2; }

  const results = manifest.covered.map((e) => ({ file: e.file, symbol: e.symbol, keys: e.keys, label: entryLabel(e), expected: e.hash ?? null, ...computeEntry(args.root, e) }));
  const missing = results.filter((r) => r.status === 'MISSING');

  if (cmd === 'update') {
    if (missing.length === 0) {
      manifest.covered.forEach((e, i) => { e.hash = results[i].hash; });
      const head = gitHead(args.root);
      if (head) manifest.syncCommit = head;
      writeFileSync(mpath, JSON.stringify(manifest, null, 2) + '\n');
    }
    if (args.json) out(JSON.stringify({ ok: missing.length === 0, command: 'update', syncCommit: manifest.syncCommit ?? null, results }, null, 2));
    else {
      for (const r of results) out(`${r.status === 'OK' ? 'OK' : 'MISSING'} ${r.file} ${r.label}`);
      if (missing.length) err('update aborted: fix MISSING entries (renamed/moved symbol, dropped key?) in the manifest first; nothing was written.');
      else out(`updated ${results.length} hash(es) in ${mpath}`);
    }
    return missing.length ? 1 : 0;
  }

  for (const r of results) {
    if (r.status === 'OK' && r.hash !== r.expected) {
      r.status = 'DRIFT';
      r.reason = r.expected ? 'hash changed' : 'no baseline hash (run update)';
    }
  }
  const bad = results.filter((r) => r.status !== 'OK');
  if (args.json) out(JSON.stringify({ ok: bad.length === 0, command: 'check', syncCommit: manifest.syncCommit ?? null, results }, null, 2));
  else {
    for (const r of results) out(`${r.status} ${r.file} ${r.label}`);
    if (bad.length) {
      err(`\n${bad.length} covered entr${bad.length === 1 ? 'y' : 'ies'} drifted from the formal model (last synced at ${manifest.syncCommit ?? 'unknown'}).`);
      err('Code that the verification covers changed. Run the Maintain mode of the verification skill to re-check/update the model');
      err(`(${(manifest.model ?? []).join(', ') || 'model files'}), then run: node scripts/drift-guard.mjs update`);
    }
  }
  return bad.length ? 1 : 0;
}

// Compare real paths: run through a symlink (macOS /tmp, a linked checkout) argv[1] and import.meta.url differ, and the
// script would do nothing and exit 0, which a gate reads as a pass. A check must fail loudly when it did not run.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = run(process.argv.slice(2));
}
