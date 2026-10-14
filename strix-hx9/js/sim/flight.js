// Autonomous flight model for a coaxial compound: spool-up, lift-off, hover checks, then a self-directed
// sortie of cruise legs, orbits, pedal turns, low sprints, zoom climbs and (in combat stance) attack runs.
// Attitude is derived from required thrust vector; the pusher off-loads the rotor at speed (level fuselage).
import * as THREE from 'three';
import { Simplex, clamp, damp, lerp } from '../core/noise.js';

const G = 9.81;

export class FlightSim {
  constructor() {
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.acc = new THREE.Vector3();
    this.heading = Math.PI * 0.25; this.pitch = 0; this.roll = 0; this.yawRate = 0;
    this.rpm = 0; this.collective = 0.15; this.cyclic = { pitch: 0, roll: 0 }; this.yawCmd = 0;
    this.thrust = 0; this.torque = 0; this.tgt = 15; this.fuel = 1; this.propThrust = 0;
    this.phase = 'parked'; this.phaseT = 0;
    this.stance = 'parked';
    this.noise = new Simplex(808);
    this.t = 0;
    this.man = null;
    this.events = { fire: () => {}, phase: () => {} };
    this.world = null;
    this.fanTilt = 0;
  }

  setWorld(w) {
    this.world = w;
    if (!this.airborne) { this.pos.set(0, w.padY, 0); this.vel.set(0, 0, 0); }
    else this.pos.y = Math.max(this.pos.y, this.ground(this.pos.x, this.pos.z) + 25);
  }

  get airborne() { return ['takeoff', 'flying', 'rtb', 'landing'].includes(this.phase) && this.pos.y - (this.world?.padY ?? 0) > 0.02 || this.phase === 'flying' || this.phase === 'rtb'; }

  ground(x, z) {
    const w = this.world; if (!w) return 0;
    let g = w.heightAt(x, z);
    if (w.waterY !== undefined) g = Math.max(g, w.waterY);
    if (w.floor && Math.hypot(x, z) > (w.floorRadius ?? 0)) g = Math.max(g, w.floor - 30);
    return g;
  }

  setPhase(p) { this.phase = p; this.phaseT = 0; this.events.phase(p); }

  toggle() {
    switch (this.phase) {
      case 'parked': case 'spooldown': this.setPhase('spoolup'); return 'launch';
      case 'spoolup': this.setPhase('spooldown'); return 'abort';
      case 'takeoff': case 'flying': this.setPhase('rtb'); this.man = null; return 'rtb';
      case 'rtb': case 'landing': this.setPhase('flying'); this.man = null; return 'resume';
    }
  }

  // ------------------------------------------------------------ maneuver planner
  pickManeuver() {
    const r = Math.random();
    const w = this.world, home = new THREE.Vector3(0, 0, 0);
    const farFromHome = Math.hypot(this.pos.x, this.pos.z) > 700;
    const fwd = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const baseAgl = this.stance === 'stealth' ? 14 : this.stance === 'cruise' ? 70 : 40;
    const pick = (type, o) => ({ type, t: 0, ...o });
    if (this.stance === 'combat' && r < 0.45 && !farFromHome) {
      const tgt = this.pos.clone().addScaledVector(fwd, 520 + Math.random() * 200).add(new THREE.Vector3((Math.random() - 0.5) * 300, 0, (Math.random() - 0.5) * 300));
      tgt.y = w.heightAt(tgt.x, tgt.z);
      return pick('attack', { tgt, dur: 22, fired: {} });
    }
    if (farFromHome || r < 0.32) {
      const a = Math.random() * Math.PI * 2, d = 150 + Math.random() * 450;
      const wp = farFromHome ? home.clone().add(new THREE.Vector3(Math.cos(a) * 200, 0, Math.sin(a) * 200)) : new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
      const spd = this.stance === 'cruise' ? 62 + Math.random() * 18 : this.stance === 'stealth' ? 30 : 32 + Math.random() * 30;
      return pick('cruise', { wp, spd, agl: baseAgl + Math.random() * 40, dur: 30 });
    }
    if (r < 0.52) {
      const c = this.pos.clone().addScaledVector(fwd, 120 + Math.random() * 80);
      return pick('orbit', { c, rad: 80 + Math.random() * 70, spd: 24 + Math.random() * 10, dir: Math.random() < 0.5 ? 1 : -1, face: Math.random() < 0.5, agl: baseAgl + 10, dur: 14 + Math.random() * 8 });
    }
    if (r < 0.66) return pick('hoverTurn', { dur: 11, agl: Math.max(18, baseAgl - 10), yawDir: Math.random() < 0.5 ? 1 : -1, hold: this.pos.clone() });
    if (r < 0.82) return pick('sprint', { dir: fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2), spd: 74, agl: this.stance === 'stealth' ? 10 : 16, dur: 7 });
    return pick('zoom', { dir: fwd.clone(), dur: 10 });
  }

  // ------------------------------------------------------------ main step
  update(dt, stance) {
    this.t += dt; this.phaseT += dt;
    this.stance = stance;
    const w = this.world;
    const padY = w ? w.padY : 0;
    const desV = new THREE.Vector3();
    let desHeading = null, altTarget = null, maxAcc = 6.5, vyLimit = [-7, 9];

    // rotor speed governor
    const rpmTarget = ['parked', 'spooldown'].includes(this.phase) ? 0 : 1;
    const rate = this.phase === 'spoolup' ? 0.13 + this.rpm * 0.1 : 0.11;
    this.rpm = rpmTarget > this.rpm ? Math.min(1, this.rpm + rate * dt) : Math.max(0, this.rpm - rate * dt * (this.rpm > 0.4 ? 0.9 : 0.6));

    const fwd = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    switch (this.phase) {
      case 'parked': case 'spooldown': case 'spoolup': {
        this.vel.set(0, 0, 0);
        this.pos.y = this.ground(this.pos.x, this.pos.z);
        if (this.phase === 'spoolup' && this.rpm >= 0.995) this.setPhase('takeoff');
        if (this.phase === 'spooldown' && this.rpm <= 0.001) { this.setPhase('parked'); this.fuel = 1; }
        break;
      }
      case 'takeoff': {
        const g0 = this.ground(this.pos.x, this.pos.z);
        altTarget = g0 + (this.phaseT < 4 ? 9 : 14);
        vyLimit = [-2, 2.6];
        desHeading = this.heading + 0.0;
        if (this.phaseT > 6.5) { this.setPhase('flying'); this.man = null; }
        break;
      }
      case 'flying': {
        if (!this.man || this.man.t > this.man.dur) this.man = this.pickManeuver();
        const m = this.man; m.t += dt;
        const res = this.fly(m, fwd);
        desV.copy(res.v); desHeading = res.heading; altTarget = res.alt; if (res.maxAcc) maxAcc = res.maxAcc;
        break;
      }
      case 'rtb': {
        const to = new THREE.Vector3(-this.pos.x, 0, -this.pos.z);
        const d = to.length();
        const spd = clamp(d * 0.32, 0, 55);
        desV.copy(to.normalize().multiplyScalar(spd));
        altTarget = Math.max(this.ground(this.pos.x, this.pos.z), padY) + (d > 120 ? 45 : 22);
        desHeading = d > 25 ? Math.atan2(-desV.z, desV.x) : null;
        maxAcc = 5;
        if (d < 3 && this.vel.length() < 2.5) this.setPhase('landing');
        break;
      }
      case 'landing': {
        desV.set(-this.pos.x * 0.8, 0, -this.pos.z * 0.8);
        const h = this.pos.y - padY;
        this.vel.y = -clamp(h * 0.35, 0.45, 4);
        altTarget = null;
        maxAcc = 2;
        if (h <= 0.03) {
          this.pos.y = padY; this.vel.set(0, 0, 0);
          this.setPhase('spooldown');
        }
        break;
      }
    }

    if (['takeoff', 'flying', 'rtb', 'landing'].includes(this.phase)) {
      // horizontal acceleration toward desired velocity
      const dv = new THREE.Vector3(desV.x - this.vel.x, 0, desV.z - this.vel.z).multiplyScalar(0.7);
      if (dv.length() > maxAcc) dv.setLength(maxAcc);
      // turbulence
      const tn = this.t * 0.35;
      dv.x += this.noise.noise(tn, 1.3) * 1.2; dv.z += this.noise.noise(tn, 7.1) * 1.2;
      let ay = 0;
      if (altTarget !== null) {
        // terrain look-ahead protection
        const ahead = this.pos.clone().addScaledVector(this.vel, 2.5);
        const minY = Math.max(this.ground(this.pos.x, this.pos.z), this.ground(ahead.x, ahead.z)) + (this.phase === 'takeoff' ? 0 : 9);
        const tgtY = Math.max(altTarget, minY);
        const vyDes = clamp((tgtY - this.pos.y) * 0.6, vyLimit[0], vyLimit[1]);
        ay = clamp((vyDes - this.vel.y) * 1.4, -4, 5) + this.noise.noise(tn, 3.3) * 0.5;
        this.vel.y += ay * dt;
      }
      this.acc.set(dv.x, ay, dv.z);
      this.vel.x += dv.x * dt; this.vel.z += dv.z * dt;
      this.pos.addScaledVector(this.vel, dt);
      const gNow = this.ground(this.pos.x, this.pos.z);
      if (this.phase !== 'landing' && this.pos.y < gNow + 0.5 && this.phase !== 'takeoff') { this.pos.y = gNow + 0.5; this.vel.y = Math.max(0, this.vel.y); }
      if (this.phase === 'takeoff') this.pos.y = Math.max(this.pos.y, gNow);
    }

    // heading
    const hspd = Math.hypot(this.vel.x, this.vel.z);
    if (desHeading === null && hspd > 7) desHeading = Math.atan2(-this.vel.z, this.vel.x);
    if (desHeading !== null && this.phase !== 'parked') {
      let dh = desHeading - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const yr = clamp(dh * 1.2, -0.75, 0.75);
      this.yawRate = damp(this.yawRate, yr, 3, dt);
    } else this.yawRate = damp(this.yawRate, 0, 3, dt);
    this.heading += this.yawRate * dt;

    // attitude from required thrust vector
    const share = clamp(hspd / 48, 0, 0.82);
    const drag = this.vel.clone().setY(0).multiplyScalar(hspd * 0.0026);
    const f = new THREE.Vector3(this.acc.x, 0, this.acc.z).add(drag);
    const fw = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const rt = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const aF = f.dot(fw) * (1 - share * 0.9), aR = f.dot(rt) + this.yawRate * hspd * 0.15;
    const onGround = !['takeoff', 'flying', 'rtb', 'landing'].includes(this.phase);
    let pT = onGround ? 0 : -Math.atan(aF / G) + (this.phase === 'takeoff' ? 0.02 : 0);
    let rT = onGround ? 0 : Math.atan(aR / G);
    pT = clamp(pT, -0.42, 0.32); rT = clamp(rT, -0.75, 0.75);
    if (!onGround) { pT += this.noise.noise(this.t * 0.9, 11) * 0.012; rT += this.noise.noise(this.t * 0.8, 17) * 0.02; }
    this.pitch = damp(this.pitch, pT, 3, dt);
    this.roll = damp(this.roll, rT, 3, dt);
    // controls
    this.cyclic.pitch = clamp(-pT * 2.4 + (pT - this.pitch) * -3, -1, 1);
    this.cyclic.roll = clamp(rT * 2 + (rT - this.roll) * 3, -1, 1);
    this.yawCmd = clamp(this.yawRate / 0.7, -1, 1);
    const tilt = Math.hypot(f.length() / G, 1);
    const thr = onGround ? 0 : clamp((tilt * (1 + this.acc.y / G)) * 0.62 * (1 - share * 0.25), 0, 1);
    this.thrust = damp(this.thrust, thr * this.rpm, 3, dt);
    this.collective = damp(this.collective, onGround ? (this.phase === 'spoolup' ? 0.2 : 0.12) : 0.3 + this.thrust * 0.6, 3, dt);
    this.propThrust = damp(this.propThrust, onGround ? 0 : clamp(share * 1.1 + Math.max(0, f.dot(fw)) * 0.04, 0, 1), 2, dt);
    this.torque = this.rpm * (0.18 + this.thrust * 0.72 + this.propThrust * 0.15);
    this.tgt = damp(this.tgt, 15 + this.rpm * 540 + this.thrust * 240 + this.propThrust * 60, 1.5, dt);
    this.fuel = Math.max(0.05, this.fuel - dt * this.rpm * (0.0003 + this.thrust * 0.0009));
  }

  fly(m, fwd) {
    const out = { v: new THREE.Vector3(), heading: null, alt: null };
    const gy = (x, z) => this.ground(x, z);
    switch (m.type) {
      case 'cruise': {
        const to = new THREE.Vector3(m.wp.x - this.pos.x, 0, m.wp.z - this.pos.z);
        const d = to.length();
        out.v.copy(to.normalize().multiplyScalar(Math.min(m.spd, d * 0.5 + 8)));
        out.alt = gy(this.pos.x, this.pos.z) + m.agl;
        if (d < 50) m.t = m.dur + 1;
        break;
      }
      case 'orbit': {
        const rel = new THREE.Vector3(this.pos.x - m.c.x, 0, this.pos.z - m.c.z);
        const r = rel.length() || 1;
        const tan = new THREE.Vector3(-rel.z, 0, rel.x).multiplyScalar(m.dir / r);
        out.v.copy(tan.multiplyScalar(m.spd)).addScaledVector(rel.normalize(), (m.rad - r) * 0.4);
        if (m.face) out.heading = Math.atan2(-(m.c.z - this.pos.z), m.c.x - this.pos.x);
        out.alt = gy(this.pos.x, this.pos.z) + m.agl;
        break;
      }
      case 'hoverTurn': {
        out.v.set((m.hold.x - this.pos.x) * 0.3, 0, (m.hold.z - this.pos.z) * 0.3);
        if (m.t > 2.5 && m.t < 9.5) out.heading = this.heading + m.yawDir * 0.9;
        out.alt = gy(this.pos.x, this.pos.z) + m.agl;
        break;
      }
      case 'sprint': {
        out.v.copy(m.dir).multiplyScalar(m.spd);
        out.alt = gy(this.pos.x, this.pos.z) + m.agl;
        out.maxAcc = 8;
        break;
      }
      case 'zoom': {
        out.v.copy(m.dir).multiplyScalar(m.t < 5 ? 45 : 30);
        out.alt = gy(this.pos.x, this.pos.z) + (m.t < 5 ? 140 : 35);
        break;
      }
      case 'attack': {
        const to = new THREE.Vector3(m.tgt.x - this.pos.x, 0, m.tgt.z - this.pos.z);
        const d = to.length();
        const ingress = d > 170 && !m.breakOff;
        if (ingress) {
          out.v.copy(to.clone().normalize().multiplyScalar(clamp(d * 0.12, 18, 42)));
          out.heading = Math.atan2(-to.z, to.x);
          out.alt = gy(this.pos.x, this.pos.z) + 42;
          if (d < 620 && !m.fired.msl && Math.random() < 0.012) { m.fired.msl = true; this.events.fire('missile', m.tgt); }
          if (d < 430 && !m.fired.rkt) { m.fired.rkt = true; this.events.fire('rockets', m.tgt); }
          if (d < 380 && d > 190) this.events.fire('gun', m.tgt); else this.events.fire('gunStop');
        } else {
          if (!m.breakOff) { m.breakOff = this.t; this.events.fire('gunStop'); if (Math.random() < 0.5) this.events.fire('flares'); }
          const side = new THREE.Vector3(-to.z, 0, to.x).normalize();
          out.v.copy(side.multiplyScalar(40)).addScaledVector(to.normalize(), -15);
          out.alt = gy(this.pos.x, this.pos.z) + 55;
          if (this.t - m.breakOff > 5) m.t = m.dur + 1;
        }
        break;
      }
    }
    return out;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get agl() { return this.pos.y - this.ground(this.pos.x, this.pos.z); }
}
