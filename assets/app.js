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

function formatUtcDateParts(value) {
  if (!value) return { date: 'n/d', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: '' };
  const datePart = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date).replace('.', '');
  const timePart = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
  return { date: datePart, time: `${timePart} UTC` };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderStatus(status) {
  const container = document.getElementById('status-grid');
  const primary = [
    ['Alertas 24h', status.alerts_last_24h ?? 'n/d', 'kpi-alerts'],
    ['Episodios activos', status.active_episodes_count ?? 'n/d', 'kpi-episodes'],
    ['Pendientes', status.pending_events_count ?? 'n/d', 'kpi-pending'],
    ['Feeds OK / total', `${status.feeds_ok ?? 'n/d'} / ${status.total_feeds ?? 'n/d'}`, 'kpi-feeds'],
  ];
  const runParts = formatUtcDateParts(status.last_run_at);
  const secondary = [
    ['Último run', `<span class="run-date">${escapeHtml(runParts.date)}</span><span class="run-time">${escapeHtml(runParts.time)}</span>`, 'run-kpi'],
    ['Modo', escapeHtml(status.run_mode || 'n/d')],
    ['Coverage degraded', status.coverage_degraded ? 'Sí' : 'No'],
    ['Activos alertados', status.active_alerted_events_count ?? 'n/d'],
  ];

  container.innerHTML = `
    <div class="kpi-primary-grid">
      ${primary.map(([k, v, tone]) => `<div class="kpi kpi-primary ${tone}"><span>${k}</span><strong>${v}</strong></div>`).join('')}
    </div>
    <div class="kpi-secondary-grid">
      ${secondary.map(([k, v, extraClass = '']) => `<div class="kpi kpi-secondary ${extraClass}"><span>${k}</span><strong>${v}</strong></div>`).join('')}
    </div>
  `;
}

function renderSituationItem(raw, type) {
  const text = String(raw || '').trim();
  if (!text) return 'Sin datos recientes.';

  if (type === 'changed') {
    const match = text.match(/^(update|alerta) en ([^:]+):\s*(.*)$/i);
    if (match) {
      const badge = match[1].toLowerCase() === 'update' ? 'Actualización' : 'Alerta';
      const episode = match[2].replace(/_/g, ' ');
      const detail = match[3] && match[3].toLowerCase() !== 'sin detalle'
        ? match[3]
        : 'Sin detalle operativo disponible por ahora.';
      return `
        <div class="situation-item-row">
          <span class="situation-badge">${escapeHtml(badge)}</span>
          <span class="situation-episode">${escapeHtml(episode)}</span>
        </div>
        <p class="situation-detail">${escapeHtml(detail)}</p>
      `;
    }
  }

  if (type === 'open') {
    const match = text.match(/^([^:]+):\s*estado=([^\s]+)\s+alertas=(\d+)\s+pendientes=(\d+)$/i);
    if (match) {
      const [, episode, status, alerts, pending] = match;
      return `
        <div class="situation-item-row">
          <span class="situation-episode">${escapeHtml(episode.replace(/_/g, ' '))}</span>
          <span class="situation-badge">${escapeHtml(status.replace(/_/g, ' '))}</span>
        </div>
        <p class="situation-detail">Alertas: ${escapeHtml(alerts)} · Pendientes: ${escapeHtml(pending)}</p>
      `;
    }
  }

  return `<p class="situation-detail">${escapeHtml(text)}</p>`;
}

function listToHtml(items, type = '') {
  if (!items || items.length === 0) return '<li>Sin datos recientes.</li>';
  return items.map((item) => `<li>${renderSituationItem(item, type)}</li>`).join('');
}

function normalizeLine(line) {
  return line.replace(/^[\-•\s]+/, '').trim();
}

function parseDailyMessage(message) {
  const lines = String(message || '')
    .split('\n')
    .map((line) => normalizeLine(line))
    .filter(Boolean);
  if (!lines.length) return null;

  const summary = lines[0];
  const points = lines.filter((line) => line.includes(':') || line.length > 36).slice(1, 4);
  return {
    summary,
    points: points.slice(0, 3),
    fullText: lines.join(' '),
  };
}

function renderDailyReport(dailyContext) {
  const card = document.getElementById('daily-report-card');
  const container = document.getElementById('daily-report-content');
  if (!dailyContext || (!dailyContext.sent_at && !dailyContext.message)) {
    card.hidden = true;
    return;
  }

  const parsed = parseDailyMessage(dailyContext.message);
  const dateLabel = formatUtcDate(dailyContext.sent_at || dailyContext.generated_at || '');

  container.innerHTML = `
    <p class="daily-meta">${escapeHtml(dateLabel)}</p>
    <p class="daily-summary">${escapeHtml((parsed && parsed.summary) || 'Resumen diario disponible.')}</p>
    ${parsed && parsed.points.length ? `<ul class="daily-points">${parsed.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}
    ${dailyContext.message ? `<details><summary class="daily-link">Ver informe completo</summary><p class="daily-summary">${escapeHtml((parsed && parsed.fullText) || dailyContext.message)}</p></details>` : ''}
  `;
  card.hidden = false;
}

function renderSituation(situation) {
  document.getElementById('situation-headline').textContent = situation.headline || 'Sin resumen';
  document.getElementById('what-changed').innerHTML = listToHtml(situation.what_changed, 'changed');
  document.getElementById('what-open').innerHTML = listToHtml(situation.what_is_open, 'open');
  document.getElementById('what-watch').innerHTML = listToHtml(situation.what_to_watch_now);
  renderDailyReport(situation.daily_context);
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
