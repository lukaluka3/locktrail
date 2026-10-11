import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { renderHtml, renderMarkdown, renderText } from '../src/report.mjs';

function fixture() {
  return {
    schemaVersion: 1,
    summary: { added: 1, removed: 1, changed: 1, unchanged: 0, findings: 2 },
    meta: { beforeLabel: 'main/package-lock.json', afterLabel: 'pr/package-lock.json' },
    warnings: [],
    changes: [
      { id: 'node_modules/alpha', name: 'alpha', kind: 'added', before: null, after: { version: '1.0.0', hasInstallScript: true }, fields: ['hasInstallScript'], paths: [[{ name: 'app', version: '1.0.0', path: '' }, { name: 'alpha', version: '1.0.0', path: 'node_modules/alpha' }]], findings: [{ code: 'INSTALL_SCRIPT', severity: 'review', message: 'An install script was introduced.' }] },
      { id: 'node_modules/beta', name: 'beta', kind: 'changed', before: { version: '1.0.0' }, after: { version: '2.0.0' }, fields: ['version', 'resolved', 'integrity'], paths: [], pathsTruncated: true, findings: [{ code: 'MAJOR_VERSION', severity: 'info', message: 'Major version changed.' }] },
      { id: 'node_modules/old', name: 'old', kind: 'removed', before: { version: '0.5.0' }, after: null, fields: [], paths: [], findings: [] },
    ],
  };
}

test('all formats report real counts, versions, signals, and dependency paths', () => {
  const report = fixture();
  for (const renderer of [renderHtml, renderMarkdown, renderText]) {
    const output = renderer(report);
    assert.match(output, /alpha/);
    assert.match(output, /app/);
    assert.match(output, /Major version changed/);
    assert.match(output, /Dependency paths are limited; additional routes may be omitted/);
    assert.match(output, /Review signals, not a vulnerability scan\./);
  }
  assert.match(renderText(report), /1 package needs review · 1 review signal/);
  assert.match(renderText(report), /1\.0\.0 → 2\.0\.0/);
  assert.match(renderMarkdown(report), /\| 1 \| 1 \| 1 \| 1 \|/);
  assert.match(renderHtml(report), /data-review="true"/);
});

test('empty and missing optional data produce usable reports', () => {
  for (const renderer of [renderHtml, renderMarkdown, renderText]) {
    const output = renderer({ schemaVersion: 1, changes: [], warnings: [] });
    assert.match(output, /No dependency changes found\./);
    assert.doesNotMatch(output, /undefined|NaN/);
    assert.match(renderer(), /No dependency changes found\./);
  }
});

test('route labels identify their lockfile and changed packages show different before trails', () => {
  const report = fixture();
  report.changes[1].pathSource = 'after';
  report.changes[1].paths = [[{ name: 'new-parent', version: '2.0.0', path: 'node_modules/new-parent' }, { name: 'beta', version: '2.0.0', path: 'node_modules/beta' }]];
  report.changes[1].beforePaths = [[{ name: 'old-parent', version: '1.0.0', path: 'node_modules/old-parent' }, { name: 'beta', version: '1.0.0', path: 'node_modules/beta' }]];
  report.changes[1].beforePathsTruncated = true;
  report.changes[2].pathSource = 'before';
  for (const renderer of [renderHtml, renderMarkdown, renderText]) {
    const output = renderer(report);
    assert.match(output, /Before dependency paths/);
    assert.match(output, /After dependency paths/);
    assert.match(output, /old.*parent/);
    assert.match(output, /new.*parent/);
  }
  const output = renderHtml(report);
  assert.match(output, /<details class="chains" open>/);
  assert.match(output, /1 \(limited\)/);
  assert.doesNotMatch(output, /More dependency paths exist|1\+/);
  const removed = output.match(/<article[^>]+data-kind="removed"[\s\S]*?<\/article>/)[0];
  assert.match(removed, /Before dependency paths/);
  assert.doesNotMatch(removed, /After dependency paths/);
});

test('unchanged trails are not duplicated but location-only route changes are visible', () => {
  const report = fixture();
  const change = report.changes[1];
  change.paths = [[{ name: 'beta', version: '2.0.0', path: 'node_modules/beta' }]];
  change.beforePaths = structuredClone(change.paths);
  let output = renderHtml({ changes: [change] });
  assert.equal((output.match(/<details class="chains"/g) ?? []).length, 1);
  assert.doesNotMatch(output, /Before dependency paths/);
  change.beforePaths[0][0].path = 'node_modules/parent/node_modules/beta';
  output = renderHtml({ changes: [change] });
  assert.equal((output.match(/<details class="chains"/g) ?? []).length, 2);
  assert.match(output, /Before dependency paths/);
});

test('HTML escapes hostile package metadata in text and attributes', () => {
  const report = fixture();
  const payload = '</script><img src=x onerror="alert(1)"><script>alert(2)</script>';
  report.changes[0].name = payload;
  report.changes[0].id = '" onmouseover="alert(3)';
  report.changes[0].fields.push(payload);
  report.changes[0].paths[0][0] = { name: payload, version: payload, path: payload };
  report.changes[0].findings[0].message = payload;
  report.changes[1].beforePaths = [[{ name: payload, version: payload, path: payload }]];
  report.meta.beforeLabel = payload;
  report.warnings.push(payload);
  const output = renderHtml(report);
  assert.doesNotMatch(output, /<img\s/);
  assert.equal(output.match(/<script>/g).length, 1);
  assert.equal(output.match(/<\/script>/g).length, 1);
  assert.match(output, /&lt;\/script&gt;&lt;img/);
  assert.doesNotMatch(output, /id="" onmouseover=/);
  assert.match(output, /&quot; onmouseover=&quot;/);
});

test('raw package URLs and credentials never appear in report formats', () => {
  const report = fixture();
  report.changes[1].before.resolved = 'https://alice:topsecret@registry.test/pkg.tgz?token=secrettoken#secretfragment';
  report.changes[1].after.resolved = 'https://registry.test/pkg.tgz?token=newsecret';
  report.changes[1].before.integrity = 'secret-integrity-placeholder';
  for (const renderer of [renderHtml, renderMarkdown, renderText]) {
    const output = renderer(report);
    assert.doesNotMatch(output, /topsecret|secrettoken|secretfragment|newsecret|secret-integrity-placeholder/);
    assert.match(output, /Package source/);
  }
});

test('Markdown escapes injected formatting, HTML, pipes, and backticks', () => {
  const report = fixture();
  const hostile = 'bad|`name`<img src=x>\n# heading [click](javascript:alert(1))';
  report.changes[0].name = hostile;
  report.meta.beforeLabel = hostile;
  report.warnings.push(hostile);
  const output = renderMarkdown(report);
  assert.doesNotMatch(output, /<img/);
  assert.doesNotMatch(output, /\n# heading/);
  assert.ok(output.includes('bad\\|\\`name\\`&lt;img src=x&gt;'));
  assert.ok(output.includes('\\[click\\]\\(javascript:alert\\(1\\)\\)'));
});

test('terminal control sequences and forged lines are stripped in every format', () => {
  const report = fixture();
  report.changes[0].name = '\u001b[31mred\u001b[0m\u001b]8;;https://bad.test\u0007link\u001b]8;;\u0007\nFAKE\r\u0000\u202espoof';
  for (const renderer of [renderHtml, renderMarkdown, renderText]) {
    const output = renderer(report);
    assert.doesNotMatch(output, /\u001b|\u0000|\u202e|\u0007/);
    assert.doesNotMatch(output, /https:\/\/bad\.test/);
    assert.doesNotMatch(output, /\nFAKE/);
    assert.match(output, /redlink FAKE/);
  }
});

test('HTML CSP authorizes only its constant script and forbids external requests', () => {
  const output = renderHtml(fixture());
  const script = output.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash('sha256').update(script).digest('base64');
  assert.ok(output.includes(`script-src &#39;sha256-${hash}&#39;`));
  assert.ok(output.includes('connect-src &#39;none&#39;'));
  assert.ok(output.includes('default-src &#39;none&#39;'));
  assert.doesNotMatch(script, /innerHTML|eval\(|fetch\(/);
  assert.doesNotMatch(output, /<script[^>]+src=|<link[^>]+href=|<img\s/);
  const changed = fixture();
  changed.changes[0].name = '</script><script>evil()</script>';
  assert.equal(renderHtml(changed).match(/<script>([\s\S]*?)<\/script>/)[1], script);
});

test('offline filters combine category and search, update counts and empty state', () => {
  const script = renderHtml(fixture()).match(/<script>([\s\S]*?)<\/script>/)[1];
  const cards = [
    { dataset: { kind: 'added', review: 'true', search: 'Alpha app install script' }, hidden: false },
    { dataset: { kind: 'changed', review: 'false', search: 'Beta major version' }, hidden: false },
    { dataset: { kind: 'removed', review: 'false', search: 'Old legacy' }, hidden: false },
  ];
  function element(dataset = {}) {
    return { dataset, listeners: {}, attributes: {}, value: '', addEventListener(event, listener) { this.listeners[event] = listener; }, setAttribute(key, value) { this.attributes[key] = value; } };
  }
  const filters = ['all', 'review', 'added', 'changed', 'removed'].map((filter) => element({ filter }));
  const search = element();
  const count = element();
  const empty = element();
  const document = {
    getElementById(id) { return { search, 'result-count': count, 'no-results': empty }[id]; },
    querySelectorAll(selector) { return selector === '[data-change]' ? cards : filters; },
  };
  runInNewContext(script, { document });
  assert.equal(count.textContent, '3 of 3 package changes');
  filters[1].listeners.click();
  assert.deepEqual(cards.map((card) => card.hidden), [false, true, true]);
  assert.equal(filters[1].attributes['aria-pressed'], 'true');
  search.value = ' BETA ';
  search.listeners.input();
  assert.equal(count.textContent, '0 of 3 package changes');
  assert.equal(empty.hidden, false);
  filters[0].listeners.click();
  assert.deepEqual(cards.map((card) => card.hidden), [true, false, true]);
  assert.equal(empty.hidden, true);
  search.value = '';
  search.listeners.input();
  filters[4].listeners.click();
  assert.deepEqual(cards.map((card) => card.hidden), [true, true, false]);
});

test('rendering is deterministic and does not mutate source data', () => {
  const report = fixture();
  const original = JSON.stringify(report);
  for (const renderer of [renderHtml, renderMarkdown, renderText]) {
    assert.equal(renderer(report), renderer(report));
    assert.equal(JSON.stringify(report), original);
  }
});
