// The arsenal: three original weapons plus a frag grenade, each with its own view
// model, fire rate, damage falloff and spread. The weapon owns its numbers and its
// magazine; main.js owns the ray and the damage. Spread grows with movement speed and
// with sustained fire, so stopping to aim pays — the same rule bots are judged by.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 300, auto: false, mag: 12, reserve: 36,
    gap: 0.16, reload: 1.4, damage: 26, headMult: 4, falloff: 0.45, pellets: 1,
    spreadStill: 0.003, spreadMove: 0.02, kick: 0.006,
  },
  rifle: {
    id: 'rifle', name: 'VK-9 Raptor', price: 2700, auto: true, mag: 30, reserve: 90,
    gap: 0.096, reload: 1.9, damage: 34, headMult: 4, falloff: 0.55, pellets: 1,
    spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009,
  },
  shotgun: {
    id: 'shotgun', name: 'Scatter-12', price: 1700, auto: false, mag: 6, reserve: 24,
    gap: 0.85, reload: 2.6, damage: 12, headMult: 2, falloff: 0.3, pellets: 8,
    spreadStill: 0.02, spreadMove: 0.045, kick: 0.03,
  },
};

export const GRENADE = { id: 'grenade', name: 'Sunder Charge', price: 300, fuse: 2.4, radius: 7, maxDamage: 110 };
export const ARMOUR = { id: 'armour', name: 'Plate Vest', price: 650, absorb: 0.5 };

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.45, metalness: 0.55 });
  const model = new THREE.Group();
  if (def.id === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.26), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.08), grip);
    handle.position.set(0, -0.08, 0.08);
    model.add(slide, handle);
  } else if (def.id === 'shotgun') {
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.62), body);
    barrel.position.set(0, 0.02, -0.2);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.2), grip);
    pump.position.set(0, -0.03, -0.28);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.24), grip);
    stock.position.set(0, -0.02, 0.32);
    model.add(barrel, pump, stock);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.08), grip);
    sight.position.set(0, 0.08, -0.05);
    model.add(receiver, barrel, stock, sight);
  }
  model.position.set(0.22, -0.24, -0.52);
  model.scale.setScalar(0.85);
  return model;
}

export function createWeapon(camera) {
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // The player owns one of each weapon they bought; switching swaps the view model.
  const owned = {
    pistol: { def: WEAPONS.pistol, mag: 12, reserve: 36 },
    rifle: null,
    shotgun: null,
  };
  let current = owned.pistol;
  let model = buildViewModel(current.def);
  camera.add(model);

  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, heat: 0, grenades: 0 };

  function swapModel() {
    camera.remove(model);
    model = buildViewModel(current.def);
    camera.add(model);
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.heat = Math.max(0, state.heat - dt * 0.9);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.52 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (current.def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = current.def.mag - current.mag;
        const take = Math.min(need, current.reserve);
        current.mag += take;
        current.reserve -= take;
      }
    }
  }

  return {
    state,
    get current() { return current; },
    get def() { return current.def; },
    owned,
    step,
    ready() {
      return current.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current.def.gap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.heat = Math.min(1, state.heat + (current.def.id === 'rifle' ? 0.09 : 0.05));
    },
    takeRound() {
      if (current.mag <= 0) return false;
      current.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || current.mag === current.def.mag || current.reserve === 0) return;
      state.reloadLeft = current.def.reload;
    },
    // Spread: still base + movement + sustained-fire heat. Crouching halves the move term.
    spread(speed, crouching) {
      const move = Math.min(1, speed / 5.2) * current.def.spreadMove * (crouching ? 0.5 : 1);
      return current.def.spreadStill + move + state.heat * 0.012;
    },
    select(id) {
      if (!owned[id] || owned[id] === current) return false;
      current = owned[id];
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      swapModel();
      return true;
    },
    buy(id) {
      if (owned[id]) return false;
      owned[id] = { def: WEAPONS[id], mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      return true;
    },
    refillAmmo() {
      for (const slot of Object.values(owned)) {
        if (slot) slot.reserve = slot.def.reserve;
      }
    },
    reset() {
      owned.rifle = null;
      owned.shotgun = null;
      current = owned.pistol;
      owned.pistol.mag = 12;
      owned.pistol.reserve = 36;
      state.grenades = 0;
      state.reloadLeft = 0;
      state.cooldown = 0;
      state.heat = 0;
      swapModel();
    },
  };
}
