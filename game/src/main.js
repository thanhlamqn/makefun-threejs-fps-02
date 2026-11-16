// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// The sim (player, bots, bomb, grenades) runs in step(); rendering only reads state.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture, renders
// it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP, createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { WEAPONS, GRENADE, ARMOUR, createWeapon } from './weapon.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createMatch } from './game.js';
import { sfx } from './audio.js';
import { createEffects } from './effects.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#262d38');
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 55);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const hud = createHud();
const player = createPlayer(world.colliders);
const weapon = createWeapon(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

// The player object bots read: position, eye, liveness, speed, crouch, recent fire.
const playerView = {
  pos: player.state.position, eye: 1.6, alive: true, speed: 0, crouching: false, firedAt: 0,
};
const body = player.state;
let hp = 100;
let armour = 0;
let frozen = false;
let started = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let shake = 0;
let plantProgress = 0;
let plantSite = null;
let buyOpen = false;
let prevFiring = false;

const grenades = [];
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.4 });
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

const match = createMatch({
  onRoundStart(round) {
    resetPositions();
    hud.setScore(match.state.score.attackers, match.state.score.defenders, round);
    hud.showBanner(`ROUND ${round}`, 'Buy phase — B opens the shop', true, 2000);
    sfx.beep(true);
  },
  onLive() {
    hud.showBanner('PLANT THE SPIKE', `Site ${match.state.planSite} is the call — A or B, your choice`, true, 2200);
  },
  onRoundEnd(winner, reason) {
    const won = winner === 'attackers';
    hud.showBanner(won ? 'ROUND WON' : 'ROUND LOST', reason, won, 3800);
    if (won) sfx.roundWin(); else sfx.roundLose();
  },
  onMatchEnd(winner) {
    const won = winner === 'attackers';
    hud.showOverlay('match', won
      ? `Sable takes the match ${match.state.score.attackers}–${match.state.score.defenders}. Ember Yard is yours.`
      : `Ember takes the match ${match.state.score.defenders}–${match.state.score.attackers}. Run it back.`);
    if (document.pointerLockElement) document.exitPointerLock();
    if (won) sfx.roundWin(); else sfx.roundLose();
  },
  onPlanted(siteKey) {
    hud.setBomb(`SPIKE PLANTED AT ${siteKey}`);
    hud.feed(`Spike planted at ${siteKey}`, true);
    sfx.plant();
  },
});

const bots = createBots(scene, world, playerView, {
  tracer(from, to, team) {
    effects.tracer(from, to);
  },
  shotSound(pos, dist) {
    if (dist < 30) sfx.distantShot();
  },
  stepSound() { sfx.step(); },
  onPlayerHit(dmg, bot) {
    if (!playerView.alive) return;
    damagePlayer(dmg, bot);
  },
  onBotKilled(bot, attacker) {
    const killer = attacker && attacker.team ? attacker.name : (attacker === 'player' ? 'You' : '—');
    hud.feed(`${killer} ▸ ${bot.name}`, attacker === 'player' || (attacker && attacker.team === 'attackers'));
    if (attacker === 'player') { match.addKillReward(); }
    match.checkElimination(
      bots.aliveCount('attackers') + (playerView.alive ? 1 : 0),
      bots.aliveCount('defenders'),
      playerView.alive,
    );
  },
  onChannel(bot, kind, progress) {
    if (kind === 'plant') hud.setBomb(`Ember is planting the spike…`);
    else hud.setBomb(`Ember is defusing the spike…`);
  },
  onPlanted(bot) {
    match.plant(bot.targetSite, MAP.sites[bot.targetSite].x, MAP.sites[bot.targetSite].z);
  },
  onDefused() {
    match.defused();
  },
  onPlan(site) {
    match.state.planSite = site;
  },
});

const shootables = world.shootables.concat(bots.hitMeshes);

function resetPositions() {
  const spawn = MAP.spawns.attackers[0];
  body.position.set(spawn[0], 0, spawn[1]);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  hp = 100;
  playerView.alive = true;
  plantProgress = 0;
  plantSite = null;
  hud.hidePlant();
  bots.reset(match.state.round);
  for (const g of grenades) { scene.remove(g.mesh); }
  grenades.length = 0;
}

function damagePlayer(dmg, fromBot) {
  const absorbed = Math.min(armour, Math.round(dmg * ARMOUR.absorb));
  armour -= absorbed;
  hp -= (dmg - absorbed);
  hud.damage();
  sfx.hurt();
  shake = Math.min(0.5, shake + 0.25);
  if (hp <= 0) {
    hp = 0;
    playerView.alive = false;
    match.state.deaths += 1;
    hud.showOverlay('dead');
    if (document.pointerLockElement) document.exitPointerLock();
    hud.feed(`${fromBot ? fromBot.name : 'Ember'} ▸ You`, false);
    match.checkElimination(
      bots.aliveCount('attackers'),
      bots.aliveCount('defenders'),
      false,
    );
  }
}

function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = MAP.sites[key];
    if (Math.hypot(x - s.x, z - s.z) < s.r) return key;
  }
  return null;
}

function shoot(spread) {
  const def = weapon.def;
  if (!weapon.takeRound()) {
    sfx.dryFire();
    return false;
  }
  playerView.firedAt = 1.5;
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  muzzle.y -= 0.12;
  const pellets = def.pellets;
  let anyHit = false;
  for (let p = 0; p < pellets; p += 1) {
    tmpV.copy(direction);
    tmpV.x += (random() * 2 - 1) * spread;
    tmpV.y += (random() * 2 - 1) * spread;
    tmpV.z += (random() * 2 - 1) * spread;
    tmpV.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, tmpV);
    const hits = raycaster.intersectObjects(shootables, false);
    const hit = hits[0];
    if (!hit) continue;
    effects.tracer(muzzle, hit.point);
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const head = hit.object.userData.part === 'head';
      const dist = hit.distance;
      const falloff = dist > 25 ? def.falloff : 1;
      const dmg = Math.round(def.damage * (head ? def.headMult : 1) * falloff);
      anyHit = true;
      const killed = bot.hp - dmg <= 0;
      bots.damageBot(bot, dmg, 'player');
      hud.hitMarker(killed, shot ? 4000 : 90);
      if (killed) sfx.kill(); else sfx.hit();
      if (killed) {
        match.addKillReward();
        hud.feed(`You ▸ ${bot.name}${head ? ' (headshot)' : ''}`, true);
        match.checkElimination(
          bots.aliveCount('attackers') + (playerView.alive ? 1 : 0),
          bots.aliveCount('defenders'),
          playerView.alive,
        );
      }
    } else {
      effects.impact(hit.point, 6);
    }
  }
  weapon.pullTrigger();
  sfx.shot(def.id);
  bots.hearShot(body.position, 'attackers');
  player.recoil(def.kick * (0.9 + random() * 0.3), (random() * 2 - 1) * 0.004);
  shake = Math.min(0.4, shake + 0.06);
  hud.setAmmo(weapon.current.mag, weapon.current.reserve, def.name);
  return anyHit;
}

function throwGrenade() {
  if (weapon.state.grenades <= 0) { sfx.denied(); return; }
  weapon.state.grenades -= 1;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  camera.getWorldDirection(direction);
  mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  scene.add(mesh);
  tmpV.copy(direction).multiplyScalar(17);
  tmpV.y += 4.5;
  grenades.push({ mesh, vel: tmpV.clone(), fuse: GRENADE.fuse });
  sfx.beep(false);
  hud.setAmmo(weapon.current.mag, weapon.current.reserve, weapon.def.name);
}

function explodeGrenade(g) {
  const pos = g.mesh.position;
  effects.explode(pos);
  sfx.explode();
  shake = 0.8;
  bots.damageArea(pos, GRENADE.radius, GRENADE.maxDamage, 'player');
  const dPlayer = pos.distanceTo(tmpV2.set(body.position.x, body.position.y + 1.2, body.position.z));
  if (playerView.alive && dPlayer < GRENADE.radius) {
    damagePlayer(Math.round(GRENADE.maxDamage * (1 - dPlayer / GRENADE.radius) * 0.6), null);
  }
  scene.remove(g.mesh);
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 14 * dt;
    const p = g.mesh.position;
    const nx = p.x + g.vel.x * dt;
    const nz = p.z + g.vel.z * dt;
    const ny = p.y + g.vel.y * dt;
    // Axis-separated bounce against the world's boxes.
    const probe = new THREE.Box3();
    let blocked = false;
    probe.min.set(nx - 0.09, ny - 0.09, nz - 0.09);
    probe.max.set(nx + 0.09, ny + 0.09, nz + 0.09);
    for (const c of world.colliders) {
      if (probe.intersectsBox(c)) { blocked = true; break; }
    }
    if (blocked) {
      // Try each axis alone; reflect the blocked one.
      const px = new THREE.Box3(new THREE.Vector3(nx - 0.09, p.y - 0.09, p.z - 0.09), new THREE.Vector3(nx + 0.09, p.y + 0.09, p.z + 0.09));
      let hitX = false;
      let hitZ = false;
      for (const c of world.colliders) {
        if (px.intersectsBox(c)) hitX = true;
        const pz = new THREE.Box3(new THREE.Vector3(p.x - 0.09, p.y - 0.09, nz - 0.09), new THREE.Vector3(p.x + 0.09, p.y + 0.09, nz + 0.09));
        if (pz.intersectsBox(c)) hitZ = true;
      }
      if (hitX) g.vel.x *= -0.45;
      if (hitZ) g.vel.z *= -0.45;
      if (!hitX && !hitZ) g.vel.y = Math.abs(g.vel.y) * 0.45;
      if (ny < 0.1) { g.vel.y = Math.abs(g.vel.y) * 0.45; }
    } else {
      p.set(nx, Math.max(0.09, ny), nz);
    }
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function toggleBuy() {
  if (match.state.phase !== 'buy' || !playerView.alive) return;
  buyOpen = !buyOpen;
  if (buyOpen) {
    hud.showBuy(match.state.money, {
      rifle: !!weapon.owned.rifle,
      shotgun: !!weapon.owned.shotgun,
      grenade: weapon.state.grenades > 0,
      armour: armour >= 50,
      ammo: false,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    hud.hideBuy();
    input.requestLock();
  }
}

function buyItem(id) {
  if (match.state.phase !== 'buy') return;
  if (id === 'rifle' || id === 'shotgun') {
    if (weapon.owned[id]) return;
    if (!match.buy(WEAPONS[id].price)) { sfx.denied(); return; }
    weapon.buy(id);
    weapon.select(id);
    sfx.buy();
  } else if (id === 'grenade') {
    if (weapon.state.grenades > 0) return;
    if (!match.buy(GRENADE.price)) { sfx.denied(); return; }
    weapon.state.grenades = 1;
    sfx.buy();
  } else if (id === 'armour') {
    if (armour >= 50) return;
    if (!match.buy(ARMOUR.price)) { sfx.denied(); return; }
    armour = 50;
    sfx.buy();
  } else if (id === 'ammo') {
    if (!match.buy(200)) { sfx.denied(); return; }
    weapon.refillAmmo();
    sfx.buy();
  }
  hud.setAmmo(weapon.current.mag, weapon.current.reserve, weapon.def.name);
  hud.setMoney(match.state.money);
  hud.showBuy(match.state.money, {
    rifle: !!weapon.owned.rifle,
    shotgun: !!weapon.owned.shotgun,
    grenade: weapon.state.grenades > 0,
    armour: armour >= 50,
    ammo: false,
  });
}

hud.onBuy(buyItem);
hud.onPlay(() => {
  sfx.unlock();
  if (shot) return;
  if (match.state.phase === 'matchEnd') {
    match.state.score = { attackers: 0, defenders: 0 };
    match.state.round = 1;
    match.state.money = 800;
    match.state.lossStreak = 0;
    match.state.matchWinner = null;
    weapon.reset();
    armour = 0;
    match.startRound();
  }
  if (!playerView.alive && match.state.phase !== 'matchEnd') {
    hud.hideOverlay();
    return;
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (buyOpen) { buyOpen = false; hud.hideBuy(); }
  } else if (match.state.phase !== 'matchEnd' && playerView.alive) {
    if (!buyOpen) hud.showOverlay(started ? 'paused' : 'start');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (shake > 0) {
    camera.rotation.x += (random() - 0.5) * shake * 0.05;
    camera.rotation.y += (random() - 0.5) * shake * 0.05;
  }
}

function step(dt) {
  elapsed += dt;
  if (playerView.firedAt > 0) playerView.firedAt -= dt;
  shake = Math.max(0, shake - dt * 1.4);
  match.step(dt);
  if (playerView.alive) player.step(dt, input.state.keys);
  playerView.speed = player.groundSpeed();
  playerView.crouching = body.crouching;
  playerView.eye = body.eye;
  weapon.step(dt);
  bots.step(dt, elapsed, match.state.bomb, match.state.phase === 'live');
  stepGrenades(dt);
  effects.step(dt);

  // Plant channel: hold E inside a site while the spike is not yet planted.
  if (playerView.alive && match.state.phase === 'live' && !match.state.bomb.planted) {
    const site = siteAt(body.position.x, body.position.z);
    if (site && input.state.keys.has('KeyE')) {
      if (plantSite !== site) { plantSite = site; plantProgress = 0; }
      plantProgress += dt / 3;
      hud.showPlant('plant', plantProgress);
      if (plantProgress >= 1) {
        match.plant(site, MAP.sites[site].x, MAP.sites[site].z);
        plantProgress = 0;
        hud.hidePlant();
      }
    } else {
      plantProgress = 0;
      plantSite = null;
      hud.hidePlant();
    }
  }

  // HUD: timer, bomb, money, alive counts.
  const bomb = match.state.bomb;
  if (bomb.planted) {
    hud.setTimer(bomb.timer, true);
    hud.setBomb(`SPIKE AT ${bomb.site} — ${Math.ceil(bomb.timer)}s`);
  } else if (match.state.phase === 'buy') {
    hud.setTimer(match.state.phaseT, false);
    hud.setBomb('BUY PHASE — B opens the shop');
  } else if (match.state.phase === 'live') {
    hud.setTimer(match.state.phaseT, false);
    hud.setBomb(match.state.planSite ? `SPIKE WITH YOU — SITE ${match.state.planSite} CALLED` : '');
  } else if (match.state.phase === 'roundEnd') {
    hud.setTimer(match.state.phaseT, false);
    hud.setBomb(match.state.roundReason || '');
  } else {
    hud.setTimer(0, false);
    hud.setBomb('');
  }
  hud.setMoney(match.state.money);
  hud.setHealth(hp, armour);
  hud.setScore(match.state.score.attackers, match.state.score.defenders, match.state.round);
  hud.setAlive(bots.aliveCount('attackers') + (playerView.alive ? 1 : 0), bots.aliveCount('defenders'));
  hud.setCrosshairGap(6 + weapon.spread(playerView.speed, playerView.crouching) * 900);
  const dots = [{ x: body.position.x, z: body.position.z, team: 'attackers', you: true }];
  for (const bot of bots.bots) {
    if (bot.alive) dots.push({ x: bot.group.position.x, z: bot.group.position.z, team: bot.team });
  }
  hud.drawMinimap(world.minimapRects, MAP.sites, dots, bomb.planted ? bomb : null);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerView.alive) player.look(look.x, look.y);
    // Edge-triggered keys, read once per frame from the press queue.
    const pressed = input.takePressed();
    if (pressed.has('KeyB')) toggleBuy();
    if (pressed.has('KeyG')) throwGrenade();
    if (pressed.has('KeyR')) weapon.reload();
    if (pressed.has('Digit1') && !buyOpen) weapon.select('pistol');
    if (pressed.has('Digit2') && !buyOpen) weapon.select('rifle');
    if (pressed.has('Digit3') && !buyOpen) weapon.select('shotgun');
    if (buyOpen) {
      if (pressed.has('Digit1')) buyItem('rifle');
      if (pressed.has('Digit2')) buyItem('shotgun');
      if (pressed.has('Digit3')) buyItem('grenade');
      if (pressed.has('Digit4')) buyItem('armour');
      if (pressed.has('Digit5')) buyItem('ammo');
    }
    const firing = input.state.firing && playerView.alive && !buyOpen && match.state.phase === 'live';
    const edge = firing && !prevFiring;
    prevFiring = firing;
    if (firing && weapon.ready() && (weapon.def.auto || edge)) {
      shoot(shot ? 0 : weapon.spread(playerView.speed, playerView.crouching));
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  match.startRound();
  if (name === 'start') {
    // Cover: buy phase at spawn, shop open, squad behind, mid lane ahead.
    body.position.set(0, 0, 15.5);
    body.yaw = 0;
    body.pitch = 0;
    match.state.money = 4100;
    toggleBuy();
    settle(10);
    syncCamera();
  } else if (name === 'play') {
    // Mid-fight: live round, an enemy in the sights down Mid, tracer just fired.
    match.state.phase = 'live';
    match.state.phaseT = 62;
    match.state.score = { attackers: 2, defenders: 1 };
    match.state.money = 1250;
    match.state.round = 4;
    hp = 78;
    body.position.set(0.5, 0, 6);
    settle(30);
    const enemy = bots.bots.find((b) => b.team === 'defenders' && b.alive);
    if (enemy) {
      enemy.group.position.set(1.2, 0, -6.5);
      enemy.yaw = Math.PI;
      enemy.group.rotation.y = Math.PI;
    }
    const friend = bots.bots.find((b) => b.team === 'attackers' && b.alive);
    if (friend) {
      friend.group.position.set(-3.4, 0, 2.5);
      friend.yaw = 0.3;
      friend.group.rotation.y = 0.3;
    }
    settle(5);
    if (enemy) {
      aimAt(new THREE.Vector3(enemy.group.position.x, 1.3, enemy.group.position.z));
      shoot(0);
      hud.hitMarker(false, 4000);
    }
    settle(8);
    hud.hideBanner();
    syncCamera();
  } else {
    // Round won, for real: the player drops the last defenders, the round ends
    // through the normal elimination path, and the banner is the game's own.
    match.state.phase = 'live';
    match.state.phaseT = 62;
    match.state.score = { attackers: 2, defenders: 1 };
    match.state.round = 5;
    const defenders = bots.bots.filter((b) => b.team === 'defenders' && b.alive);
    for (const bot of defenders) bots.damageBot(bot, 999, 'player');
    body.position.set(9, 0, -6);
    settle(2);
    aimAt(new THREE.Vector3(14.5, 1.2, -12.5));
    settle(2);
    syncCamera();
  }
  hud.setScore(match.state.score.attackers, match.state.score.defenders, match.state.round);
  hud.setMoney(match.state.money);
  hud.setHealth(hp, armour);
  hud.setAmmo(weapon.current.mag, weapon.current.reserve, weapon.def.name);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = {
  get phase() { return match.state.phase; },
  get score() { return match.state.score; },
  get money() { return match.state.money; },
  get hp() { return hp; },
  get elapsed() { return elapsed; },
  get round() { return match.state.round; },
  get pos() { return [body.position.x, body.position.z]; },
  get weapon() { return weapon.def.id; },
  get mag() { return weapon.current.mag; },
  get grenades() { return weapon.state.grenades; },
  get armour() { return armour; },
  botsAlive(team) { return bots.aliveCount(team); },
};

syncCamera();
match.startRound();
hud.setAmmo(weapon.current.mag, weapon.current.reserve, weapon.def.name);
hud.setHealth(hp, armour);
hud.setMoney(match.state.money);
hud.setScore(0, 0, 1);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
