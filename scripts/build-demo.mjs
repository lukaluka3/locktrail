import { readFileSync, writeFileSync } from 'node:fs';
import { analyze, renderHtml } from '../src/index.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../examples/${name}.package-lock.json`, import.meta.url), 'utf8'));
const report = analyze(read('before'), read('after'));
report.meta = { beforeLabel: 'Synthetic example / before', afterLabel: 'Synthetic example / after' };
const source = '<a href="https://github.com/lukaluka3/locktrail">View source on GitHub ↗</a>';
const nextStep = `<aside class="demo-next" aria-label="Try Locktrail on your repository"><p>This is a synthetic example. Review your own npm update in one command.</p><a href="https://github.com/lukaluka3/locktrail#run-on-your-repository">Run on your repository ↗</a></aside>`;
const demoStyle = `.demo-next{display:flex;gap:16px;align-items:center;justify-content:space-between;margin:24px 0 0;padding:16px 18px;border:1px solid var(--line);border-radius:8px;background:var(--card)}.demo-next p{margin:0;font-size:13px;color:var(--muted)}.demo-next a{display:inline-block;flex-shrink:0;background:var(--green);color:var(--card);padding:10px 14px;border-radius:5px;text-decoration:none;font-size:12px;font-weight:600}.demo-next a:hover{background:var(--ink)}@media(max-width:720px){.demo-next{align-items:flex-start;flex-direction:column}}`;
const page = renderHtml(report)
  .replace('</style>', `${demoStyle}</style>`)
  .replace('<div class="comparison">', `${nextStep}<div class="comparison">`)
  .replace('</footer>', `${source}</footer>`);
writeFileSync(new URL('../docs/index.html', import.meta.url), page);
console.log('Built docs/index.html from the synthetic demo fixtures.');
