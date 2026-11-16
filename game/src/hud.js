// The DOM HUD: crosshair, health, ammo, money, timer, score, killfeed, minimap, buy
// menu, plant/defuse progress and the round banners. It never touches the simulation;
// main.js pushes numbers in and reads callbacks out. Every setter is cheap-guarded so
// the DOM is only written when a value actually changes.
const COPY = {
  start: {
    title: 'EMBER YARD',
    copy: 'Sable attacks. Plant the spike at A or B, or eliminate the Ember team. Buy first — B opens the shop.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBER YARD',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your squad fights on. Watch the round resolve.',
    action: 'Keep watching',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoBox = $('ammo');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armourFill = $('armour-fill');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const aliveValue = $('alive-value');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const bombStatus = $('bomb-status');
  const damageFlash = $('damage-flash');
  const minimap = $('minimap');
  const mapCtx = minimap ? minimap.getContext('2d') : null;

  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;
  let playHandler = null;
  let buyHandler = null;

  function setText(el, key, value) {
    if (last[key] !== value) {
      last[key] = value;
      el.textContent = value;
    }
  }

  return {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setHealth(hp, armour) {
      const h = Math.max(0, Math.round(hp));
      if (last.hp !== h) {
        last.hp = h;
        healthNum.textContent = String(h);
        healthFill.style.width = `${h}%`;
        healthFill.classList.toggle('low', h <= 30);
      }
      const a = Math.max(0, Math.round(armour));
      if (last.armour !== a) {
        last.armour = a;
        armourFill.style.width = `${Math.min(100, a)}%`;
      }
    },
    setMoney(value) { setText(moneyValue, 'money', `$${value}`); },
    setTimer(seconds, planted) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerValue, 'timer', text);
      timerValue.classList.toggle('planted', !!planted);
    },
    setScore(a, d, round) {
      setText(scoreValue, 'score', `SABLE ${a} — ${d} EMBER · ROUND ${round}`);
    },
    setAlive(a, d) { setText(aliveValue, 'alive', `Sable ${a} · Ember ${d} alive`); },
    setBomb(text) { setText(bombStatus, 'bomb', text); },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', !!killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damage() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 140);
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    feed(text, good) {
      const line = document.createElement('div');
      line.className = good ? 'feed-good' : 'feed-bad';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
    },
    showBanner(titleText, subText, good, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.classList.toggle('good', !!good);
      banner.classList.toggle('bad', !good);
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() { banner.hidden = true; },
    showBuy(money, owned) {
      buyMoney.textContent = `$${money}`;
      for (const button of buyMenu.querySelectorAll('[data-buy]')) {
        const id = button.getAttribute('data-buy');
        button.disabled = owned[id] || (id !== 'ammo' && money < Number(button.getAttribute('data-price')));
        button.classList.toggle('owned', !!owned[id]);
      }
      buyMenu.hidden = false;
    },
    hideBuy() { buyMenu.hidden = true; },
    onBuy(handler) {
      buyHandler = handler;
      buyMenu.addEventListener('click', (event) => {
        const button = event.target.closest('[data-buy]');
        if (button && !button.disabled && buyHandler) buyHandler(button.getAttribute('data-buy'));
      });
    },
    showPlant(kind, progress) {
      plantLabel.textContent = kind === 'plant' ? 'Planting spike…' : 'Defusing spike…';
      plantFill.style.width = `${Math.round(progress * 100)}%`;
      plantBar.hidden = false;
    },
    hidePlant() { plantBar.hidden = true; },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'match' ? extra : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) {
      playHandler = handler;
      play.addEventListener('click', () => playHandler && playHandler());
    },
    drawMinimap(rects, sites, dots, bomb) {
      if (!mapCtx) return;
      const W = 168;
      const H = 138;
      mapCtx.clearRect(0, 0, W, H);
      mapCtx.fillStyle = 'rgba(20,22,26,0.72)';
      mapCtx.fillRect(0, 0, W, H);
      const sx = (x) => ((x + 22) / 44) * W;
      const sz = (z) => ((z + 18) / 36) * H;
      mapCtx.fillStyle = '#3a4150';
      for (const [x, z, w, d] of rects) mapCtx.fillRect(sx(x), sz(z), Math.max(1, (w / 44) * W), Math.max(1, (d / 36) * H));
      mapCtx.font = 'bold 11px system-ui';
      for (const key of ['A', 'B']) {
        const s = sites[key];
        mapCtx.fillStyle = bomb && bomb.site === key ? '#e2603a' : '#f0a830';
        mapCtx.fillText(key, sx(s.x) - 4, sz(s.z) + 4);
      }
      for (const dot of dots) {
        mapCtx.fillStyle = dot.team === 'attackers' ? '#3fa796' : '#e2603a';
        mapCtx.beginPath();
        mapCtx.arc(sx(dot.x), sz(dot.z), dot.you ? 4 : 3, 0, Math.PI * 2);
        mapCtx.fill();
        if (dot.you) {
          mapCtx.strokeStyle = '#ece7db';
          mapCtx.beginPath();
          mapCtx.arc(sx(dot.x), sz(dot.z), 6, 0, Math.PI * 2);
          mapCtx.stroke();
        }
      }
      if (bomb && bomb.planted) {
        mapCtx.fillStyle = '#ff5a3c';
        mapCtx.beginPath();
        mapCtx.arc(sx(bomb.x), sz(bomb.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
      }
    },
  };
}
