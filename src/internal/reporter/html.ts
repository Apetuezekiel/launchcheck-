import type { CheckResult } from '../../types/index.js';
import { LAUNCHCHECK_VERSION } from '../version.js';

/** HTML-escapes text for safe interpolation into the report. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STATUS_ORDER: Record<CheckResult['status'], number> = { fail: 0, warn: 1, skip: 2, pass: 3 };

function compare(a: CheckResult, b: CheckResult): number {
  const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (s !== 0) return s;
  if (a.checkerId !== b.checkerId) return a.checkerId < b.checkerId ? -1 : 1;
  return a.resultId < b.resultId ? -1 : a.resultId > b.resultId ? 1 : 0;
}

function locationText(loc: { file: string; line?: number; column?: number }): string {
  if (loc.line === undefined) return loc.file;
  if (loc.column === undefined) return `${loc.file}:${loc.line}`;
  return `${loc.file}:${loc.line}:${loc.column}`;
}

function renderFinding(r: CheckResult): string {
  const parts: string[] = [];
  parts.push(`<div class="finding ${r.status}">`);
  parts.push(
    `<div class="head"><span class="badge ${r.status}">${r.status.toUpperCase()}</span>` +
      `<span class="id">${esc(r.checkerId)}/${esc(r.resultId)}</span>` +
      `<span class="sev">${esc(r.severity)}</span></div>`,
  );
  parts.push(`<div class="msg">${esc(r.message)}</div>`);
  if (r.detail !== undefined && r.detail.length > 0) {
    parts.push(`<pre class="detail">${esc(r.detail)}</pre>`);
  }
  if (r.location !== undefined) {
    parts.push(`<div class="loc">at ${esc(locationText(r.location))}</div>`);
  }
  if (r.fix !== undefined) {
    parts.push(`<div class="fix">fix: ${esc(r.fix)}</div>`);
  }
  parts.push('</div>');
  return parts.join('');
}

const STYLE = `
:root { color-scheme: light dark; }
body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; }
h1 { margin-bottom: 0.25rem; }
.summary { margin: 0.5rem 0 1.5rem; font-size: 0.95rem; }
.summary .fail { color: #c0392b; } .summary .warn { color: #b7791f; }
.summary .pass { color: #2e7d32; } .summary .skip { color: #777; }
h2.group { margin-top: 2rem; border-bottom: 1px solid #8884; padding-bottom: 0.25rem; word-break: break-all; }
.finding { border-left: 4px solid #8888; padding: 0.5rem 0.75rem; margin: 0.5rem 0; background: #8881; border-radius: 0 4px 4px 0; }
.finding.fail { border-color: #c0392b; } .finding.warn { border-color: #b7791f; }
.finding.pass { border-color: #2e7d32; } .finding.skip { border-color: #999; }
.head { display: flex; gap: 0.5rem; align-items: baseline; }
.badge { font-size: 0.7rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 3px; color: #fff; }
.badge.fail { background: #c0392b; } .badge.warn { background: #b7791f; }
.badge.pass { background: #2e7d32; } .badge.skip { background: #999; }
.id { font-weight: 600; } .sev { color: #888; font-size: 0.85rem; }
.msg { margin: 0.35rem 0; }
.detail, .loc { color: #888; font-size: 0.85rem; white-space: pre-wrap; }
.fix { color: #1565c0; font-size: 0.9rem; margin-top: 0.25rem; }
footer { margin-top: 2.5rem; color: #888; font-size: 0.8rem; }
`;

/**
 * Renders results as a single self-contained, shareable HTML report. Inline CSS,
 * no external assets, no scripts. Findings are grouped by URL when the run
 * targeted live URLs (static findings under "Project"), then ordered
 * fail → warn → skip → pass. All dynamic text is HTML-escaped.
 */
export function formatHtml(results: ReadonlyArray<CheckResult>): string {
  const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const r of results) counts[r.status] += 1;

  // Group by URL; '' is the static / no-URL bucket, always rendered last.
  const groups = new Map<string, CheckResult[]>();
  for (const r of results) {
    const key = r.url ?? '';
    const arr = groups.get(key);
    if (arr === undefined) {
      groups.set(key, [r]);
    } else {
      arr.push(r);
    }
  }
  const urlKeys = [...groups.keys()].filter((k) => k !== '').sort();
  const orderedKeys = groups.has('') ? [...urlKeys, ''] : urlKeys;

  const sections: string[] = [];
  for (const key of orderedKeys) {
    const items = groups.get(key);
    if (items === undefined) continue;
    items.sort(compare);
    const heading = key === '' ? 'Project' : esc(key);
    sections.push(`<h2 class="group">${heading}</h2>`);
    sections.push(items.map(renderFinding).join('\n'));
  }

  const summary =
    `<span class="fail">${counts.fail} failed</span>, ` +
    `<span class="warn">${counts.warn} warned</span>, ` +
    `<span class="pass">${counts.pass} passed</span>, ` +
    `<span class="skip">${counts.skip} skipped</span>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>launchcheck report</title>
<style>${STYLE}</style>
</head>
<body>
<h1>launchcheck report</h1>
<div class="summary">${summary}</div>
${sections.join('\n')}
<footer>Generated by launchcheck v${esc(LAUNCHCHECK_VERSION)}</footer>
</body>
</html>
`;
}
