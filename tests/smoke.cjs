// 암기방식 개편 실앱 jsdom 스모크 테스트 — 실행: node real/tests/smoke.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
const dataJs = read('js/data.js');
const tcccDataJs = read('js/tccc-data.js');
const iconsJs = read('js/icons.js');
const appJs = read('js/app.js');

// 1. 정적 토큰 · 다크모드 · 이모지 · 공식 데이터 무결성 검증
for (const oldHex of ['#4255ff', '#2f3fe0', '#0a092d']) {
  assert(!css.toLowerCase().includes(oldHex), `Old color ${oldHex} found in css/style.css`);
  assert(!html.toLowerCase().includes(oldHex), `Old color ${oldHex} found in index.html`);
  assert(!appJs.toLowerCase().includes(oldHex), `Old color ${oldHex} found in js/app.js`);
}
assert(css.includes('#3182f6'), 'Toss primary #3182f6 missing in css/style.css');
assert(css.includes('@media (prefers-color-scheme: dark)'), 'Dark mode media query missing in css/style.css');
assert(css.includes('[data-theme="dark"]'), 'Dark mode attribute tokens missing in css/style.css');

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{23F0}-\u{23FA}\u{2600}-\u{26FF}\u{2702}-\u{270F}\u{2728}-\u{27BF}\u{2B50}-\u{2B55}]/u;
for (const [name, src] of [['index.html', html], ['css/style.css', css], ['js/app.js', appJs], ['js/icons.js', iconsJs]]) {
  const m = src.match(EMOJI_RE);
  assert(!m, `Emoji/legacy symbol "${m && m[0]}" found in ${name}`);
}

// 데모 시드 흔적 없음 (실앱에는 샘플 데이터·시드 버튼이 없다)
for (const [name, src] of [['index.html', html], ['css/style.css', css], ['js/app.js', appJs]]) {
  assert(!src.includes('DEMO_SEED') && !src.includes('demo-seed') && !src.includes('home-seed') && !src.includes('seed-fill') && !src.includes('seed-clear'), `Demo seed trace found in ${name}`);
}
assert(!fs.existsSync(path.join(ROOT, 'js/demo-seed.js')), 'js/demo-seed.js must not exist in the real app');

const createDom = (preStorage = null) => {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only' });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.error || e.message));
  window.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = () => {};
  window.confirm = () => true;
  window.prompt = () => '';
  Object.defineProperty(window.navigator, 'vibrate', { value: () => {}, configurable: true });
  if (preStorage) {
    Object.entries(preStorage).forEach(([k, v]) => window.localStorage.setItem(k, v));
  }
  window.eval(dataJs);
  window.eval(tcccDataJs);
  window.eval(iconsJs);
  window.eval(appJs);
  const nav = (hash) => {
    window.location.hash = hash;
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  };
  return { dom, window, document: window.document, errors, nav };
};

// 2. 기존 hsb.v1 기록 마이그레이션 검증 (박스 단계 · 최고점 · 메모 · 히스토리 · TCCC 커스텀 대사 보존)
{
  const oldV1 = {
    cards: {
      'mopp-0': { box: 3, seen: 4 },
      'alarm-14': { box: 2, seen: 2 },
      'kd1-25': { box: 1, seen: 1 }
    },
    wrong: { 'kd1-25': true },
    mind: {
      'A-1': { best: 91, tries: 3, last: 91 },
      'B-1': { best: 72, tries: 1, last: 72 }
    },
    memo: { 'A-1': '기존 각오 메모 보존 확인' },
    history: [{ type: '백지 쓰기', title: 'A-1', score: 91, at: '11. 1. 10:00' }],
    tccc: { best: 84, last: 84, tries: 2 },
    tcccSay: { 1: '커스텀 대사 보존' }
  };
  const { window, document, errors, nav } = createDom({ 'hsb.v1': JSON.stringify(oldV1) });
  const migrated = JSON.parse(window.localStorage.getItem('hsb.v1'));
  assert.strictEqual(migrated.v, 2, 'Migrated store should be upgraded to v2');
  assert.strictEqual(migrated.cards['mopp-0'].box, 3, 'Legacy card box should be preserved');
  assert.strictEqual(migrated.mind['A-1'].best, 91, 'Legacy mind best score should be preserved');
  assert.strictEqual(migrated.memo['A-1'], '기존 각오 메모 보존 확인', 'Legacy memo should be preserved');
  assert.strictEqual(migrated.history.length, 1, 'Legacy history should be preserved');
  assert.strictEqual(migrated.tccc.best, 84, 'Legacy TCCC best score should be preserved');
  assert.strictEqual(migrated.tcccSay['1'], '커스텀 대사 보존', 'Legacy custom TCCC say should be preserved');
  assert(migrated.srs['cbrn:mopp-0'] && migrated.srs['cbrn:mopp-0'].box >= 4, 'Box 3 card should migrate to SRS box >= 4');
  assert(migrated.srs['cbrn:kd1-25'] && migrated.srs['cbrn:kd1-25'].box === 1, 'Wrong card should migrate to SRS box 1');
  assert(migrated.srs['mind-s:A-1:0-0'] && migrated.srs['mind-s:A-1:0-0'].box >= 3, 'High mind score should migrate sentence SRS');
  nav('#home');
  assert(document.querySelector('.due-cta'), 'Home should render due CTA after migration');
  nav('#stats');
  assert(document.body.textContent.includes('84%'), 'Stats should preserve TCCC best 84%');
  assert.strictEqual(errors.length, 0, `Migration run errors: ${errors.join('; ')}`);
}

// 3. 메인 부트스트랩 + 데이터 기준 + 아이콘 40종 + 전체 라우트 검증
// v2 저장 상태(복습 기한 도래 항목 포함)를 직접 넣어 데모 시드 없이 검증한다
const now = Date.now();
const DAY = 86400000;
const v2Store = {
  v: 2,
  cards: {},
  srs: {
    'cbrn:mopp-0': { box: 1, ease: 2.1, ivl: 0, reps: 0, lapses: 1, due: now - 1000, last: now - DAY, lastGrade: 1 },
    'cbrn:alarm-14': { box: 2, ease: 2.35, ivl: 1, reps: 1, lapses: 0, due: now - 1000, last: now - DAY, lastGrade: 2 },
    'cbrn:kd1-25': { box: 1, ease: 2.1, ivl: 0, reps: 0, lapses: 1, due: now - 1000, last: now - DAY, lastGrade: 1 },
    'mind-s:A-1:0-0': { box: 2, ease: 2.3, ivl: 1, reps: 1, lapses: 0, due: now - 1000, last: now - DAY, lastGrade: 2 },
    'tccc:1': { box: 1, ease: 2.1, ivl: 0, reps: 0, lapses: 1, due: now - 1000, last: now - DAY, lastGrade: 1 }
  },
  tcccSteps: {},
  mind: { 'A-1': { best: 80, tries: 1, last: 80 } },
  memo: {},
  history: [],
  wrong: { 'kd1-25': true },
  tccc: { best: 70, last: 70, tries: 1 },
  tcccSay: {},
  streak: { count: 1, lastDay: '', todayDone: 0, todayDay: '' }
};
const { window, document, errors, nav } = createDom({ 'hsb.v1': JSON.stringify(v2Store) });

// 공식 데이터 수량 및 배점 검증
assert.strictEqual(window.CBRN_CATS.length, 7, 'Expected 7 CBRN categories');
assert.strictEqual(window.CBRN.length, 65, 'Expected 65 CBRN items');
assert.strictEqual(window.MIND.length, 4, 'Expected 4 MIND questions');
assert.strictEqual(window.TCCC_GROUPS.length, 12, 'Expected 12 TCCC groups');
assert.strictEqual(window.TCCC.length, 41, 'Expected 41 TCCC steps');
const totalPts = window.TCCC_GROUPS.reduce((a, g) => a + g.pts, 0);
assert.strictEqual(totalPts, 50, `Expected TCCC total points 50, got ${totalPts}`);

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

// 4. 빈 상태 홈 검증 (시드 버튼 없음)
{
  const empty = createDom();
  empty.nav('#home');
  assert.strictEqual(empty.document.querySelector('.home-hero-score').textContent.trim(), '0%', 'Default home overall score should be 0%');
  assert(!empty.document.querySelector('#home-seed'), 'Real app must not render demo sample button');
  assert.strictEqual(empty.document.querySelectorAll('.rings-grid .ring').length, 3, 'Home should render 3 rings');
  assert.strictEqual(empty.document.querySelectorAll('.cards3 .big-card').length, 3, 'Home should render 3 learning cards');
  assert.strictEqual(empty.document.querySelectorAll('.quick .qk').length, 6, 'Home should render 6 quick actions');
  empty.nav('#stats');
  assert(!empty.document.querySelector('.demo-seed-card'), 'Real app must not render demo seed card');
  assert.strictEqual(empty.errors.length, 0, `Empty-state run errors: ${empty.errors.join('; ')}`);
}

// 홈에 오늘 복습 큐 개수 표시 확인
nav('#home');
const duePill = document.querySelector('.due-cta-pill');
assert(duePill && /\d+개 대기/.test(duePill.textContent), `Home due CTA should display due count, got: ${duePill && duePill.textContent}`);
checkIconsRendered('home');

// #review (오늘의 맞춤 복습 큐)
nav('#review');
assert(document.querySelector('.exam-card'), 'Review session card missing');
document.querySelector('#rev-hint-btn').click();
assert(!document.querySelector('#rev-hint').hidden, 'Review hint should reveal on click');
document.querySelector('#reveal').click();
assert.strictEqual(document.querySelectorAll('.srs4 .srs-btn').length, 4, 'Review should render 4 SRS rating buttons');
document.querySelector('.srs-btn[data-g="1"]').click(); // 다시(세션 내 재인출)
document.querySelector('#reveal').click();
document.querySelector('.srs-btn[data-g="3"]').click(); // 알맞음
checkIconsRendered('review');

// #cbrn
nav('#cbrn');
assert.strictEqual(document.querySelectorAll('.list .row').length, 7, 'CBRN should render 7 unit rows');
checkIconsRendered('cbrn');

// #matrix (MOPP 7행 · 경보 4행 · 즉답 5문항)
nav('#matrix/mopp');
assert.strictEqual(document.querySelectorAll('table.mopp tbody tr').length, 7, 'Matrix MOPP table should have 7 rows');
document.querySelector('.mcell-btn').click();
document.querySelector('#m-grade').click();
assert(document.querySelector('#m-res .feedback'), 'Matrix MOPP feedback missing after grade');
nav('#matrix/alarm');
assert.strictEqual(document.querySelectorAll('table.mopp tbody tr').length, 4, 'Matrix Alarm table should have 4 rows');
document.querySelector('.mcell-btn').click();
document.querySelector('#a-grade').click();
assert(document.querySelector('#a-res .feedback'), 'Matrix Alarm feedback missing after grade');
nav('#matrix/drill');
assert.strictEqual(document.querySelectorAll('.opt').length, 4, 'Matrix drill should render 4 options');
checkIconsRendered('matrix');

// #list (MOPP 표 7행 + 경보표 4행 + 65문항)
nav('#list');
const tables = document.querySelectorAll('table.mopp');
assert.strictEqual(tables.length, 2, 'List should render MOPP and alarm tables');
assert.strictEqual(tables[0].querySelectorAll('tbody tr').length, 7, 'MOPP table should have 7 rows');
assert.strictEqual(tables[1].querySelectorAll('tbody tr').length, 4, 'Alarm table should have 4 rows');
assert.strictEqual(document.querySelectorAll('.qa').length, 65, 'List should render all 65 CBRN Q&A items');
checkIconsRendered('list');

// #flash/all (4단계 SRS 평가)
nav('#flash/all');
assert(document.querySelector('#fc'), 'Flashcard element missing');
document.querySelector('#fc').click();
assert(document.querySelector('#fc').classList.contains('flip'), 'Flashcard should flip on click');
assert.strictEqual(document.querySelectorAll('.srs4 .srs-btn').length, 4, 'Flashcard should show 4 SRS rating buttons');
document.querySelector('.srs-btn[data-g="3"]').click();
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

// #wrong
nav('#wrong');
assert(document.querySelectorAll('.qa').length > 0, 'Wrong route should list weak items');
checkIconsRendered('wrong');

// #mind
nav('#mind');
assert.strictEqual(document.querySelectorAll('.list .row').length, 4, 'Mind should render 4 questions (A-1, A-2, B-1, B-2)');
checkIconsRendered('mind');

// #mq/A-1
nav('#mq/A-1');
assert(document.querySelector('.rec-card'), 'MQ recommended next step card missing');
assert.strictEqual(document.querySelectorAll('.step').length, 10, 'MQ should render 10 step links across 4 phases');
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

// #sentence/B-1 (약점 문장 집중 인출)
nav('#sentence/B-1');
assert(document.querySelector('#st-inp'), 'Sentence recall textarea missing');
document.querySelector('#st-check').click();
assert(document.querySelector('#st-res .exam-a'), 'Sentence model answer missing after check');
assert.strictEqual(document.querySelectorAll('.srs4 .srs-btn').length, 4, 'Sentence should render 4 SRS rating buttons');
document.querySelector('.srs-btn[data-g="3"]').click();
checkIconsRendered('sentence');

// #write/A-1/hint & #write/A-1 & #mind-mock
for (const r of ['#write/A-1/hint', '#write/A-1', '#mind-mock']) {
  nav(r);
  assert(document.querySelectorAll('.sheet').length > 0, `Write ${r} sheets missing`);
  document.querySelector('#grade').click();
  assert(document.querySelector('#wres .score-break.three'), `Write ${r} 3-way breakdown missing`);
}
checkIconsRendered('write-and-mock');

// #tccc
nav('#tccc');
assert(document.querySelector('.sit-card'), 'TCCC situation card missing');
assert.strictEqual(document.querySelectorAll('.mode-grid .mode').length, 7, 'TCCC should render 7 modes');
checkIconsRendered('tccc');

// #tpart (구간별 · 핵심시간 · 취약 단계 훈련)
for (const p of ['critical', 'cuf', 'tfc', 'tacevac', 'weak']) {
  nav(`#tpart/${p}`);
  assert(document.querySelector('.run-card'), `TCCC part ${p} card missing`);
}
nav('#tpart/critical');
document.querySelector('#tp-rev').click();
assert.strictEqual(document.querySelectorAll('.srs4 .srs-btn').length, 4, 'TCCC part should render 4 SRS buttons');
document.querySelector('.srs-btn[data-g="3"]').click();
checkIconsRendered('tpart');

// #tsteps
nav('#tsteps');
assert.strictEqual(document.querySelectorAll('.tstep').length, 41, 'TCCC steps should render 41 items');
assert.strictEqual(document.querySelectorAll('.panel.steps-g').length, 12, 'TCCC steps should render 12 groups');
checkIconsRendered('tsteps');

// #trun (설정 + 라이브 + 페이스 + 결과)
nav('#trun');
assert(document.querySelector('#start'), 'TCCC run start button missing');
document.querySelector('#start').click();
assert.strictEqual(document.body.dataset.route, 'trun-live', 'Should enter trun-live');
assert(document.querySelector('#tm'), 'Live timer missing');
assert(document.querySelector('#pace'), 'Live pace indicator missing');
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

// #stats (7일 스케줄 + 5단계 스택 + 시드 없음)
nav('#stats');
assert.strictEqual(document.querySelectorAll('.forecast .fcol').length, 7, 'Stats should render 7-day forecast');
assert(document.querySelector('.stack'), 'Stats stack bar missing');
assert.strictEqual(document.querySelectorAll('.hbar').length, 5, 'Stats should render 4 mind bars + 1 tccc bar');
assert(!document.querySelector('#seed-fill') && !document.querySelector('#seed-clear'), 'Real app must not render seed buttons');
assert(!document.querySelector('.demo-seed-card'), 'Real app must not render demo seed card');
checkIconsRendered('stats');

assert.strictEqual(errors.length, 0, `Runtime errors occurred: ${errors.join('; ')}`);
console.log('ALL REAL SMOKE CHECKS PASSED:', {
  icons: iconNames.length,
  cbrnUnits: 7,
  cbrnItems: 65,
  mindQuestions: 4,
  tcccGroups: 12,
  tcccSteps: 41,
  tcccTotalPts: totalPts
});
