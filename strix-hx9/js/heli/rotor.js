// Coaxial rigid rotor system: mast, dual swashplates with servo actuators, pitch links that
// follow the swashplate tilt, twisted/tapered blades with swept anhedral tips, motion-blur discs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft, lathe, V3, strutGeo, placeBetween, boxUV } from '../core/geo.js';
import { mk, grp } from './mk.js';

const TAU = Math.PI * 2;
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
export const ROTOR_R = 6.6;

const BLADE_STATIONS = [
  { r: 0.92, c: 0.36, tw: 0.13, sw: 0, dy: 0.0, th: 0.2 },
  { r: 1.25, c: 0.56, tw: 0.12, sw: 0, dy: -0.005, th: 0.14 },
  { r: 2.4, c: 0.56, tw: 0.095, sw: 0, dy: -0.022, th: 0.12 },
  { r: 4.0, c: 0.55, tw: 0.055, sw: 0, dy: -0.052, th: 0.11 },
  { r: 5.5, c: 0.53, tw: 0.02, sw: 0.0, dy: -0.09, th: 0.1 },
  { r: 6.05, c: 0.46, tw: 0.0, sw: 0.1, dy: -0.12, th: 0.09 },
  { r: 6.42, c: 0.34, tw: -0.01, sw: 0.24, dy: -0.15, th: 0.08 },
  { r: 6.6, c: 0.16, tw: -0.01, sw: 0.36, dy: -0.175, th: 0.07 },
];

function airfoil(n = 14, t = 0.12, camber = 0.015) {
  // closed ring: upper TE->LE, lower LE->TE ; returns [c, y]
  const up = [], lo = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos(Math.PI * i / n)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = camber * 4 * x * (1 - x);
    up.push([x, yc + yt]); lo.push([x, yc - yt]);
  }
  const ring = [];
  for (let i = n; i >= 0; i--) ring.push(up[i]);
  for (let i = 1; i < n; i++) ring.push(lo[i]);
  return ring;
}

function stationPt(s, cx, cy, dir, expand = 0) {
  let z = (cx - 0.25) * s.c + s.sw;
  let y = cy * s.c * (s.th / 0.12);
  if (expand !== 0) {
    const nx = cx - 0.18, ny = cy * 2.5;
    const nl = Math.hypot(nx, ny) || 1;
    z += (nx / nl) * expand;
    y += (ny / nl) * expand;
  }
  const zz = dir * z;
  const a = s.tw * dir;
  const yr = y * Math.cos(a) - zz * Math.sin(a) * dir * dir;
  const zr = y * Math.sin(a) + zz * Math.cos(a);
  return [zr, yr + s.dy];
}

/** Blade geometry along +X (radius). dir=+1 -> leading edge toward -Z (CCW rotor). */
export function bladeGeometry(dir = 1) {
  const foil = airfoil(14);
  const secs = BLADE_STATIONS.map(s => ({
    x: s.r,
    pts: foil.map(([cx, cy]) => stationPt(s, cx, cy, dir)),
  }));
  return boxUV(loft(secs, { closed: true, capStart: true, capEnd: true, smooth: true }), 0.5);
}

/** Metallic leading-edge erosion protection strip wrapping the nose of the airfoil. */
function bladeLEGeometry(dir = 1) {
  const full = airfoil(14);
  const lePts = full.filter(([cx]) => cx <= 0.16);
  const leStations = BLADE_STATIONS.slice(1, 7);
  const secs = leStations.map(s => ({
    x: s.r,
    pts: lePts.map(([cx, cy]) => stationPt(s, cx, cy, dir, 0.0018)),
  }));
  return loft(secs, { closed: false, capStart: false, capEnd: false, smooth: false });
}

/** Narrow painted tip stripe near the outer blade tip. */
function bladeTipBandGeometry(dir = 1) {
  const foil = airfoil(12);
  const tipStations = [
    { r: 6.38, c: 0.35, tw: -0.01, sw: 0.22, dy: -0.146, th: 0.082 },
    { r: 6.48, c: 0.28, tw: -0.01, sw: 0.28, dy: -0.158, th: 0.076 },
  ];
  const secs = tipStations.map(s => ({
    x: s.r,
    pts: foil.map(([cx, cy]) => stationPt(s, cx, cy, dir, 0.0012)),
  }));
  return loft(secs, { closed: true, capStart: false, capEnd: false, smooth: true });
}

function makeTipGlowMaterial() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  grd.addColorStop(0.15, 'rgba(255,255,255,0.72)');
  grd.addColorStop(0.38, 'rgba(255,255,255,0.20)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.SpriteMaterial({
    map: tex, color: 0x5ef2ff, transparent: true, opacity: 0.72,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
}

export function blurMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAngle: { value: 0 },
      uOtherAngle: { value: 0 },
      uHasOther: { value: 0 },
      uSmear: { value: 0.45 },
      uOpacity: { value: 0 },
      uBlades: { value: 4 },
      uDir: { value: 1 },
      uR0: { value: 0.9 },
      uR1: { value: ROTOR_R },
      uColor: { value: new THREE.Color(color) },
      uLEColor: { value: new THREE.Color(0x9ca8b8) },
      uTipColor: { value: new THREE.Color(0xe0a81e) },
      uChord: { value: 0.55 },
      uConing: { value: 0.0 },
      uUseDroop: { value: 0.0 },
    },
    vertexShader: `
      uniform float uR0, uR1, uConing, uUseDroop;
      varying vec2 vP;
      void main(){
        vec3 pos = position;
        float r = length(pos.xz);
        float tR = clamp((r - uR0) / max(uR1 - uR0, 1e-3), 0.0, 1.0);
        float droop = -0.175 * pow(tR, 1.35);
        float coneY = (r - 0.5) * sin(uConing);
        pos.y += (droop + coneY) * uUseDroop;
        vP = pos.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: `
      uniform float uAngle, uOtherAngle, uHasOther, uSmear, uOpacity, uBlades, uDir, uR0, uR1, uChord, uUseDroop;
      uniform vec3 uColor, uLEColor, uTipColor;
      varying vec2 vP;
      void main(){
        float r = length(vP);
        if(r < uR0 || r > uR1) discard;
        float tR = clamp((r - uR0) / max(uR1 - uR0, 1e-3), 0.0, 1.0);
        float a = atan(-vP.y, vP.x);
        float seg = 6.2831853 / uBlades;
        float sw = uUseDroop * mix(0.0, 0.36, pow(clamp((r - 5.2) / 1.4, 0.0, 1.0), 1.4)) / max(r, 0.5);
        float chordAng = uChord / max(r, 0.35);
        float rel = mod(uDir * (uAngle - a) + sw * uDir + chordAng * 0.48, seg);
        float shutterAng = clamp(uSmear * 1.25, 0.36, seg * 0.78);

        // Photographic shutter-angle wedge (feathered leading edge + broad shutter-integration plateau + sub-strobe harmonics)
        float leadFeather = smoothstep(0.0, chordAng * 0.38, rel);
        float core = exp(-pow((rel - chordAng * 0.48) / max(chordAng * 0.72, 0.032), 2.0) * 1.8);
        float trail = leadFeather * exp(-max(rel - chordAng * 1.05, 0.0) / max(shutterAng, 1e-3));
        float ghost = (0.5 + 0.5 * cos(rel * 22.0)) * exp(-rel / max(shutterAng * 0.75, 1e-3)) * leadFeather;
        float bladeDens = clamp(core * 0.54 + trail * 0.58 + ghost * 0.18, 0.0, 1.0);

        // Leading-edge titanium glint + shutter-integrated metallic sweep across each blade wedge
        float leMask = exp(-pow((rel - chordAng * 0.24) / max(chordAng * 0.28, 0.024), 2.0) * 4.2) * smoothstep(0.04, 0.12, tR) * smoothstep(0.99, 0.92, tR);
        float leSweep = clamp(leMask + trail * (0.42 + 0.48 * ghost) * smoothstep(0.04, 0.14, tR) * smoothstep(0.99, 0.90, tR), 0.0, 1.0);

        // Golden-yellow outer blade-tip recognition band (r = 6.30..6.52)
        float tipMask = uUseDroop * smoothstep(6.28, 6.35, r) * smoothstep(6.54, 6.47, r);

        // Anisotropic Kajiya-Kay bow-tie specular highlights from sun & sky across the spinning disc
        vec2 T2 = normalize(vec2(-vP.y, vP.x));
        vec2 Lsun = normalize(vec2(0.78, 0.52));
        vec2 Lsky = normalize(vec2(-0.52, 0.78));
        float anisoSun = pow(sqrt(max(0.0, 1.0 - pow(dot(T2, Lsun), 2.0))), 10.0) * (0.45 + 0.55 * bladeDens);
        float anisoSky = pow(sqrt(max(0.0, 1.0 - pow(dot(T2, Lsky), 2.0))), 4.5) * 0.36;

        // Coaxial inter-rotor counter-rotating blade shadows cast onto the lower disc
        float coaxShadow = 1.0;
        if (uHasOther > 0.5) {
          vec2 pSh = vP + (uDir < 0.0 ? vec2(-0.20, -0.12) : vec2(0.05, 0.03));
          float rSh = length(pSh);
          float aSh = atan(-pSh.y, pSh.x);
          float relOther = mod(-uDir * (uOtherAngle - aSh) + (uChord * 0.48) / max(rSh, 0.5), seg);
          float otherLead = smoothstep(0.0, chordAng * 0.38, relOther);
          float otherWedge = otherLead * exp(-max(relOther - chordAng * 0.95, 0.0) / max(shutterAng * 0.85, 1e-3));
          coaxShadow = 1.0 - (uDir < 0.0 ? 0.48 : 0.20) * otherWedge * smoothstep(uR1, uR1 - 0.3, rSh);
        }

        float edge = smoothstep(uR1, uR1 - (uUseDroop > 0.5 ? 0.12 : 0.05), r) * smoothstep(uR0, uR0 + (uUseDroop > 0.5 ? 0.24 : 0.06), r);
        vec3 col = mix(uColor, uLEColor, leSweep * 0.78);
        col = mix(col, uTipColor, tipMask * (0.48 + 0.52 * bladeDens));
        col += vec3(0.90, 0.95, 1.0) * (anisoSun * (0.28 + 0.48 * leSweep) + anisoSky * (0.14 + 0.18 * bladeDens));
        col *= coaxShadow;

        float spanBand = 0.095 + 0.065 * sin(tR * 3.14159);
        float alpha = (bladeDens * 0.76 + spanBand + tipMask * 0.24 + leMask * 0.14) * edge * uOpacity;
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

function tipRingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x5ef2ff) },
      uOpacity: { value: 0 },
      uAngle: { value: 0 },
      uBlades: { value: 4 },
      uDir: { value: 1 },
      uR1: { value: ROTOR_R },
      uConing: { value: 0.0 },
    },
    vertexShader: `
      uniform float uR1, uConing;
      varying vec2 vP;
      void main(){
        vec3 pos = position;
        float r = length(pos.xz);
        pos.y += -0.175 + (r - 0.5) * sin(uConing);
        vP = pos.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity, uAngle, uBlades, uDir, uR1;
      varying vec2 vP;
      void main(){
        float r = length(vP);
        float rProfile = exp(-pow((r - (uR1 - 0.035)) / 0.044, 2.0));
        float a = atan(-vP.y, vP.x);
        float seg = 6.2831853 / uBlades;
        float rel = mod(uDir * (uAngle - a) + 0.35 * uDir / uR1, seg);
        float head = exp(-rel * 16.0);
        float streak = 0.16 + 0.84 * exp(-rel * 2.4);
        vec3 col = mix(uColor, vec3(1.0, 0.98, 0.92), head * 0.72);
        gl_FragColor = vec4(col * (0.88 + 0.65 * head), uOpacity * streak * rProfile * 0.76);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

function vortexMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xdceeff) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uConing: { value: 0.0 },
    },
    vertexShader: `
      uniform float uConing;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 pos = position + normal * (uv.x * 0.014);
        float r = length(pos.xz);
        pos.y += (r - 0.5) * sin(uConing);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity, uTime;
      varying vec2 vUv;
      void main(){
        float core = pow(sin(clamp(vUv.y, 0.0, 1.0) * 3.14159265), 1.55);
        float fadeIn = smoothstep(0.0, 0.06, vUv.x);
        float fadeOut = pow(max(0.0, 1.0 - vUv.x), 1.65);
        float swirl = 0.78 + 0.22 * sin(vUv.x * 26.0 - uTime * 18.0 + vUv.y * 6.2831853);
        float alpha = core * fadeIn * fadeOut * swirl * uOpacity;
        vec3 col = mix(uColor, vec3(0.96, 0.98, 1.0), core * 0.58);
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

export class CoaxRotor {
  constructor(M) {
    this.M = M;
    this.group = new THREE.Group();
    this.group.name = 'rotorSystem';
    this.angle = 0;
    this.links = [];
    this.rotors = [];
    this.tipGlowMat = makeTipGlowMaterial();
    this.build();
  }

  build() {
    const M = this.M, G = this.group;
    // ---------- mast ----------
    this.mastG = grp(G, null, null, 'mast');
    const mastSteelGeos = [
      new THREE.CylinderGeometry(0.118, 0.135, 1.1, 20).translate(0, 3.52, 0),
      new THREE.CylinderGeometry(0.08, 0.08, 1.95, 18).translate(0, 4.0, 0),
    ];
    const mastBrassGeos = [];
    const collarGeos = [new THREE.CylinderGeometry(0.052, 0.052, 0.55, 14).translate(0, 5.0, 0)];
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) * TAU / 4;
      const cx = Math.cos(a) * 0.108, cz = Math.sin(a) * 0.108;
      mastSteelGeos.push(new THREE.CylinderGeometry(0.012, 0.012, 1.72, 6).translate(cx, 3.94, cz));
      for (const uy of [3.26, 3.84, 4.24, 4.62]) {
        mastBrassGeos.push(new THREE.CylinderGeometry(0.018, 0.018, 0.036, 6).translate(cx, uy, cz));
        collarGeos.push(new THREE.BoxGeometry(0.042, 0.022, 0.042).translate(cx * 0.92, uy - 0.028, cz * 0.92));
      }
    }
    for (const y of [3.12, 3.24, 3.82, 4.3, 4.55, 4.98]) {
      const r = y > 4 ? 0.102 : 0.152;
      collarGeos.push(new THREE.CylinderGeometry(r, r, 0.042, 18).translate(0, y, 0));
      for (let b = 0; b < 8; b++) {
        const ba = (b / 8) * TAU;
        mastSteelGeos.push(new THREE.CylinderGeometry(0.010, 0.010, 0.054, 6).translate(Math.cos(ba) * (r - 0.018), y, Math.sin(ba) * (r - 0.018)));
      }
    }
    mk(this.mastG, mergeGeometries(mastSteelGeos), M.steel, { sys: 'drive' });
    mk(this.mastG, mergeGeometries(mastBrassGeos), M.brass, { sys: 'hyd', shadow: false });
    mk(this.mastG, mergeGeometries(collarGeos), M.darkMetal, { sys: 'drive', shadow: false });

    // ---------- swashplates + servos ----------
    this.swashLower = this.buildSwash(3.6, 0.44, true);
    this.swashUpper = this.buildSwash(4.42, 0.34, false);

    // ---------- hubs & blades ----------
    this.lower = this.buildRotor(3.98, -1, 0.0);
    this.upper = this.buildRotor(4.8, 1, Math.PI / 4);

    // inter-rotor fairing + bolted flange rings
    const fairGeos = [lathe([[0.0, 4.12], [0.175, 4.14], [0.21, 4.22], [0.17, 4.32], [0.11, 4.36], [0.0, 4.37]], 20)];
    mk(this.mastG, mergeGeometries(fairGeos), M.trim, { sys: 'rotor', shadow: false });

    // ---------- mast-mounted sensor dome ----------
    const dome = grp(G, [0, 5.32, 0], null, 'dome');
    this.dome = dome;
    const domeGeo = new THREE.SphereGeometry(0.62, 36, 20);
    domeGeo.scale(1, 0.42, 1);
    mk(dome, boxUV(domeGeo, 0.5), M.paint2, { sys: 'skin' });
    // Recessed dark bezel ring + thin, dim formation light ring + bolted azimuth slip-ring base
    const domeTrimGeo = mergeGeometries([
      new THREE.TorusGeometry(0.616, 0.008, 8, 48).rotateX(Math.PI / 2),
      new THREE.CylinderGeometry(0.18, 0.22, 0.018, 18).translate(0, 0.255, 0),
    ]);
    mk(dome, domeTrimGeo, M.trim, { sys: 'skin', shadow: false });
    mk(dome, new THREE.TorusGeometry(0.621, 0.0052, 8, 48), M.glow, { r: [Math.PI / 2, 0, 0], sys: 'skin', shadow: false });
    const domeBaseDarkGeos = [
      new THREE.CylinderGeometry(0.21, 0.27, 0.13, 20).translate(0, -0.28, 0),
      new THREE.CylinderGeometry(0.285, 0.285, 0.028, 20).translate(0, -0.33, 0),
    ];
    const domeBaseSteelGeos = [];
    for (let b = 0; b < 12; b++) {
      const ba = (b / 12) * TAU;
      domeBaseSteelGeos.push(new THREE.CylinderGeometry(0.011, 0.011, 0.04, 6).translate(Math.cos(ba) * 0.255, -0.33, Math.sin(ba) * 0.255));
    }
    mk(dome, mergeGeometries(domeBaseDarkGeos), M.darkMetal, { sys: 'avionics', shadow: false });
    mk(dome, mergeGeometries(domeBaseSteelGeos), M.steel, { sys: 'avionics', shadow: false });
    // internal rotating radar array (visible in x-ray / exploded)
    this.radar = grp(dome, [0, 0, 0], null, 'radar');
    mk(this.radar, new THREE.BoxGeometry(0.9, 0.16, 0.05), M.sys.avionics, { sys: 'avionics', shadow: false });
    this.radar.visible = false;
  }

  buildSwash(y, r, servos) {
    const M = this.M;
    const sw = grp(this.mastG, [0, y, 0], null, 'swash');
    const stat = grp(sw, null, null, 'swashStat');
    const statGeos = [
      lathe([[r * 0.44, -0.045], [r * 0.96, -0.045], [r * 1.02, 0], [r * 0.96, 0.032], [r * 0.44, 0.032]], 24),
      // Stationary anti-rotation scissor crank arm (2-piece hinged link)
      new THREE.BoxGeometry(0.038, 0.18, 0.052).rotateZ(-0.48).translate(-r * 0.52, -0.11, 0.04),
      new THREE.BoxGeometry(0.038, 0.16, 0.048).rotateZ(0.42).translate(-r * 0.56, -0.22, 0.04),
      new THREE.CylinderGeometry(0.022, 0.022, 0.068, 8).rotateX(Math.PI / 2).translate(-r * 0.62, -0.17, 0.04),
    ];
    mk(stat, mergeGeometries(statGeos), M.darkMetal, { sys: 'rotor', shadow: false });

    const rotg = grp(sw, null, null, 'swashRot');
    const rotMetalGeos = [
      lathe([[r * 0.40, 0.035], [r * 0.92, 0.035], [r * 0.97, 0.068], [r * 0.92, 0.095], [r * 0.40, 0.095]], 24),
      // Rotating drive scissor link assembly (upper 2-piece hinged crank)
      new THREE.BoxGeometry(0.038, 0.19, 0.052).rotateZ(0.48).translate(r * 0.48, 0.16, 0),
      new THREE.BoxGeometry(0.038, 0.17, 0.048).rotateZ(-0.42).translate(r * 0.52, 0.27, 0),
    ];
    const rotSteelGeos = [
      new THREE.CylinderGeometry(0.018, 0.018, 0.072, 8).rotateX(Math.PI / 2).translate(r * 0.58, 0.22, 0),
    ];
    const rotBrassGeos = [];
    for (let b = 0; b < 12; b++) {
      const ba = (b / 12) * TAU;
      rotSteelGeos.push(new THREE.CylinderGeometry(0.010, 0.010, 0.024, 6).translate(Math.cos(ba) * r * 0.78, 0.096, Math.sin(ba) * r * 0.78));
    }
    for (let k = 0; k < 4; k++) {
      const a = k * TAU / 4;
      const lx = Math.cos(a) * r * 0.97, lz = -Math.sin(a) * r * 0.97;
      // Twin-ear clevis lug on swashplate outer rim
      rotMetalGeos.push(new THREE.BoxGeometry(0.135, 0.058, 0.082).rotateY(a).translate(lx, 0.072, lz));
      rotSteelGeos.push(new THREE.SphereGeometry(0.028, 8, 6).translate(lx, 0.098, lz));
      rotSteelGeos.push(new THREE.CylinderGeometry(0.012, 0.012, 0.096, 6).rotateX(Math.PI / 2).rotateY(a).translate(lx, 0.095, lz));
      rotBrassGeos.push(new THREE.CylinderGeometry(0.032, 0.032, 0.022, 8).rotateZ(Math.PI / 2).rotateY(a).translate(lx, 0.098, lz));
    }
    mk(rotg, mergeGeometries(rotMetalGeos), M.metal, { sys: 'rotor', shadow: false });
    mk(rotg, mergeGeometries(rotSteelGeos), M.steel, { sys: 'rotor', shadow: false });
    mk(rotg, mergeGeometries(rotBrassGeos), M.brass, { sys: 'rotor', shadow: false });

    const servoList = [];
    if (servos) {
      const servoBodyGeos = [], servoJointGeos = [], servoBrassGeos = [];
      for (let k = 0; k < 3; k++) {
        const a = k * TAU / 3 + Math.PI / 6;
        const x = Math.cos(a) * r * 0.84, z = -Math.sin(a) * r * 0.84;
        servoBodyGeos.push(new THREE.CylinderGeometry(0.052, 0.056, 0.34, 12).translate(x, y - 0.42, z));
        // Side hydraulic accumulator bottle on each servo actuator
        servoJointGeos.push(new THREE.CylinderGeometry(0.026, 0.026, 0.22, 8).translate(x * 1.16, y - 0.44, z * 1.16));
        servoJointGeos.push(new THREE.SphereGeometry(0.034, 8, 6).translate(x, y - 0.60, z));
        servoBrassGeos.push(new THREE.CylinderGeometry(0.058, 0.058, 0.032, 10).translate(x, y - 0.25, z));
        const rod = mk(this.mastG, strutGeo(0.021), M.steel, { sys: 'hyd', shadow: false });
        servoList.push({ rod, x, z, base: y - 0.26, a });
      }
      mk(this.mastG, mergeGeometries(servoBodyGeos), M.metal, { sys: 'hyd', shadow: false });
      mk(this.mastG, mergeGeometries(servoJointGeos), M.darkMetal, { sys: 'hyd', shadow: false });
      mk(this.mastG, mergeGeometries(servoBrassGeos), M.brass, { sys: 'hyd', shadow: false });
    }
    return { sw, stat, rotg, r, y, servos: servoList };
  }

  buildRotor(y, dir, phase) {
    const M = this.M;
    const hub = grp(this.group, [0, y, 0], null, dir > 0 ? 'upperRotor' : 'lowerRotor');
    const spin = grp(hub, null, null, 'spin');
    // Forged hub body + upper/lower flange plates + prominent 12-bolt circles + de-ice distributor manifold
    mk(spin, mergeGeometries([
      new THREE.CylinderGeometry(0.28, 0.32, 0.21, 18),
      new THREE.CylinderGeometry(0.325, 0.325, 0.032, 18).translate(0, 0.095, 0),
      new THREE.CylinderGeometry(0.335, 0.335, 0.032, 18).translate(0, -0.095, 0),
      new THREE.CylinderGeometry(0.175, 0.185, 0.052, 16).translate(0, 0.175, 0),
    ]), M.darkMetal, { sys: 'rotor' });
    mk(spin, mergeGeometries([
      new THREE.CylinderGeometry(0.23, 0.29, 0.065, 18).translate(0, 0.135, 0),
      // 4 radial forged spider ribs on top of the hub plate
      new THREE.BoxGeometry(0.56, 0.045, 0.095).translate(0, 0.125, 0),
      new THREE.BoxGeometry(0.095, 0.045, 0.56).translate(0, 0.125, 0),
    ]), M.titanium, { sys: 'rotor', shadow: false });
    const hubSteelGeos = [new THREE.CylinderGeometry(0.14, 0.14, 0.055, 16).translate(0, 0.205, 0)];
    const hubBrassGeos = [];
    for (let b = 0; b < 12; b++) {
      const ba = (b / 12) * TAU;
      // Raised hex bolt heads on upper and lower hub flange rings (sized to read crisply at hero distance)
      hubSteelGeos.push(new THREE.CylinderGeometry(0.016, 0.016, 0.038, 6).translate(Math.cos(ba) * 0.265, 0.158, Math.sin(ba) * 0.265));
      hubSteelGeos.push(new THREE.CylinderGeometry(0.015, 0.015, 0.034, 6).translate(Math.cos(ba) * 0.298, -0.105, Math.sin(ba) * 0.298));
    }
    for (let k = 0; k < 4; k++) {
      const ka = (k + 0.5) * TAU / 4;
      hubBrassGeos.push(new THREE.CylinderGeometry(0.016, 0.016, 0.038, 6).translate(Math.cos(ka) * 0.16, 0.205, Math.sin(ka) * 0.16));
    }
    mk(spin, mergeGeometries(hubSteelGeos), M.steel, { sys: 'rotor', shadow: false });
    mk(spin, mergeGeometries(hubBrassGeos), M.brass, { sys: 'rotor', shadow: false });

    const bGeo = bladeGeometry(dir);
    const leGeo = bladeLEGeometry(dir);
    const tipBandGeo = bladeTipBandGeometry(dir);
    // Start non-transparent so parked blades cast crisp sun shadows and participate in AO;
    // update() toggles transparent = true only when rpm > 0.35 (motion blur fade).
    const bladeMat = M.blade.clone(); bladeMat.transparent = false;
    const bladeLEMat = M.bladeLE.clone(); bladeLEMat.transparent = false;
    const bladeTipMat = M.bladeTip.clone(); bladeTipMat.transparent = false;

    const deIceLoopCurve = new THREE.CatmullRomCurve3([
      V3(0.20, 0.15, 0.05 * dir),
      V3(0.38, 0.22, 0.11 * dir),
      V3(0.60, 0.15, 0.10 * dir),
      V3(0.80, 0.055, 0.06 * dir),
    ]);
    // Dual outboard lead-lag elastomeric damper barrels + braided de-ice harness loop
    const armDarkGeos = [-0.155, 0.155].map(dz =>
      new THREE.CylinderGeometry(0.032, 0.032, 0.36, 10).rotateZ(Math.PI / 2).rotateY(-dz * 0.65).translate(0.40, 0, dz)
    );
    armDarkGeos.push(new THREE.TubeGeometry(deIceLoopCurve, 12, 0.0105, 6, false));
    const armDarkGeo = mergeGeometries(armDarkGeos);

    const armSteelGeos = [-0.155, 0.155].map(dz =>
      new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8).rotateZ(Math.PI / 2).translate(0.60, 0, dz * 0.86)
    );
    armSteelGeos.push(
      new THREE.CylinderGeometry(0.016, 0.016, 0.034, 6).rotateZ(Math.PI / 2).translate(0.20, 0.15, 0.05 * dir),
      new THREE.CylinderGeometry(0.016, 0.016, 0.034, 6).rotateZ(Math.PI / 2).translate(0.80, 0.055, 0.06 * dir),
      // Yoke root trunnion bolts
      new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6).translate(0.28, 0, -0.075),
      new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6).translate(0.28, 0, 0.075),
    );
    const armSteelGeo = mergeGeometries(armSteelGeos);

    const hornZ = -dir * 0.20;
    // Detailed blade root cuff: pitch horn + dual twin-pin fold hinge clevises + 6 retention bolts
    const featherSteelGeos = [
      new THREE.BoxGeometry(0.072, 0.048, 0.22).translate(0.09, -0.06, hornZ * 0.55),
      new THREE.SphereGeometry(0.034, 8, 6).translate(0.09, -0.072, hornZ),
      // Heavy vertical blade-fold hinge pins at cuff root (x=0.25) and outer cuff (x=0.58)
      new THREE.CylinderGeometry(0.024, 0.024, 0.138, 8).translate(0.25, 0, -0.125),
      new THREE.CylinderGeometry(0.024, 0.024, 0.138, 8).translate(0.25, 0, 0.125),
      new THREE.CylinderGeometry(0.022, 0.022, 0.126, 8).translate(0.58, 0, -0.115),
      new THREE.CylinderGeometry(0.022, 0.022, 0.126, 8).translate(0.58, 0, 0.115),
    ];
    for (const bx of [0.34, 0.44, 0.52, 0.68]) {
      for (const bz of [-0.092, 0.092]) {
        featherSteelGeos.push(new THREE.CylinderGeometry(0.017, 0.017, 0.116, 6).translate(bx, 0, bz));
      }
    }
    const featherSteelGeo = mergeGeometries(featherSteelGeos);

    // Sculpted aerodynamic blade root cuff sleeve (extending from x=0.16 to x=0.78) + 3 trailing-edge static wicks
    const featherDarkGeos = [
      new THREE.BoxGeometry(0.54, 0.092, 0.33).translate(0.46, 0, 0),
      new THREE.BoxGeometry(0.22, 0.078, 0.36).translate(0.72, 0, 0),
      new THREE.BoxGeometry(0.11, 0.108, 0.35).translate(0.24, 0, 0),
    ];
    for (const [wx, wy, wz] of [[4.85, -0.082, dir * 0.38], [5.22, -0.098, dir * 0.38], [5.56, -0.122, dir * 0.42]]) {
      featherDarkGeos.push(new THREE.CylinderGeometry(0.0024, 0.0040, 0.12, 5).rotateX(dir * Math.PI / 2).translate(wx, wy, wz + dir * 0.055));
    }
    const featherDarkGeo = mergeGeometries(featherDarkGeos);

    // Machined titanium/metal cuff reinforcement straps + torque spindle barrel
    const featherMetalGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.092, 0.118, 0.62, 12).rotateZ(Math.PI / 2).translate(0.30, 0, 0),
      new THREE.BoxGeometry(0.048, 0.102, 0.348).translate(0.34, 0, 0),
      new THREE.BoxGeometry(0.048, 0.098, 0.342).translate(0.50, 0, 0),
      new THREE.BoxGeometry(0.045, 0.086, 0.368).translate(0.68, 0, 0),
    ]);

    // Brass castle-nut collars on fold pins + yellow fold-lock indicator tabs
    const featherBrassGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.030, 0.030, 0.018, 8).translate(0.25, 0.062, -0.125),
      new THREE.CylinderGeometry(0.030, 0.030, 0.018, 8).translate(0.25, 0.062, 0.125),
      new THREE.CylinderGeometry(0.028, 0.028, 0.016, 8).translate(0.58, 0.056, -0.115),
      new THREE.CylinderGeometry(0.028, 0.028, 0.016, 8).translate(0.58, 0.056, 0.115),
    ]);

    // Pitch link rod with machined top & bottom clevis fork collars
    const linkGeo = mergeGeometries([
      strutGeo(0.019, 8),
      new THREE.CylinderGeometry(0.028, 0.028, 0.14, 8).translate(0, 0.09, 0),
      new THREE.CylinderGeometry(0.028, 0.028, 0.14, 8).translate(0, 0.91, 0),
    ]);

    // 3D helical tip-vortex condensation trail geometry (shared across the 4 blades of this rotor)
    const vortexPts = [];
    const nVPts = 24;
    for (let i = 0; i <= nVPts; i++) {
      const u = i / nVPts;
      const angTrail = -dir * (0.054 + u * 1.85);
      const rTrail = 6.56 - 0.22 * Math.pow(u, 0.90);
      const yTrail = -0.175 - 0.22 * Math.pow(u, 1.25);
      vortexPts.push(V3(rTrail * Math.cos(angTrail), yTrail, -rTrail * Math.sin(angTrail)));
    }
    const vortexGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vortexPts), 28, 0.011, 6, false);
    const vortexMat = vortexMaterial();
    const vortices = [];

    const blades = [];
    for (let k = 0; k < 4; k++) {
      const arm = grp(spin, null, [0, k * TAU / 4, 0]);
      // hub arm (flexbeam yoke) + lag damper cylinders + de-ice cable loop
      mk(arm, new THREE.BoxGeometry(0.54, 0.098, 0.22), M.titanium, { p: [0.37, 0, 0], sys: 'rotor' });
      mk(arm, armDarkGeo, M.darkMetal, { sys: 'hyd', shadow: false });
      mk(arm, armSteelGeo, M.steel, { sys: 'hyd', shadow: false });
      const cone = grp(arm, [0.5, 0, 0]);
      const feather = grp(cone);
      // grip / cuff with reinforcement straps, retention bolts, pitch horn + trailing-edge static wicks
      mk(feather, featherMetalGeo, M.metal, { sys: 'rotor' });
      mk(feather, featherDarkGeo, M.darkMetal, { sys: 'rotor', shadow: false });
      mk(feather, featherSteelGeo, M.steel, { sys: 'rotor', shadow: false });
      mk(feather, featherBrassGeo, M.brass, { sys: 'rotor', shadow: false });
      // composite blade + metallic leading-edge erosion strip + swept tip band
      const blade = mk(feather, bGeo, bladeMat, { p: [-0.5, 0, 0], sys: 'blade' });
      mk(feather, leGeo, bladeLEMat, { p: [-0.5, 0, 0], sys: 'blade', shadow: false });
      mk(feather, tipBandGeo, bladeTipMat, { p: [-0.5, 0, 0], sys: 'blade', shadow: false });
      // Tiny point LED fixture + compact subtle halo at the outer swept tip of the blade
      mk(feather, new THREE.BoxGeometry(0.068, 0.015, 0.028), M.trim, { p: [6.03, -0.168, dir * 0.325], r: [0, -dir * 0.52, -0.14], sys: 'rotor', shadow: false });
      mk(feather, new THREE.BoxGeometry(0.042, 0.014, 0.020), M.tipLED || M.glow, { p: [6.065, -0.172, dir * 0.342], r: [0, -dir * 0.52, -0.14], sys: 'rotor', shadow: false });
      const tipHalo = new THREE.Sprite(this.tipGlowMat);
      tipHalo.position.set(6.072, -0.172, dir * 0.346);
      tipHalo.scale.set(0.38, 0.38, 1);
      tipHalo.userData.sys = 'fx'; tipHalo.userData.keep = true;
      feather.add(tipHalo);
      // Helical tip-vortex condensation trail attached to arm (axisymmetric coning applied in vertex shader)
      const vMesh = new THREE.Mesh(vortexGeo, vortexMat);
      vMesh.visible = false;
      vMesh.renderOrder = 3;
      vMesh.userData.sys = 'fx'; vMesh.userData.keep = true;
      arm.add(vMesh);
      vortices.push(vMesh);
      blades.push({ arm, cone, feather, blade, hornLocal: V3(0.09, -0.072, hornZ) });
    }
    // pitch links (live in hub frame, recomputed each frame)
    const swash = dir > 0 ? this.swashUpper : this.swashLower;
    const links = blades.map(() => {
      const l = mk(spin, linkGeo, M.steel, { sys: 'rotor', shadow: false });
      return l;
    });
    // Coned 3D motion-blur disc + feathered tip ring live on the non-rotating hub
    const discGeo = new THREE.RingGeometry(0.9, ROTOR_R, 128, 10).rotateX(-Math.PI / 2);
    const disc = new THREE.Mesh(discGeo, blurMaterial(0x1f242c));
    disc.material.uniforms.uDir.value = dir;
    disc.material.uniforms.uUseDroop.value = 1.0;
    disc.material.uniforms.uHasOther.value = 1.0;
    disc.renderOrder = 2; disc.userData.sys = 'fx'; disc.userData.keep = true;
    disc.position.y = 0.005;
    hub.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(ROTOR_R - 0.16, ROTOR_R + 0.09, 128, 2).rotateX(-Math.PI / 2), tipRingMaterial());
    ring.material.uniforms.uDir.value = dir;
    ring.userData.sys = 'fx'; ring.userData.keep = true; ring.renderOrder = 3;
    hub.add(ring);
    const rotor = { hub, spin, blades, links, dir, phase, swash, disc, ring, vortexMat, vortices, bladeMat, bladeLEMat, bladeTipMat, y };
    this.rotors.push(rotor);
    return rotor;
  }

  /** rpm 0..1, collective 0..1, cyc = {pitch, roll} in -1..1, thrust 0..1 */
  update(dt, rpm, collective, cyc, thrust, accent) {
    this.time = (this.time || 0) + dt;
    const omega = rpm * TAU * 5.1;
    this.angle = (this.angle + omega * dt) % (TAU * 1000);
    const th0 = 0.02 + collective * 0.16;
    const A = cyc.roll * 0.05, B = -cyc.pitch * 0.05;
    // Slight static droop at rest, lifting into positive coning as rotor spools up
    const spinLift = THREE.MathUtils.smoothstep(rpm, 0.0, 0.55);
    const coning = THREE.MathUtils.lerp(-0.008, 0.014, spinLift) + thrust * 0.035 * rpm;
    const vis = THREE.MathUtils.smoothstep(rpm, 0.35, 0.85);
    const fading = vis > 0.01;
    const op = 1 - vis * 0.84;
    const dw = vis < 0.5;
    if (this.tipGlowMat && this.M.tipLED) {
      this.tipGlowMat.color.copy(this.M.tipLED.emissive);
      const tipInt = this.M.tipLED.emissiveIntensity ?? 2.4;
      this.tipGlowMat.opacity = THREE.MathUtils.clamp((tipInt - 0.4) / 3.2, 0.12, 0.90) * (0.38 + 0.62 * op);
    }
    const vortexOp = THREE.MathUtils.smoothstep(rpm, 0.45, 0.90) * (0.30 + 0.36 * thrust);
    for (let ri = 0; ri < this.rotors.length; ri++) {
      const R = this.rotors[ri];
      const otherR = this.rotors[1 - ri] || R;
      const ang = R.dir * this.angle + R.phase;
      const otherAng = otherR.dir * this.angle + otherR.phase;
      R.spin.rotation.y = ang;
      // Keep cloned blade material color synced with theme livery M.blade
      R.bladeMat.color.copy(this.M.blade.color);
      R.bladeMat.roughness = this.M.blade.roughness;
      R.bladeMat.metalness = this.M.blade.metalness;
      // swash plate (non-rotating) tilt + collective height
      const sw = R.swash;
      const lift = (collective - 0.3) * 0.05;
      sw.sw.position.y = sw.y + lift;
      sw.sw.rotation.set(Math.atan(B / sw.r), 0, Math.atan(A / sw.r));
      sw.rotg.rotation.y = ang;
      for (let k = 0; k < 4; k++) {
        const b = R.blades[k];
        const psi = ang + k * TAU / 4;
        const theta = th0 + (A * Math.cos(psi) + B * Math.sin(psi)) * 2.2;
        b.feather.rotation.x = theta * R.dir;
        b.cone.rotation.z = coning;
        // pitch link: from swash rotating ring (hub-local) up to the horn
        const local = b.arm.rotation.y;
        const horn = b.hornLocal.clone();
        // feather rotation about X then cone about Z then arm about Y
        horn.applyAxisAngle(AX, theta * R.dir);
        horn.applyAxisAngle(AZ, coning);
        horn.x += 0.5;
        horn.applyAxisAngle(AY, local);
        const ra = Math.atan2(-horn.z, horn.x);
        const sy = (sw.y + lift - R.y) + 0.09 + (A * Math.cos(psi) + B * Math.sin(psi));
        const bot = new THREE.Vector3(Math.cos(ra) * sw.r * 0.96, sy, -Math.sin(ra) * sw.r * 0.96);
        placeBetween(R.links[k], bot, horn);
      }
      // blur disc
      if (R.bladeMat.transparent !== fading) {
        R.bladeMat.transparent = fading; R.bladeMat.needsUpdate = true;
        R.bladeLEMat.transparent = fading; R.bladeLEMat.needsUpdate = true;
        R.bladeTipMat.transparent = fading; R.bladeTipMat.needsUpdate = true;
      }
      R.bladeMat.opacity = op; R.bladeMat.depthWrite = dw;
      R.bladeLEMat.opacity = op; R.bladeLEMat.depthWrite = dw;
      R.bladeTipMat.opacity = op; R.bladeTipMat.depthWrite = dw;
      R.disc.visible = fading;
      const u = R.disc.material.uniforms;
      u.uAngle.value = ang;
      u.uOtherAngle.value = otherAng;
      u.uConing.value = coning;
      u.uOpacity.value = vis;
      u.uSmear.value = Math.max(0.28, omega * 0.018);
      u.uColor.value.copy(this.M.blade.color).multiplyScalar(1.45).addScalar(0.04);
      u.uLEColor.value.copy(this.M.bladeLE.color).multiplyScalar(1.22);
      R.ring.visible = rpm > 0.25;
      const ru = R.ring.material.uniforms;
      ru.uAngle.value = ang;
      ru.uConing.value = coning;
      ru.uOpacity.value = THREE.MathUtils.smoothstep(rpm, 0.3, 0.95) * 0.62;
      if (accent) ru.uColor.value.copy(accent);
      // 3D helical tip vortices
      if (R.vortexMat) {
        R.vortexMat.uniforms.uOpacity.value = vortexOp;
        R.vortexMat.uniforms.uTime.value = this.time;
        R.vortexMat.uniforms.uConing.value = coning;
        if (accent) R.vortexMat.uniforms.uColor.value.setRGB(0.86, 0.92, 0.98).lerp(accent, 0.20);
        const vShow = vortexOp > 0.015;
        for (const vm of R.vortices) vm.visible = vShow;
      }
    }
    // servos follow swash
    for (const s of this.swashLower.servos) {
      const h = this.swashLower.sw.position.y + (A * Math.cos(s.a) + B * Math.sin(s.a)) * 0.9;
      placeBetween(s.rod, new THREE.Vector3(s.x, s.base - 0.3, s.z), new THREE.Vector3(s.x, h - 0.04, s.z));
    }
    if (this.radar.visible) this.radar.rotation.y += dt * 2.4;
  }
}
