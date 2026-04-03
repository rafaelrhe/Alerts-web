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

function formatShortDate(value) {
  if (!value) return 'n/d';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(date).replace('.', '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function stripHtmlToText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanEpisodeLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .trim();
}

function statusPriority(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'confirmed_material') return 3;
  if (normalized === 'partially_confirmed') return 2;
  return 1;
}

function pickPrincipalFront(episodes = [], latestDaily = null) {
  const rankedEpisode = (episodes || []).slice().sort((a, b) => {
    const byStatus = statusPriority(b.status) - statusPriority(a.status);
    if (byStatus !== 0) return byStatus;
    const byActive = (b.active_alerted_count || 0) - (a.active_alerted_count || 0);
    if (byActive !== 0) return byActive;
    return (b.alert_count || 0) - (a.alert_count || 0);
  })[0];

  if (rankedEpisode?.episode_key) {
    return {
      key: rankedEpisode.episode_key,
      title: rankedEpisode.short_summary || cleanEpisodeLabel(rankedEpisode.episode_key),
      status: rankedEpisode.status || null,
    };
  }

  const frontFromDaily = Array.isArray(latestDaily?.fronts) ? latestDaily.fronts[0] : null;
  if (!frontFromDaily?.root_episode_key) return null;
  return {
    key: frontFromDaily.root_episode_key,
    title: frontFromDaily.headline || frontFromDaily.summary || cleanEpisodeLabel(frontFromDaily.root_episode_key),
    status: null,
  };
}

function pickMainFront(latestDaily, episodes = []) {
  return pickPrincipalFront(episodes, latestDaily);
}

function parseDailyContent(latestDaily) {
  if (!latestDaily || typeof latestDaily !== 'object') return null;

  const title = latestDaily.title || latestDaily.headline || 'Informe diario ejecutivo';
  const summary = latestDaily.summary || latestDaily.executive_summary || '';
  const points = normalizeList(latestDaily.key_points || latestDaily.executive_summary_points || latestDaily.highlights).slice(0, 3);

  const content = latestDaily.full_text || latestDaily.markdown || latestDaily.html || '';
  const fullText = content.includes('<') ? stripHtmlToText(content) : String(content || '').trim();

  if (!summary && points.length === 0 && !fullText) return null;

  return {
    title,
    summary,
    points,
    fullText,
    date: latestDaily.generated_at || latestDaily.sent_at || latestDaily.date || null,
  };
}

function buildFrontTimeline(mainFrontKey, latestDaily, situation, episodes) {
  const items = [];

  const dailyFront = (latestDaily?.fronts || []).find((front) => front.root_episode_key === mainFrontKey)
    || (latestDaily?.fronts || [])[0];

  if (dailyFront) {
    const fromDaily = normalizeList(
      dailyFront.recent_milestones
      || dailyFront.recent_phases
      || dailyFront.active_phases
      || dailyFront.events
    );
    fromDaily.forEach((entry) => items.push({ label: entry, at: latestDaily.generated_at || latestDaily.sent_at || null }));
  }

  const episode = (episodes || []).find((ep) => ep.episode_key === mainFrontKey);
  const summarySentence = String(episode?.short_summary || '')
    .split(/[.!?]/)
    .map((line) => line.trim())
    .find(Boolean);
  if (summarySentence) {
    items.push({ label: summarySentence, at: episode.latest_event_at || episode.latest_alert_at || null });
  }
  if (episode?.status) {
    items.push({ label: `Estado actual: ${cleanEpisodeLabel(episode.status)}`, at: episode.latest_event_at || episode.latest_alert_at || null });
  }

  normalizeList(situation?.what_changed).forEach((line) => {
    const lowered = line.toLowerCase();
    if (!mainFrontKey || lowered.includes(mainFrontKey.toLowerCase())) {
      const cleaned = line.replace(/^update en\s+/i, '').replace(/^alerta en\s+/i, '').trim();
      items.push({ label: cleaned, at: situation.generated_at || null });
    }
  });

  const dedup = [];
  const seen = new Set();
  items.forEach((item) => {
    const key = item.label.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(item);
    }
  });

  return dedup.slice(0, 5);
}

function parseChangedEvent(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/^(update|alerta) en ([^:]+):\s*(.*)$/i);
  if (!match) {
    return {
      action: null,
      eventId: null,
      detail: text,
    };
  }

  const rawDetail = String(match[3] || '').trim();
  const normalizedDetail = rawDetail && rawDetail.toLowerCase() !== 'sin detalle'
    ? rawDetail
    : 'sin cambio material';

  return {
    action: match[1].toLowerCase(),
    eventId: match[2],
    detail: normalizedDetail,
  };
}

function dedupeChangedItems(changedItems = []) {
  const grouped = new Map();
  normalizeList(changedItems).forEach((raw) => {
    const parsed = parseChangedEvent(raw);
    const groupKey = parsed.eventId || parsed.detail || raw;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        key: groupKey,
        eventId: parsed.eventId,
        action: parsed.action,
        detail: parsed.detail,
        count: 0,
      });
    }
    grouped.get(groupKey).count += 1;
  });

  return Array.from(grouped.values());
}

function extractImpactLine(episodes = []) {
  const text = (episodes || [])
    .map((ep) => String(ep?.short_summary || '').toLowerCase())
    .join(' ');
  if (!text) return 'Sin impacto confirmado en energía o supply chain';
  const hasImpact = /impact|disrupt|disruption|infraestructura|infrastructure|energ|supply chain|shipping/.test(text);
  const hasNegative = /(no impact|sin impacto|sin disrupci|no direct operational disruption|not a material operational event)/.test(text);
  if (hasImpact && !hasNegative) {
    return 'Impacto operativo con señales en energía o supply chain';
  }
  return 'Sin impacto confirmado en energía o supply chain';
}

function buildExecutiveSummary(episodes = []) {
  if (!episodes.length) {
    return ['Sin señales materiales activas', 'Riesgo distribuido sin concentración clara', 'Sin impacto confirmado en energía o supply chain'];
  }

  const principal = pickPrincipalFront(episodes);
  const principalStatus = String(principal?.status || '').toLowerCase();
  let line1 = `Seguimiento activo en ${cleanEpisodeLabel(principal?.key || 'frente principal')}`;
  if (principal?.key && principalStatus === 'confirmed_material') {
    line1 = `Escalada confirmada en ${cleanEpisodeLabel(principal.key)}`;
  } else if (principal?.key && principalStatus === 'partially_confirmed') {
    line1 = `Escalada parcial en ${cleanEpisodeLabel(principal.key)}`;
  }

  const topPriorityCount = episodes.filter((episode) => statusPriority(episode.status) === 3).length;
  const line2 = topPriorityCount <= 1
    ? 'Riesgo concentrado en un solo frente'
    : `Riesgo repartido en ${topPriorityCount} frentes confirmados`;

  const line3 = extractImpactLine(episodes);
  return [line1, line2, line3].slice(0, 3);
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

function renderSituationItem(raw, type, options = {}) {
  const text = typeof raw === 'string' ? String(raw || '').trim() : '';
  const { principalFrontKey = null } = options;
  if (!text && !raw) return 'Sin datos recientes.';

  if (type === 'changed') {
    if (typeof raw === 'object' && raw !== null && raw.eventId) {
      const badge = raw.action === 'update' ? 'Actualización' : 'Alerta';
      const episode = cleanEpisodeLabel(raw.eventId);
      const detail = raw.count > 1
        ? `${raw.count} actualizaciones (${raw.detail})`
        : raw.detail;
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
      const isPrincipal = principalFrontKey && episode === principalFrontKey;
      return `
        <div class="situation-item-row">
          <span class="situation-episode">${escapeHtml(episode.replace(/_/g, ' '))}</span>
          ${isPrincipal ? '<span class="situation-badge situation-badge-main">PRINCIPAL</span>' : ''}
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

function renderExecutiveHero(dailyData, mainFront) {
  const card = document.getElementById('executive-hero');
  const summaryNode = document.getElementById('exec-summary');
  const pointsNode = document.getElementById('exec-points');
  const frontNode = document.getElementById('exec-main-front');
  const titleNode = document.getElementById('exec-title');

  if (!dailyData) {
    card.hidden = true;
    return;
  }

  titleNode.textContent = dailyData.title || 'Situación actual';
  summaryNode.textContent = dailyData.summary || 'Resumen diario disponible para seguimiento ejecutivo.';
  pointsNode.innerHTML = dailyData.points.length
    ? dailyData.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')
    : '<li>Sin puntos clave adicionales.</li>';

  if (mainFront?.key) {
    frontNode.textContent = `Frente principal: ${cleanEpisodeLabel(mainFront.key)}`;
    frontNode.hidden = false;
  } else {
    frontNode.hidden = true;
  }

  card.hidden = false;
}

function renderDailyReport(dailyData) {
  const card = document.getElementById('daily-report-card');
  const container = document.getElementById('daily-report-content');
  if (!dailyData) {
    card.hidden = true;
    return;
  }

  const dateParts = formatUtcDateParts(dailyData.date || '');
  const excerpt = dailyData.fullText || dailyData.summary;

  container.innerHTML = `
    <p class="daily-meta"><span>${escapeHtml(dateParts.date)}</span><span>${escapeHtml(dateParts.time)}</span></p>
    <h3 class="daily-title">${escapeHtml(dailyData.title || 'Informe diario ejecutivo')}</h3>
    <p class="daily-summary">${escapeHtml(dailyData.summary || 'Resumen diario disponible.')}</p>
    ${dailyData.points.length ? `<ul class="daily-points">${dailyData.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}
    ${excerpt ? `<details><summary class="daily-link">Ver informe completo</summary><p class="daily-summary">${escapeHtml(excerpt)}</p></details>` : ''}
  `;
  card.hidden = false;
}

function renderFrontStory(mainFront, timelineItems) {
  const card = document.getElementById('front-story-card');
  const title = document.getElementById('front-story-title');
  const list = document.getElementById('front-story-list');

  if (!mainFront || !timelineItems.length) {
    card.hidden = true;
    return;
  }

  title.textContent = `Evolución de ${cleanEpisodeLabel(mainFront.key)}`;
  list.innerHTML = timelineItems.map((item) => `
    <li>
      <span class="timeline-date">${escapeHtml(formatShortDate(item.at))}</span>
      <span class="timeline-dot" aria-hidden="true"></span>
      <span class="timeline-text">${escapeHtml(item.label)}</span>
    </li>
  `).join('');

  card.hidden = false;
}

function renderSituation(situation, dailyData, mainFront) {
  const dailySummary = dailyData?.summary;
  document.getElementById('situation-headline').textContent = dailySummary || situation.headline || 'Sin resumen';
  const changedItems = dedupeChangedItems(situation.what_changed).slice(0, 4);
  const openItems = normalizeList(situation.what_is_open);
  document.getElementById('what-changed').innerHTML = changedItems.map((item) => `<li>${renderSituationItem(item, 'changed')}</li>`).join('') || '<li>Sin datos recientes.</li>';
  document.getElementById('what-open').innerHTML = openItems.map((item) => `<li>${renderSituationItem(item, 'open', { principalFrontKey: mainFront?.key })}</li>`).join('') || '<li>Sin datos recientes.</li>';

  const watchItems = normalizeList(situation.what_to_watch_now);
  const conciseWatch = watchItems
    .map((item) => item.replace(/^Confirmar señales pendientes en\s+/i, 'Confirmación de '))
    .slice(0, 3);
  if (mainFront?.key && conciseWatch.length < 3) {
    conciseWatch.unshift(`Evolución de ${cleanEpisodeLabel(mainFront.key)}`);
  }
  document.getElementById('what-watch').innerHTML = listToHtml(conciseWatch.slice(0, 3));
}

function renderExecutiveSummary(episodes) {
  const list = document.getElementById('executive-summary-lines');
  const lines = buildExecutiveSummary(episodes);
  list.innerHTML = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
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

function renderEpisodes(episodes, mainFront) {
  const list = document.getElementById('episodes-list');
  if (!episodes.length) {
    list.innerHTML = '<li>Sin episodios activos o recientes.</li>';
    return;
  }

  const ordered = episodes.slice().sort((a, b) => {
    if (mainFront?.key) {
      if (a.episode_key === mainFront.key) return -1;
      if (b.episode_key === mainFront.key) return 1;
    }
    return (b.alert_count || 0) - (a.alert_count || 0);
  });

  list.innerHTML = ordered.slice(0, 25).map((e) => {
    const isMain = mainFront?.key && e.episode_key === mainFront.key;
    return `
      <li>
        <div class="episode-row">
          <strong>${escapeHtml(cleanEpisodeLabel(e.episode_key))}</strong>
          ${isMain ? '<span class="tag tag-main">PRINCIPAL</span>' : ''}
        </div>
        <p class="episode-meta">Estado: ${escapeHtml(cleanEpisodeLabel(e.status || 'n/d'))} · Alertas: ${escapeHtml(e.alert_count ?? 'n/d')}</p>
      </li>
    `;
  }).join('');
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
    const [status, alerts, episodes, situation, review, latestDaily] = await Promise.all([
      loadJson('data/status.json'),
      loadJson('data/alerts.json'),
      loadJson('data/episodes.json'),
      loadJson('data/situation.json'),
      loadJson('data/review_summary.json'),
      loadJson('data/latest_daily.json', { optional: true }),
    ]);

    const dailyData = parseDailyContent(latestDaily);
    const mainFront = pickMainFront(latestDaily, episodes);
    const frontTimeline = buildFrontTimeline(mainFront?.key, latestDaily, situation, episodes);

    renderExecutiveHero(dailyData, mainFront);
    renderStatus(status);
    renderExecutiveSummary(episodes);
    renderSituation(situation, dailyData, mainFront);
    renderFrontStory(mainFront, frontTimeline);
    renderEpisodes(episodes, mainFront);
    renderDailyReport(dailyData);
    renderAlerts(alerts);
    renderReview(review);
  } catch (err) {
    document.body.innerHTML += `<p style="padding:1rem;color:#9f2431;background:#ffecee;border:1px solid #f4c9cf;border-radius:10px">Error cargando dashboard: ${err.message}</p>`;
  }
})();
