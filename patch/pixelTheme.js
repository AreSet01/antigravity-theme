"use strict";
// ============================================================================
// PIXEL GRAVITY - pixel art theme injector for Antigravity 2.x
// This file is copied into app.asar as dist/pixelTheme.js by install.ps1.
// Theme assets live OUTSIDE the asar at <resources>/pixel-theme/ so the CSS
// can be edited without repacking. Every entry point is fail-safe: any error
// falls back to stock behavior and never blocks the app from starting.
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachPixelTheme = attachPixelTheme;
exports.attachPixelLoadingOverlay = attachPixelLoadingOverlay;
exports.chromeColors = chromeColors;
exports.wantsNativeCaption = wantsNativeCaption;
const electron_1 = require("electron");
const path = require("path");
const fs = require("fs");
// Plain node http(s) on purpose: the readiness probe must accept the language
// server's self-signed certificate, which electron.net refuses.
const https = require("https");
const http = require("http");

const THEME_DIR = path.join(process.resourcesPath || "", "pixel-theme");

const FONTS = {
    ui: { file: "fusion-pixel-12px-proportional-sc.woff2", family: "Fusion Pixel 12px Proportional SC" },
    mono: { file: "fusion-pixel-12px-monospaced-sc.woff2", family: "Fusion Pixel 12px Monospaced SC" },
};

// Fonts are cached (large, immutable); pixel.css is re-read on every
// navigation so theme edits only need a window reload, not an app restart.
const fontCssCache = new Map();

function fontFaceCss(key) {
    if (fontCssCache.has(key)) {
        return fontCssCache.get(key);
    }
    const f = FONTS[key];
    let css = "";
    try {
        const p = path.join(THEME_DIR, "fonts", f.file);
        if (fs.existsSync(p)) {
            const b64 = fs.readFileSync(p).toString("base64");
            css =
                "@font-face{font-family:'" + f.family + "';font-style:normal;font-weight:400;" +
                "font-display:swap;src:url(data:font/woff2;base64," + b64 + ") format('woff2');}\n";
        }
        else {
            console.error("[pixel-theme] font missing:", p);
        }
    }
    catch (e) {
        console.error("[pixel-theme] font embed failed:", f.file, e);
    }
    fontCssCache.set(key, css);
    return css;
}

function buildFontCss() {
    return fontFaceCss("ui") + fontFaceCss("mono");
}

function readThemeCss() {
    try {
        const cssPath = path.join(THEME_DIR, "pixel.css");
        return fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf-8") : "";
    }
    catch (e) {
        console.error("[pixel-theme] failed to read pixel.css:", e);
        return "";
    }
}

function buildCss() {
    const themeCss = readThemeCss();
    return themeCss ? buildFontCss() + themeCss : "";
}

/**
 * pixel.css with /* ... *​/ comments removed.
 *
 * Every lookup below MUST go through this. The comments document the very
 * declarations being searched for, so a naive regex over the raw file happily
 * matches the prose explaining an option instead of the option itself -- which
 * is exactly how `--px-native-caption: off` first read as "on".
 */
function readThemeDeclarations() {
    return readThemeCss().replace(/\/\*[\s\S]*?\*\//g, "");
}

// ---------------------------------------------------------------------------
// Native window chrome
// ---------------------------------------------------------------------------
// The minimise/maximise/close buttons are drawn by Windows, not by the page,
// so CSS cannot reach them -- they have to be handed matching colors or the
// strip reads as a foreign rectangle pasted over the app's top bar.
// Colors are read out of pixel.css so there is still one place to recolor
// the theme; the defaults here are the fallback if that lookup fails.
const CHROME_FALLBACK = {
    light: { background: "#dde1ea", foreground: "#1a1c2c" },
    dark: { background: "#14161f", foreground: "#73eff7" },
};

/**
 * Whether to keep Windows' own caption buttons.
 *
 * Default is false: on Windows 11 the caption strip ignores
 * titleBarOverlay.color entirely (verified by feeding it lime green and dark
 * navy - both still rendered the system's #EAEAEB), so it can never be made to
 * match a themed top bar. Turning it off lets the page draw its own buttons.
 * Set `--px-native-caption: on` in pixel.css to get the OS buttons back.
 */
function wantsNativeCaption() {
    try {
        return /--px-native-caption\s*:\s*on\b/.test(readThemeDeclarations());
    }
    catch (e) {
        return false;
    }
}

function chromeColors(isLight) {
    const key = isLight ? "light" : "dark";
    const fallback = CHROME_FALLBACK[key];
    try {
        const css = readThemeDeclarations();
        const pick = (name) => {
            const m = css.match(new RegExp("--px-chrome-" + key + "-" + name + "\\s*:\\s*(#[0-9a-fA-F]{3,8})"));
            return m ? m[1] : null;
        };
        return {
            background: pick("bg") || fallback.background,
            foreground: pick("fg") || fallback.foreground,
        };
    }
    catch (e) {
        console.error("[pixel-theme] chrome color lookup failed, using defaults:", e);
        return fallback;
    }
}

/** Rough perceptual lightness of a #rrggbb color, 0..1. */
function isLightColor(hex) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex).trim());
    if (!m) {
        return false;
    }
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

/**
 * Reads the user's light/dark preference the same way dist/utils.js does,
 * so the native window controls match the theme the page will render in.
 */
function isLightTheme() {
    try {
        const settingsPath = require("./paths").getSettingsPbPath();
        if (!fs.existsSync(settingsPath)) {
            return false;
        }
        const mode = JSON.parse(fs.readFileSync(settingsPath, "utf-8"))?.userSettings?.themeMode;
        if (mode && mode.includes("INHERIT")) {
            return !electron_1.nativeTheme.shouldUseDarkColors;
        }
        return Boolean(mode && mode.includes("LIGHT"));
    }
    catch (e) {
        console.error("[pixel-theme] theme detect failed, assuming dark:", e);
        return false;
    }
}

/**
 * Repaints the native window controls to match the current theme.
 * These are drawn by the OS, not the page, so they have to be told
 * separately -- otherwise the titlebar reads as a foreign rectangle
 * pasted onto the app. Colors match the page's top bar (--sidebar).
 */
function syncTitleBarOverlay(win) {
    // With native caption buttons off there is no overlay to recolor -- the
    // page draws its own controls and the theme CSS handles them.
    if (process.platform === "darwin" ||
        typeof win.setTitleBarOverlay !== "function" ||
        !wantsNativeCaption()) {
        return;
    }
    try {
        if (win.isDestroyed()) {
            return;
        }
        const c = chromeColors(isLightTheme());
        win.setTitleBarOverlay({ color: c.background, symbolColor: c.foreground, height: 30 });
    }
    catch (e) {
        // Not fatal -- the colors baked in at window construction still apply.
        // Logged rather than swallowed: silently ignoring failures here is what
        // hid the mismatched titlebar the first time round.
        console.error("[pixel-theme] setTitleBarOverlay failed:", e && e.message);
    }
}

// Renderer-side widget that replaces the OS caption buttons. Runs in the page,
// so it can be styled by pixel.css like everything else. It drives the window
// through `window.electronNative`, which Antigravity's own preload already
// exposes (minimize/maximize/unmaximize/isMaximized/close) -- no extra IPC and
// no preload patching needed.
const WINDOW_CONTROLS_JS = `(() => {
  const ID = 'px-window-controls';
  if (document.getElementById(ID)) return 'already-present';
  const api = window.electronNative;
  if (!api || typeof api.close !== 'function') return 'no-api';

  const bar = document.createElement('div');
  bar.id = ID;
  for (const act of ['min', 'max', 'close']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'px-wc-btn px-wc-' + act;
    b.dataset.pxAction = act;
    b.setAttribute('aria-label', act);
    b.appendChild(document.createElement('i'));
    bar.appendChild(b);
  }
  document.body.appendChild(bar);

  const syncMaxState = async () => {
    try { bar.dataset.maximized = (await api.isMaximized()) ? '1' : '0'; }
    catch (e) { /* window gone */ }
  };
  void syncMaxState();
  window.addEventListener('resize', syncMaxState);

  bar.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-px-action]');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    try {
      const act = btn.dataset.pxAction;
      if (act === 'min') { await api.minimize(); }
      else if (act === 'max') {
        if (await api.isMaximized()) { await api.unmaximize(); } else { await api.maximize(); }
        void syncMaxState();
      }
      else { await api.close(); }
    } catch (e) {
      console.error('[pixel-theme] window control failed', e);
    }
  });
  return 'installed';
})()`;

/**
 * Keeps body text on the bitmap font's 12-device-pixel grid at any OS
 * scale or window zoom. The font only renders crisply when fontSize(CSS)
 * x devicePixelRatio is a whole multiple of 12, so the size cannot be
 * hardcoded; 12/dpr covers every DPR exactly, including the fractional
 * ones window zoom produces (1.2^n steps). cells = round(dpr) because the
 * platform's intent is 12 CSS px (= 12*dpr device px) and the grid only
 * offers 12*cells -- floor() undersizes on every fractional DPR.
 */
const DPR_SYNC_JS = `(() => {
  if (window.__pxDprSync) { window.__pxDprSync(); return 'refreshed'; }
  let mq = null;
  const apply = () => {
    const dpr = window.devicePixelRatio || 1;
    let el = document.getElementById('px-dpr-grid');
    if (!el) {
      el = document.createElement('style');
      el.id = 'px-dpr-grid';
      (document.head || document.documentElement).appendChild(el);
    }
    // !important beats the stylesheet's :root/:host/body defaults; body must
    // be covered too or its own declaration shadows the inherited value.
    // --px-dev is one device pixel expressed in CSS px, so animations can
    // offset by whole device pixels: translate(calc(2 * var(--px-dev))).
    // At DPR 1 it is 1px (nothing changes); at 1.5 it is 0.6667px, so the
    // same expression lands on 2 device px instead of 3. Motion that stops
    // on a fractional device pixel resamples the bitmap font mid-animation.
    el.textContent = ':root,:host,body{--px-unit:' + (12 / dpr).toFixed(4) +
      'px !important;--px-cells:' + Math.max(1, Math.round(dpr)) +
      ' !important;--px-dev:' + (1 / dpr).toFixed(4) + 'px !important}';
  };
  const onChange = () => {
    apply();
    if (mq) { try { mq.removeEventListener('change', onChange); } catch (e) {} }
    mq = window.matchMedia('(resolution: ' + window.devicePixelRatio + 'dppx)');
    try { mq.addEventListener('change', onChange); } catch (e) {}
  };
  window.__pxDprSync = onChange;
  onChange();
  window.addEventListener('resize', apply, { passive: true });
  return 'installed';
})()`;

/**
 * Flags "the user just sent a message" on <html> so CSS can animate it.
 *
 * Route 2 of the send-animation plan: a listener rather than
 * `body:has(send-button:active)`. Two reasons that selector was rejected --
 * Enter (the common way to send) never produces :active, and pixel.css 14.2
 * records that :has() invalidates ancestors along with subtree mutations,
 * which costs 4.7x on conversation-list rerenders. Streaming output mutates
 * that subtree continuously.
 *
 * Capture phase, passive, never preventDefault: this must not be able to
 * swallow a send. If anything here throws, the app still sends the message.
 */
const SEND_PULSE_JS = `(() => {
  if (window.__pxSendPulse) return 'already-present';

  const CLASS = 'px-sending';
  // Must outlast the longest send animation in pixel.css (the packet runs
  // 420ms; recoil and charge finish earlier).
  const HOLD_MS = 700;
  let timer = null;

  const reduced = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  };

  // ---- multi-particle burst -------------------------------------------------
  // A pseudo-element can only ever be one particle, so a burst needs real
  // nodes. Each one carries its own randomized drift/delay/duration/size via
  // inline custom properties, which is what makes successive sends look
  // different instead of a repeating canned effect.
  const PARTICLE_COUNT = 16;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  const spawnParticles = () => {
    if (reduced()) return;
    const host = document.body || document.documentElement;
    if (!host) return;
    // Never stack bursts: a rapid second send replaces the first.
    const old = document.getElementById('px-particles');
    if (old) old.remove();

    const box = document.createElement('div');
    box.id = 'px-particles';

    let maxLifeMs = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = document.createElement('i');
      // Spread the launch points across the composer's width rather than all
      // from one spot -- a line of origins reads as a stream, not a cannon.
      const x = rand(28, 72);                 // vw-ish, relative to viewport
      const dx = rand(-90, 90);               // px of horizontal drift
      const dur = Math.round(rand(420, 900));
      const dly = Math.round(rand(0, 260));
      const size = Math.round(rand(2, 5));    // device pixels, squares only
      const rise = Math.round(rand(42, 76));  // vh travelled
      p.style.cssText =
        '--px-x:' + x.toFixed(2) + 'vw;' +
        '--px-y:' + rand(11, 16).toFixed(2) + 'vh;' +
        '--px-dx:' + dx.toFixed(1) + 'px;' +
        '--px-dur:' + dur + 'ms;' +
        '--px-dly:' + dly + 'ms;' +
        '--px-sz:' + size + ';' +
        '--px-rise:' + rise + 'vh';
      box.appendChild(p);
      maxLifeMs = Math.max(maxLifeMs, dur + dly);
    }

    host.appendChild(box);
    // Self-removal, belt and braces: the last particle's animationend fires
    // first in the normal case; the timer covers a window that never composites
    // (minimized, background) where animationend never arrives at all.
    let done = false;
    const remove = () => {
      if (done) return;
      done = true;
      try { box.remove(); } catch (e) {}
    };
    let ended = 0;
    box.addEventListener('animationend', () => {
      if (++ended >= PARTICLE_COUNT) remove();
    });
    setTimeout(remove, maxLifeMs + 400);
  };

  const pulse = () => {
    const de = document.documentElement;
    // Restart cleanly on rapid repeat sends: drop the class, force a reflow,
    // re-add. Without the reflow the browser coalesces remove+add into no
    // change at all and the animation does not replay.
    de.classList.remove(CLASS);
    void de.offsetWidth;
    de.classList.add(CLASS);
    // Arm the removal BEFORE spawning particles, and isolate the spawn: if
    // particle creation ever throws, the flag must still come off on schedule
    // or the composer would stay stuck in its sending state forever.
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      de.classList.remove(CLASS);
    }, HOLD_MS);
    try { spawnParticles(); }
    catch (e) { /* the CSS-only part of the send animation still plays */ }
  };
  window.__pxSendPulse = pulse;

  // Copy buttons: the app gives no feedback at all when a copy succeeds.
  // Flag the button so pixel.css can draw a checkmark over its icon.
  const COPIED_MS = 1000;
  const markCopied = (btn) => {
    try {
      btn.classList.add('px-copied');
      setTimeout(() => {
        try { btn.classList.remove('px-copied'); } catch (e) {}
      }, COPIED_MS);
    } catch (e) {}
  };

  // The send button: click covers mouse sends.
  document.addEventListener('click', (ev) => {
    try {
      const t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('[data-testid="send-button"]')) { pulse(); return; }
      // aria-label is localized, so match the icon-button shape too: any
      // button whose label mentions copy in either language.
      const btn = t.closest('button, [role="button"]');
      if (!btn) return;
      const label = (btn.getAttribute('aria-label') || '') +
                    ' ' + (btn.getAttribute('data-tooltip-id') || '');
      if (/copy|复制/i.test(label)) markCopied(btn);
    } catch (e) { /* never interfere with the app's own handling */ }
  }, { capture: true, passive: true });

  // Enter in the composer covers keyboard sends. Shift+Enter is a newline,
  // and IME composition must be left alone or every Chinese/Japanese word
  // confirmed with Enter would fire the animation.
  document.addEventListener('keydown', (ev) => {
    try {
      if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing || ev.keyCode === 229) return;
      const t = ev.target;
      if (!t || !t.closest) return;
      if (!t.closest('[contenteditable="true"], textarea')) return;
      pulse();
    } catch (e) { /* same */ }
  }, { capture: true, passive: true });

  return 'installed';
})()`;

/**
 * Flags streaming state on <html> and keeps the conversation pinned to the
 * bottom while the reply grows.
 *
 * Streaming has no DOM flag of its own, so it is inferred from the stop
 * button: the app swaps send for stop while a reply is in flight (verified on
 * the live app -- the composer's trailing button switches to a stop icon).
 *
 * The scroll-follow deliberately only engages when the user is ALREADY at the
 * bottom. Yanking the viewport down while someone is reading scrollback is
 * worse than not following at all.
 */
const STREAM_WATCH_JS = `(() => {
  if (window.__pxStreamWatch) return 'already-present';

  const STREAM_CLASS = 'px-streaming';
  const BOTTOM_SLOP_PX = 48;   // "close enough to the bottom" tolerance

  const scroller = () => {
    const list = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
    let best = null;
    for (const el of list) {
      if (el.scrollHeight <= el.clientHeight + 20) continue;
      if (!best || el.clientHeight > best.clientHeight) best = el;
    }
    return best;
  };

  const isStreaming = () => {
    // Any visible stop affordance means a reply is in flight.
    return !!document.querySelector(
      '[data-testid*="stop"], [aria-label*="Stop"], [aria-label*="停止"], [aria-label*="停止生成"]'
    );
  };

  let pinned = false;
  let raf = 0;

  const tick = () => {
    raf = 0;
    const streaming = isStreaming();
    const de = document.documentElement;
    if (streaming) {
      if (!de.classList.contains(STREAM_CLASS)) de.classList.add(STREAM_CLASS);
    } else if (de.classList.contains(STREAM_CLASS)) {
      de.classList.remove(STREAM_CLASS);
      pinned = false;
    }
    if (!streaming) return;
    const sc = scroller();
    if (!sc) return;
    const distance = sc.scrollHeight - sc.clientHeight - sc.scrollTop;
    // Latch: decide once per streaming session whether to follow, based on
    // where the user was when it started. Re-checking every frame would
    // re-engage the moment they scrolled back down for one line.
    if (distance <= BOTTOM_SLOP_PX) pinned = true;
    else if (distance > BOTTOM_SLOP_PX * 4) pinned = false;
    if (pinned) {
      sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
    }
  };

  const schedule = () => {
    if (raf) return;
    // rAF rather than reacting per mutation: streaming fires mutations far
    // faster than frames, and scrolling more than once per frame is wasted.
    raf = requestAnimationFrame(tick);
  };

  const mo = new MutationObserver(schedule);
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.__pxStreamWatch = { stop: () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); } };
  tick();
  return 'installed';
})()`;

/**
 * One-shot full-screen pixel dissolve, played when light/dark flips.
 *
 * The overlay is created, animated, and removed -- nothing stays resident.
 * That is deliberately different from the always-on scanline layer in
 * pixel.css 14.7, which documents that a permanent full-screen composited
 * layer costs ~6MB of GPU memory for no gain. A transient one is fine.
 *
 * The dither pattern and colors live in pixel.css (#px-dissolve); this only
 * owns the element's lifecycle so the look stays editable without a repack.
 */
const THEME_DISSOLVE_JS = `(() => {
  const ID = 'px-dissolve';
  // prefers-reduced-motion is honored here rather than in CSS: with no
  // animation there are no animationend events, so the node would leak.
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced-motion';
  } catch (e) { /* matchMedia unavailable: fall through and animate */ }

  const old = document.getElementById(ID);
  if (old) old.remove();

  const el = document.createElement('div');
  el.id = ID;
  (document.body || document.documentElement).appendChild(el);

  // Belt and braces: animationend removes it promptly, the timer guarantees
  // removal even if the animation never starts (display:none, no CSS, a
  // failed insertCSS). A stuck full-screen overlay would eat every click.
  let done = false;
  const remove = () => {
    if (done) return;
    done = true;
    try { el.remove(); } catch (e) { /* already gone */ }
  };
  el.addEventListener('animationend', remove, { once: true });
  setTimeout(remove, 1200);
  return 'played';
})()`;

/**
 * Pixel cursor: hides the OS pointer and draws an arrow + fading square trail
 * on a full-screen canvas.
 *
 * The head is drawn by JS (the user chose this over an OS-drawn cursor so the
 * head can change shape per context and burst on click). JS drawing is
 * inherently one frame behind, so the head position is EXTRAPOLATED along the
 * measured pointer velocity. Measured on the live app at 164Hz:
 *
 *   drawing the last event position    median error 11.81px
 *   + velocity extrapolation           median error  1.50px   (-87%)
 *
 * Extrapolation has two guards, both measured: damping when direction reverses
 * (otherwise fast flicks overshoot and snap back) and a hard 14px clamp.
 *
 * Trail: 1-2 squares per frame, 2-4 device px, ~1s life, peak alpha 0.55,
 * alpha quantized to 4 steps (a smooth fade turns to mush at this size), 300
 * particle cap (measured: 300 costs 0.2ms of a 6.1ms frame budget).
 *
 * Fallback: if the main thread stalls (2 consecutive frames > 50ms) the OS
 * cursor is handed back until things recover -- a frozen pixel cursor is worse
 * than a style flicker.
 */
const CURSOR_JS = `(() => {
  if (window.__pxCursor) { window.__pxCursor.rebuild(); return 'refreshed'; }

  const CFG = {
    // Cursor head size. The art is a 16x16 pixel grid, so this is a multiple
    // of 16 device px: 1 = 16px, 1.25 = 20px, 1.5 = 24px, 2 = 32px.
    // ---- 想改指针大小，改这一个数就够 ----
    // 用 0.25 的整数倍（1.25 / 1.5 / 1.75 / 2），这样每个美术像素在 DPR 1 下
    // 仍然占整数个设备像素，边缘不会糊。
    headScale: 1.5,
    // How far ahead of the newest sample the head may be projected. The horizon
    // itself is the sample's age (see predict()); this only caps it so an idle
    // pointer's stale sample cannot fling the head across the screen.
    maxAheadMs: 12,
    clampPx: 14,         // hard cap on extrapolation distance
    trailCap: 300,
    lifeMs: 360,         // short: 1s read as "拖沓" (dragging/sluggish)
    lifeJitterMs: 140,   // vary per particle so they don't vanish in lockstep
    peakAlpha: 0.55,     // "淡淡的"
    alphaSteps: 4,
    idleStopMs: 220,
    jankMs: 50,          // 2 consecutive frames over this -> hand back OS cursor
    jankFrames: 2,
    jankRecoverFrames: 30,
    // Movement gate. NOT instantaneous speed: a real mouse polls at 125-1000Hz,
    // so one pixel of sensor jitter reads as 1px/1ms = 1.0 px/ms -- far above any
    // sane speed threshold, which is why the trail used to keep bleeding while
    // the hand sat still. Gate on displacement across a window instead: the
    // pointer must actually have TRAVELLED, which jitter never does.
    moveWindowMs: 90,
    moveMinPx: 3,
    // The history buffer must be bounded by TIME, not sample count. Capping it
    // at N samples makes the gate polling-rate dependent: 6 samples spans 48ms
    // on a 125Hz mouse but only 6ms on a 1000Hz one, so identical hand motion
    // would read 8x differently. Keep a generous sample cap and prune by age.
    histMaxSamples: 64,
    histMaxAgeMs: 140,
    // Particle dispersal: each one flies off on its own heading and slows down.
    spreadSpeedMin: 0.02,   // px/ms
    spreadSpeedMax: 0.13,
    inheritMotion: 0.18,    // fraction of pointer velocity handed to particles
    friction: 0.94,         // per-frame velocity decay
  };

  const reduced = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  };
  if (reduced()) {
    document.documentElement.setAttribute('data-px-cursor', 'off');
    return 'reduced-motion';
  }

  const de = document.documentElement;
  let canvas = null, ctx = null, dpr = 1, W = 0, H = 0;
  let raf = 0, lastMoveAt = 0, running = false;
  let jankStreak = 0, healthyStreak = 0, degraded = false;
  const hist = [];          // recent pointer samples, newest last
  const parts = [];
  let cursorKind = 'default';
  let pressBurstAt = 0;
  let lastFrameAt = 0;

  const palette = () => {
    const cs = getComputedStyle(de);
    return {
      trail: cs.getPropertyValue('--px-cursor-trail').trim() || '#73eff7',
      head:  cs.getPropertyValue('--px-cursor-head').trim()  || '#73eff7',
      edge:  cs.getPropertyValue('--px-cursor-edge').trim()  || '#1a1c2c',
      alpha: parseFloat(cs.getPropertyValue('--px-cursor-alpha')) || CFG.peakAlpha,
    };
  };
  let colors = palette();

  const build = () => {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'px-cursor';
      (document.body || de).appendChild(canvas);
    }
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;   // hard pixel edges
    colors = palette();
  };

  // 16x16 pixel arrow described as a grid: 2 = outline, 1 = fill.
  const ARROW = [
    '2', '22', '212', '2112', '21112', '211112', '2111112', '21111112',
    '211111112', '2111111112', '21111122222', '211121', '21121', '2121', '211', '22'
  ];
  const IBEAM = ['212', '212', '212', '212', '212', '212', '212', '212',
                 '212', '212', '212', '212'];

  // One device pixel in CSS px, so the art stays on the pixel grid at any DPR.
  const px = () => 1 / dpr;

  const drawGrid = (rows, ox, oy, fill, edge, scale) => {
    const u = px() * scale;
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === '0') continue;
        ctx.fillStyle = (c === '2') ? edge : fill;
        ctx.fillRect(ox + x * u, oy + y * u, u, u);
      }
    }
  };

  // --- extrapolation: the whole point of this engine ---
  // Velocity is measured across a TIME baseline, not the last N samples. With
  // an age-bounded history a 1000Hz mouse puts adjacent samples 1ms apart, and
  // differencing those amplifies sensor noise into wild velocity estimates.
  const VEL_BASELINE_MS = 24;
  const sampleAgo = (ms) => {
    const newest = hist[hist.length - 1];
    if (!newest) return null;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (newest.t - hist[i].t >= ms) return hist[i];
    }
    return hist[0] === newest ? null : hist[0];
  };
  // The now argument is the paint instant. Project from the newest sample
  // forward to it -- i.e. by that sample's actual AGE, not by a fixed constant.
  //
  // Measured (curved path, 1000Hz polling, error vs ground truth at paint):
  //   fixed 4.4ms horizon        p50 8.52px  p95 12.15px
  //   age + 4.4ms                p50 9.40px  p95 12.38px
  //   age alone  <-- this        p50 0.04px  p95  0.67px
  //
  // Adding the pipeline lag on top double-counts it: performance.now() at frame
  // time already sits after the event traversed the pipeline, so the only gap
  // left to cover is sample -> now. That was the bug behind an 11px p95.
  const predict = (now) => {
    const n = hist.length;
    if (!n) return null;
    const c = hist[n - 1];
    const b = sampleAgo(VEL_BASELINE_MS);
    if (!b || b === c) return { x: c.x, y: c.y };
    const a = (() => {
      for (let i = hist.length - 1; i >= 0; i--) {
        if (b.t - hist[i].t >= VEL_BASELINE_MS) return hist[i];
      }
      return null;
    })();
    const dt2 = Math.max(0.5, c.t - b.t);
    const v2x = (c.x - b.x) / dt2, v2y = (c.y - b.y) / dt2;
    let factor = 1;
    if (a && a !== b) {
      const dt1 = Math.max(0.5, b.t - a.t);
      const v1x = (b.x - a.x) / dt1, v1y = (b.y - a.y) / dt1;
      // Damp when the direction reverses: cos(angle) between the last two
      // velocity vectors. Negative (reversing) -> no extrapolation at all.
      const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
      const align = (m1 && m2) ? (v1x * v2x + v1y * v2y) / (m1 * m2) : 1;
      factor = align > 0 ? align : 0;
    }
    // Cap the horizon: if the pointer has been idle the sample is ancient and
    // projecting across that whole gap would fling the head off screen.
    const ahead = Math.min(Math.max(0, now - c.t), CFG.maxAheadMs);
    let dx = v2x * ahead * factor, dy = v2y * ahead * factor;
    const d = Math.hypot(dx, dy);
    if (d > CFG.clampPx) { dx = dx / d * CFG.clampPx; dy = dy / d * CFG.clampPx; }
    return { x: c.x + dx, y: c.y + dy };
  };

  const velocity = () => {
    const newest = hist[hist.length - 1];
    if (!newest) return { x: 0, y: 0 };
    // Same time baseline as predict(): differencing two 1ms-apart samples on a
    // 1000Hz mouse turns sensor noise into huge inherited particle velocities.
    const b = sampleAgo(VEL_BASELINE_MS);
    if (!b || b === newest) return { x: 0, y: 0 };
    const dt = Math.max(0.5, newest.t - b.t);
    return { x: (newest.x - b.x) / dt, y: (newest.y - b.y) / dt };
  };

  // Has the pointer actually travelled recently? Displacement over a window,
  // not instantaneous speed -- see CFG.moveWindowMs for why speed is useless
  // here (mouse jitter at 1000Hz looks fast but goes nowhere).
  //
  // Falls back to the oldest sample we still hold when the window contains
  // only one event. Without that, a slow event source (or a device polling
  // below ~11Hz) leaves oldest === newest and the gate rejects real motion
  // forever -- observed on CDP-dispatched input, where events arrive >90ms
  // apart and the trail never appeared at all.
  const travelled = (now) => {
    const newest = hist[hist.length - 1];
    if (!newest) return 0;
    let oldest = null;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (now - hist[i].t > CFG.moveWindowMs) break;
      oldest = hist[i];
    }
    // Fallback for slow event sources: if the window holds only the newest
    // sample, compare against the previous one regardless of its age.
    //
    // It must be hist[length-2], NOT hist[0]. With an age-bounded history
    // hist[0] can be 140ms old, so a pointer that moved and then STOPPED keeps
    // measuring its old displacement and the trail never stops emitting
    // (measured: particles still alive 3000ms after the pointer went still).
    // The previous sample goes stale the moment movement stops, which is
    // exactly the behaviour the gate needs.
    if (!oldest || oldest === newest) oldest = hist[hist.length - 2] || null;
    if (!oldest || oldest === newest) return 0;
    // A stale pair says nothing about current motion: if the newest sample is
    // itself old, the pointer is resting.
    if (now - newest.t > CFG.moveWindowMs) return 0;
    return Math.hypot(newest.x - oldest.x, newest.y - oldest.y);
  };

  const emit = (x, y, n, life) => {
    const v = velocity();
    for (let i = 0; i < n; i++) {
      if (parts.length >= CFG.trailCap) parts.shift();
      // Own heading + own speed: this is what makes them disperse outward
      // instead of sitting in a line behind the pointer.
      const ang = Math.random() * Math.PI * 2;
      const sp = CFG.spreadSpeedMin + Math.random() * (CFG.spreadSpeedMax - CFG.spreadSpeedMin);
      parts.push({
        x: x, y: y,
        vx: Math.cos(ang) * sp + v.x * CFG.inheritMotion,
        vy: Math.sin(ang) * sp + v.y * CFG.inheritMotion,
        born: performance.now(),
        life: (life || CFG.lifeMs) + Math.random() * CFG.lifeJitterMs,
        sz: 2 + (Math.random() * 3 | 0),   // 2-4 device px
      });
    }
  };

  const frame = () => {
    raf = 0;
    const now = performance.now();

    // --- jank watchdog ---
    let lastGap = 0;
    if (lastFrameAt) {
      const gap = now - lastFrameAt;
      lastGap = gap;
      if (gap > CFG.jankMs) {
        jankStreak++; healthyStreak = 0;
        if (!degraded && jankStreak >= CFG.jankFrames) {
          degraded = true;
          de.setAttribute('data-px-cursor', 'off');   // OS cursor takes over
        }
      } else {
        jankStreak = 0;
        if (degraded && ++healthyStreak >= CFG.jankRecoverFrames) {
          degraded = false; healthyStreak = 0;
          de.setAttribute('data-px-cursor', 'on');
        }
      }
    }
    lastFrameAt = now;

    if (!ctx) build();
    ctx.clearRect(0, 0, W, H);

    const head = predict(now);
    if (head && !degraded) {
      // Emit only when the pointer has genuinely travelled. Gating on speed
      // instead let sensor jitter keep the trail alive while the hand rested.
      const moved = travelled(now);
      if (moved >= CFG.moveMinPx) {
        emit(head.x, head.y, moved > 26 ? 2 : 1);
      }
    }

    // --- trail ---
    const u = px();
    let alive = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      const age = (now - p.born) / p.life;
      if (age >= 1) { parts.splice(i, 1); continue; }
      alive++;
      // Drift outward, slowing down. dt is normalized to a 6.1ms frame so the
      // motion looks the same on a 60Hz and a 164Hz display.
      const dt = lastGap > 0 ? Math.min(lastGap, 34) / 6.1 : 1;
      p.x += p.vx * 6.1 * dt;
      p.y += p.vy * 6.1 * dt;
      const f = Math.pow(CFG.friction, dt);
      p.vx *= f; p.vy *= f;
      // Quantized alpha: a smooth fade on a 2px square reads as mush.
      const stepped = Math.ceil((1 - age) * CFG.alphaSteps) / CFG.alphaSteps;
      ctx.globalAlpha = stepped * colors.alpha;
      ctx.fillStyle = colors.trail;
      const s = p.sz * u;
      // Snap to the device pixel grid so squares never straddle a pixel.
      ctx.fillRect(Math.round(p.x / u) * u, Math.round(p.y / u) * u, s, s);
    }
    ctx.globalAlpha = 1;

    // --- head ---
    if (head && !degraded) {
      const hx = Math.round(head.x / u) * u, hy = Math.round(head.y / u) * u;
      // Head scale. The art is a 16x16 grid, so 1 = 16 device px tall.
      // Bump this to resize the whole cursor; keep it to quarters (1.25/1.5/
      // 1.75/2) so each art pixel still lands on a whole number of device
      // pixels at DPR 1 and stays hard-edged.
      const S = CFG.headScale;
      if (cursorKind === 'text') {
        drawGrid(IBEAM, hx - 1 * u * S, hy - 6 * u * S, colors.head, colors.edge, S);
      } else {
        drawGrid(ARROW, hx, hy, colors.head, colors.edge, S);
        if (cursorKind === 'pointer') {
          // four corner ticks: "this is clickable"
          ctx.fillStyle = colors.head;
          for (const [ox, oy] of [[-4,-4],[4,-4],[-4,4],[4,4]]) {
            ctx.fillRect(hx + ox * u * 2 * S, hy + oy * u * 2 * S, 2 * u * S, 2 * u * S);
          }
        } else if (cursorKind === 'not-allowed') {
          ctx.fillStyle = colors.head;
          for (let k = 0; k < 8; k++) {
            ctx.fillRect(hx + (10 - k) * u * S, hy + (2 + k) * u * S, u * S, u * S);
          }
        } else if (cursorKind === 'col-resize') {
          ctx.fillStyle = colors.head;
          ctx.fillRect(hx + 12 * u * S, hy + 6 * u * S, 6 * u * S, u * S);
        }
      }
      // press burst
      if (pressBurstAt && now - pressBurstAt < 220) {
        const t = (now - pressBurstAt) / 220;
        ctx.globalAlpha = (1 - t) * colors.alpha * 1.6;
        ctx.fillStyle = colors.head;
        const r = 4 + t * 14;
        for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          ctx.fillRect(Math.round((head.x + ox * r) / u) * u,
                       Math.round((head.y + oy * r) / u) * u, 3 * u, 3 * u);
        }
        ctx.globalAlpha = 1;
      } else if (pressBurstAt) {
        pressBurstAt = 0;
      }
    }

    // Sleep once there is nothing left to ANIMATE -- but the head must stay on
    // screen, so the last frame draws it and then the loop parks. Without this
    // the cursor disappeared whenever the hand stopped (clearRect wiped the
    // head along with the trail).
    if (alive > 0 || pressBurstAt || (now - lastMoveAt) < CFG.idleStopMs) {
      raf = requestAnimationFrame(frame);
    } else {
      running = false;   // head stays painted; next move wakes the loop
    }
  };

  const wake = () => {
    if (!running) { running = true; lastFrameAt = 0; raf = requestAnimationFrame(frame); }
  };

  const classify = (el) => {
    if (!el) return 'default';
    try {
      const c = getComputedStyle(el).cursor;
      if (c === 'text') return 'text';
      if (c === 'not-allowed' || el.disabled) return 'not-allowed';
      if (c === 'col-resize' || c === 'ew-resize') return 'col-resize';
      if (c === 'pointer') return 'pointer';
      // cursor:none is what our own rule sets, so fall back to tag semantics
      if (el.closest('button, a[href], [role="button"], [class*="cursor-pointer"]')) return 'pointer';
      if (el.closest('input, textarea, [contenteditable="true"]')) return 'text';
    } catch (e) { /* detached node */ }
    return 'default';
  };

  let classifyDue = 0;
  const onMove = (e) => {
    const t = performance.now();
    hist.push({ t, x: e.clientX, y: e.clientY });
    // Prune by age first, then by an absolute cap. Age-bounding is what keeps
    // the movement gate independent of the mouse's polling rate; the count cap
    // is only a memory backstop for very high-rate devices.
    while (hist.length > 2 && t - hist[0].t > CFG.histMaxAgeMs) hist.shift();
    while (hist.length > CFG.histMaxSamples) hist.shift();
    lastMoveAt = t;
    // Classifying costs a getComputedStyle + closest(); 60/s is plenty.
    if (t > classifyDue) {
      classifyDue = t + 16;
      cursorKind = classify(e.target);
    }
    wake();
  };

  const evName = ('onpointerrawupdate' in window) ? 'pointerrawupdate' : 'pointermove';
  window.addEventListener(evName, onMove, { capture: true, passive: true });
  window.addEventListener('pointerdown', (e) => {
    pressBurstAt = performance.now();
    emit(e.clientX, e.clientY, 6, 420);
    wake();
  }, { capture: true, passive: true });

  // Leaving the window: clear, and let the OS cursor own the chrome again.
  const clearAll = () => {
    hist.length = 0; parts.length = 0;
    if (ctx) ctx.clearRect(0, 0, W, H);
  };
  window.addEventListener('blur', clearAll);
  document.addEventListener('mouseleave', clearAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') clearAll();
  });

  // DPR or size changes invalidate the backing store.
  //
  // resize alone is NOT enough: Ctrl +/- changes devicePixelRatio WITHOUT
  // firing resize, so the canvas kept a stale transform and the drawn cursor
  // sat at the wrong place (measured: DPR 1 -> 1.25 left the backing store at
  // 1920 wide when it needed 2400 -- a 20% position error that grows with
  // distance from the origin, which is exactly the "zoom breaks the cursor"
  // report). A resolution media query fires on every DPR change.
  window.addEventListener('resize', () => { build(); wake(); }, { passive: true });
  let dprQuery = null;
  const watchDpr = () => {
    if (dprQuery) {
      try { dprQuery.removeEventListener('change', onDprChange); } catch (e) {}
    }
    try {
      dprQuery = window.matchMedia('(resolution: ' + window.devicePixelRatio + 'dppx)');
      dprQuery.addEventListener('change', onDprChange);
    } catch (e) { dprQuery = null; }
  };
  const onDprChange = () => { build(); watchDpr(); wake(); };
  watchDpr();
  // Belt and braces, on a timer rather than inside the render loop.
  //
  // The frame loop deliberately parks when the pointer rests, so a guard living
  // there only runs while something is already moving -- measured: zooming with
  // the pointer still left engineDpr at 1.5 while devicePixelRatio was 1.25,
  // 2.0 and 0.8 in turn, and the drawn cursor stayed at the old scale. A cheap
  // interval (two float reads) catches every path: media query, resize, or
  // neither.
  const dprGuard = () => {
    if (ctx && Math.abs((window.devicePixelRatio || 1) - dpr) > 0.001) {
      build();
      watchDpr();
      wake();   // repaint at the new scale even if the pointer never moves
    }
  };
  const dprTimer = setInterval(dprGuard, 400);

  build();
  de.setAttribute('data-px-cursor', 'on');
  window.__pxCursor = {
    rebuild: () => { build(); wake(); },
    stop: () => {
      try {
        window.removeEventListener(evName, onMove, { capture: true });
        if (raf) cancelAnimationFrame(raf);
        clearInterval(dprTimer);
        if (canvas) canvas.remove();
        canvas = null; ctx = null; running = false;
        de.setAttribute('data-px-cursor', 'off');
      } catch (e) {}
    },
    stats: () => ({ particles: parts.length, kind: cursorKind, degraded,
                    running, histLen: hist.length, dpr }),
  };
  return 'installed';
})()`;

/**
 * Injects the pixel theme stylesheet into a window's web contents.
 * Re-injects on every dom-ready so in-app navigations stay themed.
 */
function attachPixelTheme(win) {
    try {
        const wc = win.webContents;
        // Read by the patched window:set-title-bar-overlay IPC handler: with no
        // native caption there is no overlay to set, and calling it throws.
        win.__pixelNoNativeCaption = !wantsNativeCaption();
        // Chromium persists page zoom PER HOST, and the whole UI lives on
        // 127.0.0.1 -- one accidental Ctrl+wheel (or a stray zoom from a debug
        // session) sticks to every future launch, on every port. Measured on
        // this install: the app opened at zoom level -0.5 (factor 0.9129),
        // which knocks DPR from 1.5 to 1.3693 and drops the bitmap grid to
        // 1 cell -- the "opens too small, must reset zoom by hand" complaint.
        // Reset once per window at the first real page; in-session zooming
        // afterwards is left alone.
        let zoomNormalized = false;
        wc.on("dom-ready", () => {
            if (!zoomNormalized && /^https?:/i.test(wc.getURL())) {
                zoomNormalized = true;
                try {
                    const z = wc.getZoomLevel();
                    if (Math.abs(z) > 0.001) {
                        console.error(`[pixel-theme] persisted zoom level ${z.toFixed(3)} at startup, resetting to 0`);
                        wc.setZoomLevel(0);
                    }
                }
                catch (e) { /* not fatal; DPR sync adapts to whatever DPR is */ }
            }
            syncTitleBarOverlay(win);
            const css = buildCss();
            if (css) {
                wc.insertCSS(css).catch((e) => console.error("[pixel-theme] insertCSS failed:", e));
            }
            // Must run on every dom-ready, not just once: the grid size depends
            // on DPR, which changes with monitor, OS scale and window zoom.
            wc.executeJavaScript(DPR_SYNC_JS, true)
                .then((r) => {
                    if (r !== "installed" && r !== "refreshed") {
                        console.error("[pixel-theme] dpr sync not installed:", r);
                    }
                })
                .catch((e) => console.error("[pixel-theme] dpr sync failed:", e));
            // Send-pulse listener for the message-send animation. Idempotent,
            // so re-running it on every dom-ready is safe.
            wc.executeJavaScript(SEND_PULSE_JS, true)
                .then((r) => {
                    if (r !== "installed" && r !== "already-present") {
                        console.error("[pixel-theme] send pulse not installed:", r);
                    }
                })
                .catch((e) => console.error("[pixel-theme] send pulse failed:", e));
            // Streaming caret + scroll-follow. Idempotent like the others.
            wc.executeJavaScript(STREAM_WATCH_JS, true)
                .then((r) => {
                    if (r !== "installed" && r !== "already-present") {
                        console.error("[pixel-theme] stream watch not installed:", r);
                    }
                })
                .catch((e) => console.error("[pixel-theme] stream watch failed:", e));
            // Pixel cursor. Reads its colors from pixel.css, so a theme change
            // is picked up by the rebuild on the next dom-ready.
            wc.executeJavaScript(CURSOR_JS, true)
                .then((r) => {
                    if (r !== "installed" && r !== "refreshed" && r !== "reduced-motion") {
                        console.error("[pixel-theme] cursor not installed:", r);
                    }
                })
                .catch((e) => console.error("[pixel-theme] cursor failed:", e));
            // Draw our own caption buttons whenever the native ones are off.
            if (!wantsNativeCaption()) {
                wc.executeJavaScript(WINDOW_CONTROLS_JS, true)
                    .then((r) => {
                        if (r !== "installed" && r !== "already-present") {
                            console.error("[pixel-theme] window controls not installed:", r);
                        }
                    })
                    .catch((e) => console.error("[pixel-theme] window controls failed:", e));
            }
        });
        syncTitleBarOverlay(win);

        // Ctrl +/- changes DPR without a navigation, so dom-ready never fires.
        wc.on("zoom-changed", () => {
            wc.executeJavaScript("window.__pxDprSync && window.__pxDprSync()", true)
                .catch(() => { });
        });

        // Follow runtime light/dark switches: the app rewrites its settings
        // file when the user changes theme, so watch that instead of polling.
        let watcher = null;
        try {
            const settingsPath = require("./paths").getSettingsPbPath();
            if (fs.existsSync(settingsPath)) {
                let pending = null;
                // The watcher fires on every settings write, not just theme
                // changes, so the dissolve is gated on the light/dark value
                // actually flipping -- otherwise saving any unrelated setting
                // would wipe a full-screen transition across the app.
                let lastLight = isLightTheme();
                watcher = fs.watch(settingsPath, () => {
                    // Editors write in bursts; coalesce into one repaint.
                    clearTimeout(pending);
                    pending = setTimeout(() => {
                        syncTitleBarOverlay(win);
                        const nowLight = isLightTheme();
                        if (nowLight === lastLight) {
                            return;
                        }
                        lastLight = nowLight;
                        if (win.isDestroyed() || wc.isDestroyed()) {
                            return;
                        }
                        wc.executeJavaScript(THEME_DISSOLVE_JS, true)
                            .catch(() => { /* window navigating away */ });
                    }, 120);
                });
            }
        }
        catch (e) {
            console.error("[pixel-theme] settings watch failed:", e);
        }
        win.on("closed", () => {
            try {
                watcher && watcher.close();
            }
            catch (_) { /* already gone */ }
        });
        attachLoadRetry(win);
        attachHydrationWatchdog(win);
    }
    catch (e) {
        console.error("[pixel-theme] attach failed:", e);
    }
}

// ---------------------------------------------------------------------------
// Startup recovery: stall abort + readiness probe + hydration watchdog
// ---------------------------------------------------------------------------
// The UI is served by language_server.exe over local HTTPS on a random port
// (--https_server_port 0). The main process reloads every window as soon as it
// learns the port, but the server warms up for ~30s on a cold start, so the
// navigation sits on Chromium's ~30s timeout with a blank window; if the
// timeout wins, the window is a dead shell. Measured on this install: 14 of 68
// launches (21%) before any fix. A blind backoff retry (deployed 2026-08-04)
// recovered two real incidents (11:02, 12:34) but only AFTER the full 30s
// timeout had burned -- the user still stared at a blank window for 30s.
//
// This version stops waiting on Chromium:
//   - a navigation to the local server still loading after stallMs is aborted
//     (wc.stop()): the server accepting TCP but not answering IS the warmup
//     race, and Chromium's own timeout would burn 30s to learn the same thing;
//   - any retryable failure (or our own abort) starts a 1s readiness probe --
//     plain node https with rejectUnauthorized:false, because the server uses
//     a self-signed cert -- and the page reloads the moment the server
//     actually answers, instead of on a guessed schedule;
//   - "loaded but empty" (navigation succeeds, app never boots -- a probed
//     dead shell had 11 elements vs ~1900 healthy) is caught by a watchdog
//     that counts DOM elements a while after did-finish-load and reloads.
//
// Scoped to https?://127.0.0.1 only -- anything else is the app's business.

const LOCAL_UI_RE = /^https?:\/\/127\.0\.0\.1(:\d+)?\//i;

const RECOVERY_DEFAULTS = {
    stallMs: 12000,          // abort a hung nav well before Chromium's ~30s
    probeEveryMs: 1000,
    probeTimeoutMs: 1500,
    maxReloads: 6,           // per streak; reset on a successful local load
    maxProbes: 120,          // ~2 minutes of probing per streak, then give up
    hydrateAfterMs: 8000,
    hydrateMinElements: 30,  // healthy page ~1900 elements; a dead shell was 11
    maxHydrateReloads: 2,
};

// Transient network failures worth retrying. Anything else (bad cert, aborted
// by a user navigation, ERR_ABORTED from a redirect) must fall through, or we
// would fight the app instead of helping it. Our own wc.stop() also lands
// here as -3 and is whitelisted via the selfAborted flag.
const RETRYABLE = new Set([
    -7,   // ERR_TIMED_OUT
    -100, // ERR_CONNECTION_CLOSED
    -102, // ERR_CONNECTION_REFUSED
    -104, // ERR_CONNECTION_FAILED
    -105, // ERR_NAME_NOT_RESOLVED
    -106, // ERR_INTERNET_DISCONNECTED
    -109, // ERR_ADDRESS_UNREACHABLE
    -118, // ERR_CONNECTION_TIMED_OUT
    -324, // ERR_EMPTY_RESPONSE
]);

function defaultProbe(url, timeoutMs, cb) {
    try {
        const u = new URL(url);
        const mod = u.protocol === "http:" ? http : https;
        const req = mod.request({
            host: u.hostname,
            port: u.port || (u.protocol === "http:" ? 80 : 443),
            path: "/",
            method: "GET",
            rejectUnauthorized: false,
            timeout: timeoutMs,
        }, (res) => {
            res.resume(); // drain so the socket is released
            cb(true);     // any HTTP answer at all means the server is up
        });
        req.on("timeout", () => {
            req.destroy(); // destroy fires 'error', which reports false
        });
        req.on("error", () => cb(false));
        req.end();
    }
    catch (e) {
        cb(false);
    }
}

// opts is a test seam: {probe, timing} override the network call and the
// timings so the state machine can be exercised in milliseconds off-app.
function attachLoadRetry(win, opts) {
    try {
        const wc = win.webContents;
        const T = Object.assign({}, RECOVERY_DEFAULTS, opts && opts.timing);
        const probe = (opts && opts.probe) || defaultProbe;

        let reloads = 0;
        let probeTimer = null;
        let probeTicks = 0;
        let probeBusy = false;
        let stallTimer = null;
        let selfAborted = false;
        let lastNavUrl = "";
        let dead = false;

        const clearProbe = () => {
            if (probeTimer) {
                clearInterval(probeTimer);
                probeTimer = null;
            }
            probeBusy = false;
        };
        const clearStall = () => {
            if (stallTimer) {
                clearTimeout(stallTimer);
                stallTimer = null;
            }
        };
        const gone = () => dead || win.isDestroyed() || wc.isDestroyed();

        // Electron has changed this event's signature across majors
        // (positional url vs a details object); accept either shape.
        wc.on("did-start-navigation", (a, b) => {
            const url = (a && typeof a === "object" && typeof a.url === "string") ? a.url
                : (typeof b === "string" ? b : "");
            lastNavUrl = LOCAL_UI_RE.test(url) ? url : "";
        });

        wc.on("did-start-loading", () => {
            clearProbe(); // a navigation is in flight; judge it by its outcome
            clearStall();
            selfAborted = false; // a new nav supersedes any abort context
            stallTimer = setTimeout(() => {
                stallTimer = null;
                if (gone() || !wc.isLoading() || !lastNavUrl) {
                    return;
                }
                selfAborted = true;
                console.error(`[pixel-theme] load stalled >${T.stallMs}ms, aborting to probe instead: ${lastNavUrl}`);
                try {
                    wc.stop();
                }
                catch (e) {
                    selfAborted = false;
                    return;
                }
                // Measured live (2026-08-04 13:38): wc.stop() on a pending
                // navigation emits NEITHER did-fail-load NOR did-finish-load,
                // so waiting for an event here strands the window forever.
                // Start the probe directly; if a stray -3 does arrive later,
                // did-fail-load just restarts the same probe, which is
                // harmless.
                startProbe(lastNavUrl, "stall", `no response in ${T.stallMs}ms`);
            }, T.stallMs);
        });

        const startProbe = (url, code, desc) => {
            clearProbe();
            probeTicks = 0;
            console.error(`[pixel-theme] load failed ${code} (${desc}); probing until the server answers ` +
                `(reload ${reloads + 1}/${T.maxReloads}): ${url}`);
            probeTimer = setInterval(() => {
                if (gone()) {
                    clearProbe();
                    return;
                }
                if (wc.isLoading() || probeBusy) {
                    return;
                }
                if (++probeTicks > T.maxProbes) {
                    clearProbe();
                    console.error(`[pixel-theme] server never answered after ${T.maxProbes} probes, giving up: ${url}`);
                    return;
                }
                probeBusy = true;
                // A probe implementation that never calls back would wedge
                // probeBusy forever and silently kill the loop -- force-settle
                // it past its own timeout.
                let done = false;
                const settle = (alive) => {
                    if (done) {
                        return;
                    }
                    done = true;
                    clearTimeout(guard);
                    probeBusy = false;
                    // probeTimer null means a navigation superseded this probe
                    // while the request was in flight -- stand down.
                    if (!alive || !probeTimer || gone() || wc.isLoading()) {
                        return;
                    }
                    clearProbe();
                    reloads++;
                    console.error(`[pixel-theme] server is up, reloading (${reloads}/${T.maxReloads}): ${url}`);
                    wc.loadURL(url).catch(() => { /* did-fail-load restarts the probe */ });
                };
                const guard = setTimeout(() => settle(false), T.probeDeadlineMs || (T.probeTimeoutMs * 2 + 500));
                try {
                    probe(url, T.probeTimeoutMs, settle);
                }
                catch (e) {
                    settle(false);
                }
            }, T.probeEveryMs);
        };

        wc.on("did-fail-load", (event, errorCode, errorDesc, validatedURL, isMainFrame) => {
            clearStall();
            if (!isMainFrame) {
                return;
            }
            const ourAbort = selfAborted && errorCode === -3;
            selfAborted = false;
            if (!ourAbort && !RETRYABLE.has(errorCode)) {
                return;
            }
            const url = LOCAL_UI_RE.test(validatedURL || "") ? validatedURL : lastNavUrl;
            if (!url || gone()) {
                return;
            }
            if (reloads >= T.maxReloads) {
                console.error(`[pixel-theme] load failed ${errorCode} (${errorDesc}) after ` +
                    `${reloads} reloads, giving up: ${url}`);
                return;
            }
            startProbe(url, errorCode, errorDesc);
        });

        // A successful local load ends the streak and returns the full budget.
        wc.on("did-finish-load", () => {
            clearStall();
            clearProbe();
            try {
                if (LOCAL_UI_RE.test(wc.getURL())) {
                    reloads = 0;
                }
            }
            catch (e) { /* shutting down */ }
        });

        win.on("closed", () => {
            dead = true;
            clearProbe();
            clearStall();
        });
    }
    catch (e) {
        console.error("[pixel-theme] load retry attach failed:", e);
    }
}

// "Loaded but empty" is the one startup failure no load event reports: the
// navigation succeeds, a shell document arrives, and the app never boots.
function attachHydrationWatchdog(win, opts) {
    try {
        const wc = win.webContents;
        const T = Object.assign({}, RECOVERY_DEFAULTS, opts && opts.timing);
        let timer = null;
        let reloadsLeft = T.maxHydrateReloads;
        let dead = false;
        const clear = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };

        wc.on("did-start-loading", clear);
        wc.on("did-finish-load", () => {
            clear();
            let url = "";
            try {
                url = wc.getURL();
            }
            catch (e) {
                return;
            }
            if (!LOCAL_UI_RE.test(url)) {
                return;
            }
            timer = setTimeout(() => {
                timer = null;
                if (dead || win.isDestroyed() || wc.isDestroyed() || wc.isLoading()) {
                    return;
                }
                let now = "";
                try {
                    now = wc.getURL();
                }
                catch (e) {
                    return;
                }
                if (now !== url) {
                    return; // navigated elsewhere meanwhile; not ours to judge
                }
                wc.executeJavaScript("document.querySelectorAll('*').length", true)
                    .then((n) => {
                        if (typeof n !== "number") {
                            return;
                        }
                        if (n >= T.hydrateMinElements) {
                            reloadsLeft = T.maxHydrateReloads; // healthy; refill
                            return;
                        }
                        if (reloadsLeft <= 0 || dead || wc.isDestroyed() || wc.isLoading()) {
                            return;
                        }
                        reloadsLeft--;
                        console.error(`[pixel-theme] page has only ${n} elements ${T.hydrateAfterMs}ms after load, ` +
                            `reloading (${T.maxHydrateReloads - reloadsLeft}/${T.maxHydrateReloads}): ${url}`);
                        try {
                            wc.reload();
                        }
                        catch (e) { /* shutting down */ }
                    })
                    .catch(() => { /* renderer gone; load events will handle it */ });
            }, T.hydrateAfterMs);
        });
        win.on("closed", () => {
            dead = true;
            clear();
        });
    }
    catch (e) {
        console.error("[pixel-theme] hydration watchdog attach failed:", e);
    }
}

// ---------------------------------------------------------------------------
// Pixel loading overlay (replaces dist/loadingOverlay.js at the call site)
// ---------------------------------------------------------------------------

function getPixelLoadingHtml(isLight) {
    const bg = isLight ? "#eef0f5" : "#1a1c2c";
    const frame = isLight ? "#333c57" : "#566c86";
    const text = isLight ? "#566c86" : "#94b0c2";
    const c1 = "#73eff7";
    const c2 = "#ffcd75";
    const c3 = "#a7f070";
    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${fontFaceCss("ui")}
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: ${bg};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    overflow: hidden;
    -webkit-app-region: drag;
    -webkit-user-select: none;
    font-family: 'Fusion Pixel 12px Proportional SC', "Courier New", monospace;
    -webkit-font-smoothing: none;
    image-rendering: pixelated;
  }
  .cubes { display: flex; gap: 10px; margin-bottom: 28px; }
  .cubes div {
    width: 16px; height: 16px;
    animation: hop 0.9s steps(3, end) infinite;
  }
  .cubes div:nth-child(1) { background: ${c1}; animation-delay: 0s; }
  .cubes div:nth-child(2) { background: ${c2}; animation-delay: 0.15s; }
  .cubes div:nth-child(3) { background: ${c3}; animation-delay: 0.3s; }
  @keyframes hop {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-14px); }
  }
  .bar {
    width: 208px; height: 20px;
    border: 2px solid ${frame};
    padding: 2px;
    margin-bottom: 18px;
  }
  .bar .fill {
    height: 100%; width: 100%;
    background: repeating-linear-gradient(to right, ${c1} 0 8px, ${bg} 8px 10px);
    transform-origin: left;
    animation: fill 2.4s steps(13, end) infinite;
  }
  @keyframes fill {
    0%   { transform: scaleX(0); }
    100% { transform: scaleX(1); }
  }
  .text { font-size: 13px; color: ${text}; letter-spacing: 1px; }
  .text::after {
    content: "\\2588";
    margin-left: 2px;
    animation: blink 0.8s steps(1, end) infinite;
  }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
</style>
</head>
<body>
  <div class="cubes"><div></div><div></div><div></div></div>
  <div class="bar"><div class="fill"></div></div>
  <div class="text">反重力引擎已启动，正在努力摆脱地心引力...</div>
</body>
</html>
`;
}

/**
 * Pixel-art variant of the stock loading overlay. Same contract as
 * loadingOverlay.attachLoadingOverlay; falls back to the original on error.
 */
function attachPixelLoadingOverlay(win, foregroundColor, backgroundColor) {
    try {
        // Derived from the color rather than matched against a literal: the
        // installer rewrites these constants, so an equality check would break.
        const isLight = isLightColor(backgroundColor);
        const view = new electron_1.WebContentsView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });
        const html = getPixelLoadingHtml(isLight);
        void view.webContents.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
        win.contentView.addChildView(view);
        const updateBounds = () => {
            const [width, height] = win.getContentSize();
            view.setBounds({ x: 0, y: 0, width, height });
        };
        updateBounds();
        win.on("resize", updateBounds);
        const dismiss = () => {
            try {
                win.contentView.removeChildView(view);
            }
            catch (_) {
                // window may already be closed
            }
            win.off("resize", updateBounds);
        };
        win.webContents.once("did-finish-load", dismiss);
        // Failsafe: if the first navigation never finishes (the startup race
        // strands the window; measured live 2026-08-04 13:38 -- the user sat
        // behind this overlay "forever"), the once() above never fires. The
        // load-retry probe usually reloads long before this, but if IT gives
        // up too, a blank window still beats an eternal loading screen.
        const failsafe = setTimeout(dismiss, 150000);
        win.webContents.once("did-finish-load", () => clearTimeout(failsafe));
        win.on("closed", () => clearTimeout(failsafe));
    }
    catch (e) {
        console.error("[pixel-theme] pixel overlay failed, using stock overlay:", e);
        try {
            require("./loadingOverlay").attachLoadingOverlay(win, foregroundColor, backgroundColor);
        }
        catch (e2) {
            console.error("[pixel-theme] stock overlay also failed:", e2);
        }
    }
}
