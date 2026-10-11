import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep, isAbsolute, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs, stripVTControlCharacters } from 'node:util';
import { analyze } from './engine.mjs';
import { renderText, renderMarkdown, renderHtml } from './report.mjs';

const MAX_BYTES = 20 * 1024 * 1024;
const VERSION = '0.1.0';
const HELP = `Locktrail — understand dependency changes, follow the trail.

Usage:
  locktrail demo [options]
  locktrail diff BEFORE.json AFTER.json [options]
  locktrail --base REF [--head REF] [--merge-base] [options]

Inputs:
  --base REF           Compare a Git commit to the working lockfile
  --head REF           Compare two commits instead of the working file
  --merge-base         Use the common ancestor of base and head (or HEAD)
  --lockfile PATH      Repository-relative lockfile (default: package-lock.json)
  --repo PATH          Git repository directory (default: current directory)

Output:
  --format FORMAT      text, json, markdown, html (default: text)
  --output PATH        Write a new file; refuses to overwrite an existing file
  --fail-on LEVEL      none or review (default: none)
  -h, --help           Show this help
  -v, --version        Show version

Examples:
  locktrail demo
  locktrail demo --format html --output report.html
  locktrail --base origin/main --head HEAD --merge-base
  locktrail diff old-lock.json package-lock.json --format markdown

Supports npm package-lock.json v2/v3. No network or package execution.
Exit codes: 0 report produced, 1 review signal (--fail-on review), 2 input/error.
`;

function cleanError(message) {
  return stripVTControlCharacters(String(message))
    .replace(/(?:git\+)?[a-z][a-z0-9+.-]*:\/\/[^\s'"<>]+/gi, sanitizeUrl)
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, 1200);
}

function loadJson(file) {
  const info = statSync(file);
  if (!info.isFile()) throw new Error(`Not a regular file: ${file}`);
  if (info.size > MAX_BYTES) throw new Error(`Lockfile exceeds the 20 MiB limit: ${file}`);
  return parseJson(readFileSync(file, 'utf8'), file);
}

function parseJson(data, label) {
  if (Buffer.byteLength(data) > MAX_BYTES) throw new Error(`Lockfile exceeds the 20 MiB limit: ${label}`);
  try {
    return JSON.parse(data.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error(`Invalid JSON in ${label}`);
  }
}

function git(repo, args) {
  const result = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8', maxBuffer: MAX_BYTES + 1024, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '' },
  });
  if (result.error) throw new Error(`Git failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Git failed: ${cleanError(result.stderr || 'unknown Git error')}`);
  return result.stdout;
}

function commit(repo, ref) {
  if (!ref || ref.startsWith('-') || /[\u0000-\u001f\u007f]/.test(ref)) throw new Error('Invalid Git ref');
  return git(repo, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
}

function lockPath(input) {
  const normalized = input.replaceAll('\\', '/');
  if (isAbsolute(input) || /^[A-Za-z]:/.test(input) || normalized.startsWith('/') || normalized.split('/').includes('..') || normalized.includes(':') || /[\u0000-\u001f]/.test(input)) {
    throw new Error('--lockfile must be a relative path inside the repository');
  }
  const path = posix.normalize(normalized);
  if (path === '.' || path.startsWith('-')) throw new Error('Invalid lockfile path');
  return path;
}

function workingLockfile(repo, path) {
  const root = realpathSync(repo);
  const file = realpathSync(resolve(repo, path));
  const distance = relative(root, file);
  if (distance === '..' || distance.startsWith(`..${sep}`) || isAbsolute(distance)) {
    throw new Error('Working lockfile resolves outside the repository');
  }
  return loadJson(file);
}

function sanitizeUrl(input) {
  if (typeof input !== 'string') return input;
  try {
    const prefix = input.startsWith('git+') ? 'git+' : '';
    const url = new URL(prefix ? input.slice(4) : input);
    if (url.username || url.password) { url.username = 'REDACTED'; url.password = ''; }
    if (url.search) url.search = '?REDACTED';
    if (url.hash) url.hash = '#REDACTED';
    return prefix + url.toString();
  } catch {
    return input.replace(/\/\/[^/@\s]+@/g, '//REDACTED@').replace(/[?#].*$/, '?REDACTED');
  }
}

// Registry URLs sometimes carry credentials. Never write them into any CLI report.
function sanitizeReport(report) {
  for (const change of report.changes) {
    for (const side of ['before', 'after']) {
      if (change[side]?.resolved) change[side].resolved = sanitizeUrl(change[side].resolved);
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        const specs = change[side]?.[field];
        if (!specs) continue;
        for (const [name, spec] of Object.entries(specs)) {
          if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(spec)) specs[name] = sanitizeUrl(spec);
        }
      }
    }
  }
  return report;
}

export function run(args, io = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      format: { type: 'string', default: 'text' }, output: { type: 'string' },
      base: { type: 'string' }, head: { type: 'string' },
      'merge-base': { type: 'boolean', default: false },
      lockfile: { type: 'string', default: 'package-lock.json' }, repo: { type: 'string', default: '.' },
      'fail-on': { type: 'string', default: 'none' },
    } });
    if (values.help || args.length === 0) { io.stdout.write(HELP); return 0; }
    if (values.version) { io.stdout.write(`${VERSION}\n`); return 0; }
    if (!['text', 'json', 'markdown', 'html'].includes(values.format)) throw new Error('--format must be text, json, markdown, or html');
    if (!['none', 'review'].includes(values['fail-on'])) throw new Error('--fail-on must be none or review');
    let before, after, beforeLabel, afterLabel;
    const command = positionals[0];
    if (command === 'demo' || command === 'diff') {
      if (values.base || values.head || values['merge-base'] || values.lockfile !== 'package-lock.json' || values.repo !== '.') throw new Error('Git options cannot be combined with demo or file diff');
      if (command === 'demo') {
        if (positionals.length !== 1) throw new Error('demo takes no positional arguments');
        before = loadJson(fileURLToPath(new URL('../examples/before.package-lock.json', import.meta.url)));
        after = loadJson(fileURLToPath(new URL('../examples/after.package-lock.json', import.meta.url)));
        beforeLabel = 'Demo / before'; afterLabel = 'Demo / after';
      } else {
        if (positionals.length !== 3) throw new Error('Usage: locktrail diff BEFORE.json AFTER.json');
        before = loadJson(resolve(positionals[1])); after = loadJson(resolve(positionals[2]));
        beforeLabel = positionals[1]; afterLabel = positionals[2];
      }
    } else {
      if (positionals.length) throw new Error(`Unknown command: ${command}`);
      if (!values.base) throw new Error('Provide --base REF, diff BEFORE AFTER, or demo');
      const repo = git(resolve(values.repo), ['rev-parse', '--show-toplevel']).trim();
      const path = lockPath(values.lockfile);
      const head = values.head ? commit(repo, values.head) : null;
      let base = commit(repo, values.base);
      if (values['merge-base']) base = git(repo, ['merge-base', base, head || commit(repo, 'HEAD')]).trim();
      before = parseJson(git(repo, ['show', `${base}:${path}`]), `${base.slice(0, 8)}:${path}`);
      after = head ? parseJson(git(repo, ['show', `${head}:${path}`]), `${head.slice(0, 8)}:${path}`) : workingLockfile(repo, path);
      beforeLabel = `${base.slice(0, 8)}:${path}`;
      afterLabel = head ? `${head.slice(0, 8)}:${path}` : `working tree:${path}`;
    }
    const report = sanitizeReport(analyze(before, after));
    report.meta = { beforeLabel, afterLabel };
    const output = values.format === 'json' ? JSON.stringify(report, null, 2) :
      values.format === 'html' ? renderHtml(report) : values.format === 'markdown' ? renderMarkdown(report) : renderText(report);
    const text = output.endsWith('\n') ? output : `${output}\n`;
    if (values.output) {
      writeFileSync(resolve(values.output), text, { encoding: 'utf8', flag: 'wx' });
      io.stderr.write(`Wrote ${cleanError(values.output)}\n`);
    } else io.stdout.write(text);
    return values['fail-on'] === 'review' && report.changes.some(c => c.findings.some(f => f.severity === 'review')) ? 1 : 0;
  } catch (error) {
    io.stderr.write(`locktrail: ${cleanError(error.message)}\n`);
    return 2;
  }
}
