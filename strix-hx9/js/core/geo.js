// Geometry helpers: lofted faceted hulls, extruded slabs, struts, UV projection.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y_UP = new THREE.Vector3(0, 1, 0);

function triN(A, B, C) {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
  const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

/**
 * Loft cross sections along X. Each section: { x, pts: [[z, y], ...] } (same point count).
 * Orientation is auto-detected so normals always face away from the loft axis.
 * Group 0 = skin, group 1 = caps.
 */
export function loft(sections, opt = {}) {
  const { closed = true, capStart = false, capEnd = false, smooth = false } = opt;
  const n = sections[0].pts.length;
  const segs = closed ? n : n - 1;
  const per = sections.map(s => {
    const d = [0];
    for (let j = 1; j <= segs; j++) {
      const a = s.pts[(j - 1) % n], b = s.pts[j % n];
      d.push(d[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    return d;
  });
  const cen = sections.map(s => {
    let z = 0, y = 0;
    for (const p of s.pts) { z += p[0]; y += p[1]; }
    return [z / n, y / n];
  });
  const P = (i, j) => { const s = sections[i], p = s.pts[j % n]; return [s.x, p[1], p[0], s.x, per[i][j]]; };
  const side = [];
  let vote = 0;
  const numSpans = sections.length - 1;
  for (let i = 0; i < numSpans; i++) {
    for (let j = 0; j < segs; j++) {
      const A = P(i, j), B = P(i, j + 1), C = P(i + 1, j + 1), D = P(i + 1, j);
      for (const t of [[A, B, C], [A, C, D]]) {
        const nn = triN(t[0], t[1], t[2]);
        const len = Math.hypot(nn[0], nn[1], nn[2]);
        if (len > 1e-10) {
          const mx = (t[0][0] + t[1][0] + t[2][0]) / 3, my = (t[0][1] + t[1][1] + t[2][1]) / 3, mz = (t[0][2] + t[1][2] + t[2][2]) / 3;
          const x0 = sections[i].x, x1 = sections[i + 1].x;
          const k = Math.abs(x1 - x0) < 1e-9 ? 0.5 : (mx - x0) / (x1 - x0);
          const cy = cen[i][1] + (cen[i + 1][1] - cen[i][1]) * k, cz = cen[i][0] + (cen[i + 1][0] - cen[i][0]) * k;
          vote += Math.sign(nn[1] * (my - cy) + nn[2] * (mz - cz));
        }
        side.push(t);
      }
    }
  }
  const flipped = vote < 0;
  if (flipped) for (const t of side) { const tmp = t[1]; t[1] = t[2]; t[2] = tmp; }

  const caps = [];
  const addCap = (i, dir) => {
    const s = sections[i];
    const C = [s.x, cen[i][1], cen[i][0], cen[i][0], cen[i][1]];
    for (let j = 0; j < segs; j++) {
      const a = s.pts[j % n], b = s.pts[(j + 1) % n];
      let t = [C, [s.x, a[1], a[0], a[0], a[1]], [s.x, b[1], b[0], b[0], b[1]]];
      const nn = triN(t[0], t[1], t[2]);
      if (nn[0] * dir < 0) t = [t[0], t[2], t[1]];
      caps.push(t);
    }
  };
  const L = sections.length - 1;
  if (capStart) addCap(0, Math.sign(sections[0].x - sections[1].x) || -1);
  if (capEnd) addCap(L, Math.sign(sections[L].x - sections[L - 1].x) || 1);

  const all = side.concat(caps);
  const pos = new Float32Array(all.length * 9), uv = new Float32Array(all.length * 6);
  all.forEach((t, k) => {
    for (let v = 0; v < 3; v++) {
      pos.set([t[v][0], t[v][1], t[v][2]], k * 9 + v * 3);
      uv.set([t[v][3], t[v][4]], k * 6 + v * 2);
    }
  });
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.addGroup(0, side.length * 3, 0);
  if (caps.length) g.addGroup(side.length * 3, caps.length * 3, 1);
  if (smooth) {
    g = mergeVertices(g, 1e-5);
    g.computeVertexNormals();
  } else {
    // Compute quad-unified normals smoothed longitudinally along each chine strip
    const Q = Array.from({ length: numSpans }, () => new Array(segs));
    for (let i = 0; i < numSpans; i++) {
      for (let j = 0; j < segs; j++) {
        const k0 = (i * segs + j) * 2;
        const n0 = triN(side[k0][0], side[k0][1], side[k0][2]);
        const n1 = triN(side[k0 + 1][0], side[k0 + 1][1], side[k0 + 1][2]);
        const nx = n0[0] + n1[0], ny = n0[1] + n1[1], nz = n0[2] + n1[2];
        const l = Math.hypot(nx, ny, nz) || 1;
        Q[i][j] = [nx / l, ny / l, nz / l];
      }
    }
    const norm = new Float32Array(all.length * 9);
    const getStripStationN = (i, j, qBase) => {
      let nx = qBase[0], ny = qBase[1], nz = qBase[2];
      const other = i > 0 && i < numSpans ? (qBase === Q[i][j] ? Q[i - 1][j] : Q[i][j]) : null;
      if (other && (nx * other[0] + ny * other[1] + nz * other[2]) > 0.35) {
        nx += other[0]; ny += other[1]; nz += other[2];
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      return [nx / l, ny / l, nz / l];
    };
    const getCornerN = (i, j, qBase, edgeIdx) => {
      const sN = getStripStationN(i, j, qBase);
      const jAdj = edgeIdx === 0 ? (closed ? (j - 1 + segs) % segs : j - 1) : (closed ? (j + 1) % segs : j + 1);
      if (jAdj >= 0 && jAdj < segs) {
        const qAdj = qBase === Q[Math.min(i, numSpans - 1)][j]
          ? Q[Math.min(i, numSpans - 1)][jAdj]
          : Q[Math.max(0, i - 1)][jAdj];
        const sAdj = getStripStationN(i, jAdj, qAdj);
        if (sN[0] * sAdj[0] + sN[1] * sAdj[1] + sN[2] * sAdj[2] > 0.20) {
          const bx = sN[0] * 0.78 + sAdj[0] * 0.22;
          const by = sN[1] * 0.78 + sAdj[1] * 0.22;
          const bz = sN[2] * 0.78 + sAdj[2] * 0.22;
          const bl = Math.hypot(bx, by, bz) || 1;
          return [bx / bl, by / bl, bz / bl];
        }
      }
      return sN;
    };
    for (let i = 0; i < numSpans; i++) {
      for (let j = 0; j < segs; j++) {
        const q = Q[i][j];
        const nA = getCornerN(i, j, q, 0);
        const nB = getCornerN(i, j, q, 1);
        const nC = getCornerN(i + 1, j, q, 1);
        const nD = getCornerN(i + 1, j, q, 0);
        const k0 = (i * segs + j) * 2;
        const tri0 = flipped ? [nA, nC, nB] : [nA, nB, nC];
        const tri1 = flipped ? [nA, nD, nC] : [nA, nC, nD];
        for (let v = 0; v < 3; v++) {
          norm.set(tri0[v], (k0 * 3 + v) * 3);
          norm.set(tri1[v], ((k0 + 1) * 3 + v) * 3);
        }
      }
    }
    for (let c = 0; c < caps.length; c++) {
      const k = side.length + c;
      const nn = triN(all[k][0], all[k][1], all[k][2]);
      const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      const cn = [nn[0] / l, nn[1] / l, nn[2] / l];
      for (let v = 0; v < 3; v++) norm.set(cn, (k * 3 + v) * 3);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  }
  return g;
}

/** Stealth hull profile. Points [z,y]: ridge, shoulder, chine, lower knuckle, keel edge, keel, mirrored. */
export function hullProfile(s) {
  return [[0, s.yT], [s.zS, s.yS], [s.zC, s.yC], [s.zL, s.yL], [s.zB, s.yB], [0, s.yK],
    [-s.zB, s.yB], [-s.zL, s.yL], [-s.zC, s.yC], [-s.zS, s.yS]];
}

/** Regular polygon/ellipse profile in [z,y]. */
export function ringProfile(n, rz, ry, cz = 0, cy = 0, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([cz + Math.cos(a) * rz, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/** Box projection UVs in object units (meters) so panel textures stay to scale. */
export function boxUV(geo, scale = 1) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, nr = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), az = Math.abs(nr.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Extruded polygon slab with chamfered (faceted) edges. Outline in (x, y); thickness along z, centred. */
export function slab(outline, depth, bevel = 0.02, segs = 1) {
  const sh = new THREE.Shape();
  outline.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: segs, curveSegments: 4,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.computeVertexNormals();
  return boxUV(g, 1);
}

/** Planform slab: outline given in (x, z) lying flat, thickness along y. */
export function planform(outline, thick, bevel = 0.02) {
  const g = slab(outline.map(p => [p[0], p[1]]), thick, bevel);
  g.rotateX(Math.PI / 2);
  return boxUV(g, 1);
}

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Orient a unit-height Y-aligned mesh between two points. */
export function placeBetween(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(Y_UP, d.multiplyScalar(1 / len));
  mesh.scale.set(1, len, 1);
  return mesh;
}

export function strutGeo(r, radial = 8) { return new THREE.CylinderGeometry(r, r, 1, radial, 1); }
export function barGeo(w, d) { return new THREE.BoxGeometry(w, 1, d); }

/** Polyline of struts merged into one geometry (for frames). */
export function polyBars(points, r, radial = 6, closed = false) {
  const geos = [];
  const cnt = closed ? points.length : points.length - 1;
  for (let i = 0; i < cnt; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    if (len < 1e-4) continue;
    const g = new THREE.CylinderGeometry(r, r, len + r * 1.2, radial, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, d.normalize());
    g.applyQuaternion(q);
    const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    g.translate(m.x, m.y, m.z);
    geos.push(g);
  }
  return geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
}

/** Lathe around Y from [r, y] profile, optionally re-aimed along X. */
export function lathe(profile, seg = 32, alongX = false, phiStart = 0, phiLen = Math.PI * 2) {
  let pts = profile;
  const f = pts[0], l = pts[pts.length - 1];
  if (Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) {
    // closed loop: force counter-clockwise in (r, y) so faces point outward
    let a = 0;
    for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    if (a < 0) pts = [...pts].reverse();
  }
  const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg, phiStart, phiLen);
  if (alongX) g.rotateZ(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

export function merge(geos) {
  const list = geos.filter(Boolean);
  if (!list.length) return new THREE.BufferGeometry();
  if (list.length === 1) return list[0];
  const hasNonIndexed = list.some(g => !g.index);
  const hasIndexed = list.some(g => !!g.index);
  const norm = list.map(g0 => {
    const g = (hasNonIndexed && hasIndexed && g0.index) ? g0.toNonIndexed() : g0.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) boxUV(g, 1);
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    }
    g.clearGroups();
    return g;
  });
  return mergeGeometries(norm, false);
}

/** Hex packed points within radius. */
export function hexPoints(count, spacing) {
  const pts = [[0, 0]];
  for (let ring = 1; pts.length < count; ring++) {
    for (let side = 0; side < 6; side++) {
      for (let k = 0; k < ring; k++) {
        const a0 = side * Math.PI / 3, a1 = (side + 1) * Math.PI / 3;
        const p0 = [Math.cos(a0) * ring, Math.sin(a0) * ring], p1 = [Math.cos(a1) * ring, Math.sin(a1) * ring];
        const t = k / ring;
        pts.push([(p0[0] + (p1[0] - p0[0]) * t) * spacing, (p0[1] + (p1[1] - p0[1]) * t) * spacing]);
        if (pts.length >= count) return pts;
      }
    }
  }
  return pts;
}
