/** Offline package-lock analysis. No package code is loaded or executed. */
const MAX_PACKAGES = 100_000;
const MAX_DECLARATIONS = 500_000;
const MAX_ROUTE_STATES = 200_000;
const MAX_PATH_STEPS = 100_000;
const MAP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const SNAPSHOT_FIELDS = [
  'name', 'version', 'resolved', 'integrity', 'hasInstallScript', 'dev', 'optional',
  'devOptional', 'license', 'link', ...MAP_FIELDS, 'peerDependenciesMeta', 'engines', 'os', 'cpu',
];
const STRING_FIELDS = ['name', 'version', 'resolved', 'integrity', 'license'];
const BOOLEAN_FIELDS = ['hasInstallScript', 'dev', 'optional', 'devOptional', 'link'];

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function validPackageName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 512
    && !/[\\\s\u0000-\u001f]/u.test(name)
    && (name.startsWith('@') ? /^@[^/]+\/[^/]+$/u.test(name) : !name.includes('/'))
    && name !== '.' && name !== '..';
}

function validate(lock, label) {
  if (!record(lock)) fail(label, 'expected a package-lock JSON object');
  if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) {
    fail(label, 'only npm package-lock lockfileVersion 2 and 3 are supported');
  }
  if (!record(lock.packages) || !own(lock.packages, '') || !record(lock.packages[''])) {
    fail(label, 'packages must be an object containing the root package at key ""');
  }
  const entries = Object.entries(lock.packages);
  if (entries.length > MAX_PACKAGES) fail(label, `package limit exceeded (${MAX_PACKAGES})`);
  let declarations = 0;
  const nodes = new Map();
  for (const [path, value] of entries) {
    const parts = path.split('/');
    let nonParentSeen = false;
    const noncanonicalParent = parts.some(part => {
      if (part === '..') return nonParentSeen;
      nonParentSeen = true;
      return false;
    });
    if (path.length > 2048 || /[\\\u0000-\u001f]/u.test(path)
      || (path !== '' && parts.some(part => !part || part === '.')) || noncanonicalParent
      || /^[A-Za-z]:/u.test(path)) {
      fail(label, `invalid package location ${JSON.stringify(path)}`);
    }
    const where = `package ${JSON.stringify(path)}`;
    if (!record(value)) fail(label, `${where} must be an object`);
    for (const field of STRING_FIELDS) {
      if (own(value, field) && typeof value[field] !== 'string') {
        fail(label, `${where}.${field} must be a string`);
      }
    }
    for (const field of BOOLEAN_FIELDS) {
      if (own(value, field) && typeof value[field] !== 'boolean') {
        fail(label, `${where}.${field} must be a boolean`);
      }
    }
    for (const field of MAP_FIELDS) {
      if (!own(value, field)) continue;
      if (!record(value[field])) fail(label, `${where}.${field} must be an object`);
      const dependencies = Object.entries(value[field]);
      declarations += dependencies.length;
      if (declarations > MAX_DECLARATIONS) fail(label, `dependency declaration limit exceeded (${MAX_DECLARATIONS})`);
      for (const [name, spec] of dependencies) {
        if (!validPackageName(name) || typeof spec !== 'string') {
          fail(label, `${where}.${field} must map package names to string specifications`);
        }
      }
    }
    if (own(value, 'peerDependenciesMeta')) {
      if (!record(value.peerDependenciesMeta)) fail(label, `${where}.peerDependenciesMeta must be an object`);
      for (const [name, metadata] of Object.entries(value.peerDependenciesMeta)) {
        if (!validPackageName(name) || !record(metadata)
          || (own(metadata, 'optional') && typeof metadata.optional !== 'boolean')) {
          fail(label, `${where}.peerDependenciesMeta contains invalid metadata`);
        }
      }
    }
    if (own(value, 'engines')) {
      const validArray = Array.isArray(value.engines) && value.engines.every(spec => typeof spec === 'string');
      const validMap = record(value.engines) && Object.values(value.engines).every(spec => typeof spec === 'string');
      if (!validArray && !validMap) {
        fail(label, `${where}.engines must be a string specification map or a legacy array of strings`);
      }
    }
    for (const field of ['os', 'cpu']) {
      if (own(value, field) && (!Array.isArray(value[field]) || value[field].some(item => typeof item !== 'string'))) {
        fail(label, `${where}.${field} must be an array of strings`);
      }
    }
    if (value.link && !value.resolved) fail(label, `${where} is a link without a resolved target`);
    nodes.set(path, { path, name: packageName(path, value, lock), value });
  }
  return nodes;
}

function packageName(path, value, lock) {
  if (value.name) return value.name;
  if (path === '') return typeof lock.name === 'string' && lock.name ? lock.name : '(root)';
  const marker = 'node_modules/';
  const offset = path.lastIndexOf(marker);
  return offset >= 0 ? path.slice(offset + marker.length) : path.split('/').at(-1);
}

function sortedMap(value = {}) {
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
}

function snapshot(node) {
  const { value } = node;
  const result = { name: node.name };
  for (const field of ['version', 'resolved', 'integrity', 'license']) result[field] = value[field] ?? null;
  for (const field of BOOLEAN_FIELDS) result[field] = value[field] ?? false;
  for (const field of MAP_FIELDS) result[field] = sortedMap(value[field]);
  result.peerDependenciesMeta = Object.fromEntries(Object.keys(value.peerDependenciesMeta ?? {}).sort()
    .map(name => [name, { optional: value.peerDependenciesMeta[name].optional ?? false }]));
  // Older packages (including jsonparse bundled by npm) retain legacy engine arrays.
  result.engines = Array.isArray(value.engines) ? [...value.engines].sort() : sortedMap(value.engines);
  result.os = [...(value.os ?? [])].sort();
  result.cpu = [...(value.cpu ?? [])].sort();
  return result;
}

function isWorkspacePath(path) {
  return path !== '' && path.split('/')[0] !== '..' && !path.split('/').includes('node_modules');
}

function leadingParents(path) {
  let count = 0;
  for (const part of path.split('/')) {
    if (part !== '..') break;
    count += 1;
  }
  return count;
}

function resolveDependency(nodes, from, name, parentPrefixes) {
  const parts = from === '' ? [] : from.split('/');
  const parentDepth = leadingParents(from);
  for (let length = parts.length; length >= parentDepth; length -= 1) {
    if (length > 0 && parts[length - 1] === 'node_modules') continue;
    const base = length > 0 ? `${parts.slice(0, length).join('/')}/` : '';
    const candidate = `${base}node_modules/${name}`;
    if (nodes.has(candidate)) return candidate;
  }
  // An external sibling never resolves through this project's node_modules.
  // Ancestors outside the project can be used only when recorded in the lockfile.
  for (let depth = parentDepth + 1; depth < parentPrefixes.length; depth += 1) {
    const candidate = `${parentPrefixes[depth]}node_modules/${name}`;
    if (nodes.has(candidate)) return candidate;
  }
  return null;
}

function linkTarget(resolved) {
  // npm stores link targets relative to the lockfile root, not the link directory.
  let target = resolved.replace(/^file:/u, '').replaceAll('\\', '/');
  while (target.startsWith('./')) target = target.slice(2);
  const result = [];
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (result.length > 0 && result.at(-1) !== '..') result.pop();
      else result.push('..');
    } else result.push(part);
  }
  if (target.startsWith('/') || /^[A-Za-z]:/u.test(target)) return null;
  return result.join('/');
}

function graph(nodes, label, warn) {
  const edges = new Map([...nodes.keys()].map(path => [path, new Set()]));
  let maxParentDepth = 0;
  for (const path of nodes.keys()) maxParentDepth = Math.max(maxParentDepth, leadingParents(path));
  const parentPrefixes = Array.from({ length: maxParentDepth + 1 }, (_, depth) => '../'.repeat(depth));
  for (const [path, node] of nodes) {
    const value = node.value;
    // A workspace is an independent project entry point even when it is not in root.dependencies.
    if (isWorkspacePath(path)) edges.get('').add(path);
    if (value.link) {
      const target = linkTarget(value.resolved);
      if (target !== null && nodes.has(target)) {
        edges.get(path).add(target);
        const segments = path.split('/');
        if (segments[0] === 'node_modules' && (segments.length === 2 || (segments.length === 3 && segments[1].startsWith('@')))) {
          edges.get('').add(path);
        }
      } else warn(`${label}: link ${JSON.stringify(path)} has a target outside the lockfile graph`);
    }
    const declarations = new Map();
    for (const name of Object.keys(value.peerDependencies ?? {})) {
      declarations.set(name, value.peerDependenciesMeta?.[name]?.optional === true);
    }
    for (const name of Object.keys(value.dependencies ?? {})) declarations.set(name, false);
    if (path === '' || isWorkspacePath(path)) {
      for (const name of Object.keys(value.devDependencies ?? {})) declarations.set(name, false);
    }
    for (const name of Object.keys(value.optionalDependencies ?? {})) declarations.set(name, true);
    for (const [name, optional] of declarations) {
      const target = resolveDependency(nodes, path, name, parentPrefixes);
      if (target !== null) edges.get(path).add(target);
      else if (!optional) warn(`${label}: ${JSON.stringify(path || '(root)')} declares ${JSON.stringify(name)}, but no installed package can be resolved`);
    }
  }
  return new Map([...edges].map(([path, targets]) => [path, [...targets].sort()]));
}

function routeIndex(nodes, edges, maxPaths, maxDepth, label, warn) {
  // Breadth-first, bounded simple paths: accepted routes are shortest first.
  // Keep one extra route so callers can see when the presentation cap was hit.
  const routes = new Map();
  const root = { id: '', parent: null, depth: 0 };
  routes.set('', [root]);
  const queue = [root];
  const prunedNodes = new Set();
  let limited = false;
  let depthLimited = false;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const targets = edges.get(current.id) ?? [];
    if (current.depth >= maxDepth) {
      if (targets.length > 0) depthLimited = true;
      continue;
    }
    for (const target of targets) {
      const accepted = routes.get(target) ?? [];
      if (accepted.length >= maxPaths + 1) { prunedNodes.add(target); continue; }
      let cycle = false;
      for (let ancestor = current; ancestor !== null; ancestor = ancestor.parent) {
        if (ancestor.id === target) { cycle = true; break; }
      }
      if (cycle) continue;
      if (queue.length >= MAX_ROUTE_STATES) { limited = true; break; }
      const next = { id: target, parent: current, depth: current.depth + 1 };
      accepted.push(next);
      routes.set(target, accepted);
      queue.push(next);
    }
    if (limited) break;
  }
  if (limited) warn(`${label}: dependency route traversal hit the ${MAX_ROUTE_STATES} state limit; routes may be incomplete`);
  if (depthLimited) warn(`${label}: dependency routes deeper than ${maxDepth} edges were omitted`);
  // A discarded simple path can avoid a downstream cycle that retained paths cannot.
  // Propagate uncertainty so downstream packages never claim complete routes silently.
  const incompleteNodes = new Set(prunedNodes);
  const affected = [...prunedNodes];
  for (let index = 0; index < affected.length; index += 1) {
    for (const target of edges.get(affected[index]) ?? []) {
      if (!incompleteNodes.has(target)) { incompleteNodes.add(target); affected.push(target); }
    }
  }
  if (prunedNodes.size > 0) warn(`${label}: alternate route exploration was capped at ${maxPaths + 1} candidates per package; affected routes may be incomplete`);
  return { routes, limited: limited || depthLimited, incompleteNodes, nodes };
}

function pathsFor(index, id, maxPaths, budget) {
  const routes = index.routes.get(id) ?? [];
  const paths = [];
  let outputLimited = false;
  for (const route of routes.slice(0, maxPaths)) {
    const steps = route.depth + 1;
    if (steps > budget.remaining) {
      outputLimited = true;
      budget.omitted = true;
      break;
    }
    budget.remaining -= steps;
    const path = [];
    for (let step = route; step !== null; step = step.parent) {
      const node = index.nodes.get(step.id);
      path.push({ name: node.name, version: node.value.version ?? null, path: step.id });
    }
    paths.push(path.reverse());
  }
  return { paths, pathsTruncated: outputLimited || routes.length > maxPaths || index.limited || index.incompleteNodes.has(id) };
}

function source(value) {
  if (value.link) return { kind: 'local-link', host: null };
  const resolved = value.resolved;
  if (!resolved) return { kind: 'unknown', host: null };
  if (/^(?:git(?:\+[^:]+)?:|ssh:|git@|github:|gitlab:|bitbucket:)/iu.test(resolved)) {
    let host = null;
    try { host = new URL(resolved.replace(/^git\+/iu, '')).host || null; } catch { /* Git shorthand. */ }
    return { kind: 'git', host };
  }
  try {
    const url = new URL(resolved);
    if (url.protocol === 'file:') return { kind: 'local-file', host: null };
    const registry = ['registry.npmjs.org', 'registry.yarnpkg.com'].includes(url.hostname.toLowerCase());
    if (url.protocol === 'https:' && registry) return { kind: 'registry', host: url.host.toLowerCase() };
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { kind: url.protocol === 'http:' ? 'http-url' : 'remote-url', host: url.host.toLowerCase() };
    }
    return { kind: 'other-url', host: url.host || null };
  } catch { return { kind: 'local-file', host: null }; }
}

function findingsFor(before, after) {
  const findings = [];
  if (!after) return findings;
  if (after.hasInstallScript && !before?.hasInstallScript) {
    findings.push({ code: 'install-script-added', severity: 'review', message: 'The lockfile now declares an install script. Review the package before installation; script contents are not stored in the lockfile.' });
  }
  if (before && before.version !== null && before.version === after.version && before.integrity !== after.integrity) {
    findings.push({ code: 'integrity-changed', severity: 'review', message: after.integrity === null
      ? 'The integrity hash was removed while the package version stayed the same.'
      : 'The integrity hash changed while the package version stayed the same.' });
  }
  const nextSource = source(after);
  const previousSource = before ? source(before) : null;
  if (previousSource && (previousSource.kind !== nextSource.kind || previousSource.host !== nextSource.host)) {
    findings.push({ code: 'source-changed', severity: 'review', message: `Package source changed from ${previousSource.kind}${previousSource.host ? ` (${previousSource.host})` : ''} to ${nextSource.kind}${nextSource.host ? ` (${nextSource.host})` : ''}.` });
  }
  if (!['registry', 'unknown'].includes(nextSource.kind) && (!before || before.resolved !== after.resolved || before.link !== after.link)) {
    findings.push({ code: 'non-registry-source', severity: 'info', message: `Package uses a ${nextSource.kind} source${nextSource.host ? ` on ${nextSource.host}` : ''}. This is provenance information, not evidence of malicious behavior.` });
  }
  const previousMajor = before?.version?.match(/^v?(\d+)\./u);
  const nextMajor = after.version?.match(/^v?(\d+)\./u);
  if (previousMajor && nextMajor && previousMajor[1].replace(/^0+(?=\d)/u, '') !== nextMajor[1].replace(/^0+(?=\d)/u, '')) {
    findings.push({ code: 'major-version-change', severity: 'info', message: `Package major version changed from ${previousMajor[1]} to ${nextMajor[1]}. Review compatibility.` });
  }
  return findings;
}

/**
 * Compare npm lockfile v2/v3 objects. Paths describe possible dependency routes,
 * not why npm chose a version. Removed packages use the before graph; others use after.
 * Options: maxPaths (1..3, default 3), maxDepth (1..256, default 128),
 * maxPathSteps (1..100000, default 100000 shared across all emitted before/after routes).
 */
export function analyze(beforeObject, afterObject, options = {}) {
  if (!record(options)) throw new Error('options must be an object');
  const maxPaths = options.maxPaths ?? 3;
  const maxDepth = options.maxDepth ?? 128;
  const maxPathSteps = options.maxPathSteps ?? MAX_PATH_STEPS;
  if (!Number.isInteger(maxPaths) || maxPaths < 1 || maxPaths > 3) throw new Error('maxPaths must be an integer from 1 to 3');
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 256) throw new Error('maxDepth must be an integer from 1 to 256');
  if (!Number.isInteger(maxPathSteps) || maxPathSteps < 1 || maxPathSteps > MAX_PATH_STEPS) {
    throw new Error(`maxPathSteps must be an integer from 1 to ${MAX_PATH_STEPS}`);
  }
  const beforeNodes = validate(beforeObject, 'Before lockfile');
  const afterNodes = validate(afterObject, 'After lockfile');
  const warnings = new Set();
  let omittedWarnings = 0;
  const warn = message => {
    if (warnings.has(message)) return;
    if (warnings.size < 100) warnings.add(message);
    else omittedWarnings += 1;
  };
  const beforeEdges = graph(beforeNodes, 'Before lockfile', warn);
  const afterEdges = graph(afterNodes, 'After lockfile', warn);
  const summary = { added: 0, removed: 0, changed: 0, unchanged: 0, findings: 0 };
  const changes = [];
  const ids = [...new Set([...beforeNodes.keys(), ...afterNodes.keys()])].filter(id => id !== '').sort();
  for (const id of ids) {
    const oldNode = beforeNodes.get(id);
    const newNode = afterNodes.get(id);
    const before = oldNode ? snapshot(oldNode) : null;
    const after = newNode ? snapshot(newNode) : null;
    const fields = before && after
      ? SNAPSHOT_FIELDS.filter(field => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
      : [];
    if (before && after && fields.length === 0) { summary.unchanged += 1; continue; }
    const kind = !before ? 'added' : !after ? 'removed' : 'changed';
    const findings = findingsFor(before, after);
    summary[kind] += 1;
    summary.findings += findings.length;
    changes.push({ id, name: (newNode ?? oldNode).name, kind, before, after, fields,
      pathSource: kind === 'removed' ? 'before' : 'after', paths: [], pathsTruncated: false, findings });
  }
  const beforeRoutes = changes.some(change => change.kind !== 'added')
    ? routeIndex(beforeNodes, beforeEdges, maxPaths, maxDepth, 'Before lockfile', warn) : null;
  const afterRoutes = changes.some(change => change.kind !== 'removed')
    ? routeIndex(afterNodes, afterEdges, maxPaths, maxDepth, 'After lockfile', warn) : null;
  const pathBudget = { remaining: maxPathSteps, omitted: false };
  for (const change of changes) {
    const index = change.kind === 'removed' ? beforeRoutes : afterRoutes;
    Object.assign(change, pathsFor(index, change.id, maxPaths, pathBudget));
    if (change.kind === 'changed') {
      const previous = pathsFor(beforeRoutes, change.id, maxPaths, pathBudget);
      change.beforePaths = previous.paths;
      change.beforePathsTruncated = previous.pathsTruncated;
      if (!beforeRoutes.routes.has(change.id)) warn(`Before lockfile: no root or workspace dependency route found for ${JSON.stringify(change.id)}; the lockfile may be incomplete or contain an extraneous package`);
    }
    if (!index.routes.has(change.id)) warn(`${change.kind === 'removed' ? 'Before' : 'After'} lockfile: no root or workspace dependency route found for ${JSON.stringify(change.id)}; the lockfile may be incomplete or contain an extraneous package`);
  }
  if (pathBudget.omitted) warnings.add(`Dependency route output was limited to ${maxPathSteps} total path steps across before and after routes; some paths were omitted, but all package changes are retained`);
  if (omittedWarnings > 0) warnings.add(`${omittedWarnings} additional graph warnings omitted`);
  return { schemaVersion: 1, summary, changes, warnings: [...warnings] };
}
