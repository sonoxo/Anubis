// Weapons: 30mm rotary cannon with tracers + casings, 19-shot rocket pods, bay-launched guided missiles,
// countermeasure flares, explosions (fireball, smoke, sparks, shockwave, light, water columns).
import * as THREE from 'three';

const V = () => new THREE.Vector3();
const tmp = V(), tmp2 = V();

export class Weapons {
  constructor(scene, heli, fx, audio, getWorld) {
    this.scene = scene; this.heli = heli; this.fx = fx; this.audio = audio; this.getWorld = getWorld;
    this.ammo = { gun: 1200, rkt: 38, msl: 6, flr: 60 };
    this.max = { gun: 1200, rkt: 38, msl: 6, flr: 60 };
    this.rearm = { gun: 0, rkt: 0, msl: 0, flr: 0 };
    this.firingGun = false; this.gunTimer = 0;
    this.projectiles = []; this.rockets = []; this.missilesInFlight = []; this.flares = [];
    this.queue = [];
    this.shake = 0;
    this.target = null;
    this.onChange = () => {};
    // tracer instancing
    this.tracerMax = 120;
    const tg = new THREE.BoxGeometry(1, 0.09, 0.09).translate(-0.5, 0, 0);
    this.tracerMesh = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.8) }), this.tracerMax);
    this.tracerMesh.frustumCulled = false; this.tracerMesh.count = 0;
    scene.add(this.tracerMesh);
    // light pool
    this.lights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffa050, 0, 120, 1.6); scene.add(l); this.lights.push({ l, t: 0, dur: 1, peak: 0 }); }
    // shockwave rings
    this.rings = [];
    const rm = () => new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2), rm()); r.visible = false; scene.add(r); this.rings.push({ r, t: 1 }); }
    // rocket / missile meshes
    this.rocketGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.2, 8).rotateZ(Math.PI / 2);
    this.rocketMat = new THREE.MeshStandardMaterial({ color: 0x5a5e52, roughness: 0.6, metalness: 0.4 });
    this.flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.6, 1), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flameGeo = new THREE.ConeGeometry(0.08, 0.9, 8).rotateZ(Math.PI / 2).translate(-0.95, 0, 0);
  }

  ground(x, z) { const w = this.getWorld(); return w ? w.heightAt(x, z) : 0; }
  isWater(x, z) { const w = this.getWorld(); return w && (w.surfaceIsWater ? w.surfaceIsWater(x, z) : (w.waterY !== undefined && w.heightAt(x, z) <= (w.waterY + 0.1))); }

  defaultTarget() {
    const h = this.heli.root;
    const fwd = tmp.set(1, 0, 0).applyQuaternion(h.quaternion).setY(0).normalize();
    const p = h.position.clone().addScaledVector(fwd, 320);
    p.y = this.ground(p.x, p.z);
    if (h.position.y - p.y > 220) p.y = h.position.y - 120;
    return p;
  }

  aimGunAt(target) {
    const h = this.heli;
    h.root.updateMatrixWorld();
    const local = h.root.worldToLocal(target.clone());
    local.sub(new THREE.Vector3(5.3, 0.45, 0));
    h.gunAim.az = THREE.MathUtils.clamp(Math.atan2(-local.z, local.x), -1.6, 1.6);
    h.gunAim.el = THREE.MathUtils.clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.9, 0.2);
    h.sensorAim.az = THREE.MathUtils.clamp(h.gunAim.az, -1.8, 1.8);
    h.sensorAim.el = h.gunAim.el;
  }

  setGun(on, target) { this.firingGun = on; if (target) this.target = target; }

  fireRockets(target, n = 4) {
    if (this.ammo.rkt <= 0) { this.audio?.click(0.3); return; }
    for (let i = 0; i < n; i++) this.queue.push({ t: i * 0.11, fn: () => this.launchRocket(target) });
  }

  launchRocket(target) {
    if (this.ammo.rkt <= 0) return;
    const h = this.heli;
    const side = this.ammo.rkt % 2;
    const tubes = h.rocketTubes[side].filter(t => t.present);
    const tube = tubes.length ? tubes[0] : h.rocketTubes[1 - side].find(t => t.present);
    if (!tube) return;
    tube.present = false;
    tube.tips.setMatrixAt(tube.i, new THREE.Matrix4().makeScale(0, 0, 0)); tube.tips.instanceMatrix.needsUpdate = true;
    this.ammo.rkt--; this.onChange();
    h.root.updateMatrixWorld(true);
    const p = tube.o.getWorldPosition(V());
    const fwd = V().set(1, 0, 0).applyQuaternion(h.root.quaternion);
    const tgt = target || this.defaultTarget();
    const dir = tgt.clone().sub(p).normalize().lerp(fwd, 0.35).normalize();
    dir.x += (Math.random() - 0.5) * 0.03; dir.y += (Math.random() - 0.5) * 0.03; dir.z += (Math.random() - 0.5) * 0.03; dir.normalize();
    const m = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    const fl = new THREE.Mesh(this.flameGeo, this.flameMat); m.add(fl);
    m.position.copy(p);
    this.scene.add(m);
    const vel = (h.velocity ? h.velocity.clone() : V()).addScaledVector(dir, 70);
    this.rockets.push({ m, vel, dir, t: 0 });
    // launch blast
    for (let i = 0; i < 6; i++) this.fx.smoke.emit({ p, v: dir.clone().multiplyScalar(-8), spread: 3, c0: [0.75, 0.74, 0.72], c1: [0.5, 0.5, 0.5], life: 1.8, s0: 0.4, s1: 2.2, a: 0.4, drag: 1.5, rise: 0.6 });
    for (let i = 0; i < 6; i++) this.fx.add.emit({ p, v: dir.clone().multiplyScalar(-10), spread: 6, c0: [3, 1.6, 0.5], c1: [1, 0.2, 0], life: 0.18, s0: 0.8, s1: 0.2 });
    this.audio?.rocket(p);
    this.shake = Math.max(this.shake, 0.12);
  }

  fireMissile(target) {
    const slot = this.heli.missiles.find(s => s.present === true);
    if (!slot || this.ammo.msl <= 0) { this.audio?.click(0.3); return; }
    this.heli.bayHold = 4.5;
    slot.present = 'pending';
    this.audio?.bay();
    const tgt = target || this.defaultTarget();
    const wait = () => {
      if (this.heli.anim.bays < 0.92) { this.queue.push({ t: 0.05, fn: wait }); return; }
      this.launchMissile(slot, tgt);
    };
    this.queue.push({ t: 0.05, fn: wait });
  }

  launchMissile(slot, tgt) {
    slot.present = false;
    this.ammo.msl--; this.onChange();
    const m = slot.mesh;
    this.heli.root.updateMatrixWorld(true);
    this.scene.attach(m);
    const fl = new THREE.Mesh(this.flameGeo, this.flameMat); fl.scale.set(1.8, 2.2, 2.2); fl.position.x = -0.35; fl.visible = false; m.add(fl);
    const vel = (this.heli.velocity ? this.heli.velocity.clone() : V()).add(V().set(0, -3, 0));
    const fwd = V().set(1, 0, 0).applyQuaternion(this.heli.root.quaternion);
    this.missilesInFlight.push({ m, slot, vel, t: 0, tgt: tgt.clone(), fwd, fl, lit: false });
    this.audio?.clunk();
  }

  fireFlares() {
    if (this.ammo.flr <= 0) { this.audio?.click(0.3); return; }
    for (let i = 0; i < 8; i++) this.queue.push({ t: i * 0.09, fn: () => this.launchFlare(i % 2 ? 1 : -1) });
  }

  launchFlare(sd) {
    if (this.ammo.flr <= 0) return;
    this.ammo.flr--; this.onChange();
    const h = this.heli;
    h.root.updateMatrixWorld(true);
    const a = h.anchors['flare' + sd];
    const p = a.getWorldPosition(V());
    const side = V().set(0, 0.4, sd).applyQuaternion(h.root.quaternion).normalize();
    const vel = (h.velocity ? h.velocity.clone() : V()).addScaledVector(side, 22 + Math.random() * 8).add(V().set((Math.random() - 0.5) * 8, 4 + Math.random() * 6, 0));
    this.flares.push({ p, vel, t: 0, life: 3.2 + Math.random() });
    this.audio?.flare(p);
    const L = this.takeLight(); L.l.color.set(0xfff0d0); L.l.position.copy(p); L.dur = 2.5; L.t = 0; L.peak = 1600; L.follow = this.flares[this.flares.length - 1];
  }

  takeLight() { return this.lights.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b)); }

  explode(p, size = 1, water = false) {
    const fx = this.fx;
    if (water) {
      for (let i = 0; i < 70 * size; i++) fx.smoke.emit({ p, v: V().set((Math.random() - 0.5) * 6, 10 + Math.random() * 22 * size, (Math.random() - 0.5) * 6), spread: 3, c0: [0.92, 0.95, 1], c1: [0.7, 0.75, 0.8], life: 1.8 + Math.random(), s0: 1.2 * size, s1: 4 * size, a: 0.85, drag: 0.6, g: 9 });
      for (let i = 0; i < 40 * size; i++) fx.smoke.emit({ p, v: V().set((Math.random() - 0.5) * 30, 2 + Math.random() * 4, (Math.random() - 0.5) * 30), c0: [0.9, 0.92, 0.95], c1: [0.6, 0.65, 0.7], life: 1.6, s0: 1, s1: 3.5 * size, a: 0.6, drag: 1.2, g: 2 });
    }
    for (let i = 0; i < 28 * size; i++) {
      const v = V().set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 14 * size);
      const k = 0.5 + Math.random() * 0.5;
      fx.add.emit({ p, v, c0: [2.6 * k, 1.2 * k, 0.35 * k], c1: [0.5, 0.08, 0.02], life: 0.45 + Math.random() * 0.55, s0: 1.6 * size, s1: 4.2 * size, drag: 3.5, rise: 3 });
    }
    fx.add.emit({ p: p.clone().add(V().set(0, 1, 0)), c0: [4, 2.6, 1.4], c1: [0.6, 0.2, 0.05], life: 0.16, s0: 7 * size, s1: 3 * size });
    for (let i = 0; i < 36 * size; i++) {
      const v = V().set(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 8 * size);
      const g = 0.1 + Math.random() * 0.15;
      fx.smoke.emit({ p: p.clone().add(V().set(0, 1, 0)), v, c0: [0.22, 0.2, 0.19].map(c => c + g), c1: [0.08, 0.08, 0.08], life: 3.5 + Math.random() * 3, s0: 3 * size, s1: 13 * size, a: 0.75, drag: 1.2, rise: 2.2 });
    }
    for (let i = 0; i < 50 * size; i++) {
      const v = V().set(Math.random() - 0.5, Math.random() * 1.2, Math.random() - 0.5).normalize().multiplyScalar(14 + Math.random() * 34);
      fx.add.emit({ p, v, c0: [4, 2.2, 0.8], c1: [1.2, 0.3, 0.05], life: 0.8 + Math.random() * 1.2, s0: 0.22, s1: 0.08, drag: 0.6, g: 14 });
    }
    // ground dust ring
    for (let i = 0; i < 28 * size; i++) {
      const a = Math.random() * Math.PI * 2;
      fx.smoke.emit({ p, v: V().set(Math.cos(a) * 18 * size, 0.6, Math.sin(a) * 18 * size), c0: water ? [0.85, 0.9, 0.95] : [0.6, 0.5, 0.42], c1: [0.4, 0.36, 0.32], life: 2.5, s0: 2, s1: 7 * size, a: 0.45, drag: 1.8 });
    }
    const R = this.rings.reduce((a, b) => (a.t > b.t ? a : b));
    R.t = 0; R.size = size; R.r.position.copy(p).add(V().set(0, 0.4, 0)); R.r.visible = true;
    const L = this.takeLight(); L.l.color.set(0xffa050); L.l.position.copy(p).add(V().set(0, 3, 0)); L.t = 0; L.dur = 0.8; L.peak = 5000 * size; L.follow = null;
    this.audio?.explosion(p, size);
    const cam = this.camera;
    if (cam) { const d = cam.position.distanceTo(p); this.shake = Math.max(this.shake, size * 0.9 / (1 + d / 60)); }
  }

  impactSmall(p, water) {
    const fx = this.fx;
    if (water) {
      for (let i = 0; i < 8; i++) fx.smoke.emit({ p, v: V().set((Math.random() - 0.5) * 3, 6 + Math.random() * 8, (Math.random() - 0.5) * 3), c0: [0.9, 0.93, 1], c1: [0.7, 0.75, 0.8], life: 1.2, s0: 0.5, s1: 1.8, a: 0.7, g: 9, drag: 0.4 });
      return;
    }
    for (let i = 0; i < 6; i++) fx.add.emit({ p, v: V().set((Math.random() - 0.5) * 18, Math.random() * 14, (Math.random() - 0.5) * 18), c0: [5, 3, 1.2], c1: [1, 0.3, 0.05], life: 0.35 + Math.random() * 0.3, s0: 0.18, s1: 0.06, g: 16, drag: 0.5 });
    fx.add.emit({ p, c0: [5, 2.6, 1], c1: [0.6, 0.1, 0], life: 0.12, s0: 2.4, s1: 0.8 });
    for (let i = 0; i < 4; i++) fx.smoke.emit({ p, v: V().set((Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3), c0: [0.55, 0.48, 0.42], c1: [0.35, 0.32, 0.3], life: 1.8, s0: 0.8, s1: 3.5, a: 0.55, drag: 1.4, rise: 0.4 });
  }

  update(dt, t) {
    // timed queue
    for (let i = this.queue.length - 1; i >= 0; i--) { const q = this.queue[i]; q.t -= dt; if (q.t <= 0) { this.queue.splice(i, 1); q.fn(); } }
    const h = this.heli;
    // ---- cannon
    h.firing = this.firingGun && this.ammo.gun > 0;
    if (this.firingGun) {
      h.gunHold = 1.2;
      const tgt = this.target || this.defaultTarget();
      this.aimGunAt(tgt);
    }
    if (h.firing && h.anim.gun > 0.6 && h.gunAim.spinV > 25) {
      this.gunTimer -= dt;
      while (this.gunTimer <= 0 && this.ammo.gun > 0) {
        this.gunTimer += 1 / 10.4;
        this.shootRound();
      }
    } else this.gunTimer = 0;
    // ---- projectiles (tracers)
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V();
    let n = 0;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      pr.vel.y -= 9.8 * dt;
      const prev = pr.p.clone();
      pr.p.addScaledVector(pr.vel, dt);
      const gy = this.ground(pr.p.x, pr.p.z);
      if (pr.p.y <= gy || pr.t > 4) {
        if (pr.p.y <= gy) {
          // back up to the surface
          const k = (prev.y - gy) / Math.max(1e-3, prev.y - pr.p.y);
          pr.p.copy(prev).lerp(pr.p, THREE.MathUtils.clamp(k, 0, 1)); pr.p.y = gy + 0.1;
          this.impactSmall(pr.p, this.isWater(pr.p.x, pr.p.z));
          if (Math.random() < 0.25) this.audio?.impact(pr.p);
        }
        this.projectiles.splice(i, 1); continue;
      }
      if (n < this.tracerMax) {
        const len = Math.min(14, pr.vel.length() * 0.018);
        q.setFromUnitVectors(tmp2.set(1, 0, 0), tmp.copy(pr.vel).normalize());
        mt.compose(pr.p, q, sc.set(len, 1, 1));
        this.tracerMesh.setMatrixAt(n++, mt);
      }
    }
    this.tracerMesh.count = n; this.tracerMesh.instanceMatrix.needsUpdate = true;
    // ---- rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dt;
      if (r.t < 1.1) r.vel.addScaledVector(r.dir, 520 * dt);
      r.vel.y -= 9.8 * dt * 0.6;
      r.m.position.addScaledVector(r.vel, dt);
      r.m.quaternion.setFromUnitVectors(tmp2.set(1, 0, 0), tmp.copy(r.vel).normalize());
      r.m.children[0].visible = r.t < 1.1;
      if (r.t < 1.4) {
        const back = r.m.position.clone().addScaledVector(tmp.copy(r.vel).normalize(), -0.8);
        this.fx.smoke.emit({ p: back, spread: 0.6, c0: [0.85, 0.85, 0.85], c1: [0.55, 0.55, 0.56], life: 2.6, s0: 0.35, s1: 2.6, a: 0.45, drag: 1.2, rise: 0.3 });
        this.fx.add.emit({ p: back, c0: [5, 2.4, 0.8], c1: [1, 0.2, 0], life: 0.08, s0: 0.7, s1: 0.2 });
      }
      const gy = this.ground(r.m.position.x, r.m.position.z);
      if (r.m.position.y <= gy || r.t > 6) {
        if (r.m.position.y <= gy) { r.m.position.y = gy; this.explode(r.m.position.clone(), 0.7, this.isWater(r.m.position.x, r.m.position.z)); }
        this.scene.remove(r.m); this.rockets.splice(i, 1);
      }
    }
    // ---- missiles
    for (let i = this.missilesInFlight.length - 1; i >= 0; i--) {
      const m = this.missilesInFlight[i];
      m.t += dt;
      if (m.t < 0.35) {
        m.vel.y -= 9.8 * dt;
        m.m.position.addScaledVector(m.vel, dt);
        const qq = new THREE.Quaternion().setFromUnitVectors(tmp2.set(1, 0, 0), m.fwd);
        m.m.quaternion.slerp(qq, 0.2);
      } else {
        if (!m.lit) { m.lit = true; m.fl.visible = true; this.audio?.missile(m.m.position); }
        const to = m.tgt.clone().sub(m.m.position);
        const dist = to.length();
        const loft = THREE.MathUtils.clamp((dist - 150) / 800, 0, 1) * 0.18;
        const desired = to.normalize().add(V().set(0, loft, 0)).normalize();
        const speed = Math.min(480, m.vel.length() + 260 * dt);
        const cur = m.vel.clone().normalize();
        cur.lerp(desired, Math.min(1, dt * (m.t < 1 ? 1.4 : 3.2))).normalize();
        m.vel.copy(cur).multiplyScalar(speed);
        m.m.position.addScaledVector(m.vel, dt);
        m.m.quaternion.setFromUnitVectors(tmp2.set(1, 0, 0), cur);
        const back = m.m.position.clone().addScaledVector(cur, -0.8);
        this.fx.smoke.emit({ p: back, spread: 0.8, c0: [0.92, 0.92, 0.92], c1: [0.6, 0.6, 0.62], life: 4.5, s0: 0.5, s1: 4, a: 0.55, drag: 0.9, rise: 0.25 });
        this.fx.add.emit({ p: back, c0: [6, 3, 1.2], c1: [1, 0.2, 0], life: 0.1, s0: 1.2, s1: 0.4 });
      }
      const gy = this.ground(m.m.position.x, m.m.position.z);
      if (m.m.position.y <= gy || m.t > 12 || m.m.position.distanceTo(m.tgt) < 3) {
        m.m.position.y = Math.max(m.m.position.y, gy);
        this.explode(m.m.position.clone(), 1.5, this.isWater(m.m.position.x, m.m.position.z));
        this.scene.remove(m.m);
        m.fl.removeFromParent();
        // reload the rail (hidden until rearm)
        m.slot.door.add(m.m); m.m.position.copy(m.slot.home); m.m.quaternion.identity(); m.m.visible = false;
        this.missilesInFlight.splice(i, 1);
      }
    }
    // ---- flares
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.t += dt;
      f.vel.multiplyScalar(Math.exp(-1.6 * dt)); f.vel.y -= 6 * dt;
      f.p.addScaledVector(f.vel, dt);
      const k = 1 - f.t / f.life;
      this.fx.add.emit({ p: f.p, c0: [8, 7, 5].map(c => c * k), c1: [3, 1.5, 0.4], life: 0.12, s0: 1.6 * k + 0.3, s1: 0.4 });
      this.fx.add.emit({ p: f.p, spread: 0.6, c0: [2.5, 1.6, 0.8], c1: [0.4, 0.1, 0], life: 0.5, s0: 0.5, s1: 0.1, g: 2 });
      this.fx.smoke.emit({ p: f.p, spread: 0.4, c0: [0.9, 0.9, 0.9], c1: [0.7, 0.7, 0.7], life: 2.4, s0: 0.4, s1: 2.2, a: 0.35 * k, drag: 1, rise: 0.4 });
      if (f.t > f.life) this.flares.splice(i, 1);
    }
    // ---- lights & rings
    for (const L of this.lights) {
      L.t += dt;
      const k = Math.max(0, 1 - L.t / L.dur);
      L.l.intensity = L.peak * k * k * (L.follow ? 0.8 + Math.random() * 0.4 : 1);
      if (L.follow) L.l.position.copy(L.follow.p);
    }
    for (const R of this.rings) {
      if (!R.r.visible) continue;
      R.t += dt * 1.6;
      const s = (2 + R.t * 34) * (R.size || 1);
      R.r.scale.set(s, 1, s);
      R.r.material.opacity = Math.pow(Math.max(0, 1 - R.t), 2) * 0.22;
      if (R.t >= 1) R.r.visible = false;
    }
    // ---- rearm when empty
    for (const k of ['gun', 'rkt', 'msl', 'flr']) {
      if (this.ammo[k] <= 0 && !(k === 'msl' && this.missilesInFlight.length)) {
        this.rearm[k] += dt;
        if (this.rearm[k] > 4) { this.rearm[k] = 0; this.reload(k); }
      }
    }
    this.shake *= Math.exp(-4 * dt);
  }

  reload(k) {
    this.ammo[k] = this.max[k];
    if (k === 'rkt') for (const side of this.heli.rocketTubes) for (const tb of side) { tb.present = true; tb.tips.setMatrixAt(tb.i, new THREE.Matrix4().makeTranslation(tb.pos.x, tb.pos.y, tb.pos.z)); tb.tips.instanceMatrix.needsUpdate = true; }
    if (k === 'msl') for (const s of this.heli.missiles) { s.present = true; s.mesh.visible = true; }
    this.onChange();
    this.audio?.reload();
  }

  shootRound() {
    const h = this.heli;
    this.ammo.gun--;
    if (this.ammo.gun % 10 === 0) this.onChange();
    h.root.updateMatrixWorld(true);
    const p = h.gun.muzzle.getWorldPosition(V());
    const f = h.gun.muzzleFwd.getWorldPosition(V()).sub(p).normalize();
    f.x += (Math.random() - 0.5) * 0.012; f.y += (Math.random() - 0.5) * 0.012; f.z += (Math.random() - 0.5) * 0.012; f.normalize();
    const vel = (h.velocity ? h.velocity.clone() : V()).addScaledVector(f, 805);
    this.projectiles.push({ p: p.clone(), vel, t: 0 });
    h.fireMuzzleFlash();
    // muzzle smoke + casing
    this.fx.smoke.emit({ p, v: f.clone().multiplyScalar(6), spread: 1.5, c0: [0.7, 0.68, 0.65], c1: [0.5, 0.5, 0.5], life: 1.4, s0: 0.3, s1: 1.8, a: 0.4, drag: 2, rise: 0.4 });
    const side = V().set(0, -1, 0.6).applyQuaternion(h.root.quaternion);
    const cp = h.gun.az.getWorldPosition(V());
    this.fx.add.emit({ p: cp, v: (h.velocity ? h.velocity.clone() : V()).addScaledVector(side, 5), spread: 2, c0: [1.4, 1.0, 0.4], c1: [0.6, 0.4, 0.15], life: 1.1, s0: 0.07, s1: 0.06, g: 9.8, drag: 0.2 });
    const L = this.lights[0]; L.l.color.set(0xffb060); L.l.position.copy(p); L.t = 0; L.dur = 0.06; L.peak = 900; L.follow = null;
    this.audio?.gun(p);
    this.shake = Math.max(this.shake, 0.05);
  }
}
