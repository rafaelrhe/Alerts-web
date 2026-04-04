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

function renderStatus(status) {
  const container = document.getElementById('status-grid');
  if (!container) return;
  const safeStatus = status && typeof status === 'object' ? status : {};
  const kpis = [
    ['Alertas 24h', safeStatus.alerts_last_24h ?? 'n/d'],
    ['Episodios activos', safeStatus.active_episodes_count ?? 'n/d'],
    ['Pendientes follow-up', safeStatus.pending_events_count ?? 'n/d'],
    ['Feeds OK / total', `${safeStatus.feeds_ok ?? 'n/d'} / ${safeStatus.total_feeds ?? 'n/d'}`],
    ['Último run', formatDate(safeStatus.last_run_at)],
  ];
  container.innerHTML = `<div class="kpi-secondary-grid">${kpis.map(([k, v]) => `<div class="kpi kpi-secondary"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div>`;
}

function renderMainFront(situation) {
  const card = document.getElementById('executive-hero');
  const titleNode = document.getElementById('exec-title');
  const summaryNode = document.getElementById('exec-summary');
  const pointsNode = document.getElementById('exec-points');
  if (!card || !titleNode || !summaryNode || !pointsNode) return;

  const mainFront = situation?.main_front || {};
  if (!mainFront.episode_key) {
    card.hidden = true;
    return;
  }

  titleNode.textContent = cleanLabel(mainFront.title || mainFront.episode_key, 'Situación principal');
  summaryNode.textContent = mainFront.why_now || 'Sin explicación narrativa disponible.';

  const points = [
    `Estado: ${cleanLabel(mainFront.status, 'seguimiento activo')}`,
    `Última señal: ${mainFront.latest_signal ? mainFront.latest_signal : 'sin señal relevante reciente'}`,
    `Actualizado: ${formatDate(mainFront.latest_signal_at)}`,
  ];
  pointsNode.innerHTML = points.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  card.hidden = false;
}

function renderBranches(situation) {
  const card = document.getElementById('branches-card');
  const list = document.getElementById('branches-list');
  if (!card || !list) return;

  const branches = asArray(situation?.main_front?.branches);
  if (!branches.length) {
    card.hidden = true;
    return;
  }

  list.innerHTML = branches.map((branch) => `
    <li>
      <div class="episode-row">
        <strong>${escapeHtml(cleanLabel(branch.title || branch.episode_key))}</strong>
        <span class="tag">${escapeHtml(cleanLabel(branch.relationship, 'rama'))}</span>
      </div>
      <p class="episode-meta">${escapeHtml(cleanLabel(branch.status, 'seguimiento activo'))} · ${escapeHtml(formatDate(branch.latest_signal_at))}</p>
      <p class="episode-brief">${escapeHtml(branch.summary || 'Sin resumen reciente.')}</p>
      <p class="episode-brief">Señal: ${escapeHtml(branch.latest_signal || 'sin actualización puntual')}</p>
    </li>
  `).join('');
  card.hidden = false;
}

function renderActivity(situation) {
  const list = document.getElementById('activity-list');
  if (!list) return;

  const activity = asArray(situation?.recent_activity);
  if (!activity.length) {
    list.innerHTML = '<li>Sin actividad reciente relevante.</li>';
    return;
  }

  list.innerHTML = activity.map((item) => {
    const typeMap = {
      alert: 'Alerta',
      update: 'Update',
      blocked_decision: 'Decisión bloqueada',
      status: 'Estado',
    };
    const typeLabel = typeMap[item.type] || 'Actividad';
    return `
      <li>
        <span class="tag">${escapeHtml(typeLabel)}</span>
        <strong>${escapeHtml(cleanLabel(item.episode_key, 'contexto general'))}</strong>
        <p class="episode-brief">${escapeHtml(item.summary || 'Sin detalle')}</p>
        <small>${escapeHtml(formatDate(item.timestamp))}</small>
      </li>
    `;
  }).join('');
}

function renderRadar(situation) {
  const list = document.getElementById('radar-list');
  if (!list) return;

  const radar = asArray(situation?.radar);
  if (!radar.length) {
    list.innerHTML = '<li>Sin episodios secundarios relevantes.</li>';
    return;
  }

  list.innerHTML = radar.map((item) => `
    <li>
      <strong>${escapeHtml(cleanLabel(item.title || item.episode_key))}</strong>
      <p class="episode-meta">${escapeHtml(cleanLabel(item.status, 'seguimiento activo'))} · ${escapeHtml(formatDate(item.latest_event_at))}</p>
      <p class="episode-brief">${escapeHtml(item.summary || 'Sin detalle narrativo en esta ventana.')}</p>
    </li>
  `).join('');
}

(async function main() {
  try {
    const [status, situation] = await Promise.all([
      loadJson('data/status.json'),
      loadJson('data/situation.json'),
    ]);

    const safeSituation = situation && typeof situation === 'object' ? situation : {};

    renderStatus(status);
    renderMainFront(safeSituation);
    renderBranches(safeSituation);
    renderActivity(safeSituation);
    renderRadar(safeSituation);
  } catch (err) {
    document.body.innerHTML += `<p style="padding:1rem;color:#9f2431;background:#ffecee;border:1px solid #f4c9cf;border-radius:10px">Error cargando dashboard: ${err.message}</p>`;
  }
})();
