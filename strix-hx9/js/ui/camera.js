// Camera rig: free orbit that travels with the aircraft, chase, cockpit (head-look by drag), cinematic director.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { damp, clamp } from '../core/noise.js';

export class CameraRig {
  constructor(camera, dom, heli, getGround) {
    this.cam = camera; this.heli = heli; this.getGround = getGround;
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 5; this.controls.maxDistance = 140;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.rotateSpeed = 0.6; this.controls.zoomSpeed = 0.9;
    this.mode = 'orbit';
    this.last = new THREE.Vector3();
    this.look = { yaw: 0, pitch: -0.05, ty: 0, tp: -0.05 };
    this.shot = null; this.shotT = 0;
    this.shake = 0;
    this.fovTarget = 42;
    let drag = null;
    dom.addEventListener('pointerdown', (e) => { if (this.mode === 'cockpit') drag = { x: e.clientX, y: e.clientY, yaw: this.look.ty, pitch: this.look.tp }; });
    window.addEventListener('pointermove', (e) => { if (drag) { this.look.ty = clamp(drag.yaw - (e.clientX - drag.x) * 0.004, -2.2, 2.2); this.look.tp = clamp(drag.pitch - (e.clientY - drag.y) * 0.004, -0.9, 0.7); } });
    window.addEventListener('pointerup', () => { drag = null; });
  }

  setMode(m) {
    const prev = this.mode;
    this.mode = m;
    this.controls.enabled = m === 'orbit';
    const hp = this.heli.root.position;
    if (m === 'orbit' && prev !== 'orbit') {
      const back = new THREE.Vector3(-1, 0, 0.6).applyQuaternion(this.heli.root.quaternion).setY(0).normalize();
      this.cam.position.copy(hp).addScaledVector(back, 24).add(new THREE.Vector3(0, 7, 0));
      this.controls.target.copy(hp).add(new THREE.Vector3(0, 2.4, 0));
    }
    if (m === 'cinema') this.nextShot(true);
    if (m === 'cockpit') { this.look.ty = 0; this.look.tp = -0.06; }
    this.cam.near = m === 'cockpit' ? 0.03 : 0.15;
    this.cam.updateProjectionMatrix();
    this.last.copy(hp);
  }

  nextShot(first) {
    const types = ['tripod', 'flyby', 'orbit', 'low', 'top', 'side'];
    let type = types[(Math.random() * types.length) | 0];
    if (first) type = 'orbit';
    if (this.heli.sim && this.heli.sim.speed < 5 && (type === 'flyby' || type === 'tripod')) type = 'orbit';
    const hp = this.heli.root.position, v = this.heli.velocity || new THREE.Vector3();
    const s = { type, t: 0, dur: 6 + Math.random() * 4 };
    if (type === 'tripod') {
      const ahead = hp.clone().addScaledVector(v, 4);
      const side = new THREE.Vector3(-v.z, 0, v.x).normalize().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 40));
      s.pos = ahead.add(side); s.pos.y = this.getGround(s.pos.x, s.pos.z) + 1.8 + Math.random() * 3; s.fov = 24;
    } else if (type === 'flyby') {
      const ahead = hp.clone().addScaledVector(v, 3.5);
      const side = new THREE.Vector3(-v.z, 0, v.x).normalize().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 12);
      s.pos = ahead.add(side); s.pos.y = Math.max(hp.y - 4 + Math.random() * 8, this.getGround(s.pos.x, s.pos.z) + 2); s.fov = 50;
    } else if (type === 'orbit') { s.a = Math.random() * Math.PI * 2; s.r = 16 + Math.random() * 8; s.h = 2 + Math.random() * 5; s.fov = 40; s.dir = Math.random() < 0.5 ? 1 : -1; }
    else if (type === 'low') { s.fov = 34; } else if (type === 'top') { s.fov = 38; } else { s.fov = 30; }
    this.shot = s;
  }

  update(dt, t) {
    const h = this.heli, hp = h.root.position, cam = this.cam;
    if (this.shakeOff) cam.position.sub(this.shakeOff);
    const delta = new THREE.Vector3().subVectors(hp, this.last);
    this.last.copy(hp);
    const q = h.root.quaternion;
    let fov = 42;
    if (this.mode === 'orbit') {
      cam.position.add(delta); this.controls.target.add(delta);
      const tgt = hp.clone().add(new THREE.Vector3(0, 2.4, 0));
      this.controls.target.lerp(tgt, 1 - Math.exp(-3 * dt));
      this.controls.update();
    } else if (this.mode === 'chase') {
      const hd = Math.atan2(-(new THREE.Vector3(1, 0, 0).applyQuaternion(q).z), new THREE.Vector3(1, 0, 0).applyQuaternion(q).x);
      const fw = new THREE.Vector3(Math.cos(hd), 0, -Math.sin(hd));
      const want = hp.clone().addScaledVector(fw, -23).add(new THREE.Vector3(0, 6.5, 0));
      cam.position.add(delta);
      cam.position.lerp(want, 1 - Math.exp(-2.4 * dt));
      cam.lookAt(hp.clone().addScaledVector(fw, 8).add(new THREE.Vector3(0, 2.5, 0)));
      fov = 48;
    } else if (this.mode === 'cockpit') {
      this.look.yaw = damp(this.look.yaw, this.look.ty, 10, dt); this.look.pitch = damp(this.look.pitch, this.look.tp, 10, dt);
      const eye = h.cockpit.eyePilot.getWorldPosition(new THREE.Vector3());
      cam.position.copy(eye);
      const lq = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.pitch, this.look.yaw - Math.PI / 2, 0, 'YXZ'));
      cam.quaternion.copy(q).multiply(lq);
      fov = 68;
    } else if (this.mode === 'cinema') {
      const s = this.shot; s.t += dt;
      if (s.t > s.dur) this.nextShot();
      const v = h.velocity || new THREE.Vector3();
      if (s.type === 'tripod' || s.type === 'flyby') { cam.position.copy(s.pos); cam.lookAt(hp.clone().add(new THREE.Vector3(0, 2, 0))); }
      else if (s.type === 'orbit') {
        s.a += dt * 0.18 * s.dir;
        cam.position.set(hp.x + Math.cos(s.a) * s.r, hp.y + s.h, hp.z + Math.sin(s.a) * s.r);
        cam.lookAt(hp.clone().add(new THREE.Vector3(0, 2.2, 0)));
      } else if (s.type === 'low') {
        const fw = v.lengthSq() > 4 ? v.clone().setY(0).normalize() : new THREE.Vector3(1, 0, 0).applyQuaternion(q).setY(0).normalize();
        const want = hp.clone().addScaledVector(fw, -14).add(new THREE.Vector3(0, -1.2, 0));
        want.y = Math.max(want.y, this.getGround(want.x, want.z) + 1.5);
        cam.position.lerp(want, 1 - Math.exp(-3 * dt)); cam.lookAt(hp.clone().add(new THREE.Vector3(0, 3, 0)));
      } else if (s.type === 'top') {
        cam.position.lerp(hp.clone().add(new THREE.Vector3(0.01, 34, 6)), 1 - Math.exp(-3 * dt)); cam.lookAt(hp);
      } else {
        const rt = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
        cam.position.lerp(hp.clone().addScaledVector(rt, 30).add(new THREE.Vector3(0, 1.5, 0)), 1 - Math.exp(-2.5 * dt));
        cam.lookAt(hp.clone().add(new THREE.Vector3(0, 2, 0)));
      }
      fov = s.fov;
    }
    // never below ground
    if (this.mode !== 'cockpit') {
      const gy = this.getGround(cam.position.x, cam.position.z) + 1.0;
      if (cam.position.y < gy) { cam.position.y = gy; if (this.mode === 'orbit') this.controls.update(); }
    }
    // shake
    this.shakeOff = this.shakeOff || new THREE.Vector3();
    const sk = this.mode === 'cockpit' ? this.shake * 0.25 : this.shake;
    this.shakeOff.set((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk);
    cam.position.add(this.shakeOff);
    cam.fov = damp(cam.fov, fov, 4, dt);
    cam.updateProjectionMatrix();
  }
}
