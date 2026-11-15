(() => {
  'use strict';

  // ---------- 상수 · 저장소 · 마이그레이션 ----------
  const KEY = 'hsb.v1';
  const DAY = 86400000;
  const MIN10 = 600000;
  const dayKey = (ms = Date.now()) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const defaults = () => ({
    v: 2,
    cards: {},
    srs: {},
    tcccSteps: {},
    mind: {},
    memo: {},
    history: [],
    wrong: {},
    tccc: {},
    tcccSay: {},
    streak: { count: 0, lastDay: '', todayDone: 0, todayDay: '' }
  });

  const migrateStore = (raw) => {
    const d = Object.assign(defaults(), raw || {});
    if (!d.srs || typeof d.srs !== 'object') d.srs = {};
    if (!d.tcccSteps || typeof d.tcccSteps !== 'object') d.tcccSteps = {};
    if (!d.streak || typeof d.streak !== 'object') d.streak = defaults().streak;

    const now = Date.now();
    let changed = !raw || !raw.v || raw.v < 2;

    // 1. 기존 화생방/TCCC 핵심카드(cards, wrong) → 통합 SRS 이관
    Object.entries(d.cards || {}).forEach(([cardId, rec]) => {
      const sk = (cardId.startsWith('tccc-') ? 'tcard:' : 'cbrn:') + cardId;
      if (d.srs[sk]) return;
      changed = true;
      const box = (rec && rec.box) || 0;
      const isWrong = !!(d.wrong && d.wrong[cardId]);
      if (isWrong || box === 1) {
        d.srs[sk] = { box: 1, ease: 2.1, ivl: 0, reps: 0, lapses: 1, due: now, last: now - DAY, lastGrade: 1 };
      } else if (box >= 3) {
        d.srs[sk] = { box: 4, ease: 2.5, ivl: 4, reps: 3, lapses: 0, due: now + 4 * DAY, last: now, lastGrade: 3 };
      } else if (box === 2) {
        d.srs[sk] = { box: 2, ease: 2.35, ivl: 1, reps: 1, lapses: 0, due: now, last: now - DAY, lastGrade: 2 };
      } else if (rec && rec.seen > 0) {
        d.srs[sk] = { box: 1, ease: 2.3, ivl: 0, reps: 0, lapses: 0, due: now, last: now, lastGrade: 2 };
      }
    });

    // wrong에만 있고 cards에 없던 항목 보전
    Object.keys(d.wrong || {}).forEach((cardId) => {
      const sk = (cardId.startsWith('tccc-') ? 'tcard:' : 'cbrn:') + cardId;
      if (!d.srs[sk]) {
        changed = true;
        d.srs[sk] = { box: 1, ease: 2.0, ivl: 0, reps: 0, lapses: 1, due: now, last: now - DAY, lastGrade: 1 };
      }
    });

    // 2. 기존 정신전력 최고점(mind) → 문장별 초기 SRS 이관 (기존 best/tries/last 보존)
    if (Array.isArray(window.MIND)) {
      window.MIND.forEach((q) => {
        const m = d.mind && d.mind[q.id];
        if (!m || (!m.tries && !m.best)) return;
        q.sections.forEach((sec, si) => {
          sec.items.forEach((_, k) => {
            const sk = `mind-s:${q.id}:${si}-${k}`;
            if (d.srs[sk]) return;
            changed = true;
            if ((m.best || 0) >= 85) {
              d.srs[sk] = { box: 4, ease: 2.5, ivl: 4, reps: 3, lapses: 0, due: now + 3 * DAY, last: now, lastGrade: 3 };
            } else if ((m.best || 0) >= 65) {
              d.srs[sk] = { box: 2, ease: 2.3, ivl: 1, reps: 1, lapses: 0, due: now, last: now - DAY, lastGrade: 2 };
            } else {
              d.srs[sk] = { box: 1, ease: 2.1, ivl: 0, reps: 0, lapses: 1, due: now, last: now - DAY, lastGrade: 1 };
            }
          });
        });
      });
    }

    d.v = 2;
    return { store: d, changed };
  };

  const loadStore = () => {
    try {
      const rawText = localStorage.getItem(KEY);
      if (!rawText) return defaults();
      const raw = JSON.parse(rawText);
      const { store, changed } = migrateStore(raw);
      if (changed) {
        try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
      }
      return store;
    } catch (e) {
      return defaults();
    }
  };

  let S = loadStore();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const reloadStore = () => { S = loadStore(); };

  // ---------- 유틸 ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ic = (name, opts) => (typeof window.icon === 'function' ? window.icon(name, opts) : '');
  const CAT_ICON = {
    mopp: 'shield-check',
    alarm: 'siren',
    kd1: 'flask',
    kmark: 'syringe',
    nbefore: 'shield',
    nduring: 'warning',
    nafter: 'radiation'
  };
  const catIcon = (id) => CAT_ICON[id] || 'shield-check';

  const norm = (s) => String(s).normalize('NFKC').toLowerCase().replace(/[ㆍᆞ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  const bigrams = (s) => { const out = new Map(); for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); out.set(b, (out.get(b) || 0) + 1); } return out; };
  const dice = (a, b) => {
    a = norm(a); b = norm(b);
    if (!a.length || !b.length) return 0;
    if (a === b) return 1;
    const A = bigrams(a), B = bigrams(b);
    let inter = 0, na = 0, nb = 0;
    A.forEach((v, k) => { na += v; inter += Math.min(v, B.get(k) || 0); });
    B.forEach((v) => { nb += v; });
    return na + nb ? (2 * inter) / (na + nb) : 0;
  };
  const lev = (a, b) => {
    a = [...a]; b = [...b];
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  };
  const fuzzyFind = (pat, text) => {
    const P = [...pat], T = [...text], m = P.length;
    let prev = Array.from({ length: m + 1 }, (_, i) => i), best = m, pos = -1;
    for (let j = 0; j < T.length; j++) {
      const cur = [0];
      for (let i = 1; i <= m; i++) cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (P[i - 1] === T[j] ? 0 : 1));
      if (cur[m] < best) { best = cur[m]; pos = j; }
      prev = cur;
    }
    return { d: best, pos };
  };
  const typoTol = (len) => (len <= 2 ? 0 : len <= 6 ? 1 : 2);
  const JOSA = /^(은|는|이|가|을|를|의|에|에게|에서|로|으로|와|과|도|만|이다|다|하고|하여|하는|한|이자|으로서|로서|으로써|로써)$/;
  const judge = (input, answer) => {
    const u = norm(input), a = norm(answer);
    if (!u) return 'ng';
    if (u === a) return 'exact';
    if (u.length >= 2 && a.startsWith(u) && JOSA.test(a.slice(u.length))) return 'near';
    if (a.length >= 2 && u.startsWith(a) && JOSA.test(u.slice(a.length))) return 'near';
    if (lev(u, a) <= typoTol(a.length)) return 'near';
    return 'ng';
  };
  const findKw = (kw, text) => {
    const k = norm(kw), t = norm(text);
    if (!k) return { v: 1, exact: true, pos: -1 };
    if (!t) return { v: 0, pos: -1 };
    const i = t.indexOf(k);
    if (i >= 0) return { v: 1, exact: true, pos: i + k.length - 1 };
    const { d, pos } = fuzzyFind(k, t);
    if (d <= typoTol(k.length)) return { v: 1, exact: false, pos };
    if (d <= Math.ceil(k.length * 0.4)) return { v: 0.5, pos };
    return { v: 0, pos: -1 };
  };
  const recall = (kw, text) => findKw(kw, text).v;
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const chosung = (s) => [...s].map((c) => { const code = c.charCodeAt(0) - 0xac00; return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : c; }).join('');
  const fmtTime = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const today = () => new Date().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const grade = (sc) => (sc >= 90 ? 'S' : sc >= 80 ? 'A' : sc >= 70 ? 'B' : sc >= 60 ? 'C' : 'D');
  const vibrate = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  const bumpStreak = (count = 1) => {
    const td = dayKey();
    const yd = dayKey(Date.now() - DAY);
    const st = S.streak || { count: 0, lastDay: '', todayDone: 0, todayDay: '' };
    if (st.todayDay !== td) { st.todayDay = td; st.todayDone = 0; }
    st.todayDone += count;
    if (st.lastDay !== td) {
      st.count = st.lastDay === yd ? st.count + 1 : 1;
      st.lastDay = td;
    }
    S.streak = st;
  };
  const todayDoneCount = () => {
    const st = S.streak || {};
    return st.todayDay === dayKey() ? (st.todayDone || 0) : 0;
  };
  const logHistory = (type, title, score) => {
    S.history.unshift({ type, title, score, at: today() });
    S.history = S.history.slice(0, 100);
    bumpStreak(0);
    save();
  };

  // 문장 → 토큰 [{kw:bool, s}]
  const parse = (str) => {
    const out = [];
    const re = /\{([^}]+)\}/g;
    let last = 0, m;
    while ((m = re.exec(str))) {
      if (m.index > last) out.push({ kw: false, s: str.slice(last, m.index) });
      out.push({ kw: true, s: m[1] });
      last = re.lastIndex;
    }
    if (last < str.length) out.push({ kw: false, s: str.slice(last) });
    return out;
  };
  const plain = (str) => str.replace(/[{}]/g, '');
  const keywordsOf = (q) => q.sections.flatMap((sec) => sec.items.flatMap((it) => parse(it).filter((t) => t.kw).map((t) => t.s)));
  const NUM = '①②③④⑤⑥⑦⑧⑨';

  // 카드 ID 초기화
  CBRN.forEach((c, i) => { c.id = c.cat + '-' + i; });
  TCCC_CARDS.forEach((c, i) => { c.id = 'tccc-' + i; });
  const srcFor = (cat) => (cat === 'tccc' ? TCCC_CARDS : CBRN);
  const srsPrefixFor = (cat) => (cat === 'tccc' ? 'tcard:' : 'cbrn:');
  const backFor = (cat) => (cat === 'tccc' ? '#tccc' : '#cbrn');
  const catName = (id) => (id === 'tccc' ? 'TCCC 핵심' : (CBRN_CATS.find((c) => c.id === id) || {}).name || id);

  // ---------- 통합 간격반복(SRS) & 망각곡선 엔진 ----------
  const srsGet = (key) => S.srs[key] || { box: 0, ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: 0, last: 0, lastGrade: 0 };

  const srsCompute = (rec, g, now = Date.now()) => {
    const cur = rec || { box: 0, ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: 0, last: 0, lastGrade: 0 };
    let ease = cur.ease || 2.5;
    let reps = cur.reps || 0;
    let lapses = cur.lapses || 0;
    let ivl = cur.ivl || 0;
    let box = cur.box || 0;
    let due = now;

    if (g === 1) {
      lapses += 1;
      reps = 0;
      ivl = 0;
      box = 1;
      ease = Math.max(1.3, +(ease - 0.2).toFixed(2));
      due = now + MIN10;
    } else if (g === 2) {
      reps += 1;
      ivl = ivl <= 0 ? 1 : Math.max(1, Math.round(ivl * 1.2));
      box = Math.min(3, Math.max(2, box || 2));
      ease = Math.max(1.3, +(ease - 0.12).toFixed(2));
      due = now + ivl * DAY;
    } else if (g === 3) {
      reps += 1;
      ivl = reps === 1 ? 1 : reps === 2 ? 3 : Math.max(4, Math.round(ivl * ease));
      box = ivl >= 14 ? 5 : ivl >= 6 ? 4 : ivl >= 3 ? 3 : 2;
      due = now + ivl * DAY;
    } else {
      reps += 1;
      ivl = reps === 1 ? 4 : reps === 2 ? 7 : Math.max(7, Math.round(ivl * ease * 1.3));
      box = ivl >= 14 ? 5 : 4;
      ease = Math.min(2.8, +(ease + 0.1).toFixed(2));
      due = now + ivl * DAY;
    }
    return { box, ease, ivl, reps, lapses, due, last: now, lastGrade: g };
  };

  const srsLabel = (rec, g) => {
    const next = srsCompute(rec, g, Date.now());
    return next.ivl === 0 ? '10분 후' : `${next.ivl}일 후`;
  };

  const srsRetain = (rec, now = Date.now()) => {
    if (!rec || !rec.last || rec.box === 0) return null;
    if (rec.ivl <= 0) return Math.max(25, 55 - Math.min(30, (rec.lapses || 0) * 10));
    const elapsedDays = Math.max(0, (now - rec.last) / DAY);
    const r = Math.round(100 * Math.exp(-0.35 * elapsedDays / Math.max(1, rec.ivl)));
    return Math.max(10, Math.min(100, r));
  };

  const srsRate = (key, g) => {
    const next = srsCompute(srsGet(key), g, Date.now());
    S.srs[key] = next;
    // 레거시 cards / wrong 동기화
    if (key.startsWith('cbrn:') || key.startsWith('tcard:')) {
      const cardId = key.split(':').slice(1).join(':');
      const prev = S.cards[cardId] || { box: 0, seen: 0 };
      const legBox = next.box >= 4 ? 3 : next.box >= 2 ? 2 : 1;
      S.cards[cardId] = { box: legBox, seen: (prev.seen || 0) + 1 };
      if (key.startsWith('cbrn:')) {
        if (g === 1) S.wrong[cardId] = true;
        else if (g >= 3 && next.box >= 3) delete S.wrong[cardId];
      }
    }
    if (key.startsWith('tccc:')) {
      const n = +key.slice(5);
      const prev = S.tcccSteps[n] || { last: 0, tries: 0, misses: 0 };
      const val = g === 1 ? 0 : g === 2 ? 0.5 : 1;
      S.tcccSteps[n] = { last: val, tries: (prev.tries || 0) + 1, misses: (prev.misses || 0) + (g === 1 ? 1 : 0), at: Date.now() };
    }
    bumpStreak(1);
    save();
    return next;
  };

  const srsIsDue = (key, now = Date.now()) => {
    const r = S.srs[key];
    return !!(r && r.box > 0 && r.due <= now);
  };

  const cardBox5 = (cat, cardId) => {
    const sk = srsPrefixFor(cat) + cardId;
    if (S.srs[sk]) return S.srs[sk].box || 0;
    const leg = S.cards[cardId];
    return leg ? (leg.box >= 3 ? 4 : leg.box) : 0;
  };

  const cbrnMastery = (cards = CBRN) => {
    const done = cards.filter((c) => cardBox5(c.cat, c.id) >= 3).length;
    return Math.round((done / cards.length) * 100);
  };

  const poolFor = (cat) => {
    if (cat === 'all') return CBRN;
    if (cat === 'tccc') return TCCC_CARDS;
    if (cat === 'wrong') return CBRN.filter((c) => S.wrong[c.id] || (S.srs['cbrn:' + c.id] && S.srs['cbrn:' + c.id].lapses > 0 && S.srs['cbrn:' + c.id].box <= 2));
    if (cat === 'due') return CBRN.filter((c) => srsIsDue('cbrn:' + c.id));
    return CBRN.filter((c) => c.cat === cat);
  };

  // 전 과목 오늘 복습 대기 항목 수집 (인터리빙용)
  const collectDueItems = (now = Date.now()) => {
    const out = [];
    CBRN.forEach((c) => {
      const sk = 'cbrn:' + c.id;
      const r = S.srs[sk];
      if (r && r.box > 0 && r.due <= now) out.push({ kind: 'cbrn', key: sk, item: c, rec: r });
    });
    TCCC_CARDS.forEach((c) => {
      const sk = 'tcard:' + c.id;
      const r = S.srs[sk];
      if (r && r.box > 0 && r.due <= now) out.push({ kind: 'tcard', key: sk, item: c, rec: r });
    });
    MIND.forEach((q) => {
      q.sections.forEach((sec, si) => {
        sec.items.forEach((it, k) => {
          const sk = `mind-s:${q.id}:${si}-${k}`;
          const r = S.srs[sk];
          if (r && r.box > 0 && r.due <= now) out.push({ kind: 'mind', key: sk, q, sec, si, k, it, rec: r });
        });
      });
    });
    TCCC.forEach((it) => {
      const sk = 'tccc:' + it.n;
      const r = S.srs[sk];
      if (r && r.box > 0 && r.due <= now) out.push({ kind: 'tccc', key: sk, item: it, rec: r });
    });
    // 오래 밀린 항목 · lapses 높은 항목 우선 정렬 후 과목 간 인터리빙
    out.sort((a, b) => (b.rec.lapses - a.rec.lapses) || (a.rec.due - b.rec.due));
    const buckets = { cbrn: [], mind: [], tccc: [], tcard: [] };
    out.forEach((x) => buckets[x.kind].push(x));
    const interleaved = [];
    const order = ['cbrn', 'mind', 'tccc', 'tcard'];
    let added = true;
    while (added) {
      added = false;
      for (const k of order) {
        if (buckets[k].length) { interleaved.push(buckets[k].shift()); added = true; }
      }
    }
    return interleaved;
  };

  // 전체 기억 보존율 & 문장/단계 집계
  const avgRetention = (now = Date.now()) => {
    const vals = Object.values(S.srs).map((r) => srsRetain(r, now)).filter((v) => v != null);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };

  const mindSentenceStats = (q) => {
    let total = 0, mastered = 0, weak = 0;
    q.sections.forEach((sec, si) => {
      sec.items.forEach((_, k) => {
        total++;
        const r = srsGet(`mind-s:${q.id}:${si}-${k}`);
        if (r.box >= 3) mastered++;
        if (r.box === 1 || (r.box > 0 && r.due <= Date.now())) weak++;
      });
    });
    return { total, mastered, weak };
  };

  const tcccStepStats = () => {
    let mastered = 0, weak = 0;
    TCCC.forEach((it) => {
      const st = S.tcccSteps[it.n];
      const sr = S.srs['tccc:' + it.n];
      if ((st && st.last === 1) || (sr && sr.box >= 3)) mastered++;
      if ((st && st.last < 1) || (sr && (sr.box === 1 || (sr.box > 0 && sr.due <= Date.now())))) weak++;
    });
    return { total: TCCC.length, mastered, weak };
  };

  // 공통 4단계 SRS 평가 버튼 HTML & 바인딩 헬퍼
  const srsBtnsHtml = (key) => {
    const rec = srsGet(key);
    return `<div class="srs4">
      <button class="srs-btn g1" data-g="1"><span>다시</span><small>${srsLabel(rec, 1)}</small></button>
      <button class="srs-btn g2" data-g="2"><span>어려움</span><small>${srsLabel(rec, 2)}</small></button>
      <button class="srs-btn g3" data-g="3"><span>알맞음</span><small>${srsLabel(rec, 3)}</small></button>
      <button class="srs-btn g4" data-g="4"><span>쉬움</span><small>${srsLabel(rec, 4)}</small></button>
    </div>`;
  };

  // ---------- 라우팅 ----------
  const app = $('#app');
  const header = $('#hdr-title');
  const backBtn = $('#hdr-back');
  const hdrPill = $('#hdr-pill');
  const hdrRight = $('#hdr-right');
  let cleanup = null;
  const routes = {};
  const go = (h) => { location.hash = h; };
  const setHeader = (title, back, rightHtml = '') => {
    header.textContent = title;
    backBtn.hidden = !back;
    if (hdrPill) hdrPill.hidden = !!back;
    if (hdrRight) hdrRight.innerHTML = rightHtml;
    backBtn.onclick = () => (typeof back === 'string' ? go(back) : history.back());
  };
  const render = () => {
    if (cleanup) { cleanup(); cleanup = null; }
    const [name, ...args] = (location.hash.slice(1) || 'home').split('/');
    const fn = routes[name] || routes.home;
    const tab = typeof fn.tab === 'function' ? fn.tab(...args) : fn.tab;
    $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === (tab || name)));
    document.body.dataset.route = name;
    app.scrollTop = 0; window.scrollTo(0, 0);
    fn(...args.map(decodeURIComponent));
  };
  window.addEventListener('hashchange', render);

  // ---------- 홈 ----------
  routes.home = () => {
    const mindScores = MIND.map((q) => (S.mind[q.id] && S.mind[q.id].best) || 0);
    const mindAvg = Math.round(mindScores.reduce((a, b) => a + b, 0) / MIND.length);
    const m = cbrnMastery();
    const tBest = S.tccc.best || 0;
    const overall = Math.round((m + mindAvg + tBest) / 3);
    const dueItems = collectDueItems();
    const dueCount = dueItems.length;
    const ret = avgRetention();
    const streakCount = (S.streak && S.streak.count) || 0;
    const doneToday = todayDoneCount();
    const isEmptyAll = overall === 0 && !S.history.length && Object.keys(S.srs).length === 0;

    setHeader('병기본 마스터', false, streakCount ? `<span class="badge-chip badge-orange tnum">${streakCount}일 연속</span>` : '');

    const cbrnDue = dueItems.filter((x) => x.kind === 'cbrn').length;
    const cbrnUnseen = CBRN.filter((c) => cardBox5(c.cat, c.id) === 0).length;
    const mindWeakTotal = MIND.reduce((a, q) => a + mindSentenceStats(q).weak, 0);
    const tStats = tcccStepStats();

    app.innerHTML = `
      <div class="toss-top">
        <p class="toss-top-sub">2026 전투력 측정 대비 · 망각곡선 맞춤 암기</p>
        <h1 class="toss-top-title">${dueCount ? `오늘 복습할 항목<br>${dueCount}개가 기다리고 있어요` : isEmptyAll ? '인출 연습과 간격 반복으로<br>합격까지 가볍게 끝내요' : '오늘 예정된 복습을<br>모두 마쳤어요'}</h1>
      </div>

      <a class="due-cta ${dueCount ? '' : 'done'}" href="#review">
        <div class="due-cta-left">
          <div class="due-cta-ic">${ic(dueCount ? 'sparkle' : 'check-circle', { size: 22, weight: 'bold' })}</div>
          <div>
            <b>${dueCount ? '오늘의 맞춤 복습 시작' : '오늘 복습 완료 · 추가 학습'}</b>
            <span>${dueCount ? `3과목 혼합 인출 · 망각 직전 우선 배치` : `오늘 ${doneToday}개 완료 · 새 항목이나 약점 보완`}</span>
          </div>
        </div>
        <span class="due-cta-pill tnum">${dueCount ? `${dueCount}개 대기` : '바로 가기'}</span>
      </a>

      <section class="home-hero-card">
        <div class="home-hero-head">
          <div>
            <div class="home-hero-label">종합 대비율</div>
            <div class="home-hero-score tnum">${overall}<small>%</small></div>
            <div class="hero-meta-row">
              <span class="badge-chip badge-primary tnum">기억 보존율 ${ret}%</span>
              <span class="badge-chip badge-neutral tnum">오늘 ${doneToday}회 인출</span>
            </div>
          </div>
          <span class="badge-chip badge-primary">3대 과목</span>
        </div>
        <div class="rings-grid">
          <a class="ring-tile" href="#cbrn">
            ${ring(m, '화생방', 'var(--green-500)')}
            <span class="ring-lbl">화생방</span>
            <span class="ring-sub">장기 숙달</span>
          </a>
          <a class="ring-tile" href="#mind">
            ${ring(mindAvg, '정신전력', 'var(--primary)')}
            <span class="ring-lbl">정신전력</span>
            <span class="ring-sub">평균 최고점</span>
          </a>
          <a class="ring-tile" href="#tccc">
            ${ring(tBest, 'TCCC', 'var(--red-500)')}
            <span class="ring-lbl">TCCC</span>
            <span class="ring-sub">최고 점수</span>
          </a>
        </div>
      </section>

      <div class="sec-head">
        <h2 class="sec-title">과목별 맞춤 진도</h2>
        <span class="sec-meta">약점 · 망각 우선</span>
      </div>
      <div class="cards3">
        <a class="big-card cbrn" href="${cbrnDue ? '#flash/due' : '#cbrn'}">
          <div class="bc-icon">${ic('shield-check', { size: 24, weight: 'bold' })}</div>
          <div class="bc-body">
            <div class="bc-top"><b>화생방 단답 · 표</b><span class="bc-pct tnum">${m}%</span></div>
            <span>${cbrnDue ? `오늘 복습 ${cbrnDue}개 대기` : `미학습 ${cbrnUnseen}개 · 7단원 ${CBRN.length}문항`}</span>
            <div class="bar sm"><i style="width:${m}%"></i></div>
          </div>
          <div class="chev">${ic('caret-right', { size: 18 })}</div>
        </a>
        <a class="big-card mind" href="#mind">
          <div class="bc-icon">${ic('note-pencil', { size: 24, weight: 'bold' })}</div>
          <div class="bc-body">
            <div class="bc-top"><b>정신전력 백지암기</b><span class="bc-pct tnum">${mindAvg}점</span></div>
            <span>${mindWeakTotal ? `보강 필요 문장 ${mindWeakTotal}개` : `${MIND.length}문항 · 문장 단위 정밀 인출`}</span>
            <div class="bar sm"><i style="width:${mindAvg}%"></i></div>
          </div>
          <div class="chev">${ic('caret-right', { size: 18 })}</div>
        </a>
        <a class="big-card tc" href="${tStats.weak ? '#tpart/weak' : '#tccc'}">
          <div class="bc-icon">${ic('first-aid', { size: 24, weight: 'bold' })}</div>
          <div class="bc-body">
            <div class="bc-top"><b>TCCC 실기 41단계</b><span class="bc-pct tnum">${tBest}%</span></div>
            <span>${tStats.weak ? `취약 단계 ${tStats.weak}개 집중 필요` : `숙달 ${tStats.mastered}/${tStats.total}단계 · 50점 기준`}</span>
            <div class="bar sm"><i style="width:${tBest}%"></i></div>
          </div>
          <div class="chev">${ic('caret-right', { size: 18 })}</div>
        </a>
      </div>

      <h2 class="sec-title">최적 학습 바로가기</h2>
      <div class="quick">
        <a href="#review" class="qk"><span class="qk-ic">${ic('sparkle', { size: 20 })}</span><span class="qk-txt"><b>통합 복습</b><small>${dueCount ? `${dueCount}개 인터리빙` : '약점 인출'}</small></span></a>
        <a href="#matrix" class="qk"><span class="qk-ic">${ic('shield-check', { size: 20 })}</span><span class="qk-txt"><b>MOPP·경보</b><small>표 빈칸 훈련</small></span></a>
        <a href="#exam" class="qk"><span class="qk-ic">${ic('microphone', { size: 20 })}</span><span class="qk-txt"><b>화생방</b><small>모의 질의응답</small></span></a>
        <a href="#mind-mock" class="qk"><span class="qk-ic">${ic('pencil-simple', { size: 20 })}</span><span class="qk-txt"><b>정신전력</b><small>랜덤 백지시험</small></span></a>
        <a href="#tpart/critical" class="qk"><span class="qk-ic">${ic('warning', { size: 20 })}</span><span class="qk-txt"><b>TCCC</b><small>핵심시간·돌발</small></span></a>
        <a href="#trun" class="qk"><span class="qk-ic">${ic('timer', { size: 20 })}</span><span class="qk-txt"><b>TCCC</b><small>15분 리허설</small></span></a>
      </div>
    `;
  };

  const ring = (v, label, color) => {
    const r = 30, c = 2 * Math.PI * r;
    return `<div class="ring" aria-label="${esc(label)} ${v}%"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="${r}" class="ring-bg"/><circle cx="36" cy="36" r="${r}" class="ring-fg" style="stroke:${color}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 100)}"/></svg><b class="tnum">${v}<small>%</small></b></div>`;
  };

  // ---------- 오늘의 맞춤 복습 (3과목 인터리빙 SRS 세션) ----------
  routes.review = () => {
    setHeader('오늘의 맞춤 복습', '#home');
    let queue = collectDueItems().slice(0, 15);
    let fallbackMode = false;

    // 복습 대기 항목이 0개이면 미학습/최저숙달 항목으로 10개 혼합 세션 구성 가능하도록 안내 + 선택 제공
    const buildDiscoveryQueue = () => {
      const list = [];
      CBRN.filter((c) => cardBox5(c.cat, c.id) < 3).slice(0, 4).forEach((c) => list.push({ kind: 'cbrn', key: 'cbrn:' + c.id, item: c, rec: srsGet('cbrn:' + c.id) }));
      MIND.forEach((q) => {
        q.sections.forEach((sec, si) => {
          sec.items.forEach((it, k) => {
            const sk = `mind-s:${q.id}:${si}-${k}`;
            if (srsGet(sk).box < 3 && list.filter((x) => x.kind === 'mind').length < 3) {
              list.push({ kind: 'mind', key: sk, q, sec, si, k, it, rec: srsGet(sk) });
            }
          });
        });
      });
      TCCC.filter((it) => srsGet('tccc:' + it.n).box < 3).slice(0, 3).forEach((it) => list.push({ kind: 'tccc', key: 'tccc:' + it.n, item: it, rec: srsGet('tccc:' + it.n) }));
      TCCC_CARDS.filter((c) => srsGet('tcard:' + c.id).box < 3).slice(0, 2).forEach((c) => list.push({ kind: 'tcard', key: 'tcard:' + c.id, item: c, rec: srsGet('tcard:' + c.id) }));
      return list;
    };

    if (!queue.length) {
      const disc = buildDiscoveryQueue();
      if (!disc.length) {
        app.innerHTML = empty('모든 항목을 숙달했어요!', '#home', '예정된 복습이 없어요. 실전 모의고사로 감각을 유지해 보세요.', 'trophy');
        return;
      }
      app.innerHTML = `
        <div class="empty">
          <div class="empty-ic">${ic('check-circle', { size: 30, weight: 'bold' })}</div>
          <b>오늘 예정된 복습을 모두 마쳤어요</b>
          <p>지금은 망각 위험이 큰 항목이 없어요. 미학습·취약 항목 ${disc.length}개를 섞어서 미리 익힐까요?</p>
          <div class="btn-row"><button class="btn" id="start-disc">혼합 새 학습 시작</button><a class="btn ghost" href="#mind-mock">실전 모의고사</a></div>
        </div>`;
      $('#start-disc').onclick = () => { fallbackMode = true; queue = disc; startSession(); };
      return;
    }

    const startSession = () => {
      let idx = 0, done = 0, againCount = 0;
      const totalInitial = queue.length;
      const rated = [];

      const draw = () => {
        if (idx >= queue.length) return finish();
        const cur = queue[idx];
        const kindLabel = cur.kind === 'cbrn' ? `화생방 · ${catName(cur.item.cat)}`
          : cur.kind === 'tcard' ? 'TCCC 핵심카드'
          : cur.kind === 'mind' ? `정신전력 · ${cur.q.id}`
          : `TCCC 실기 ${cur.item.n}번`;

        let promptHtml = '';
        let answerHtml = '';
        let hintText = '';

        if (cur.kind === 'cbrn' || cur.kind === 'tcard') {
          promptHtml = `<p class="exam-q">${esc(cur.item.q)}</p>`;
          hintText = `초성 힌트: ${chosung(cur.item.a.slice(0, 24))}${cur.item.a.length > 24 ? '…' : ''}`;
          answerHtml = `<div class="exam-a"><small>모범답안</small><p>${esc(cur.item.a)}</p></div>`;
        } else if (cur.kind === 'mind') {
          const role = roleOf(cur.sec, cur.k);
          const prevSent = cur.k > 0 ? plain(cur.sec.items[cur.k - 1]) : '';
          promptHtml = `
            <div class="q-head-meta" style="margin-top:10px"><span class="role">${esc(role.r || `문장 ${cur.k + 1}`)}</span><span class="phase-badge">${esc(cur.sec.h)}</span></div>
            ${prevSent ? `<div class="sent-bridge" style="margin-top:10px"><strong>직전 문장:</strong> …${esc(prevSent.slice(-34))}</div>` : ''}
            <p class="exam-q">${esc(role.cue || '이 문장을 정확히 떠올려 보세요.')}</p>`;
          const kws = parse(cur.it).filter((t) => t.kw).map((t) => t.s);
          hintText = `핵심 키워드(${kws.length}개): ${kws.map((w) => chosung(w)).join(' · ')}`;
          answerHtml = `<div class="exam-a"><small>모범 문장</small><p>${sentHtml(cur.it)}</p></div>`;
        } else {
          const it = cur.item;
          const g = grp(it.g);
          const prevIt = TCCC.find((x) => x.n === it.n - 1);
          promptHtml = `
            <div class="q-head-meta" style="margin-top:10px"><span class="badge-chip badge-red">${esc(g.phase)} › ${esc(g.name)}</span></div>
            ${prevIt ? `<div class="sent-bridge" style="margin-top:10px"><strong>이전 ${prevIt.n}번:</strong> ${esc(prevIt.t)}</div>` : ''}
            ${it.cue ? `<div class="cue big">${ic('megaphone', { size: 15, weight: 'bold' })} 평가관: ${esc(it.cue)}</div>` : ''}
            <p class="exam-q">${it.n}번 — 무엇을 하고, 뭐라고 말하나요?</p>`;
          hintText = it.kw && it.kw.length ? `대사 키워드: ${it.kw.map((w) => chosung(w)).join(' · ')}` : '행동 평가 항목';
          answerHtml = `<div class="exam-a"><small>평가 기준 · 대사</small><p>${esc(it.t)}</p>${it.note ? `<p class="tnote">• ${esc(it.note)}</p>` : ''}<div class="say" style="margin-top:10px"><span>${ic('speaker-high', { size: 16 })}</span><b>${esc(sayOf(it))}</b></div></div>`;
        }

        app.innerHTML = `
          <div class="quiz-top">
            <span class="tnum">${idx + 1} / ${queue.length}</span>
            <span class="badge-chip badge-primary">${fallbackMode ? '혼합 새 학습' : '망각 직전 복습'}</span>
          </div>
          <div class="bar thin"><i style="width:${(idx / queue.length) * 100}%"></i></div>
          <div class="exam-card">
            <div class="examiner">${ic('sparkle', { size: 14, weight: 'bold' })} ${esc(kindLabel)}</div>
            ${promptHtml}
            <div id="rev-hint" class="hint-box-inline" hidden>${esc(hintText)}</div>
            <div id="rev-ans" hidden>${answerHtml}</div>
          </div>
          <div class="recall-box" style="margin-top:12px">
            <div class="recall-row">
              <input class="recall-inp" id="rev-inp" placeholder="핵심어·문장을 먼저 떠올려 적어보세요 (선택)" autocomplete="off">
              <button class="pill neutral" id="rev-hint-btn">힌트</button>
            </div>
            <div id="rev-match"></div>
          </div>
          <div id="ctrl"><button class="btn block" id="reveal">떠올렸어요 · 정답 확인</button></div>
        `;

        $('#rev-hint-btn').onclick = () => { $('#rev-hint').hidden = false; };
        $('#reveal').onclick = () => {
          const typed = ($('#rev-inp').value || '').trim();
          if (typed) {
            let scoreTxt = '';
            if (cur.kind === 'mind') {
              const kws = parse(cur.it).filter((t) => t.kw).map((t) => t.s);
              const hit = kws.filter((w) => recall(w, typed) >= 0.99).length;
              const sim = Math.round(dice(typed, plain(cur.it)) * 100);
              scoreTxt = `키워드 ${hit}/${kws.length} · 문장 일치도 ${sim}%`;
            } else {
              const target = cur.kind === 'tccc' ? `${cur.item.t} ${sayOf(cur.item)}` : cur.item.a;
              const sim = Math.round(dice(typed, target) * 100);
              scoreTxt = `핵심 일치도 ${sim}%`;
            }
            $('#rev-match').innerHTML = `<div class="hint-box-inline" style="background:var(--primary-weak);color:var(--primary-weak-text)">인출 체크: ${esc(scoreTxt)}</div>`;
          }
          $('#rev-ans').hidden = false;
          $('#ctrl').innerHTML = `<p class="hint">얼마나 쉽게 떠올랐나요? 난이도에 따라 다음 복습 날이 정해져요.</p>${srsBtnsHtml(cur.key)}`;
          $$('.srs-btn').forEach((b) => {
            b.onclick = () => {
              const g = +b.dataset.g;
              srsRate(cur.key, g);
              rated.push({ cur, g });
              done++;
              if (g === 1) {
                againCount++;
                vibrate(35);
                // 세션 내 간격 재인출: 3칸 뒤에 다시 배치
                const rePos = Math.min(queue.length, idx + 4);
                queue.splice(rePos, 0, cur);
              }
              idx++;
              draw();
            };
          });
        };
      };

      const finish = () => {
        const good = rated.filter((x) => x.g >= 3).length;
        const sc = rated.length ? Math.round((good / rated.length) * 100) : 100;
        logHistory('오늘의 맞춤 복습', `${totalInitial}문항 혼합`, sc);
        app.innerHTML = result(sc, `총 ${done}회 인출 완료 (재복습 ${againCount}회 포함)`, [
          `<a class="btn" href="#home">홈으로</a>`,
          `<a class="btn ghost" href="#stats">기억 리포트</a>`
        ]);
        if (sc >= 85) confetti();
      };

      draw();
    };

    startSession();
  };
  routes.review.tab = 'home';

  // ---------- 화생방 메인 ----------
  routes.cbrn = () => {
    const m = cbrnMastery();
    const dueN = CBRN.filter((c) => srsIsDue('cbrn:' + c.id)).length;
    const wrongN = poolFor('wrong').length;
    setHeader('화생방', false, `<span class="badge-chip badge-green tnum">숙달 ${m}%</span>`);
    app.innerHTML = `
      <div class="toss-top">
        <p class="toss-top-sub">화생방 ${CBRN.length}문항 · 단답 &amp; 표 암기</p>
        <h1 class="toss-top-title">인출과 변별 훈련으로<br>헷갈리는 표까지 잡아요</h1>
      </div>

      <div class="mode-grid">
        <a class="mode featured-blue" href="${dueN ? '#flash/due' : '#exam'}"><span class="mi">${ic(dueN ? 'sparkle' : 'microphone', { size: 22, weight: 'bold' })}</span><b>${dueN ? `복습 큐 (${dueN})` : '모의 질의응답'}</b><small>${dueN ? '망각 직전 카드 인출' : '실전처럼 말로 답하기'}</small></a>
        <a class="mode" href="#matrix"><span class="mi">${ic('shield-check', { size: 22 })}</span><b>MOPP · 경보 표</b><small>빈칸 채우기 · 즉답</small></a>
        <a class="mode" href="#quiz/all"><span class="mi">${ic('lightning', { size: 22 })}</span><b>변별 객관식</b><small>혼동 선지 집중 10문제</small></a>
        <a class="mode" href="#flash/all"><span class="mi">${ic('cards', { size: 22 })}</span><b>인출 플래시카드</b><small>4단계 망각곡선 스케줄</small></a>
        <a class="mode" href="#exam"><span class="mi">${ic('microphone', { size: 22 })}</span><b>모의 질의응답</b><small>응답 속도 · 취약 우선</small></a>
        <a class="mode" href="#wrong"><span class="mi">${ic('book-open', { size: 22 })}</span><b>취약 · 오답노트</b><small>${wrongN}문항 집중</small></a>
      </div>

      <div class="sec-head">
        <h2 class="sec-title">단원별 숙달도</h2>
        <span class="sec-meta">${CBRN_CATS.length}개 단원</span>
      </div>
      <div class="list">
        ${CBRN_CATS.map((cat) => {
          const cards = CBRN.filter((c) => c.cat === cat.id);
          const p = cbrnMastery(cards);
          const catDue = cards.filter((c) => srsIsDue('cbrn:' + c.id)).length;
          return `<div class="row">
            <div class="row-ic">${ic(catIcon(cat.id), { size: 22 })}</div>
            <div class="row-body"><b>${esc(cat.name)}</b><span>${cards.length}문항 · 숙달 ${p}%${catDue ? ` · 복습 ${catDue}` : ''}</span><div class="bar sm"><i style="width:${p}%"></i></div></div>
            <div class="row-act"><a class="pill" href="#flash/${cat.id}">카드</a><a class="pill ghost" href="#quiz/${cat.id}">퀴즈</a></div>
          </div>`;
        }).join('')}
      </div>

      <h2 class="sec-title">전체 문항 보기</h2>
      <a class="row link solo" href="#list">
        <div class="row-ic">${ic('file-text', { size: 22 })}</div>
        <div class="row-body"><b>정리본 (질문 · 답 목록)</b><span>MOPP 단계표 · 경보표 포함</span></div>
        <div class="chev">${ic('caret-right', { size: 18 })}</div>
      </a>
    `;
  };

  // ---------- MOPP · 경보 매트릭스 인터랙티브 훈련 (NEW) ----------
  routes.matrix = (tab = 'mopp') => {
    setHeader('MOPP · 경보 표 훈련', '#cbrn');
    const MOPP_ROWS = [
      ['준비', '준비', '준비', '휴대', '준비'],
      ['0단계', '휴대', '휴대', '휴대', '휴대'],
      ['1단계', '착용', '휴대', '휴대', '휴대'],
      ['2단계', '착용', '착용', '휴대', '휴대'],
      ['3단계', '착용', '착용', '착용', '휴대'],
      ['4단계', '착용', '착용', '착용', '착용'],
      ['A(알파)', '휴대', '휴대', '착용', '휴대']
    ];
    const MOPP_STATES = ['준비', '휴대', '착용'];
    const ALARM_COLS = ['준비경보 (MOPP 준비)', '경계경보 (MOPP 1)', '경보 (MOPP 3)', '해제'];
    const ALARM_ROWS = [
      { label: '방송', vals: ['"발령" 반복', '"발령" 반복', '"발령" 반복', '"해제"'], opts: ['"발령" 반복', '"해제"', '-'] },
      { label: '타종', vals: ['-', '1분간 (3연타)', '3분간 (난타)', '-'], opts: ['-', '1분간 (3연타)', '3분간 (난타)'] },
      { label: '사이렌', vals: ['-', '1분간 평탄음', '-', '-'], opts: ['-', '1분간 평탄음', '3분간 난타'] },
      { label: '수기', vals: ['흰색', '황색', '적색', '녹색'], opts: ['흰색', '황색', '적색', '녹색'] }
    ];

    const renderMoppDrill = () => {
      const blanks = new Set();
      MOPP_ROWS.forEach((r, ri) => r.slice(1).forEach((_, ci) => { if ((ri + ci) % 2 === 0 || ri >= 3) blanks.add(`${ri}-${ci}`); }));
      const picks = {};
      let graded = false;

      const drawMopp = () => {
        app.innerHTML = `
          <div class="lv-tabs">
            <a href="#matrix/mopp" class="on">MOPP 단계표</a>
            <a href="#matrix/alarm">경보 4구분표</a>
            <a href="#matrix/drill">실전 즉답</a>
          </div>
          <div class="tip"><span class="tip-ic">${ic('shield-check', { size: 18, weight: 'bold' })}</span><div>빈칸 셀을 탭하면 <b>준비 → 휴대 → 착용</b> 순으로 바뀌어요. 7단계 전체를 손으로 떠올려 채워보세요.</div></div>
          <div class="toolbar">
            <button class="pill ghost" id="m-half">절반 가리기</button>
            <button class="pill neutral" id="m-all">전체 가리기</button>
          </div>
          <div class="panel">
            <h3>MOPP 단계표 훈련 <span class="badge-chip badge-primary">${blanks.size}칸 빈칸</span></h3>
            <div class="table-wrap">
              <table class="mopp">
                <thead><tr><th>단계</th><th>보호의</th><th>전투화<br>덮개</th><th>방독면</th><th>보호<br>장갑</th></tr></thead>
                <tbody>${MOPP_ROWS.map((r, ri) => `<tr><th>${r[0]}</th>${r.slice(1).map((ans, ci) => {
                  const k = `${ri}-${ci}`;
                  if (!blanks.has(k)) return ans === '착용' ? '<td class="on"><span class="cell-chip">착용</span></td>' : `<td class="cell-muted">${ans}</td>`;
                  const cur = picks[k] || '';
                  const cls = graded ? (cur === ans ? 'ok' : 'ng') : (cur ? 'filled' : '');
                  const txt = graded && cur !== ans ? `${cur || '?'} → ${ans}` : (cur || '선택');
                  return `<td><button class="mcell-btn ${cls}" data-k="${k}">${esc(txt)}</button></td>`;
                }).join('')}</tr>`).join('')}</tbody>
              </table>
            </div>
          </div>
          <div class="sticky-act">
            <button class="btn ghost" id="m-reset">초기화</button>
            <button class="btn" id="m-grade">채점하기</button>
          </div>
          <div id="m-res"></div>`;

        $$('.mcell-btn').forEach((b) => {
          b.onclick = () => {
            if (graded) return;
            const k = b.dataset.k;
            const cur = picks[k] || '';
            const nextIdx = (MOPP_STATES.indexOf(cur) + 1) % MOPP_STATES.length;
            picks[k] = MOPP_STATES[nextIdx];
            b.textContent = picks[k];
            b.classList.add('filled');
          };
        });
        $('#m-half').onclick = () => {
          blanks.clear(); graded = false;
          MOPP_ROWS.forEach((r, ri) => r.slice(1).forEach((_, ci) => { if ((ri + ci) % 2 === 0) blanks.add(`${ri}-${ci}`); }));
          drawMopp();
        };
        $('#m-all').onclick = () => {
          blanks.clear(); graded = false;
          MOPP_ROWS.forEach((r, ri) => r.slice(1).forEach((_, ci) => blanks.add(`${ri}-${ci}`)));
          drawMopp();
        };
        $('#m-reset').onclick = () => { Object.keys(picks).forEach((k) => delete picks[k]); graded = false; drawMopp(); };
        $('#m-grade').onclick = () => {
          graded = true;
          let ok = 0;
          blanks.forEach((k) => {
            const [ri, ci] = k.split('-').map(Number);
            if (picks[k] === MOPP_ROWS[ri][ci + 1]) ok++;
          });
          const sc = Math.round((ok / blanks.size) * 100);
          logHistory('MOPP·경보 표', 'MOPP 7단계 훈련', sc);
          drawMopp();
          $('#m-res').innerHTML = `<div class="feedback ${sc >= 80 ? 'good' : 'bad'}"><b>${sc}점 (${ok}/${blanks.size}칸 정답)</b><span>틀린 칸은 정답(→)을 확인하고 다시 채워보세요.</span></div>`;
          if (sc === 100) confetti();
        };
      };
      drawMopp();
    };

    const renderAlarmDrill = () => {
      const blanks = new Set(['0-3', '1-1', '1-2', '2-1', '3-0', '3-1', '3-2', '3-3']);
      const picks = {};
      let graded = false;

      const drawAlarm = () => {
        app.innerHTML = `
          <div class="lv-tabs">
            <a href="#matrix/mopp">MOPP 단계표</a>
            <a href="#matrix/alarm" class="on">경보 4구분표</a>
            <a href="#matrix/drill">실전 즉답</a>
          </div>
          <div class="tip"><span class="tip-ic">${ic('siren', { size: 18, weight: 'bold' })}</span><div>빈칸을 탭할 때마다 보기가 순환해요. 타종·사이렌·수기 색상을 혼동 없이 구분하세요.</div></div>
          <div class="panel">
            <h3>경보 4구분 훈련 <span class="badge-chip badge-orange">${blanks.size}칸 빈칸</span></h3>
            <div class="table-wrap">
              <table class="mopp">
                <thead><tr><th>구분</th>${ALARM_COLS.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
                <tbody>${ALARM_ROWS.map((row, ri) => `<tr><th>${esc(row.label)}</th>${row.vals.map((ans, ci) => {
                  const k = `${ri}-${ci}`;
                  if (!blanks.has(k)) return `<td class="cell-muted">${esc(ans)}</td>`;
                  const cur = picks[k] || '';
                  const cls = graded ? (cur === ans ? 'ok' : 'ng') : (cur ? 'filled' : '');
                  const txt = graded && cur !== ans ? `${cur || '?'} → ${ans}` : (cur || '선택');
                  return `<td><button class="mcell-btn ${cls}" data-k="${k}">${esc(txt)}</button></td>`;
                }).join('')}</tr>`).join('')}</tbody>
              </table>
            </div>
          </div>
          <div class="sticky-act">
            <button class="btn ghost" id="a-all">전체 가리기</button>
            <button class="btn" id="a-grade">채점하기</button>
          </div>
          <div id="a-res"></div>`;

        $$('.mcell-btn').forEach((b) => {
          b.onclick = () => {
            if (graded) return;
            const k = b.dataset.k;
            const [ri] = k.split('-').map(Number);
            const opts = ALARM_ROWS[ri].opts;
            const cur = picks[k] || '';
            picks[k] = opts[(opts.indexOf(cur) + 1) % opts.length];
            b.textContent = picks[k];
            b.classList.add('filled');
          };
        });
        $('#a-all').onclick = () => {
          blanks.clear(); graded = false;
          ALARM_ROWS.forEach((r, ri) => r.vals.forEach((_, ci) => blanks.add(`${ri}-${ci}`)));
          Object.keys(picks).forEach((k) => delete picks[k]);
          drawAlarm();
        };
        $('#a-grade').onclick = () => {
          graded = true;
          let ok = 0;
          blanks.forEach((k) => {
            const [ri, ci] = k.split('-').map(Number);
            if (picks[k] === ALARM_ROWS[ri].vals[ci]) ok++;
          });
          const sc = Math.round((ok / blanks.size) * 100);
          logHistory('MOPP·경보 표', '경보 4구분 훈련', sc);
          drawAlarm();
          $('#a-res').innerHTML = `<div class="feedback ${sc >= 80 ? 'good' : 'bad'}"><b>${sc}점 (${ok}/${blanks.size}칸 정답)</b></div>`;
          if (sc === 100) confetti();
        };
      };
      drawAlarm();
    };

    const renderScenarioDrill = () => {
      const moppCards = CBRN.filter((c) => c.cat === 'mopp' || c.cat === 'alarm');
      const qs = shuffle(moppCards).slice(0, 5).map((c) => {
        const distract = [...new Set(shuffle(moppCards.filter((x) => x.id !== c.id && x.a !== c.a)).map((x) => x.a))].slice(0, 3);
        return { c, opts: shuffle([c.a, ...distract]) };
      });
      let i = 0, ok = 0;
      const drawQ = () => {
        if (i >= qs.length) {
          const sc = Math.round((ok / qs.length) * 100);
          logHistory('MOPP·경보 표', '실전 즉답 5문항', sc);
          app.innerHTML = `
            <div class="lv-tabs"><a href="#matrix/mopp">MOPP 단계표</a><a href="#matrix/alarm">경보 4구분표</a><a href="#matrix/drill" class="on">실전 즉답</a></div>
            ${result(sc, `${qs.length}문항 중 ${ok}개 정답`, [`<button class="btn" id="m-retry">새 5문항</button>`, `<a class="btn ghost" href="#cbrn">화생방 홈</a>`])}`;
          $('#m-retry').onclick = () => routes.matrix('drill');
          return;
        }
        const { c, opts } = qs[i];
        app.innerHTML = `
          <div class="lv-tabs"><a href="#matrix/mopp">MOPP 단계표</a><a href="#matrix/alarm">경보 4구분표</a><a href="#matrix/drill" class="on">실전 즉답</a></div>
          <div class="quiz-top"><span class="tnum">${i + 1} / ${qs.length}</span><span class="score-chip tnum">${ok * 20}점</span></div>
          <div class="bar thin"><i style="width:${(i / qs.length) * 100}%"></i></div>
          <div class="q-card"><small>${esc(catName(c.cat))}</small><p>${esc(c.q)}</p></div>
          <div class="opts">${opts.map((o, k) => `<button class="opt" data-k="${k}"><i>${k + 1}</i><span>${esc(o)}</span></button>`).join('')}</div>
          <div id="next-wrap"></div>`;
        $$('.opt').forEach((b) => {
          b.onclick = () => {
            const k = +b.dataset.k;
            const right = opts[k] === c.a;
            $$('.opt').forEach((x, j) => {
              x.disabled = true;
              if (opts[j] === c.a) x.classList.add('right');
              else if (j === k) x.classList.add('wrong');
            });
            if (right) ok++;
            srsRate('cbrn:' + c.id, right ? 3 : 1);
            $('#next-wrap').innerHTML = `<div class="feedback ${right ? 'good' : 'bad'}"><b>${right ? '정답이에요!' : '다시 확인해요'}</b>${right ? '' : `<span>정답: ${esc(c.a)}</span>`}</div><button class="btn block" id="m-next">${i + 1 < qs.length ? '다음' : '결과 보기'}</button>`;
            $('#m-next').onclick = () => { i++; drawQ(); };
          };
        });
      };
      drawQ();
    };

    if (tab === 'alarm') renderAlarmDrill();
    else if (tab === 'drill') renderScenarioDrill();
    else renderMoppDrill();
  };
  routes.matrix.tab = 'cbrn';

  // ---------- 정리본 ----------
  routes.list = () => {
    setHeader('정리본', '#cbrn');
    const yes = '<td class="on"><span class="cell-chip">착용</span></td>';
    const MOPP = [
      ['준비', '준비', '준비', '휴대', '준비'], ['0단계', '휴대', '휴대', '휴대', '휴대'], ['1단계', '착용', '휴대', '휴대', '휴대'],
      ['2단계', '착용', '착용', '휴대', '휴대'], ['3단계', '착용', '착용', '착용', '휴대'], ['4단계', '착용', '착용', '착용', '착용'], ['A(알파)', '휴대', '휴대', '착용', '휴대']
    ];
    app.innerHTML = `
      <div class="toss-top">
        <p class="toss-top-sub">핵심 요약표 · 전체 ${CBRN.length}문항</p>
        <h1 class="toss-top-title">MOPP 단계와 경보를<br>한눈에 확인해요</h1>
      </div>

      <div class="panel">
        <h3>MOPP 단계표 <span class="badge-chip badge-primary">7단계</span></h3>
        <div class="table-wrap">
          <table class="mopp">
            <thead><tr><th>단계</th><th>보호의</th><th>전투화<br>덮개</th><th>방독면</th><th>보호<br>장갑</th></tr></thead>
            <tbody>${MOPP.map((r) => `<tr><th>${r[0]}</th>${r.slice(1).map((v) => (v === '착용' ? yes : `<td class="cell-muted">${v}</td>`)).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <h3>경보 <span class="badge-chip badge-orange">4구분</span></h3>
        <div class="table-wrap">
          <table class="mopp">
            <thead><tr><th>구분</th><th>준비경보<small>MOPP 준비</small></th><th>경계경보<small>MOPP 1</small></th><th>경보<small>MOPP 3</small></th><th>해제</th></tr></thead>
            <tbody>
              <tr><th>방송</th><td>"발령" 반복</td><td>"발령" 반복</td><td>"발령" 반복</td><td>"해제"</td></tr>
              <tr><th>타종</th><td class="cell-muted">-</td><td>1분간<br>(3연타)</td><td>3분간<br>(난타)</td><td class="cell-muted">-</td></tr>
              <tr><th>사이렌</th><td class="cell-muted">-</td><td>1분간<br>평탄음</td><td class="cell-muted">-</td><td class="cell-muted">-</td></tr>
              <tr><th>수기</th><td><span class="flag-pill"><i class="flag" style="background:#ffffff"></i>흰색</span></td><td><span class="flag-pill"><i class="flag" style="background:#f5c400"></i>황색</span></td><td><span class="flag-pill"><i class="flag" style="background:#e03131"></i>적색</span></td><td><span class="flag-pill"><i class="flag" style="background:#2f9e44"></i>녹색</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      ${CBRN_CATS.map((cat) => `
        <div class="sec-head">
          <h2 class="sec-title" style="display:flex;align-items:center;gap:8px">${ic(catIcon(cat.id), { size: 20 })} ${esc(cat.name)}</h2>
          <span class="sec-meta">${CBRN.filter((c) => c.cat === cat.id).length}문항</span>
        </div>
        <div class="qa-list">${CBRN.filter((c) => c.cat === cat.id).map((c) => `<div class="qa"><b>Q. ${esc(c.q)}</b><p>${esc(c.a)}</p></div>`).join('')}</div>
      `).join('')}
    `;
  };
  routes.list.tab = 'cbrn';

  // ---------- 플래시카드 (능동 인출 + 4단계 SRS + 세션 내 재인출) ----------
  routes.flash = (cat = 'all') => {
    const pool = poolFor(cat);
    const title = cat === 'all' ? '플래시카드 · 전체' : cat === 'wrong' ? '플래시카드 · 취약' : cat === 'due' ? '화생방 오늘 복습' : catName(cat);
    setHeader(title, backFor(cat));
    if (!pool.length) { app.innerHTML = empty('해당 카드가 없어요', backFor(cat), '다른 단원이나 전체 카드로 연습해 보세요.'); return; }

    const prefix = srsPrefixFor(cat);
    // 우선순위: 기한 만료(due) → 낮은 box → 미학습
    let deck = shuffle(pool).sort((a, b) => {
      const ra = srsGet(prefix + a.id), rb = srsGet(prefix + b.id);
      const da = srsIsDue(prefix + a.id) ? -1 : ra.box;
      const db = srsIsDue(prefix + b.id) ? -1 : rb.box;
      return da - db;
    });
    let i = 0, goodCnt = 0, againCnt = 0, flipped = false;

    const draw = () => {
      if (i >= deck.length) return finish();
      const c = deck[i];
      const sk = prefix + c.id;
      const rec = srsGet(sk);
      flipped = false;

      app.innerHTML = `
        <div class="fc-top">
          <span class="cnt bad tnum">다시 ${againCnt}</span>
          <span class="prog tnum">${i + 1} / ${deck.length}</span>
          <span class="cnt good tnum">통과 ${goodCnt}</span>
        </div>
        <div class="bar thin"><i style="width:${(i / deck.length) * 100}%"></i></div>
        <div class="fc-wrap">
          <div class="fc" id="fc">
            <div class="fc-face front">
              <small>${esc(catName(c.cat))}${rec.box ? ` · Lv${rec.box}` : ' · 신규'}</small>
              <p>${esc(c.q)}</p>
              <em>먼저 답을 떠올린 뒤 탭해서 확인하세요</em>
            </div>
            <div class="fc-face back"><small>정답</small><p>${esc(c.a)}</p></div>
          </div>
        </div>
        <div class="recall-box">
          <div class="recall-row">
            <input class="recall-inp" id="fc-inp" placeholder="떠올린 핵심어 입력 (선택)" autocomplete="off">
            <button class="pill neutral" id="fc-hint">초성 힌트</button>
          </div>
          <div id="fc-hint-box" class="hint-box-inline" hidden>초성: ${esc(chosung(c.a.slice(0, 22)))}${c.a.length > 22 ? '…' : ''}</div>
          <div id="fc-match"></div>
        </div>
        <div id="fc-ctrl">
          <div class="fc-btns">
            <button class="fbtn bad" id="no">${ic('x', { size: 20, weight: 'bold' })}모름 (바로 확인)</button>
            <button class="fbtn good" id="yes">${ic('check', { size: 20, weight: 'bold' })}정답 확인</button>
          </div>
        </div>
        <p class="hint">스페이스: 뒤집기 · 확인 후 기억 난이도(1~4)를 고르면 복습 주기가 자동 조정돼요</p>
      `;

      const fc = $('#fc');
      const revealAndRate = (forceAgain = false) => {
        if (!flipped) {
          flipped = true;
          fc.classList.add('flip');
        }
        const typed = ($('#fc-inp').value || '').trim();
        if (typed) {
          const sim = Math.round(dice(typed, c.a) * 100);
          $('#fc-match').innerHTML = `<div class="hint-box-inline" style="background:var(--primary-weak);color:var(--primary-weak-text)">인출 일치도 ${sim}%</div>`;
        }
        if (forceAgain) { rate(1); return; }
        $('#fc-ctrl').innerHTML = srsBtnsHtml(sk);
        $$('.srs-btn').forEach((b) => { b.onclick = () => rate(+b.dataset.g); });
      };

      fc.onclick = () => revealAndRate(false);
      $('#fc-hint').onclick = () => { $('#fc-hint-box').hidden = false; };
      $('#no').onclick = () => revealAndRate(false);
      $('#yes').onclick = () => revealAndRate(false);

      let sx = null, dx = 0;
      fc.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; dx = 0; fc.style.transition = 'none'; }, { passive: true });
      fc.addEventListener('touchmove', (e) => { if (sx == null) return; dx = e.touches[0].clientX - sx; fc.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)${flipped ? ' rotateY(180deg)' : ''}`; }, { passive: true });
      fc.addEventListener('touchend', () => {
        fc.style.transition = ''; fc.style.transform = '';
        if (Math.abs(dx) > 90) { fc.onclick = null; rate(dx > 0 ? 3 : 1); }
        sx = null;
      });
    };

    const rate = (g) => {
      const c = deck[i];
      srsRate(prefix + c.id, g);
      if (g === 1) {
        againCnt++;
        vibrate(30);
        // 세션 내 +3 위치에 재인출 예약
        deck.splice(Math.min(deck.length, i + 4), 0, c);
      } else {
        goodCnt++;
      }
      i++;
      draw();
    };

    const finish = () => {
      const total = goodCnt + againCnt;
      const sc = total ? Math.round((goodCnt / total) * 100) : 0;
      logHistory('플래시카드', cat === 'all' ? '화생방 전체' : catName(cat), sc);
      if (cat === 'tccc') S.tccc.cards = sc;
      save();
      app.innerHTML = result(sc, `${pool.length}장 학습 · 망각곡선 복습일 자동 예약 완료`, [
        `<button class="btn" id="retry">다시 하기</button>`,
        `<a class="btn ghost" href="#quiz/${cat === 'wrong' || cat === 'due' ? 'all' : cat}">변별 퀴즈로 확인</a>`
      ]);
      $('#retry').onclick = render;
    };

    const key = (e) => {
      if (e.code === 'Space' && document.activeElement !== $('#fc-inp')) { e.preventDefault(); $('#fc') && $('#fc').click(); }
      if (['1', '2', '3', '4'].includes(e.key) && flipped) {
        const b = $(`.srs-btn[data-g="${e.key}"]`); b && b.click();
      }
    };
    document.addEventListener('keydown', key);
    cleanup = () => document.removeEventListener('keydown', key);
    draw();
  };
  routes.flash.tab = (cat) => (cat === 'tccc' ? 'tccc' : 'cbrn');

  // ---------- 객관식 퀴즈 (혼동 선지 변별 + 취약 우선 인터리빙) ----------
  const pickDistractors = (c, SRC) => {
    const same = SRC.filter((x) => x.id !== c.id && x.cat === c.cat && x.a !== c.a);
    // 질문 패턴이 비슷한 혼동 쌍 우선 (예: MOPP 착용 vs 적용, 경보별 수기/타종, 숫자 문항)
    const isWhen = c.q.includes('언제');
    const isWear = c.q.includes('착용') || c.q.includes('상태');
    const similar = same.filter((x) => (isWhen && x.q.includes('언제')) || (isWear && (x.q.includes('착용') || x.q.includes('상태'))));
    const other = SRC.filter((x) => x.id !== c.id && x.cat !== c.cat && x.a !== c.a);
    return [...new Set(shuffle(similar).concat(shuffle(same), shuffle(other)).map((x) => x.a))].slice(0, 3);
  };

  routes.quiz = (cat = 'all') => {
    const pool = poolFor(cat);
    const SRC = srcFor(cat);
    const prefix = srsPrefixFor(cat);
    setHeader(cat === 'all' ? '변별 객관식' : cat === 'wrong' ? '취약 문항 퀴즈' : catName(cat), backFor(cat));
    if (pool.length < 1) { app.innerHTML = empty('문항이 없어요', backFor(cat)); return; }

    // 취약·기한만료 문항 우선 정렬 후 상위 풀에서 10문제 인터리빙 추출
    const prioritized = shuffle(pool).sort((a, b) => {
      const ra = srsGet(prefix + a.id), rb = srsGet(prefix + b.id);
      const wa = (srsIsDue(prefix + a.id) ? 10 : 0) + (ra.lapses || 0) * 3 - ra.box;
      const wb = (srsIsDue(prefix + b.id) ? 10 : 0) + (rb.lapses || 0) * 3 - rb.box;
      return wb - wa;
    });
    const qs = shuffle(prioritized.slice(0, Math.min(14, prioritized.length))).slice(0, 10).map((c) => ({
      c,
      opts: shuffle([c.a, ...pickDistractors(c, SRC)])
    }));

    let i = 0, score = 0;
    const log = [];
    const draw = () => {
      if (i >= qs.length) return finish();
      const { c, opts } = qs[i];
      app.innerHTML = `
        <div class="quiz-top"><span class="tnum">${i + 1} / ${qs.length}</span><span class="score-chip tnum">${score}점</span></div>
        <div class="bar thin"><i style="width:${(i / qs.length) * 100}%"></i></div>
        <div class="q-card"><small>${esc(catName(c.cat))}</small><p>${esc(c.q)}</p></div>
        <div class="opts">${opts.map((o, k) => `<button class="opt" data-k="${k}"><i>${k + 1}</i><span>${esc(o)}</span></button>`).join('')}</div>
        <div id="next-wrap"></div>
      `;
      $$('.opt').forEach((b) => { b.onclick = () => pick(+b.dataset.k); });
    };
    const pick = (k) => {
      const { c, opts } = qs[i];
      const ok = opts[k] === c.a;
      $$('.opt').forEach((b, j) => {
        b.disabled = true;
        if (opts[j] === c.a) b.classList.add('right');
        else if (j === k) b.classList.add('wrong');
      });
      if (ok) score += 10; else vibrate(60);
      srsRate(prefix + c.id, ok ? 3 : 1);
      log.push({ c, ok });
      $('.score-chip').textContent = score + '점';
      $('#next-wrap').innerHTML = `<div class="feedback ${ok ? 'good' : 'bad'}"><b>${ok ? `${ic('check-circle', { size: 18, weight: 'bold' })} 정답이에요!` : `${ic('x-circle', { size: 18, weight: 'bold' })} 오답이에요 (오늘 재복습 예약)`}</b>${ok ? '' : `<span>정답: ${esc(c.a)}</span>`}</div><button class="btn block" id="next">${i + 1 < qs.length ? '다음 문제' : '결과 보기'}</button>`;
      $('#next').onclick = () => { i++; draw(); };
    };
    const finish = () => {
      const sc = Math.round((score / (qs.length * 10)) * 100);
      logHistory('객관식', cat === 'all' ? '화생방 변별' : cat === 'wrong' ? '오답' : catName(cat), sc);
      app.innerHTML = result(sc, `${qs.length}문제 중 ${log.filter((l) => l.ok).length}개 정답`, [
        `<button class="btn" id="retry">다시 풀기</button>`,
        poolFor('wrong').length ? `<a class="btn ghost" href="#flash/wrong">취약 카드 인출</a>` : ''
      ]) + `<h2 class="sec-title">문항별 결과</h2><div class="qa-list">${log.map((l) => `<div class="qa ${l.ok ? 'ok' : 'ng'}"><b><span class="qa-st">${ic(l.ok ? 'check-circle' : 'x-circle', { size: 18, weight: 'bold' })}</span><span>${esc(l.c.q)}</span></b><p>${esc(l.c.a)}</p></div>`).join('')}</div>`;
      $('#retry').onclick = render;
    };
    const key = (e) => {
      const n = +e.key;
      if (n >= 1 && n <= 4) { const b = $$('.opt')[n - 1]; b && !b.disabled && b.click(); }
      if (e.key === 'Enter') $('#next') && $('#next').click();
    };
    document.addEventListener('keydown', key);
    cleanup = () => document.removeEventListener('keydown', key);
    draw();
  };
  routes.quiz.tab = (cat) => (cat === 'tccc' ? 'tccc' : 'cbrn');

  // ---------- 모의 질의응답 (유창성 속도 + 취약 우선) ----------
  routes.exam = () => {
    setHeader('모의 질의응답', '#cbrn');
    let mode = 'smart';
    const buildDeck = () => {
      if (mode === 'random') return shuffle(CBRN).slice(0, 10);
      return shuffle(CBRN).sort((a, b) => {
        const ra = srsGet('cbrn:' + a.id), rb = srsGet('cbrn:' + b.id);
        const sa = (srsIsDue('cbrn:' + a.id) ? 10 : 0) + (ra.lapses || 0) * 3 - ra.box;
        const sb = (srsIsDue('cbrn:' + b.id) ? 10 : 0) + (rb.lapses || 0) * 3 - rb.box;
        return sb - sa;
      }).slice(0, 10);
    };
    let qs = buildDeck();
    let i = 0;
    const res = [];
    let t0 = Date.now(), timer = null;

    const draw = () => {
      if (i >= qs.length) return finish();
      const c = qs[i];
      t0 = Date.now();
      app.innerHTML = `
        <div class="seg"><button data-m="smart" class="${mode === 'smart' ? 'on' : ''}">취약·복습 우선</button><button data-m="random" class="${mode === 'random' ? 'on' : ''}">전체 랜덤</button></div>
        <div class="quiz-top"><span class="tnum">질문 ${i + 1} / ${qs.length}</span><span class="timer tnum">${ic('clock', { size: 15 })} <span id="tm">00:00</span></span></div>
        <div class="bar thin"><i style="width:${(i / qs.length) * 100}%"></i></div>
        <div class="exam-card">
          <div class="examiner">${ic('user-check', { size: 15, weight: 'bold' })} 평가관 질문 · ${esc(catName(c.cat))}</div>
          <p class="exam-q">${esc(c.q)}</p>
          <div class="exam-a" id="ea" hidden><small>모범답안</small><p>${esc(c.a)}</p></div>
        </div>
        <div id="ctrl"><button class="btn block" id="reveal">소리 내어 답한 뒤 정답 확인</button></div>
      `;
      $$('.seg button').forEach((b) => {
        b.onclick = () => {
          if (i > 0 || res.length > 0) return;
          mode = b.dataset.m; qs = buildDeck(); draw();
        };
      });
      clearInterval(timer);
      timer = setInterval(() => { const el = $('#tm'); if (el) el.textContent = fmtTime(Math.floor((Date.now() - t0) / 1000)); }, 500);
      $('#reveal').onclick = () => {
        const sec = Math.floor((Date.now() - t0) / 1000);
        clearInterval(timer);
        const speedTag = sec <= 5 ? '즉답 (5초 이하)' : sec <= 10 ? '양호 (10초 이하)' : `지연 (${sec}초)`;
        $('#ea').hidden = false;
        $('#ctrl').innerHTML = `<p class="hint">내 답변은 어땠나요? · 응답 속도: <b>${speedTag}</b></p><div class="self3">
          <button class="sbtn bad" data-v="0">${ic('x', { size: 22, weight: 'bold' })}<small>틀림 (재복습)</small></button>
          <button class="sbtn mid" data-v="0.5">${ic('triangle', { size: 22, weight: 'bold' })}<small>일부 (1일)</small></button>
          <button class="sbtn good" data-v="1">${ic('circle', { size: 22, weight: 'bold' })}<small>${sec <= 5 ? '즉답 완벽' : '완벽'}</small></button></div>`;
        $$('.sbtn').forEach((b) => {
          b.onclick = () => {
            const v = +b.dataset.v;
            res.push({ c, v, sec });
            const g = v === 0 ? 1 : v < 1 ? 2 : (sec <= 5 ? 4 : 3);
            srsRate('cbrn:' + c.id, g);
            i++; draw();
          };
        });
      };
    };

    const finish = () => {
      clearInterval(timer);
      const sc = Math.round((res.reduce((a, r) => a + r.v, 0) / res.length) * 100);
      const avgSec = Math.round(res.reduce((a, r) => a + r.sec, 0) / res.length);
      logHistory('모의 질의응답', `화생방 10문항 · 평균 ${avgSec}초`, sc);
      app.innerHTML = result(sc, `평균 응답 ${avgSec}초 · ${sc >= 80 ? '합격권이에요!' : '취약 문항이 복습 큐에 등록됐어요'}`, [
        `<button class="btn" id="retry">새 질문 10개</button>`, `<a class="btn ghost" href="#wrong">취약 · 오답노트</a>`
      ]) + `<div class="qa-list">${res.map((r) => `<div class="qa ${r.v === 1 ? 'ok' : 'ng'}"><b><span class="qa-st">${ic(r.v === 1 ? 'check-circle' : r.v ? 'triangle' : 'x-circle', { size: 18, weight: 'bold' })}</span><span>${esc(r.c.q)} (${r.sec}초)</span></b><p>${esc(r.c.a)}</p></div>`).join('')}</div>`;
      $('#retry').onclick = render;
    };
    cleanup = () => clearInterval(timer);
    draw();
  };
  routes.exam.tab = 'cbrn';

  // ---------- 취약 · 오답노트 ----------
  routes.wrong = () => {
    setHeader('취약 · 오답노트', '#cbrn');
    const list = poolFor('wrong').sort((a, b) => (srsGet('cbrn:' + b.id).lapses || 0) - (srsGet('cbrn:' + a.id).lapses || 0));
    if (!list.length) { app.innerHTML = empty('취약 문항이 없어요', '#cbrn', '틀리거나 망각한 문항이 자동으로 여기에 모여요.', 'check-circle'); return; }
    app.innerHTML = `
      <div class="toss-top">
        <p class="toss-top-sub">반복 실수 순 정렬 · ${list.length}문항</p>
        <h1 class="toss-top-title">자주 틀리는 문항만<br>모아서 인출해요</h1>
      </div>
      <div class="btn-row"><a class="btn" href="#flash/wrong">인출 카드로 복습</a><a class="btn ghost" href="#quiz/wrong">변별 퀴즈 풀기</a></div>
      <div class="qa-list">${list.map((c) => {
        const l = srsGet('cbrn:' + c.id).lapses || 0;
        return `<div class="qa ng"><b>${esc(c.q)}${l ? ` <span class="badge-chip badge-red tnum">${l}회 실수</span>` : ''}</b><p>${esc(c.a)}</p><button class="x" data-id="${c.id}" aria-label="숙달 처리">${ic('check', { size: 14, weight: 'bold' })} 외웠음</button></div>`;
      }).join('')}</div>`;
    $$('.x').forEach((b) => {
      b.onclick = () => {
        delete S.wrong[b.dataset.id];
        srsRate('cbrn:' + b.dataset.id, 3);
        routes.wrong();
      };
    });
  };
  routes.wrong.tab = 'cbrn';

  // ---------- 정신전력 메인 & 문항별 허브 ----------
  const CONN = /(이러한 측면에서|이는 결국|대표적 예로|세부적으로|따라서|결국|더불어|아울러|또한|하지만|이제|흔히|이후)/g;
  const roleOf = (sec, k) => (sec.flow && sec.flow[k]) || { r: '', cue: '' };
  const roleTag = (sec, k) => (roleOf(sec, k).r ? `<span class="role">${esc(roleOf(sec, k).r)}</span>` : '');
  const sentHtml = (it, { hide = false, conn = true, miss = null } = {}) => parse(it).map((t) => {
    if (t.kw) return `<mark class="kw ${hide ? 'hid' : ''} ${miss && miss.has(t.s) ? 'miss' : ''}">${esc(t.s)}</mark>`;
    const e = esc(t.s);
    return conn ? e.replace(CONN, '<b class="conn">$1</b>') : e;
  }).join('');
  const storyHtml = (q) => q.story ? `<div class="story">${q.story.split('‖').map((part) => `<div class="story-line">${part.split('→').map((x) => `<span>${esc(x.trim())}</span>`).join('<i>→</i>')}</div>`).join('')}</div>` : '';
  const lisIdx = (arr) => {
    const n = arr.length, len = Array(n).fill(1), prev = Array(n).fill(-1);
    let best = -1;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) if (arr[j] < arr[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
      if (best < 0 || len[i] > len[best]) best = i;
    }
    const out = new Set();
    for (let i = best; i >= 0; i = prev[i]) out.add(i);
    return out;
  };

  routes.mind = () => {
    const avg = Math.round(MIND.map((q) => (S.mind[q.id] && S.mind[q.id].best) || 0).reduce((a, b) => a + b, 0) / MIND.length);
    setHeader('정신전력', false, `<span class="badge-chip badge-primary tnum">평균 ${avg}점</span>`);
    app.innerHTML = `
      <div class="toss-top">
        <p class="toss-top-sub">정신전력 ${MIND.length}문항 · 장문 청킹 암기</p>
        <h1 class="toss-top-title">긴 글은 문장 단위로 쪼개고<br>약한 문장만 집중 인출해요</h1>
      </div>

      <a class="due-cta" href="#mind-mock" style="margin-bottom:16px">
        <div class="due-cta-left">
          <div class="due-cta-ic">${ic('note-pencil', { size: 22, weight: 'bold' })}</div>
          <div>
            <b>실전 랜덤 백지 모의고사</b>
            <span>4문항 중 무작위 출제 · 힌트 없이 실전 채점</span>
          </div>
        </div>
        <span class="due-cta-pill">시험 시작</span>
      </a>

      ${['A안', 'B안'].map((set) => `
        <h2 class="sec-title">${set}</h2>
        <div class="list">${MIND.filter((q) => q.set === set).map((q) => {
          const r = S.mind[q.id] || {};
          const best = r.best || 0;
          const st = mindSentenceStats(q);
          return `<a class="row link" href="#mq/${q.id}">
            <div class="badge-id">${q.id}</div>
            <div class="row-body">
              <b>${esc(q.title)}</b>
              <span>문장 숙달 ${st.mastered}/${st.total}${st.weak ? ` · 복습 ${st.weak}문장` : ''} · 최고 ${best}점</span>
              <div class="bar sm"><i style="width:${best}%"></i></div>
            </div>
            <div class="row-score tnum">${best}점</div>
            <div class="chev">${ic('caret-right', { size: 18 })}</div></a>`;
        }).join('')}</div>`).join('')}
    `;
  };

  routes.mq = (id) => {
    const q = MIND.find((x) => x.id === id);
    if (!q) return go('mind');
    setHeader(q.id, '#mind');
    const r = S.mind[q.id] || {};
    const kws = keywordsOf(q);
    const st = mindSentenceStats(q);
    const sentDots = q.sections.flatMap((sec, si) => sec.items.map((_, k) => srsGet(`mind-s:${id}:${si}-${k}`).box));

    // 현재 숙달도에 따른 추천 다음 단계 계산
    let recTitle = '1단계: 흐름 잡기부터 시작해요';
    let recSub = '문장별 역할과 유도 질문으로 전체 뼈대를 세워보세요';
    let recHref = `#flow/${id}`;
    if (st.weak > 0) {
      recTitle = `약점 문장 ${st.weak}개 집중 인출하기`;
      recSub = '전체 글을 다시 쓰지 않고 막힌 문장만 골라 빠르게 보완해요';
      recHref = `#sentence/${id}`;
    } else if (st.mastered < st.total && (r.best || 0) < 70) {
      recTitle = '빈칸 Lv2 · 키워드 인출 도전';
      recSub = '초성 없이 핵심 키워드를 직접 채워 기억을 인출해요';
      recHref = `#cloze/${id}/2`;
    } else if ((r.best || 0) >= 70) {
      recTitle = '실전 백지 쓰기로 최종 점검';
      recSub = '키워드 60% + 일치도 25% + 흐름 15% 자동 채점';
      recHref = `#write/${id}`;
    }

    app.innerHTML = `
      <div class="q-head">
        <span class="badge-id lg">${q.id}</span>
        <h2>${esc(q.title)}</h2>
        <div class="q-head-meta">
          <span class="badge-chip badge-primary tnum">핵심키워드 ${kws.length}개</span>
          <span class="badge-chip badge-green tnum">최고 ${r.best || 0}점</span>
          <span class="badge-chip badge-neutral tnum">문장 숙달 ${st.mastered}/${st.total}</span>
        </div>
        <div class="sent-dots">${sentDots.map((b, idx) => `<span class="sdot b${b}" title="문장 ${idx + 1} (Lv${b})">${idx + 1}</span>`).join('')}</div>
      </div>

      <a class="rec-card" href="${recHref}">
        <div>
          <span class="badge-chip badge-primary" style="margin-bottom:4px">추천 다음 단계</span>
          <b>${esc(recTitle)}</b>
          <small>${esc(recSub)}</small>
        </div>
        <span class="pill">시작</span>
      </a>

      <h2 class="sec-title" style="display:flex;align-items:center;gap:7px">${ic('compass', { size: 19, weight: 'bold' })} 이 문항의 흐름</h2>
      ${storyHtml(q)}

      <div class="stage-group">
        <div class="stage-lbl">Phase 1 · 거시 구조와 논리 순서</div>
        <div class="steps">
          <a class="step" href="#flow/${id}"><i>1</i><div class="step-body"><b>흐름 잡기</b><small>문장별 역할 · 유도 질문으로 구술 인출</small></div><span class="chev">${ic('caret-right', { size: 18 })}</span></a>
          <a class="step" href="#read/${id}"><i>2</i><div class="step-body"><b>정교화 읽기</b><small>역할 라벨 · 연결어 · 키워드 가리기</small></div><span class="chev">${ic('caret-right', { size: 18 })}</span></a>
          <a class="step" href="#sorder/${id}"><i>3</i><div class="step-body"><b>문장 순서 맞추기</b><small>논리 흐름대로 문장 배열</small></div><span class="chev">${ic('caret-right', { size: 18 })}</span></a>
        </div>
      </div>

      <div class="stage-group">
        <div class="stage-lbl">Phase 2 · 점진적 소거 인출 (Fading)</div>
        <div class="steps">
          <a class="step" href="#initial/${id}"><i>4</i><div class="step-body"><b>첫 글자 인출</b><small>어절 첫 글자만 보고 문장별 자가체크</small></div><span class="chev">${ic('caret-right', { size: 18 })}</span></a>
          <a class="step" href="#cloze/${id}/1"><i>5</i><div class="step-body"><b>빈칸 Lv1</b><small>핵심 키워드 + 초성 힌트</small></div><span class="chev">${ic('caret-right', { size: 18 })}</span></a>
          <a class="step" href="#cloze/${id}/2"><i>6</i><div class="step-body"><b>빈칸 Lv2</b><small>핵심 키워드 (힌트 없음)</small></div><span class="chev">${ic('caret-right', { size: 18 })}</span></a>
          <a class="step" href="#cloze/${id}/3"><i>7</i><div class="step-body"><b>빈칸 Lv3</b><small>키워드 + 일반 어절 확장 소거</small></div><span class="chev">${ic('caret-right', { size: 18 })}</span></a>
        </div>
      </div>

      <div class="stage-group">
        <div class="stage-lbl">Phase 3 · 약점 문장 정밀 집중</div>
        <div class="steps">
          <a class="step" href="#sentence/${id}"><i>8</i><div class="step-body"><b>약점 문장 인출</b><small>${st.weak ? `복습 필요 ${st.weak}문장 우선 · 앞문장 꼬리 연결` : '한 문장씩 정밀 타이핑 · 4단계 SRS'}</small></div><span class="chev">${ic('caret-right', { size: 18 })}</span></a>
        </div>
      </div>

      <div class="stage-group">
        <div class="stage-lbl">Phase 4 · 실전 백지 완성</div>
        <div class="steps">
          <a class="step" href="#write/${id}/hint"><i>9</i><div class="step-body"><b>백지 쓰기 · 흐름 힌트</b><small>문장별 칸에 역할 라벨을 보고 쓰기</small></div><span class="chev">${ic('caret-right', { size: 18 })}</span></a>
        </div>
        <a class="step final" href="#write/${id}"><i>${ic('note-pencil', { size: 18, weight: 'bold' })}</i><div class="step-body"><b>백지 쓰기 (실전)</b><small>통째로 쓰기 · 누락 문장 자동 복습 등록</small></div><span class="chev">${ic('caret-right', { size: 18 })}</span></a>
      </div>

      <h2 class="sec-title">우리의 자세 (개인 각오 메모)</h2>
      <textarea class="memo" id="memo" placeholder="직책과 연계한 개인 각오 · 경험/사례를 적어두세요. (자동 저장, 개인 경험·사례 작성 시 가점)">${esc(S.memo[id] || '')}</textarea>
    `;
    $('#memo').oninput = (e) => { S.memo[id] = e.target.value; save(); };
  };
  routes.mq.tab = 'mind';

  // 흐름 잡기 (문장별 SRS 연동)
  routes.flow = (id) => {
    const q = MIND.find((x) => x.id === id);
    if (!q) return go('mind');
    setHeader(q.id + ' 흐름 잡기', '#mq/' + id);
    const total = q.sections.reduce((a, s) => a + s.items.length, 0);
    const marks = {};
    app.innerHTML = `
      <div class="tip"><span class="tip-ic">${ic('compass', { size: 18, weight: 'bold' })}</span><div>각 문장의 <b>역할</b>과 <b>유도 질문</b>을 보고 소리 내어 말해보세요. 몰랐던 문장은 자동으로 약점 문장 큐에 들어가요.</div></div>
      ${storyHtml(q)}
      <div class="toolbar" style="margin-top:12px"><button class="pill ghost" id="openall">전체 펼치기</button></div>
      ${q.sections.map((sec, si) => `
        <h2 class="sec-title">${esc(sec.h)}</h2>
        <div class="timeline">${sec.items.map((it, k) => `
          <div class="node" data-key="${si}-${k}">
            <div class="node-dot">${NUM[k]}</div>
            <div class="node-body">
              <div class="node-role">${esc(roleOf(sec, k).r)}</div>
              <p class="node-cue">${esc(roleOf(sec, k).cue)}</p>
              <div class="node-ans" hidden><p>${sentHtml(it)}</p>
                <div class="node-mark"><button class="mk ng" data-v="0">${ic('x', { size: 15, weight: 'bold' })} 몰랐음</button><button class="mk ok" data-v="1">${ic('circle', { size: 15, weight: 'bold' })} 떠올림</button></div></div>
              <button class="node-open">탭해서 정답 보기</button>
            </div>
          </div>`).join('')}</div>`).join('')}
      <div id="fres"></div>`;
    const open = (node) => { $('.node-ans', node).hidden = false; const b = $('.node-open', node); if (b) b.remove(); };
    $$('.node').forEach((node) => {
      $('.node-open', node).onclick = () => open(node);
      $$('.mk', node).forEach((b) => {
        b.onclick = () => {
          const v = +b.dataset.v;
          marks[node.dataset.key] = v;
          srsRate(`mind-s:${id}:${node.dataset.key}`, v ? 3 : 1);
          node.classList.remove('good', 'bad'); node.classList.add(v ? 'good' : 'bad');
          const n = Object.keys(marks).length;
          if (n === total) {
            const sc = Math.round((Object.values(marks).reduce((a, x) => a + x, 0) / total) * 100);
            logHistory('흐름 잡기', q.id, sc);
            const hasWeak = Object.values(marks).some((x) => !x);
            $('#fres').innerHTML = `<div class="feedback ${sc >= 80 ? 'good' : 'bad'}"><b>${sc}점 · ${total}문장 중 ${Object.values(marks).filter(Boolean).length}개 떠올림</b></div>
              <div class="btn-row">${hasWeak ? `<a class="btn" href="#sentence/${id}">막힌 문장 집중 인출</a>` : `<a class="btn" href="#sorder/${id}">다음: 문장 순서</a>`}<button class="btn ghost" id="redo">다시</button></div>`;
            $('#redo').onclick = render;
            $('#fres').scrollIntoView({ behavior: 'smooth' });
          }
        };
      });
    });
    $('#openall').onclick = () => $$('.node').forEach(open);
  };
  routes.flow.tab = 'mind';

  // 읽기
  routes.read = (id) => {
    const q = MIND.find((x) => x.id === id);
    if (!q) return go('mind');
    setHeader(q.id + ' 읽기', '#mq/' + id);
    let hide = false, roles = true;
    const draw = () => {
      app.innerHTML = `
        <div class="toolbar">
          <label class="sw"><input type="checkbox" id="roles" ${roles ? 'checked' : ''}><span></span>역할 보기</label>
          <label class="sw"><input type="checkbox" id="hide" ${hide ? 'checked' : ''}><span></span>키워드 가리기</label>
        </div>
        <div class="doc">${q.sections.map((sec) => `<h3>${esc(sec.h)}</h3>${sec.items.map((it, k) => `<p>${roles ? roleTag(sec, k) : ''}<i class="num">${NUM[k]}</i>${sentHtml(it, { hide })}</p>`).join('')}`).join('')}
        <h3>${q.id.startsWith('B-2') ? '마' : '다'}. 우리의 자세</h3><p class="muted">${esc(S.memo[id] || '직책과 연계하여 개인의 각오 작성 (문항 화면에서 작성)')}</p></div>
        <p class="hint"><b class="conn">밑줄 글씨</b> = 문장을 잇는 연결어 · 가려진 키워드를 탭해서 맞춰보세요</p>
        <div class="sticky-act"><a class="btn" href="#sorder/${id}">다음: 문장 순서 맞추기</a></div>`;
      $('#hide').onchange = (e) => { hide = e.target.checked; draw(); };
      $('#roles').onchange = (e) => { roles = e.target.checked; draw(); };
      $$('.kw').forEach((m) => { m.onclick = () => m.classList.toggle('hid'); });
    };
    draw();
  };
  routes.read.tab = 'mind';

  // 문장 순서 맞추기
  routes.sorder = (id) => {
    const q = MIND.find((x) => x.id === id);
    if (!q) return go('mind');
    setHeader(q.id + ' 문장 순서', '#mq/' + id);
    const secs = q.sections.map((sec, si) => ({ sec, si })).filter((x) => x.sec.items.length >= 2);
    let miss = 0, placed = 0;
    const total = secs.reduce((a, x) => a + x.sec.items.length, 0);
    app.innerHTML = `
      <div class="tip"><span class="tip-ic">${ic('list-numbers', { size: 18, weight: 'bold' })}</span><div>각 단락의 문장을 <b>논리 순서대로</b> 탭하세요. 맞히면 그 문장의 역할이 나타나요.</div></div>
      ${secs.map(({ sec, si }) => `
        <h2 class="sec-title">${esc(sec.h)}</h2>
        <div class="ord-done" id="d${si}"></div>
        <div class="ord-pool" data-si="${si}" data-next="0">${shuffle(sec.items.map((it, k) => ({ it, k }))).map(({ it, k }) => `<button class="ord sent" data-k="${k}">${sentHtml(it, { conn: false })}</button>`).join('')}</div>`).join('')}
      <div id="ores"></div>`;
    $$('.ord-pool').forEach((pool) => {
      const si = +pool.dataset.si, sec = q.sections[si];
      $$('.ord', pool).forEach((b) => {
        b.onclick = () => {
          const next = +pool.dataset.next;
          if (+b.dataset.k !== next) { miss++; vibrate(60); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
          pool.dataset.next = next + 1; placed++;
          b.remove();
          $('#d' + si).insertAdjacentHTML('beforeend', `<div class="ord ok sent"><i>${NUM[next]}</i><div>${roleTag(sec, next)}<div>${sentHtml(sec.items[next])}</div></div></div>`);
          if (placed === total) {
            const sc = Math.max(0, Math.round(((total - miss) / total) * 100));
            logHistory('문장 순서', q.id, sc);
            $('#ores').innerHTML = `<div class="feedback ${miss ? 'bad' : 'good'}"><b>${sc}점 · 실수 ${miss}번</b></div>
              <div class="btn-row"><button class="btn ghost" id="redo">다시</button><a class="btn" href="#initial/${id}">다음: 첫 글자 인출</a></div>`;
            $('#redo').onclick = render;
            $('#ores').scrollIntoView({ behavior: 'smooth' });
            if (!miss) confetti();
          }
        };
      });
    });
  };
  routes.sorder.tab = 'mind';

  // 첫 글자 (문장별 자가체크 추가)
  routes.initial = (id) => {
    const q = MIND.find((x) => x.id === id);
    if (!q) return go('mind');
    setHeader(q.id + ' 첫 글자', '#mq/' + id);
    const wordHtml = (w, kw) => {
      if (!w.trim()) return esc(w);
      const chars = [...w];
      const first = chars[0];
      const rest = chars.slice(1).map((c) => (/[\s.,·'"()<>:]/.test(c) ? c : '○')).join('');
      return `<span class="iw ${kw ? 'k' : ''}" data-full="${esc(w)}" data-short="${esc(first + rest)}">${esc(first + rest)}</span>`;
    };
    app.innerHTML = `
      <div class="tip"><span class="tip-ic">${ic('lightbulb', { size: 18, weight: 'bold' })}</span><div>문장의 <b>역할</b>과 어절 <b>첫 글자</b>만 보고 소리 내어 완성하세요. 문장 끝에 막힘/통과를 체크하면 약점 문장으로 연결돼요.</div></div>
      <div class="toolbar"><button class="pill" id="showall">전체 보기</button><button class="pill ghost" id="hideall">전체 가리기</button></div>
      <div class="doc initial">${q.sections.map((sec, si) => `<h3>${esc(sec.h)}</h3>${sec.items.map((it, k) => `<p>${roleTag(sec, k)}<i class="num">${NUM[k]}</i>${parse(it).map((t) => t.s.split(/(\s+)/).map((w) => wordHtml(w, t.kw)).join('')).join('')} <span class="row-act" style="display:inline-flex;vertical-align:middle;margin-left:6px"><button class="pill neutral smk" data-sk="${si}-${k}" data-g="1">막힘</button><button class="pill ghost smk" data-sk="${si}-${k}" data-g="3">통과</button></span></p>`).join('')}`).join('')}</div>
      <div class="sticky-act"><a class="btn ghost" href="#sentence/${id}">약점 문장 집중</a><a class="btn" href="#cloze/${id}/1">다음: 빈칸 Lv1</a></div>`;
    $$('.iw').forEach((s) => { s.onclick = () => { const open = s.classList.toggle('open'); s.textContent = open ? s.dataset.full : s.dataset.short; }; });
    $('#showall').onclick = () => $$('.iw').forEach((s) => { s.classList.add('open'); s.textContent = s.dataset.full; });
    $('#hideall').onclick = () => $$('.iw').forEach((s) => { s.classList.remove('open'); s.textContent = s.dataset.short; });
    $$('.smk').forEach((b) => {
      b.onclick = () => {
        const g = +b.dataset.g;
        srsRate(`mind-s:${id}:${b.dataset.sk}`, g);
        b.parentElement.querySelectorAll('.smk').forEach((x) => { x.style.opacity = '0.4'; });
        b.style.opacity = '1';
      };
    });
  };
  routes.initial.tab = 'mind';

  // 빈칸 Lv1~3 (Lv3 결정적 점진 소거 + 문장 SRS 반영)
  routes.cloze = (id, lvStr = '1') => {
    const q = MIND.find((x) => x.id === id);
    if (!q) return go('mind');
    const lv = +lvStr;
    setHeader(`${q.id} 빈칸 Lv${lv}`, '#mq/' + id);
    const blanks = [];
    const STOP = /^[\d①-⑨().,·'"<>:]+$/;
    const blankHtml = (ans, hintOn, sk) => {
      const idx = blanks.push({ ans, sk }) - 1;
      const w = Math.max(3, Math.min(18, [...ans].length + 1));
      const ph = hintOn ? chosung(ans) : '';
      return `<input class="blank" data-i="${idx}" style="width:${w * 1.05}em" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off" spellcheck="false">`;
    };
    const body = q.sections.map((sec, si) => `<h3>${esc(sec.h)}</h3>${sec.items.map((it, k) => {
      const sk = `${si}-${k}`;
      let wIdx = 0;
      return `<p>${roleTag(sec, k)}<i class="num">${NUM[k]}</i>${parse(it).map((t) => {
        if (t.kw) return blankHtml(t.s, lv === 1, sk);
        if (lv < 3) return esc(t.s);
        return t.s.split(/(\s+)/).map((w) => {
          wIdx++;
          const core = w.replace(/[.,'"]+$/, '');
          const tail = w.slice(core.length);
          // 결정적 소거: 짝수·3배수 중심 ~55% 어절 빈칸
          if (!core.trim() || STOP.test(core) || core.length < 2 || ((si + k + wIdx) % 9 < 4)) return esc(w);
          return blankHtml(core, false, sk) + esc(tail);
        }).join('');
      }).join('')}</p>`;
    }).join('')}`).join('');

    app.innerHTML = `
      <div class="lv-tabs">${[1, 2, 3].map((n) => `<a href="#cloze/${id}/${n}" class="${n === lv ? 'on' : ''}">Lv${n}</a>`).join('')}</div>
      <div class="doc cloze">${body}</div>
      <p class="hint">띄어쓰기·문장부호는 무시하고, 짧은 오타나 조사 차이는 정답(≈)으로 인정해요.</p>
      <div class="sticky-act"><button class="btn ghost" id="peek">정답 보기</button><button class="btn" id="check">채점하기</button></div>
      <div id="cres"></div>`;

    const inputs = $$('.blank');
    inputs.forEach((inp, k) => {
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (inputs[k + 1] || $('#check')).focus(); } });
    });
    $('#peek').onclick = () => inputs.forEach((inp) => { if (!inp.classList.contains('ok') && !inp.classList.contains('near')) { inp.value = blanks[inp.dataset.i].ans; inp.classList.add('peeked'); } });
    $('#check').onclick = () => {
      let ok = 0, near = 0;
      const wrong = [];
      const sentOk = {};
      inputs.forEach((inp) => {
        const { ans, sk } = blanks[inp.dataset.i];
        const peeked = inp.classList.contains('peeked');
        const j = peeked ? 'ng' : judge(inp.value, ans);
        inp.classList.remove('ok', 'near', 'ng');
        inp.classList.add(j === 'exact' ? 'ok' : j === 'near' ? 'near' : 'ng');
        inp.title = j === 'exact' ? '' : ans;
        if (!sentOk[sk]) sentOk[sk] = { hit: 0, tot: 0 };
        sentOk[sk].tot++;
        if (j === 'exact') { ok++; sentOk[sk].hit++; }
        else if (j === 'near') { ok++; near++; sentOk[sk].hit++; }
        else if (!peeked) wrong.push({ ans, val: inp.value });
      });
      // 문장별 SRS 업데이트
      Object.entries(sentOk).forEach(([sk, v]) => {
        if (v.hit < v.tot) srsRate(`mind-s:${id}:${sk}`, 1);
        else if (lv >= 2) srsRate(`mind-s:${id}:${sk}`, 3);
      });
      const sc = Math.round((ok / inputs.length) * 100);
      logHistory(`빈칸 Lv${lv}`, q.id, sc);
      $('#cres').innerHTML = `<div class="feedback ${sc >= 80 ? 'good' : 'bad'}"><b>${sc}점 (${ok}/${inputs.length})${near ? ` · 오타/조사 허용 ${near}개` : ''}</b>
          <span>주황 칸(≈)은 정답 처리됐지만 표기가 조금 달라요. 길게 누르면 정답이 보여요.</span></div>
        ${wrong.length ? `<div class="panel"><h3>틀린 빈칸</h3>${wrong.map((w) => `<div class="wrong-row"><span class="ng-t">${esc(w.val) || '(빈칸)'}</span><i>→</i><b>${esc(w.ans)}</b></div>`).join('')}</div>` : ''}
        <div class="btn-row">${wrong.length ? `<a class="btn" href="#sentence/${id}">약점 문장만 집중 복습</a>` : lv < 3 ? `<a class="btn" href="#cloze/${id}/${lv + 1}">Lv${lv + 1} 도전</a>` : `<a class="btn" href="#write/${id}/hint">백지 쓰기 도전</a>`}<button class="btn ghost" id="redo">다시</button></div>`;
      $('#redo').onclick = render;
      $('#cres').scrollIntoView({ behavior: 'smooth' });
    };
  };
  routes.cloze.tab = 'mind';

  // 약점 문장 집중 인출 (NEW: 청킹 + 앞문장 꼬리 연결 + 4단계 SRS)
  routes.sentence = (id, filter = 'weak') => {
    const q = MIND.find((x) => x.id === id);
    if (!q) return go('mind');
    setHeader(`${q.id} 문장 집중 인출`, '#mq/' + id);

    const allSents = [];
    q.sections.forEach((sec, si) => {
      sec.items.forEach((it, k) => {
        const sk = `mind-s:${id}:${si}-${k}`;
        const prevIt = k > 0 ? sec.items[k - 1] : (si > 0 ? q.sections[si - 1].items.slice(-1)[0] : '');
        allSents.push({ si, k, sec, it, sk, prevIt, rec: srsGet(sk) });
      });
    });

    const weakSents = allSents.filter((s) => s.rec.box <= 2 || s.rec.lapses > 0 || srsIsDue(s.sk));
    let deck = filter === 'all' ? allSents.slice() : (weakSents.length ? weakSents.slice() : allSents.slice());
    let i = 0, passed = 0, again = 0;

    const draw = () => {
      if (i >= deck.length) {
        const tot = passed + again;
        const sc = tot ? Math.round((passed / tot) * 100) : 100;
        logHistory('약점 문장 인출', q.id, sc);
        app.innerHTML = result(sc, `${q.id} 문장 인출 완료 · 통과 ${passed} / 재복습 ${again}`, [
          `<a class="btn" href="#write/${id}">실전 백지 쓰기 도전</a>`,
          `<a class="btn ghost" href="#mq/${id}">문항 홈</a>`
        ]);
        if (sc >= 85) confetti();
        return;
      }
      const cur = deck[i];
      const role = roleOf(cur.sec, cur.k);
      const kws = parse(cur.it).filter((t) => t.kw).map((t) => t.s);
      const prevPlain = cur.prevIt ? plain(cur.prevIt) : '';

      app.innerHTML = `
        <div class="sub-pills">
          <a class="sub-pill ${filter !== 'all' ? 'on' : ''}" href="#sentence/${id}/weak">약점·복습 우선 (${weakSents.length || allSents.length})</a>
          <a class="sub-pill ${filter === 'all' ? 'on' : ''}" href="#sentence/${id}/all">전체 문장 (${allSents.length})</a>
        </div>
        <div class="quiz-top"><span class="tnum">${i + 1} / ${deck.length}</span><span class="badge-chip badge-neutral">${esc(cur.sec.h)}</span></div>
        <div class="bar thin"><i style="width:${(i / deck.length) * 100}%"></i></div>
        <div class="paper">
          <div class="q-head-meta" style="margin-top:0;margin-bottom:10px">
            <span class="role">${esc(role.r || `문장 ${cur.k + 1}`)}</span>
            <span class="badge-chip badge-primary tnum">키워드 ${kws.length}개</span>
          </div>
          ${prevPlain ? `<div class="sent-bridge"><strong>앞 문장 끝:</strong> …${esc(prevPlain.slice(-36))}</div>` : ''}
          <p class="paper-q" style="border-bottom:0;margin:4px 0 12px;padding-bottom:0">${esc(role.cue || '역할에 맞는 문장을 작성해 보세요.')}</p>
          <textarea class="sheet sm" id="st-inp" rows="4" placeholder="이 문장을 직접 써보거나 머릿속으로 떠올린 뒤 확인하세요..."></textarea>
          <div id="st-hint" class="hint-box-inline" hidden>키워드 초성: ${esc(kws.map((w) => chosung(w)).join(' · '))}</div>
          <div id="st-res" style="margin-top:12px"></div>
        </div>
        <div id="st-ctrl" class="sticky-act">
          <button class="btn ghost" id="st-hint-btn">초성 힌트</button>
          <button class="btn" id="st-check">확인 · 채점</button>
        </div>
      `;

      $('#st-hint-btn').onclick = () => { $('#st-hint').hidden = false; };
      $('#st-check').onclick = () => {
        const val = ($('#st-inp').value || '').trim();
        const kRes = kws.map((w) => ({ w, f: findKw(w, val) }));
        const hit = kRes.reduce((a, x) => a + x.f.v, 0);
        const sim = val ? Math.round(dice(val, plain(cur.it)) * 100) : 0;
        const missSet = new Set(kRes.filter((x) => x.f.v < 1).map((x) => x.w));
        $('#st-res').innerHTML = `
          ${val ? `<div class="feedback ${sim >= 70 && hit >= kws.length * 0.8 ? 'good' : 'bad'}" style="margin-top:0;margin-bottom:10px"><b>키워드 ${Math.round(hit * 10) / 10}/${kws.length} · 문장 일치도 ${sim}%</b></div>` : ''}
          <div class="exam-a" style="margin-top:0"><small>모범 문장 (놓친 키워드 빨간색)</small><p>${sentHtml(cur.it, { miss: missSet })}</p></div>
        `;
        $('#st-ctrl').outerHTML = `<div id="st-ctrl"><p class="hint">기억 난이도를 고르면 이 문장의 다음 복습일이 조정돼요.</p>${srsBtnsHtml(cur.sk)}</div>`;
        $$('.srs-btn').forEach((b) => {
          b.onclick = () => {
            const g = +b.dataset.g;
            srsRate(cur.sk, g);
            if (g === 1) {
              again++;
              vibrate(30);
              deck.splice(Math.min(deck.length, i + 3), 0, cur);
            } else {
              passed++;
            }
            i++;
            draw();
          };
        });
      };
    };

    draw();
  };
  routes.sentence.tab = 'mind';

  // 백지 쓰기 (공식 채점 60/25/15 유지 + 문장 SRS 자동 반영)
  const gradeMind = (q, getText, hint) => {
    let kwTotal = 0, kwGot = 0, simSum = 0, simN = 0, flowSum = 0, itemN = 0;
    const secRes = q.sections.map((sec, si) => {
      const secText = hint ? sec.items.map((_, k) => getText(si, k)).join(' ') : getText(si);
      const items = sec.items.map((it, k) => {
        const text = hint ? getText(si, k) : secText;
        const kr = parse(it).filter((t) => t.kw).map((t) => { const f = findKw(t.s, text); return { k: t.s, v: f.v, exact: f.exact, pos: f.pos }; });
        let pos = -1;
        const hit = kr.filter((x) => x.v > 0).sort((a, b) => b.v - a.v)[0];
        if (hit) pos = hit.pos;
        else {
          const head = norm(plain(it)).slice(0, 10);
          const f = fuzzyFind(head, norm(secText));
          if (f.d <= 3) pos = f.pos;
        }
        const sim = hint ? dice(text, plain(it)) : null;
        return { it, k, text, kr, pos, sim };
      });
      items.forEach((x) => { kwTotal += x.kr.length; kwGot += x.kr.reduce((a, y) => a + y.v, 0); });
      if (hint) items.forEach((x) => { simSum += x.sim; simN++; });
      else { simSum += dice(secText, sec.items.map(plain).join(' ')); simN++; }
      const found = items.filter((x) => x.pos >= 0);
      const inOrder = hint ? new Set(found.map((x) => x.k)) : (() => { const s = lisIdx(found.map((x) => x.pos)); return new Set(found.filter((_, i) => s.has(i)).map((x) => x.k)); })();
      items.forEach((x) => { x.state = x.pos < 0 ? 'none' : inOrder.has(x.k) ? 'ok' : 'swap'; });
      flowSum += inOrder.size; itemN += items.length;
      return { sec, si, secText, items };
    });
    const kwRate = kwTotal ? kwGot / kwTotal : 0;
    const simRate = Math.min(1, (simSum / simN) * 1.15);
    const flowRate = itemN ? flowSum / itemN : 0;
    const sc = Math.round(kwRate * 60 + simRate * 25 + flowRate * 15);
    return { sc, kwRate, simRate, flowRate, secRes };
  };

  const renderWriteView = (id, mode, isMock = false) => {
    const q = MIND.find((x) => x.id === id);
    if (!q) return go('mind');
    const hint = mode === 'hint';
    setHeader(isMock ? `실전 모의 · ${q.id}` : q.id + (hint ? ' 백지 · 흐름 힌트' : ' 백지 쓰기'), isMock ? '#mind' : '#mq/' + id);
    const draftKey = (isMock ? 'mock-' : 'draft-') + id + (hint ? '-h' : '');
    const draft = isMock ? {} : (S.memo[draftKey] || {});
    const t0 = Date.now();
    app.innerHTML = `
      ${isMock
        ? `<div class="tip"><span class="tip-ic">${ic('note-pencil', { size: 18, weight: 'bold' })}</span><div><b>실전 랜덤 백지 모의고사</b> — 힌트 없이 한 번에 작성해 기억 인출력을 점검해요. <button class="pill ghost" id="reroll" style="margin-left:6px">다른 문항 뽑기</button></div></div>`
        : `<div class="lv-tabs"><a href="#write/${id}/hint" class="${hint ? 'on' : ''}">흐름 힌트</a><a href="#write/${id}" class="${hint ? '' : 'on'}">실전</a></div>`}
      <div class="paper">
        <div class="paper-head"><span>'26 전투력 측정 [정신전력]</span><span class="timer tnum">${ic('clock', { size: 14 })} <span id="tm">00:00</span></span></div>
        <h2 class="paper-q">${q.id}. ${esc(q.title)}</h2>
        ${q.sections.map((sec, si) => `
          <h3>${esc(sec.h)}</h3>
          ${hint ? sec.items.map((_, k) => `
            <div class="hint-box"><div class="hint-lbl"><i>${NUM[k]}</i>${esc(roleOf(sec, k).r)}</div>
            <textarea class="sheet sm" data-key="${si}-${k}" rows="3" placeholder="${esc(roleOf(sec, k).cue)}">${esc(draft[si + '-' + k] || '')}</textarea></div>`).join('')
            : `<textarea class="sheet" data-key="${si}" rows="${Math.max(4, sec.items.length * 3)}" placeholder="① ...">${esc(draft[si] || '')}</textarea>`}`).join('')}
      </div>
      <p class="hint">채점: 핵심키워드 60% + 문장 일치도 25% + 흐름(문장 순서) 15% · 빠진 문장은 약점 복습 큐에 자동 등록돼요</p>
      <div class="sticky-act"><button class="btn ghost" id="clear">지우기</button><button class="btn" id="grade">제출 · 채점</button></div>
      <div id="wres"></div>`;
    const timer = setInterval(() => { const el = $('#tm'); if (el) el.textContent = fmtTime(Math.floor((Date.now() - t0) / 1000)); }, 500);
    cleanup = () => clearInterval(timer);
    if ($('#reroll')) $('#reroll').onclick = () => routes['mind-mock']();
    $$('.sheet').forEach((ta) => { ta.oninput = () => { if (!isMock) { draft[ta.dataset.key] = ta.value; S.memo[draftKey] = draft; save(); } }; });
    $('#clear').onclick = () => { if (confirm('작성한 내용을 모두 지울까요?')) { if (!isMock) { S.memo[draftKey] = {}; save(); } render(); } };
    $('#grade').onclick = () => {
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      const val = (key) => { const el = $(`.sheet[data-key="${key}"]`); return el ? el.value : ''; };
      const g = gradeMind(q, (si, k) => (hint ? val(si + '-' + k) : val(si)), hint);
      const { sc } = g;
      const r = S.mind[q.id] || { best: 0, tries: 0 };
      let isBest = false;
      if (!hint) { isBest = sc > r.best; r.best = Math.max(r.best, sc); r.tries++; r.last = sc; S.mind[q.id] = r; }

      // 문장별 누락/완성 상태 SRS 자동 반영
      let weakCount = 0;
      g.secRes.forEach((s) => {
        s.items.forEach((x) => {
          const sk = `mind-s:${id}:${s.si}-${x.k}`;
          const allKwOk = x.kr.every((y) => y.v >= 1);
          const okSent = allKwOk && x.state === 'ok';
          if (!okSent) weakCount++;
          if (!hint) srsRate(sk, okSent ? (sc >= 90 ? 4 : 3) : 1);
        });
      });

      logHistory(isMock ? '랜덤 백지시험' : hint ? '백지 쓰기 (힌트)' : '백지 쓰기', q.id, sc);
      clearInterval(timer);
      const chip = (x) => {
        const stIcon = x.v === 1 ? (x.exact ? ic('check', { size: 13, weight: 'bold' }) : '≈') : x.v ? ic('triangle', { size: 12, weight: 'bold' }) : ic('x', { size: 13, weight: 'bold' });
        return `<span class="chip ${x.v === 1 ? (x.exact ? 'ok' : 'okn') : x.v ? 'half' : 'ng'}">${stIcon} ${esc(x.k)}</span>`;
      };
      const stIcon = { ok: ic('check', { size: 12, weight: 'bold' }), swap: ic('arrows-down-up', { size: 12, weight: 'bold' }), none: ic('x', { size: 12, weight: 'bold' }) };
      $('#wres').innerHTML = `
        ${result(sc, `${hint ? '흐름 힌트 모드 (최고 기록 미반영) · ' : isBest ? '최고 기록! · ' : ''}소요 ${fmtTime(elapsed)}`, [])}
        <div class="score-break three">
          <div><b class="tnum">${Math.round(g.kwRate * 100)}%</b><span>핵심키워드<br>60%</span></div>
          <div><b class="tnum">${Math.round(g.simRate * 100)}%</b><span>문장 일치도<br>25%</span></div>
          <div><b class="tnum">${Math.round(g.flowRate * 100)}%</b><span>흐름<br>15%</span></div>
        </div>
        ${g.secRes.map((s) => `
          <div class="panel">
            <h3>${esc(s.sec.h)}</h3>
            <div class="flow-chk">${s.items.map((x) => `<span class="fc-${x.state}" title="${x.state === 'swap' ? '순서가 바뀜' : x.state === 'none' ? '빠짐' : '순서 맞음'}">${stIcon[x.state]} ${esc(roleOf(s.sec, x.k).r || NUM[x.k])}</span>`).join('<i>→</i>')}</div>
            <div class="kw-chips">${s.items.flatMap((x) => x.kr).map(chip).join('')}</div>
            <details open><summary>모범답안과 비교</summary>
              <div class="cmp">
                ${hint ? s.items.map((x) => `<div class="cmp-item">${roleTag(s.sec, x.k)}<p class="mine">${esc(x.text) || '<span class="muted">(미작성)</span>'}</p><p class="model"><i class="num">${NUM[x.k]}</i>${sentHtml(x.it, { conn: false, miss: new Set(x.kr.filter((y) => y.v < 1).map((y) => y.k)) })}</p></div>`).join('')
                  : `<div><small>내 답안</small><p>${esc(s.secText) || '<span class="muted">(미작성)</span>'}</p></div>
                     <div><small>모범답안</small>${s.items.map((x) => `<p>${roleTag(s.sec, x.k)}<i class="num">${NUM[x.k]}</i>${sentHtml(x.it, { conn: false, miss: new Set(x.kr.filter((y) => y.v < 1).map((y) => y.k)) })}</p>`).join('')}</div>`}
              </div>
            </details>
          </div>`).join('')}
        <p class="hint">정확(체크) · ≈ 오타/조사 차이 허용(정답 처리) · △ 일부만 · ✕ 없음 | 흐름 순서 바뀜</p>
        <div class="btn-row">
          ${weakCount ? `<a class="btn" href="#sentence/${id}">빠진 ${weakCount}문장만 집중 복습</a>` : `<button class="btn" id="again">새로 쓰기</button>`}
          ${hint ? `<a class="btn ghost" href="#write/${id}">실전 도전</a>` : `<a class="btn ghost" href="#flow/${id}">흐름 복습</a>`}
        </div>`;
      if ($('#again')) $('#again').onclick = () => { if (!isMock) { S.memo[draftKey] = {}; save(); } render(); };
      $('#wres').scrollIntoView({ behavior: 'smooth' });
      if (isBest && sc >= 80) confetti();
    };
  };

  routes.write = (id, mode) => renderWriteView(id, mode, false);
  routes.write.tab = 'mind';

  // 실전 랜덤 백지 모의고사 (NEW)
  routes['mind-mock'] = () => {
    const sorted = shuffle(MIND).sort((a, b) => ((S.mind[a.id] && S.mind[a.id].best) || 0) - ((S.mind[b.id] && S.mind[b.id].best) || 0));
    const pick = sorted[0];
    renderWriteView(pick.id, undefined, true);
  };
  routes['mind-mock'].tab = 'mind';

  // ---------- TCCC ----------
  const grp = (id) => TCCC_GROUPS.find((g) => g.id === id);
  const sayOf = (it) => (S.tcccSay[it.n] != null ? S.tcccSay[it.n] : it.say);
  const kwOf = (it) => (S.tcccSay[it.n] != null ? [] : it.kw);
  const speak = (text, onend) => {
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[()]/g, ' '));
      u.lang = 'ko-KR'; u.rate = 1.05;
      if (onend) u.onend = onend;
      speechSynthesis.speak(u);
    } catch (e) { onend && onend(); }
  };
  const hush = () => { try { speechSynthesis.cancel(); } catch (e) {} };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const listener = (onText) => {
    if (!SR) return null;
    const r = new SR();
    r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true;
    let on = false;
    r.onresult = (e) => {
      let fin = '', tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript + ' ';
        else tmp += e.results[i][0].transcript;
      }
      onText(fin, tmp);
    };
    r.onend = () => { if (on) { try { r.start(); } catch (e) {} } };
    r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { on = false; onText(null, null, '마이크 권한이 거부됐어요'); } };
    return { start() { on = true; try { r.start(); } catch (e) {} }, stop() { on = false; try { r.abort(); } catch (e) {} } };
  };
  const tcccScore = (vals) => {
    const rows = TCCC_GROUPS.map((g) => {
      const items = TCCC.filter((it) => it.g === g.id);
      const avg = items.reduce((a, it) => a + (vals[it.n] || 0), 0) / items.length;
      return { g, got: Math.round(g.pts * avg * 10) / 10 };
    });
    const total = Math.round(rows.reduce((a, r) => a + r.got, 0) * 10) / 10;
    const pct = Math.round((total / 50) * 100);
    const label = pct >= 90 ? '특급' : pct >= 80 ? '합격 (80%)' : pct >= 70 ? '합격 (70%)' : '불합격';
    return { rows, total, pct, label, conv: Math.round(total * 0.4 * 10) / 10 };
  };
  const phases = () => [...new Set(TCCC_GROUPS.map((g) => g.phase))];

  routes.tccc = () => {
    const t = S.tccc;
    const st = tcccStepStats();
    setHeader('TCCC', false, `<span class="badge-chip badge-red tnum">최고 ${t.best || 0}%</span>`);
    app.innerHTML = `
      <div class="toss-top">
        <p class="toss-top-sub">전투부상자처치 실기 · ${TCCC.length}단계 (숙달 ${st.mastered}/${st.total})</p>
        <h1 class="toss-top-title">구간별로 쪼개 익히고<br>15분 실전으로 완성해요</h1>
      </div>

      <div class="sit-card">
        <small>메시지 카드 ① · 상황부여</small>
        <p>${esc(TCCC_SITUATION.card)}</p>
        <ul>${TCCC_SITUATION.injuries.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <em>${ic('clock', { size: 14, weight: 'bold' })} ${esc(TCCC_SITUATION.time)}</em>
      </div>

      <div class="tip"><span class="tip-ic">${ic('speaker-high', { size: 18, weight: 'bold' })}</span><div><b>분절 → 연쇄 → 실전</b> — 41단계를 한 번에 뛰면 후반부가 무너져요. 구간별 집중 훈련으로 대사·시간 기준을 먼저 자동화한 뒤 15분 리허설을 돌리세요.</div></div>

      <div class="mode-grid">
        <a class="mode hot" href="#trun"><span class="mi">${ic('timer', { size: 22, weight: 'bold' })}</span><b>15분 리허설</b><small>${t.best ? `최고 ${t.best}% · ${t.tries}회` : '50점 공식 기준 실전'}</small></a>
        <a class="mode featured-blue" href="${st.weak ? '#tpart/weak' : '#tpart/critical'}"><span class="mi">${ic('warning', { size: 22, weight: 'bold' })}</span><b>${st.weak ? `취약 단계 (${st.weak})` : '구간 · 핵심 훈련'}</b><small>${st.weak ? '놓친 단계 연쇄 인출' : '3대 국면 · 시간 게이트'}</small></a>
        <a class="mode" href="#tsteps"><span class="mi">${ic('clipboard-text', { size: 22 })}</span><b>절차 학습</b><small>41단계 · 대사 듣기/수정</small></a>
        <a class="mode" href="#torder"><span class="mi">${ic('list-numbers', { size: 22 })}</span><b>순서 맞추기</b><small>처치 흐름 외우기</small></a>
        <a class="mode" href="#flash/tccc"><span class="mi">${ic('cards', { size: 22 })}</span><b>핵심 카드</b><small>숫자·위치 ${TCCC_CARDS.length}장 (SRS)</small></a>
        <a class="mode" href="#quiz/tccc"><span class="mi">${ic('lightning', { size: 22 })}</span><b>변별 객관식</b><small>핵심 수치 10문제</small></a>
        <a class="mode" href="#tsheet"><span class="mi">${ic('file-text', { size: 22 })}</span><b>공식 평가표</b><small>12요소 50점 · 감점기준</small></a>
      </div>

      <h2 class="sec-title">처치 흐름 한눈에</h2>
      <div class="flow">${phases().map((ph) => `<div class="flow-ph"><b>${esc(ph)}</b><div>${TCCC_GROUPS.filter((g) => g.phase === ph).map((g) => `<span>${esc(g.name)}</span>`).join('<i>›</i>')}</div></div>`).join('')}</div>
    `;
  };

  // TCCC 구간별 · 핵심시간 · 취약 단계 연쇄 훈련 (NEW)
  routes.tpart = (part = 'critical') => {
    setHeader('TCCC 구간 집중 훈련', '#tccc');
    const CRITICAL_NUMS = new Set([6, 9, 14, 15, 17, 18, 22, 23, 25, 27, 29, 30, 37]);
    const parts = [
      { id: 'critical', name: '핵심시간·돌발', list: TCCC.filter((x) => CRITICAL_NUMS.has(x.n)) },
      { id: 'cuf', name: '교전 중 (1~13)', list: TCCC.filter((x) => x.n <= 13) },
      { id: 'tfc', name: '현장 처치 (14~35)', list: TCCC.filter((x) => x.n >= 14 && x.n <= 35) },
      { id: 'tacevac', name: '후송·전과정 (36~41)', list: TCCC.filter((x) => x.n >= 36) },
      { id: 'weak', name: '취약 단계', list: TCCC.filter((x) => (S.tcccSteps[x.n] && S.tcccSteps[x.n].last < 1) || (S.srs['tccc:' + x.n] && S.srs['tccc:' + x.n].box <= 2)) }
    ];
    const cur = parts.find((p) => p.id === part) || parts[0];
    let list = cur.list.slice();
    let i = 0, passed = 0, again = 0;

    const tabsHtml = `<div class="chips-scroll">${parts.map((p) => `<a href="#tpart/${p.id}" class="${p.id === cur.id ? 'on' : ''}">${esc(p.name)} (${p.list.length})</a>`).join('')}</div>`;

    if (!list.length) {
      app.innerHTML = `${tabsHtml}${empty('취약 단계가 없어요', '#tccc', '리허설이나 다른 구간 훈련에서 못함/미흡 체크된 항목이 여기에 모여요.', 'check-circle')}`;
      return;
    }

    const draw = () => {
      if (i >= list.length) {
        const tot = passed + again;
        const sc = tot ? Math.round((passed / tot) * 100) : 100;
        logHistory('TCCC 구간 훈련', cur.name, sc);
        app.innerHTML = `${tabsHtml}${result(sc, `${cur.name} · 통과 ${passed} / 재복습 ${again}`, [
          `<button class="btn" id="tp-retry">다시 훈련</button>`,
          `<a class="btn ghost" href="#trun">15분 리허설 도전</a>`
        ])}`;
        $('#tp-retry').onclick = () => routes.tpart(cur.id);
        return;
      }

      const it = list[i];
      const g = grp(it.g);
      const prev = TCCC.find((x) => x.n === it.n - 1);
      const sk = 'tccc:' + it.n;

      app.innerHTML = `
        ${tabsHtml}
        <div class="quiz-top" style="margin-top:8px"><span class="tnum">${i + 1} / ${list.length} (${it.n}번)</span><span class="badge-chip badge-red">${esc(g.name)} (${g.pts}점)</span></div>
        <div class="bar thin"><i style="width:${(i / list.length) * 100}%;background:var(--red-500)"></i></div>
        <div class="run-card">
          ${prev ? `<div class="sent-bridge"><strong>직전 ${prev.n}번:</strong> ${esc(prev.t)}</div>` : ''}
          ${it.cue ? `<div class="cue big">${ic('megaphone', { size: 15, weight: 'bold' })} 평가관: "${esc(it.cue)}"</div>` : ''}
          <div class="run-body" id="tp-body">
            <p class="recall">${it.n}번 — 다음 행동과 구령(대사)은?</p>
            <p class="muted">손으로 동작을 취하고 입으로 크게 말한 뒤 확인하세요.</p>
          </div>
          <div id="tp-hint" class="hint-box-inline" hidden>${it.kw.length ? `키워드 초성: ${esc(it.kw.map((w) => chosung(w)).join(' · '))}` : '행동·자세 유지 평가 항목'}</div>
        </div>
        <div id="tp-ctrl" class="sticky-act">
          <button class="btn ghost" id="tp-hbtn">키워드 힌트</button>
          <button class="btn" id="tp-rev">행동 · 대사 확인</button>
        </div>
      `;

      $('#tp-hbtn').onclick = () => { $('#tp-hint').hidden = false; };
      $('#tp-rev').onclick = () => {
        $('#tp-body').innerHTML = `
          <p class="tt">${esc(it.t)}</p>
          ${it.note ? `<p class="tnote">• ${esc(it.note)}</p>` : ''}
          <div class="say"><span>${ic('speaker-high', { size: 18 })}</span><b>${esc(sayOf(it))}</b><button class="ib" id="tp-say" aria-label="대사 듣기">${ic('play', { size: 15, weight: 'bold' })}</button></div>
        `;
        $('#tp-say').onclick = () => { hush(); speak(sayOf(it)); };
        $('#tp-ctrl').outerHTML = `<div id="tp-ctrl"><p class="hint">동작·대사를 정확히 수행했나요?</p>${srsBtnsHtml(sk)}</div>`;
        $$('.srs-btn').forEach((b) => {
          b.onclick = () => {
            const gRate = +b.dataset.g;
            srsRate(sk, gRate);
            if (gRate === 1) {
              again++;
              vibrate(30);
              list.splice(Math.min(list.length, i + 3), 0, it);
            } else {
              passed++;
            }
            i++;
            draw();
          };
        });
      };
    };

    cleanup = hush;
    draw();
  };
  routes.tpart.tab = 'tccc';

  // 절차 학습 (기존 보존)
  routes.tsteps = () => {
    setHeader('TCCC 절차 학습', '#tccc');
    let playing = false;
    const draw = () => {
      app.innerHTML = `
        <div class="toolbar"><button class="pill" id="playall">${playing ? `${ic('stop', { size: 14, weight: 'bold' })} 정지` : `${ic('play', { size: 14, weight: 'bold' })} 대사 전체 듣기`}</button></div>
        ${phases().map((ph) => `<h2 class="sec-title">${esc(ph)}</h2><div class="tsteps-grid">
          ${TCCC_GROUPS.filter((g) => g.phase === ph).map((g) => `
            <div class="panel steps-g">
              <h3><span>${esc(g.name)}</span><span class="pts">${g.pts}점</span></h3>
              ${TCCC.filter((it) => it.g === g.id).map((it) => `
                <div class="tstep" id="ts${it.n}">
                  <div class="tn tnum">${it.n}</div>
                  <div class="tb">
                    ${it.cue ? `<div class="cue">${ic('megaphone', { size: 14, weight: 'bold' })} 평가관: ${esc(it.cue)}</div>` : ''}
                    <p class="tt">${esc(it.t)}</p>
                    ${it.note ? `<p class="tnote">• ${esc(it.note)}</p>` : ''}
                    <div class="say"><span>${ic('speaker-high', { size: 16 })}</span><b>${esc(sayOf(it))}</b>
                      <button class="ib" data-play="${it.n}" aria-label="듣기">${ic('play', { size: 15, weight: 'bold' })}</button>
                      <button class="ib" data-edit="${it.n}" aria-label="대사 수정">${ic('pencil-simple', { size: 15 })}</button></div>
                  </div>
                </div>`).join('')}
            </div>`).join('')}</div>`).join('')}
        <p class="hint">연필 아이콘으로 대사를 우리 부대 방식에 맞게 바꿀 수 있어요 (이 기기에 저장).</p>`;
      $$('[data-play]').forEach((b) => { b.onclick = () => { hush(); speak(sayOf(TCCC.find((x) => x.n === +b.dataset.play))); }; });
      $$('[data-edit]').forEach((b) => {
        b.onclick = () => {
          const it = TCCC.find((x) => x.n === +b.dataset.edit);
          const v = prompt(`${it.n}번 대사 (비우면 기본값으로)`, sayOf(it));
          if (v === null) return;
          if (v.trim() === '' || v.trim() === it.say) delete S.tcccSay[it.n]; else S.tcccSay[it.n] = v.trim();
          save(); draw(); $('#ts' + it.n).scrollIntoView({ block: 'center' });
        };
      });
      $('#playall').onclick = () => {
        if (playing) { playing = false; hush(); draw(); return; }
        playing = true; draw();
        let k = 0;
        const next = () => {
          if (!playing || k >= TCCC.length) { playing = false; $$('.tstep.now').forEach((e) => e.classList.remove('now')); const b = $('#playall'); if (b) b.innerHTML = `${ic('play', { size: 14, weight: 'bold' })} 대사 전체 듣기`; return; }
          const it = TCCC[k++];
          $$('.tstep.now').forEach((e) => e.classList.remove('now'));
          const el = $('#ts' + it.n); if (el) { el.classList.add('now'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
          speak(`${it.n}번. ${it.cue ? '평가관, ' + it.cue + ' ' : ''}${sayOf(it)}`, () => setTimeout(next, 350));
        };
        next();
      };
    };
    cleanup = () => { playing = false; hush(); };
    draw();
  };
  routes.tsteps.tab = 'tccc';

  // 15분 리허설 (공식 50점/12평가요소 유지 + 페이스 지표 + 단계별 SRS 저장)
  routes.trun = () => {
    setHeader('TCCC 리허설', '#tccc');
    const opt = Object.assign({ mode: 'test', mic: !!SR, voice: true }, S.tccc.opt || {});
    app.innerHTML = `
      <div class="sit-card"><small>상황부여</small><p>${esc(TCCC_SITUATION.card)}</p><ul>${TCCC_SITUATION.injuries.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="panel">
        <h3>모드</h3>
        <div class="seg"><button data-m="test" class="${opt.mode === 'test' ? 'on' : ''}">실전 (내용 가림)</button><button data-m="practice" class="${opt.mode === 'practice' ? 'on' : ''}">연습 (내용 보임)</button></div>
        <label class="sw row-sw"><input type="checkbox" id="o-mic" ${opt.mic ? 'checked' : ''} ${SR ? '' : 'disabled'}><span></span>음성인식으로 말한 키워드 체크 ${SR ? '' : '<small class="muted">(이 브라우저 미지원)</small>'}</label>
        <label class="sw row-sw"><input type="checkbox" id="o-voice" ${opt.voice ? 'checked' : ''}><span></span>평가관 상황부여 음성 (17번·23번)</label>
      </div>
      <div class="tip"><span class="tip-ic">${ic('timer', { size: 18, weight: 'bold' })}</span><div>손은 행동, 입은 대사! 공식 12평가요소 50점 만점 기준으로 채점되고, 못함/미흡 단계는 취약 훈련에 자동 등록돼요.</div></div>
      <button class="btn block" id="start">${ic('play', { size: 18, weight: 'bold' })} 15분 타이머 시작</button>`;
    $$('.seg button').forEach((b) => { b.onclick = () => { opt.mode = b.dataset.m; $$('.seg button').forEach((x) => x.classList.toggle('on', x === b)); }; });
    $('#start').onclick = () => {
      opt.mic = $('#o-mic').checked; opt.voice = $('#o-voice').checked;
      S.tccc.opt = opt; save();
      run(opt);
    };

    const run = (opt) => {
      document.body.dataset.route = 'trun-live';
      const LIMIT = 15 * 60;
      const t0 = Date.now();
      const vals = {};
      let i = 0, shown = opt.mode === 'practice', heard = '', interim = '', micMsg = '', done = false;
      const lis = opt.mic ? listener((fin, tmp, err) => {
        if (err) { micMsg = err; paintMic(); return; }
        if (fin) heard += fin;
        interim = tmp || '';
        paintMic();
      }) : null;
      const elapsed = () => Math.floor((Date.now() - t0) / 1000);
      const left = () => Math.max(0, LIMIT - elapsed());
      const updatePace = () => {
        const pEl = $('#pace');
        if (!pEl) return;
        const expectedStep = Math.min(TCCC.length, Math.max(1, Math.ceil((elapsed() / LIMIT) * TCCC.length)));
        const curStep = Math.min(TCCC.length, i + 1);
        const diff = curStep - expectedStep;
        pEl.className = `pace-chip tnum ${diff < -2 ? 'behind' : diff >= 1 ? 'ahead' : ''}`;
        pEl.textContent = diff < -2 ? `페이스 지연 (권장 ${expectedStep}번)` : diff >= 1 ? `여유 페이스 (권장 ${expectedStep}번)` : `적정 페이스 (권장 ${expectedStep}번)`;
      };
      const timer = setInterval(() => {
        const el = $('#tm');
        const l = left();
        if (el) { el.textContent = fmtTime(l); el.classList.toggle('warn', l <= 180); }
        updatePace();
        if (l <= 0) finish(true);
      }, 300);
      let wl = null;
      try { navigator.wakeLock && navigator.wakeLock.request('screen').then((w) => { wl = w; }).catch(() => {}); } catch (e) {}
      cleanup = () => { clearInterval(timer); lis && lis.stop(); hush(); try { wl && wl.release(); } catch (e) {} };
      lis && lis.start();

      const paintMic = () => {
        const box = $('#mic'); if (!box) return;
        const it = TCCC[i];
        const txt = heard + interim;
        const kws = kwOf(it);
        box.innerHTML = `
          <div class="mic-head"><i class="dot ${micMsg ? '' : 'live'}"></i>${ic('microphone', { size: 14 })} ${micMsg ? esc(micMsg) : '듣는 중…'}</div>
          ${kws.length ? `<div class="kw-chips">${kws.map((k) => `<span class="chip ${recall(k, txt) >= 0.99 ? 'ok' : ''}">${esc(k)}</span>`).join('')}</div>` : ''}
          <p class="heard">${esc(txt.slice(-120)) || '<span class="muted">말한 내용이 여기에 표시돼요</span>'}</p>`;
      };
      const draw = () => {
        if (i >= TCCC.length) return finish(false);
        const it = TCCC[i], g = grp(it.g);
        heard = ''; interim = '';
        shown = opt.mode === 'practice';
        app.innerHTML = `
          <div class="quiz-top"><span class="tnum">${it.n} / ${TCCC.length}</span><span class="timer big tnum" id="tm">${fmtTime(left())}</span><button class="pill ghost" id="stop">종료</button></div>
          <div style="display:flex;justify-content:center;margin-top:8px"><span class="pace-chip tnum" id="pace">적정 페이스</span></div>
          <div class="bar thin"><i style="width:${(i / TCCC.length) * 100}%;background:var(--red-500)"></i></div>
          <div class="run-card">
            <div class="run-g"><span>${esc(g.phase)}</span> › <b>${esc(g.name)}</b></div>
            ${it.cue ? `<div class="cue big">${ic('megaphone', { size: 16, weight: 'bold' })} 평가관: "${esc(it.cue)}"</div>` : ''}
            <div class="run-body" id="rb">
              ${shown ? `<p class="tt">${esc(it.t)}</p>${it.note ? `<p class="tnote">• ${esc(it.note)}</p>` : ''}<div class="say"><span>${ic('speaker-high', { size: 18 })}</span><b>${esc(sayOf(it))}</b></div>`
                : `<p class="recall">${it.n}번 — 무엇을 하고, 뭐라고 말하나요?</p><p class="muted">행동하며 크게 말한 뒤 확인하세요.</p>`}
            </div>
          </div>
          ${lis ? '<div class="mic" id="mic"></div>' : ''}
          <div id="ctrl">${shown ? gradeBtns() : '<button class="btn block" id="reveal">확인하기</button>'}</div>
          <button class="linkbtn" id="prev" ${i ? '' : 'hidden'}>${ic('caret-left', { size: 15 })} 이전 단계</button>`;
        updatePace();
        paintMic();
        if (opt.voice && it.cue) { hush(); speak('평가관. ' + it.cue); }
        bind();
      };
      const gradeBtns = () => `<div class="self3">
          <button class="sbtn bad" data-v="0">${ic('x', { size: 22, weight: 'bold' })}<small>못함</small></button>
          <button class="sbtn mid" data-v="0.5">${ic('triangle', { size: 22, weight: 'bold' })}<small>미흡</small></button>
          <button class="sbtn good" data-v="1">${ic('circle', { size: 22, weight: 'bold' })}<small>완벽</small></button></div>`;
      const bind = () => {
        $('#stop').onclick = () => { if (confirm('리허설을 종료하고 채점할까요? (남은 항목은 0점)')) finish(true); };
        const pv = $('#prev'); if (pv) pv.onclick = () => { i--; draw(); };
        const rv = $('#reveal');
        if (rv) rv.onclick = () => {
          const it = TCCC[i];
          $('#rb').innerHTML = `<p class="tt">${esc(it.t)}</p>${it.note ? `<p class="tnote">• ${esc(it.note)}</p>` : ''}<div class="say"><span>${ic('speaker-high', { size: 18 })}</span><b>${esc(sayOf(it))}</b></div>`;
          $('#ctrl').innerHTML = gradeBtns();
          bind();
        };
        $$('.sbtn').forEach((b) => { b.onclick = () => { vals[TCCC[i].n] = +b.dataset.v; i++; draw(); }; });
      };
      const finish = (cut) => {
        if (done) return; done = true;
        const used = Math.min(LIMIT, elapsed());
        cleanup(); cleanup = null;
        document.body.dataset.route = 'trun';
        const r = tcccScore(vals);
        const t = S.tccc;
        const isBest = r.pct > (t.best || 0);
        t.best = Math.max(t.best || 0, r.pct); t.tries = (t.tries || 0) + 1; t.last = r.pct;

        // 41단계별 SRS 기록 (다음 취약 단계 훈련과 연결)
        TCCC.forEach((it) => {
          const v = vals[it.n] || 0;
          srsRate('tccc:' + it.n, v === 1 ? 3 : v > 0 ? 2 : 1);
        });

        logHistory('TCCC 리허설', `${r.total}/50 · ${r.label}`, r.pct);
        const miss = TCCC.filter((it) => (vals[it.n] || 0) < 1);
        const weakestRow = r.rows.slice().sort((a, b) => (b.g.pts - b.got) - (a.g.pts - a.got))[0];
        app.innerHTML = result(r.pct, `${r.label} · ${r.total}/50점 (환산 ${r.conv}점) · ${fmtTime(used)}${cut && used >= LIMIT ? ' · 시간초과' : ''}${isBest ? ' · 최고 기록' : ''}`, [
          miss.length ? `<a class="btn" href="#tpart/weak">취약 ${miss.length}단계 바로 훈련</a>` : '<button class="btn" id="retry">다시 하기</button>',
          miss.length ? '<button class="btn ghost" id="retry">다시 하기</button>' : '<a class="btn ghost" href="#tsteps">절차 복습</a>'
        ]) + `
          ${weakestRow && weakestRow.got < weakestRow.g.pts ? `<div class="tip"><span class="tip-ic">${ic('warning', { size: 18, weight: 'bold' })}</span><div>가장 점수를 많이 잃은 요소: <b>${esc(weakestRow.g.name)}</b> (${weakestRow.got}/${weakestRow.g.pts}점, 감점 ${Math.round((weakestRow.g.pts - weakestRow.got) * 10) / 10}점)</div></div>` : ''}
          <div class="panel"><h3>평가요소별 점수 <span class="badge-chip badge-primary tnum">${r.total} / 50점</span></h3>
            <div class="table-wrap">
              <table class="mopp score-t"><thead><tr><th style="text-align:left;padding-left:8px">평가요소</th><th>배점</th><th>득점</th></tr></thead>
              <tbody>${r.rows.map((x) => `<tr><td class="l">${esc(x.g.name)}</td><td class="tnum">${x.g.pts}</td><td class="tnum ${x.got >= x.g.pts ? 'okc' : x.got ? 'midc' : 'ngc'}">${x.got}</td></tr>`).join('')}
              <tr class="total-row"><th style="text-align:left;padding-left:8px">합계</th><th class="tnum">50</th><th class="tnum">${r.total}</th></tr></tbody></table>
            </div>
            <p class="muted" style="font-size:12px;margin:10px 0 0">※ 항목 ○=1, △=0.5, ✕=0 을 평가요소 배점에 비례 환산한 자가 채점 결과예요.</p>
          </div>
          ${miss.length ? `<h2 class="sec-title">보완할 항목 ${miss.length}개</h2><div class="qa-list">${miss.map((it) => `<div class="qa ng"><b>${it.n}. ${esc(it.t)}</b><p>${esc(sayOf(it))}</p></div>`).join('')}</div>` : ''}`;
        $('#retry').onclick = render;
        save();
        if (isBest && r.pct >= 90) confetti();
      };
      if (opt.voice) speak('상황부여. ' + TCCC_SITUATION.card + '. 평가 시작.');
      draw();
    };
  };
  routes.trun.tab = 'tccc';

  // 순서 맞추기 (기존 보존)
  routes.torder = (sel = 'flow') => {
    setHeader('TCCC 순서 맞추기', '#tccc');
    const sets = [{ id: 'flow', name: '평가요소 흐름' }].concat(TCCC_GROUPS.filter((g) => TCCC.filter((it) => it.g === g.id).length >= 2).map((g) => ({ id: g.id, name: g.name })));
    const cur = sets.find((x) => x.id === sel) || sets[0];
    const items = cur.id === 'flow'
      ? TCCC_GROUPS.slice(0, 10).map((g, k) => ({ k, label: g.name, sub: g.phase }))
      : TCCC.filter((it) => it.g === cur.id).map((it, k) => ({ k, label: it.t.replace(/\?$/, ''), sub: sayOf(it) }));
    let next = 0, miss = 0;
    const shuffled = shuffle(items);
    app.innerHTML = `
      <div class="chips-scroll">${sets.map((x) => `<a href="#torder/${x.id}" class="${x.id === cur.id ? 'on' : ''}">${esc(x.name)}</a>`).join('')}</div>
      <p class="hint">${cur.id === 'flow' ? '처치 순서대로' : '평가 순서대로'} 탭하세요 · <b class="tnum" id="ord-st">0 / ${items.length}</b></p>
      <div class="ord-done" id="done"></div>
      <div class="ord-pool">${shuffled.map((x) => `<button class="ord" data-k="${x.k}"><b>${esc(x.label)}</b>${cur.id === 'flow' ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('')}</div>
      <div id="ores"></div>`;
    $$('.ord').forEach((b) => {
      b.onclick = () => {
        if (+b.dataset.k === next) {
          next++;
          b.remove();
          $('#done').insertAdjacentHTML('beforeend', `<div class="ord ok"><i>${next}</i><b>${b.querySelector('b').innerHTML}</b></div>`);
          $('#ord-st').textContent = `${next} / ${items.length}`;
          if (next === items.length) {
            const sc = Math.max(0, Math.round(((items.length - miss) / items.length) * 100));
            logHistory('TCCC 순서', cur.name, sc);
            const idx = sets.indexOf(cur);
            $('#ores').innerHTML = `<div class="feedback ${miss ? 'bad' : 'good'}"><b>${sc}점 · 실수 ${miss}번</b></div>
              <div class="btn-row"><button class="btn ghost" id="redo">다시</button>${sets[idx + 1] ? `<a class="btn" href="#torder/${sets[idx + 1].id}">다음: ${esc(sets[idx + 1].name)}</a>` : ''}</div>`;
            $('#redo').onclick = render;
            if (!miss) confetti();
          }
        } else {
          miss++; vibrate(60);
          b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
        }
      };
    });
  };
  routes.torder.tab = 'tccc';

  // 평가표 (공식 기준 100% 보존)
  routes.tsheet = () => {
    setHeader('TCCC 평가표', '#tccc');
    app.innerHTML = `
      <div class="toss-top">
        <p class="toss-top-sub">12개 평가요소 · 41개 세부항목</p>
        <h1 class="toss-top-title">배점과 감점 기준을<br>한눈에 확인해요</h1>
      </div>
      <div class="panel"><h3>등급 기준 (50점 만점)</h3>
        <div class="grade-row"><span class="gS">특급 90%</span><span class="gA">합격 80%</span><span class="gB">합격 70%</span><span class="gD">불합격 60%↓</span></div>
        <p class="muted" style="font-size:13px;margin:10px 0 0">평가표 환산 기준: 특급 18점 이상 / 합격 16점(80%)·14점(70%) / 불합격 13.9점 이하</p>
      </div>
      ${TCCC_GROUPS.map((g) => `
        <div class="panel">
          <h3><span>${esc(g.name)} <small class="muted" style="font-weight:600;margin-left:4px">${esc(g.phase)}</small></span><span class="pts">${g.pts}점</span></h3>
          ${TCCC.filter((it) => it.g === g.id).map((it) => `<div class="sheet-row"><i class="tnum">${it.n}</i><div><p>${esc(it.t)}</p>${it.note ? `<small>• ${esc(it.note)}</small>` : ''}</div></div>`).join('')}
        </div>`).join('')}`;
  };
  routes.tsheet.tab = 'tccc';

  // ---------- 기록 & 망각곡선 스케줄 리포트 ----------
  routes.stats = () => {
    setHeader('기록', false);
    const now = Date.now();
    const box5Cnt = (b) => CBRN.filter((c) => cardBox5(c.cat, c.id) === b).length;
    const b5 = box5Cnt(5), b4 = box5Cnt(4), b3 = box5Cnt(3), b12 = box5Cnt(1) + box5Cnt(2), b0 = box5Cnt(0);
    const m = cbrnMastery();
    const mindAvg = Math.round(MIND.map((q) => (S.mind[q.id] && S.mind[q.id].best) || 0).reduce((a, b) => a + b, 0) / MIND.length);
    const ret = avgRetention(now);
    const dueTotal = collectDueItems(now).length;

    // 7일 복습 예보 (오늘 ~ +6일)
    const forecast = Array.from({ length: 7 }, (_, dIdx) => {
      const start = dIdx === 0 ? 0 : now + dIdx * DAY - (now % DAY);
      const end = dIdx === 0 ? (now - (now % DAY) + DAY) : start + DAY;
      const cnt = Object.values(S.srs).filter((r) => r.box > 0 && r.due >= start && r.due < end).length;
      return { lbl: dIdx === 0 ? '오늘' : `+${dIdx}일`, cnt, isToday: dIdx === 0 };
    });
    const maxFc = Math.max(1, ...forecast.map((f) => f.cnt));

    app.innerHTML = `
      <div class="toss-top">
        <p class="toss-top-sub">망각곡선 &amp; 인출 리포트</p>
        <h1 class="toss-top-title">기억 보존율 ${ret}% ·<br>복습 스케줄을 한눈에 봐요</h1>
      </div>

      <div class="kpi-strip">
        <div class="kpi-box"><span>화생방 숙달</span><b class="tnum" style="color:var(--green-500)">${m}%</b></div>
        <div class="kpi-box"><span>정신전력 평균</span><b class="tnum" style="color:var(--primary)">${mindAvg}점</b></div>
        <div class="kpi-box"><span>TCCC 최고</span><b class="tnum" style="color:var(--red-500)">${S.tccc.best || 0}%</b></div>
      </div>

      <div class="panel">
        <h3>향후 7일 복습 스케줄 <span class="badge-chip badge-orange tnum">오늘 ${dueTotal}개</span></h3>
        <div class="forecast">
          ${forecast.map((f) => `
            <div class="fcol ${f.isToday ? 'today' : ''}">
              <span class="fcol-num tnum">${f.cnt}</span>
              <div class="fcol-bar-wrap"><div class="fcol-bar" style="height:${f.cnt ? Math.max(10, Math.round((f.cnt / maxFc) * 100)) : 4}%"></div></div>
              <span class="fcol-lbl">${f.lbl}</span>
            </div>`).join('')}
        </div>
      </div>

      <div class="panel">
        <h3>화생방 5단계 기억 상태 <span class="badge-chip badge-neutral tnum">${CBRN.length}문항</span></h3>
        <div class="stack">
          <i style="flex:${b5 + b4};background:var(--green-500)"></i><i style="flex:${b3};background:var(--primary)"></i><i style="flex:${b12};background:var(--orange-500)"></i><i style="flex:${b0};background:var(--grey-200)"></i>
        </div>
        <div class="legend">
          <span><i style="background:var(--green-500)"></i>장기·완전 ${b5 + b4}</span>
          <span><i style="background:var(--primary)"></i>정착 ${b3}</span>
          <span><i style="background:var(--orange-500)"></i>단기·취약 ${b12}</span>
          <span><i style="background:var(--grey-300)"></i>미학습 ${b0}</span>
        </div>
      </div>

      <div class="panel">
        <h3>정신전력 최고점 · 문장 숙달</h3>
        ${MIND.map((q) => {
          const b = (S.mind[q.id] || {}).best || 0;
          const st = mindSentenceStats(q);
          return `<div class="hbar"><span>${q.id}</span><div class="bar"><i style="width:${b}%"></i></div><b class="tnum">${b} <small style="font-size:10px;color:var(--text-muted)">(${st.mastered}/${st.total})</small></b></div>`;
        }).join('')}
      </div>

      <div class="panel">
        <h3>TCCC 리허설 · 41단계 숙달</h3>
        <div class="hbar"><span>최고</span><div class="bar"><i style="width:${S.tccc.best || 0}%;background:var(--red-500)"></i></div><b class="tnum" style="color:var(--red-500)">${S.tccc.best || 0}</b></div>
        <p class="muted" style="margin:6px 0 0;font-size:13px">${S.tccc.tries ? `${S.tccc.tries}회 응시 · 최근 ${S.tccc.last}% · 단계 숙달 ${tcccStepStats().mastered}/${TCCC.length}` : '아직 응시 기록이 없어요.'}</p>
      </div>

      <h2 class="sec-title">최근 학습</h2>
      ${S.history.length ? `<div class="list">${S.history.slice(0, 30).map((h) => `<div class="row"><div class="grade g${grade(h.score)}">${grade(h.score)}</div><div class="row-body"><b>${esc(h.type)} · ${esc(h.title)}</b><span>${esc(h.at)}</span></div><div class="row-score tnum">${h.score}점</div></div>`).join('')}</div>` : '<div class="toss-card"><p class="muted center">아직 기록이 없어요.</p></div>'}

      <button class="btn block danger" id="reset">학습 기록 초기화</button>
    `;

    $('#reset').onclick = () => {
      if (confirm('모든 기록과 메모를 초기화할까요?')) {
        S = defaults(); save(); render();
      }
    };
  };

  // ---------- 공통 조각 ----------
  const result = (sc, sub, btns) => `
    <div class="result">
      <div class="big-ring">${ring(sc, '점수', sc >= 80 ? 'var(--green-500)' : sc >= 60 ? 'var(--orange-500)' : 'var(--red-500)')}<span class="grade-l g${grade(sc)}">${grade(sc)}</span></div>
      <h2 class="tnum">${sc}점</h2><p>${esc(sub)}</p>
      <div class="btn-row">${btns.join('')}</div>
    </div>`;
  const empty = (t, back, sub = '', iconName = 'tray') => `<div class="empty"><div class="empty-ic">${ic(iconName, { size: 28, weight: 'bold' })}</div><b>${esc(t)}</b><p>${esc(sub)}</p><a class="btn" href="${back}">돌아가기</a></div>`;
  const confetti = () => {
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#3182f6', '#03b26c', '#fe9800', '#f04452', '#a234c7'];
    box.innerHTML = Array.from({ length: 60 }, () => `<i style="left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * 5)]};animation-delay:${Math.random() * 0.5}s;animation-duration:${1.5 + Math.random()}s"></i>`).join('');
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3000);
  };

  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {}));
    let reloaded = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  }
})();
