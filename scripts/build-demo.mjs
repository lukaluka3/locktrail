import { readFileSync, writeFileSync } from 'node:fs';
import { analyze, renderHtml } from '../src/index.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../examples/${name}.package-lock.json`, import.meta.url), 'utf8'));
const report = analyze(read('before'), read('after'));
report.meta = { beforeLabel: 'Synthetic example / before', afterLabel: 'Synthetic example / after' };
const source = '<a href="https://github.com/lukaluka3/locktrail">View source on GitHub ↗</a>';
const page = renderHtml(report).replace('</footer>', `${source}</footer>`);
writeFileSync(new URL('../docs/index.html', import.meta.url), page);
console.log('Built docs/index.html from the synthetic demo fixtures.');
