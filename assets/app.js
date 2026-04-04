async function loadJson(path, options = {}) {
  const { optional = false } = options;
  try {
    const res = await fetch(path);
    if (!res.ok) {
      if (optional && res.status === 404) return null;
      throw new Error(`No se pudo cargar ${path}`);
    }
    return await res.json();
  } catch (err) {
    if (optional) return null;
    throw err;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanLabel(value, fallback = 'n/d') {
  const text = String(value || '').replace(/_/g, ' ').trim();
  return text || fallback;
}

function formatDate(value) {
  if (!value) return 'n/d';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date).replace('.', '') + ' UTC';
}

function formatStatus(status, pendingCount = 0, alertCount = 0) {
  if (status === 'confirmed_material' && alertCount > 0) return 'active';
  if (pendingCount > 0 || status === 'confirmed_material' || status === 'partially_confirmed') return 'watchlist';
  return 'closed';
}

function materialityScore(episode) {
  const status = String(episode.status || '').toLowerCase();
  if (status === 'confirmed_material') return 40;
  if (status === 'partially_confirmed') return 25;
  if (status === 'watching') return 12;
  return 0;
}

function escalationScore(escalationState) {
  const state = String(escalationState || '').toLowerCase();
  if (state === 'escalating') return 20;
  if (state === 'stable') return 8;
  if (state === 'degrading') return 4;
  return 0;
}

function recencyScore(isoDate) {
  const timestamp = new Date(isoDate || '').getTime();
  if (Number.isNaN(timestamp)) return 0;
  const hours = (Date.now() - timestamp) / (1000 * 60 * 60);
  if (hours <= 3) return 20;
  if (hours <= 12) return 14;
  if (hours <= 24) return 9;
  if (hours <= 48) return 5;
  return 1;
}

function buildHierarchy(episodes, situation) {
  const mainFrontKey = situation?.main_front?.episode_key || null;
  const branchRows = asArray(situation?.main_front?.branches);
  const byKey = new Map(episodes.map((episode) => [episode.episode_key, episode]));

  const parentMap = new Map();
  branchRows.forEach((branch) => {
    if (branch?.episode_key && mainFrontKey && byKey.has(branch.episode_key)) {
      parentMap.set(branch.episode_key, mainFrontKey);
    }
  });

  const nodes = episodes.map((episode) => {
    const latestAt = episode.latest_alert_at || episode.latest_event_at;
    const currentState = formatStatus(episode.status, episode.pending_count || 0, episode.alert_count || 0);
    const parentKey = parentMap.get(episode.episode_key) || null;
    const score =
      (Number(episode.main_front_score) || 0) +
      materialityScore(episode) +
      escalationScore(episode.escalation_state) +
      recencyScore(latestAt) +
      (episode.alert_count > 0 ? 6 : 0) +
      (episode.pending_count > 0 ? 3 : 0) +
      (parentKey ? -2 : 2);

    return {
      ...episode,
      latest_at: latestAt,
      current_state: currentState,
      parent_key: parentKey,
      risk_domain: cleanLabel(episode.scenario, 'general risk'),
      priority_score: score,
      children: [],
    };
  });

  const map = new Map(nodes.map((node) => [node.episode_key, node]));
  nodes.forEach((node) => {
    if (!node.parent_key) return;
    const parent = map.get(node.parent_key);
    if (parent) parent.children.push(node);
  });

  nodes.forEach((node) => {
    node.children.sort((a, b) => b.priority_score - a.priority_score);
  });

  return nodes;
}

function getBadgeClass(type, value) {
  const normalized = String(value || '').toLowerCase();
  if (type === 'state') return normalized === 'active' ? 'tag-active' : 'tag-watchlist';
  if (type === 'escalation') {
    if (normalized === 'escalating') return 'tag-escalating';
    if (normalized === 'degrading') return 'tag-degrading';
    return 'tag-neutral';
  }
  if (type === 'risk' && normalized.includes('military')) return 'tag-escalating';
  return 'tag-neutral';
}

function renderBadges(node, isChild = false) {
  const badges = [
    `<span class="tag ${getBadgeClass('state', node.current_state)}">${escapeHtml(node.current_state)}</span>`,
    `<span class="tag ${getBadgeClass('risk', node.risk_domain)}">${escapeHtml(node.risk_domain)}</span>`,
  ];

  if (node.escalation_state) {
    badges.push(`<span class="tag ${getBadgeClass('escalation', node.escalation_state)}">${escapeHtml(cleanLabel(node.escalation_state))}</span>`);
  }

  if (!isChild && node.children.length > 0) {
    badges.push(`<span class="tag tag-neutral">${node.children.length} branch${node.children.length > 1 ? 'es' : ''}</span>`);
  }

  return badges.join('');
}

function renderEventNode(node, { isChild = false } = {}) {
  const parent = node.parent_key ? `<span class="meta-pill">root: ${escapeHtml(cleanLabel(node.parent_key))}</span>` : '';
  const phase = node.change_profile?.change_class
    ? `<span class="meta-pill">phase: ${escapeHtml(cleanLabel(node.change_profile.change_class))}</span>`
    : '';
  const freshness = `<span class="meta-pill">updated: ${escapeHtml(formatDate(node.latest_at))}</span>`;

  const childrenHtml = node.children.length
    ? `<ul class="child-events">${node.children.map((child) => renderEventNode(child, { isChild: true })).join('')}</ul>`
    : '';

  return `
    <li class="event-node ${isChild ? 'event-child' : 'event-root'}">
      <article class="event-card">
        <div class="event-topline">
          <strong class="event-title">${escapeHtml(cleanLabel(node.episode_key))}</strong>
          <div class="badge-row">${renderBadges(node, isChild)}</div>
        </div>
        <div class="event-meta">${parent}${phase}${freshness}</div>
      </article>
      ${childrenHtml}
    </li>
  `;
}

function renderStatus(status) {
  const container = document.getElementById('status-grid');
  if (!container) return;
  const safeStatus = status && typeof status === 'object' ? status : {};
  const kpis = [
    ['Episodios activos', safeStatus.active_episodes_count ?? 'n/d'],
    ['Pendientes follow-up', safeStatus.pending_events_count ?? 'n/d'],
    ['Alertas 24h', safeStatus.alerts_last_24h ?? 'n/d'],
    ['Último run', formatDate(safeStatus.last_run_at)],
  ];
  container.innerHTML = `<div class="kpi-secondary-grid">${kpis.map(([k, v]) => `<div class="kpi kpi-secondary"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div>`;
}

function renderExecutiveView(episodes, situation) {
  const activeList = document.getElementById('active-events');
  const watchlistList = document.getElementById('watchlist-events');
  const closedList = document.getElementById('closed-events');
  const activeCount = document.getElementById('active-count');
  const watchCount = document.getElementById('watchlist-count');

  if (!activeList || !watchlistList || !closedList || !activeCount || !watchCount) return;

  const nodes = buildHierarchy(episodes, situation);
  const roots = nodes.filter((node) => !node.parent_key);

  const activeRoots = roots
    .filter((node) => node.current_state === 'active')
    .sort((a, b) => b.priority_score - a.priority_score);

  const watchlistRoots = roots
    .filter((node) => node.current_state === 'watchlist')
    .sort((a, b) => b.priority_score - a.priority_score);

  const closed = nodes
    .filter((node) => node.current_state !== 'active' && node.current_state !== 'watchlist')
    .sort((a, b) => (b.latest_at || '').localeCompare(a.latest_at || ''));

  activeCount.textContent = String(activeRoots.length);
  watchCount.textContent = String(watchlistRoots.length);

  activeList.innerHTML = activeRoots.length
    ? activeRoots.map((node) => renderEventNode(node)).join('')
    : '<li class="empty-state">No active events right now.</li>';

  watchlistList.innerHTML = watchlistRoots.length
    ? watchlistRoots.map((node) => renderEventNode(node)).join('')
    : '<li class="empty-state">Watchlist sin episodios en este momento.</li>';

  closedList.innerHTML = closed.length
    ? closed.map((node) => `<li><strong>${escapeHtml(cleanLabel(node.episode_key))}</strong> · ${escapeHtml(cleanLabel(node.status))} · ${escapeHtml(formatDate(node.latest_at))}</li>`).join('')
    : '<li>Sin eventos cerrados o de baja prioridad.</li>';
}

(async function main() {
  try {
    const [status, situation, episodes] = await Promise.all([
      loadJson('data/status.json'),
      loadJson('data/situation.json'),
      loadJson('data/episodes.json'),
    ]);

    const safeSituation = situation && typeof situation === 'object' ? situation : {};
    const safeEpisodes = asArray(episodes);

    renderStatus(status);
    renderExecutiveView(safeEpisodes, safeSituation);
  } catch (err) {
    document.body.innerHTML += `<p style="padding:1rem;color:#9f2431;background:#ffecee;border:1px solid #f4c9cf;border-radius:10px">Error cargando dashboard: ${err.message}</p>`;
  }
})();
