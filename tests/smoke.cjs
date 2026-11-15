// 실앱 jsdom 스모크 테스트 — 실행: node real/tests/smoke.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const REAL = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REAL, rel), 'utf8');

assert(!fs.existsSync(path.join(REAL, 'js/demo-seed.js')), 'demo-seed.js must not exist in real app');

const html = read('index.html');
const css = read('css/style.css');
const dataJs = read('js/data.js');
const tcccDataJs = read('js/tccc-data.js');
const iconsJs = read('js/icons.js');
const appJs = read('js/app.js');

// 1. 정적 토큰 · 다크모드 · 이모지 · 데모 흔적 검증
for (const oldHex of ['#4255ff', '#2f3fe0', '#0a092d']) {
  assert(!css.toLowerCase().includes(oldHex), `Old color ${oldHex} found in css/style.css`);
  assert(!html.toLowerCase().includes(oldHex), `Old color ${oldHex} found in index.html`);
  assert(!appJs.toLowerCase().includes(oldHex), `Old color ${oldHex} found in js/app.js`);
}
for (const demoToken of ['DEMO_SEED', 'demo-seed', '샘플 채우기', '샘플 지우기']) {
  assert(!html.includes(demoToken), `Demo token "${demoToken}" found in index.html`);
  assert(!css.includes(demoToken), `Demo token "${demoToken}" found in css/style.css`);
  assert(!appJs.includes(demoToken), `Demo token "${demoToken}" found in js/app.js`);
  assert(!iconsJs.includes(demoToken), `Demo token "${demoToken}" found in js/icons.js`);
}
assert(css.includes('#3182f6'), 'Toss primary #3182f6 missing in css/style.css');
assert(css.includes('@media (prefers-color-scheme: dark)'), 'Dark mode media query missing in css/style.css');
assert(css.includes('[data-theme="dark"]'), 'Dark mode attribute tokens missing in css/style.css');

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{23F0}-\u{23FA}\u{2600}-\u{26FF}\u{2702}-\u{270F}\u{2728}-\u{27BF}\u{2B50}-\u{2B55}]/u;
for (const [name, src] of [['index.html', html], ['css/style.css', css], ['js/app.js', appJs], ['js/icons.js', iconsJs]]) {
  const m = src.match(EMOJI_RE);
  assert(!m, `Emoji/legacy symbol "${m && m[0]}" found in ${name}`);
}

// 2. jsdom 부트스트랩
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only' });
const { window } = dom;
const { document } = window;
const errors = [];
window.addEventListener('error', (e) => errors.push(e.error || e.message));
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};
window.confirm = () => true;
window.prompt = () => '';
Object.defineProperty(window.navigator, 'vibrate', { value: () => {}, configurable: true });

window.eval(dataJs);
window.eval(tcccDataJs);
window.eval(iconsJs);
window.eval(appJs);

assert(!window.DEMO_SEED, 'window.DEMO_SEED must not exist in real app');

const nav = (hash) => {
  window.location.hash = hash;
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
};

// 3. 아이콘팩 40종 전수 검증
const iconNames = Object.keys(window.ICONS || {});
assert.strictEqual(iconNames.length, 40, `Expected 40 icons in ICONS, got ${iconNames.length}`);
for (const name of iconNames) {
  const reg = window.icon(name, { weight: 'regular', size: 24 });
  const bold = window.icon(name, { weight: 'bold', size: 24 });
  assert(reg.includes('viewBox="0 0 24 24"') && reg.includes('stroke="currentColor"') && reg.includes('stroke-width="1.5"'), `Regular spec failed for icon: ${name}`);
  assert(bold.includes('stroke-width="2.25"'), `Bold spec failed for icon: ${name}`);
}

const checkIconsRendered = (routeName) => {
  const used = [...document.querySelectorAll('[data-icon]')].map((el) => el.getAttribute('data-icon'));
  for (const u of used) {
    assert(window.ICONS[u], `Unknown icon "${u}" rendered on route ${routeName}`);
  }
};

// 4. 실앱 기본 상태 검증 (기록 비어 있음 → 홈 링 0% · 빈 상태 카드 표시)
nav('#home');
assert.strictEqual(document.querySelector('.home-hero-score').textContent.trim(), '0%', 'Default home overall score should be 0%');
const homeRings = [...document.querySelectorAll('.rings-grid .ring')];
assert.strictEqual(homeRings.length, 3, 'Home should render 3 rings');
for (const r of homeRings) {
  assert.strictEqual(r.querySelector('b').textContent.trim(), '0%', 'Default home ring should be 0%');
}
assert(!document.querySelector('#home-seed'), 'Home should not render demo seed button');
assert.strictEqual(document.querySelectorAll('.cards3 .big-card').length, 3, 'Home should render 3 learning cards');
assert.strictEqual(document.querySelectorAll('.quick .qk').length, 6, 'Home should render 6 quick actions');
checkIconsRendered('home');

nav('#wrong');
assert(document.querySelector('.empty'), 'Wrong route should render empty state card when no wrong items');
checkIconsRendered('wrong-empty');

nav('#stats');
assert(document.querySelector('.stack'), 'Stats stack bar missing');
assert.strictEqual(document.querySelectorAll('.hbar').length, 5, 'Stats should render 4 mind bars + 1 tccc bar');
const emptyHistoryCard = document.querySelector('.toss-card');
assert(emptyHistoryCard && emptyHistoryCard.textContent.includes('아직 기록이 없어요.'), 'Stats should render empty history card by default');
assert(!document.querySelector('#seed-fill') && !document.querySelector('#seed-clear') && !document.querySelector('.demo-seed-card'), 'Stats must not render demo seed UI');
checkIconsRendered('stats-empty');

// 5. 전체 라우트 렌더링 검증
// #cbrn
nav('#cbrn');
assert.strictEqual(document.querySelectorAll('.list .row').length, 7, 'CBRN should render 7 unit rows');
checkIconsRendered('cbrn');

// #list (MOPP 표 + 경보표 + 65문항)
nav('#list');
const tables = document.querySelectorAll('table.mopp');
assert.strictEqual(tables.length, 2, 'List should render MOPP and alarm tables');
assert.strictEqual(tables[0].querySelectorAll('tbody tr').length, 7, 'MOPP table should have 7 rows');
assert.strictEqual(tables[1].querySelectorAll('tbody tr').length, 4, 'Alarm table should have 4 rows');
assert.strictEqual(document.querySelectorAll('.qa').length, 65, 'List should render all 65 CBRN Q&A items');
checkIconsRendered('list');

// #flash/all
nav('#flash/all');
assert(document.querySelector('#fc'), 'Flashcard element missing');
document.querySelector('#fc').click();
assert(document.querySelector('#fc').classList.contains('flip'), 'Flashcard should flip on click');
document.querySelector('#yes').click();
checkIconsRendered('flash');

// #quiz/all
nav('#quiz/all');
assert.strictEqual(document.querySelectorAll('.opt').length, 4, 'Quiz should render 4 options');
document.querySelector('.opt').click();
assert(document.querySelector('#next-wrap .feedback'), 'Quiz feedback missing after answer');
checkIconsRendered('quiz');

// #exam
nav('#exam');
assert(document.querySelector('.exam-card'), 'Exam card missing');
document.querySelector('#reveal').click();
assert.strictEqual(document.querySelectorAll('.sbtn').length, 3, 'Exam should render 3 self-grade buttons');
checkIconsRendered('exam');

// #mind
nav('#mind');
assert.strictEqual(document.querySelectorAll('.list .row').length, 4, 'Mind should render 4 questions (A-1, A-2, B-1, B-2)');
checkIconsRendered('mind');

// #mq/A-1
nav('#mq/A-1');
assert.strictEqual(document.querySelectorAll('.step').length, 9, 'MQ should render 9 steps');
assert(document.querySelector('#memo'), 'MQ memo textarea missing');
checkIconsRendered('mq');

// #flow/A-1
nav('#flow/A-1');
assert.strictEqual(document.querySelectorAll('.node').length, 7, 'Flow A-1 should render 7 timeline nodes');
document.querySelector('.node-open').click();
checkIconsRendered('flow');

// #read/A-1
nav('#read/A-1');
assert(document.querySelector('.doc'), 'Read doc missing');
checkIconsRendered('read');

// #sorder/A-1
nav('#sorder/A-1');
assert(document.querySelectorAll('.ord-pool .ord').length > 0, 'Sorder pool missing');
checkIconsRendered('sorder');

// #initial/A-1
nav('#initial/A-1');
assert(document.querySelectorAll('.iw').length > 0, 'Initial words missing');
checkIconsRendered('initial');

// #cloze/A-1/1~3
for (const lv of [1, 2, 3]) {
  nav(`#cloze/A-1/${lv}`);
  assert(document.querySelectorAll('.blank').length > 0, `Cloze Lv${lv} blanks missing`);
  document.querySelector('#check').click();
  assert(document.querySelector('#cres .feedback'), `Cloze Lv${lv} result missing`);
}
checkIconsRendered('cloze');

// #write/A-1/hint & #write/A-1
for (const r of ['#write/A-1/hint', '#write/A-1']) {
  nav(r);
  assert(document.querySelectorAll('.sheet').length > 0, `Write ${r} sheets missing`);
  document.querySelector('#grade').click();
  assert(document.querySelector('#wres .score-break.three'), `Write ${r} 3-way breakdown missing`);
}
checkIconsRendered('write');

// #tccc
nav('#tccc');
assert(document.querySelector('.sit-card'), 'TCCC situation card missing');
assert.strictEqual(document.querySelectorAll('.mode-grid .mode').length, 6, 'TCCC should render 6 modes');
checkIconsRendered('tccc');

// #tsteps
nav('#tsteps');
assert.strictEqual(document.querySelectorAll('.tstep').length, 41, 'TCCC steps should render 41 items');
assert.strictEqual(document.querySelectorAll('.panel.steps-g').length, 12, 'TCCC steps should render 12 groups');
checkIconsRendered('tsteps');

// #trun (설정 + 라이브 + 결과)
nav('#trun');
assert(document.querySelector('#start'), 'TCCC run start button missing');
document.querySelector('#start').click();
assert.strictEqual(document.body.dataset.route, 'trun-live', 'Should enter trun-live');
assert(document.querySelector('#tm'), 'Live timer missing');
document.querySelector('#reveal').click();
assert.strictEqual(document.querySelectorAll('.sbtn').length, 3, 'Live self-grade buttons missing');
document.querySelector('#stop').click();
assert.strictEqual(document.querySelectorAll('.score-t tbody tr').length, 13, 'Result score table should have 12 groups + 1 total row');
checkIconsRendered('trun');

// #torder
nav('#torder');
assert.strictEqual(document.querySelectorAll('.ord-pool .ord').length, 10, 'TCCC flow order should render 10 groups');
checkIconsRendered('torder');

// #tsheet
nav('#tsheet');
assert.strictEqual(document.querySelectorAll('.sheet-row').length, 41, 'TCCC sheet should render 41 criteria');
assert.strictEqual(document.querySelectorAll('main .panel').length, 13, 'TCCC sheet should render grade panel + 12 evaluation panels');
checkIconsRendered('tsheet');

// #stats (학습 기록 누적 후)
nav('#stats');
assert(document.querySelectorAll('.list .row').length > 0, 'Stats should render recent history rows after activity');
checkIconsRendered('stats');

assert.strictEqual(errors.length, 0, `Runtime errors occurred: ${errors.join('; ')}`);
console.log('ALL REAL SMOKE CHECKS PASSED:', {
  icons: iconNames.length,
  routesChecked: 21,
  cbrnUnits: 7,
  cbrnItems: 65,
  mindQuestions: 4,
  tcccGroups: 12,
  tcccSteps: 41
});
