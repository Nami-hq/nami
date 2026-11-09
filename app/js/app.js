import { api, imageUrl, ApiError } from './api.js';
import { isLocked } from './gate-view.js';
import {
  escapeHtml,
  icon,
  formatTime,
  timeAgo,
  bindImages,
  posterCard,
  skeletonGrid,
  loadingBlock,
  emptyState,
  toast,
  confirmDialog,
} from './ui.js';
import { Player } from './player.js';

const refs = {
  main: document.getElementById('main'),
  detailLayer: document.getElementById('detail-layer'),
  playerRoot: document.getElementById('player-root'),
  discoverBody: document.getElementById('discover-body'),
  historyBody: document.getElementById('history-body'),
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  searchClear: document.getElementById('search-clear'),
  windowControls: document.getElementById('window-controls'),
  titlebar: document.getElementById('titlebar'),
  ambientA: document.getElementById('ambient-a'),
  ambientB: document.getElementById('ambient-b'),
};

const state = {
  view: 'discover',
  query: '',
  settings: {
    quality: 'best',
    mode: 'sub',
    autoplay: true,
    volume: 1,
    muted: false,
    subtitles: true,
    theme: 'system',
  },
  history: [],
  trending: [],
  results: null,
  detail: null,
  version: '',
  gate: { filter: true, unlocked: false },
};

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function resolvedTheme(theme) {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  return darkQuery.matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const value = ['system', 'light', 'dark'].includes(theme) ? theme : 'system';
  state.settings.theme = value;
  const resolved = resolvedTheme(value);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0c1119' : '#edf1fb');
  window.nami?.window?.setTheme?.(value);
}

darkQuery.addEventListener('change', () => {
  if (state.settings.theme === 'system') applyTheme('system');
});

let searchTimer = null;
let searchToken = 0;
let detailToken = 0;
let player = null;
let lastFocused = null;
let settingsView = null;
let settingsDirty = false;
let ambient = { url: '', index: 0 };

function onLockedCard() {
  if (!state.gate.hasCode) {
    toast('Set an access code in Settings to unlock 21+ titles.', { type: 'info' });
    return;
  }
  openGateDialog({ mode: 'unlock' });
}

/* ----------------------------- boot ----------------------------------- */

async function boot() {
  refs.discoverBody.innerHTML = skeletonGrid(8);
  try {
    const data = await api.bootstrap();
    state.settings = { subtitles: true, ...data.settings };
    applyTheme(state.settings.theme);
    state.history = Array.isArray(data.history) ? data.history : [];
    state.trending = Array.isArray(data.trending) ? data.trending : [];
    state.version = data.version || '';
    if (data.gate) state.gate = data.gate;
    renderDiscoverHome();
    setAmbient(state.trending[0]?.poster || '');
    if (settingsView) buildSettings();
  } catch (error) {
    refs.discoverBody.replaceChildren(
      emptyState({
        iconName: 'alert',
        title: 'NAMI could not start',
        text: error.message,
        actionLabel: 'Try again',
        onAction: boot,
      })
    );
  }
}

/* ----------------------------- chrome --------------------------------- */

function bindChrome() {
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.nav));
  });

  refs.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    const query = refs.searchInput.value.trim();
    if (query.length >= 2) runSearch(query);
  });

  refs.searchInput.addEventListener('input', () => {
    const value = refs.searchInput.value;
    state.query = value;
    refs.searchClear.hidden = !value;
    clearTimeout(searchTimer);
    if (!value.trim()) {
      showDiscoverHome();
      return;
    }
    if (value.trim().length < 2) return;
    searchTimer = setTimeout(() => runSearch(value.trim()), 340);
  });

  refs.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && refs.searchInput.value) {
      event.preventDefault();
      clearSearch();
    }
  });

  refs.searchClear.addEventListener('click', clearSearch);

  document.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      navigate('discover');
      refs.searchInput.focus();
      refs.searchInput.select();
      return;
    }
    if (event.key === '/' && !isTyping(event.target) && refs.detailLayer.hidden) {
      event.preventDefault();
      refs.searchInput.focus();
    }
    if (event.key === 'Escape' && !refs.detailLayer.hidden && !player) {
      closeDetail();
    }
  });

  refs.discoverBody.addEventListener('click', (event) => {
    if (event.target.closest('[data-locked]')) {
      onLockedCard();
      return;
    }
    const button = event.target.closest('[data-slug]');
    if (!button) return;
    const play =
      button.dataset.resumeEp !== undefined
        ? {
            ep: button.dataset.resumeEp,
            position: Number(button.dataset.resumePosition) || 0,
            mode: button.dataset.resumeMode || state.settings.mode,
          }
        : null;
    openDetail(button.dataset.slug, {
      fallback: { title: button.dataset.title, poster: button.dataset.poster },
      play,
      mode: play?.mode || state.settings.mode,
    });
  });

  refs.historyBody.addEventListener('click', onHistoryClick);

  refs.detailLayer.addEventListener('click', onDetailClick);

  bindWindowControls();
}

function bindWindowControls() {
  const bridge = window.nami?.window;
  if (!bridge) return;
  refs.windowControls.hidden = false;
  refs.windowControls.querySelector('[data-window="minimize"]')?.addEventListener('click', bridge.minimize);
  refs.windowControls.querySelector('[data-window="maximize"]')?.addEventListener('click', bridge.maximize);
  refs.windowControls.querySelector('[data-window="close"]')?.addEventListener('click', bridge.close);
  refs.titlebar?.addEventListener('dblclick', (event) => {
    if (event.target.closest('button')) return;
    bridge.maximize();
  });
  bridge.onMaximized?.((maximized) => {
    const button = refs.windowControls.querySelector('[data-window="maximize"]');
    if (!button) return;
    button.innerHTML = icon(maximized ? 'restore' : 'square');
    button.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
  });
  document.body.classList.add('is-desktop');
}

function isTyping(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
}

/* ----------------------------- ambient -------------------------------- */

function setAmbient(url) {
  if (!url) {
    ambient.url = '';
    refs.ambientA.classList.remove('is-live');
    refs.ambientB.classList.remove('is-live');
    return;
  }
  if (ambient.url === url) return;
  const src = imageUrl(url);
  if (!src) return;
  ambient.url = url;
  const incoming = ambient.index === 0 ? refs.ambientB : refs.ambientA;
  const outgoing = ambient.index === 0 ? refs.ambientA : refs.ambientB;
  const probe = new Image();
  probe.onload = () => {
    incoming.style.backgroundImage = `url("${src}")`;
    incoming.classList.add('is-live');
    outgoing.classList.remove('is-live');
    ambient.index = ambient.index === 0 ? 1 : 0;
  };
  probe.src = src;
}

/* ------------------------------ nav ----------------------------------- */

function navigate(view) {
  if (view === 'settings') {
    ensureSettingsView();
    state.view = 'settings';
    showView('settings');
    buildSettings();
    return;
  }
  if (view === 'history') {
    state.view = 'history';
    showView('history');
    loadHistory();
    return;
  }
  state.view = 'discover';
  showView('discover');
  if (!refs.searchInput.value.trim()) {
    renderDiscoverHome();
    setAmbient(state.trending[0]?.poster || '');
  }
}

function showView(name) {
  document.querySelectorAll('[data-view]').forEach((section) => {
    section.hidden = section.dataset.view !== name;
  });
  document.querySelectorAll('[data-nav]').forEach((button) => {
    const active = button.dataset.nav === name;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  refs.main.scrollTop = 0;
  window.scrollTo(0, 0);
}

function clearSearch() {
  refs.searchInput.value = '';
  state.query = '';
  refs.searchClear.hidden = true;
  clearTimeout(searchTimer);
  searchToken += 1;
  showDiscoverHome();
  refs.searchInput.focus();
}

/* ---------------------------- discover -------------------------------- */

function renderDiscoverHome() {
  state.results = null;
  refs.discoverBody.replaceChildren();

  const resumable = state.history.filter((entry) => entry.slug && entry.title).slice(0, 8);
  if (resumable.length) {
    refs.discoverBody.append(
      buildShelf({
        title: 'Continue watching',
        note: 'On this machine',
        items: resumable,
        resumable: true,
      })
    );
  }

  if (state.trending.length) {
    refs.discoverBody.append(
      buildShelf({
        title: 'Trending now',
        note: 'Live from HiAnime',
        items: state.trending,
        ranked: true,
      })
    );
  } else {
    refs.discoverBody.append(
      emptyState({
        iconName: 'alert',
        title: 'Trending is quiet',
        text: 'The source did not answer. You can still search for a title by name.',
        actionLabel: 'Retry trending',
        onAction: async () => {
          try {
            const data = await api.trending();
            state.trending = data.items || [];
            renderDiscoverHome();
          } catch (error) {
            toast(error.message, { type: 'error' });
          }
        },
      })
    );
  }
}

function buildShelf({ title, note, items, ranked = false, resumable = false }) {
  const shelf = document.createElement('section');
  shelf.className = 'shelf';
  shelf.innerHTML = `
    <header class="shelf__head">
      <h2 class="shelf__title">${escapeHtml(title)}</h2>
      <span class="shelf__note">${escapeHtml(note)}</span>
    </header>
    <ol class="rail-list"></ol>`;
  const rail = shelf.querySelector('.rail-list');

  items.forEach((item, index) => {
    const cardItem = resumable
      ? {
          slug: item.slug,
          title: item.title,
          poster: item.poster,
          type: `EP ${item.ep}`,
          duration: progressLabel(item),
          episodes: 0,
        }
      : item;
    const card = posterCard(cardItem, {
      rank: ranked ? item.rank || index + 1 : 0,
      locked: isLocked(item, state.gate),
    });
    if (resumable) {
      const button = card.querySelector('button');
      button.dataset.resumeEp = item.ep;
      button.dataset.resumePosition = String(item.position || 0);
      button.dataset.resumeMode = item.mode || 'sub';
    }
    rail.append(card);
  });

  return shelf;
}

function progressLabel(entry) {
  if (entry.duration > 0) {
    return `${Math.min(99, Math.round((entry.position / entry.duration) * 100))}% watched`;
  }
  return '';
}

async function runSearch(query) {
  navigate('discover');
  refs.searchInput.value = query;
  refs.searchClear.hidden = false;
  state.query = query;
  const token = ++searchToken;

  refs.discoverBody.innerHTML = `
    <section class="results">
      <header class="results__head">
        <h2 class="results__title">Searching for <em>“${escapeHtml(query)}”</em></h2>
        <span class="results__count">One moment</span>
      </header>
      ${skeletonGrid(8)}
    </section>`;

  try {
    const data = await api.search(query);
    if (token !== searchToken) return;
    renderResults(query, data.items || []);
  } catch (error) {
    if (token !== searchToken) return;
    if (error instanceof ApiError && error.status === 404) {
      renderNoResults(query);
      return;
    }
    refs.discoverBody.replaceChildren(
      emptyState({
        iconName: 'alert',
        title: 'Search did not answer',
        text: error.message,
        actionLabel: 'Try again',
        onAction: () => runSearch(query),
      })
    );
  }
}

function renderResults(query, items) {
  state.results = items;
  refs.discoverBody.innerHTML = `
    <section class="results">
      <header class="results__head">
        <h2 class="results__title">Results for <em>“${escapeHtml(query)}”</em></h2>
        <span class="results__count">${items.length} ${items.length === 1 ? 'title' : 'titles'}</span>
      </header>
      <div class="poster-grid"></div>
    </section>`;
  const grid = refs.discoverBody.querySelector('.poster-grid');
  items.forEach((item) => grid.append(posterCard(item, { locked: isLocked(item, state.gate) })));
}

function renderNoResults(query) {
  refs.discoverBody.replaceChildren(
    emptyState({
      iconName: 'search',
      title: 'No titles found',
      text: `Nothing matched “${query}”. Try a shorter name, or the Japanese title.`,
      actionLabel: 'Clear search',
      onAction: clearSearch,
    })
  );
}

function showDiscoverHome() {
  state.results = null;
  renderDiscoverHome();
}

/* ----------------------------- history -------------------------------- */

async function loadHistory() {
  refs.historyBody.innerHTML = loadingBlock('Reading history');
  try {
    const data = await api.history();
    state.history = data.items || [];
    renderHistory();
  } catch (error) {
    refs.historyBody.replaceChildren(
      emptyState({
        iconName: 'alert',
        title: 'History is unavailable',
        text: error.message,
        actionLabel: 'Try again',
        onAction: loadHistory,
      })
    );
  }
}

function renderHistory() {
  refs.historyBody.replaceChildren();
  if (!state.history.length) {
    refs.historyBody.append(
      emptyState({
        iconName: 'clock',
        title: 'Nothing watched yet',
        text: 'Start an episode and NAMI will keep your place here. The list never leaves this machine.',
        actionLabel: 'Find something',
        onAction: () => navigate('discover'),
      })
    );
    return;
  }

  const list = document.createElement('div');
  list.className = 'history-list';

  for (const entry of state.history) {
    const poster = imageUrl(entry.poster);
    const locked = isLocked(entry, state.gate);
    const pct = entry.duration > 0 ? Math.min(99, Math.round((entry.position / entry.duration) * 100)) : 0;
    const meta = [
      entry.mode === 'dub' ? 'Dub' : 'Sub',
      `Episode ${entry.ep}`,
      pct ? `${pct}% watched` : entry.imported ? null : 'Not started',
      timeAgo(entry.updatedAt),
    ]
      .filter(Boolean)
      .join(' · ');

    const article = document.createElement('article');
    article.className = `history-card${locked ? ' history-card--locked' : ''}`;
    const mainButton = locked
      ? `<button class="history-card__main" type="button" data-locked="${escapeHtml(entry.title)}"
          aria-label="${escapeHtml(entry.title)} is 21+ and locked">
          <span class="history-card__art history-card__art--locked">
            ${poster ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy" data-fade />` : ''}
            <span class="history-card__lock">${icon('lock')}</span>
          </span>
          <span class="history-card__text">
            <span class="history-card__title">${escapeHtml(entry.title)}</span>
            <span class="history-card__meta">Locked · 21+</span>
          </span>
        </button>`
      : `<button class="history-card__main" type="button" data-history-resume
          data-slug="${escapeHtml(entry.slug)}" data-title="${escapeHtml(entry.title)}"
          data-poster="${escapeHtml(entry.poster)}" data-ep="${escapeHtml(entry.ep)}"
          data-mode="${entry.mode}" data-position="${Number(entry.position) || 0}">
          <span class="history-card__art">
            ${poster ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy" data-fade />` : ''}
          </span>
          <span class="history-card__text">
            <span class="history-card__title">${escapeHtml(entry.title)}</span>
            <span class="history-card__meta">${escapeHtml(meta)}</span>
            ${
              pct
                ? `<span class="history-card__progress"><i style="width:${pct}%"></i></span>`
                : ''
            }
          </span>
        </button>`;
    article.innerHTML = `
      ${mainButton}
      <button class="icon-button history-card__remove" type="button" data-history-remove
        data-slug="${escapeHtml(entry.slug)}" data-mode="${entry.mode}"
        data-title="${escapeHtml(entry.title)}" aria-label="Remove ${escapeHtml(
          entry.title
        )} from history">${icon('trash')}</button>`;
    bindImages(article);
    list.append(article);
  }

  refs.historyBody.append(list);

  const foot = document.createElement('div');
  foot.className = 'history-foot';
  foot.innerHTML = `
    <p>${state.history.length} ${state.history.length === 1 ? 'entry' : 'entries'} · stored on this machine</p>
    <button class="button button--quiet" type="button" data-history-clear>Clear history</button>`;
  refs.historyBody.append(foot);
}

async function onHistoryClick(event) {
  if (event.target.closest('[data-locked]')) {
    onLockedCard();
    return;
  }
  const remove = event.target.closest('[data-history-remove]');
  if (remove) {
    const { slug, mode, title } = remove.dataset;
    const approved = await confirmDialog({
      title: 'Remove this entry?',
      text: `“${title}” will leave your history. The video files themselves are not touched.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!approved) return;
    try {
      await api.removeHistory(slug, mode);
      state.history = state.history.filter(
        (entry) => !(entry.slug === slug && entry.mode === mode)
      );
      renderHistory();
      toast('Entry removed');
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
    return;
  }

  if (event.target.closest('[data-history-clear]')) {
    const approved = await confirmDialog({
      title: 'Clear all history?',
      text: 'Every saved position will be forgotten. Your ani-cli history stays where it is.',
      confirmLabel: 'Clear everything',
      danger: true,
    });
    if (!approved) return;
    try {
      await api.clearHistory();
      state.history = [];
      renderHistory();
      toast('History cleared');
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
    return;
  }

  const resume = event.target.closest('[data-history-resume]');
  if (!resume) return;
  const { slug, title, poster, ep, mode, position } = resume.dataset;
  openDetail(slug, {
    fallback: { title, poster },
    mode,
    play: { ep, position: Number(position) || 0, mode },
  });
}

/* ------------------------------ detail -------------------------------- */

async function openDetail(slug, { fallback = null, mode = state.settings.mode, play = null } = {}) {
  detailToken += 1;
  const token = detailToken;
  lastFocused = document.activeElement;
  state.detail = {
    slug,
    info: fallback,
    episodes: [],
    mode,
    loading: true,
    error: '',
    play,
  };

  refs.detailLayer.hidden = false;
  refs.detailLayer.classList.remove('is-entering');
  void refs.detailLayer.offsetWidth;
  refs.detailLayer.classList.add('is-entering');
  refs.detailLayer.scrollTop = 0;
  renderDetail();
  setAmbient(fallback?.poster || state.trending.find((item) => item.slug === slug)?.poster || '');

  const [infoResult, episodesResult] = await Promise.allSettled([
    api.anime(slug),
    api.episodes(slug),
  ]);
  if (token !== detailToken) return;

  const detail = state.detail;
  const info = infoResult.status === 'fulfilled' ? infoResult.value : null;
  if (info) {
    detail.info = {
      ...(fallback || {}),
      ...Object.fromEntries(Object.entries(info).filter(([, value]) => value !== '' && value != null)),
    };
  }
  if (episodesResult.status === 'fulfilled') {
    detail.episodes = (episodesResult.value.episodes || []).sort(
      (a, b) => Number(a.number) - Number(b.number)
    );
  }
  detail.loading = false;
  if (!info && episodesResult.status === 'rejected') {
    detail.error =
      infoResult.reason?.message || episodesResult.reason?.message || 'The title could not be read';
  } else if (!detail.episodes.length) {
    detail.error = episodesResult.reason?.message || 'No episodes are listed for this title';
  }

  renderDetail();
  setAmbient(detail.info?.poster || fallback?.poster || '');

  if (play) {
    const episode = detail.episodes.find((item) => String(item.number) === String(play.ep));
    startPlayback(episode?.number || play.ep, play.position, play.mode || mode);
  }
}

function closeDetail() {
  detailToken += 1;
  refs.detailLayer.hidden = true;
  refs.detailLayer.classList.remove('is-entering');
  state.detail = null;
  setAmbient(state.trending[0]?.poster || '');
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  lastFocused = null;
}

function historyFor(slug, mode) {
  return state.history.find((entry) => entry.slug === slug && entry.mode === mode) || null;
}

function resumeTarget(detail) {
  const saved = historyFor(detail.slug, detail.mode);
  const requested = detail.play && (!detail.play.mode || detail.play.mode === detail.mode);
  const ep =
    requested && detail.play.ep
      ? String(detail.play.ep)
      : saved?.ep || String(detail.episodes[0]?.number || '1');
  const position =
    saved && String(saved.ep) === ep
      ? Number(saved.position) || 0
      : requested && String(detail.play.ep) === ep
        ? Number(detail.play.position) || 0
        : 0;
  return { ep, position };
}

function renderDetail() {
  const detail = state.detail;
  if (!detail) return;
  const info = detail.info || {};
  const saved = historyFor(detail.slug, detail.mode);
  const { ep: targetEp, position } = resumeTarget(detail);
  const poster = imageUrl(info.poster || '');
  const title = info.title || 'Untitled';
  const epCount = detail.episodes.length;
  const modeLabel = detail.mode === 'dub' ? 'Dub' : 'Sub';

  const chips = [
    info.score ? `<span class="chip chip--score">${escapeHtml(info.score)} / 10</span>` : '',
    info.status ? `<span class="chip">${escapeHtml(info.status)}</span>` : '',
    epCount ? `<span class="chip">${epCount} episodes</span>` : '',
    `<span class="chip chip--mode">${modeLabel}</span>`,
  ]
    .filter(Boolean)
    .join('');

  const description = info.description || '';
  const long = description.length > 320;
  const primaryLabel =
    position > 5
      ? `Resume ep ${escapeHtml(targetEp)} · ${formatTime(position)}`
      : `Play ep ${escapeHtml(targetEp)}`;

  refs.detailLayer.innerHTML = `
    <div class="detail">
      <div class="detail__backdrop">
        ${poster ? `<img src="${escapeHtml(poster)}" alt="" data-fade />` : ''}
      </div>
      <div class="detail__veil"></div>
      <div class="detail__scroll">
        <header class="detail__bar">
          <button class="icon-button" type="button" data-detail-close aria-label="Back">${icon(
            'back'
          )}</button>
          <span class="detail__crumb">${escapeHtml(title)}</span>
        </header>

        <section class="detail__hero">
          <div class="detail__poster">
            ${poster ? `<img src="${escapeHtml(poster)}" alt="" data-fade />` : ''}
          </div>
          <div class="detail__intro">
            <p class="eyebrow">Series</p>
            <h1 class="display detail__title">${escapeHtml(title)}</h1>
            ${info.jname ? `<p class="detail__jname">${escapeHtml(info.jname)}</p>` : ''}
            <div class="chips">${chips}</div>
            ${
              description
                ? `<p class="detail__desc ${long ? 'is-clamped' : ''}">${escapeHtml(
                    description
                  )}</p>
                   ${long ? `<button class="detail__more" type="button" data-detail-more>More</button>` : ''}`
                : detail.loading
                  ? `<p class="detail__desc">Reading the synopsis…</p>`
                  : ''
            }
            <div class="detail__actions">
              <button class="button button--primary" type="button" data-detail-play ${
                epCount ? '' : 'disabled'
              }>
                ${icon('play')}<span>${epCount ? primaryLabel : 'Loading episodes…'}</span>
              </button>
              ${
                saved
                  ? `<button class="button button--ghost" type="button" data-detail-close>Keep browsing</button>`
                  : ''
              }
            </div>
          </div>
        </section>

        <section class="detail__episodes">
          <header class="episodes__head">
            <h2 class="episodes__title">Episodes</h2>
            <div class="episodes__mode" role="group" aria-label="Audio track">
              <button type="button" data-mode="sub" class="${
                detail.mode === 'sub' ? 'is-active' : ''
              }" aria-pressed="${detail.mode === 'sub'}">Sub</button>
              <button type="button" data-mode="dub" class="${
                detail.mode === 'dub' ? 'is-active' : ''
              }" aria-pressed="${detail.mode === 'dub'}">Dub</button>
            </div>
          </header>
          ${
            epCount
              ? `<span class="episodes__note">${epCount} episodes · ${modeLabel} · saved position ${
                  saved ? `episode ${escapeHtml(saved.ep)}` : 'none'
                }</span>`
              : ''
          }
          <div class="episode-grid">
            ${
              epCount
                ? detail.episodes
                    .map((episode) => {
                      const current = String(episode.number) === String(targetEp);
                      const pct =
                        saved && String(saved.ep) === String(episode.number) && saved.duration > 0
                          ? Math.min(100, Math.round((saved.position / saved.duration) * 100))
                          : 0;
                      return `<button class="episode ${current ? 'is-current' : ''}" type="button"
                          data-episode="${escapeHtml(episode.number)}"
                          aria-label="Episode ${escapeHtml(episode.number)}">
                          ${escapeHtml(episode.number)}
                          ${pct ? `<span class="episode__fill" style="width:${pct}%"></span>` : ''}
                        </button>`;
                    })
                    .join('')
                : detail.loading
                  ? `<div class="loading" role="status"><span class="spinner"></span><span>Loading episodes…</span></div>`
                  : `<div class="empty" style="padding:0">
                      <h2 style="font-size:24px">No episodes</h2>
                      <p>${escapeHtml(detail.error || 'The source did not list episodes for this title.')}</p>
                      <button class="button button--ghost" type="button" data-detail-retry>Try again</button>
                    </div>`
            }
          </div>
        </section>
      </div>
    </div>`;

  bindImages(refs.detailLayer);
}

function onDetailClick(event) {
  const detail = state.detail;
  if (!detail) return;

  if (event.target.closest('[data-detail-close]')) {
    closeDetail();
    return;
  }

  const more = event.target.closest('[data-detail-more]');
  if (more) {
    const desc = refs.detailLayer.querySelector('.detail__desc');
    const clamped = desc.classList.toggle('is-clamped');
    more.textContent = clamped ? 'More' : 'Less';
    return;
  }

  const mode = event.target.closest('[data-mode]');
  if (mode) {
    const next = mode.dataset.mode === 'dub' ? 'dub' : 'sub';
    if (detail.mode === next) return;
    detail.mode = next;
    renderDetail();
    return;
  }

  if (event.target.closest('[data-detail-retry]')) {
    openDetail(detail.slug, {
      fallback: detail.info,
      mode: detail.mode,
      play: detail.play,
    });
    return;
  }

  const episode = event.target.closest('[data-episode]');
  if (episode) {
    startPlayback(episode.dataset.episode, 0, detail.mode);
    return;
  }

  if (event.target.closest('[data-detail-play]')) {
    const { ep, position } = resumeTarget(detail);
    startPlayback(ep, position, detail.mode);
  }
}

/* ----------------------------- player --------------------------------- */

function startPlayback(ep, position = 0, mode = state.settings.mode) {
  const detail = state.detail;
  if (!detail) return;
  if (player) {
    player.destroy();
    player = null;
  }

  const info = detail.info || {};
  const saved = historyFor(detail.slug, mode);
  const startAt =
    saved && String(saved.ep) === String(ep) ? Number(saved.position) || position || 0 : position || 0;

  lastFocused = document.activeElement;
  settingsDirty = false;

  player = new Player({
    host: refs.playerRoot,
    settings: state.settings,
    context: {
      slug: detail.slug,
      title: info.title || detail.slug,
      poster: info.poster || '',
      mode,
      episodes: detail.episodes,
      ep: String(ep),
      position: startAt,
      query: info.title || detail.slug,
      index: 0,
    },
    onProgress: (entry) => {
      const key = (value) => `${value.slug}::${value.mode}`;
      const index = state.history.findIndex((item) => key(item) === key(entry));
      if (index >= 0) state.history[index] = { ...state.history[index], ...entry };
      else state.history.unshift(entry);
    },
    onClose: () => {
      player = null;
      persistPlayerSettings();
      if (detail) renderDetail();
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    },
    onSettings: () => {
      settingsDirty = true;
    },
  });

  player.open();
}

async function persistPlayerSettings() {
  if (!settingsDirty) return;
  try {
    await api.saveSettings({
      volume: state.settings.volume,
      muted: state.settings.muted,
      quality: state.settings.quality,
      subtitles: state.settings.subtitles,
    });
  } catch {
    /* ignore, next explicit save will retry */
  }
}

/* ----------------------------- settings ------------------------------- */

function ensureSettingsView() {
  if (settingsView) return;
  settingsView = document.createElement('section');
  settingsView.className = 'view view--settings';
  settingsView.id = 'view-settings';
  settingsView.dataset.view = 'settings';
  settingsView.hidden = true;
  refs.main.append(settingsView);
  settingsView.addEventListener('click', onSettingsClick);
  settingsView.addEventListener('change', onSettingsChange);
}

function buildSettings() {
  if (!settingsView) return;
  settingsView.innerHTML = `
    <div class="view__inner">
      <header class="view-head">
        <h1 class="display">Settings</h1>
        <p class="view-sub">How NAMI plays and remembers.</p>
      </header>
      <div class="settings">
        <section class="setting-group glass">
          <h2 class="setting-group__title">Appearance</h2>
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Theme</span>
              <span class="setting-row__desc">System follows your desktop. Light and Dark hold a fixed world for this window.</span>
            </span>
            <span class="setting-row__control">
              <span class="segmented" role="radiogroup" aria-label="Theme">
                <button type="button" class="segmented__option" data-theme-option="system" role="radio" aria-checked="false">System</button>
                <button type="button" class="segmented__option" data-theme-option="light" role="radio" aria-checked="false">Light</button>
                <button type="button" class="segmented__option" data-theme-option="dark" role="radio" aria-checked="false">Dark</button>
              </span>
            </span>
          </div>
        </section>

        <section class="setting-group glass">
          <h2 class="setting-group__title">Playback</h2>
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Default quality</span>
              <span class="setting-row__desc">Pick a ceiling. Auto follows the best stream the source offers.</span>
            </span>
            <span class="setting-row__control">
              <select class="select" data-setting="quality" aria-label="Default quality">
                <option value="best">Auto (best)</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
                <option value="360">360p</option>
              </select>
            </span>
          </div>
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Default audio</span>
              <span class="setting-row__desc">Used when a title has both tracks. You can switch per series.</span>
            </span>
            <span class="setting-row__control">
              <span class="segmented" role="radiogroup" aria-label="Default audio">
                <button type="button" class="segmented__option" data-audio="sub" role="radio">Sub</button>
                <button type="button" class="segmented__option" data-audio="dub" role="radio">Dub</button>
              </span>
            </span>
          </div>
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Autoplay next episode</span>
              <span class="setting-row__desc">Starts the next episode when one finishes. The card still offers a choice first.</span>
            </span>
            <span class="setting-row__control">
              <button class="switch" type="button" role="switch" data-toggle="autoplay" aria-label="Autoplay next episode"></button>
            </span>
          </div>
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Subtitles by default</span>
              <span class="setting-row__desc">Turns on the first subtitle track when a stream provides one.</span>
            </span>
            <span class="setting-row__control">
              <button class="switch" type="button" role="switch" data-toggle="subtitles" aria-label="Subtitles by default"></button>
            </span>
          </div>
        </section>

        <section class="setting-group glass">
          <h2 class="setting-group__title">Content</h2>
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Blur 21+ titles</span>
              <span class="setting-row__desc">Titles flagged adult, ecchi or hentai stay blurred and cannot be opened until you unlock them with your code.</span>
            </span>
            <span class="setting-row__control">
              <button class="switch" type="button" role="switch" data-toggle="adultFilter" aria-label="Blur 21+ titles"></button>
            </span>
          </div>
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Access code</span>
              <span class="setting-row__desc">${
                state.gate.hasCode
                  ? 'A code is set. Unlock with it, or change it.'
                  : 'Set a code so you can reveal locked titles when you want them.'
              }</span>
            </span>
            <span class="setting-row__control">
              ${
                state.gate.hasCode
                  ? `<button class="button button--ghost" type="button" data-gate="unlock">Unlock</button>
                     <button class="button button--ghost" type="button" data-gate="set">Change code</button>
                     <button class="button button--quiet" type="button" data-gate="clear">Remove</button>`
                  : '<button class="button button--primary" type="button" data-gate="set">Set code</button>'
              }
            </span>
          </div>
        </section>

        <section class="setting-group glass setting-group--danger">
          <h2 class="setting-group__title">Your data</h2>
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Watch history</span>
              <span class="setting-row__desc">${state.history.length} entries stored locally. ani-cli's own history is never changed.</span>
            </span>
            <span class="setting-row__control">
              <button class="button button--danger" type="button" data-settings-clear>Clear history</button>
            </span>
          </div>
        </section>

        <p class="settings-about">
          <strong>NAMI ${escapeHtml(state.version || '0.1.0')}</strong><br />
          Streams resolve from the same endpoints ani-cli 5.1.7 uses, with ani-cli as fallback.
          Playback happens inside this window. No account, no telemetry, no files kept after watching.
        </p>
      </div>
    </div>`;
  refreshSettingsControls();
}

function refreshSettingsControls() {
  if (!settingsView) return;
  const toggle = (key) => {
    const button = settingsView.querySelector(`[data-toggle="${key}"]`);
    if (button) button.setAttribute('aria-checked', String(Boolean(state.settings[key])));
  };
  toggle('autoplay');
  toggle('subtitles');
  toggle('adultFilter');

  settingsView.querySelectorAll('[data-audio]').forEach((button) => {
    const active = state.settings.mode === button.dataset.audio;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', String(active));
  });

  settingsView.querySelectorAll('[data-theme-option]').forEach((button) => {
    const active = (state.settings.theme || 'system') === button.dataset.themeOption;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', String(active));
  });

  const quality = settingsView.querySelector('[data-setting="quality"]');
  if (quality) quality.value = state.settings.quality;
}

function refreshGateViews() {
  if (state.results) renderResults(state.query, state.results);
  else renderDiscoverHome();
  renderHistory();
  if (settingsView) buildSettings();
}

function openGateDialog({ mode }) {
  const root = document.getElementById('dialog-root');
  if (!root) return Promise.resolve(null);
  const isSet = mode === 'set';
  const needsCurrent = isSet && state.gate.hasCode;

  return new Promise((resolve) => {
    const previous = document.activeElement;
    const layer = document.createElement('div');
    layer.className = 'dialog-layer';
    layer.innerHTML = `
      <div class="dialog dialog--gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
        <span class="dialog__mark">${icon('lock')}</span>
        <h2 class="dialog__title" id="gate-title">${isSet ? 'Set an access code' : 'Unlock adult titles'}</h2>
        <p class="dialog__text">${
          isSet
            ? 'The code is stored hashed on this machine. You need it to reveal 21+ titles.'
            : 'Enter your access code to reveal 21+ titles for this session.'
        }</p>
        <form class="dialog__form">
          ${
            needsCurrent
              ? '<input class="dialog__input" type="password" name="current" placeholder="Current code" aria-label="Current access code" autocomplete="off" />'
              : ''
          }
          <input class="dialog__input" type="password" name="code" placeholder="${
            isSet ? 'New code' : 'Access code'
          }" aria-label="${isSet ? 'New access code' : 'Access code'}" autocomplete="off" />
          ${
            isSet
              ? '<input class="dialog__input" type="password" name="confirm" placeholder="Repeat new code" aria-label="Repeat new access code" autocomplete="off" />'
              : ''
          }
          <p class="dialog__error" role="alert" data-gate-error hidden></p>
        </form>
        <div class="dialog__actions">
          <button class="button button--ghost" type="button" data-dialog="cancel">Cancel</button>
          <button class="button button--primary" type="button" data-dialog="submit">${
            isSet ? 'Save code' : 'Unlock'
          }</button>
        </div>
      </div>`;

    const form = layer.querySelector('.dialog__form');
    const errorNode = layer.querySelector('[data-gate-error]');
    const showError = (message) => {
      errorNode.textContent = message;
      errorNode.hidden = false;
    };

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      layer.remove();
      document.removeEventListener('keydown', onKey, true);
      if (previous && typeof previous.focus === 'function') previous.focus();
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };

    const submit = async () => {
      const data = new FormData(form);
      const code = String(data.get('code') || '');
      try {
        if (isSet) {
          if (code !== String(data.get('confirm') || '')) {
            showError('The two codes do not match');
            return;
          }
          state.gate = await api.gateSetCode({ code, current: String(data.get('current') || '') });
          finish(state.gate);
          refreshGateViews();
          toast('Access code saved', { type: 'success' });
        } else {
          state.gate = await api.gateUnlock(code);
          finish(state.gate);
          refreshGateViews();
          toast('21+ titles unlocked', { type: 'success' });
        }
      } catch (error) {
        showError(error.message);
      }
    };

    layer.querySelector('[data-dialog="cancel"]')?.addEventListener('click', () => finish(null));
    layer.querySelector('[data-dialog="submit"]')?.addEventListener('click', submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });
    layer.addEventListener('pointerdown', (event) => {
      if (event.target === layer) finish(null);
    });
    document.addEventListener('keydown', onKey, true);
    root.append(layer);
    layer.querySelector('input')?.focus();
  });
}

function onSettingsClick(event) {
  const gate = event.target.closest('[data-gate]');
  if (gate) {
    const action = gate.dataset.gate;
    if (action === 'unlock') openGateDialog({ mode: 'unlock' });
    else if (action === 'set') openGateDialog({ mode: 'set' });
    else if (action === 'clear') {
      confirmDialog({
        title: 'Remove the access code?',
        text: 'Locked 21+ titles go back to blurred and stay that way until you set a new code.',
        confirmLabel: 'Remove code',
        danger: true,
      }).then(async (approved) => {
        if (!approved) return;
        try {
          state.gate = await api.gateClearCode();
          refreshGateViews();
          toast('Access code removed');
        } catch (error) {
          toast(error.message, { type: 'error' });
        }
      });
    }
    return;
  }

  const toggle = event.target.closest('[data-toggle]');
  if (toggle) {
    const key = toggle.dataset.toggle;
    updateSettings({ [key]: !state.settings[key] });
    if (key === 'adultFilter') refreshGateViews();
    return;
  }

  const audio = event.target.closest('[data-audio]');
  if (audio) {
    updateSettings({ mode: audio.dataset.audio === 'dub' ? 'dub' : 'sub' });
    return;
  }

  const theme = event.target.closest('[data-theme-option]');
  if (theme) {
    applyTheme(theme.dataset.themeOption);
    updateSettings({ theme: theme.dataset.themeOption });
    return;
  }

  if (event.target.closest('[data-settings-clear]')) {
    confirmDialog({
      title: 'Clear all history?',
      text: 'Every saved position will be forgotten. Your ani-cli history stays where it is.',
      confirmLabel: 'Clear everything',
      danger: true,
    }).then(async (approved) => {
      if (!approved) return;
      try {
        await api.clearHistory();
        state.history = [];
        buildSettings();
        toast('History cleared');
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    });
  }
}

function onSettingsChange(event) {
  const select = event.target.closest('[data-setting="quality"]');
  if (!select) return;
  updateSettings({ quality: select.value });
}

async function updateSettings(patch) {
  const previous = state.settings;
  state.settings = { ...state.settings, ...patch };
  refreshSettingsControls();
  try {
    state.settings = { subtitles: true, ...(await api.saveSettings(patch)) };
    refreshSettingsControls();
    if (patch.quality) toast(`Quality set to ${qualityLabel(state.settings.quality)}`, { type: 'success' });
  } catch (error) {
    state.settings = previous;
    applyTheme(previous.theme);
    refreshSettingsControls();
    toast(error.message, { type: 'error' });
  }
}

function qualityLabel(value) {
  if (value === 'best') return 'Auto (best)';
  return `${value}p`;
}

/* ------------------------------ start --------------------------------- */

window.addEventListener('beforeunload', () => {
  if (player) player.destroy();
});

ensureSettingsView();
buildSettings();
bindChrome();
boot();
