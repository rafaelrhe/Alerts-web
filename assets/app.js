async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
}

function renderStatus(status) {
  const container = document.getElementById('status-grid');
  const pairs = [
    ['Último run', status.last_run_at || 'n/d'],
    ['Modo', status.run_mode || 'n/d'],
    ['Coverage degraded', status.coverage_degraded ? 'Sí' : 'No'],
    ['Feeds OK / total', `${status.feeds_ok ?? 'n/d'} / ${status.total_feeds ?? 'n/d'}`],
    ['Alertas 24h', status.alerts_last_24h],
    ['Episodios activos', status.active_episodes_count],
    ['Pendientes', status.pending_events_count],
    ['Activos alertados', status.active_alerted_events_count],
  ];
  container.innerHTML = pairs.map(([k, v]) => `<div class="kpi"><span>${k}</span><strong>${v}</strong></div>`).join('');
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
    document.body.innerHTML += `<p style="padding:1rem;color:#ffb4b4">Error cargando dashboard: ${err.message}</p>`;
  }
})();
