// Procedural sound: every effect is synthesised with WebAudio, so the game ships no
// audio assets and loads nothing over the network. One shared noise buffer, reused.
let ctx = null;
let noiseBuf = null;

function ensure() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(dur, filterFreq, gain, type = 'lowpass') {
  const c = ensure();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  src.connect(filter).connect(g).connect(c.destination);
  src.start();
  src.stop(c.currentTime + dur);
}

function tone(freq, dur, gain, type = 'sine', slideTo = 0) {
  const c = ensure();
  if (!c) return;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
}

export const sfx = {
  unlock() { ensure(); },
  shot(kind) {
    if (kind === 'shotgun') { noise(0.22, 900, 0.5); tone(120, 0.12, 0.25, 'square', 60); }
    else if (kind === 'pistol') { noise(0.12, 1400, 0.35); tone(220, 0.07, 0.15, 'square', 110); }
    else { noise(0.14, 1100, 0.42); tone(160, 0.09, 0.2, 'square', 70); }
  },
  distantShot() { noise(0.18, 500, 0.12); },
  reload() { tone(700, 0.05, 0.12, 'square'); setTimeout(() => tone(500, 0.05, 0.12, 'square'), 220); },
  dryFire() { tone(900, 0.04, 0.1, 'square'); },
  hit() { tone(1400, 0.06, 0.18, 'sine'); },
  kill() { tone(880, 0.09, 0.2, 'sine'); setTimeout(() => tone(1320, 0.12, 0.2, 'sine'), 90); },
  hurt() { noise(0.15, 300, 0.3); tone(180, 0.15, 0.2, 'sawtooth', 90); },
  explode() {
    noise(0.9, 350, 0.9);
    tone(90, 0.7, 0.5, 'sine', 35);
  },
  beep(high) { tone(high ? 1560 : 1040, 0.09, 0.16, 'sine'); },
  plant() { tone(1200, 0.3, 0.15, 'sine', 900); },
  defuse() { tone(900, 0.3, 0.15, 'sine', 1200); },
  buy() { tone(660, 0.08, 0.15, 'sine'); setTimeout(() => tone(990, 0.1, 0.15, 'sine'), 80); },
  denied() { tone(220, 0.15, 0.18, 'square', 160); },
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.2, 'sine'), i * 120)); },
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.18, 'sine'), i * 130)); },
  step() { noise(0.05, 400, 0.05); },
};
