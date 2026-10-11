import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/engine.mjs';

const registry = (name, version, extra = {}) => ({
  version,
  resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`,
  integrity: `sha512-${name}-${version}`,
  ...extra,
});
const lock = (packages = {}, root = {}, lockfileVersion = 3) => ({
  name: 'app', lockfileVersion, packages: { '': { name: 'app', version: '1.0.0', ...root }, ...packages },
});
const changeAt = (result, path) => result.changes.find(change => change.id === path);
const pathIds = change => change.paths.map(path => path.map(step => step.path));
const codes = change => change.findings.map(finding => finding.code);

test('recognizes npm v2 and v3 and ignores root changes and map key order', () => {
  const before = lock({ 'node_modules/a': registry('a', '1.0.0', { dependencies: { b: '1', c: '1' } }) }, { dependencies: { a: '1' } }, 2);
  const after = lock({ 'node_modules/a': registry('a', '1.0.0', { dependencies: { c: '1', b: '1' } }) }, { dependencies: { a: '^1' } });
  const result = analyze(before, after);
  assert.deepEqual(result.summary, { added: 0, removed: 0, changed: 0, unchanged: 1, findings: 0 });
  assert.deepEqual(result.changes, []);
});

test('reports additions, removals, modifications, and stable package locations', () => {
  const before = lock({ 'node_modules/a': registry('a', '1.0.0'), 'node_modules/gone': registry('gone', '1.0.0') }, { dependencies: { a: '1', gone: '1' } });
  const after = lock({ 'node_modules/a': registry('a', '1.1.0'), 'node_modules/new': registry('new', '1.0.0') }, { dependencies: { a: '1', new: '1' } });
  const result = analyze(before, after);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.summary.added, 1);
  assert.equal(result.summary.removed, 1);
  assert.equal(result.summary.changed, 1);
  assert.deepEqual(changeAt(result, 'node_modules/a').fields, ['version', 'resolved', 'integrity']);
  assert.equal(changeAt(result, 'node_modules/new').before, null);
  const removed = changeAt(result, 'node_modules/gone');
  assert.equal(removed.after, null);
  assert.equal(removed.pathSource, 'before');
  assert.equal(changeAt(result, 'node_modules/a').pathSource, 'after');
  assert.deepEqual(pathIds(removed), [['', 'node_modules/gone']]);
  assert.deepEqual(result.warnings, []);
});

test('resolves nested duplicate packages by walking upward from the requesting package', () => {
  const before = lock({
    'node_modules/a': registry('a', '1.0.0', { dependencies: { b: '1', shared: '2' } }),
    'node_modules/a/node_modules/b': registry('b', '1.0.0', { dependencies: { shared: '2' } }),
    'node_modules/a/node_modules/shared': registry('shared', '2.0.0'),
    'node_modules/shared': registry('shared', '1.0.0'),
  }, { dependencies: { a: '1', shared: '1' } });
  const after = structuredClone(before);
  after.packages['node_modules/a/node_modules/shared'] = registry('shared', '2.1.0');
  const result = analyze(before, after);
  const changed = changeAt(result, 'node_modules/a/node_modules/shared');
  assert.deepEqual(pathIds(changed), [
    ['', 'node_modules/a', 'node_modules/a/node_modules/shared'],
    ['', 'node_modules/a', 'node_modules/a/node_modules/b', 'node_modules/a/node_modules/shared'],
  ]);
  assert.equal(result.summary.unchanged, 3);
});

test('resolves scoped package names and npm alias installation names', () => {
  const before = lock({}, { dependencies: { '@scope/tool': '1', alternate: 'npm:actual@1' } });
  const after = lock({
    'node_modules/@scope/tool': registry('@scope/tool', '1.0.0', { dependencies: { alternate: 'npm:actual@1' } }),
    'node_modules/alternate': registry('actual', '1.0.0', { name: 'actual' }),
  }, { dependencies: { '@scope/tool': '1', alternate: 'npm:actual@1' } });
  const result = analyze(before, after);
  assert.equal(changeAt(result, 'node_modules/@scope/tool').name, '@scope/tool');
  const alias = changeAt(result, 'node_modules/alternate');
  assert.equal(alias.name, 'actual');
  assert.deepEqual(pathIds(alias), [['', 'node_modules/alternate'], ['', 'node_modules/@scope/tool', 'node_modules/alternate']]);
});

test('workspace and link routes include workspace development dependencies', () => {
  const before = lock({
    'node_modules/@app/ui': { resolved: 'packages/ui', link: true },
    'packages/ui': { name: '@app/ui', version: '1.0.0', devDependencies: { builder: '1' } },
    'node_modules/builder': registry('builder', '1.0.0'),
  }, { workspaces: ['packages/*'] });
  const after = structuredClone(before);
  after.packages['node_modules/builder'] = registry('builder', '1.1.0');
  const result = analyze(before, after);
  const changed = changeAt(result, 'node_modules/builder');
  assert.deepEqual(pathIds(changed), [
    ['', 'packages/ui', 'node_modules/builder'],
    ['', 'node_modules/@app/ui', 'packages/ui', 'node_modules/builder'],
  ]);
  assert.equal(changed.paths[0][1].name, '@app/ui');
  assert.deepEqual(result.warnings, []);
});

test('workspace-local node_modules takes precedence over hoisted packages', () => {
  const before = lock({
    'packages/api': { name: 'api', dependencies: { shared: '2' } },
    'packages/api/node_modules/shared': registry('shared', '2.0.0'),
    'node_modules/shared': registry('shared', '1.0.0'),
  }, { dependencies: { shared: '1' } });
  const after = structuredClone(before);
  after.packages['packages/api/node_modules/shared'] = registry('shared', '2.1.0');
  assert.deepEqual(pathIds(analyze(before, after).changes[0]), [['', 'packages/api', 'packages/api/node_modules/shared']]);
});

test('real npm external sibling links are supported as metadata without filesystem access', () => {
  const before = { name: 'app', version: '1.0.0', lockfileVersion: 3, requires: true, packages: {
    '': { name: 'app', version: '1.0.0', dependencies: { sibling: 'file:../sibling' } },
    '../sibling': { version: '1.0.0' },
    'node_modules/sibling': { resolved: '../sibling', link: true },
  } };
  assert.deepEqual(analyze(before, before).summary, { added: 0, removed: 0, changed: 0, unchanged: 2, findings: 0 });
  const after = structuredClone(before);
  after.packages['../sibling'].version = '1.1.0';
  const result = analyze(before, after);
  assert.deepEqual(pathIds(result.changes[0]), [['', 'node_modules/sibling', '../sibling']]);
  assert.deepEqual(result.warnings, []);
});

test('external dependency resolution stays in external ancestor directories', () => {
  const before = lock({
    '../sibling': { version: '1.0.0', dependencies: { shared: '1', localOnly: '1' } },
    'node_modules/sibling': { resolved: '../sibling', link: true },
    'node_modules/localOnly': registry('localOnly', '1.0.0'),
    'node_modules/shared': registry('shared', '2.0.0'),
    '../../node_modules/shared': registry('shared', '1.0.0'),
  }, { dependencies: { sibling: 'file:../sibling', shared: '2', localOnly: '1' } });
  const after = structuredClone(before);
  after.packages['../../node_modules/shared'] = registry('shared', '1.1.0');
  after.packages['node_modules/localOnly'] = registry('localOnly', '1.1.0');
  const result = analyze(before, after);
  assert.deepEqual(pathIds(changeAt(result, '../../node_modules/shared')), [['', 'node_modules/sibling', '../sibling', '../../node_modules/shared']]);
  assert.deepEqual(pathIds(changeAt(result, 'node_modules/localOnly')), [['', 'node_modules/localOnly']]);
  assert.ok(result.warnings.some(warning => warning.includes('"../sibling" declares "localOnly"')));
});

test('optional absent packages and optional absent peers produce no unresolved warnings', () => {
  const before = lock();
  const after = lock({
    'node_modules/a': registry('a', '1.0.0', {
      dependencies: { platform: '1' }, optionalDependencies: { platform: '1' },
      peerDependencies: { optionalPeer: '1', requiredPeer: '1' },
      peerDependenciesMeta: { optionalPeer: { optional: true } },
    }),
    'node_modules/requiredPeer': registry('requiredPeer', '1.0.0'),
  }, { dependencies: { a: '1' }, optionalDependencies: { absent: '1' } });
  const result = analyze(before, after);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(pathIds(changeAt(result, 'node_modules/requiredPeer')), [['', 'node_modules/a', 'node_modules/requiredPeer']]);
});

test('missing required packages warn without inventing dependency paths', () => {
  const result = analyze(lock(), lock({ 'node_modules/orphan': registry('orphan', '1.0.0') }, { dependencies: { absent: '1' } }));
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /declares "absent"/u);
  assert.deepEqual(result.changes[0].paths, []);
});

test('dependency cycles terminate and reported routes never repeat a package location', () => {
  const before = lock({
    'node_modules/a': registry('a', '1.0.0', { dependencies: { b: '1' } }),
    'node_modules/b': registry('b', '1.0.0', { dependencies: { a: '1' } }),
  }, { dependencies: { a: '1', b: '1' } });
  const after = structuredClone(before);
  after.packages['node_modules/b'] = registry('b', '1.1.0', { dependencies: { a: '1' } });
  const changed = analyze(before, after).changes[0];
  assert.deepEqual(pathIds(changed), [['', 'node_modules/b'], ['', 'node_modules/a', 'node_modules/b']]);
  for (const ids of pathIds(changed)) assert.equal(ids.length, new Set(ids).size);
});

test('returns at most three routes, shortest first, and reports route truncation', () => {
  const packages = { 'node_modules/shared': registry('shared', '1.0.0') };
  const dependencies = {};
  for (const name of ['a', 'b', 'c', 'd']) {
    packages[`node_modules/${name}`] = registry(name, '1.0.0', { dependencies: { shared: '1' } });
    dependencies[name] = '1';
  }
  const before = lock(packages, { dependencies });
  const after = structuredClone(before);
  after.packages['node_modules/shared'] = registry('shared', '1.1.0');
  const changed = analyze(before, after).changes[0];
  assert.equal(changed.paths.length, 3);
  assert.equal(changed.pathsTruncated, true);
  assert.deepEqual(pathIds(changed).map(ids => ids[1]), ['node_modules/a', 'node_modules/b', 'node_modules/c']);
});

test('route pruning propagates incomplete flags through downstream cycles', () => {
  const edges = { a: ['f'], b: ['c'], c: ['a'], d: ['b', 'f', 'g'], e: ['b'], f: ['d'], g: ['f'], isolated: [] };
  const packages = Object.fromEntries(Object.entries(edges).map(([name, children]) => [
    `node_modules/${name}`, registry(name, '1.0.0', { dependencies: Object.fromEntries(children.map(child => [child, '1'])) }),
  ]));
  const before = lock(packages, { dependencies: { a: '1', d: '1', e: '1', isolated: '1' } });
  const after = structuredClone(before);
  for (const value of Object.values(after.packages)) value.version = '1.1.0';
  const result = analyze(before, after);
  const d = changeAt(result, 'node_modules/d');
  // A third simple path exists: root -> e -> b -> c -> a -> f -> d.
  // Bounded intermediate exploration may omit it, so completeness must not be claimed.
  assert.equal(d.pathsTruncated, true);
  assert.equal(d.beforePathsTruncated, true);
  assert.equal(changeAt(result, 'node_modules/isolated').pathsTruncated, false);
  assert.ok(result.warnings.some(warning => warning.includes('alternate route exploration')));
  for (const change of result.changes) {
    for (const ids of pathIds(change)) assert.equal(ids.length, new Set(ids).size);
  }
});

test('depth limit is explicit and does not recurse on a deep dependency chain', () => {
  const before = lock({
    'node_modules/a': registry('a', '1.0.0', { dependencies: { b: '1' } }),
    'node_modules/b': registry('b', '1.0.0', { dependencies: { c: '1' } }),
    'node_modules/c': registry('c', '1.0.0'),
  }, { dependencies: { a: '1' } });
  const after = structuredClone(before);
  after.packages['node_modules/c'] = registry('c', '1.1.0');
  const result = analyze(before, after, { maxDepth: 1 });
  assert.equal(result.changes[0].pathsTruncated, true);
  assert.deepEqual(result.changes[0].paths, []);
  assert.ok(result.warnings.some(warning => warning.includes('deeper than 1')));
});

test('global emitted path-step budget retains changes and distinguishes omitted from missing routes', () => {
  const before = lock({
    'node_modules/a': registry('a', '1.0.0', { dependencies: { b: '1' } }),
    'node_modules/b': registry('b', '1.0.0', { dependencies: { c: '1' } }),
    'node_modules/c': registry('c', '1.0.0'),
  }, { dependencies: { a: '1' } });
  const after = structuredClone(before);
  for (const value of Object.values(after.packages)) value.version = '1.1.0';
  const result = analyze(before, after, { maxPathSteps: 7 });
  assert.equal(result.changes.length, 3);
  const steps = result.changes.flatMap(change => [...change.paths, ...change.beforePaths]).reduce((sum, path) => sum + path.length, 0);
  assert.equal(steps, 7);
  assert.equal(changeAt(result, 'node_modules/a').pathsTruncated, false);
  assert.equal(changeAt(result, 'node_modules/b').beforePathsTruncated, true);
  assert.deepEqual(changeAt(result, 'node_modules/c').paths, []);
  assert.equal(changeAt(result, 'node_modules/c').pathsTruncated, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /limited to 7 total path steps/u);
  assert.ok(!result.warnings.some(warning => warning.includes('no root or workspace')));
});

test('install scripts are flagged on additions and false-to-true changes', () => {
  const before = lock({ 'node_modules/a': registry('a', '1.0.0') }, { dependencies: { a: '1' } });
  const after = lock({
    'node_modules/a': registry('a', '1.0.0', { hasInstallScript: true }),
    'node_modules/b': registry('b', '1.0.0', { hasInstallScript: true }),
  }, { dependencies: { a: '1', b: '1' } });
  const result = analyze(before, after);
  for (const change of result.changes) {
    assert.deepEqual(codes(change), ['install-script-added']);
    assert.equal(change.findings[0].severity, 'review');
  }
  assert.equal(result.summary.findings, 2);
  assert.deepEqual(changeAt(result, 'node_modules/a').fields, ['hasInstallScript']);
  assert.equal(analyze(after, before).summary.findings, 0);
});

test('same-version integrity replacement and removal are review findings', () => {
  const before = lock({ 'node_modules/a': registry('a', '1.0.0') }, { dependencies: { a: '1' } });
  const after = structuredClone(before);
  after.packages['node_modules/a'].integrity = 'sha512-different';
  assert.deepEqual(codes(analyze(before, after).changes[0]), ['integrity-changed']);
  delete after.packages['node_modules/a'].integrity;
  const change = analyze(before, after).changes[0];
  assert.equal(change.after.integrity, null);
  assert.match(change.findings[0].message, /removed/u);
});

test('normal version changes do not flag expected integrity changes', () => {
  const before = lock({ 'node_modules/a': registry('a', '1.0.0') }, { dependencies: { a: '1' } });
  const after = lock({ 'node_modules/a': registry('a', '1.1.0') }, { dependencies: { a: '1' } });
  assert.deepEqual(analyze(before, after).changes[0].findings, []);
});

test('source host or kind changes flag review and new nonregistry sources are informational', () => {
  const before = lock({ 'node_modules/a': registry('a', '1.0.0') }, { dependencies: { a: '1' } });
  for (const resolved of ['https://cdn.example.test/a.tgz', 'http://registry.npmjs.org/a.tgz', 'git+https://github.com/example/a.git#abc', 'file:../a.tgz']) {
    const after = structuredClone(before);
    after.packages['node_modules/a'].resolved = resolved;
    const change = analyze(before, after).changes[0];
    assert.ok(codes(change).includes('source-changed'));
    assert.ok(codes(change).includes('non-registry-source'));
    assert.equal(change.findings.find(finding => finding.code === 'non-registry-source').severity, 'info');
  }
});

test('flags major-version changes as information', () => {
  const before = lock({ 'node_modules/a': registry('a', '1.0.0') }, { dependencies: { a: '1' } });
  const after = lock({ 'node_modules/a': registry('a', '2.0.0') }, { dependencies: { a: '2' } });
  assert.deepEqual(codes(analyze(before, after).changes[0]), ['major-version-change']);
});

test('same-version dependency and metadata changes remain visible', () => {
  const before = lock({ 'node_modules/a': registry('a', '1.0.0', { license: 'MIT', dependencies: { b: '1' } }) }, { dependencies: { a: '1' } });
  const after = structuredClone(before);
  Object.assign(after.packages['node_modules/a'], {
    license: 'Apache-2.0', dependencies: { b: '2' }, dev: true, optional: true, devOptional: true,
    peerDependencies: { c: '*' }, peerDependenciesMeta: { c: { optional: true } },
  });
  const change = analyze(before, after).changes[0];
  assert.deepEqual(change.fields, ['dev', 'optional', 'devOptional', 'license', 'dependencies', 'peerDependencies', 'peerDependenciesMeta']);
  assert.equal(change.after.dependencies.b, '2');
  assert.deepEqual(change.findings, []);
});

test('changed records retain before routes when a dependency parent changes', () => {
  const before = lock({
    'node_modules/a': registry('a', '1.0.0', { dependencies: { shared: '1' } }),
    'node_modules/b': registry('b', '1.0.0'),
    'node_modules/shared': registry('shared', '1.0.0'),
  }, { dependencies: { a: '1', b: '1' } });
  const after = structuredClone(before);
  delete after.packages['node_modules/a'].dependencies;
  after.packages['node_modules/b'].dependencies = { shared: '2' };
  after.packages['node_modules/shared'] = registry('shared', '2.0.0');
  const changed = changeAt(analyze(before, after), 'node_modules/shared');
  assert.deepEqual(changed.beforePaths.map(path => path.map(step => step.path)), [['', 'node_modules/a', 'node_modules/shared']]);
  assert.deepEqual(pathIds(changed), [['', 'node_modules/b', 'node_modules/shared']]);
  assert.equal(changed.beforePathsTruncated, false);
  assert.equal(changed.pathSource, 'after');
});

test('workspace and alias package renames remain visible without version changes', () => {
  const before = lock({
    'packages/ui': { name: 'old-ui', version: '1.0.0' },
    'node_modules/alias': { name: 'old-target', version: '1.0.0' },
  }, { dependencies: { alias: 'npm:old-target@1' } });
  const after = structuredClone(before);
  after.packages['packages/ui'].name = 'new-ui';
  after.packages['node_modules/alias'].name = 'new-target';
  const result = analyze(before, after);
  assert.equal(result.summary.changed, 2);
  for (const change of result.changes) assert.deepEqual(change.fields, ['name']);
  assert.equal(changeAt(result, 'node_modules/alias').before.name, 'old-target');
  assert.equal(changeAt(result, 'packages/ui').after.name, 'new-ui');
});

test('engine and platform metadata are normalized and compared', () => {
  const before = lock({ 'node_modules/a': registry('a', '1.0.0', { engines: { node: '>=18', npm: '>=9' }, os: ['linux', 'darwin'], cpu: ['arm64', 'x64'] }) }, { dependencies: { a: '1' } });
  const after = structuredClone(before);
  Object.assign(after.packages['node_modules/a'], { engines: { npm: '>=9', node: '>=18' }, os: ['darwin', 'linux'], cpu: ['x64', 'arm64'] });
  assert.equal(analyze(before, after).summary.changed, 0);
  Object.assign(after.packages['node_modules/a'], { engines: { node: '>=22' }, os: ['linux'], cpu: ['x64'] });
  assert.deepEqual(analyze(before, after).changes[0].fields, ['engines', 'os', 'cpu']);
});

test('legacy engines arrays from bundled npm packages are preserved and compared', () => {
  const before = lock({
    'node_modules/jsonparse': { version: '1.3.1', engines: ['node >= 0.2.0'], inBundle: true, license: 'MIT' },
  }, { dependencies: { jsonparse: '^1.3.1' } });
  const after = structuredClone(before);
  assert.equal(analyze(before, after).summary.unchanged, 1);
  after.packages['node_modules/jsonparse'].engines = ['node >= 0.4.0'];
  const changed = analyze(before, after).changes[0];
  assert.deepEqual(changed.fields, ['engines']);
  assert.deepEqual(changed.before.engines, ['node >= 0.2.0']);
  assert.deepEqual(changed.after.engines, ['node >= 0.4.0']);
  after.packages['node_modules/jsonparse'].engines = { node: '>= 0.4.0' };
  assert.deepEqual(analyze(before, after).changes[0].after.engines, { node: '>= 0.4.0' });
  for (const invalid of [[{ node: '>=0.2.0' }], [1], 'node >= 0.2.0', null, { node: { version: '>=0.2.0' } }]) {
    after.packages['node_modules/jsonparse'].engines = invalid;
    assert.throws(() => analyze(before, after), /engines must/u);
  }
});

test('malformed and unsupported lockfiles fail loudly', () => {
  const malformed = [
    null, [], {}, { lockfileVersion: 1 }, { lockfileVersion: '3', packages: { '': {} } },
    { lockfileVersion: 3, packages: {} }, { lockfileVersion: 3, packages: [] },
    lock({ 'node_modules/a': null }), lock({ 'node_modules/a': { version: 1 } }),
    lock({ 'node_modules/a': { hasInstallScript: 'true' } }),
    lock({ 'node_modules/a': { dependencies: [] } }),
    lock({ 'node_modules/a': { dependencies: { b: null } } }),
    lock({ 'node_modules/a': { dependencies: { '../outside': '1' } } }),
    lock({ 'inside/../outside': { version: '1' } }), lock({ '/absolute': { version: '1' } }),
    lock({ 'node_modules\\a': { version: '1' } }),
    lock({ 'node_modules/a': { link: true } }),
    lock({ 'node_modules/a': { peerDependenciesMeta: { b: { optional: 'yes' } } } }),
    lock({ 'node_modules/a': { engines: { node: 22 } } }),
    lock({ 'node_modules/a': { os: 'linux' } }), lock({ 'node_modules/a': { cpu: [42] } }),
  ];
  for (const invalid of malformed) assert.throws(() => analyze(invalid, lock()), /Before lockfile:/u);
  assert.throws(() => analyze(lock(), { lockfileVersion: 1 }), /After lockfile:/u);
  assert.throws(() => analyze(lock(), lock(), { maxPaths: 4 }), /maxPaths/u);
  assert.throws(() => analyze(lock(), lock(), { maxDepth: 0 }), /maxDepth/u);
  assert.throws(() => analyze(lock(), lock(), { maxPathSteps: 0 }), /maxPathSteps/u);
  assert.throws(() => analyze(lock(), lock(), { maxPathSteps: 100_001 }), /maxPathSteps/u);
});

test('prototype-looking names are handled as data without modifying prototypes', () => {
  const after = JSON.parse('{"lockfileVersion":3,"packages":{"":{"name":"app","dependencies":{"__proto__":"1","constructor":"1"}},"node_modules/__proto__":{"version":"1.0.0"},"node_modules/constructor":{"version":"1.0.0"}}}');
  const result = analyze(lock(), after);
  assert.equal(result.summary.added, 2);
  assert.deepEqual(result.warnings, []);
  assert.equal(Object.prototype.optional, undefined);
  assert.ok(result.changes.every(change => change.paths.length === 1));
});

test('does not mutate inputs and produces deterministic output', () => {
  const before = lock();
  const after = lock({ 'node_modules/a': registry('a', '1.0.0') }, { dependencies: { a: '1' } });
  const beforeCopy = structuredClone(before);
  const afterCopy = structuredClone(after);
  const first = analyze(before, after);
  assert.deepEqual(analyze(before, after), first);
  assert.deepEqual(before, beforeCopy);
  assert.deepEqual(after, afterCopy);
});
