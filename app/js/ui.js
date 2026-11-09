import { imageUrl } from './api.js';
import { lockLabel } from './gate-view.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function icon(name, className = '') {
  const cls = className ? `icon ${className}` : 'icon';
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function timeAgo(timestamp) {
  const value = Number(timestamp) || 0;
  if (!value) return 'Imported from ani-cli';
  const diff = Date.now() - value;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) {
    const minutes = Math.floor(diff / 60_000);
    return `${minutes} min ago`;
  }
  if (diff < 86_400_000) {
    const hours = Math.floor(diff / 3_600_000);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  if (diff < 7 * 86_400_000) {
    const days = Math.floor(diff / 86_400_000);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value);
  } catch {
    return 'Earlier';
  }
}

export function bindImages(root) {
  for (const img of root.querySelectorAll('img[data-fade]')) {
    if (img.dataset.bound) continue;
    img.dataset.bound = '1';
    const done = () => img.classList.add('is-loaded');
    const fail = () => {
      const parent = img.parentElement;
      img.remove();
      parent?.classList.add('is-missing');
    };
    if (img.complete && img.naturalWidth > 0) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', fail, { once: true });
    }
  }
}

function metaParts(item) {
  return [item.type, item.episodes ? `${item.episodes} eps` : '', item.duration].filter(Boolean);
}

export function posterCard(item, { rank = 0, locked = false } = {}) {
  const li = document.createElement('li');
  li.className = `poster-card${locked ? ' poster-card--locked' : ''}`;
  const parts = metaParts(item);
  const poster = imageUrl(item.poster);

  if (locked) {
    li.innerHTML = `
      <button class="poster-card__button" type="button" data-locked="${escapeHtml(
        item.title
      )}" aria-label="${escapeHtml(item.title)} is 21+ and locked">
        <span class="poster-card__art">
          <span class="poster-card__blur">${
            poster ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy" data-fade />` : ''
          }</span>
          <span class="poster-card__lock">${icon('lock')}<span>${lockLabel()}</span></span>
        </span>
        <span class="poster-card__body">
          <span class="poster-card__title">${escapeHtml(item.title)}</span>
          <span class="poster-card__meta"><span>Locked</span></span>
        </span>
      </button>`;
    bindImages(li);
    return li;
  }

  li.innerHTML = `
    <button class="poster-card__button" type="button" data-slug="${escapeHtml(item.slug)}" data-title="${escapeHtml(item.title)}" data-poster="${escapeHtml(item.poster || '')}">
      <span class="poster-card__art">
        ${poster ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy" data-fade />` : ''}
        ${rank ? `<span class="poster-card__rank">${String(rank).padStart(2, '0')}</span>` : ''}
      </span>
      <span class="poster-card__body">
        <span class="poster-card__title">${escapeHtml(item.title)}</span>
        ${
          parts.length
            ? `<span class="poster-card__meta">${parts
                .map((part) => `<span>${escapeHtml(part)}</span>`)
                .join('')}</span>`
            : ''
        }
      </span>
    </button>`;
  bindImages(li);
  return li;
}

export function skeletonGrid(count = 8) {
  return `<div class="skeleton-grid" aria-hidden="true">${Array.from({ length: count })
    .map(
      () => `
      <div class="skeleton-card">
        <span class="skeleton skeleton--poster"></span>
        <span class="skeleton skeleton--line"></span>
        <span class="skeleton skeleton--line skeleton--line-short"></span>
      </div>`
    )
    .join('')}</div>`;
}

export function loadingBlock(label = 'Loading') {
  return `<div class="loading" role="status">${'<span class="spinner"></span>'}<span>${escapeHtml(
    label
  )}</span></div>`;
}

export function emptyState({ iconName = 'wave', title, text, actionLabel, onAction }) {
  const wrap = document.createElement('div');
  wrap.className = 'empty';
  wrap.innerHTML = `
    <span class="empty__mark">${icon(iconName)}</span>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(text)}</p>
    ${actionLabel ? `<button class="button button--ghost" type="button">${escapeHtml(actionLabel)}</button>` : ''}`;
  if (actionLabel && onAction) {
    wrap.querySelector('button')?.addEventListener('click', onAction);
  }
  return wrap;
}

export function toast(message, { type = 'info', duration = 4200 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  while (root.children.length >= 3) root.firstElementChild?.remove();

  const node = document.createElement('div');
  node.className = `toast${type === 'success' ? ' toast--success' : ''}`;
  node.setAttribute('role', 'status');
  node.innerHTML = `
    ${icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'spark')}
    <p>${escapeHtml(message)}</p>
    <button class="toast__close" type="button" aria-label="Dismiss">${icon('close')}</button>`;

  let timer = null;
  const dismiss = () => {
    if (!node.isConnected) return;
    clearTimeout(timer);
    node.classList.add('is-leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400);
  };

  node.querySelector('.toast__close')?.addEventListener('click', dismiss);
  root.append(node);
  if (duration) timer = setTimeout(dismiss, duration);
}

export function confirmDialog({
  title,
  text,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
}) {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog-root');
    if (!root) return resolve(false);
    const previous = document.activeElement;
    const layer = document.createElement('div');
    layer.className = 'dialog-layer';
    layer.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 class="dialog__title" id="dialog-title">${escapeHtml(title)}</h2>
        ${text ? `<p class="dialog__text">${escapeHtml(text)}</p>` : ''}
        <div class="dialog__actions">
          <button class="button button--ghost" type="button" data-dialog="cancel">${escapeHtml(
            cancelLabel
          )}</button>
          <button class="button ${
            danger ? 'button--solid-danger' : 'button--primary'
          }" type="button" data-dialog="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;

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
        finish(false);
      }
      if (event.key === 'Tab') {
        const buttons = [...layer.querySelectorAll('button')];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    layer.querySelector('[data-dialog="cancel"]')?.addEventListener('click', () => finish(false));
    layer.querySelector('[data-dialog="confirm"]')?.addEventListener('click', () => finish(true));
    layer.addEventListener('pointerdown', (event) => {
      if (event.target === layer) finish(false);
    });
    document.addEventListener('keydown', onKey, true);
    root.append(layer);
    layer.querySelector('[data-dialog="confirm"]')?.focus();
  });
}

export function applyPosterBackdrop(element, url) {
  if (!element) return;
  const next = imageUrl(url);
  if (!next) {
    element.style.backgroundImage = '';
    element.classList.remove('is-live');
    return;
  }
  const image = new Image();
  image.onload = () => {
    element.style.backgroundImage = `url("${next}")`;
    element.classList.add('is-live');
  };
  image.src = next;
}
