// Gate 2 Adversarial Verification Script
// Challenger Recheck 2

const fs = require('fs');
const path = require('path');

console.log('=====================================================');
console.log('CHALLENGER RECHECK 2: EMPIRICAL ADVERSARIAL TEST SUITE');
console.log('=====================================================\n');

// ----------------------------------------------------
// VECTOR 1: WCAG 2.1 Contrast Ratio: #8A6300 on #F4F4F6
// ----------------------------------------------------
console.log('>>> VECTOR 1: WCAG 2.1 Luminance & Contrast Math Verification');

function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

function srgbLinWCAG21(val) {
  const c = val / 255;
  // WCAG 2.1 specification: if RsRGB <= 0.03928 (often stated as 0.04045 in IEC / CSS spec)
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function srgbLinExact03928(val) {
  const c = val / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relLum(rgb, fn = srgbLinWCAG21) {
  const rLin = fn(rgb[0]);
  const gLin = fn(rgb[1]);
  const bLin = fn(rgb[2]);
  return {
    rLin, gLin, bLin,
    L: 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin
  };
}

function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const rgbGold = hexToRgb('8A6300'); // [138, 99, 0]
const rgbBg = hexToRgb('F4F4F6');   // [244, 244, 246]

console.log('Color #8A6300 RGB:', rgbGold);
console.log('Color #F4F4F6 RGB:', rgbBg);

// Test under standard threshold (0.04045)
const lumGoldStandard = relLum(rgbGold, srgbLinWCAG21);
const lumBgStandard = relLum(rgbBg, srgbLinWCAG21);
const crStandard = contrastRatio(lumGoldStandard.L, lumBgStandard.L);

console.log('\nUnder threshold 0.04045 (W3C/IEC):');
console.log(`  L(#8A6300) = ${lumGoldStandard.L.toFixed(8)}`);
console.log(`    rLin = ${lumGoldStandard.rLin.toFixed(8)}, gLin = ${lumGoldStandard.gLin.toFixed(8)}, bLin = ${lumGoldStandard.bLin.toFixed(8)}`);
console.log(`  L(#F4F4F6) = ${lumBgStandard.L.toFixed(8)}`);
console.log(`    rLin = ${lumBgStandard.rLin.toFixed(8)}, gLin = ${lumBgStandard.gLin.toFixed(8)}, bLin = ${lumBgStandard.bLin.toFixed(8)}`);
console.log(`  Exact Contrast Ratio = ${crStandard.toFixed(6)}:1`);
console.log(`  Formatted (2 decimal places) = ${crStandard.toFixed(2)}:1`);
console.log(`  Report claimed: 4.95:1`);
console.log(`  Report matches exact calculation? ${crStandard.toFixed(2) === '4.95'}`);
console.log(`  WCAG 2.1 Level AA requirement (normal text >= 4.5:1): ${crStandard >= 4.5 ? 'PASS' : 'FAIL'}`);

// Test under threshold 0.03928
const lumGold03928 = relLum(rgbGold, srgbLinExact03928);
const lumBg03928 = relLum(rgbBg, srgbLinExact03928);
const cr03928 = contrastRatio(lumGold03928.L, lumBg03928.L);
console.log('\nUnder threshold 0.03928 (WCAG text):');
console.log(`  L(#8A6300) = ${lumGold03928.L.toFixed(8)}`);
console.log(`  L(#F4F4F6) = ${lumBg03928.L.toFixed(8)}`);
console.log(`  Exact Contrast Ratio = ${cr03928.toFixed(6)}:1`);
console.log(`  Formatted (2 decimal places) = ${cr03928.toFixed(2)}:1`);
console.log(`  WCAG 2.1 Level AA requirement (>= 4.5:1): ${cr03928 >= 4.5 ? 'PASS' : 'FAIL'}`);

// Comparison with #B8860B (the rejected candidate) and original #FFD500
const rgbOld = hexToRgb('FFD500');
const rgbB8 = hexToRgb('B8860B');
const crOld = contrastRatio(relLum(rgbOld).L, lumBgStandard.L);
const crB8 = contrastRatio(relLum(rgbB8).L, lumBgStandard.L);
console.log('\nComparative check:');
console.log(`  Original #FFD500 on #F4F4F6: ${crOld.toFixed(2)}:1 (Claimed 1.29:1: ${crOld.toFixed(2) === '1.29' ? 'PASS' : 'FAIL'})`);
console.log(`  Draft #B8860B on #F4F4F6:    ${crB8.toFixed(2)}:1 (Claimed 2.96:1: ${crB8.toFixed(2) === '2.96' ? 'PASS' : 'FAIL'})`);

// ----------------------------------------------------
// VECTOR 2: W3C CSS Cascading Level 4 Specificity Analysis
// ----------------------------------------------------
console.log('\n>>> VECTOR 2: W3C CSS Cascading Level 4 Specificity Analysis');

/*
W3C CSS Cascading and Inheritance Level 4 & Selectors Level 4:
Specificity is represented as a tuple: (A, B, C)
Where:
A = ID selectors (e.g. #id)
B = Class selectors (.class), attribute selectors ([attr]), pseudo-classes (:root, :not, :hover etc., excluding :is, :where, :not itself which contribute their inner argument specificity)
C = Type selectors (tag names like html, body, div, button), pseudo-elements (::before, ::after)
Universal selector * contributes (0, 0, 0).
Combinators (space, >, +, ~) do not contribute to specificity.

Let's calculate the exact specificity of all relevant selectors:
*/

function calculateSpecificity(selector) {
  // Simple AST/lexical breakdown based on Selectors Level 4
  // We will test exact rules
  // Rule 1: prefers-reduced-motion selectors proposed:
  // - html:root body *
  // - html:root body *::before
  // - html:root body *::after
  // - html:root *
  // - html:root *::before
  // - html:root *::after
  // - #px-cursor
}

const selectorsToTest = [
  { name: 'Reduced-motion proposed 1: html:root body *', sel: 'html:root body *', a: 0, b: 1, c: 2, breakdown: 'pseudo-class(:root)=1 [B], type(html,body)=2 [C], * = 0' },
  { name: 'Reduced-motion proposed 2: html:root body *::before', sel: 'html:root body *::before', a: 0, b: 1, c: 3, breakdown: 'pseudo-class(:root)=1 [B], type(html,body)=2 + pseudo-elem(::before)=1 -> 3 [C]' },
  { name: 'Reduced-motion proposed 3: html:root body *::after', sel: 'html:root body *::after', a: 0, b: 1, c: 3, breakdown: 'pseudo-class(:root)=1 [B], type(html,body)=2 + pseudo-elem(::after)=1 -> 3 [C]' },
  { name: 'Reduced-motion proposed 4: html:root *', sel: 'html:root *', a: 0, b: 1, c: 1, breakdown: 'pseudo-class(:root)=1 [B], type(html)=1 [C]' },
  { name: 'Reduced-motion proposed 5: html:root *::before', sel: 'html:root *::before', a: 0, b: 1, c: 2, breakdown: 'pseudo-class(:root)=1 [B], type(html)+pseudo-elem=2 [C]' },
  { name: 'Reduced-motion proposed 6: html:root *::after', sel: 'html:root *::after', a: 0, b: 1, c: 2, breakdown: 'pseudo-class(:root)=1 [B], type(html)+pseudo-elem=2 [C]' },
  { name: 'Reduced-motion proposed 7: #px-cursor', sel: '#px-cursor', a: 1, b: 0, c: 0, breakdown: 'ID(#px-cursor)=1 [A]' },
  
  // Prior author rules mentioned in report or themes:
  { name: 'Author rule 1: html body [role="dialog"].animate-modalScaleIn', sel: 'html body [role="dialog"].animate-modalScaleIn', a: 0, b: 2, c: 2, breakdown: 'type(html, body)=2 [C], attr([role=dialog])=1 [B], class(.animate-modalScaleIn)=1 [B] => (0, 2, 2)' },
  { name: 'Author rule 2: html[data-theme="pixel"] [role="dialog"].animate-modalScaleIn', sel: 'html[data-theme="pixel"] [role="dialog"].animate-modalScaleIn', a: 0, b: 3, c: 1, breakdown: 'type(html)=1 [C], attr([data-theme=pixel])=1 [B], attr([role=dialog])=1 [B], class(.animate-modalScaleIn)=1 [B] => (0, 3, 1)' },
  { name: 'Author rule 3: body.theme-pixel .settings-modal-container', sel: 'body.theme-pixel .settings-modal-container', a: 0, b: 2, c: 1, breakdown: 'type(body)=1 [C], class(.theme-pixel)=1 [B], class(.settings-modal-container)=1 [B] => (0, 2, 1)' },
  { name: 'Author rule 4: [data-testid="conversation-list-sidebar"] .w-full.group', sel: '[data-testid="conversation-list-sidebar"] .w-full.group', a: 0, b: 3, c: 0, breakdown: 'attr=1 [B], classes=2 [B] => (0, 3, 0)' }
];

console.table(selectorsToTest.map(s => ({
  Name: s.name,
  Selector: s.sel,
  Specificity: `(${s.a}, ${s.b}, ${s.c})`,
  Breakdown: s.breakdown
})));

// ----------------------------------------------------
// VECTOR 3: Check for :has() selectors in proposed CSS
// ----------------------------------------------------
console.log('\n>>> VECTOR 3: Exhaustive Scan for :has() in the Report Proposals');

const reportPath = path.resolve('test-reports/插件注入性能与视觉动效综合评估及调优方案.md');
const reportContent = fs.readFileSync(reportPath, 'utf8');

// Find all code blocks in the report
const codeBlockRegex = /```(?:css|javascript|js)?([\s\S]*?)```/g;
let match;
let codeBlockIndex = 0;
let hasMatchesInCode = [];
let hasMatchesInText = [];

while ((match = codeBlockRegex.exec(reportContent)) !== null) {
  codeBlockIndex++;
  const code = match[1];
  if (code.includes(':has(') || code.includes(':has')) {
    // Check if it's in a BEFORE block (illustrating the bug) or in an AFTER/PROPOSED block
    const lines = code.split('\n');
    lines.forEach((line, lineIdx) => {
      if (line.includes(':has')) {
        hasMatchesInCode.push({
          block: codeBlockIndex,
          line: line.trim(),
          context: lines.slice(Math.max(0, lineIdx - 2), Math.min(lines.length, lineIdx + 3)).join('\n')
        });
      }
    });
  }
}

// Also check overall text mentions of :has
const reportLines = reportContent.split('\n');
reportLines.forEach((line, idx) => {
  if (line.includes(':has')) {
    hasMatchesInText.push({ lineNum: idx + 1, content: line });
  }
});

console.log(`Total occurrences of ':has' in entire report: ${hasMatchesInText.length}`);
hasMatchesInText.forEach(m => {
  console.log(`  Line ${m.lineNum}: ${m.content}`);
});

console.log(`\nOccurrences inside code blocks: ${hasMatchesInCode.length}`);
hasMatchesInCode.forEach(m => {
  console.log(`  Block ${m.block}: ${m.line}`);
});

console.log('\nAdversarial verification check complete.');
