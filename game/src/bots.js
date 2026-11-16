// The bots: five enemies and four teammates who play the round for real. Each bot
// walks the map's waypoint graph (BFS), holds a site, reacts to what it sees and hears,
// fires in bursts with distance and movement in its accuracy, plants the spike when it
// carries one and defuses when the other team planted. No bot knows anything the player
// could not see or hear: line of sight is a real raycast against the world's boxes.
import * as THREE from 'three';
import { MAP } from './world.js';

const NAMES_ATTACK = ['Vex', 'Mara', 'Juno', 'Kip', 'Sable'];
const NAMES_DEFEND = ['Rook', 'Ash', 'Dune', 'Pike', 'Wren'];
const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.55;

function bfsPath(start, goal, adjacency) {
  if (start === goal) return [goal];
  const prev = new Array(adjacency.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length) {
    const node = queue.shift();
    for (const next of adjacency[node]) {
      if (prev[next] === -1) {
        prev[next] = node;
        if (next === goal) {
          const path = [goal];
          let cur = goal;
          while (cur !== start) { cur = prev[cur]; path.unshift(cur); }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [goal];
}

export function createBots(scene, world, player, hooks) {
  const adjacency = MAP.waypoints.map(() => []);
  for (const [a, b] of MAP.edges) { adjacency[a].push(b); adjacency[b].push(a); }
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const fromEye = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const probe = new THREE.Box3();
  const bots = [];
  const hitMeshes = [];

  function overlaps(x, y, z) {
    probe.min.set(x - RADIUS, y + 0.04, z - RADIUS);
    probe.max.set(x + RADIUS, y + HEIGHT - 0.04, z + RADIUS);
    for (const c of world.colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < MAP.waypoints.length; i += 1) {
      const dx = MAP.waypoints[i][0] - x;
      const dz = MAP.waypoints[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function makeBot(name, team, spawn, skill) {
    const colour = team === 'attackers' ? 0x3fa796 : 0xe2603a;
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.7, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.32), bodyMat);
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.34), darkMat);
    head.position.y = 1.58;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: team === 'attackers' ? 0x9ff5e4 : 0xffc9a8 }));
    visor.position.set(0, 1.6, -0.18);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), darkMat);
    gun.position.set(0.2, 1.15, -0.35);
    group.add(body, head, visor, gun);
    group.position.set(spawn[0], 0, spawn[1]);
    scene.add(group);
    body.userData = { bot: null, part: 'body' };
    head.userData = { bot: null, part: 'head' };
    const bot = {
      name, team, group, skill, hp: 100, alive: true, yaw: team === 'attackers' ? 0 : Math.PI,
      state: 'move', path: [], pathIdx: 0, holdNode: 0, targetSite: 'A',
      burstLeft: 0, burstGap: 0, cooldown: 0, perceiveAt: Math.random() * 0.15,
      strafeDir: 1, strafeAt: 0, visibleEnemy: null, investigate: null,
      channel: 0, channelKind: null, carrying: false, speed: 3.4 + skill * 0.5,
      stepAt: 0, deadAt: 0, flashAt: 0,
    };
    body.userData.bot = bot;
    head.userData.bot = bot;
    bot.bodyMesh = body;
    bot.headMesh = head;
    hitMeshes.push(body, head);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) {
    bots.push(makeBot(NAMES_ATTACK[i + 1], 'attackers', MAP.spawns.attackers[i + 1], 0.35 + Math.random() * 0.3));
  }
  for (let i = 0; i < 5; i += 1) {
    bots.push(makeBot(NAMES_DEFEND[i], 'defenders', MAP.spawns.defenders[i], 0.35 + Math.random() * 0.3));
  }

  function losClear(from, to) {
    fromEye.copy(from);
    dir.copy(to).sub(from);
    const dist = dir.length();
    if (dist < 0.1) return true;
    dir.normalize();
    raycaster.set(fromEye, dir);
    raycaster.far = dist;
    return raycaster.intersectObjects(world.shootables, false).length === 0;
  }

  // Can this bot see the player right now? Range, facing, light-of-sight, and the
  // player is easier to spot while moving or firing.
  function seesPlayer(bot) {
    if (!player.alive) return false;
    const dx = player.pos.x - bot.group.position.x;
    const dz = player.pos.z - bot.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 46) return false;
    const facing = Math.atan2(-dx, -dz);
    let diff = Math.abs(((facing - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const spot = player.firedAt > 0 ? 2.6 : 1.0;
    if (diff > 1.9 * spot && dist > 6) return false;
    const eye = new THREE.Vector3(bot.group.position.x, EYE, bot.group.position.z);
    const target = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    return losClear(eye, target);
  }

  function seesBot(bot, other) {
    if (!other.alive) return false;
    const dx = other.group.position.x - bot.group.position.x;
    const dz = other.group.position.z - bot.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 42) return false;
    const eye = new THREE.Vector3(bot.group.position.x, EYE, bot.group.position.z);
    const target = new THREE.Vector3(other.group.position.x, 1.2, other.group.position.z);
    return losClear(eye, target);
  }

  function setPath(bot, goalNode) {
    const start = nearestNode(bot.group.position.x, bot.group.position.z);
    bot.path = bfsPath(start, goalNode, adjacency);
    bot.pathIdx = 0;
    bot.state = 'move';
  }

  function moveAlongPath(bot, dt) {
    if (bot.pathIdx >= bot.path.length) { bot.state = 'hold'; return; }
    const node = MAP.waypoints[bot.path[bot.pathIdx]];
    const dx = node[0] - bot.group.position.x;
    const dz = node[1] - bot.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) { bot.pathIdx += 1; return; }
    const step = bot.speed * dt;
    const nx = bot.group.position.x + (dx / dist) * step;
    const nz = bot.group.position.z + (dz / dist) * step;
    if (!overlaps(nx, bot.group.position.y, bot.group.position.z)) bot.group.position.x = nx;
    if (!overlaps(bot.group.position.x, bot.group.position.y, nz)) bot.group.position.z = nz;
    bot.yaw = Math.atan2(-(dx / dist), -(dz / dist));
    bot.group.rotation.y = bot.yaw;
  }

  function fireAt(bot, targetPos, isPlayer, dt, targetBot) {
    bot.burstGap -= dt;
    if (bot.burstGap > 0) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(Math.random() * 3);
      bot.cooldown = 0.55 + Math.random() * 0.7;
    }
    bot.burstLeft -= 1;
    bot.burstGap = 0.11;
    const from = new THREE.Vector3(bot.group.position.x + 0.2, 1.35, bot.group.position.z);
    const dist = from.distanceTo(targetPos);
    // Accuracy: close and still is deadly, far and moving is a prayer.
    const targetSpeed = isPlayer ? player.speed : 2.5;
    let chance = 0.62 - dist * 0.008 - targetSpeed * 0.03 - (1 - bot.skill) * 0.18;
    if (isPlayer && player.crouching) chance -= 0.06;
    chance = Math.max(0.05, Math.min(0.8, chance));
    const hit = Math.random() < chance;
    const aim = targetPos.clone();
    if (!hit) {
      aim.x += (Math.random() - 0.5) * 1.6;
      aim.y += (Math.random() - 0.5) * 1.2;
      aim.z += (Math.random() - 0.5) * 1.6;
    }
    hooks.tracer(from, aim, bot.team);
    hooks.shotSound(bot.group.position, dist);
    if (hit) {
      const dmg = Math.round((14 + Math.random() * 12) * (dist > 25 ? 0.7 : 1));
      if (isPlayer) hooks.onPlayerHit(dmg, bot);
      else if (targetBot) damageBot(targetBot, dmg, bot);
    }
    if (bot.burstLeft <= 0) bot.burstGap = bot.cooldown;
  }

  function damageBot(bot, dmg, attacker) {
    if (!bot.alive) return;
    bot.hp -= dmg;
    bot.flashAt = 0.12;
    if (attacker && attacker.group && attacker.team !== bot.team) bot.investigate = { x: attacker.group.position.x, z: attacker.group.position.z };
    if (bot.hp <= 0) {
      bot.alive = false;
      bot.deadAt = 0;
      bot.group.rotation.z = Math.PI / 2;
      bot.group.position.y = 0.15;
      hooks.onBotKilled(bot, attacker);
    }
  }

  function reset(round) {
    const planSite = Math.random() < 0.5 ? 'A' : 'B';
    let ai = 0;
    let di = 0;
    for (const bot of bots) {
      bot.hp = 100;
      bot.alive = true;
      bot.channel = 0;
      bot.channelKind = null;
      bot.carrying = false;
      bot.investigate = null;
      bot.visibleEnemy = null;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.y = 0;
      if (bot.team === 'attackers') {
        const spawn = MAP.spawns.attackers[ai];
        ai += 1;
        bot.group.position.set(spawn[0], 0, spawn[1]);
        bot.yaw = 0;
        bot.targetSite = planSite;
        if (ai === 1) bot.carrying = true;
        bot.holdNode = planSite === 'A' ? 10 : 15;
        // Attackers split: three push the called site, one goes mid, one the other site.
        if (ai === 4) bot.holdNode = 4;
        if (ai === 3) bot.holdNode = planSite === 'A' ? 15 : 10;
        setPath(bot, bot.holdNode);
      } else {
        const spawn = MAP.spawns.defenders[di];
        di += 1;
        bot.group.position.set(spawn[0], 0, spawn[1]);
        bot.yaw = Math.PI;
        // Defenders: two hold each site, one holds mid.
        bot.holdNode = di <= 2 ? (planSite === 'A' ? 10 : 15) : di <= 4 ? (planSite === 'A' ? 15 : 10) : 5;
        if (di === 5) bot.holdNode = 5;
        setPath(bot, bot.holdNode);
      }
      bot.group.rotation.y = bot.yaw;
    }
    hooks.onPlan(planSite);
  }

  function step(dt, time, bomb, live) {
    for (const bot of bots) {
      if (!bot.alive) {
        bot.deadAt += dt;
        if (bot.deadAt > 4) bot.group.position.y = Math.max(-1.4, bot.group.position.y - dt * 0.5);
        continue;
      }
      bot.perceiveAt -= dt;
      bot.cooldown -= dt;
      if (bot.flashAt > 0) bot.flashAt -= dt;

      // Perception, staggered so not every bot thinks on the same tick.
      if (bot.perceiveAt <= 0) {
        bot.perceiveAt = 0.15 + Math.random() * 0.1;
        bot.visibleEnemy = null;
        if (live && bot.team === 'defenders' && seesPlayer(bot)) bot.visibleEnemy = 'player';
        else if (live && bot.team === 'attackers') {
          for (const other of bots) {
            if (other.team === 'defenders' && seesBot(bot, other)) { bot.visibleEnemy = other; break; }
          }
        } else if (live) {
          for (const other of bots) {
            if (other.team === 'attackers' && seesBot(bot, other)) { bot.visibleEnemy = other; break; }
          }
        }
        if (bot.visibleEnemy) bot.state = 'engage';
        else if (bot.state === 'engage') bot.state = bot.pathIdx < bot.path.length ? 'move' : 'hold';
      }

      // Bomb duties outrank everything except a visible enemy.
      if (live && bomb.planted && bot.team === 'defenders' && !bot.visibleEnemy) {
        const d = Math.hypot(bomb.x - bot.group.position.x, bomb.z - bot.group.position.z);
        if (d < 1.6) {
          bot.state = 'defuse';
        } else if (bot.state !== 'defuse') {
          setPath(bot, nearestNode(bomb.x, bomb.z));
        }
      } else if (live && !bomb.planted && bot.carrying && bot.team === 'attackers' && !bot.visibleEnemy) {
        const site = MAP.sites[bot.targetSite];
        const d = Math.hypot(site.x - bot.group.position.x, site.z - bot.group.position.z);
        if (d < site.r * 0.7) bot.state = 'plant';
        else if (bot.state === 'plant') setPath(bot, bot.holdNode);
      }

      if (live && bot.state === 'engage' && bot.visibleEnemy) {
        const targetPos = bot.visibleEnemy === 'player'
          ? new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z)
          : new THREE.Vector3(bot.visibleEnemy.group.position.x, 1.2, bot.visibleEnemy.group.position.z);
        const dx = targetPos.x - bot.group.position.x;
        const dz = targetPos.z - bot.group.position.z;
        bot.yaw = Math.atan2(-dx, -dz);
        bot.group.rotation.y = bot.yaw;
        // Strafe sideways while firing so a duel is a duel.
        bot.strafeAt -= dt;
        if (bot.strafeAt <= 0) { bot.strafeDir *= -1; bot.strafeAt = 0.7 + Math.random() * 0.8; }
        const px = -dz / (Math.hypot(dx, dz) || 1);
        const pz = dx / (Math.hypot(dx, dz) || 1);
        const nx = bot.group.position.x + px * bot.strafeDir * bot.speed * 0.5 * dt;
        const nz = bot.group.position.z + pz * bot.strafeDir * bot.speed * 0.5 * dt;
        if (!overlaps(nx, 0, bot.group.position.z)) bot.group.position.x = nx;
        if (!overlaps(bot.group.position.x, 0, nz)) bot.group.position.z = nz;
        if (bot.cooldown <= 0) fireAt(bot, targetPos, bot.visibleEnemy === 'player', dt, bot.visibleEnemy === 'player' ? null : bot.visibleEnemy);
      } else if (bot.state === 'plant') {
        if (bomb.planted) { bot.state = 'hold'; bot.channel = 0; return; }
        bot.channel += dt;
        hooks.onChannel(bot, 'plant', bot.channel / 3);
        if (bot.channel >= 3) {
          bot.channel = 0;
          bot.carrying = false;
          hooks.onPlanted(bot);
        }
      } else if (bot.state === 'defuse') {
        bot.channel += dt;
        hooks.onChannel(bot, 'defuse', bot.channel / 5);
        if (bot.channel >= 5) {
          bot.channel = 0;
          hooks.onDefused(bot);
        }
      } else if (bot.state === 'move') {
        if (bot.investigate) {
          const d = Math.hypot(bot.investigate.x - bot.group.position.x, bot.investigate.z - bot.group.position.z);
          if (d < 1) bot.investigate = null;
          else {
            const goal = nearestNode(bot.investigate.x, bot.investigate.z);
            if (bot.pathIdx >= bot.path.length || nearestNode(bot.group.position.x, bot.group.position.z) === goal) {
              setPath(bot, goal);
            }
          }
        }
        moveAlongPath(bot, dt);
      } else if (bot.state === 'hold') {
        // Hold the angle: slow scan, and answer a sound.
        bot.yaw += Math.sin(time * 0.4 + bot.skill * 10) * dt * 0.35;
        bot.group.rotation.y = bot.yaw;
        if (bot.investigate) setPath(bot, nearestNode(bot.investigate.x, bot.investigate.z));
      }

      // Footstep tick for the nearest bots, so the player hears a push coming.
      bot.stepAt -= dt;
      if (bot.stepAt <= 0 && (bot.state === 'move' || bot.state === 'engage')) {
        bot.stepAt = 0.55;
        const d = Math.hypot(bot.group.position.x - player.pos.x, bot.group.position.z - player.pos.z);
        if (d < 14) hooks.stepSound(d);
      }
    }
  }

  return {
    bots,
    hitMeshes,
    reset,
    step,
    damageBot,
    damageArea(pos, radius, maxDmg, attacker) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = bot.group.position.distanceTo(pos);
        if (d < radius) damageBot(bot, Math.round(maxDmg * (1 - d / radius)), attacker);
      }
    },
    hearShot(pos, team) {
      for (const bot of bots) {
        if (!bot.alive || bot.team === team) continue;
        const d = Math.hypot(bot.group.position.x - pos.x, bot.group.position.z - pos.z);
        if (d < 26) bot.investigate = { x: pos.x, z: pos.z };
      }
    },
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
    carrierAlive() {
      return bots.some((b) => b.alive && b.carrying);
    },
  };
}
