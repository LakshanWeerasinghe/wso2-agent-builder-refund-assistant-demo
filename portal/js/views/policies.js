// Policy library: seasonal timeline, documents grouped by scope, chunk preview, re-indexing and upload.
import {
  el, flag, regionName, languageName, formatDate, formatDateTime, badge, scopeBadge,
  openModal, openPdfViewer, toast, emptyState, errorState, spinner, icon,
} from '../ui.js';

const REGIONS = ['EUROPE', 'AFRICA', 'AMERICAS', 'ASIA_PACIFIC'];
const SCOPE_RANK = { GLOBAL: 1, REGION: 2, COUNTRY: 3, HOTEL: 4 };
const LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'ja', 'pt', 'nl'];
const TODAY = '2026-11-14';
const TIMELINE_START = '2026-01-01';
const TIMELINE_END = '2027-04-01'; // exclusive: the timeline runs to the end of March 2027
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS = {
  INDEXED: { label: 'Indexed', variant: 'success' },
  STALE: { label: 'Stale', variant: 'warning' },
  FAILED: { label: 'Failed', variant: 'danger' },
  NOT_INDEXED: { label: 'Not indexed', variant: 'neutral' },
};

// Used for the upload form when the refund API cannot be reached.
const FALLBACK_COUNTRIES = {
  EUROPE: [['FR', 'France'], ['DE', 'Germany'], ['ES', 'Spain'], ['IT', 'Italy'], ['GB', 'United Kingdom'], ['NL', 'Netherlands'], ['PT', 'Portugal']],
  AFRICA: [['ZA', 'South Africa'], ['KE', 'Kenya'], ['MA', 'Morocco'], ['EG', 'Egypt']],
  AMERICAS: [['US', 'United States'], ['CA', 'Canada'], ['MX', 'Mexico']],
  ASIA_PACIFIC: [['JP', 'Japan'], ['SG', 'Singapore'], ['TH', 'Thailand'], ['IN', 'India']],
};
const FALLBACK_HOTELS = {
  FR: [['PAR-OPE', 'Paris Opéra'], ['NCE-PRO', 'Nice Promenade']], DE: [['BER-MIT', 'Berlin Mitte'], ['MUC-ALT', 'Munich Altstadt']],
  ES: [['BCN-GOT', 'Barcelona Gòtic'], ['MAD-RET', 'Madrid Retiro']], IT: [['ROM-TRA', 'Rome Trastevere'], ['VCE-CAN', 'Venice Canal Grande']],
  GB: [['LON-MAY', 'London Mayfair'], ['EDI-OLD', 'Edinburgh Old Town']], NL: [['AMS-CAN', 'Amsterdam Canal Ring']], PT: [['LIS-ALF', 'Lisbon Alfama']],
  ZA: [['CPT-WAT', 'Cape Town Waterfront'], ['JNB-SAN', 'Johannesburg Sandton']], KE: [['NBO-KAR', 'Nairobi Karen'], ['MAR-SAF', 'Maasai Mara Safari Lodge']],
  MA: [['RAK-MED', 'Marrakech Medina']], EG: [['CAI-NIL', 'Cairo Nile Corniche']],
  US: [['NYC-MID', 'New York Midtown'], ['MIA-BCH', 'Miami Beach'], ['SFO-EMB', 'San Francisco Embarcadero']],
  CA: [['YYZ-HAR', 'Toronto Harbourfront']], MX: [['CUN-RIV', 'Cancún Riviera']],
  JP: [['KYO-GIO', 'Kyoto Gion'], ['TYO-GIN', 'Tokyo Ginza']], SG: [['SIN-MAR', 'Singapore Marina']],
  TH: [['BKK-RIV', 'Bangkok Riverside'], ['HKT-KAT', 'Phuket Kata Beach']], IN: [['BOM-MAR', 'Mumbai Marine Drive']],
};

// View state that survives re-renders (region switch, refresh after an action).
const viewState = { query: '', language: '', type: '', highlight: null };
let renderToken = 0;

export function render(container, ctx) {
  return draw(container, ctx, false);
}

// soft: keep the current view on screen while reloading (after an action).
async function draw(container, ctx, soft) {
  const token = ++renderToken;
  if (!soft || !container.querySelector('.pol-view')) {
    container.replaceChildren(el('div', { class: 'pol-view' }, spinner('Loading the policy library…')));
  }

  let policies;
  let health = null;
  try {
    const [list, h] = await Promise.all([
      ctx.api.policyApi.list(),
      ctx.api.policyApi.health().catch(() => null),
    ]);
    policies = Array.isArray(list) ? list : [];
    health = h;
  } catch (err) {
    if (token !== renderToken) return;
    container.replaceChildren(el('div', { class: 'pol-view' },
      header(ctx, container, null, []),
      errorState('Policy service unavailable', err, () => draw(container, ctx, false))));
    return;
  }
  if (token !== renderToken) return;

  const scoped = policies.filter((p) => inFilter(p, ctx.state || {}));
  const view = el('div', { class: 'pol-view' },
    header(ctx, container, health, policies),
    timeline(ctx, scoped),
    library(ctx, container, scoped, policies.length));
  container.replaceChildren(view);

  if (viewState.highlight) {
    const row = view.querySelector(`[data-doc-id="${CSS.escape(viewState.highlight)}"]`);
    viewState.highlight = null;
    if (row) {
      row.classList.add('pol-row-flash');
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}

// ---------------------------------------------------------------- header

function header(ctx, container, health, policies) {
  const indexed = policies.filter((p) => p.ingestion?.status === 'INDEXED').length;
  const attention = policies.filter((p) => ['STALE', 'FAILED', 'NOT_INDEXED'].includes(p.ingestion?.status)).length;
  const languages = new Set(policies.map((p) => p.language));
  const seasonalNow = policies.filter((p) => p.policyType === 'SEASONAL' && activeOn(p, TODAY)).length;
  const searchConfigured = health ? health.searchConfigured !== false : null;

  const indexAll = button('Index all', 'secondary', async (e) => {
    const btn = e.currentTarget;
    await busy(btn, 'Indexing…', async () => {
      try {
        const results = await ctx.api.policyApi.ingestAll(false);
        const list = Array.isArray(results) ? results : [];
        const count = (s) => list.filter((r) => r.status === s).length;
        const failed = count('FAILED');
        toast(`Indexed ${count('INDEXED')}, skipped ${count('SKIPPED')} unchanged${failed ? `, ${failed} failed` : ''}.`, failed ? 'warning' : 'success');
      } catch (err) {
        toast(err.message, 'danger');
      }
      await draw(container, ctx, true);
    });
  }, 'refresh');
  const upload = button('Upload policy', 'primary', () => openUpload(ctx, container), 'plus');

  return el('header', { class: 'pol-header' },
    el('div', { class: 'page-header pol-header-top' },
      el('div', { class: 'page-header__text' },
        el('div', { class: 'eyebrow', text: 'Knowledge · Azure AI Search' }),
        el('h1', { class: 'page-title', text: 'Policy library' }),
        el('p', { class: 'page-subtitle', text: 'The layered refund policy the agent reasons over: global policy, regional and country addenda, hotel rules and seasonal protocols. Each PDF is split by clause and indexed for retrieval.' })),
      el('div', { class: 'page-header__actions pol-header-actions' }, indexAll, upload)),
    el('div', { class: 'pol-stats' },
      stat(policies.length, 'Documents'),
      stat(languages.size, 'Languages', [...languages].map((l) => languageName(l)).join(' · ')),
      stat(`${indexed}/${policies.length}`, 'Indexed', attention ? `${attention} need attention` : 'All current', attention ? 'warning' : 'success'),
      stat(seasonalNow, 'Seasonal in force', `on ${formatDate(TODAY)}`),
      searchConfigured === false
        ? el('div', { class: 'pol-stat pol-stat-note' },
          el('div', { class: 'pol-stat-label', text: 'Azure AI Search' }),
          el('div', { class: 'pol-stat-sub', text: 'Not configured on policy-service — upload works, indexing is disabled.' }))
        : null));
}

function stat(value, label, sub, tone) {
  return el('div', { class: 'pol-stat' },
    el('div', { class: 'pol-stat-value', text: String(value) }),
    el('div', { class: 'pol-stat-label', text: label }),
    sub ? el('div', { class: `pol-stat-sub${tone ? ` pol-tone-${tone}` : ''}`, text: sub }) : null);
}

// ---------------------------------------------------------------- season timeline

function timeline(ctx, policies) {
  const seasonal = policies
    .filter((p) => p.policyType === 'SEASONAL')
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.documentId.localeCompare(b.documentId));

  const total = days(TIMELINE_START, TIMELINE_END);
  const pct = (iso) => `${(Math.min(Math.max(days(TIMELINE_START, iso), 0), total) / total) * 100}%`;

  const months = [];
  for (let i = 0; i < 15; i++) {
    const y = 2026 + Math.floor(i / 12);
    const m = i % 12;
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const next = m === 11 ? `${y + 1}-01-01` : `${y}-${String(m + 2).padStart(2, '0')}-01`;
    months.push(el('div', {
      class: `pol-tl-month${m === 0 ? ' pol-tl-year' : ''}${m % 3 === 0 ? ' pol-tl-quarter' : ''}`,
      style: `left:${pct(iso)};width:calc(${pct(next)} - ${pct(iso)})`,
    }, el('span', { text: MONTHS[m] })));
  }
  const years = [['2026-01-01', '2026'], ['2027-01-01', '2027']]
    .map(([iso, label]) => el('div', { class: 'pol-tl-yearlabel', style: `left:${pct(iso)}`, text: label }));

  const lanes = seasonal.map((p) => {
    const from = p.effectiveFrom;
    const toExclusive = p.effectiveTo ? addDays(p.effectiveTo, 1) : TIMELINE_END;
    const state = activeOn(p, TODAY) ? 'active' : (p.effectiveTo && p.effectiveTo < TODAY ? 'past' : 'upcoming');
    const stateLabel = { active: 'In force', past: 'Ended', upcoming: 'Upcoming' }[state];
    const windowText = `${shortDate(from)} – ${p.effectiveTo ? shortDate(p.effectiveTo) : 'open'}`;
    const bar = el('button', {
      type: 'button',
      class: `pol-tl-bar pol-tl-${state}`,
      style: `left:${pct(from)};width:calc(${pct(toExclusive)} - ${pct(from)})`,
      title: `${p.documentId} · ${windowText} · ${stateLabel}`,
      'aria-label': `${p.titleEnglish || p.title}, ${windowText}, ${stateLabel}. Open PDF.`,
      onClick: () => viewPdf(ctx, p),
    }, el('span', { class: 'pol-tl-bar-text', text: windowText }));
    return el('div', { class: 'pol-tl-lane' },
      el('div', { class: 'pol-tl-label' },
        el('div', { class: 'pol-tl-label-top' },
          el('span', { class: 'pol-tl-target', text: targetShort(p) }),
          el('span', { class: 'pol-tl-id', text: p.documentId })),
        el('div', { class: 'pol-tl-name', text: p.titleEnglish || p.title, title: p.titleEnglish || p.title })),
      el('div', { class: 'pol-tl-track' }, bar));
  });

  const body = seasonal.length
    ? el('div', { class: 'pol-tl-scroll' },
      el('div', { class: 'pol-tl' },
        el('div', { class: 'pol-tl-axis' },
          el('div', { class: 'pol-tl-label pol-tl-axis-label', text: 'Seasonal document' }),
          el('div', { class: 'pol-tl-track pol-tl-months' }, years, months)),
        el('div', { class: 'pol-tl-lanes' },
          lanes,
          el('div', { class: 'pol-tl-grid', 'aria-hidden': 'true' },
            el('div', { class: 'pol-tl-label' }),
            el('div', { class: 'pol-tl-track' },
              el('div', { class: 'pol-tl-elapsed', style: `width:${pct(TODAY)}` }),
              months.map((m) => el('div', { class: 'pol-tl-gridline', style: `left:${m.style.left}` })),
              el('div', { class: 'pol-tl-today', style: `left:${pct(TODAY)}` },
                el('span', { class: 'pol-tl-today-label', text: `Today · ${shortDate(TODAY)}` })))))))
    : el('div', { class: 'pol-tl-empty', text: 'No seasonal documents apply to the selected region.' });

  return el('section', { class: 'pol-card pol-timeline-card' },
    el('div', { class: 'pol-section-head' },
      el('div', {},
        el('h2', { class: 'pol-h2', text: 'Season timeline' }),
        el('p', { class: 'pol-section-sub', text: 'Seasonal protocols apply only to nights inside their window and prevail over base documents of the same or broader scope (GLB-2.2).' })),
      el('div', { class: 'pol-tl-legend' },
        legend('active', 'In force today'), legend('upcoming', 'Upcoming'), legend('past', 'Ended'))),
    body);
}

function legend(state, label) {
  return el('span', { class: 'pol-legend-item' }, el('span', { class: `pol-legend-swatch pol-tl-${state}` }), label);
}

// ---------------------------------------------------------------- library

function library(ctx, container, scoped, totalCount) {
  const state = ctx.state || {};
  const groupKey = (p) => (p.scope === 'GLOBAL' ? 'GLOBAL' : p.region);
  const groups = [{ key: 'GLOBAL', name: 'Global', sub: 'All ReverieEscapes properties' },
    ...REGIONS.filter((r) => !state.region || state.region === r)
      .map((r) => ({ key: r, name: regionName(r), sub: 'Regional addenda, country addenda and hotel rules' }))]
    .map((g) => ({ ...g, items: scoped.filter((p) => groupKey(p) === g.key).sort(byPrecedence) }));

  const langs = [...new Set(scoped.map((p) => p.language))].sort();
  const search = el('input', {
    type: 'search', class: 'pol-input pol-search', placeholder: 'Search ID, title or prefix…', value: viewState.query,
    'aria-label': 'Search policies',
  });
  const results = el('div', { class: 'pol-groups' });
  const fill = () => {
    const visible = groups.map((g) => ({ ...g, items: g.items.filter(matchesToolbar) })).filter((g) => g.items.length);
    results.replaceChildren(...(visible.length
      ? visible.map((g) => group(ctx, container, g))
      : [emptyState('No policies match', 'Try another search, language or type — or switch to All regions.')]));
  };
  search.addEventListener('input', () => { viewState.query = search.value; fill(); });

  const langSelect = el('select', { class: 'pol-input pol-select', 'aria-label': 'Language' },
    el('option', { value: '', text: 'All languages' }),
    langs.map((l) => el('option', { value: l, text: languageName(l) })));
  langSelect.value = langs.includes(viewState.language) ? viewState.language : '';
  langSelect.addEventListener('change', () => { viewState.language = langSelect.value; fill(); });

  const seg = el('div', { class: 'pol-seg', role: 'group', 'aria-label': 'Policy type' });
  for (const [value, label] of [['', 'All'], ['BASE', 'Base'], ['SEASONAL', 'Seasonal']]) {
    const b = el('button', {
      type: 'button', class: `pol-seg-btn${viewState.type === value ? ' is-active' : ''}`, text: label,
      'aria-pressed': String(viewState.type === value),
      onClick: () => {
        viewState.type = value;
        seg.querySelectorAll('.pol-seg-btn').forEach((x) => {
          x.classList.toggle('is-active', x === b);
          x.setAttribute('aria-pressed', String(x === b));
        });
        fill();
      },
    });
    seg.append(b);
  }

  fill();

  const scopeNote = filterNote(state, scoped.length, totalCount);
  return el('section', { class: 'pol-library' },
    el('div', { class: 'pol-section-head pol-library-head' },
      el('div', {},
        el('h2', { class: 'pol-h2', text: 'Documents' }),
        el('p', { class: 'pol-section-sub', text: scopeNote })),
      el('div', { class: 'pol-toolbar' }, search, langSelect, seg)),
    results);
}

function group(ctx, container, g) {
  const langs = new Set(g.items.map((p) => p.language));
  return el('div', { class: 'pol-group' },
    el('div', { class: 'pol-group-head' },
      el('div', { class: 'pol-group-title' },
        el('span', { class: 'pol-group-mark', 'aria-hidden': 'true', text: g.key === 'GLOBAL' ? '◎' : '◆' }),
        el('h3', { text: g.name }),
        el('span', { class: 'pol-group-count', text: `${g.items.length} document${g.items.length === 1 ? '' : 's'} · ${langs.size} language${langs.size === 1 ? '' : 's'}` })),
      el('div', { class: 'pol-group-sub', text: g.sub })),
    el('div', { class: 'pol-rows', role: 'list' }, g.items.map((p) => row(ctx, container, p))));
}

function row(ctx, container, p) {
  const ing = p.ingestion || { status: 'NOT_INDEXED' };
  const st = STATUS[ing.status] || STATUS.NOT_INDEXED;
  const differentTitle = p.titleEnglish && p.titleEnglish !== p.title;
  const live = p.policyType === 'SEASONAL' && activeOn(p, TODAY);

  const reindex = button('Re-index', 'ghost', async (e) => {
    await busy(e.currentTarget, 'Indexing…', async () => {
      try {
        const r = await ctx.api.policyApi.ingest(p.documentId);
        if (r?.status === 'FAILED') toast(`${p.documentId}: ${r.error || 'indexing failed'}`, 'danger');
        else toast(`${p.documentId} indexed — ${r?.chunkCount ?? 0} chunks.`, 'success');
      } catch (err) {
        toast(err.message, 'danger');
      }
      viewState.highlight = p.documentId;
      await draw(container, ctx, true);
    });
  }, 'refresh');

  return el('article', { class: `pol-row${p.policyType === 'SEASONAL' ? ' pol-row-seasonal' : ''}`, role: 'listitem', dataset: { docId: p.documentId } },
    el('div', { class: 'pol-row-main' },
      el('div', { class: 'pol-row-ids' },
        el('span', { class: 'pol-docid', text: p.documentId }),
        el('span', { class: 'pol-prefix', title: 'Clause prefix', text: `${p.clausePrefix}-` }),
        el('span', { class: 'pol-version', text: `v${p.version}` })),
      el('div', { class: 'pol-row-title', lang: p.language, text: p.title }),
      differentTitle ? el('div', { class: 'pol-row-title-en', text: p.titleEnglish }) : null,
      p.summary ? el('p', { class: 'pol-row-summary', text: p.summary }) : null),
    el('div', { class: 'pol-row-meta' },
      el('div', { class: 'pol-meta-badges' },
        scopeBadge(p),
        p.policyType === 'SEASONAL' ? badge(live ? 'Seasonal · in force' : 'Seasonal', 'seasonal') : badge('Base', 'neutral')),
      el('div', { class: 'pol-meta-line' }, el('span', { class: 'pol-meta-k', text: 'Applies to' }), el('span', { text: target(p) })),
      el('div', { class: 'pol-meta-line' }, el('span', { class: 'pol-meta-k', text: 'Language' }),
        el('span', {}, el('span', { class: 'pol-lang-code', text: (p.language || '').toUpperCase() }), languageName(p.language))),
      el('div', { class: 'pol-meta-line' }, el('span', { class: 'pol-meta-k', text: 'Effective' }),
        el('span', { text: `${formatDate(p.effectiveFrom)} → ${p.effectiveTo ? formatDate(p.effectiveTo) : 'until replaced'}` })),
      p.owner ? el('div', { class: 'pol-meta-line' }, el('span', { class: 'pol-meta-k', text: 'Owner' }), el('span', { text: p.owner })) : null),
    el('div', { class: 'pol-row-index' },
      el('div', { class: `pol-index-status pol-index-${(ing.status || 'NOT_INDEXED').toLowerCase()}` },
        el('span', { class: 'pol-dot', 'aria-hidden': 'true' }), st.label),
      ing.chunkCount != null ? el('div', { class: 'pol-index-sub', text: `${ing.chunkCount} chunks` }) : null,
      ing.indexedAt ? el('div', { class: 'pol-index-sub', text: formatDateTime(ing.indexedAt) }) : null,
      ing.status === 'STALE' ? el('div', { class: 'pol-index-sub', text: 'PDF changed since indexing' }) : null,
      ing.error ? el('div', { class: 'pol-index-err', text: ing.error, title: ing.error }) : null),
    el('div', { class: 'pol-row-actions' },
      button('View PDF', 'ghost', () => viewPdf(ctx, p), 'file'),
      button('Preview chunks', 'ghost', () => openChunks(ctx, p), 'layers'),
      reindex));
}

// ---------------------------------------------------------------- chunk preview

async function openChunks(ctx, p) {
  const body = el('div', { class: 'pol-chunks' }, spinner('Running the ingestion pipeline (dry run)…'));
  openModal({ title: `Chunks · ${p.documentId}`, body, wide: true });
  let chunks;
  try {
    chunks = await ctx.api.policyApi.chunks(p.documentId);
  } catch (err) {
    body.replaceChildren(emptyState('Could not build chunks', err.message));
    return;
  }
  chunks = Array.isArray(chunks) ? chunks : [];
  const totalChars = chunks.reduce((s, c) => s + (c.charCount || 0), 0);
  const clauses = new Set(chunks.flatMap((c) => c.clauseIds || []));
  const sections = new Set(chunks.map((c) => c.section).filter(Boolean));
  const maxChars = Math.max(1200, ...chunks.map((c) => c.charCount || 0));

  body.replaceChildren(
    el('div', { class: 'pol-chunks-intro' },
      el('div', { class: 'pol-chunks-doc' },
        el('div', { class: 'pol-row-title', lang: p.language, text: p.title }),
        el('div', { class: 'pol-chunks-pipeline', text: 'PDF → text → normalise & unwrap → clause-aware chunks → context header → embed → Azure AI Search' })),
      el('div', { class: 'pol-chunks-stats' },
        miniStat(chunks.length, 'chunks'), miniStat(clauses.size, 'clauses'), miniStat(sections.size, 'sections'),
        miniStat(chunks.length ? Math.round(totalChars / chunks.length) : 0, 'avg chars'))),
    chunks.length
      ? el('ol', { class: 'pol-chunk-list' }, chunks.map((c, i) => chunkCard(c, i, maxChars, p.language)))
      : emptyState('No chunks', 'The pipeline produced no chunks for this document.'));
}

function miniStat(value, label) {
  return el('div', { class: 'pol-mini-stat' }, el('strong', { text: String(value) }), el('span', { text: label }));
}

function chunkCard(c, i, maxChars, language) {
  const content = c.content || '';
  let head = '';
  let text = content;
  const nl = content.indexOf('\n');
  if (content.startsWith('[') && nl > 0) {
    head = content.slice(0, nl);
    text = content.slice(nl + 1).replace(/^\s*\n/, '');
  }
  const headParts = head ? head.replace(/^\[|\]$/g, '').split(' | ') : [];
  return el('li', { class: 'pol-chunk' },
    el('div', { class: 'pol-chunk-top' },
      el('span', { class: 'pol-chunk-n', text: String(i + 1).padStart(2, '0') }),
      el('div', { class: 'pol-chunk-section', lang: language, text: c.section || '—' }),
      el('div', { class: 'pol-chunk-size' },
        el('span', { class: 'pol-chunk-bar' }, el('span', { style: `width:${Math.min(100, ((c.charCount || 0) / maxChars) * 100)}%` })),
        el('span', { text: `${c.charCount ?? content.length} chars` }))),
    el('div', { class: 'pol-chunk-key' },
      el('span', { class: 'pol-meta-k', text: 'chunkKey' }), el('code', { text: c.chunkKey || '' }),
      (c.clauseIds || []).length
        ? el('span', { class: 'pol-chips' }, c.clauseIds.map((id) => el('span', { class: 'pol-chip', text: id })))
        : el('span', { class: 'pol-chunk-noclause', text: 'no clause — preamble / narrative' })),
    headParts.length
      ? el('div', { class: 'pol-chunk-header', title: 'Context header prepended before embedding' },
        el('span', { class: 'pol-chunk-header-tag', text: 'header' }),
        headParts.map((part) => el('span', { class: 'pol-chunk-header-part', text: part })))
      : null,
    el('div', { class: 'pol-chunk-text', lang: language }, highlightClauses(text)));
}

function highlightClauses(text) {
  const out = [];
  const re = /\b[A-Z]{2,4}-\d+\.\d+\b/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    out.push(el('mark', { class: 'pol-cid', text: m[0] }));
    last = m.index + m[0].length;
  }
  out.push(document.createTextNode(text.slice(last)));
  return out;
}

// ---------------------------------------------------------------- upload

async function openUpload(ctx, container) {
  const errorBox = el('div', { class: 'pol-form-error', role: 'alert', hidden: true });
  const f = {};
  const input = (name, attrs = {}) => (f[name] = el('input', { class: 'pol-input', name, id: `pol-up-${name}`, ...attrs }));
  const select = (name, options, attrs = {}) => (f[name] = el('select', { class: 'pol-input pol-select', name, id: `pol-up-${name}`, ...attrs },
    options.map(([v, t]) => el('option', { value: v, text: t }))));

  f.file = el('input', { type: 'file', accept: 'application/pdf,.pdf', name: 'file', id: 'pol-up-file', class: 'pol-file-input', required: true });
  const fileName = el('span', { class: 'pol-drop-name', text: 'Choose a PDF or drop it here' });
  const fileMeta = el('span', { class: 'pol-drop-meta', text: 'Rendered policy document · max one file' });
  const drop = el('label', { class: 'pol-drop', for: 'pol-up-file' },
    el('span', { class: 'pol-drop-icon', 'aria-hidden': 'true', text: 'PDF' }),
    el('span', { class: 'pol-drop-text' }, fileName, fileMeta),
    f.file);
  const onFile = (file) => {
    if (!file) return;
    fileName.textContent = file.name;
    fileMeta.textContent = `${file.size < 1024 ? `${file.size} B` : `${Math.round(file.size / 1024)} KB`} · ${file.type || 'application/pdf'}`;
    drop.classList.add('has-file');
    const id = file.name.replace(/\.pdf$/i, '').toUpperCase();
    if (!f.documentId.value && /^[A-Z0-9-]{3,48}$/.test(id)) f.documentId.value = id;
  };
  f.file.addEventListener('change', () => onFile(f.file.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      f.file.files = dt.files;
      onFile(file);
    }
  });

  input('documentId', { required: true, placeholder: 'e.g. SEA-ZA-GRID-2026', pattern: '[A-Z0-9-]{3,48}', autocomplete: 'off', spellcheck: 'false' });
  input('version', { required: true, placeholder: '1.0', value: '1.0' });
  input('title', { required: true, placeholder: 'Title in the document language' });
  input('titleEnglish', { required: true, placeholder: 'English title' });
  f.summary = el('textarea', { class: 'pol-input pol-textarea', name: 'summary', id: 'pol-up-summary', rows: 2, required: true, placeholder: 'One English sentence on what the document changes.' });
  select('language', LANGUAGES.map((l) => [l, `${languageName(l)} (${l})`]));
  select('scope', [['GLOBAL', 'Global'], ['REGION', 'Region'], ['COUNTRY', 'Country'], ['HOTEL', 'Hotel']]);
  select('region', [['', 'Select region…'], ...REGIONS.map((r) => [r, regionName(r)])]);
  select('countryCode', [['', 'Select country…']]);
  select('hotelId', [['', 'Select hotel…']]);
  select('policyType', [['BASE', 'Base'], ['SEASONAL', 'Seasonal']]);
  input('effectiveFrom', { type: 'date', required: true, value: TODAY });
  input('effectiveTo', { type: 'date' });
  input('clausePrefix', { required: true, placeholder: 'e.g. ZAG', pattern: '[A-Z]{2,4}', maxlength: 4, autocomplete: 'off' });
  input('owner', { required: true, placeholder: 'e.g. Africa Regional Operations' });
  f.replace = el('input', { type: 'checkbox', name: 'replace', id: 'pol-up-replace' });
  f.clausePrefix.addEventListener('input', () => { f.clausePrefix.value = f.clausePrefix.value.toUpperCase(); });
  f.documentId.addEventListener('input', () => { f.documentId.value = f.documentId.value.toUpperCase(); });

  // Regions/countries/hotels come from the refund API; fall back to the static network.
  let regions = null;
  try {
    regions = await ctx.api.refundApi.regions();
  } catch { /* fallback below */ }
  const countriesOf = (region) => {
    const r = Array.isArray(regions) ? regions.find((x) => x.code === region) : null;
    if (r?.countries) return r.countries.map((c) => [c.code, c.name]);
    return FALLBACK_COUNTRIES[region] || [];
  };
  const hotelCache = {};
  const hotelsOf = async (countryCode) => {
    if (!hotelCache[countryCode]) {
      try {
        const list = await ctx.api.refundApi.hotels({ countryCode });
        hotelCache[countryCode] = list.map((h) => [h.hotelId, h.name.replace(/^ReverieEscapes\s+/, '')]);
      } catch {
        hotelCache[countryCode] = FALLBACK_HOTELS[countryCode] || [];
      }
    }
    return hotelCache[countryCode];
  };
  const setOptions = (sel, placeholder, options) => {
    sel.replaceChildren(el('option', { value: '', text: placeholder }),
      ...options.map(([v, t]) => el('option', { value: v, text: v.length === 2 ? `${flag(v)} ${t}` : `${v} · ${t}` })));
  };
  const fieldWrap = {};
  const syncScope = () => {
    const scope = f.scope.value;
    fieldWrap.region.hidden = scope === 'GLOBAL';
    fieldWrap.countryCode.hidden = scope === 'GLOBAL' || scope === 'REGION';
    fieldWrap.hotelId.hidden = scope !== 'HOTEL';
    f.region.required = !fieldWrap.region.hidden;
    f.countryCode.required = !fieldWrap.countryCode.hidden;
    f.hotelId.required = !fieldWrap.hotelId.hidden;
  };
  const syncType = () => {
    f.effectiveTo.required = f.policyType.value === 'SEASONAL';
    fieldWrap.effectiveTo.querySelector('.pol-field-hint').textContent = f.policyType.value === 'SEASONAL' ? 'Required for seasonal' : 'Leave empty: until replaced';
  };
  f.scope.addEventListener('change', syncScope);
  f.policyType.addEventListener('change', syncType);
  f.region.addEventListener('change', () => {
    setOptions(f.countryCode, 'Select country…', countriesOf(f.region.value));
    setOptions(f.hotelId, 'Select hotel…', []);
  });
  f.countryCode.addEventListener('change', async () => {
    setOptions(f.hotelId, 'Loading hotels…', []);
    setOptions(f.hotelId, 'Select hotel…', f.countryCode.value ? await hotelsOf(f.countryCode.value) : []);
  });

  const field = (name, label, hint, cls = '') => (fieldWrap[name] = el('div', { class: `pol-field ${cls}` },
    el('label', { class: 'pol-label', for: `pol-up-${name}`, text: label }),
    f[name],
    el('span', { class: 'pol-field-hint', text: hint || '' })));

  const form = el('form', { class: 'pol-form' },
    errorBox,
    el('fieldset', { class: 'pol-fieldset' },
      el('legend', { text: 'Document' }),
      drop,
      el('div', { class: 'pol-grid pol-grid-3' },
        field('documentId', 'Document ID', 'A–Z, 0–9 and hyphens', 'pol-span-2'),
        field('version', 'Version', '')),
      el('div', { class: 'pol-grid pol-grid-2' },
        field('title', 'Title (original language)', ''),
        field('titleEnglish', 'English title', '')),
      field('summary', 'Summary', 'Shown to representatives and in the register')),
    el('fieldset', { class: 'pol-fieldset' },
      el('legend', { text: 'Scope & validity' }),
      el('div', { class: 'pol-grid pol-grid-4' },
        field('scope', 'Scope', ''),
        field('region', 'Region', ''),
        field('countryCode', 'Country', ''),
        field('hotelId', 'Hotel', '')),
      el('div', { class: 'pol-grid pol-grid-4' },
        field('language', 'Language', 'Authoritative language'),
        field('policyType', 'Policy type', ''),
        field('effectiveFrom', 'Effective from', ''),
        field('effectiveTo', 'Effective to', '')),
      el('div', { class: 'pol-grid pol-grid-3' },
        field('clausePrefix', 'Clause prefix', 'e.g. ZAG for ZAG-2.1'),
        field('owner', 'Owner', '', 'pol-span-2')),
      el('label', { class: 'pol-check', for: 'pol-up-replace' }, f.replace,
        el('span', {}, el('strong', { text: 'Replace an existing document' }), ' with the same ID (new version).'))));
  syncScope();
  syncType();
  // Start from the region / country selected in the shell.
  const st = ctx.state || {};
  if (st.region) {
    f.region.value = st.region;
    setOptions(f.countryCode, 'Select country…', countriesOf(st.region));
    if (st.countryCode) {
      f.countryCode.value = st.countryCode;
      hotelsOf(st.countryCode).then((list) => setOptions(f.hotelId, 'Select hotel…', list));
    }
  }

  const cancel = button('Cancel', 'secondary', () => modal.close());
  const submit = button('Upload & index', 'primary', () => form.requestSubmit(), 'send');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    const problem = validate(f);
    if (problem) return showError(problem);
    const scope = f.scope.value;
    const metadata = {
      documentId: f.documentId.value.trim(),
      title: f.title.value.trim(),
      titleEnglish: f.titleEnglish.value.trim(),
      summary: f.summary.value.trim(),
      version: f.version.value.trim(),
      language: f.language.value,
      scope,
      region: scope === 'GLOBAL' ? null : f.region.value,
      countryCode: scope === 'COUNTRY' || scope === 'HOTEL' ? f.countryCode.value : null,
      hotelId: scope === 'HOTEL' ? f.hotelId.value : null,
      policyType: f.policyType.value,
      effectiveFrom: f.effectiveFrom.value,
      effectiveTo: f.effectiveTo.value || null,
      clausePrefix: f.clausePrefix.value.trim(),
      owner: f.owner.value.trim(),
    };
    if (f.replace.checked) metadata.replace = true;

    await busy(submit, 'Uploading & indexing…', async () => {
      cancel.disabled = true;
      try {
        const entry = await uploadPolicy(ctx, f.file.files[0], metadata);
        modal.close();
        const st = entry?.ingestion?.status;
        toast(st === 'INDEXED'
          ? `${metadata.documentId} uploaded and indexed — ${entry.ingestion.chunkCount ?? 0} chunks.`
          : `${metadata.documentId} uploaded${st ? ` · ${(STATUS[st] || {}).label || st}` : ''}.`, st === 'FAILED' ? 'warning' : 'success');
        viewState.highlight = metadata.documentId;
        viewState.query = '';
        await draw(container, ctx, true);
      } catch (err) {
        if (/exist|duplicate|409/i.test(err.message) && !f.replace.checked) {
          showError(`${err.message} Tick “Replace an existing document” to upload a new version.`);
        } else {
          showError(err.message);
        }
      } finally {
        cancel.disabled = false;
      }
    });
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const modal = openModal({ title: 'Upload policy document', body: form, wide: true, actions: [cancel, submit] });
}

function validate(f) {
  const file = f.file.files[0];
  if (!file) return 'Choose the policy PDF to upload.';
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return 'The file must be a PDF.';
  if (!/^[A-Z0-9-]{3,48}$/.test(f.documentId.value.trim())) return 'Document ID must be 3–48 characters: A–Z, 0–9 and hyphens.';
  if (!/^[A-Z]{2,4}$/.test(f.clausePrefix.value.trim())) return 'Clause prefix must be 2–4 capital letters.';
  for (const k of ['title', 'titleEnglish', 'summary', 'version', 'owner', 'effectiveFrom']) {
    if (!f[k].value.trim()) return 'Fill in all required fields.';
  }
  const scope = f.scope.value;
  if (scope !== 'GLOBAL' && !f.region.value) return 'Select the region this document applies to.';
  if ((scope === 'COUNTRY' || scope === 'HOTEL') && !f.countryCode.value) return 'Select the country this document applies to.';
  if (scope === 'HOTEL' && !f.hotelId.value) return 'Select the hotel this document applies to.';
  if (f.policyType.value === 'SEASONAL' && !f.effectiveTo.value) return 'Seasonal documents need an end date.';
  if (f.effectiveTo.value && f.effectiveTo.value < f.effectiveFrom.value) return 'The end date must be on or after the start date.';
  return null;
}

function uploadPolicy(ctx, file, metadata) {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
  return ctx.api.policyApi.upload(form);
}

// ---------------------------------------------------------------- helpers

function viewPdf(ctx, p) {
  openPdfViewer({
    title: `${p.documentId} · ${p.titleEnglish || p.title}`,
    subtitle: `${languageName(p.language)} · v${p.version} · ${target(p)}`,
    url: p.documentUrl ? ctx.api.policyApi.absoluteUrl(p.documentUrl) : ctx.api.policyApi.documentUrl(p.documentId),
  });
}

// Uses the shell's .btn styles: primary (gold), secondary (outlined), ghost (small outlined).
const BUTTON_CLASS = { primary: 'btn btn--primary', secondary: 'btn btn--ghost', ghost: 'btn btn--ghost btn--sm' };

function button(label, variant, onClick, iconName) {
  return el('button', { type: 'button', class: `${BUTTON_CLASS[variant]} pol-btn pol-btn-${variant}`, onClick },
    iconName ? icon(iconName, 15) : null, el('span', { text: label }));
}

async function busy(btn, label, work) {
  const original = [...btn.childNodes];
  btn.disabled = true;
  btn.classList.add('is-busy');
  btn.replaceChildren(el('span', { class: 'pol-btn-spin', 'aria-hidden': 'true' }), label);
  try {
    await work();
  } finally {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.classList.remove('is-busy');
      btn.replaceChildren(...original);
    }
  }
}

function inFilter(p, state) {
  if (p.scope === 'GLOBAL') return true;
  if (state.region && p.region !== state.region) return false;
  if (state.countryCode && (p.scope === 'COUNTRY' || p.scope === 'HOTEL') && p.countryCode !== state.countryCode) return false;
  return true;
}

function matchesToolbar(p) {
  if (viewState.language && p.language !== viewState.language) return false;
  if (viewState.type && p.policyType !== viewState.type) return false;
  const q = viewState.query.trim().toLowerCase();
  if (!q) return true;
  return [p.documentId, p.title, p.titleEnglish, p.clausePrefix, p.summary, p.hotelId, p.countryCode, p.owner]
    .some((v) => v && String(v).toLowerCase().includes(q));
}

function filterNote(state, shown, total) {
  if (!state.region && !state.countryCode) return `All ${total} documents in the register, broadest scope first within each group.`;
  const where = state.countryCode ? `${flag(state.countryCode)} ${state.countryCode}` : regionName(state.region);
  return `${shown} of ${total} documents can apply in ${where}: global policy plus the matching regional, country and hotel documents.`;
}

function byPrecedence(a, b) {
  return (SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope])
    || (a.policyType === b.policyType ? 0 : a.policyType === 'SEASONAL' ? 1 : -1)
    || a.documentId.localeCompare(b.documentId);
}

function target(p) {
  switch (p.scope) {
    case 'GLOBAL': return 'All properties';
    case 'REGION': return `${regionName(p.region)} region`;
    case 'COUNTRY': return `${flag(p.countryCode)} ${p.countryCode} · ${regionName(p.region)}`;
    case 'HOTEL': return `${flag(p.countryCode)} ${p.hotelId} · ${p.countryCode}`;
    default: return p.scope || '';
  }
}

function targetShort(p) {
  switch (p.scope) {
    case 'GLOBAL': return 'Global';
    case 'REGION': return regionName(p.region);
    case 'COUNTRY': return `${flag(p.countryCode)} ${p.countryCode}`;
    case 'HOTEL': return `${flag(p.countryCode)} ${p.hotelId}`;
    default: return '';
  }
}

function activeOn(p, iso) {
  return p.effectiveFrom <= iso && (!p.effectiveTo || p.effectiveTo >= iso);
}

function utc(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function days(a, b) {
  return Math.round((utc(b) - utc(a)) / 86400000);
}

function addDays(iso, n) {
  return new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10);
}

function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
