// STRIX HX-9 airframe: faceted stealth hull, tandem stepped canopy, coaxial rotor, twin turboshafts with
// IR-suppressed exhausts, tilting wingtip lift fans, ducted pusher with vectoring vanes, Comanche-style
// swing-out weapon bays, retractable tricycle gear, chin cannon, EO/IR nose turret, full lighting.
import * as THREE from 'three';
import { loft, hullProfile, ringProfile, slab, planform, lathe, polyBars, strutGeo, placeBetween, merge, hexPoints, V3, boxUV } from '../core/geo.js';
import { textDecal, makeDecal } from '../core/textures.js';
import { mk, grp } from './mk.js';
import { CoaxRotor, blurMaterial } from './rotor.js';
import { buildCockpit } from './cockpit.js';
import { buildInternals } from './internals.js';
import { damp, smooth, clamp } from '../core/noise.js';

const TAU = Math.PI * 2;
const H = (x, yT, zS, yS, zC, yC, zL, yL, zB, yB, yK) => ({ x, s: { yT, zS, yS, zC, yC, zL, yL, zB, yB, yK } });
const toSec = (h) => ({ x: h.x, pts: hullProfile(h.s) });

/** Build segmented polyline bars so formation lights look like sleek recessed aircraft EL strips with fine panel-seam breaks. */
function segmentedBars(points, r, radial = 6, gapFrac = 0.04, subSegs = 0) {
  const geos = [];
  for (let i = 0; i < points.length - 1; i++) {
    const A = points[i], B = points[i + 1];
    const totalLen = A.distanceTo(B);
    const nSub = Math.max(1, subSegs || Math.round(totalLen / 1.35));
    for (let s = 0; s < nSub; s++) {
      const t0 = (s + gapFrac * 0.5) / nSub;
      const t1 = (s + 1 - gapFrac * 0.5) / nSub;
      if (t1 <= t0) continue;
      const p0 = new THREE.Vector3().lerpVectors(A, B, t0);
      const p1 = new THREE.Vector3().lerpVectors(A, B, t1);
      geos.push(polyBars([p0, p1], r, radial));
    }
  }
  return merge(geos);
}

/** Ground contact-shadow shader: tight dark tire contact patches + strong under-belly/wing/fan AO on the pad. */
function makeContactShadow() {
  const geo = new THREE.PlaneGeometry(20, 11).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1.0 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uOpacity;
      varying vec2 vP;
      float ellip(vec2 p, vec2 c, vec2 r, float pwr){
        vec2 d = (p - c) / r;
        return exp(-pow(dot(d, d), pwr));
      }
      void main(){
        // Fuselage belly & tail boom grounded ambient occlusion
        float hullCore = ellip(vP, vec2(0.6, 0.0), vec2(4.4, 1.05), 1.35) * 0.78;
        float hullPen  = ellip(vP, vec2(0.5, 0.0), vec2(6.4, 1.75), 1.2) * 0.44;
        float nose     = ellip(vP, vec2(5.2, 0.0), vec2(2.8, 0.78), 1.35) * 0.58;
        float boom     = ellip(vP, vec2(-5.2, 0.0), vec2(3.8, 0.62), 1.35) * 0.48;
        // Stub wings, sponsons & wingtip lift fans
        float wings    = ellip(vP, vec2(-0.1, 0.0), vec2(1.55, 3.9), 1.4) * 0.52;
        float sponsons = ellip(vP, vec2(-2.15, 0.0), vec2(1.65, 1.75), 1.45) * 0.68;
        float fanL     = ellip(vP, vec2(0.1, 3.7), vec2(1.05, 1.05), 1.5) * 0.48;
        float fanR     = ellip(vP, vec2(0.1, -3.7), vec2(1.05, 1.05), 1.5) * 0.48;

        // Tight, dark tire-to-pad contact occlusion + wheel strut shadow pools
        float tireNoseL = ellip(vP, vec2(6.89, 0.13), vec2(0.36, 0.22), 1.15) * 0.95;
        float tireNoseR = ellip(vP, vec2(6.89, -0.13), vec2(0.36, 0.22), 1.15) * 0.95;
        float tireNosePool = ellip(vP, vec2(6.88, 0.0), vec2(0.75, 0.55), 1.2) * 0.65;
        float tireMainL = ellip(vP, vec2(-1.93, 1.24), vec2(0.52, 0.34), 1.2) * 0.96;
        float tireMainR = ellip(vP, vec2(-1.93, -1.24), vec2(0.52, 0.34), 1.2) * 0.96;
        float tireMainPoolL = ellip(vP, vec2(-1.95, 1.22), vec2(0.95, 0.72), 1.2) * 0.62;
        float tireMainPoolR = ellip(vP, vec2(-1.95, -1.22), vec2(0.95, 0.72), 1.2) * 0.62;

        float bodyAO = max(max(max(hullCore, hullPen), max(nose, boom)), max(wings, max(sponsons, max(fanL, fanR))));
        float tireAO = max(max(tireNoseL, max(tireNoseR, tireNosePool)), max(max(tireMainL, tireMainR), max(tireMainPoolL, tireMainPoolR)));
        float a = clamp(bodyAO + tireAO * (1.0 - bodyAO * 0.35), 0.0, 0.96) * uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.006;
  m.renderOrder = 1;
  m.userData.sys = 'fx';
  m.userData.keep = true;
  return m;
}

export class Helicopter {
  constructor(M) {
    this.M = M;
    this.root = new THREE.Group();
    this.root.name = 'STRIX';
    this.root.rotation.order = 'YZX';
    this.body = grp(this.root, null, null, 'body');
    this.parts = [];
    this.anchors = {};
    this.lightsList = [];
    this.missiles = [];
    this.rocketTubes = [[], []];
    this.anim = { gear: 1, gearDoor: 1, canopy: 0, bays: 0, gun: 0, fanTilt: 0, glow: 1, lights: 1, flap: 0, landing: 0, search: 0, steps: 0 };
    this.target = { gear: 1, canopy: 0, bays: 0, gun: 0, fanTilt: 0, glow: 1, lights: 1, flap: 0.5, landing: 0, search: 0 };
    this.gunAim = { az: 0.04, el: 0.04, spin: 0, spinV: 0 };
    this.sensorAim = { az: 0, el: -0.04 };
    this.time = 0;

    this.contactShadow = makeContactShadow();
    this.root.add(this.contactShadow);

    this.buildHull();
    this.buildCanopy();
    this.buildPylon();
    this.buildNacelle(1); this.buildNacelle(-1);
    this.buildWing(1); this.buildWing(-1);
    this.buildBay(1); this.buildBay(-1);
    this.buildGear();
    this.buildGun();
    this.buildSensor();
    this.buildTail();
    this.buildDetails();
    this.buildLights();
    this.buildDecals();

    this.rotor = new CoaxRotor(M);
    this.rotor.group.position.set(0.25, 0.2, 0);
    this.body.add(this.rotor.group);
    this.reg(this.rotor.mastG, 'Mast & dual swashplates', [0, 1.5, 0], [0, 3.4, 0]);
    this.reg(this.rotor.lower.hub, 'Lower rotor · CW', [0, 3.0, 0], [2.2, 0.1, 0]);
    this.reg(this.rotor.upper.hub, 'Upper rotor · CCW', [0, 5.0, 0], [-2.4, 0.1, 0]);
    this.reg(this.rotor.dome, 'Mast radar dome', [0, 6.6, 0], [0, 0.3, 0]);

    this.cockpit = buildCockpit(M, this.body);
    this.reg(this.cockpit.group, 'Tandem crew stations', [0, 1.1, 0], [3.6, 2.2, 0]);

    this.internals = buildInternals(M, this.body);
    for (const p of this.internals.parts) this.reg(p.g, p.label, p.vec, p.anchor);

    this.finalize();
  }

  /** register an explodable part */
  reg(g, label, vec, anchor = [0, 0, 0]) {
    this.parts.push({ g, label, base: g.position.clone(), vec: V3(...vec), anchor: V3(...anchor) });
    return g;
  }
  part(name, label, vec, anchor) {
    const g = grp(this.body, null, null, name);
    if (label !== undefined) this.reg(g, label, vec, anchor);
    return g;
  }
  anchor(name, parent, p) { const o = new THREE.Object3D(); o.position.set(...p); parent.add(o); this.anchors[name] = o; return o; }

  // ------------------------------------------------------------------ HULL
  buildHull() {
    const M = this.M;
    this.innerMat = M.interior.clone(); this.innerMat.side = THREE.BackSide;
    // nose
    const noseS = [
      H(7.56, 1.30, .08, 1.29, .17, 1.17, .15, 1.04, .08, .99, .97),
      H(7.10, 1.50, .22, 1.48, .40, 1.22, .35, .98, .19, .90, .88),
      H(6.60, 1.64, .31, 1.62, .52, 1.28, .46, .96, .26, .85, .83),
      H(6.15, 1.74, .38, 1.72, .58, 1.32, .52, .97, .30, .83, .81),
    ];
    this.noseS = noseS;
    const nose = this.part('nose', 'Sensor nose · avionics bay', [2.6, 0, 0], [7.2, 1.3, 0]);
    mk(nose, loft(noseS.map(toSec), { capStart: true, capEnd: true }), [M.paint, M.interiorDark]);

    // open crew tub
    const tubS = [
      H(6.15, 0, .38, 1.72, .58, 1.32, .52, .97, .30, .83, .81),
      H(5.30, 0, .44, 1.78, .66, 1.36, .58, .97, .34, .81, .79),
      H(4.10, 0, .48, 1.84, .72, 1.40, .63, .98, .37, .80, .78),
      H(3.90, 0, .50, 2.08, .76, 1.44, .66, .99, .39, .80, .78),
      H(2.50, 0, .54, 2.14, .88, 1.52, .76, 1.00, .44, .80, .78),
      H(1.50, 0, .58, 2.18, 1.02, 1.58, .88, 1.02, .50, .80, .78),
    ];
    this.tubS = tubS;
    const tub = this.part('tub', 'Armoured crew tub', [0, 0, 0], [4.5, 1.0, 0.7]);
    const tubGeo = loft(tubS.map(h => ({ x: h.x, pts: hullProfile(h.s).slice(1) })), { closed: false });
    mk(tub, tubGeo, M.paint);
    mk(tub, tubGeo, this.innerMat, { shadow: false, sys: 'struct' });

    // aft body
    const aftS = [
      H(1.50, 2.80, .43, 2.72, 1.02, 1.58, .88, 1.02, .50, .80, .78),
      H(0.60, 3.02, .62, 2.96, 1.30, 1.72, 1.12, 1.02, .62, .78, .76),
      H(-0.80, 3.02, .66, 2.96, 1.32, 1.74, 1.14, 1.04, .64, .80, .78),
      H(-2.10, 2.86, .56, 2.78, 1.08, 1.80, .92, 1.16, .52, .96, .94),
      H(-3.30, 2.58, .38, 2.54, .66, 2.02, .54, 1.62, .34, 1.50, 1.48),
    ];
    this.aftS = aftS;
    const aft = this.part('aft', 'Primary structure', [0, 0, 0], [-1.2, 2.2, 1.0]);
    const im = M.interior.clone();
    mk(aft, loft(aftS.map(toSec), { capStart: true, capEnd: true }), [M.paint, im]);

    // tail boom
    const boomS = [
      aftS[4],
      H(-5.40, 2.55, .30, 2.52, .50, 2.14, .43, 1.84, .26, 1.76, 1.75),
      H(-7.70, 2.48, .22, 2.45, .36, 2.22, .31, 2.02, .19, 1.97, 1.96),
    ];
    this.boomS = boomS;
    const boom = this.part('boom', 'Tail boom · drive tunnel', [-1.8, 0, 0], [-5.4, 2.5, 0]);
    this.boomG = boom;
    mk(boom, loft(boomS.map(toSec), { capStart: true, capEnd: true }), [M.paint, M.paint2]);

    // Thin, crisp, segmented chine formation light strips seated in dark bezel channels (never occluded)
    const chine = [...noseS, ...tubS.slice(1), ...aftS.slice(1)].map(h => h.s);
    const xs = [...noseS, ...tubS.slice(1), ...aftS.slice(1)].map(h => h.x);
    const bezelGeos = [];
    const glowGeos = [];
    const dotGeos = [];
    for (const sd of [1, -1]) {
      const bezelPts = chine.map((s, i) => V3(xs[i], s.yC, sd * (s.zC + 0.0015)));
      const glowPts = chine.map((s, i) => V3(xs[i], s.yC, sd * (s.zC + 0.0072)));
      bezelGeos.push(polyBars(bezelPts.slice(0, -1), 0.0064, 5));
      glowGeos.push(segmentedBars(glowPts.slice(0, -1), 0.0056, 6, 0.014, 1));

      const bBezel = boomS.map(h => V3(h.x, h.s.yC, sd * (h.s.zC + 0.0015)));
      const bGlow = boomS.map(h => V3(h.x, h.s.yC, sd * (h.s.zC + 0.0068)));
      bezelGeos.push(polyBars(bBezel, 0.0060, 5));
      glowGeos.push(segmentedBars(bGlow, 0.0052, 6, 0.016, 2));

      // Small recessed green tactical formation indicator markers on forward/mid hull & boom
      for (const [fx, fy, fz, ry] of [
        [5.68, 1.56, sd * 0.56, sd * 0.12],
        [4.55, 1.65, sd * 0.65, sd * 0.08],
        [2.95, 1.82, sd * 0.78, sd * 0.1],
        [-4.25, 2.18, sd * 0.55, sd * -0.09],
      ]) {
        bezelGeos.push(new THREE.BoxGeometry(0.062, 0.015, 0.007).rotateY(ry).translate(fx, fy, fz));
        dotGeos.push(new THREE.BoxGeometry(0.046, 0.008, 0.008).rotateY(ry).translate(fx, fy, fz + sd * 0.003));
      }
    }
    // keel strake + lower hull panel seam strip
    const keelPts = [...noseS, ...tubS.slice(1), ...aftS.slice(1)].map(h => V3(h.x, h.s.yK - 0.012, 0));
    bezelGeos.push(polyBars(keelPts.slice(1, -1), 0.02, 4));

    mk(aft, merge(bezelGeos), M.trim, { shadow: false });
    mk(aft, merge(dotGeos), M.formationDot, { shadow: false });
    this.glowLines = mk(aft, merge(glowGeos), M.glow, { shadow: false });
  }

  // ------------------------------------------------------------------ CANOPY
  buildCanopy() {
    const M = this.M;
    const ridge = [1.80, 2.30, 2.40, 2.80, 2.92, 2.80];
    // Slightly curved 7-point canopy profile so sky reflections sweep naturally across the glazing
    const prof = (h, yR) => {
      const { zS, yS } = h.s;
      const yM = yS + (yR - yS) * 0.48;
      const yU = yS + (yR - yS) * 0.88;
      const zM = zS * 0.89;
      const zU = zS * 0.68;
      return [[-zS, yS], [-zM, yM], [-zU, yU], [0, yR], [zU, yU], [zM, yM], [zS, yS]];
    };
    const secs = this.tubS.map((h, i) => ({ x: h.x, pts: prof(h, ridge[i]) }));
    this.canopySecs = secs;
    const seg = (i) => [secs[i], secs[i + 1]];
    const frameFor = (a, b, ridgeBar = true) => {
      const P = (s, j) => V3(s.x, s.pts[j][1], s.pts[j][0]);
      const geos = [];
      const archIdx = [0, 2, 3, 4, 6];
      geos.push(polyBars(archIdx.map(j => P(a, j)), 0.034, 10));
      geos.push(polyBars(archIdx.map(j => P(b, j)), 0.034, 10));
      for (const j of archIdx) {
        if (j === 3 && !ridgeBar) continue;
        const rBar = (j === 0 || j === 6) ? 0.039 : 0.028;
        geos.push(polyBars([P(a, j), P(b, j)], rBar, 10));
      }
      // Corner gusset reinforcement plates at frame joints
      for (const s of [a, b]) {
        for (const j of [2, 4]) {
          const p = P(s, j);
          geos.push(new THREE.BoxGeometry(0.095, 0.064, 0.042).translate(p.x, p.y - 0.01, p.z));
        }
      }
      return merge(geos);
    };
    // Thick 3D interior structural box-section frame liner + weatherstrip seal visible from inside cockpit
    const innerFrameFor = (a, b, ridgeBar = true) => {
      const PIn = (s, j) => {
        const z0 = s.pts[j][0], y0 = s.pts[j][1];
        const sd = Math.sign(z0);
        const insetZ = z0 - sd * (j === 0 || j === 6 ? 0.028 : 0.024);
        const insetY = y0 - (j === 3 ? 0.030 : j === 0 || j === 6 ? 0.012 : 0.022);
        return V3(s.x, insetY, insetZ);
      };
      const geos = [];
      const archIdx = [0, 2, 3, 4, 6];
      geos.push(polyBars(archIdx.map(j => PIn(a, j)), 0.026, 8));
      geos.push(polyBars(archIdx.map(j => PIn(b, j)), 0.026, 8));
      for (const j of archIdx) {
        if (j === 3 && !ridgeBar) continue;
        const rBar = (j === 0 || j === 6) ? 0.032 : 0.023;
        const pA = PIn(a, j), pB = PIn(b, j);
        geos.push(polyBars([pA, pB], rBar, 8));
        // Structural web connecting outer and inner frame rails along upper shoulder & sill
        if (j === 0 || j === 2 || j === 4 || j === 6) {
          const mid = new THREE.Vector3().lerpVectors(pA, pB, 0.5);
          const len = pA.distanceTo(pB);
          const dy = pB.y - pA.y, dz = pB.z - pA.z, dx = pB.x - pA.x;
          const pitch = Math.atan2(dy, Math.abs(dx) || 1e-3);
          const yaw = Math.atan2(dz, Math.abs(dx) || 1e-3);
          geos.push(new THREE.BoxGeometry(len * 0.94, 0.032, 0.024).rotateZ(-pitch).rotateY(yaw).translate(mid.x, mid.y + 0.008, mid.z));
        }
      }
      // Interior corner grab-handle brackets & canopy lock striker plates
      for (const s of [a, b]) {
        for (const j of [2, 4]) {
          const p = PIn(s, j);
          geos.push(new THREE.BoxGeometry(0.082, 0.052, 0.034).translate(p.x, p.y - 0.008, p.z));
        }
      }
      return merge(geos);
    };
    const rivetFor = (a, b, ridgeBar = true) => {
      const P = (s, j) => V3(s.x, s.pts[j][1], s.pts[j][0]);
      const rGeos = [];
      const sillGeos = [];
      // Longitudinal sill & shoulder rail rivets (both exterior and interior flange bolts)
      for (const j of [0, 2, 4, 6]) {
        const pA = P(a, j), pB = P(b, j);
        const len = pA.distanceTo(pB);
        const isSill = (j === 0 || j === 6);
        const sd = j < 3 ? -1 : 1;
        if (isSill) {
          const sA = pA.clone().add(V3(0, -0.018, sd * 0.016));
          const sB = pB.clone().add(V3(0, -0.018, sd * 0.016));
          sillGeos.push(polyBars([sA, sB], 0.013, 6));
        }
        const nRiv = Math.max(4, Math.round(len / (isSill ? 0.09 : 0.13)));
        for (let k = 1; k < nRiv; k++) {
          const pt = new THREE.Vector3().lerpVectors(pA, pB, k / nRiv);
          const rOffZ = sd * (isSill ? 0.032 : 0.022);
          const rOffY = isSill ? -0.004 : 0.016;
          rGeos.push(new THREE.CylinderGeometry(0.0068, 0.0068, 0.016, 6).rotateX(Math.PI / 2).translate(pt.x, pt.y + rOffY, pt.z + rOffZ));
          // Interior frame flange bolt heads visible from cockpit camera
          rGeos.push(new THREE.CylinderGeometry(0.0055, 0.0055, 0.014, 6).rotateX(Math.PI / 2).translate(pt.x, pt.y - 0.018, pt.z - sd * 0.032));
        }
      }
      // Vertical / sloped arch pillar rivets & corner gusset bolts
      for (const s of [a, b]) {
        for (const [j0, j1] of [[0, 2], [6, 4]]) {
          const p0 = P(s, j0), p1 = P(s, j1);
          const sd = j0 === 0 ? -1 : 1;
          for (let k = 1; k <= 4; k++) {
            const pt = new THREE.Vector3().lerpVectors(p0, p1, k / 5);
            rGeos.push(new THREE.CylinderGeometry(0.0065, 0.0065, 0.016, 6).rotateX(Math.PI / 2).translate(pt.x, pt.y, pt.z + sd * 0.026));
            rGeos.push(new THREE.CylinderGeometry(0.0055, 0.0055, 0.014, 6).rotateX(Math.PI / 2).translate(pt.x, pt.y - 0.014, pt.z - sd * 0.028));
          }
        }
        for (const j of [2, 4]) {
          const p = P(s, j);
          const sd = j === 2 ? -1 : 1;
          for (const [dx, dy] of [[-0.03, -0.02], [0.03, -0.02], [-0.03, 0.01], [0.03, 0.01]]) {
            rGeos.push(new THREE.CylinderGeometry(0.0072, 0.0072, 0.018, 6).rotateX(Math.PI / 2).translate(p.x + dx, p.y + dy, p.z + sd * 0.021));
          }
        }
      }
      return { rivets: merge(rGeos), sills: sillGeos.length ? merge(sillGeos) : null };
    };
    const glassGeo = (a, b) => loft([a, b], { closed: false, smooth: true });

    const names = [
      ['windscreen', 'Armoured windscreen', [1.3, 1.6, 0], [5.8, 2.0, 0]],
      ['canopyF', 'Gunner canopy', [0.5, 2.6, 0], [4.7, 2.4, 0]],
      ['blast', 'Blast shield', [0, 2.3, 0], [4.0, 2.6, 0]],
      ['canopyR', 'Pilot canopy', [-0.3, 3.0, 0], [3.2, 2.9, 0]],
      ['canopyRear', 'Aft glazing', [-0.8, 2.4, 0], [2.0, 2.8, 0]],
    ];
    this.hatches = [];
    names.forEach(([name, label, vec, anc], i) => {
      const [a, b] = seg(i);
      const g = this.part(name, label, vec, anc);
      let host = g;
      if (name === 'canopyF' || name === 'canopyR') {
        // hinged at aft ridge, lifts open
        const piv = grp(g, [b.x, b.pts[3][1], 0]);
        const inner = grp(piv, [-b.x, -b.pts[3][1], 0]);
        host = inner;
        this.hatches.push(piv);
        // gas strut
        const strut = mk(g, strutGeo(0.015), M.steel, { sys: 'struct', shadow: false });
        this.hatchStruts = this.hatchStruts || [];
        this.hatchStruts.push({ strut, piv, a: V3(b.x + 0.6, b.pts[6][1] - 0.03, b.pts[6][0] - 0.07), local: V3(0.3, -0.2, b.pts[6][0] - 0.1) });
      }
      const gm = mk(host, glassGeo(a, b), M.glass, { sys: 'glass', shadow: false, receive: false });
      gm.renderOrder = 5;
      mk(host, frameFor(a, b, name !== 'windscreen'), M.trim, { sys: 'skin' });
      mk(host, innerFrameFor(a, b, name !== 'windscreen'), M.interiorDark, { sys: 'struct', shadow: false });
      const rv = rivetFor(a, b, name !== 'windscreen');
      if (rv.sills) mk(host, rv.sills, M.darkMetal, { sys: 'skin', shadow: false });
      mk(host, rv.rivets, M.steel, { sys: 'skin', shadow: false });
      if (name === 'canopyF' || name === 'canopyR') {
        // Recessed canopy latch handle + boarding grab handle + overhead canopy severance detonation cord (MDC)
        const mx = (a.x + b.x) / 2;
        mk(host, merge([1, -1].map(sd => new THREE.BoxGeometry(0.14, 0.026, 0.025).translate(mx, a.pts[6][1] + 0.045, sd * (a.pts[6][0] + 0.008)))), M.darkMetal, { shadow: false });
        mk(host, merge([1, -1].map(sd => new THREE.BoxGeometry(0.1, 0.016, 0.03).translate(mx, a.pts[6][1] + 0.045, sd * (a.pts[6][0] + 0.012)))), M.yellow, { shadow: false });
        // Overhead miniature detonation cord (MDC) serpentine trace inside upper canopy panels
        const mdcGeos = [];
        for (const sd of [-1, 1]) {
          const pts = [];
          const nSteps = 9;
          for (let k = 0; k <= nSteps; k++) {
            const u = k / nSteps;
            const x = a.x + (b.x - a.x) * (0.12 + 0.76 * u);
            const yR = a.pts[3][1] + (b.pts[3][1] - a.pts[3][1]) * u;
            const yU = a.pts[4][1] + (b.pts[4][1] - a.pts[4][1]) * u;
            const zU = a.pts[4][0] + (b.pts[4][0] - a.pts[4][0]) * u;
            const zig = (k % 2 === 0 ? 0.36 : 0.68);
            pts.push(V3(x, yR * (1 - zig) + yU * zig - 0.008, sd * zU * zig));
          }
          mdcGeos.push(polyBars(pts, 0.0032, 5));
        }
        mk(host, merge(mdcGeos), M.darkMetal, { sys: 'struct', shadow: false });
      }
    });
    // Forward & upper wire-strike cutters + dual windshield wipers on windscreen
    const wsG = this.parts.find(p => p.g.name === 'windscreen').g;
    const cut = slab([[0, 0], [0.38, 0.05], [0.3, 0.12], [0.22, 0.09], [0.16, 0.14], [0.06, 0.12], [0, 0.18]], 0.025, 0.004);
    mk(wsG, cut, M.metal, { p: [5.55, 2.26, 0], r: [0, 0, -0.35], shadow: false });
    const rearC = this.parts.find(p => p.g.name === 'canopyRear').g;
    const upperCut = slab([[0, 0], [0.32, 0.04], [0.24, 0.14], [0.16, 0.11], [0.10, 0.18], [0, 0.22]], 0.022, 0.004);
    mk(rearC, upperCut, M.metal, { p: [2.42, 2.91, 0], r: [0, 0, -0.22], shadow: false });
    const wiperGeos = [];
    for (const sd of [-1, 1]) {
      wiperGeos.push(new THREE.CylinderGeometry(0.018, 0.022, 0.04, 8).translate(6.08, 1.76, sd * 0.16));
      wiperGeos.push(new THREE.BoxGeometry(0.42, 0.012, 0.014).rotateZ(-0.58).rotateY(sd * -0.1).rotateX(sd * 0.18).translate(5.85, 1.92, sd * 0.15));
    }
    mk(wsG, merge(wiperGeos), M.darkMetal, { shadow: false });
  }

  // ------------------------------------------------------------------ PYLON / MAST FAIRING
  buildPylon() {
    const M = this.M;
    const pyl = [
      H(1.35, 2.88, .28, 2.87, .40, 2.80, .40, 2.76, .30, 2.74, 2.72),
      H(0.85, 3.52, .28, 3.48, .46, 3.18, .54, 2.98, .44, 2.92, 2.90),
      H(-0.30, 3.68, .32, 3.64, .52, 3.26, .60, 3.00, .48, 2.94, 2.92),
      H(-1.30, 3.44, .28, 3.40, .46, 3.12, .54, 2.96, .44, 2.92, 2.90),
      H(-2.20, 2.96, .22, 2.94, .32, 2.88, .34, 2.84, .26, 2.82, 2.80),
    ];
    const g = this.part('pylon', 'Rotor pylon fairing', [0, 1.7, 0], [-0.6, 3.5, 0.4]);
    mk(g, loft(pyl.map(toSec), { capStart: true, capEnd: true }), [M.paint2, M.paint2]);
    // Dark rubber aerodynamic root seal along pylon-to-fuselage junction + cooling grilles + mast collar
    const sealGeos = [];
    const trimGeos = [lathe([[0.15, 3.64], [0.26, 3.66], [0.24, 3.73], [0.14, 3.75]], 24).translate(0.25, 0, 0)];
    for (const sd of [1, -1]) {
      const sealPts = pyl.map(p => V3(p.x, p.s.yL + 0.01, sd * (p.s.zL + 0.008)));
      sealGeos.push(polyBars(sealPts, 0.018, 5));
      for (let i = 0; i < 8; i++) {
        trimGeos.push(new THREE.BoxGeometry(0.045, 0.19, 0.022).rotateZ(0.3).rotateX(sd * 0.25).translate(-0.98 + i * 0.085, 3.2, sd * 0.515));
      }
    }
    mk(g, merge(sealGeos), M.rubber, { shadow: false });
    mk(g, merge(trimGeos), M.trim, { shadow: false });
    const boltGeos = [];
    for (let b = 0; b < 12; b++) {
      const a = (b / 12) * TAU;
      boltGeos.push(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6).translate(0.25 + Math.cos(a) * 0.21, 3.73, Math.sin(a) * 0.21));
    }
    mk(g, merge(boltGeos), M.steel, { shadow: false });
  }

  // ------------------------------------------------------------------ ENGINE NACELLES
  buildNacelle(side) {
    const M = this.M;
    const g = this.part('nacelle' + side, 'Turboshaft nacelle', [0, 1.0, side * 2.6], [-0.4, 3.35, 1.08]);
    const S = grp(g); S.scale.z = side;
    const cz = 1.08, cy = 2.78, R = 0.54;
    const st = [[1.48, 0.7], [1.2, 0.93], [0.3, 1.0], [-1.0, 1.0], [-1.8, 0.9], [-2.15, 0.72]];
    const secs = st.map(([x, r]) => ({ x, pts: ringProfile(8, r * R, r * R * 0.92, cz, cy, Math.PI / 8) }));
    mk(S, loft(secs, { capStart: false, capEnd: true }), [M.paint, M.paint2]);

    // Inboard aerodynamic root fillet seal where nacelle meets pylon/fuselage
    const rootSealPts = st.map(([x, r]) => V3(x, cy - r * R * 0.25, cz - r * R * 0.88));
    mk(S, polyBars(rootSealPts, 0.024, 5), M.rubber, { shadow: false });

    // Armoured cheek plate along the outboard flank
    mk(S, slab([[1.1, -0.18], [0.9, 0.2], [-1.55, 0.2], [-1.75, -0.12], [-1.4, -0.26], [0.8, -0.26]], 0.05, 0.015), M.paint2, { p: [0, cy - 0.02, cz + R * 0.95] });

    // Intake bellmouth: electro-thermal metallic anti-ice lip + dark interior + splitter cone
    const r0 = R * 0.7;
    const darkGeos = [
      new THREE.TorusGeometry(r0, 0.052, 12, 32).rotateY(Math.PI / 2).translate(1.48, cy, cz),
      polyBars([V3(0.88, cy + 0.19, cz + R * 0.98), V3(-1.52, cy + 0.19, cz + R * 0.98)], 0.008, 5),
    ];
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      darkGeos.push(new THREE.BoxGeometry(0.22, 0.02, 0.012).rotateX(a).translate(1.12, cy + Math.cos(a) * 0.26, cz + Math.sin(a) * 0.26));
    }
    const steelGeos = [];
    for (const x of [0.75, 0.2, -0.35, -0.9, -1.4]) {
      darkGeos.push(new THREE.BoxGeometry(0.09, 0.024, 0.035).translate(x, cy - R * 0.85, cz + 0.24));
      steelGeos.push(new THREE.BoxGeometry(0.04, 0.012, 0.038).translate(x, cy - R * 0.85, cz + 0.242));
    }
    mk(S, merge(darkGeos), M.darkMetal, { shadow: false });
    mk(S, merge(steelGeos), M.steel, { shadow: false });

    mk(S, merge([
      new THREE.CylinderGeometry(r0, r0 * 0.9, 0.5, 20, 1, true).rotateZ(Math.PI / 2).translate(1.24, cy, cz),
      new THREE.CircleGeometry(r0, 20).rotateY(Math.PI / 2).translate(1.0, cy, cz),
    ]), M.interiorDark, { shadow: false });

    // Thin, dim recessed formation ring around intake lip
    const glowLip = new THREE.TorusGeometry(r0 + 0.024, 0.0038, 6, 36); glowLip.rotateY(Math.PI / 2);
    mk(S, glowLip, M.glowRing || M.glowSoft, { p: [1.520, cy, cz], shadow: false });
    this.anchor('intake' + side, S, [1.55, cy, cz]);

    // IR-suppressing exhaust: flattens and turns up/out with titanium heat-shield shroud
    const rect = (x, z, y, w, h) => ({
      x, pts: [[z - w / 2 + 0.06, y - h / 2], [z + w / 2 - 0.06, y - h / 2], [z + w / 2, y - h / 2 + 0.06], [z + w / 2, y + h / 2 - 0.06],
        [z + w / 2 - 0.06, y + h / 2], [z - w / 2 + 0.06, y + h / 2], [z - w / 2, y + h / 2 - 0.06], [z - w / 2, y - h / 2 + 0.06]],
    });
    const ex = [rect(-1.7, cz, cy + 0.02, 0.7, 0.62), rect(-2.35, cz + 0.08, cy + 0.2, 0.74, 0.44), rect(-2.9, cz + 0.17, cy + 0.46, 0.8, 0.24)];
    mk(S, loft(ex, { capEnd: true }), [M.darkMetal, M.heat]);
    // Exhaust lip metallic heat-shield collar + splitter cone + vanes
    const exCollar = [rect(-2.72, cz + 0.14, cy + 0.38, 0.81, 0.30), rect(-2.91, cz + 0.17, cy + 0.46, 0.82, 0.25)];
    const tiGeos = [
      new THREE.TorusGeometry(r0 - 0.015, 0.022, 8, 28).rotateY(Math.PI / 2).translate(1.515, cy, cz),
      lathe([[0.2, 0], [0.19, 0.14], [0.1, 0.3], [0, 0.38]], 20, true).translate(1.0, cy, cz),
      loft(exCollar, { capEnd: false }),
    ];
    for (let i = 0; i < 6; i++) {
      tiGeos.push(new THREE.BoxGeometry(0.08, 0.21, 0.014).rotateZ(0.6).translate(-2.87, cy + 0.46, cz + 0.17 - 0.32 + i * 0.128));
    }
    mk(S, merge(tiGeos), M.titanium, { shadow: false });
    this.anchor('exhaust' + side, S, [-2.96, cy + 0.48, cz + 0.18]);
    this.anchor('exhaustDir' + side, S, [-3.96, cy + 1.08, cz + 0.5]);

    // Louvres, top cooling grille, intake splitter bars & nacelle underline bezel
    const uA = V3(1.18, cy - R * 0.72, cz + R * 0.62), uB = V3(-1.72, cy - R * 0.66, cz + R * 0.58);
    const trimGeos = [polyBars([uA, uB], 0.006, 5)];
    for (let i = -2; i <= 2; i++) trimGeos.push(new THREE.BoxGeometry(0.02, r0 * 1.9, 0.016).translate(1.4, cy, cz + i * 0.13));
    for (let i = 0; i < 9; i++) trimGeos.push(new THREE.BoxGeometry(0.035, 0.02, 0.34).translate(-0.2 - i * 0.08, cy + R * 0.92 + 0.01, cz));
    mk(S, merge(trimGeos), M.trim, { shadow: false });

    // Crisp thin segmented nacelle underline strip seated cleanly outside the bezel
    const uA2 = V3(1.18, cy - R * 0.722, cz + R * 0.626), uB2 = V3(-1.72, cy - R * 0.662, cz + R * 0.586);
    mk(S, segmentedBars([uA2, uB2], 0.0050, 6, 0.018, 3), M.glow, { shadow: false });
  }

  // ------------------------------------------------------------------ WINGS + LIFT FANS + PODS
  buildWing(side) {
    const M = this.M;
    const wing = this.part('wing' + side, 'Stub wing · flaperon', [0, -0.2, side * 2.6], [0.1, 1.6, 2.2]);
    const S = grp(wing); S.scale.z = side;
    const W = grp(S, [0, 1.73, 1.2], [0.1, 0, 0]);
    mk(W, planform([[1.0, 0], [0.5, 2.5], [-0.3, 2.5], [-0.55, 0]], 0.18, 0.05), M.paint);
    // Metallic leading-edge erosion strip + crisp thin segmented formation line + dark root fillet seal
    mk(W, polyBars([V3(0.99, 0, 0.06), V3(0.50, 0, 2.46)], 0.024, 6), M.darkMetal, { shadow: false });
    mk(W, segmentedBars([V3(1.015, 0.008, 0.08), V3(0.525, 0.008, 2.44)], 0.0042, 5, 0.022, 3), M.glowSoft, { shadow: false });
    const wPaint2Geos = [planform([[1.25, -0.05], [0.95, 0.25], [-0.5, 0.25], [-0.75, -0.05]], 0.12, 0.03).translate(0, -0.02, 0)];
    for (const fz of [0.85, 1.55, 2.15]) {
      wPaint2Geos.push(slab([[0.12, 0], [-0.28, 0], [-0.22, -0.07], [0.06, -0.05]], 0.04, 0.01).translate(-0.22, -0.07, fz));
    }
    mk(W, merge(wPaint2Geos), M.paint2, { shadow: false });
    mk(W, planform([[1.28, -0.08], [1.0, 0.06], [-0.55, 0.06], [-0.78, -0.08]], 0.15, 0.02), M.rubber, { p: [0, -0.02, 0], shadow: false });
    // flaperon
    const fl = grp(W, [-0.38, 0, 1.55], [0, Math.atan(0.2 / 2.55), 0]);
    this.flaps = this.flaps || [];
    this.flaps.push(fl);
    mk(fl, planform([[0, -0.85], [0, 0.95], [-0.32, 0.95], [-0.32, -0.85]], 0.07, 0.02), M.paint2);

    // Inner hardpoint pylon + 19-tube rocket pod
    const P = grp(W, [0.05, -0.08, 1.05], [-0.1, 0, 0]);
    mk(P, slab([[0.5, 0], [-0.4, 0], [-0.3, -0.3], [0.35, -0.3]], 0.09, 0.02), M.paint2);
    mk(P, new THREE.BoxGeometry(0.6, 0.04, 0.12), M.darkMetal, { p: [0.05, -0.31, 0], sys: 'weapon', shadow: false });
    const pod = grp(P, [0.1, -0.56, 0]);
    this.reg(pod, 'Rocket pod × 19', [0, -1.0, 0], [0, -0.3, 0]);
    mk(pod, lathe([[0, -0.92], [0.1, -0.9], [0.19, -0.74], [0.22, -0.6], [0.22, 0.66], [0.225, 0.7], [0.2, 0.74], [0.185, 0.7], [0.0, 0.7]], 24, true), M.paint2, { sys: 'weapon' });
    mk(pod, merge([
      new THREE.CylinderGeometry(0.227, 0.227, 0.045, 20).rotateZ(Math.PI / 2).translate(-0.3, 0, 0),
      new THREE.CylinderGeometry(0.227, 0.227, 0.045, 20).rotateZ(Math.PI / 2).translate(0.4, 0, 0),
    ]), M.steel, { sys: 'weapon', shadow: false });
    const holes = hexPoints(19, 0.083);
    const tubeG = [];
    holes.forEach(([hz, hy]) => tubeG.push(new THREE.CylinderGeometry(0.034, 0.034, 0.04, 8).rotateZ(Math.PI / 2).translate(0.705, hy, hz)));
    mk(pod, merge(tubeG), M.interiorDark, { sys: 'weapon', shadow: false });
    const tips = new THREE.InstancedMesh(new THREE.ConeGeometry(0.026, 0.09, 8).rotateZ(-Math.PI / 2), M.missileNose, 19);
    tips.userData.sys = 'weapon';
    const tm = new THREE.Matrix4();
    holes.forEach(([hz, hy], i) => { tm.makeTranslation(0.66, hy, hz); tips.setMatrixAt(i, tm); });
    pod.add(tips);
    const sideIdx = side > 0 ? 0 : 1;
    holes.forEach(([hz, hy], i) => {
      const o = new THREE.Object3D(); o.position.set(0.72, hy, hz); pod.add(o);
      this.rocketTubes[sideIdx].push({ o, i, tips, present: true, pos: V3(0.66, hy, hz) });
    });

    // Outboard hardpoint pylon + dual AGM rack (matches under-wing munition silhouette in targets)
    const P2 = grp(W, [0.0, -0.08, 1.78], [-0.1, 0, 0]);
    mk(P2, slab([[0.42, 0], [-0.34, 0], [-0.26, -0.26], [0.28, -0.26]], 0.075, 0.015), M.paint2);
    mk(P2, merge([
      new THREE.BoxGeometry(0.55, 0.035, 0.34).translate(0.02, -0.27, 0),
      new THREE.BoxGeometry(0.78, 0.03, 0.045).translate(0.04, -0.30, -0.13),
      new THREE.BoxGeometry(0.78, 0.03, 0.045).translate(0.04, -0.30, 0.13),
    ]), M.darkMetal, { sys: 'weapon', shadow: false });
    for (const mz of [-0.13, 0.13]) {
      const wm = this.buildMissile(true);
      wm.scale.setScalar(0.84);
      wm.position.set(0.06, -0.39, mz);
      P2.add(wm);
    }

    // wingtip pod + tilting lift fan
    const tip = grp(W, [0, 0, 2.5]);
    mk(tip, new THREE.CylinderGeometry(0.17, 0.17, 0.42, 16).rotateX(Math.PI / 2), M.paint2, { p: [0, 0, 0.12] });
    // Tiny point wingtip nav light in recessed housing
    mk(tip, new THREE.BoxGeometry(0.075, 0.024, 0.028), M.trim, { p: [0.16, 0.01, 0.14], shadow: false });
    mk(tip, new THREE.SphereGeometry(0.010, 8, 6), side > 0 ? M.navGreen : M.navRed, { p: [0.198, 0.01, 0.145], shadow: false });

    const fanWrap = grp(tip, [0, 0, 0.2]);
    this.reg(fanWrap, 'Tilting lift fan', [0, 0.4, side * 2.4], [0, 0.8, 1.0]);
    const piv = grp(fanWrap);
    this.fanPivots = this.fanPivots || [];
    this.fanPivots.push(piv);
    const F = grp(piv, [0, 0, 1.0]);
    mk(F, lathe([[0.66, 0.26], [0.7, 0.31], [0.8, 0.28], [0.85, 0.12], [0.84, -0.18], [0.77, -0.27], [0.69, -0.24], [0.66, -0.1], [0.655, 0.15], [0.66, 0.26]], 40), M.paint, {});
    // Metallic inlet lip ring + stators + center body merged, plus thin, dim recessed formation ring
    const fanDarkGeos = [
      new THREE.TorusGeometry(0.705, 0.016, 8, 48).rotateX(Math.PI / 2).translate(0, 0.295, 0),
      new THREE.CylinderGeometry(0.17, 0.15, 0.36, 14).translate(0, -0.06, 0),
    ];
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6 + 0.3;
      fanDarkGeos.push(new THREE.BoxGeometry(0.5, 0.1, 0.022).rotateY(a).translate(Math.cos(a) * 0.41, -0.17, -Math.sin(a) * 0.41));
    }
    mk(F, merge(fanDarkGeos), M.darkMetal, { shadow: false });
    mk(F, new THREE.TorusGeometry(0.706, 0.0040, 6, 48).rotateX(Math.PI / 2), M.glowRing || M.glowSoft, { p: [0, 0.310, 0], shadow: false });
    // Inner acoustic liner band + hub spinner + pivot spar
    mk(F, new THREE.CylinderGeometry(0.658, 0.658, 0.22, 32, 1, true), M.interiorDark, { p: [0, 0.05, 0], shadow: false });
    mk(F, lathe([[0, 0.24], [0.08, 0.22], [0.15, 0.15], [0.17, 0.1], [0, 0.1]], 14), M.metal, { sys: 'elec', shadow: false });
    mk(F, new THREE.CylinderGeometry(0.05, 0.05, 0.4, 10).rotateX(Math.PI / 2), M.steel, { p: [0, 0, -0.8], sys: 'struct', shadow: false });
    const spin = grp(F, [0, 0.06, 0]);
    const fbMat = M.blade.clone(); fbMat.transparent = false;
    const fbLEMat = M.bladeLE.clone(); fbLEMat.transparent = false;
    const fbGeos = [], fbLEGeos = [];
    for (let k = 0; k < 7; k++) {
      const a = k * TAU / 7;
      fbGeos.push(new THREE.BoxGeometry(0.49, 0.016, 0.145).rotateX(0.5).translate(0.41, 0, 0).rotateY(a));
      fbLEGeos.push(new THREE.BoxGeometry(0.49, 0.017, 0.026).rotateX(0.5).translate(0.41, 0.032, -0.058).rotateY(a));
    }
    mk(spin, merge(fbGeos), fbMat, { sys: 'elec', shadow: false });
    mk(spin, merge(fbLEGeos), fbLEMat, { sys: 'elec', shadow: false });
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.66, 48, 1).rotateX(-Math.PI / 2), blurMaterial(0x14161a));
    const du = disc.material.uniforms;
    du.uR0.value = 0.17; du.uR1.value = 0.66; du.uBlades.value = 7; du.uChord.value = 0.15;
    disc.userData.sys = 'fx'; disc.userData.keep = true; disc.position.y = 0.06;
    F.add(disc);
    // Compact outboard strobe housing + tiny lens
    mk(F, new THREE.BoxGeometry(0.065, 0.022, 0.022), M.trim, { p: [0, 0, 0.852], shadow: false });
    mk(F, new THREE.SphereGeometry(0.009, 8, 6), M.strobe, { p: [0, 0, 0.864], shadow: false });
    this.fans = this.fans || [];
    this.fans.push({ spin, disc, mat: fbMat, leMat: fbLEMat, F });
    this.anchor('fan' + side, F, [0, 0, 0]);
    this.anchor('fanAxis' + side, F, [0, 1, 0]);
  }

  // ------------------------------------------------------------------ WEAPON BAYS + MISSILES
  buildMissile(castShadow = false) {
    const M = this.M;
    if (!this._mslGeo) {
      const darkGeos = [
        new THREE.CylinderGeometry(0.087, 0.087, 0.025, 14).rotateZ(Math.PI / 2).translate(-0.08, 0, 0),
        new THREE.CylinderGeometry(0.07, 0.06, 0.08, 12).rotateZ(Math.PI / 2).translate(-0.69, 0, 0),
      ];
      for (let k = 0; k < 4; k++) {
        const a = k * TAU / 4 + Math.PI / 4;
        darkGeos.push(slab([[0, 0], [-0.22, 0], [-0.24, 0.15], [-0.1, 0.15]], 0.01, 0).translate(-0.42, 0.08, 0).rotateX(a));
        darkGeos.push(slab([[0, 0], [-0.08, 0], [-0.09, 0.06], [-0.04, 0.06]], 0.008, 0).translate(0.42, 0.08, 0).rotateX(a));
      }
      this._mslGeo = {
        body: new THREE.CylinderGeometry(0.085, 0.085, 1.3, 14).rotateZ(Math.PI / 2),
        nose: lathe([[0.085, 0], [0.08, 0.1], [0.06, 0.2], [0.0, 0.27]], 14, true).translate(0.65, 0, 0),
        seeker: new THREE.CircleGeometry(0.038, 12).rotateY(Math.PI / 2).translate(0.918, 0, 0),
        band: new THREE.CylinderGeometry(0.087, 0.087, 0.04, 14).rotateZ(Math.PI / 2).translate(0.45, 0, 0),
        dark: merge(darkGeos),
      };
    }
    const G = this._mslGeo;
    const g = new THREE.Group();
    mk(g, G.body, M.missile, { sys: 'weapon', shadow: castShadow });
    mk(g, G.nose, M.missileNose, { sys: 'weapon', shadow: false });
    mk(g, G.seeker, M.lens, { sys: 'weapon', shadow: false });
    mk(g, G.band, M.yellow, { sys: 'weapon', shadow: false });
    mk(g, G.dark, M.darkMetal, { sys: 'weapon', shadow: false });
    return g;
  }

  buildBay(side) {
    const M = this.M;
    const g = this.part('bay' + side, 'Weapons bay · 3 missiles', [0, -0.5, side * 1.7], [-0.4, 1.3, 1.1]);
    const S = grp(g); S.scale.z = side;
    const phi = Math.atan2(0.18, 0.7);
    // recessed bay cavity
    const cav = grp(S, [-0.45, 1.04, 1.14], [phi, 0, 0]);
    mk(cav, new THREE.BoxGeometry(2.0, 0.7, 0.01), M.interiorDark, { p: [0, 0.36, 0.009], shadow: false, sys: 'struct' });
    mk(cav, merge([0, 1, 2, 3, 4].map(i => new THREE.BoxGeometry(0.03, 0.68, 0.02).translate(-0.9 + i * 0.45, 0.36, 0.01))), M.darkMetal, { shadow: false });
    const piv = grp(S, [-0.45, 1.04, 1.145], [phi, 0, 0]);
    this.bays = this.bays || [];
    const door = grp(piv);
    mk(door, new THREE.BoxGeometry(2.02, 0.72, 0.035), M.paint, { p: [0, 0.36, 0.022] });
    // Recessed door seam trim + crisp thin segmented formation line + piano hinge knuckles
    mk(door, polyBars([V3(-1.0, 0.705, 0.038), V3(1.0, 0.705, 0.038)], 0.005, 4), M.trim, { shadow: false });
    mk(door, segmentedBars([V3(-0.98, 0.705, 0.042), V3(0.98, 0.705, 0.042)], 0.0038, 5, 0.16, 4), M.glowSoft, { shadow: false });
    const doorDarkGeos = [new THREE.BoxGeometry(1.8, 0.04, 0.03).translate(0, 0.36, -0.015)];
    for (const x of [-0.95, -0.35, 0.35, 0.95]) {
      doorDarkGeos.push(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8).rotateZ(Math.PI / 2).translate(x, 0.0, 0.01));
    }
    const slots = [];
    for (let k = 0; k < 3; k++) {
      const yy = 0.14 + k * 0.22;
      doorDarkGeos.push(new THREE.BoxGeometry(1.1, 0.03, 0.06).translate(0.1, yy, -0.05));
      const ms = this.buildMissile(false);
      ms.position.set(0.05, yy, -0.135);
      door.add(ms);
      const slot = { mesh: ms, side, door, present: true, home: ms.position.clone() };
      slots.push(slot);
      this.missiles.push(slot);
    }
    mk(door, merge(doorDarkGeos), M.darkMetal, { sys: 'weapon', shadow: false });
    this.bays.push({ piv, phi, side, slots });
  }

  // ------------------------------------------------------------------ LANDING GEAR
  wheel(parent, r, w, p) {
    const M = this.M;
    const tire = lathe([[r * 0.56, -w / 2], [r * 0.88, -w / 2], [r, -w / 2 + w * 0.18], [r, w / 2 - w * 0.18], [r * 0.88, w / 2], [r * 0.56, w / 2]], 28);
    tire.rotateX(Math.PI / 2);
    const g = grp(parent, p);
    mk(g, tire, M.rubber, { sys: 'gear' });
    // Wheel rim flange + recessed dish + central grease cap + brake rotor & 10 tie-bolts
    mk(g, merge([
      new THREE.CylinderGeometry(r * 0.63, r * 0.63, w * 0.88, 22).rotateX(Math.PI / 2),
      new THREE.CylinderGeometry(r * 0.22, r * 0.24, w * 1.04, 14).rotateX(Math.PI / 2),
    ]), M.metal, { sys: 'gear', shadow: false });
    mk(g, merge([
      new THREE.CylinderGeometry(r * 0.50, r * 0.50, w * 0.92, 18).rotateX(Math.PI / 2),
      new THREE.CylinderGeometry(r * 0.15, r * 0.17, w * 1.08, 12).rotateX(Math.PI / 2),
    ]), M.darkMetal, { sys: 'gear', shadow: false });
    const steelGeos = [
      new THREE.CylinderGeometry(r * 0.28, r * 0.28, w * 0.98, 14).rotateX(Math.PI / 2),
      new THREE.CylinderGeometry(0.008, 0.008, w * 0.18, 6).rotateZ(0.5).translate(r * 0.44, r * 0.12, w * 0.48),
    ];
    for (let k = 0; k < 10; k++) {
      const a = k * TAU / 10;
      steelGeos.push(new THREE.CylinderGeometry(0.013, 0.013, w * 0.98, 6).rotateX(Math.PI / 2).translate(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, 0));
      steelGeos.push(new THREE.CylinderGeometry(0.009, 0.009, w * 0.94, 6).rotateX(Math.PI / 2).translate(Math.cos(a + 0.31) * r * 0.55, Math.sin(a + 0.31) * r * 0.55, 0));
    }
    mk(g, merge(steelGeos), M.steel, { sys: 'gear', shadow: false });
    return g;
  }

  buildGear() {
    const M = this.M;
    this.gearPivots = [];
    this.gearDoors = [];
    // ---------------- nose gear + recessed gear well
    const ng = this.part('noseGear', 'Nose gear', [0.4, -1.3, 0], [6.9, 0.5, 0]);
    mk(ng, new THREE.BoxGeometry(0.84, 0.22, 0.4), M.interiorDark, { p: [6.88, 0.98, 0], shadow: false, sys: 'struct' });
    mk(ng, merge([6.55, 6.88, 7.2].map(bx => new THREE.BoxGeometry(0.02, 0.18, 0.38).translate(bx, 0.96, 0))), M.darkMetal, { shadow: false, sys: 'struct' });

    const np = grp(ng, [6.95, 1.0, 0]);
    const noseHoseCurve = new THREE.CatmullRomCurve3([
      V3(-0.06, -0.10, 0.056),
      V3(-0.115, -0.34, 0.078),
      V3(-0.102, -0.58, 0.068),
      V3(-0.065, -0.74, 0.048),
    ]);
    // Upper shock strut cylinder + drag brace + steering servo housing + braided brake hose
    mk(np, merge([
      new THREE.CylinderGeometry(0.064, 0.064, 0.42, 16).translate(-0.02, -0.22, 0),
      new THREE.CylinderGeometry(0.032, 0.032, 0.5, 10).rotateZ(-0.5).translate(0.12, -0.2, 0),
      new THREE.CylinderGeometry(0.030, 0.034, 0.048, 10).rotateZ(Math.PI / 2).translate(0.048, -0.3, 0),
      new THREE.CylinderGeometry(0.026, 0.026, 0.20, 10).translate(0.058, -0.22, 0),
      new THREE.TubeGeometry(noseHoseCurve, 14, 0.0095, 6, false),
    ]), M.darkMetal, { sys: 'gear' });
    // Collar + torque scissor links + fork yoke + shimmy damper collar
    mk(np, merge([
      new THREE.CylinderGeometry(0.076, 0.076, 0.054, 16).translate(-0.02, -0.40, 0),
      new THREE.BoxGeometry(0.032, 0.17, 0.054).rotateZ(-0.42).translate(0.050, -0.44, 0),
      new THREE.BoxGeometry(0.032, 0.17, 0.054).rotateZ(0.42).translate(0.050, -0.58, 0),
      new THREE.BoxGeometry(0.062, 0.050, 0.24).translate(-0.05, -0.68, 0),
      new THREE.BoxGeometry(0.044, 0.14, 0.032).translate(-0.05, -0.73, 0.105),
      new THREE.BoxGeometry(0.044, 0.14, 0.032).translate(-0.05, -0.73, -0.105),
    ]), M.metal, { sys: 'gear', shadow: false });
    // High-contrast polished chrome oleo piston + axle + scissor clevis pins + rigid hydraulic line
    mk(np, merge([
      new THREE.CylinderGeometry(0.046, 0.046, 0.34, 16).translate(-0.04, -0.52, 0),
      new THREE.CylinderGeometry(0.034, 0.034, 0.34, 10).rotateX(Math.PI / 2).translate(-0.06, -0.78, 0),
      new THREE.CylinderGeometry(0.014, 0.014, 0.072, 8).rotateX(Math.PI / 2).translate(0.088, -0.51, 0),
      new THREE.CylinderGeometry(0.013, 0.013, 0.066, 8).rotateX(Math.PI / 2).translate(0.022, -0.38, 0),
      new THREE.CylinderGeometry(0.013, 0.013, 0.066, 8).rotateX(Math.PI / 2).translate(0.018, -0.64, 0),
      new THREE.CylinderGeometry(0.009, 0.009, 0.62, 6).translate(-0.078, -0.42, 0.046),
    ]), M.steel, { sys: 'gear' });
    // Stepped brass oleo scraper ring + hydraulic brake unions & P-clip brackets
    mk(np, merge([
      new THREE.CylinderGeometry(0.058, 0.058, 0.026, 14).translate(-0.03, -0.43, 0),
      new THREE.CylinderGeometry(0.015, 0.015, 0.032, 6).translate(-0.115, -0.34, 0.078),
      new THREE.CylinderGeometry(0.015, 0.015, 0.032, 6).translate(-0.102, -0.58, 0.068),
      new THREE.BoxGeometry(0.036, 0.016, 0.024).translate(-0.065, -0.26, 0.046),
      new THREE.BoxGeometry(0.036, 0.016, 0.024).translate(-0.065, -0.50, 0.046),
    ]), M.brass, { sys: 'hyd', shadow: false });
    mk(np, new THREE.CylinderGeometry(0.066, 0.066, 0.024, 14), M.red, { p: [-0.02, -0.34, 0], sys: 'gear', shadow: false });
    mk(np, new THREE.BoxGeometry(0.08, 0.03, 0.06), M.yellow, { p: [0.01, -0.78, 0], sys: 'gear', shadow: false });
    this.wheel(np, 0.22, 0.13, [-0.06, -0.78, 0.13]);
    this.wheel(np, 0.22, 0.13, [-0.06, -0.78, -0.13]);
    mk(np, new THREE.CircleGeometry(0.024, 12).rotateY(Math.PI / 2), M.navWhite, { p: [0.071, -0.3, 0], shadow: false });
    this.gearPivots.push({ g: np, up: -1.65, axis: 'z' });
    for (const sd of [1, -1]) {
      const d = grp(ng, [6.88, 0.86, sd * 0.2]);
      mk(d, new THREE.BoxGeometry(0.8, 0.02, 0.19), M.paint, { p: [0, 0, -sd * 0.095] });
      mk(d, merge([
        new THREE.BoxGeometry(0.74, 0.012, 0.14).translate(0, 0.012, -sd * 0.095),
        new THREE.BoxGeometry(0.025, 0.02, 0.15).translate(-0.22, 0.018, -sd * 0.095),
        new THREE.BoxGeometry(0.025, 0.02, 0.15).translate(0.22, 0.018, -sd * 0.095),
      ]), M.interiorDark, { sys: 'struct', shadow: false });
      this.gearDoors.push({ g: d, open: -sd * 1.45 });
    }

    // ---------------- main gear + sponsons + recessed wells
    for (const side of [1, -1]) {
      const mg = this.part('mainGear' + side, 'Main gear · sponson', [0, -1.2, side * 0.9], [-2.2, 0.9, 1.0]);
      const S = grp(mg); S.scale.z = side;
      mk(S, slab([[-1.4, 1.25], [-1.72, 1.6], [-2.95, 1.6], [-3.2, 1.3], [-2.95, 0.92], [-1.72, 0.92]], 0.52, 0.07), M.paint, { p: [0, 0, 1.18] });
      mk(S, slab([[-1.38, 1.25], [-1.7, 1.62], [-2.97, 1.62], [-3.22, 1.3], [-2.97, 0.9], [-1.7, 0.9]], 0.06, 0.01), M.rubber, { p: [0, 0, 0.94], shadow: false });
      mk(S, new THREE.BoxGeometry(1.22, 0.24, 0.44), M.interiorDark, { p: [-2.32, 1.05, 1.18], shadow: false, sys: 'struct' });
      mk(S, merge([-1.85, -2.32, -2.78].map(rx => new THREE.BoxGeometry(0.025, 0.22, 0.42).translate(rx, 1.05, 1.18))), M.darkMetal, { shadow: false, sys: 'struct' });
      mk(S, new THREE.CylinderGeometry(0.010, 0.010, 1.1, 6).rotateZ(Math.PI / 2), M.brass, { p: [-2.32, 1.12, 1.05], sys: 'hyd', shadow: false });

      const p = grp(S, [-1.75, 1.08, 1.18]);
      // Outboard-routed braided brake hose & rigid line so it reads cleanly in hero & profile shots
      const mainHoseCurve = new THREE.CatmullRomCurve3([
        V3(-0.08, -0.12, 0.065),
        V3(-0.16, -0.34, 0.095),
        V3(-0.22, -0.54, 0.088),
        V3(-0.16, -0.68, 0.065),
        V3(-0.08, -0.73, -0.045),
      ]);
      const mainInboardHose = new THREE.CatmullRomCurve3([
        V3(-0.08, -0.14, -0.06),
        V3(-0.14, -0.38, -0.085),
        V3(-0.17, -0.58, -0.075),
        V3(-0.11, -0.72, -0.055),
      ]);
      // Main shock strut + drag brace + downlock actuator + multi-piston brake caliper housing + dual braided hoses
      mk(p, merge([
        new THREE.CylinderGeometry(0.082, 0.082, 0.45, 16).translate(-0.05, -0.24, 0),
        new THREE.CylinderGeometry(0.038, 0.038, 0.62, 10).rotateZ(-0.55).translate(0.12, -0.3, 0),
        new THREE.CylinderGeometry(0.026, 0.026, 0.34, 8).rotateZ(0.45).translate(0.06, -0.22, 0.04),
        new THREE.BoxGeometry(0.15, 0.21, 0.082).translate(-0.045, -0.73, -0.055),
        new THREE.TubeGeometry(mainHoseCurve, 16, 0.0105, 6, false),
        new THREE.TubeGeometry(mainInboardHose, 14, 0.009, 6, false),
      ]), M.darkMetal, { sys: 'gear' });
      // Gland collar + heavy forged torque scissor links + lower axle knuckle
      mk(p, merge([
        new THREE.CylinderGeometry(0.094, 0.094, 0.058, 16).rotateZ(0.08).translate(-0.08, -0.43, 0),
        new THREE.BoxGeometry(0.042, 0.19, 0.062).rotateZ(-0.45).translate(0.00, -0.50, 0.055),
        new THREE.BoxGeometry(0.042, 0.19, 0.062).rotateZ(0.38).translate(-0.02, -0.64, 0.055),
        new THREE.BoxGeometry(0.13, 0.08, 0.096).translate(-0.16, -0.76, -0.03),
      ]), M.metal, { sys: 'gear', shadow: false });
      // Bright chrome oleo piston + rigid outboard/inboard hydraulic brake lines + slotted brake rotor + clevis pins
      mk(p, merge([
        new THREE.CylinderGeometry(0.058, 0.058, 0.36, 16).rotateZ(0.12).translate(-0.12, -0.56, 0),
        new THREE.CylinderGeometry(0.011, 0.011, 0.66, 6).rotateZ(0.1).translate(-0.145, -0.44, 0.062),
        new THREE.CylinderGeometry(0.010, 0.010, 0.68, 6).rotateZ(0.1).translate(-0.16, -0.45, -0.05),
        new THREE.CylinderGeometry(0.040, 0.040, 0.32, 10).rotateX(Math.PI / 2).translate(-0.18, -0.76, 0.05),
        new THREE.CylinderGeometry(0.22, 0.22, 0.030, 24).rotateX(Math.PI / 2).translate(-0.18, -0.76, -0.055),
        new THREE.CylinderGeometry(0.016, 0.016, 0.088, 8).rotateX(Math.PI / 2).translate(0.04, -0.57, 0.055),
        new THREE.CylinderGeometry(0.014, 0.014, 0.082, 8).rotateX(Math.PI / 2).translate(-0.04, -0.43, 0.055),
        new THREE.CylinderGeometry(0.014, 0.014, 0.082, 8).rotateX(Math.PI / 2).translate(-0.07, -0.71, 0.055),
      ]), M.steel, { sys: 'gear' });
      this.wheel(p, 0.32, 0.2, [-0.18, -0.76, 0.06]);
      // Stepped brass oleo scraper nut + 6-piston caliper block + hydraulic unions & P-clips
      mk(p, merge([
        new THREE.CylinderGeometry(0.072, 0.072, 0.028, 16).rotateZ(0.08).translate(-0.09, -0.46, 0),
        new THREE.BoxGeometry(0.12, 0.15, 0.066).translate(-0.05, -0.72, -0.055),
        new THREE.CylinderGeometry(0.020, 0.020, 0.088, 8).rotateX(Math.PI / 2).translate(-0.05, -0.67, -0.055),
        new THREE.CylinderGeometry(0.020, 0.020, 0.088, 8).rotateX(Math.PI / 2).translate(-0.05, -0.72, -0.055),
        new THREE.CylinderGeometry(0.020, 0.020, 0.088, 8).rotateX(Math.PI / 2).translate(-0.05, -0.77, -0.055),
        new THREE.CylinderGeometry(0.017, 0.017, 0.036, 6).translate(-0.16, -0.34, 0.095),
        new THREE.CylinderGeometry(0.017, 0.017, 0.036, 6).translate(-0.22, -0.54, 0.088),
        new THREE.CylinderGeometry(0.015, 0.015, 0.032, 6).translate(-0.14, -0.38, -0.085),
        new THREE.BoxGeometry(0.044, 0.018, 0.028).translate(-0.12, -0.26, 0.062),
        new THREE.BoxGeometry(0.044, 0.018, 0.028).translate(-0.14, -0.48, 0.062),
      ]), M.brass, { sys: 'gear', shadow: false });
      // High-pressure red hydraulic service band on upper strut
      mk(p, new THREE.CylinderGeometry(0.085, 0.085, 0.026, 16), M.red, { p: [-0.05, -0.35, 0], sys: 'gear', shadow: false });
      this.gearPivots.push({ g: p, up: -1.55, axis: 'z' });
      const d = grp(S, [-2.32, 0.93, 1.43]);
      mk(d, new THREE.BoxGeometry(1.25, 0.022, 0.46), M.paint, { p: [0, 0, -0.23] });
      mk(d, merge([
        new THREE.BoxGeometry(1.16, 0.014, 0.38).translate(0, 0.014, -0.23),
        new THREE.BoxGeometry(0.03, 0.022, 0.36).translate(-0.36, 0.02, -0.23),
        new THREE.BoxGeometry(0.03, 0.022, 0.36).translate(0.36, 0.02, -0.23),
      ]), M.interiorDark, { sys: 'struct', shadow: false });
      this.gearDoors.push({ g: d, open: -1.45 });
    }
  }

  // ------------------------------------------------------------------ CHIN GUN
  buildGun() {
    const M = this.M;
    const g = this.part('gun', '30mm rotary cannon', [1.0, -1.5, 0], [5.6, 0.4, 0]);
    const base = grp(g, [5.3, 0.79, 0]);
    mk(base, new THREE.CylinderGeometry(0.27, 0.3, 0.14, 18), M.darkMetal, { p: [0, -0.07, 0], sys: 'weapon' });
    const az = grp(base, [0, -0.14, 0]);
    mk(az, merge([
      new THREE.CylinderGeometry(0.2, 0.24, 0.12, 16).translate(0, -0.06, 0),
      new THREE.BoxGeometry(0.2, 0.2, 0.05).translate(0, -0.18, 0.17),
      new THREE.BoxGeometry(0.2, 0.2, 0.05).translate(0, -0.18, -0.17),
    ]), M.paint2, { sys: 'weapon' });
    const el = grp(az, [0, -0.2, 0]);
    // Receiver housing + ventilated recoil jacket + side cradle plates
    mk(el, merge([
      new THREE.BoxGeometry(0.62, 0.22, 0.26).translate(0.05, 0, 0),
      new THREE.CylinderGeometry(0.116, 0.128, 0.34, 16).rotateZ(Math.PI / 2).translate(0.46, 0, 0),
      new THREE.BoxGeometry(0.42, 0.11, 0.018).translate(0.52, -0.02, 0.130),
      new THREE.BoxGeometry(0.42, 0.11, 0.018).translate(0.52, -0.02, -0.130),
    ]), M.darkMetal, { sys: 'weapon' });
    mk(el, new THREE.BoxGeometry(0.3, 0.14, 0.3), M.paint2, { p: [-0.2, 0.02, 0], sys: 'weapon', shadow: false });
    // Elevation trunnion shaft + twin hydraulic recoil damper cylinders
    mk(el, merge([
      new THREE.CylinderGeometry(0.032, 0.032, 0.39, 10).rotateX(Math.PI / 2),
      new THREE.CylinderGeometry(0.024, 0.024, 0.30, 8).rotateZ(Math.PI / 2).translate(0.42, -0.08, 0.09),
      new THREE.CylinderGeometry(0.024, 0.024, 0.30, 8).rotateZ(Math.PI / 2).translate(0.42, -0.08, -0.09),
    ]), M.steel, { p: [0, 0, 0], sys: 'weapon', shadow: false });
    const barrels = grp(el, [0.35, 0, 0]);
    // 3-barrel rotary cluster + aft/mid perforated cooling shroud + fluted muzzle flash suppressor
    const bDarkGeos = [
      // Perforated barrel cooling shroud covering aft/mid barrel jacket (x = 0.02..0.64)
      new THREE.CylinderGeometry(0.098, 0.106, 0.62, 18).rotateZ(Math.PI / 2).translate(0.33, 0, 0),
      // Muzzle brake & flash suppressor collar at tip (x = 1.20..1.36)
      new THREE.CylinderGeometry(0.106, 0.098, 0.16, 14).rotateZ(Math.PI / 2).translate(1.28, 0, 0),
      new THREE.CylinderGeometry(0.112, 0.112, 0.030, 14).rotateZ(Math.PI / 2).translate(1.345, 0, 0),
    ];
    for (let k = 0; k < 3; k++) {
      const a = k * TAU / 3;
      const by = Math.cos(a) * 0.058, bz = Math.sin(a) * 0.058;
      bDarkGeos.push(new THREE.CylinderGeometry(0.027, 0.030, 1.28, 10).rotateZ(Math.PI / 2).translate(0.64, by, bz));
      bDarkGeos.push(new THREE.CylinderGeometry(0.034, 0.030, 0.14, 10).rotateZ(Math.PI / 2).translate(1.29, by, bz));
    }
    mk(barrels, merge(bDarkGeos), M.darkMetal, { sys: 'weapon' });
    // Perforated shroud cooling holes (3 axial rows x 8 radial ports) + side cradle holes + muzzle slots + bores
    const shroudHoleGeos = [];
    const holeXs = [0.14, 0.33, 0.52];
    for (let rIdx = 0; rIdx < holeXs.length; rIdx++) {
      const hx = holeXs[rIdx];
      const rOuter = 0.210 - rIdx * 0.004;
      const phase = (rIdx % 2) * (TAU / 16);
      for (let m = 0; m < 8; m++) {
        const ha = m * (TAU / 8) + phase;
        shroudHoleGeos.push(
          new THREE.CylinderGeometry(0.024, 0.024, rOuter, 10)
            .rotateX(ha)
            .translate(hx, 0, 0)
        );
      }
    }
    // Muzzle brake vent slots + dark barrel bores
    for (let m = 0; m < 6; m++) {
      const ma = m * (TAU / 6);
      shroudHoleGeos.push(
        new THREE.BoxGeometry(0.060, 0.020, 0.218)
          .rotateX(ma)
          .translate(1.27, 0, 0)
      );
    }
    for (let k = 0; k < 3; k++) {
      const a = k * TAU / 3;
      shroudHoleGeos.push(
        new THREE.CylinderGeometry(0.020, 0.020, 0.02, 8)
          .rotateZ(Math.PI / 2)
          .translate(1.375, Math.cos(a) * 0.058, Math.sin(a) * 0.058)
      );
    }
    mk(barrels, merge(shroudHoleGeos), M.interiorDark, { sys: 'weapon', shadow: false });
    // Machined metallic shroud stiffening rings & exposed forward barrel spider clamps
    const bSpiderGeos = [
      new THREE.CylinderGeometry(0.110, 0.110, 0.028, 16).rotateZ(Math.PI / 2).translate(0.04, 0, 0),
      new THREE.CylinderGeometry(0.105, 0.105, 0.026, 16).rotateZ(Math.PI / 2).translate(0.425, 0, 0),
      new THREE.CylinderGeometry(0.102, 0.102, 0.032, 16).rotateZ(Math.PI / 2).translate(0.63, 0, 0),
      new THREE.CylinderGeometry(0.096, 0.096, 0.034, 14).rotateZ(Math.PI / 2).translate(0.86, 0, 0),
      new THREE.CylinderGeometry(0.096, 0.096, 0.034, 14).rotateZ(Math.PI / 2).translate(1.10, 0, 0),
    ];
    mk(barrels, merge(bSpiderGeos), M.metal, { sys: 'weapon', shadow: false });
    const muzzle = new THREE.Object3D(); muzzle.position.set(1.4, 0, 0); el.add(muzzle);
    const muzzleFwd = new THREE.Object3D(); muzzleFwd.position.set(2.4, 0, 0); el.add(muzzleFwd);
    // muzzle flash
    const fl = new THREE.Group(); fl.position.set(1.45, 0, 0); el.add(fl);
    const flMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.32), flMat);
      p.position.x = 0.35; p.rotation.x = k * Math.PI / 3; fl.add(p);
    }
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12).rotateY(Math.PI / 2), flMat); fl.add(star);
    fl.userData.sys = 'fx';
    this.gun = { az, el, barrels, muzzle, muzzleFwd, flash: fl, flashMat: flMat };
    // ammo feed chute with articulated rib bands
    const curve = new THREE.CatmullRomCurve3([V3(5.1, 0.72, 0.1), V3(4.4, 0.86, 0.15), V3(3.2, 0.9, 0.1), V3(1.6, 1.05, 0)]);
    const chuteGeos = [new THREE.TubeGeometry(curve, 24, 0.05, 6)];
    for (let i = 1; i <= 7; i++) {
      const pt = curve.getPoint(i / 8);
      chuteGeos.push(new THREE.CylinderGeometry(0.058, 0.058, 0.025, 8).rotateZ(Math.PI / 2).translate(pt.x, pt.y, pt.z));
    }
    mk(g, merge(chuteGeos), M.darkMetal, { sys: 'weapon', shadow: false });
  }

  // ------------------------------------------------------------------ EO/IR NOSE TURRET
  buildSensor() {
    const M = this.M;
    const g = this.part('sensor', 'EO/IR targeting turret', [3.2, -0.2, 0], [7.8, 1.0, 0]);
    const base = grp(g, [7.6, 1.08, 0]);
    mk(base, new THREE.CylinderGeometry(0.16, 0.2, 0.18, 16).rotateZ(Math.PI / 2), M.darkMetal, { p: [-0.05, 0, 0], sys: 'avionics', shadow: false });
    const az = grp(base, [0.12, -0.02, 0]);
    mk(az, merge([
      new THREE.BoxGeometry(0.22, 0.34, 0.05).translate(0.05, -0.02, 0.31),
      new THREE.BoxGeometry(0.22, 0.34, 0.05).translate(0.05, -0.02, -0.31),
      new THREE.BoxGeometry(0.1, 0.06, 0.66).translate(-0.02, 0.17, 0),
    ]), M.paint2, { sys: 'avionics' });
    // Bolted elevation trunnion caps on yoke arms
    const trunnionSteelGeos = [];
    for (const sz of [-0.338, 0.338]) {
      for (let b = 0; b < 8; b++) {
        const ba = (b / 8) * TAU;
        trunnionSteelGeos.push(new THREE.CylinderGeometry(0.007, 0.007, 0.018, 6).rotateX(Math.PI / 2).translate(0.08 + Math.cos(ba) * 0.054, -0.04 + Math.sin(ba) * 0.054, sz));
      }
    }
    mk(az, merge(trunnionSteelGeos), M.steel, { sys: 'avionics', shadow: false });
    const el = grp(az, [0.08, -0.04, 0]);
    mk(el, new THREE.SphereGeometry(0.27, 28, 18), M.paint2, { sys: 'avionics' });
    // Flush equatorial gimbal band inscribed inside R=0.271 sphere contour (sqrt(0.16^2 + 0.218^2) = 0.2704)
    mk(el, new THREE.CylinderGeometry(0.216, 0.218, 0.036, 24).rotateZ(Math.PI / 2), M.trim, { p: [0.16, 0, 0], sys: 'avionics', shadow: false });
    // Helper to orient circular optical apertures tangent to the R=0.27 sphere surface
    const orientOnSphere = (geo, wy, wz, wr, rSurf = 0.271) => {
      const ny = wy / 0.27, nz = wz / 0.27;
      const nx = Math.sqrt(Math.max(0.05, 1 - ny * ny - nz * nz));
      const d = Math.sqrt(Math.max(0.01, rSurf * rSurf - wr * wr));
      const azAng = Math.asin(Math.max(-0.95, Math.min(0.95, ny)));
      const ayAng = Math.atan2(-nz, nx);
      return geo.rotateZ(azAng).rotateY(ayAng).translate(d * nx, d * ny, d * nz);
    };
    // Spherical-contoured 3D circular optical window frames + central mullion + wiper bar + side trunnion drums
    mk(el, merge([
      // Outer circular optical aperture bezel rings (tangent to R=0.27 sphere so silhouette is purely spherical)
      orientOnSphere(new THREE.TorusGeometry(0.076, 0.009, 10, 24).rotateY(Math.PI / 2), 0.052, -0.064, 0.076, 0.272),
      orientOnSphere(new THREE.TorusGeometry(0.056, 0.008, 10, 22).rotateY(Math.PI / 2), 0.052, 0.082, 0.056, 0.272),
      orientOnSphere(new THREE.TorusGeometry(0.032, 0.006, 8, 16).rotateY(Math.PI / 2), -0.074, -0.086, 0.032, 0.272),
      orientOnSphere(new THREE.TorusGeometry(0.036, 0.006, 8, 16).rotateY(Math.PI / 2), -0.078, 0.018, 0.036, 0.272),
      // Recessed cylindrical lens barrels
      orientOnSphere(new THREE.CylinderGeometry(0.074, 0.076, 0.022, 22).rotateZ(Math.PI / 2), 0.052, -0.064, 0.075, 0.268),
      orientOnSphere(new THREE.CylinderGeometry(0.054, 0.056, 0.022, 20).rotateZ(Math.PI / 2), 0.052, 0.082, 0.055, 0.268),
      orientOnSphere(new THREE.CylinderGeometry(0.030, 0.032, 0.020, 16).rotateZ(Math.PI / 2), -0.074, -0.086, 0.031, 0.268),
      orientOnSphere(new THREE.CylinderGeometry(0.034, 0.036, 0.020, 16).rotateZ(Math.PI / 2), -0.078, 0.018, 0.035, 0.268),
      // Contoured central vertical mullion, horizontal divider bar, and side trunnion drums
      orientOnSphere(new THREE.BoxGeometry(0.014, 0.145, 0.014), 0.052, 0.014, 0.065, 0.273),
      orientOnSphere(new THREE.BoxGeometry(0.014, 0.012, 0.21), -0.020, 0.004, 0.105, 0.273),
      new THREE.CylinderGeometry(0.076, 0.076, 0.57, 14).rotateX(Math.PI / 2),
      orientOnSphere(new THREE.BoxGeometry(0.008, 0.125, 0.010), 0.052, 0.014, 0.055, 0.276),
    ]), M.darkMetal, { sys: 'avionics', shadow: false });
    // Machined metallic bezel retainer rings + micro-fastener bolts around optical windows
    const frameBoltGeos = [
      orientOnSphere(new THREE.TorusGeometry(0.076, 0.0038, 8, 24).rotateY(Math.PI / 2), 0.052, -0.064, 0.076, 0.276),
      orientOnSphere(new THREE.TorusGeometry(0.056, 0.0035, 8, 20).rotateY(Math.PI / 2), 0.052, 0.082, 0.056, 0.276),
    ];
    for (let b = 0; b < 8; b++) {
      const ba = (b / 8) * TAU;
      frameBoltGeos.push(orientOnSphere(
        new THREE.CylinderGeometry(0.0038, 0.0038, 0.008, 6).rotateZ(Math.PI / 2).translate(0, Math.cos(ba) * 0.076, Math.sin(ba) * 0.076),
        0.052, -0.064, 0.076, 0.277
      ));
      frameBoltGeos.push(orientOnSphere(
        new THREE.CylinderGeometry(0.0035, 0.0035, 0.008, 6).rotateZ(Math.PI / 2).translate(0, Math.cos(ba) * 0.056, Math.sin(ba) * 0.056),
        0.052, 0.082, 0.056, 0.277
      ));
    }
    mk(el, merge(frameBoltGeos), M.steel, { sys: 'avionics', shadow: false });
    // Warm gold dichroic retainer rings inside FLIR/TV apertures
    mk(el, merge([
      orientOnSphere(new THREE.RingGeometry(0.060, 0.070, 22).rotateY(Math.PI / 2), 0.052, -0.064, 0.070, 0.274),
      orientOnSphere(new THREE.RingGeometry(0.042, 0.050, 20).rotateY(Math.PI / 2), 0.052, 0.082, 0.050, 0.274),
    ]), M.brass, { sys: 'avionics', shadow: false });
    mk(el, merge([
      orientOnSphere(new THREE.CircleGeometry(0.064, 22).rotateY(Math.PI / 2), 0.052, -0.064, 0.064, 0.2735),
      orientOnSphere(new THREE.CircleGeometry(0.045, 20).rotateY(Math.PI / 2), 0.052, 0.082, 0.045, 0.2735),
      orientOnSphere(new THREE.CircleGeometry(0.026, 14).rotateY(Math.PI / 2), -0.074, -0.086, 0.026, 0.2735),
    ]), M.lens, { sys: 'avionics', shadow: false });
    mk(el, orientOnSphere(new THREE.CircleGeometry(0.030, 14).rotateY(Math.PI / 2), -0.078, 0.018, 0.030, 0.2735), M.lensRed, { sys: 'avionics', shadow: false });
    // Subtle gimbal accent seam ring
    mk(el, new THREE.TorusGeometry(0.271, 0.0038, 6, 40).rotateY(Math.PI / 2), M.glowRing || M.glowSoft, { p: [0.02, 0, 0], sys: 'avionics', shadow: false });
    const cam = new THREE.PerspectiveCamera(9, 4 / 3, 0.5, 4000);
    cam.position.set(0.3, 0, 0);
    cam.rotation.set(0, -Math.PI / 2, 0);
    el.add(cam);
    this.sensor = { az, el, cam };
  }

  // ------------------------------------------------------------------ TAIL / PUSHER
  buildTail() {
    const M = this.M;
    const cy = 2.2;
    const pusher = this.part('pusher', 'Ducted pusher · vectoring vanes', [-4.2, 0, 0], [-8.4, 3.0, 0]);
    // duct ring
    const prof = [[0.8, 0.42], [0.86, 0.47], [0.95, 0.43], [1.0, 0.26], [1.0, -0.3], [0.94, -0.42], [0.84, -0.4], [0.8, -0.3], [0.795, 0.2], [0.8, 0.42]];
    mk(pusher, boxUV(lathe(prof, 48, true), 0.5), M.paint, { p: [-8.38, cy, 0] });
    // Metallic duct inlet lip + thin, dim formation ring
    mk(pusher, new THREE.TorusGeometry(0.865, 0.018, 8, 56).rotateY(Math.PI / 2), M.darkMetal, { p: [-7.92, cy, 0], shadow: false });
    mk(pusher, new THREE.TorusGeometry(0.868, 0.0042, 6, 56).rotateY(Math.PI / 2), M.glowRing || M.glowSoft, { p: [-7.904, cy, 0], shadow: false });
    // warning band
    mk(pusher, new THREE.CylinderGeometry(1.003, 1.003, 0.11, 48, 1, true).rotateZ(Math.PI / 2), M.stripes, { p: [-8.3, cy, 0], shadow: false });
    // hub fairing + 5 stators merged
    const pPaint2Geos = [lathe([[0.0, -9.12], [0.09, -9.05], [0.19, -8.85], [0.24, -8.55], [0.26, -8.25], [0.29, -7.95], [0.3, -7.66], [0.0, -7.6]], 24, true).translate(0, cy, 0)];
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5 + 0.3;
      pPaint2Geos.push(new THREE.BoxGeometry(0.2, 0.58, 0.025).rotateY(0.15).translate(0, 0.5, 0).rotateX(a).translate(-8.58, cy, 0));
    }
    mk(pusher, merge(pPaint2Geos), M.paint2);
    // fan
    const spin = grp(pusher, [-8.28, cy, 0]);
    const pMat = M.blade.clone(); pMat.transparent = false;
    const pLEMat = M.bladeLE.clone(); pLEMat.transparent = false;
    const pGeos = [], pLEGeos = [];
    for (let k = 0; k < 9; k++) {
      const a = k * TAU / 9;
      pGeos.push(new THREE.BoxGeometry(0.16, 0.54, 0.02).rotateY(0.55).translate(0, 0.52, 0).rotateX(a));
      pLEGeos.push(new THREE.BoxGeometry(0.032, 0.54, 0.022).rotateY(0.55).translate(0.055, 0.52, -0.035).rotateX(a));
    }
    mk(spin, merge(pGeos), pMat, { sys: 'drive', shadow: false });
    mk(spin, merge(pLEGeos), pLEMat, { sys: 'drive', shadow: false });
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.8, 56, 1).rotateX(-Math.PI / 2), blurMaterial(0x14161a));
    const dwrap = grp(spin.parent, [-8.28, cy, 0], [0, 0, -Math.PI / 2]);
    dwrap.add(disc);
    const du = disc.material.uniforms; du.uR0.value = 0.26; du.uR1.value = 0.8; du.uBlades.value = 9; du.uChord.value = 0.16;
    disc.userData.sys = 'fx'; disc.userData.keep = true;
    this.pusherFan = { spin, disc, mat: pMat, leMat: pLEMat };
    // vectoring rudder vanes
    this.vanes = [];
    for (const z of [-0.42, 0, 0.42]) {
      const h = 2 * Math.sqrt(0.79 * 0.79 - z * z) - 0.04;
      const v = grp(pusher, [-8.72, cy, z]);
      mk(v, new THREE.BoxGeometry(0.26, h, 0.022), M.paint2, { p: [-0.1, 0, 0], shadow: false });
      this.vanes.push(v);
    }
    this.anchor('pusher', pusher, [-8.28, cy, 0]);
    this.anchor('pusherOut', pusher, [-9.2, cy, 0]);
    // twin canted fins with metallic leading-edge strips & static discharge wicks
    const fins = this.part('fins', 'Canted twin fins', [-4.2, 1.6, 0], [-8.6, 3.8, 0]);
    for (const side of [1, -1]) {
      const S = grp(fins); S.scale.z = side;
      const f = grp(S, [-7.95, cy + 0.93, 0.32], [0.33, 0, 0]);
      mk(f, slab([[0, 0], [-0.95, 0], [-1.42, 1.3], [-0.95, 1.3]], 0.09, 0.028), M.paint);
      // Metallic leading-edge erosion strip + static discharge wicks + crisp thin recessed accent
      const fDarkGeos = [polyBars([V3(0.01, 0.02, 0), V3(-0.94, 1.29, 0)], 0.018, 5)];
      for (const wy of [0.85, 1.08, 1.26]) {
        fDarkGeos.push(new THREE.CylinderGeometry(0.003, 0.003, 0.18, 4).rotateZ(Math.PI / 2).translate(-1.05 - wy * 0.34, wy, 0));
      }
      mk(f, merge(fDarkGeos), M.darkMetal, { shadow: false });
      mk(f, segmentedBars([V3(0.030, 0.03, 0), V3(-0.920, 1.28, 0)], 0.0038, 5, 0.16, 3), M.glowSoft, { shadow: false });
      // Fin tip fairing + tiny point anti-collision light
      mk(f, new THREE.BoxGeometry(0.48, 0.032, 0.082), M.trim, { p: [-1.18, 1.305, 0], shadow: false });
      mk(f, new THREE.SphereGeometry(0.009, 8, 6), M.navWhite, { p: [-1.2, 1.322, 0], shadow: false });
    }
    // stabilator with end plates & leading-edge strip
    const stab = this.part('stab', 'Stabilator', [-2.6, 0.5, 0], [-6.6, 2.3, 1.2]);
    for (const side of [1, -1]) {
      const S = grp(stab); S.scale.z = side;
      const s = grp(S, [-6.35, 2.16, 0.3]);
      mk(s, planform([[0, 0], [-0.3, 1.55], [-0.75, 1.55], [-0.8, 0]], 0.08, 0.025), M.paint);
      mk(s, polyBars([V3(0.01, 0, 0.02), V3(-0.29, 0, 1.54)], 0.016, 5), M.darkMetal, { shadow: false });
      mk(s, slab([[0.05, -0.18], [-0.3, -0.22], [-0.85, 0.32], [-0.5, 0.36]], 0.04, 0.012), M.paint2, { p: [0, 0, 1.56] });
    }
    // ventral fin + tail bumper skid
    mk(fins, slab([[0, 0], [-0.9, 0], [-1.15, -0.55], [-0.55, -0.55]], 0.08, 0.02), M.paint, { p: [-7.95, cy - 0.95, 0] });
    mk(fins, new THREE.BoxGeometry(0.5, 0.04, 0.08), M.darkMetal, { p: [-8.85, cy - 1.52, 0], shadow: false });
  }

  // ------------------------------------------------------------------ SMALL DETAILS
  buildDetails() {
    const M = this.M;
    const nose = this.parts.find(p => p.g.name === 'nose').g;
    // Pitot-static probes + AOA vanes + machined flush static port plates + RWR sensors + TAT probe + GPS blister
    const noseTrimGeos = [
      // Dorsal GPS / SATCOM teardrop blister forward of windscreen
      new THREE.SphereGeometry(0.055, 12, 8).scale(1.6, 0.36, 1.0).translate(5.85, 1.66, 0),
    ];
    const noseRedGeos = [];
    const noseSteelGeos = [];
    const noseBrassGeos = [];
    const noseDarkGeos = [];
    const noseMetalGeos = [
      // Chin VHF/UHF blade antenna with bolted base flange
      slab([[0, 0], [0.34, -0.05], [0.28, -0.13], [0.19, -0.09], [0.13, -0.16], [0, -0.18]], 0.026, 0.004).rotateZ(-0.2).translate(6.2, 0.84, 0),
      new THREE.BoxGeometry(0.42, 0.018, 0.08).translate(6.02, 0.82, 0),
    ];
    for (const sd of [1, -1]) {
      // Aerodynamic pitot mast fairing + dual-tube heated pitot-static probe
      noseTrimGeos.push(lathe([[0.045, 0], [0.028, 0.14], [0.012, 0.22], [0, 0.22]], 10, true).translate(7.08, 1.38, sd * 0.21));
      noseMetalGeos.push(new THREE.BoxGeometry(0.16, 0.024, 0.055).rotateX(sd * 0.35).translate(7.12, 1.38, sd * 0.20));
      const pr = mk(nose, strutGeo(0.012, 8), M.steel, { shadow: false });
      placeBetween(pr, V3(7.22, 1.38, sd * 0.21), V3(8.26, 1.36, sd * 0.25));
      noseBrassGeos.push(new THREE.CylinderGeometry(0.008, 0.013, 0.11, 8).rotateZ(-Math.PI / 2).translate(8.30, 1.36, sd * 0.252));

      // Machined flush static port plates (3 per cheek: 2 forward on nose + 1 aft) with red warning rings, dark orifices & corner rivets
      for (const [sx, sy, sz] of [[6.84, 1.12, 0.502], [6.58, 1.13, 0.525], [5.42, 1.16, 0.635]]) {
        const yaw = sd * -0.15;
        noseMetalGeos.push(new THREE.BoxGeometry(0.072, 0.072, 0.008).rotateY(yaw).translate(sx, sy, sd * sz));
        noseRedGeos.push(new THREE.RingGeometry(0.019, 0.028, 14).rotateY(sd * Math.PI / 2 + yaw).translate(sx, sy, sd * (sz + 0.005)));
        noseSteelGeos.push(new THREE.RingGeometry(0.008, 0.019, 14).rotateY(sd * Math.PI / 2 + yaw).translate(sx, sy, sd * (sz + 0.0055)));
        noseDarkGeos.push(new THREE.CircleGeometry(0.008, 10).rotateY(sd * Math.PI / 2 + yaw).translate(sx, sy, sd * (sz + 0.006)));
        for (const [dy, dx] of [[-0.026, -0.026], [-0.026, 0.026], [0.026, -0.026], [0.026, 0.026]]) {
          noseSteelGeos.push(new THREE.SphereGeometry(0.0045, 5, 4).translate(sx + dx, sy + dy, sd * (sz + 0.005)));
        }
      }

      // AOA vane + bolted circular mounting flange + Total Air Temperature (TAT) scoop
      noseMetalGeos.push(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 12).rotateX(Math.PI / 2).translate(6.42, 1.34, sd * 0.55));
      noseSteelGeos.push(new THREE.BoxGeometry(0.085, 0.010, 0.036).rotateZ(-0.12).translate(6.40, 1.34, sd * 0.572));
      noseMetalGeos.push(new THREE.BoxGeometry(0.09, 0.032, 0.042).translate(5.95, 1.38, sd * 0.60));
      noseDarkGeos.push(new THREE.BoxGeometry(0.015, 0.022, 0.028).translate(5.995, 1.38, sd * 0.608));

      // Forward RWR hemisphere blister with bolted collar
      noseMetalGeos.push(new THREE.CylinderGeometry(0.066, 0.068, 0.016, 12).rotateZ(-Math.PI / 2).rotateY(sd * 0.5).translate(6.90, 1.25, sd * 0.468));
      noseTrimGeos.push(new THREE.SphereGeometry(0.060, 12, 8, 0, TAU, 0, Math.PI / 2).rotateZ(-Math.PI / 2).rotateY(sd * 0.5).translate(6.90, 1.25, sd * 0.472));
      for (let i = 0; i < 6; i++) {
        noseTrimGeos.push(new THREE.BoxGeometry(0.034, 0.125, 0.016).rotateZ(0.25).rotateX(sd * -0.2).translate(6.32 + i * 0.065, 1.18, sd * 0.558));
      }
    }
    mk(nose, merge(noseTrimGeos), M.trim, { shadow: false });
    mk(nose, merge(noseRedGeos), M.red, { shadow: false });
    mk(nose, merge(noseSteelGeos), M.steel, { shadow: false });
    mk(nose, merge(noseBrassGeos), M.brass, { shadow: false });
    mk(nose, merge(noseDarkGeos), M.interiorDark, { shadow: false });
    mk(nose, merge(noseMetalGeos), M.metal, { shadow: false });

    // Spine & boom antennas: IR jammer turret (dark optical dome), SATCOM blister, UHF/VHF blades, towel-bar HF antenna
    const aft = this.parts.find(p => p.g.name === 'aft').g;
    mk(aft, new THREE.CylinderGeometry(0.115, 0.135, 0.22, 16), M.darkMetal, { p: [-2.5, 2.9, 0], sys: 'avionics', shadow: false });
    mk(aft, new THREE.SphereGeometry(0.105, 14, 10, 0, TAU, 0, Math.PI / 2), M.lens, { p: [-2.5, 3.01, 0], sys: 'avionics', shadow: false });
    mk(aft, merge([
      // Dorsal swept UHF blade antenna behind IRCM
      slab([[0, 0], [-0.32, 0], [-0.44, 0.28], [-0.24, 0.28]], 0.022, 0.005).translate(-2.85, 2.74, 0),
      // Ventral IFF/VHF blade antenna + radar altimeter patch antennas
      slab([[0, 0], [-0.26, 0], [-0.35, -0.22], [-0.18, -0.22]], 0.020, 0.004).translate(0.4, 0.78, 0),
      new THREE.BoxGeometry(0.20, 0.022, 0.14).translate(-0.25, 0.79, 0),
      new THREE.BoxGeometry(0.20, 0.022, 0.14).translate(-1.15, 0.81, 0),
    ]), M.trim, { shadow: false });
    // Machined metallic antenna base plates with corner fasteners on spine & belly
    mk(aft, merge([
      new THREE.BoxGeometry(0.38, 0.018, 0.068).translate(-3.01, 2.74, 0),
      new THREE.BoxGeometry(0.32, 0.016, 0.060).translate(0.27, 0.78, 0),
    ]), M.metal, { shadow: false });

    // Towel-bar HF antenna + dorsal whip/blade antennas + boom static ports along the tail boom
    const boom = this.boomG;
    const hfDarkGeos = [], hfTrimGeos = [], boomMetalGeos = [], boomRedGeos = [], boomSteelGeos = [];
    // Dorsal tailboom UHF/TACAN swept blade antenna + ELT whip
    hfTrimGeos.push(slab([[0, 0], [-0.28, 0], [-0.40, 0.24], [-0.22, 0.24]], 0.020, 0.004).translate(-4.95, 2.48, 0));
    boomMetalGeos.push(new THREE.BoxGeometry(0.34, 0.018, 0.062).translate(-5.09, 2.48, 0));
    boomSteelGeos.push(new THREE.CylinderGeometry(0.004, 0.007, 0.34, 6).rotateZ(0.42).translate(-5.85, 2.58, 0));
    for (const sd of [1, -1]) {
      const hfPts = [V3(-3.9, 1.98, sd * 0.48), V3(-6.8, 2.08, sd * 0.36)];
      hfDarkGeos.push(polyBars(hfPts, 0.011, 6));
      for (const t of [0.05, 0.35, 0.65, 0.95]) {
        const p = new THREE.Vector3().lerpVectors(hfPts[0], hfPts[1], t);
        hfTrimGeos.push(new THREE.CylinderGeometry(0.010, 0.013, 0.075, 6).rotateX(Math.PI / 2).translate(p.x, p.y, p.z - sd * 0.03));
        boomMetalGeos.push(new THREE.CylinderGeometry(0.020, 0.020, 0.012, 8).rotateX(Math.PI / 2).translate(p.x, p.y, p.z - sd * 0.06));
      }
      // Aft tailboom reference static port plate
      boomMetalGeos.push(new THREE.BoxGeometry(0.064, 0.064, 0.008).translate(-4.45, 2.18, sd * 0.465));
      boomRedGeos.push(new THREE.RingGeometry(0.016, 0.024, 12).rotateY(sd * Math.PI / 2).translate(-4.45, 2.18, sd * 0.470));
      boomSteelGeos.push(new THREE.CircleGeometry(0.016, 12).rotateY(sd * Math.PI / 2).translate(-4.45, 2.18, sd * 0.471));
    }
    mk(boom, merge(hfDarkGeos), M.darkMetal, { shadow: false });
    mk(boom, merge(hfTrimGeos), M.trim, { shadow: false });
    mk(boom, merge(boomMetalGeos), M.metal, { shadow: false });
    mk(boom, merge(boomRedGeos), M.red, { shadow: false });
    mk(boom, merge(boomSteelGeos), M.steel, { shadow: false });

    // Chaff/flare countermeasure dispensers on the boom
    for (const sd of [1, -1]) {
      const fd = mk(aft, new THREE.BoxGeometry(0.52, 0.23, 0.08), M.trim, { p: [-3.75, 2.12, sd * 0.6], r: [sd * 0.18, 0, 0], shadow: false });
      mk(fd, new THREE.BoxGeometry(0.54, 0.25, 0.02), M.darkMetal, { p: [0, 0, -0.02], shadow: false });
      const holes = [];
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) holes.push(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8).rotateX(Math.PI / 2).translate(-0.19 + i * 0.075, -0.05 + j * 0.1, 0.04));
      mk(fd, merge(holes), M.interiorDark, { shadow: false });
      this.anchor('flare' + sd, aft, [-3.75, 2.12, sd * 0.7]);
    }

    // Fold-out boarding steps with yellow safety tread edge + recessed handhold slots
    this.steps = [];
    const tubG = this.parts.find(p => p.g.name === 'tub').g;
    for (const [x, y] of [[4.6, 1.15], [2.6, 1.3]]) {
      const st = grp(tubG, [x, y, 0.68]);
      mk(st, new THREE.BoxGeometry(0.24, 0.022, 0.14), M.darkMetal, { p: [0, 0, 0.07], sys: 'struct', shadow: false });
      mk(st, new THREE.BoxGeometry(0.22, 0.024, 0.025), M.yellow, { p: [0, 0, 0.13], sys: 'struct', shadow: false });
      this.steps.push(st);
      mk(tubG, new THREE.BoxGeometry(0.14, 0.045, 0.02), M.interiorDark, { p: [x, y + 0.34, 0.64], sys: 'struct', shadow: false });
      mk(tubG, new THREE.CylinderGeometry(0.007, 0.007, 0.12, 6).rotateZ(Math.PI / 2), M.steel, { p: [x, y + 0.34, 0.645], sys: 'struct', shadow: false });
    }
  }

  // ------------------------------------------------------------------ LIGHTS
  buildLights() {
    const M = this.M;
    const aft = this.parts.find(p => p.g.name === 'aft').g;
    // Compact dorsal & ventral anti-collision beacons in dark metal housings
    mk(aft, merge([
      new THREE.CylinderGeometry(0.042, 0.050, 0.022, 12).translate(-1.75, 3.28, 0),
      new THREE.CylinderGeometry(0.050, 0.042, 0.022, 12).translate(-1.0, 0.82, 0),
    ]), M.darkMetal, { shadow: false });
    mk(aft, merge([
      lathe([[0.032, 0], [0.028, 0.024], [0.014, 0.042], [0, 0.046]], 12).translate(-1.75, 3.29, 0),
      lathe([[0, -0.046], [0.014, -0.042], [0.028, -0.024], [0.032, 0]], 12).translate(-1.0, 0.81, 0),
    ]), M.beacon, { shadow: false });

    const pusher = this.parts.find(p => p.g.name === 'pusher').g;
    mk(pusher, new THREE.CylinderGeometry(0.018, 0.024, 0.024, 10).rotateZ(Math.PI / 2), M.darkMetal, { p: [-9.11, 2.2, 0], shadow: false });
    mk(pusher, new THREE.SphereGeometry(0.009, 8, 6), M.navWhite, { p: [-9.124, 2.2, 0], shadow: false });

    // landing light (fixed) + searchlight (steerable)
    const nose = this.parts.find(p => p.g.name === 'nose').g;
    mk(nose, new THREE.CylinderGeometry(0.075, 0.075, 0.05, 14), M.trim, { p: [6.75, 0.86, 0], shadow: false });
    this.landingLens = mk(nose, new THREE.CircleGeometry(0.062, 14).rotateX(Math.PI / 2), M.navWhite.clone(), { p: [6.75, 0.832, 0], shadow: false });
    const land = new THREE.SpotLight(0xfff4e0, 0, 260, 0.38, 0.5, 1.2);
    land.position.set(6.8, 0.8, 0);
    land.target.position.set(30, -14, 0);
    nose.add(land, land.target);
    this.landLight = land;
    const tub = this.parts.find(p => p.g.name === 'tub').g;
    const sl = grp(tub, [3.4, 0.74, 0]);
    mk(sl, new THREE.CylinderGeometry(0.1, 0.12, 0.08, 12), M.darkMetal, { p: [0, 0.03, 0], shadow: false });
    const slEl = grp(sl, [0, -0.06, 0]);
    mk(slEl, new THREE.CylinderGeometry(0.11, 0.09, 0.2, 14).rotateZ(Math.PI / 2), M.trim, { shadow: false });
    this.searchLens = mk(slEl, new THREE.CircleGeometry(0.095, 14).rotateY(Math.PI / 2), M.navWhite.clone(), { p: [0.101, 0, 0], shadow: false });
    const sp = new THREE.SpotLight(0xe8f2ff, 0, 400, 0.12, 0.35, 1.0);
    sp.position.set(0.12, 0, 0); sp.target.position.set(10, 0, 0);
    slEl.add(sp, sp.target);
    // visible light shaft
    const beamGeo = new THREE.ConeGeometry(4.5, 60, 24, 1, true); beamGeo.translate(0, -30, 0); beamGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `varying float vD; varying vec3 vN; varying vec3 vV; void main(){ vD = clamp(position.x/60.,0.,1.); vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uOpacity; varying float vD; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(clamp(abs(dot(vN,vV)),0.,1.),1.5); gl_FragColor = vec4(vec3(.85,.9,1.)*f*(1.-vD)*(1.-vD)*uOpacity,1.); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.x = 0.1; beam.userData.sys = 'fx'; beam.userData.keep = true;
    slEl.add(beam);
    this.search = { base: sl, el: slEl, light: sp, beam };
  }

  buildDecals() {
    const M = this.M;
    const boom = this.boomG;
    const num = textDecal('HX-09', { size: 84, spacing: 10 });
    const owl = makeDecal((g, w, h) => {
      g.lineWidth = 7; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w - 26, h - 50); g.lineTo(w / 2 + 34, h - 72); g.lineTo(w / 2, h - 14); g.lineTo(w / 2 - 34, h - 72); g.lineTo(26, h - 50); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(w / 2, 70); g.lineTo(w / 2 + 40, 140); g.lineTo(w / 2, 124); g.lineTo(w / 2 - 40, 140); g.closePath(); g.fill();
    }, 256, 256);
    const nostep = textDecal('NO STEP', { size: 60, spacing: 8 });
    const danger = textDecal('◢ DANGER · PROPULSOR ◣', { size: 40, spacing: 4, w: 1024 });
    const rescue = textDecal('◀ RESCUE · JETTISON', { size: 42, spacing: 4, w: 512 });
    const dataBlock = makeDecal((g) => {
      g.font = '600 28px "JetBrains Mono", monospace';
      g.fillText('STRIX HX-9A  SER 90-0412', 12, 38);
      g.font = '400 22px "JetBrains Mono", monospace';
      g.fillText('WT EMPTY 6420 KG · FUEL JP-8', 12, 74);
      g.fillText('NO PUSH · TIE DOWN BELOW', 12, 106);
    }, 512, 128);
    const exhaustWarn = textDecal('▲ DANGER · HOT EXHAUST ▲', { size: 38, spacing: 4, w: 512 });

    const make = (t, w, h, parent, p, r) => {
      const m = M.decal.clone(); m.map = t; m.emissiveMap = t;
      const d = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      d.position.set(...p); d.rotation.set(...r); d.userData.sys = 'decal'; d.renderOrder = 1;
      parent.add(d);
      this.decals = this.decals || []; this.decals.push(d);
      return d;
    };
    const tub = this.parts.find(p => p.g.name === 'tub').g;
    for (const sd of [1, -1]) {
      make(num, 1.2, 0.3, boom, [-4.7, 2.31, sd * 0.447], [-sd * 0.487, sd > 0 ? 0 : Math.PI, 0]);
      make(danger, 1.3, 0.065, boom, [-7.0, 2.334, sd * 0.33], [-sd * 0.524, sd > 0 ? 0 : Math.PI, 0]);
      // Rescue & crew serial stencils on forward fuselage flanks
      make(rescue, 0.52, 0.065, tub, [4.65, 1.72, sd * 0.59], [-sd * 0.32, sd > 0 ? 0 : Math.PI, 0]);
      make(rescue, 0.52, 0.065, tub, [3.05, 1.98, sd * 0.69], [-sd * 0.32, sd > 0 ? 0 : Math.PI, 0]);
      make(dataBlock, 0.58, 0.14, tub, [5.45, 1.44, sd * 0.58], [-sd * 0.34, sd > 0 ? 0 : Math.PI, 0]);
    }
    const n1 = this.parts.find(p => p.g.name === 'nacelle1').g, n2 = this.parts.find(p => p.g.name === 'nacelle-1').g;
    make(owl, 0.36, 0.36, n1, [-0.35, 2.79, 1.622], [0, 0, 0]).userData.onPaint2 = true;
    make(owl, 0.36, 0.36, n2, [-0.35, 2.79, -1.622], [0, Math.PI, 0]).userData.onPaint2 = true;
    make(exhaustWarn, 0.58, 0.065, n1, [-1.25, 2.66, 1.625], [0, 0, 0]).userData.onPaint2 = true;
    make(exhaustWarn, 0.58, 0.065, n2, [-1.25, 2.66, -1.625], [0, Math.PI, 0]).userData.onPaint2 = true;
    const w1 = this.parts.find(p => p.g.name === 'wing1').g, w2 = this.parts.find(p => p.g.name === 'wing-1').g;
    make(nostep, 0.5, 0.12, w1, [0.1, 1.694, 2.4], [-Math.PI / 2 + 0.1, 0, Math.PI / 2]);
    make(nostep, 0.5, 0.12, w2, [0.1, 1.694, -2.4], [-Math.PI / 2 - 0.1, 0, Math.PI / 2]);
  }

  // ------------------------------------------------------------------ FINALIZE
  finalize() {
    this.root.traverse(o => {
      if (o.isMesh) {
        o.userData.mat0 = o.material;
        if (!o.userData.sys) o.userData.sys = 'skin';
      }
    });
  }

  // ------------------------------------------------------------------ STATE
  setStance(name, airborne) {
    const t = this.target;
    t.bays = name === 'combat' ? 1 : 0;
    t.gun = name === 'combat' ? 1 : 0;
    t.glow = name === 'stealth' ? 0.03 : name === 'combat' ? 1.25 : 1;
    t.lights = name === 'stealth' ? 0 : 1;
    t.canopy = name === 'board' && !airborne ? 1 : 0;
    t.steps = name === 'board' && !airborne ? 1 : 0;
    if (!airborne) {
      t.fanTilt = name === 'cruise' ? 1 : 0;
      t.gear = 1;
    }
    this.stance = name;
  }

  /** Drives every moving part. s = flight sim state */
  update(dt, s, env, accent) {
    this.time += dt;
    const A = this.anim, T = this.target, t = this.time;
    const M = this.M;
    // targets from flight
    if (s.airborne) {
      T.gear = s.agl < 9 && s.speed < 18 ? 1 : 0;
      T.fanTilt = clamp((s.speed - 8) / 34, 0, 1);
      T.canopy = 0; T.steps = 0;
    }
    T.flap = s.airborne ? clamp(1 - s.speed / 40, 0, 1) * 0.5 : 0.15;
    // gear: doors lead, legs follow
    const wantDown = T.gear > 0.5;
    if (wantDown) {
      A.gearDoor = damp(A.gearDoor, 1, 6, dt);
      if (A.gearDoor > 0.9) A.gear = Math.min(1, A.gear + dt * 0.55);
    } else {
      A.gear = Math.max(0, A.gear - dt * 0.55);
      if (A.gear < 0.02) A.gearDoor = damp(A.gearDoor, 0, 6, dt);
    }
    const ge = smooth(0, 1, A.gear);
    for (const p of this.gearPivots) p.g.rotation.z = (1 - ge) * p.up;
    for (const d of this.gearDoors) d.g.rotation.x = d.open * smooth(0, 1, A.gearDoor);
    A.canopy = damp(A.canopy, T.canopy, 2.2, dt);
    this.hatches[0].rotation.z = A.canopy * 0.62;
    this.hatches[1].rotation.z = A.canopy * 0.55;
    for (const hs of this.hatchStruts) {
      const top = hs.local.clone().applyAxisAngle(V3(0, 0, 1), hs.piv.rotation.z).add(hs.piv.position);
      placeBetween(hs.strut, hs.a, top);
      hs.strut.visible = A.canopy > 0.02;
    }
    A.steps = damp(A.steps, T.steps, 3, dt);
    for (const st of this.steps) st.rotation.x = -(1 - A.steps) * 1.5;
    // bays: auto-open while a missile launches
    const bayT = Math.max(T.bays, this.bayHold > 0 ? 1 : 0);
    this.bayHold = Math.max(0, (this.bayHold || 0) - dt);
    A.bays = damp(A.bays, bayT, 3.2, dt);
    for (const b of this.bays) b.piv.rotation.x = b.phi + smooth(0, 1, A.bays) * 1.95;
    // fans
    A.fanTilt = damp(A.fanTilt, T.fanTilt, 1.4, dt);
    for (const p of this.fanPivots) p.rotation.z = -A.fanTilt * Math.PI / 2;
    const fanRpm = s.rpm * (0.55 + 0.45 * Math.max(A.fanTilt, 1 - s.speed / 30));
    const fVis = smooth(0.3, 0.8, fanRpm);
    const fFading = fVis > 0.01;
    const fOp = 1 - fVis * 0.9, fDw = fVis < 0.5;
    for (const f of this.fans) {
      f.spin.rotation.y += fanRpm * 60 * dt;
      f.mat.color.copy(M.blade.color);
      if (f.mat.transparent !== fFading) {
        f.mat.transparent = fFading; f.mat.needsUpdate = true;
        if (f.leMat) { f.leMat.transparent = fFading; f.leMat.needsUpdate = true; }
      }
      f.mat.opacity = fOp; f.mat.depthWrite = fDw;
      if (f.leMat) { f.leMat.opacity = fOp; f.leMat.depthWrite = fDw; }
      f.disc.visible = fFading;
      const u = f.disc.material.uniforms; u.uAngle.value = f.spin.rotation.y; u.uOpacity.value = fVis; u.uSmear.value = 0.9;
    }
    A.flap = damp(A.flap, T.flap, 2, dt);
    for (const f of this.flaps) f.rotation.z = A.flap * 0.6;
    // pusher + vanes
    const pr = s.rpm * (0.35 + 0.65 * s.propThrust);
    this.pusherFan.spin.rotation.x -= pr * 70 * dt;
    const pv = smooth(0.25, 0.7, pr);
    const pFading = pv > 0.01;
    const pop = 1 - pv * 0.9, pdw = pv < 0.5;
    this.pusherFan.mat.color.copy(M.blade.color);
    if (this.pusherFan.mat.transparent !== pFading) {
      this.pusherFan.mat.transparent = pFading; this.pusherFan.mat.needsUpdate = true;
      if (this.pusherFan.leMat) { this.pusherFan.leMat.transparent = pFading; this.pusherFan.leMat.needsUpdate = true; }
    }
    this.pusherFan.mat.opacity = pop; this.pusherFan.mat.depthWrite = pdw;
    if (this.pusherFan.leMat) { this.pusherFan.leMat.opacity = pop; this.pusherFan.leMat.depthWrite = pdw; }
    this.pusherFan.disc.visible = pFading;
    const pu = this.pusherFan.disc.material.uniforms; pu.uAngle.value = -this.pusherFan.spin.rotation.x; pu.uOpacity.value = pv; pu.uSmear.value = 0.9;
    for (const v of this.vanes) v.rotation.y = damp(v.rotation.y, clamp(-s.yawCmd * 0.5, -0.45, 0.45), 5, dt);
    // rotor
    this.rotor.update(dt, s.rpm, s.collective, s.cyclic, s.thrust, accent);
    // gun
    A.gun = damp(A.gun, Math.max(T.gun, this.gunHold > 0 ? 1 : 0), 3, dt);
    this.gunHold = Math.max(0, (this.gunHold || 0) - dt);
    const ga = this.gunAim;
    const az = A.gun * ga.az - (1 - A.gun) * 0.08, el = A.gun * ga.el + (1 - A.gun) * 0.03;
    this.gun.az.rotation.y = damp(this.gun.az.rotation.y, az, 6, dt);
    this.gun.el.rotation.z = damp(this.gun.el.rotation.z, el, 6, dt);
    ga.spinV = damp(ga.spinV, this.firing ? 40 : 0, this.firing ? 12 : 1.6, dt);
    this.gun.barrels.rotation.x += ga.spinV * dt;
    this.gun.flashMat.opacity = damp(this.gun.flashMat.opacity, 0, 30, dt);
    this.gun.flash.rotation.x = Math.random() * TAU;
    // sensor ball
    const sa = this.sensorAim;
    this.sensor.az.rotation.y = damp(this.sensor.az.rotation.y, sa.az, 2.5, dt);
    this.sensor.el.rotation.z = damp(this.sensor.el.rotation.z, sa.el, 2.5, dt);

    // Calibrated formation strips, duct rings & tiny rotor-tip LED point fixtures
    A.glow = damp(A.glow, T.glow, 2.5, dt);
    A.lights = damp(A.lights, T.lights, 4, dt);
    const night = env?.night ? 1 : 0;
    const tid = env?.id || '';
    const themeGlowScale = tid === 'tempest' ? 0.08 : tid === 'eclipse' ? 0.72 : tid === 'stratos' ? 0.55 : tid === 'dune' ? 0.58 : night ? 0.96 : 0.25;
    const tipLEDScale = tid === 'tempest' ? 0.95 : tid === 'eclipse' ? 0.75 : night ? 0.96 : 0.38;
    const pulse = 0.96 + 0.04 * Math.sin(t * 2);
    M.glow.emissiveIntensity = (M.glow.userData.base ?? 1.5) * A.glow * themeGlowScale * pulse;
    M.glowSoft.emissiveIntensity = (M.glowSoft.userData.base ?? 0.65) * A.glow * themeGlowScale;
    if (M.glowRing) M.glowRing.emissiveIntensity = (M.glowRing.userData.base ?? 0.72) * A.glow * themeGlowScale * pulse;
    if (M.tipLED) M.tipLED.emissiveIntensity = (M.tipLED.userData.base ?? 2.0) * A.glow * tipLEDScale * pulse;
    if (M.formationDot) M.formationDot.emissiveIntensity = (tid === 'tempest' ? 0.95 : night ? 0.80 : 0.35) * A.lights;
    if (this.decals) {
      for (const d of this.decals) {
        if (tid === 'stratos' && d.userData.onPaint2) {
          d.material.color.setHex(0xdce2ec);
        } else {
          d.material.color.copy(M.decal.color);
        }
        d.material.emissive.copy(M.decal.emissive);
        d.material.emissiveIntensity = M.decal.emissiveIntensity || 0;
        d.material.opacity = M.decal.opacity;
      }
    }

    const ph = t % 1.3;
    const strobe = (ph < 0.05 || (ph > 0.14 && ph < 0.19)) ? 3.2 : 0;
    M.strobe.emissiveIntensity = strobe * A.lights * (s.rpm > 0.05 ? 1 : 0);
    M.beacon.emissiveIntensity = (0.5 + 0.5 * Math.sin(t * 7)) ** 6 * 3.0 * A.lights * (s.rpm > 0.02 ? 1 : 0);
    const nav = A.lights * (s.rpm > 0.02 || this.stance === 'board' ? 1 : 0.45);
    M.navRed.emissiveIntensity = 1.15 * nav;
    M.navGreen.emissiveIntensity = 1.15 * nav;
    M.navWhite.emissiveIntensity = 0.95 * nav;
    M.heat.emissiveIntensity = s.rpm * (1.2 + s.thrust * 1.5) * (0.9 + 0.1 * Math.sin(t * 40));

    // landing light: night themes or near ground with rpm
    const landOn = A.lights * (s.rpm > 0.3 ? 1 : 0) * Math.max(night, s.airborne && s.agl < 40 ? 0.6 : 0);
    A.landing = damp(A.landing, landOn, 3, dt);
    this.landLight.intensity = A.landing * 220;
    this.landingLens.material.emissiveIntensity = A.landing * 3.5;

    // searchlight sweeps in night themes while flying
    const searchOn = night * A.lights * (s.airborne ? 1 : 0);
    A.search = damp(A.search, searchOn, 1.5, dt);
    this.search.light.intensity = A.search * 750;
    this.search.beam.material.uniforms.uOpacity.value = A.search * (env?.beam ?? 0.35);
    this.search.beam.visible = A.search > 0.01;
    this.searchLens.material.emissiveIntensity = A.search * 4.5;
    this.search.base.rotation.y = Math.sin(t * 0.23) * 1.1;
    this.search.el.rotation.z = -0.55 + Math.sin(t * 0.31) * 0.25;

    // Subtle airframe vibration + automatic pad surface height alignment + weight-on-wheels tire compression
    const vib = s.rpm * (0.0025 + s.thrust * 0.002);
    const groundWeight = clamp(1 - (s.agl || 0) / 5, 0, 1);
    const wowSink = -0.012 * groundWeight * ge;
    const padOffset = (this.padYOffset || 0) * groundWeight + wowSink;
    this.body.position.set(
      Math.sin(t * 61) * vib * 0.4,
      padOffset + Math.sin(t * 87) * vib,
      Math.sin(t * 73) * vib * 0.5
    );
    if (this.contactShadow) {
      const agl = s.agl || 0;
      const shadowOp = clamp(1 - agl / 7.5, 0, 1) * clamp(1 - (this.explodeT || 0) * 2, 0, 1);
      this.contactShadow.visible = shadowOp > 0.01;
      this.contactShadow.position.y = (this.padYOffset || 0) + 0.005;
      this.contactShadow.material.uniforms.uOpacity.value = shadowOp;
    }

    // explode
    if (this.explodeT !== undefined) {
      const e = this.explodeT;
      for (const p of this.parts) p.g.position.copy(p.base).addScaledVector(p.vec, e);
    }

    // Update airframe-space shader uniforms for crevice AO, exhaust soot, and wetness
    if (M.skinUniforms) {
      this.body.updateWorldMatrix(true, false);
      M.skinUniforms.uHeliInv.value.copy(this.body.matrixWorld).invert();
      M.skinUniforms.uExplode.value = this.explodeT || 0;
      M.skinUniforms.uWet.value = tid === 'tempest' ? 0.88 : tid === 'neon' ? 0.72 : 0.0;
    }

    this.internals.update(dt, s);
    this.cockpit.update(dt, s, this);
  }

  fireMuzzleFlash() { this.gun.flashMat.opacity = 1; }
}
