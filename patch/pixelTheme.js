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
exports.wantsPixelCursor = wantsPixelCursor;
exports.isGlassTheme = isGlassTheme;
const electron_1 = require("electron");
const path = require("path");
const fs = require("fs");
// Plain node http(s) on purpose: the readiness probe must accept the language
// server's self-signed certificate, which electron.net refuses.
const https = require("https");
const http = require("http");

function getThemeDir() {
    const resources = process.resourcesPath || "";
    const activeFile = path.join(resources, "active-theme.json");
    if (fs.existsSync(activeFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(activeFile, "utf-8"));
            if (data.theme && fs.existsSync(path.join(resources, data.theme))) {
                return path.join(resources, data.theme);
            }
        } catch (e) {}
    }
    if (fs.existsSync(path.join(resources, "doodle-theme", "doodle.css"))) {
        return path.join(resources, "doodle-theme");
    }
    return path.join(resources, "pixel-theme");
}

const FONTS = {
    ui: { file: "fusion-pixel-12px-proportional-sc.woff2", family: "Fusion Pixel 12px Proportional SC" },
    mono: { file: "fusion-pixel-12px-monospaced-sc.woff2", family: "Fusion Pixel 12px Monospaced SC" },
};

// Fonts are cached (large, immutable); theme CSS is re-read on every
// navigation so theme edits only need a window reload, not an app restart.
const fontCssCache = new Map();

function fontFaceCss(key) {
    const themeDir = getThemeDir();
    const cacheKey = themeDir + ":" + key;
    if (fontCssCache.has(cacheKey)) {
        return fontCssCache.get(cacheKey);
    }
    const f = FONTS[key];
    let css = "";
    try {
        const p = path.join(themeDir, "fonts", f.file);
        if (fs.existsSync(p)) {
            const b64 = fs.readFileSync(p).toString("base64");
            css =
                "@font-face{font-family:'" + f.family + "';font-style:normal;font-weight:400;" +
                "font-display:optional;src:url(data:font/woff2;base64," + b64 + ") format('woff2');}\n";
        }
        else {
            console.error("[theme] font missing:", p);
        }
    }
    catch (e) {
        console.error("[theme] font embed failed:", f.file, e);
    }
    fontCssCache.set(cacheKey, css);
    return css;
}

function buildFontCss() {
    return fontFaceCss("ui") + fontFaceCss("mono");
}

// Disk-read cache keyed by path+mtime+size. readThemeCss() runs on every
// dom-ready (and readThemeDeclarations() several times per navigation for
// the chrome/native-caption lookups), each a full 120-180KB read; the
// stat-sync costs microseconds and still picks up theme edits (any write
// changes mtime), so the edit-then-Ctrl+R workflow is unaffected.
const cssReadCache = { path: null, mtime: 0, size: 0, userMtime: 0, userSize: 0, css: null };

function readThemeCss() {
    try {
        const themeDir = getThemeDir();
        const themeBase = path.basename(themeDir).toLowerCase();
        let target = null;

        // 1. 精准按主题目录前缀匹配对应的 CSS 文件
        if (themeBase.includes("phantom")) {
            target = path.join(themeDir, "phantom.css");
        } else if (themeBase.includes("matcha")) {
            target = path.join(themeDir, "matcha.css");
        } else if (themeBase.includes("doodle")) {
            target = path.join(themeDir, "doodle.css");
        } else if (themeBase.includes("pixel")) {
            target = path.join(themeDir, "pixel.css");
        }

        // 2. 依次检查 4 套主题的主样式文件作为兜底
        if (!target || !fs.existsSync(target)) {
            for (const file of ["phantom.css", "matcha.css", "doodle.css", "pixel.css"]) {
                const p = path.join(themeDir, file);
                if (fs.existsSync(p)) { target = p; break; }
            }
        }
        // 3. 通用兜底：第 1、2 步都是写死的四套主题名，新增第五套主题（glass-theme/
        //    glass.css 等）会双双落空 —— readThemeCss 返回空串，insertCSS 插入空表，
        //    表现为「切过去之后整个应用完全没有主题」（2026-09-17 实测踩到）。
        //    这里按目录名推出同名 CSS（<目录名去掉 -theme>.css），再退一步取目录里
        //    任意一个 .css，任何新主题都不必再改注入器。
        if (!target || !fs.existsSync(target)) {
            const byName = path.join(themeDir, themeBase.replace(/-theme$/, "") + ".css");
            if (fs.existsSync(byName)) {
                target = byName;
            }
            else {
                const hit = fs.readdirSync(themeDir).find((f) => f.toLowerCase().endsWith(".css"));
                if (hit) {
                    target = path.join(themeDir, hit);
                }
            }
        }
        if (!target || !fs.existsSync(target)) {
            console.error("[theme] no CSS file found in theme dir:", themeDir);
            return "";
        }

        const st = fs.statSync(target);
        const userCssPath = path.join(themeDir, "glass-user.css");
        let userMtime = 0;
        let userSize = 0;
        if (fs.existsSync(userCssPath)) {
            try {
                const ust = fs.statSync(userCssPath);
                userMtime = ust.mtimeMs;
                userSize = ust.size;
            } catch (e) {}
        }

        if (cssReadCache.path === target &&
            cssReadCache.mtime === st.mtimeMs &&
            cssReadCache.size === st.size &&
            cssReadCache.userMtime === userMtime &&
            cssReadCache.userSize === userSize) {
            return cssReadCache.css;
        }

        let css = fs.readFileSync(target, "utf-8");
        if (userMtime > 0) {
            try {
                css += "\n/* [glass-user.css override] */\n" + fs.readFileSync(userCssPath, "utf-8");
            } catch (e) {}
        }

        cssReadCache.path = target;
        cssReadCache.mtime = st.mtimeMs;
        cssReadCache.size = st.size;
        cssReadCache.userMtime = userMtime;
        cssReadCache.userSize = userSize;
        cssReadCache.css = css;
        return css;
    }
    catch (e) {
        console.error("[theme] failed to read theme CSS:", e);
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
let declCache = { src: null, out: "" };
function readThemeDeclarations() {
    const src = readThemeCss();
    // Identity-keyed memo: readThemeCss() now returns the same string object
    // while the file is unchanged, so the comment-strip regex (a full-file
    // scan) runs once per file edit instead of once per lookup.
    if (declCache.src !== src) {
        declCache = { src, out: src.replace(/\/\*[\s\S]*?\*\//g, "") };
    }
    return declCache.out;
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

function wantsPixelCursor() {
    try {
        return !/--px-cursor\s*:\s*off\b/.test(readThemeDeclarations());
    }
    catch (e) {
        return true;
    }
}

function isGlassTheme() {
    try {
        return /--px-glass\s*:\s*on\b/.test(readThemeDeclarations());
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
 * Eager font pre-warming and GPU glyph atlas pre-rasterization.
 * Preloads both bitmap font families and forces Skia / DirectWrite
 * to rasterize Latin, CJK, digits and UI symbols into GPU textures
 * at boot, preventing font decoding and synchronous style recalc /
 * layout thrashing (FOUT) during animations.
 */
const FONT_PREWARM_JS = `(() => {
  if (window.__pxFontPrewarmed) return 'already-present';
  window.__pxFontPrewarmed = true;
  try {
    if (document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load('12px "Fusion Pixel 12px Proportional SC"'),
        document.fonts.load('12px "Fusion Pixel 12px Monospaced SC"')
      ]).then(() => {
        const warm = document.createElement('div');
        warm.setAttribute('aria-hidden', 'true');
        warm.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;z-index:-1;contain:strict;';
        // 键盘字符全谱预热。注意：字符集里不能出现反引号字符本身 ——
        // 本文件用模板字面量定义这段脚本，字符串里混进一个反引号
        // 字符就会把模板提前截断（历史上真的踩过，整个文件因此无法
        // 被 node 解析，重新打包即失效）。它只是一个预热字形，删掉
        // 不影响任何行为。
        warm.innerHTML = '<span style="font-family:\\'Fusion Pixel 12px Proportional SC\\'">ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789~!@#$%^&*()_+-={}|[]\\\\:";\\'<>?,./一二三四五六七八九十百千万亿的基本设置模型通用应用外观浏览器项目会话解析取消确定保存</span><span style="font-family:\\'Fusion Pixel 12px Monospaced SC\\'">ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789</span>';
        (document.body || document.documentElement).appendChild(warm);
        requestAnimationFrame(() => {
          try { warm.remove(); } catch (e) {}
        });
      }).catch(() => {});
    }
  } catch (e) {}
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
  const MODAL_CLASS = 'px-modal-open';
  const BOTTOM_SLOP_PX = 48;   // "close enough to the bottom" tolerance
  // 空闲节流：isStreaming() 是一次全文档 querySelector，而这个 observer
  // 从不断开，应用空闲时的每次 React 更新都会白付一次查询。空闲态半秒
  // 查一次足够（光标/停止按钮晚半秒出现/消失，肉眼不可辨）；刚发送
  // （html.px-sending）时旁路节流——停止按钮紧随发送出现，不能等；
  // 已在流式中则不节流，滚动跟随每帧都要跑。
  const IDLE_CHECK_MS = 500;

  let cachedScroller = null;
  const scroller = () => {
    if (cachedScroller && cachedScroller.isConnected && cachedScroller.scrollHeight > cachedScroller.clientHeight + 20) {
      return cachedScroller;
    }
    const list = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
    let best = null;
    for (const el of list) {
      if (el.scrollHeight <= el.clientHeight + 20) continue;
      if (!best || el.clientHeight > best.clientHeight) best = el;
    }
    cachedScroller = best;
    return best;
  };

  const isStreaming = () => {
    // Any visible stop affordance means a reply is in flight.
    return !!document.querySelector('[data-testid*="stop"], [aria-label*="Stop"], [aria-label*="停止"]');
  };

  let pinned = false;
  let raf = 0;
  let lastIdleCheck = 0;

  const tick = () => {
    raf = 0;
    const de = document.documentElement;
    const active = de.classList.contains(STREAM_CLASS);
    const sending = de.classList.contains('px-sending');
    if (!active && !sending && (performance.now() - lastIdleCheck) < IDLE_CHECK_MS) {
      return;   // throttled idle check; next mutation re-arms the rAF
    }
    lastIdleCheck = performance.now();
    const streaming = isStreaming();
    if (streaming) {
      if (!de.classList.contains(STREAM_CLASS)) de.classList.add(STREAM_CLASS);
    } else if (de.classList.contains(STREAM_CLASS)) {
      de.classList.remove(STREAM_CLASS);
      pinned = false;
      cachedScroller = null;
    }
    if (!streaming) return;
    const sc = scroller();
    if (!sc) return;
    const distance = sc.scrollHeight - sc.clientHeight - sc.scrollTop;
    if (distance <= BOTTOM_SLOP_PX) pinned = true;
    else if (distance > BOTTOM_SLOP_PX * 4) pinned = false;
    if (pinned) {
      // Direct assignment eliminates frame-restart jank of smooth scroll
      sc.scrollTop = sc.scrollHeight;
    }
  };

  const schedule = () => {
    if (raf) return;
    // rAF rather than reacting per mutation: streaming fires mutations far
    // faster than frames, and scrolling more than once per frame is wasted.
    raf = requestAnimationFrame(tick);
  };

  // --- modal-open 标记（替代 CSS 里的 body:has([role="dialog"])） ------
  // :has() 挂在 body 上会跟着任何子树变动一起失效（14.2 实测 4.7 倍），
  // 而流式输出让会话子树一直在动。本 observer 本来就在收全部变更记录，
  // 顺带跟踪弹窗不增加第二个全文档 observer：
  //   - Radix/Ariakit 的弹窗走 Portal，[role=dialog] 元素以新增/移除节点
  //     出现，matches() 即可命中；
  //   - 直接挂到 <body> 下的大容器（Portal 容器整块挂载）补一次子树
  //     querySelector 探测，覆盖「容器和内容同一条记录挂上」的情况。
  // class 置于 <html>，CSS 用 html.px-modal-open 前缀替代 :has()。
  const DIALOG_SEL = '[role="dialog"], [role="alertdialog"]';
  const openDialogs = new Set(document.querySelectorAll(DIALOG_SEL));
  if (openDialogs.size) document.documentElement.classList.add(MODAL_CLASS);

  const trackDialogs = (muts) => {
    let touched = false;
    for (const m of muts) {
      if (m.type !== 'childList') continue;
      // 移除 onBody 限制，对任意子树容器递归探测 [role="dialog"]
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches(DIALOG_SEL)) {
          openDialogs.add(n);
          touched = true;
        } else if (n.querySelector) {
          const d = n.querySelector(DIALOG_SEL);
          if (d) { openDialogs.add(d); touched = true; }
        }
      }
      for (const n of m.removedNodes) {
        if (n.nodeType !== 1) continue;
        if (openDialogs.delete(n)) {
          touched = true;
        } else if (n.querySelectorAll) {
          const inners = n.querySelectorAll(DIALOG_SEL);
          for (const d of inners) {
            if (openDialogs.delete(d)) touched = true;
          }
        }
      }
    }
    // 必须保留：全量清扫已在深层 DOM 脱链的死节点，根除 Tooltip 永久锁定隐患
    const stale = [];
    for (const d of openDialogs) { if (!d.isConnected) stale.push(d); }
    for (const d of stale) openDialogs.delete(d);
    const open = openDialogs.size > 0;
    if (touched || open !== document.documentElement.classList.contains(MODAL_CLASS)) {
      document.documentElement.classList.toggle(MODAL_CLASS, open);
    }
  };

  // --- 菜单/下拉项打标 (px-menu-item / px-listbox-item / px-menu-content) ---
  // 主题 CSS 原来用 ~140 条 [role=...]:hover * / [class*=...] 后代通配选择器
  // 给菜单项上色。A/B 实测（右栏 8754 节点长文档，全量样式重算）：这批
  // 选择器每次重算多花 ~280ms，是 .md 切换 2.2s 长任务里 CSS 侧的大头。
  // ARIA 角色挂载后不变，所以在挂载瞬间打一次 class，CSS 改用 .px-menu-item
  // 匹配（类桶索引，O(1)）：
  //   .px-menu-item     菜单项本体：menuitem / menuitemradio / menuitemcheckbox /
  //                     标题栏菜单项 / option / select-item / typeahead 项 /
  //                     radix collection item
  //   .px-listbox-item  listbox/combobox 上下文中的 option / typeahead 项
  //   .px-menu-content  弹层面板：popper wrapper 直接子元素、radix 菜单面板、
  //                     monaco 菜单、标题栏菜单弹层容器、非空 [role=menu/listbox]
  // class 变更不会触发本 observer 的 childList 记录，React 重渲染也不重写
  // 未变化的 className 属性，所以打标是幂等且无循环的。
  // 刻意【不】观察 class 属性变更（曾试过用它对抗个别组件 hover 时整条重写
  // className 抹掉标签）：如果页面里另有观察 class 并回写 className 的代码，
  // 双方就会在 MutationObserver 微任务里互相应答，主线程被饿死——实测
  // 打开模型下拉菜单即必现整个渲染进程卡死。挂载时打一次标就够；万一
  // 哪个组件事后抹掉标签，代价只是那一个条目失去悬停配色，可接受。
  const MENU_ITEM_SEL = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [data-testid="title-menu-bar-option"]';
  const FAMILY_SEL = '[role="option"], [id*="typeahead-item"], [class*="select-item"], [data-radix-collection-item]';
  const LISTBOX_CTX = '[role="listbox"], [role="combobox"], [data-radix-popper-content-wrapper"]';
  const PANEL_SEL = '[data-radix-menu-content], .monaco-menu-container, div.border-menu-border';

  const tagEl = (el) => {
    try {
      if (!el || el.nodeType !== 1) return;
      const cls = typeof el.className === 'string' ? el.className : '';
      if (el.matches(MENU_ITEM_SEL) || el.matches(FAMILY_SEL)) el.classList.add('px-menu-item');
      if ((el.getAttribute('role') === 'option' || el.id.indexOf('typeahead-item') !== -1 || cls.indexOf('select-item') !== -1) && el.closest(LISTBOX_CTX)) el.classList.add('px-listbox-item');
      if (el.matches(PANEL_SEL) || (el.parentElement && el.parentElement.hasAttribute && el.parentElement.hasAttribute('data-radix-popper-content-wrapper'))) el.classList.add('px-menu-content');
      const role = el.getAttribute('role');
      // 面板可能在挂载瞬间还是空的（React 分批填内容），所以这里不看
      // childElementCount：空面板打标无害（不可见），漏打才是回归。
      if (role === 'menu' || role === 'listbox') el.classList.add('px-menu-content');
      if (el.tagName === 'DIV' && el.closest('[data-testid="title-menu-bar"]') && (cls.indexOf('z-[8000]') !== -1 || cls.indexOf('min-w-') !== -1)) el.classList.add('px-menu-content');
    } catch (e) { /* must never break the observer */ }
  };
  const tagTree = (root) => {
    try {
      if (!root || root.nodeType !== 1) return;
      tagEl(root);
      // 必须把 tagEl 能处理的所有形态都列进扫描：曾漏掉 [role=menu] 面板
      // （模型下拉是自绘弹层：z-[6000] role=presentation 包着 role=menu，
      // 不是 radix popper），导致菜单边框样式全部失效。
      const all = root.querySelectorAll(
        MENU_ITEM_SEL + ', ' + FAMILY_SEL + ', ' + PANEL_SEL +
        ', [data-radix-popper-content-wrapper], [data-radix-popper-content-wrapper] > *' +
        ', [role="menu"], [role="listbox"]' +
        ', [data-testid="title-menu-bar"] div[class*="z-[8000]"], [data-testid="title-menu-bar"] div[class*="min-w-"]');
      for (const el of all) tagEl(el);
    } catch (e) { /* same */ }
  };
  const tagMutations = (muts) => {
    for (const m of muts) {
      if (m.type !== 'childList') continue;
      for (const n of m.addedNodes) tagTree(n);
    }
  };
  tagTree(document.body);

  const mo = new MutationObserver((muts) => {
    window.__pxDomGen = (window.__pxDomGen || 0) + 1;
    try { tagMutations(muts); } catch (e) { /* must never kill schedule() */ }
    try { trackDialogs(muts); } catch (e) { /* must never kill schedule() */ }
    schedule();
  });
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

  try {
    if (window.__pxCursor && typeof window.__pxCursor.refreshColors === 'function') {
      window.__pxCursor.refreshColors();
    }
  } catch (e) {}

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
  if (window.__pxCursor) {
    try { window.__pxCursor.stop(); } catch (e) {}
  }

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
  const hist = [];          // recent pointer samples, newest last
  const parts = [];
  let cursorKind = 'default';
  let pressBurstAt = 0;
  let lastFrameAt = 0;

  const palette = () => {
    const target = document.body || de;
    const cs = getComputedStyle(target);
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
      canvas.style.cssText = 'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;pointer-events:none!important;z-index:2147483647!important;';
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

    let lastGap = 0;
    if (lastFrameAt) {
      lastGap = now - lastFrameAt;
    }
    lastFrameAt = now;

    if (!ctx) {
      build();
    }
    ctx.clearRect(0, 0, W, H);

    const head = predict(now);
    if (head) {
      // Emit only when pointer moved and system frame is healthy
      const isStreaming = de.classList.contains('px-streaming');
      if (!isStreaming && lastGap < 35) {
        const moved = travelled(now);
        if (moved >= CFG.moveMinPx) {
          emit(head.x, head.y, moved > 26 ? 2 : 1);
        }
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
    if (head) {
      const hx = Math.round(head.x / u) * u, hy = Math.round(head.y / u) * u;
      // Head scale. The art is a 16x16 grid, so 1 = 16 device px tall.
      const S = CFG.headScale;
      if (cursorKind === 'text') {
        drawGrid(IBEAM, hx - 1 * u * S, hy - 6 * u * S, colors.head, colors.edge, S);
      } else {
        drawGrid(ARROW, hx, hy, colors.head, colors.edge, S);
        if (cursorKind === 'pointer') {
          // four corner ticks: "this is clickable"
          ctx.fillStyle = colors.head;
          for (const [ox, oy] of [[-4,-4],[4,-4],[-4,4],[4,4]]) {
            ctx.fillRect(hx + ox * u * S, hy + oy * u * S, u * S, u * S);
          }
        }
      }

      // press burst: quick 4-pixel diamond expansion
      if (pressBurstAt && (now - pressBurstAt) < 220) {
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

    // Sleep once there is nothing left to ANIMATE
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

  let lastBodyClass = '';
  let classifyDue = 0;
  let lastTarget = null;
  const onMove = (e) => {
    const t = performance.now();
    const curBodyClass = document.body ? document.body.className : '';
    if (curBodyClass !== lastBodyClass) {
      lastBodyClass = curBodyClass;
      colors = palette();
    }
    hist.push({ t, x: e.clientX, y: e.clientY });
    while (hist.length > 2 && t - hist[0].t > CFG.histMaxAgeMs) hist.shift();
    while (hist.length > CFG.histMaxSamples) hist.shift();
    lastMoveAt = t;
    if (e.target !== lastTarget && t > classifyDue) {
      lastTarget = e.target;
      classifyDue = t + 32;
      cursorKind = classify(e.target);
    }
    wake();
  };

  const evName = 'pointermove';
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

  const dprGuard = () => {
    if (ctx && Math.abs((window.devicePixelRatio || 1) - dpr) > 0.001) {
      build();
      watchDpr();
      wake();
    }
  };
  const dprTimer = setInterval(dprGuard, 400);

  // 监听主题与亮暗模式类名变动，实现 0ms 瞬间变色
  const themeObserver = new MutationObserver(() => {
    colors = palette();
    wake();
  });
  if (document.body) {
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  }
  themeObserver.observe(de, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-px-cursor'] });

  build();
  de.setAttribute('data-px-cursor', 'on');
  window.__pxCursor = {
    rebuild: () => { build(); wake(); },
    refreshColors: () => { colors = palette(); wake(); },
    stop: () => {
      try {
        window.removeEventListener(evName, onMove, { capture: true });
        if (raf) cancelAnimationFrame(raf);
        clearInterval(dprTimer);
        themeObserver.disconnect();
        if (canvas) canvas.remove();
        canvas = null; ctx = null; running = false;
        de.setAttribute('data-px-cursor', 'off');
      } catch (e) {}
    },
    stats: () => ({ particles: parts.length, kind: cursorKind,
                    running, histLen: hist.length, dpr, colors }),
  };

  return 'installed';
})()`;

/**
 * Inline comment hover tracker, v2.
 *
 * Measured on the live app (CDP, right pane, 8754-node markdown, 144Hz):
 * the app's hover handler w() finds the block under the cursor, then g()
 * extracts comment context by walking EVERY text node of the tracking
 * container twice through two Ranges (zKa -> wIa). That is ~21k
 * Element.closest() calls per mousemove (340k calls over 16 moves, 459ms)
 * plus ~10k Range.intersectsNode calls (154ms) -- every mousemove frame
 * blocked the main thread for 77-106ms. This is the "markdown 预览里移动
 * 鼠标卡顿" symptom.
 *
 * v1 of this patch only replaced the candidate querySelectorAll with an
 * O(1) elementFromPoint hit test (the original reflow scan, ~950ms per
 * move). g() still ran on every frame, so the jank stayed. v2 adds the
 * missing half:
 *
 *  - The patched query now also gates g() itself. A hit is only returned
 *    when it is a trackable block (p/li/h1..h6/table/th/td/pre,
 *    div.code-line, div.markdown-frontmatter) AND the tracking container
 *    is small (<= MD_TRACKER_MAX_NODES elements, counted once per
 *    mutation generation and cached). Long file previews blow past that
 *    cap -- for them g() costs 80-100ms per frame, so the query returns
 *    no candidates and the tracker never runs: hovering a preview costs
 *    0ms. Chat messages keep their own small per-message containers, so
 *    the inline-comment bubble still works there.
 *  - Portaled overlays (menus/dialogs attach to <body>) can never be
 *    inside the container, so this.contains(hit) already excludes them.
 */
const COMMENT_TRACKER_OPT_JS = `(() => {
  if (window.__pxCommentTrackerOpt) return 'already-present';
  window.__pxCommentTrackerOpt = true;

  // Above this many descendant elements, g()'s whole-container text walk
  // costs more per frame than the comment feature is worth (a 3500-node
  // chat message already runs ~40ms; the 8754-node preview ran 77-106ms).
  const MD_TRACKER_MAX_NODES = 1200;

  let lastX = 0;
  let lastY = 0;
  window.addEventListener('mousemove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
  }, { passive: true, capture: true });

  const TARGET_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, div.code-line, pre:not(:has(.carousel)), table, th, td, div.markdown-frontmatter";
  const TRACKABLE_TAGS = { P: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, TABLE: 1, TH: 1, TD: 1, PRE: 1 };
  const isTrackable = (el) =>
    TRACKABLE_TAGS[el.tagName] === 1 ||
    el.classList.contains('code-line') ||
    el.classList.contains('markdown-frontmatter');

  // Node counts are cached per container and invalidated whenever the
  // stream watcher sees a mutation batch (it bumps window.__pxDomGen on
  // every batch; see STREAM_WATCH_JS). Without that, a container that
  // swaps its content (tab switch reuses the same element) would keep a
  // stale count.
  let sizeCache = new WeakMap();
  let sizeGen = -1;
  const isSmallContainer = (c) => {
    const gen = window.__pxDomGen || 0;
    if (gen !== sizeGen) { sizeGen = gen; sizeCache = new WeakMap(); }
    let n = sizeCache.get(c);
    if (n === undefined) {
      try { n = c.querySelectorAll('*').length; } catch (e) { n = 0; }
      sizeCache.set(c, n);
    }
    return n <= MD_TRACKER_MAX_NODES;
  };

  const origQuerySelectorAll = Element.prototype.querySelectorAll;

  Element.prototype.querySelectorAll = function(sel) {
    if (typeof sel === 'string' && sel === TARGET_SELECTOR) {
      if (lastX > 0 && lastY > 0) {
        const top = document.elementFromPoint(lastX, lastY);
        if (top) {
          const hit = top.closest(TARGET_SELECTOR);
          if (hit && this.contains(hit) && isTrackable(hit) && isSmallContainer(this)) {
            return [hit];
          }
        }
      }
      return [];
    }
    return origQuerySelectorAll.apply(this, arguments);
  };
  return 'installed';
})()`;

/**
 * Settings modal graceful exit animation controller.
 * Intercepts close button clicks, backdrop clicks, and Escape keypresses,
 * adds 'px-modal-closing' to document.documentElement and 'settings-modal-closing' to modal,
 * plays the theme's 160ms pop-out exit animation, and then dispatches the unmount action.
 */
const SETTINGS_MODAL_JS = `(() => {
  if (window.__pxSettingsModalController) return 'already-present';
  window.__pxSettingsModalController = true;

  let isClosing = false;

  const performGracefulClose = (unmountAction) => {
    if (isClosing) return;
    const container = document.querySelector('.settings-modal-container') || document.querySelector('[role="dialog"]');
    if (!container) {
      unmountAction();
      return;
    }

    isClosing = true;
    document.documentElement.classList.add('px-modal-closing');
    container.classList.add('settings-modal-closing');

    const backdrop = document.querySelector('.settings-modal-backdrop') || document.querySelector('div.animate-modalFadeIn') || container.parentElement;
    if (backdrop) backdrop.classList.add('settings-modal-closing');

    setTimeout(() => {
      try {
        unmountAction();
      } catch (err) {
        console.error('[pixel-theme] modal exit unmountAction failed:', err);
      }

      // Keep html.px-modal-closing until React completely removes the dialog from DOM
      const pollStart = Date.now();
      const pollUnmount = () => {
        if (!document.querySelector('.settings-modal-container') && !document.querySelector('[role="dialog"]')) {
          document.documentElement.classList.remove('px-modal-closing');
          isClosing = false;
        } else if (Date.now() - pollStart > 1200) {
          // Failsafe timeout: guarantee reset
          document.documentElement.classList.remove('px-modal-closing');
          isClosing = false;
        } else {
          setTimeout(pollUnmount, 25);
        }
      };
      setTimeout(pollUnmount, 40);
    }, 160);
  };

  document.addEventListener('click', (e) => {
    if (isClosing) return;
    const target = e.target;
    if (!target) return;

    const closeBtn = target.closest && target.closest(
      '.settings-modal-container button[aria-label="关闭"], ' +
      '.settings-modal-container button[aria-label="Close"], ' +
      '.settings-modal-container button.top-4.right-4, ' +
      '[role="dialog"] button[aria-label="关闭"], ' +
      '[role="dialog"] button[aria-label="Close"], ' +
      '[role="dialog"] button.top-4.right-4'
    );

    const backdrop = document.querySelector('.settings-modal-backdrop') || document.querySelector('div.animate-modalFadeIn');
    const isBackdrop = target === backdrop;

    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      performGracefulClose(() => {
        closeBtn.click();
      });
    } else if (isBackdrop) {
      e.preventDefault();
      e.stopPropagation();
      performGracefulClose(() => {
        backdrop.click();
      });
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (isClosing) return;
    if (e.key === 'Escape' || e.code === 'Escape') {
      const container = document.querySelector('.settings-modal-container') || document.querySelector('[role="dialog"]');
      if (!container) return;

      const closeBtn = container.querySelector && container.querySelector(
        'button[aria-label="关闭"], button[aria-label="Close"], button.top-4.right-4'
      );

      e.preventDefault();
      e.stopPropagation();
      performGracefulClose(() => {
        if (closeBtn) {
          closeBtn.click();
        } else {
          const evt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true });
          document.dispatchEvent(evt);
        }
      });
    }
  }, true);

  return 'installed';
})()`;

/**
 * Liquid Glass optics core — 移植自 zsio/liquid-glass (src/glass.ts)。
 * 2D SDF 法线 + 斯涅尔折射轮廓 + 三通道色散 + 全内反射 + 倒角流光遮罩。
 * 只提供 window.__pxLiquidGlass.mount()，自己不挂载任何元素。
 */
const LIQUID_GLASS_CORE_JS = `(() => {
  if (window.__pxLiquidGlass) return 'already-present';

  /* ------------------------------------------------------------------
     液态玻璃光学引擎（移植自 zsio/liquid-glass 的 src/glass.ts）
     - 2D 符号距离场(SDF) 求精确外法线
     - 斯涅尔定律查找表 -> 非线性折射轮廓（中心零失真、边缘骤聚）
     - 三通道色散 + B 通道全内反射
     - 法线光照贴图 + 倒角遮罩（指针流光只在倒角上流动）
     贴图在 Worker(OffscreenCanvas) 里生成，Worker 不可用时退回主线程 canvas。
     本模块只提供能力，不自己挂载任何元素。
     ------------------------------------------------------------------ */

  var NS = 'http://www.w3.org/2000/svg';
  var DEFAULTS = {
    radius: 40, refraction: 56, bevel: 22, blur: 0.35,
    dispersion: 1.2, tint: 'rgba(255,255,255,0.018)', mode: 'auto'
  };

  function clamp(n, a, b) { return Math.max(a, Math.min(n, b)); }
  function num(v, f, a, b) {
    return typeof v === 'number' && isFinite(v) ? clamp(v, a, b) : f;
  }
  function normalize(v) {
    v = v || {};
    return {
      radius: num(v.radius, DEFAULTS.radius, 0, 10000),
      refraction: num(v.refraction, DEFAULTS.refraction, 0, 100),
      bevel: num(v.bevel, DEFAULTS.bevel, 2, 100),
      blur: num(v.blur, DEFAULTS.blur, 0, 24),
      dispersion: num(v.dispersion, DEFAULTS.dispersion, 0, 5),
      tint: typeof v.tint === 'string' ? v.tint : DEFAULTS.tint,
      mode: v.mode === 'svg' || v.mode === 'css' ? v.mode : 'auto'
    };
  }

  /* backdrop-filter: url(#id) 只在桌面 Chromium 上可靠；其余退回纯模糊 */
  var svgBackdropCache = null;
  function useSVGBackdrop() {
    if (svgBackdropCache === null) {
      try {
        var ua = navigator.userAgent || '';
        var chromium = ua.indexOf('Chrome/') >= 0 || ua.indexOf('Chromium/') >= 0 || ua.indexOf('Edg/') >= 0;
        svgBackdropCache = chromium && CSS.supports('backdrop-filter', 'url("#probe")');
      } catch (e) { svgBackdropCache = false; }
    }
    return svgBackdropCache;
  }

  function element(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  /* ------------------------------------------------------------------
     贴图合成：只依赖自己的参数与内建对象，因此可以被 toString 进 Worker。
     md = 位移贴图(R=X偏折, G=Y偏折, B=内反射权重)
     ld = 法线光照贴图   rd = 倒角遮罩
     ------------------------------------------------------------------ */
  function fillTextures(md, ld, rd, w, h, width, height, radius, bevel, density, refract) {
    var clamp2 = function (n, a, b) { return Math.max(a, Math.min(n, b)); };
    var STEPS = 1024;
    var profile = null;
    if (refract) {
      profile = new Float32Array(STEPS + 1);
      for (var pi = 0; pi <= STEPS; pi++) {
        var t0 = pi / STEPS;
        var sinIncident = Math.pow(1 - t0, 1.28) * 0.985;
        var incident = Math.asin(sinIncident);
        var transmitted = Math.asin(sinIncident / 1.46);
        var thickness = 0.72 + 0.28 * Math.sqrt(Math.max(0, 1 - (1 - t0) * (1 - t0)));
        var edgeRef = Math.tan(Math.asin(0.985) - Math.asin(0.985 / 1.46)) * 0.72;
        profile[pi] = 0.92 * Math.tan(incident - transmitted) * thickness / edgeRef;
      }
    }
    var r = Math.min(radius, width / 2, height / 2);
    var b = Math.min(bevel, width / 2, height / 2);
    /* 倒角带以外光学上是平的：位移取中性值(128,128,0,255)，两张浮层 alpha 归零。
       先整片填中性值，再只对边缘一圈算超越函数 —— 大面板也不卡的关键。 */
    if (refract) {
      new Uint32Array(md.buffer).fill(new Uint32Array(new Uint8Array([128, 128, 0, 255]).buffer)[0]);
    }
    var band = b + 6;
    var qx = new Float64Array(w), sx = new Float64Array(w);
    var qy = new Float64Array(h), sy = new Float64Array(h);
    for (var x0 = 0; x0 < w; x0++) {
      var px = (x0 + 0.5) / w * width - width / 2;
      qx[x0] = Math.abs(px) - (width / 2 - r);
      sx[x0] = Math.sign(px);
    }
    for (var y0 = 0; y0 < h; y0++) {
      var py = (y0 + 0.5) / h * height - height / 2;
      qy[y0] = Math.abs(py) - (height / 2 - r);
      sy[y0] = Math.sign(py);
    }
    for (var y = 0; y < h; y++) {
      var rowQ = qy[y], oy = Math.max(rowQ, 0), oy2 = oy * oy, rowS = sy[y];
      var i = y * w * 4;
      for (var x = 0; x < w; x++, i += 4) {
        var colQ = qx[x], ox = Math.max(colQ, 0);
        var len = Math.sqrt(ox * ox + oy2);
        var d = len + Math.min(Math.max(colQ, rowQ), 0) - r;
        if (-d > band) continue;
        var nx = 0, ny = 0;
        if (len > 0.0001) { nx = ox / len * sx[x]; ny = oy / len * rowS; }
        else if (colQ > rowQ) { nx = sx[x]; } else { ny = rowS; }
        var s = Math.max(0, -d);
        if (refract) {
          var t = clamp2(s / b, 0, 1), ti = t * STEPS;
          var j = Math.min(STEPS - 1, Math.floor(ti));
          var bend = profile[j] + (profile[j + 1] - profile[j]) * (ti - j);
          md[i] = Math.round(127.5 - nx * bend * 127.5);
          md[i + 1] = Math.round(127.5 - ny * bend * 127.5);
          md[i + 3] = 255;
        }
        if (d > 0) continue;
        var coverage = clamp2(0.5 - d * density, 0, 1);
        var top = Math.max(0, -nx * 0.40 - ny * 0.9165);
        var bottom = Math.max(0, nx * 0.22 + ny * 0.9755);
        var side = Math.max(0, nx * 0.95 - ny * 0.31);
        var e1 = (s - 0.72) / 0.60, edge = Math.exp(-e1 * e1);
        var i1 = (s - 2.5) / 1.32, inner = Math.exp(-i1 * i1);
        var h1 = (s - b * 0.31) / (b * 0.29), shoulder = Math.exp(-h1 * h1);
        var t2 = top * top, b2 = bottom * bottom;
        var white = edge * (0.08 + 0.78 * t2 + 0.64 * b2 * bottom * b2)
          + inner * 0.16 * t2 * t2 + shoulder * (0.033 * top + 0.054 * b2 * bottom);
        var s1 = (s - 1.8) / 0.86;
        var shade = Math.exp(-s1 * s1) * 0.21 * side + shoulder * 0.032 * side;
        var v = white - shade;
        ld[i] = v >= 0 ? 255 : 37;
        ld[i + 1] = v >= 0 ? 255 : 46;
        ld[i + 2] = v >= 0 ? 255 : 62;
        ld[i + 3] = Math.round(clamp2(Math.abs(v), 0, 0.96) * 255 * coverage);
        var g1 = (s - 1.25) / 1.15;
        if (refract) md[i + 2] = Math.round(255 * 0.20 * Math.exp(-g1 * g1) * coverage);
        rd[i] = rd[i + 1] = rd[i + 2] = 255;
        rd[i + 3] = Math.round(255 * coverage * (edge * 0.85 + inner * 0.20));
      }
    }
  }

  function density(width, height) {
    var dpr = window.devicePixelRatio || 1;
    return Math.min(Math.max(2, Math.min(dpr, 2.5)), 1536 / Math.max(width, height));
  }
  function cacheKey(width, height, radius, bevel, refract) {
    var dn = density(width, height);
    var w = Math.max(2, Math.ceil(width * dn)), h = Math.max(2, Math.ceil(height * dn));
    return [width, height, radius, bevel, w, h, refract ? 1 : 0].join('/');
  }

  var cache = new Map();
  var EMPTY = new Uint8ClampedArray(0);

  /* ---- Worker：贴图合成与 PNG 编码都不占主线程 ---- */
  var WORKER_SOURCE = 'var fill=(' + fillTextures.toString() + ');'
    + 'var oc=null,ctx=null,map=null,light=null,rim=null;var empty=new Uint8ClampedArray(0);'
    + 'self.onmessage=async function(e){var d=e.data||{};try{'
    + 'var dn=Math.min(Math.max(2,Math.min(d.dpr||1,2.5)),1536/Math.max(d.width,d.height));'
    + 'var w=Math.max(2,Math.ceil(d.width*dn)),h=Math.max(2,Math.ceil(d.height*dn));'
    + 'if(!oc||oc.width!==w||oc.height!==h){oc=new OffscreenCanvas(w,h);ctx=oc.getContext("2d");'
    + 'if(!ctx)throw new Error("no 2d context");map=null;light=ctx.createImageData(w,h);rim=ctx.createImageData(w,h);}'
    + 'if(d.refract&&!map)map=ctx.createImageData(w,h);'
    + 'light.data.fill(0);rim.data.fill(0);'
    + 'fill(d.refract?map.data:empty,light.data,rim.data,w,h,d.width,d.height,d.radius,d.bevel,dn,d.refract);'
    + 'var read=async function(img){ctx.putImageData(img,0,0);return new FileReaderSync().readAsDataURL(await oc.convertToBlob());};'
    + 'self.postMessage({key:d.key,displacement:d.refract?await read(map):"",lighting:await read(light),rim:await read(rim)});'
    + '}catch(err){self.postMessage({key:d.key,error:String((err&&err.message)||err)});}};';

  var listeners = new Set();
  var pending = new Map();
  var active = null, timer = 0;
  var engine = null, broken = false, live = 0, engineURL = '';

  function breakWorker() {
    broken = true; pending.clear(); active = null; clearTimeout(timer);
    if (engine) { engine.terminate(); engine = null; }
    if (engineURL) { URL.revokeObjectURL(engineURL); engineURL = ''; }
    listeners.forEach(function (l) { l('', null); });
  }
  function worker() {
    try {
      if (broken || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
      if (!engine) {
        engineURL = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
        engine = new Worker(engineURL);
        engine.onmessage = function (e) {
          var d = e.data || {};
          clearTimeout(timer); active = null;
          if (d.error || typeof d.displacement !== 'string') { breakWorker(); return; }
          var data = { displacement: d.displacement, lighting: d.lighting, rim: d.rim };
          if (cache.size >= 16) cache.delete(cache.keys().next().value);
          cache.set(d.key, data);
          listeners.forEach(function (l) { l(d.key, data); });
          pump();
        };
        engine.onerror = function () { breakWorker(); };
      }
      return engine;
    } catch (e) { broken = true; return null; }
  }
  function pump() {
    if (active || !worker()) return;
    var it = pending.entries().next();
    if (it.done) return;
    var owner = it.value[0], job = it.value[1];
    pending.delete(owner);
    var hit = cache.get(job.key);
    if (hit) { owner(job.key, hit); pump(); return; }
    active = job;
    timer = setTimeout(breakWorker, 5000);
    try { engine.postMessage(job); } catch (e) { breakWorker(); }
  }
  function request(owner, job) {
    if (active && active.key === job.key) pending.delete(owner);
    else pending.set(owner, job);
    pump();
  }

  /* ---- 主线程兜底（Worker 不可用时；只对小面积元素划算） ---- */
  var scratch = { canvas: null, w: 0, h: 0, map: null, light: null, rim: null };
  function optics(width, height, radius, bevel, refract) {
    var dn = density(width, height);
    var w = Math.max(2, Math.ceil(width * dn)), h = Math.max(2, Math.ceil(height * dn));
    var key = cacheKey(width, height, radius, bevel, refract);
    var cached = cache.get(key);
    if (cached) return cached;
    if (!scratch.canvas) scratch.canvas = document.createElement('canvas');
    var canvas = scratch.canvas;
    if (scratch.w !== w || scratch.h !== h) {
      canvas.width = w; canvas.height = h;
      var prime = canvas.getContext('2d');
      if (!prime) throw new Error('Canvas 2D unavailable');
      scratch.map = null;
      scratch.light = prime.createImageData(w, h);
      scratch.rim = prime.createImageData(w, h);
      scratch.w = w; scratch.h = h;
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    if (refract && !scratch.map) scratch.map = ctx.createImageData(w, h);
    var light = scratch.light, rim = scratch.rim;
    light.data.fill(0); rim.data.fill(0);
    fillTextures(refract ? scratch.map.data : EMPTY, light.data, rim.data, w, h, width, height, radius, bevel, dn, refract);
    var displacement = '';
    if (refract) { ctx.putImageData(scratch.map, 0, 0); displacement = canvas.toDataURL(); }
    ctx.putImageData(light, 0, 0); var lighting = canvas.toDataURL();
    ctx.putImageData(rim, 0, 0); var rimURL = canvas.toDataURL();
    var data = { displacement: displacement, lighting: lighting, rim: rimURL };
    if (cache.size >= 16) cache.delete(cache.keys().next().value);
    cache.set(key, data);
    return data;
  }

  /* ------------------------------------------------------------------
     mount：host 需要有直接子节点 .px-lg-surface / .px-lg-light
     （可选 .px-lg-sheen），且尺寸非零。
     ------------------------------------------------------------------ */
  function mount(host, initial) {
    var surface = host.querySelector(':scope > .px-lg-surface');
    var lighting = host.querySelector(':scope > .px-lg-light');
    var sheen = host.querySelector(':scope > .px-lg-sheen');
    if (!surface || !lighting) throw new Error('missing .px-lg-surface / .px-lg-light');

    var options = normalize(initial);
    var dead = false, failed = false, frame = 0, lightFrame = 0, geometry = '', wanted = '';
    var lastGen = -Infinity, followUp = 0;
    var appliedRadius = '', appliedTint = '', appliedFrame = '', appliedBlur = '',
        appliedScales = '', appliedBackdrop = '', appliedRenderer = '';
    var renderer = 'css';

    var uid = 'px-lens-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    /* Chromium 下 defs 容器不能 display:none，否则滤镜失效 */
    var root = element('svg', { width: '0', height: '0', 'aria-hidden': 'true', 'data-px-lg-defs': '', focusable: 'false' });
    root.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    var defs = element('defs');
    var filter = element('filter', {
      id: uid, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB'
    });
    var blurNode = element('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: String(options.blur), result: 'source' });
    var mapNode = element('feImage', { x: '0', y: '0', preserveAspectRatio: 'none', result: 'raw-map' });
    var mapSmooth = element('feGaussianBlur', { in: 'raw-map', stdDeviation: '.55', edgeMode: 'duplicate', result: 'map' });
    filter.append(blurNode, mapNode, mapSmooth);
    var displacements = [];
    for (var c = 0; c < 3; c++) {
      var dm = element('feDisplacementMap', {
        in: 'source', in2: 'map', scale: '0', xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' + c
      });
      var mtx = new Array(20).fill(0);
      mtx[c * 5 + c] = 1; mtx[18] = 1;
      filter.append(dm, element('feColorMatrix', { in: 'd' + c, type: 'matrix', values: mtx.join(' '), result: 'c' + c }));
      displacements.push(dm);
    }
    filter.append(
      element('feBlend', { in: 'c0', in2: 'c1', mode: 'screen', result: 'rg' }),
      element('feBlend', { in: 'rg', in2: 'c2', mode: 'screen', result: 'refracted' })
    );
    var reflected = element('feDisplacementMap', {
      in: 'source', in2: 'map', scale: '0', xChannelSelector: 'R', yChannelSelector: 'G', result: 'edge-sample'
    });
    var weight = element('feColorMatrix', {
      in: 'map', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0', result: 'edge-weight'
    });
    filter.append(reflected, weight,
      element('feComposite', { in: 'edge-sample', in2: 'edge-weight', operator: 'in', result: 'reflection' }),
      element('feBlend', { in: 'refracted', in2: 'reflection', mode: 'screen', result: 'optics' }),
      element('feGaussianBlur', { in: 'optics', stdDeviation: '.48' }));
    defs.append(filter); root.append(defs);
    (document.body || document.documentElement).append(root);

    var media = ['(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)', '(forced-colors: active)']
      .map(function (q) { return matchMedia(q); });
    var motion = matchMedia('(prefers-reduced-motion: reduce)');
    var lightLayers = [lighting, sheen];

    function applyTextures(tx, w, h) {
      if (tx.displacement) {
        mapNode.setAttribute('width', String(w));
        mapNode.setAttribute('height', String(h));
        mapNode.setAttribute('href', tx.displacement);
      }
      lighting.style.backgroundImage = 'url("' + tx.lighting + '")';
      lighting.style.setProperty('--px-lg-rim-mask', 'url("' + tx.rim + '")');
    }
    function onTexture(key, data) {
      if (!dead && (!data || key === wanted)) schedule();
    }
    function render() {
      if (dead) return;
      frame = 0;
      var w = host.offsetWidth, h = host.offsetHeight;
      var r = Math.min(options.radius, w / 2, h / 2);
      var radiusPx = options.radius + 'px';
      if (radiusPx !== appliedRadius) { host.style.setProperty('--px-lg-radius', radiusPx); appliedRadius = radiusPx; }
      if (options.tint !== appliedTint) { host.style.setProperty('--px-lg-tint', options.tint); appliedTint = options.tint; }
      var accessible = media.some(function (m) { return m.matches; });
      renderer = accessible ? 'solid'
        : (!failed && options.mode !== 'css' && (options.mode === 'svg' || useSVGBackdrop()) ? 'svg' : 'css');
      if (w > 0 && h > 0 && !failed && !accessible) {
        try {
          var refract = renderer === 'svg';
          var key = cacheKey(w, h, r, options.bevel, refract);
          wanted = key;
          if (key !== geometry) {
            var now = performance.now(), wk = worker(), hit = cache.get(key);
            if (hit) { pending.delete(onTexture); applyTextures(hit, w, h); geometry = key; }
            else if (wk) {
              request(onTexture, {
                key: key, width: w, height: h, radius: r, bevel: options.bevel,
                dpr: window.devicePixelRatio || 1, refract: refract
              });
            } else if (now - lastGen >= 48) {
              lastGen = now; applyTextures(optics(w, h, r, options.bevel, refract), w, h); geometry = key;
            } else if (!followUp) {
              followUp = setTimeout(function () { followUp = 0; schedule(); }, 48 - (now - lastGen));
            }
          } else pending.delete(onTexture);
          if (refract) {
            var pad = Math.ceil(options.refraction / 2 + options.blur * 3 + 4);
            var frameKey = pad + '/' + w + '/' + h;
            if (frameKey !== appliedFrame) {
              filter.setAttribute('x', String(-pad)); filter.setAttribute('y', String(-pad));
              filter.setAttribute('width', String(w + pad * 2)); filter.setAttribute('height', String(h + pad * 2));
              appliedFrame = frameKey;
            }
            var blurValue = String(options.blur);
            if (blurValue !== appliedBlur) { blurNode.setAttribute('stdDeviation', blurValue); appliedBlur = blurValue; }
            var strength = Math.min(options.refraction, Math.min(w, h) * 0.46);
            var separation = options.refraction === 0 ? 0 : Math.min(options.dispersion, strength * 0.10);
            var scaleKey = strength + '/' + separation;
            if (scaleKey !== appliedScales) {
              displacements.forEach(function (node, idx) { node.setAttribute('scale', String(strength + (idx - 1) * separation)); });
              reflected.setAttribute('scale', String(-strength * 0.22));
              appliedScales = scaleKey;
            }
          }
        } catch (e) {
          failed = true; renderer = 'css';
          try { console.warn('[px-glass] optics fallback', e && e.message); } catch (e2) {}
        }
      }
      if (accessible || failed) { pending.delete(onTexture); wanted = ''; }
      if (renderer === 'svg' && !mapNode.getAttribute('href')) renderer = 'css';
      var value = renderer === 'solid' ? 'none'
        : renderer === 'svg' ? 'url("#' + uid + '")'
        : 'blur(' + Math.max(options.blur, 5) + 'px) saturate(1.08)';
      if (value !== appliedBackdrop) {
        surface.style.backdropFilter = value;
        surface.style.setProperty('-webkit-backdrop-filter', value);
        appliedBackdrop = value;
      }
      if (renderer !== appliedRenderer) { host.setAttribute('data-px-lg-renderer', renderer); appliedRenderer = renderer; }
    }
    function schedule() { if (!frame && !dead) frame = requestAnimationFrame(render); }

    /* ---- 位移 + 指针流光合并在同一帧 ---- */
    var targetX = 28, targetY = 12, currentX = 28, currentY = 12, lastTime = 0, targetTime = 0;
    var pendingPos = null, appliedPos = null, appliedPX = '', appliedPY = '';
    function queuePosition(x, y) {
      pendingPos = { x: x, y: y };
      if (!lightFrame && !dead) lightFrame = requestAnimationFrame(animate);
    }
    function animate(time) {
      lightFrame = 0;
      if (dead) return;
      var next = pendingPos; pendingPos = null;
      if (next) {
        if (!appliedPos || next.x !== appliedPos.x || next.y !== appliedPos.y) {
          host.style.transform = 'translate3d(' + next.x + 'px, ' + next.y + 'px, 0)';
          appliedPos = next;
        }
      }
      var dt = lastTime ? time - lastTime : 16;
      var mix = 1 - Math.exp(-Math.min(64, dt) / 62);
      lastTime = time;
      currentX += (targetX - currentX) * mix;
      currentY += (targetY - currentY) * mix;
      if (time - targetTime > 450) { currentX = targetX; currentY = targetY; }
      var px = currentX.toFixed(3) + '%', py = currentY.toFixed(3) + '%';
      if (px !== appliedPX || py !== appliedPY) {
        lightLayers.forEach(function (l) {
          if (!l) return;
          if (px !== appliedPX) l.style.setProperty('--px-lg-pointer-x', px);
          if (py !== appliedPY) l.style.setProperty('--px-lg-pointer-y', py);
        });
        appliedPX = px; appliedPY = py;
      }
      if (!motion.matches && renderer !== 'solid'
        && Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.04) {
        lightFrame = requestAnimationFrame(animate);
      } else lastTime = 0;
    }
    function moveLight(x, y) {
      targetX = clamp(x, -40, 140); targetY = clamp(y, -40, 140);
      targetTime = performance.now();
      if (!dead && !lightFrame && !motion.matches) lightFrame = requestAnimationFrame(animate);
    }

    var observer = null;
    try { observer = new ResizeObserver(schedule); observer.observe(host); } catch (e) {}
    media.forEach(function (m) { m.addEventListener('change', schedule); });
    window.addEventListener('resize', schedule, { passive: true });
    listeners.add(onTexture); live++;
    render();

    return {
      get renderer() { return renderer; },
      update: function (v) { options = normalize(Object.assign({}, options, v || {})); schedule(); },
      refresh: schedule,
      light: moveLight,
      position: queuePosition,
      options: function () { return Object.assign({}, options); },
      destroy: function () {
        if (dead) return;
        dead = true;
        cancelAnimationFrame(frame); cancelAnimationFrame(lightFrame); clearTimeout(followUp);
        if (observer) observer.disconnect();
        media.forEach(function (m) { m.removeEventListener('change', schedule); });
        window.removeEventListener('resize', schedule);
        try { root.remove(); } catch (e) {}
        listeners.delete(onTexture); pending.delete(onTexture);
        if (--live === 0 && engine) {
          engine.terminate(); engine = null; pending.clear(); active = null; clearTimeout(timer);
          if (engineURL) { URL.revokeObjectURL(engineURL); engineURL = ''; }
        }
      }
    };
  }

  /* ---- 共用材质样式：随引擎一起下发，避免与主题 CSS 版本错配 ---- */
  (function () {
    var SID = 'px-lg-base-style';
    if (document.getElementById(SID)) return;
    var st = document.createElement('style');
    st.id = SID;
    st.textContent = [
      '.px-lg{position:relative;border-radius:var(--px-lg-radius,40px);--px-lg-pointer-x:50%;--px-lg-pointer-y:50%}',
      '.px-lg-surface,.px-lg-light,.px-lg-sheen{position:absolute;inset:0;pointer-events:none;border-radius:inherit}',
      '.px-lg-surface{z-index:0;background:var(--px-lg-tint,rgba(255,255,255,.018));-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px)}',
      '.px-lg-light{z-index:1;background-size:100% 100%;background-repeat:no-repeat}',
      '.px-lg-light::after{content:"";position:absolute;inset:0;border-radius:inherit;',
      'background:radial-gradient(ellipse at var(--px-lg-pointer-x) var(--px-lg-pointer-y),',
      'rgba(255,255,255,.60),rgba(255,255,255,.13) 38%,transparent 68%);',
      '-webkit-mask-image:var(--px-lg-rim-mask,linear-gradient(transparent,transparent));',
      'mask-image:var(--px-lg-rim-mask,linear-gradient(transparent,transparent));',
      '-webkit-mask-size:100% 100%;mask-size:100% 100%}',
      '.px-lg-sheen{z-index:2;background:linear-gradient(155deg,rgba(255,255,255,.07),transparent 24%,transparent 77%,rgba(255,255,255,.018)),',
      'radial-gradient(ellipse at var(--px-lg-pointer-x) var(--px-lg-pointer-y),rgba(255,255,255,.04),transparent 57%)}',
      '.px-lg-content{position:relative;z-index:3;border-radius:inherit}',
      '.px-lg[data-px-lg-renderer="solid"] > .px-lg-surface{background:var(--px-lg-solid,rgba(232,236,246,.92))!important;',
      'backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
      '.px-lg[data-px-lg-renderer="solid"] > .px-lg-light,',
      '.px-lg[data-px-lg-renderer="solid"] > .px-lg-sheen{display:none}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  })();

  window.__pxLiquidGlass = {
    mount: mount,
    defaults: DEFAULTS,
    supported: useSVGBackdrop,
    version: 1,
    stats: function () { return { cached: cache.size, instances: live, worker: !!engine, broken: broken }; }
  };
  return 'installed';
})()`;

/**
 * Liquid Glass dynamic pointer sheen (W1).
 * Tracks pointer position across glass surfaces and sets inline --glass-mx/--glass-my.
 */
const GLASS_SHEEN_JS = `(() => {
  if (window.__pxGlassSheen) return 'already-present';

  const SURFACE_SEL = '[data-testid="title-menu-bar"], [class~="bg-sidebar"], [class~="bg-sidebar-secondary"], [class~="bg-card"], [class*="bg-card"]:not([class*="bg-card-border"]), [role="dialog"], [role="alertdialog"], .settings-modal-container, .px-menu-content, [role="menu"]:not(:empty), [role="listbox"]:not(:empty)';
  let activeSurface = null;
  let lastX = -1, lastY = -1;
  let lastTarget = null;
  let rafId = null;
  let idleTimer = null;
  let isRunning = false;

  const clearSurface = (el) => {
    if (!el) return;
    try {
      el.style.removeProperty('--glass-mx');
      el.style.removeProperty('--glass-my');
    } catch (e) {}
  };

  const update = () => {
    rafId = null;
    if (lastX < 0 || lastY < 0) return;
    const surface = lastTarget ? lastTarget.closest(SURFACE_SEL) : null;
    if (surface !== activeSurface) {
      clearSurface(activeSurface);
      activeSurface = surface;
    }
    if (activeSurface) {
      const rect = activeSurface.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const mx = Math.max(0, Math.min(1, (lastX - rect.left) / rect.width));
        const my = Math.max(0, Math.min(1, (lastY - rect.top) / rect.height));
        activeSurface.style.setProperty('--glass-mx', mx.toFixed(3));
        activeSurface.style.setProperty('--glass-my', my.toFixed(3));
      }
    }
  };

  const onIdle = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    isRunning = false;
  };

  const onBlur = () => {
    clearTimeout(idleTimer);
    onIdle();
    clearSurface(activeSurface);
    activeSurface = null;
  };

  const onPointerMove = (e) => {
    if (document.documentElement.getAttribute('data-px-glass') === 'perf') {
      if (isRunning) onBlur();
      return;
    }
    lastX = e.clientX;
    lastY = e.clientY;
    lastTarget = e.target;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(onIdle, 250);

    if (!isRunning) {
      isRunning = true;
      update();
    } else if (!rafId) {
      rafId = requestAnimationFrame(update);
    }
  };

  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  window.addEventListener('blur', onBlur);
  document.addEventListener('mouseleave', onBlur);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onBlur();
  });

  window.__pxGlassSheen = {
    stop: () => {
      document.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mouseleave', onBlur);
      clearTimeout(idleTimer);
      onBlur();
      delete window.__pxGlassSheen;
    },
    status: () => ({
      running: isRunning,
      activeSurface: activeSurface ? (activeSurface.tagName + (activeSurface.className ? '.' + activeSurface.className.split(' ').join('.') : '')) : null,
      lastX,
      lastY
    })
  };
  return 'installed';
})()`;

/**
 * Liquid Glass mouse follower lens (W2)。
 * 真 SDF 圆形透镜：中心光学平坦（底下文字照常可读）、只有倒角一圈折射，
 * 高光带惯性汇聚在运动后缘；静止 / 打字 / 悬停文本区时自动淡出或减弱。
 */
const GLASS_LENS_JS = `(() => {
  const ID = 'px-glass-lens';
  if (document.getElementById(ID) || window.__pxGlassLens) return 'already-present';
  const LG = window.__pxLiquidGlass;
  if (!LG || typeof LG.mount !== 'function') return 'core-missing';

  const de = document.documentElement;
  const readNum = (name, fallback) => {
    let v = de.style.getPropertyValue(name).trim();
    if (!v) v = getComputedStyle(de).getPropertyValue(name).trim();
    const n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  };
  const readCfg = () => ({
    size: Math.max(28, Math.min(360, readNum('--glass-lens-size', 104))),
    refraction: readNum('--glass-lens-refraction', 44),
    bevel: readNum('--glass-lens-bevel', 16),
    blur: readNum('--glass-lens-blur', 0.3),
    dispersion: readNum('--glass-lens-dispersion', 1.1),
    idleMs: readNum('--glass-lens-idle', 300),
    opacity: readNum('--glass-lens-opacity', 1),
    dim: readNum('--glass-lens-dim', 0.26)
  });

  let cfg = readCfg();

  const host = document.createElement('div');
  host.id = ID;
  host.className = 'px-lg';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = '<span class="px-lg-surface"></span><span class="px-lg-light"></span><span class="px-lg-sheen"></span>';

  const layout = () => {
    const half = cfg.size / 2;
    host.style.width = cfg.size + 'px';
    host.style.height = cfg.size + 'px';
    host.style.margin = (-half) + 'px 0 0 ' + (-half) + 'px';
  };
  /* 透镜层级必须低于自绘指针画布(2147483647)与窗口按钮(2147483644) */
  host.style.cssText = [
    'position:fixed', 'left:0', 'top:0',
    'pointer-events:none',
    'z-index:2147483638',
    'opacity:0',
    'transform:translate3d(-9999px,-9999px,0)',
    'transition:opacity 170ms ease, width 140ms ease, height 140ms ease',
    'will-change:transform,opacity',
    'contain:layout style size',
    'box-shadow:0 10px 26px -18px rgba(8,12,30,.55)'
  ].join(';');
  layout();
  (document.body || de).appendChild(host);

  let ctrl = null;
  try {
    ctrl = LG.mount(host, {
      radius: cfg.size / 2,
      refraction: cfg.refraction,
      bevel: cfg.bevel,
      blur: cfg.blur,
      dispersion: cfg.dispersion,
      tint: 'rgba(255,255,255,0.016)'
    });
  } catch (e) {
    try { host.remove(); } catch (e2) {}
    return 'mount-failed: ' + (e && e.message);
  }

  /* ---- 跟随状态 ---- */
  let lastX = -9999, lastY = -9999, lastT = 0;
  let vx = 0, vy = 0;
  let shown = false, dimmed = false, typing = false;
  let idleTimer = 0;
  const TEXT_SEL = 'input, textarea, [contenteditable="true"], [contenteditable=""], pre, code, .cm-editor, .monaco-editor, [role="textbox"], [role="code"]';

  const enabled = () => {
    if (de.getAttribute('data-px-glass') === 'perf') return false;
    if (de.getAttribute('data-px-lens-follow') === 'off') return false;
    let v = de.style.getPropertyValue('--glass-lens-follow').trim();
    if (!v) v = getComputedStyle(de).getPropertyValue('--glass-lens-follow').trim();
    return v !== 'off';
  };

  const setOpacity = () => {
    host.style.opacity = shown ? String(dimmed ? cfg.dim : cfg.opacity) : '0';
  };
  const hide = () => {
    if (shown) { shown = false; setOpacity(); }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
  };
  const onIdle = () => {
    idleTimer = 0;
    vx = 0; vy = 0;
    if (ctrl) ctrl.light(50, 50);
    hide();
  };

  const onPointerMove = (e) => {
    if (!enabled()) { hide(); return; }
    typing = false;
    const now = e.timeStamp || performance.now();
    const dt = lastT ? Math.max(1, Math.min(64, now - lastT)) : 16;
    if (lastX > -9000) {
      const k = 1 - Math.exp(-dt / 48);
      vx += ((e.clientX - lastX) / dt * 16 - vx) * k;
      vy += ((e.clientY - lastY) / dt * 16 - vy) * k;
    }
    lastX = e.clientX; lastY = e.clientY; lastT = now;

    /* 文本密集区自动减弱：只读事件自带的 target，不做每帧命中测试 */
    let overText = false;
    try {
      const t = e.target;
      overText = !!(t && t.closest && t.closest(TEXT_SEL));
    } catch (e2) {}
    if (overText !== dimmed) { dimmed = overText; }

    if (!shown) { shown = true; }
    setOpacity();

    ctrl.position(e.clientX, e.clientY);
    /* 惯性流光：高光汇聚在运动的「后缘」，停下来就回到中心 */
    const mag = Math.hypot(vx, vy);
    if (mag > 0.4) {
      const speed = Math.min(1, mag / 26);
      ctrl.light(50 - vx / mag * speed * 32, 50 - vy / mag * speed * 32);
    } else {
      ctrl.light(50, 50);
    }

    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(onIdle, cfg.idleMs);
  };

  const onKeyDown = () => {
    if (!typing) { typing = true; hide(); }
  };
  const onVisibility = () => { if (document.visibilityState !== 'visible') hide(); };

  window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  window.addEventListener('blur', hide);
  window.addEventListener('keydown', onKeyDown, { capture: true, passive: true });
  document.addEventListener('mouseleave', hide);
  document.addEventListener('visibilitychange', onVisibility);

  const sync = () => {
    const next = readCfg();
    const sizeChanged = next.size !== cfg.size;
    cfg = next;
    if (sizeChanged) layout();
    ctrl.update({
      radius: cfg.size / 2, refraction: cfg.refraction, bevel: cfg.bevel,
      blur: cfg.blur, dispersion: cfg.dispersion
    });
    setOpacity();
    if (!enabled()) hide();
  };

  window.__pxGlassLens = {
    sync,
    stop: () => {
      window.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('blur', hide);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      document.removeEventListener('mouseleave', hide);
      document.removeEventListener('visibilitychange', onVisibility);
      if (idleTimer) clearTimeout(idleTimer);
      try { ctrl.destroy(); } catch (e) {}
      try { host.remove(); } catch (e) {}
      delete window.__pxGlassLens;
    },
    status: () => ({
      renderer: ctrl.renderer,
      shown, dimmed, typing,
      cfg,
      transform: host.style.transform,
      opacity: host.style.opacity
    })
  };
  return 'installed';
})()`;

/**
 * Liquid Glass realtime parameter tuning panel (W3).
 * Draggable floating glass panel with sliders, presets, copy CSS and persistence.
 */
const GLASS_PANEL_JS = `(() => {
  const ID = 'px-glass-panel-root';
  if (document.getElementById(ID) || window.__pxGlassPanel) return 'already-present';

  const de = document.documentElement;

  const root = document.createElement('div');
  root.id = ID;
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:fixed;bottom:16px;right:20px;z-index:2147483639;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:12px;color:#f0f3fc;user-select:none;-webkit-user-select:none;pointer-events:none;';

  // Floating trigger pill (always docked at bottom-right)
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.id = 'px-glass-panel-pill';
  pill.innerHTML = '🔮 调参面板';
  pill.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:9999px;border:1px solid rgba(255,255,255,0.32);background:rgba(18,22,46,0.78);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);color:#fff;font-size:12px;font-weight:500;cursor:pointer;pointer-events:auto;box-shadow:0 6px 20px rgba(0,0,0,0.32),inset 0 1px 0 rgba(255,255,255,0.6);transition:all 150ms ease;';
  pill.onmouseenter = () => { pill.style.transform = 'scale(1.05)'; pill.style.background = 'rgba(30,36,70,0.88)'; };
  pill.onmouseleave = () => { pill.style.transform = 'none'; pill.style.background = 'rgba(18,22,46,0.78)'; };

  // Main floating panel container
  const panel = document.createElement('div');
  panel.id = 'px-glass-panel-card';
  panel.style.cssText = 'display:none;position:fixed;bottom:16px;right:20px;z-index:2147483639;width:320px;max-height:85vh;overflow-y:auto;border-radius:20px;border:1px solid rgba(255,255,255,0.22);background:rgba(12,15,35,0.86);backdrop-filter:blur(24px) saturate(190%);-webkit-backdrop-filter:blur(24px) saturate(190%);box-shadow:0 24px 60px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.6);padding:14px 16px;flex-direction:column;gap:12px;pointer-events:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.2) transparent;';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:grab;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.12);';
  header.innerHTML = '<span style="font-weight:600;font-size:13px;letter-spacing:0.3px;display:flex;align-items:center;gap:6px;">🔮 液态玻璃调参</span>';

  const headerBtns = document.createElement('div');
  headerBtns.style.cssText = 'display:flex;gap:6px;';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = 'background:none;border:none;color:#9aa2bc;font-size:14px;cursor:pointer;padding:2px 6px;border-radius:4px;';
  closeBtn.onmouseenter = () => { closeBtn.style.color = '#fff'; closeBtn.style.background = 'rgba(255,255,255,0.1)'; };
  closeBtn.onmouseleave = () => { closeBtn.style.color = '#9aa2bc'; closeBtn.style.background = 'none'; };
  headerBtns.appendChild(closeBtn);
  header.appendChild(headerBtns);
  panel.appendChild(header);

  // Dragging support (operates on panel independently, pill remains anchored)
  let isDragging = false, dragStartX = 0, dragStartY = 0, panelStartX = 0, panelStartY = 0;
  let savedPanelLeft = null, savedPanelTop = null;

  const clampPanelPos = (left, top) => {
    const w = panel.offsetWidth || 320;
    const h = panel.offsetHeight || 420;
    const maxLeft = Math.max(10, window.innerWidth - w - 10);
    const maxTop = Math.max(10, window.innerHeight - h - 10);
    return {
      left: Math.max(10, Math.min(maxLeft, left)),
      top: Math.max(10, Math.min(maxTop, top))
    };
  };

  const applyPanelPos = (left, top) => {
    const clamped = clampPanelPos(left, top);
    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    panel.style.left = clamped.left + 'px';
    panel.style.top = clamped.top + 'px';
    savedPanelLeft = clamped.left;
    savedPanelTop = clamped.top;
  };

  header.addEventListener('pointerdown', (e) => {
    if (e.target === closeBtn) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const r = panel.getBoundingClientRect();
    panelStartX = r.left;
    panelStartY = r.top;
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });

  const onDragMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    applyPanelPos(panelStartX + dx, panelStartY + dy);
  };

  const onDragEnd = () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'grab';
    }
  };

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);

  const onWindowResize = () => {
    if (savedPanelLeft !== null && savedPanelTop !== null && panel.style.display !== 'none') {
      applyPanelPos(savedPanelLeft, savedPanelTop);
    }
  };
  window.addEventListener('resize', onWindowResize);

  // Presets row
  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  const presets = [
    {
      name: '默认深空',
      quality: 'balanced',
      lens: 'sm',
      lensStrong: 'xs',
      lensCard: 'none',
      chroma: false,
      follow: true,
      vars: {
        '--glass-blur': '14px', '--glass-sat': '185%', '--glass-bright': '1.06',
        '--glass-alpha': '0.11', '--glass-alpha-card': '0.20', '--glass-alpha-hi': '0.17',
        '--glass-rim-top': '0.72', '--glass-rim-side': '0.30', '--glass-rim-bot': '0.14',
        '--glass-sheen': '0.26', '--glass-radius': '18px', '--glass-wall-vivid': '0.88',
        '--glass-wall-speed': '48s', '--glass-grain': '0.030'
      }
    },
    {
      name: 'iOS明亮',
      quality: 'balanced',
      lens: 'sm',
      lensStrong: 'xs',
      lensCard: 'none',
      chroma: false,
      follow: true,
      vars: {
        '--glass-blur': '22px', '--glass-sat': '205%', '--glass-bright': '1.08',
        '--glass-alpha': '0.34', '--glass-alpha-card': '0.38', '--glass-alpha-hi': '0.52',
        '--glass-rim-top': '0.95', '--glass-rim-side': '0.35', '--glass-rim-bot': '0.12',
        '--glass-sheen': '0.34', '--glass-radius': '20px', '--glass-wall-vivid': '0.95',
        '--glass-wall-speed': '48s', '--glass-grain': '0.020'
      }
    },
    {
      name: '夜间高对比',
      quality: 'balanced',
      lens: 'md',
      lensStrong: 'sm',
      lensCard: 'none',
      chroma: false,
      follow: true,
      vars: {
        '--glass-blur': '16px', '--glass-sat': '195%', '--glass-bright': '1.00',
        '--glass-alpha': '0.08', '--glass-alpha-card': '0.16', '--glass-alpha-hi': '0.22',
        '--glass-rim-top': '0.88', '--glass-rim-side': '0.42', '--glass-rim-bot': '0.22',
        '--glass-sheen': '0.36', '--glass-radius': '18px', '--glass-wall-vivid': '0.92',
        '--glass-wall-speed': '40s', '--glass-grain': '0.035'
      }
    },
    {
      name: '极速省电',
      quality: 'perf',
      lens: 'none',
      lensStrong: 'none',
      lensCard: 'none',
      chroma: false,
      follow: false,
      vars: {
        '--glass-blur': '8px', '--glass-sat': '120%', '--glass-bright': '1.00',
        '--glass-alpha': '0.22', '--glass-alpha-card': '0.30', '--glass-alpha-hi': '0.35',
        '--glass-rim-top': '0.40', '--glass-rim-side': '0.20', '--glass-rim-bot': '0.10',
        '--glass-sheen': '0.10', '--glass-radius': '16px', '--glass-wall-vivid': '0.50',
        '--glass-wall-speed': '0s', '--glass-grain': '0.010'
      }
    }
  ];

  // Parameter definitions
  const PARAMS = [
    { key: '--glass-blur', label: '背景模糊', min: 4, max: 32, step: 1, unit: 'px', def: 14 },
    { key: '--glass-sat', label: '饱和增强', min: 100, max: 260, step: 5, unit: '%', def: 185 },
    { key: '--glass-bright', label: '画面增亮', min: 0.90, max: 1.25, step: 0.01, unit: '', def: 1.06 },
    { key: '--glass-alpha', label: '侧栏透明度', min: 0.03, max: 0.45, step: 0.01, unit: '', def: 0.11 },
    { key: '--glass-alpha-card', label: '卡片透明度', min: 0.05, max: 0.50, step: 0.01, unit: '', def: 0.20 },
    { key: '--glass-alpha-hi', label: '浮层透明度', min: 0.06, max: 0.60, step: 0.01, unit: '', def: 0.17 },
    { key: '--glass-rim-top', label: '顶部亮边', min: 0, max: 1, step: 0.02, unit: '', def: 0.72 },
    { key: '--glass-rim-side', label: '侧面描边', min: 0, max: 1, step: 0.02, unit: '', def: 0.30 },
    { key: '--glass-rim-bot', label: '底部阴影', min: 0, max: 1, step: 0.02, unit: '', def: 0.14 },
    { key: '--glass-sheen', label: '高光强度', min: 0, max: 0.8, step: 0.02, unit: '', def: 0.26 },
    { key: '--glass-radius', label: '圆角半径', min: 8, max: 32, step: 1, unit: 'px', def: 18 },
    { key: '--glass-wall-vivid', label: '极光浓度', min: 0.2, max: 1.0, step: 0.02, unit: '', def: 0.88 },
    { key: '--glass-wall-speed', label: '极光周期', min: 0, max: 90, step: 2, unit: 's', def: 48 },
    { key: '--glass-grain', label: '噪点颗粒', min: 0, max: 0.08, step: 0.002, unit: '', def: 0.030 }
  ];

  const controls = {};

  const getComputedVal = (key, unit) => {
    let val = de.style.getPropertyValue(key).trim() || getComputedStyle(de).getPropertyValue(key).trim();
    if (!val) return null;
    if (unit && val.endsWith(unit)) val = val.slice(0, -unit.length);
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  };

  const applyParam = (key, val, unit) => {
    const full = val + (unit || '');
    de.style.setProperty(key, full);
    if (controls[key] && controls[key].badge) {
      controls[key].badge.textContent = full;
    }
  };

  // Sliders container
  const slidersBox = document.createElement('div');
  slidersBox.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  PARAMS.forEach(param => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#a8b2d1;';

    const label = document.createElement('span');
    label.textContent = param.label;

    const cur = getComputedVal(param.key, param.unit);
    const initialVal = cur !== null ? cur : param.def;

    const badge = document.createElement('span');
    badge.style.cssText = 'font-family:monospace;color:#73eff7;font-size:11px;';
    badge.textContent = initialVal + (param.unit || '');

    top.appendChild(label);
    top.appendChild(badge);
    row.appendChild(top);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = param.min;
    input.max = param.max;
    input.step = param.step;
    input.value = initialVal;
    input.style.cssText = 'width:100%;height:4px;accent-color:#0a84ff;cursor:pointer;';

    input.oninput = () => {
      applyParam(param.key, input.value, param.unit);
    };

    controls[param.key] = { input, badge };
    row.appendChild(input);
    slidersBox.appendChild(row);
  });

  // Dropdowns & Toggles section
  const optSection = document.createElement('div');
  optSection.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.12);';

  // State flags
  let chromaOn = false;
  let followOn = de.getAttribute('data-px-lens-follow') !== 'off';

  // 1. Chrome Lens tier selector (--glass-lens)
  const lensRow = document.createElement('div');
  lensRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#a8b2d1;';
  lensRow.innerHTML = '<span>Chrome 折射档</span>';
  const lensSel = document.createElement('select');
  lensSel.style.cssText = 'background:rgba(20,24,50,0.9);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;outline:none;';
  [
    { v: 'sm', l: 'sm (默认)' },
    { v: 'xs', l: 'xs (微弱)' },
    { v: 'md', l: 'md (中等)' },
    { v: 'lg', l: 'lg (强)' },
    { v: 'xl', l: 'xl (极强)' },
    { v: 'none', l: 'none (关闭)' }
  ].forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.v;
    o.textContent = opt.l;
    lensSel.appendChild(o);
  });
  const updateLens = () => {
    const v = lensSel.value;
    if (v === 'none') {
      de.style.setProperty('--glass-lens', 'brightness(1)');
    } else {
      const prefix = chromaOn ? '--glass-lens-chroma-' : '--glass-lens-';
      de.style.setProperty('--glass-lens', 'var(' + prefix + v + ')');
    }
  };
  lensSel.onchange = updateLens;
  lensRow.appendChild(lensSel);
  optSection.appendChild(lensRow);

  // 2. Floating Lens tier selector (--glass-lens-strong)
  const strongRow = document.createElement('div');
  strongRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#a8b2d1;';
  strongRow.innerHTML = '<span>浮层折射档</span>';
  const lensStrongSel = document.createElement('select');
  lensStrongSel.style.cssText = 'background:rgba(20,24,50,0.9);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;outline:none;';
  [
    { v: 'xs', l: 'xs (默认)' },
    { v: 'sm', l: 'sm (微弱)' },
    { v: 'md', l: 'md (中等)' },
    { v: 'lg', l: 'lg (强)' },
    { v: 'xl', l: 'xl (极强)' },
    { v: 'none', l: 'none (关闭)' }
  ].forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.v;
    o.textContent = opt.l;
    lensStrongSel.appendChild(o);
  });
  const updateLensStrong = () => {
    const v = lensStrongSel.value;
    if (v === 'none') {
      de.style.setProperty('--glass-lens-strong', 'brightness(1)');
    } else {
      const prefix = chromaOn ? '--glass-lens-chroma-' : '--glass-lens-';
      de.style.setProperty('--glass-lens-strong', 'var(' + prefix + v + ')');
    }
  };
  lensStrongSel.onchange = updateLensStrong;
  strongRow.appendChild(lensStrongSel);
  optSection.appendChild(strongRow);

  // 3. Card Lens tier selector (--glass-lens-card)
  const cardRow = document.createElement('div');
  cardRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#a8b2d1;';
  cardRow.innerHTML = '<span>卡片折射档</span>';
  const lensCardSel = document.createElement('select');
  lensCardSel.style.cssText = 'background:rgba(20,24,50,0.9);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;outline:none;';
  [
    { v: 'none', l: 'none (默认关闭)' },
    { v: 'xs', l: 'xs (微弱)' },
    { v: 'sm', l: 'sm (轻度)' },
    { v: 'md', l: 'md (中等)' }
  ].forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.v;
    o.textContent = opt.l;
    lensCardSel.appendChild(o);
  });
  const updateLensCard = () => {
    const v = lensCardSel.value;
    if (v === 'none') {
      de.style.setProperty('--glass-lens-card', 'brightness(1)');
    } else {
      de.style.setProperty('--glass-lens-card', 'var(--glass-lens-' + v + ')');
    }
  };
  lensCardSel.onchange = updateLensCard;
  cardRow.appendChild(lensCardSel);
  optSection.appendChild(cardRow);

  // 4. Chroma (色散彩虹) toggle
  const chromaRow = document.createElement('div');
  chromaRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#a8b2d1;';
  chromaRow.innerHTML = '<span>边缘色散 (Chroma)</span>';
  const chromaBtn = document.createElement('button');
  chromaBtn.type = 'button';
  const updateChromaBtn = () => {
    chromaBtn.textContent = chromaOn ? '开启' : '关闭';
    chromaBtn.style.cssText = 'padding:2px 12px;border-radius:12px;font-size:11px;cursor:pointer;border:1px solid ' +
      (chromaOn ? 'rgba(255,105,180,0.6)' : 'rgba(255,255,255,0.2)') + ';background:' +
      (chromaOn ? 'rgba(255,105,180,0.25)' : 'rgba(255,255,255,0.08)') + ';color:' +
      (chromaOn ? '#ff79c6' : '#8890a8') + ';';
    updateLens();
    updateLensStrong();
  };
  updateChromaBtn();
  chromaBtn.onclick = () => {
    chromaOn = !chromaOn;
    updateChromaBtn();
  };
  chromaRow.appendChild(chromaBtn);
  optSection.appendChild(chromaRow);

  // 5. Mouse Lens toggle (--glass-lens-follow)
  const followRow = document.createElement('div');
  followRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#a8b2d1;';
  followRow.innerHTML = '<span>鼠标跟随透镜</span>';
  const followBtn = document.createElement('button');
  followBtn.type = 'button';
  const updateFollowBtn = () => {
    followBtn.textContent = followOn ? '开启' : '关闭';
    followBtn.style.cssText = 'padding:2px 12px;border-radius:12px;font-size:11px;cursor:pointer;border:1px solid ' +
      (followOn ? 'rgba(48,209,88,0.6)' : 'rgba(255,255,255,0.2)') + ';background:' +
      (followOn ? 'rgba(48,209,88,0.25)' : 'rgba(255,255,255,0.08)') + ';color:' +
      (followOn ? '#30d158' : '#8890a8') + ';';
    de.setAttribute('data-px-lens-follow', followOn ? 'on' : 'off');
    de.style.setProperty('--glass-lens-follow', followOn ? 'on' : 'off');
    if (window.__pxGlassLens && window.__pxGlassLens.sync) window.__pxGlassLens.sync();
  };
  updateFollowBtn();
  followBtn.onclick = () => {
    followOn = !followOn;
    updateFollowBtn();
  };
  followRow.appendChild(followBtn);
  optSection.appendChild(followRow);

  // 5.5 Mouse lens optics (real SDF engine: window.__pxLiquidGlass)
  const LENS_PARAMS = [
    { key: '--glass-lens-size', label: '透镜直径', min: 48, max: 240, step: 4, def: 104, unit: 'px' },
    { key: '--glass-lens-refraction', label: '折射强度', min: 0, max: 100, step: 1, def: 44, unit: '' },
    { key: '--glass-lens-bevel', label: '倒角带宽', min: 4, max: 60, step: 1, def: 16, unit: 'px' },
    { key: '--glass-lens-dispersion', label: '色散分离', min: 0, max: 5, step: 0.1, def: 1.1, unit: '' },
    { key: '--glass-lens-blur', label: '透镜微模糊', min: 0, max: 3, step: 0.05, def: 0.3, unit: 'px' },
    { key: '--glass-lens-dim', label: '文本区减弱', min: 0, max: 1, step: 0.02, def: 0.26, unit: '' }
  ];
  const lensTitle = document.createElement('div');
  lensTitle.style.cssText = 'font-size:11px;color:#73eff7;letter-spacing:0.3px;padding-top:2px;';
  lensTitle.textContent = '透镜光学（真 SDF 折射 · 中心不失真）';
  optSection.appendChild(lensTitle);
  const syncLens = () => { if (window.__pxGlassLens && window.__pxGlassLens.sync) window.__pxGlassLens.sync(); };
  LENS_PARAMS.forEach(param => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#a8b2d1;';
    const label = document.createElement('span');
    label.textContent = param.label;
    const cur = getComputedVal(param.key, '');
    const initialVal = cur !== null ? cur : param.def;
    const badge = document.createElement('span');
    badge.style.cssText = 'font-family:monospace;color:#73eff7;font-size:11px;';
    badge.textContent = initialVal + param.unit;
    top.appendChild(label);
    top.appendChild(badge);
    row.appendChild(top);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = param.min;
    input.max = param.max;
    input.step = param.step;
    input.value = initialVal;
    input.style.cssText = 'width:100%;height:4px;accent-color:#0a84ff;cursor:pointer;';
    input.oninput = () => {
      // 透镜参数一律是无单位数字（注入器 parseFloat 读取），单位只用于显示
      de.style.setProperty(param.key, input.value);
      badge.textContent = input.value + param.unit;
      syncLens();
    };
    controls[param.key] = { input, badge };
    row.appendChild(input);
    optSection.appendChild(row);
  });

  // 6. Quality tier selector (ultra / balanced / perf)
  const qualRow = document.createElement('div');
  qualRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#a8b2d1;';
  qualRow.innerHTML = '<span>画质档位</span>';
  const qualSel = document.createElement('select');
  qualSel.style.cssText = 'background:rgba(20,24,50,0.9);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;outline:none;';
  [
    { k: 'balanced', label: '均衡 (Balanced)' },
    { k: 'ultra', label: '极致 (Ultra)' },
    { k: 'perf', label: '省电 (Perf)' }
  ].forEach(q => {
    const o = document.createElement('option');
    o.value = q.k;
    o.textContent = q.label;
    qualSel.appendChild(o);
  });
  qualSel.value = de.getAttribute('data-px-glass') || 'balanced';
  qualSel.onchange = () => {
    const q = qualSel.value;
    de.setAttribute('data-px-glass', q);
    de.style.setProperty('--glass-quality', q);
  };
  qualRow.appendChild(qualSel);
  optSection.appendChild(qualRow);

  // Presets click handler
  presets.forEach(p => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = p.name;
    btn.style.cssText = 'flex:1 1 45%;padding:4px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#e2e8f8;font-size:11px;cursor:pointer;transition:all 120ms;text-align:center;';
    btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,0.18)';
    btn.onmouseleave = () => btn.style.background = 'rgba(255,255,255,0.08)';
    btn.onclick = () => {
      // 1. Sliders
      for (const [k, v] of Object.entries(p.vars)) {
        de.style.setProperty(k, v);
        const def = PARAMS.find(x => x.key === k);
        if (def && controls[k]) {
          controls[k].input.value = parseFloat(v);
          controls[k].badge.textContent = v;
        }
      }
      // 2. Quality
      qualSel.value = p.quality;
      de.setAttribute('data-px-glass', p.quality);
      de.style.setProperty('--glass-quality', p.quality);
      // 3. Lens tiers
      lensSel.value = p.lens;
      lensStrongSel.value = p.lensStrong;
      lensCardSel.value = p.lensCard;
      chromaOn = p.chroma;
      updateChromaBtn();
      updateLensCard();
      // 4. Mouse Follow
      followOn = p.follow;
      updateFollowBtn();
    };
    presetRow.appendChild(btn);
  });

  panel.appendChild(presetRow);
  panel.appendChild(slidersBox);
  panel.appendChild(optSection);

  // Full Configuration Extractor for Copy & Save
  const getAllConfig = () => {
    const data = {};
    PARAMS.forEach(p => {
      const val = de.style.getPropertyValue(p.key).trim() || (p.def + (p.unit || ''));
      data[p.key] = val;
    });
    data['--glass-lens'] = de.style.getPropertyValue('--glass-lens').trim() || 'var(--glass-lens-sm)';
    data['--glass-lens-strong'] = de.style.getPropertyValue('--glass-lens-strong').trim() || 'var(--glass-lens-xs)';
    data['--glass-lens-card'] = de.style.getPropertyValue('--glass-lens-card').trim() || 'brightness(1)';
    data['--glass-lens-follow'] = followOn ? 'on' : 'off';
    LENS_PARAMS.forEach(p => {
      const v = de.style.getPropertyValue(p.key).trim();
      if (v) data[p.key] = v;
    });
    data['--glass-quality'] = qualSel.value || 'balanced';
    return data;
  };

  // Bottom action buttons
  const actionRow = document.createElement('div');
  actionRow.style.cssText = 'display:flex;gap:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.12);';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = '📋 复制 CSS';
  copyBtn.style.cssText = 'flex:1;padding:6px;border-radius:8px;border:1px solid rgba(255,255,255,0.22);background:rgba(10,132,255,0.25);color:#64d2ff;font-size:11px;cursor:pointer;font-weight:500;transition:all 120ms;';
  copyBtn.onclick = () => {
    const data = getAllConfig();
    let css = ':root {\\n';
    for (const [k, v] of Object.entries(data)) {
      css += '  ' + k + ': ' + v + ';\\n';
    }
    css += '}\\n';
    navigator.clipboard.writeText(css).then(() => {
      const oldText = copyBtn.textContent;
      copyBtn.textContent = '✓ 已复制!';
      setTimeout(() => copyBtn.textContent = oldText, 1500);
    }).catch(() => {});
  };

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = '💾 固化配置';
  saveBtn.style.cssText = 'flex:1;padding:6px;border-radius:8px;border:1px solid rgba(255,255,255,0.22);background:rgba(48,209,88,0.22);color:#30d158;font-size:11px;cursor:pointer;font-weight:500;transition:all 120ms;';
  saveBtn.onclick = () => {
    const data = getAllConfig();
    console.log('[px-glass] ' + JSON.stringify(data));
    const oldText = saveBtn.textContent;
    saveBtn.textContent = '✓ 已固化!';
    setTimeout(() => saveBtn.textContent = oldText, 1500);
  };

  actionRow.appendChild(copyBtn);
  actionRow.appendChild(saveBtn);
  panel.appendChild(actionRow);

  root.appendChild(pill);
  root.appendChild(panel);
  (document.body || de).appendChild(root);

  // Toggle open / close
  const openPanel = () => {
    pill.style.display = 'none';
    panel.style.display = 'flex';
    if (savedPanelLeft !== null && savedPanelTop !== null) {
      applyPanelPos(savedPanelLeft, savedPanelTop);
    }
  };
  const closePanel = () => {
    panel.style.display = 'none';
    pill.style.display = 'flex';
  };

  pill.onclick = openPanel;
  closeBtn.onclick = closePanel;

  // Global toggle shortcut: Ctrl + Alt + G (and Escape to close)
  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'g' || e.key === 'G')) {
      e.preventDefault();
      if (panel.style.display === 'none') openPanel();
      else closePanel();
    } else if (e.key === 'Escape' && panel.style.display !== 'none') {
      e.preventDefault();
      closePanel();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  window.__pxGlassPanel = {
    open: openPanel,
    close: closePanel,
    stop: () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragEnd);
      window.removeEventListener('resize', onWindowResize);
      try { root.remove(); } catch (e) {}
      delete window.__pxGlassPanel;
    },
    isOpen: () => panel.style.display !== 'none'
  };
  return 'installed';
})()`;

/**
 * Liquid Glass quality profile linkage (W4).
 * Reflects --glass-quality onto html[data-px-glass="ultra|balanced|perf"].
 */
const GLASS_QUALITY_JS = `(() => {
  if (window.__pxGlassQuality) return 'already-present';

  let currentQuality = '';
  const sync = () => {
    const de = document.documentElement;
    const val = (de.style.getPropertyValue('--glass-quality') || getComputedStyle(de).getPropertyValue('--glass-quality') || 'balanced').trim();
    if (val && val !== currentQuality) {
      currentQuality = val;
      de.setAttribute('data-px-glass', val);
    }
  };

  sync();
  const obs = new MutationObserver(() => sync());
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

  window.__pxGlassQuality = {
    sync,
    stop: () => {
      obs.disconnect();
      delete window.__pxGlassQuality;
    }
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
        win.__pixelNoNativeCaption = !wantsNativeCaption() && process.platform !== "darwin";
        // insertCSS 的注入是跨导航持久的（官方为此才有 removeInsertedCSS）。
        // 在每个 dom-ready 上无条件再插一份，会让每次 Ctrl+R、每次 switch
        // 热切换（Page.reload -> dom-ready）都往同一个 webContents 叠一整份
        // ~1.7MB（双字体 base64 + 主题 CSS）：内存与样式匹配成本线性增长，
        // 旧主题的未冲突声明也一直在底下生效。先移除上一份再插入新的。
        // 串行化：连续两次 dom-ready 若交错执行 remove/insert，会漏删一份
        // 孤儿 sheet——正是这个泄漏要防的东西。若实测发现注入其实不跨导航
        // 持久，本逻辑同样成立：remove 变成无害的空操作，insert 照旧。
        let lastCssKey = null;
        let cssChain = Promise.resolve();
        const applyCss = (css) => {
            cssChain = cssChain.then(async () => {
                if (wc.isDestroyed()) {
                    return;
                }
                if (lastCssKey) {
                    try {
                        await wc.removeInsertedCSS(lastCssKey);
                    }
                    catch (e) { /* sheet already gone with the old document */ }
                    lastCssKey = null;
                }
                lastCssKey = await wc.insertCSS(css);
            }).catch((e) => console.error("[pixel-theme] insertCSS failed:", e));
        };
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
                applyCss(css);
            }
            // Pre-warm font glyph caches and GPU texture atlas immediately at startup
            wc.executeJavaScript(FONT_PREWARM_JS, true)
                .catch((e) => console.error("[pixel-theme] font prewarm failed:", e));
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
            if (wantsPixelCursor()) {
                wc.executeJavaScript(CURSOR_JS, true)
                    .then((r) => {
                        if (r !== "installed" && r !== "refreshed" && r !== "reduced-motion") {
                            console.error("[pixel-theme] cursor not installed:", r);
                        }
                    })
                    .catch((e) => console.error("[pixel-theme] cursor failed:", e));
            }
            // Draw our own caption buttons whenever the native ones are off (Windows/Linux only; macOS has native traffic lights).
            if (!wantsNativeCaption() && process.platform !== "darwin") {
                wc.executeJavaScript(WINDOW_CONTROLS_JS, true)
                    .then((r) => {
                        if (r !== "installed" && r !== "already-present") {
                            console.error("[pixel-theme] window controls not installed:", r);
                        }
                    })
                    .catch((e) => console.error("[pixel-theme] window controls failed:", e));
            }
            // Settings modal graceful exit animation controller.
            wc.executeJavaScript(SETTINGS_MODAL_JS, true)
                .then((r) => {
                    if (r !== "installed" && r !== "already-present") {
                        console.error("[pixel-theme] settings modal controller not installed:", r);
                    }
                })
                .catch((e) => console.error("[pixel-theme] settings modal controller failed:", e));
            // Inline comment hover tracker O(1) probe to eliminate 950ms mousemove reflows.
            wc.executeJavaScript(COMMENT_TRACKER_OPT_JS, true)
                .then((r) => {
                    if (r !== "installed" && r !== "already-present") {
                        console.error("[pixel-theme] comment tracker opt not installed:", r);
                    }
                })
                .catch((e) => console.error("[pixel-theme] comment tracker opt failed:", e));
            // Liquid Glass widgets (Phase 2). Only injected if theme declares --px-glass: on.
            if (isGlassTheme()) {
                wc.executeJavaScript(GLASS_QUALITY_JS, true)
                    .catch((e) => console.error("[pixel-theme] glass quality failed:", e));
                wc.executeJavaScript(GLASS_SHEEN_JS, true)
                    .catch((e) => console.error("[pixel-theme] glass sheen failed:", e));
                // 光学引擎必须先装载：透镜与调参面板都依赖 window.__pxLiquidGlass。
                wc.executeJavaScript(LIQUID_GLASS_CORE_JS, true)
                    .then((r) => {
                        if (r !== "installed" && r !== "already-present") {
                            console.error("[pixel-theme] liquid glass core not installed:", r);
                        }
                        return wc.executeJavaScript(GLASS_LENS_JS, true);
                    })
                    .then((r) => {
                        if (r && r !== "installed" && r !== "already-present") {
                            console.error("[pixel-theme] glass lens not installed:", r);
                        }
                        return wc.executeJavaScript(GLASS_PANEL_JS, true);
                    })
                    .catch((e) => console.error("[pixel-theme] glass widgets failed:", e));
            }
        });
        syncTitleBarOverlay(win);

        // Intercept glass tuning panel persistence message: [px-glass] { ... }
        wc.on("console-message", (...args) => {
            const msg = args.find((a) => typeof a === "string" && a.startsWith("[px-glass] "));
            if (!msg) return;
            try {
                const jsonStr = msg.slice(11);
                const params = JSON.parse(jsonStr);
                const lines = [":root {"];
                for (const [k, v] of Object.entries(params)) {
                    lines.push("  " + k + ": " + v + " !important;");
                }
                lines.push("}\n");
                const userContent = lines.join("\n");
                const themeDir = getThemeDir();
                const userCssPath = path.join(themeDir, "glass-user.css");
                fs.writeFileSync(userCssPath, userContent, "utf-8");
                const newCss = buildCss();
                if (newCss) applyCss(newCss);
                wc.executeJavaScript("window.__pxGlassQuality && window.__pxGlassQuality.sync()", true).catch(() => {});
                wc.executeJavaScript("window.__pxGlassLens && window.__pxGlassLens.sync && window.__pxGlassLens.sync()", true).catch(() => {});
            } catch (e) {
                console.error("[pixel-theme] failed to handle [px-glass] message:", e);
            }
        });

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
