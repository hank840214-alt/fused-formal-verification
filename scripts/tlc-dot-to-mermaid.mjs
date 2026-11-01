#!/usr/bin/env node
// tlc-dot-to-mermaid.mjs - fallback statechart generator (use when pstack's `statechart`
// script is not installed). Dependency-free, Node >= 20.
//
//   tlc -dump dot,actionlabels,colorize states.dot Spec.tla
//   node tlc-dot-to-mermaid.mjs states.dot [--view view.mjs] [--breaks bad.json]
//        [--max-arrows 40] [--out chart.mmd]
//
// view.mjs (all optional except state):
//   export const title = 'Lobby';
//   export function state(vars) { return `${vars.phase} (${vars.players.length}p)`; }
//   export function step(action, from, to) { return action === 'Tick' ? null : action; }
//     - `vars` / `from` / `to` are the parsed TLA+ variable objects of the model states.
//       A 4th arg { fromLabel, toLabel } carries the chart labels. Return a string to label
//       the arrow, null to hide it, undefined to use the action name.
// Without a view the label is the raw conjunction ("x = 1, y = "a"") cut to 60 chars.
//
// Model states with the same label collapse into one chart state; arrows with the same
// (from, to, label) collapse into one. --breaks takes a JSON array of model state ids that
// violate an invariant; a chart state containing any of them gets `classDef breaks`.
// States TLC marks `style = filled` (initial states) get a `[*] -->` arrow.
//
// BEST EFFORT: the parser is written against the documented TLC dot format
// (`id [label="/\\ x = 1\n/\\ y = \"a\"",style = filled]` and `a -> b [label="Act",...]`),
// one statement per line. Real TLC output varies between versions (attribute order, trailing
// semicolons, long values); values that cannot be parsed stay raw strings.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const unescapeDot = (s) => s.replace(/\\(["\\n])/g, (_, c) => (c === 'n' ? '\n' : c));

function parseAttrs(text) {
  const attrs = {};
  const re = /([A-Za-z_]\w*)\s*=\s*("(?:[^"\\]|\\.)*"|[^,\]\s;]+)/g;
  for (let m; (m = re.exec(text));) {
    let v = m[2];
    if (v.startsWith('"')) v = unescapeDot(v.slice(1, -1));
    attrs[m[1]] = v;
  }
  return attrs;
}

/** Parse a TLC dot file into { nodes: [{id,label,initial}], edges: [{from,to,label}] }. */
export function parseDot(text) {
  const nodes = new Map();
  const edges = [];
  const getNode = (id) => { if (!nodes.has(id)) nodes.set(id, { id, label: '', initial: false }); return nodes.get(id); };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    let m = /^\s*(-?\d+)\s*->\s*(-?\d+)\s*(?:\[(.*)\])?\s*;?\s*$/.exec(line);
    if (m) {
      const a = parseAttrs(m[3] ?? '');
      getNode(m[1]); getNode(m[2]);
      edges.push({ from: m[1], to: m[2], label: a.label ?? '' });
      continue;
    }
    m = /^\s*(-?\d+)\s*\[(.*)\]\s*;?\s*$/.exec(line);
    if (m) {
      const a = parseAttrs(m[2]);
      const n = getNode(m[1]);
      n.label = a.label ?? n.label;
      n.initial = n.initial || a.style === 'filled' || /\bfilled\b/.test(a.style ?? '');
    }
  }
  return { nodes: [...nodes.values()], edges };
}

function splitTop(s, sep = ',') {
  const parts = [];
  let depth = 0, inStr = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { cur += c; if (c === '\\') cur += s[++i] ?? ''; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; cur += c; continue; }
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) depth--;
    else if (c === '<' && s[i + 1] === '<') { depth++; cur += '<<'; i++; continue; }
    else if (c === '>' && s[i + 1] === '>') { depth--; cur += '>>'; i++; continue; }
    if (depth === 0 && c === sep) { parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '' || parts.length) parts.push(cur.trim());
  return parts;
}

/** Parse a TLA+ value: ints, strings, booleans, sets, records, sequences; else raw string. */
export function parseValue(text) {
  const s = text.trim();
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s === 'TRUE') return true;
  if (s === 'FALSE') return false;
  if (/^"(?:[^"\\]|\\.)*"$/.test(s)) return s.slice(1, -1).replace(/\\(.)/g, '$1');
  if (s.startsWith('{') && s.endsWith('}')) return splitTop(s.slice(1, -1)).filter((x) => x !== '').map(parseValue);
  if (s.startsWith('<<') && s.endsWith('>>')) return splitTop(s.slice(2, -2)).filter((x) => x !== '').map(parseValue);
  if (s.startsWith('[') && s.endsWith(']') && s.includes('|->')) {
    const obj = {};
    for (const part of splitTop(s.slice(1, -1))) {
      const i = part.indexOf('|->');
      if (i < 0) return s;
      obj[part.slice(0, i).trim()] = parseValue(part.slice(i + 3));
    }
    return obj;
  }
  return s;
}

/** Parse "/\ x = 1\n/\ y = \"a\"" into { x: 1, y: 'a' }. */
export function parseState(label) {
  const vars = {};
  const chunks = label.replace(/\r\n?/g, '\n').split(/\n?\/\\\s?/).map((c) => c.replace(/\n/g, ' ').trim()).filter(Boolean);
  for (const c of chunks) {
    const m = /^([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(c);
    if (m) vars[m[1]] = parseValue(m[2]);
  }
  return vars;
}

const rawShort = (label, max = 60) => {
  const t = label.split('\n').map((l) => l.replace(/^\/\\\s*/, '').trim()).filter(Boolean).join(', ');
  return t.length > max ? t.slice(0, max - 1) + '\u2026' : t;
};

/** Build the Mermaid text. Returns { text, arrows, warnings }. */
export function buildChart(dot, { view = {}, breaks = [], maxArrows = 40 } = {}) {
  const breakSet = new Set(breaks.map(String));
  const byLabel = new Map(); // chart label -> info
  const stateInfo = []; // { sid, label, initial, breaks }
  const modelToChart = new Map();
  const varsOf = new Map();
  for (const n of dot.nodes) {
    const vars = parseState(n.label);
    varsOf.set(n.id, vars);
    let label = typeof view.state === 'function' ? String(view.state(vars)) : rawShort(n.label);
    if (label === '') label = `state ${n.id}`;
    let info = byLabel.get(label);
    if (!info) {
      info = { sid: `s${stateInfo.length}`, label, initial: false, breaks: false };
      byLabel.set(label, info);
      stateInfo.push(info);
    }
    info.initial ||= n.initial;
    info.breaks ||= breakSet.has(n.id);
    modelToChart.set(n.id, info);
  }
  const arrowSeen = new Set();
  const arrows = [];
  for (const e of dot.edges) {
    const f = modelToChart.get(e.from), t = modelToChart.get(e.to);
    let lab = e.label;
    if (typeof view.step === 'function') {
      const r = view.step(e.label, varsOf.get(e.from), varsOf.get(e.to), { fromLabel: f.label, toLabel: t.label });
      if (r === null) continue;
      if (r !== undefined) lab = String(r);
    }
    const key = `${f.sid}\u0000${t.sid}\u0000${lab}`;
    if (arrowSeen.has(key)) continue;
    arrowSeen.add(key);
    arrows.push({ from: f.sid, to: t.sid, label: lab });
  }
  const warnings = [];
  if (arrows.length > maxArrows) warnings.push(`warning: ${arrows.length} arrows exceed --max-arrows ${maxArrows}; the chart will be hard to read. Tighten the view (merge states / hide steps).`);

  const q = (s) => s.replace(/"/g, '#quot;').replace(/\n/g, ' ');
  const lines = [];
  if (view.title) lines.push('---', `title: ${String(view.title).replace(/\n/g, ' ')}`, '---');
  lines.push('stateDiagram-v2');
  for (const s of stateInfo) lines.push(`  state "${q(s.label)}" as ${s.sid}`);
  for (const s of stateInfo) if (s.initial) lines.push(`  [*] --> ${s.sid}`);
  for (const a of arrows) lines.push(`  ${a.from} --> ${a.to}${a.label ? ` : ${q(a.label).replace(/:/g, '#58;')}` : ''}`);
  const bad = stateInfo.filter((s) => s.breaks).map((s) => s.sid);
  if (bad.length) {
    lines.push('  classDef breaks fill:#fdd,stroke:#c00,stroke-width:2px,color:#600');
    lines.push(`  class ${bad.join(',')} breaks`);
  }
  return { text: lines.join('\n') + '\n', arrows: arrows.length, warnings };
}

export async function main(argv) {
  const o = { input: null, view: null, breaks: null, maxArrows: 40, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--view') o.view = argv[++i];
    else if (a === '--breaks') o.breaks = argv[++i];
    else if (a === '--max-arrows') o.maxArrows = Number(argv[++i]);
    else if (a === '--out') o.out = argv[++i];
    else if (a.startsWith('--')) { process.stderr.write(`unknown option ${a}\n`); return 2; }
    else o.input = a;
  }
  if (!o.input || !Number.isFinite(o.maxArrows)) {
    process.stderr.write('usage: tlc-dot-to-mermaid.mjs states.dot [--view view.mjs] [--breaks bad.json] [--max-arrows 40] [--out chart.mmd]\n');
    return 2;
  }
  const view = o.view ? await import(pathToFileURL(resolve(o.view)).href) : {};
  const breaks = o.breaks ? JSON.parse(readFileSync(o.breaks, 'utf8')) : [];
  const dot = parseDot(readFileSync(o.input, 'utf8'));
  if (dot.nodes.length === 0) { process.stderr.write('no states parsed: is this a TLC `-dump dot` file?\n'); return 1; }
  const { text, warnings } = buildChart(dot, { view, breaks, maxArrows: o.maxArrows });
  for (const w of warnings) process.stderr.write(w + '\n');
  if (o.out) writeFileSync(o.out, text); else process.stdout.write(text);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
