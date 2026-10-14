// Air-flow visualisation: streaklines advected through a momentum-theory velocity field around the
// airframe — rotor inflow + contracting wake, helical tip vortices, ground-effect outwash, engine
// intake suction, hot exhaust plumes, pusher slipstream and lift-fan jets. World-space simulation.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const R = 6.6;

export class AirFlow {
  constructor(scene, heli, getWorld) {
    this.heli = heli; this.getWorld = getWorld;
    this.N = 7000;
    this.p = new Float32Array(this.N * 3); this.v = new Float32Array(this.N * 3);
    this.age = new Float32Array(this.N); this.life = new Float32Array(this.N); this.kind = new Uint8Array(this.N);
    this.target = new Float32Array(this.N * 3);
    this.lp = new Float32Array(this.N * 6); this.lc = new Float32Array(this.N * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.lp, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.lc, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.visible = false; this.lines.renderOrder = 9;
    scene.add(this.lines);
    this.cursor = 0;
    this.active = false;
    this.inv = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3();
    this.anch = {};
  }

  setActive(on) { this.active = on; this.lines.visible = on; if (!on) this.age.fill(1e9); }

  spawn(kind, x, y, z, vx = 0, vy = 0, vz = 0, life = 2) {
    const k = this.cursor; this.cursor = (this.cursor + 1) % this.N;
    this.p[k * 3] = x; this.p[k * 3 + 1] = y; this.p[k * 3 + 2] = z;
    this.v[k * 3] = vx; this.v[k * 3 + 1] = vy; this.v[k * 3 + 2] = vz;
    this.age[k] = 0; this.life[k] = life; this.kind[k] = kind;
    return k;
  }

  worldOf(name) { const a = this.heli.anchors[name]; return a.getWorldPosition(this.anch[name] || (this.anch[name] = new THREE.Vector3())).clone(); }

  update(dt, s) {
    if (!this.active) return;
    const h = this.heli, root = h.root;
    root.updateMatrixWorld(true);
    this.inv.copy(root.matrixWorld).invert();
    this.q.copy(root.quaternion);
    const rpm = s.rpm, thrust = Math.max(0.25, s.thrust);
    const vi = (6 + 9 * thrust) * rpm;
    const W = this.getWorld();
    const L = new THREE.Vector3(), Wv = new THREE.Vector3();
    const toW = (lx, ly, lz) => L.set(lx, ly, lz).applyMatrix4(root.matrixWorld);
    // ---------------- emitters
    if (rpm > 0.05) {
      const n1 = Math.floor(170 * rpm * dt * 60 / 4);
      for (let i = 0; i < n1; i++) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * R * 1.08;
        const w = toW(0.25 + Math.cos(a) * r, 5.3 + Math.random() * 4.5, Math.sin(a) * r);
        this.spawn(0, w.x, w.y, w.z, 0, 0, 0, 3.2);
      }
      // tip vortices — emitted from the actual blade tips of both rotors
      for (const rot of h.rotor.rotors) {
        for (let k = 0; k < 4; k++) {
          const ang = rot.spin.rotation.y + k * TAU / 4;
          const w = toW(0.25 + Math.cos(ang) * R, rot.y + 0.2, -Math.sin(ang) * R);
          if (Math.random() < 0.9) this.spawn(1, w.x, w.y, w.z, 0, 0, 0, 1.6);
        }
      }
      // intakes
      for (const sd of [1, -1]) {
        const ip = this.worldOf('intake' + sd);
        for (let i = 0; i < 3; i++) {
          const off = new THREE.Vector3(2 + Math.random() * 3, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5).applyQuaternion(this.q);
          const k = this.spawn(2, ip.x + off.x, ip.y + off.y, ip.z + off.z, 0, 0, 0, 1.2);
          this.target[k * 3] = ip.x; this.target[k * 3 + 1] = ip.y; this.target[k * 3 + 2] = ip.z;
        }
        // exhaust
        const ep = this.worldOf('exhaust' + sd), ed = this.worldOf('exhaustDir' + sd).sub(ep).normalize();
        for (let i = 0; i < 4; i++) {
          const sp = 30 + Math.random() * 18;
          this.spawn(3, ep.x + (Math.random() - 0.5) * 0.3, ep.y + (Math.random() - 0.5) * 0.15, ep.z + (Math.random() - 0.5) * 0.3,
            ed.x * sp + s.vel.x, ed.y * sp + s.vel.y, ed.z * sp + s.vel.z, 0.45);
        }
        // lift fan jets
        const fp = this.worldOf('fan' + sd), fa = this.worldOf('fanAxis' + sd).sub(fp).normalize();
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 0.6;
          const perp = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
          const sp = 22 + Math.random() * 10;
          this.spawn(4, fp.x + perp.x + fa.x * 0.6, fp.y + perp.y + fa.y * 0.6, fp.z + perp.z + fa.z * 0.6,
            -fa.x * sp + s.vel.x, -fa.y * sp + s.vel.y, -fa.z * sp + s.vel.z, 0.9);
        }
      }
      // pusher slipstream
      const pp = this.worldOf('pusher');
      const ax = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.q);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * TAU, r = 0.3 + Math.random() * 0.5;
        const off = new THREE.Vector3(1.6, Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4).applyQuaternion(this.q);
        const sp = 18 + 34 * s.propThrust;
        this.spawn(5, pp.x + off.x, pp.y + off.y, pp.z + off.z, ax.x * sp * 0.5 + s.vel.x * 0.4, ax.y * sp * 0.5, ax.z * sp * 0.5 + s.vel.z * 0.4, 1.3);
      }
    }
    // ---------------- advection
    const { p, v, N } = this;
    const hub = new THREE.Vector3();
    for (let k = 0; k < N; k++) {
      if (this.age[k] >= this.life[k]) { this.lp[k * 6] = this.lp[k * 6 + 3] = 1e9; continue; }
      this.age[k] += dt;
      const kind = this.kind[k];
      let vx = v[k * 3], vy = v[k * 3 + 1], vz = v[k * 3 + 2];
      if (kind <= 1) {
        // rotor field in heli frame
        L.set(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]).applyMatrix4(this.inv);
        const lx = L.x - 0.25, ly = L.y - 4.6, lz = L.z;
        const r = Math.hypot(lx, lz);
        let fx = 0, fy = 0, fz = 0;
        if (ly > 0) {
          const k2 = r < R * 1.25 ? 1 : 0.25;
          fy = -vi * (0.35 + 0.65 * Math.exp(-ly / 2.5)) * k2;
          fx = -lx * 0.12 * k2; fz = -lz * 0.12 * k2;
        } else {
          const inWake = r < R * 1.1 ? 1 : Math.exp(-(r - R * 1.1) * 0.8);
          const far = Math.min(1, -ly / 4);
          fy = -vi * (1 + far) * inWake;
          const rc = R * (1 - 0.22 * far);
          if (r > 0.01 && r > rc) { fx = -lx / r * (r - rc) * 0.8; fz = -lz / r * (r - rc) * 0.8; }
          if (kind === 1) { const sw = 2.2 * rpm; fx += -lz / Math.max(r, 0.5) * sw; fz += lx / Math.max(r, 0.5) * sw; }
        }
        Wv.set(fx, fy, fz).applyQuaternion(this.q);
        const blend = 1 - Math.exp(-6 * dt);
        vx += (Wv.x - vx) * blend; vy += (Wv.y - vy) * blend; vz += (Wv.z - vz) * blend;
        // ground effect outwash
        const gy = W ? W.heightAt(p[k * 3], p[k * 3 + 2]) : 0;
        if (p[k * 3 + 1] - gy < 1.2 && vy < 0) {
          hub.set(root.position.x, 0, root.position.z);
          let dx = p[k * 3] - hub.x, dz = p[k * 3 + 2] - hub.z; const d = Math.hypot(dx, dz) || 1;
          const sp = Math.abs(vy) * 0.95 + 2;
          vx = dx / d * sp; vz = dz / d * sp; vy = 0.6;
          p[k * 3 + 1] = gy + 1.2;
          this.life[k] = Math.max(this.life[k], this.age[k] + 1.2);
        }
      } else if (kind === 2) {
        const tx = this.target[k * 3] - p[k * 3], ty = this.target[k * 3 + 1] - p[k * 3 + 1], tz = this.target[k * 3 + 2] - p[k * 3 + 2];
        const d = Math.hypot(tx, ty, tz);
        const sp = 6 + 26 / (0.6 + d);
        vx = tx / d * sp + s.vel.x; vy = ty / d * sp + s.vel.y; vz = tz / d * sp + s.vel.z;
        if (d < 0.35) this.age[k] = this.life[k];
      } else if (kind === 3) {
        vx *= Math.exp(-1.8 * dt); vz *= Math.exp(-1.8 * dt); vy = vy * Math.exp(-1.8 * dt) + 3 * dt;
      } else if (kind === 4) {
        vx *= Math.exp(-0.8 * dt); vy *= Math.exp(-0.8 * dt); vz *= Math.exp(-0.8 * dt);
      } else if (kind === 5) {
        L.set(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]).applyMatrix4(this.inv);
        if (L.x > -8.9) {
          const ax = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.q);
          const sp = 30 + 40 * s.propThrust;
          vx += (ax.x * sp + s.vel.x * 0.2 - vx) * 0.2; vy += (ax.y * sp - vy) * 0.2; vz += (ax.z * sp + s.vel.z * 0.2 - vz) * 0.2;
        } else { vx *= Math.exp(-0.6 * dt); vy *= Math.exp(-0.6 * dt); vz *= Math.exp(-0.6 * dt); }
      }
      v[k * 3] = vx; v[k * 3 + 1] = vy; v[k * 3 + 2] = vz;
      p[k * 3] += vx * dt; p[k * 3 + 1] += vy * dt; p[k * 3 + 2] += vz * dt;
      // streak
      const rvx = vx - (kind <= 1 ? 0 : s.vel.x * 0.5), rvy = vy, rvz = vz - (kind <= 1 ? 0 : s.vel.z * 0.5);
      const sl = kind === 1 ? 0.03 : 0.045;
      this.lp[k * 6] = p[k * 3]; this.lp[k * 6 + 1] = p[k * 3 + 1]; this.lp[k * 6 + 2] = p[k * 3 + 2];
      this.lp[k * 6 + 3] = p[k * 3] - rvx * sl; this.lp[k * 6 + 4] = p[k * 3 + 1] - rvy * sl; this.lp[k * 6 + 5] = p[k * 3 + 2] - rvz * sl;
      const spd = Math.hypot(rvx, rvy, rvz);
      const t = this.age[k] / this.life[k];
      const fade = Math.min(1, this.age[k] * 6) * (1 - t);
      let r, g, b;
      if (kind === 3) { r = 1.8; g = 0.45 + (1 - t) * 0.5; b = 0.08; }
      else if (kind === 1) { r = 0.75; g = 1.1; b = 2.0; }
      else {
        const u = Math.min(1, spd / 32);
        r = 0.04 + u * u * 0.55; g = 0.22 + u * 0.95; b = 0.75 + u * 0.75;
        if (kind === 5) { r *= 0.6; g *= 1.15; }
        if (kind === 4) { r = 0.25 + u * 0.5; g = 1.0; b = 1.1; }
      }
      const a = fade * (kind === 0 ? 0.42 : 0.6);
      this.lc[k * 6] = r * a; this.lc[k * 6 + 1] = g * a; this.lc[k * 6 + 2] = b * a;
      this.lc[k * 6 + 3] = r * a * 0.05; this.lc[k * 6 + 4] = g * a * 0.05; this.lc[k * 6 + 5] = b * a * 0.05;
    }
    const geo = this.lines.geometry;
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  }
}
