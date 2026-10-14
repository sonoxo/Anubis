import * as THREE from 'three';

/** Create a mesh tagged with its system (used by x-ray / power views) and add it to a parent. */
export function mk(parent, geo, mat, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
  if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
  if (o.s) { if (typeof o.s === 'number') m.scale.setScalar(o.s); else m.scale.set(o.s[0], o.s[1], o.s[2]); }
  m.castShadow = o.shadow !== false;
  m.receiveShadow = o.receive !== false;
  m.userData.sys = o.sys || 'skin';
  if (o.name) m.name = o.name;
  if (parent) parent.add(m);
  return m;
}

export function grp(parent, p, r, name) {
  const g = new THREE.Group();
  if (p) g.position.set(p[0], p[1], p[2]);
  if (r) g.rotation.set(r[0], r[1], r[2]);
  if (name) g.name = name;
  if (parent) parent.add(g);
  return g;
}

/** Mirror a group across the XY plane (left side copy). */
export function mirrorZ(src) {
  const g = src.clone(true);
  g.scale.z *= -1;
  g.position.z *= -1;
  return g;
}
