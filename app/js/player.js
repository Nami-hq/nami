import { api, streamUrl, imageUrl } from './api.js';
import { escapeHtml, icon, formatTime, bindImages } from './ui.js';
import {
  shouldOfferSkipIntro,
  nextIntroEnd,
  learnIntroSkips,
  shouldOfferNext,
} from './playback-rules.js';

const IDLE_DELAY = 2800;
const SAVE_INTERVAL = 5000;
const AUTOPLAY_DELAY = 7;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class Player {
  constructor({ host, context, settings, onClose, onProgress, onSettings }) {
    this.host = host;
    this.context = context;
    this.settings = settings;
    this.onClose = onClose;
    this.onProgress = onProgress;
    this.onSettings = onSettings;

    this.episodes = Array.isArray(context.episodes) ? [...context.episodes] : [];
    this.ep = String(context.ep || '1');
    this.mode = context.mode === 'dub' ? 'dub' : 'sub';
    this.data = null;
    this.hls = null;
    this.destroyed = false;
    this.closing = false;
    this.startAt = Number(context.position) || 0;
    this.pendingSeek = this.startAt;
    this.subtitleIndex = settings.subtitles === false ? -1 : 0;
    this.lastSaved = 0;
    this.idleTimer = null;
    this.countdownTimer = null;
    this.countdownLeft = 0;
    this.nextEpisode = null;
    this.lastVolume = settings.muted ? 0 : Number(settings.volume) || 1;
    this.networkRetried = false;
    this.dragging = false;
    this.introSkip = null;
    this.learned = null;
    this.introEvidence = null;
    this.skipOffered = false;
    this.upnextDismissed = false;
  }

  /* ------------------------------ build -------------------------------- */

  open() {
    this.render();
    this.cache();
    this.bind();
    this.load(this.ep, this.startAt);
  }

  render() {
    const title = this.context.title || 'Unknown title';
    this.host.innerHTML = `
      <div class="player is-paused" role="dialog" aria-modal="true" aria-label="Video player">
        <div class="player__stage">
          <video class="player__video" playsinline preload="metadata"></video>
          <div class="player__flash"><span class="player__flash-icon">${icon('pause')}</span></div>
          <div class="player__buffer"><span class="spinner"></span></div>
          <button class="player__skip" type="button" data-action="skip-intro" aria-hidden="true" tabindex="-1">
            <span class="player__skip-label">Skip intro</span>
            ${icon('next')}
          </button>
        </div>

        <div class="player__chrome">
          <header class="player__top">
            <button class="player__back" type="button" data-action="close" aria-label="Back to details">
              ${icon('back')}
            </button>
            <div class="player__heading">
              <div class="player__marquee"><span class="player__title">${escapeHtml(title)}</span></div>
              <div class="player__sub">
                <span data-ep-label>EP ${escapeHtml(this.ep)}</span>
                <span>${this.mode}</span>
                <span class="player__live" data-quality-label>AUTO</span>
              </div>
            </div>
          </header>

          <div class="player__spacer"></div>

          <footer class="player__bottom">
            <div class="player__scrub">
              <span class="timecode" data-current>0:00</span>
              <div class="scrub" role="slider" tabindex="0" aria-label="Seek"
                aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0:00">
                <div class="scrub__track">
                  <div class="scrub__buffer" data-buffer></div>
                  <div class="scrub__fill" data-fill></div>
                </div>
                <div class="scrub__thumb" data-thumb></div>
                <div class="scrub__tip" data-tip>0:00</div>
              </div>
              <span class="timecode timecode--end" data-duration>0:00</span>
            </div>

            <div class="player__controls">
              <button class="control control--play" type="button" data-action="toggle" aria-label="Play">
                ${icon('play', 'icon--play')}${icon('pause', 'icon--pause')}
              </button>
              <button class="control" type="button" data-action="prev" aria-label="Previous episode" disabled>
                ${icon('prev')}
              </button>
              <button class="control" type="button" data-action="next" aria-label="Next episode" disabled>
                ${icon('next')}
              </button>

              <div class="volume">
                <button class="control" type="button" data-action="mute" aria-label="Mute">${icon('volume')}</button>
                <div class="volume__slider">
                  <input class="volume__range" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume" />
                </div>
              </div>

              <span class="player__spacer"></span>

              <div class="menu-wrap">
                <button class="control" type="button" data-action="subtitles" aria-label="Subtitles" aria-expanded="false">
                  ${icon('cc')}
                </button>
                <div class="menu" data-menu="subtitles"></div>
              </div>

              <div class="menu-wrap">
                <button class="control" type="button" data-action="quality" aria-label="Quality" aria-expanded="false">
                  <span class="mono" data-quality-button style="font-size:10.5px">AUTO</span>
                </button>
                <div class="menu" data-menu="quality"></div>
              </div>

              <button class="control" type="button" data-action="pip" aria-label="Picture in picture">${icon('pip')}</button>
              <button class="control" type="button" data-action="fullscreen" aria-label="Fullscreen">
                ${icon('expand', 'icon--expand')}${icon('compress', 'icon--compress')}
              </button>
            </div>
          </footer>
        </div>

        <div class="upnext" data-upnext>
          <div class="upnext__art" data-upnext-art></div>
          <div class="upnext__text">
            <span class="upnext__eyebrow">Up next</span>
            <div class="upnext__title" data-upnext-title></div>
            <div class="upnext__meta" data-upnext-meta></div>
          </div>
          <div class="upnext__actions">
            <button class="upnext__button" type="button" data-upnext-play>Play</button>
            <button class="upnext__dismiss" type="button" data-upnext-dismiss aria-label="Dismiss">
              ${icon('close')}
            </button>
          </div>
        </div>

        <div class="player__error" data-error>
          <div class="player__error-card">
            ${icon('alert')}
            <h2>Stream interrupted</h2>
            <p data-error-text>This episode could not be played.</p>
            <div class="player__error-actions">
              <button class="button button--ghost" type="button" data-error-back>Back</button>
              <button class="button button--primary" type="button" data-error-retry>Try again</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  cache() {
    const q = (selector) => this.host.querySelector(selector);
    this.root = q('.player');
    this.video = q('.player__video');
    this.els = {
      stage: q('.player__stage'),
      flash: q('.player__flash'),      epLabel: q('[data-ep-label]'),
      qualityLabel: q('[data-quality-label]'),
      qualityButton: q('[data-quality-button]'),
      current: q('[data-current]'),
      duration: q('[data-duration]'),
      scrub: q('.scrub'),
      fill: q('[data-fill]'),
      buffer: q('[data-buffer]'),
      skipIntro: q('[data-action="skip-intro"]'),
      thumb: q('[data-thumb]'),
      tip: q('[data-tip]'),
      play: q('[data-action="toggle"]'),
      prev: q('[data-action="prev"]'),
      next: q('[data-action="next"]'),
      mute: q('[data-action="mute"]'),
      volume: q('.volume__range'),
      subtitlesButton: q('[data-action="subtitles"]'),
      qualityButtonWrap: q('[data-action="quality"]'),
      subtitleMenu: q('[data-menu="subtitles"]'),
      qualityMenu: q('[data-menu="quality"]'),
      pip: q('[data-action="pip"]'),
      fullscreen: q('[data-action="fullscreen"]'),
      error: q('[data-error]'),
      errorText: q('[data-error-text]'),
      upnext: q('[data-upnext]'),
      upnextArt: q('[data-upnext-art]'),
      upnextTitle: q('[data-upnext-title]'),
      upnextMeta: q('[data-upnext-meta]'),
      upnextPlay: q('[data-upnext-play]'),
      upnextDismiss: q('[data-upnext-dismiss]'),
    };

    this.video.volume = clamp(Number(this.settings.volume ?? 1), 0, 1);
    this.video.muted = Boolean(this.settings.muted);
    this.updateVolumeUi();
    this.updateEpisodeNav();
    this.buildSubtitleMenu([]);
    this.buildQualityMenu();
  }

  /* ------------------------------ events -------------------------------- */

  bind() {
    const { video } = this;

    this.onRootClick = (event) => this.handleClick(event);
    this.onDocClick = (event) => {
      if (!this.root?.contains(event.target)) return;
      if (event.target.closest('.menu-wrap')) return;
      this.closeMenus();
    };
    this.onKey = (event) => this.handleKey(event);
    this.onPointerMove = () => this.wake();
    this.onBillboard = (event) => {
      if (event.target.closest('button, .scrub, input, .menu, .upnext')) return;
      this.togglePlayback();
    };

    this.root.addEventListener('click', this.onRootClick);
    this.root.addEventListener('pointermove', this.onPointerMove, { passive: true });
    document.addEventListener('click', this.onDocClick);
    document.addEventListener('keydown', this.onKey);
    this.els.stage.addEventListener('click', this.onBillboard);

    video.addEventListener('play', () => this.syncPlayState());
    video.addEventListener('pause', () => this.syncPlayState());
    video.addEventListener('waiting', () => this.root.classList.add('is-buffering'));
    video.addEventListener('playing', () => this.root.classList.remove('is-buffering'));
    video.addEventListener('canplay', () => this.root.classList.remove('is-buffering'));
    video.addEventListener('timeupdate', () => {
      this.updateScrub();
      this.updateSkipIntro();
      this.updateUpNextPrompt();
      this.save();
    });
    video.addEventListener('progress', () => this.updateBuffer());
    video.addEventListener('durationchange', () => this.updateScrub());
    video.addEventListener('loadedmetadata', () => this.applyPendingSeek());
    video.addEventListener('ended', () => this.handleEnded());
    video.addEventListener('error', () => {
      if (!this.destroyed && this.data) {
        this.showError('This stream stopped before it finished.', 'The video element reported an error.');
      }
    });

    this.bindScrub();
    this.bindVolume();
    this.els.upnextPlay.addEventListener('click', () => this.playNextEpisode());
    this.els.upnextDismiss.addEventListener('click', () => {
      this.upnextDismissed = true;
      this.hideUpNext();
    });
    this.host.querySelector('[data-error-retry]')?.addEventListener('click', () => this.retry());
    this.host.querySelector('[data-error-back]')?.addEventListener('click', () => this.close());

    if (!document.pictureInPictureEnabled) this.els.pip.hidden = true;
    if (!document.fullscreenEnabled) this.els.fullscreen.hidden = true;
    document.addEventListener('fullscreenchange', this.onFullscreenChange = () => {
      this.root.classList.toggle('is-fullscreen', Boolean(document.fullscreenElement));
    });
  }

  handleClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action) {
      switch (action) {
        case 'close':
          this.close();
          break;
        case 'toggle':
          this.togglePlayback();
          break;
        case 'prev':
          this.stepEpisode(-1);
          break;
        case 'next':
          this.stepEpisode(1);
          break;
        case 'skip-intro':
          this.skipIntro();
          break;
        case 'mute':
          this.toggleMute();
          break;
        case 'subtitles':
          this.toggleMenu('subtitles');
          break;
        case 'quality':
          this.toggleMenu('quality');
          break;
        case 'pip':
          this.togglePictureInPicture();
          break;
        case 'fullscreen':
          this.toggleFullscreen();
          break;
        default:
          break;
      }
      return;
    }

    if (event.target.closest('.menu-wrap')) return;
    this.closeMenus();
  }

  handleKey(event) {
    if (!this.root?.isConnected) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target?.tagName)) return;
    if ((event.key === ' ' || event.key === 'Enter') && event.target?.closest?.('button')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    switch (event.key) {
      case ' ':
      case 'k':
      case 'K':
        event.preventDefault();
        this.togglePlayback();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.seekBy(-10);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.seekBy(10);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.changeVolume(0.05);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.changeVolume(-0.05);
        break;
      case 'm':
      case 'M':
        this.toggleMute();
        break;
      case 'f':
      case 'F':
        this.toggleFullscreen();
        break;
      case 'c':
      case 'C':
        this.toggleSubtitles();
        break;
      case 'n':
      case 'N':
        this.stepEpisode(1);
        break;
      case 'p':
      case 'P':
        this.stepEpisode(-1);
        break;
      case 'Escape':
        if (document.fullscreenElement) return;
        if (this.hasOpenMenu()) {
          this.closeMenus();
          return;
        }
        event.preventDefault();
        this.close();
        break;
      default:
        break;
    }
    this.wake();
  }

  /* ------------------------------ load --------------------------------- */

  async load(ep, startAt = 0) {
    if (this.destroyed) return;
    this.ep = String(ep);
    this.startAt = Number(startAt) || 0;
    this.pendingSeek = this.startAt;
    this.lastSaved = 0;
    this.networkRetried = false;
    this.data = null;
    this.introSkip = null;
    this.learned = null;
    this.introEvidence = null;
    this.setSkipOffered(false);
    this.upnextDismissed = false;
    this.hideError();
    this.hideUpNext();
    this.closeMenus();
    this.destroyHls();
    this.destroyTracks();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.root.classList.add('is-buffering');
    this.root.classList.remove('is-idle');
    this.updateHeading();
    this.updateEpisodeNav();

    const episode = this.episodes.find((item) => String(item.number) === this.ep);

    try {
      const data = await api.resolve({
        slug: this.context.slug,
        ep: this.ep,
        epId: episode?.id || '',
        mode: this.mode,
        query: this.context.query || this.context.title,
        index: this.context.index ?? 0,
      });
      if (this.destroyed) return;

      this.data = data;
      if (data.poster && !this.context.poster) this.context.poster = data.poster;
      this.setupSubtitles(data.subtitles || []);
      this.updateHeading();
      this.attach(data.masterUrl, data.referer);
      this.loadIntro();
    } catch (error) {
      if (this.destroyed) return;
      this.root.classList.remove('is-buffering');
      this.showError(error.message || 'This episode could not be resolved.');
    }
  }

  attach(masterUrl, referer) {
    const source = streamUrl(masterUrl, referer);
    if (!source) {
      this.showError('The source did not return a playable link.');
      return;
    }

    if (window.Hls?.isSupported()) {
      const hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      this.hls = hls;
      let manifestReady = false;

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        manifestReady = true;
        this.buildQualityMenu();
        this.applyPreferredQuality();
        this.startPlayback();
      });

      hls.on(window.Hls.Events.LEVEL_SWITCHED, () => {
        this.updateQualityLabel();
      });

      hls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || this.destroyed) return;
        if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && !this.networkRetried) {
          this.networkRetried = true;
          hls.startLoad();
          return;
        }
        this.root.classList.remove('is-buffering');
        this.showError(
          manifestReady
            ? 'The stream stopped responding.'
            : 'The stream host did not answer.',
          data.details || data.type
        );
      });

      hls.loadSource(source);
      hls.attachMedia(this.video);
      this.updateQualityLabel();
      return;
    }

    if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      this.video.src = source;
      this.video.addEventListener('loadedmetadata', () => this.startPlayback(), { once: true });
      this.buildQualityMenu();
      return;
    }

    this.showError('This build cannot play HLS video.');
  }

  startPlayback() {
    if (this.destroyed) return;
    const attempt = this.video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        this.syncPlayState();
      });
    }
  }

  /* ------------------------------ quality ------------------------------- */

  buildQualityMenu() {
    const menu = this.els.qualityMenu;
    if (!menu) return;
    const levels = this.hls?.levels || [];
    let items = [];

    if (levels.length) {
      items = [
        { key: 'auto', label: 'Auto', meta: 'Adapts to the connection' },
        ...levels
          .map((level, index) => ({
            key: String(index),
            label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}k`,
            meta: level.bitrate ? `${(level.bitrate / 1_000_000).toFixed(1)} Mbps` : '',
            height: level.height,
          }))
          .sort((a, b) => (b.height || 0) - (a.height || 0)),
      ];
    } else if (this.data?.variants?.length) {
      items = [
        { key: 'auto', label: 'Auto', meta: 'Best available' },
        ...this.data.variants.map((variant) => ({
          key: variant.url,
          label: variant.label,
          meta: variant.bandwidth ? `${(variant.bandwidth / 1_000_000).toFixed(1)} Mbps` : '',
          height: variant.height,
        })),
      ];
    } else {
      menu.innerHTML = `<p class="menu__label">Quality</p><button class="menu__item" disabled>Loading stream…</button>`;
      return;
    }

    const activeKey = this.activeQualityKey();
    menu.innerHTML = `
      <p class="menu__label">Quality</p>
      ${items
        .map(
          (item) => `
        <button class="menu__item ${item.key === activeKey ? 'is-active' : ''}" type="button"
          data-quality-key="${escapeHtml(item.key)}">
          <span>${escapeHtml(item.label)}</span>
          <span class="menu__meta">${escapeHtml(item.meta)}</span>
          ${icon('check')}
        </button>`
        )
        .join('')}`;

    menu.querySelectorAll('[data-quality-key]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectQuality(button.dataset.qualityKey);
        this.closeMenus();
      });
    });
  }

  activeQualityKey() {
    if (this.hls) {
      if (this.hls.autoLevelEnabled) return 'auto';
      return String(this.hls.currentLevel);
    }
    return this.qualityKey || 'auto';
  }

  applyPreferredQuality() {
    if (!this.hls) return;
    const preference = this.settings.quality || 'best';
    if (preference === 'best') {
      this.hls.currentLevel = -1;
      this.updateQualityLabel();
      return;
    }
    const target = Number(preference);
    const levels = this.hls.levels || [];
    let best = -1;
    let bestHeight = -1;
    levels.forEach((level, index) => {
      const height = level.height || 0;
      if (height <= target && height > bestHeight) {
        best = index;
        bestHeight = height;
      }
    });
    if (best < 0 && levels.length) {
      best = levels.reduce(
        (lowest, level, index) =>
          !levels[lowest] || (level.height || 0) < (levels[lowest].height || 0) ? index : lowest,
        0
      );
    }
    if (best >= 0) this.hls.currentLevel = best;
    this.updateQualityLabel();
  }

  selectQuality(key) {
    if (this.hls && this.hls.levels.length) {
      this.hls.currentLevel = key === 'auto' ? -1 : Number(key);
      this.buildQualityMenu();
      this.updateQualityLabel();
      return;
    }

    const variant = this.data?.variants?.find((item) => item.url === key);
    const resume = this.video.currentTime || 0;
    const wasPlaying = !this.video.paused;
    this.destroyHls();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.qualityKey = key;

    if (!variant) {
      this.attach(this.data.masterUrl, this.data.referer);
    } else {
      this.video.src = streamUrl(variant.url, this.data.referer);
      this.video.addEventListener(
        'loadedmetadata',
        () => {
          this.video.currentTime = resume;
          if (wasPlaying) this.startPlayback();
        },
        { once: true }
      );
    }
    this.updateQualityLabel();
  }

  updateQualityLabel() {
    if (!this.els.qualityLabel) return;
    let label = 'AUTO';
    if (this.hls && !this.hls.autoLevelEnabled && this.hls.currentLevel >= 0) {
      const level = this.hls.levels[this.hls.currentLevel];
      if (level) label = level.height ? `${level.height}P` : `${Math.round(level.bitrate / 1000)}K`;
    } else if (this.qualityKey && this.qualityKey !== 'auto') {
      const variant = this.data?.variants?.find((item) => item.url === this.qualityKey);
      if (variant) label = variant.label.toUpperCase();
    }
    this.els.qualityLabel.textContent = label;
    if (this.els.qualityButton) this.els.qualityButton.textContent = label === 'AUTO' ? 'AUTO' : label;
    this.buildQualityMenu();
  }

  /* ---------------------------- subtitles ------------------------------- */

  setupSubtitles(tracks) {
    this.subtitleTracks = tracks;
    if (!tracks.length) {
      this.subtitleIndex = -1;
      this.buildSubtitleMenu([]);
      this.syncSubtitleButton();
      return;
    }

    const preferred = tracks.findIndex((track) => track.default);
    this.subtitleIndex = this.settings.subtitles === false ? -1 : preferred >= 0 ? preferred : 0;
    this.buildSubtitleMenu(tracks);
    this.syncSubtitleButton();
    this.addSubtitleTracks();
  }

  destroyTracks() {
    this.video.querySelectorAll('track').forEach((track) => track.remove());
    this.subtitleTracks = [];
  }

  buildSubtitleMenu(tracks) {
    const menu = this.els?.subtitleMenu;
    if (!menu) return;
    const items = [
      `<button class="menu__item ${this.subtitleIndex === -1 ? 'is-active' : ''}" type="button" data-subtitle="-1">
        <span>Off</span>${icon('check')}
      </button>`,
      ...tracks.map(
        (track, index) => `
        <button class="menu__item ${this.subtitleIndex === index ? 'is-active' : ''}" type="button"
          data-subtitle="${index}">
          <span>${escapeHtml(track.label || track.lang || `Track ${index + 1}`)}</span>${icon('check')}
        </button>`
      ),
    ];

    menu.innerHTML = `<p class="menu__label">Subtitles</p>${
      tracks.length ? items.join('') : `<p class="menu__item" style="opacity:.5">No subtitles listed</p>`
    }`;

    menu.querySelectorAll('[data-subtitle]').forEach((button) => {
      button.addEventListener('click', () => {
        this.setSubtitle(Number(button.dataset.subtitle));
        this.closeMenus();
      });
    });
  }

  setSubtitle(index) {
    this.subtitleIndex = index;
    this.settings.subtitles = index >= 0;
    this.onSettings?.();
    this.applySubtitleMode();
    this.buildSubtitleMenu(this.subtitleTracks || []);
    this.syncSubtitleButton();
  }

  toggleSubtitles() {
    if (!this.subtitleTracks?.length) {
      this.setSubtitle(-1);
      return;
    }
    this.setSubtitle(this.subtitleIndex >= 0 ? -1 : 0);
  }

  syncSubtitleButton() {
    this.els.subtitlesButton?.classList.toggle('is-active', this.subtitleIndex >= 0);
  }

  addSubtitleTracks() {
    this.video.querySelectorAll('track').forEach((track) => track.remove());
    const tracks = this.data?.subtitles || [];
    tracks.forEach((track, index) => {
      const element = document.createElement('track');
      element.kind = 'subtitles';
      element.label = track.label || track.lang || `Track ${index + 1}`;
      element.srclang = (track.lang || 'en').toLowerCase();
      element.src = streamUrl(track.src, this.data.referer);
      if (this.subtitleIndex >= 0 && index === this.subtitleIndex) element.default = true;
      element.addEventListener(
        'load',
        () => {
          if (this.destroyed) return;
          this.applySubtitleMode();
        },
        { once: true }
      );
      this.video.append(element);
    });
    this.applySubtitleMode();
  }

  applySubtitleMode() {
    const tracks = this.video.textTracks;
    for (let index = 0; index < tracks.length; index += 1) {
      tracks[index].mode = index === this.subtitleIndex ? 'showing' : 'disabled';
    }
  }

  /* ---------------------------- transport ------------------------------- */

  togglePlayback() {
    if (!this.data && !this.video.src) return;
    if (this.video.paused) {
      this.startPlayback();
      this.flash('play');
    } else {
      this.video.pause();
      this.flash('pause');
    }
    this.wake();
  }

  flash(name) {
    const iconEl = this.els.flash?.firstElementChild;
    if (!iconEl) return;
    iconEl.innerHTML = icon(name);
    this.els.flash.classList.remove('is-on');
    void this.els.flash.offsetWidth;
    this.els.flash.classList.add('is-on');
  }

  seekBy(seconds) {
    if (!Number.isFinite(this.video.duration)) return;
    this.video.currentTime = clamp(this.video.currentTime + seconds, 0, this.video.duration);
    this.updateScrub();
    this.save();
  }

  stepEpisode(direction) {
    const index = this.episodes.findIndex((item) => String(item.number) === this.ep);
    if (index < 0) return;
    const next = this.episodes[index + direction];
    if (!next) return;
    this.save(true);
    this.load(next.number, 0);
  }

  updateEpisodeNav() {
    if (!this.els.prev) return;
    const index = this.episodes.findIndex((item) => String(item.number) === this.ep);
    this.els.prev.disabled = index <= 0;
    this.els.next.disabled = index < 0 || index >= this.episodes.length - 1;
  }

  updateHeading() {
    if (!this.els.epLabel) return;
    this.els.epLabel.textContent = `EP ${this.ep}`;
    const mode = this.root?.querySelector('.player__sub span:nth-child(2)');
    if (mode) mode.textContent = this.mode;
  }

  /* ----------------------------- volume --------------------------------- */

  bindVolume() {
    this.els.volume.addEventListener('input', () => {
      const value = clamp(Number(this.els.volume.value), 0, 1);
      this.video.volume = value;
      this.video.muted = value === 0;
      this.settings.volume = value;
      this.settings.muted = value === 0;
      if (value > 0) this.lastVolume = value;
      this.updateVolumeUi();
      this.onSettings?.();
    });
  }

  changeVolume(delta) {
    const next = clamp((this.video.muted ? 0 : this.video.volume) + delta, 0, 1);
    this.video.volume = next;
    this.video.muted = next === 0;
    this.settings.volume = next;
    this.settings.muted = next === 0;
    if (next > 0) this.lastVolume = next;
    this.updateVolumeUi();
    this.onSettings?.();
    this.wake();
  }

  toggleMute() {
    if (this.video.muted || this.video.volume === 0) {
      this.video.muted = false;
      if (this.video.volume === 0) this.video.volume = this.lastVolume || 0.6;
    } else {
      this.lastVolume = this.video.volume;
      this.video.muted = true;
    }
    this.settings.muted = this.video.muted;
    this.settings.volume = this.video.volume;
    this.updateVolumeUi();
    this.onSettings?.();
    this.wake();
  }

  updateVolumeUi() {
    if (!this.els.mute) return;
    const muted = this.video.muted || this.video.volume === 0;
    this.els.mute.innerHTML = icon(muted ? 'mute' : 'volume');
    this.els.mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    this.els.volume.value = String(muted ? 0 : this.video.volume);
    this.els.volume.style.setProperty('--volume', `${Math.round((muted ? 0 : this.video.volume) * 100)}%`);
  }

  /* ------------------------------ scrub --------------------------------- */

  bindScrub() {
    const scrub = this.els.scrub;

    const ratioFor = (event) => {
      const rect = scrub.getBoundingClientRect();
      if (!rect.width) return 0;
      return clamp((event.clientX - rect.left) / rect.width, 0, 1);
    };

    const seekTo = (event) => {
      const duration = this.video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const ratio = ratioFor(event);
      this.video.currentTime = ratio * duration;
      this.els.tip.textContent = formatTime(ratio * duration);
      this.updateScrub();
    };

    const showTip = (event) => {
      const ratio = ratioFor(event);
      const duration = this.video.duration;
      this.els.tip.style.left = `${ratio * 100}%`;
      this.els.tip.textContent = formatTime(ratio * (Number.isFinite(duration) ? duration : 0));
    };

    scrub.addEventListener('pointerdown', (event) => {
      if (!Number.isFinite(this.video.duration)) return;
      this.dragging = true;
      scrub.classList.add('is-dragging');
      scrub.setPointerCapture(event.pointerId);
      seekTo(event);
      event.preventDefault();
    });
    scrub.addEventListener('pointermove', (event) => {
      showTip(event);
      if (this.dragging) seekTo(event);
    });
    scrub.addEventListener('pointerup', (event) => {
      if (!this.dragging) return;
      this.dragging = false;
      scrub.classList.remove('is-dragging');
      try {
        scrub.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer already released */
      }
      this.save(true);
    });
    scrub.addEventListener('pointercancel', () => {
      this.dragging = false;
      scrub.classList.remove('is-dragging');
    });
    scrub.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.seekBy(-5);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.seekBy(5);
      } else if (event.key === 'Home') {
        event.preventDefault();
        this.video.currentTime = 0;
      } else if (event.key === 'End' && Number.isFinite(this.video.duration)) {
        event.preventDefault();
        this.video.currentTime = Math.max(0, this.video.duration - 1);
      }
    });
  }

  updateScrub() {
    const duration = Number.isFinite(this.video.duration) ? this.video.duration : 0;
    const current = clamp(this.video.currentTime || 0, 0, duration || 0);
    const ratio = duration ? current / duration : 0;
    const pct = ratio * 100;

    if (this.els.fill) this.els.fill.style.width = `${pct}%`;
    if (this.els.thumb) this.els.thumb.style.left = `${pct}%`;
    if (this.els.current) this.els.current.textContent = formatTime(current);
    if (this.els.duration) this.els.duration.textContent = duration ? formatTime(duration) : '0:00';
    if (this.els.scrub) {
      this.els.scrub.setAttribute('aria-valuenow', String(Math.round(pct)));
      this.els.scrub.setAttribute('aria-valuetext', `${formatTime(current)} of ${formatTime(duration)}`);
    }
    this.updateBuffer();
  }

  updateBuffer() {
    if (!this.els.buffer) return;
    const duration = this.video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      const ranges = this.video.buffered;
      if (!ranges.length) return;
      let end = 0;
      for (let index = 0; index < ranges.length; index += 1) {
        end = Math.max(end, ranges.end(index));
      }
      this.els.buffer.style.width = `${clamp((end / duration) * 100, 0, 100)}%`;
    } catch {
      /* buffered ranges unavailable */
    }
  }

  applyPendingSeek() {
    if (!this.pendingSeek) return;
    const duration = this.video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const position = this.pendingSeek;
    this.pendingSeek = 0;
    if (position > 5 && position < duration - 8) {
      this.video.currentTime = position;
      this.updateScrub();
    }
  }

  /* ----------------------------- state UI -------------------------------- */

  syncPlayState() {
    if (!this.root) return;
    const playing = !this.video.paused && !this.video.ended;
    this.root.classList.toggle('is-paused', !playing);
    this.root.classList.toggle('is-playing', playing);
    this.els.play?.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if (playing) this.scheduleIdle();
    else {
      this.root.classList.remove('is-idle');
      clearTimeout(this.idleTimer);
      this.save();
    }
    this.updateSkipIntro();
  }

  scheduleIdle() {
    clearTimeout(this.idleTimer);
    if (this.video.paused) return;
    this.idleTimer = setTimeout(() => {
      if (!this.video.paused && !this.hasOpenMenu() && !this.video.seeking) {
        this.root.classList.add('is-idle');
      }
    }, IDLE_DELAY);
  }

  wake() {
    this.root?.classList.remove('is-idle');
    this.scheduleIdle();
  }

  /* ------------------------------ menus --------------------------------- */

  toggleMenu(name) {
    const menu = name === 'quality' ? this.els.qualityMenu : this.els.subtitleMenu;
    const button = name === 'quality' ? this.els.qualityButtonWrap : this.els.subtitlesButton;
    const open = !menu.classList.contains('is-open');
    this.closeMenus();
    if (open) {
      if (name === 'quality') this.buildQualityMenu();
      menu.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
    }
    this.wake();
  }

  closeMenus() {
    for (const menu of [this.els?.qualityMenu, this.els?.subtitleMenu]) {
      menu?.classList.remove('is-open');
    }
    this.els?.qualityButtonWrap?.setAttribute('aria-expanded', 'false');
    this.els?.subtitlesButton?.setAttribute('aria-expanded', 'false');
  }

  hasOpenMenu() {
    return Boolean(this.els?.qualityMenu?.classList.contains('is-open') || this.els?.subtitleMenu?.classList.contains('is-open'));
  }

  /* ----------------------------- fullscreen ------------------------------ */

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.root.requestFullscreen();
    } catch {
      /* denied */
    }
  }

  async togglePictureInPicture() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await this.video.requestPictureInPicture();
    } catch {
      /* unavailable */
    }
  }

  /* ------------------------------ intro ---------------------------------- */

  // Marks come from AniSkip when it knows the title; otherwise the local
  // window (settings plus whatever we learned here) carries it.
  async loadIntro() {
    const slug = this.context.slug;
    const ep = this.ep;
    if (!slug) return;
    try {
      const result = await api.skipTimes({ title: this.context.title, slug, ep });
      if (this.destroyed || this.ep !== ep) return;
      this.introSkip = result?.skip || null;
      this.learned = result?.learned || null;
      this.introEvidence = this.effectiveIntro();
      this.updateSkipIntro();
    } catch {
      /* offline or the service is down: the local window still works */
      this.introSkip = null;
      this.introEvidence = this.learned || null;
    }
  }

  effectiveIntro() {
    const op = this.introSkip?.op;
    if (op && Number.isFinite(op.start) && Number.isFinite(op.end)) {
      return { start: op.start, end: op.end };
    }
    return this.learned || null;
  }

  setSkipOffered(offered) {
    if (this.skipOffered === offered) return;
    this.skipOffered = offered;
    const button = this.els?.skipIntro;
    if (!button) return;
    button.classList.toggle('is-on', offered);
    button.setAttribute('aria-hidden', String(!offered));
    button.tabIndex = offered ? 0 : -1;
  }

  updateSkipIntro() {
    if (!this.els?.skipIntro) return;
    const offered = shouldOfferSkipIntro({
      currentTime: this.video.currentTime || 0,
      duration: Number(this.video.duration),
      settings: this.settings,
      learned: this.introEvidence,
      playing: !this.video.paused && !this.video.ended,
    });
    this.setSkipOffered(offered);
  }

  skipIntro() {
    const at = this.video.currentTime || 0;
    const target = nextIntroEnd({
      currentTime: at,
      settings: this.settings,
      learned: this.introEvidence,
    });

    if (Number.isFinite(this.video.duration) && this.video.readyState >= 1) {
      this.video.currentTime = target;
    } else {
      this.pendingSeek = target;
    }

    this.setSkipOffered(false);
    this.updateScrub();
    this.save(true);
    this.learnIntro(at);
  }

  // Remembers where the intro actually ended, so the next episode of the same
  // title lands closer to the real mark.
  learnIntro(at) {
    if (!this.context.slug || !Number.isFinite(at)) return;
    const mark = learnIntroSkips({
      skips: this.learned?.skips || [],
      at,
      settings: this.settings,
      learned: this.learned,
    });
    this.learned = mark;
    if (!this.introSkip?.op) this.introEvidence = mark;
    api.saveIntro({ slug: this.context.slug, mark }).catch(() => {
      /* the local window still improves for this session */
    });
  }

  /* ------------------------------ up next -------------------------------- */

  prepareNextEpisode() {
    const index = this.episodes.findIndex((item) => String(item.number) === this.ep);
    return index >= 0 ? this.episodes[index + 1] || null : null;
  }

  handleEnded() {
    this.save(true);
    this.root.classList.remove('is-idle');
    this.syncPlayState();
    this.setSkipOffered(false);
    if (this.upnextDismissed) return;
    const next = this.prepareNextEpisode();
    if (!next) return;
    this.nextEpisode = next;
    this.showUpNext(next, true);
  }

  // The card appears once the outro starts, not only when the file ends.
  updateUpNextPrompt() {
    if (!this.els?.upnext || this.video.ended) return;
    if (this.upnextDismissed) return;

    const open = this.els.upnext.classList.contains('is-open');
    if (open) return;

    const next = this.prepareNextEpisode();
    if (!next) return;

    const offer = shouldOfferNext({
      currentTime: this.video.currentTime || 0,
      duration: Number(this.video.duration),
      settings: this.settings,
      playing: !this.video.paused,
    });
    if (!offer) return;

    this.nextEpisode = next;
    this.showUpNext(next, false);
  }

  showUpNext(next, startCountdown = false) {
    this.countdownLeft =
      startCountdown && this.settings.autoplay ? AUTOPLAY_DELAY : 0;
    this.els.upnextTitle.textContent = next ? `${this.context.title} · Episode ${next.number}` : '';
    this.els.upnextMeta.textContent = '';

    const art = imageUrl(this.context.poster);
    this.els.upnextArt.innerHTML = art
      ? `<img src="${escapeHtml(art)}" alt="" data-fade />`
      : '';
    bindImages(this.els.upnextArt);

    this.els.upnextPlay.disabled = !next;
    this.els.upnext.classList.add('is-open');
    this.updateUpNextMeta();

    clearInterval(this.countdownTimer);
    if (next && this.countdownLeft > 0) {
      this.countdownTimer = setInterval(() => {
        this.countdownLeft -= 1;
        if (this.countdownLeft <= 0) {
          clearInterval(this.countdownTimer);
          this.playNextEpisode();
          return;
        }
        this.updateUpNextMeta();
      }, 1000);
    }
  }

  updateUpNextMeta() {
    if (!this.els.upnextMeta) return;
    const next = this.nextEpisode;
    if (!next) return;
    this.els.upnextMeta.textContent =
      this.countdownLeft > 0
        ? `Episode ${next.number} · playing in ${this.countdownLeft}s`
        : `Episode ${next.number} · ${this.mode === 'dub' ? 'Dub' : 'Sub'}`;
  }

  playNextEpisode() {
    const next = this.nextEpisode;
    this.hideUpNext();
    if (!next) return;
    this.save(true);
    this.load(next.number, 0);
  }

  hideUpNext() {
    clearInterval(this.countdownTimer);
    this.countdownTimer = null;
    this.nextEpisode = null;
    this.els?.upnext?.classList.remove('is-open');
  }

  /* ------------------------------ errors --------------------------------- */

  showError(message, detail = '') {
    if (!this.els?.error) return;
    this.els.errorText.textContent = detail ? `${message} ${detail}` : message;
    this.els.error.classList.add('is-open');
    this.root.classList.remove('is-buffering', 'is-idle');
    this.setSkipOffered(false);
    this.closeMenus();
    this.hideUpNext();
  }

  hideError() {
    this.els?.error?.classList.remove('is-open');
  }

  retry() {
    this.hideError();
    this.load(this.ep, this.video.currentTime || 0);
  }

  /* ------------------------------ history -------------------------------- */

  save(force = false) {
    if (!this.data || this.destroyed) return;
    const duration = Number(this.video.duration);
    if (!Number.isFinite(duration) || duration <= 0) return;
    const now = Date.now();
    if (!force && now - this.lastSaved < SAVE_INTERVAL) return;
    this.lastSaved = now;
    const position = Math.min(this.video.currentTime || 0, duration);
    const entry = {
      slug: this.context.slug,
      title: this.context.title,
      poster: this.context.poster || '',
      ep: this.ep,
      mode: this.mode,
      position,
      duration,
      updatedAt: now,
    };
    this.onProgress?.(entry);
    api.saveHistory(entry).catch(() => {
      /* offline is survivable; next tick retries */
    });
  }

  /* ------------------------------ teardown ------------------------------- */

  destroyHls() {
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        /* already gone */
      }
      this.hls = null;
    }
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.idleTimer);
    clearInterval(this.countdownTimer);
    this.destroyHls();
    try {
      this.video?.pause();
      this.video?.removeAttribute('src');
      this.video?.load();
    } catch {
      /* already detached */
    }
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('click', this.onDocClick);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.root?.removeEventListener('click', this.onRootClick);
    this.root?.removeEventListener('pointermove', this.onPointerMove);
    this.els?.stage?.removeEventListener('click', this.onBillboard);
    this.host.innerHTML = '';
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    this.save(true);
    this.root?.classList.add('is-leaving');
    this.destroyed = true;
    this.destroyHls();
    this.video?.pause();
    clearTimeout(this.idleTimer);
    clearInterval(this.countdownTimer);
    setTimeout(() => {
      this.destroy();
      this.onClose?.();
    }, 280);
  }
}
