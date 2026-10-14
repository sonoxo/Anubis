// Fully synthesised WebAudio sound design: coaxial blade slap, turbine whine, pusher buzz, wind, rain,
// thunder, cannon, rockets, missiles, flares, explosions with distance delay + air absorption, UI ticks.
export class AudioEngine {
  constructor() {
    this.ctx = null; this.ready = false; this.listener = { x: 0, y: 0, z: 0 };
    // silent for automated testing / captures: ?mute, ?capture=..., ?shot=...
    const q = new URLSearchParams(location.search);
    this.muted = q.has('mute') || q.has('capture') || q.has('shot');
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    // cockpit muffling filter for engine bus
    this.engBus = ctx.createGain(); this.engFilt = ctx.createBiquadFilter(); this.engFilt.type = 'lowpass'; this.engFilt.frequency.value = 18000;
    this.engBus.connect(this.engFilt); this.engFilt.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    // noise buffers
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0); let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // --- rotor: chopped brown noise + sub thump
    this.rotorGain = ctx.createGain(); this.rotorGain.gain.value = 0;
    const rn = loop(this.brownBuf);
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 420;
    this.rotorAM = ctx.createGain(); this.rotorAM.gain.value = 0.35;
    this.rotorLFO = ctx.createOscillator(); this.rotorLFO.type = 'sawtooth'; this.rotorLFO.frequency.value = 1;
    const lfoShape = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 255 * 2 - 1; curve[i] = Math.pow(Math.max(0, x), 3) * 1.4; } lfoShape.curve = curve;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.9;
    this.rotorLFO.connect(lfoShape); lfoShape.connect(lfoGain); lfoGain.connect(this.rotorAM.gain);
    rn.connect(rf); rf.connect(this.rotorAM); this.rotorAM.connect(this.rotorGain);
    this.thump = ctx.createOscillator(); this.thump.type = 'sine'; this.thump.frequency.value = 22;
    const thG = ctx.createGain(); thG.gain.value = 0.35; this.thump.connect(thG); thG.connect(this.rotorGain);
    this.rotorGain.connect(this.engBus);
    this.rotorLFO.start(); this.thump.start();
    // --- turbine whine
    this.turbGain = ctx.createGain(); this.turbGain.gain.value = 0;
    this.t1 = ctx.createOscillator(); this.t1.type = 'sawtooth'; this.t2 = ctx.createOscillator(); this.t2.type = 'triangle';
    const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.Q.value = 6; this.turbFilt = tf;
    const t1g = ctx.createGain(); t1g.gain.value = 0.05; const t2g = ctx.createGain(); t2g.gain.value = 0.08;
    this.t1.connect(t1g); this.t2.connect(t2g); t1g.connect(tf); t2g.connect(this.turbGain); tf.connect(this.turbGain);
    const hiss = loop(this.noiseBuf); const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 4200;
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0; hiss.connect(hf); hf.connect(this.hissGain); this.hissGain.connect(this.engBus);
    this.turbGain.connect(this.engBus);
    this.t1.start(); this.t2.start();
    // --- pusher buzz
    this.pushGain = ctx.createGain(); this.pushGain.gain.value = 0;
    this.push = ctx.createOscillator(); this.push.type = 'sawtooth';
    const pf = ctx.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 700;
    this.push.connect(pf); pf.connect(this.pushGain); this.pushGain.connect(this.engBus); this.push.start();
    // --- ambience
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    const wn = loop(this.noiseBuf); this.windFilt = ctx.createBiquadFilter(); this.windFilt.type = 'bandpass'; this.windFilt.frequency.value = 500; this.windFilt.Q.value = 0.6;
    wn.connect(this.windFilt); this.windFilt.connect(this.windGain); this.windGain.connect(this.master);
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    const rnn = loop(this.noiseBuf); const rhf = ctx.createBiquadFilter(); rhf.type = 'highpass'; rhf.frequency.value = 1800;
    rnn.connect(rhf); rhf.connect(this.rainGain); this.rainGain.connect(this.master);
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    const hn = loop(this.brownBuf); const hlp = ctx.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 160;
    hn.connect(hlp); hlp.connect(this.humGain); this.humGain.connect(this.master);
    this.ready = true;
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.1); }
  setAmbience(a) { this.amb = a; }

  dist(p) { if (!p) return 0; const l = this.listener; return Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z); }

  update(s, camDist, cockpit, speed) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, k = 0.08;
    const att = 1 / (1 + camDist / 45);
    const rpm = s.rpm;
    const rev = rpm * 5.1;
    this.rotorLFO.frequency.setTargetAtTime(Math.max(0.5, rev * 4), t, k);
    this.thump.frequency.setTargetAtTime(Math.max(8, rev * 4), t, k);
    this.rotorGain.gain.setTargetAtTime(Math.min(1, rpm * 1.2) * (0.5 + s.thrust * 0.5) * 0.8 * att, t, k);
    const nf = 180 + rpm * 2600 + s.thrust * 300;
    this.t1.frequency.setTargetAtTime(nf, t, k); this.t2.frequency.setTargetAtTime(nf * 1.51, t, k);
    this.turbFilt.frequency.setTargetAtTime(nf * 1.2, t, k);
    this.turbGain.gain.setTargetAtTime(Math.min(1, rpm * 2) * 0.32 * att, t, k);
    this.hissGain.gain.setTargetAtTime(rpm * 0.08 * att, t, k);
    this.push.frequency.setTargetAtTime(30 + rpm * 120 + s.propThrust * 90, t, k);
    this.pushGain.gain.setTargetAtTime(rpm * (0.02 + s.propThrust * 0.07) * att, t, k);
    this.engFilt.frequency.setTargetAtTime(cockpit ? 900 : 18000, t, 0.2);
    const a = this.amb || {};
    this.windGain.gain.setTargetAtTime((a.wind ?? 0.2) * 0.12 + Math.min(1, speed / 70) * 0.12, t, 0.3);
    this.windFilt.frequency.setTargetAtTime(300 + speed * 12, t, 0.3);
    this.rainGain.gain.setTargetAtTime((a.rain ?? 0) * 0.08, t, 0.5);
    this.humGain.gain.setTargetAtTime((a.hum ?? 0) * 0.5, t, 0.5);
  }

  // ---------------- one-shots
  burst({ dur = 0.3, freq = 1000, q = 1, type = 'bandpass', gain = 0.5, sweep = null, delay = 0, decay = 3, buf = 'noise', dest }) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = buf === 'brown' ? this.brownBuf : this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.setTargetAtTime(0.0001, t + 0.01, dur / decay);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.6);
  }

  tone({ f0 = 100, f1 = 40, dur = 0.2, gain = 0.4, type = 'sine', delay = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  spatial(p, base = 1) { const d = this.dist(p); return { g: base / (1 + d / 60), delay: Math.min(3, d / 343), lp: 18000 / (1 + d / 120) }; }

  gun(p) { const s = this.spatial(p, 1); this.burst({ dur: 0.09, freq: 900, q: 0.7, gain: 0.55 * s.g, delay: s.delay * 0.2 }); this.tone({ f0: 120, f1: 45, dur: 0.1, gain: 0.5 * s.g, delay: s.delay * 0.2 }); }
  impact(p) { const s = this.spatial(p, 0.6); this.burst({ dur: 0.25, freq: 1600, q: 0.8, gain: 0.35 * s.g, delay: s.delay }); }
  rocket(p) { const s = this.spatial(p, 1); this.tone({ f0: 90, f1: 40, dur: 0.18, gain: 0.5 * s.g }); this.burst({ dur: 1.4, freq: 2500, sweep: 400, q: 0.6, gain: 0.4 * s.g, decay: 1.8 }); }
  missile(p) { const s = this.spatial(p, 1); this.burst({ dur: 2.8, freq: 900, sweep: 200, q: 0.5, gain: 0.5 * s.g, decay: 1.5, type: 'lowpass' }); this.burst({ dur: 0.6, freq: 3000, sweep: 800, q: 1, gain: 0.3 * s.g }); }
  clunk() { this.tone({ f0: 160, f1: 70, dur: 0.12, gain: 0.35, type: 'triangle' }); this.burst({ dur: 0.08, freq: 2400, q: 2, gain: 0.15 }); }
  bay() { this.burst({ dur: 0.9, freq: 700, sweep: 1100, q: 3, gain: 0.08, decay: 1.4 }); }
  flare(p) { const s = this.spatial(p, 1); this.tone({ f0: 300, f1: 90, dur: 0.07, gain: 0.3 * s.g }); this.burst({ dur: 1.4, freq: 3500, q: 0.6, gain: 0.15 * s.g, decay: 1.2 }); }
  explosion(p, size = 1) {
    const s = this.spatial(p, 1.4 * size);
    this.burst({ dur: 2.6 * size, freq: Math.min(2400, s.lp), sweep: 60, q: 0.4, type: 'lowpass', gain: Math.min(1, 0.9 * s.g), delay: s.delay, decay: 3, buf: 'brown' });
    this.burst({ dur: 0.5, freq: Math.min(5000, s.lp), sweep: 400, q: 0.5, type: 'lowpass', gain: Math.min(1, 0.7 * s.g), delay: s.delay });
    this.tone({ f0: 70, f1: 22, dur: 1.4 * size, gain: Math.min(1, 0.9 * s.g), delay: s.delay });
  }
  thunder(d) {
    const delay = Math.min(4, d / 343), g = 1 / (1 + d / 900);
    this.burst({ dur: 0.25, freq: 3000, q: 0.4, type: 'lowpass', gain: 0.4 * g, delay });
    for (let i = 0; i < 5; i++) this.burst({ dur: 2.5 + Math.random() * 2, freq: 180 + Math.random() * 120, sweep: 50, q: 0.3, type: 'lowpass', gain: 0.6 * g, delay: delay + i * 0.35 + Math.random() * 0.3, decay: 2.2, buf: 'brown' });
  }
  gear() { this.burst({ dur: 2.2, freq: 900, sweep: 600, q: 6, gain: 0.05, decay: 1.2 }); this.tone({ f0: 220, f1: 180, dur: 2, gain: 0.03, type: 'square' }); }
  canopy() { this.burst({ dur: 1.2, freq: 3200, sweep: 1800, q: 1.2, gain: 0.1, decay: 1.5 }); }
  reload() { this.tone({ f0: 800, f1: 400, dur: 0.08, gain: 0.08, type: 'triangle' }); this.tone({ f0: 600, f1: 300, dur: 0.08, gain: 0.08, type: 'triangle', delay: 0.1 }); }
  click(v = 0.12) { this.tone({ f0: 2400, f1: 1200, dur: 0.035, gain: v * 0.5, type: 'triangle' }); }
  whoosh() { this.burst({ dur: 0.9, freq: 300, sweep: 2600, q: 0.8, gain: 0.12, decay: 1.6 }); }
}
