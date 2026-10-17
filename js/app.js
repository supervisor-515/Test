(() => {
  'use strict';

  // ---------- 저장소 ----------
  const KEY = 'hsb.v1';
  const defaults = () => ({ cards: {}, mind: {}, memo: {}, history: [], wrong: {}, tccc: {}, tcccSay: {} });
  let S;
  try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = defaults(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  // ---------- 유틸 ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const norm = (s) => String(s).replace(/[\s.,·'"‘’“”<>()\[\]{}:;!?~\-–—\/]/g, '').toLowerCase();
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
  // 키워드가 사용자 텍스트에 얼마나 포함되어 있는지 (0~1)
  const recall = (kw, text) => {
    const k = norm(kw), t = norm(text);
    if (!k) return 1;
    if (t.includes(k)) return 1;
    if (k.length < 2) return 0;
    const K = bigrams(k), T = bigrams(t);
    let hit = 0, n = 0;
    K.forEach((v, b) => { n += v; hit += Math.min(v, T.get(b) || 0); });
    return n ? hit / n : 0;
  };
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const chosung = (s) => [...s].map((c) => { const code = c.charCodeAt(0) - 0xac00; return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : c; }).join('');
  const fmtTime = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const today = () => new Date().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const grade = (sc) => (sc >= 90 ? 'S' : sc >= 80 ? 'A' : sc >= 70 ? 'B' : sc >= 60 ? 'C' : 'D');

  const vibrate = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
  const logHistory = (type, title, score) => {
    S.history.unshift({ type, title, score, at: today() });
    S.history = S.history.slice(0, 100);
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

  // 카드 ID
  CBRN.forEach((c, i) => { c.id = c.cat + '-' + i; });
  TCCC_CARDS.forEach((c, i) => { c.id = 'tccc-' + i; });
  const ALL_CARDS = CBRN.concat(TCCC_CARDS);
  const srcFor = (cat) => (cat === 'tccc' ? TCCC_CARDS : CBRN);
  const poolFor = (cat) => cat === 'all' ? CBRN : cat === 'tccc' ? TCCC_CARDS : cat === 'wrong' ? CBRN.filter((c) => S.wrong[c.id]) : CBRN.filter((c) => c.cat === cat);
  const backFor = (cat) => (cat === 'tccc' ? '#tccc' : '#cbrn');
  const catName = (id) => (id === 'tccc' ? 'TCCC 핵심' : (CBRN_CATS.find((c) => c.id === id) || {}).name || id);
  const cardBox = (id) => (S.cards[id] && S.cards[id].box) || 0; // 0=미학습, 1=모름, 2=애매, 3=암기
  const cbrnMastery = (cards = CBRN) => Math.round((cards.filter((c) => cardBox(c.id) >= 3).length / cards.length) * 100);

  // ---------- 라우팅 ----------
  const app = $('#app');
  const header = $('#hdr-title');
  const backBtn = $('#hdr-back');
  let cleanup = null;
  const routes = {};
  const go = (h) => { location.hash = h; };
  const setHeader = (title, back) => {
    header.textContent = title;
    backBtn.hidden = !back;
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
    setHeader('병기본 마스터', false);
    const mindScores = MIND.map((q) => (S.mind[q.id] && S.mind[q.id].best) || 0);
    const mindAvg = Math.round(mindScores.reduce((a, b) => a + b, 0) / MIND.length);
    const m = cbrnMastery();
    const due = CBRN.filter((c) => cardBox(c.id) < 3).length;
    const tBest = S.tccc.best || 0;
    app.innerHTML = `
      <section class="hero">
        <div class="hero-txt">
          <p class="eyebrow">2026 전투력 측정 대비</p>
          <h1>오늘도 한 세트, 합격까지.</h1>
        </div>
        <div class="rings">
          ${ring(m, '화생방', 'var(--green)')}
          ${ring(mindAvg, '정신전력', 'var(--primary)')}
          ${ring(tBest, 'TCCC', 'var(--red)')}
        </div>
      </section>

      <h2 class="sec-title">이어서 학습하기</h2>
      <a class="big-card cbrn" href="#cbrn">
        <div class="bc-icon">☢️</div>
        <div class="bc-body">
          <b>화생방 질의응답</b>
          <span>${CBRN.length}문항 · 남은 카드 ${due}개</span>
          <div class="bar"><i style="width:${m}%"></i></div>
        </div>
        <div class="chev">›</div>
      </a>
      <a class="big-card mind" href="#mind">
        <div class="bc-icon">✍️</div>
        <div class="bc-body">
          <b>정신전력 백지암기</b>
          <span>${MIND.length}문항 · 평균 최고점 ${mindAvg}점</span>
          <div class="bar"><i style="width:${mindAvg}%"></i></div>
        </div>
        <div class="chev">›</div>
      </a>

      <a class="big-card tc" href="#tccc">
        <div class="bc-icon">🩹</div>
        <div class="bc-body">
          <b>TCCC 전투부상자처치</b>
          <span>평가항목 ${TCCC.length}개 · 최고 ${tBest}%${S.tccc.last != null ? ` · 최근 ${S.tccc.last}%` : ''}</span>
          <div class="bar"><i style="width:${tBest}%"></i></div>
        </div>
        <div class="chev">›</div>
      </a>

      <h2 class="sec-title">빠른 시작</h2>
      <div class="quick">
        <a href="#exam" class="qk"><span>🎤</span>화생방<br>모의 질의응답</a>
        <a href="#quiz/all" class="qk"><span>⚡</span>객관식<br>10문제</a>
        <a href="#flash/all" class="qk"><span>🃏</span>플래시카드<br>전체</a>
        <a href="#trun" class="qk"><span>⏱️</span>TCCC<br>15분 리허설</a>
        <a href="#torder" class="qk"><span>🔢</span>TCCC<br>순서 맞추기</a>
        <a href="#write/${encodeURIComponent(MIND[Math.floor(Math.random() * MIND.length)].id)}" class="qk"><span>📝</span>랜덤<br>백지쓰기</a>
      </div>
    `;
  };
  const ring = (v, label, color) => {
    const r = 30, c = 2 * Math.PI * r;
    return `<div class="ring"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="${r}" class="ring-bg"/><circle cx="36" cy="36" r="${r}" class="ring-fg" style="stroke:${color}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 100)}"/></svg><b>${v}<small>%</small></b><span>${label}</span></div>`;
  };

  // ---------- 화생방 메인 ----------
  routes.cbrn = () => {
    setHeader('화생방', false);
    app.innerHTML = `
      <div class="mode-grid">
        <a class="mode" href="#flash/all"><span class="mi">🃏</span><b>플래시카드</b><small>뒤집어서 외우기</small></a>
        <a class="mode" href="#quiz/all"><span class="mi">⚡</span><b>객관식 테스트</b><small>10문제 · 점수</small></a>
        <a class="mode" href="#exam"><span class="mi">🎤</span><b>모의 질의응답</b><small>실전처럼 말로 답하기</small></a>
        <a class="mode" href="#wrong"><span class="mi">📕</span><b>오답노트</b><small>${Object.keys(S.wrong).length}문항</small></a>
      </div>
      <h2 class="sec-title">단원별 학습</h2>
      <div class="list">
        ${CBRN_CATS.map((cat) => {
          const cards = CBRN.filter((c) => c.cat === cat.id);
          const p = cbrnMastery(cards);
          return `<div class="row">
            <div class="row-ic">${cat.icon}</div>
            <div class="row-body"><b>${esc(cat.name)}</b><span>${cards.length}문항 · 암기 ${p}%</span><div class="bar sm"><i style="width:${p}%"></i></div></div>
            <div class="row-act"><a class="pill" href="#flash/${cat.id}">카드</a><a class="pill ghost" href="#quiz/${cat.id}">퀴즈</a></div>
          </div>`;
        }).join('')}
      </div>
      <h2 class="sec-title">전체 문항 보기</h2>
      <a class="row link" href="#list"><div class="row-ic">📖</div><div class="row-body"><b>정리본 (질문 · 답 목록)</b><span>MOPP 표 포함</span></div><div class="chev">›</div></a>
    `;
  };

  // ---------- 정리본 ----------
  routes.list = () => {
    setHeader('정리본', '#cbrn');
    const yes = '<td class="on">착용</td>';
    const MOPP = [
      ['준비', '준비', '준비', '휴대', '준비'], ['0단계', '휴대', '휴대', '휴대', '휴대'], ['1단계', '착용', '휴대', '휴대', '휴대'],
      ['2단계', '착용', '착용', '휴대', '휴대'], ['3단계', '착용', '착용', '착용', '휴대'], ['4단계', '착용', '착용', '착용', '착용'], ['A(알파)', '휴대', '휴대', '착용', '휴대']
    ];
    app.innerHTML = `
      <div class="panel">
        <h3>MOPP 단계표</h3>
        <table class="mopp"><thead><tr><th></th><th>보호의</th><th>전투화<br>덮개</th><th>방독면</th><th>보호<br>장갑</th></tr></thead>
        <tbody>${MOPP.map((r) => `<tr><th>${r[0]}</th>${r.slice(1).map((v) => (v === '착용' ? yes : `<td>${v}</td>`)).join('')}</tr>`).join('')}</tbody></table>
        <h3>경보</h3>
        <table class="mopp"><thead><tr><th></th><th>준비경보<br><small>MOPP 준비</small></th><th>경계경보<br><small>MOPP 1</small></th><th>경보<br><small>MOPP 3</small></th><th>해제</th></tr></thead>
        <tbody>
          <tr><th>방송</th><td>"발령" 반복</td><td>"발령" 반복</td><td>"발령" 반복</td><td>"해제"</td></tr>
          <tr><th>타종</th><td>-</td><td>1분간<br>(3연타)</td><td>3분간<br>(난타)</td><td>-</td></tr>
          <tr><th>사이렌</th><td>-</td><td>1분간<br>평탄음</td><td>-</td><td>-</td></tr>
          <tr><th>수기</th><td><i class="flag" style="background:#fff"></i>흰색</td><td><i class="flag" style="background:#f5c400"></i>황색</td><td><i class="flag" style="background:#e03131"></i>적색</td><td><i class="flag" style="background:#2f9e44"></i>녹색</td></tr>
        </tbody></table>
      </div>
      ${CBRN_CATS.map((cat) => `
        <h2 class="sec-title">${cat.icon} ${esc(cat.name)}</h2>
        <div class="qa-list">${CBRN.filter((c) => c.cat === cat.id).map((c) => `<div class="qa"><b>Q. ${esc(c.q)}</b><p>${esc(c.a)}</p></div>`).join('')}</div>
      `).join('')}
    `;
  };

  // ---------- 플래시카드 (Quizlet 스타일) ----------
  routes.flash = (cat = 'all') => {
    const pool = poolFor(cat);
    setHeader(cat === 'all' ? '플래시카드 · 전체' : cat === 'wrong' ? '플래시카드 · 오답' : catName(cat), backFor(cat));
    if (!pool.length) { app.innerHTML = empty('카드가 없어요', backFor(cat)); return; }
    // 모르는 카드 먼저
    let deck = shuffle(pool).sort((a, b) => cardBox(a.id) - cardBox(b.id));
    let i = 0, known = 0, unknown = 0, flipped = false;
    const again = [];

    const draw = () => {
      if (i >= deck.length) {
        if (again.length) { deck = shuffle(again.splice(0)); i = 0; }
        else return finish();
      }
      const c = deck[i];
      flipped = false;
      app.innerHTML = `
        <div class="fc-top">
          <span class="cnt bad">${unknown}</span>
          <span class="prog">${i + 1} / ${deck.length}</span>
          <span class="cnt good">${known}</span>
        </div>
        <div class="bar thin"><i style="width:${(i / deck.length) * 100}%"></i></div>
        <div class="fc-wrap">
          <div class="fc" id="fc">
            <div class="fc-face front"><small>${esc(catName(c.cat))}</small><p>${esc(c.q)}</p><em>탭해서 뒤집기</em></div>
            <div class="fc-face back"><small>정답</small><p>${esc(c.a)}</p></div>
          </div>
        </div>
        <div class="fc-btns">
          <button class="fbtn bad" id="no"><span>✕</span>몰라요</button>
          <button class="fbtn good" id="yes"><span>✓</span>알아요</button>
        </div>
        <p class="hint">← 스와이프: 몰라요 · 알아요 → · 스페이스: 뒤집기</p>
      `;
      const fc = $('#fc');
      const flip = () => { flipped = !flipped; fc.classList.toggle('flip', flipped); };
      fc.onclick = flip;
      $('#no').onclick = () => answer(false);
      $('#yes').onclick = () => answer(true);
      // 스와이프
      let sx = null, dx = 0;
      fc.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; dx = 0; fc.style.transition = 'none'; }, { passive: true });
      fc.addEventListener('touchmove', (e) => { if (sx == null) return; dx = e.touches[0].clientX - sx; fc.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)${flipped ? ' rotateY(180deg)' : ''}`; }, { passive: true });
      fc.addEventListener('touchend', () => {
        fc.style.transition = ''; fc.style.transform = '';
        if (Math.abs(dx) > 90) { fc.onclick = null; answer(dx > 0); }
        sx = null;
      });
    };
    const answer = (ok) => {
      const c = deck[i];
      const rec = S.cards[c.id] || { box: 0, seen: 0 };
      rec.seen++;
      rec.box = ok ? Math.min(3, Math.max(rec.box, 1) + 1) : 1;
      S.cards[c.id] = rec;
      if (ok) { known++; } else { unknown++; again.push(c); S.wrong[c.id] = true; vibrate(30); }
      if (ok && rec.box >= 3) delete S.wrong[c.id];
      save();
      i++;
      draw();
    };
    const finish = () => {
      const total = known + unknown;
      const sc = total ? Math.round((known / total) * 100) : 0;
      logHistory('플래시카드', cat === 'all' ? '화생방 전체' : catName(cat), sc);
      if (cat === 'tccc') S.tccc.cards = sc;
      app.innerHTML = result(sc, `${pool.length}장 완주! 한 번에 맞힌 비율`, [
        `<button class="btn" id="retry">다시 하기</button>`,
        `<a class="btn ghost" href="#quiz/${cat === 'wrong' ? 'all' : cat}">퀴즈로 확인</a>`
      ]);
      $('#retry').onclick = render;
    };
    const key = (e) => {
      if (e.code === 'Space') { e.preventDefault(); $('#fc') && $('#fc').click(); }
      if (e.key === 'ArrowLeft') $('#no') && $('#no').click();
      if (e.key === 'ArrowRight') $('#yes') && $('#yes').click();
    };
    document.addEventListener('keydown', key);
    cleanup = () => document.removeEventListener('keydown', key);
    draw();
  };
  routes.flash.tab = (cat) => (cat === 'tccc' ? 'tccc' : 'cbrn');

  // ---------- 객관식 퀴즈 ----------
  routes.quiz = (cat = 'all') => {
    const pool = poolFor(cat);
    const SRC = srcFor(cat);
    setHeader(cat === 'all' ? '객관식 테스트' : cat === 'wrong' ? '오답 테스트' : catName(cat), backFor(cat));
    if (pool.length < 1) { app.innerHTML = empty('문항이 없어요', backFor(cat)); return; }
    const qs = shuffle(pool).slice(0, 10).map((c) => {
      const same = SRC.filter((x) => x.id !== c.id && x.cat === c.cat && x.a !== c.a);
      const other = SRC.filter((x) => x.id !== c.id && x.cat !== c.cat && x.a !== c.a);
      const distract = [...new Set(shuffle(same).concat(shuffle(other)).map((x) => x.a))].slice(0, 3);
      return { c, opts: shuffle([c.a, ...distract]) };
    });
    let i = 0, score = 0;
    const log = [];
    const draw = () => {
      if (i >= qs.length) return finish();
      const { c, opts } = qs[i];
      app.innerHTML = `
        <div class="quiz-top"><span>${i + 1} / ${qs.length}</span><span class="score-chip">${score}점</span></div>
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
      if (ok) { score += 10; delete S.wrong[c.id]; } else { S.wrong[c.id] = true; vibrate(60); }
      const rec = S.cards[c.id] || { box: 0, seen: 0 };
      rec.seen++; rec.box = ok ? Math.min(3, Math.max(rec.box, 1) + 1) : 1; S.cards[c.id] = rec;
      save();
      log.push({ c, ok });
      $('.score-chip').textContent = score + '점';
      $('#next-wrap').innerHTML = `<div class="feedback ${ok ? 'good' : 'bad'}"><b>${ok ? '정답! 🎉' : '오답'}</b>${ok ? '' : `<span>정답: ${esc(c.a)}</span>`}</div><button class="btn block" id="next">${i + 1 < qs.length ? '다음' : '결과 보기'}</button>`;
      $('#next').onclick = () => { i++; draw(); };
    };
    const finish = () => {
      const sc = Math.round((score / (qs.length * 10)) * 100);
      logHistory('객관식', cat === 'all' ? '화생방 전체' : cat === 'wrong' ? '오답' : catName(cat), sc);
      app.innerHTML = result(sc, `${qs.length}문제 중 ${log.filter((l) => l.ok).length}개 정답`, [
        `<button class="btn" id="retry">다시 풀기</button>`,
        Object.keys(S.wrong).length ? `<a class="btn ghost" href="#flash/wrong">오답 카드 복습</a>` : ''
      ]) + `<h2 class="sec-title">문항별 결과</h2><div class="qa-list">${log.map((l) => `<div class="qa ${l.ok ? 'ok' : 'ng'}"><b>${l.ok ? '⭕' : '❌'} ${esc(l.c.q)}</b><p>${esc(l.c.a)}</p></div>`).join('')}</div>`;
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

  // ---------- 모의 질의응답 (평가관 질문 → 말로 답 → 자가채점) ----------
  routes.exam = () => {
    setHeader('모의 질의응답', '#cbrn');
    const qs = shuffle(CBRN).slice(0, 10);
    let i = 0;
    const res = [];
    let t0 = Date.now(), timer = null;
    const draw = () => {
      if (i >= qs.length) return finish();
      const c = qs[i];
      t0 = Date.now();
      app.innerHTML = `
        <div class="quiz-top"><span>질문 ${i + 1} / ${qs.length}</span><span class="timer" id="tm">00:00</span></div>
        <div class="bar thin"><i style="width:${(i / qs.length) * 100}%"></i></div>
        <div class="exam-card">
          <div class="examiner">🪖 평가관</div>
          <p class="exam-q">${esc(c.q)}</p>
          <div class="exam-a" id="ea" hidden><small>모범답안</small><p>${esc(c.a)}</p></div>
        </div>
        <div id="ctrl"><button class="btn block" id="reveal">소리 내어 답한 뒤 → 정답 확인</button></div>
      `;
      clearInterval(timer);
      timer = setInterval(() => { const el = $('#tm'); if (el) el.textContent = fmtTime(Math.floor((Date.now() - t0) / 1000)); }, 500);
      $('#reveal').onclick = () => {
        $('#ea').hidden = false;
        $('#ctrl').innerHTML = `<p class="hint">내 답변은?</p><div class="self3">
          <button class="sbtn bad" data-v="0">✕<small>틀림</small></button>
          <button class="sbtn mid" data-v="0.5">△<small>일부</small></button>
          <button class="sbtn good" data-v="1">○<small>완벽</small></button></div>`;
        $$('.sbtn').forEach((b) => { b.onclick = () => {
          const v = +b.dataset.v;
          res.push({ c, v });
          if (v < 1) S.wrong[c.id] = true; else delete S.wrong[c.id];
          const rec = S.cards[c.id] || { box: 0, seen: 0 };
          rec.seen++; rec.box = v === 1 ? Math.min(3, Math.max(rec.box, 1) + 1) : v ? 2 : 1; S.cards[c.id] = rec;
          save(); i++; draw();
        }; });
      };
    };
    const finish = () => {
      clearInterval(timer);
      const sc = Math.round((res.reduce((a, r) => a + r.v, 0) / res.length) * 100);
      logHistory('모의 질의응답', '화생방 10문항', sc);
      app.innerHTML = result(sc, sc >= 80 ? '합격권이에요!' : '오답노트로 한 번 더!', [
        `<button class="btn" id="retry">새 질문 10개</button>`, `<a class="btn ghost" href="#wrong">오답노트</a>`
      ]) + `<div class="qa-list">${res.map((r) => `<div class="qa ${r.v === 1 ? 'ok' : 'ng'}"><b>${r.v === 1 ? '⭕' : r.v ? '🔺' : '❌'} ${esc(r.c.q)}</b><p>${esc(r.c.a)}</p></div>`).join('')}</div>`;
      $('#retry').onclick = render;
    };
    cleanup = () => clearInterval(timer);
    draw();
  };
  routes.exam.tab = 'cbrn';

  // ---------- 오답노트 ----------
  routes.wrong = () => {
    setHeader('오답노트', '#cbrn');
    const list = CBRN.filter((c) => S.wrong[c.id]);
    if (!list.length) { app.innerHTML = empty('오답이 없어요 👍', '#cbrn', '틀린 문제는 자동으로 여기 모여요.'); return; }
    app.innerHTML = `
      <div class="btn-row"><a class="btn" href="#flash/wrong">카드로 복습</a><a class="btn ghost" href="#quiz/wrong">퀴즈</a></div>
      <div class="qa-list">${list.map((c) => `<div class="qa ng"><b>${esc(c.q)}</b><p>${esc(c.a)}</p><button class="x" data-id="${c.id}" aria-label="삭제">외웠음 ✓</button></div>`).join('')}</div>`;
    $$('.x').forEach((b) => { b.onclick = () => { delete S.wrong[b.dataset.id]; save(); routes.wrong(); }; });
  };
  routes.wrong.tab = 'cbrn';

  // ---------- 정신전력 메인 ----------
  routes.mind = () => {
    setHeader('정신전력', false);
    app.innerHTML = `
      <div class="tip">💡 <b>백지암기 루틴</b> — 읽기 → 첫 글자 → 빈칸 Lv1~3 → 백지 쓰기. 청색 핵심키워드가 채점 기준이에요.</div>
      ${['A안', 'B안'].map((set) => `
        <h2 class="sec-title">${set}</h2>
        <div class="list">${MIND.filter((q) => q.set === set).map((q) => {
          const r = S.mind[q.id] || {};
          const best = r.best || 0;
          return `<a class="row link" href="#mq/${q.id}">
            <div class="badge-id">${q.id}</div>
            <div class="row-body"><b>${esc(q.title)}</b><span>최고 ${best}점${r.tries ? ` · ${r.tries}회 응시` : ''}</span><div class="bar sm"><i style="width:${best}%"></i></div></div>
            <div class="chev">›</div></a>`;
        }).join('')}</div>`).join('')}
    `;
  };

  routes.mq = (id) => {
    const q = MIND.find((x) => x.id === id);
    if (!q) return go('mind');
    setHeader(q.id, '#mind');
    const r = S.mind[q.id] || {};
    const kws = keywordsOf(q);
    app.innerHTML = `
      <div class="q-head"><span class="badge-id lg">${q.id}</span><h2>${esc(q.title)}</h2><p>핵심키워드 ${kws.length}개 · 최고 ${r.best || 0}점</p></div>
      <div class="steps">
        <a class="step" href="#read/${id}"><i>1</i><div><b>읽기</b><small>키워드 하이라이트로 전체 읽기</small></div></a>
        <a class="step" href="#initial/${id}"><i>2</i><div><b>첫 글자 암기</b><small>어절 첫 글자만 보고 떠올리기</small></div></a>
        <a class="step" href="#cloze/${id}/1"><i>3</i><div><b>빈칸 Lv1</b><small>키워드 빈칸 + 초성 힌트</small></div></a>
        <a class="step" href="#cloze/${id}/2"><i>4</i><div><b>빈칸 Lv2</b><small>키워드 빈칸 (힌트 없음)</small></div></a>
        <a class="step" href="#cloze/${id}/3"><i>5</i><div><b>빈칸 Lv3</b><small>키워드 + 일반 어절 절반 빈칸</small></div></a>
        <a class="step final" href="#write/${id}"><i>✍</i><div><b>백지 쓰기 (실전)</b><small>통째로 써보고 자동 채점</small></div></a>
      </div>
      <h2 class="sec-title">우리의 자세 (개인 각오 메모)</h2>
      <textarea class="memo" id="memo" placeholder="직책과 연계한 개인 각오 · 경험/사례를 적어두세요. (자동 저장, 개인 경험·사례 작성 시 가점)">${esc(S.memo[id] || '')}</textarea>
    `;
    $('#memo').oninput = (e) => { S.memo[id] = e.target.value; save(); };
  };
  routes.mq.tab = 'mind';

  // 읽기
  routes.read = (id) => {
    const q = MIND.find((x) => x.id === id);
    setHeader(q.id + ' 읽기', '#mq/' + id);
    let hide = false;
    const draw = () => {
      app.innerHTML = `
        <div class="toolbar"><label class="sw"><input type="checkbox" id="hide" ${hide ? 'checked' : ''}><span></span>키워드 가리기</label></div>
        <div class="doc">${q.sections.map((sec) => `<h3>${esc(sec.h)}</h3>${sec.items.map((it, k) => `<p><i class="num">${NUM[k]}</i>${parse(it).map((t) => (t.kw ? `<mark class="kw ${hide ? 'hid' : ''}">${esc(t.s)}</mark>` : esc(t.s))).join('')}</p>`).join('')}`).join('')}
        <h3>${q.id.startsWith('B-2') ? '마' : '다'}. 우리의 자세</h3><p class="muted">${esc(S.memo[id] || '직책과 연계하여 개인의 각오 작성 (메모 탭에서 작성)')}</p></div>
        <a class="btn block" href="#initial/${id}">다음: 첫 글자 암기 →</a>`;
      $('#hide').onchange = (e) => { hide = e.target.checked; draw(); };
      $$('.kw').forEach((m) => { m.onclick = () => m.classList.toggle('hid'); });
    };
    draw();
  };
  routes.read.tab = 'mind';

  // 첫 글자
  routes.initial = (id) => {
    const q = MIND.find((x) => x.id === id);
    setHeader(q.id + ' 첫 글자', '#mq/' + id);
    const wordHtml = (w, kw) => {
      if (!w.trim()) return esc(w);
      const chars = [...w];
      const first = chars[0];
      const rest = chars.slice(1).map((c) => (/[\s.,·'"()<>:]/.test(c) ? c : '○')).join('');
      return `<span class="iw ${kw ? 'k' : ''}" data-full="${esc(w)}" data-short="${esc(first + rest)}">${esc(first + rest)}</span>`;
    };
    app.innerHTML = `
      <div class="tip">각 어절의 <b>첫 글자</b>만 보고 소리 내어 문장을 완성해 보세요. 어절을 탭하면 정답이 보여요.</div>
      <div class="toolbar"><button class="pill" id="showall">전체 보기</button><button class="pill ghost" id="hideall">전체 가리기</button></div>
      <div class="doc initial">${q.sections.map((sec) => `<h3>${esc(sec.h)}</h3>${sec.items.map((it, k) => `<p><i class="num">${NUM[k]}</i>${parse(it).map((t) => t.s.split(/(\s+)/).map((w) => wordHtml(w, t.kw)).join('')).join('')}</p>`).join('')}`).join('')}</div>
      <a class="btn block" href="#cloze/${id}/1">다음: 빈칸 Lv1 →</a>`;
    $$('.iw').forEach((s) => { s.onclick = () => { const open = s.classList.toggle('open'); s.textContent = open ? s.dataset.full : s.dataset.short; }; });
    $('#showall').onclick = () => $$('.iw').forEach((s) => { s.classList.add('open'); s.textContent = s.dataset.full; });
    $('#hideall').onclick = () => $$('.iw').forEach((s) => { s.classList.remove('open'); s.textContent = s.dataset.short; });
  };
  routes.initial.tab = 'mind';

  // 빈칸
  routes.cloze = (id, lvStr = '1') => {
    const q = MIND.find((x) => x.id === id);
    const lv = +lvStr;
    setHeader(`${q.id} 빈칸 Lv${lv}`, '#mq/' + id);
    const blanks = [];
    const STOP = /^[\d①-⑨().,·'"<>:]+$/;
    const blankHtml = (ans, hintOn) => {
      const idx = blanks.push(ans) - 1;
      const w = Math.max(3, Math.min(18, [...ans].length + 1));
      const ph = hintOn ? chosung(ans) : '';
      return `<input class="blank" data-i="${idx}" style="width:${w * 1.05}em" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off" spellcheck="false">`;
    };
    const body = q.sections.map((sec) => `<h3>${esc(sec.h)}</h3>${sec.items.map((it, k) => `<p><i class="num">${NUM[k]}</i>${parse(it).map((t) => {
      if (t.kw) return blankHtml(t.s, lv === 1);
      if (lv < 3) return esc(t.s);
      return t.s.split(/(\s+)/).map((w) => {
        const core = w.replace(/[.,'"]+$/, '');
        const tail = w.slice(core.length);
        if (!core.trim() || STOP.test(core) || core.length < 2 || Math.random() > 0.5) return esc(w);
        return blankHtml(core, false) + esc(tail);
      }).join('');
    }).join('')}</p>`).join('')}`).join('');
    app.innerHTML = `
      <div class="lv-tabs">${[1, 2, 3].map((n) => `<a href="#cloze/${id}/${n}" class="${n === lv ? 'on' : ''}">Lv${n}</a>`).join('')}</div>
      <div class="doc cloze">${body}</div>
      <div class="sticky-act"><button class="btn ghost" id="peek">정답 보기</button><button class="btn" id="check">채점하기</button></div>
      <div id="cres"></div>`;
    const inputs = $$('.blank');
    inputs.forEach((inp, k) => {
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (inputs[k + 1] || $('#check')).focus(); } });
    });
    $('#peek').onclick = () => inputs.forEach((inp) => { if (!inp.classList.contains('ok')) { inp.value = blanks[inp.dataset.i]; inp.classList.add('peeked'); } });
    $('#check').onclick = () => {
      let ok = 0;
      inputs.forEach((inp) => {
        const ans = blanks[inp.dataset.i];
        const good = norm(inp.value) === norm(ans) || (norm(ans).length >= 4 && dice(inp.value, ans) >= 0.85);
        inp.classList.remove('ok', 'ng');
        inp.classList.add(good && !inp.classList.contains('peeked') ? 'ok' : 'ng');
        if (good && !inp.classList.contains('peeked')) ok++;
        else inp.title = ans;
      });
      const sc = Math.round((ok / inputs.length) * 100);
      logHistory(`빈칸 Lv${lv}`, q.id, sc);
      $('#cres').innerHTML = `<div class="feedback ${sc >= 80 ? 'good' : 'bad'}"><b>${sc}점 (${ok}/${inputs.length})</b><span>틀린 칸을 길게 누르거나 '정답 보기'로 확인하세요.</span></div>
        <div class="btn-row">${lv < 3 ? `<a class="btn" href="#cloze/${id}/${lv + 1}">Lv${lv + 1} 도전 →</a>` : `<a class="btn" href="#write/${id}">백지 쓰기 도전 →</a>`}<button class="btn ghost" id="redo">다시</button></div>`;
      $('#redo').onclick = render;
      $('#cres').scrollIntoView({ behavior: 'smooth' });
    };
  };
  routes.cloze.tab = 'mind';

  // 백지 쓰기
  routes.write = (id) => {
    const q = MIND.find((x) => x.id === id);
    if (!q) return go('mind');
    setHeader(q.id + ' 백지 쓰기', '#mq/' + id);
    const draftKey = 'draft-' + id;
    const draft = S.memo[draftKey] || {};
    const t0 = Date.now();
    app.innerHTML = `
      <div class="paper">
        <div class="paper-head"><span>'26 전투력 측정 [정신전력]</span><span class="timer" id="tm">00:00</span></div>
        <h2 class="paper-q">${q.id}. ${esc(q.title)}</h2>
        ${q.sections.map((sec, si) => `
          <h3>${esc(sec.h)}</h3>
          <textarea class="sheet" data-si="${si}" rows="${Math.max(4, sec.items.length * 3)}" placeholder="① ...">${esc(draft[si] || '')}</textarea>`).join('')}
      </div>
      <div class="sticky-act"><button class="btn ghost" id="clear">지우기</button><button class="btn" id="grade">제출 · 채점</button></div>
      <div id="wres"></div>`;
    const timer = setInterval(() => { const el = $('#tm'); if (el) el.textContent = fmtTime(Math.floor((Date.now() - t0) / 1000)); }, 500);
    cleanup = () => clearInterval(timer);
    $$('.sheet').forEach((ta) => { ta.oninput = () => { draft[ta.dataset.si] = ta.value; S.memo[draftKey] = draft; save(); }; });
    $('#clear').onclick = () => { if (confirm('작성한 내용을 모두 지울까요?')) { S.memo[draftKey] = {}; save(); render(); } };
    $('#grade').onclick = () => {
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      let kwTotal = 0, kwGot = 0, simSum = 0;
      const secRes = q.sections.map((sec, si) => {
        const text = $(`.sheet[data-si="${si}"]`).value;
        const ref = sec.items.map(plain).join(' ');
        const kws = sec.items.flatMap((it) => parse(it).filter((t) => t.kw).map((t) => t.s));
        const kr = kws.map((k) => { const r = recall(k, text); const v = r === 1 ? 1 : r >= 0.75 ? 0.5 : 0; return { k, v }; });
        kwTotal += kr.length; kwGot += kr.reduce((a, x) => a + x.v, 0);
        const sim = dice(text, ref);
        simSum += sim;
        return { sec, text, kr, sim };
      });
      const kwRate = kwTotal ? kwGot / kwTotal : 0;
      const simRate = simSum / q.sections.length;
      const sc = Math.round(kwRate * 70 + Math.min(1, simRate * 1.15) * 30);
      const r = S.mind[q.id] || { best: 0, tries: 0 };
      const isBest = sc > r.best;
      r.best = Math.max(r.best, sc); r.tries++; r.last = sc;
      S.mind[q.id] = r;
      logHistory('백지 쓰기', q.id, sc);
      clearInterval(timer);
      $('#wres').innerHTML = `
        ${result(sc, `${isBest ? '🏆 최고 기록! · ' : ''}소요 ${fmtTime(elapsed)}`, [])}
        <div class="score-break">
          <div><b>${Math.round(kwRate * 100)}%</b><span>핵심키워드 (70%)</span></div>
          <div><b>${Math.round(Math.min(1, simRate * 1.15) * 100)}%</b><span>문장 일치도 (30%)</span></div>
        </div>
        ${secRes.map((s) => `
          <div class="panel">
            <h3>${esc(s.sec.h)}</h3>
            <div class="kw-chips">${s.kr.map((x) => `<span class="chip ${x.v === 1 ? 'ok' : x.v ? 'half' : 'ng'}">${x.v === 1 ? '✓' : x.v ? '△' : '✕'} ${esc(x.k)}</span>`).join('')}</div>
            <details><summary>모범답안과 비교</summary>
              <div class="cmp"><div><small>내 답안</small><p>${esc(s.text) || '<span class="muted">(미작성)</span>'}</p></div>
              <div><small>모범답안</small>${s.sec.items.map((it, k) => `<p><i class="num">${NUM[k]}</i>${parse(it).map((t) => (t.kw ? `<mark class="kw ${s.kr.find((x) => x.k === t.s && x.v === 1) ? '' : 'miss'}">${esc(t.s)}</mark>` : esc(t.s))).join('')}</p>`).join('')}</div></div>
            </details>
          </div>`).join('')}
        <div class="btn-row"><button class="btn" id="again">새로 쓰기</button><a class="btn ghost" href="#cloze/${id}/2">빈칸 연습</a></div>`;
      $('#again').onclick = () => { S.memo[draftKey] = {}; save(); render(); };
      $('#wres').scrollIntoView({ behavior: 'smooth' });
      if (isBest && sc >= 80) confetti();
    };
  };
  routes.write.tab = 'mind';


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
    // vals: {n: 0|0.5|1}  → 평가요소 배점 × 항목 평균
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
    setHeader('TCCC', false);
    const t = S.tccc;
    app.innerHTML = `
      <div class="sit-card">
        <small>메시지 카드 ① · 상황부여</small>
        <p>${esc(TCCC_SITUATION.card)}</p>
        <ul>${TCCC_SITUATION.injuries.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <em>⏱ ${esc(TCCC_SITUATION.time)}</em>
      </div>
      <div class="tip">🗣 <b>실기 평가</b> — 손으로 행동하면서 <b>입으로 크게 말해야</b> 점수가 나와요. 대사를 소리 내어 외우고, 리허설은 실제 장비(또는 흉내)를 들고 해보세요.</div>
      <div class="mode-grid">
        <a class="mode" href="#tsteps"><span class="mi">📋</span><b>절차 학습</b><small>41단계 · 대사 듣기/수정</small></a>
        <a class="mode hot" href="#trun"><span class="mi">⏱️</span><b>15분 리허설</b><small>${t.best ? `최고 ${t.best}% · ${t.tries}회` : '말하며 실전처럼'}</small></a>
        <a class="mode" href="#torder"><span class="mi">🔢</span><b>순서 맞추기</b><small>처치 흐름 외우기</small></a>
        <a class="mode" href="#flash/tccc"><span class="mi">🃏</span><b>핵심 카드</b><small>숫자·위치 ${TCCC_CARDS.length}장</small></a>
        <a class="mode" href="#quiz/tccc"><span class="mi">⚡</span><b>객관식</b><small>10문제 · 점수</small></a>
        <a class="mode" href="#tsheet"><span class="mi">📄</span><b>평가표</b><small>배점 · 감점기준</small></a>
      </div>
      <h2 class="sec-title">처치 흐름 한눈에</h2>
      <div class="flow">${phases().map((ph) => `<div class="flow-ph"><b>${esc(ph)}</b><div>${TCCC_GROUPS.filter((g) => g.phase === ph).map((g) => `<span>${esc(g.name)}</span>`).join('<i>›</i>')}</div></div>`).join('')}</div>
    `;
  };

  // 절차 학습
  routes.tsteps = () => {
    setHeader('TCCC 절차 학습', '#tccc');
    let playing = false;
    const draw = () => {
      app.innerHTML = `
        <div class="toolbar"><button class="pill" id="playall">${playing ? '■ 정지' : '▶ 대사 전체 듣기'}</button></div>
        ${phases().map((ph) => `<h2 class="sec-title">${esc(ph)}</h2>
          ${TCCC_GROUPS.filter((g) => g.phase === ph).map((g) => `
            <div class="panel steps-g">
              <h3>${esc(g.name)} <span class="pts">${g.pts}점</span></h3>
              ${TCCC.filter((it) => it.g === g.id).map((it) => `
                <div class="tstep" id="ts${it.n}">
                  <div class="tn">${it.n}</div>
                  <div class="tb">
                    ${it.cue ? `<div class="cue">📢 평가관: ${esc(it.cue)}</div>` : ''}
                    <p class="tt">${esc(it.t)}</p>
                    ${it.note ? `<p class="tnote">• ${esc(it.note)}</p>` : ''}
                    <div class="say"><span>🗣</span><b>${esc(sayOf(it))}</b>
                      <button class="ib" data-play="${it.n}" aria-label="듣기">🔊</button>
                      <button class="ib" data-edit="${it.n}" aria-label="대사 수정">✏️</button></div>
                  </div>
                </div>`).join('')}
            </div>`).join('')}`).join('')}
        <p class="hint">✏️ 로 대사를 우리 부대 방식에 맞게 바꿀 수 있어요 (이 기기에 저장).</p>`;
      $$('[data-play]').forEach((b) => { b.onclick = () => { hush(); speak(sayOf(TCCC.find((x) => x.n === +b.dataset.play))); }; });
      $$('[data-edit]').forEach((b) => { b.onclick = () => {
        const it = TCCC.find((x) => x.n === +b.dataset.edit);
        const v = prompt(`${it.n}번 대사 (비우면 기본값으로)`, sayOf(it));
        if (v === null) return;
        if (v.trim() === '' || v.trim() === it.say) delete S.tcccSay[it.n]; else S.tcccSay[it.n] = v.trim();
        save(); draw(); $('#ts' + it.n).scrollIntoView({ block: 'center' });
      }; });
      $('#playall').onclick = () => {
        if (playing) { playing = false; hush(); draw(); return; }
        playing = true; draw();
        let k = 0;
        const next = () => {
          if (!playing || k >= TCCC.length) { playing = false; $$('.tstep.now').forEach((e) => e.classList.remove('now')); const b = $('#playall'); if (b) b.textContent = '▶ 대사 전체 듣기'; return; }
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

  // 15분 리허설
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
      <div class="tip">손은 행동, 입은 대사! 한 단계를 끝낼 때마다 스스로 ○ △ ✕ 로 채점하세요. 15분이 지나면 남은 항목은 감점돼요.</div>
      <button class="btn block" id="start">▶ 15분 타이머 시작</button>`;
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
      const left = () => Math.max(0, LIMIT - Math.floor((Date.now() - t0) / 1000));
      const timer = setInterval(() => {
        const el = $('#tm');
        const l = left();
        if (el) { el.textContent = fmtTime(l); el.classList.toggle('warn', l <= 180); }
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
          <div class="mic-head"><i class="dot ${micMsg ? '' : 'live'}"></i>${micMsg ? esc(micMsg) : '듣는 중…'}</div>
          ${kws.length ? `<div class="kw-chips">${kws.map((k) => `<span class="chip ${recall(k, txt) >= 0.99 ? 'ok' : ''}">${esc(k)}</span>`).join('')}</div>` : ''}
          <p class="heard">${esc(txt.slice(-120)) || '<span class="muted">말한 내용이 여기에 표시돼요</span>'}</p>`;
      };
      const draw = () => {
        if (i >= TCCC.length) return finish(false);
        const it = TCCC[i], g = grp(it.g);
        heard = ''; interim = '';
        shown = opt.mode === 'practice';
        app.innerHTML = `
          <div class="quiz-top"><span>${it.n} / ${TCCC.length}</span><span class="timer big" id="tm">${fmtTime(left())}</span><button class="pill ghost" id="stop">종료</button></div>
          <div class="bar thin"><i style="width:${(i / TCCC.length) * 100}%;background:var(--red)"></i></div>
          <div class="run-card">
            <div class="run-g"><span>${esc(g.phase)}</span> › <b>${esc(g.name)}</b></div>
            ${it.cue ? `<div class="cue big">📢 평가관: "${esc(it.cue)}"</div>` : ''}
            <div class="run-body" id="rb">
              ${shown ? `<p class="tt">${esc(it.t)}</p>${it.note ? `<p class="tnote">• ${esc(it.note)}</p>` : ''}<div class="say"><span>🗣</span><b>${esc(sayOf(it))}</b></div>`
                : `<p class="recall">${it.n}번 — 무엇을 하고, 뭐라고 말하나요?</p><p class="muted">행동하며 크게 말한 뒤 확인하세요.</p>`}
            </div>
          </div>
          ${lis ? '<div class="mic" id="mic"></div>' : ''}
          <div id="ctrl">${shown ? gradeBtns() : '<button class="btn block" id="reveal">확인하기</button>'}</div>
          <button class="linkbtn" id="prev" ${i ? '' : 'hidden'}>← 이전 단계</button>`;
        paintMic();
        if (opt.voice && it.cue) { hush(); speak('평가관. ' + it.cue); }
        bind();
      };
      const gradeBtns = () => `<div class="self3">
          <button class="sbtn bad" data-v="0">✕<small>못함</small></button>
          <button class="sbtn mid" data-v="0.5">△<small>미흡</small></button>
          <button class="sbtn good" data-v="1">○<small>완벽</small></button></div>`;
      const bind = () => {
        $('#stop').onclick = () => { if (confirm('리허설을 종료하고 채점할까요? (남은 항목은 0점)')) finish(true); };
        const pv = $('#prev'); if (pv) pv.onclick = () => { i--; draw(); };
        const rv = $('#reveal');
        if (rv) rv.onclick = () => {
          const it = TCCC[i];
          $('#rb').innerHTML = `<p class="tt">${esc(it.t)}</p>${it.note ? `<p class="tnote">• ${esc(it.note)}</p>` : ''}<div class="say"><span>🗣</span><b>${esc(sayOf(it))}</b></div>`;
          $('#ctrl').innerHTML = gradeBtns();
          bind();
        };
        $$('.sbtn').forEach((b) => { b.onclick = () => { vals[TCCC[i].n] = +b.dataset.v; i++; draw(); }; });
      };
      const finish = (cut) => {
        if (done) return; done = true;
        const used = Math.min(LIMIT, Math.floor((Date.now() - t0) / 1000));
        cleanup(); cleanup = null;
        document.body.dataset.route = 'trun';
        const r = tcccScore(vals);
        const t = S.tccc;
        const isBest = r.pct > (t.best || 0);
        t.best = Math.max(t.best || 0, r.pct); t.tries = (t.tries || 0) + 1; t.last = r.pct;
        logHistory('TCCC 리허설', `${r.total}/50 · ${r.label}`, r.pct);
        const miss = TCCC.filter((it) => (vals[it.n] || 0) < 1);
        app.innerHTML = result(r.pct, `${r.label} · ${r.total}/50점 (환산 ${r.conv}점) · ${fmtTime(used)}${cut && used >= LIMIT ? ' · 시간초과' : ''}${isBest ? ' · 🏆 최고 기록' : ''}`, [
          '<button class="btn" id="retry">다시 하기</button>', '<a class="btn ghost" href="#tsteps">절차 복습</a>'
        ]) + `
          <div class="panel"><h3>평가요소별 점수</h3>
            <table class="mopp score-t"><thead><tr><th>평가요소</th><th>배점</th><th>득점</th></tr></thead>
            <tbody>${r.rows.map((x) => `<tr><td class="l">${esc(x.g.name)}</td><td>${x.g.pts}</td><td class="${x.got >= x.g.pts ? 'okc' : x.got ? 'midc' : 'ngc'}">${x.got}</td></tr>`).join('')}
            <tr><th>합계</th><th>50</th><th>${r.total}</th></tr></tbody></table>
            <p class="muted" style="font-size:12px;margin:8px 0 0">※ 항목 ○=1, △=0.5, ✕=0 을 평가요소 배점에 비례 환산한 자가 채점 결과예요.</p>
          </div>
          ${miss.length ? `<h2 class="sec-title">보완할 항목 ${miss.length}개</h2><div class="qa-list">${miss.map((it) => `<div class="qa ng"><b>${it.n}. ${esc(it.t)}</b><p>🗣 ${esc(sayOf(it))}</p></div>`).join('')}</div>` : ''}`;
        $('#retry').onclick = render;
        save();
        if (isBest && r.pct >= 90) confetti();
      };
      if (opt.voice) speak('상황부여. ' + TCCC_SITUATION.card + '. 평가 시작.');
      draw();
    };
  };
  routes.trun.tab = 'tccc';

  // 순서 맞추기
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
      <p class="hint">${cur.id === 'flow' ? '처치 순서대로' : '평가 순서대로'} 탭하세요 · <b id="ord-st">0 / ${items.length}</b></p>
      <div class="ord-done" id="done"></div>
      <div class="ord-pool">${shuffled.map((x) => `<button class="ord" data-k="${x.k}"><b>${esc(x.label)}</b>${cur.id === 'flow' ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('')}</div>
      <div id="ores"></div>`;
    $$('.ord').forEach((b) => { b.onclick = () => {
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
            <div class="btn-row"><button class="btn ghost" id="redo">다시</button>${sets[idx + 1] ? `<a class="btn" href="#torder/${sets[idx + 1].id}">다음: ${esc(sets[idx + 1].name)} →</a>` : ''}</div>`;
          $('#redo').onclick = render;
          if (!miss) confetti();
        }
      } else {
        miss++; vibrate(60);
        b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      }
    }; });
  };
  routes.torder.tab = 'tccc';

  // 평가표
  routes.tsheet = () => {
    setHeader('TCCC 평가표', '#tccc');
    app.innerHTML = `
      <div class="panel"><h3>등급 기준 (50점 만점)</h3>
        <div class="grade-row"><span class="gS">특급 90%</span><span class="gA">합격 80%</span><span class="gB">합격 70%</span><span class="gD">불합격 60%↓</span></div>
        <p class="muted" style="font-size:13px;margin:8px 0 0">평가표 환산 기준: 특급 18점 이상 / 합격 16점(80%)·14점(70%) / 불합격 13.9점 이하</p>
      </div>
      ${TCCC_GROUPS.map((g) => `
        <div class="panel">
          <h3>${esc(g.name)} <span class="pts">${g.pts}점</span> <small class="muted">${esc(g.phase)}</small></h3>
          ${TCCC.filter((it) => it.g === g.id).map((it) => `<div class="sheet-row"><i>${it.n}</i><div><p>${esc(it.t)}</p>${it.note ? `<small>• ${esc(it.note)}</small>` : ''}</div></div>`).join('')}
        </div>`).join('')}`;
  };
  routes.tsheet.tab = 'tccc';

  // ---------- 기록 ----------
  routes.stats = () => {
    setHeader('기록', false);
    const cnt = (b) => CBRN.filter((c) => cardBox(c.id) === b).length;
    app.innerHTML = `
      <div class="panel">
        <h3>화생방 카드 상태</h3>
        <div class="stack">
          <i style="flex:${cnt(3)};background:var(--green)"></i><i style="flex:${cnt(2)};background:var(--yellow)"></i><i style="flex:${cnt(1)};background:var(--red)"></i><i style="flex:${cnt(0)};background:var(--line)"></i>
        </div>
        <div class="legend"><span><i style="background:var(--green)"></i>암기 ${cnt(3)}</span><span><i style="background:var(--yellow)"></i>애매 ${cnt(2)}</span><span><i style="background:var(--red)"></i>모름 ${cnt(1)}</span><span><i style="background:var(--line)"></i>미학습 ${cnt(0)}</span></div>
      </div>
      <div class="panel">
        <h3>정신전력 최고점</h3>
        ${MIND.map((q) => { const b = (S.mind[q.id] || {}).best || 0; return `<div class="hbar"><span>${q.id}</span><div class="bar"><i style="width:${b}%"></i></div><b>${b}</b></div>`; }).join('')}
      </div>
      <div class="panel">
        <h3>TCCC 리허설</h3>
        <div class="hbar"><span>최고</span><div class="bar"><i style="width:${S.tccc.best || 0}%;background:var(--red)"></i></div><b>${S.tccc.best || 0}</b></div>
        <p class="muted" style="margin:4px 0 0;font-size:13px">${S.tccc.tries ? `${S.tccc.tries}회 응시 · 최근 ${S.tccc.last}%` : '아직 응시 기록이 없어요.'}</p>
      </div>
      <h2 class="sec-title">최근 학습</h2>
      ${S.history.length ? `<div class="list">${S.history.slice(0, 30).map((h) => `<div class="row"><div class="grade g${grade(h.score)}">${grade(h.score)}</div><div class="row-body"><b>${esc(h.type)} · ${esc(h.title)}</b><span>${esc(h.at)}</span></div><div class="row-score">${h.score}점</div></div>`).join('')}</div>` : '<p class="muted center">아직 기록이 없어요.</p>'}
      <button class="btn ghost block danger" id="reset">학습 기록 초기화</button>
    `;
    $('#reset').onclick = () => { if (confirm('모든 기록과 메모를 초기화할까요?')) { S = defaults(); save(); render(); } };
  };

  // ---------- 공통 조각 ----------
  const result = (sc, sub, btns) => `
    <div class="result">
      <div class="big-ring">${ring(sc, '', sc >= 80 ? 'var(--green)' : sc >= 60 ? 'var(--yellow)' : 'var(--red)')}<span class="grade-l g${grade(sc)}">${grade(sc)}</span></div>
      <h2>${sc}점</h2><p>${esc(sub)}</p>
      <div class="btn-row">${btns.join('')}</div>
    </div>`;
  const empty = (t, back, sub = '') => `<div class="empty"><div>📭</div><b>${esc(t)}</b><p>${esc(sub)}</p><a class="btn" href="${back}">돌아가기</a></div>`;
  const confetti = () => {
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#4255ff', '#23b26d', '#ffcd1f', '#ff7a59', '#a26bfa'];
    box.innerHTML = Array.from({ length: 60 }, () => `<i style="left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * 5)]};animation-delay:${Math.random() * 0.5}s;animation-duration:${1.5 + Math.random()}s"></i>`).join('');
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3000);
  };

  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
