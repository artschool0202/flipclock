(function () {
  'use strict';

  /* ===== 設定 ===== */
  var POMO_MS = 25 * 60 * 1000;            // ポモドーロ 25分
  var WX_INTERVAL = 15 * 60 * 1000;        // 天気 15分ごと
  var WX_RETRY = 3 * 60 * 1000;            // 失敗時は3分後に再試行
  var WX_PLACE = '調布';
  var WX_URL = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=35.652&longitude=139.541' +
    '&current=temperature_2m,weather_code,wind_speed_10m' +
    '&wind_speed_unit=ms&timezone=Asia%2FTokyo';
  var THEMES = ['black', 'cream', 'orange'];
  var THEME_COLOR = { black: '#0d0d0d', cream: '#d6ccb6', orange: '#070605' };
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  var $ = function (s) { return document.querySelector(s); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('flip.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('flip.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ===== パネルの大きさ（画面に合わせる） ===== */
  function fit() {
    var w = window.innerWidth, h = window.innerHeight * 0.935; // 下のバーを除く
    // 横幅＝パネル4枚(0.58)＋すき間2つ(0.05)＋コロン(0.2)＝パネル高さの2.62倍
    var size = Math.min(h * 0.76, (w * 0.95) / 2.62);
    document.documentElement.style.setProperty('--h', Math.round(size) + 'px');
  }
  window.addEventListener('resize', fit);
  fit();

  /* ===== フリップ1桁 ===== */
  function FlipDigit(el) {
    el.innerHTML =
      '<div class="half top"><span></span></div>' +
      '<div class="half bottom"><span></span></div>' +
      '<div class="flap"><div class="face front"><span></span></div>' +
      '<div class="face back"><span></span></div></div>';
    this.top = el.querySelector('.top span');
    this.bottom = el.querySelector('.bottom span');
    this.front = el.querySelector('.front span');
    this.back = el.querySelector('.back span');
    this.flap = el.querySelector('.flap');
    this.v = null;
    var self = this;
    this.flap.addEventListener('animationend', function (e) {
      if (e.target === self.flap) self.finish();
    });
  }
  FlipDigit.prototype.finish = function () {
    this.bottom.textContent = this.v;
    this.flap.classList.remove('go');
  };
  // 変わった桁だけめくる。変わったら true を返す
  FlipDigit.prototype.set = function (v, animate) {
    if (v === this.v) return false;
    var old = this.v;
    this.v = v;
    if (!animate || old === null || document.hidden) {
      this.top.textContent = this.bottom.textContent = this.front.textContent = this.back.textContent = v;
      this.flap.classList.remove('go');
      return true;
    }
    this.flap.classList.remove('go');
    this.top.textContent = v;      // 奥に見える新しい上半分
    this.bottom.textContent = old; // 板が落ちるまでは古い下半分
    this.front.textContent = old;  // 板の表＝古い上半分
    this.back.textContent = v;     // 板の裏＝新しい下半分
    void this.flap.offsetWidth;    // アニメーションをやり直すため
    this.flap.classList.add('go');
    return true;
  };

  var digits = Array.prototype.map.call(document.querySelectorAll('.card'), function (el) {
    return new FlipDigit(el);
  });

  /* ===== 効果音（Web Audio で合成。既定はOFF） ===== */
  var sound = {
    on: false, ctx: null, noise: null,
    init: function () {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!this.ctx) {
        this.ctx = new AC();
        var len = Math.floor(this.ctx.sampleRate * 0.06);
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        var d = this.noise.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    },
    click: function (t, vol, freq) {
      var c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise;
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      s.connect(f); f.connect(g); g.connect(c.destination);
      s.start(t); s.stop(t + 0.07);
    },
    thump: function (t) {
      var c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(80, t + 0.04);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.06);
    },
    flip: function () {        // めくり始めの「パ」と着地の「タ」
      if (!this.on || !this.ctx) return;
      var t = this.ctx.currentTime + 0.005;
      this.click(t, 0.18, 2800);
      this.click(t + 0.39, 0.45, 1500);
      this.thump(t + 0.39);
    },
    chime: function () {
      if (!this.on || !this.ctx) return;
      var c = this.ctx, t0 = c.currentTime + 0.05;
      [0, 0.7, 1.4].forEach(function (k) {
        [[880, 0], [1318.5, 0.14]].forEach(function (p) {
          var o = c.createOscillator(), g = c.createGain(), t = t0 + k + p[1];
          o.type = 'sine'; o.frequency.value = p[0];
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
          o.connect(g); g.connect(c.destination);
          o.start(t); o.stop(t + 0.65);
        });
      });
    }
  };

  /* ===== 時計／ポモドーロ ===== */
  var clockEl = $('#clock'), secEl = $('#sec'), labelEl = $('#label'), dateEl = $('#date');
  var mode = 'clock', pomoEnd = 0, pomoDone = false, timer = null, lastDate = '';

  function compute() {
    var now = new Date();   // 毎回 Date から再計算（ズレが溜まらない）
    if (mode === 'clock') {
      return { d: pad(now.getHours()) + pad(now.getMinutes()), small: pad(now.getSeconds()), now: now };
    }
    var rem = Math.max(0, Math.ceil((pomoEnd - now.getTime()) / 1000));
    return {
      d: pad(Math.floor(rem / 60)) + pad(rem % 60),
      small: pad(now.getHours()) + ':' + pad(now.getMinutes()),   // タイマー中は右下に現在時刻
      rem: rem, now: now
    };
  }

  function updateDate(now) {
    var s = now.getFullYear() + '.' + pad(now.getMonth() + 1) + '.' + pad(now.getDate()) + '　' + WEEK[now.getDay()];
    if (s !== lastDate) { dateEl.textContent = s; lastDate = s; }
  }

  function tick(animate) {
    clearTimeout(timer);
    var r = compute(), changed = false;
    for (var i = 0; i < 4; i++) if (digits[i].set(r.d.charAt(i), animate)) changed = true;
    if (changed && animate && !document.hidden) sound.flip();
    secEl.textContent = r.small;
    updateDate(r.now);
    if (mode === 'pomo' && r.rem === 0 && !pomoDone) finishPomo();

    // 次の切り替わりの瞬間に合わせて起きる（毎秒の常時描画はしない）
    var delay, ms;
    if (mode === 'pomo' && !pomoDone && (ms = pomoEnd - Date.now()) > 0) delay = (ms % 1000 || 1000) + 15;
    else delay = 1000 - (Date.now() % 1000) + 15;
    timer = setTimeout(function () { tick(true); }, delay);
  }

  function finishPomo() {
    pomoDone = true;
    labelEl.textContent = 'DONE';
    clockEl.classList.remove('done'); void clockEl.offsetWidth; clockEl.classList.add('done');
    sound.chime();
    if (navigator.vibrate) navigator.vibrate([200, 120, 200, 120, 400]);
  }

  function toggleMode() {
    if (mode === 'clock') {
      mode = 'pomo'; pomoEnd = Date.now() + POMO_MS; pomoDone = false;
      labelEl.textContent = 'POMODORO';
    } else {
      mode = 'clock';
    }
    document.body.classList.toggle('pomo', mode === 'pomo');
    clockEl.classList.remove('done');
    tick(true);
  }

  /* ===== テーマ ===== */
  var themeIdx = Math.max(0, THEMES.indexOf(store.get('theme', 'black')));
  function applyTheme() {
    var t = THEMES[themeIdx];
    document.documentElement.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', THEME_COLOR[t]);
    store.set('theme', t);
  }
  function cycleTheme() { themeIdx = (themeIdx + 1) % THEMES.length; applyTheme(); }
  applyTheme();

  /* ===== タップ／ダブルタップ ===== */
  var tapTimer = null;
  $('#stage').addEventListener('click', function () {
    if (sound.on) sound.init(); // 一時停止中の音声を操作のついでに再開
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; cycleTheme(); }
    else tapTimer = setTimeout(function () { tapTimer = null; toggleMode(); }, 280);
  });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ===== 右上アイコン ===== */
  var btnFs = $('#btnFs'), btnWake = $('#btnWake'), btnSnd = $('#btnSnd');

  // 全画面
  var root = document.documentElement;
  var reqFs = root.requestFullscreen || root.webkitRequestFullscreen;
  function isFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  if (!reqFs) btnFs.disabled = true;
  btnFs.addEventListener('click', function () {
    if (isFs()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      var p = reqFs.call(root, { navigationUI: 'hide' });
      if (p && p.then) p.then(function () {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
      }).catch(function () {});
    }
  });
  function fsUi() { btnFs.classList.toggle('on', isFs()); }
  document.addEventListener('fullscreenchange', fsUi);
  document.addEventListener('webkitfullscreenchange', fsUi);

  // Wake Lock（画面消灯防止）
  var wake = { want: store.get('wake', false), lock: null };
  function wakeUi() { btnWake.classList.toggle('on', !!wake.lock); }
  function wakeOn() {
    if (!('wakeLock' in navigator) || wake.lock || document.hidden) return;
    navigator.wakeLock.request('screen').then(function (l) {
      wake.lock = l;
      l.addEventListener('release', function () { wake.lock = null; wakeUi(); });
      wakeUi();
    }).catch(function () { wakeUi(); });
  }
  if (!('wakeLock' in navigator)) btnWake.disabled = true;
  btnWake.addEventListener('click', function () {
    wake.want = !wake.want; store.set('wake', wake.want);
    if (wake.want) wakeOn();
    else if (wake.lock) { wake.lock.release(); wake.lock = null; wakeUi(); }
  });
  if (wake.want) wakeOn();

  // 効果音（起動時は常にOFF）
  btnSnd.addEventListener('click', function () {
    sound.on = !sound.on && sound.init();
    btnSnd.classList.toggle('on', sound.on);
    if (sound.on) sound.flip(); // 試し鳴らし
  });

  /* ===== 天気（Open-Meteo、APIキー不要） ===== */
  var wxEl = $('#wx'), wxTimer = null, wxLast = store.get('wx', null);
  var WMO = {
    0: '快晴', 1: '晴れ', 2: '晴れ時々曇り', 3: '曇り', 45: '霧', 48: '霧',
    51: '弱い霧雨', 53: '霧雨', 55: '強い霧雨', 56: '着氷性の霧雨', 57: '着氷性の霧雨',
    61: '小雨', 63: '雨', 65: '強い雨', 66: '着氷性の雨', 67: '着氷性の雨',
    71: '小雪', 73: '雪', 75: '大雪', 77: '霧雪',
    80: 'にわか雨', 81: 'にわか雨', 82: '激しいにわか雨', 85: 'にわか雪', 86: '強いにわか雪',
    95: '雷雨', 96: '雷雨（ひょう）', 99: '激しい雷雨（ひょう）'
  };
  function showWx(stale) {
    if (!wxLast) { wxEl.textContent = WX_PLACE + '　天気を取得できません'; return; }
    var t = new Date(wxLast.at);
    wxEl.textContent = WX_PLACE + '　' + (WMO[wxLast.code] || '—') +
      '　' + wxLast.temp.toFixed(1) + '℃' +
      '　風 ' + wxLast.wind.toFixed(1) + 'm/s' +
      '　' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + (stale ? ' 更新失敗' : ' 更新');
  }
  function fetchWx() {
    clearTimeout(wxTimer);
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    fetch(WX_URL, ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        clearTimeout(to);
        var c = j.current;
        wxLast = { code: c.weather_code, temp: c.temperature_2m, wind: c.wind_speed_10m, at: Date.now() };
        store.set('wx', wxLast);
        showWx(false);
        wxTimer = setTimeout(fetchWx, WX_INTERVAL);
      })
      .catch(function () {
        clearTimeout(to);
        showWx(true);
        wxTimer = setTimeout(fetchWx, WX_RETRY);
      });
  }
  if (wxLast) showWx(false);
  fetchWx();

  /* ===== 画面の表示／非表示 ===== */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    tick(false);                                         // 戻ったら一気に正しい表示へ
    if (wake.want) wakeOn();                             // 画面を離れると Wake Lock は外れるので取り直す
    if (!wxLast || Date.now() - wxLast.at > WX_INTERVAL) fetchWx();
  });

  /* ===== 起動 ===== */
  tick(false);
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
