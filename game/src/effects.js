// Tracers, impact sparks and the bomb blast. Fixed pools, no allocation in the hot
// loop: every tracer and spark is created once at boot and reused.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const SPARKS = 160;

export function createEffects(scene) {
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(TRACERS * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 });
  const tracerLines = new THREE.LineSegments(tracerGeo, tracerMat);
  tracerLines.frustumCulled = false;
  scene.add(tracerLines);
  const tracerLife = new Float32Array(TRACERS);
  let tracerNext = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0.9, sizeAttenuation: true });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  let sparkNext = 0;

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 30);
  scene.add(blastLight);
  let blastT = 0;

  const tmp = new THREE.Vector3();

  function tracer(from, to) {
    const i = tracerNext;
    tracerNext = (tracerNext + 1) % TRACERS;
    tracerPos[i * 6] = from.x; tracerPos[i * 6 + 1] = from.y; tracerPos[i * 6 + 2] = from.z;
    tracerPos[i * 6 + 3] = to.x; tracerPos[i * 6 + 4] = to.y; tracerPos[i * 6 + 5] = to.z;
    tracerLife[i] = 0.09;
    tracerGeo.attributes.position.needsUpdate = true;
  }

  function impact(point, count = 8) {
    for (let n = 0; n < count; n += 1) {
      const i = sparkNext;
      sparkNext = (sparkNext + 1) % SPARKS;
      sparkPos[i * 3] = point.x; sparkPos[i * 3 + 1] = point.y; sparkPos[i * 3 + 2] = point.z;
      sparkVel[i * 3] = (Math.random() - 0.5) * 4;
      sparkVel[i * 3 + 1] = Math.random() * 3;
      sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 4;
      sparkLife[i] = 0.35 + Math.random() * 0.25;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function explode(point) {
    blast.position.copy(point);
    blast.visible = true;
    blastT = 0.7;
    blastLight.position.copy(point);
    blastLight.intensity = 60;
    impact(point, 40);
  }

  function step(dt) {
    for (let i = 0; i < TRACERS; i += 1) {
      if (tracerLife[i] > 0) {
        tracerLife[i] -= dt;
        if (tracerLife[i] <= 0) {
          tracerPos[i * 6 + 3] = tracerPos[i * 6];
          tracerPos[i * 6 + 4] = tracerPos[i * 6 + 1];
          tracerPos[i * 6 + 5] = tracerPos[i * 6 + 2];
          tracerGeo.attributes.position.needsUpdate = true;
        }
      }
    }
    for (let i = 0; i < SPARKS; i += 1) {
      if (sparkLife[i] > 0) {
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 9 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        if (sparkPos[i * 3 + 1] < 0.02) sparkPos[i * 3 + 1] = 0.02;
      }
    }
    sparkGeo.attributes.position.needsUpdate = true;
    if (blastT > 0) {
      blastT -= dt;
      const k = 1 - blastT / 0.7;
      const r = 1 + k * 9;
      blast.scale.set(r, r, r);
      blast.material.opacity = Math.max(0, 0.75 * (1 - k));
      blastLight.intensity = Math.max(0, 60 * (1 - k));
      if (blastT <= 0) { blast.visible = false; blastLight.intensity = 0; }
    }
  }

  return { tracer, impact, explode, step, _tmp: tmp };
}
