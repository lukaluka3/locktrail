import { createHash } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';

const DISCLAIMER = 'Review signals, not a vulnerability scan.';
const PATH_LIMIT_NOTE = 'Dependency paths are limited; additional routes may be omitted.';
const FIELD_LABELS = {
  name: 'Package name',
  version: 'Version',
  resolved: 'Package source',
  integrity: 'Integrity',
  hasInstallScript: 'Install script',
  dev: 'Development dependency',
  optional: 'Optional dependency',
  devOptional: 'Development / optional scope',
  license: 'License',
  link: 'Local link',
  dependencies: 'Dependencies',
  devDependencies: 'Development dependencies',
  optionalDependencies: 'Optional dependencies',
  peerDependencies: 'Peer dependencies',
  peerDependenciesMeta: 'Peer dependency metadata',
  engines: 'Runtime requirements',
  os: 'Operating systems',
  cpu: 'CPU architectures',
};

// Treat lockfiles, package names, and CLI-provided labels as untrusted text.
function clean(value) {
  return stripVTControlCharacters(String(value ?? ''))
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .trim();
}

function html(value) {
  return clean(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function markdown(value) {
  return clean(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|~\-]/g, '\\$&');
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePaths(paths) {
  return list(paths).map((path) => list(path).map((node) => ({
    name: clean(node.name) || '(root)',
    version: clean(node.version),
    path: clean(node.path),
  })));
}

function normalize(report = {}) {
  const changes = list(report.changes).map((change) => {
    const kind = ['added', 'removed', 'changed'].includes(change.kind) ? change.kind : 'changed';
    const findings = list(change.findings).map((finding) => ({
      code: clean(finding.code),
      severity: finding.severity === 'review' ? 'review' : 'info',
      message: clean(finding.message),
    }));
    const paths = normalizePaths(change.paths);
    const beforePaths = normalizePaths(change.beforePaths);
    return {
      id: clean(change.id),
      name: clean(change.name) || '(unnamed package)',
      kind,
      before: change.before,
      after: change.after,
      fields: list(change.fields).map((field) => Object.hasOwn(FIELD_LABELS, field) ? FIELD_LABELS[field] : clean(field)),
      paths,
      pathSource: change.pathSource === 'before' || kind === 'removed' ? 'before' : 'after',
      pathsTruncated: Boolean(change.pathsTruncated),
      beforePaths,
      beforePathsTruncated: Boolean(change.beforePathsTruncated),
      showBeforePaths: kind === 'changed' && Array.isArray(change.beforePaths)
        && JSON.stringify(paths) !== JSON.stringify(beforePaths),
      findings,
      needsReview: findings.some((finding) => finding.severity === 'review'),
    };
  });
  return {
    changes,
    warnings: list(report.warnings).map(clean),
    beforeLabel: clean(report.meta?.beforeLabel) || 'Before',
    afterLabel: clean(report.meta?.afterLabel) || 'After',
    counts: {
      added: changes.filter((change) => change.kind === 'added').length,
      removed: changes.filter((change) => change.kind === 'removed').length,
      changed: changes.filter((change) => change.kind === 'changed').length,
      review: changes.filter((change) => change.needsReview).length,
      signals: changes.reduce((total, change) => total + change.findings.filter((finding) => finding.severity === 'review').length, 0),
    },
  };
}

function version(snapshot) {
  return snapshot ? clean(snapshot.version) || 'unversioned' : '—';
}

function transition(change) {
  return `${version(change.before)} → ${version(change.after)}`;
}

function nodeLabel(node) {
  return `${node.name}${node.version ? `@${node.version}` : ''}`;
}

function pathLabel(path) {
  return path.map(nodeLabel).join(' → ');
}

function packageCount(count) {
  return `${count} package${count === 1 ? '' : 's'}`;
}

function pathGroups(change) {
  const groups = [];
  if (change.showBeforePaths) groups.push({ label: 'Before dependency paths', paths: change.beforePaths, limited: change.beforePathsTruncated });
  groups.push({ label: `${change.pathSource === 'before' ? 'Before' : 'After'} dependency paths`, paths: change.paths, limited: change.pathsTruncated });
  return groups;
}

export function renderText(report) {
  const view = normalize(report);
  const { counts } = view;
  const lines = [
    'Locktrail — dependency change review',
    `${view.beforeLabel} → ${view.afterLabel}`,
    '',
    `${view.changes.length} changes: ${counts.added} added · ${counts.changed} changed · ${counts.removed} removed`,
    `${packageCount(counts.review)} need${counts.review === 1 ? 's' : ''} review · ${counts.signals} review signal${counts.signals === 1 ? '' : 's'}`,
  ];
  if (view.changes.length === 0) lines.push('', 'No dependency changes found.');
  for (const change of view.changes) {
    lines.push('', `${change.needsReview ? '[REVIEW] ' : ''}${change.kind.toUpperCase()} ${change.name}  ${transition(change)}`);
    if (change.id) lines.push(`  Location: ${change.id}`);
    if (change.fields.length) lines.push(`  Fields: ${change.fields.join(', ')}`);
    for (const finding of change.findings) lines.push(`  ${finding.severity === 'review' ? 'Review' : 'Info'}: ${finding.message}${finding.code ? ` [${finding.code}]` : ''}`);
    for (const group of pathGroups(change)) {
      lines.push(`  ${group.label}:`);
      for (const path of group.paths) lines.push(`    Via: ${pathLabel(path)}`);
      if (!group.paths.length) lines.push('    Dependency path unavailable.');
      if (group.limited) lines.push(`    ${PATH_LIMIT_NOTE}`);
    }
  }
  if (view.warnings.length) {
    lines.push('', 'Warnings:');
    for (const warning of view.warnings) lines.push(`  - ${warning}`);
  }
  lines.push('', DISCLAIMER);
  return `${lines.join('\n')}\n`;
}

export function renderMarkdown(report) {
  const view = normalize(report);
  const { counts } = view;
  const lines = [
    '# Locktrail dependency review',
    '',
    `${markdown(view.beforeLabel)} → ${markdown(view.afterLabel)}`,
    '',
    '| Added | Changed | Removed | Packages needing review |',
    '| ---: | ---: | ---: | ---: |',
    `| ${counts.added} | ${counts.changed} | ${counts.removed} | ${counts.review} |`,
    '',
    `${counts.signals} review signal${counts.signals === 1 ? '' : 's'} across ${packageCount(view.changes.length)} with changes.`,
  ];
  if (!view.changes.length) lines.push('', 'No dependency changes found.');
  for (const change of view.changes) {
    lines.push('', `## ${change.needsReview ? 'Review · ' : ''}${markdown(change.name)}`, '', `**${change.kind[0].toUpperCase()}${change.kind.slice(1)}** · ${markdown(transition(change))}`);
    if (change.id) lines.push('', `Location: ${markdown(change.id)}`);
    if (change.fields.length) lines.push('', `Fields: ${change.fields.map(markdown).join(', ')}`);
    if (change.findings.length) {
      lines.push('');
      for (const finding of change.findings) lines.push(`- **${finding.severity === 'review' ? 'Review' : 'Info'}:** ${markdown(finding.message)}${finding.code ? ` (${markdown(finding.code)})` : ''}`);
    }
    for (const group of pathGroups(change)) {
      lines.push('', `**${group.label}**`, '');
      for (const path of group.paths) lines.push(`- ${markdown(pathLabel(path))}`);
      if (!group.paths.length) lines.push('Dependency path unavailable.');
      if (group.limited) lines.push('', `*${PATH_LIMIT_NOTE}*`);
    }
  }
  if (view.warnings.length) {
    lines.push('', '## Warnings', '');
    for (const warning of view.warnings) lines.push(`- ${markdown(warning)}`);
  }
  lines.push('', '---', '', DISCLAIMER);
  return `${lines.join('\n')}\n`;
}

const FILTER_SCRIPT = `(() => {
  const search = document.getElementById('search');
  const cards = [...document.querySelectorAll('[data-change]')];
  const filters = [...document.querySelectorAll('[data-filter]')];
  const count = document.getElementById('result-count');
  const empty = document.getElementById('no-results');
  let active = 'all';
  function apply() {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {
      const matchesFilter = active === 'all' || (active === 'review' ? card.dataset.review === 'true' : card.dataset.kind === active);
      const matchesSearch = card.dataset.search.toLocaleLowerCase().includes(query);
      card.hidden = !(matchesFilter && matchesSearch);
      if (!card.hidden) visible += 1;
    }
    count.textContent = visible + ' of ' + cards.length + ' package changes';
    empty.hidden = visible !== 0 || cards.length === 0;
  }
  for (const button of filters) {
    button.addEventListener('click', () => {
      active = button.dataset.filter;
      for (const candidate of filters) candidate.setAttribute('aria-pressed', String(candidate === button));
      apply();
    });
  }
  search.addEventListener('input', apply);
  apply();
})();`;

const STYLE = `
:root{color-scheme:light;--paper:#f6f5ef;--card:#fffefa;--ink:#182720;--muted:#58665e;--line:#dcded3;--green:#246744;--mint:#e4eedf;--amber:#805519;--amber-bg:#f7eed9;--mono:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;--sans:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 var(--sans);-webkit-font-smoothing:antialiased}button,input{font:inherit}button{cursor:pointer}a{color:inherit}button:focus-visible,input:focus-visible,summary:focus-visible,a:focus-visible{outline:3px solid var(--green);outline-offset:4px}button[hidden],[hidden]{display:none!important}.shell{max-width:1120px;margin:0 auto;padding:0 36px}.skip{position:absolute;top:-80px;left:20px;z-index:10;background:var(--card);padding:12px}.skip:focus{top:12px}.masthead{border-bottom:1px solid var(--line)}.masthead .shell{display:flex;align-items:center;justify-content:space-between;min-height:83px;gap:20px}.brand{font-weight:760;letter-spacing:-1px;font-size:24px;display:flex;align-items:center;gap:11px}.mark{width:25px;height:25px;display:inline-block;border:2px solid var(--green);border-radius:50%;position:relative}.mark:after{content:"";position:absolute;width:7px;height:7px;border:2px solid var(--green);border-radius:50%;left:6px;top:6px}.edition{font:10px/1.6 var(--mono);text-transform:uppercase;letter-spacing:1.3px;color:var(--muted);text-align:right}.hero{padding:54px 0 29px}.eyebrow{font:11px var(--mono);letter-spacing:1.7px;color:var(--green);text-transform:uppercase;margin:0 0 14px}h1{font-weight:650;font-size:clamp(36px,5.5vw,64px);line-height:1.07;letter-spacing:-2.7px;margin:0 0 18px}.intro{color:var(--muted);font-size:16px;max-width:640px;margin:0}.comparison{display:flex;gap:13px;align-items:center;margin:25px 0 0;font:12px/1.6 var(--mono);color:var(--muted);flex-wrap:wrap}.file-label{max-width:100%;overflow-wrap:anywhere;background:#eeeee5;border:1px solid var(--line);border-radius:5px;padding:5px 9px}.compare-arrow{color:var(--green);font:20px var(--sans)}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card);margin:0 0 32px}.stat{padding:20px 25px;border-right:1px solid var(--line)}.stat:last-child{border:0;background:var(--mint)}.stat-number{display:block;font:500 37px/1.15 var(--mono);letter-spacing:-1.7px}.stat-label{font-size:12px;color:var(--muted);display:block;margin-top:8px}.stat:last-child .stat-number{color:var(--green)}.review-note{font-size:12px;color:var(--muted);margin:-17px 0 30px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:19px}.filters{display:flex;gap:4px;flex-wrap:wrap}.filter{border:1px solid transparent;padding:7px 10px;background:transparent;border-radius:6px;color:var(--muted);font-size:12px;font-weight:550;white-space:nowrap}.filter:hover{background:#e9ece3}.filter[aria-pressed="true"]{background:var(--ink);color:var(--card)}.filter-count{font:10px var(--mono);margin-left:5px;opacity:.7}.search-wrap{position:relative;flex:1;max-width:290px;min-width:190px}.search{width:100%;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);padding:10px 13px;font-size:12px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.result-line{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:0 0 10px;margin-bottom:17px;color:var(--muted);font:10px var(--mono);text-transform:uppercase;letter-spacing:.5px}.change{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:23px 25px;margin-bottom:13px}.change-header{display:flex;align-items:flex-start;justify-content:space-between;gap:15px}.package-title{font:600 18px/1.5 var(--mono);letter-spacing:-.5px;margin:0;overflow-wrap:anywhere}.package-location{font:10px/1.65 var(--mono);color:var(--muted);margin:4px 0 0;overflow-wrap:anywhere}.badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0}.badge{font:10px/1.3 var(--mono);border-radius:4px;padding:5px 7px;background:#eeeee7;color:var(--muted);white-space:nowrap}.badge-added{background:var(--mint);color:var(--green)}.badge-changed{background:#ecefe7;color:#405837}.badge-review{background:var(--amber-bg);color:var(--amber)}.version-line{display:flex;align-items:center;gap:13px;margin:18px 0 12px;font:13px/1.6 var(--mono);flex-wrap:wrap}.version-before{color:var(--muted)}.version-after{color:var(--ink);font-weight:600}.version-arrow{color:var(--green);font-size:19px}.version{overflow-wrap:anywhere;max-width:100%}.field-list{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 16px}.field{font-size:10px;color:var(--muted);padding:2px 6px;border:1px solid var(--line);border-radius:4px}.signals{list-style:none;padding:0;margin:14px 0 18px}.signal{padding:9px 12px;border-left:2px solid var(--line);background:#f4f5ee;font-size:12px;overflow-wrap:anywhere}.signal+.signal{margin-top:6px}.signal-review{border-color:#c7a258;background:#faf5e8}.signal-label{font-weight:650;margin-right:5px}.signal-code{font:9px var(--mono);color:var(--muted);margin-left:8px}.chains{border-top:1px solid var(--line);padding-top:12px;margin-top:16px}.chains summary{font-size:11px;font-weight:550;color:var(--muted);cursor:pointer;list-style-position:inside}.chain-list{list-style:none;padding:0;margin:13px 0 0;display:grid;gap:9px}.chain{display:flex;gap:7px;align-items:center;flex-wrap:wrap;font:10px/1.65 var(--mono);overflow-wrap:anywhere}.chain-node{border:1px solid var(--line);background:var(--paper);border-radius:4px;padding:4px 7px;max-width:100%;overflow-wrap:anywhere}.chain-node:last-child{background:var(--mint);border-color:#cfddc8}.chain-version{opacity:.6}.chain-arrow{color:var(--green);font-size:14px}.path-note{font-size:11px;color:var(--muted);margin:10px 0 0}.empty{padding:48px 20px;text-align:center;border:1px dashed #bdc9b9;border-radius:9px;margin:15px 0 30px}.empty h2{font-weight:600;font-size:21px;letter-spacing:-.5px;margin:0 0 7px}.empty p{font-size:13px;color:var(--muted);margin:0}.warnings{background:var(--amber-bg);border:1px solid #e6d6b5;padding:17px 22px;border-radius:8px;margin-bottom:26px}.warnings h2{font-size:13px;margin:0 0 6px}.warnings ul{font-size:12px;padding-left:17px;margin:0;overflow-wrap:anywhere}.footer{margin-top:40px;padding:25px 0 34px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:flex-start;gap:20px;color:var(--muted);font-size:11px}.footer strong{font-weight:550;color:var(--ink)}.footer p{margin:3px 0 0}.offline{font:10px/1.8 var(--mono);text-align:right;white-space:nowrap}.offline-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green);margin-right:5px}.noscript{font-size:12px;color:var(--muted);margin:0 0 15px}
@media(max-width:720px){.shell{padding:0 20px}.masthead .shell{min-height:70px}.hero{padding-top:36px}h1{letter-spacing:-1.5px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.stat{padding:16px 19px}.stat:nth-child(2){border-right:0}.stat:nth-child(-n+2){border-bottom:1px solid var(--line)}.stat-number{font-size:31px}.toolbar{gap:13px}.search-wrap{max-width:none;width:100%;flex-basis:100%}.change{padding:18px}.change-header{flex-direction:column;gap:11px}.badges{justify-content:flex-start}.footer{flex-direction:column}.offline{text-align:left}.edition{font-size:9px}.filter{padding:7px 8px}.result-hint{display:none}}
@media print{body{background:#fff}.shell{max-width:none;padding:0}.masthead .shell{min-height:50px}.hero{padding-top:25px}h1{font-size:36px}.toolbar,.result-hint,.skip{display:none}.change{break-inside:avoid}.footer{margin-top:20px}.stat{padding:12px 18px}.chain-list{display:grid}.chains>summary{display:none}.chains>ul,.chains>p{display:block}}
`;

function renderPathGroup(group) {
  const paths = group.paths.map((path) => `<li class="chain">${path.map((node, nodeIndex) => `${nodeIndex ? '<span class="chain-arrow" aria-hidden="true">→</span><span class="sr-only">depends on</span>' : ''}<span class="chain-node"${node.path ? ` title="${html(node.path)}"` : ''}>${html(node.name)}${node.version ? `<span class="chain-version">@${html(node.version)}</span>` : ''}</span>`).join('')}</li>`).join('');
  return `<details class="chains" open><summary>${group.label} <span class="filter-count">${group.paths.length}${group.limited ? ' (limited)' : ''}</span></summary>${paths ? `<ul class="chain-list">${paths}</ul>` : '<p class="path-note">Dependency path unavailable.</p>'}${group.limited ? `<p class="path-note">${PATH_LIMIT_NOTE}</p>` : ''}</details>`;
}

function renderChange(change, index) {
  const search = [change.name, change.id, version(change.before), version(change.after), ...change.fields, ...change.findings.map((finding) => `${finding.code} ${finding.message}`), ...pathGroups(change).flatMap((group) => group.paths.map(pathLabel))].join(' ');
  const findings = change.findings.length ? `<ul class="signals">${change.findings.map((finding) => `<li class="signal${finding.severity === 'review' ? ' signal-review' : ''}"><span class="signal-label">${finding.severity === 'review' ? 'Review' : 'Info'}:</span>${html(finding.message)}${finding.code ? `<span class="signal-code">${html(finding.code)}</span>` : ''}</li>`).join('')}</ul>` : '';
  return `<article class="change" data-change data-kind="${change.kind}" data-review="${change.needsReview}" data-search="${html(search)}" aria-labelledby="package-${index}">
<div class="change-header"><div><h2 class="package-title" id="package-${index}">${html(change.name)}</h2>${change.id ? `<p class="package-location">${html(change.id)}</p>` : ''}</div><div class="badges"><span class="badge badge-${change.kind}">${change.kind}</span>${change.needsReview ? '<span class="badge badge-review">needs review</span>' : ''}</div></div>
<div class="version-line"><span class="sr-only">Before:</span><span class="version version-before">${html(version(change.before))}</span><span class="version-arrow" aria-hidden="true">→</span><span class="sr-only">After:</span><span class="version version-after">${html(version(change.after))}</span></div>
${change.fields.length ? `<div class="field-list" aria-label="Changed fields">${change.fields.map((field) => `<span class="field">${html(field)}</span>`).join('')}</div>` : ''}
${findings}${pathGroups(change).map(renderPathGroup).join('')}
</article>`;
}

export function renderHtml(report) {
  const view = normalize(report);
  const { counts } = view;
  const scriptHash = createHash('sha256').update(FILTER_SCRIPT).digest('base64');
  const csp = `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const filters = [['all', 'All changes', view.changes.length], ['review', 'Needs review', counts.review], ['added', 'Added', counts.added], ['changed', 'Changed', counts.changed], ['removed', 'Removed', counts.removed]];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${html(csp)}"><meta name="color-scheme" content="light"><title>Locktrail · Dependency change review</title><style>${STYLE}</style></head>
<body><a class="skip" href="#changes">Skip to dependency changes</a><header class="masthead"><div class="shell"><div class="brand"><span class="mark" aria-hidden="true"></span>locktrail</div><div class="edition">Dependency change review<br>Local report / npm lockfile</div></div></header>
<main class="shell"><section class="hero" aria-labelledby="report-title"><p class="eyebrow">Follow the dependency trail</p><h1 id="report-title">Know what changed.</h1><p class="intro">Every package change, its review signals, and the dependency paths that explain how it reached your project.</p><div class="comparison"><span class="file-label">${html(view.beforeLabel)}</span><span class="compare-arrow" aria-hidden="true">→</span><span class="sr-only">compared with</span><span class="file-label">${html(view.afterLabel)}</span></div></section>
<section class="stats" aria-label="Change summary"><div class="stat"><span class="stat-number">${counts.added}</span><span class="stat-label">Packages added</span></div><div class="stat"><span class="stat-number">${counts.changed}</span><span class="stat-label">Packages changed</span></div><div class="stat"><span class="stat-number">${counts.removed}</span><span class="stat-label">Packages removed</span></div><div class="stat"><span class="stat-number">${counts.review}</span><span class="stat-label">Packages needing review</span></div></section>
<p class="review-note">${counts.signals} review signal${counts.signals === 1 ? '' : 's'}. Signals identify changes worth a closer look; they do not prove a package is unsafe.</p>
${view.warnings.length ? `<aside class="warnings" aria-labelledby="warnings-title"><h2 id="warnings-title">Report warnings</h2><ul>${view.warnings.map((warning) => `<li>${html(warning)}</li>`).join('')}</ul></aside>` : ''}
<section id="changes" aria-label="Dependency changes"><div class="toolbar"><div class="filters" role="group" aria-label="Filter dependency changes">${filters.map(([key, label, count]) => `<button class="filter" type="button" data-filter="${key}" aria-pressed="${key === 'all'}">${label}<span class="filter-count" aria-hidden="true">${count}</span></button>`).join('')}</div><div class="search-wrap"><label class="sr-only" for="search">Search packages, paths, or signals</label><input class="search" id="search" type="search" placeholder="Search packages, paths, or signals…" autocomplete="off"></div></div><noscript><p class="noscript">All changes are shown. Enable JavaScript to use search and filters.</p></noscript><div class="result-line"><span id="result-count" role="status" aria-live="polite">${view.changes.length} of ${view.changes.length} package changes</span><span class="result-hint">Open dependency paths to trace a change</span></div>
${view.changes.map(renderChange).join('\n')}
${!view.changes.length ? '<div class="empty"><h2>No dependency changes found.</h2><p>The compared lockfiles have no package changes to report.</p></div>' : ''}<div class="empty" id="no-results" hidden><h2>No matching packages.</h2><p>Try a different search or select All changes.</p></div></section>
<footer class="footer"><div><strong>${DISCLAIMER}</strong><p>Use the source diff and package context to make your review decisions.</p></div><div class="offline"><span class="offline-dot" aria-hidden="true"></span>Self-contained report<br>No external assets or network requests</div></footer></main>
<script>${FILTER_SCRIPT}</script></body></html>\n`;
}
