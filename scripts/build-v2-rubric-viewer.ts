/**
 * Build a self-contained HTML viewer for samples/v2-rubric-test-results.jsonl.
 *
 * Output: samples/v2-rubric-test-results.html
 *
 * The HTML is fully offline — data is inlined as JSON in a <script> tag,
 * no fetch / no external CDN. Open with file:// in any browser.
 *
 * Usage: npx tsx scripts/build-v2-rubric-viewer.ts
 */

import { promises as fs } from 'fs';
import path from 'path';

const JSONL_PATH = path.resolve('samples/v2-rubric-test-results.jsonl');
const HTML_PATH = path.resolve('samples/v2-rubric-test-results.html');

interface Row {
  spov_id: number;
  brainlift_slug: string;
  spov_text: string;
  word_count: number;
  old_score: number | null;
  old_quality_raw: number | null;
  new_score: number;
  position_summary: string;
  framework_dependency: string;
  key_evidence: string[];
  criteria: Record<string, { assessment: string; evidence: string }>;
  rationale: string;
  feedback: string;
  divergence_source: string;
  error?: string;
}

async function main(): Promise<void> {
  const text = await fs.readFile(JSONL_PATH, 'utf-8');
  const rows: Row[] = text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  // Embed as JSON to avoid escaping pitfalls
  const dataJson = JSON.stringify(rows).replace(/</g, '\\u003c');

  const html = renderHtml(dataJson, rows.length);
  await fs.writeFile(HTML_PATH, html);
  console.log(`Wrote ${HTML_PATH} (${(html.length / 1024).toFixed(1)} KB, ${rows.length} rows)`);
}

function renderHtml(dataJson: string, rowCount: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DOK4 v2 Rubric Test Results (${rowCount} SPOVs)</title>
<style>
  :root {
    --bg: #faf7f2;
    --surface: #ffffff;
    --surface-alt: #f3eee5;
    --border: #e3dccd;
    --text: #2a261f;
    --muted: #6b6357;
    --primary: #8a5a2b;
    --strong: #2f7d3a;
    --partial: #b8860b;
    --weak: #b3361b;
    --rose: #2f7d3a;
    --same: #6b6357;
    --dropped: #b3361b;
    --shadow: 0 2px 6px rgba(0,0,0,0.06);
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
  }

  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

  h1 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 28px;
    margin: 0 0 4px 0;
    font-weight: 600;
  }
  .subtitle { color: var(--muted); margin-bottom: 24px; font-size: 13px; }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    box-shadow: var(--shadow);
  }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--muted); font-weight: 600; }
  .stat-value { font-size: 22px; font-family: Georgia, serif; margin-top: 4px; }

  .controls {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
    box-shadow: var(--shadow);
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .control { display: flex; flex-direction: column; gap: 4px; }
  .control label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--muted); font-weight: 600; }
  .control select, .control input {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-alt);
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
  }
  .control input[type="text"] { min-width: 220px; }

  .row-count {
    margin-left: auto;
    font-size: 12px;
    color: var(--muted);
    font-style: italic;
  }

  details.spov {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 8px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  details.spov[open] { border-color: var(--primary); }

  summary {
    cursor: pointer;
    padding: 12px 16px;
    list-style: none;
    display: grid;
    grid-template-columns: 60px 90px 1fr 70px;
    gap: 12px;
    align-items: center;
  }
  summary::-webkit-details-marker { display: none; }
  summary:hover { background: var(--surface-alt); }

  .id-cell { font-family: "SF Mono", Menlo, monospace; font-size: 12px; color: var(--muted); }
  .delta-cell {
    font-family: "SF Mono", Menlo, monospace;
    font-size: 13px;
    font-weight: 600;
    text-align: center;
  }
  .delta-rose { color: var(--rose); }
  .delta-same { color: var(--same); }
  .delta-dropped { color: var(--dropped); }
  .text-cell {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wc-cell {
    font-family: "SF Mono", Menlo, monospace;
    font-size: 11px;
    color: var(--muted);
    text-align: right;
  }

  .body { padding: 4px 20px 20px; border-top: 1px solid var(--border); }

  .field {
    margin-top: 16px;
  }
  .field-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--muted);
    font-weight: 700;
    margin-bottom: 6px;
  }
  .field-value {
    background: var(--surface-alt);
    border-left: 3px solid var(--primary);
    padding: 10px 14px;
    border-radius: 0 6px 6px 0;
    font-size: 13.5px;
  }
  .field-value.serif { font-family: Georgia, serif; font-size: 15px; line-height: 1.55; }

  .criteria-axes { margin-top: 16px; }
  .axis { margin-top: 14px; }
  .axis-header {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-weight: 700;
    color: var(--primary);
    margin-bottom: 6px;
  }
  .axis-question { font-style: italic; color: var(--muted); font-weight: 400; margin-left: 8px; }
  .criteria-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 10px;
  }
  .criterion {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px;
  }
  .criterion-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .criterion-name { font-weight: 600; font-size: 12px; }
  .pill {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .pill.strong { background: #d8edd9; color: var(--strong); }
  .pill.partial { background: #fae8c4; color: var(--partial); }
  .pill.weak { background: #f4d3cc; color: var(--weak); }
  .criterion-evidence { font-size: 12px; color: var(--text); line-height: 1.45; }

  .score-chip {
    display: inline-block;
    width: 22px;
    height: 22px;
    line-height: 22px;
    border-radius: 50%;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    font-family: "SF Mono", Menlo, monospace;
    font-weight: 600;
    text-align: center;
    font-size: 12px;
  }
  .score-chip.s5 { background: #d8edd9; color: var(--strong); border-color: #c4dfc4; }
  .score-chip.s4 { background: #e7f0d9; color: #4f7128; border-color: #d6e3c4; }
  .score-chip.s3 { background: #fae8c4; color: var(--partial); border-color: #f0d8a8; }
  .score-chip.s2 { background: #f4d3cc; color: var(--weak); border-color: #e8bcb2; }
  .score-chip.s1 { background: #ecbcb2; color: #8a2615; border-color: #d8a39a; }

  .key-evidence-list { margin: 0; padding-left: 20px; }
  .key-evidence-list li { margin-bottom: 4px; font-size: 13px; }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 12px;
    font-size: 11px;
    color: var(--muted);
  }
  .meta-item { display: flex; gap: 4px; }
  .meta-item strong { color: var(--text); font-weight: 600; }

  .empty-state {
    text-align: center;
    padding: 48px;
    color: var(--muted);
    font-style: italic;
  }
</style>
</head>
<body>
<div class="container">
  <h1>DOK4 v2 Rubric Test Results</h1>
  <p class="subtitle">${rowCount} SPOVs from <code>dok1grader_clone</code> regraded with the v2 prompt. Read-only diagnostic.</p>

  <div class="stats-grid" id="stats"></div>

  <div class="controls">
    <div class="control">
      <label>Search</label>
      <input type="text" id="search" placeholder="text, slug, rationale...">
    </div>
    <div class="control">
      <label>Direction</label>
      <select id="filter-direction">
        <option value="all">All</option>
        <option value="dropped">Dropped</option>
        <option value="same">Same</option>
        <option value="rose">Rose</option>
      </select>
    </div>
    <div class="control">
      <label>Old Score</label>
      <select id="filter-old">
        <option value="all">All</option>
        <option value="5">5</option>
        <option value="4">4</option>
        <option value="3">3</option>
        <option value="2">2</option>
        <option value="1">1</option>
      </select>
    </div>
    <div class="control">
      <label>New Score</label>
      <select id="filter-new">
        <option value="all">All</option>
        <option value="5">5</option>
        <option value="4">4</option>
        <option value="3">3</option>
        <option value="2">2</option>
        <option value="1">1</option>
      </select>
    </div>
    <div class="control">
      <label>Sort</label>
      <select id="sort">
        <option value="delta-asc">Delta (down first)</option>
        <option value="delta-desc">Delta (up first)</option>
        <option value="wc-desc">Word count (long first)</option>
        <option value="wc-asc">Word count (short first)</option>
        <option value="new-desc">New score (high first)</option>
        <option value="new-asc">New score (low first)</option>
        <option value="old-desc">Old score (high first)</option>
        <option value="old-asc">Old score (low first)</option>
        <option value="id-asc">SPOV id</option>
      </select>
    </div>
    <div class="control">
      <label>&nbsp;</label>
      <button id="expand-all" style="padding:6px 12px; border:1px solid var(--border); background:var(--surface-alt); color:var(--text); border-radius:6px; cursor:pointer; font-size:12px;">Expand all</button>
    </div>
    <div class="control">
      <label>&nbsp;</label>
      <button id="collapse-all" style="padding:6px 12px; border:1px solid var(--border); background:var(--surface-alt); color:var(--text); border-radius:6px; cursor:pointer; font-size:12px;">Collapse all</button>
    </div>
    <div class="row-count" id="row-count"></div>
  </div>

  <div id="rows"></div>
</div>

<script>
const DATA = ${dataJson};

const SPIKINESS_KEYS = ['S1', 'S4', 'P1'];
const OWNERSHIP_KEYS = ['S2', 'S3', 'O2'];
const LEGACY_KEYS = ['S5', 'O1'];
const CRITERION_NAMES = {
  S1: 'Contested',
  S4: 'Clear Side',
  P1: 'Punchiness',
  S2: 'LLM Divergence',
  S3: 'Grounded & Traceable',
  O2: 'Distinct Voice',
  S5: 'Cross-Domain (legacy)',
  O1: 'Causal Reasoning (legacy)',
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function deltaClass(d) {
  if (d > 0) return 'delta-rose';
  if (d < 0) return 'delta-dropped';
  return 'delta-same';
}
function deltaText(d) {
  if (d > 0) return '↑ +' + d;
  if (d < 0) return '↓ ' + d;
  return '= 0';
}

function scoreChip(score) {
  return '<span class="score-chip s' + score + '">' + score + '</span>';
}

function renderCriterion(key, c) {
  if (!c) return '';
  const assessment = (c.assessment || '').toLowerCase();
  return \`
    <div class="criterion">
      <div class="criterion-head">
        <span class="criterion-name">\${key} — \${escapeHtml(CRITERION_NAMES[key] || key)}</span>
        <span class="pill \${assessment}">\${escapeHtml(c.assessment)}</span>
      </div>
      <div class="criterion-evidence">\${escapeHtml(c.evidence)}</div>
    </div>\`;
}

function renderAxis(label, question, keys, criteria) {
  const present = keys.filter(k => criteria && criteria[k]);
  if (present.length === 0) return '';
  return \`
    <div class="axis">
      <div class="axis-header">\${label} <span class="axis-question">— \${question}</span></div>
      <div class="criteria-grid">
        \${present.map(k => renderCriterion(k, criteria[k])).join('')}
      </div>
    </div>\`;
}

function renderRow(r) {
  const delta = (r.new_score ?? 0) - (r.old_score ?? 0);
  const errBadge = r.error ? '<span style="color:var(--weak); font-weight:600;"> ERROR</span>' : '';

  return \`
    <details class="spov">
      <summary>
        <span class="id-cell">#\${r.spov_id}</span>
        <span class="delta-cell">
          \${scoreChip(r.old_score ?? '?')} → \${scoreChip(r.new_score)}
          <div class="\${deltaClass(delta)}" style="font-size:11px; margin-top:2px;">\${deltaText(delta)}</div>
        </span>
        <span class="text-cell">\${escapeHtml(r.spov_text)}\${errBadge}</span>
        <span class="wc-cell">\${r.word_count}w</span>
      </summary>
      <div class="body">
        <div class="meta-row">
          <span class="meta-item"><strong>Brainlift:</strong> \${escapeHtml(r.brainlift_slug)}</span>
          <span class="meta-item"><strong>Old quality raw:</strong> \${r.old_quality_raw ?? '?'}</span>
          <span class="meta-item"><strong>Word count:</strong> \${r.word_count}</span>
          <span class="meta-item"><strong>Divergence:</strong> \${escapeHtml(r.divergence_source)}</span>
          \${r.framework_dependency ? '<span class="meta-item"><strong>Framework:</strong> ' + escapeHtml(r.framework_dependency) + '</span>' : ''}
        </div>

        \${r.error ? '<div class="field"><div class="field-label">Error</div><div class="field-value" style="border-left-color: var(--weak); color: var(--weak);">' + escapeHtml(r.error) + '</div></div>' : ''}

        <div class="field">
          <div class="field-label">SPOV Text</div>
          <div class="field-value serif">\${escapeHtml(r.spov_text)}</div>
        </div>

        \${r.position_summary ? \`
        <div class="field">
          <div class="field-label">Position Summary (grader's restatement)</div>
          <div class="field-value">\${escapeHtml(r.position_summary)}</div>
        </div>\` : ''}

        \${r.criteria && Object.keys(r.criteria).length > 0 ? \`
        <div class="criteria-axes">
          \${renderAxis('Spikiness', 'Is the form right?', SPIKINESS_KEYS, r.criteria)}
          \${renderAxis('Ownership', 'Did the student really make this?', OWNERSHIP_KEYS, r.criteria)}
          \${renderAxis('Legacy criteria', 'From v1 rubric', LEGACY_KEYS, r.criteria)}
        </div>\` : ''}

        \${r.rationale ? \`
        <div class="field">
          <div class="field-label">Rationale</div>
          <div class="field-value">\${escapeHtml(r.rationale)}</div>
        </div>\` : ''}

        \${r.feedback ? \`
        <div class="field">
          <div class="field-label">Feedback to Student</div>
          <div class="field-value">\${escapeHtml(r.feedback)}</div>
        </div>\` : ''}

        \${r.key_evidence && r.key_evidence.length > 0 ? \`
        <div class="field">
          <div class="field-label">Key Evidence (from chain)</div>
          <ul class="key-evidence-list">
            \${r.key_evidence.map(e => '<li>' + escapeHtml(e) + '</li>').join('')}
          </ul>
        </div>\` : ''}
      </div>
    </details>\`;
}

function renderStats(rows) {
  const valid = rows.filter(r => !r.error && r.new_score > 0);
  const total = rows.length;
  const dropped = valid.filter(r => r.new_score < (r.old_score ?? 0)).length;
  const same = valid.filter(r => r.new_score === (r.old_score ?? 0)).length;
  const rose = valid.filter(r => r.new_score > (r.old_score ?? 0)).length;
  const errs = rows.filter(r => r.error).length;
  const wc = valid.map(r => r.word_count);
  const meanWc = wc.length ? Math.round(wc.reduce((a,b)=>a+b,0)/wc.length) : 0;

  // Length-vs-score correlations (spearman on rank would be better; just use Pearson for simplicity)
  function pearson(xs, ys) {
    const n = xs.length;
    if (n === 0) return 0;
    const mx = xs.reduce((a,b)=>a+b,0)/n;
    const my = ys.reduce((a,b)=>a+b,0)/n;
    let num=0, dx2=0, dy2=0;
    for (let i=0;i<n;i++){ const dx=xs[i]-mx, dy=ys[i]-my; num+=dx*dy; dx2+=dx*dx; dy2+=dy*dy; }
    return (dx2*dy2 > 0) ? (num / Math.sqrt(dx2*dy2)) : 0;
  }
  const corrOld = pearson(wc, valid.map(r => r.old_score ?? 0));
  const corrNew = pearson(wc, valid.map(r => r.new_score));

  const html = [
    \`<div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">\${total}</div></div>\`,
    \`<div class="stat-card"><div class="stat-label">Dropped</div><div class="stat-value" style="color: var(--dropped)">\${dropped}</div></div>\`,
    \`<div class="stat-card"><div class="stat-label">Same</div><div class="stat-value" style="color: var(--same)">\${same}</div></div>\`,
    \`<div class="stat-card"><div class="stat-label">Rose</div><div class="stat-value" style="color: var(--rose)">\${rose}</div></div>\`,
    \`<div class="stat-card"><div class="stat-label">Length × old score</div><div class="stat-value">\${corrOld.toFixed(2)}</div></div>\`,
    \`<div class="stat-card"><div class="stat-label">Length × new score</div><div class="stat-value">\${corrNew.toFixed(2)}</div></div>\`,
    errs > 0 ? \`<div class="stat-card"><div class="stat-label">Errors</div><div class="stat-value" style="color: var(--weak)">\${errs}</div></div>\` : '',
  ].join('');
  document.getElementById('stats').innerHTML = html;
}

function applyFiltersAndSort() {
  const q = (document.getElementById('search').value || '').toLowerCase();
  const dir = document.getElementById('filter-direction').value;
  const oldSel = document.getElementById('filter-old').value;
  const newSel = document.getElementById('filter-new').value;
  const sort = document.getElementById('sort').value;

  let rows = DATA.slice();

  if (q) {
    rows = rows.filter(r =>
      (r.spov_text || '').toLowerCase().includes(q) ||
      (r.brainlift_slug || '').toLowerCase().includes(q) ||
      (r.rationale || '').toLowerCase().includes(q) ||
      (r.position_summary || '').toLowerCase().includes(q) ||
      (r.feedback || '').toLowerCase().includes(q)
    );
  }
  if (dir !== 'all') {
    rows = rows.filter(r => {
      const d = r.new_score - (r.old_score ?? 0);
      if (dir === 'dropped') return d < 0;
      if (dir === 'rose') return d > 0;
      if (dir === 'same') return d === 0;
      return true;
    });
  }
  if (oldSel !== 'all') rows = rows.filter(r => String(r.old_score) === oldSel);
  if (newSel !== 'all') rows = rows.filter(r => String(r.new_score) === newSel);

  rows.sort((a, b) => {
    const da = a.new_score - (a.old_score ?? 0);
    const db = b.new_score - (b.old_score ?? 0);
    switch (sort) {
      case 'delta-asc': return da - db;
      case 'delta-desc': return db - da;
      case 'wc-desc': return b.word_count - a.word_count;
      case 'wc-asc': return a.word_count - b.word_count;
      case 'new-desc': return b.new_score - a.new_score;
      case 'new-asc': return a.new_score - b.new_score;
      case 'old-desc': return (b.old_score ?? 0) - (a.old_score ?? 0);
      case 'old-asc': return (a.old_score ?? 0) - (b.old_score ?? 0);
      case 'id-asc': return a.spov_id - b.spov_id;
      default: return 0;
    }
  });

  document.getElementById('row-count').textContent = rows.length + ' / ' + DATA.length + ' shown';

  const container = document.getElementById('rows');
  if (rows.length === 0) {
    container.innerHTML = '<div class="empty-state">No SPOVs match these filters.</div>';
    return;
  }
  container.innerHTML = rows.map(renderRow).join('');
}

renderStats(DATA);
applyFiltersAndSort();

document.getElementById('search').addEventListener('input', applyFiltersAndSort);
document.getElementById('filter-direction').addEventListener('change', applyFiltersAndSort);
document.getElementById('filter-old').addEventListener('change', applyFiltersAndSort);
document.getElementById('filter-new').addEventListener('change', applyFiltersAndSort);
document.getElementById('sort').addEventListener('change', applyFiltersAndSort);
document.getElementById('expand-all').addEventListener('click', () => {
  document.querySelectorAll('details.spov').forEach(d => d.open = true);
});
document.getElementById('collapse-all').addEventListener('click', () => {
  document.querySelectorAll('details.spov').forEach(d => d.open = false);
});
</script>
</body>
</html>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
