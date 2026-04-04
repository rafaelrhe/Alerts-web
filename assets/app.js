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

function normalizeIdentityList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const candidate = item.name || item.label || item.value || '';
        return String(candidate).trim();
      }
      return '';
    })
    .filter(Boolean);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stripHtmlToText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FALLBACK_COPY = {
  noMaterialChange: 'Sin cambio material por ahora',
  pendingOperationalDetail: 'Pendiente de más detalle operativo',
  stableMonitoring: 'Seguimiento estable, sin novedad operativa adicional',
  limitedCoverage: 'Cobertura limitada en esta actualización',
  noRecentData: 'Seguimiento estable en esta ventana intradía',
  recentOperationalMovement: 'Movimiento operativo reciente',
};

function cleanEpisodeLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .trim();
}

function titleCaseSentence(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function normalizeChangeProfile(value) {
  if (!value || typeof value !== 'object') return null;
  const normalized = {
    change_class: String(value.change_class || '').trim(),
    evidence_level: String(value.evidence_level || '').trim().toLowerCase(),
    novelty_level: String(value.novelty_level || '').trim().toLowerCase(),
    impact_scope: String(value.impact_scope || '').trim().toLowerCase(),
  };
  if (!normalized.change_class && !normalized.evidence_level && !normalized.novelty_level && !normalized.impact_scope) {
    return null;
  }
  return normalized;
}

function toUiLevelLabel(value) {
  const map = {
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
  };
  return map[String(value || '').toLowerCase()] || '';
}

function toUiScopeLabel(value) {
  const map = {
    local: 'Local',
    regional: 'Regional',
    global: 'Global',
  };
  return map[String(value || '').toLowerCase()] || '';
}

function renderChangeProfileSummary(changeProfile) {
  const profile = normalizeChangeProfile(changeProfile);
  if (!profile) return '';

  const rows = [
    ['Tipo de cambio', profile.change_class],
    ['Evidencia', toUiLevelLabel(profile.evidence_level)],
    ['Novedad', toUiLevelLabel(profile.novelty_level)],
    ['Alcance', toUiScopeLabel(profile.impact_scope)],
  ].filter(([, value]) => Boolean(value));

  if (!rows.length) return '';
  return `
    <section class="change-profile-summary" aria-label="Change profile">
      ${rows.map(([label, value]) => `
        <div class="change-profile-item">
          <span class="change-profile-label">${escapeHtml(label)}</span>
          <strong class="change-profile-value">${escapeHtml(value)}</strong>
        </div>
      `).join('')}
    </section>
  `;
}

function compactIdentityItems(items, maxItems) {
  const safeItems = normalizeIdentityList(items);
  return {
    shown: safeItems.slice(0, maxItems),
    extraCount: Math.max(0, safeItems.length - maxItems),
  };
}

function buildGeoHierarchy(identity = {}) {
  const geo = identity && typeof identity === 'object' ? identity.geo : null;
  if (!geo || typeof geo !== 'object') return '';
  const country = String(geo.country || '').trim();
  const region = String(geo.region || '').trim();
  const strategicNodes = normalizeIdentityList(geo.strategic_nodes);
  const strategicNode = strategicNodes[0] || '';
  const parts = [country, region, strategicNode].filter(Boolean);
  return parts.join(' → ');
}

function renderIdentityTagList(label, items, maxItems) {
  const { shown, extraCount } = compactIdentityItems(items, maxItems);
  if (!shown.length) return '';
  const chips = shown
    .map((item) => `<span class="identity-chip">${escapeHtml(item)}</span>`)
    .join('');
  const overflow = extraCount > 0 ? `<span class="identity-chip identity-chip-more">+${extraCount}</span>` : '';
  return `
    <div class="identity-row">
      <span class="identity-label">${escapeHtml(label)}</span>
      <div class="identity-chip-list">${chips}${overflow}</div>
    </div>
  `;
}

function renderEventContext(identity) {
  if (!identity || typeof identity !== 'object') return '';
  const entitiesRow = renderIdentityTagList('Entities', identity.entities, 3);
  const assetsRow = renderIdentityTagList('Assets', identity.assets, 2);
  const keywordsRow = renderIdentityTagList('Keywords', identity.event_terms || identity.keywords, 3);
  const geoPath = buildGeoHierarchy(identity);
  const geoRow = geoPath ? `
    <div class="identity-row identity-row-geo">
      <span class="identity-label">Geo</span>
      <p class="identity-geo-path">${escapeHtml(geoPath)}</p>
    </div>
  ` : '';
  const rows = [entitiesRow, geoRow, assetsRow, keywordsRow].filter(Boolean).join('');
  if (!rows) return '';
  return `
    <section class="event-context" aria-label="Event context">
      <h4>Event context</h4>
      ${rows}
    </section>
  `;
}

function statusPriority(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'confirmed_material') return 3;
  if (normalized === 'partially_confirmed') return 2;
  return 1;
}

function frontStructuralScore(episode = {}) {
  let score = 0;
  const status = String(episode?.status || '').toLowerCase();
  if (status === 'confirmed_material') score += 50;
  else if (status === 'potential' || status === 'partially_confirmed') score += 20;

  if (episode?.is_active || (episode?.active_alerted_count || 0) > 0) score += 30;

  const scenario = String(episode?.scenario || '').toLowerCase();
  if (['geopolitical_conflict', 'energy_shock', 'macro_fx_shock', 'financial_stress'].includes(scenario)) score += 25;

  const evidence = String(episode?.evidence_level || episode?.change_profile?.evidence_level || '').toLowerCase();
  if (evidence === 'high') score += 15;
  else if (evidence === 'medium') score += 8;

  const impact = String(episode?.impact || episode?.change_profile?.impact_scope || '').toLowerCase();
  if (scenario === 'natural_hazard' && impact !== 'material') score -= 20;

  const latestTs = episode?.latest_alert_at || episode?.latest_event_at;
  const recencyHours = latestTs ? Math.max(0, (Date.now() - new Date(latestTs).getTime()) / (1000 * 60 * 60)) : 999;
  if (recencyHours < 6) score += 5;
  else if (recencyHours < 24) score += 3;

  return score;
}

function pickPrincipalFront(alerts = [], episodes = []) {
  // Prioriza persistencia y materialidad; evita que novedad táctica desplace frentes estratégicos.
  const candidateEpisodes = asArray(episodes).filter((ep) => ep?.episode_key);
  const explicitMain = candidateEpisodes.find((ep) => ep?.is_main_front);
  const rankedEpisode = explicitMain || candidateEpisodes.slice().sort((a, b) => {
    const scoreDelta = frontStructuralScore(b) - frontStructuralScore(a);
    if (scoreDelta !== 0) return scoreDelta;
    const byStatus = statusPriority(b.status) - statusPriority(a.status);
    if (byStatus !== 0) return byStatus;
    const byActive = (b.active_alerted_count || 0) - (a.active_alerted_count || 0);
    if (byActive !== 0) return byActive;
    const atA = new Date(a?.latest_alert_at || a?.latest_event_at || 0).getTime() || 0;
    const atB = new Date(b?.latest_alert_at || b?.latest_event_at || 0).getTime() || 0;
    return atB - atA;
  })[0];

  if (rankedEpisode?.episode_key) {
    return {
      key: rankedEpisode.episode_key,
      title: rankedEpisode.short_summary || cleanEpisodeLabel(rankedEpisode.episode_key),
      status: rankedEpisode.status || null,
    };
  }

  const latestIntradayAlert = asArray(alerts).slice().sort((a, b) => {
    const atA = new Date(a?.sent_at || a?.created_at || 0).getTime() || 0;
    const atB = new Date(b?.sent_at || b?.created_at || 0).getTime() || 0;
    return atB - atA;
  }).find((item) => item?.episode_key);
  if (latestIntradayAlert?.episode_key) {
    return {
      key: latestIntradayAlert.episode_key,
      title: latestIntradayAlert.summary || cleanEpisodeLabel(latestIntradayAlert.episode_key),
      status: null,
    };
  }

  return null;
}

function pickMainFront(alerts = [], episodes = []) {
  return pickPrincipalFront(alerts, episodes);
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

function normalizeOperationalFallback(rawDetail, options = {}) {
  const { fallback = FALLBACK_COPY.pendingOperationalDetail } = options;
  const detail = String(rawDetail || '').trim();
  if (!detail) return fallback;

  const normalized = detail
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.includes('sin cambio material')) return FALLBACK_COPY.noMaterialChange;
  if (/mas detalle confirm/.test(normalized)) return FALLBACK_COPY.pendingOperationalDetail;
  if (/sin info/.test(normalized) || /sin detall/.test(normalized)) return FALLBACK_COPY.pendingOperationalDetail;
  if (normalized.includes('cobertura limitada')) return FALLBACK_COPY.limitedCoverage;

  return detail;
}

function compactTimelineLabel(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const sentence = raw.split(/[.!?]/).map((part) => part.trim()).find(Boolean) || raw;
  return sentence.length > 94 ? `${sentence.slice(0, 91)}…` : sentence;
}

function buildFrontTimeline(mainFrontKey, situation, episodes, alerts = [], dailyData = null) {
  const items = [];
  const seen = new Set();
  const pushTimelineItem = (label, at) => {
    const safeLabel = compactTimelineLabel(label);
    if (!safeLabel) return;
    const dedupeKey = safeLabel.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    items.push({ label: safeLabel, at: at || null });
  };

  const episode = asArray(episodes).find((ep) => ep.episode_key === mainFrontKey);
  const episodeTime = episode?.latest_event_at || episode?.latest_alert_at || null;

  if (episode?.short_summary) {
    pushTimelineItem(episode.short_summary, episodeTime);
  }
  if (episode?.status) {
    pushTimelineItem(`Estado actual: ${cleanEpisodeLabel(episode.status)}`, episodeTime);
  }

  normalizeList(situation?.what_changed).forEach((line) => {
    const lowered = line.toLowerCase();
    if (!mainFrontKey || lowered.includes(mainFrontKey.toLowerCase())) {
      const cleaned = normalizeOperationalFallback(
        line.replace(/^update en\s+/i, '').replace(/^alerta en\s+/i, '').trim(),
        { fallback: FALLBACK_COPY.noMaterialChange },
      );
      pushTimelineItem(cleaned, situation.generated_at || null);
    }
  });

  asArray(alerts)
    .filter((alert) => !mainFrontKey || alert?.episode_key === mainFrontKey)
    .slice(0, 3)
    .forEach((alert) => {
      const action = alert?.is_update ? 'Update' : 'Alerta';
      const label = `${action}: ${normalizeOperationalFallback(alert?.summary, { fallback: FALLBACK_COPY.recentOperationalMovement })}`;
      pushTimelineItem(label, alert?.sent_at || alert?.created_at || null);
    });

  asArray(dailyData?.points)
    .slice(0, 2)
    .forEach((point) => {
      if (!mainFrontKey || point.toLowerCase().includes(mainFrontKey.toLowerCase())) {
        pushTimelineItem(point, dailyData?.date || null);
      }
    });

  if (!items.length && mainFrontKey) {
    pushTimelineItem(FALLBACK_COPY.noMaterialChange, situation?.generated_at || episodeTime);
  }

  return items.slice(0, 4);
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

  const normalizedDetail = normalizeOperationalFallback(match[3], {
    fallback: FALLBACK_COPY.pendingOperationalDetail,
  });

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

function toNaturalWatchLabel(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  const explicitMap = {
    iran_israel_war: 'Escalada entre Irán e Israel',
    iran_us_tensions: 'Tensión entre Irán y Estados Unidos',
    iran_war: 'Nueva fase material del conflicto con Irán',
  };

  const lowerText = text.toLowerCase();
  const directKey = lowerText.replace(/\s+/g, '_');
  if (explicitMap[directKey]) return explicitMap[directKey];

  const match = lowerText.match(/\b([a-z]+(?:_[a-z]+){1,})\b/);
  if (match && explicitMap[match[1]]) return explicitMap[match[1]];

  const cleaned = text
    .replace(/^confirmar señales pendientes en\s+/i, '')
    .replace(/^monitorear\s+/i, '')
    .replace(/^watch\s+/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return titleCaseSentence(cleaned);
}

function buildExecutiveSummary(mainFrontLabel, statusText, hasMaterialChange) {
  const safeFront = cleanEpisodeLabel(mainFrontLabel || 'el frente principal');
  const safeStatus = statusText || 'seguimiento activo';
  const disruption = hasMaterialChange
    ? 'con escalada material reciente confirmada'
    : 'sin nueva disrupción operativa adicional por ahora';
  return `El frente principal sigue siendo ${safeFront}, en ${safeStatus}, ${disruption}.`;
}

function renderSituationItem(raw, type, options = {}) {
  const text = typeof raw === 'string' ? String(raw || '').trim() : '';
  const { principalFrontKey = null } = options;
  if (!text && !raw) return FALLBACK_COPY.noRecentData;

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
  const safeItems = asArray(items);
  if (safeItems.length === 0) return `<li>${FALLBACK_COPY.noRecentData}.</li>`;
  return safeItems.map((item) => `<li>${renderSituationItem(item, type)}</li>`).join('');
}

function renderExecutiveHero(situation, mainFront, episodes, alerts = []) {
  const card = document.getElementById('executive-hero');
  const summaryNode = document.getElementById('exec-summary');
  const pointsNode = document.getElementById('exec-points');
  const watchNode = document.getElementById('hero-watch-list');
  const changeProfileNode = document.getElementById('exec-change-profile');
  const titleNode = document.getElementById('exec-title');
  if (!card || !summaryNode || !pointsNode || !watchNode || !titleNode || !changeProfileNode) return;

  const mainEpisode = asArray(episodes).find((episode) => episode.episode_key === mainFront?.key);
  const statusText = cleanEpisodeLabel(mainFront?.status || mainEpisode?.status || 'seguimiento activo');
  const changedItems = dedupeChangedItems(situation?.what_changed || []);
  const hasMaterialChange = changedItems.some((item) => {
    const detail = String(item?.detail || '').toLowerCase();
    return !detail.includes('sin cambio material');
  });

  const geoFocus = buildGeoHierarchy(mainEpisode?.event_identity || {});
  const keyBullets = [
    `Estado actual: ${statusText}.`,
    hasMaterialChange
      ? 'Se confirma movimiento material reciente en este frente.'
      : 'No se confirma nueva disrupción operativa adicional.',
    geoFocus ? `Foco operativo: ${geoFocus}.` : null,
  ].filter(Boolean).slice(0, 3);

  const watchItems = normalizeList(situation?.what_to_watch_now)
    .map((item) => toNaturalWatchLabel(item))
    .filter(Boolean);
  const compactWatch = Array.from(new Set(watchItems)).slice(0, 3);

  titleNode.textContent = 'Qué está pasando ahora';
  summaryNode.textContent = buildExecutiveSummary(mainFront?.key || mainFront?.title, statusText, hasMaterialChange);
  pointsNode.innerHTML = keyBullets.length
    ? keyBullets.map((point) => `<li>${escapeHtml(point)}</li>`).join('')
    : `<li>${FALLBACK_COPY.noMaterialChange}.</li>`;

  const watchFallback = situation?.coverage_limited ? FALLBACK_COPY.limitedCoverage : FALLBACK_COPY.stableMonitoring;
  watchNode.innerHTML = compactWatch.length
    ? compactWatch.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
    : `<li>${watchFallback}.</li>`;

  const changeProfileHtml = renderChangeProfileSummary(mainEpisode?.change_profile);
  changeProfileNode.innerHTML = changeProfileHtml;
  changeProfileNode.hidden = !changeProfileHtml;

  card.hidden = false;
}

function renderDailyReport(dailyData) {
  const card = document.getElementById('daily-report-card');
  const container = document.getElementById('daily-report-content');
  if (!card || !container) return;
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
    ${asArray(dailyData.points).length ? `<ul class="daily-points">${asArray(dailyData.points).map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}
    ${excerpt ? `<details><summary class="daily-link">Ver informe completo</summary><p class="daily-summary">${escapeHtml(excerpt)}</p></details>` : ''}
  `;
  card.hidden = false;
}

function renderFrontStory(mainFront, timelineItems) {
  const card = document.getElementById('front-story-card');
  const title = document.getElementById('front-story-title');
  const list = document.getElementById('front-story-list');
  if (!card || !title || !list) return;

  const safeTimelineItems = asArray(timelineItems);
  if (!mainFront || !safeTimelineItems.length) {
    card.hidden = true;
    return;
  }

  title.textContent = `Evolución reciente de ${cleanEpisodeLabel(mainFront.key)}`;
  list.innerHTML = safeTimelineItems.map((item) => `
    <li>
      <span class="timeline-date">${escapeHtml(formatShortDate(item.at))}</span>
      <span class="timeline-dot" aria-hidden="true"></span>
      <span class="timeline-text">${escapeHtml(item.label)}</span>
    </li>
  `).join('');

  card.hidden = false;
}

function renderAlerts(alerts) {
  const list = document.getElementById('alerts-list');
  if (!list) return;
  const safeAlerts = asArray(alerts);
  if (!safeAlerts.length) {
    list.innerHTML = '<li>Sin alertas recientes.</li>';
    return;
  }
  list.innerHTML = safeAlerts.slice(0, 25).map((a) => `
    <li>
      <span class="tag">${a.is_update ? 'update' : 'alerta'}</span>
      <strong>${a.episode_key || 'episodio no especificado'}</strong><br>
      <small>${a.sent_at || 'hora no especificada'}</small><br>
      ${normalizeOperationalFallback(a.summary, { fallback: FALLBACK_COPY.pendingOperationalDetail })}
    </li>
  `).join('');
}

function renderEpisodes(episodes, mainFront) {
  const list = document.getElementById('episodes-list');
  if (!list) return;
  const safeEpisodes = asArray(episodes);
  if (!safeEpisodes.length) {
    list.innerHTML = '<li>Sin episodios activos o recientes.</li>';
    return;
  }

  const ordered = safeEpisodes.slice().sort((a, b) => {
    if (mainFront?.key) {
      if (a.episode_key === mainFront.key) return -1;
      if (b.episode_key === mainFront.key) return 1;
    }
    return (b.alert_count || 0) - (a.alert_count || 0);
  });

  list.innerHTML = ordered.slice(0, 25).map((e) => {
    const isMain = mainFront?.key && e.episode_key === mainFront.key;
    const summaryLine = String(e.short_summary || '')
      .replace(/\s+/g, ' ')
      .trim();
    const briefSummary = summaryLine.length > 110
      ? `${summaryLine.slice(0, 107)}...`
      : summaryLine || FALLBACK_COPY.pendingOperationalDetail;
    const contextHtml = renderEventContext(e.event_identity);
    return `
      <li>
        <div class="episode-row">
          <strong>${escapeHtml(cleanEpisodeLabel(e.episode_key))}</strong>
          ${isMain ? '<span class="tag tag-main">PRINCIPAL</span>' : ''}
          <span class="tag">${escapeHtml(cleanEpisodeLabel(e.status || 'n/d'))}</span>
        </div>
        <p class="episode-meta">Alertas: ${escapeHtml(e.alert_count ?? 'n/d')} · Pendientes: ${escapeHtml(e.pending_count ?? 'n/d')}</p>
        <p class="episode-brief">${escapeHtml(briefSummary)}</p>
        ${contextHtml}
      </li>
    `;
  }).join('');
}

function renderReview(review) {
  const list = document.getElementById('review-list');
  if (!list) return;
  const safeReview = review && typeof review === 'object' ? review : {};
  const items = [
    ...asArray(safeReview.findings),
    ...asArray(safeReview.weak_spots).map((i) => `Debilidad: ${i}`),
    ...asArray(safeReview.recommendations).map((i) => `Recomendación: ${i}`),
  ].slice(0, 5);
  list.innerHTML = listToHtml(items);
}

function renderViews(viewPayloads = []) {
  const card = document.getElementById('views-card');
  const grid = document.getElementById('views-grid');
  if (!card || !grid) return;

  const safeViews = asArray(viewPayloads)
    .filter((view) => view && typeof view === 'object' && !view?.meta?.empty);
  if (!safeViews.length) {
    card.hidden = true;
    return;
  }

  grid.innerHTML = safeViews.map((view) => {
    const title = cleanEpisodeLabel(view.view_id || 'view');
    const groups = asArray(view.groups).slice(0, 3).map((group) => {
      const episode = cleanEpisodeLabel(group.group_key || 'sin grupo');
      const topEvent = asArray(group.events)[0] || {};
      const summary = normalizeOperationalFallback(topEvent.last_decision_reason || topEvent.reason || topEvent.summary, {
        fallback: FALLBACK_COPY.pendingOperationalDetail,
      });
      return `<li><strong>${escapeHtml(episode)}</strong><p>${escapeHtml(summary)}</p></li>`;
    }).join('');

    return `
      <article class="view-block">
        <h3>${escapeHtml(title)}</h3>
        <p class="view-meta">${escapeHtml(String(view?.meta?.returned_events ?? 0))} eventos visibles</p>
        <ul class="view-list">${groups || '<li>Sin eventos visibles.</li>'}</ul>
      </article>
    `;
  }).join('');
  card.hidden = false;
}

function renderStatus(status) {
  const container = document.getElementById('status-grid');
  if (!container) return;
  const safeStatus = status && typeof status === 'object' ? status : {};
  const primary = [
    ['Alertas 24h', safeStatus.alerts_last_24h ?? 'n/d', 'kpi-alerts'],
    ['Episodios activos', safeStatus.active_episodes_count ?? 'n/d', 'kpi-episodes'],
    ['Pendientes', safeStatus.pending_events_count ?? 'n/d', 'kpi-pending'],
    ['Feeds OK / total', `${safeStatus.feeds_ok ?? 'n/d'} / ${safeStatus.total_feeds ?? 'n/d'}`, 'kpi-feeds'],
  ];
  const runParts = formatUtcDateParts(safeStatus.last_run_at);
  const secondary = [
    ['Último run', `<span class="run-date">${escapeHtml(runParts.date)}</span><span class="run-time">${escapeHtml(runParts.time)}</span>`, 'run-kpi'],
    ['Modo', escapeHtml(safeStatus.run_mode || 'n/d')],
    ['Coverage degraded', safeStatus.coverage_degraded ? 'Sí' : 'No'],
    ['Activos alertados', safeStatus.active_alerted_events_count ?? 'n/d'],
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

(async function main() {
  try {
    const [status, alerts, episodes, situation, review, latestDaily, iranView, energyView, globalView] = await Promise.all([
      loadJson('data/status.json'),
      loadJson('data/alerts.json'),
      loadJson('data/episodes.json'),
      loadJson('data/situation.json'),
      loadJson('data/review_summary.json'),
      loadJson('data/latest_daily.json', { optional: true }),
      loadJson('data/views/iran_risk.json', { optional: true }),
      loadJson('data/views/energy_risk.json', { optional: true }),
      loadJson('data/views/global_radar.json', { optional: true }),
    ]);

    const safeAlerts = asArray(alerts);
    const safeEpisodes = asArray(episodes);
    const safeSituation = situation && typeof situation === 'object' ? situation : {};
    const safeReview = review && typeof review === 'object' ? review : {};
    const dailyData = parseDailyContent(latestDaily);
    const mainFront = pickMainFront(safeAlerts, safeEpisodes);
    const frontTimeline = buildFrontTimeline(mainFront?.key, safeSituation, safeEpisodes, safeAlerts, dailyData);

    renderExecutiveHero(safeSituation, mainFront, safeEpisodes, safeAlerts);
    renderStatus(status);
    renderFrontStory(mainFront, frontTimeline);
    renderEpisodes(safeEpisodes, mainFront);
    renderDailyReport(dailyData);
    renderAlerts(safeAlerts);
    renderReview(safeReview);
    renderViews([iranView, energyView, globalView]);
  } catch (err) {
    document.body.innerHTML += `<p style="padding:1rem;color:#9f2431;background:#ffecee;border:1px solid #f4c9cf;border-radius:10px">Error cargando dashboard: ${err.message}</p>`;
  }
})();
