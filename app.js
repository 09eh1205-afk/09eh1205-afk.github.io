/* 1~4분할 차트 — TradingView Lightweight Charts 기반 커스텀 차트
   · 십자선 + 오른쪽 가격축 + 버튼 → 그 가격의 돌파 알림을 원터치로 등록
   · 캔들 + RSI(14) 패널 + 우측 VPVR(보이는 구간 매물대)
   · 1~4분할 전환 / 1화면 확대 / 4개 슬롯 종목 변경 / 타임프레임 / 화이트·다크 / 작도 도구 / GitHub 동기화
   알림 규칙: 목표가를 위로든 아래로든 "새로 지나갈 때" 한 번만 (이상/이하 상시 조건 아님) */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  var LC = window.LightweightCharts;

  if (!LC) {
    var fb = document.createElement('script');
    fb.src = 'https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js';
    fb.onload = function () { if (window.LightweightCharts) boot(); else fatal(); };
    fb.onerror = fatal;
    document.head.appendChild(fb);
  } else {
    boot();
  }

  function fatal() {
    var g = $('grid');
    if (g) g.innerHTML = '<p style="padding:20px;font-size:12px;color:#8b95a5">차트 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 새로고침해 주세요.</p>';
  }

  function boot() {
    LC = window.LightweightCharts;

    /* ── 저장 키·상수 ─────────────────────────────── */
    var STORE = 'btc-ndx-gold-3split.v5';
    var LEGACY_STORES = ['btc-ndx-gold-3split.v4', 'btc-ndx-gold-3split.v3', 'btc-ndx-gold-3split.v2'];
    var ALERT_STORE = 'btc-ndx-gold-3split.alerts.v1';
    var GH_STORE = 'btc-ndx-gold-3split.gh.v1';
    var DRAW_STORE = 'btc-ndx-gold-3split.draw.v2';
    var TIP_STORE = 'btc-ndx-gold-3split.tip.v2';
    var GH_DEFAULT_REPO = '09eh1205-afk/chart-alerts';
    var GH_FILE = 'alerts.json';
    var INTERVALS = ['1', '5', '15', '30', '60', '240', 'D', 'W'];
    var MAX_ALERTS = 30;
    var POLL_MS = 10000;

    var BN_IV = { '1': '1m', '5': '5m', '15': '15m', '30': '30m', '60': '1h', '240': '4h', 'D': '1d', 'W': '1w' };
    /* Yahoo 차트 API: 4시간·주봉은 아래 간격을 모아서 만든다 */
    var YF = {
      '1':   { interval: '1m',  range: '1d' },
      '5':   { interval: '5m',  range: '5d' },
      '15':  { interval: '15m', range: '5d' },
      '30':  { interval: '30m', range: '1mo' },
      '60':  { interval: '60m', range: '1mo' },
      '240': { interval: '60m', range: '3mo', agg: 4 },
      'D':   { interval: '1d',  range: '2y' },
      'W':   { interval: '1d',  range: '5y', agg: 'week' }
    };
    var TF_MS = { '1': 6e4, '5': 3e5, '15': 9e5, '30': 18e5, '60': 36e5, '240': 144e5, 'D': 864e5, 'W': 6048e5 };

    /* ── 인기 프리셋 ─────────────────────────────── */
    var PRESETS = [
      { g: '코인', items: [
        ['BINANCE:BTCUSDT', 'BTC/USDT'], ['BINANCE:ETHUSDT', 'ETH/USDT'],
        ['BINANCE:SOLUSDT', 'SOL/USDT'], ['BINANCE:XRPUSDT', 'XRP/USDT'],
        ['BINANCE:DOGEUSDT', 'DOGE/USDT'], ['BINANCE:PAXGUSDT', 'PAXG(금)']
      ] },
      { g: '지수', items: [
        ['OANDA:NAS100USD', 'NAS100'], ['OANDA:SPX500USD', 'S&P500'],
        ['OANDA:US30USD', 'DOW30'], ['KRX:KOSPI', 'KOSPI'], ['KRX:KOSDAQ', 'KOSDAQ']
      ] },
      { g: '미국 주식', items: [
        ['NASDAQ:NVDA', 'NVDA'], ['NASDAQ:TSLA', 'TSLA'], ['NASDAQ:AAPL', 'AAPL'],
        ['NASDAQ:MSFT', 'MSFT'], ['NASDAQ:AMZN', 'AMZN'], ['NASDAQ:GOOGL', 'GOOGL']
      ] },
      { g: '한국 주식', items: [ ['KRX:005930', '삼성전자'], ['KRX:000660', 'SK하이닉스'] ] },
      { g: '원자재·환율', items: [
        ['OANDA:XAUUSD', 'XAUUSD'], ['OANDA:XAGUSD', 'XAGUSD'],
        ['FX_IDC:USDKRW', 'USD/KRW'], ['FX_IDC:USDJPY', 'USD/JPY']
      ] }
    ];

    var YAHOO_TICKER = {
      'OANDA:XAUUSD': 'GC=F', 'OANDA:XAGUSD': 'SI=F',
      'OANDA:NAS100USD': '^NDX', 'OANDA:SPX500USD': '^GSPC', 'OANDA:US30USD': '^DJI',
      'OANDA:DE40EUR': '^GDAXI', 'OANDA:JP225USD': '^N225',
      'FX_IDC:USDKRW': 'KRW=X', 'FX_IDC:USDJPY': 'JPY=X', 'FX_IDC:EURUSD': 'EURUSD=X',
      'KRX:KOSPI': '^KS11', 'KRX:KOSDAQ': '^KQ11'
    };

    var SYM_RE = /^[A-Z0-9_.\-!]+:[A-Z0-9_.\-]+$/;

    function binancePair(symbol) {
      var m = /^BINANCE:([A-Z0-9]+)(USDT|USDC|FDUSD|BTC|ETH)$/.exec(symbol || '');
      return m ? m[1] + m[2] : null;
    }
    function yahooTicker(symbol) {
      if (YAHOO_TICKER[symbol]) return YAHOO_TICKER[symbol];
      var m = /^([A-Z_]+):(.+)$/.exec(symbol || '');
      if (!m) return null;
      var ex = m[1], code = m[2];
      if (ex === 'KRX') return /^[0-9]{6}$/.test(code) ? code + '.KS' : null;
      if (ex === 'NASDAQ' || ex === 'NYSE' || ex === 'AMEX' || ex === 'NYSEARCA') return code;
      if (ex === 'FX' || ex === 'FX_IDC') return code.replace('/', '') + '=X';
      return null;
    }
    function hasCandles(symbol) { return !!(binancePair(symbol) || yahooTicker(symbol)); }
    function hasLive(symbol) { return !!(binancePair(symbol) || yahooTicker(symbol)); }

    function labelFor(sym) {
      for (var i = 0; i < PRESETS.length; i++) {
        for (var j = 0; j < PRESETS[i].items.length; j++) {
          if (PRESETS[i].items[j][0] === sym) return PRESETS[i].items[j][1];
        }
      }
      var parts = String(sym).split(':');
      return parts[1] || sym;
    }
    function isPreset(sym) {
      for (var i = 0; i < PRESETS.length; i++) {
        for (var j = 0; j < PRESETS[i].items.length; j++) if (PRESETS[i].items[j][0] === sym) return true;
      }
      return false;
    }

    /* ── 상태 ────────────────────────────────────── */
    var DEFAULT_SLOTS = [
      { symbol: 'BINANCE:BTCUSDT', label: 'BTC/USDT' },
      { symbol: 'OANDA:NAS100USD', label: 'NAS100' },
      { symbol: 'OANDA:XAUUSD', label: 'XAUUSD' },
      { symbol: 'BINANCE:ETHUSDT', label: 'ETH/USDT' }
    ];
    var slots = DEFAULT_SLOTS.map(function (d, i) { return { id: 'p' + (i + 1), symbol: d.symbol, label: d.label }; });
    var state = { interval: '15', theme: 'light', layout: 4, zoom: -1, tools: false, tool: null };   /* layout: 1~4분할 (기본 4분할) */
    var alerts = [];
    var prices = {};
    var lastSlot = 0;
    var gh = { repo: GH_DEFAULT_REPO, token: '', busy: false, again: false, status: { k: '', m: '미설정' } };
    var panels = [];
    var drawStore = {};
    var bannerTimer = null, toastTimer = null, audioCtx = null;
    var lastYahoo = 0;

    /* ── 공통 헬퍼 ───────────────────────────────── */
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function decimalsFor(v) {
      var a = Math.abs(v);
      if (a >= 1000) return 2;
      if (a >= 1) return 2;
      if (a >= 0.1) return 4;
      if (a >= 0.01) return 5;
      return 7;
    }
    function fmt(n, d) {
      if (n === null || n === undefined || !isFinite(n)) return '–';
      if (d === undefined) d = decimalsFor(n);
      try {
        return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
      } catch (e) { return String(n); }
    }
    function fmtTime(d) {
      if (!d) return '';
      d = new Date(d);
      var h = d.getHours(), m = d.getMinutes();
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }
    function fmtHM(d, s) {
      var h = d.getHours(), m = d.getMinutes();
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + (s ? ':' + (d.getSeconds() < 10 ? '0' : '') + d.getSeconds() : '');
    }
    function tNum(t) {
      if (typeof t === 'number') return t;
      if (t && t.year) return Date.UTC(t.year, t.month - 1, t.day) / 1000;
      return 0;
    }
    function tDate(t) {
      if (typeof t === 'number') return new Date(t * 1000);
      if (t && t.year) return new Date(t.year, t.month - 1, t.day);
      return null;
    }

    function theme() {
      var dark = state.theme === 'dark';
      return {
        bg: dark ? '#0b0e11' : '#ffffff',
        grid: dark ? 'rgba(120,130,150,.14)' : 'rgba(20,26,33,.06)',
        txt: dark ? '#d7dde7' : '#141a21',
        dim: dark ? '#8b95a5' : '#6b7480',
        up: '#0f9d76', down: '#e0413a',
        cross: dark ? 'rgba(215,221,231,.55)' : 'rgba(20,26,33,.45)',
        axis: dark ? '#20262f' : '#dfe3e8',
        vpvr: dark ? 'rgba(120,145,190,.30)' : 'rgba(70,105,160,.22)',
        vpvrHi: dark ? 'rgba(150,175,220,.45)' : 'rgba(70,105,160,.35)',
        draw: dark ? '#7fb0ff' : '#2b6cf0',
        fib: ['#f0a800', '#2b6cf0', '#8e5ce6', '#26a69a', '#ef5350', '#5b6b7c', '#c2185b']
      };
    }

    /* ── 저장 ────────────────────────────────────── */
    function readStore() {
      var s = null;
      try {
        var raw = localStorage.getItem(STORE);
        if (raw) s = JSON.parse(raw);
        for (var i = 0; !s && i < LEGACY_STORES.length; i++) {
          var r = localStorage.getItem(LEGACY_STORES[i]);
          if (r) s = JSON.parse(r);
        }
      } catch (e) { s = null; }
      return s;
    }
    function load() {
      var s = readStore();
      if (s) {
        if (INTERVALS.indexOf(s.interval) >= 0) state.interval = s.interval;
        if (s.theme === 'dark') state.theme = 'dark';
        if (typeof s.tools === 'boolean') state.tools = s.tools;
        if (s.layout === 1 || s.layout === 2 || s.layout === 3 || s.layout === 4) state.layout = s.layout;
        if (Array.isArray(s.slots)) {
          s.slots.slice(0, 4).forEach(function (x, i) {
            if (x && typeof x.symbol === 'string') {
              var sym = String(x.symbol).toUpperCase().trim();
              if (SYM_RE.test(sym)) {
                slots[i].symbol = sym;
                slots[i].label = (typeof x.label === 'string' && x.label) ? x.label : labelFor(sym);
              }
            }
          });
        }
      }
      loadDraw();
      loadAlerts();
    }
    function saveLayout() {
      try {
        localStorage.setItem(STORE, JSON.stringify({ interval: state.interval, theme: state.theme, layout: state.layout, tools: state.tools, slots: slots }));
      } catch (e) {}
    }
    function loadDraw() {
      try {
        var raw = localStorage.getItem(DRAW_STORE);
        drawStore = raw ? (JSON.parse(raw) || {}) : {};
      } catch (e) { drawStore = {}; }
    }
    function saveDraw() {
      try { localStorage.setItem(DRAW_STORE, JSON.stringify(drawStore)); } catch (e) {}
    }

    /* ── 알림 저장/복원 (예전 알림도 '돌파' 방식으로 승계) ── */
    function loadAlerts() {
      try {
        var ra = localStorage.getItem(ALERT_STORE);
        if (!ra) return;
        var arr = JSON.parse(ra);
        if (!Array.isArray(arr)) return;
        var alias = { btc: 'p1', ndx: 'p2', gold: 'p3', p1: 'p1', p2: 'p2', p3: 'p3' };
        alerts = arr.map(function (a, i) {
          if (!a) return null;
          var sym = a.symbol;
          if (!sym) {
            var si = slotIndex(alias[a.slot] || a.slot);
            if (si < 0) return null;
            sym = slots[si].symbol;
          }
          sym = String(sym).toUpperCase().trim();
          if (!SYM_RE.test(sym)) return null;
          if (!isFinite(a.price) || a.price <= 0) return null;
          return {
            id: a.id || ('a' + Date.now().toString(36) + i),
            symbol: sym,
            label: (typeof a.label === 'string' && a.label) ? a.label : labelFor(sym),
            dir: 'cross',
            price: Number(a.price),
            basePrice: isFinite(a.basePrice) ? Number(a.basePrice) : null,
            lastPrice: isFinite(a.basePrice) ? Number(a.basePrice) : null,
            on: a.on !== false,
            firedAt: a.firedAt || null,
            firedPrice: isFinite(a.firedPrice) ? Number(a.firedPrice) : null,
            updated: a.updated || 0,
            del: !!a.del
          };
        }).filter(Boolean).slice(0, MAX_ALERTS);
      } catch (e) {}
    }
    function liveAlerts() { return alerts.filter(function (a) { return !a.del; }); }
    function saveAlerts() {
      try { localStorage.setItem(ALERT_STORE, JSON.stringify(alerts)); } catch (e) {}
    }
    function slotIndex(id) {
      for (var i = 0; i < slots.length; i++) if (slots[i].id === id) return i;
      return -1;
    }

    /* ── 차트 패널 만들기 ────────────────────────── */
    var grid = $('grid');

    function makePanel(i) {
      var el = document.createElement('section');
      el.className = 'panel';
      el.dataset.i = String(i);
      el.innerHTML =
        '<div class="chart">' +
          '<div class="wrap">' +
            '<div class="pchart"></div>' +
            '<canvas class="pcv"></canvas>' +
            '<div class="rsi"><canvas class="rcv"></canvas></div>' +
            '<div class="hit"></div>' +
            '<button class="plus" type="button" aria-label="이 가격에 돌파 알림 설정">+</button>' +
            '<div class="qpop">' +
              '<button class="qx" type="button" aria-label="닫기">✕</button>' +
              '<div class="qpx">–</div>' +
              '<div class="qdir">–</div>' +
              '<button class="qadd" type="button">🔔 돌파 알림 설정</button>' +
              '<div class="qnote">지금 이 가격을 지나갈 때 한 번 알려드려요</div>' +
            '</div>' +
            '<div class="msg"><div><p>불러오는 중…</p><span></span><button class="retry" type="button">다시 시도</button></div></div>' +
          '</div>' +
          '<button class="tag" type="button"><b>–</b><span>–</span></button>' +
          '<div class="cpr"><span class="src">–</span></div>' +
        '</div>';
      return el;
    }

    function buildPanels() {
      slots.forEach(function (s, i) {
        var el = makePanel(i);
        grid.appendChild(el);
        var P = {
          i: i, el: el,
          wrap: el.querySelector('.wrap'),
          pchartEl: el.querySelector('.pchart'),
          rsiEl: el.querySelector('.rsi'),
          pcv: el.querySelector('.pcv'),
          rcv: el.querySelector('.rcv'),
          hit: el.querySelector('.hit'),
          plusEl: el.querySelector('.plus'),
          popEl: el.querySelector('.qpop'),
          msg: el.querySelector('.msg'),
          tag: el.querySelector('.tag'),
          cpr: el.querySelector('.cpr'),
          chart: null, candle: null, priceLines: [],
          bars: [], rsiSeries: [], vpvr: null,
          symbol: s.symbol, label: s.label,
          status: 'loading', err: '', source: '', decimals: 2,
          lastPrice: null, lastChange: null,
          plotW: 0, plotH: 0, rsiH: 60, priceScaleW: 54,
          xhair: { on: false, x: 0, y: 0, price: null, time: null },
          qprice: null, qopen: false,
          shapes: [], tool: null, pending: [], drag: null, preview: null,
          gen: 0, raf: 0, vpvrDirty: true,
          tapT: 0, tapX: 0, tapY: 0,
          loading: false
        };
        panels.push(P);
      });
    }

    function chartOptions(P) {
      var C = theme();
      return {
        layout: {
          background: { type: 'solid', color: C.bg },
          textColor: C.dim,
          attributionLogo: false,
          fontSize: 10,
          fontFamily: '-apple-system,BlinkMacSystemFont,"Noto Sans KR",Roboto,"Helvetica Neue",Arial,sans-serif'
        },
        grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
        rightPriceScale: {
          borderColor: C.axis, borderVisible: true,
          scaleMargins: { top: 0.12, bottom: 0.10 },
          entireTextOnly: false
        },
        timeScale: {
          visible: false, borderVisible: false, rightOffset: 3, barSpacing: 6,
          lockVisibleTimeRangeOnResize: true
        },
        crosshair: { mode: 2, vertLine: { visible: false }, horzLine: { visible: false } },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: { time: true, price: false }, mouseWheel: true, pinch: true },
        localization: {
          locale: 'ko-KR',
          priceFormatter: function (p) { return fmt(p, P.decimals); }
        },
        autoSize: false
      };
    }

    function initCharts() {
      panels.forEach(function (P) {
        var c = LC.createChart(P.pchartEl, chartOptions(P));
        P.chart = c;
        P.candle = c.addCandlestickSeries({
          upColor: theme().up, downColor: theme().down,
          wickUpColor: theme().up, wickDownColor: theme().down,
          borderVisible: false,
          priceFormat: { type: 'price', precision: P.decimals, minMove: 1 / Math.pow(10, P.decimals) }
        });
        c.timeScale().subscribeVisibleLogicalRangeChange(function () {
          P.vpvrDirty = true;
          if (!P.qopen) hideXhair(P);
          else scheduleDraw(P, false);
          scheduleDraw(P, true);
        });
        if (window.ResizeObserver) {
          var ro = new ResizeObserver(function () { layoutPanel(P); });
          ro.observe(P.wrap);
        }
        attachPanelEvents(P);
      });
    }

    /* ── 레이아웃 ────────────────────────────────── */
    function sizeCanvas(cv, w, h) {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      var ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    }

    function layoutPanel(P) {
      var W = P.wrap.clientWidth, H = P.wrap.clientHeight;
      if (W < 30 || H < 60) return;
      var rsiH = clamp(Math.round(H * 0.26), 40, 96);
      var ph = H - rsiH;
      P.rsiH = rsiH;
      P.pchartEl.style.height = ph + 'px';
      P.rsiEl.style.height = rsiH + 'px';
      P.hit.style.height = ph + 'px';
      try { P.chart.resize(W, ph); } catch (e) {}
      sizeCanvas(P.pcv, W, ph);
      sizeCanvas(P.rcv, W, rsiH);
      var found = false;
      for (var k = 0; k < 3; k++) {
        var sw = 0;
        try { sw = P.chart.priceScale('right').width(); } catch (e) { sw = 0; }
        if (sw > 0) { P.priceScaleW = sw; found = true; break; }
      }
      if (!found) P.priceScaleW = P.priceScaleW || 54;
      P.plotW = Math.max(40, W - P.priceScaleW);
      P.plotH = ph;
      P.vpvrDirty = true;
      scheduleDraw(P, true);
    }

    /* ── 데이터 요청 ─────────────────────────────── */
    function fetchText(url, ms) {
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var timer = ctrl ? window.setTimeout(function () { ctrl.abort(); }, ms || 12000) : null;
      return fetch(url, { signal: ctrl ? ctrl.signal : undefined, cache: 'no-store', mode: 'cors' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (t) { if (timer) window.clearTimeout(timer); return t; })
        .catch(function (e) { if (timer) window.clearTimeout(timer); throw e; });
    }

    function parseYahoo(t) {
      var i = t.indexOf('{"chart"');
      if (i < 0) i = t.indexOf('{"chart":');
      if (i < 0) throw new Error('응답 형식 오류');
      return JSON.parse(t.slice(i));
    }

    function yahooDoc(url) {
      var urls = [
        url,
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
        'https://r.jina.ai/' + url
      ];
      function attempt(u) {
        return fetchText(u, 13000).then(parseYahoo).then(function (doc) {
          if (doc && doc.chart && doc.chart.error) {
            var e = new Error((doc.chart.error.description || doc.chart.error.code || '종목 없음'));
            e.fatal = true;
            throw e;
          }
          return doc;
        });
      }
      return new Promise(function (resolve, reject) {
        var pending = urls.length, done = false, fatalErr = null, lastErr = null;
        urls.forEach(function (u) {
          attempt(u).then(function (doc) {
            if (!done) { done = true; resolve(doc); }
          }, function (e) {
            if (e && e.fatal && !fatalErr) fatalErr = e;
            if (!lastErr) lastErr = e;
            pending--;
            if (pending === 0 && !done) reject(fatalErr || lastErr || new Error('시세 경로 지연'));
          });
        });
      });
    }

    function aggBars(bars, agg) {
      if (!agg) return bars;
      var out = [];
      var cur = null, curKey = null;
      for (var i = 0; i < bars.length; i++) {
        var b = bars[i];
        var key;
        if (agg === 'week') {
          var d = new Date(b.time * 1000);
          var day = (d.getUTCDay() + 6) % 7;
          key = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 864e5) / 1000;
        } else {
          var sec = agg * 3600;
          key = Math.floor(b.time / sec) * sec;
        }
        if (!cur || key !== curKey) {
          if (cur) out.push(cur);
          cur = { time: key, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 };
          curKey = key;
        } else {
          cur.high = Math.max(cur.high, b.high);
          cur.low = Math.min(cur.low, b.low);
          cur.close = b.close;
          cur.volume = (cur.volume || 0) + (b.volume || 0);
        }
      }
      if (cur) out.push(cur);
      return out;
    }

    function yahooBars(doc, iv) {
      var res = doc && doc.chart && doc.chart.result && doc.chart.result[0];
      if (!res || !res.timestamp || !res.timestamp.length) throw new Error('데이터 없음');
      var q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
      var out = [];
      for (var i = 0; i < res.timestamp.length; i++) {
        var c = q.close ? q.close[i] : null;
        if (c === null || c === undefined || !isFinite(c) || c <= 0) continue;
        var o = q.open ? q.open[i] : c, h = q.high ? q.high[i] : c, l = q.low ? q.low[i] : c;
        out.push({
          time: res.timestamp[i],
          open: isFinite(o) ? o : c,
          high: isFinite(h) ? h : c,
          low: isFinite(l) ? l : c,
          close: c,
          volume: (q.volume && isFinite(q.volume[i])) ? q.volume[i] : 0
        });
      }
      if (!out.length) throw new Error('데이터 없음');
      out.sort(function (a, b) { return a.time - b.time; });
      var seen = {}, clean = [];
      out.forEach(function (b) { if (!seen[b.time]) { seen[b.time] = 1; clean.push(b); } });
      var cfg = YF[iv];
      return aggBars(clean, cfg && cfg.agg);
    }

    function mergeBars(P, incoming) {
      if (!P.bars.length) { setBars(P, incoming, true); return; }
      var changed = false;
      for (var i = 0; i < incoming.length; i++) {
        var b = incoming[i];
        var last = P.bars[P.bars.length - 1];
        if (b.time === last.time) {
          P.bars[P.bars.length - 1] = b;
          P.candle.update(b);
          changed = true;
        } else if (b.time > last.time) {
          P.bars.push(b);
          P.candle.update(b);
          changed = true;
        }
      }
      if (changed) afterData(P);
    }

    function setBars(P, bars, fit) {
      P.bars = bars;
      var last = bars[bars.length - 1];
      P.decimals = decimalsFor(last.close);
      P.candle.applyOptions({
        priceFormat: { type: 'price', precision: P.decimals, minMove: 1 / Math.pow(10, P.decimals) }
      });
      P.candle.setData(bars);
      if (fit) {
        var n = bars.length;
        var span = clamp(Math.round((P.wrap.clientWidth || 320) / 5), 40, 150);
        try {
          P.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - span), to: n + 3 });
        } catch (e) {}
      }
      afterData(P);
      window.setTimeout(function () { layoutPanel(P); }, 40);
    }

    function afterData(P) {
      if (!P.bars.length) return;
      var last = P.bars[P.bars.length - 1];
      P.lastPrice = last.close;
      var prev = P.bars.length > 1 ? P.bars[P.bars.length - 2].close : null;
      P.lastChange = prev ? ((last.close - prev) / prev) * 100 : null;
      P.rsiSeries = calcRSI(P.bars, 14);
      P.vpvrDirty = true;
      P.status = 'ok';
      hideMsg(P);
      paintMeta(P);
      scheduleDraw(P, true);
      syncPriceLines(P);
    }

    /* ── 시세 로딩 ───────────────────────────────── */
    function setStatus(P, text, isErr) {
      P.source = text;
      var el = P.cpr.querySelector('.src');
      if (!el) return;
      el.textContent = text;
      el.className = 'src' + (isErr ? ' st err' : '');
    }

    function showMsg(P, title, sub) {
      var m = P.msg;
      m.querySelector('p').innerHTML = title || '';
      m.querySelector('span').textContent = sub || '';
      m.querySelector('.retry').style.display = title ? '' : 'none';
      m.classList.add('show');
    }
    function hideMsg(P) { P.msg.classList.remove('show'); }

    function clearPanel(P) {
      P.gen++;
      P.bars = [];
      P.rsiSeries = [];
      P.vpvr = null;
      P.xhair.on = false;
      P.status = 'loading';
      setStatus(P, '불러오는 중…');
      hideXhair(P);
      closeQuick(P);
      try { P.candle.setData([]); } catch (e) {}
      syncPriceLines(P);
    }

    function loadPanel(P, full) {
      full = full !== false;
      var sym = P.symbol;
      if (binancePair(sym)) loadBinance(P, full);
      else if (yahooTicker(sym)) loadYahoo(P, full);
      else {
        clearPanel(P);
        P.status = 'error';
        setStatus(P, '차트 미지원', true);
        showMsg(P, '이 종목은 캔들 차트를 지원하지 않아요', '알림은 🔔에서 걸 수 있어요 (5분 서버 감시). 다른 종목: NASDAQ:AAPL, KRX:005930, BINANCE:XRPUSDT');
      }
    }

    function loadBinance(P, full) {
      var pair = binancePair(P.symbol);
      if (!pair) return;
      var gen = ++P.gen;
      var iv = BN_IV[state.interval];
      var limit = full ? 300 : 5;
      var urls = [
        'https://data-api.binance.vision/api/v3/klines?symbol=' + pair + '&interval=' + iv + '&limit=' + limit,
        'https://api.binance.com/api/v3/klines?symbol=' + pair + '&interval=' + iv + '&limit=' + limit
      ];
      if (full) { P.status = 'loading'; showMsg(P, null, '캔들을 불러오는 중…'); }
      var i = 0;
      function attempt() {
        if (i >= urls.length) return Promise.reject(new Error('바이낸스 응답 없음'));
        return fetchText(urls[i++], 12000).then(function (t) { return JSON.parse(t); }).catch(attempt);
      }
      attempt().then(function (arr) {
        if (gen !== P.gen) return;
        if (!Array.isArray(arr) || !arr.length) throw new Error('데이터 없음');
        var bars = arr.map(function (k) {
          return { time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] };
        });
        setStatus(P, 'Lightweight Charts · Binance ' + fmtHM(new Date()));
        P.err = '';
        if (full || !P.bars.length) setBars(P, bars, true);
        else mergeBars(P, bars);
      }).catch(function (e) {
        if (gen !== P.gen) return;
        if (!P.bars.length) {
          P.status = 'error';
          setStatus(P, 'Binance 지연', true);
          showMsg(P, '캔들을 불러오지 못했어요', (e && e.message) || '네트워크를 확인해 주세요');
        } else {
          setStatus(P, 'Binance 지연 · 이전 값', true);
        }
      });
    }

    function loadYahoo(P, full) {
      var ticker = yahooTicker(P.symbol);
      if (!ticker) return;
      var gen = ++P.gen;
      var cfg = YF[state.interval];
      var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) +
        '?interval=' + cfg.interval + '&range=' + cfg.range + '&includePrePost=false';
      if (full) { P.status = 'loading'; showMsg(P, null, '캔들을 불러오는 중…'); }
      yahooDoc(url).then(function (doc) {
        if (gen !== P.gen) return;
        var bars = yahooBars(doc, state.interval);
        P.err = '';
        setStatus(P, 'Lightweight Charts · Yahoo ' + fmtHM(new Date()));
        if (full || !P.bars.length) setBars(P, bars, true);
        else mergeBars(P, bars);
      }).catch(function (e) {
        if (gen !== P.gen) return;
        if (e && e.fatal) {
          P.status = 'error';
          setStatus(P, '종목 없음', true);
          showMsg(P, '이 종목을 찾을 수 없어요', '심볼을 확인해 주세요. 예: NASDAQ:AAPL, KRX:005930, BINANCE:XRPUSDT');
          return;
        }
        /* 금은 PAXG(토큰 금) 캔들로 대신 그려 준다 */
        if (P.symbol === 'OANDA:XAUUSD') return loadGoldProxy(P, full, gen);
        if (!P.bars.length) {
          P.status = 'error';
          setStatus(P, 'Yahoo 지연', true);
          showMsg(P, '캔들을 불러오지 못했어요', '무료 시세 경로가 잠시 붐비는 중이에요. 「다시 시도」를 눌러 주세요.');
        } else {
          setStatus(P, 'Yahoo 지연 · 이전 값', true);
        }
      });
    }

    function loadGoldProxy(P, full, gen) {
      var urls = [
        'https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=' + BN_IV[state.interval] + '&limit=' + (full ? 300 : 5),
        'https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=' + BN_IV[state.interval] + '&limit=' + (full ? 300 : 5)
      ];
      var i = 0;
      function attempt() {
        if (i >= urls.length) return Promise.reject(new Error('프록시 실패'));
        return fetchText(urls[i++], 12000).then(function (t) { return JSON.parse(t); }).catch(attempt);
      }
      attempt().then(function (arr) {
        if (gen !== P.gen) return;
        var bars = arr.map(function (k) {
          return { time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] };
        });
        setStatus(P, '금 프록시(PAXG) · Binance', false);
        if (full || !P.bars.length) setBars(P, bars, true);
        else mergeBars(P, bars);
      }).catch(function () {
        if (gen !== P.gen) return;
        P.status = 'error';
        setStatus(P, '금 시세 지연', true);
        showMsg(P, '금 캔들을 불러오지 못했어요', '잠시 뒤 「다시 시도」를 눌러 주세요.');
      });
    }

    function paintMeta(P) {
      var b = P.tag.querySelector('b'), s = P.tag.querySelector('span');
      if (b) b.textContent = P.label;
      if (s) {
        if (P.lastPrice == null) { s.textContent = '–'; s.className = ''; }
        else {
          var ch = P.lastChange;
          s.textContent = fmt(P.lastPrice, P.decimals) + (ch == null ? '' : ' ' + (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%');
          s.className = ch == null ? '' : (ch >= 0 ? 'up' : 'down');
        }
      }
      P.tag.setAttribute('aria-label', P.label + ' 종목 변경');
    }

    /* ── RSI(14) — Wilder ────────────────────────── */
    function calcRSI(bars, period) {
      var out = [];
      if (bars.length <= period) return out;
      var gain = 0, loss = 0, i, diff;
      for (i = 1; i <= period; i++) {
        diff = bars[i].close - bars[i - 1].close;
        if (diff >= 0) gain += diff; else loss -= diff;
      }
      var ag = gain / period, al = loss / period;
      out.push({ time: bars[period].time, value: al === 0 ? 100 : 100 - 100 / (1 + ag / al) });
      for (i = period + 1; i < bars.length; i++) {
        diff = bars[i].close - bars[i - 1].close;
        var g = diff > 0 ? diff : 0, l = diff < 0 ? -diff : 0;
        ag = (ag * (period - 1) + g) / period;
        al = (al * (period - 1) + l) / period;
        out.push({ time: bars[i].time, value: al === 0 ? 100 : 100 - 100 / (1 + ag / al) });
      }
      return out;
    }

    function computeVpvr(P) {
      P.vpvr = null;
      if (!P.bars.length) return;
      var lr = null;
      try { lr = P.chart.timeScale().getVisibleLogicalRange(); } catch (e) {}
      var from, to;
      if (lr) {
        from = clamp(Math.floor(lr.from), 0, P.bars.length - 1);
        to = clamp(Math.ceil(lr.to), 0, P.bars.length - 1);
      } else {
        from = Math.max(0, P.bars.length - 100);
        to = P.bars.length - 1;
      }
      if (to - from < 3) return;
      var lo = Infinity, hi = -Infinity, i;
      for (i = from; i <= to; i++) {
        if (P.bars[i].low < lo) lo = P.bars[i].low;
        if (P.bars[i].high > hi) hi = P.bars[i].high;
      }
      if (!(hi > lo)) return;
      var bins = 26, vals = new Array(bins);
      for (i = 0; i < bins; i++) vals[i] = 0;
      var bw = (hi - lo) / bins;
      for (i = from; i <= to; i++) {
        var b = P.bars[i];
        var v = (b.volume && b.volume > 0) ? b.volume : 1;
        var idx = clamp(Math.floor((((b.high + b.low + b.close) / 3) - lo) / bw), 0, bins - 1);
        vals[idx] += v;
      }
      var max = 0;
      for (i = 0; i < bins; i++) if (vals[i] > max) max = vals[i];
      if (max <= 0) max = 1;
      P.vpvr = { lo: lo, hi: hi, bins: bins, bw: bw, vals: vals, max: max };
    }

    /* ── 그리기 ──────────────────────────────────── */
    function scheduleDraw(P, vpvr) {
      if (vpvr) P.vpvrDirty = true;
      if (P.raf) return;
      P.raf = requestAnimationFrame(function () {
        P.raf = 0;
        if (P.vpvrDirty) { computeVpvr(P); P.vpvrDirty = false; }
        drawPcv(P);
        drawRcv(P);
      });
    }

    function sy(P, price) {
      var y = null;
      try { y = P.candle.priceToCoordinate(price); } catch (e) {}
      return (y === null || y === undefined || !isFinite(y)) ? null : y;
    }
    function sx(P, t) {
      var x = null;
      try { x = P.chart.timeScale().timeToCoordinate(t); } catch (e) {}
      return (x === null || x === undefined || !isFinite(x)) ? null : x;
    }

    function chip(ctx, x, y, text, bg, fg, align, font) {
      ctx.save();
      ctx.font = font || '600 9px -apple-system,Roboto,Arial,sans-serif';
      var w = ctx.measureText(text).width + 8;
      var h = 14;
      var x0 = align === 'right' ? x - w : (align === 'center' ? x - w / 2 : x);
      ctx.fillStyle = bg;
      ctx.fillRect(x0, y - h / 2, w, h);
      ctx.fillStyle = fg;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x0 + 4, y + 0.5);
      ctx.restore();
      return w;
    }

    function drawPcv(P) {
      var ctx = P.pcv.getContext('2d');
      var C = theme();
      var W = P.plotW + P.priceScaleW, H = P.plotH;
      ctx.clearRect(0, 0, W + 2, H);

      if (P.vpvr) {
        var v = P.vpvr;
        var bw = (v.hi - v.lo) / v.bins;
        var maxLen = Math.max(24, P.plotW * 0.18);
        for (var i = 0; i < v.bins; i++) {
          var y0 = sy(P, v.lo + i * bw);
          var y1 = sy(P, v.lo + (i + 1) * bw);
          if (y0 == null || y1 == null) continue;
          var hgt = Math.max(1, y0 - y1 - 1);
          var len = maxLen * (v.vals[i] / v.max);
          if (len < 0.5) continue;
          var isVA = v.vals[i] > v.max * 0.7;
          ctx.fillStyle = isVA ? C.vpvrHi : C.vpvr;
          ctx.fillRect(P.plotW - len, y1 + 0.5, len, hgt);
        }
      }

      drawShapes(P, ctx);

      if (P.xhair.on) {
        var x = P.xhair.x, y = P.xhair.y;
        ctx.save();
        ctx.strokeStyle = C.cross;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(P.plotW, Math.round(y) + 0.5);
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, H);
        ctx.stroke();
        ctx.restore();
        var label = fmt(P.xhair.price, P.decimals);
        var bg = state.theme === 'dark' ? '#2b3444' : '#2b3340';
        var w = chip(ctx, P.plotW - 14, y, label, bg, '#fff', 'right', '700 10px -apple-system,Roboto,Arial,sans-serif');
        ctx.save();
        ctx.strokeStyle = C.cross;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        if (P.preview) drawShape(P, ctx, P.preview, true);
      } else if (P.preview) {
        drawShape(P, ctx, P.preview, true);
      }
    }

    function drawRcv(P) {
      var ctx = P.rcv.getContext('2d');
      var C = theme();
      var W = P.plotW + P.priceScaleW, H = P.rsiH;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
      var top = 4, bottom = H - 12;
      var ph = bottom - top;

      ctx.save();
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, top + 0.5);
      ctx.lineTo(P.plotW, top + 0.5);
      ctx.stroke();
      ctx.restore();

      function ry(val) { return top + (100 - val) / 100 * ph; }

      /* 30/70 기준선 */
      [70, 30].forEach(function (lv) {
        var y = ry(lv);
        ctx.save();
        ctx.strokeStyle = C.grid;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(P.plotW, y + 0.5);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = C.dim;
        ctx.font = '600 8.5px -apple-system,Roboto,Arial,sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(lv), P.plotW + 4, y);
        ctx.restore();
      });

      var lastVal = null;
      if (P.rsiSeries.length && P.bars.length) {
        ctx.save();
        ctx.strokeStyle = '#8e6cf0';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        var started = false;
        for (var i = 0; i < P.rsiSeries.length; i++) {
          var pt = P.rsiSeries[i];
          var x = sx(P, pt.time);
          if (x == null || x < -20 || x > P.plotW + 20) continue;
          var y = ry(pt.value);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
          lastVal = pt.value;
        }
        ctx.stroke();
        ctx.restore();
      }

      /* 현재 RSI 값 */
      var shown = lastVal;
      if (P.xhair.on && P.xhair.time != null && P.rsiSeries.length) {
        var xh = sx(P, P.xhair.time);
        if (xh != null) {
          var best = null, bestD = 1e9;
          for (var k = 0; k < P.rsiSeries.length; k++) {
            var dx = Math.abs(sx(P, P.rsiSeries[k].time) - xh);
            if (dx < bestD) { bestD = dx; best = P.rsiSeries[k]; }
          }
          if (best) shown = best.value;
        }
      }
      ctx.save();
      ctx.fillStyle = C.dim;
      ctx.font = '700 9px -apple-system,Roboto,Arial,sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('RSI 14', 3, 3);
      if (shown != null) {
        ctx.fillStyle = shown >= 70 ? C.up : (shown <= 30 ? C.down : '#8e6cf0');
        ctx.textAlign = 'right';
        ctx.fillText(shown.toFixed(1), P.plotW - 2, 3);
      }
      ctx.restore();

      /* 시간축 */
      drawTimeAxis(P, ctx, top, bottom, W);

      if (P.xhair.on) {
        var x2 = P.xhair.x;
        ctx.save();
        ctx.strokeStyle = C.cross;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(x2) + 0.5, 0);
        ctx.lineTo(Math.round(x2) + 0.5, bottom);
        ctx.stroke();
        ctx.restore();
        if (P.xhair.time != null) {
          var lbl = timeLabel(P.xhair.time);
          if (lbl) {
            var d = tDate(P.xhair.time);
            if (P.bars.length && d) {
              var lx = clamp(x2, 26, W - 26);
              chip(ctx, lx, bottom + 6, lbl, state.theme === 'dark' ? '#2b3444' : '#2b3340', '#fff', 'center', '600 8.5px -apple-system,Roboto,Arial,sans-serif');
            }
          }
        }
        /* RSI 값 위치 표시 */
        if (shown != null) {
          var yy = ry(shown);
          ctx.save();
          ctx.fillStyle = '#8e6cf0';
          ctx.beginPath();
          ctx.arc(x2, yy, 2.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    function timeLabel(t) {
      var d = tDate(t);
      if (!d) return '';
      var iv = state.interval;
      var M = d.getMonth() + 1, D = d.getDate();
      function p2(n) { return n < 10 ? '0' + n : String(n); }
      if (iv === 'D') return M + '.' + D;
      if (iv === 'W') return d.getFullYear() + '.' + M;
      if (iv === '240' || iv === '60') return M + '.' + D + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
      return p2(d.getHours()) + ':' + p2(d.getMinutes());
    }

    function drawTimeAxis(P, ctx, top, bottom, W) {
      var C = theme();
      if (!P.bars.length) return;
      var lr = null;
      try { lr = P.chart.timeScale().getVisibleLogicalRange(); } catch (e) {}
      if (!lr) return;
      var from = Math.max(0, Math.floor(lr.from));
      var to = Math.min(P.bars.length - 1, Math.ceil(lr.to));
      if (to <= from) return;
      var count = Math.max(2, Math.min(5, Math.floor(P.plotW / 70)));
      var step = Math.max(1, Math.round((to - from) / count));
      var d0 = tDate(P.bars[from].time), d1 = tDate(P.bars[to].time);
      var multi = !!(d0 && d1 && (d0.getFullYear() !== d1.getFullYear() || d0.getMonth() !== d1.getMonth() || d0.getDate() !== d1.getDate()));
      var intraday = !(state.interval === 'D' || state.interval === 'W');
      function p2(n) { return n < 10 ? '0' + n : String(n); }
      function tickLbl(t) {
        var d = tDate(t);
        if (!d) return '';
        if (multi) {
          var base = (d.getMonth() + 1) + '.' + d.getDate();
          if (!intraday) return base;
          return base + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
        }
        return timeLabel(t);
      }
      var minGap = (multi && intraday) ? 62 : 34;
      ctx.save();
      ctx.font = '600 8.5px -apple-system,Roboto,Arial,sans-serif';
      ctx.fillStyle = C.dim;
      ctx.textBaseline = 'middle';
      var lastX = -999;
      for (var i = from; i <= to; i += step) {
        var x = sx(P, P.bars[i].time);
        if (x == null || x < 8 || x > P.plotW - 8) continue;
        if (x - lastX < minGap) continue;
        lastX = x;
        var lbl = tickLbl(P.bars[i].time);
        if (!lbl) continue;
        ctx.save();
        ctx.strokeStyle = C.grid;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, bottom);
        ctx.lineTo(Math.round(x) + 0.5, bottom + 3);
        ctx.stroke();
        ctx.restore();
        ctx.textAlign = 'center';
        ctx.fillStyle = C.dim;
        ctx.fillText(lbl, x, bottom + 7);
      }
      ctx.restore();
    }

    /* ── 작도 도형 ───────────────────────────────── */
    var FIB_R = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    var FIB_E = [0, 0.618, 1, 1.618, 2.618];

    function drawShapes(P, ctx) {
      for (var i = 0; i < P.shapes.length; i++) drawShape(P, ctx, P.shapes[i], false);
    }

    function drawShape(P, ctx, s, preview) {
      var C = theme();
      var col = s.color || C.draw;
      ctx.save();
      if (preview) ctx.globalAlpha = 0.8;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.3;

      if (s.type === 'hline') {
        var y = sy(P, s.p);
        if (y != null) {
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(P.plotW, y + 0.5); ctx.stroke();
          chip(ctx, P.plotW - 4, y - 8, fmt(s.p, P.decimals), col, '#fff', 'right');
        }
      } else if (s.type === 'trend') {
        var x1 = sx(P, s.a.t), y1 = sy(P, s.a.p), x2 = sx(P, s.b.t), y2 = sy(P, s.b.p);
        if (x1 != null && x2 != null && y1 != null && y2 != null) {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          dot(ctx, x1, y1, col); dot(ctx, x2, y2, col);
        }
      } else if (s.type === 'channel') {
        var ax = sx(P, s.a.t), ay = sy(P, s.a.p), bx = sx(P, s.b.t), by = sy(P, s.b.p), cx = sx(P, s.c.t), cy = sy(P, s.c.p);
        if (ax != null && bx != null && ay != null && by != null && cx != null && cy != null) {
          var t0 = tNum(s.a.t), t1 = tNum(s.b.t), tc = tNum(s.c.t);
          var baseAtC = (t1 === t0) ? s.a.p : s.a.p + (s.b.p - s.a.p) * ((tc - t0) / (t1 - t0));
          var off = s.c.p - baseAtC;
          var dy = (sy(P, s.c.p) - sy(P, baseAtC)) || 0;
          ctx.globalAlpha = preview ? 0.12 : 0.10;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by + dy); ctx.lineTo(ax, ay + dy); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = preview ? 0.8 : 1;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ax, ay + dy); ctx.lineTo(bx, by + dy); ctx.stroke();
          dot(ctx, cx, cy, col);
        }
      } else if (s.type === 'fib' || s.type === 'fiblext') {
        var fx1 = sx(P, s.a.t), fy1 = sy(P, s.a.p), fx2 = sx(P, s.b.t), fy2 = sy(P, s.b.p);
        if (fx1 == null || fy1 == null) return;
        var xa = fx2 == null ? fx1 : fx2;
        var left = Math.min(fx1, xa), right = Math.max(P.plotW, xa);
        var levels = s.type === 'fib' ? FIB_R : FIB_E;
        var p1 = s.a.p, p2 = s.b.p;
        var cp = (s.type === 'fib') ? p2 : (s.c ? s.c.p : p2);
        var dlt = p2 - p1;
        var fromX = s.type === 'fib' ? left : (sx(P, s.c ? s.c.t : s.b.t) || fx1);
        levels.forEach(function (lv, idx) {
          var price = (s.type === 'fib') ? p1 + dlt * lv : cp + dlt * lv;
          var yy = sy(P, price);
          if (yy == null) return;
          ctx.globalAlpha = preview ? 0.7 : 0.95;
          ctx.strokeStyle = s.type === 'fib' ? (lv === 0 || lv === 1 ? col : C.fib[idx % C.fib.length]) : col;
          ctx.setLineDash(lv === 0 || lv === 1 ? [] : [4, 3]);
          ctx.beginPath();
          ctx.moveTo(fromX, yy + 0.5);
          ctx.lineTo(right, yy + 0.5);
          ctx.stroke();
          ctx.setLineDash([]);
          chip(ctx, Math.max(fromX, right) - 4, yy - 7, lv.toFixed(3) + '  ' + fmt(price, P.decimals), 'rgba(20,26,33,.72)', '#fff', 'right');
        });
        if (s.type === 'fib') {
          var yA = sy(P, p1 + dlt * 0.382), yB = sy(P, p1 + dlt * 0.618);
          if (yA != null && yB != null) {
            ctx.globalAlpha = 0.10;
            ctx.fillStyle = col;
            ctx.fillRect(left, Math.min(yA, yB), Math.max(0, right - left), Math.abs(yB - yA));
          }
        }
        ctx.globalAlpha = preview ? 0.8 : 1;
        ctx.strokeStyle = col;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(fx1, fy1); ctx.lineTo(xa, fy2 == null ? fy1 : fy2); ctx.stroke();
      } else if (s.type === 'long' || s.type === 'short') {
        /* 롱/숏 포지션 측정: 진입가에서 목표가까지 수익률·폭을 보여 준다 */
        var lx1 = sx(P, s.a.t), ly1 = sy(P, s.a.p), lx2 = sx(P, s.b.t), ly2 = sy(P, s.b.p);
        if (lx1 == null || ly1 == null || lx2 == null || ly2 == null) return;
        var isLong = s.type === 'long';
        var pcol = isLong ? C.up : C.down;
        var bx = Math.min(lx1, lx2), bw2 = Math.max(2, Math.abs(lx2 - lx1));
        var by = Math.min(ly1, ly2), bh2 = Math.max(2, Math.abs(ly2 - ly1));
        ctx.globalAlpha = preview ? 0.16 : 0.13;
        ctx.fillStyle = pcol;
        ctx.fillRect(bx, by, bw2, bh2);
        ctx.globalAlpha = preview ? 0.85 : 1;
        ctx.strokeStyle = pcol;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(bx + 0.5, by + 0.5, bw2, bh2);
        ctx.setLineDash([]);
        var ppct = s.a.p ? ((s.b.p - s.a.p) / s.a.p) * 100 : 0;
        var plbl = (isLong ? '롱 ' : '숏 ') + (ppct >= 0 ? '+' : '') + ppct.toFixed(2) + '%';
        chip(ctx, (lx1 + lx2) / 2, (ly1 + ly2) / 2, plbl, pcol, '#fff', 'center', '700 9.5px -apple-system,Roboto,Arial,sans-serif');
        chip(ctx, lx1, ly1 - 8, '진입 ' + fmt(s.a.p, P.decimals), 'rgba(20,26,33,.72)', '#fff', 'center');
        chip(ctx, lx2, ly2 + 8, '목표 ' + fmt(s.b.p, P.decimals), 'rgba(20,26,33,.72)', '#fff', 'center');
      } else if (s.type === 'fibtime') {
        /* 피보나치 타임존: 두 시점 사이를 피보나치 비율로 나누어 세로선 */
        var ta = tNum(s.a.t), tb = tNum(s.b.t);
        var span = tb - ta;
        if (!span) return;
        var TR = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618];
        TR.forEach(function (lv, idx) {
          var t = ta + span * lv;
          var x = sx(P, t);
          if (x == null || x < -1 || x > P.plotW + 1) return;
          ctx.globalAlpha = preview ? 0.7 : 0.95;
          ctx.strokeStyle = (lv === 0 || lv === 1) ? col : C.fib[idx % C.fib.length];
          ctx.setLineDash(lv === 0 || lv === 1 ? [] : [4, 3]);
          ctx.beginPath();
          ctx.moveTo(Math.round(x) + 0.5, 0);
          ctx.lineTo(Math.round(x) + 0.5, P.plotH);
          ctx.stroke();
          ctx.setLineDash([]);
          chip(ctx, Math.round(x) + 3, 8, lv.toFixed(3), 'rgba(20,26,33,.72)', '#fff', 'left', '600 8px -apple-system,Roboto,Arial,sans-serif');
        });
        var tt1 = sx(P, s.a.t), tt2 = sx(P, s.b.t);
        if (tt1 != null && tt2 != null) {
          ctx.globalAlpha = preview ? 0.8 : 1;
          ctx.strokeStyle = col;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(tt1, P.plotH - 4); ctx.lineTo(tt2, P.plotH - 4); ctx.stroke();
          dot(ctx, tt1, P.plotH - 4, col); dot(ctx, tt2, P.plotH - 4, col);
        }
      } else if (s.type === 'measure') {
        var mx1 = sx(P, s.a.t), my1 = sy(P, s.a.p), mx2 = sx(P, s.b.t), my2 = sy(P, s.b.p);
        if (mx1 == null || my1 == null || mx2 == null || my2 == null) return;
        var up = s.b.p >= s.a.p;
        var mc = up ? C.up : C.down;
        ctx.fillStyle = mc;
        ctx.globalAlpha = preview ? 0.14 : 0.12;
        ctx.fillRect(Math.min(mx1, mx2), Math.min(my1, my2), Math.abs(mx2 - mx1), Math.abs(my2 - my1));
        ctx.globalAlpha = preview ? 0.85 : 1;
        ctx.strokeStyle = mc;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(Math.min(mx1, mx2) + 0.5, Math.min(my1, my2) + 0.5, Math.abs(mx2 - mx1), Math.abs(my2 - my1));
        ctx.setLineDash([]);
        var pct = s.a.p ? ((s.b.p - s.a.p) / s.a.p) * 100 : 0;
        var txt = (up ? '+' : '') + pct.toFixed(2) + '%  ' + (up ? '+' : '') + fmt(s.b.p - s.a.p, P.decimals);
        var cxm = (mx1 + mx2) / 2, cym = (my1 + my2) / 2;
        chip(ctx, cxm, cym, txt, mc, '#fff', 'center', '700 9.5px -apple-system,Roboto,Arial,sans-serif');
        chip(ctx, mx1, my1 - 8, fmt(s.a.p, P.decimals), 'rgba(20,26,33,.72)', '#fff', 'center');
        chip(ctx, mx2, my2 + 8, fmt(s.b.p, P.decimals), 'rgba(20,26,33,.72)', '#fff', 'center');
      }
      ctx.restore();
    }

    function dot(ctx, x, y, col) {
      ctx.save();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /* ── 십자선/+ 버튼/원터치 팝업 ───────────────── */
    function hideXhair(P) {
      P.xhair = { on: false, x: 0, y: 0, price: null, time: null };
      P.plusEl.classList.remove('show');
      scheduleDraw(P, false);
    }

    function positionPlus(P) {
      if (!P.xhair.on) { P.plusEl.classList.remove('show'); return; }
      var left = P.plotW - 12;
      var top = clamp(P.xhair.y - 12, 1, Math.max(1, P.plotH - 26));
      P.plusEl.style.left = left + 'px';
      P.plusEl.style.top = top + 'px';
      P.plusEl.classList.add('show');
    }

    function updateXhair(P, e) {
      var r = P.pchartEl.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > P.plotW || y > P.plotH) return;
      var price = null;
      try { price = P.candle.coordinateToPrice(y); } catch (er) {}
      if (price == null || !isFinite(price) || price <= 0) return;
      var t = null;
      try { t = P.chart.timeScale().coordinateToTime(x); } catch (er) {}
      P.xhair = { on: true, x: x, y: y, price: price, time: t };
      positionPlus(P);
      scheduleDraw(P, false);
      lastSlot = P.i;
    }

    function attachPanelEvents(P) {
      var downX = 0, downY = 0, downT = 0, moved = 0;

      P.pchartEl.addEventListener('pointerdown', function (e) {
        if (P.tool) return;
        downX = e.clientX; downY = e.clientY; downT = Date.now(); moved = 0;
        if (P.qopen) closeQuick(P);
        updateXhair(P, e);
      }, true);

      P.pchartEl.addEventListener('pointermove', function (e) {
        if (P.tool) return;
        if (downT) moved = Math.max(moved, Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY));
        updateXhair(P, e);
      }, true);

      P.pchartEl.addEventListener('pointerup', function (e) {
        if (P.tool) return;
        var dt = Date.now() - downT;
        var isTap = downT && moved < 12 && dt < 700;
        downT = 0;
        if (!isTap) { P.tapT = 0; return; }
        var now = Date.now();
        if (now - P.tapT < 340 && Math.abs(e.clientX - P.tapX) < 34 && Math.abs(e.clientY - P.tapY) < 34) {
          P.tapT = 0;
          toggleZoom(P.i);
        } else {
          P.tapT = now; P.tapX = e.clientX; P.tapY = e.clientY;
        }
      }, true);

      P.pchartEl.addEventListener('pointercancel', function () { downT = 0; }, true);

      P.plusEl.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openQuick(P);
      });

      P.popEl.querySelector('.qx').addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation(); closeQuick(P);
      });
      P.popEl.querySelector('.qadd').addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (P.qprice == null) { closeQuick(P); return; }
        addAlert(P.symbol, P.label, P.qprice, P.lastPrice);
        closeQuick(P);
      });
      ['pointerdown', 'click', 'touchstart'].forEach(function (ev) {
        P.popEl.addEventListener(ev, function (e) { e.stopPropagation(); });
      });

      P.tag.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        openSym(P.i);
      });

      P.msg.querySelector('.retry').addEventListener('click', function () { loadPanel(P, true); });

      /* 작도 도구용 히트 레이어 */
      P.hit.addEventListener('pointerdown', function (e) {
        if (!P.tool) return;
        e.preventDefault();
        try { P.hit.setPointerCapture(e.pointerId); } catch (er) {}
        var pt = pointAt(P, e);
        if (!pt) return;
        P.drag = { start: pt, moved: false };
        P.preview = null;
        lastSlot = P.i;
        drawPcv(P);
      });
      P.hit.addEventListener('pointermove', function (e) {
        if (!P.tool || !P.drag) return;
        e.preventDefault();
        var pt = pointAt(P, e);
        if (!pt) return;
        P.drag.moved = true;
        var start = P.drag.start;
        if (P.tool === 'hline') {
          P.preview = { type: 'hline', p: pt.p, color: theme().draw };
        } else {
          P.preview = previewShape(P, start, pt);
        }
        drawPcv(P);
        drawRcv(P);
      });
      P.hit.addEventListener('pointerup', function (e) {
        if (!P.tool || !P.drag) return;
        e.preventDefault();
        var pt = pointAt(P, e);
        var st = P.drag;
        P.drag = null;
        P.preview = null;
        if (!pt) { drawPcv(P); return; }
        var moved = st.moved && (Math.abs(pt.x - st.start.x) + Math.abs(pt.y - st.start.y) > 10);
        if (P.tool === 'hline') {
          commitShape(P, { type: 'hline', p: pt.p });
        } else {
          var pts = P.pending.slice();
          if (moved) { pts.push({ t: st.start.t, p: st.start.p }); pts.push({ t: pt.t, p: pt.p }); }
          else pts.push({ t: pt.t, p: pt.p });
          P.pending = [];
          if (pts.length >= neededPoints(P.tool)) completeShape(P, pts.slice(0, neededPoints(P.tool)));
          else P.pending = pts;
        }
        drawPcv(P);
        drawRcv(P);
      });
    }

    function pointAt(P, e) {
      var r = P.pchartEl.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > P.plotW || y > P.plotH) return null;
      var p = null;
      try { p = P.candle.coordinateToPrice(y); } catch (er) {}
      var t = null;
      try { t = P.chart.timeScale().coordinateToTime(x); } catch (er) {}
      if (p == null || !isFinite(p)) return null;
      if (t == null) return null;
      return { x: x, y: y, p: p, t: t };
    }

    function previewShape(P, a, b) {
      var color = theme().draw;
      if (P.tool === 'trend') return { type: 'trend', a: { t: a.t, p: a.p }, b: { t: b.t, p: b.p }, color: color };
      if (P.tool === 'measure') return { type: 'measure', a: { t: a.t, p: a.p }, b: { t: b.t, p: b.p }, color: color };
      if (P.tool === 'fib') return { type: 'fib', a: { t: a.t, p: a.p }, b: { t: b.t, p: b.p }, color: color };
      if (P.tool === 'fibtime') return { type: 'fibtime', a: { t: a.t, p: a.p }, b: { t: b.t, p: b.p }, color: color };
      if (P.tool === 'long' || P.tool === 'short') return { type: P.tool, a: { t: a.t, p: a.p }, b: { t: b.t, p: b.p }, color: color };
      if (P.tool === 'channel' || P.tool === 'fiblext') {
        var p0 = P.pending[0];
        if (!p0) return { type: 'trend', a: { t: a.t, p: a.p }, b: { t: b.t, p: b.p }, color: color };
        if (P.tool === 'channel') return { type: 'channel', a: p0, b: { t: a.t, p: a.p }, c: { t: b.t, p: b.p }, color: color };
        return { type: 'fiblext', a: p0, b: { t: a.t, p: a.p }, c: { t: b.t, p: b.p }, color: color };
      }
      return null;
    }

    function neededPoints(tool) {
      if (tool === 'channel' || tool === 'fiblext') return 3;
      if (tool === 'hline') return 1;
      return 2;
    }

    function completeShape(P, pts) {
      var shape = null;
      var t = P.tool;
      if (t === 'trend') shape = { type: 'trend', a: pts[0], b: pts[1] };
      else if (t === 'measure') shape = { type: 'measure', a: pts[0], b: pts[1] };
      else if (t === 'fib') shape = { type: 'fib', a: pts[0], b: pts[1] };
      else if (t === 'fibtime') shape = { type: 'fibtime', a: pts[0], b: pts[1] };
      else if (t === 'long' || t === 'short') shape = { type: t, a: pts[0], b: pts[1] };
      else if (t === 'channel') shape = { type: 'channel', a: pts[0], b: pts[1], c: pts[2] };
      else if (t === 'fiblext') shape = { type: 'fiblext', a: pts[0], b: pts[1], c: pts[2] };
      if (!shape) return;
      commitShape(P, shape);
    }

    function shapeStoreKey(P) { return P.symbol + '|' + state.interval; }

    function commitShape(P, shape) {
      P.shapes.push(shape);
      drawStore[shapeStoreKey(P)] = P.shapes;
      saveDraw();
      toast('작도 저장 · ' + toolName(P.tool || shape.type));
    }

    function toolName(t) {
      return { hline: '수평선', trend: '추세선', channel: '채널', fib: '피보나치', fiblext: '피보나치 확장', fibtime: '피보나치 타임존', long: '롱 측정', short: '숏 측정', measure: '측정' }[t] || t;
    }

    function setTool(t) {
      state.tool = (state.tool === t) ? null : t;
      document.body.classList.toggle('toolon', !!state.tool);
      Array.prototype.forEach.call(document.querySelectorAll('#toolbar button[data-tool]'), function (b) {
        b.classList.toggle('on', b.dataset.tool === state.tool);
      });
      panels.forEach(function (P) {
        P.tool = state.tool;
        P.pending = [];
        P.preview = null;
        try {
          P.chart.applyOptions({
            handleScroll: !state.tool,
            handleScale: !state.tool
          });
        } catch (e) {}
        drawPcv(P);
      });
    }

    /* ── 1~4분할 ↔ 1화면 확대 ────────────────────── */
    var chipBox = $('zoomChips');
    var layoutBox = $('lay');

    function buildZoomChips() {
      chipBox.innerHTML = panels.map(function (p, i) {
        return '<button type="button" data-z="' + i + '" aria-label="' + (i + 1) + '번 차트 1화면">' + (i + 1) + '</button>';
      }).join('') + '<button type="button" data-z="all" class="back" aria-label="분할 화면으로 돌아가기">' + state.layout + '분할 ↩</button>';
      Array.prototype.forEach.call(chipBox.querySelectorAll('button[data-z]'), function (b) {
        b.addEventListener('click', function () {
          setZoom(b.dataset.z === 'all' ? -1 : Number(b.dataset.z));
        });
      });
    }

    function applyLayout() {
      var n = clamp(Number(state.layout) || 1, 1, panels.length);
      grid.classList.remove('n1', 'n2', 'n3', 'n4');
      grid.classList.add('n' + n);
      panels.forEach(function (P, i) { P.el.classList.toggle('off', i >= n && state.zoom !== i); });
      var back = chipBox.querySelector('button[data-z="all"]');
      if (back) { back.textContent = n + '분할 ↩'; back.setAttribute('aria-label', n + '분할 화면으로 돌아가기'); }
      Array.prototype.forEach.call(layoutBox.querySelectorAll('button[data-lay]'), function (b) {
        var on = Number(b.dataset.lay) === n;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      window.setTimeout(function () {
        panels.forEach(function (P, i) { if (i < n || state.zoom === i) layoutPanel(P); });
      }, 30);
    }

    function setLayout(n) {
      n = clamp(Number(n) || 1, 1, panels.length);
      if (n === state.layout) { applyLayout(); return; }
      state.layout = n;
      if (state.zoom >= n) { state.zoom = -1; }
      saveLayout();
      applyLayout();
      syncZoom();
      toast(n + '분할 화면');
    }

    function syncZoom() {
      var z = state.zoom;
      grid.classList.toggle('zoom', z >= 0);
      document.body.classList.toggle('zoomed', z >= 0);
      panels.forEach(function (p, i) { p.el.classList.toggle('z', z === i); });
      panels.forEach(function (p, i) { p.el.classList.toggle('off', i >= state.layout && z !== i); });
      chipBox.classList.toggle('show', z >= 0);
      Array.prototype.forEach.call(chipBox.querySelectorAll('button[data-z]'), function (b) {
        var on = (b.dataset.z === 'all') ? (z < 0) : (String(z) === b.dataset.z);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      window.setTimeout(function () {
        panels.forEach(function (p) {
          if (z >= 0 && z !== p.i) return;
          if (p.i >= state.layout) return;
          layoutPanel(p);
        });
      }, 60);
    }

    function setZoom(i) {
      if (i === null || i === undefined || i === 'all' || i < 0 || i >= panels.length) i = -1;
      i = Number(i);
      if (isNaN(i)) i = -1;
      if (i === state.zoom) return;
      state.zoom = i;
      if (i >= 0) lastSlot = i;
      panels.forEach(function (P) { P.tapT = 0; hideXhair(P); closeQuick(P); });
      syncZoom();
    }

    function toggleZoom(i) {
      setZoom(state.zoom === i ? -1 : i);
    }

    Array.prototype.forEach.call(layoutBox.querySelectorAll('button[data-lay]'), function (b) {
      b.addEventListener('click', function () { setLayout(Number(b.dataset.lay)); });
    });

    /* ── 원터치 돌파 알림 ────────────────────────── */
    function openQuick(P) {
      if (!P.xhair.on || P.xhair.price == null) return;
      var price = Number(P.xhair.price.toFixed(P.decimals));
      var cur = (P.lastPrice != null) ? P.lastPrice : price;
      var up = !(cur > 0) || price >= cur;
      P.qprice = price;
      P.qopen = true;
      P.popEl.querySelector('.qpx').textContent = (up ? '↑ ' : '↓ ') + fmt(price, P.decimals);
      P.popEl.querySelector('.qdir').innerHTML =
        (up ? '위로 돌파하면' : '아래로 돌파하면') + ' 알림 · 현재가 <b>' + fmt(cur, P.decimals) + '</b>';
      P.popEl.querySelector('.qadd').textContent = '🔔 ' + fmt(price, P.decimals) + ' 돌파 알림';
      var left = clamp(P.plotW - 224, 4, Math.max(4, P.wrap.clientWidth - 198));
      var top = clamp(P.xhair.y - 74, 4, Math.max(4, P.plotH - 104));
      P.popEl.style.left = left + 'px';
      P.popEl.style.top = top + 'px';
      P.popEl.classList.add('show');
      lastSlot = P.i;
    }

    function closeQuick(P) {
      P.qopen = false;
      P.qprice = null;
      P.popEl.classList.remove('show');
    }

    document.addEventListener('pointerdown', function (e) {
      panels.forEach(function (P) {
        if (!P.qopen) return;
        if (P.popEl.contains(e.target) || P.plusEl.contains(e.target)) return;
        closeQuick(P);
      });
    }, true);

    function addAlert(symbol, label, price, base) {
      if (!isFinite(price) || price <= 0) return null;
      price = Number(price.toFixed(decimalsFor(price)));
      if (liveAlerts().length >= MAX_ALERTS) {
        toast('알림은 최대 ' + MAX_ALERTS + '개까지 등록할 수 있어요');
        return null;
      }
      var cur = isFinite(base) ? Number(Number(base).toFixed(decimalsFor(base))) : null;
      var a = {
        id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        symbol: symbol,
        label: label || labelFor(symbol),
        dir: 'cross',
        price: Number(price),
        basePrice: cur,
        lastPrice: cur,
        on: true,
        firedAt: null,
        firedPrice: null,
        updated: Date.now(),
        del: false
      };
      alerts.push(a);
      saveAlerts();
      renderList(); renderCount();
      panels.forEach(syncPriceLines);
      ghPush();
      toast('🔔 ' + a.label + ' ' + fmt(price) + (cur != null ? (price >= cur ? ' 위로' : ' 아래로') : '') + ' 돌파 알림 등록');
      return a;
    }

    function evaluateAlerts() {
      var hits = [];
      var touched = false;
      liveAlerts().forEach(function (a) {
        if (!a.on || a.firedAt) return;
        var p = prices[a.symbol];
        if (!p || p.v === null || p.v === undefined || !isFinite(p.v) || p.v <= 0) return;
        var curr = p.v;
        var P = a.price;
        var prev = isFinite(a.lastPrice) ? Number(a.lastPrice) : (isFinite(a.basePrice) ? Number(a.basePrice) : null);
        if (prev === null) {
          a.lastPrice = curr;
          touched = true;
          return;
        }
        var crossed = (prev < P && curr >= P) || (prev > P && curr <= P) ||
          (Math.abs(curr - P) < 1e-9 && Math.abs(prev - P) > 1e-12);
        a.lastPrice = curr;
        touched = true;
        if (crossed) {
          a.firedAt = Date.now();
          a.firedPrice = curr;
          a.updated = Date.now();
          hits.push({ a: a, cur: curr });
        }
      });
      if (touched) saveAlerts();
      if (!hits.length) return;
      renderList(); renderCount();
      panels.forEach(syncPriceLines);
      ghPush();
      var lines = hits.map(function (h) {
        var dir = (h.a.basePrice != null && h.a.basePrice < h.a.price) ? '위로' : '아래로';
        return '<b>' + esc(h.a.label) + '</b> ' + fmt(h.cur) + ' — ' +
          (h.cur >= h.a.price ? '↑ 위로' : '↓ 아래로') + ' 돌파 <em>' + fmt(h.a.price) + '</em>';
      });
      showBanner(lines);
      beep();
      systemNotify(hits.map(function (h) {
        return h.a.label + ' ' + fmt(h.cur) + ' (' + fmt(h.a.price) + ' 돌파)';
      }));
    }

    function syncPriceLines(P) {
      if (!P.candle) return;
      P.priceLines.forEach(function (l) { try { P.candle.removePriceLine(l); } catch (e) {} });
      P.priceLines = [];
      liveAlerts().forEach(function (a) {
        if (a.symbol !== P.symbol) return;
        var col = a.firedAt ? 'rgba(140,150,165,.9)' : (a.on ? '#f0a800' : 'rgba(160,160,160,.8)');
        try {
          P.priceLines.push(P.candle.createPriceLine({
            price: a.price,
            color: col,
            lineWidth: 1,
            lineStyle: LC.LineStyle.Dashed,
            axisLabelVisible: true,
            title: ''
          }));
        } catch (e) {}
      });
    }

    /* ── 소리 / 알림 / 배너 / 토스트 ────────────── */
    function unlockAudio() {
      if (audioCtx) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      } catch (e) {}
    }
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });

    function beep() {
      unlockAudio();
      if (!audioCtx) return;
      try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        var t0 = audioCtx.currentTime;
        [0, 0.18].forEach(function (off, i) {
          var o = audioCtx.createOscillator(), g = audioCtx.createGain();
          o.type = 'sine';
          o.frequency.value = i === 0 ? 880 : 1180;
          g.gain.setValueAtTime(0.0001, t0 + off);
          g.gain.exponentialRampToValueAtTime(0.35, t0 + off + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.16);
          o.connect(g); g.connect(audioCtx.destination);
          o.start(t0 + off); o.stop(t0 + off + 0.18);
        });
      } catch (e) {}
    }

    function systemNotify(lines) {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('가격 돌파 알림 · 3분할 차트', { body: lines.join('\n'), tag: 'price-alert' });
        }
      } catch (e) {}
    }

    function showBanner(lines, ms) {
      $('bannerText').innerHTML = lines.map(function (t) { return '<div>' + t + '</div>'; }).join('');
      $('banner').classList.add('show');
      if (bannerTimer) window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(hideBanner, ms || 30000);
    }
    function hideBanner() {
      $('banner').classList.remove('show');
      if (bannerTimer) { window.clearTimeout(bannerTimer); bannerTimer = null; }
    }
    $('bannerClose').addEventListener('click', hideBanner);

    function toast(msg) {
      var el = $('toast');
      el.textContent = msg;
      el.classList.add('show');
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(function () { el.classList.remove('show'); }, 3200);
    }

    /* ── 시세 조회 (알림 감시용) ────────────────── */
    function jinaMeta(t) {
      var i = t.indexOf('{"chart"');
      if (i < 0) throw new Error('no json');
      var j = JSON.parse(t.slice(i));
      var m = j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
      var v = m && (m.regularMarketPrice || m.previousClose);
      if (!isFinite(v)) throw new Error('no price');
      return Number(v);
    }

    function sourcesFor(symbol) {
      var list = [];
      var bp = binancePair(symbol);
      if (bp) {
        list.push({ name: 'Binance', url: 'https://data-api.binance.vision/api/v3/ticker/price?symbol=' + bp, pick: function (j) { return Number(j.price); } });
        list.push({ name: 'Binance.com', url: 'https://api.binance.com/api/v3/ticker/price?symbol=' + bp, pick: function (j) { return Number(j.price); } });
      }
      if (symbol === 'OANDA:XAUUSD' || symbol === 'OANDA:XAGUSD') {
        /* 금·은은 현물 시세(gold-api)를 먼저, 막히면 Yahoo 선물 */
        list.push({ name: 'gold-api', url: 'https://api.gold-api.com/price/' + (symbol === 'OANDA:XAUUSD' ? 'XAU' : 'XAG'), pick: function (j) { return Number(j.price); } });
        var gurl = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol === 'OANDA:XAUUSD' ? 'GC=F' : 'SI=F') + '?interval=1m&range=1d';
        list.push({ name: 'Yahoo', url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(gurl), pick: function (t) { return jinaMeta(t); } });
        list.push({ name: 'Yahoo(프록시)', url: 'https://r.jina.ai/' + gurl, pick: jinaMeta });
      }
      var yt = yahooTicker(symbol);
      if (yt) {
        var yurl = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(yt) + '?interval=1m&range=1d';
        list.push({ name: 'Yahoo', url: yurl, pick: function (t) { return jinaMeta(t); } });
        list.push({ name: 'Yahoo(프록시)', url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(yurl), pick: function (t) { return jinaMeta(t); } });
        list.push({ name: 'Yahoo(리더)', url: 'https://r.jina.ai/' + yurl, pick: jinaMeta });
      }
      return list;
    }

    /* Yahoo 계열(지수)은 프록시 부담을 줄이려 30초에 한 번만 새로 받는다 */
    var priceAt = {};
    function getPrice(symbol, force) {
      var now = Date.now();
      var gap = binancePair(symbol) ? 6000 : (symbol === 'OANDA:XAUUSD' || symbol === 'OANDA:XAGUSD' ? 8000 : 30000);
      if (!force && priceAt[symbol] && (now - priceAt[symbol] < gap) && prices[symbol]) return Promise.resolve(prices[symbol]);
      priceAt[symbol] = now;
      var list = sourcesFor(symbol);
      var i = 0;
      function attempt() {
        if (i >= list.length) return Promise.reject(new Error('모든 소스 실패'));
        var s = list[i++];
        return fetchText(s.url, 9000).then(function (text) {
          var v = null;
          try { v = s.pick(JSON.parse(text)); } catch (e) { v = s.pick(text); }
          if (!isFinite(v) || v <= 0) throw new Error('값 없음');
          prices[symbol] = { v: v, t: new Date(), src: s.name, err: '' };
          return prices[symbol];
        }).catch(attempt);
      }
      return attempt().catch(function (e) {
        var prev = prices[symbol];
        prices[symbol] = { v: null, t: prev ? prev.t : null, src: '', err: '조회 실패' };
        throw e;
      });
    }

    var polling = false;
    function watchSymbols() {
      var out = [];
      function add(s) { if (s && out.indexOf(s) < 0) out.push(s); }
      slots.forEach(function (s) { add(s.symbol); });
      liveAlerts().forEach(function (a) { if (a.on && !a.firedAt) add(a.symbol); });
      return out.filter(hasLive).slice(0, 12);
    }

    function pollPrices() {
      if (polling) return Promise.resolve();
      polling = true;
      return Promise.all(watchSymbols().map(function (s) { return getPrice(s).catch(function () {}); }))
        .then(function () {
          polling = false;
          renderPrices();
          evaluateAlerts();
          panels.forEach(function (P) {
            var p = prices[P.symbol];
            if (p && isFinite(p.v) && p.v > 0) {
              P.lastPrice = p.v;
              if (P.bars.length) {
                var prev = P.bars.length > 1 ? P.bars[P.bars.length - 2].close : null;
                P.lastChange = prev ? ((p.v - prev) / prev) * 100 : P.lastChange;
              }
              paintMeta(P);
            }
          });
        });
    }

    /* ── 알림 모달 ───────────────────────────────── */
    var modal = $('modal');

    function renderPrices() {
      var row = $('pxRow');
      row.innerHTML = slots.map(function (s) {
        var live = hasLive(s.symbol);
        var p = live ? prices[s.symbol] : null;
        var ok = p && p.v !== null && p.v !== undefined && isFinite(p.v);
        var P = panels[slotIndex(s.id)];
        var val, sub;
        if (!live) { val = '서버 감시'; sub = '차트 미지원'; }
        else if (ok) { val = fmt(p.v); sub = fmtTime(p.t); }
        else if (P && P.lastPrice != null) { val = fmt(P.lastPrice); sub = '차트 값'; }
        else { val = '—'; sub = '대기'; }
        return '<div class="px' + (live ? '' : ' nolive') + '"><b>' + esc(s.label) + '</b><span>' + val + '</span>' + sub + '</div>';
      }).join('');
    }

    function renderCount() {
      var list = liveAlerts();
      $('alertCount').textContent = String(list.length);
      $('alCount').textContent = list.length + ' / ' + MAX_ALERTS;
      var live = list.filter(function (a) { return a.on && !a.firedAt; }).length;
      $('alertBtn').classList.toggle('hot', live > 0);
    }

    function alertStateText(a) {
      if (a.firedAt) return '돌파 ' + fmtTime(new Date(a.firedAt));
      if (!a.on) return '꺼짐';
      var ref = isFinite(a.lastPrice) ? a.lastPrice : a.basePrice;
      if (!isFinite(ref)) return '돌파 대기';
      if (Math.abs(ref - a.price) < 1e-9) return '돌파 대기';
      return (ref < a.price ? '↑ 위로' : '↓ 아래로') + ' 돌파 대기';
    }

    function renderList() {
      var box = $('lists');
      var list = liveAlerts();
      if (!list.length) {
        box.innerHTML = '<div class="empty">등록된 알림이 없어요. 차트에서 선을 눌러 <b>+</b>를 누르면 바로 등록됩니다.</div>';
        return;
      }
      box.innerHTML = list.map(function (a) {
        var live = hasLive(a.symbol);
        var cls = 'al' + (a.firedAt ? ' fired' : '') + (a.on ? '' : ' off') + (live ? '' : ' unsup');
        return '<div class="' + cls + '" data-id="' + a.id + '">' +
          '<span class="who">' + esc(a.label) + '</span>' +
          '<span class="cond">↕ ' + fmt(a.price) + '<i>' + alertStateText(a) + '</i></span>' +
          '<button class="tg' + (a.on ? ' on' : '') + '" type="button" data-act="toggle" aria-label="켜기/끄기">' + (a.on ? 'ON' : 'OFF') + '</button>' +
          '<button class="del" type="button" data-act="del" aria-label="삭제">✕</button>' +
        '</div>';
      }).join('');
    }

    function paintFormSyms() {
      var sel = $('fSym');
      var cur = sel.value;
      sel.innerHTML = slots.map(function (s) {
        return '<option value="' + s.id + '">' + esc(s.label) + (hasLive(s.symbol) ? '' : ' · 서버 감시') + '</option>';
      }).join('');
      if (cur && sel.querySelector('option[value="' + cur + '"]')) sel.value = cur;
      paintFormNote();
    }

    function paintFormNote() {
      var sel = $('fSym');
      var i = slotIndex(sel.value);
      var s = i >= 0 ? slots[i] : slots[0];
      var live = !!(s && hasLive(s.symbol));
      var note = $('fSymNote');
      note.classList.toggle('show', !live);
      note.textContent = live ? '' : '이 종목은 앱에서 시세를 못 읽어요. GitHub 동기화를 켜면 5분 서버 감시로 알려드려요.';
    }

    function renderModal() {
      renderPrices(); renderList(); renderCount(); paintFormSyms(); paintGhPanel();
      var st = $('notifyState'), btn = $('notifyBtn');
      if (!('Notification' in window)) {
        st.textContent = '이 브라우저는 시스템 알림을 지원하지 않아요. 배너·비프음은 동작합니다.';
        btn.style.display = 'none';
      } else if (Notification.permission === 'granted') {
        st.textContent = '시스템 알림 허용됨';
        btn.style.display = 'none';
      } else if (Notification.permission === 'denied') {
        st.textContent = '알림이 차단됨 — 브라우저 설정에서 허용해 주세요.';
        btn.style.display = 'none';
      } else {
        st.textContent = '앱을 닫으면 화면 감시는 멈춥니다 (서버 감시는 계속).';
        btn.style.display = '';
      }
    }

    /* ── GitHub 동기화 (alerts.json) ─────────────── */
    function ghReady() { return !!(gh.token && /^[\w.-]+\/[\w.-]+$/.test(gh.repo)); }
    function loadGh() {
      try {
        var c = JSON.parse(localStorage.getItem(GH_STORE) || '{}');
        if (c && typeof c === 'object') {
          if (typeof c.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(c.repo)) gh.repo = c.repo;
          if (typeof c.token === 'string') gh.token = c.token;
        }
      } catch (e) {}
    }
    function saveGh() {
      try { localStorage.setItem(GH_STORE, JSON.stringify({ repo: gh.repo, token: gh.token })); } catch (e) {}
    }
    function b64enc(str) {
      var bytes = new TextEncoder().encode(str), bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
    function b64dec(b) {
      var bin = atob(String(b || '').replace(/\s/g, ''));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    function setGhBadge(text, kind) { gh.status = { k: kind || '', m: text }; paintGhBadge(); }
    function paintGhBadge() {
      var el = $('ghBadge');
      if (!el) return;
      el.textContent = gh.status.m || '미설정';
      el.className = 'ghbadge' + (gh.status.k ? ' ' + gh.status.k : '');
      el.title = gh.status.m || '';
    }
    function paintGhPanel() {
      var r = $('ghRepo'), t = $('ghToken');
      if (!r || !t) return;
      if (document.activeElement !== r) r.value = gh.repo || '';
      t.placeholder = gh.token ? '저장됨 — 새 토큰을 넣으면 교체' : 'github_pat_...';
      t.value = '';
      paintGhBadge();
    }
    function ghApiUrl() { return 'https://api.github.com/repos/' + gh.repo + '/contents/' + GH_FILE; }
    function ghHeaders() {
      var h = { 'Accept': 'application/vnd.github+json' };
      if (gh.token) h['Authorization'] = 'Bearer ' + gh.token;
      return h;
    }
    function ghErrorMessage(status, text) {
      var msg = '';
      try { msg = (JSON.parse(text) || {}).message || ''; } catch (e) {}
      if (status === 401) return '토큰이 올바르지 않아요';
      if (status === 403) return '토큰 권한 부족 (Contents: Read and write)';
      if (status === 404) return '저장소/파일 없음 — 저장소 확인';
      if (status === 409 || status === 422) return '충돌 — 다시 시도해 주세요';
      return 'GitHub 오류 ' + status + (msg ? ' · ' + msg : '');
    }
    function ghGet() {
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var timer = ctrl ? window.setTimeout(function () { ctrl.abort(); }, 12000) : null;
      return fetch(ghApiUrl() + '?_=' + Date.now(), { headers: ghHeaders(), cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) {
          if (r.status === 404) return { doc: null, sha: null };
          if (!r.ok) return r.text().then(function (t) { throw new Error(ghErrorMessage(r.status, t)); });
          return r.json().then(function (j) {
            var doc = null;
            try { doc = JSON.parse(b64dec(j.content)); } catch (e) { doc = null; }
            if (!doc || !Array.isArray(doc.alerts)) doc = { alerts: [] };
            return { doc: doc, sha: j.sha || null };
          });
        })
        .then(function (out) { if (timer) window.clearTimeout(timer); return out; })
        .catch(function (e) { if (timer) window.clearTimeout(timer); throw e; });
    }
    function ghPut(doc, sha) {
      var body = {
        message: 'alerts: ' + doc.alerts.length + '개 (' + new Date().toISOString() + ')',
        content: b64enc(JSON.stringify(doc, null, 1))
      };
      if (sha) body.sha = sha;
      var headers = ghHeaders();
      headers['Content-Type'] = 'application/json';
      return fetch(ghApiUrl(), { method: 'PUT', headers: headers, body: JSON.stringify(body) })
        .then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error(ghErrorMessage(r.status, t)); });
          return r.json();
        });
    }
    function mergeAlerts(local, remote) {
      var by = {};
      function put(a) {
        if (!a || typeof a.id !== 'string' || !a.id) return;
        var prev = by[a.id];
        if (!prev || (a.updated || 0) > (prev.updated || 0)) by[a.id] = a;
      }
      (local || []).forEach(put);
      (remote || []).forEach(put);
      var cutoff = Date.now() - 30 * 86400000;
      return Object.keys(by).map(function (k) { return by[k]; })
        .filter(function (a) { return !(a.del && (a.updated || 0) < cutoff); })
        .sort(function (x, y) { return (x.updated || 0) - (y.updated || 0); })
        .slice(-MAX_ALERTS);
    }
    function applyMerged(merged) {
      var before = JSON.stringify(alerts);
      var norm = merged.map(function (a) {
        a.dir = 'cross';
        if (!isFinite(a.basePrice)) a.basePrice = null;
        if (!isFinite(a.lastPrice)) a.lastPrice = isFinite(a.basePrice) ? Number(a.basePrice) : null;
        return a;
      });
      alerts = norm;
      if (JSON.stringify(norm) !== before) {
        saveAlerts();
        renderList(); renderCount();
        panels.forEach(syncPriceLines);
        pollPrices();
      } else {
        renderList(); renderCount();
      }
    }
    var ghPushTimer = null;
    function ghPush() {
      if (!ghReady()) { setGhBadge('미설정', ''); return; }
      if (ghPushTimer) window.clearTimeout(ghPushTimer);
      ghPushTimer = window.setTimeout(function () { ghPushTimer = null; doGhPush(); }, 700);
    }
    function doGhPush(retry) {
      if (!ghReady()) return Promise.resolve();
      if (gh.busy) { gh.again = true; return Promise.resolve(); }
      gh.busy = true;
      setGhBadge('동기화 중…', 'sync');
      return ghGet().then(function (rem) {
        applyMerged(mergeAlerts(alerts, rem.doc ? rem.doc.alerts : []));
        var doc = { version: 2, updated_at: new Date().toISOString(), alerts: alerts };
        return ghPut(doc, rem.sha);
      }).then(function () {
        gh.busy = false;
        setGhBadge('동기화됨 · ' + fmtTime(new Date()), 'ok');
      }).catch(function (e) {
        gh.busy = false;
        if (!retry && /충돌/.test(e.message || '')) return doGhPush(true);
        setGhBadge(e.message || '동기화 실패', 'err');
      }).then(function () {
        if (!gh.busy && gh.again) { gh.again = false; doGhPush(); }
      });
    }
    function ghPull() {
      if (!ghReady()) { setGhBadge('미설정', ''); return Promise.resolve(); }
      if (gh.busy) return Promise.resolve();
      gh.busy = true;
      setGhBadge('불러오는 중…', 'sync');
      return ghGet().then(function (rem) {
        applyMerged(mergeAlerts(alerts, rem.doc ? rem.doc.alerts : []));
        if (rem.doc) setGhBadge('동기화됨 · ' + fmtTime(new Date()), 'ok');
        else setGhBadge('원격 alerts.json 없음 — 추가하면 만들어져요', 'idle');
      }).catch(function (e) {
        setGhBadge(e.message || '불러오기 실패', 'err');
      }).then(function () { gh.busy = false; });
    }

    $('ghSaveBtn').addEventListener('click', function () {
      var repo = ($('ghRepo').value || '').trim();
      var token = ($('ghToken').value || '').trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { setGhBadge('저장소는 owner/repo 형식이에요', 'err'); return; }
      gh.repo = repo;
      if (token) gh.token = token;
      saveGh(); paintGhPanel();
      if (!gh.token) { setGhBadge('토큰을 넣어 주세요', 'err'); return; }
      doGhPush();
    });
    $('ghSyncBtn').addEventListener('click', function () { doGhPush(); });
    $('ghClearBtn').addEventListener('click', function () {
      gh.token = ''; saveGh(); paintGhPanel(); setGhBadge('미설정 (기기에서 토큰 지움)', '');
    });

    function openModal(idx) {
      if (typeof idx === 'number' && idx >= 0 && idx < slots.length) lastSlot = idx;
      modal.classList.add('show');
      document.body.classList.add('modalOpen');
      renderModal();
      var sel = $('fSym');
      if (sel && slots[lastSlot]) sel.value = slots[lastSlot].id;
      paintFormNote();
      pollPrices();
      if (ghReady()) ghPull();
    }
    function closeModal() {
      modal.classList.remove('show');
      document.body.classList.remove('modalOpen');
    }
    $('alertBtn').addEventListener('click', function () { openModal(state.zoom >= 0 ? state.zoom : lastSlot); });
    $('modalClose').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    $('notifyBtn').addEventListener('click', function () {
      if (!('Notification' in window)) return;
      Notification.requestPermission().then(function () { renderModal(); });
    });
    $('fSym').addEventListener('change', paintFormNote);

    $('addForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var i = slotIndex($('fSym').value);
      if (i < 0) return;
      lastSlot = i;
      var raw = ($('fPrice').value || '').replace(/[^0-9.]/g, '');
      var price = parseFloat(raw);
      if (!isFinite(price) || price <= 0) { $('fPrice').focus(); return; }
      var P = panels[i];
      var base = (P && P.lastPrice != null) ? P.lastPrice : (prices[slots[i].symbol] || {}).v;
      addAlert(slots[i].symbol, slots[i].label, price, base);
      $('fPrice').value = '';
    });

    $('lists').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!btn) return;
      var row = btn.closest('.al');
      var id = row && row.getAttribute('data-id');
      var a = alerts.filter(function (x) { return x.id === id; })[0];
      if (!a) return;
      if (btn.getAttribute('data-act') === 'del') {
        a.del = true; a.on = false;
      } else {
        a.on = !a.on;
        if (a.on) { a.firedAt = null; a.lastPrice = (prices[a.symbol] || {}).v || a.lastPrice; }
      }
      a.updated = Date.now();
      saveAlerts(); renderList(); renderCount();
      panels.forEach(syncPriceLines);
      pollPrices(); ghPush();
    });

    /* ── 종목 모달 ───────────────────────────────── */
    var symModal = $('symModal');

    function slotRowHTML(s, i, focusIdx) {
      var custom = !isPreset(s.symbol);
      var opts = PRESETS.map(function (g) {
        return '<optgroup label="' + esc(g.g) + '">' + g.items.map(function (it) {
          return '<option value="' + it[0] + '"' + (it[0] === s.symbol ? ' selected' : '') + '>' + esc(it[1]) + ' · ' + it[0] + '</option>';
        }).join('') + '</optgroup>';
      }).join('');
      opts += '<option value="__custom"' + (custom ? ' selected' : '') + '>직접 입력…</option>';
      var live = hasCandles(s.symbol);
      return '<div class="slot' + (focusIdx === i ? ' on' : '') + '" data-i="' + i + '">' +
        '<div class="srow">' +
          '<span class="sn">' + (i + 1) + '</span>' +
          '<select class="spick" data-i="' + i + '" aria-label="' + (i + 1) + '번 차트 종목">' + opts + '</select>' +
          '<span class="sstate' + (live ? ' live' : '') + '">' + (live ? '차트' : '알림만') + '</span>' +
        '</div>' +
        '<div class="custom' + (custom ? ' show' : '') + '">' +
          '<input class="sinput" data-i="' + i + '" type="text" spellcheck="false" autocomplete="off" placeholder="예: KRX:005930" aria-label="' + (i + 1) + '번 차트 심볼" value="' + (custom ? esc(s.symbol) : '') + '">' +
          '<button class="sapply" data-i="' + i + '" type="button">적용</button>' +
        '</div>' +
        '<p class="serr" data-i="' + i + '"></p>' +
      '</div>';
    }
    function renderSlotRows(focusIdx) {
      $('slotRows').innerHTML = slots.map(function (s, i) { return slotRowHTML(s, i, focusIdx); }).join('');
    }
    function slotRow(i) { return document.querySelector('#slotRows .slot[data-i="' + i + '"]'); }
    function setSlotError(i, msg) {
      var p = document.querySelector('#slotRows .serr[data-i="' + i + '"]');
      if (!p) return;
      p.textContent = msg || '';
      p.classList.toggle('show', !!msg);
    }
    function setSlot(i, symbol) {
      if (i < 0 || i >= slots.length) return false;
      symbol = String(symbol || '').toUpperCase().trim();
      if (!SYM_RE.test(symbol)) {
        setSlotError(i, '거래소:심볼 형식으로 입력해 주세요. 예: KRX:005930, NASDAQ:AAPL');
        return false;
      }
      setSlotError(i, '');
      slots[i].symbol = symbol;
      slots[i].label = labelFor(symbol);
      saveLayout();
      renderSlotRows(i);
      var P = panels[i];
      P.symbol = symbol;
      P.label = slots[i].label;
      P.lastPrice = null; P.lastChange = null;
      P.shapes = (drawStore[symbol + '|' + state.interval] || []).slice();
      paintMeta(P);
      clearPanel(P);
      loadPanel(P, true);
      pollPrices();
      if (modal.classList.contains('show')) { renderPrices(); paintFormSyms(); renderList(); }
      return true;
    }
    function applyCustom(i) {
      var inp = document.querySelector('#slotRows .sinput[data-i="' + i + '"]');
      if (!inp) return;
      var raw = inp.value.trim();
      if (!raw) { setSlotError(i, '심볼을 입력해 주세요. 예: KRX:005930'); inp.focus(); return; }
      var sym = raw.toUpperCase();
      if (SYM_RE.test(sym)) { setSlot(i, sym); return; }
      if (/^[0-9]{6}$/.test(sym)) { setSlot(i, 'KRX:' + sym); return; }
      if (/^[A-Z]{1,5}$/.test(sym)) { setSlotError(i, '거래소를 함께 적어 주세요. 예: NASDAQ:' + sym + ', KRX:' + sym); return; }
      setSlotError(i, '거래소:심볼 형식으로 입력해 주세요.');
    }
    function openSym(i) {
      if (typeof i === 'number' && i >= 0) lastSlot = i;
      renderSlotRows(typeof i === 'number' ? i : -1);
      symModal.classList.add('show');
      document.body.classList.add('modalOpen');
    }
    function closeSym() { symModal.classList.remove('show'); document.body.classList.remove('modalOpen'); }
    $('symBtn').addEventListener('click', function () { openSym(-1); });
    $('symClose').addEventListener('click', closeSym);
    $('symDone').addEventListener('click', closeSym);
    symModal.addEventListener('click', function (e) { if (e.target === symModal) closeSym(); });
    $('slotRows').addEventListener('change', function (e) {
      var sel = e.target;
      if (!sel || !sel.classList || !sel.classList.contains('spick')) return;
      var i = Number(sel.dataset.i);
      if (sel.value === '__custom') {
        var row = slotRow(i);
        var box = row && row.querySelector('.custom');
        if (box) box.classList.add('show');
        var inp = row && row.querySelector('.sinput');
        if (inp) { inp.value = slots[i].symbol; inp.focus(); inp.select(); }
        return;
      }
      setSlot(i, sel.value);
    });
    $('slotRows').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button.sapply') : null;
      if (!btn) return;
      applyCustom(Number(btn.dataset.i));
    });
    $('slotRows').addEventListener('keydown', function (e) {
      var inp = e.target;
      if (!inp || !inp.classList || !inp.classList.contains('sinput')) return;
      if (e.key === 'Enter') { e.preventDefault(); applyCustom(Number(inp.dataset.i)); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (symModal.classList.contains('show')) { closeSym(); return; }
      if (modal.classList.contains('show')) { closeModal(); return; }
      var any = false;
      panels.forEach(function (P) { if (P.qopen) { closeQuick(P); any = true; } });
    });

    /* ── 테마 / 타임프레임 / 도구 버튼 ──────────── */
    function applyTheme() {
      var dark = state.theme === 'dark';
      document.body.classList.toggle('dark', dark);
      var b = $('themeBtn');
      b.textContent = dark ? '☀️' : '🌙';
      b.setAttribute('aria-label', dark ? '화이트모드 전환' : '다크모드 전환');
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#0b0e11' : '#f4f6f8');
      var C = theme();
      panels.forEach(function (P) {
        if (!P.chart) return;
        P.chart.applyOptions({
          layout: { background: { type: 'solid', color: C.bg }, textColor: C.dim },
          grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
          rightPriceScale: { borderColor: C.axis }
        });
        P.candle.applyOptions({ upColor: C.up, downColor: C.down, wickUpColor: C.up, wickDownColor: C.down });
        scheduleDraw(P, false);
      });
      if (modal.classList.contains('show')) renderModal();
    }

    function paintIntervals() {
      Array.prototype.forEach.call(document.querySelectorAll('#ivs button'), function (b) {
        var on = b.dataset.iv === state.interval;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var on = document.querySelector('#ivs button.on');
      if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
    }

    function paintToolsBtn() {
      var b = $('toolsBtn');
      b.classList.toggle('on', !!state.tools);
      b.setAttribute('aria-pressed', state.tools ? 'true' : 'false');
      $('toolbar').classList.toggle('show', !!state.tools);
      if (!state.tools && state.tool) setTool(state.tool);
      document.body.classList.toggle('toolon', !!state.tool);
    }

    $('toolsBtn').addEventListener('click', function () {
      state.tools = !state.tools;
      if (!state.tools && state.tool) { state.tool = null; setTool(null); }
      paintToolsBtn();
      saveLayout();
      panels.forEach(function (P) {
        try { P.chart.applyOptions({ handleScroll: !state.tool, handleScale: !state.tool }); } catch (e) {}
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('#toolbar button[data-tool]'), function (b) {
      b.addEventListener('click', function () { setTool(b.dataset.tool); });
    });
    $('undoDraw').addEventListener('click', function () {
      var P = panels[lastSlot];
      if (!P.shapes.length) { toast('되돌릴 작도가 없어요'); return; }
      P.shapes.pop();
      drawStore[shapeStoreKey(P)] = P.shapes;
      saveDraw();
      scheduleDraw(P, false);
      toast('마지막 작도를 지웠어요');
    });
    $('clearDraw').addEventListener('click', function () {
      var P = panels[lastSlot];
      if (!P.shapes.length) { toast('지울 작도가 없어요'); return; }
      P.shapes = [];
      drawStore[shapeStoreKey(P)] = [];
      saveDraw();
      scheduleDraw(P, false);
      toast(P.label + ' 작도를 모두 지웠어요');
    });

    Array.prototype.forEach.call(document.querySelectorAll('#ivs button'), function (b) {
      b.addEventListener('click', function () {
        if (state.interval === b.dataset.iv) return;
        state.interval = b.dataset.iv;
        paintIntervals();
        saveLayout();
        panels.forEach(function (P) {
          P.shapes = (drawStore[P.symbol + '|' + state.interval] || []).slice();
          P.pending = []; P.preview = null;
          clearPanel(P);
          loadPanel(P, true);
        });
        pollPrices();
      });
    });

    $('reloadAll').addEventListener('click', function () {
      panels.forEach(function (P) { loadPanel(P, true); });
      pollPrices();
      toast('새로 불러오는 중…');
    });

    $('themeBtn').addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(); saveLayout();
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { pollPrices(); panels.forEach(function (P) { if (P.status === 'error') loadPanel(P, true); }); }
    });

    /* ── 시작 ────────────────────────────────────── */
    buildPanels();
    buildZoomChips();
    loadGh();
    load();
    panels.forEach(function (P, i) {
      P.symbol = slots[i].symbol;
      P.label = slots[i].label;
      P.shapes = (drawStore[P.symbol + '|' + state.interval] || []).slice();
    });
    initCharts();
    applyTheme();
    paintIntervals();
    paintToolsBtn();
    panels.forEach(function (P) { paintMeta(P); P.decimals = 2; });
    applyLayout();
    syncZoom();
    renderCount();
    renderList();
    paintFormSyms();
    paintGhPanel();

    window.setTimeout(function () {
      panels.forEach(function (P) { layoutPanel(P); });
      panels.forEach(function (P) { loadPanel(P, true); });
      pollPrices();
    }, 30);

    window.setTimeout(function () {
      var first = false;
      try { if (!localStorage.getItem(TIP_STORE)) { localStorage.setItem(TIP_STORE, '1'); first = true; } } catch (e) {}
      if (first) showBanner(['차트를 눌러 <b>+</b>를 누르면 그 가격 <b>돌파 알림</b>이 바로 등록돼요 · 두 번 탭하면 1화면'], 9000);
    }, 1400);

    if (ghReady()) window.setTimeout(ghPull, 1800);

    /* 캔들 갱신 */
    window.setInterval(function () {
      panels.forEach(function (P) {
        if (P.status === 'error' && !P.bars.length) return;
        if (binancePair(P.symbol)) loadBinance(P, false);
      });
      if (Date.now() - lastYahoo > 60000) {
        lastYahoo = Date.now();
        panels.forEach(function (P) {
          if (!binancePair(P.symbol) && yahooTicker(P.symbol)) loadYahoo(P, false);
        });
      }
    }, 15000);

    /* 가격·알림 확인 */
    window.setInterval(function () {
      var live = liveAlerts().some(function (a) { return a.on && !a.firedAt; });
      var open = modal.classList.contains('show');
      if (!live && !open && document.hidden) return;
      pollPrices();
    }, POLL_MS);

    window.addEventListener('orientationchange', function () {
      window.setTimeout(function () { panels.forEach(layoutPanel); }, 350);
    });

    /* 테스트·점검용 (읽기 전용) */
    window.__dbg = {
      panels: function () {
        return panels.map(function (P) {
          return {
            i: P.i, symbol: P.symbol, label: P.label, status: P.status,
            bars: P.bars.length, rsi: P.rsiSeries.length, vpvr: P.vpvr ? P.vpvr.bins : 0,
            price: P.lastPrice, decimals: P.decimals, source: P.source, err: P.err,
            plotW: P.plotW, plotH: P.plotH, priceScaleW: P.priceScaleW,
            plus: P.plusEl.classList.contains('show'),
            plusPrice: P.xhair.on ? P.xhair.price : null,
            popup: P.qopen, popupPrice: P.qprice,
            lines: P.priceLines.length,
            shapes: P.shapes.length
          };
        });
      },
      alerts: function () {
        return liveAlerts().map(function (a) {
          return { id: a.id, symbol: a.symbol, dir: a.dir, price: a.price, base: a.basePrice, last: a.lastPrice, fired: a.firedAt };
        });
      },
      state: function () { return { layout: state.layout, zoom: state.zoom, interval: state.interval, theme: state.theme, tools: state.tools, tool: state.tool, gh: ghReady() }; },
      geom: function (i) {
        var P = panels[i];
        var r = P.pchartEl.getBoundingClientRect();
        return { left: r.left, top: r.top, w: r.width, h: r.height, plotW: P.plotW, priceScaleW: P.priceScaleW };
      },
      /* 점검용: 시세를 원하는 값으로 넣고 알림 판정을 한 번 돌린다 */
      sim: function (symbol, price) {
        prices[symbol] = { v: price, t: new Date(), src: 'sim', err: '' };
        evaluateAlerts();
        return liveAlerts().map(function (a) {
          return { id: a.id, price: a.price, last: a.lastPrice, fired: a.firedAt };
        });
      }
    };
  }
})();
