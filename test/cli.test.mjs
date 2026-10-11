import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, basename, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../bin/locktrail.mjs', import.meta.url));
const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const before = readFileSync(join(examples, 'before.package-lock.json'), 'utf8');
const after = readFileSync(join(examples, 'after.package-lock.json'), 'utf8');

function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'locktrail-test-'));
  t.after(() => {
    const target = resolve(dir);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('locktrail-test-'));
    rmSync(target, { recursive: true, force: true });
  });
  return dir;
}

function run(args, cwd) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd, windowsHide: true });
  assert.ifError(result.error);
  return result;
}

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('demo analyzes real fixtures and produces parseable JSON with explicit synthetic labels', () => {
  const result = run(['demo', '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.added, 1);
  assert.equal(report.summary.removed, 1);
  assert.equal(report.summary.changed, 2);
  assert.ok(report.changes.some(c => c.findings.some(f => f.code === 'install-script-added')));
  assert.equal(report.meta.beforeLabel, 'Demo / before');
});

test('review gating is opt-in and invalid input never returns a clean exit', () => {
  assert.equal(run(['demo', '--fail-on', 'review']).status, 1);
  for (const args of [ ['--format', 'yaml'], ['demo', '--fail-on', 'all'], ['diff'], ['--wat'], ['demo', '--base', 'HEAD'], ['--head', 'HEAD'] ]) {
    const result = run(args);
    assert.equal(result.status, 2, args.join(' '));
    assert.match(result.stderr, /locktrail:/);
  }
});

test('file inputs allow spaces and Unicode; identical files have no findings', t => {
  const dir = temp(t);
  const path = join(dir, 'ჩემი lock.json');
  writeFileSync(path, before);
  const report = run(['diff', path, path, '--format', 'json', '--fail-on', 'review']);
  assert.equal(report.status, 0, report.stderr);
  assert.deepEqual(JSON.parse(report.stdout).changes, []);
});

test('malformed JSON and unsupported lock versions fail', t => {
  const dir = temp(t);
  const path = join(dir, 'bad.json');
  writeFileSync(path, '{not json');
  let result = run(['diff', path, path]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid JSON/);
  writeFileSync(path, JSON.stringify({ lockfileVersion: 1, dependencies: {} }));
  result = run(['diff', path, path]);
  assert.equal(result.status, 2);
});

test('output refuses overwrite and leaves existing content intact', t => {
  const dir = temp(t);
  const output = join(dir, 'report.html');
  const first = run(['demo', '--format', 'html', '--output', output]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, '');
  const contents = readFileSync(output, 'utf8');
  assert.match(contents, /<!doctype html>/i);
  assert.equal(run(['demo', '--output', output]).status, 2);
  assert.equal(readFileSync(output, 'utf8'), contents);
});

test('file reports redact credentials and URL query/fragment from JSON', t => {
  const dir = temp(t);
  const old = JSON.parse(before), current = JSON.parse(after);
  current.packages['node_modules/@northstar/codec'].resolved = 'https://user:supersecret@mirror.example.org/pkg.tgz?token=supersecret#supersecret';
  current.packages['node_modules/@northstar/export'].dependencies['@northstar/codec'] = 'git+https://user:supersecret@mirror.example.org/repo?token=supersecret#supersecret';
  writeFileSync(join(dir, 'old.json'), JSON.stringify(old));
  writeFileSync(join(dir, 'new.json'), JSON.stringify(current));
  const result = run(['diff', 'old.json', 'new.json', '--format', 'json'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /supersecret/);
  assert.match(result.stdout, /REDACTED/);
});

test('errors sanitize terminal escapes and credentials in accidental URL arguments', () => {
  const result = run(['https://user:dummy-secret@registry.example/pkg?token=dummy-token']);
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stderr, /dummy-secret|dummy-token/);
  assert.match(result.stderr, /REDACTED/);
  const control = run(['\x1b[31munknown\x1b[0m']);
  assert.doesNotMatch(control.stderr, /\x1b/);
});

test('Git mode compares working files and commits without modifying the repository', t => {
  const dir = temp(t);
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.name', 'Locktrail tests');
  git(dir, 'config', 'user.email', 'tests@example.invalid');
  writeFileSync(join(dir, 'package-lock.json'), before);
  git(dir, 'add', 'package-lock.json');
  git(dir, 'commit', '-m', 'base');
  const baseSha = git(dir, 'rev-parse', 'HEAD');
  writeFileSync(join(dir, 'package-lock.json'), after);
  const status = git(dir, 'status', '--porcelain');
  let result = run(['--base', 'HEAD', '--repo', dir, '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).summary.added, 1);
  assert.equal(git(dir, 'status', '--porcelain'), status);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), baseSha);
  git(dir, 'switch', '-c', 'feature');
  git(dir, 'add', 'package-lock.json');
  git(dir, 'commit', '-m', 'update');
  const headSha = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'switch', 'main');
  writeFileSync(join(dir, 'other.txt'), 'diverged');
  git(dir, 'add', 'other.txt');
  git(dir, 'commit', '-m', 'main diverges');
  result = run(['--base', 'main', '--head', 'feature', '--merge-base', '--repo', dir, '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.match(report.meta.beforeLabel, new RegExp(baseSha.slice(0, 8)));
  assert.match(report.meta.afterLabel, new RegExp(headSha.slice(0, 8)));
  assert.equal(report.summary.added, 1);
  assert.equal(git(dir, 'status', '--porcelain'), '');
  assert.equal(git(dir, 'branch', '--show-current'), 'main');
  assert.equal(existsSync(join(dir, 'node_modules')), false);
  assert.equal(run(['--base', '--oops', '--repo', dir]).status, 2);
  assert.equal(run(['--base', 'main', '--lockfile', '../package-lock.json', '--repo', dir]).status, 2);
  assert.equal(run(['--base', 'does-not-exist', '--repo', dir]).status, 2);
});

test('help and version work without Git or a project directory', t => {
  const dir = temp(t);
  assert.match(run(['--help'], dir).stdout, /Usage:/);
  assert.equal(run(['--version'], dir).stdout.trim(), '0.1.0');
});

test('oversized file and Git blob inputs fail instead of creating misleading reports', t => {
  const dir = temp(t);
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.name', 'Locktrail tests');
  git(dir, 'config', 'user.email', 'tests@example.invalid');
  const path = join(dir, 'package-lock.json');
  writeFileSync(path, before + ' '.repeat(21 * 1024 * 1024));
  assert.equal(run(['diff', path, path]).status, 2);
  git(dir, 'add', 'package-lock.json');
  git(dir, 'commit', '-m', 'oversized lockfile');
  assert.equal(run(['--repo', dir, '--base', 'HEAD', '--head', 'HEAD']).status, 2);
});

test('working tree symlinks cannot redirect a repository path outside the checkout', t => {
  const dir = temp(t);
  const repo = join(dir, 'repo'), outside = join(dir, 'outside');
  mkdirSync(repo); mkdirSync(outside);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Locktrail tests');
  git(repo, 'config', 'user.email', 'tests@example.invalid');
  mkdirSync(join(repo, 'app'));
  writeFileSync(join(repo, 'app', 'package-lock.json'), before);
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'base');
  // Remove only this test-owned child, after proving containment in our temp repo.
  const target = resolve(repo, 'app');
  assert.equal(dirname(target), resolve(repo));
  rmSync(target, { recursive: true });
  writeFileSync(join(outside, 'package-lock.json'), after);
  try { symlinkSync(outside, target, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('Symlink privilege unavailable'); return; } throw error; }
  const result = run(['--repo', repo, '--base', 'HEAD', '--lockfile', 'app/package-lock.json']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /outside the repository/);
});
