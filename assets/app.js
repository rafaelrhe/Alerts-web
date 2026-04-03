async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
}

function formatUtcDate(value) {
  if (!value) return 'n/d';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', timeZone: 'UTC' }).format(date);
  const month = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(date).replace('.', '');
  const year = new Intl.DateTimeFormat('es-ES', { year: 'numeric', timeZone: 'UTC' }).format(date);
  const hour = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
  return `${day} ${month} ${year} · ${hour} UTC`;
}

function renderStatus(status) {
  const container = document.getElementById('status-grid');
  const primary = [
    ['Alertas 24h', status.alerts_last_24h ?? 'n/d', 'kpi-alerts'],
    ['Episodios activos', status.active_episodes_count ?? 'n/d', 'kpi-episodes'],
    ['Pendientes', status.pending_events_count ?? 'n/d', 'kpi-pending'],
    ['Feeds OK / total', `${status.feeds_ok ?? 'n/d'} / ${status.total_feeds ?? 'n/d'}`, 'kpi-feeds'],
  ];
  const secondary = [
    ['Último run', formatUtcDate(status.last_run_at)],
    ['Modo', status.run_mode || 'n/d'],
    ['Coverage degraded', status.coverage_degraded ? 'Sí' : 'No'],
    ['Activos alertados', status.active_alerted_events_count ?? 'n/d'],
  ];

  container.innerHTML = `
    <div class="kpi-primary-grid">
      ${primary.map(([k, v, tone]) => `<div class="kpi kpi-primary ${tone}"><span>${k}</span><strong>${v}</strong></div>`).join('')}
    </div>
    <div class="kpi-secondary-grid">
      ${secondary.map(([k, v]) => `<div class="kpi kpi-secondary"><span>${k}</span><strong title="${v}">${v}</strong></div>`).join('')}
    </div>
  `;
}

function listToHtml(items) {
  if (!items || items.length === 0) return '<li>Sin datos recientes.</li>';
  return items.map((item) => `<li>${item}</li>`).join('');
}

function renderSituation(situation) {
  document.getElementById('situation-headline').textContent = situation.headline || 'Sin resumen';
  document.getElementById('what-changed').innerHTML = listToHtml(situation.what_changed);
  document.getElementById('what-open').innerHTML = listToHtml(situation.what_is_open);
  document.getElementById('what-watch').innerHTML = listToHtml(situation.what_to_watch_now);
}

function renderAlerts(alerts) {
  const list = document.getElementById('alerts-list');
  if (!alerts.length) {
    list.innerHTML = '<li>Sin alertas recientes.</li>';
    return;
  }
  list.innerHTML = alerts.slice(0, 25).map((a) => `
    <li>
      <span class="tag">${a.is_update ? 'update' : 'alerta'}</span>
      <strong>${a.episode_key || 'sin episodio'}</strong><br>
      <small>${a.sent_at || 'sin hora'}</small><br>
      ${a.summary || 'sin resumen'}
    </li>
  `).join('');
}

function renderEpisodes(episodes) {
  const list = document.getElementById('episodes-list');
  if (!episodes.length) {
    list.innerHTML = '<li>Sin episodios activos o recientes.</li>';
    return;
  }
  list.innerHTML = episodes.slice(0, 25).map((e) => `
    <li>
      <strong>${e.episode_key}</strong> · estado: ${e.status}<br>
      última actividad: ${e.latest_alert_at || e.latest_event_at || 'n/d'}<br>
      alertas: ${e.alert_count} · pendientes: ${e.pending_count} · activos: ${e.active_alerted_count}<br>
      <small>${e.short_summary || ''}</small>
    </li>
  `).join('');
}

function renderReview(review) {
  const list = document.getElementById('review-list');
  const items = [
    ...(review.findings || []),
    ...(review.weak_spots || []).map((i) => `Debilidad: ${i}`),
    ...(review.recommendations || []).map((i) => `Recomendación: ${i}`),
  ].slice(0, 5);
  list.innerHTML = listToHtml(items);
}

(async function main() {
  try {
    const [status, alerts, episodes, situation, review] = await Promise.all([
      loadJson('data/status.json'),
      loadJson('data/alerts.json'),
      loadJson('data/episodes.json'),
      loadJson('data/situation.json'),
      loadJson('data/review_summary.json'),
    ]);
    renderStatus(status);
    renderAlerts(alerts);
    renderEpisodes(episodes);
    renderSituation(situation);
    renderReview(review);
  } catch (err) {
    document.body.innerHTML += `<p style="padding:1rem;color:#9f2431;background:#ffecee;border:1px solid #f4c9cf;border-radius:10px">Error cargando dashboard: ${err.message}</p>`;
  }
})();
