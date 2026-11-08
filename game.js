'use strict';

/* =====================================================================
   KIT COMÚN DE PLATAFORMA (compartido por los tres juegos)
   ===================================================================== */
const Platform = (() => {
  const params = new URLSearchParams(window.location.search);
  const testMode = params.get('ads') === 'test';
  let kind = 'none';
  let overlay = null;
  const safe = (fn) => {
    try { return fn(); } catch (err) { return undefined; }
  };

  function fakeAd(ms) {
    return new Promise((resolve) => {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;'
          + 'flex-direction:column;gap:14px;background:#000;color:#fff;font:700 20px system-ui,sans-serif;letter-spacing:.12em;text-align:center';
        document.body.appendChild(overlay);
      }
      overlay.textContent = '';
      const a = document.createElement('div');
      a.textContent = 'AD · PUBLICIDAD (TEST)';
      const b = document.createElement('div');
      b.style.fontSize = '44px';
      overlay.append(a, b);
      overlay.style.display = 'flex';
      const end = performance.now() + ms;
      const tick = () => {
        const left = Math.ceil((end - performance.now()) / 1000);
        b.textContent = String(Math.max(0, left));
        if (left > 0) setTimeout(tick, 200);
        else {
          overlay.style.display = 'none';
          resolve();
        }
      };
      tick();
    });
  }

  return {
    playing: false,
    get kind() { return kind; },
    async init() {
      const W = window;
      try {
        if (W.GameAds && typeof W.GameAds.commercialBreak === 'function') {
          kind = 'custom';
          if (typeof W.GameAds.init === 'function') await W.GameAds.init();
        } else if (W.PokiSDK && typeof W.PokiSDK.init === 'function') {
          kind = 'poki';
          await W.PokiSDK.init();
        } else if (W.CrazyGames && W.CrazyGames.SDK && typeof W.CrazyGames.SDK.init === 'function') {
          kind = 'crazygames';
          await W.CrazyGames.SDK.init();
        } else if (typeof W.adBreak === 'function') {
          kind = 'h5';
          if (typeof W.adConfig === 'function') W.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
        } else if (testMode) {
          kind = 'test';
        }
      } catch (err) {
        /* Bloqueo de anuncios */
      }
    },
    hasRewarded() { return kind !== 'none'; },
    loadingFinished() {
      safe(() => {
        if (kind === 'poki') window.PokiSDK.gameLoadingFinished();
        else if (kind === 'crazygames') window.CrazyGames.SDK.game.loadingStop();
      });
    },
    gameplayStart() {
      if (this.playing) return;
      this.playing = true;
      safe(() => {
        if (kind === 'poki') window.PokiSDK.gameplayStart();
        else if (kind === 'crazygames') window.CrazyGames.SDK.game.gameplayStart();
        else if (kind === 'custom' && window.GameAds.gameplayStart) window.GameAds.gameplayStart();
      });
    },
    gameplayStop() {
      if (!this.playing) return;
      this.playing = false;
      safe(() => {
        if (kind === 'poki') window.PokiSDK.gameplayStop();
        else if (kind === 'crazygames') window.CrazyGames.SDK.game.gameplayStop();
        else if (kind === 'custom' && window.GameAds.gameplayStop) window.GameAds.gameplayStop();
      });
    },
    happyTime() {
      safe(() => {
        if (kind === 'crazygames') window.CrazyGames.SDK.game.happytime();
      });
    },
    commercialBreak(onStart) {
      return new Promise((resolve) => {
        const start = () => { if (onStart) safe(onStart); };
        try {
          if (kind === 'poki') window.PokiSDK.commercialBreak(start).then(() => resolve(), () => resolve());
          else if (kind === 'crazygames') {
            window.CrazyGames.SDK.ad.requestAd('midgame', { adStarted: start, adFinished: () => resolve(), adError: () => resolve() });
          } else if (kind === 'custom') Promise.resolve(window.GameAds.commercialBreak(start)).then(() => resolve(), () => resolve());
          else if (kind === 'h5') window.adBreak({ type: 'next', name: 'pausa', beforeAd: start, adBreakDone: () => resolve() });
          else if (kind === 'test') {
            start();
            fakeAd(1500).then(resolve);
          } else resolve();
        } catch (err) {
          resolve();
        }
      });
    },
    rewardedBreak(onStart) {
      return new Promise((resolve) => {
        const start = () => { if (onStart) safe(onStart); };
        try {
          if (kind === 'poki') window.PokiSDK.rewardedBreak(start).then((ok) => resolve(!!ok), () => resolve(false));
          else if (kind === 'crazygames') {
            window.CrazyGames.SDK.ad.requestAd('rewarded', { adStarted: start, adFinished: () => resolve(true), adError: () => resolve(false) });
          } else if (kind === 'custom' && typeof window.GameAds.rewardedBreak === 'function') {
            Promise.resolve(window.GameAds.rewardedBreak(start)).then((ok) => resolve(!!ok), () => resolve(false));
          } else if (kind === 'h5') {
            let viewed = false;
            window.adBreak({
              type: 'reward', name: 'recompensa', beforeAd: start,
              beforeReward: (showAdFn) => showAdFn(), adViewed: () => { viewed = true; },
              adDismissed: () => { viewed = false; }, adBreakDone: () => resolve(viewed)
            });
          } else if (kind === 'test') {
            start();
            fakeAd(2500).then(() => resolve(true));
          } else resolve(false);
        } catch (err) {
          resolve(false);
        }
      });
    }
  };
})();

const I18N = {
  lang: 'en',
  dict: { es: {}, en: {} },
  init(dict, saved) {
    this.dict = dict;
    const nav = String(navigator.language || 'en').toLowerCase();
    this.lang = saved === 'es' || saved === 'en' ? saved : (nav.startsWith('es') ? 'es' : 'en');
    this.apply();
  },
  extend(more) {
    for (const lang of Object.keys(more)) this.dict[lang] = Object.assign({}, more[lang], this.dict[lang] || {});
  },
  t(key, vars) {
    let s = (this.dict[this.lang] || {})[key];
    if (s === undefined) s = (this.dict.en || {})[key];
    if (s === undefined) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
    return s;
  },
  apply(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = this.t(el.getAttribute('data-i18n')); });
    r.querySelectorAll('[data-i18n-label]').forEach((el) => {
      const v = this.t(el.getAttribute('data-i18n-label'));
      el.setAttribute('aria-label', v);
      el.setAttribute('title', v);
    });
    document.documentElement.lang = this.lang;
  },
  fmt(n) { return Math.floor(n).toLocaleString(this.lang === 'es' ? 'es-DO' : 'en-US'); }
};
const t = (key, vars) => I18N.t(key, vars);

const Save = {
  key: 'game',
  data: {},
  init(key, defaults) {
    this.key = key;
    this.data = JSON.parse(JSON.stringify(defaults));
    const merge = (dst, src) => {
      if (!src || typeof src !== 'object') return;
      for (const k of Object.keys(src)) {
        const v = src[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) merge(dst[k], v);
        else dst[k] = v;
      }
    };
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) merge(this.data, JSON.parse(raw));
    } catch (err) { /* sin almacenamiento */ }
  },
  write() {
    try { window.localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (err) { /* ignorado */ }
  }
};

const Haptics = {
  enabled: true,
  pulse(pattern) {
    if (!this.enabled || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (err) { /* ignorado */ }
  }
};

const KIT_DICT = {
  es: {
    kGems: 'Gemas', kAdBtn: 'Ver anuncio ({n} de 3 hoy)', kGemBtn: 'Pagar {n} 💎', kCancel: 'Cancelar', kOk: 'Entendido',
    kBalance: 'Tienes {n} 💎', kNoGems: 'No tienes gemas suficientes', kGetGems: 'Conseguir gemas',
    kAdLimit: 'Ya usaste los 3 anuncios gratis de hoy en este juego; ahora cuesta gemas.',
    kAdUnavailable: 'No hay anuncio disponible ahora mismo. Inténtalo más tarde.',
    kGuest: 'Invitado', kLobby: 'Juegos', kLoginHint: 'Abre el juego desde el lobby e inicia sesión para guardar tus gemas.',
    kShopOffline: 'La tienda de gemas requiere el servidor.', kBought: '¡Compra realizada!'
  },
  en: {
    kGems: 'Gems', kAdBtn: 'Watch ad ({n} of 3 today)', kGemBtn: 'Pay {n} 💎', kCancel: 'Cancel', kOk: 'Got it',
    kBalance: 'You have {n} 💎', kNoGems: 'Not enough gems', kGetGems: 'Get gems',
    kAdLimit: 'You used today’s 3 free ads in this game; now it costs gems.',
    kAdUnavailable: 'No ad available right now. Please try again later.',
    kGuest: 'Guest', kLobby: 'Games', kLoginHint: 'Open the game from the lobby and sign in to keep your gems.',
    kShopOffline: 'The gem shop requires a server.', kBought: 'Purchase complete!'
  }
};

let kitStylesDone = false;
function kitStyles() {
  if (kitStylesDone) return;
  kitStylesDone = true;
  const css = document.createElement('style');
  css.textContent = `
    .gk-modal{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(3,2,12,.72);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);font-family:"Bahnschrift","DIN Alternate","Barlow Condensed","Roboto Condensed","Arial Narrow",sans-serif}
    .gk-modal.show{display:flex}
    .gk-card{width:min(400px,100%);padding:22px 20px 18px;border-radius:18px;text-align:center;color:#f3efff;background:linear-gradient(170deg,#1c1446,#0b0822);border:1px solid rgba(255,210,90,.45);box-shadow:0 0 40px rgba(255,190,60,.18),0 20px 60px rgba(0,0,0,.6);animation:gkin .28s cubic-bezier(.2,.9,.3,1.2)}
    @keyframes gkin{from{transform:scale(.88);opacity:0}to{transform:none;opacity:1}}
    .gk-icon{font-size:38px;line-height:1;margin-bottom:6px;filter:drop-shadow(0 0 12px rgba(120,200,255,.7))}
    .gk-title{font-size:22px;font-weight:800;letter-spacing:.02em;margin-bottom:6px}
    .gk-text{font-size:15px;line-height:1.4;color:#c9c0ea;margin-bottom:8px}
    .gk-bal{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:#9fe7ff;margin-bottom:14px;min-height:1px}
    .gk-actions{display:grid;gap:8px}
    .gk-btn{min-height:46px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#f3efff;font:inherit;font-size:17px;letter-spacing:.03em;cursor:pointer}
    .gk-btn.primary{border:none;color:#1a1000;font-weight:800;background:linear-gradient(90deg,#ffd23c,#ff9d2e);box-shadow:0 0 22px rgba(255,190,60,.4)}
    .gk-btn:focus-visible{outline:2px solid #9fe7ff;outline-offset:2px}
    .gk-chip{position:fixed;top:max(10px,env(safe-area-inset-top));left:max(10px,env(safe-area-inset-left));z-index:9000;display:none;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:rgba(10,8,30,.82);border:1px solid rgba(255,210,90,.45);color:#f3efff;font:600 14px "Bahnschrift","Arial Narrow",sans-serif;cursor:pointer}
    .gk-chip.show{display:flex}.gk-back{color:#ffd23c;font-weight:800;letter-spacing:.02em}
    .gk-chip b{color:#9fe7ff;font-family:ui-monospace,Menlo,monospace}
    .gk-banner{position:fixed;left:max(10px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));z-index:8000;width:320px;height:50px;display:none;align-items:center;justify-content:center;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.05);border:1px dashed rgba(255,255,255,.22);color:rgba(255,255,255,.45);font:12px system-ui,sans-serif;letter-spacing:.1em}
    .gk-banner.show{display:flex}
    @media (max-width:700px),(max-height:500px){.gk-banner{display:none!important}}`;
  document.head.appendChild(css);
}

const Hub = (() => {
  const LOCAL = 'aetheria-wallet:v1';
  const FREE_ADS = 3;
  let online = false;
  let user = null;
  let csrf = '';
  let wallet = { gems: 15, ads: { day: '', counts: {} }, inv: {}, adsFree: false, earnDay: '', earned: {} };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (err) { /* ignorado */ } });
  const loadLocal = () => {
    try {
      const w = JSON.parse(window.localStorage.getItem(LOCAL) || 'null');
      if (w && typeof w === 'object') wallet = Object.assign(wallet, w);
    } catch (err) { /* ignorado */ }
  };
  const saveLocal = () => { try { window.localStorage.setItem(LOCAL, JSON.stringify(wallet)); } catch (err) { /* ignorado */ } };
  const base = () => (window.location.pathname.includes('/games/') ? '../' : '');
  async function call(action, body, query) {
    const qs = new URLSearchParams(Object.assign({ a: action }, query || {}));
    const opts = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['X-CSRF'] = csrf;
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${base()}api/api.php?${qs}`, opts);
    let data = {};
    try { data = await res.json(); } catch (err) { /* vacío */ }
    if (!res.ok) {
      const e = new Error(data.error || `http_${res.status}`);
      e.data = data;
      throw e;
    }
    return data;
  }
  const localKey = (game, item) => `${game}:${item}`;
  return {
    game: 'hub',
    get online() { return online; },
    get user() { return user; },
    get gems() { return wallet.gems; },
    get adsFree() { return !!wallet.adsFree; },
    onChange(fn) { listeners.add(fn); },
    async init(game) {
      this.game = game;
      loadLocal();
      if (window.location.protocol !== 'file:') {
        try {
          const s = await call('session');
          csrf = s.csrf || '';
          if (s.user) {
            online = true;
            user = s.user;
            wallet.gems = Number(s.user.gems);
            wallet.adsFree = !!Number(s.user.ads_free);
            wallet.inv = s.inventory || {};
            wallet.serverAds = s.adsLeft || {};
          }
        } catch (err) { /* invitado */ }
      }
      emit();
    },
    adsLeft(game = this.game) {
      if (online) {
        const v = (wallet.serverAds || {})[game];
        return v === undefined ? FREE_ADS : v;
      }
      if (wallet.ads.day !== todayKey()) wallet.ads = { day: todayKey(), counts: {} };
      return Math.max(0, FREE_ADS - (wallet.ads.counts[game] || 0));
    },
    async useAd(game = this.game) {
      if (online) {
        try { wallet.serverAds = (await call('ad_claim', { game })).adsLeft; } catch (err) { /* ignorado */ }
      } else {
        if (wallet.ads.day !== todayKey()) wallet.ads = { day: todayKey(), counts: {} };
        wallet.ads.counts[game] = (wallet.ads.counts[game] || 0) + 1;
        saveLocal();
      }
      emit();
    },
    owns(item, game = this.game) { return (wallet.inv[localKey(game, item)] || 0) > 0; },
    async spend(item, price, game = this.game) {
      if (online) {
        try {
          const r = await call('spend', { game, item });
          wallet.gems = Number(r.gems);
          wallet.inv = r.inventory || wallet.inv;
          emit();
          return true;
        } catch (err) {
          if (err.data && typeof err.data.gems === 'number') wallet.gems = err.data.gems;
          emit();
          return false;
        }
      }
      if (wallet.gems < price) return false;
      wallet.gems -= price;
      wallet.inv[localKey(game, item)] = (wallet.inv[localKey(game, item)] || 0) + 1;
      saveLocal();
      emit();
      return true;
    },
    async earn(reason, game = this.game) {
      if (online) {
        try {
          const r = await call('earn', { game, reason });
          wallet.gems = Number(r.gems);
          emit();
          return r.granted || 0;
        } catch (err) { return 0; }
      }
      const amount = { stars: 2, level3: 1, daily_run: 2, mission: 1, win_hard: 1, wave10: 2 }[reason] || 1;
      if (wallet.earnDay !== todayKey()) {
        wallet.earnDay = todayKey();
        wallet.earned = {};
      }
      const used = wallet.earned[game] || 0;
      const g = Math.max(0, Math.min(amount, 5 - used));
      wallet.earned[game] = used + g;
      wallet.gems += g;
      saveLocal();
      emit();
      return g;
    },
    async saveProgress(data, game = this.game) {
      if (!online) return;
      try { await call('progress_set', { game, data }); } catch (err) { /* ignorado */ }
    },
    async loadProgress(game = this.game) {
      if (!online) return null;
      try { return (await call('progress_get', null, { game })).data || null; } catch (err) { return null; }
    },
    async submitScore(mode, score, game = this.game) {
      if (!online) return;
      try { await call('score', { game, mode, score: Math.floor(score) }); } catch (err) { /* ignorado */ }
    },
    lobbyUrl(hash = '') { return `${base()}index.html${hash}`; },
    openShop() {
      if (online) window.location.href = this.lobbyUrl('#shop');
      else GemUI.open({ title: t('kGetGems'), text: t('kShopOffline'), buttons: [{ id: 'ok', label: t('kOk'), primary: true }] });
    }
  };
})();

const GemUI = (() => {
  let root = null;
  function ensure() {
    if (root) return root;
    kitStyles();
    root = document.createElement('div');
    root.className = 'gk-modal';
    const card = document.createElement('div');
    card.className = 'gk-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    for (const cls of ['gk-icon', 'gk-title', 'gk-text', 'gk-bal', 'gk-actions']) {
      const el = document.createElement('div');
      el.className = cls;
      card.appendChild(el);
    }
    root.appendChild(card);
    document.body.appendChild(root);
    return root;
  }
  return {
    get isOpen() { return !!root && root.classList.contains('show'); },
    open({ icon = '💎', title = '', text = '', buttons = [], balance = false }) {
      const r = ensure();
      r.querySelector('.gk-icon').textContent = icon;
      r.querySelector('.gk-title').textContent = title;
      const tx = r.querySelector('.gk-text');
      tx.textContent = text;
      tx.style.display = text ? '' : 'none';
      r.querySelector('.gk-bal').textContent = balance ? t('kBalance', { n: Hub.gems }) : '';
      const box = r.querySelector('.gk-actions');
      box.textContent = '';
      return new Promise((resolve) => {
        const close = (id) => {
          r.classList.remove('show');
          resolve(id);
        };
        buttons.forEach((b) => {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = `gk-btn${b.primary ? ' primary' : ''}`;
          el.textContent = b.label;
          el.addEventListener('click', () => close(b.id));
          box.appendChild(el);
        });
        r.classList.add('show');
        const first = box.querySelector('.gk-btn.primary') || box.querySelector('.gk-btn');
        if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
      });
    }
  };
})();

async function rewardFlow({ game = Hub.game, item, price, title, text = '', icon = '❤', duck }) {
  const left = Hub.adsLeft(game);
  const canAd = Platform.hasRewarded() && left > 0;
  const buttons = [];
  if (canAd) buttons.push({ id: 'ad', label: t('kAdBtn', { n: 3 - left + 1 }), primary: true });
  buttons.push({ id: 'gems', label: t('kGemBtn', { n: price }), primary: !canAd });
  buttons.push({ id: 'cancel', label: t('kCancel') });
  const note = Platform.hasRewarded() && left <= 0 ? t('kAdLimit') : '';
  const choice = await GemUI.open({ icon, title, text: [text, note].filter(Boolean).join(' '), buttons, balance: true });
  if (choice === 'ad') {
    const ok = await Platform.rewardedBreak(() => { if (duck) duck(true); });
    if (duck) duck(false);
    if (ok) {
      await Hub.useAd(game);
      return true;
    }
    await GemUI.open({ icon: '📺', title: t('kAdUnavailable'), buttons: [{ id: 'ok', label: t('kOk'), primary: true }] });
    return false;
  }
  if (choice === 'gems') {
    if (await Hub.spend(item, price, game)) return true;
    const c2 = await GemUI.open({ title: t('kNoGems'), buttons: [{ id: 'shop', label: t('kGetGems'), primary: true }, { id: 'cancel', label: t('kCancel') }], balance: true });
    if (c2 === 'shop') Hub.openShop();
  }
  return false;
}

async function gemPurchase({ game = Hub.game, item, price, title, icon = '💎' }) {
  const choice = await GemUI.open({ icon, title, buttons: [{ id: 'buy', label: t('kGemBtn', { n: price }), primary: true }, { id: 'cancel', label: t('kCancel') }], balance: true });
  if (choice !== 'buy') return false;
  if (await Hub.spend(item, price, game)) return true;
  const c2 = await GemUI.open({ title: t('kNoGems'), buttons: [{ id: 'shop', label: t('kGetGems'), primary: true }, { id: 'cancel', label: t('kCancel') }], balance: true });
  if (c2 === 'shop') Hub.openShop();
  return false;
}

const Banner = (() => {
  let el = null;
  return {
    show() {
      if (Hub.adsFree) return;
      const cfg = window.AETHERIA_ADS || null;
      const test = new URLSearchParams(window.location.search).get('ads') === 'test';
      if (!test && !(cfg && cfg.client && cfg.bannerSlot && window.adsbygoogle)) return;
      if (!el) {
        kitStyles();
        el = document.createElement('div');
        el.className = 'gk-banner';
        document.body.appendChild(el);
        if (!test) {
          const ins = document.createElement('ins');
          ins.className = 'adsbygoogle';
          ins.style.cssText = 'display:inline-block;width:320px;height:50px';
          ins.setAttribute('data-ad-client', cfg.client);
          ins.setAttribute('data-ad-slot', cfg.bannerSlot);
          el.appendChild(ins);
          try { window.adsbygoogle.push({}); } catch (err) { /* ignorado */ }
        } else el.textContent = 'AD 320×50 (TEST)';
      }
      el.classList.add('show');
    },
    hide() { if (el) el.classList.remove('show'); }
  };
})();

const AccountChip = (() => {
  let el = null;
  let back = null;
  const fromLobby = () => {
    try { return new URLSearchParams(window.location.search).get('from') === 'lobby' || Hub.online; } catch (err) { return false; }
  };
  const render = () => {
    if (!el) return;
    el.textContent = '';
    const g = document.createElement('b');
    g.textContent = `💎 ${Hub.gems}`;
    const u = document.createElement('span');
    u.textContent = Hub.user ? Hub.user.username : t('kGuest');
    el.append(g, u);
  };
  return {
    show() {
      if (!el) {
        kitStyles();
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'gk-chip';
        el.addEventListener('click', () => {
          if (Hub.online) window.location.href = Hub.lobbyUrl();
          else GemUI.open({ icon: '👤', title: t('kGuest'), text: t('kLoginHint'), buttons: [{ id: 'ok', label: t('kOk'), primary: true }], balance: true });
        });
        document.body.appendChild(el);
        Hub.onChange(render);
      }
      render();
      el.classList.add('show');
      if (fromLobby()) {
        if (!back) {
          back = document.createElement('button');
          back.type = 'button';
          back.className = 'gk-chip gk-back';
          back.textContent = `\u27f5 ${t('kLobby')}`;
          back.addEventListener('click', () => { window.location.href = Hub.lobbyUrl(); });
          document.body.appendChild(back);
        }
        back.classList.add('show');
        el.style.top = `${Math.round(back.getBoundingClientRect().bottom + 6)}px`;
      }
    },
    hide() {
      if (el) el.classList.remove('show');
      if (back) back.classList.remove('show');
    }
  };
})();

const GS_DICT = {
  es: {
    pitch: 'No controlas al robot. Controlas la gravedad.', play: 'Jugar', playLevel: 'Jugar · nivel {n}', levels: 'Niveles', shop: 'Tienda',
    settings: 'Ajustes', howto: 'Cómo jugar', back: 'Volver', gotIt: 'Entendido',
    livesFull: '❤ {n}/5', livesNext: '❤ {n}/5 · {t}', livesInf: '❤ ∞ {t}', starsPill: '★ {n}/{m}', scorePill: 'Total {n}',
    keyGravity: 'gravedad', keyPause: 'pausa', keyRestart: 'reiniciar', keySound: 'sonido', pauseKey: 'Pausar (P)', soundKey: 'Sonido (M)',
    hudLevel: 'Nivel', hudIntegrity: 'Integridad', hudPoints: 'Puntos', hudCores: 'Núcleos', hudInstability: 'Inestabilidad del mapa', hudGravity: 'Gravedad',
    sector0: 'Sector 1 · Núcleo', sector1: 'Sector 2 · Corriente', sector2: 'Sector 3 · Singularidad',
    skinsTitle: 'ASPECTOS DEL ROBOT', livesTitle: 'VIDAS', refillBtn: 'Recargar vidas · 12 💎', infBtn: 'Vidas infinitas 1 h · 30 💎',
    shopNote: 'Las gemas se ganan con 3 estrellas y retos, o en el lobby.', needStars: '{n} ★', equip: 'Equipar', equipped: 'Equipado',
    sk_classic: 'Clásico', sk_mint: 'Menta', sk_sunset: 'Atardecer', sk_ember: 'Brasa', sk_void: 'Vacío', sk_gold: 'Oro',
    language: 'Idioma', sound: 'Sonido', vibration: 'Vibración', on: 'Sí', off: 'No',
    how1: 'Cambia la gravedad con las flechas o WASD (en móvil, desliza). El robot cae hacia donde apunte.',
    how2: 'Recoge todos los núcleos azules para abrir el portal de salida.',
    how3: 'Los cristales verdes hacen retroceder el colapso 5 segundos y suben tu multiplicador.',
    how4: 'Chocar muy rápido daña al robot. Cuando brille en naranja, invierte la gravedad un instante para frenar.',
    how5: 'Todo lo rojo hace daño: plasma, láseres y drones. El colapso avanza desde los bordes.',
    how6: 'Consigue 3 estrellas: completa el nivel, sin daño y por debajo del tiempo objetivo.',
    pause: 'Pausa', resume: 'Continuar', restartLvl: 'Reiniciar nivel', menu: 'Menú', guideBtn: '🧭 Ver solución',
    levelClear: 'Nivel completado', critDone: 'Completar el nivel', critSafe: 'Sin recibir daño', critTime: 'Tiempo ≤ {n} s',
    statTime: 'Tiempo', statTimeBonus: 'Bonus de tiempo', statIntegrity: 'Bonus de integridad', statBrakes: 'Frenados perfectos', statScore: 'Puntuación', statBest: 'Mejor',
    echoNew: 'Nuevo eco: mejoraste tu marca por {t}', echoFirst: 'Eco registrado: tu fantasma te acompañará', echoKeep: 'Tu eco sigue en {t}',
    next: 'Siguiente nivel', replay: 'Repetir',
    overTitle: 'Robot destruido', revive: '▶ Revivir', retry: 'Reintentar · ❤ {n}', retryInf: 'Reintentar', skipBtn: '⏭ Saltar nivel',
    cause_collapse: 'El colapso del mapa alcanzó al robot.', cause_total: 'Colapso total: la inestabilidad llegó al 100 %.',
    cause_impact: 'Demasiados choques a alta velocidad. Frena invirtiendo la gravedad.', cause_plasma: 'El robot tocó plasma demasiadas veces.',
    cause_laser: 'Un láser activo atravesó al robot.', cause_drone: 'Un dron de seguridad destruyó al robot.',
    reviveTitle: '¿Revivir?', reviveText: 'Vuelves al inicio con tus núcleos, 60 % de integridad y 15 s menos de colapso.', revived: '¡De vuelta!',
    skipTitle: 'Saltar este nivel y desbloquear el siguiente', guideTitle: 'Eco guía: un fantasma dorado te muestra la solución',
    noLives: 'Sin vidas', noLivesText: 'Recuperas una vida cada 20 minutos. Próxima en {t}.', lifeAd: '▶ Ver anuncio: +1 vida',
    victoryTitle: 'Escapaste', victoryText: 'Superaste los 30 sectores.', totalStars: 'Estrellas', totalScore: 'Puntuación total',
    levelN: 'Nivel {n}', diff1: 'Fácil', diff2: 'Medio', diff3: 'Difícil', locked: 'Bloqueado',
    introL1a: 'Flechas o WASD: cambia la gravedad', introL1aTouch: 'Desliza en la pantalla para cambiar la gravedad', introL1b: 'Recoge los núcleos azules para abrir el portal',
    introL2: 'Los láseres parpadean justo antes de encenderse', introL3: 'Último sector: cinco núcleos y colapso rápido',
    hintBrake: '¡Demasiado rápido! Invierte la gravedad un instante para frenar', hintCollapse: 'El colapso te está dañando: aléjate de los bordes',
    hintCrystal: 'Los cristales verdes hacen retroceder el colapso', hintPortal: 'Portal abierto: entra para escapar',
    hintCores: 'Los puntos alrededor del portal muestran cuántos núcleos faltan',
    impact: '¡Impacto!', perfectBrake: 'Frenado perfecto +{n}', portalOpen: 'Portal abierto', collapseBack: '−{n} s colapso',
    echoTag: 'ECO', guideTag: 'GUÍA', gemsEarned: '+{n} 💎 por 3 estrellas'
  },
  en: {
    pitch: 'You don’t control the robot. You control gravity.', play: 'Play', playLevel: 'Play · level {n}', levels: 'Levels', shop: 'Shop',
    settings: 'Settings', howto: 'How to play', back: 'Back', gotIt: 'Got it',
    livesFull: '❤ {n}/5', livesNext: '❤ {n}/5 · {t}', livesInf: '❤ ∞ {t}', starsPill: '★ {n}/{m}', scorePill: 'Total {n}',
    keyGravity: 'gravity', keyPause: 'pause', keyRestart: 'restart', keySound: 'sound', pauseKey: 'Pause (P)', soundKey: 'Sound (M)',
    hudLevel: 'Level', hudIntegrity: 'Integrity', hudPoints: 'Score', hudCores: 'Cores', hudInstability: 'Map instability', hudGravity: 'Gravity',
    sector0: 'Sector 1 · Core', sector1: 'Sector 2 · Current', sector2: 'Sector 3 · Singularity',
    skinsTitle: 'ROBOT SKINS', livesTitle: 'LIVES', refillBtn: 'Refill lives · 12 💎', infBtn: 'Unlimited lives 1 h · 30 💎',
    shopNote: 'Gems come from 3-star clears or from the lobby.', needStars: '{n} ★', equip: 'Equip', equipped: 'Equipped',
    sk_classic: 'Classic', sk_mint: 'Mint', sk_sunset: 'Sunset', sk_ember: 'Ember', sk_void: 'Void', sk_gold: 'Gold',
    language: 'Language', sound: 'Sound', vibration: 'Vibration', on: 'On', off: 'Off',
    how1: 'Change gravity with the arrow keys or WASD (swipe on touch).',
    how2: 'Collect every blue core to open the exit portal.',
    how3: 'Green crystals push the collapse back 5 seconds and raise your multiplier.',
    how4: 'Crashing too fast hurts the robot. When it glows orange, flip gravity to brake.',
    how5: 'Everything red hurts: plasma, lasers and drones.',
    how6: 'Earn 3 stars: finish the level, take no damage and beat target time.',
    pause: 'Paused', resume: 'Resume', restartLvl: 'Restart level', menu: 'Menu', guideBtn: '🧭 Show solution',
    levelClear: 'Level complete', critDone: 'Finish the level', critSafe: 'Take no damage', critTime: 'Time ≤ {n} s',
    statTime: 'Time', statTimeBonus: 'Time bonus', statIntegrity: 'Integrity bonus', statBrakes: 'Perfect brakes', statScore: 'Score', statBest: 'Best',
    echoNew: 'New echo: you beat your time by {t}', echoFirst: 'Echo saved: your ghost will race you next time', echoKeep: 'Your echo stays at {t}',
    next: 'Next level', replay: 'Replay',
    overTitle: 'Robot destroyed', revive: '▶ Revive', retry: 'Retry · ❤ {n}', retryInf: 'Retry', skipBtn: '⏭ Skip level',
    cause_collapse: 'The map collapse caught the robot.', cause_total: 'Total collapse: instability reached 100%.',
    cause_impact: 'Too many high-speed crashes. Brake by flipping gravity.', cause_plasma: 'The robot touched plasma too many times.',
    cause_laser: 'An active laser cut through the robot.', cause_drone: 'A security drone destroyed the robot.',
    reviveTitle: 'Revive?', reviveText: 'Back to start with your cores, 60% integrity and 15 s less collapse.', revived: 'Back in action!',
    skipTitle: 'Skip this level and unlock the next', guideTitle: 'Guide echo: a golden ghost shows you the solution',
    noLives: 'Out of lives', noLivesText: 'You regain one life every 20 minutes.', lifeAd: '▶ Watch ad: +1 life',
    victoryTitle: 'You escaped', victoryText: 'All 30 sectors cleared.', totalStars: 'Stars', totalScore: 'Total score',
    levelN: 'Level {n}', diff1: 'Easy', diff2: 'Medium', diff3: 'Hard', locked: 'Locked',
    introL1a: 'Arrows or WASD: change gravity', introL1aTouch: 'Swipe on the screen to change gravity', introL1b: 'Collect the blue cores to open the portal',
    introL2: 'Lasers flicker right before they turn on', introL3: 'Final sector: five cores and fast collapse',
    hintBrake: 'Too fast! Flip gravity for an instant to brake', hintCollapse: 'The collapse is hurting you: move away from edges',
    hintCrystal: 'Green crystals push the collapse back', hintPortal: 'Portal open: enter it to escape',
    hintCores: 'The dots around the portal show how many cores are left',
    impact: 'Impact!', perfectBrake: 'Perfect brake +{n}', portalOpen: 'Portal open', collapseBack: '−{n} s collapse',
    echoTag: 'ECHO', guideTag: 'GUIDE', gemsEarned: '+{n} 💎 for 3 stars'
  }
};

const GS_DEFAULTS = {
  lang: null, sound: true, vibration: true, unlocked: 1, levels: {}, echoes: {}, highScore: 0,
  lives: 5, livesAt: 0, infiniteUntil: 0, skin: 'classic', skins: ['classic']
};

const ROBOT_SKINS = [
  { id: 'classic', body: '#c4f9ff', glow: '#2be4ff', eye: '#2be4ff', legs: '#7fe9ff', trail: '#2be4ff', stars: 0 },
  { id: 'mint', body: '#c9ffe6', glow: '#3dffa2', eye: '#3dffa2', legs: '#8dffc9', trail: '#3dffa2', stars: 15 },
  { id: 'sunset', body: '#ffe0c4', glow: '#ff8a3d', eye: '#ffb02e', legs: '#ffc27a', trail: '#ff8a3d', stars: 40 },
  { id: 'ember', body: '#ffd2c2', glow: '#ff2e57', eye: '#ffd23c', legs: '#ff8a7a', trail: '#ff2e57', gems: 60 },
  { id: 'void', body: '#3a2a66', glow: '#b866ff', eye: '#efe2ff', legs: '#7a5cc4', trail: '#b866ff', gems: 90 },
  { id: 'gold', body: '#fff2b8', glow: '#ffd23c', eye: '#ffffff', legs: '#ffcf4a', trail: '#ffd23c', gems: 150 }
];
function currentSkin() { return ROBOT_SKINS.find((s) => s.id === (Save.data && Save.data.skin)) || ROBOT_SKINS[0]; }
function levelName(def) { return (def.name && (def.name[I18N.lang] || def.name.es)) || ''; }
function totalStars() { return Object.values(Save.data.levels || {}).reduce((s, l) => s + (l.stars || 0), 0); }
function totalScore() { return Object.values(Save.data.levels || {}).reduce((s, l) => s + (l.score || 0), 0); }
function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const Lives = {
  max: 5,
  regen: 20 * 60 * 1000,
  sync() {
    const d = Save.data;
    const now = Date.now();
    if (d.lives >= this.max) {
      d.livesAt = 0;
      return;
    }
    if (!d.livesAt) d.livesAt = now + this.regen;
    while (d.lives < this.max && now >= d.livesAt) {
      d.lives++;
      d.livesAt += this.regen;
    }
    if (d.lives >= this.max) d.livesAt = 0;
  },
  infinite() { return Save.data.infiniteUntil > Date.now(); },
  count() {
    this.sync();
    return Save.data.lives;
  },
  canPlay() { return this.infinite() || this.count() > 0; },
  nextIn() {
    this.sync();
    return Save.data.livesAt ? Save.data.livesAt - Date.now() : 0;
  },
  lose() {
    if (this.infinite()) return;
    this.sync();
    Save.data.lives = Math.max(0, Save.data.lives - 1);
    if (!Save.data.livesAt) Save.data.livesAt = Date.now() + this.regen;
    Save.write();
  },
  add(n) {
    this.sync();
    Save.data.lives = Math.min(this.max, Save.data.lives + n);
    if (Save.data.lives >= this.max) Save.data.livesAt = 0;
    Save.write();
  },
  refill() { this.add(this.max); },
  infinite1h() {
    Save.data.infiniteUntil = Math.max(Date.now(), Save.data.infiniteUntil || 0) + 3600 * 1000;
    Save.write();
  }
};

function paintRobotPreview(cv, skin) {
  const g = cv.getContext('2d');
  const s = cv.width;
  g.clearRect(0, 0, s, s);
  g.save();
  g.translate(s / 2, s / 2 + s * 0.04);
  g.scale(s / 44, s / 44);
  g.shadowColor = skin.glow;
  g.shadowBlur = 10;
  g.fillStyle = skin.body;
  roundRectPath(g, -12, -12, 24, 24, 6);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#061322';
  roundRectPath(g, -9, -7, 18, 9, 4);
  g.fill();
  g.fillStyle = skin.eye;
  g.fillRect(-3, -5, 6, 5);
  g.strokeStyle = skin.body;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -12);
  g.lineTo(0, -16);
  g.stroke();
  g.fillStyle = skin.glow;
  g.beginPath();
  g.arc(0, -17.5, 2.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = skin.legs;
  g.fillRect(-9, 12, 6, 2.5);
  g.fillRect(3, 12, 6, 2.5);
  g.restore();
}

const TILE = 40;
const COLS = 20;
const ROWS = 15;
const VIEW_W = COLS * TILE;
const VIEW_H = ROWS * TILE;
const FIXED_DT = 1 / 120;
const TAU = Math.PI * 2;

const PHYS = Object.freeze({
  GRAVITY: 950,
  MAX_SPEED: 820,
  SAFE_IMPACT: 625,
  BRAKE_MULT: 1.8,
  AIR_DRAG: 0.15,
  FRICTION: 7,
  BOUNCE_MIN: 170,
  RESTITUTION: 0.28,
  IMPACT_MIN: 70
});

const ROBOT_SIZE = 24;
const COLLAPSE_MAX = VIEW_H / 2;
const COLLAPSE_DPS = 30;
const CRYSTAL_TIME = 5;
const MAX_MULT = 5;
const ECHO_RATE = 0.05;

const STATE = Object.freeze({
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  LEVEL_CLEAR: 'LEVEL_CLEAR',
  GAMEOVER: 'GAMEOVER',
  VICTORY: 'VICTORY'
});

const DIRS = Object.freeze({
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
});
const GRAVITY_ANGLE = { down: 0, left: Math.PI / 2, up: Math.PI, right: -Math.PI / 2 };
const GRAVITY_CSS = { down: 0, left: 90, up: 180, right: -90 };

const COLORS = Object.freeze({
  line: '#2be4ff',
  core: '#4aa8ff',
  crystal: '#3dffa2',
  hazard: '#ff2e57',
  portal: '#b866ff',
  echo: '#cbb0ff',
  warn: '#ffb02e',
  ink: '#e6f1ff'
});
const FONT = '"Bahnschrift", "DIN Alternate", "Barlow Condensed", "Roboto Condensed", "Arial Narrow", sans-serif';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function circleRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
function angleDelta(target, current) {
  let d = (target - current) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
const hexCache = {};
function hexToRgb(hex) {
  if (!hexCache[hex]) {
    const n = parseInt(hex.slice(1), 16);
    hexCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return hexCache[hex];
}
function mixColor(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
}
function rgba(hex, alpha) {
  const c = hexToRgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function formatTime(s) { return `${s.toFixed(1)} s`; }
function pad(n, len = 6) { return String(Math.max(0, Math.floor(n))).padStart(len, '0'); }

const Store = {
  data: null,
  load() {
    Save.init('gravity-shift-eco-echo:v2', GS_DEFAULTS);
    I18N.init(GS_DICT, Save.data.lang);
    I18N.extend(KIT_DICT);
    I18N.apply();
    this.data = Save.data;
    const d = this.data;
    d.unlocked = clamp(Number(d.unlocked) || 1, 1, LEVELS.length);
    if (!d.echoes || typeof d.echoes !== 'object') d.echoes = {};
    if (!d.levels || typeof d.levels !== 'object') d.levels = {};
    if (!Array.isArray(d.skins)) d.skins = ['classic'];
  },
  save() { Save.write(); }
};

const Sound = {
  ctx: null,
  master: null,
  noiseBuf: null,
  muted: false,
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.ratio.value = 5;
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 0.6);
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      } catch (err) {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  },
  ready() { return this.ctx && !this.muted && !this.ducked && this.ctx.state === 'running'; },
  duck(on) {
    this.ducked = on;
    if (this.master) this.master.gain.setTargetAtTime(on || this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
  },
  tone({ freq = 440, to = 0, dur = 0.15, type = 'square', vol = 0.15, delay = 0 }) {
    if (!this.ready()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  },
  noise({ dur = 0.2, vol = 0.2, freq = 1200, to = 0, type = 'lowpass', q = 0.8, delay = 0 }) {
    if (!this.ready()) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  },
  shift(dir) {
    const base = { up: 620, down: 330, left: 440, right: 520 }[dir] || 440;
    this.tone({ freq: base, to: base * 1.7, dur: 0.09, type: 'square', vol: 0.09 });
    this.noise({ dur: 0.07, vol: 0.05, freq: 2600, type: 'highpass' });
  },
  thud(strength) {
    this.noise({ dur: 0.08 + strength * 0.14, vol: 0.08 + strength * 0.28, freq: 300 + strength * 900, to: 80 });
    if (strength > 0.4) this.tone({ freq: 140, to: 50, dur: 0.16, type: 'sine', vol: 0.25 * strength });
  },
  damage() {
    this.tone({ freq: 260, to: 60, dur: 0.3, type: 'sawtooth', vol: 0.22 });
    this.noise({ dur: 0.28, vol: 0.22, freq: 1600, to: 200 });
  },
  core() {
    [660, 880, 1320].forEach((f, i) => this.tone({ freq: f, dur: 0.13, type: 'triangle', vol: 0.16, delay: i * 0.065 }));
  },
  crystal() {
    this.tone({ freq: 1180, to: 2360, dur: 0.12, type: 'sine', vol: 0.16 });
    this.tone({ freq: 1770, to: 3000, dur: 0.2, type: 'triangle', vol: 0.09, delay: 0.05 });
  },
  portal() {
    [392, 523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.11, delay: i * 0.08 }));
  },
  brake() {
    this.tone({ freq: 900, to: 1500, dur: 0.12, type: 'square', vol: 0.08 });
    this.tone({ freq: 1500, dur: 0.12, type: 'triangle', vol: 0.08, delay: 0.08 });
  },
  warn() {
    this.tone({ freq: 700, to: 1200, dur: 0.18, type: 'sawtooth', vol: 0.06 });
  },
  pulse(intensity) {
    this.tone({ freq: 70 + intensity * 30, to: 40, dur: 0.18, type: 'sine', vol: 0.18 + intensity * 0.12 });
  },
  exit() {
    this.tone({ freq: 300, to: 1800, dur: 0.6, type: 'triangle', vol: 0.12 });
    this.noise({ dur: 0.6, vol: 0.06, freq: 600, to: 6000, type: 'bandpass', q: 2 });
  },
  win() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, dur: 0.28, type: 'square', vol: 0.08, delay: i * 0.1 }));
  },
  death() {
    this.tone({ freq: 400, to: 40, dur: 0.9, type: 'sawtooth', vol: 0.2 });
    this.noise({ dur: 0.9, vol: 0.32, freq: 2400, to: 90 });
  },
  click() {
    this.tone({ freq: 880, dur: 0.05, type: 'square', vol: 0.05 });
  }
};

class Particles {
  constructor(limit = 900) {
    this.list = [];
    this.limit = limit;
  }
  emit(x, y, o = {}) {
    if (this.list.length >= this.limit) this.list.splice(0, this.list.length - this.limit + 1);
    const ang = o.angle !== undefined ? o.angle + rand(-(o.spread || Math.PI), o.spread || Math.PI) : rand(0, TAU);
    const spd = rand(o.speedMin !== undefined ? o.speedMin : 40, o.speed !== undefined ? o.speed : 200);
    const life = rand((o.life || 0.6) * 0.6, o.life || 0.6);
    this.list.push({
      x, y,
      vx: Math.cos(ang) * spd + (o.vx || 0),
      vy: Math.sin(ang) * spd + (o.vy || 0),
      life, max: life,
      size: rand((o.size || 3) * 0.5, o.size || 3),
      color: o.color || COLORS.line,
      drag: o.drag !== undefined ? o.drag : 3,
      gx: o.gx || 0,
      gy: o.gy || 0,
      shape: o.shape || 'square'
    });
  }
  burst(x, y, count, o) {
    for (let i = 0; i < count; i++) this.emit(x, y, o);
  }
  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx = p.vx * d + p.gx * dt;
      p.vy = p.vy * d + p.gy * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const a = p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + a * 0.6);
      if (p.shape === 'line') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = s * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.restore();
  }
  clear() { this.list.length = 0; }
}

class FloatTexts {
  constructor() { this.list = []; }
  add(x, y, text, color = COLORS.ink, size = 16) {
    this.list.push({ x, y, text, color, size, life: 1.2, max: 1.2 });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.life -= dt;
      t.y -= 28 * dt;
      if (t.life <= 0) this.list.splice(i, 1);
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.list) {
      const a = clamp(t.life / t.max * 1.6, 0, 1);
      const pop = 1 + Math.max(0, t.life - t.max + 0.15) * 3;
      ctx.globalAlpha = a;
      ctx.font = `700 ${Math.round(t.size * pop)}px ${FONT}`;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = t.color;
      const x = clamp(t.x, 60, VIEW_W - 60);
      const y = clamp(t.y, 20, VIEW_H - 20);
      ctx.fillText(t.text, x, y);
    }
    ctx.restore();
  }
  clear() { this.list.length = 0; }
}

class Laser {
  constructor(orient, a, b, line, on, off, offset) {
    this.orient = orient;
    this.on = on;
    this.off = off;
    this.period = on + off;
    this.offset = offset;
    if (orient === 'h') {
      this.x0 = a * TILE;
      this.x1 = (b + 1) * TILE;
      this.y0 = this.y1 = line * TILE + TILE / 2;
      this.box = { x: this.x0, y: this.y0 - 5, w: this.x1 - this.x0, h: 10 };
    } else {
      this.y0 = a * TILE;
      this.y1 = (b + 1) * TILE;
      this.x0 = this.x1 = line * TILE + TILE / 2;
      this.box = { x: this.x0 - 5, y: this.y0, w: 10, h: this.y1 - this.y0 };
    }
  }
  phase(clock) {
    const p = (clock + this.offset) % this.period;
    return p < 0 ? p + this.period : p;
  }
  isOn(clock) { return this.phase(clock) < this.on; }
  isWarning(clock) { return this.phase(clock) >= this.period - 0.45; }
}

class Drone {
  constructor(cx, cy, axis, speed) {
    this.size = 26;
    this.x = cx - this.size / 2;
    this.y = cy - this.size / 2;
    this.axis = axis;
    this.speed = speed;
    this.dir = 1;
    this.spin = Math.random() * TAU;
  }
  get cx() { return this.x + this.size / 2; }
  get cy() { return this.y + this.size / 2; }
  get box() { return { x: this.x + 3, y: this.y + 3, w: this.size - 6, h: this.size - 6 }; }
  update(dt, level) {
    const step = this.speed * this.dir * dt;
    if (this.axis === 'h') {
      this.x += step;
      const hit = level.firstSolid(this.x, this.y, this.size, this.size);
      if (hit) {
        this.x = this.dir > 0 ? hit.c * TILE - this.size : (hit.c + 1) * TILE;
        this.dir *= -1;
      }
    } else {
      this.y += step;
      const hit = level.firstSolid(this.x, this.y, this.size, this.size);
      if (hit) {
        this.y = this.dir > 0 ? hit.r * TILE - this.size : (hit.r + 1) * TILE;
        this.dir *= -1;
      }
    }
    this.spin += dt * 7 * this.dir;
  }
}

class Robot {
  constructor(cx, cy) {
    this.w = ROBOT_SIZE;
    this.h = ROBOT_SIZE;
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.angle = 0;
    this.squash = 0;
    this.invuln = 0;
    this.peak = 0;
    this.braked = false;
    this.warned = false;
    this.trail = [];
    this.scale = 1;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get speed() { return Math.max(Math.abs(this.vx), Math.abs(this.vy)); }
}

const LEVELS = [{"diff": 1,"droneSpeed": 90,"laserOn": 1.3,"laserOff": 2.0,"impactScale": 0.6,"map": ["####################","#P................*#","#......##..X#......#","##.....#....#.....##","##.........*......##","##....########....##","#.C...#..##..#.....#","####..#......#..####","###...#......#...###","#....##......##....#","#.....|.....H......#","#..C.#|.......#....#","##..##|.......##..##","##....|...C....E..##","####################"],"sol": "R D L D R D L D R","time": 100,"par": 20,"intro": ["introL1a","introL1b"],"introTouch": ["introL1aTouch","introL1b"],"name": {"es": "Despertar","en": "Awakening"}},{"diff": 1,"droneSpeed": 90,"laserOn": 1.3,"laserOff": 2.0,"impactScale": 0.6,"map": ["####################","#.P.......*.......*#","#..................#","#......######......#","#####..#....#..#####","#.............C....#","#........##........#","#...###X.##.####...#","#..................#","#E.....C..........C#","##....###..###....##","##.....##--##.....##","#.......#..#.......#","#..................#","####################"],"sol": "R D L U R D L","time": 81,"par": 16,"name": {"es": "Rebote","en": "Rebound"}},{"diff": 1,"droneSpeed": 90,"laserOn": 1.3,"laserOff": 2.0,"impactScale": 0.6,"map": ["####################","#.P..............*.#","#..................#","#...#..#####X--#...#","#..##..........##..#","#.......####.......#","###..............###","#..C........C......#","#..###........###..#","#..###........###..#","#....#........#....#","#......E.......C...#","##................##","##*...............##","####################"],"sol": "R U L D L R D L","time": 84,"par": 18,"name": {"es": "Cascada","en": "Cascade"}},{"diff": 1,"droneSpeed": 90,"laserOn": 1.3,"laserOff": 2.0,"impactScale": 0.6,"map": ["####################","#.P............*...#","#.....#X....X#.....#","#..................#","#....#........#....#","###..#........#--###","#...##........##...#","#..C###.#..#.###...#","#.......#..#.......#","#..................#","#.......C..........#","#.##..##....##..##C#","#*..####....####...#","#.............E....#","####################"],"sol": "R D L D R D L","time": 81,"par": 16,"name": {"es": "Pulso","en": "Pulse"}},{"diff": 1,"droneSpeed": 90,"laserOn": 1.3,"laserOff": 2.0,"impactScale": 0.6,"map": ["####################","#P.........*.......#","#..................#","#...####....####...#","###....#....#....###","#....####--####.C..#","#...C...#..#.......#","#..#....####....#..#","#..#............#..#","#E.......C.........#","#..#####....####X..#","#....#........#....#","#.##....#..#....##.#","#..#....#..#....#.*#","####################"],"sol": "R D L U R D L R U L D L","time": 96,"par": 24,"name": {"es": "Deriva","en": "Drift"}},{"diff": 1,"droneSpeed": 90,"laserOn": 1.3,"laserOff": 2.0,"impactScale": 0.6,"map": ["####################","#P................*#","#......##--X#......#","##.....#....#.....##","##.........*......##","##....########....##","#.C...#..##..#.....#","####..#......#..####","###...#......#...###","#....##......##....#","#..................#","#..C.#........#....#","##..##........##..##","##........C....E..##","####################"],"sol": "R D L D R D L D R","time": 87,"par": 20,"name": {"es": "Prisma","en": "Prism"}},{"diff": 1,"droneSpeed": 90,"laserOn": 1.3,"laserOff": 2.0,"impactScale": 0.6,"map": ["####################","#.P........*.......#","#......##--##......#","#####...#..#...#####","######........######","##.....*.......C..##","#.....#......#.....#","#.....#......#.....#","#.....#......X....C#","#..C..........E....#","#####.###..###.#####","#..####......####..#","#####..........#####","#..................#","####################"],"sol": "R D L D R U L U R D L","time": 93,"par": 22,"name": {"es": "Umbral","en": "Threshold"}},{"diff": 1,"droneSpeed": 90,"laserOn": 1.3,"laserOff": 2.0,"impactScale": 0.6,"map": ["####################","#...........*......#","#.P.###########X...#","#..................#","#........##........#","#...#..........#...#","#...##........##...#","#.#......C......C#.#","#.#..............#.#","#.#...##....##...#.#","#.###........*.###.#","#.................E#","#......##--##......#","#..C...#X..X#......#","####################"],"sol": "R D R D L R U L U R D L D R U","time": 105,"par": 28,"name": {"es": "Eclipse","en": "Eclipse"}},{"diff": 1,"droneSpeed": 90,"laserOn": 1.3,"laserOff": 2.0,"impactScale": 0.6,"map": ["####################","#.......C......C...#","#P###.########.###.#","#....#........#|...#","#....#........#|...#","#...##........##...#","#....#........#....#","###...#.X##X.#...###","###...#......#...###","#.*...#......#E....#","#.#####......#####.#","#..................#","#...##........##...#","#..*.#........#C...#","####################"],"sol": "R D R U L U L U R D L D R D L R U L","time": 114,"par": 33,"name": {"es": "Vórtice","en": "Vortex"}},{"diff": 1,"droneSpeed": 90,"laserOn": 1.3,"laserOff": 2.0,"impactScale": 0.6,"map": ["####################","#...........*......#","#.P.##........##...#","#..................#","#..................#","#...#..........#.C.#","###.#..........#.###","###.#..........#.###","#.....#--##..#.....#","#...C.#..##..#C....#","#..##.#..XX..#.##..#","#..#####....#####.E#","#..................#","#.......*..........#","####################"],"sol": "R D R L U R U R D L D L R D","time": 102,"par": 27,"name": {"es": "Ascenso","en": "Ascent"}},{"diff": 2,"droneSpeed": 120,"laserOn": 1.4,"laserOff": 1.6,"impactScale": 0.8,"map": ["####################","#.......C.|.......C#","#...P.....|........#","#.........|...H....#","#......######......#","#*...X.#.##.#.X....#","#....#.######.#....#","###....#X##X#*...###","###.#C.........#.###","###.#.....H....#.###","#...#....*.....#...#","#.#####.####.#####.#","#....##########----#","#.E.............C..#","####################"],"sol": "U R D L D L D L U L D L D R L","time": 105,"par": 28,"intro": ["introL2"],"name": {"es": "Corriente","en": "Undertow"}},{"diff": 2,"droneSpeed": 120,"laserOn": 1.4,"laserOff": 1.6,"impactScale": 0.8,"map": ["####################","#..P...........*...#","#...#.#X#--###.#...#","#.##X.....H....###.#","#.##............#X.#","#........C.........#","#.......####.......#","#...#...#..#...#..C#","#.C.#...#..#...#...#","##..#####..#####..##","###.......*......###","#....###....###....#","#....##########....#","#....*.X....XE....C#","####################"],"sol": "L D R U L R D L D R L","time": 93,"par": 22,"name": {"es": "Espiral","en": "Spiral"}},{"diff": 2,"droneSpeed": 120,"laserOn": 1.4,"laserOff": 1.6,"impactScale": 0.8,"map": ["####################","#..........*......*#","#..P..#...H..#.....#","##....#......#....##","##....#......#....##","#....####..####....#","#...C..........C...#","#..................#","#........##.C......#","#.####*..XX...####.#","#.....#.#--#.#.....#","#.....#.##X#.#.....#","#..................#","#E.....C...........#","####################"],"sol": "L U R D R U R U L D L U D R U R U L D R D L","time": 126,"par": 39,"name": {"es": "Marea","en": "Tide"}},{"diff": 2,"droneSpeed": 120,"laserOn": 1.4,"laserOff": 1.6,"impactScale": 0.8,"map": ["####################","#....C.............#","#P####...##...####.#","#..........*.......#","#....##--XX..X#....#","##...#X######X#..C##","##..*..#.##.#.....##","##..#....##....#..##","#..####...H..####..#","#*.####......####..#","#......C...........#","#.##............##.#","#.##............##.#","#.........C....E...#","####################"],"sol": "U R D L D R U R D L D R D L D R","time": 108,"par": 30,"name": {"es": "Fractal","en": "Fractal"}},{"diff": 2,"droneSpeed": 120,"laserOn": 1.4,"laserOff": 1.6,"impactScale": 0.8,"map": ["####################","#.P.........*......#","#...#####--#####..*#","##.......##.......##","##..###......###..##","##....########....##","##................##","#....C###..###.C...#","#......######......#","#......X.XX.#.....C#","#C##.........E..##.#","#...###......###*..#","######........######","#.........H........#","####################"],"sol": "L D U R D R U R U L D L","time": 102,"par": 27,"name": {"es": "Relámpago","en": "Lightning"}},{"diff": 2,"droneSpeed": 120,"laserOn": 1.4,"laserOff": 1.6,"impactScale": 0.8,"map": ["####################","#......C...........#","#.#P...........*.#.#","#.#...X....*.X...#.#","#.#...#...H..#...#.#","#....*#--##..#.....#","#.....#..##..#C....#","#..#.....##     #..#","#      C       ######","#..#...##..##...#..#","#       ####.C     #","#..###  E     ###  #","#     ###  ###     #","#      X    X      #","####################"],"sol": "L D R U L U R D L U L D L D R D U L D L D R","time": 126,"par": 39,"name": {"es": "Laberinto","en": "Labyrinth"}},{"diff": 2,"droneSpeed": 120,"laserOn": 1.4,"laserOff": 1.6,"impactScale": 0.8,"map": ["####################","#.........*.......*#","#..P...##--#X...H..#","#..................#","#..######..######..#","#C...#X......X#....#","#............C.....#","#.....#.#..#.#.....#","##....##X..X##....##","##...####..####.*.##","##..###......###..##","#.C.###......###...#","#..................#","#............E....C#","####################"],"sol": "L D R D L D L U R U L D R U L R D L D R D R L","time": 129,"par": 40,"name": {"es": "Órbita","en": "Orbit"}},{"diff": 2,"droneSpeed": 120,"laserOn": 1.4,"laserOff": 1.6,"impactScale": 0.8,"map": ["####################","#..........C.......#","#.P#####....#####..#","#......#....#......#","#     *#    #    *.#","#     ##    ##     #","###    ##X###    ###","#C      ####       #","#   ###    C.###   #","##     #    #  H  ##","##   ####--####   ##","##                X#","##*               ##","##     C        E.##","####################"],"sol": "U R D L D L D L U L D R D R","time": 102,"par": 27,"name": {"es": "Cénit","en": "Zenith"}},{"diff": 2,"droneSpeed": 120,"laserOn": 1.4,"laserOff": 1.6,"impactScale": 0.8,"map": ["####################","#.P     C      C   #","#   ##        ##   #","#.####    H   ####.#","#.####        ####.#","#   ##        ##   #","##--##        ##  ##","###.#*########.#.X##","*..#          #.*.#","#   #    ##.C  #   #","       ####        #","#    ##      ##    #","#  #X####  ####X#  #","#.C               E#","####################"],"sol": "U R D L D R L U L U D L U L D L D R","time": 114,"par": 33,"name": {"es": "Ruptura","en": "Rupture"}},{"diff": 2,"droneSpeed": 120,"laserOn": 1.4,"laserOff": 1.6,"impactScale": 0.8,"map": ["####################","#      C           #","#.P   ##    ##     #","#   ##X######X##   #","#      ######  C   #","##.#    X--X    #.##","####    #  #    ####","*      ####  *     #","   ###C   *.###  C#","   #####  #####    #","#                  #","#                  #","#   ###  ##  ###   #","#.E                #","####################"],"sol": "U L D R D R D U L U L U R D L D L D U R D R D L","time": 132,"par": 42,"name": {"es": "Abismo","en": "Abyss"}},{"diff": 3,"droneSpeed": 145,"laserOn": 1.5,"laserOff": 1.3,"impactScale": 1.0,"map": ["####################","#.P        C   |..C#","#             H|   #","#  #  ###  ### .|#  #","#.##   #    #  |##.#","#C   ###XXXX###|   #","--#####*   #####  #","#     ##.##.##     #","##X   #  ##  #   X##","#  ##    X#  *.##.*#","#.V##  ##  ##  ##  #","#      C.##  V     #","#    #---##   #----#","#.E  #        #  C.#","####################"],"sol": "L D U R D L D R D L U L D L U L D R L D R","time": 120,"par": 38,"intro": ["introL3"],"name": {"es": "Singularidad","en": "Singularity"}},{"diff": 3,"droneSpeed": 145,"laserOn": 1.5,"laserOff": 1.3,"impactScale": 1.0,"map": ["####################","#        C         #","#.P#            #  #","#      ######.C    #","###    ##XXX#    ###","##      *   *    C##","#   #####--#####   #","    *#   H  #      #","C    ###--###  C   #",".######X..X######.#","#   ############   #","..##X######X##X..#","#                  #","    E             #","####################"],"sol": "R D L D L U R U L U R D L D R D L R D L","time": 120,"par": 36,"name": {"es": "Horizonte","en": "Horizon"}},{"diff": 3,"droneSpeed": 145,"laserOn": 1.5,"laserOff": 1.3,"impactScale": 1.0,"map": ["####################","#|.P               #","#|     ######      #","#|    *.####     C.#","####            ####","#   *   ####       #",".X#    C       #X.#","C##.##X#######.##.#","#      ######  C   #","    ####--####     #","..##     H    ##..#","   C###    ##X   *#","###              X##","#.X       E      X.#","####################"],"sol": "U R D L D R D R U L D R L D L U D R D R","time": 120,"par": 36,"name": {"es": "Entropía","en": "Entropy"}},{"diff": 3,"droneSpeed": 145,"laserOn": 1.5,"laserOff": 1.3,"impactScale": 1.0,"map": ["####################","#        C    C    #","#  P.#.#XX#X#.#    #","#    #    H   #    #","####            ####","#     *.#--#*      #","--##.#X####X#.##..#","*  ############   #",".#.##  ####  X#.#C#",".####        ####.#",".#    ###X##    #.#",".#   C     E    #.#",".#C  #      #   #","#     #   H  #     #","####################"],"sol": "U R D L D R D L U L U L D R L D L D U R D R","time": 126,"par": 39,"name": {"es": "Quásar","en": "Quasar"}},{"diff": 3,"droneSpeed": 145,"laserOn": 1.5,"laserOff": 1.3,"impactScale": 1.0,"map": ["####################","#               C  #","P.X###      ###X..#",".##   #.##.#*..##.#","#      #    #      #","..C.#.#    #.#     #","#    #X######X#   C#","#   ####.XX.####   #","###     *##      ###",".#    ######    #.#","*     ######E     #","--#   #####X   #..#","--#    #  #    XC.#","#  ..C.#..#    #..#","####################"],"sol": "R D R D R U L U L U L U R D L D R D L U L","time": 123,"par": 38,"name": {"es": "Nebulosa","en": "Nebula"}},{"diff": 3,"droneSpeed": 145,"laserOn": 1.5,"laserOff": 1.3,"impactScale": 1.0,"map": ["####################","#       C          #",".P.X##      ###    #","     #   H  #*     #","     #--##--#      #","    ##.####.##  C  #","##   ##.#  X.##   ##","##    ######XX    ##","##    #.C    *   ##","     #      #      #",".XX#    ##*   #X#.#","#   C  #    #    C.#","#  ###.##  ##.###  #","   H  #X..##.E     #","####################"],"sol": "L R D R U R U L D L D L U R U L U R D L D L D R D L","time": 135,"par": 45,"name": {"es": "Paradoja","en": "Paradox"}},{"diff": 3,"droneSpeed": 145,"laserOn": 1.5,"laserOff": 1.3,"impactScale": 1.0,"map": ["####################","#..P    *       *  #","#    #####X####    #",".###########X####.#","#   ##    C   ##   #","#   #.C        #   #","     #.###.#       #","    ##    |*##   C#","####     ##|    ####","#      ##--#X      #","E    ##    ##C     #","     ##    ##      #","#  ###.#    #.###  #","    C              #","####################"],"sol": "L D R D R U R U L U L D L D L D R D R U R U L U L R D R D R D L D L U D R D L U","time": 135,"par": 66,"name": {"es": "Supernova","en": "Supernova"}},{"diff": 3,"droneSpeed": 145,"laserOn": 1.5,"laserOff": 1.3,"impactScale": 1.0,"map": ["####################","#.P    C       C   #","#   #          #   #","..X##X#    ####X..#","..##  #    #  ##..#","..###     *  ###  #","##.##        V.##.##","##  #.C        #  ##","###     ####V    ###","#.#   #  XX  X   #C#","#.#  X#      ##  #.#","C    ##   *  ##    #","#  #   X#--##   #  #","--#  *##  ##   E.#","####################"],"sol": "R D L R D U R U L D L DDS L U L U R D L D L D R U D L","time": 132,"par": 42,"name": {"es": "Agujero de gusano","en": "Wormhole"}},{"diff": 3,"droneSpeed": 145,"laserOn": 1.5,"laserOff": 1.3,"impactScale": 1.0,"map": ["####################","#|        *        #","#|.PX     H    X.C.#","X..####    ####..X#","##   ###    ###   ##","##            C   ##",".C###X#    #X###  #","    #    H   #   C#","   ##        ##  C#",".##X####--####X##.#","    #C      *#    #","###     ##X#     ###","####  #.#  #.#  ####",".#E  #      #  *#.#","####################"],"sol": "L R D R U L U D R D L D L U L D L U L D L U L U R L D R D L","time": 135,"par": 51,"name": {"es": "Colapso","en": "Collapse"}},{"diff": 3,"droneSpeed": 145,"laserOn": 1.5,"laserOff": 1.3,"impactScale": 1.0,"map": ["####################","#|.P               #","#|  ###.####.###   #","X#   #    C.#   #X#","..#  #      #  #--#","C##  #X    X#C.#X.#","     #      #      #","        ##         #","    ###.##*###     #","      ######    C.#","##.E     C        ##","X.####      ####.X#","##  H  #    #  H  ##","##    *#    #*     #","####################"],"sol": "R D L U D R D L U R D R U R U R D L D L D R D L D L","time": 135,"par": 45,"name": {"es": "Eco final","en": "Final Echo"}}];

class Level {
  constructor(def, index) {
    this.def = def;
    this.index = index;
    this.grid = [];
    this.cores = [];
    this.crystals = [];
    this.lasers = [];
    this.drones = [];
    this.start = { x: TILE * 1.5, y: TILE * 1.5 };
    this.exit = { x: VIEW_W - TILE * 1.5, y: VIEW_H - TILE * 1.5 };

    const raw = [];
    for (let r = 0; r < ROWS; r++) {
      const line = def.map[r] || '';
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const border = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
        row.push(border ? '#' : (line[c] || '.'));
      }
      raw.push(row);
    }

    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const ch = raw[r][c];
        const cx = c * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2;
        let tile = '.';
        switch (ch) {
          case '#': tile = '#'; break;
          case 'X': tile = 'X'; break;
          case 'P': this.start = { x: cx, y: cy }; break;
          case 'E': this.exit = { x: cx, y: cy }; break;
          case 'C': this.cores.push({ x: cx, y: cy, taken: false, seed: rand(0, TAU) }); break;
          case '*': this.crystals.push({ x: cx, y: cy, taken: false, seed: rand(0, TAU) }); break;
          case 'H': this.drones.push(new Drone(cx, cy, 'h', def.droneSpeed)); break;
          case 'V': this.drones.push(new Drone(cx, cy, 'v', def.droneSpeed)); break;
          default: break;
        }
        row.push(tile);
      }
      this.grid.push(row);
    }
    this.buildLasers(raw);
  }

  buildLasers(raw) {
    const { laserOn, laserOff } = this.def;
    const period = laserOn + laserOff;
    let n = 0;
    const add = (orient, a, b, line) => {
      const offset = (n * period * 0.41) % period;
      n++;
      this.lasers.push(new Laser(orient, a, b, line, laserOn, laserOff, offset));
    };
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        if (raw[r][c] === '-') {
          const c0 = c;
          while (c < COLS && raw[r][c] === '-') c++;
          add('h', c0, c - 1, r);
        } else c++;
      }
    }
    for (let c = 0; c < COLS; c++) {
      let r = 0;
      while (r < ROWS) {
        if (raw[r][c] === '|') {
          const r0 = r;
          while (r < ROWS && raw[r][c] === '|') r++;
          add('v', r0, r - 1, c);
        } else r++;
      }
    }
  }

  tileAt(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return '#';
    return this.grid[r][c];
  }
  solidAt(c, r) {
    const t = this.tileAt(c, r);
    return t === '#' || t === 'X';
  }
  firstSolid(x, y, w, h) {
    const c0 = Math.floor(x / TILE), c1 = Math.floor((x + w - 0.001) / TILE);
    const r0 = Math.floor(y / TILE), r1 = Math.floor((y + h - 0.001) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.solidAt(c, r)) return { c, r, tile: this.tileAt(c, r) };
      }
    }
    return null;
  }
  hazardContact(body) {
    const m = 1.5;
    const c0 = Math.floor((body.x - m) / TILE), c1 = Math.floor((body.x + body.w + m) / TILE);
    const r0 = Math.floor((body.y - m) / TILE), r1 = Math.floor((body.y + body.h + m) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.tileAt(c, r) !== 'X') continue;
        const tx = c * TILE, ty = r * TILE;
        const ox = Math.min(body.x + body.w, tx + TILE) - Math.max(body.x, tx);
        const oy = Math.min(body.y + body.h, ty + TILE) - Math.max(body.y, ty);
        if (ox <= 0.5 && oy <= 0.5) continue;
        const dx = body.x + body.w / 2 - (tx + TILE / 2);
        const dy = body.y + body.h / 2 - (ty + TILE / 2);
        if (Math.abs(dx) > Math.abs(dy)) return { nx: Math.sign(dx) || 1, ny: 0, x: tx + TILE / 2, y: ty + TILE / 2 };
        return { nx: 0, ny: Math.sign(dy) || 1, x: tx + TILE / 2, y: ty + TILE / 2 };
      }
    }
    return null;
  }
}

const Physics = {
  step(body, level, gravity, dt, events) {
    const g = DIRS[gravity];
    let ax = g.x * PHYS.GRAVITY;
    let ay = g.y * PHYS.GRAVITY;
    if (g.x !== 0 && body.vx * g.x < 0) ax *= PHYS.BRAKE_MULT;
    if (g.y !== 0 && body.vy * g.y < 0) ay *= PHYS.BRAKE_MULT;
    body.vx += ax * dt;
    body.vy += ay * dt;

    const drag = Math.exp(-PHYS.AIR_DRAG * dt);
    body.vx *= drag;
    body.vy *= drag;

    body.grounded = !!level.firstSolid(body.x + g.x * 0.5, body.y + g.y * 0.5, body.w, body.h);
    if (body.grounded) {
      const f = Math.exp(-PHYS.FRICTION * dt);
      if (g.x !== 0) {
        body.vy *= f;
        if (Math.abs(body.vy) < 3) body.vy = 0;
      } else {
        body.vx *= f;
        if (Math.abs(body.vx) < 3) body.vx = 0;
      }
    }

    body.vx = clamp(body.vx, -PHYS.MAX_SPEED, PHYS.MAX_SPEED);
    body.vy = clamp(body.vy, -PHYS.MAX_SPEED, PHYS.MAX_SPEED);

    const dist = Math.max(Math.abs(body.vx), Math.abs(body.vy)) * dt;
    const steps = Math.max(1, Math.ceil(dist / 4));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(body, level, 'x', body.vx * sub, events);
      this.moveAxis(body, level, 'y', body.vy * sub, events);
    }
  },
  moveAxis(body, level, axis, delta, events) {
    if (delta === 0) return;
    if (axis === 'x') body.x += delta; else body.y += delta;
    const hit = level.firstSolid(body.x, body.y, body.w, body.h);
    if (!hit) return;
    let impact, nx = 0, ny = 0;
    if (axis === 'x') {
      if (delta > 0) { body.x = hit.c * TILE - body.w; nx = -1; }
      else { body.x = (hit.c + 1) * TILE; nx = 1; }
      impact = Math.abs(body.vx);
      body.vx = impact > PHYS.BOUNCE_MIN ? -body.vx * PHYS.RESTITUTION : 0;
    } else {
      if (delta > 0) { body.y = hit.r * TILE - body.h; ny = -1; }
      else { body.y = (hit.r + 1) * TILE; ny = 1; }
      impact = Math.abs(body.vy);
      body.vy = impact > PHYS.BOUNCE_MIN ? -body.vy * PHYS.RESTITUTION : 0;
    }
    if (events && impact >= PHYS.IMPACT_MIN) events.push({ impact, nx, ny, tile: hit.tile });
  }
};

class Game {
  constructor() {
    this.state = STATE.MENU;
    this.demo = true;
    this.levelIndex = 0;
    this.level = null;
    this.robot = null;
    this.gravity = 'down';
    this.score = 0;
    this.mult = 1;
    this.integrity = 100;
    this.snapshot = null;
    this.elapsed = 0;
    this.playTime = 0;
    this.laserClock = 0;
    this.time = 0;
    this.acc = 0;
    this.intro = 0;
    this.dying = 0;
    this.exiting = 0;
    this.exitFrom = null;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = COLORS.hazard;
    this.collapsePulse = 0;
    this.portalOpen = false;
    this.coresTaken = 0;
    this.events = [];
    this.fx = new Particles();
    this.texts = new FloatTexts();
    this.recording = [];
    this.recordAcc = 0;
    this.trailAcc = 0;
    this.echo = null;
    this.beatTimer = 0;
    this.lastCause = 'impact';
    this.inCollapse = false;
    this.demoTimer = 0;
    this.runStats = { time: 0, hits: 0, brakes: 0 };
    this.levelStats = { hits: 0, brakes: 0, shifts: 0 };
    this.hintsShown = new Set();
    this.hintQueue = [];
    this.hintTimer = 0;
    this.currentHint = null;
    this.damaged = false;
    this.revived = false;
    this.pendingLife = false;
    this.guide = null;
    this.busy = false;
  }

  init() {
    Store.load();
    Sound.muted = !Save.data.sound;
    Haptics.enabled = !!Save.data.vibration;
    this.renderer = new Renderer(document.getElementById('game'));
    this.ui = new UI(this);
    Input.init(this);
    Platform.init().then(() => Platform.loadingFinished());
    Hub.init('gravity').then(() => this.syncCloud());
    Banner.show();
    AccountChip.show();
    window.addEventListener('resize', () => this.layout());
    this.layout();
    this.startDemo();
    this.ui.showScreen('menu');
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      this.update(dt);
      this.renderer.draw(this, dt);
      this.ui.updateHud();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  layout() {
    const app = document.getElementById('app');
    const hud = document.getElementById('hud');
    const stage = document.getElementById('stage');
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const side = vh < 600 && vw > vh * 1.25;
    app.classList.toggle('side', side);
    let w, h;
    if (side) {
      const hudW = 150;
      const scale = Math.min(1.4, (vw - hudW - 30) / VIEW_W, (vh - 16) / VIEW_H);
      w = Math.floor(VIEW_W * scale);
      h = Math.floor(VIEW_H * scale);
      app.classList.remove('narrow');
      hud.style.width = `${hudW}px`;
      hud.style.height = `${h}px`;
    } else {
      hud.style.height = '';
      const fit = () => {
        const hudH = hud.offsetHeight + 10;
        const scale = Math.min(1.4, Math.max(240, vw - 16) / VIEW_W, Math.max(180, vh - hudH - 20) / VIEW_H);
        w = Math.floor(VIEW_W * scale);
        h = Math.floor(VIEW_H * scale);
        app.classList.toggle('narrow', w < 760);
        hud.style.width = `${w}px`;
      };
      fit();
      fit();
    }
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    stage.classList.toggle('compact', h < 470);
    stage.classList.toggle('tiny', h < 330);
    this.renderer.resize(w, h);
  }

  loadLevelData(index) {
    this.levelIndex = index;
    this.level = new Level(LEVELS[index], index);
    this.robot = new Robot(this.level.start.x, this.level.start.y);
    this.gravity = 'down';
    this.elapsed = 0;
    this.playTime = 0;
    this.laserClock = 0;
    this.acc = 0;
    this.coresTaken = 0;
    this.portalOpen = false;
    this.dying = 0;
    this.exiting = 0;
    this.collapsePulse = 0;
    this.inCollapse = false;
    this.beatTimer = 0;
    this.recording = [];
    this.recordAcc = 0;
    this.trailAcc = 0;
    this.fx.clear();
    this.texts.clear();
    this.renderer.setLevel(this.level);
    const echo = Store.data.echoes[index];
    this.echo = echo && Array.isArray(echo.frames) && echo.frames.length > 6 ? echo : null;
    this.levelStats = { hits: 0, brakes: 0, shifts: 0 };
  }

  startDemo() {
    this.demo = true;
    this.loadLevelData(0);
    this.demoTimer = 1.2;
  }

  startRun(index = 0) {
    Sound.unlock();
    if (!Lives.canPlay()) {
      this.ui.noLives();
      return;
    }
    this.score = 0;
    this.mult = 1;
    this.integrity = 100;
    this.runStats = { time: 0, hits: 0, brakes: 0 };
    this.beginLevel(index);
  }

  beginLevel(index, keepGuide = false) {
    this.demo = false;
    this.score = 0;
    this.mult = 1;
    this.integrity = 100;
    this.damaged = false;
    this.revived = false;
    this.pendingLife = false;
    if (!keepGuide || (this.guide && this.guide.level !== index)) this.guide = null;
    this.loadLevelData(index);
    this.snapshot = { score: 0, mult: 1, integrity: 100 };
    this.intro = 1.5;
    this.state = STATE.PLAYING;
    this.ui.showScreen(null);
    this.ui.showBanner(this.level);
    this.ui.hideHint();
    this.currentHint = null;
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const def = this.level.def;
    this.queueHints(((touch && def.introTouch) ? def.introTouch : (def.intro || [])).map((k) => t(k)), 1.6);
    Banner.hide();
    AccountChip.hide();
    Platform.gameplayStart();
  }

  restartLevel() {
    if (!this.level || this.demo) return;
    this.consumePendingLife();
    if (!Lives.canPlay()) {
      this.goToMenu();
      this.ui.noLives();
      return;
    }
    this.beginLevel(this.levelIndex, true);
  }

  async withAd() {
    await Platform.commercialBreak(() => Sound.duck(true));
    Sound.duck(false);
  }

  async nextLevel() {
    if (this.state !== STATE.LEVEL_CLEAR || this.busy) return;
    if (!Lives.canPlay()) {
      this.ui.noLives();
      return;
    }
    this.busy = true;
    await this.withAd();
    this.busy = false;
    this.beginLevel(Math.min(LEVELS.length - 1, this.levelIndex + 1));
  }

  async replayLevel() {
    if (this.busy) return;
    if (!Lives.canPlay()) {
      this.ui.noLives();
      return;
    }
    this.busy = true;
    await this.withAd();
    this.busy = false;
    this.beginLevel(this.levelIndex, true);
  }

  goToMenu() {
    this.consumePendingLife();
    Platform.gameplayStop();
    Banner.show();
    AccountChip.show();
    this.state = STATE.MENU;
    this.ui.hideHint();
    this.currentHint = null;
    this.hintQueue = [];
    this.startDemo();
    this.ui.refreshMenu();
    this.ui.showScreen('menu');
  }

  onDirection(dir) {
    if (this.state !== STATE.PLAYING || this.dying > 0 || this.exiting > 0) return;
    if (this.intro > 0) this.intro = 0;
    if (dir === this.gravity) return;
    this.setGravity(dir);
  }

  setGravity(dir) {
    const R = this.robot;
    const g = DIRS[dir];
    const along = R.vx * g.x + R.vy * g.y;
    if (along < 0 && R.speed > PHYS.SAFE_IMPACT * 0.55) R.braked = true;
    this.gravity = dir;
    this.levelStats.shifts++;
    Sound.shift(dir);
    const ang = Math.atan2(-g.y, -g.x);
    for (let i = 0; i < 9; i++) {
      this.fx.emit(R.cx, R.cy, { angle: ang, spread: 0.55, speed: 170, speedMin: 60, life: 0.35, size: 3, color: COLORS.line, drag: 6 });
    }
  }

  togglePause() {
    if (this.state === STATE.PLAYING && this.dying <= 0 && this.exiting <= 0) {
      this.state = STATE.PAUSED;
      this.ui.setPauseInfo(this.level);
      this.ui.showScreen('pause');
      Platform.gameplayStop();
      Sound.click();
    } else if (this.state === STATE.PAUSED) {
      this.resume();
    }
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this.ui.showScreen(null);
    Platform.gameplayStart();
    Sound.click();
  }

  autoPause() {
    if (this.state === STATE.PLAYING && this.dying <= 0 && this.exiting <= 0) this.togglePause();
  }

  onRestartKey() {
    if (this.state === STATE.PLAYING && this.dying <= 0 && this.exiting <= 0) this.restartLevel(false);
    else if (this.state === STATE.GAMEOVER) this.restartLevel(true);
  }

  toggleSound() {
    Sound.unlock();
    Sound.setMuted(!Sound.muted);
    Save.data.sound = !Sound.muted;
    Store.save();
    this.ui.updateSoundButton();
  }

  collapseProgress() {
    if (!this.level || this.demo) return 0;
    return clamp(this.elapsed / this.level.def.time, 0, 1);
  }

  collapseDepth() {
    if (this.demo) return 16 + Math.sin(this.time * 0.8) * 6;
    const p = this.collapseProgress();
    return COLLAPSE_MAX * p * p;
  }

  update(dt) {
    if (this.state === STATE.PAUSED) return;
    this.time += dt;
    this.fx.update(dt);
    this.texts.update(dt);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.collapsePulse = Math.max(0, this.collapsePulse - dt * 1.4);
    this.updateHints(dt);
    if (this.state === STATE.MENU) this.updateDemo(dt);
    else if (this.state === STATE.PLAYING) this.updatePlaying(dt);
    this.updateRobotVisual(dt);
  }

  updateRobotVisual(dt) {
    const R = this.robot;
    if (!R) return;
    if (this.exiting <= 0) R.angle += angleDelta(GRAVITY_ANGLE[this.gravity], R.angle) * Math.min(1, dt * 14);
    R.squash *= Math.exp(-dt * 9);
  }

  updateDemo(dt) {
    const L = this.level;
    const R = this.robot;
    if (!L || !R) return;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < 10) {
      this.laserClock += FIXED_DT;
      for (const d of L.drones) d.update(FIXED_DT, L);
      this.events.length = 0;
      Physics.step(R, L, this.gravity, FIXED_DT, this.events);
      for (const ev of this.events) {
        const s = clamp(ev.impact / PHYS.MAX_SPEED, 0, 1);
        R.squash = Math.max(R.squash, s * 0.9);
        const px = ev.nx !== 0 ? (ev.nx > 0 ? R.x : R.x + R.w) : R.cx;
        const py = ev.ny !== 0 ? (ev.ny > 0 ? R.y : R.y + R.h) : R.cy;
        for (let i = 0; i < 2 + s * 10; i++) {
          this.fx.emit(px, py, { angle: Math.atan2(ev.ny, ev.nx), spread: 1.2, speed: 100 + s * 220, life: 0.4, size: 3, shape: 'line', color: COLORS.line, drag: 5 });
        }
      }
      this.recordTrail(R, FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps >= 10) this.acc = 0;
    this.demoTimer -= dt;
    const resting = R.grounded && Math.abs(R.vx) < 5 && Math.abs(R.vy) < 5;
    if (resting && this.demoTimer <= 0) {
      this.gravity = pick(Object.keys(DIRS).filter((d) => d !== this.gravity));
      this.demoTimer = rand(0.45, 1.05);
    }
  }

  updatePlaying(dt) {
    const L = this.level;
    if (this.portalOpen && Math.random() < 0.35) {
      const a = rand(0, TAU);
      this.fx.emit(L.exit.x + Math.cos(a) * 34, L.exit.y + Math.sin(a) * 34, {
        vx: -Math.cos(a) * 70, vy: -Math.sin(a) * 70, speed: 5, speedMin: 0, life: 0.5, size: 2.5, color: pick([COLORS.portal, COLORS.line]), drag: 0
      });
    }
    if (this.intro > 0) {
      this.intro -= dt;
      return;
    }
    if (this.dying > 0) {
      this.dying -= dt;
      if (this.dying <= 0) this.showGameOver();
      return;
    }
    if (this.exiting > 0) {
      this.updateExit(dt);
      return;
    }
    this.acc += dt;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < 10) {
      this.fixedStep(FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
      if (this.state !== STATE.PLAYING || this.dying > 0 || this.exiting > 0) {
        this.acc = 0;
        break;
      }
    }
    if (steps >= 10) this.acc = 0;
  }

  fixedStep(dt) {
    const L = this.level;
    const R = this.robot;
    this.playTime += dt;
    this.elapsed += dt;
    this.laserClock += dt;

    for (const d of L.drones) d.update(dt, L);

    this.events.length = 0;
    Physics.step(R, L, this.gravity, dt, this.events);

    const spd = R.speed;
    R.peak = Math.max(R.peak, spd);
    if (spd > PHYS.SAFE_IMPACT && !R.warned) {
      R.warned = true;
      Sound.warn();
      this.hintOnce('brake', t('hintBrake'));
    }
    for (const ev of this.events) this.handleImpact(ev);
    if (R.invuln > 0) R.invuln = Math.max(0, R.invuln - dt);

    const hz = L.hazardContact(R);
    if (hz) {
      const kx = hz.nx !== 0 ? hz.nx * 380 : R.vx;
      const ky = hz.ny !== 0 ? hz.ny * 380 : R.vy;
      this.hit(18, 'plasma', kx, ky, R.cx - hz.nx * 12, R.cy - hz.ny * 12);
    }
    for (const beam of L.lasers) {
      if (beam.isOn(this.laserClock) && rectsOverlap(R, beam.box)) {
        const kx = beam.orient === 'v' ? (Math.sign(R.cx - beam.x0) || 1) * 300 : R.vx;
        const ky = beam.orient === 'h' ? (Math.sign(R.cy - beam.y0) || 1) * 300 : R.vy;
        this.hit(22, 'laser', kx, ky, R.cx, R.cy);
      }
    }
    for (const d of L.drones) {
      if (rectsOverlap(R, d.box)) {
        const dx = R.cx - d.cx;
        const dy = R.cy - d.cy;
        const len = Math.hypot(dx, dy) || 1;
        this.hit(22, 'drone', (dx / len) * 420, (dy / len) * 420, d.cx, d.cy);
      }
    }
    if (this.dying > 0) return;

    for (const c of L.cores) if (!c.taken && circleRect(c.x, c.y, 15, R)) this.takeCore(c);
    for (const k of L.crystals) if (!k.taken && circleRect(k.x, k.y, 15, R)) this.takeCrystal(k);

    if (this.portalOpen && circleRect(L.exit.x, L.exit.y, 13, R)) {
      this.beginExit();
      return;
    }

    const depth = this.collapseDepth();
    const inside = R.x < depth || R.y < depth || R.x + R.w > VIEW_W - depth || R.y + R.h > VIEW_H - depth;
    if (inside) {
      this.damaged = true;
      this.integrity -= COLLAPSE_DPS * dt;
      this.mult = Math.max(1, this.mult - 0.6 * dt);
      this.lastCause = 'collapse';
      this.shake = Math.max(this.shake, 2.5);
      if (Math.random() < 0.5) {
        this.fx.emit(R.cx + rand(-12, 12), R.cy + rand(-12, 12), { speed: 90, life: 0.4, size: 3, color: pick([COLORS.hazard, '#ff00aa']) });
      }
      if (!this.inCollapse) {
        this.flash = Math.max(this.flash, 0.25);
        this.flashColor = COLORS.hazard;
        this.hintOnce('collapse', t('hintCollapse'));
      }
    }
    this.inCollapse = inside;
    if (this.elapsed >= L.def.time) {
      this.integrity = 0;
      this.lastCause = 'total';
    }
    if (!this.hintsShown.has('crystal') && this.collapseProgress() > 0.35 && L.crystals.some((k) => !k.taken)) {
      this.hintOnce('crystal', t('hintCrystal'));
    }

    const p = this.collapseProgress();
    if (p > 0.5) {
      this.beatTimer -= dt;
      if (this.beatTimer <= 0) {
        const k = (p - 0.5) * 2;
        Sound.pulse(k);
        this.beatTimer = lerp(0.9, 0.3, k);
      }
    }

    this.recordAcc += dt;
    while (this.recordAcc >= ECHO_RATE) {
      this.recording.push(Math.round(R.x), Math.round(R.y));
      this.recordAcc -= ECHO_RATE;
    }
    this.recordTrail(R, dt);

    if (this.integrity <= 0) {
      this.integrity = 0;
      this.die(this.lastCause);
    }
  }

  recordTrail(R, dt) {
    this.trailAcc += dt;
    if (this.trailAcc < 1 / 40) return;
    this.trailAcc = 0;
    if (R.speed > 200) R.trail.push({ x: R.x, y: R.y });
    else if (R.trail.length) R.trail.shift();
    if (R.trail.length > 10) R.trail.shift();
  }

  handleImpact(ev) {
    const R = this.robot;
    const strength = clamp(ev.impact / PHYS.MAX_SPEED, 0, 1);
    const px = ev.nx !== 0 ? (ev.nx > 0 ? R.x : R.x + R.w) : R.cx;
    const py = ev.ny !== 0 ? (ev.ny > 0 ? R.y : R.y + R.h) : R.cy;
    const danger = ev.impact > PHYS.SAFE_IMPACT;
    const ang = Math.atan2(ev.ny, ev.nx);
    const count = Math.round(3 + strength * 16);
    for (let i = 0; i < count; i++) {
      this.fx.emit(px, py, {
        angle: ang, spread: 1.25, speed: 120 + strength * 260, speedMin: 40, life: 0.45, size: 3, shape: 'line', drag: 5,
        color: danger ? pick([COLORS.hazard, COLORS.warn, '#ffffff', COLORS.line]) : pick([COLORS.line, '#bff8ff'])
      });
    }
    R.squash = Math.max(R.squash, strength * 0.9);
    Sound.thud(strength);
    if (danger) {
      const k = clamp((ev.impact - PHYS.SAFE_IMPACT) / (PHYS.MAX_SPEED - PHYS.SAFE_IMPACT), 0, 1);
      const dmg = Math.max(1, Math.round((6 + 16 * k) * this.level.def.impactScale));
      if (this.hit(dmg, 'impact', R.vx, R.vy, px, py)) this.texts.add(px, py - 22, t('impact'), COLORS.warn, 15);
      this.shake = Math.max(this.shake, 6 + 8 * strength);
    } else if (R.braked && R.peak > PHYS.SAFE_IMPACT + 30 && ev.impact > 110) {
      const pts = Math.round(60 * this.mult);
      this.score += pts;
      this.levelStats.brakes++;
      this.texts.add(R.cx, R.cy - 26, t('perfectBrake', { n: pts }), COLORS.crystal, 15);
      Sound.brake();
    } else if (strength > 0.35) {
      this.shake = Math.max(this.shake, 2 + 3 * strength);
    }
    R.peak = 0;
    R.braked = false;
    R.warned = false;
  }

  hit(amount, cause, kx, ky, sx, sy) {
    const R = this.robot;
    if (R.invuln > 0 || this.dying > 0) return false;
    this.integrity = Math.max(0, this.integrity - amount);
    R.invuln = 1;
    R.vx = clamp(kx, -PHYS.MAX_SPEED, PHYS.MAX_SPEED);
    R.vy = clamp(ky, -PHYS.MAX_SPEED, PHYS.MAX_SPEED);
    this.mult = Math.max(1, this.mult - 1);
    this.lastCause = cause;
    this.levelStats.hits++;
    this.damaged = true;
    Haptics.pulse([30, 20, 30]);
    this.flash = 0.45;
    this.flashColor = COLORS.hazard;
    this.shake = Math.max(this.shake, 9);
    Sound.damage();
    this.fx.burst(sx, sy, 18, { speed: 260, life: 0.55, size: 4, color: COLORS.hazard });
    this.texts.add(R.cx, R.cy - 20, `-${amount}%`, COLORS.hazard, 17);
    if (this.integrity <= 0) this.die(cause);
    return true;
  }

  takeCore(c) {
    const L = this.level;
    c.taken = true;
    this.coresTaken++;
    const pts = Math.round(250 * this.mult);
    this.score += pts;
    this.mult = Math.min(MAX_MULT, this.mult + 0.25);
    for (let i = 0; i < 28; i++) {
      this.fx.emit(c.x, c.y, { speed: 250, life: 0.7, size: 4, color: pick([COLORS.core, '#bfe4ff', COLORS.line]) });
    }
    this.texts.add(c.x, c.y - 16, `+${pts}`, COLORS.core, 17);
    Sound.core();
    Haptics.pulse(12);
    if (this.coresTaken >= L.cores.length) {
      this.portalOpen = true;
      Sound.portal();
      this.flash = 0.3;
      this.flashColor = COLORS.portal;
      this.texts.add(L.exit.x, L.exit.y - 30, t('portalOpen'), COLORS.portal, 18);
      this.fx.burst(L.exit.x, L.exit.y, 40, { speed: 300, life: 0.9, size: 4, color: COLORS.portal });
      this.hintOnce('portal', t('hintPortal'));
    } else if (this.coresTaken === 1) {
      this.hintOnce('cores', t('hintCores'));
    }
  }

  takeCrystal(k) {
    k.taken = true;
    const pts = Math.round(100 * this.mult);
    this.score += pts;
    this.mult = Math.min(MAX_MULT, this.mult + 0.5);
    this.elapsed = Math.max(0, this.elapsed - CRYSTAL_TIME);
    this.collapsePulse = 1;
    for (let i = 0; i < 24; i++) {
      this.fx.emit(k.x, k.y, { speed: 220, life: 0.7, size: 4, color: pick([COLORS.crystal, '#d6ffe9']) });
    }
    this.texts.add(k.x, k.y - 18, t('collapseBack', { n: CRYSTAL_TIME }), COLORS.crystal, 16);
    this.texts.add(k.x, k.y + 4, `x${this.mult.toFixed(1)}`, COLORS.crystal, 13);
    Sound.crystal();
  }

  beginExit() {
    this.exiting = 0.9;
    this.exitFrom = { x: this.robot.x, y: this.robot.y };
    this.robot.vx = 0;
    this.robot.vy = 0;
    this.robot.trail.length = 0;
    Sound.exit();
    this.flash = 0.35;
    this.flashColor = COLORS.portal;
  }

  updateExit(dt) {
    const L = this.level;
    const R = this.robot;
    this.exiting -= dt;
    const k = 1 - clamp(this.exiting / 0.9, 0, 1);
    const m = Math.min(1, k * 2.2);
    R.x = lerp(this.exitFrom.x, L.exit.x - R.w / 2, m);
    R.y = lerp(this.exitFrom.y, L.exit.y - R.h / 2, m);
    R.scale = Math.max(0, 1 - k);
    R.angle += dt * 16;
    if (Math.random() < 0.7) {
      this.fx.emit(L.exit.x, L.exit.y, { speed: 170, life: 0.5, size: 3, color: pick([COLORS.portal, COLORS.line, '#ffffff']) });
    }
    if (this.exiting <= 0) this.completeLevel();
  }

  completeLevel() {
    const L = this.level;
    const idx = this.levelIndex;
    const remaining = Math.max(0, L.def.time - this.elapsed);
    const timeBonus = Math.round(remaining * 20 * this.mult);
    const integrityBonus = Math.round(this.integrity * 5);
    this.score += timeBonus + integrityBonus;
    const noDamage = !this.damaged;
    const underPar = this.playTime <= L.def.par;
    const stars = 1 + (noDamage ? 1 : 0) + (underPar ? 1 : 0);
    const d = Save.data;
    const prevLv = d.levels[idx] || { stars: 0, score: 0, time: 0 };
    const firstThree = stars === 3 && prevLv.stars < 3;
    d.levels[idx] = {
      stars: Math.max(prevLv.stars || 0, stars),
      score: Math.max(prevLv.score || 0, Math.floor(this.score)),
      time: prevLv.time ? Math.min(prevLv.time, Math.round(this.playTime * 100) / 100) : Math.round(this.playTime * 100) / 100
    };
    const prev = d.echoes[idx];
    const newEcho = !prev || this.playTime < prev.time;
    if (newEcho) {
      this.recording.push(Math.round(L.exit.x - ROBOT_SIZE / 2), Math.round(L.exit.y - ROBOT_SIZE / 2));
      d.echoes[idx] = { time: Math.round(this.playTime * 100) / 100, frames: this.recording.slice() };
    }
    d.unlocked = Math.max(d.unlocked, Math.min(LEVELS.length, idx + 2));
    d.highScore = totalScore();
    Store.save();
    this.robot.scale = 0;
    this.ui.hideHint();
    this.currentHint = null;
    this.hintQueue = [];
    Sound.win();
    Platform.gameplayStop();
    if (stars === 3) Platform.happyTime();
    if (firstThree) Hub.earn('level3', 'gravity').then((g) => { if (g) this.ui.gemToast(g); });
    Hub.submitScore('stars', totalStars(), 'gravity');
    Hub.submitScore('score', d.highScore, 'gravity');
    this.syncCloudSave();
    const info = {
      index: idx, name: levelName(L.def), time: this.playTime, timeBonus, integrityBonus, score: this.score, best: d.levels[idx].score,
      stars, noDamage, underPar, par: L.def.par, newEcho, prevEcho: prev ? prev.time : null, brakes: this.levelStats.brakes
    };
    Banner.show();
    AccountChip.show();
    if (idx >= LEVELS.length - 1) {
      this.state = STATE.VICTORY;
      this.ui.showVictory(info);
    } else {
      this.state = STATE.LEVEL_CLEAR;
      this.ui.showLevelClear(info);
    }
  }

  async syncCloud() {
    if (Hub.online) {
      const remote = await Hub.loadProgress('gravity');
      if (remote && typeof remote === 'object') {
        const d = Save.data;
        d.unlocked = Math.max(d.unlocked, clamp(Number(remote.unlocked) || 1, 1, LEVELS.length));
        for (const [k, v] of Object.entries(remote.levels || {})) {
          const cur = d.levels[k];
          if (!cur || (v.stars || 0) > (cur.stars || 0) || (v.score || 0) > (cur.score || 0)) d.levels[k] = Object.assign({}, cur || {}, v);
        }
        d.skins = Array.from(new Set([...(d.skins || []), ...(Array.isArray(remote.skins) ? remote.skins : [])]));
        Store.save();
      }
    }
    this.ui.refreshMenu();
  }

  syncCloudSave() {
    const d = Save.data;
    Hub.saveProgress({ unlocked: d.unlocked, levels: d.levels, skins: d.skins, skin: d.skin }, 'gravity');
  }

  die(cause) {
    if (this.dying > 0) return;
    this.dying = 1.3;
    this.lastCause = cause;
    const R = this.robot;
    for (let i = 0; i < 70; i++) {
      this.fx.emit(R.cx, R.cy, { speed: 380, speedMin: 60, life: 1.1, size: 5, color: pick([COLORS.hazard, COLORS.warn, '#ffffff', COLORS.line]), drag: 2.2 });
    }
    for (let i = 0; i < 24; i++) {
      this.fx.emit(R.cx, R.cy, { speed: 520, speedMin: 300, life: 0.6, size: 3, shape: 'line', color: '#ffffff', drag: 4 });
    }
    R.scale = 0;
    Sound.death();
    Platform.gameplayStop();
    Haptics.pulse(220);
    this.shake = 18;
    this.flash = 0.7;
    this.flashColor = COLORS.hazard;
    this.ui.hideHint();
    this.currentHint = null;
    this.hintQueue = [];
  }

  showGameOver() {
    this.state = STATE.GAMEOVER;
    this.pendingLife = true;
    const canSkip = this.levelIndex + 1 >= Save.data.unlocked && this.levelIndex < LEVELS.length - 1;
    this.ui.showGameOver({ cause: this.lastCause, level: this.levelIndex + 1, canSkip });
    Banner.show();
    AccountChip.show();
  }

  consumePendingLife() {
    if (!this.pendingLife) return;
    this.pendingLife = false;
    Lives.lose();
    this.ui.refreshMenu();
  }

  async revive() {
    if (this.state !== STATE.GAMEOVER || this.busy) return;
    this.busy = true;
    const ok = await rewardFlow({ game: 'gravity', item: 'revive', price: 10, title: t('reviveTitle'), text: t('reviveText'), duck: (on) => Sound.duck(on) });
    this.busy = false;
    if (!ok) return;
    const L = this.level;
    this.pendingLife = false;
    this.revived = true;
    this.damaged = true;
    this.robot = new Robot(L.start.x, L.start.y);
    this.robot.invuln = 2;
    this.gravity = 'down';
    this.integrity = 60;
    this.elapsed = Math.max(0, this.elapsed - 15);
    this.dying = 0;
    this.exiting = 0;
    this.intro = 0.9;
    this.acc = 0;
    this.state = STATE.PLAYING;
    this.ui.showScreen(null);
    Banner.hide();
    AccountChip.hide();
    Platform.gameplayStart();
    this.texts.add(L.start.x, L.start.y - 30, t('revived'), COLORS.crystal, 18);
  }

  async retryAfterFail() {
    if (this.busy) return;
    this.consumePendingLife();
    if (!Lives.canPlay()) {
      this.ui.noLives();
      return;
    }
    this.busy = true;
    await this.withAd();
    this.busy = false;
    this.beginLevel(this.levelIndex, true);
  }

  async skipLevel() {
    if (this.busy) return;
    this.busy = true;
    const ok = await gemPurchase({ game: 'gravity', item: 'skip_level', price: 25, title: t('skipTitle'), icon: '⏭' });
    this.busy = false;
    if (!ok) return;
    this.pendingLife = false;
    Save.data.unlocked = Math.max(Save.data.unlocked, Math.min(LEVELS.length, this.levelIndex + 2));
    Store.save();
    this.syncCloudSave();
    this.beginLevel(Math.min(LEVELS.length - 1, this.levelIndex + 1));
  }

  async buyGuide() {
    if (this.busy || !this.level || this.demo) return;
    this.busy = true;
    const ok = await gemPurchase({ game: 'gravity', item: 'guide', price: 15, title: t('guideTitle'), icon: '🧭' });
    this.busy = false;
    if (!ok) return;
    this.pendingLife = false;
    const idx = this.levelIndex;
    this.guide = { level: idx, frames: simulateSolution(idx) };
    this.beginLevel(idx, true);
  }

  queueHints(list, delay) {
    this.hintQueue = (list || []).map((text) => ({ text }));
    this.hintTimer = -delay;
  }

  hintOnce(key, text) {
    if (this.hintsShown.has(key)) return;
    this.hintsShown.add(key);
    this.hintQueue.unshift({ text });
    if (this.currentHint) this.hintTimer = Math.max(this.hintTimer, 3.4);
  }

  updateHints(dt) {
    if (this.state !== STATE.PLAYING) return;
    this.hintTimer += dt;
    if (this.currentHint) {
      if (this.hintTimer > 3.6) {
        this.ui.hideHint();
        this.currentHint = null;
        this.hintTimer = -0.4;
      }
    } else if (this.hintTimer >= 0 && this.hintQueue.length) {
      this.currentHint = this.hintQueue.shift();
      this.ui.showHint(this.currentHint.text);
      this.hintTimer = 0;
    }
  }
}

function simulateSolution(idx) {
  const def = LEVELS[idx];
  if (!def || !def.sol) return null;
  const dirs = { U: 'up', D: 'down', L: 'left', R: 'right' };
  const L = new Level(def, idx);
  const R = new Robot(L.start.x, L.start.y);
  const frames = [];
  let acc = 0;
  let g = 'down';
  const record = (dt) => {
    acc += dt;
    while (acc >= ECHO_RATE) {
      frames.push(Math.round(R.x), Math.round(R.y));
      acc -= ECHO_RATE;
    }
  };
  const settle = (wait) => {
    let calm = 0;
    for (let tt = 0; tt < 6; tt += FIXED_DT) {
      Physics.step(R, L, g, FIXED_DT, []);
      record(FIXED_DT);
      if (R.grounded && Math.abs(R.vx) < 1 && Math.abs(R.vy) < 1) {
        if (++calm > 12) break;
      } else calm = 0;
    }
    for (let w = 0; w < wait; w += FIXED_DT) record(FIXED_DT);
  };
  settle(0.35);
  for (const m of def.sol.split(' ')) {
    g = dirs[m];
    settle(0.3);
  }
  return frames;
}

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sx = 1;
    this.sy = 1;
    this.level = null;
    this.bg = null;
    this.walls = null;
    this.vignette = null;
    this.dust = [];
    for (let i = 0; i < 70; i++) {
      this.dust.push({ x: rand(0, VIEW_W), y: rand(0, VIEW_H), s: rand(18, 70), z: rand(0.4, 1), vx: 0, vy: 0 });
    }
  }

  blur(v) { return v * this.sx; }

  resize(cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.sx = w / VIEW_W;
    this.sy = h / VIEW_H;
    this.buildStatic();
    if (this.level) this.buildWalls();
  }

  layer() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const x = c.getContext('2d');
    x.setTransform(this.sx, 0, 0, this.sy, 0, 0);
    return { c, x };
  }

  setLevel(level) {
    this.level = level;
    this.buildWalls();
  }

  buildStatic() {
    const { c, x } = this.layer();
    const grad = x.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#070b20');
    grad.addColorStop(1, '#03040c');
    x.fillStyle = grad;
    x.fillRect(0, 0, VIEW_W, VIEW_H);
    const glow = x.createRadialGradient(VIEW_W * 0.5, VIEW_H * 0.45, 20, VIEW_W * 0.5, VIEW_H * 0.45, VIEW_W * 0.7);
    glow.addColorStop(0, 'rgba(43,228,255,0.07)');
    glow.addColorStop(1, 'rgba(43,228,255,0)');
    x.fillStyle = glow;
    x.fillRect(0, 0, VIEW_W, VIEW_H);
    x.strokeStyle = 'rgba(43,228,255,0.045)';
    x.lineWidth = 1;
    x.beginPath();
    for (let i = 0; i <= COLS; i++) { x.moveTo(i * TILE, 0); x.lineTo(i * TILE, VIEW_H); }
    for (let j = 0; j <= ROWS; j++) { x.moveTo(0, j * TILE); x.lineTo(VIEW_W, j * TILE); }
    x.stroke();
    x.fillStyle = 'rgba(43,228,255,0.14)';
    for (let i = 1; i < COLS; i++) {
      for (let j = 1; j < ROWS; j++) {
        x.fillRect(i * TILE - 2, j * TILE - 0.5, 4, 1);
        x.fillRect(i * TILE - 0.5, j * TILE - 2, 1, 4);
      }
    }
    this.bg = c;

    const v = this.layer();
    const vg = v.x.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    v.x.fillStyle = vg;
    v.x.fillRect(0, 0, VIEW_W, VIEW_H);
    this.vignette = v.c;
  }

  buildWalls() {
    const L = this.level;
    const { c, x } = this.layer();
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const t = L.tileAt(col, r);
        const px = col * TILE;
        const py = r * TILE;
        if (t === '#') {
          x.fillStyle = '#0a1031';
          x.fillRect(px, py, TILE, TILE);
          const h = ((col * 73856093) ^ (r * 19349663)) >>> 0;
          x.fillStyle = 'rgba(43,228,255,0.07)';
          if (h % 5 === 0) x.fillRect(px + 8, py + 19, 24, 2);
          if (h % 7 === 0) x.fillRect(px + 19, py + 8, 2, 24);
          if (h % 3 === 0) x.fillRect(px + 17, py + 17, 6, 6);
        } else if (t === 'X') {
          x.fillStyle = '#2b0612';
          x.fillRect(px, py, TILE, TILE);
          x.save();
          x.beginPath();
          x.rect(px, py, TILE, TILE);
          x.clip();
          x.strokeStyle = 'rgba(255,46,87,0.38)';
          x.lineWidth = 4;
          x.beginPath();
          for (let k = 0; k <= TILE * 2; k += 12) {
            x.moveTo(px + k, py);
            x.lineTo(px + k - TILE, py + TILE);
          }
          x.stroke();
          x.restore();
        }
      }
    }
    const edges = (type, color, isOpen) => {
      x.beginPath();
      for (let r = 0; r < ROWS; r++) {
        for (let col = 0; col < COLS; col++) {
          if (L.tileAt(col, r) !== type) continue;
          const px = col * TILE;
          const py = r * TILE;
          if (isOpen(L.tileAt(col, r - 1))) { x.moveTo(px, py + 1); x.lineTo(px + TILE, py + 1); }
          if (isOpen(L.tileAt(col, r + 1))) { x.moveTo(px, py + TILE - 1); x.lineTo(px + TILE, py + TILE - 1); }
          if (isOpen(L.tileAt(col - 1, r))) { x.moveTo(px + 1, py); x.lineTo(px + 1, py + TILE); }
          if (isOpen(L.tileAt(col + 1, r))) { x.moveTo(px + TILE - 1, py); x.lineTo(px + TILE - 1, py + TILE); }
        }
      }
      x.save();
      x.lineCap = 'square';
      x.shadowColor = color;
      x.shadowBlur = this.blur(12);
      x.strokeStyle = rgba(color, 0.55);
      x.lineWidth = 3;
      x.stroke();
      x.shadowBlur = 0;
      x.strokeStyle = color;
      x.lineWidth = 1.5;
      x.stroke();
      x.restore();
    };
    edges('#', COLORS.line, (t) => t === '.');
    edges('X', COLORS.hazard, (t) => t !== 'X');
    this.walls = c;
  }

  draw(game, dt) {
    const ctx = this.ctx;
    ctx.setTransform(this.sx, 0, 0, this.sy, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.bg, 0, 0, VIEW_W, VIEW_H);
    if (!game.level || !this.walls) return;
    const t = game.time;
    const L = game.level;
    const vdt = game.state === STATE.PAUSED ? 0 : dt;
    const sh = game.shake;
    ctx.save();
    if (sh > 0) ctx.translate(rand(-sh, sh), rand(-sh, sh));
    this.updateDust(game, vdt);
    this.drawDust(ctx);
    ctx.drawImage(this.walls, 0, 0, VIEW_W, VIEW_H);
    for (const beam of L.lasers) this.drawLaser(ctx, beam, game.laserClock, t);
    this.drawPortal(ctx, game, t);
    for (const k of L.crystals) if (!k.taken) this.drawCrystal(ctx, k, t);
    for (const c of L.cores) if (!c.taken) this.drawCore(ctx, c, t);
    for (const d of L.drones) this.drawDrone(ctx, d, game);
    if (game.echo && !game.demo) this.drawGhost(ctx, game.echo.frames, game.playTime, COLORS.echo, t('echoTag'));
    if (game.guide && game.guide.frames && !game.demo) this.drawGhost(ctx, game.guide.frames, game.playTime, '#ffd23c', t('guideTag'));
    if (game.robot && game.robot.scale > 0.01 && game.dying <= 0) this.drawRobot(ctx, game);
    game.fx.draw(ctx);
    this.drawCollapse(ctx, game, t);
    game.texts.draw(ctx);
    ctx.restore();

    ctx.drawImage(this.vignette, 0, 0, VIEW_W, VIEW_H);
    if (game.flash > 0) {
      ctx.fillStyle = rgba(game.flashColor, Math.min(0.42, game.flash * 0.6));
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (game.state === STATE.PLAYING && game.integrity < 30 && game.dying <= 0 && !game.demo) {
      ctx.strokeStyle = rgba(COLORS.hazard, (0.5 + 0.5 * Math.sin(t * 7)) * 0.35);
      ctx.lineWidth = 16;
      ctx.strokeRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  updateDust(game, dt) {
    if (dt <= 0) return;
    const g = DIRS[game.gravity];
    for (const p of this.dust) {
      p.vx += (g.x * p.s - p.vx) * Math.min(1, dt * 2.5);
      p.vy += (g.y * p.s - p.vy) * Math.min(1, dt * 2.5);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -10) p.x += VIEW_W + 20; else if (p.x > VIEW_W + 10) p.x -= VIEW_W + 20;
      if (p.y < -10) p.y += VIEW_H + 20; else if (p.y > VIEW_H + 10) p.y -= VIEW_H + 20;
    }
  }

  drawDust(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(150,220,255,0.28)';
    ctx.fillStyle = 'rgba(150,220,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const p of this.dust) {
      const k = 0.14 * p.z;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k);
    }
    ctx.stroke();
    for (const p of this.dust) ctx.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5);
    ctx.restore();
  }

  drawLaser(ctx, b, clock, t) {
    const on = b.isOn(clock);
    const warn = !on && b.isWarning(clock);
    ctx.save();
    ctx.fillStyle = on ? COLORS.hazard : '#651629';
    if (b.orient === 'h') {
      ctx.fillRect(b.x0, b.y0 - 7, 5, 14);
      ctx.fillRect(b.x1 - 5, b.y0 - 7, 5, 14);
    } else {
      ctx.fillRect(b.x0 - 7, b.y0, 14, 5);
      ctx.fillRect(b.x0 - 7, b.y1 - 5, 14, 5);
    }
    const line = () => {
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y0);
      ctx.lineTo(b.x1, b.y1);
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    if (on) {
      ctx.globalCompositeOperation = 'lighter';
      const fl = 0.8 + Math.random() * 0.4;
      ctx.strokeStyle = 'rgba(255,46,87,0.3)';
      ctx.lineWidth = 14 * fl;
      line();
      ctx.strokeStyle = 'rgba(255,80,115,0.9)';
      ctx.lineWidth = 4;
      line();
      ctx.strokeStyle = 'rgba(255,235,240,0.95)';
      ctx.lineWidth = 1.5;
      line();
    } else if (warn) {
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -t * 60;
      ctx.strokeStyle = Math.sin(t * 45) > 0 ? 'rgba(255,46,87,0.8)' : 'rgba(255,46,87,0.25)';
      ctx.lineWidth = 2;
      line();
    } else {
      ctx.setLineDash([3, 8]);
      ctx.strokeStyle = 'rgba(255,46,87,0.18)';
      ctx.lineWidth = 1;
      line();
    }
    ctx.restore();
  }

  drawPortal(ctx, game, t) {
    const L = game.level;
    const { x, y } = L.exit;
    ctx.save();
    ctx.translate(x, y);
    if (!game.portalOpen) {
      ctx.strokeStyle = 'rgba(184,102,255,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.lineDashOffset = -t * 10;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(184,102,255,0.12)';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.fill();
      const n = L.cores.length;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * TAU;
        const lit = i < game.coresTaken;
        ctx.fillStyle = lit ? COLORS.core : 'rgba(184,102,255,0.35)';
        ctx.shadowColor = COLORS.core;
        ctx.shadowBlur = lit ? this.blur(8) : 0;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 19, Math.sin(a) * 19, 2.6, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 36);
      g.addColorStop(0, 'rgba(230,200,255,0.9)');
      g.addColorStop(0.3, 'rgba(184,102,255,0.45)');
      g.addColorStop(1, 'rgba(184,102,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 36, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const rr = 8 + i * 5.5;
        const a0 = t * (2.6 - i * 0.7) * (i % 2 ? -1 : 1);
        ctx.strokeStyle = i === 1 ? COLORS.line : COLORS.portal;
        ctx.lineWidth = 2.6 - i * 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, rr, a0, a0 + Math.PI * 1.35);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5 + Math.sin(t * 8) * 0.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawCore(ctx, c, t) {
    const pulse = 1 + Math.sin(t * 4 + c.seed) * 0.12;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.globalCompositeOperation = 'lighter';
    const r = 22 * pulse;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(140,210,255,0.85)');
    g.addColorStop(0.35, 'rgba(74,168,255,0.4)');
    g.addColorStop(1, 'rgba(74,168,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#eaf7ff';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,215,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 5, t * 1.6 + c.seed, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 5, -t * 1.3 + c.seed + 1, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawCrystal(ctx, k, t) {
    const bob = Math.sin(t * 3 + k.seed) * 3;
    ctx.save();
    ctx.translate(k.x, k.y + bob);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
    g.addColorStop(0, 'rgba(61,255,162,0.55)');
    g.addColorStop(1, 'rgba(61,255,162,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, TAU);
    ctx.fill();
    ctx.rotate(Math.sin(t * 2 + k.seed) * 0.25);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 0);
    ctx.lineTo(0, 11);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(61,255,162,0.3)';
    ctx.fill();
    ctx.strokeStyle = COLORS.crystal;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,255,236,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(0, 11);
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.stroke();
    ctx.restore();
  }

  drawDrone(ctx, d, game) {
    const cx = d.cx;
    const cy = d.cy;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
    g.addColorStop(0, 'rgba(255,46,87,0.4)');
    g.addColorStop(1, 'rgba(255,46,87,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(d.spin);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const rr = i % 2 === 0 ? 13.5 : 9;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#2a0710';
    ctx.fill();
    ctx.strokeStyle = COLORS.hazard;
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.hazard;
    ctx.shadowBlur = this.blur(10);
    ctx.stroke();
    ctx.rotate(-d.spin);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd0da';
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, TAU);
    ctx.fill();
    if (game.robot) {
      const dx = game.robot.cx - cx;
      const dy = game.robot.cy - cy;
      const len = Math.hypot(dx, dy) || 1;
      ctx.fillStyle = '#7a0019';
      ctx.beginPath();
      ctx.arc((dx / len) * 1.8, (dy / len) * 1.8, 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawGhost(ctx, f, playTime, color, label) {
    const n = Math.floor(f.length / 2);
    if (n < 2) return;
    const tt = playTime / ECHO_RATE;
    let i0 = Math.floor(tt);
    let alpha = 0.55;
    let x, y;
    if (i0 >= n - 1) {
      const over = playTime - (n - 1) * ECHO_RATE;
      if (over > 1) return;
      alpha *= 1 - over;
      i0 = n - 1;
      x = f[i0 * 2];
      y = f[i0 * 2 + 1];
    } else {
      const k = tt - i0;
      x = lerp(f[i0 * 2], f[i0 * 2 + 2], k);
      y = lerp(f[i0 * 2 + 1], f[i0 * 2 + 3], k);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 3; j >= 1; j--) {
      const ii = Math.max(0, i0 - j * 2);
      ctx.globalAlpha = alpha * 0.12 * (4 - j);
      ctx.fillStyle = color;
      ctx.fillRect(f[ii * 2] + 4, f[ii * 2 + 1] + 4, 16, 16);
    }
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = this.blur(10);
    ctx.lineWidth = 2;
    roundRectPath(ctx, x, y, ROBOT_SIZE, ROBOT_SIZE, 6);
    ctx.fillStyle = rgba(color, 0.22);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(label, x + ROBOT_SIZE / 2, y - 6);
    ctx.restore();
  }

  drawRobot(ctx, game) {
    const R = game.robot;
    const t = game.time;
    const heat = clamp((R.speed - PHYS.SAFE_IMPACT * 0.8) / (PHYS.SAFE_IMPACT * 0.3), 0, 1);
    const sk = currentSkin();
    if (R.trail.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const col = mixColor(sk.trail, COLORS.warn, heat);
      R.trail.forEach((p, i) => {
        const a = (i + 1) / R.trail.length;
        ctx.globalAlpha = a * 0.28;
        ctx.fillStyle = col;
        const s = R.w * (0.5 + a * 0.4) * R.scale;
        ctx.fillRect(p.x + R.w / 2 - s / 2, p.y + R.h / 2 - s / 2, s, s);
      });
      ctx.restore();
    }
    if (R.invuln > 0 && Math.floor(t * 18) % 2 === 0) return;
    const body = mixColor(sk.body, '#ff7a45', heat);
    const glow = mixColor(sk.glow, COLORS.hazard, heat);
    ctx.save();
    ctx.translate(R.cx, R.cy);
    ctx.rotate(R.angle);
    const sq = R.squash;
    ctx.scale((1 + sq * 0.3) * R.scale, (1 - sq * 0.3) * R.scale);
    ctx.shadowColor = glow;
    ctx.shadowBlur = this.blur(16 + heat * 10);
    ctx.fillStyle = body;
    roundRectPath(ctx, -12, -12, 24, 24, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#061322';
    roundRectPath(ctx, -9, -7, 18, 9, 4);
    ctx.fill();
    const lateral = R.vx * Math.cos(R.angle) + R.vy * Math.sin(R.angle);
    const eo = clamp(lateral / 260, -1, 1) * 4;
    const open = Math.sin(t * 1.7) > 0.985 ? 0.2 : 1;
    const eye = heat > 0.5 ? '#fff0e6' : sk.eye;
    ctx.fillStyle = eye;
    ctx.shadowColor = eye;
    ctx.shadowBlur = this.blur(8);
    ctx.fillRect(-3 + eo, -5 + 2.5 * (1 - open), 6, 5 * open);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = body;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(0, -16);
    ctx.stroke();
    ctx.fillStyle = heat > 0.3 ? COLORS.warn : COLORS.crystal;
    ctx.beginPath();
    ctx.arc(0, -17.5, 2.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = mixColor(sk.legs, COLORS.warn, heat);
    ctx.fillRect(-9, 12, 6, 2.5);
    ctx.fillRect(3, 12, 6, 2.5);
    ctx.restore();
    if (heat > 0.6 && game.state === STATE.PLAYING) {
      ctx.save();
      ctx.fillStyle = COLORS.warn;
      ctx.font = `800 18px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 30);
      ctx.fillText('!', R.cx, R.cy - 26);
      ctx.restore();
    }
  }

  drawCollapse(ctx, game, t) {
    const d = game.collapseDepth();
    if (d <= 0.5) return;
    const W = VIEW_W;
    const H = VIEW_H;
    const iw = W - 2 * d;
    const ih = H - 2 * d;
    const full = iw <= 0 || ih <= 0;
    const pulse = game.collapsePulse;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    if (!full) ctx.rect(d, d, iw, ih);
    ctx.fillStyle = pulse > 0
      ? `rgba(${Math.round(lerp(255, 61, pulse))},${Math.round(lerp(20, 255, pulse))},${Math.round(lerp(70, 162, pulse))},0.22)`
      : 'rgba(255,20,70,0.2)';
    ctx.fill('evenodd');
    ctx.clip('evenodd');
    const bands = full ? [[0, 0, W, H]] : [[0, 0, W, d], [0, H - d, W, d], [0, d, d, ih], [W - d, d, d, ih]];
    const areas = bands.map((b) => b[2] * b[3]);
    const total = areas.reduce((a, b) => a + b, 0);
    const count = Math.min(90, 16 + Math.floor(total / 2500));
    for (let i = 0; i < count; i++) {
      let r = Math.random() * total;
      let bi = 0;
      while (r > areas[bi] && bi < bands.length - 1) {
        r -= areas[bi];
        bi++;
      }
      const b = bands[bi];
      const bw = rand(4, 30);
      const bh = rand(2, 9);
      ctx.fillStyle = Math.random() < 0.6 ? `rgba(255,46,87,${rand(0.12, 0.5)})` : `rgba(255,0,170,${rand(0.1, 0.35)})`;
      ctx.fillRect(b[0] + Math.random() * b[2] - bw / 2, b[1] + Math.random() * b[3] - bh / 2, bw, bh);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    const off = (t * 40) % 4;
    for (let y = off; y < H; y += 4) ctx.fillRect(0, y, W, 1.2);
    ctx.restore();
    if (!full) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const col = pulse > 0 ? mixColor(COLORS.hazard, COLORS.crystal, pulse) : COLORS.hazard;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = this.blur(12);
      ctx.lineWidth = 2;
      ctx.beginPath();
      const seg = 16;
      const j = 2.5;
      for (let x = d; x < W - d; x += seg) ctx.lineTo(x, d + rand(-j, j));
      for (let y = d; y < H - d; y += seg) ctx.lineTo(W - d + rand(-j, j), y);
      for (let x = W - d; x > d; x -= seg) ctx.lineTo(x, H - d + rand(-j, j));
      for (let y = H - d; y > d; y -= seg) ctx.lineTo(d + rand(-j, j), y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }
}

class UI {
  constructor(game) {
    this.game = game;
    this.cache = {};
    this.gravAngle = 0;
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.screens = {};
    document.querySelectorAll('.screen').forEach((s) => { this.screens[s.id.replace('screen-', '')] = s; });
    this.hud = {
      level: $('hud-level'), score: $('hud-score'), mult: $('hud-mult'), cores: $('hud-cores'),
      integrity: $('hud-integrity'), collapse: $('hud-collapse'), integrityFill: $('integrity-fill'),
      collapseFill: $('collapse-fill'), cellIntegrity: $('cell-integrity'), cellCollapse: $('cell-collapse'), gravity: $('gravity-indicator')
    };
    $('hud-level-total').textContent = `/${LEVELS.length}`;
    this.buildTitle();
    document.querySelectorAll('[data-action]').forEach((btn) => btn.addEventListener('click', () => this.action(btn.dataset.action)));
    document.querySelectorAll('.seg[data-set]').forEach((seg) => seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.setSetting(seg.dataset.set, b.dataset.v);
    }));
    $('btn-pause').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.game.togglePause();
    });
    $('btn-sound').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.game.toggleSound();
    });
    I18N.apply();
    this.refreshMenu();
    this.updateSoundButton();
    setInterval(() => { if (this.game.state === STATE.MENU) this.refreshLives(); }, 1000);
  }

  action(name) {
    const g = this.game;
    Sound.unlock();
    Sound.click();
    switch (name) {
      case 'start': g.startRun(Math.min(LEVELS.length, Save.data.unlocked) - 1); break;
      case 'levels':
        this.buildLevels();
        if (g.state !== STATE.MENU) g.goToMenu();
        this.showScreen('levels');
        break;
      case 'shop':
        this.buildShop();
        this.showScreen('shop');
        break;
      case 'settings':
        this.refreshSettings();
        this.showScreen('settings');
        break;
      case 'howto': this.showScreen('howto'); break;
      case 'menu':
        if (g.state === STATE.MENU) {
          this.refreshMenu();
          this.showScreen('menu');
        } else g.goToMenu();
        break;
      case 'resume': g.resume(); break;
      case 'restart': g.restartLevel(false); break;
      case 'retry': g.retryAfterFail(); break;
      case 'next': g.nextLevel(); break;
      case 'replay': g.replayLevel(); break;
      case 'revive': g.revive(); break;
      case 'skip': g.skipLevel(); break;
      case 'guide': g.buyGuide(); break;
      case 'buyRefill': this.buyLives('refill'); break;
      case 'buyInfinite': this.buyLives('inf'); break;
      default: break;
    }
  }

  setSetting(key, v) {
    const d = Save.data;
    if (key === 'lang') {
      d.lang = v;
      I18N.lang = v;
      I18N.apply();
      this.refreshMenu();
    } else if (key === 'sound') {
      d.sound = v === '1';
      Sound.unlock();
      Sound.setMuted(!d.sound);
      this.updateSoundButton();
    } else if (key === 'vibration') {
      d.vibration = v === '1';
      Haptics.enabled = d.vibration;
      Haptics.pulse(30);
    }
    Store.save();
    this.refreshSettings();
  }

  refreshSettings() {
    const d = Save.data;
    const values = { lang: I18N.lang, sound: d.sound ? '1' : '0', vibration: d.vibration ? '1' : '0' };
    document.querySelectorAll('.seg[data-set]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', values[seg.dataset.set] === b.dataset.v));
    });
  }

  buildTitle() {
    const title = this.$('title');
    title.textContent = '';
    let i = 0;
    for (const word of ['GRAVITY', 'SHIFT']) {
      const row = document.createElement('span');
      row.className = 'row';
      row.setAttribute('aria-hidden', 'true');
      for (const ch of word) {
        const s = document.createElement('span');
        s.className = 'ch';
        s.textContent = ch;
        s.style.setProperty('--i', i++);
        row.appendChild(s);
      }
      title.appendChild(row);
    }
  }

  refreshLives() {
    const el = this.$('menu-lives');
    if (Lives.infinite()) el.textContent = t('livesInf', { t: fmtClock(Save.data.infiniteUntil - Date.now()) });
    else {
      const n = Lives.count();
      el.textContent = n >= Lives.max ? t('livesFull', { n }) : t('livesNext', { n, t: fmtClock(Lives.nextIn()) });
    }
  }

  refreshMenu() {
    const d = Save.data;
    const next = Math.min(LEVELS.length, d.unlocked);
    this.$('btn-play').textContent = d.unlocked > 1 ? t('playLevel', { n: next }) : t('play');
    this.$('menu-stars').textContent = t('starsPill', { n: totalStars(), m: LEVELS.length * 3 });
    this.$('menu-score').textContent = t('scorePill', { n: I18N.fmt(totalScore()) });
    this.refreshLives();
  }

  buildLevels() {
    const wrap = this.$('level-grid');
    wrap.textContent = '';
    const d = Save.data;
    for (let s = 0; s < 3; s++) {
      const sec = document.createElement('div');
      sec.className = 'sector';
      const h = document.createElement('div');
      h.className = `sector-title diff-${s + 1}`;
      h.textContent = t(`sector${s}`);
      const row = document.createElement('div');
      row.className = 'sector-row';
      for (let k = 0; k < 10; k++) {
        const i = s * 10 + k;
        if (i >= LEVELS.length) break;
        const b = document.createElement('button');
        b.type = 'button';
        const st = (d.levels[i] && d.levels[i].stars) || 0;
        b.className = `lv-btn${i === d.unlocked - 1 ? ' current' : ''}${st === 3 ? ' perfect' : ''}`;
        b.disabled = i + 1 > d.unlocked;
        const num = document.createElement('span');
        num.textContent = String(i + 1);
        const stars = document.createElement('small');
        stars.textContent = b.disabled ? '🔒' : '★'.repeat(st) + '☆'.repeat(3 - st);
        b.append(num, stars);
        b.title = `${t('levelN', { n: i + 1 })} · ${levelName(LEVELS[i])}`;
        b.addEventListener('click', () => {
          Sound.unlock();
          Sound.click();
          this.game.startRun(i);
        });
        row.appendChild(b);
      }
      sec.append(h, row);
      wrap.appendChild(sec);
    }
  }

  ownsSkin(s) {
    const d = Save.data;
    if (d.skins.includes(s.id)) return true;
    if (s.stars !== undefined && totalStars() >= s.stars) return true;
    return !!s.gems && Hub.owns(`skin_${s.id}`, 'gravity');
  }

  buildShop() {
    const grid = this.$('skin-grid');
    grid.textContent = '';
    const d = Save.data;
    for (const s of ROBOT_SKINS) {
      const owned = this.ownsSkin(s);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `skin-card${d.skin === s.id ? ' equipped' : ''}${owned ? '' : ' locked'}`;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 112;
      paintRobotPreview(cv, s);
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = t(`sk_${s.id}`);
      const st = document.createElement('span');
      st.className = 'st';
      st.textContent = d.skin === s.id ? t('equipped') : owned ? t('equip') : s.gems ? `${s.gems} 💎` : t('needStars', { n: s.stars });
      b.append(cv, nm, st);
      b.addEventListener('click', () => this.chooseSkin(s));
      grid.appendChild(b);
    }
    this.$('btn-refill').textContent = t('refillBtn');
    this.$('btn-infinite').textContent = t('infBtn');
  }

  async chooseSkin(s) {
    const d = Save.data;
    if (!this.ownsSkin(s)) {
      if (!s.gems) return;
      const ok = await gemPurchase({ game: 'gravity', item: `skin_${s.id}`, price: s.gems, title: t(`sk_${s.id}`), icon: '🤖' });
      if (!ok) return;
    }
    if (!d.skins.includes(s.id)) d.skins.push(s.id);
    d.skin = s.id;
    Store.save();
    this.game.syncCloudSave();
    this.buildShop();
  }

  async buyLives(kind) {
    const ok = kind === 'refill'
      ? await gemPurchase({ game: 'gravity', item: 'lives_refill', price: 12, title: t('refillBtn'), icon: '❤' })
      : await gemPurchase({ game: 'gravity', item: 'lives_infinite_1h', price: 30, title: t('infBtn'), icon: '❤' });
    if (!ok) return;
    if (kind === 'refill') Lives.refill();
    else Lives.infinite1h();
    this.refreshMenu();
  }

  async noLives() {
    const canAd = Platform.hasRewarded() && Hub.adsLeft('gravity') > 0;
    const buttons = [];
    if (canAd) buttons.push({ id: 'ad', label: t('lifeAd'), primary: true });
    buttons.push({ id: 'refill', label: t('refillBtn'), primary: !canAd });
    buttons.push({ id: 'inf', label: t('infBtn') });
    buttons.push({ id: 'cancel', label: t('kCancel') });
    const c = await GemUI.open({ icon: '❤', title: t('noLives'), text: t('noLivesText', { t: fmtClock(Lives.nextIn()) }), buttons, balance: true });
    if (c === 'ad') {
      const ok = await Platform.rewardedBreak(() => Sound.duck(true));
      Sound.duck(false);
      if (ok) {
        await Hub.useAd('gravity');
        Lives.add(1);
      } else await GemUI.open({ icon: '📺', title: t('kAdUnavailable'), buttons: [{ id: 'ok', label: t('kOk'), primary: true }] });
    } else if (c === 'refill' || c === 'inf') {
      const item = c === 'refill' ? 'lives_refill' : 'lives_infinite_1h';
      const price = c === 'refill' ? 12 : 30;
      if (await Hub.spend(item, price, 'gravity')) {
        if (c === 'refill') Lives.refill();
        else Lives.infinite1h();
      } else {
        const c2 = await GemUI.open({ title: t('kNoGems'), buttons: [{ id: 'shop', label: t('kGetGems'), primary: true }, { id: 'cancel', label: t('kCancel') }], balance: true });
        if (c2 === 'shop') Hub.openShop();
      }
    }
    this.refreshMenu();
  }

  gemToast(n) {
    const el = this.$('gem-toast');
    el.textContent = t('gemsEarned', { n });
    el.classList.add('show');
    clearTimeout(this.gemTimer);
    this.gemTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  showScreen(name) {
    for (const [key, el] of Object.entries(this.screens)) el.classList.toggle('active', key === name);
    if (name) {
      const el = this.screens[name];
      const btn = el.querySelector('.btn.primary') || el.querySelector('.btn');
      if (btn) setTimeout(() => { if (el.classList.contains('active')) btn.focus({ preventScroll: true }); }, 60);
    } else if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }

  set(key, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    this.hud[key].textContent = value;
  }

  setBar(key, v) {
    const val = Math.round(clamp(v, 0, 1) * 1000) / 1000;
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    this.hud[key].style.transform = `scaleX(${val})`;
  }

  updateHud() {
    const g = this.game;
    if (!g.level) return;
    const run = !g.demo;
    this.set('level', String(g.levelIndex + 1));
    this.set('score', pad(run ? g.score : 0));
    this.set('mult', `x${(run ? g.mult : 1).toFixed(1)}`);
    this.set('cores', `${run ? g.coresTaken : 0}/${g.level.cores.length}`);
    const integ = run ? g.integrity : 100;
    this.set('integrity', `${Math.ceil(integ)}%`);
    this.setBar('integrityFill', integ / 100);
    const p = run ? g.collapseProgress() : 0;
    this.set('collapse', `${Math.floor(p * 100)}%`);
    this.setBar('collapseFill', p);
    const alertI = run && integ < 30;
    const alertC = run && p > 0.75;
    if (this.cache.alertI !== alertI) { this.cache.alertI = alertI; this.hud.cellIntegrity.classList.toggle('alert', alertI); }
    if (this.cache.alertC !== alertC) { this.cache.alertC = alertC; this.hud.cellCollapse.classList.toggle('alert', alertC); }
    const target = GRAVITY_CSS[g.gravity];
    if (this.cache.grav !== target) {
      this.cache.grav = target;
      let delta = (target - this.gravAngle) % 360;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      this.gravAngle += delta;
      this.hud.gravity.style.transform = `rotate(${this.gravAngle}deg)`;
    }
  }

  updateSoundButton() {
    this.$('btn-sound').classList.toggle('muted', Sound.muted);
  }

  showBanner(level) {
    this.$('banner-top').textContent = t('levelN', { n: level.index + 1 });
    this.$('banner-name').textContent = levelName(level.def);
    const d = this.$('banner-diff');
    d.textContent = t(`diff${level.def.diff}`);
    d.className = `banner-diff diff-${level.def.diff}`;
    const b = this.$('banner');
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('show'), 1800);
  }

  showHint(text) {
    const h = this.$('hint');
    h.textContent = text;
    h.classList.add('show');
  }

  hideHint() { this.$('hint').classList.remove('show'); }

  setPauseInfo(level) {
    this.$('pause-info').textContent = `${t('levelN', { n: level.index + 1 })} · ${levelName(level.def)} (${t(`diff${level.def.diff}`)})`;
  }

  fillStats(id, rows) {
    const dl = this.$(id);
    dl.textContent = '';
    rows.forEach(([label, value, total]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      if (total) dt.className = dd.className = 'total';
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
  }

  showLevelClear(info) {
    this.$('clear-name').textContent = `${t('levelN', { n: info.index + 1 })} · ${info.name}`;
    const stars = [...this.$('clear-stars').children];
    stars.forEach((s) => s.classList.remove('on'));
    stars.forEach((s, i) => { if (i < info.stars) setTimeout(() => s.classList.add('on'), 250 + i * 260); });
    const crit = this.$('clear-crit');
    crit.textContent = '';
    [[t('critDone'), true], [t('critSafe'), info.noDamage], [t('critTime', { n: info.par }), info.underPar]].forEach(([txt, ok]) => {
      const li = document.createElement('li');
      li.textContent = txt;
      if (ok) li.className = 'ok';
      crit.appendChild(li);
    });
    this.fillStats('clear-stats', [
      [t('statTime'), formatTime(info.time)],
      [t('statTimeBonus'), `+${info.timeBonus}`],
      [t('statIntegrity'), `+${info.integrityBonus}`],
      [t('statBrakes'), String(info.brakes)],
      [t('statBest'), pad(info.best)],
      [t('statScore'), pad(info.score), true]
    ]);
    let note;
    if (info.newEcho && info.prevEcho !== null) note = t('echoNew', { t: formatTime(info.prevEcho - info.time) });
    else if (info.newEcho) note = t('echoFirst');
    else note = t('echoKeep', { t: formatTime(info.prevEcho) });
    this.$('clear-echo').textContent = note;
    this.showScreen('clear');
  }

  showGameOver(info) {
    this.$('over-cause').textContent = t(`cause_${info.cause}`) || t('cause_impact');
    this.$('btn-retry').textContent = Lives.infinite() ? t('retryInf') : t('retry', { n: Math.max(0, Lives.count() - 1) });
    this.$('btn-skip').style.display = info.canSkip ? '' : 'none';
    this.showScreen('over');
  }

  showVictory() {
    this.fillStats('victory-stats', [
      [t('totalStars'), `${totalStars()} / ${LEVELS.length * 3}`],
      [t('totalScore'), I18N.fmt(totalScore()), true]
    ]);
    this.showScreen('victory');
  }
}

const Input = {
  init(game) {
    const keymap = {
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right'
    };
    window.addEventListener('keydown', (e) => {
      const dir = keymap[e.code];
      if (dir) {
        if (game.state === STATE.PLAYING) e.preventDefault();
        Sound.unlock();
        game.onDirection(dir);
        return;
      }
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyP':
        case 'Escape':
          if (game.state === STATE.PLAYING || game.state === STATE.PAUSED) {
            e.preventDefault();
            game.togglePause();
          } else if (e.code === 'Escape' && game.state === STATE.MENU) {
            game.ui.showScreen('menu');
          }
          break;
        case 'KeyR':
          game.onRestartKey();
          break;
        case 'KeyM':
          game.toggleSound();
          break;
        default:
          break;
      }
    });

    const canvas = document.getElementById('game');
    let sx = 0, sy = 0, active = false;
    const swipe = (dx, dy) => {
      game.onDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    };
    canvas.addEventListener('pointerdown', (e) => {
      active = true;
      sx = e.clientX;
      sy = e.clientY;
      Sound.unlock();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!active) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 28) {
        swipe(dx, dy);
        sx = e.clientX;
        sy = e.clientY;
      }
    });
    const end = () => { active = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);

    window.addEventListener('blur', () => game.autoPause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) game.autoPause();
    });
  }
};

const game = new Game();
game.init();