// World: procedural sky dome (stars, aurora, gas giant + rings, clouds, lightning), terrain mesh builder,
// water shader (calm fjord -> storm Gerstner ocean), weather particles, lighting and environment maps.
import * as THREE from 'three';
import { GLSL_NOISE } from '../core/noise.js';
import { makeNoiseTexture } from '../core/textures.js';

export const SKY_DEFAULTS = {
  top: '#0b1830', horizon: '#6a88a8', bottom: '#2a3038', sharp: 0.5,
  sunDir: [0.5, 0.3, -0.6], sunColor: '#ffffff', sunSize: 0.0004, sunGlow: 1,
  stars: 0, aurora: 0, auroraA: '#2bff9a', auroraB: '#8a5cff',
  planet: 0, planetDir: [-0.4, 0.35, -0.8], planetColor: '#d9b38c', planetSize: 0.3, ring: 0,
  sun2: 0, sun2Dir: [0.3, 0.2, 0.8], sun2Color: '#ff7a50',
  clouds: 0, cloudColor: '#ffffff', cloudShadow: '#8090a0', cloudScale: 1, cloudCover: 0.5,
};

const skyVert = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }`;

const skyFrag = /* glsl */`
uniform vec3 uTop,uHorizon,uBottom,uSunDir,uSunColor,uAuroraA,uAuroraB,uPlanetDir,uPlanetColor,uCloudColor,uCloudShadow,uSun2Dir,uSun2Color;
uniform float uSharp,uSunSize,uSunGlow,uStars,uAurora,uPlanet,uPlanetSize,uRing,uClouds,uCloudScale,uCloudCover,uTime,uFlash,uDim,uSun2;
varying vec3 vDir;
${GLSL_NOISE}
float fbm3o(vec2 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+vec2(3.1,1.7); a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h,0.,1.), uSharp));
  col = mix(col, uBottom, smoothstep(0.0, -0.18, h));
  vec3 sdir = normalize(uSunDir);
  float sd = max(dot(d, sdir), 0.);
  // Sunrise / golden-hour atmospheric scattering band (Stratos & Dune low-sun skies)
  if (sdir.y < 0.15 && uPlanet < 0.1 && uAurora < 0.1 && uClouds < 0.3) {
    if (sdir.x > 0.0) {
      // Dune golden-hour: deeper cool slate-blue upper sky grading to brilliant warm golden-amber horizon + diagonal sunbeam shaft
      vec3 coolZenith = mix(vec3(0.36, 0.49, 0.66), vec3(0.19, 0.30, 0.46), smoothstep(0.06, 0.48, max(h, 0.0)));
      vec3 warmGoldHor = mix(vec3(0.95, 0.70, 0.42), vec3(1.0, 0.88, 0.58), pow(sd, 1.35));
      vec3 dCol = mix(warmGoldHor, coolZenith, smoothstep(0.015, 0.32, max(h, 0.0)));
      float shaftLine = (d.x - 0.16) - (h - 0.04) * 0.88;
      float sunRay = exp(-shaftLine * shaftLine * 20.0) * smoothstep(-0.01, 0.10, h) * smoothstep(0.42, 0.10, h) * smoothstep(0.02, 0.15, d.x) * smoothstep(-0.68, -0.88, d.z) * 0.62;
      dCol += vec3(1.0, 0.88, 0.60) * sunRay;
      col = mix(col, dCol, smoothstep(-0.06, 0.04, h));
    } else {
      vec3 goldHor = mix(vec3(0.96, 0.74, 0.52), vec3(1.0, 0.90, 0.68), pow(sd, 1.2));
      vec3 roseBand = mix(vec3(0.84, 0.62, 0.64), vec3(0.98, 0.76, 0.60), pow(sd, 1.3));
      vec3 dawnBlue = mix(vec3(0.32, 0.42, 0.60), vec3(0.18, 0.28, 0.48), smoothstep(0.14, 0.42, max(h, 0.0)));
      vec3 sCol = mix(goldHor, roseBand, smoothstep(0.015, 0.095, max(h, 0.0)));
      sCol = mix(sCol, dawnBlue, smoothstep(0.095, 0.26, max(h, 0.0)));
      col = mix(col, sCol, smoothstep(-0.06, 0.02, h));
    }
  }
  // Eclipse dust-hazed atmosphere: keep upper sky dark slate-charcoal, grade lower horizon into dusty sandstone ochre
  if (uPlanet > 0.1) {
    float upperMask = smoothstep(0.04, 0.34, h);
    vec3 slateSky = mix(vec3(0.18, 0.16, 0.20), vec3(0.07, 0.07, 0.11), smoothstep(0.05, 0.52, max(h, 0.0)));
    float dustHaze = exp(-max(h, 0.0) * 4.4) * (0.76 + 0.24 * fbm3o(d.xz * 2.5));
    vec3 ochreHor = mix(vec3(0.66, 0.46, 0.32), vec3(0.82, 0.58, 0.40), pow(sd, 1.6));
    col = mix(ochreHor, slateSky, upperMask);
    col = mix(col, ochreHor * 1.05, clamp(dustHaze * 0.76, 0.0, 0.84));
  }
  // horizon Mie haze glow toward sun
  float horGlow = exp(-abs(h)*3.2) * pow(sd, 2.4) * 0.34 * uSunGlow;
  col += uSunColor * horGlow;
  // sun + halo
  col += uSunColor * (pow(sd, 5.)*.22 + pow(sd, 36.)*.48 + pow(sd, 480.)*1.2) * uSunGlow;
  if(uSunSize>0.) col += uSunColor * smoothstep(1.-uSunSize, 1.-uSunSize*.55, sd) * 18.;
  if(uSun2>0.){ float s2 = max(dot(d, normalize(uSun2Dir)),0.); col += uSun2Color*(pow(s2,30.)*.3 + smoothstep(1.-.00012,1.-.00006,s2)*12.)*uSun2; }
  // stars
  if(uStars>0.){
    vec3 p = d*320.; vec3 c = floor(p); float r = hash13(c);
    float st = step(.9952, r) * smoothstep(.46, .0, length(fract(p)-.5));
    st *= .65+.35*sin(uTime*(2.+r*7.)+r*40.);
    vec3 p2 = d*140.; vec3 c2 = floor(p2); float r2 = hash13(c2+19.3);
    float st2 = step(.9980, r2) * smoothstep(.38, .0, length(fract(p2)-.5)) * 2.2;
    float mw = pow(max(0., 1.-abs(dot(d, normalize(vec3(.3,.6,.7))))), 5.)*fbm3o(d.xz*5.);
    col += (vec3(.88,.94,1.)*(st+st2)*1.9 + vec3(.38,.52,.72)*mw*.20) * uStars * smoothstep(0.01,.14,h);
  }
  // gas giant with photographic rings
  if(uPlanet>0.){
    vec3 pd = normalize(uPlanetDir);
    float cp = dot(d, pd);
    vec3 ax1 = normalize(cross(pd, vec3(0.,1.,0.))); vec3 ax2 = cross(ax1, pd);
    vec2 q = vec2(dot(d,ax1), dot(d,ax2)) / uPlanetSize;
    float r = length(q);
    // ring plane tilted
    mat2 rot = mat2(.906,-.423,.423,.906); vec2 rq = rot*q; vec2 eq = vec2(rq.x, rq.y/.24);
    float rr = length(eq);
    // Multi-ring structure (C, B, Cassini gap, A, Encke gap)
    float rC = smoothstep(1.18, 1.28, rr) * smoothstep(1.46, 1.42, rr) * 0.32;
    float rB = smoothstep(1.43, 1.48, rr) * smoothstep(1.83, 1.79, rr) * 0.96;
    float rA = smoothstep(1.90, 1.94, rr) * smoothstep(2.34, 2.29, rr) * 0.72;
    float encke = 1.0 - 0.65 * smoothstep(2.14, 2.16, rr) * smoothstep(2.19, 2.17, rr);
    float grooves = 0.62 + 0.24 * sin(rr * 95.0) + 0.14 * sin(rr * 230.0 + 1.4) + 0.12 * sin(rr * 38.0);
    float ringMask = clamp((rC + rB + rA * encke) * grooves, 0.0, 1.0) * uRing;
    // Shadow of planet on back rings
    float pShadow = 1.0;
    if(rq.y > 0.0){
      float shDist = abs(rq.x - 0.22);
      pShadow = smoothstep(0.78, 0.92, shDist);
    }
    vec3 ringTint = mix(uPlanetColor * vec3(1.06, 0.98, 0.90), vec3(0.84, 0.88, 0.94), smoothstep(1.4, 2.2, rr) * 0.5);
    vec3 ringCol = ringTint * ringMask * (0.18 + 0.82 * pShadow);
    float horFade = smoothstep(-0.02, 0.14, h);
    bool ringFront = rq.y < 0.;
    if(cp>0. && r<1.){
      float z = sqrt(max(1.-r*r, 0.));
      vec3 n = normalize(q.x*ax1 + q.y*ax2 + z*(-pd));
      vec3 pSun = normalize(vec3(-0.65, 0.25, 0.72));
      float ndl = dot(n, pSun);
      float lit = smoothstep(-0.28, 0.65, ndl);
      float lat = (rot*q).y;
      float lon = (rot*q).x;
      float warp = fbm3o(vec2(lat*7.5, lon*2.8 + uTime*0.005)) * 0.14;
      float l2 = lat + warp;
      float b1 = 0.5 + 0.5 * sin(l2 * 22.0);
      float b2 = 0.5 + 0.5 * sin(l2 * 54.0 + warp * 11.0);
      float b3 = fbm3o(vec2(l2 * 18.0, lon * 4.5));
      vec3 cLight = vec3(0.96, 0.81, 0.64);
      vec3 cMid = vec3(0.74, 0.52, 0.36);
      vec3 cDark = vec3(0.42, 0.27, 0.19);
      vec3 pc = mix(cMid, cLight, smoothstep(0.22, 0.78, b1));
      pc = mix(pc, cDark, smoothstep(0.50, 0.86, b2) * 0.58 + (1.0 - b3) * 0.26);
      // Atmospheric limb scattering + soft night-side fade into dark slate sky
      float rim = pow(clamp(1.-z, 0., 1.), 2.8);
      vec3 pcol = pc * (lit * 1.08 + 0.06) + vec3(0.92, 0.76, 0.58) * rim * smoothstep(-0.12, 0.60, ndl) * 0.32;
      float planetVis = smoothstep(1., .982, r) * (0.18 + 0.82 * smoothstep(-0.34, 0.28, ndl)) * horFade;
      col = mix(col, pcol * uPlanet, planetVis);
      if(ringFront && cp>0.){
        col = mix(col, ringCol * 1.12, clamp(ringMask * 0.88 * horFade, 0.0, 1.0));
      }
    } else if(cp>0.){
      col = mix(col, ringCol * 1.08, clamp(ringMask * 0.82 * horFade, 0.0, 1.0));
      col += uPlanetColor * .06 * exp(-max(r-1., 0.)*7.) * uPlanet * horFade;
    }
  }
  // vivid aurora borealis curtains: sweeping, arching S-curve ribbons with organic vertical ray bottoms (no rectangular band or hard top cutoff!)
  if(uAurora>0. && h>-0.02){
    float az = atan(d.x, -d.z);
    vec3 aur = vec3(0.);
    for(int i=0;i<4;i++){
      float fi = float(i);
      float macroNoise = fbm3o(vec2(az*1.45 + fi*2.7, uTime*0.022));
      // Large-amplitude sweeping S-curve arch so curtains dip & soar diagonally across the sky instead of forming a flat horizontal bar
      float arch = 0.085 * sin(az*(1.35 + fi*0.35) + fi*1.9)
                 + 0.065 * cos(az*(2.6 + fi*0.55) - fi*1.3 + macroNoise*2.6)
                 + 0.045 * sin(az*(4.4 + fi*0.8) + macroNoise*3.4);
      float ray3 = fbm3o(vec2(az*13.5 + fi*5.0, h*1.8 - uTime*0.04));
      float localJagged = (ray3 - 0.48) * 0.055 + 0.024 * sin(az*19.0 + fi*3.7);
      float baseH = 0.085 + fi*0.048 + arch + localJagged;
      float span = 0.175 + 0.055*sin(az*2.2 - fi*1.4) + 0.035*macroNoise;
      float v = (h - baseH) / max(span, 0.075);
      // Azimuth ribbon envelope with organic gaps so dark starry night sky shows between sweeping curtains
      float azWave = sin(az*(1.45 + fi*0.42) + fi*2.05 + arch*4.2) + 0.45*cos(az*3.1 - fi*1.2);
      float azEnv = smoothstep(-0.42, 0.48, azWave);
      if(v > -0.18 && v < 3.2 && azEnv > 0.005){
        // Smooth bottom & top fadeout so v never clips at a hard boundary
        float topFade = smoothstep(3.1, 1.05, v);
        float vert = smoothstep(-0.14, 0.12, v) * exp(-max(v - 0.08, 0.0) * 1.65) * topFade;
        float ray1 = 0.5 + 0.5 * sin(az*38.0 + fi*9.0 + arch*18.0 + v*1.2 + uTime*0.12);
        float ray2 = 0.5 + 0.5 * sin(az*78.0 - fi*15.0 + arch*24.0 - uTime*0.18);
        float rays = (0.20 + 0.80 * pow(clamp(ray1*0.62 + ray2*0.38, 0.0, 1.0), 2.15)) * (0.42 + 0.68 * ray3);
        float bottomEdge = exp(-pow((v - 0.03) * 9.5, 2.0)) * 0.52 * (0.35 + 0.65 * ray3);
        // Emerald green lower curtain with vivid magenta-violet vertical upper ray accents
        vec3 cBot = vec3(0.06, 1.08, 0.46);
        vec3 cMid = vec3(0.14, 0.90, 0.58);
        vec3 cViolet = vec3(0.72, 0.22, 0.84);
        float violetStreak = smoothstep(0.10, 0.72, sin(az*4.8 + fi*2.4 + arch*8.0)) * smoothstep(0.06, 0.44, v);
        vec3 cAur = mix(cBot, cMid, smoothstep(0.04, 0.34, v));
        cAur = mix(cAur, cViolet, clamp(violetStreak * 0.76 + smoothstep(0.38, 0.88, v) * 0.52, 0.0, 0.88));
        float lum = (vert * rays * 1.28 + bottomEdge * (0.35 + 0.65 * ray1)) * azEnv * (1.0 - fi*0.14);
        aur += cAur * lum;
      }
    }
    aur = aur * uAurora / (1.0 + aur * 0.44);
    float skyGlowG = exp(-pow(clamp((h - 0.16)/0.14, -2.5, 2.5), 2.0));
    float azMod = 0.30 + 0.70 * fbm3o(vec2(az*1.6, h*2.0));
    aur += vec3(0.04, 0.38, 0.22) * skyGlowG * 0.08 * azMod * min(uAurora, 1.6);
    col += aur * smoothstep(0.01, 0.08, h) * (1.0 - smoothstep(0.68, 0.95, h));
  }
  // cloud deck (supports low-horizon churning storm clouds & rain shafts when uClouds > 0.5)
  if(uClouds>0. && h>-0.04){
    float hEff = max(h, 0.0) + mix(0.05, 0.20, smoothstep(0.3, 0.8, uClouds));
    vec2 p = d.xz / hEff * uCloudScale + vec2(uTime*.004, uTime*.0015);
    float n = fbm2(p*1.25);
    float nBillow = billow2(p*2.4 + vec2(1.7, -2.3));
    float nComb = mix(n, n * 0.60 + (1.0 - nBillow) * 0.40, smoothstep(0.4, 0.9, uClouds));
    float cov = smoothstep(1.-uCloudCover-.18, 1.-uCloudCover+.24, nComb);
    float sh = fbm2(p*1.25 + sdir.xz*.09);
    float darkTurbulence = smoothstep(0.4, 0.9, uClouds) * ridged2(p*3.0 - uTime*0.006) * 0.38;
    vec3 cc = mix(uCloudColor, uCloudShadow, clamp((sh-nComb)*4.6 + 0.56 + darkTurbulence, 0., 1.));
    cc += uSunColor*pow(sd,8.)*.32*(1.-cov*.6);
    if (uClouds > 0.6) {
      // Stormy diagonal rain shafts & seamless dark storm-mist horizon transition
      float rainShaft = fbm3o(vec2(d.x * 14.0 + h * 5.5 + uTime * 0.08, d.z * 14.0 - h * 5.5));
      float shaftMask = smoothstep(0.24, 0.0, h) * smoothstep(-0.04, 0.02, h) * (0.4 + 0.6 * rainShaft);
      cc = mix(cc, mix(uCloudShadow, uCloudColor, 0.28), shaftMask * 0.55);
      vec3 horMist = mix(uHorizon, uCloudShadow, 0.52);
      cc = mix(cc, horMist, smoothstep(0.09, -0.01, h) * 0.78);
    }
    float hVis = uClouds > 0.5 ? smoothstep(-0.04, 0.02, h) : smoothstep(0.0, 0.12, h);
    col = mix(col, cc, cov*uClouds*hVis);
  }
  col += uFlash*vec3(.55,.62,.8)*(.4+.8*fbm3o(d.xz*3.+uTime));
  gl_FragColor = vec4(col*uDim, 1.);
}`;

export function makeSkyMaterial() {
  const u = {};
  const v3 = (a) => new THREE.Vector3(...a).normalize();
  for (const k of ['top', 'horizon', 'bottom', 'sunColor', 'auroraA', 'auroraB', 'planetColor', 'cloudColor', 'cloudShadow', 'sun2Color']) u['u' + k[0].toUpperCase() + k.slice(1)] = { value: new THREE.Color() };
  for (const k of ['sunDir', 'planetDir', 'sun2Dir']) u['u' + k[0].toUpperCase() + k.slice(1)] = { value: v3([0, 1, 0]) };
  for (const k of ['sharp', 'sunSize', 'sunGlow', 'stars', 'aurora', 'planet', 'planetSize', 'ring', 'clouds', 'cloudScale', 'cloudCover', 'sun2']) u['u' + k[0].toUpperCase() + k.slice(1)] = { value: 0 };
  u.uTime = { value: 0 }; u.uFlash = { value: 0 }; u.uDim = { value: 1 };
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, depthTest: true });
}

export function setSky(mat, cfg) {
  const c = { ...SKY_DEFAULTS, ...cfg };
  const u = mat.uniforms;
  const cols = { top: 'uTop', horizon: 'uHorizon', bottom: 'uBottom', sunColor: 'uSunColor', auroraA: 'uAuroraA', auroraB: 'uAuroraB', planetColor: 'uPlanetColor', cloudColor: 'uCloudColor', cloudShadow: 'uCloudShadow', sun2Color: 'uSun2Color' };
  for (const k in cols) u[cols[k]].value.set(c[k]);
  u.uSunDir.value.set(...c.sunDir).normalize();
  u.uPlanetDir.value.set(...c.planetDir).normalize();
  u.uSun2Dir.value.set(...c.sun2Dir).normalize();
  u.uSharp.value = c.sharp; u.uSunSize.value = c.sunSize; u.uSunGlow.value = c.sunGlow; u.uStars.value = c.stars;
  u.uAurora.value = c.aurora; u.uPlanet.value = c.planet; u.uPlanetSize.value = c.planetSize; u.uRing.value = c.ring;
  u.uClouds.value = c.clouds; u.uCloudScale.value = c.cloudScale; u.uCloudCover.value = c.cloudCover; u.uSun2.value = c.sun2;
  return c;
}

// ---------------------------------------------------------------- terrain
let NOISE_TEX = null;
export function terrainMesh({ half = 3000, seg = 384, pow = 1.55, height, color, rough = 0.92, metal = 0, bump = 1, envInt = 0.6, flat = false, uvScale = 0.12, detail = null }) {
  NOISE_TEX = NOISE_TEX || makeNoiseTexture(9, 256);
  const n = seg + 1;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), nrm = new Float32Array(n * n * 3);
  // Blended radial coordinate curve: avoids wasting thousands of vertices under the flat helipad (r < 13m)
  // and packs ~2x higher triangle density across the foreground + mid-ground mountain/canyon ring (r = 15..850m)
  const coord = (i) => {
    const t = i / seg * 2 - 1, a = Math.abs(t);
    return Math.sign(t) * (0.11 * a + 0.89 * Math.pow(a, pow)) * half;
  };
  const xs = new Float32Array(n);
  for (let i = 0; i < n; i++) xs[i] = coord(i);
  // Pass 1: evaluate height once per vertex (5x faster CPU world build)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = xs[i], z = xs[j];
    const y = height(x, z);
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    uv[k * 2] = x * uvScale; uv[k * 2 + 1] = z * uvScale;
  }
  // Pass 2: compute normals from neighboring grid heights & evaluate vertex color
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = xs[i], z = xs[j], y = pos[k * 3 + 1];
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
    const dhdx = (pos[(j * n + i1) * 3 + 1] - pos[(j * n + i0) * 3 + 1]) / Math.max(xs[i1] - xs[i0], 0.5);
    const dhdz = (pos[(j1 * n + i) * 3 + 1] - pos[(j0 * n + i) * 3 + 1]) / Math.max(xs[j1] - xs[j0], 0.5);
    const invL = 1 / Math.sqrt(dhdx * dhdx + 1 + dhdz * dhdz);
    const nx = -dhdx * invL, ny = invL, nz = -dhdz * invL;
    nrm[k * 3] = nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nz;
    const c = color(x, z, y, ny);
    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
  }
  const idx = new Uint32Array(seg * seg * 6);
  let ptr = 0;
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx[ptr++] = a; idx[ptr++] = c; idx[ptr++] = b;
    idx[ptr++] = b; idx[ptr++] = c; idx[ptr++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, bumpMap: NOISE_TEX, bumpScale: bump, envMapIntensity: envInt, flatShading: flat });
  if (detail) {
    const mode = Math.round(detail.mode || 1);
    const sunDir = new THREE.Vector3(...(detail.sunDir || [0.5, 0.3, -0.6])).normalize();
    const fogSun = new THREE.Color(detail.fogSun || '#ffffff');
    const fogHigh = new THREE.Color(detail.fogHigh || '#445566');
    const fogH = detail.fogHeight ?? 0.003;
    mat.customProgramCacheKey = () => 'terrain_mode_' + mode;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSunDir = { value: sunDir };
      sh.uniforms.uFogSun = { value: fogSun };
      sh.uniforms.uFogHigh = { value: fogHigh };
      sh.uniforms.uFogH = { value: fogH };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n#define T_MODE ${mode}\nvarying vec3 vWP;\nvarying vec3 vWN;\nuniform float uFogH;\nuniform vec3 uSunDir, uFogSun, uFogHigh;\n${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float distC = length(cameraPosition - vWP);
          float nearF = smoothstep(260., 12., distC);
          float midF = smoothstep(2600., 80., distC);
          vec3 wn = normalize(vWN);
          #if T_MODE == 1
            // BOREALIS: High-detail alpine rock massifs with distance LOD - triplanar slate/granite rock, incised couloirs & snow on gentle slopes/ledges
            vec3 tw = pow(abs(wn), vec3(4.0));
            tw /= max(tw.x + tw.y + tw.z, 1e-4);
            vec2 triX = vec2(vWP.z + vWP.y * 0.35, vWP.y);
            vec2 triZ = vec2(vWP.x - vWP.y * 0.35, vWP.y);
            float rStrata = ridged2(triX * vec2(0.038, 0.062)) * tw.x
                          + ridged2(vWP.xz * 0.042) * tw.y
                          + ridged2(triZ * vec2(0.038, 0.062)) * tw.z;
            float rCrags = 0.5;
            float rFine  = 0.5;
            if (distC < 950.0) {
              rCrags = ridged2(triX * vec2(0.12, 0.18)) * tw.x
                     + ridged2(vWP.xz * 0.13) * tw.y
                     + ridged2(triZ * vec2(0.12, 0.18)) * tw.z;
              if (distC < 480.0) {
                rFine = fbm2_3(triX * 0.36) * tw.x
                      + fbm2_3(vWP.xz * 0.36) * tw.y
                      + fbm2_3(triZ * 0.36) * tw.z;
              }
            }
            // Steep diagonal/vertical alpine couloir gullies & arete ribs (predominantly dark rock above y=15m, snow in couloirs)
            float couloirSweep = fbm2_3(vec2(vWP.x * 0.018 - vWP.z * 0.015, vWP.y * 0.008));
            float couloirChan = ridged2(vec2((vWP.x - vWP.z * 0.65) * 0.032 + couloirSweep * 0.85, vWP.y * 0.012));
            float mtnAlt = smoothstep(10.5, 23.0, vWP.y);
            float couloirSnow = smoothstep(0.50, 0.76, couloirChan * 0.62 + rCrags * 0.38);
            float areteRibSnow = smoothstep(0.54, 0.80, rStrata * 0.55 + clamp(-wn.x * 0.75 + wn.y * 0.28, 0.0, 1.0) * 0.45);
            float benchSnow = smoothstep(38.0, 16.0, vWP.y) * smoothstep(0.76, 0.92, wn.y);
            float mtnSnowMask = clamp(max(couloirSnow * 0.86, areteRibSnow * 0.68) + benchSnow, 0.0, 0.90);
            float rockMask    = (1.0 - mtnSnowMask) * mtnAlt;
            vec3 darkRock  = vec3(0.020, 0.034, 0.056);
            vec3 midRock   = vec3(0.068, 0.108, 0.158);
            vec3 lightRock = vec3(0.15, 0.22, 0.31);
            vec3 rockCol = mix(darkRock, midRock, clamp(rStrata * 0.55 + rCrags * 0.45, 0.0, 1.0));
            rockCol = mix(rockCol, lightRock, smoothstep(0.48, 0.84, rCrags * 0.6 + rFine * 0.4) * 0.50);
            float rockCrevice = smoothstep(0.36, 0.08, rStrata) * 0.42 + smoothstep(0.34, 0.06, rCrags) * 0.30;
            rockCol *= 1.0 - rockCrevice;
            float softShade = clamp(wn.y * 0.56 + 0.44 + (rFine - 0.5) * 0.16, 0.0, 1.0);
            vec3 snowShadow = vec3(0.36, 0.48, 0.62);
            vec3 snowLit    = vec3(0.76, 0.86, 0.95);
            vec3 moonSnow   = mix(snowShadow, snowLit, smoothstep(0.20, 0.88, softShade));
            diffuseColor.rgb = mix(moonSnow, rockCol, clamp(rockMask * 0.96, 0.0, 0.96));
            float shoreFrost = smoothstep(-0.4, 2.2, vWP.y);
            diffuseColor.rgb = mix(vec3(0.06, 0.12, 0.18), diffuseColor.rgb, shoreFrost);
            if (wn.y > 0.62 && distC < 190.0) {
              float sDrift = fbm2_3(vWP.xz * 0.18) * 0.55 + fbm2_3(vWP.xz * 0.65) * 0.45;
              float crustGrain = (vnoise(vWP.xz * 4.5) - 0.5) * 0.10 * nearF;
              diffuseColor.rgb *= 0.92 + 0.15 * sDrift + crustGrain;
              vec2 pxz = vWP.xz;
              float tParam = clamp(dot(pxz - vec2(-36., -13.), vec2(24., 9.)) / 657., 0., 1.);
              vec2 curve1 = mix(vec2(-36., -13.), vec2(-12., -4.), tParam) + vec2(0., sin(tParam * 3.14159) * 2.2);
              float d1 = abs(length(pxz - curve1) - 0.78);
              float tP2 = clamp(dot(pxz - vec2(-12., -4.), vec2(-8., 30.)) / 964., 0., 1.);
              vec2 curve2 = mix(vec2(-12., -4.), vec2(-20., 26.), tP2) + vec2(sin(tP2 * 3.14159) * 2.4, 0.);
              float d2 = abs(length(pxz - curve2) - 0.78);
              float tP3 = clamp(dot(pxz - vec2(-33., -11.), vec2(10., 33.)) / 1189., 0., 1.);
              vec2 curve3 = mix(vec2(-33., -11.), vec2(-23., 22.), tP3) + vec2(sin(tP3 * 3.14159) * 3.8, 0.);
              float d3 = abs(length(pxz - curve3) - 0.75);
              float trk = (smoothstep(0.38, 0.06, d1) + smoothstep(0.38, 0.06, d2) + smoothstep(0.36, 0.06, d3) * 0.85) * smoothstep(13.4, 15.2, length(pxz));
              float trkRim = (smoothstep(0.58, 0.36, d1) * smoothstep(0.18, 0.36, d1) + smoothstep(0.58, 0.36, d2) * smoothstep(0.18, 0.36, d2)) * smoothstep(13.4, 15.2, length(pxz));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.28, 0.40), clamp(trk * 0.72, 0.0, 0.76));
              diffuseColor.rgb += vec3(0.11, 0.16, 0.20) * trkRim * 0.58;
            }
          #elif T_MODE == 2
            // DUNE: Strong golden-hour contrast (warm golden-amber key vs deep bronze-umber leeward shadows) & crisp 3D wind ripples
            vec3 vRay = normalize(cameraPosition - vWP);
            float rPadD = length(vWP.xz);
            float grazeFade = smoothstep(0.05, 0.20, abs(dot(vRay, wn))) * smoothstep(140.0, 14.0, distC);
            if (grazeFade > 0.005) {
              float warp = fbm2_3(vWP.xz * 0.22) * 2.2 + vnoise(vWP.xz * 0.75) * 0.45;
              float uRip = (vWP.x * 2.2 + vWP.z * 1.10 + warp) * 3.0;
              float rip = (sin(uRip) + 0.38 * sin(uRip * 2.0 - 0.65)) * 0.5;
              float ripMask = grazeFade * smoothstep(0.45, 0.84, wn.y) * smoothstep(13.1, 14.8, rPadD);
              vec3 warmCrest = vec3(1.16, 0.84, 0.44);
              vec3 coolTrough = vec3(0.38, 0.24, 0.15);
              float ripMix = clamp(0.5 + rip * 0.84, 0.0, 1.0);
              vec3 ripTint = mix(coolTrough, warmCrest, ripMix);
              diffuseColor.rgb = mix(diffuseColor.rgb, ripTint, ripMask * 0.52);
              float grain = (hash12(floor(vWP.xz * 26.0)) - 0.5) * grazeFade * 0.045;
              diffuseColor.rgb += grain;
            }
            if (distC < 185.0) {
              float medRip = sin(vWP.x * 1.35 + vWP.z * 0.68 + fbm2_3(vWP.xz * 0.07) * 3.6) * smoothstep(180.0, 25.0, distC) * smoothstep(0.44, 0.86, wn.y);
              diffuseColor.rgb *= 1.0 + medRip * 0.10;
            }
            // Note: on flat ground wn=(0,1,0), dot(wn, uSunDir) = uSunDir.y ~ 0.146.
            // Darken only leeward slip-faces tilted away from the sun (sunFace < 0.10, rPadD > 24m) while warming lit slopes & apron!
            float sunFace = dot(wn, uSunDir);
            vec3 deepShadowTint = vec3(0.15, 0.11, 0.14);
            vec3 goldWarmTint   = vec3(1.15, 0.80, 0.38);
            float leeShadowMask = smoothstep(0.11, -0.26, sunFace) * smoothstep(22.0, 38.0, rPadD);
            diffuseColor.rgb = mix(diffuseColor.rgb, deepShadowTint, leeShadowMask * 0.72);
            diffuseColor.rgb = mix(diffuseColor.rgb, goldWarmTint, smoothstep(0.08, 0.55, sunFace) * 0.44);
          #elif T_MODE == 3
            // ECLIPSE: Eroded sandstone/basalt mesas with FINER horizontal sedimentary strata, vertical gullies & smooth valley regolith
            vec2 triCoord = abs(wn.x) > abs(wn.z) ? vWP.zy : vWP.xy;
            float stratWarp = fbm2_3(vWP.xz * 0.014) * 3.4 + (ridged2(vWP.xz * 0.042) - 0.5) * 1.6;
            float yS = vWP.y + stratWarp;
            float bedA = fbm2_3(vec2(yS * 0.55, vWP.x * 0.006 - vWP.z * 0.005));
            float bedB = fbm2_3(vec2(yS * 1.45 + 3.7, vWP.z * 0.010));
            float ledgeStep = smoothstep(0.28, 0.72, fract(yS * 0.38 + bedA * 0.42));
            float fineBed = 0.5 + 0.5 * sin(yS * 2.85 + bedA * 3.6 + bedB * 2.2);
            float microStrata = 0.5 + 0.5 * sin(yS * 6.4 + bedB * 3.0);
            float hStrata = bedA * 0.30 + bedB * 0.24 + ledgeStep * 0.20 + fineBed * 0.16 + microStrata * 0.10;
            float vButtress = ridged2(vec2(triCoord.x * 0.058, vWP.y * 0.018) + vWP.xz * 0.010);
            float vGully = ridged2(vec2(triCoord.x * 0.14, vWP.y * 0.036) + vWP.xz * 0.018);
            float fineCrag = distC < 950.0 ? ridged2(vec2(triCoord.x * 0.34, vWP.y * 0.14) + vWP.xz * 0.055) : 0.5;
            float microGrain = distC < 550.0 ? fbm2_3(triCoord * 0.75) : 0.5;
            float slope = smoothstep(0.86, 0.36, wn.y) * smoothstep(2.5, 13.0, vWP.y);
            vec3 darkBasalt  = vec3(0.18, 0.11, 0.08);
            vec3 midSand     = vec3(0.49, 0.32, 0.20);
            vec3 lightStrata = vec3(0.71, 0.50, 0.33);
            vec3 warmBuff    = vec3(0.80, 0.59, 0.41);
            vec3 cliffCol = mix(darkBasalt, midSand, clamp(hStrata * 0.68 + vGully * 0.32, 0.0, 1.0));
            cliffCol = mix(cliffCol, lightStrata, smoothstep(0.42, 0.76, hStrata) * (0.40 + 0.60 * fineCrag));
            cliffCol = mix(cliffCol, warmBuff, smoothstep(0.60, 0.86, ledgeStep * fineCrag) * 0.42);
            float creviceAO = smoothstep(0.38, 0.10, vGully) * 0.38
                            + smoothstep(0.32, 0.08, vButtress) * 0.26
                            + smoothstep(0.24, 0.04, fineBed) * 0.22
                            + smoothstep(0.20, 0.02, microStrata) * 0.14;
            cliffCol *= 1.0 - creviceAO;
            cliffCol *= 0.88 + 0.24 * microGrain;
            diffuseColor.rgb = mix(diffuseColor.rgb, cliffCol, slope * 0.96);
            float screeApron = smoothstep(24.0, 3.0, vWP.y) * smoothstep(0.92, 0.45, wn.y);
            vec3 screeCol = mix(vec3(0.44, 0.28, 0.18), vec3(0.66, 0.45, 0.30), fbm2_3(vWP.xz * 0.18));
            diffuseColor.rgb = mix(diffuseColor.rgb, screeCol, screeApron * 0.72);
            if (distC < 260.0 && wn.y > 0.68) {
              float sandPatch = fbm2_3(vWP.xz * 0.12);
              float medPatch = fbm2_3(vWP.xz * 0.38);
              float sRip = 0.5 + 0.5 * sin((vWP.x * 1.4 + vWP.z * 0.7 + sandPatch * 2.2) * 2.4);
              float darkPebbles = smoothstep(0.74, 0.90, vnoise(vWP.xz * 4.6)) * 0.55 + smoothstep(0.78, 0.92, vnoise(vWP.xz * 11.5)) * 0.45;
              vec3 regCol = mix(vec3(0.54, 0.35, 0.22), vec3(0.70, 0.48, 0.32), clamp(sandPatch * 0.65 + medPatch * 0.25 + sRip * 0.10 * nearF, 0.0, 1.0));
              regCol = mix(regCol, vec3(0.22, 0.14, 0.10), clamp(darkPebbles * 0.42 * nearF, 0.0, 0.50));
              diffuseColor.rgb = mix(diffuseColor.rgb, regCol, smoothstep(0.68, 0.88, wn.y) * smoothstep(260.0, 35.0, distC));
            }
          #else
            // STRATOS: Weathered summit rock/snow plateau near pad + dark chiseled distant (>= 850m) granite peaks with snow couloirs
            float rPad = length(vWP.xz);
            if (rPad < 68.0) {
              float gTex = ridged2(vWP.xz * 0.65) * 0.60 + fbm2_3(vWP.xz * 2.2) * 0.40;
              vec3 granCol = mix(vec3(0.16, 0.15, 0.16), vec3(0.44, 0.39, 0.35), clamp(gTex, 0.0, 1.0));
              float nSnow = fbm2_3(vWP.xz * 0.25) * 0.65 + vnoise(vWP.xz * 1.6) * 0.35;
              // stratos_wide foreground (+x side) has crisp wind-carved snow; stratos_hero rim (-x/-z side) shows weathered summit rock & gravel
              float wideForegroundSnow = smoothstep(0.5, 8.5, vWP.x + vWP.z * 0.28);
              float leftWideRimSnow = smoothstep(-6.0, 3.0, vWP.x) * smoothstep(1.5, 10.0, vWP.z);
              float baseSnowCov = max(wideForegroundSnow, leftWideRimSnow * 0.88);
              float snowPatch = smoothstep(0.30, 0.54, baseSnowCov + (nSnow - 0.46) * 0.34) * smoothstep(13.1, 13.7, rPad);
              float sasWarp = fbm2_3(vWP.xz * 0.36) * 2.8 + vnoise(vWP.xz * 1.4) * 0.6;
              float sas1 = sin(vWP.x * 1.65 - vWP.z * 0.95 + sasWarp) * 0.5 + 0.5;
              float sas2 = sin(vWP.x * 4.2 - vWP.z * 2.4 + sasWarp * 1.8) * 0.5 + 0.5;
              float microSparkle = (vnoise(vWP.xz * 12.0) - 0.5) * 0.12;
              vec3 snowShadow = vec3(0.56, 0.65, 0.80);
              vec3 snowLit = vec3(1.00, 0.95, 0.88);
              vec3 snowCol = mix(snowShadow, snowLit, clamp(0.36 + 0.46 * sas1 + 0.18 * sas2 + microSparkle, 0.0, 1.0));
              diffuseColor.rgb = mix(granCol, snowCol, clamp(snowPatch, 0.0, 1.0));
            } else if (vWP.y > -52.0) {
              // Distant peaks poking above the cloud sea: dark chiseled Himalayan granite cliff faces with sharp snow couloirs
              vec3 twS = pow(abs(wn), vec3(4.0));
              twS /= max(twS.x + twS.y + twS.z, 1e-4);
              vec2 triX = vec2(vWP.z + vWP.y * 0.35, vWP.y);
              vec2 triZ = vec2(vWP.x - vWP.y * 0.35, vWP.y);
              float rCouloir = ridged2(triX * vec2(0.038, 0.024)) * twS.x
                             + ridged2(vWP.xz * 0.038) * twS.y
                             + ridged2(triZ * vec2(0.038, 0.024)) * twS.z;
              float rCrag    = ridged2(triX * vec2(0.11, 0.070)) * twS.x
                             + ridged2(vWP.xz * 0.11) * twS.y
                             + ridged2(triZ * vec2(0.11, 0.070)) * twS.z;
              float rFineS   = fbm2_3(triX * 0.28) * twS.x + fbm2_3(triZ * 0.28) * twS.z;
              float gullySweep = fbm2_3(vec2(vWP.x * 0.015 + vWP.z * 0.015, vWP.y * 0.008));
              float gullyChan = ridged2(vec2((vWP.x - vWP.z * 0.8) * 0.034 + gullySweep * 0.9, vWP.y * 0.014));
              // Restrict snow to narrow incised couloir gullies and sharp windward arete ribs so dark granite cliff faces dominate!
              float couloirMask = smoothstep(0.54, 0.78, gullyChan * 0.65 + rCouloir * 0.35);
              float ridgeSnow   = smoothstep(0.66, 0.86, rCrag * 0.60 + wn.y * 0.40) * smoothstep(-22.0, 35.0, vWP.y);
              float snowGully   = clamp(max(couloirMask * 0.82, ridgeSnow * 0.58), 0.0, 0.85) * smoothstep(-37.0, -18.0, vWP.y);
              vec3 gDark  = vec3(0.022, 0.020, 0.026);
              vec3 gMid   = vec3(0.075, 0.064, 0.060);
              vec3 gLight = vec3(0.15, 0.12, 0.10);
              vec3 peakRock = mix(gDark, gMid, clamp(rCrag * 0.60 + rCouloir * 0.40, 0.0, 1.0));
              peakRock = mix(peakRock, gLight, smoothstep(0.50, 0.85, rFineS) * 0.45);
              float creviceS = smoothstep(0.36, 0.08, rCouloir) * 0.46 + smoothstep(0.32, 0.06, rCrag) * 0.34;
              peakRock *= 1.0 - creviceS;
              float sunLitS = clamp(dot(wn, uSunDir) * 0.55 + 0.45, 0.0, 1.0);
              vec3 peakSnow = mix(vec3(0.50, 0.56, 0.70), vec3(0.98, 0.88, 0.74), smoothstep(0.22, 0.78, sunLitS));
              diffuseColor.rgb = mix(peakRock, peakSnow, snowGully);
            }
          #endif
          `)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          #if T_MODE == 4
            roughnessFactor = length(vWP.xz) < 68.0 ? 0.82 : 0.96;
          #endif
        `)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            float bumpKeep = smoothstep(0.32, 0.75, wn.y);
            #if T_MODE == 3
              bumpKeep *= mix(1.0, 0.18, smoothstep(0.70, 0.90, wn.y));
            #elif T_MODE == 4
              if (length(vWP.xz) >= 68.0) bumpKeep = 0.15;
            #endif
            normal = normalize(mix(normalize(vNormal), normal, bumpKeep));
            if (midF > 0.02) {
              vec2 pUV = vWP.xz;
              float eN = 0.20;
              float h0 = 0.0, hx = 0.0, hz = 0.0;
              float str = 0.0;
              #if T_MODE == 1
                vec2 triUV = abs(wn.x) > abs(wn.z) ? vec2(vWP.z + vWP.y * 0.35, vWP.y) : vec2(vWP.x - vWP.y * 0.35, vWP.y);
                vec2 cUV = mix(triUV * 0.13, pUV * 0.22, smoothstep(0.48, 0.82, wn.y));
                if (distC < 420.0) {
                  h0 = ridged2(cUV) * 0.62 + ridged2(cUV * 2.9) * 0.38;
                  hx = ridged2(cUV + vec2(eN * 0.12, 0.)) * 0.62 + ridged2((cUV + vec2(eN * 0.12, 0.)) * 2.9) * 0.38;
                  hz = ridged2(cUV + vec2(0., eN * 0.12)) * 0.62 + ridged2((cUV + vec2(0., eN * 0.12)) * 2.9) * 0.38;
                } else {
                  h0 = ridged2(cUV);
                  hx = ridged2(cUV + vec2(eN * 0.12, 0.));
                  hz = ridged2(cUV + vec2(0., eN * 0.12));
                }
                str = mix(2.25, 0.42, smoothstep(0.48, 0.84, wn.y)) * midF;
              #elif T_MODE == 2
                vec3 vRay = normalize(cameraPosition - vWP);
                float gFade = smoothstep(0.05, 0.20, abs(dot(vRay, wn))) * smoothstep(82.0, 12.0, distC);
                if (gFade > 0.01) {
                  float w0 = fbm2_3(pUV * 0.22) * 2.2 + vnoise(pUV * 0.75) * 0.45;
                  float u0 = (pUV.x * 2.2 + pUV.y * 1.10 + w0) * 3.0;
                  float ux = ((pUV.x + 0.04) * 2.2 + pUV.y * 1.10 + w0) * 3.0;
                  float uz = (pUV.x * 2.2 + (pUV.y + 0.04) * 1.10 + w0) * 3.0;
                  h0 = sin(u0) + 0.38 * sin(u0 * 2.0 - 0.65);
                  hx = sin(ux) + 0.38 * sin(ux * 2.0 - 0.65);
                  hz = sin(uz) + 0.38 * sin(uz * 2.0 - 0.65);
                  str = 0.96 * gFade * smoothstep(0.44, 0.86, wn.y) * smoothstep(13.1, 14.8, length(pUV));
                }
              #elif T_MODE == 3
                vec3 vRayE = normalize(cameraPosition - vWP);
                float gFadeE = smoothstep(0.10, 0.32, abs(dot(vRayE, wn)));
                vec2 triE = abs(wn.x) > abs(wn.z) ? vWP.zy : vWP.xy;
                float flatBlend = smoothstep(0.45, 0.82, wn.y);
                vec2 eUV = mix(triE * vec2(0.12, 0.055), pUV * 0.14, flatBlend);
                float yWarpN = vWP.y + fbm2_3(pUV * 0.014) * 3.4;
                float stratH0 = (fbm2_3(vec2(yWarpN * 0.65, pUV.x * 0.01)) * 0.55 + sin(yWarpN * 2.85) * 0.45) * (1.0 - flatBlend);
                float stratHz = (fbm2_3(vec2((yWarpN + eN * 0.45) * 0.65, pUV.x * 0.01)) * 0.55 + sin((yWarpN + eN * 0.45) * 2.85) * 0.45) * (1.0 - flatBlend);
                if (distC < 460.0) {
                  h0 = ridged2(eUV) + 0.38 * ridged2(eUV * 2.8) + stratH0;
                  hx = ridged2(eUV + vec2(eN * 0.11, 0.)) + 0.38 * ridged2((eUV + vec2(eN * 0.11, 0.)) * 2.8) + stratH0;
                  hz = ridged2(eUV + vec2(0., eN * 0.11)) + 0.38 * ridged2((eUV + vec2(0., eN * 0.11)) * 2.8) + stratHz;
                } else {
                  h0 = ridged2(eUV) + stratH0;
                  hx = ridged2(eUV + vec2(eN * 0.11, 0.)) + stratH0;
                  hz = ridged2(eUV + vec2(0., eN * 0.11)) + stratHz;
                }
                str = mix(2.25, 0.28 * gFadeE, flatBlend) * midF;
              #else
                if (length(pUV) < 68.0) {
                  float wS = fbm2_3(pUV * 0.36) * 2.8;
                  float u0 = pUV.x * 1.65 - pUV.y * 0.95 + wS;
                  float ux = (pUV.x + 0.05) * 1.65 - pUV.y * 0.95 + wS;
                  float uz = pUV.x * 1.65 - (pUV.y + 0.05) * 0.95 + wS;
                  float g0 = vnoise(pUV * 6.5) * 0.35 + ridged2(pUV * 1.2) * 0.45;
                  float gx = vnoise((pUV + vec2(0.05, 0.)) * 6.5) * 0.35 + ridged2((pUV + vec2(0.05, 0.)) * 1.2) * 0.45;
                  float gz = vnoise((pUV + vec2(0., 0.05)) * 6.5) * 0.35 + ridged2((pUV + vec2(0., 0.05)) * 1.2) * 0.45;
                  h0 = sin(u0) * 0.55 + sin(u0 * 2.6) * 0.25 + g0;
                  hx = sin(ux) * 0.55 + sin(ux * 2.6) * 0.25 + gx;
                  hz = sin(uz) * 0.55 + sin(uz * 2.6) * 0.25 + gz;
                  str = 1.38 * nearF;
                } else if (vWP.y > -52.0) {
                  vec3 vRayS = normalize(cameraPosition - vWP);
                  float gFadeS = smoothstep(0.10, 0.34, abs(dot(vRayS, wn)));
                  vec2 triS = abs(wn.x) > abs(wn.z) ? vWP.zy : vWP.xy;
                  vec2 sUV = mix(triS * vec2(0.095, 0.055), pUV * 0.075, smoothstep(0.45, 0.82, wn.y));
                  h0 = ridged2(sUV);
                  hx = ridged2(sUV + vec2(eN * 0.12, 0.));
                  hz = ridged2(sUV + vec2(0., eN * 0.12));
                  str = 1.85 * smoothstep(2000.0, 200.0, distC) * gFadeS;
                }
              #endif
              vec3 dN = clamp(vec3((h0 - hx) * str, 0.0, (h0 - hz) * str), vec3(-0.62), vec3(0.62));
              normal = normalize(normal + (viewMatrix * vec4(dN, 0.0)).xyz);
            }
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          #if T_MODE == 1
            float skyUp = clamp(wn.y * 0.60 + 0.40, 0.0, 1.0);
            float ridgeRim = smoothstep(-0.35, 0.65, dot(wn, normalize(vec3(-0.25, 0.55, 0.65))));
            float snowWeight = smoothstep(0.16, 0.52, diffuseColor.b);
            vec3 moonAmbient = mix(vec3(0.04, 0.08, 0.13), vec3(0.12, 0.21, 0.29), skyUp * 0.65 + ridgeRim * 0.35);
            totalEmissiveRadiance += diffuseColor.rgb * moonAmbient * (0.30 + 0.70 * snowWeight);
          #elif T_MODE == 2
            float shFill = smoothstep(0.38, -0.20, dot(wn, uSunDir));
            totalEmissiveRadiance += diffuseColor.rgb * vec3(0.03, 0.05, 0.10) * shFill;
          #elif T_MODE == 3
            float shFillE = smoothstep(0.40, -0.20, dot(wn, uSunDir));
            totalEmissiveRadiance += diffuseColor.rgb * vec3(0.14, 0.09, 0.06) * shFillE;
          #else
            if (length(vWP.xz) < 68.0) {
              float coolFill = smoothstep(0.5, 0.0, max(dot(wn, uSunDir), 0.0));
              totalEmissiveRadiance += diffuseColor.rgb * vec3(0.12, 0.17, 0.28) * coolFill;
            } else if (vWP.y > -52.0) {
              float snowMaskE = smoothstep(0.32, 0.68, diffuseColor.b);
              float sunRim = pow(clamp(dot(wn, uSunDir) * 0.58 + 0.42, 0.0, 1.0), 2.6);
              totalEmissiveRadiance += diffuseColor.rgb * vec3(0.18, 0.12, 0.06) * sunRim * snowMaskE * smoothstep(-34.0, 45.0, vWP.y);
            }
          #endif
        `)
        .replace('#include <fog_fragment>', `
          #ifdef USE_FOG
            vec3 vDirW = normalize(vWP - cameraPosition);
            float sCos = max(dot(vDirW, uSunDir), 0.0);
            float hFactor = exp(-max(vWP.y, -150.0) * uFogH);
            float effDensity = fogDensity * clamp(hFactor, 0.25, 2.4);
            float fFac = 1.0 - exp(-effDensity * effDensity * vFogDepth * vFogDepth);
            #if T_MODE == 1
              float valleyMist = exp(-max(vWP.y - 3.5, 0.0) * 0.022) * smoothstep(28.0, 220.0, vFogDepth) * 0.50;
              float rangeMist  = smoothstep(160.0, 620.0, vFogDepth) * exp(-max(vWP.y - 26.0, 0.0) * 0.020) * 0.36;
              fFac = clamp(fFac * 0.75 + valleyMist + rangeMist, 0.0, 0.78);
            #elif T_MODE == 2
              // Keep foreground/mid-ground dunes high-contrast; confine warm dust haze to low distant dune troughs
              float spindrift = 0.65 + 0.35 * fbm2_3(vWP.xz * 0.018 + vec2(1.4, -0.8));
              float duneDust = exp(-max(vWP.y - 5.0, 0.0) * 0.036) * smoothstep(65.0, 310.0, vFogDepth) * 0.38 * spindrift;
              fFac = clamp(fFac * 0.58 + duneDust, 0.0, 0.70);
            #elif T_MODE == 3
              float dustWave = 0.68 + 0.32 * fbm2_3(vWP.xz * 0.014);
              float canyonDust = exp(-max(vWP.y - 9.0, 0.0) * 0.017) * smoothstep(20.0, 240.0, vFogDepth) * 0.72 * dustWave;
              fFac = clamp(fFac + canyonDust, 0.0, 0.92);
            #else
              if (vFogDepth > 180.0) {
                // Confine cloud-top mist strictly to the peak bases where they enter the cloud deck (y ~ -38..-30m)
                // so the upper dark granite cliff faces (y > -30m) remain crisp and high-contrast against the sunrise sky!
                float cloudRimMist = smoothstep(-29.0, -39.0, vWP.y) * (0.60 + 0.40 * fbm2_3(vWP.xz * 0.012));
                float peakHaze = smoothstep(750.0, 2600.0, vFogDepth) * 0.10;
                fFac = clamp(peakHaze + cloudRimMist * 0.55, 0.0, 0.65);
              }
            #endif
            fFac = clamp(fFac, 0.0, 1.0);
            vec3 fCol = mix(fogColor, uFogHigh, smoothstep(0.0, 240.0, max(vWP.y, 0.0)) * 0.58);
            fCol = mix(fCol, uFogSun, pow(sCos, 2.2) * 0.68);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fCol, fFac);
          #endif
        `);
    };
  }
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.userData.ground = true;
  return m;
}

// ---------------------------------------------------------------- water
export function waterMesh({ half = 5000, seg = 280, y = 0, deep = '#020a12', shallow = '#0a2a30', sky = '#1a3040', horizon = '#3a5060', amp = 0, chop = 0, freq = 1, foam = 0, aurora = 0, sunDir = [0.5, 0.3, -0.6], sunColor = '#ffffff', spec = 1, detail = 1 }) {
  const g = new THREE.PlaneGeometry(half * 2, half * 2, seg, seg);
  g.rotateX(-Math.PI / 2);
  // densify centre so waves around the rig (r < 120m) have fine vertex resolution
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / half, z = p.getZ(i) / half;
    p.setX(i, Math.sign(x) * Math.pow(Math.abs(x), 1.88) * half);
    p.setZ(i, Math.sign(z) * Math.pow(Math.abs(z), 1.88) * half);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) },
      uSky: { value: new THREE.Color(sky) }, uHorizon: { value: new THREE.Color(horizon) }, uAmp: { value: amp }, uChop: { value: chop },
      uFreq: { value: freq }, uFoam: { value: foam }, uAurora: { value: aurora }, uSunDir: { value: new THREE.Vector3(...sunDir).normalize() }, uSunColor: { value: new THREE.Color(sunColor) },
      uSpec: { value: spec }, uDetail: { value: detail }, uFlash: { value: 0 }, uDim: { value: 1 },
    }]),
    vertexShader: /* glsl */`
      uniform float uTime,uAmp,uChop,uFreq;
      varying vec3 vW; varying vec3 vN; varying float vH; varying float vCrest;
      #include <fog_pars_vertex>
      ${GLSL_NOISE}
      vec3 gerst(vec2 dir, float wl, float st, vec3 p, float phaseWarp, inout vec3 tan, inout vec3 bin, inout float jac){
        float k = 6.2831853/wl; float c = sqrt(9.8/k); vec2 d = normalize(dir);
        float f = k*(dot(d,p.xz) - c*uTime) + phaseWarp;
        // Clamp horizontal pinch steepness stP so waves never self-intersect or invert normals
        float stP = min(st, 0.085);
        float stN = min(st, 0.14);
        float aH = stP / k;
        float aV = (st * 0.72) / k;
        tan += vec3(-d.x*d.x*stP*sin(f), d.x*stN*cos(f), -d.x*d.y*stP*sin(f));
        bin += vec3(-d.x*d.y*stP*sin(f), d.y*stN*cos(f), -d.y*d.y*stP*sin(f));
        jac += stN * (0.60 * sin(f) + 0.40 * cos(f));
        return vec3(d.x*aH*cos(f), aV*sin(f), d.y*aH*cos(f));
      }
      void main(){
        vec4 wp = modelMatrix*vec4(position,1.);
        vec3 p = wp.xyz; vec3 tan = vec3(1.,0.,0.), bin = vec3(0.,0.,1.);
        vec3 off = vec3(0.);
        float jac = 0.;
        if(uAmp>0.){
          float s = uAmp;
          // Well-resolved North Atlantic storm swells (wavelengths >= 22m prevent vertex aliasing spikes!)
          float pw1 = (fbm2_3(p.xz * 0.012) - 0.5) * 1.6;
          float pw2 = (fbm2_3(p.xz * 0.024 + 4.1) - 0.5) * 1.4;
          off += gerst(vec2(1.,.34), 88./uFreq, .15*s, p, pw1, tan, bin, jac);
          off += gerst(vec2(.55,1.), 56./uFreq, .14*s, p, pw2, tan, bin, jac);
          off += gerst(vec2(-.52,1.), 36./uFreq, .13*s, p, pw1*0.8, tan, bin, jac);
          off += gerst(vec2(1.,-.68), 24./uFreq, .11*s, p, pw2*0.7, tan, bin, jac);
        }
        p += off;
        vH = off.y;
        vCrest = jac;
        vN = normalize(cross(bin, tan));
        vW = p;
        vec4 mvPosition = viewMatrix*vec4(p,1.);
        gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uDeep,uShallow,uSky,uHorizon,uSunDir,uSunColor; uniform float uTime,uFoam,uAurora,uSpec,uDetail,uAmp,uFlash,uDim;
      varying vec3 vW; varying vec3 vN; varying float vH; varying float vCrest;
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      void main(){
        float dist = length(cameraPosition - vW);
        float dFade = smoothstep(2200., 60., dist);
        vec2 q = vW.xz*.16;
        float e = .10;
        float n0 = 0.5;
        vec3 n = normalize(vN);
        if (dFade > 0.01) {
          n0 = fbm2_3(q + uTime*.22) + .40*ridged2(q*2.2 - uTime*.28);
          float nx = fbm2_3(q+vec2(e,0.) + uTime*.22) + .40*ridged2((q+vec2(e,0.))*2.2 - uTime*.28);
          float nz = fbm2_3(q+vec2(0.,e) + uTime*.22) + .40*ridged2((q+vec2(0.,e))*2.2 - uTime*.28);
          n = normalize(vN + vec3(n0-nx, 0., n0-nz)*uDetail*1.85*dFade);
        }
        vec3 V = normalize(cameraPosition - vW);
        float ndv = max(dot(n,V), 0.);
        float fres = .02 + .98*pow(clamp(1.-ndv, 0., 1.), 4.5);
        vec3 R = reflect(-V, n);
        vec3 refl = mix(uHorizon, uSky, pow(clamp(R.y,0.,1.), .55));
        if (uAurora > 0.0) {
          // Use smoothed reflection normal for aurora curtains so fjord water shows silky vertical columns without noisy speckles
          vec3 nSmooth = normalize(mix(vN, n, 0.14));
          vec3 R_aur = reflect(-V, nSmooth);
          float az = atan(R_aur.x, -R_aur.z);
          float aurWave1 = 0.5 + 0.5 * sin(az * 2.8 + fbm2_3(vW.xz * 0.008 + uTime * 0.02) * 2.4);
          float aurWave2 = 0.5 + 0.5 * sin(az * 4.6 - 1.2 + fbm2_3(vW.xz * 0.012) * 2.0);
          float aurRay = 0.55 + 0.45 * sin(az * 18.0 + vW.x * 0.02);
          vec3 aurG = vec3(0.10, 0.88, 0.52) * aurWave1;
          vec3 aurV = vec3(0.54, 0.24, 0.82) * aurWave2;
          vec3 aurCol = mix(aurG, aurV, smoothstep(0.02, 0.18, R_aur.y) * 0.55);
          refl += aurCol * aurRay * 0.68 * uAurora * smoothstep(-0.06, 0.22, R_aur.y);
        }
        float sp = pow(max(dot(R, normalize(uSunDir)),0.), 220.)*uSpec*3.5 + pow(max(dot(R, normalize(uSunDir)),0.), 22.)*uSpec*.18;
        float hNorm = vH / max(uAmp, 0.01);
        vec3 body = mix(uDeep, uShallow, clamp(hNorm*.32+.32 + (1.-ndv)*.14, 0., 1.));
        // Subsurface teal-slate glow in steep stormy wave crests
        if (uAmp > 0.5) {
          float sss = smoothstep(0.22, 0.90, hNorm) * (1.0 - ndv * 0.65);
          body += vec3(0.03, 0.13, 0.18) * sss * 0.52;
        }
        vec3 col = mix(body, refl, fres * 0.68) + uSunColor*sp;
        // Structured storm whitecaps on breaking wave crests + streaming foam webs & churning leg wake (zero salt-and-pepper noise!)
        if (uFoam > 0.0 && dist < 1600.0) {
          vec2 wp = vW.xz * 0.085 + vec2(uTime * 0.08, -uTime * 0.04);
          vec2 warp = vec2(fbm2_3(wp * 0.85), fbm2_3(wp * 0.85 + 4.3)) * 1.4;
          float foamWeb = ridged2((wp + warp) * 1.65);
          float foamSub = ridged2((wp - warp * 0.6) * 3.4);
          float patchMask = smoothstep(0.34, 0.76, fbm2_3(vW.xz * 0.038 + 1.7));
          // Coherent wind-driven foam lanes & spindrift trails streaming down wave backs
          float windStreak = smoothstep(0.58, 0.88, ridged2(vec2(vW.x * 0.14 - vW.z * 0.07 + warp.x * 0.5, vW.x * 0.03 + vW.z * 0.06)));
          float slopeBreak = smoothstep(0.04, 0.22, 1.0 - vN.y);
          float crestPeak = smoothstep(0.28, 0.78, hNorm + vCrest * 0.18) * (0.40 + 0.60 * slopeBreak);
          float crestCap = crestPeak * smoothstep(0.36, 0.78, foamWeb * 0.65 + foamSub * 0.35) * (0.40 + 0.60 * patchMask);
          float streakFoam = smoothstep(0.02, 0.62, hNorm) * patchMask * windStreak * smoothstep(0.42, 0.80, foamWeb) * 0.48;
          // Churning white sea foam & wake around the 4 offshore rig support legs (+/-18, +/-18)
          vec2 dLeg = abs(vW.xz) - vec2(18.0, 18.0);
          float legDist = length(dLeg);
          float legWarp = fbm2_3(vW.xz * 0.28 - uTime * 0.45);
          float legFoam = smoothstep(14.0, 2.0, legDist + (legWarp - 0.5) * 4.0) * (0.45 + 0.55 * smoothstep(0.30, 0.74, foamWeb));
          legFoam += smoothstep(6.5, 2.2, legDist) * (0.70 + 0.30 * foamSub);
          float foamAmt = clamp((crestCap * 1.05 + streakFoam + legFoam * 0.90) * uFoam * smoothstep(1600.0, 320.0, dist), 0.0, 0.90);
          vec3 foamCol = mix(vec3(0.55, 0.67, 0.78), vec3(0.92, 0.96, 1.0), clamp(n.y * 0.60 + 0.40 * crestPeak, 0.0, 1.0));
          col = mix(col, foamCol, foamAmt);
        }
        // Soften distant storm ocean into horizon mist so there is no razor seam at the horizon
        if (uAmp > 0.5) {
          col = mix(col, uHorizon * 0.78, smoothstep(180.0, 1200.0, dist) * 0.85);
        }
        col += uFlash*vec3(.4,.45,.6)*fres;
        gl_FragColor = vec4(col*uDim, 1.);
        #include <fog_fragment>
      }`,
    fog: true,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  m.userData.water = true;
  m.receiveShadow = false;
  return m;
}

/** CPU mirror of the ocean waves (for impacts / splashes). */
export function oceanHeight(x, z, t, amp, freq = 1) {
  if (!amp) return 0;
  const W = [[1, 0.3, 90, 0.18], [0.7, 1, 52, 0.16], [-0.4, 1, 31, 0.14], [1, -0.8, 17, 0.1], [0.2, -1, 9, 0.07]];
  let y = 0;
  for (const [dx, dz, wl0, st0] of W) {
    const l = Math.hypot(dx, dz), d0 = dx / l, d1 = dz / l;
    const wl = wl0 / freq, k = Math.PI * 2 / wl, c = Math.sqrt(9.8 / k), st = st0 * amp;
    y += (st / k) * Math.sin(k * (d0 * x + d1 * z - c * t));
  }
  return y;
}

// ---------------------------------------------------------------- weather
export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.kind = 'none';
  }
  set(cfg) {
    this.group.clear();
    this.cfg = cfg || { kind: 'none' };
    this.kind = this.cfg.kind;
    if (this.kind === 'none') return;
    const N = this.cfg.count || 4000, B = this.cfg.box || 140;
    this.B = B; this.N = N;
    this.p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.p[i * 3] = (Math.random() - 0.5) * B; this.p[i * 3 + 1] = (Math.random() - 0.5) * B * 0.6; this.p[i * 3 + 2] = (Math.random() - 0.5) * B; }
    this.seed = new Float32Array(N); for (let i = 0; i < N; i++) this.seed[i] = Math.random();
    const streak = this.kind === 'rain';
    if (streak) {
      const g = new THREE.BufferGeometry();
      this.lp = new Float32Array(N * 6);
      g.setAttribute('position', new THREE.BufferAttribute(this.lp, 3));
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(this.cfg.color), transparent: true, opacity: this.cfg.opacity ?? 0.35, depthWrite: false, blending: this.cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
      this.obj = new THREE.LineSegments(g, mat);
    } else {
      const g = new THREE.BufferGeometry();
      this.lp = new Float32Array(N * 3);
      g.setAttribute('position', new THREE.BufferAttribute(this.lp, 3));
      const mat = new THREE.PointsMaterial({ color: new THREE.Color(this.cfg.color), size: this.cfg.size || 0.12, transparent: true, opacity: this.cfg.opacity ?? 0.8, depthWrite: false, sizeAttenuation: true, map: dotTexture(), alphaTest: 0.01, fog: true, blending: this.cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      this.obj = new THREE.Points(g, mat);
    }
    this.obj.frustumCulled = false;
    this.group.add(this.obj);
  }
  update(dt, t, cam, wind = [0, 0]) {
    if (this.kind === 'none') return;
    const { N, B, p, seed, cfg } = this;
    const c = cam.position;
    const fall = cfg.fall ?? 1, wx = (cfg.wind?.[0] ?? 0) + wind[0], wz = (cfg.wind?.[1] ?? 0) + wind[1];
    const streak = this.kind === 'rain';
    const len = cfg.len ?? 0.06;
    for (let i = 0; i < N; i++) {
      const s = seed[i];
      let vx = wx, vy = -fall * (0.7 + s * 0.6), vz = wz;
      if (this.kind === 'snow' || this.kind === 'dust') { vx += Math.sin(t * 0.7 + s * 30) * 0.6; vz += Math.cos(t * 0.5 + s * 20) * 0.6; }
      if (this.kind === 'sand') vy = Math.sin(t + s * 9) * 0.6 - 0.2;
      p[i * 3] += vx * dt; p[i * 3 + 1] += vy * dt; p[i * 3 + 2] += vz * dt;
      // wrap around camera
      for (let a = 0; a < 3; a++) {
        const h = a === 1 ? B * 0.3 : B * 0.5;
        const rel = p[i * 3 + a] - c.getComponent(a);
        if (rel > h) p[i * 3 + a] -= h * 2; else if (rel < -h) p[i * 3 + a] += h * 2;
      }
      if (this.kind === 'sand' && p[i * 3 + 1] > c.y + 4 + s * 10 && cfg.ground) p[i * 3 + 1] -= B * 0.3;
      if (streak) {
        this.lp[i * 6] = p[i * 3]; this.lp[i * 6 + 1] = p[i * 3 + 1]; this.lp[i * 6 + 2] = p[i * 3 + 2];
        this.lp[i * 6 + 3] = p[i * 3] - vx * len; this.lp[i * 6 + 4] = p[i * 3 + 1] - vy * len; this.lp[i * 6 + 5] = p[i * 3 + 2] - vz * len;
      } else {
        this.lp[i * 3] = p[i * 3]; this.lp[i * 3 + 1] = p[i * 3 + 1]; this.lp[i * 3 + 2] = p[i * 3 + 2];
      }
    }
    this.obj.geometry.attributes.position.needsUpdate = true;
  }
}

let DOT = null;
export function dotTexture() {
  if (DOT) return DOT;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  DOT = new THREE.CanvasTexture(c);
  return DOT;
}
