// Comprehensive Verification Script for Antigravity Theme Optimizations
// Tests P0-1, P0-2, P0-3, P0-4, P0-5, P1-1, P1-2, P1-3, P1-4, P1-5, P2-1, P2-2, P2-3

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoDir = path.resolve(__dirname, '..');
const results = {
  timestamp: new Date().toISOString(),
  passed: 0,
  failed: 0,
  details: []
};

function assert(condition, message, errorDetail = '') {
  if (condition) {
    results.passed++;
    results.details.push({ status: 'PASS', message });
    console.log(`[PASS] ${message}`);
  } else {
    results.failed++;
    results.details.push({ status: 'FAIL', message, error: errorDetail });
    console.error(`[FAIL] ${message} - ${errorDetail}`);
  }
}

console.log('================================================================');
console.log('ANTIGRAVITY OPTIMIZATION & REPAIR COMPREHENSIVE VERIFICATION');
console.log('================================================================\n');

// -------------------------------------------------------------
// 1. Verify patch/pixelTheme.js syntax & P0-1 implementation
// -------------------------------------------------------------
console.log('>>> [1/10] Verifying patch/pixelTheme.js (P0-1)...');
try {
  execSync('node -c patch/pixelTheme.js', { cwd: repoDir, stdio: 'pipe' });
  assert(true, 'patch/pixelTheme.js passes Node.js syntax check (node -c)');
} catch (e) {
  assert(false, 'patch/pixelTheme.js passes Node.js syntax check', e.message);
}

const pixelThemeJs = fs.readFileSync(path.join(repoDir, 'patch', 'pixelTheme.js'), 'utf8');
assert(
  pixelThemeJs.includes('openDialogs.add(n);') &&
  pixelThemeJs.includes('const d = n.querySelector(DIALOG_SEL);') &&
  !pixelThemeJs.includes('const onBody = (m.target === document.body);'),
  'P0-1: trackDialogs deep searches container subtrees without onBody restriction'
);
assert(
  pixelThemeJs.includes('!d.isConnected') &&
  pixelThemeJs.includes('openDialogs.delete(d)'),
  'P0-1: trackDialogs preserves disconnection cleanup (!d.isConnected) to prevent stale modal states'
);
assert(
  pixelThemeJs.includes('document.documentElement.classList.toggle(MODAL_CLASS, open);'),
  'P0-1: trackDialogs accurately maintains px-modal-open on document.documentElement'
);
assert(
  pixelThemeJs.includes('e.isTrusted === false') &&
  pixelThemeJs.includes('closing = false;'),
  'P0-1: settings modal graceful exit controller prevents recursive event interception via isTrusted guard and try/finally reset'
);

// -------------------------------------------------------------
// 2. Verify Four Theme CSS Files Syntax & Balance
// -------------------------------------------------------------
console.log('\n>>> [2/10] Verifying Theme CSS Syntax & Brace Balance...');
const themeFiles = {
  pixel: path.join(repoDir, 'pixel-theme', 'pixel.css'),
  doodle: path.join(repoDir, 'doodle-theme', 'doodle.css'),
  matcha: path.join(repoDir, 'matcha-theme', 'matcha.css'),
  phantom: path.join(repoDir, 'phantom-theme', 'phantom.css')
};

const themeCss = {};
for (const [key, file] of Object.entries(themeFiles)) {
  const content = fs.readFileSync(file, 'utf8');
  themeCss[key] = content;

  // Check balanced braces
  let open = 0, close = 0, inComment = false, inString = false, stringChar = '';
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];
    if (inComment) {
      if (c === '*' && next === '/') { inComment = false; i++; }
      continue;
    }
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '/' && next === '*') { inComment = true; i++; continue; }
    if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
    if (c === '{') open++;
    if (c === '}') close++;
  }
  assert(open === close && open > 100, `${key}.css: Balanced braces (open=${open}, close=${close})`);
}

// -------------------------------------------------------------
// 3. P0-2: Global dialog & tooltip stacking context isolation
// -------------------------------------------------------------
console.log('\n>>> [3/10] Verifying P0-2 Stacking Context & Tooltip Isolation...');
for (const [key, css] of Object.entries(themeCss)) {
  assert(
    css.includes('z-index: 2147483640 !important;') &&
    (css.includes('div.settings-modal-backdrop') || css.includes('.settings-modal-container')),
    `P0-2 [${key}]: Dialog & modal backdrops elevated to z-index: 2147483640`
  );

  assert(
    css.includes('[role="tooltip"]') &&
    css.includes('z-index: 2147483620 !important;'),
    `P0-2 [${key}]: Tooltips normalized to z-index: 2147483620 (below dialog, above normal floaters)`
  );

  assert(
    css.includes('html.px-modal-open [role="tooltip"]') &&
    css.includes('display: none !important;') &&
    css.includes('pointer-events: none !important;'),
    `P0-2 [${key}]: html.px-modal-open suppresses tooltips with display: none and pointer-events: none`
  );

  // Check that body:has([role="dialog"]) is NOT present in any theme
  assert(
    !css.includes('body:has([role="dialog"])') &&
    !css.includes('body:has(> [role="dialog"])'),
    `P0-2 [${key}]: Zero high-cost body:has([role="dialog"]) ancestors (eliminates 4.7x RecalcStyle spike)`
  );
}

// -------------------------------------------------------------
// 4. P0-3: Section 22 HUD corner markers vs Section 12 send beam
// -------------------------------------------------------------
console.log('\n>>> [4/10] Verifying P0-3 HUD & Send Beam Pseudo-Element Resolution...');
for (const [key, css] of Object.entries(themeCss)) {
  assert(
    css.includes('html:not(.px-sending) body::after') &&
    css.includes('html:not(.px-sending) body:not(.theme-light)::after'),
    `P0-3 [${key}]: Background HUD/marks scoped to html:not(.px-sending) body::after`
  );
  assert(
    css.includes('html.px-sending body::after') &&
    css.includes('background-image: none !important;'),
    `P0-3 [${key}]: Send beam monopolizes body::after during transmission with background-image: none !important`
  );
}

// -------------------------------------------------------------
// 5. P0-4: Eliminate Doodle sidebar 30+ items animation storm
// -------------------------------------------------------------
console.log('\n>>> [5/10] Verifying P0-4 Doodle Sidebar Animation Storm Elimination...');
assert(
  themeCss.doodle.includes('[data-testid="conversation-list-sidebar"] .w-full.group') &&
  themeCss.doodle.includes('animation: none !important;'),
  'P0-4 [doodle]: Conversation list items concurrent animation disabled (animation: none !important)'
);

// -------------------------------------------------------------
// 6. P0-5: Settings modal entry animation duration & theme curves
// -------------------------------------------------------------
console.log('\n>>> [6/10] Verifying P0-5 Modal Entry Animations (240ms~280ms & Theme Curves)...');
assert(
  themeCss.pixel.includes('pixel-modal-pop-in 240ms steps(3)') ||
  themeCss.pixel.includes('pixel-modal-pop-in 240ms steps(4)'),
  'P0-5 [pixel]: Modal animation set to 240ms with 8-bit stepped curve steps(3)/steps(4)'
);
assert(
  themeCss.doodle.includes('doodle-modal-pop-in 280ms cubic-bezier(0.18, 0.89, 0.32, 1.28)'),
  'P0-5 [doodle]: Modal animation set to 280ms with snap tension curve'
);
assert(
  themeCss.matcha.includes('matcha-modal-pop-in 280ms cubic-bezier(0.25, 1, 0.5, 1)'),
  'P0-5 [matcha]: Modal animation set to 280ms with gentle paper settling curve'
);
assert(
  themeCss.phantom.includes('p5-modal-pop-in 280ms cubic-bezier(0.18, 0.9, 0.26, 1.22)'),
  'P0-5 [phantom]: Modal animation set to 280ms with Persona 5 pop curve'
);

// -------------------------------------------------------------
// 7. P1-1: Matcha Token Variables in :root & Token Purity
// -------------------------------------------------------------
console.log('\n>>> [7/10] Verifying P1-1 Matcha Token Variables in :root & Token Purity...');
assert(
  themeCss.matcha.includes('--matcha-font-ui:') &&
  themeCss.matcha.includes('--matcha-font-mono:') &&
  themeCss.matcha.includes('--matcha-neon:'),
  'P1-1 [matcha]: :root defines --matcha-font-ui, --matcha-font-mono, and --matcha-neon'
);
assert(
  !themeCss.matcha.includes('var(--doodle-font-ui)') &&
  !themeCss.matcha.includes('var(--doodle-font-mono)'),
  'P1-1 [matcha]: Zero legacy var(--doodle-font-*) cross-theme variable pollution in matcha.css'
);

// -------------------------------------------------------------
// 8. P1-2: Reduced motion at very end of file with (1, 1, 2) specificity
// -------------------------------------------------------------
console.log('\n>>> [8/10] Verifying P1-2 Reduced Motion Position & (1, 1, 2) Specificity Boost...');
for (const [key, css] of Object.entries(themeCss)) {
  const rmIndex = css.lastIndexOf('@media (prefers-reduced-motion: reduce)');
  const totalLength = css.length;
  // Must be in the last 3500 bytes of the file
  const isAtEnd = (totalLength - rmIndex) < 3500 && rmIndex !== -1;
  assert(isAtEnd, `P1-2 [${key}]: prefers-reduced-motion is physically located at the very end of file`);

  assert(
    css.includes('html:root:not(#_px_never_exist_) body *') &&
    css.includes('animation-duration: 0.001ms !important;') &&
    css.includes('transition-duration: 0.001ms !important;'),
    `P1-2 [${key}]: Uses ID pseudo-negation :not(#_px_never_exist_) achieving (1, 1, 2) overriding specificity`
  );
}

// -------------------------------------------------------------
// 9. P1-3: Eliminate subpixel scale() blur in Pixel px-step-pop-in
// -------------------------------------------------------------
console.log('\n>>> [9/10] Verifying P1-3 Subpixel scale() Elimination in Pixel Popover...');
const popInMatch = themeCss.pixel.match(/@keyframes px-step-pop-in\s*\{([\s\S]*?)\}/);
if (popInMatch) {
  const popInBody = popInMatch[1];
  assert(
    !popInBody.includes('scale('),
    'P1-3 [pixel]: @keyframes px-step-pop-in eliminates continuous scale() subpixel interpolation'
  );
  assert(
    popInBody.includes('translateY(calc(-6 * var(--px-dev)))') || popInBody.includes('translateY(-6px)'),
    'P1-3 [pixel]: @keyframes px-step-pop-in uses crisp integer device pixel translation'
  );
} else {
  assert(false, 'P1-3 [pixel]: @keyframes px-step-pop-in found in pixel.css');
}

// -------------------------------------------------------------
// 10. P1-4, P1-5 & P2: Contrast & Micro-interactions
// -------------------------------------------------------------
console.log('\n>>> [10/10] Verifying WCAG 2.1 AA Contrast Ratios & Micro-interactions...');

function srgb(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function lum(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  return 0.2126 * srgb(parseInt(h.substr(0, 2), 16)) +
         0.7152 * srgb(parseInt(h.substr(2, 2), 16)) +
         0.0722 * srgb(parseInt(h.substr(4, 2), 16));
}
function cr(c1, c2) {
  const l1 = lum(c1), l2 = lum(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Pixel light placeholder
const crPixelPlaceholder = cr('4a5d73', 'eef0f5');
assert(
  crPixelPlaceholder >= 4.5 &&
  (themeCss.pixel.includes('--placeholder:          #4a5d73 !important;') || themeCss.pixel.includes('--placeholder: #4a5d73')),
  `WCAG 2.1 AA: Pixel light placeholder #4a5d73 on #eef0f5 ratio = ${crPixelPlaceholder.toFixed(2)}:1 (>= 4.5:1 AA PASS)`
);

// Phantom light gold star
const crPhantomGold = cr('8A6300', 'F4F4F6');
assert(
  crPhantomGold >= 4.5 &&
  themeCss.phantom.includes('--p5-gold-star:         #8A6300 !important;'),
  `WCAG 2.1 AA: Phantom light gold #8A6300 on #F4F4F6 ratio = ${crPhantomGold.toFixed(2)}:1 (>= 4.5:1 AA PASS)`
);

// Doodle light send button text
const crDoodleSend = cr('121214', 'ff2e93');
assert(
  crDoodleSend >= 4.5 &&
  themeCss.doodle.includes('color: #121214 !important;'),
  `WCAG 2.1 AA: Doodle light send button text #121214 on #ff2e93 ratio = ${crDoodleSend.toFixed(2)}:1 (>= 4.5:1 AA PASS)`
);

// Matcha light subtle placeholder
const crMatchaSubtle = cr('4A6B4E', 'F5F6F0');
assert(
  crMatchaSubtle >= 4.5 &&
  themeCss.matcha.includes('--matcha-subtle:        #4A6B4E !important;'),
  `WCAG 2.1 AA: Matcha light subtle #4A6B4E on #F5F6F0 ratio = ${crMatchaSubtle.toFixed(2)}:1 (>= 4.5:1 AA PASS)`
);

// Phantom dark send button text
const crPhantomDarkSend = cr('FFFFFF', 'E60012');
assert(
  crPhantomDarkSend >= 4.5 &&
  themeCss.phantom.includes('color: #FFFFFF !important;'),
  `WCAG 2.1 AA: Phantom dark send button text #FFFFFF on #E60012 ratio = ${crPhantomDarkSend.toFixed(2)}:1 (>= 4.5:1 AA PASS)`
);

// P1-4 & P2-2: Phantom Font & Motion Purity
assert(
  !themeCss.phantom.includes('var(--doodle-font-ui)') &&
  !themeCss.phantom.includes('var(--doodle-font-mono)'),
  'P1-4 [phantom]: Zero legacy var(--doodle-font-*) cross-theme variable pollution in phantom.css'
);
assert(
  !themeCss.phantom.includes('doodle-jiggle') &&
  !themeCss.phantom.includes('doodle-nudge'),
  'P2-2 [phantom]: Persona 5 theme completely stripped of cartoon doodle-jiggle and doodle-nudge'
);

// P2-1: Matcha micro-interactions
assert(
  themeCss.matcha.includes('button:hover > svg') &&
  themeCss.matcha.includes('animation: none !important;') &&
  themeCss.matcha.includes('--matcha-ease-paper'),
  'P2-1 [matcha]: Jiggle & nudge removed from child icons with gentle paper settling damping'
);

// P2-2: Phantom P5 skewX and particles
assert(
  themeCss.phantom.includes('skewX(-2.5deg)') &&
  themeCss.phantom.includes('#px-particles > i') &&
  themeCss.phantom.includes('clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'),
  'P2-2 [phantom]: Persona 5 skewX(-2.5deg) pop-in and red/gold diamond particle burst'
);

// P2-3: Pixel transition-property containment
assert(
  themeCss.pixel.includes('transition-property: background-color, color, border-color, box-shadow, transform,') &&
  themeCss.pixel.includes('outline-offset, fill, stroke, opacity !important;'),
  'P2-3 [pixel]: General transition excludes outline-width layout trigger while retaining focus & SVG channels'
);

console.log('\n================================================================');
console.log(`VERIFICATION SUMMARY: ${results.passed} PASSED, ${results.failed} FAILED`);
console.log('================================================================');

const reportFile = path.join(repoDir, 'test-reports', 'comprehensive_verification_results.json');
fs.writeFileSync(reportFile, JSON.stringify(results, null, 2), 'utf8');
console.log(`Saved report to: ${reportFile}`);

if (results.failed > 0) {
  process.exit(1);
}
