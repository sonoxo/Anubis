// Internal systems (shown in x-ray / power / exploded views): turboshafts, combining gearbox with
// generator + oil cooler + hydraulic pumps, input shafts, tail drive shaft with hanger bearings,
// pusher gearbox, self-sealing fuel cells, hybrid battery pack, ammo magazine, avionics racks.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mk, grp } from './mk.js';
import { lathe, V3, merge } from '../core/geo.js';

const TAU = Math.PI * 2;
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/** group placed at a, its local +X pointing to b; returns { g, len } */
function along(parent, a, b) {
  const g = new THREE.Group();
  const d = new THREE.Vector3().subVectors(b, a);
  g.position.copy(a);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
  parent.add(g);
  return { g, len: d.length() };
}

export function buildInternals(M, body) {
  const root = grp(body, null, null, 'internals');
  const parts = [];
  const spinners = [];
  const nodes = {};
  const P = (g, label, vec, anchor) => parts.push({ g, label, vec, anchor });

  // ---------------- turboshafts ----------------
  for (const sd of [1, -1]) {
    const eg = grp(root, null, null, 'engine' + sd);
    P(eg, sd > 0 ? 'TS-9 turboshaft · R' : 'TS-9 turboshaft · L', [0, 0.55, sd * 1.4], [-0.3, 3.15, sd * 1.08]);
    const cz = sd * 1.08, cy = 2.78;
    const prof = [[0.12, -1.7], [0.2, -1.62], [0.27, -1.45], [0.3, -1.2], [0.32, -0.75], [0.28, -0.4], [0.25, 0.05], [0.29, 0.35], [0.26, 0.72], [0.19, 0.92], [0.08, 0.96]];
    mk(eg, lathe(prof, 28, true), M.titanium, { p: [0, cy, cz], sys: 'engine' });
    for (const x of [-1.3, -0.85, -0.38, 0.32, 0.6]) {
      mk(eg, new THREE.TorusGeometry(0.3, 0.018, 6, 28).rotateY(Math.PI / 2), M.darkMetal, { p: [x, cy, cz], sys: 'engine' });
    }
    // combustor cans
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6;
      mk(eg, new THREE.CylinderGeometry(0.045, 0.045, 0.34, 8).rotateZ(Math.PI / 2), M.brass, { p: [-0.6, cy + Math.cos(a) * 0.3, cz + Math.sin(a) * 0.3], sys: 'engine' });
    }
    // accessory box + fuel control + pipes
    mk(eg, new THREE.BoxGeometry(0.4, 0.16, 0.18), M.darkMetal, { p: [0.4, cy - 0.3, cz], sys: 'engine' });
    mk(eg, new THREE.BoxGeometry(0.18, 0.12, 0.12), M.metal, { p: [0.1, cy - 0.32, cz + sd * 0.12], sys: 'fuel' });
    const pipe = new THREE.CatmullRomCurve3([V3(0.1, cy - 0.3, cz + sd * 0.12), V3(-0.3, cy - 0.38, cz + sd * 0.2), V3(-0.62, cy - 0.32, cz + sd * 0.12)]);
    mk(eg, new THREE.TubeGeometry(pipe, 16, 0.014, 6), M.brass, { sys: 'fuel' });
    // compressor disc (spins)
    const comp = grp(eg, [0.55, cy, cz]);
    for (let k = 0; k < 14; k++) {
      const b = grp(comp, null, [k * TAU / 14, 0, 0]);
      mk(b, new THREE.BoxGeometry(0.05, 0.2, 0.012), M.steel, { p: [0, 0.14, 0], r: [0, 0.5, 0], sys: 'engine' });
    }
    spinners.push({ o: comp, axis: 'x', k: 90 });
    nodes['engine' + sd] = V3(-0.3, cy, cz);
    nodes['engineFront' + sd] = V3(0.92, cy, cz);
    // input shaft to gearbox
    const a = V3(0.92, cy, cz), b = V3(0.42, 2.92, sd * 0.32);
    const { g, len } = along(eg, a, b);
    const sh = grp(g);
    mk(sh, new THREE.CylinderGeometry(0.045, 0.045, len, 10).rotateZ(Math.PI / 2).translate(len / 2, 0, 0), M.steel, { sys: 'drive' });
    for (const t of [0.15, len - 0.15]) mk(sh, new THREE.CylinderGeometry(0.075, 0.075, 0.05, 6).rotateZ(Math.PI / 2), M.darkMetal, { p: [t, 0, 0], sys: 'drive' });
    spinners.push({ o: sh, axis: 'x', k: 120 });
  }

  // ---------------- main gearbox ----------------
  const gb = grp(root, null, null, 'gearbox');
  P(gb, 'Combining gearbox · generator', [0, 0.9, 0], [0.25, 3.0, 0.5]);
  mk(gb, lathe([[0.0, 2.6], [0.42, 2.63], [0.5, 2.78], [0.46, 2.96], [0.26, 3.08], [0.0, 3.1]], 28), M.metal, { p: [0.25, 0, 0], sys: 'drive' });
  for (const sd of [1, -1]) mk(gb, new THREE.CylinderGeometry(0.13, 0.15, 0.32, 14), M.metal, { p: [0.4, 2.88, sd * 0.38], r: [Math.PI / 2, 0, sd * 0.4], sys: 'drive' });
  mk(gb, new THREE.CylinderGeometry(0.1, 0.12, 0.3, 14).rotateZ(Math.PI / 2), M.metal, { p: [-0.32, 2.82, 0], sys: 'drive' });
  // generator (hybrid electric)
  const gen = grp(gb, [-0.15, 3.1, 0.34]);
  mk(gen, new THREE.CylinderGeometry(0.13, 0.13, 0.34, 18).rotateZ(Math.PI / 2), M.darkMetal, { sys: 'elec' });
  for (let i = 0; i < 6; i++) mk(gen, new THREE.CylinderGeometry(0.145, 0.145, 0.015, 18).rotateZ(Math.PI / 2), M.metal, { p: [-0.13 + i * 0.052, 0, 0], sys: 'elec' });
  nodes.generator = V3(-0.15, 3.1, 0.34);
  // oil cooler fan
  const oc = grp(gb, [-0.85, 3.12, 0]);
  mk(oc, new THREE.CylinderGeometry(0.2, 0.2, 0.16, 20).rotateZ(Math.PI / 2), M.darkMetal, { sys: 'drive' });
  const ocFan = grp(oc, [0.09, 0, 0]);
  for (let k = 0; k < 8; k++) { const b = grp(ocFan, null, [k * TAU / 8, 0, 0]); mk(b, new THREE.BoxGeometry(0.02, 0.17, 0.05), M.metal, { p: [0, 0.09, 0], r: [0, 0.5, 0], sys: 'drive' }); }
  spinners.push({ o: ocFan, axis: 'x', k: 60 });
  // hydraulic pumps
  for (const sd of [1, -1]) mk(gb, new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), M.metal, { p: [0.62, 2.78, sd * 0.2], sys: 'hyd' });
  nodes.gearbox = V3(0.25, 2.88, 0);
  nodes.hydPump = V3(0.62, 2.78, 0.2);

  // ---------------- tail drive shaft ----------------
  const ts = grp(root, null, null, 'tailshaft');
  P(ts, 'Tail drive shaft · hanger bearings', [-1.8, 0.5, 0], [-4.5, 2.6, 0]);
  const s0 = V3(-0.47, 2.82, 0), s1 = V3(-7.62, 2.24, 0);
  {
    const { g, len } = along(ts, s0, s1);
    const sh = grp(g);
    mk(sh, new THREE.CylinderGeometry(0.04, 0.04, len, 10).rotateZ(Math.PI / 2).translate(len / 2, 0, 0), M.steel, { sys: 'drive' });
    for (let t = 0.6; t < len - 0.3; t += 1.25) {
      mk(sh, new THREE.CylinderGeometry(0.07, 0.07, 0.04, 6).rotateZ(Math.PI / 2), M.darkMetal, { p: [t, 0, 0], sys: 'drive' });
      mk(g, new THREE.BoxGeometry(0.12, 0.2, 0.16), M.metal, { p: [t + 0.3, -0.04, 0], sys: 'struct' });
    }
    spinners.push({ o: sh, axis: 'x', k: 110 });
  }
  mk(ts, new THREE.BoxGeometry(0.3, 0.3, 0.32), M.metal, { p: [-7.75, 2.23, 0], sys: 'drive' });
  nodes.pusherGb = V3(-7.75, 2.23, 0);

  // ---------------- fuel cells ----------------
  const fu = grp(root, null, null, 'fuel');
  P(fu, 'Self-sealing fuel cells', [0, -0.9, 0], [-0.5, 1.3, 0.6]);
  for (const sd of [1, -1]) mk(fu, new RoundedBoxGeometry(2.0, 0.62, 0.62, 3, 0.1), M.sys.fuel.clone(), { p: [-0.5, 1.3, sd * 0.38], sys: 'fuel' });
  mk(fu, new RoundedBoxGeometry(0.7, 0.5, 1.1, 3, 0.1), M.sys.fuel.clone(), { p: [-1.95, 1.55, 0], sys: 'fuel' });
  for (const m of fu.children) { m.material.color.setHex(0x2a3a30); m.material.emissiveIntensity = 0; m.material.transparent = false; m.userData.mat0 = m.material; }
  nodes.fuel = V3(-0.5, 1.55, 0);

  // ---------------- battery + power electronics ----------------
  const ba = grp(root, null, null, 'battery');
  P(ba, 'Hybrid battery · power electronics', [0, -1.1, 0], [-2.7, 1.2, 0.4]);
  for (let i = 0; i < 4; i++) for (const sd of [1, -1]) mk(ba, new THREE.BoxGeometry(0.26, 0.22, 0.3), M.darkMetal, { p: [-2.35 - i * 0.29, 1.15, sd * 0.2], sys: 'elec' });
  const led = [];
  for (let i = 0; i < 8; i++) led.push(new THREE.BoxGeometry(0.03, 0.02, 0.01).translate(-2.35 - (i >> 1) * 0.29, 1.2, (i & 1 ? 1 : -1) * 0.356));
  mk(ba, merge(led), M.ledG, { sys: 'elec', shadow: false });
  mk(ba, new THREE.BoxGeometry(0.5, 0.18, 0.5), M.metal, { p: [-1.6, 1.12, 0], sys: 'elec' });
  nodes.battery = V3(-2.8, 1.15, 0);
  nodes.inverter = V3(-1.6, 1.12, 0);

  // ---------------- ammo magazine ----------------
  const am = grp(root, null, null, 'ammo');
  P(am, '30mm magazine · 1200 rds', [0.6, -0.9, 0], [1.15, 1.3, 0.45]);
  mk(am, new THREE.CylinderGeometry(0.33, 0.33, 0.8, 24).rotateX(Math.PI / 2), M.darkMetal, { p: [1.15, 1.22, 0], sys: 'weapon' });
  for (const z of [-0.41, 0.41]) mk(am, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 24).rotateX(Math.PI / 2), M.metal, { p: [1.15, 1.22, z], sys: 'weapon' });
  nodes.ammo = V3(1.15, 1.22, 0);

  // ---------------- avionics racks ----------------
  const av = grp(root, null, null, 'avionics');
  P(av, 'Mission computers · radar processor', [2.2, 0.9, 0], [6.7, 1.5, 0.3]);
  for (let i = 0; i < 3; i++) for (const sd of [1, -1]) {
    mk(av, new THREE.BoxGeometry(0.26, 0.14, 0.18), M.darkMetal, { p: [6.35 + i * 0.3, 1.1, sd * 0.2], sys: 'avionics' });
    mk(av, new THREE.BoxGeometry(0.2, 0.012, 0.005), M.ledG, { p: [6.35 + i * 0.3, 1.12, sd * 0.291], sys: 'avionics', shadow: false });
  }
  mk(av, new THREE.BoxGeometry(0.6, 0.18, 0.4), M.metal, { p: [6.6, 1.32, 0], sys: 'avionics' });
  nodes.avionics = V3(6.6, 1.25, 0);

  root.visible = false;
  let t = 0;
  return {
    root, parts, nodes,
    update(dt, s) {
      t += dt;
      if (!root.visible) return;
      for (const sp of spinners) sp.o.rotation[sp.axis] += s.rpm * sp.k * dt;
    },
  };
}
