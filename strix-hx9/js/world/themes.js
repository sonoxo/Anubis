// Six hand-tuned worlds. Each defines sky, light, fog, weather, colour grade, livery, and builds its own
// terrain/set pieces with a height function the flight model and weapons use.
import * as THREE from 'three';
import { Simplex, mulberry32, smooth, clamp, lerp, GLSL_NOISE } from '../core/noise.js';
import { makePadTexture } from '../core/textures.js';
import { terrainMesh, waterMesh, oceanHeight, dotTexture } from './world.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const C = (h) => new THREE.Color(h);
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lin = (hex) => { const c = C(hex); return [c.r, c.g, c.b]; };

// ------------------------------------------------------------ shared set pieces
function helipad(group, y, o) {
  const r = o.r ?? 13;
  const tex = makePadTexture(o.base, o.line, o.accent, o.label ?? 'HX-9');
  const surfaceMode = o.surfaceMode ?? 0;
  const lightCol = C(o.lights ?? '#5ef2ff');
  const poolInt = o.poolInt ?? 0.48;
  const top = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: o.rough ?? 0.72,
    metalness: o.metal ?? 0.12,
    envMapIntensity: o.envInt ?? 0.75,
  });
  const sMode = Math.round(surfaceMode);
  top.customProgramCacheKey = () => 'helipad_surf_' + sMode;
  top.onBeforeCompile = (sh) => {
    sh.uniforms.uPadR = { value: r };
    sh.uniforms.uLightCol = { value: lightCol };
    sh.uniforms.uPoolInt = { value: poolInt };
    sh.uniforms.uTime = o.timeU || { value: 0 };
    sh.uniforms.uReflTex = o.reflTex || { value: null };
    sh.uniforms.uReflVP = o.reflVP || { value: new THREE.Matrix4() };
    sh.uniforms.uHasRefl = { value: o.reflTex ? 1.0 : 0.0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPadW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvPadW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n#define H_SURF ${sMode}\nvarying vec3 vPadW;\nuniform float uPadR, uPoolInt, uTime, uHasRefl;\nuniform vec3 uLightCol;\nuniform sampler2D uReflTex;\nuniform mat4 uReflVP;\n${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 pXZ = vPadW.xz;
        float pr = length(pXZ) / max(uPadR, 1.0);
        float n1 = fbm2_3(pXZ * 0.35);
        float n2 = fbm2_3(pXZ * 1.4);
        float crk = smoothstep(0.84, 0.96, ridged2(pXZ * 0.42 + vec2(n1 * 0.7, -n1 * 0.7))) * 0.38;
        float skid = smoothstep(0.45, 0.1, pr) * fbm2_3(pXZ * 0.8 + 3.1) * 0.18;
        diffuseColor.rgb *= 1.0 - crk * 0.45 - skid;
        #if H_SURF == 0
          float ice = smoothstep(0.78, 0.99, pr + (n1 - 0.48) * 0.30) * (0.40 + 0.60 * n2);
          float grit = (vnoise(pXZ * 9.5) - 0.5) * 0.06;
          diffuseColor.rgb = clamp(diffuseColor.rgb + grit, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.46, 0.58, 0.68), clamp(ice * 0.42, 0.0, 0.48));
        #elif H_SURF == 1
          float windTongue = fbm2_3(pXZ * 0.18 + vec2(1.7, -0.9));
          float sandMask = smoothstep(0.58, 0.90, pr + (windTongue - 0.42) * 0.48 + (n1 - 0.48) * 0.24);
          float dustCoat = (0.18 + 0.28 * n1 + 0.14 * n2) * smoothstep(0.10, 0.82, pr);
          float uRip = (pXZ.x * 3.8 + pXZ.y * 1.9 + n1 * 2.2) * 3.2;
          float rip = 0.5 + 0.5 * sin(uRip);
          vec3 sandCol = mix(vec3(0.70, 0.48, 0.28), vec3(0.88, 0.66, 0.42), rip * 0.5 + n2 * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, sandCol * 0.86, clamp(dustCoat, 0.0, 0.54));
          diffuseColor.rgb = mix(diffuseColor.rgb, sandCol, clamp(sandMask, 0.0, 0.96));
        #elif H_SURF == 2
          float pud = smoothstep(0.44, 0.64, n1 * 0.66 + n2 * 0.34);
          float asphGrit = (vnoise(pXZ * 12.0) - 0.5) * 0.05 * (1.0 - pud * 0.7);
          diffuseColor.rgb = clamp(diffuseColor.rgb * mix(0.78, 0.20, pud) + asphGrit, 0.0, 1.0);
        #elif H_SURF == 3
          float pud = smoothstep(0.42, 0.66, n1 * 0.68 + n2 * 0.32);
          float wear = smoothstep(0.44, 0.78, n2 * 0.65 + n1 * 0.35);
          float nonSkid = (vnoise(pXZ * 16.0) - 0.5) * 0.06;
          diffuseColor.rgb = mix(diffuseColor.rgb + nonSkid, vec3(0.05, 0.07, 0.09), wear * 0.42);
          diffuseColor.rgb *= mix(0.82, 0.28, pud * 0.82);
        #elif H_SURF == 4
          float crkDeep = smoothstep(0.76, 0.92, ridged2(pXZ * 0.38 + vec2(n1 * 0.9, -n1 * 0.8)));
          diffuseColor.rgb *= 1.0 - crkDeep * 0.58;
          float dustRim = smoothstep(0.72, 0.97, pr + (n1 - 0.48) * 0.34);
          vec3 rDust = vec3(0.62, 0.41, 0.26) * (0.85 + 0.3 * n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, rDust, clamp(dustRim * 0.78 + crkDeep * 0.42 + n1 * 0.12, 0.0, 0.84));
        #else
          float windBias = smoothstep(-0.4, 0.6, (pXZ.x - pXZ.y * 0.5) / max(uPadR, 1.0));
          float snowRim = smoothstep(0.82, 0.99, pr + (n1 - 0.48) * 0.28 + windBias * 0.10);
          vec3 gTint = mix(vec3(0.26, 0.25, 0.24), vec3(0.44, 0.41, 0.38), n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, gTint, 0.38 * (1.0 - snowRim));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.92, 0.88), clamp(snowRim * 0.72, 0.0, 0.80));
        #endif
        float lAng = atan(pXZ.y, pXZ.x);
        float segA = 6.2831853 / 24.0;
        float nearA = round(lAng / segA) * segA;
        vec2 lPos = vec2(cos(nearA), sin(nearA)) * (uPadR + 0.08);
        float lDist = length(pXZ - lPos);
        diffuseColor.rgb += uLightCol * ((exp(-lDist * 3.2) * 1.25 + exp(-lDist * 1.25) * 0.34) * uPoolInt + exp(-abs(length(pXZ) - uPadR) * 1.6) * uPoolInt * 0.18);
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        {
          vec2 pXZ2 = vPadW.xz;
          float n1r = fbm2_3(pXZ2 * 0.35);
          float n2r = fbm2_3(pXZ2 * 1.4);
          #if H_SURF == 0
            roughnessFactor = mix(0.42, 0.82, smoothstep(0.35, 0.68, n1r * 0.7 + n2r * 0.3));
          #elif H_SURF == 2
            float pudR = smoothstep(0.44, 0.64, n1r * 0.66 + n2r * 0.34);
            roughnessFactor = mix(0.56, 0.02, pudR);
          #elif H_SURF == 3
            float pudR = smoothstep(0.42, 0.66, n1r * 0.68 + n2r * 0.32);
            roughnessFactor = mix(0.52, 0.05, pudR);
          #else
            roughnessFactor = clamp(roughnessFactor + (n2r - 0.5) * 0.22, 0.35, 0.96);
          #endif
        }
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 pXZ3 = vPadW.xz;
          float eP = 0.05;
          float n1n = fbm2_3(pXZ3 * 0.35);
          float n2n = fbm2_3(pXZ3 * 1.4);
          #if H_SURF == 2 || H_SURF == 3
            float pudN = smoothstep(0.42, 0.64, n1n * 0.66 + n2n * 0.34);
          #else
            float pudN = 0.0;
          #endif
          float h0 = (vnoise(pXZ3 * 8.5) * 0.38 + ridged2(pXZ3 * 1.2) * 0.62) * (1.0 - pudN * 0.78);
          float hx = (vnoise((pXZ3 + vec2(eP, 0.)) * 8.5) * 0.38 + ridged2((pXZ3 + vec2(eP, 0.)) * 1.2) * 0.62) * (1.0 - pudN * 0.78);
          float hz = (vnoise((pXZ3 + vec2(0., eP)) * 8.5) * 0.38 + ridged2((pXZ3 + vec2(0., eP)) * 1.2) * 0.62) * (1.0 - pudN * 0.78);
          #if H_SURF == 2 || H_SURF == 3
            vec2 rCell0 = floor(pXZ3 * 2.2);
            vec2 rF0 = fract(pXZ3 * 2.2) - 0.5 + (hash22(rCell0) - 0.5) * 0.28;
            float rPh0 = fract(uTime * 1.6 + hash12(rCell0));
            float rad0 = length(rF0);
            h0 += sin((rad0 - rPh0 * 0.42) * 48.0) * exp(-rad0 * 7.0) * (1.0 - rPh0) * (0.35 + 0.65 * pudN) * 0.28;
            vec2 rCell1 = floor(pXZ3 * 3.8 + 17.3);
            vec2 rF1 = fract(pXZ3 * 3.8 + 17.3) - 0.5 + (hash22(rCell1) - 0.5) * 0.28;
            float rPh1 = fract(uTime * 1.9 + hash12(rCell1));
            float rad1 = length(rF1);
            h0 += sin((rad1 - rPh1 * 0.42) * 48.0) * exp(-rad1 * 7.0) * (1.0 - rPh1) * (0.35 + 0.65 * pudN) * 0.24;
            float nScaleP = 0.32;
          #else
            float nScaleP = 0.42;
          #endif
          vec3 dNP = vec3((h0 - hx) * nScaleP, 0.0, (h0 - hz) * nScaleP);
          normal = normalize(normal + (viewMatrix * vec4(dNP, 0.0)).xyz);
        }
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec2 pXZL = vPadW.xz;
          float lAngE = atan(pXZL.y, pXZL.x);
          float segAE = 6.2831853 / 24.0;
          float nearAE = round(lAngE / segAE) * segAE;
          vec2 lPosE = vec2(cos(nearAE), sin(nearAE)) * (uPadR + 0.08);
          float lDistE = length(pXZL - lPosE);
          totalEmissiveRadiance += uLightCol * (exp(-lDistE * 3.4) * 0.68 + exp(-lDistE * 1.2) * 0.14) * uPoolInt;
        }
        #if H_SURF == 0
          vec2 pXZ4 = vPadW.xz;
          float n1b = fbm2_3(pXZ4 * 0.35);
          float wetB = smoothstep(0.62, 0.36, n1b);
          vec3 Vb = normalize(cameraPosition - vPadW);
          float fresB = 0.12 + 0.88 * pow(clamp(1.0 - max(Vb.y, 0.0), 0.0, 1.0), 2.8);
          totalEmissiveRadiance += vec3(0.05, 0.22, 0.16) * wetB * fresB * 0.22 + diffuseColor.rgb * vec3(0.05, 0.10, 0.14);
        #elif H_SURF == 2
          vec2 pXZ4 = vPadW.xz;
          float n1e = fbm2_3(pXZ4 * 0.35);
          float n2e = fbm2_3(pXZ4 * 1.4);
          float pudE = smoothstep(0.44, 0.64, n1e * 0.66 + n2e * 0.34);
          vec4 clipR = uReflVP * vec4(vPadW.x, 0.28, vPadW.z, 1.0);
          vec2 baseUV = clipR.xy / max(clipR.w, 0.1) * 0.5 + 0.5;
          vec2 rCell = floor(pXZ4 * 2.2);
          vec2 rF = fract(pXZ4 * 2.2) - 0.5;
          float rPhase = fract(uTime * 1.5 + hash12(rCell));
          vec2 rainRip = normalize(rF + vec2(1e-4)) * sin((length(rF) - rPhase * 0.45) * 42.0) * exp(-length(rF) * 6.5) * (1.0 - rPhase) * 0.004 * pudE;
          vec2 microN = vec2(vnoise(pXZ4 * 4.5) - 0.5, vnoise(pXZ4 * 4.5 + 5.7) - 0.5) * mix(0.014, 0.0025, pudE);
          float vSpread = mix(0.042, 0.0035, pudE);
          vec2 uvC = clamp(baseUV + rainRip + microN, 0.002, 0.998);
          vec2 uvOff = vec2(0.0012 * (1.0 - pudE), vSpread * 0.5);
          vec3 reflCol = texture2D(uReflTex, clamp(uvC - uvOff, 0.002, 0.998)).rgb * 0.25
                       + texture2D(uReflTex, uvC).rgb * 0.50
                       + texture2D(uReflTex, clamp(uvC + uvOff, 0.002, 0.998)).rgb * 0.25;
          vec3 Vp = normalize(cameraPosition - vPadW);
          float fresP = 0.20 + 0.80 * pow(clamp(1.0 - max(Vp.y, 0.0), 0.0, 1.0), 2.4);
          float paintMask = smoothstep(0.18, 0.48, diffuseColor.r);
          totalEmissiveRadiance += reflCol * mix(0.08, 1.08, pudE) * (1.0 - paintMask * 0.60) * fresP * step(0.1, clipR.w) * uHasRefl;
          // Expanding concentric raindrop ripple rings on wet puddles (no solid white dots on dark asphalt!)
          float splashRing = 0.0;
          vec2 sCell0 = floor(pXZ4 * 2.4);
          float sSeed0 = hash12(sCell0);
          vec2 sCnt0 = (hash22(sCell0) - 0.5) * 0.45;
          float dS0 = length(fract(pXZ4 * 2.4) - 0.5 - sCnt0);
          float ph0 = fract(uTime * (1.6 + sSeed0 * 0.6) + sSeed0 * 7.13);
          float rR0 = 0.08 + ph0 * 0.34;
          splashRing += smoothstep(0.022, 0.0, abs(dS0 - rR0)) * (1.0 - ph0) * smoothstep(0.04, 0.16, ph0) * step(0.65, sSeed0);
          vec2 sCell1 = floor(pXZ4 * 3.8 + 23.7);
          float sSeed1 = hash12(sCell1);
          vec2 sCnt1 = (hash22(sCell1) - 0.5) * 0.45;
          float dS1 = length(fract(pXZ4 * 3.8 + 23.7) - 0.5 - sCnt1);
          float ph1 = fract(uTime * (1.9 + sSeed1 * 0.6) + sSeed1 * 7.13);
          float rR1 = 0.08 + ph1 * 0.34;
          splashRing += smoothstep(0.020, 0.0, abs(dS1 - rR1)) * (1.0 - ph1) * smoothstep(0.04, 0.16, ph1) * step(0.68, sSeed1);
          totalEmissiveRadiance += (reflCol * 0.55 + vec3(0.16, 0.34, 0.48) * 0.14) * splashRing * pudE;
        #elif H_SURF == 3
          vec2 pXZ4 = vPadW.xz;
          float n1e = fbm2_3(pXZ4 * 0.35);
          float n2e = fbm2_3(pXZ4 * 1.4);
          float pudE = smoothstep(0.42, 0.66, n1e * 0.68 + n2e * 0.32);
          vec3 Vp = normalize(cameraPosition - vPadW);
          float ripple = sin(pXZ4.x * 18.0 + pXZ4.y * 12.0 + n2e * 6.0) * 0.5 + 0.5;
          float rightWarmPool = exp(-length(pXZ4 - vec2(-5.5, -5.5)) * 0.28) * 0.28;
          vec3 warmRefl = vec3(1.0, 0.56, 0.18) * rightWarmPool * (0.20 + 0.80 * pudE) * (0.6 + 0.4 * ripple);
          float floodPool = exp(-length(pXZ4 - vec2(12.2, -2.5)) * 0.42) * 0.72
                          + exp(-length(pXZ4 - vec2(-12.5, 9.5)) * 0.38) * 0.45
                          + exp(-length(pXZ4 - vec2(11.5, 10.5)) * 0.38) * 0.45
                          + exp(-length(pXZ4 - vec2(12.5, -9.5)) * 0.38) * 0.45;
          float fresT = 0.12 + 0.88 * pow(clamp(1.0 - max(Vp.y, 0.0), 0.0, 1.0), 2.8);
          vec3 coolSheen = vec3(0.72, 0.88, 1.0) * (0.02 + 0.42 * floodPool) * (0.22 + 0.78 * pudE) * (0.65 + 0.35 * ripple) * fresT;
          totalEmissiveRadiance += warmRefl + coolSheen;
        #endif
      `);
  };
  const side = new THREE.MeshStandardMaterial({ color: o.side ?? 0x1a1c20, roughness: 0.65, metalness: 0.35 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.45, 0.5, 64), [side, top, side]);
  m.position.y = y - 0.25; m.receiveShadow = true; m.castShadow = true;
  group.add(m);
  // Crisp metallic perimeter light fixtures (housing + glowing lens visible in both close and wide shots)
  const n = 24;
  const housingGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.14, 0.18, 0.045, 12).translate(0, 0.022, 0),
    new THREE.CylinderGeometry(0.095, 0.12, 0.022, 12).translate(0, 0.072, 0),
  ]);
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x181a1e, roughness: 0.4, metalness: 0.75 });
  const housings = new THREE.InstancedMesh(housingGeo, housingMat, n);
  const lg = new THREE.CylinderGeometry(0.085, 0.095, 0.042, 12).translate(0, 0.056, 0);
  const lm = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: lightCol, emissiveIntensity: o.lightInt ?? 3.4, roughness: 0.2 });
  const im = new THREE.InstancedMesh(lg, lm, n);
  const mt = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    mt.makeTranslation(Math.cos(a) * (r + 0.08), y, Math.sin(a) * (r + 0.08));
    im.setMatrixAt(i, mt);
    housings.setMatrixAt(i, mt);
  }
  group.add(housings, im);
  return { mesh: m, topMat: top, lightMat: lm };
}

function scatter(count, rnd, test, half = 1400) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 30) {
    const x = (rnd() - 0.5) * half * 2, z = (rnd() - 0.5) * half * 2;
    const r = test(x, z);
    if (r) out.push(r);
  }
  return out;
}

function slopeAt(h, x, z) {
  const e = 2; const dx = h(x + e, z) - h(x - e, z), dz = h(x, z + e) - h(x, z - e);
  return 1 / Math.sqrt(1 + (dx * dx + dz * dz) / (4 * e * e));
}

// Detailed multi-tiered snow-laden boreal conifer geometry for Borealis
function makeConiferGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.28, 2.6, 7).translate(0, 1.3, 0);
  const tc = new Float32Array(trunk.attributes.position.count * 3);
  for (let i = 0; i < trunk.attributes.position.count; i++) { tc[i * 3] = 0; tc[i * 3 + 1] = 0; tc[i * 3 + 2] = 0; }
  trunk.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  parts.push(trunk.toNonIndexed());

  const tiers = [
    { y: 2.4, r: 2.1, h: 2.6, seg: 9 },
    { y: 3.7, r: 1.85, h: 2.4, seg: 9 },
    { y: 4.9, r: 1.55, h: 2.2, seg: 9 },
    { y: 6.0, r: 1.28, h: 2.0, seg: 8 },
    { y: 7.0, r: 0.98, h: 1.8, seg: 8 },
    { y: 7.9, r: 0.68, h: 1.6, seg: 7 },
    { y: 8.7, r: 0.38, h: 1.4, seg: 6 },
  ];
  const rnd = mulberry32(101);
  tiers.forEach((t, ti) => {
    const cone = new THREE.ConeGeometry(t.r, t.h, t.seg, 2, false);
    const p = cone.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      let vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k);
      const normY = (vy + t.h / 2) / t.h; // 0 at base, 1 at tip
      const rad = Math.hypot(vx, vz);
      if (rad > 0.01) {
        const ang = Math.atan2(vz, vx);
        const scallop = 0.82 + 0.32 * Math.sin(ang * t.seg * 0.5 + ti * 1.7) + (rnd() - 0.5) * 0.16;
        vx *= scallop; vz *= scallop;
        // Droop outer branch tips
        vy -= (1.0 - normY) * 0.35 * scallop;
      } else {
        vx += (rnd() - 0.5) * 0.12;
        vz += (rnd() - 0.5) * 0.12;
      }
      p.setXYZ(k, vx, vy + t.y, vz);
      col[k * 3] = 1.0; // foliage flag
      col[k * 3 + 1] = clamp(normY, 0, 1);
      col[k * 3 + 2] = ti / tiers.length;
    }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ni = cone.toNonIndexed();
    ni.computeVertexNormals();
    parts.push(ni);
  });
  return mergeGeometries(parts);
}

// ============================================================ 1. BOREALIS
const borealis = {
  id: 'borealis', name: 'Borealis', sub: 'Arctic fjord · 69°N · aurora night', swatch: '#3dffb5',
  accent: '#46ffc8', night: true, beam: 0.55,
  sky: { top: '#030812', horizon: '#0d1f30', bottom: '#03070e', sharp: 0.56, sunDir: [-0.35, 0.38, -0.85], sunColor: '#98d0ff', sunSize: 0.0, sunGlow: 0.14, stars: 2.15, aurora: 2.65, auroraA: '#2eff98', auroraB: '#7a42d8' },
  fog: { color: '#102232', density: 0.00068 },
  sun: { color: '#9ac8f0', intensity: 1.28 }, hemi: { sky: '#3a6484', ground: '#122030', intensity: 0.65 },
  exposure: 0.85, envIntensity: 0.60,
  bloom: { strength: 0.60, radius: 0.45, threshold: 0.86 },
  grade: { lift: [0.0, 0.006, 0.015], gain: [0.95, 1.02, 1.07], vignette: 0.38, grain: 0.035, ca: 0.0012 },
  weather: { kind: 'snow', count: 1600, color: '#cfe6ff', size: 0.06, fall: 0.75, wind: [1.0, 0.3], opacity: 0.38 },
  ambience: { wind: 0.25, rain: 0, hum: 0 },
  livery: { paint: '#15181c', paint2: '#0b0c0f', trim: '#060709', blade: '#0e1013', glow: '#46ffc8', glowIntensity: 4.6, glass: '#1a363c', irid: 0.95, decal: '#8fa6b4', rough: 0.52, metal: 0.48, interior: '#20242a', missile: '#34393e' },
  build(ctx) {
    const g = new THREE.Group(), sx = new Simplex(41), padY = 3;
    // Helper for sharp alpine arêtes & incised couloirs on Borealis mountain peaks (with fast bounding-box early-out)
    const alpinePeak = (x, z, px, pz, rad, maxH, sharp = 1.42) => {
      const dx = x - px, dz = z - pz;
      const maxD = rad * 2.40;
      if (dx > maxD || dx < -maxD || dz > maxD || dz < -maxD) return 0;
      const d = Math.hypot(dx, dz) / rad;
      if (d > 2.40) return 0;
      const env = Math.exp(-Math.pow(d, sharp) * 1.18);
      const ang = Math.atan2(dz, dx);
      // Radial arête ridges & incised glacial couloir gullies
      const spur = 0.62 + 0.38 * sx.ridged(Math.cos(ang) * 2.0 + px * 0.01, Math.sin(ang) * 2.0 + pz * 0.01, 2);
      const couloir = sx.ridged(x / 72 + 1.7, z / 72 - 2.3, 2) - 0.38;
      return maxH * env * (0.68 + 0.32 * spur) + couloir * 20 * env * smooth(0.06, 0.52, d);
    };
    const height = (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 14.8) return padY - 0.08;
      // Gentle snowy valley floor & rolling hills base (avoids any vertical terrain wall cut edges)
      const gentleSnowFloor = 3.5 + sx.fbm(x / 95, z / 95, 2) * 2.5 + smooth(-50, -240, z) * 3.8;
      const openHills = (sx.ridged(x / 245, z / 245, 3) - 0.38) * 13.0 * smooth(55, 240, r);
      let h = gentleSnowFloor + openHills;
      // Only evaluate mountain peaks in the -z quadrant where they exist
      if (z < -40) {
        // 1) Borealis Hero right-side craggy snowy ridge (x ~ -190..-85, z ~ -220..-420):
        // Keeps left/center sky in borealis_hero (x < -190) low so aurora curtains fill the upper 55% of the frame,
        // while placing a crisp moonlit craggy snowy ridge on the right above the conifer treetops!
        h += alpinePeak(x, z, -145, -295, 92, 19, 1.42);
        h += alpinePeak(x, z, -100, -325, 88, 23, 1.42);
        h += alpinePeak(x, z, -245, -365, 110, 9, 1.45);
        // 2) Borealis Wide left-center craggy peaks behind the cabin (x ~ -75..+80, z ~ -250..-440):
        // Smoothly rises into natural jagged alpine peaks with NO vertical cut wall on the left
        h += alpinePeak(x, z, -35, -330, 80, 54, 1.45);
        h += alpinePeak(x, z, 42, -355, 75, 44, 1.45);
        // 3) Borealis Wide right-side towering jagged alpine massif & forested lower bench (x ~ 110..480, z ~ -110..-480)
        h += alpinePeak(x, z, 155, -275, 106, 114, 1.38);
        h += alpinePeak(x, z, 268, -285, 145, 154, 1.35);
        h += alpinePeak(x, z, 385, -225, 136, 130, 1.36);
        h += alpinePeak(x, z, 195, -165, 92, 26, 1.42);
        if (h > 15.0) {
          h += (sx.ridged(x / 52, z / 52, 2) - 0.44) * 11.0 * smooth(15.0, 40.0, h);
        }
      }
      // Fjord channel: bring water bay behind the helipad for borealis_hero and center-left of borealis_wide
      const ch = 220 + 150 * Math.sin(x / 520) + sx.fbm(x / 850, 0.5, 2) * 110;
      const carve = smooth(35, 310, Math.abs(z - ch));
      h = lerp(-32 + sx.fbm(x / 120, z / 120, 2) * 4, h, carve);
      // Carve scenic fjord bay behind the pad in borealis_hero & center of borealis_wide (keep x < -18 & z < -175 as snowy forested bank)
      const bayMask = smooth(-24, -48, z) * smooth(-175, -105, z) * smooth(-18, 4, x) * smooth(125, 22, x) * smooth(20, 32, r);
      const shelf = smooth(38, 280, r);
      const nearPad = padY - 0.06 + sx.fbm(x / 55, z / 55, 2) * 0.85 * smooth(15, 28, r);
      h = lerp(nearPad, h, shelf * shelf);
      h = lerp(h, -10, bayMask);
      return h;
    };
    const snowBase = lin('#94aec4'), shore = lin('#121e2b');
    const mainTerr = terrainMesh({
      half: 3200, seg: 288, pow: 1.68, height, rough: 0.82, bump: 0.22, envInt: 0.55,
      detail: { mode: 1, sunDir: borealis.sky.sunDir, fogSun: '#1e3c52', fogHigh: '#122638', fogHeight: 0.0020 },
      color: (x, z, h) => {
        return mixc(snowBase, shore, smooth(2.5, -1.5, h) * 0.65);
      },
    });
    g.add(mainTerr);

    const water = waterMesh({
      y: 0, deep: '#030b14', shallow: '#08202c', sky: '#10303e', horizon: '#18384c',
      amp: 0.05, foam: 0, aurora: 2.5, sunDir: borealis.sky.sunDir, sunColor: '#88b8e8', spec: 0.78, detail: 0.5,
    });
    g.add(water);
    helipad(g, padY, { base: '#121820', line: '#c8d8e4', accent: '#36d8a8', lights: '#46ffc8', surfaceMode: 0, rough: 0.58, lightInt: 4.2, poolInt: 0.44 });

    // Denser, varied snow-laden boreal conifers concentrated in foreground/mid-ground camera sightlines (r = 43..820m)
    const cabX = -35.5, cabZ = -12.5;
    const rnd = mulberry32(7);
    const pts = scatter(3200, rnd, (x, z) => {
      const r = Math.hypot(x, z); if (r < 43) return null;
      // Keep cabin clearing and sightline corridor from helipad/camera to cabin completely open
      if (Math.hypot(x - cabX, z - cabZ) < 17.5) return null;
      if (x < -5 && x > -40 && z > -16 && z < 24) return null;
      if (r < 68 && rnd() < 0.22) return null;
      const h = height(x, z);
      // Allow scattered alpine conifers to climb the gentler right-flank benches in borealis_wide (up to h = 44m)
      const maxTreeH = (x > 40 && z < -80) ? 44.0 : 21.5;
      if (h < 1.5 || h > maxTreeH) return null;
      if (h > 21.0 && rnd() < 0.58) return null;
      const minSlope = h > 19.0 ? 0.72 : 0.82;
      if (slopeAt(height, x, z) < minSlope) return null;
      return [x, h, z];
    }, 820);
    const tg = makeConiferGeometry();
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.02, envMapIntensity: 0.52 });
    treeMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTreeN;\nvarying vec3 vTreeW;\nvarying float vTreeSeed;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vTreeN = normalize(normal);
          vec4 twp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vTreeW = twp.xyz;
          vTreeSeed = fract(floor(instanceMatrix[3].x + 0.5) * 0.137 + floor(instanceMatrix[3].z + 0.5) * 0.293);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vTreeN;\nvarying vec3 vTreeW;\nvarying float vTreeSeed;\n${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          if (vColor.r < 0.5) {
            diffuseColor.rgb = vec3(0.11, 0.07, 0.05);
          } else {
            vec3 needleDark = vec3(0.03, 0.075, 0.075);
            vec3 needleMid = vec3(0.065, 0.145, 0.135);
            float nVar = vnoise(vTreeW.xz * 2.0 + vTreeW.y * 1.4);
            vec3 foliage = mix(needleDark, needleMid, nVar * 0.7 + vTreeSeed * 0.3);
            float snowLoad = smoothstep(0.18, 0.58, vTreeN.y + (nVar - 0.42) * 0.42) * smoothstep(0.08, 0.46, vColor.g);
            vec3 snowTint = vec3(0.60, 0.74, 0.86);
            diffuseColor.rgb = mix(foliage, snowTint, clamp(snowLoad * 0.80, 0.0, 0.86));
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if (vColor.r >= 0.5) {
            float tipLift = smoothstep(0.15, 0.75, vColor.g) * (0.45 + 0.55 * clamp(vTreeN.y, 0.0, 1.0));
            totalEmissiveRadiance += diffuseColor.rgb * vec3(0.13, 0.22, 0.30) * (0.44 + 0.54 * tipLift);
          }
        `)
        .replace('#include <fog_fragment>', `
          #ifdef USE_FOG
            float dTree = length(cameraPosition - vTreeW);
            // Layered arctic mist haze between foreground, mid-ground, and background forest rows
            float mistBand = exp(-max(vTreeW.y - 4.0, 0.0) * 0.038) * smoothstep(32.0, 210.0, dTree) * 0.62;
            float fTree = clamp(1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth) + mistBand, 0.0, 0.90);
            vec3 treeHaze = mix(fogColor, vec3(0.15, 0.28, 0.38), smoothstep(32.0, 250.0, dTree));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, treeHaze, fTree);
          #endif
        `);
    };
    const trees = new THREE.InstancedMesh(tg, treeMat, pts.length);
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler();
    pts.forEach((p, i) => {
      const s = 0.72 + Math.pow(rnd(), 1.15) * 1.35;
      const sy = s * (0.85 + rnd() * 0.52);
      q.setFromEuler(eu.set((rnd() - 0.5) * 0.06, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.06));
      mt.compose(new THREE.Vector3(p[0], p[1] - 0.2, p[2]), q, new THREE.Vector3(s, sy, s));
      trees.setMatrixAt(i, mt);
    });
    // All trees are >= 43m from origin, outside the [-24..24m] shadow camera frustum
    trees.castShadow = false; trees.receiveShadow = true;
    g.add(trees);

    // Upgraded timber research cabin with vertical plank siding, thick snow-capped overhanging roof & framed warm windows
    const cabin = new THREE.Group();
    const woodCanvas = document.createElement('canvas'); woodCanvas.width = 256; woodCanvas.height = 128;
    const wctx = woodCanvas.getContext('2d');
    wctx.fillStyle = '#382216'; wctx.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 64; i++) {
      const x0 = i * 4;
      wctx.fillStyle = i % 2 === 0 ? 'rgba(20,10,5,0.35)' : 'rgba(110,70,42,0.26)';
      wctx.fillRect(x0, 0, 3, 128);
      wctx.fillStyle = 'rgba(10,5,2,0.6)';
      wctx.fillRect(x0 + 3, 0, 1, 128);
    }
    const woodTex = new THREE.CanvasTexture(woodCanvas); woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(3, 1); woodTex.colorSpace = THREE.SRGBColorSpace;
    const cm = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.82 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(10.8, 3.6, 6.4), cm);
    box.position.y = 1.8; box.castShadow = box.receiveShadow = true; cabin.add(box);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xd0e2f2, emissive: 0x1a2e42, emissiveIntensity: 0.42, roughness: 0.65 });
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(11.9, 0.44, 4.35), roofMat);
    roofL.position.set(0, 4.28, 1.75); roofL.rotation.x = 0.38; roofL.castShadow = roofL.receiveShadow = true; cabin.add(roofL);
    const roofR = new THREE.Mesh(new THREE.BoxGeometry(11.9, 0.44, 4.35), roofMat);
    roofR.position.set(0, 4.28, -1.75); roofR.rotation.x = -0.38; roofR.castShadow = roofR.receiveShadow = true; cabin.add(roofR);
    const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(11.9, 0.46, 0.55), roofMat);
    ridgeBeam.position.set(0, 4.98, 0); cabin.add(ridgeBeam);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.5, 0.72), new THREE.MeshStandardMaterial({ color: 0x26282e, roughness: 0.9 }));
    chimney.position.set(-3.0, 5.0, -1.0); cabin.add(chimney);
    const winGlass = new THREE.MeshStandardMaterial({ color: 0x221508, emissive: 0xffc278, emissiveIntensity: 2.6, roughness: 0.2 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c120c, roughness: 0.8 });
    for (let i = 0; i < 4; i++) {
      const wx = -3.6 + i * 2.4;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.10, 1.00), winGlass);
      w.position.set(wx, 2.0, 3.22); cabin.add(w);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.12, 0.08), frameMat);
      fr.position.set(wx, 2.0, 3.19); cabin.add(fr);
      const mv = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.06, 0.06), frameMat);
      mv.position.set(wx, 2.0, 3.23); cabin.add(mv);
      const mh = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.05, 0.06), frameMat);
      mh.position.set(wx, 2.0, 3.23); cabin.add(mh);
    }
    cabin.position.set(cabX, height(cabX, cabZ) + 0.15, cabZ); cabin.rotation.y = 0.50;
    g.add(cabin);
    const wl = new THREE.PointLight(0xffa850, 65, 36, 1.7); wl.position.set(cabX + 3.5, padY + 3.0, cabZ + 3.5); g.add(wl);

    return {
      group: g, padY, heightAt: (x, z) => Math.max(height(x, z), 0), waterY: 0, floor: 0,
      update(dt, t) { water.material.uniforms.uTime.value = t; },
      water,
    };
  },
};

// ============================================================ 2. DUNE
const dune = {
  id: 'dune', name: 'Dune', sub: 'Erg Chebbi · golden hour · 41°C', swatch: '#ff9a3a',
  accent: '#ff9a3a', night: false, beam: 0.08,
  sky: { top: '#4c6688', horizon: '#ffdc98', bottom: '#d29c62', sharp: 0.54, sunDir: [0.68, 0.12, -0.44], sunColor: '#ffda8e', sunSize: 0.0012, sunGlow: 3.2, clouds: 0.14, cloudColor: '#ffe8c6', cloudShadow: '#b88254', cloudScale: 0.7, cloudCover: 0.16 },
  fog: { color: '#e6b87e', density: 0.00056 },
  sun: { color: '#ffb852', intensity: 6.4 }, hemi: { sky: '#7c98be', ground: '#2e1b0e', intensity: 0.32 },
  exposure: 0.95, envIntensity: 0.56,
  bloom: { strength: 0.50, radius: 0.55, threshold: 0.92 },
  grade: { lift: [0.003, 0.001, 0.004], gain: [1.10, 1.0, 0.88], vignette: 0.36, grain: 0.035, ca: 0.001 },
  weather: { kind: 'sand', count: 2400, color: '#f4ce98', fall: 0, wind: [14, 5], len: 0.055, opacity: 0.20, ground: true, box: 120 },
  ambience: { wind: 0.55, rain: 0, hum: 0 },
  livery: { camo: ['#e2c69c', '#a87e4e', '#583c22'], camoBright: 1.08, paint: '#b89a72', paint2: '#5c4b38', trim: '#282019', blade: '#26201a', glow: '#ff9a3a', glowIntensity: 2.8, glass: '#4c340e', irid: 1.0, decal: '#241a12', rough: 0.70, metal: 0.2, interior: '#363028', missile: '#645238' },
  build() {
    const g = new THREE.Group(), sx = new Simplex(77), padY = 0;
    const timeU = { value: 0 };
    const dunes = (x, z) => {
      const w = sx.fbm(x / 420, z / 420, 3) * 140;
      const u = (x * 0.82 + z * 0.57 + w) / 110;
      const f = u - Math.floor(u);
      // Crisp asymmetric barchan dune profile: sharp ridge crest at f = 0.72 separating windward slope from steep leeward slip-face
      const ramp = f < 0.72 ? f / 0.72 : (1.0 - f) / 0.28;
      const sharpCrest = 1.0 - Math.sqrt((1.0 - ramp) * (1.0 - ramp) + 0.0004);
      const prof = Math.pow(clamp(sharpCrest, 0, 1), 1.52);
      const big = (0.55 + 0.45 * sx.fbm(x / 700, z / 700, 3));
      const u2 = (x * -0.3 + z * 0.95 + w * 0.5) / 47, f2 = u2 - Math.floor(u2);
      const ramp2 = f2 < 0.70 ? f2 / 0.70 : (1.0 - f2) / 0.30;
      const small = Math.pow(clamp(1.0 - Math.sqrt((1.0 - ramp2) * (1.0 - ramp2) + 0.0006), 0, 1), 1.45) * 4.6;
      return prof * 38 * big + small + sx.fbm(x / 1500, z / 1500, 2) * 30;
    };
    const height = (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 14.2) return padY - 0.12;
      const d = dunes(x, z);
      const nearH = padY - 0.08 + 0.24 * sx.noise(x / 12, z / 12) * smooth(14.2, 22, r);
      return lerp(nearH, d - 6, smooth(24, 165, r));
    };
    const crest = lin('#facc82'), trough = lin('#9c6234'), slip = lin('#462612');
    g.add(terrainMesh({
      half: 3400, seg: 300, pow: 1.66, height, rough: 0.90, bump: 0.85, envInt: 0.42,
      detail: { mode: 2, sunDir: dune.sky.sunDir, fogSun: '#ffe0a2', fogHigh: '#d2aa7a', fogHeight: 0.0018 },
      color: (x, z, h, ny) => {
        let c = mixc(trough, crest, clamp((h + 6) / 38, 0, 1));
        c = mixc(c, slip, smooth(0.95, 0.74, ny) * 0.68);
        c = mixc(c, lin('#dca468'), clamp(sx.noise(x / 30, z / 30) * 0.3 + 0.15, 0, 1) * 0.26);
        return c;
      },
    }));
    helipad(g, padY + 0.02, { base: '#625242', line: '#221a14', accent: '#e86a1a', lights: '#ff9a3a', side: 0x4c3e30, rough: 0.86, surfaceMode: 1, lightInt: 4.8, poolInt: 0.65 });

    // Distant eroded sandstone mesas with vertical fluted columns, horizontal strata & golden-hour dust haze
    const rnd = mulberry32(13);
    const mesaConfigs = [];
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 900 + rnd() * 1800;
      const w = 60 + rnd() * 220, h = 70 + rnd() * 210;
      const topScale = 0.82 + rnd() * 0.12;
      for (let k = 0; k < 45; k++) { rnd(); rnd(); rnd(); }
      mesaConfigs.push({ a, r, w, h, topScale });
    }
    const mg = [];
    for (const mc of mesaConfigs) {
      const { a, r, w, h, topScale } = mc;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const baseDuneY = h / 2 - 8 + dunes(cx, cz) * 0.5;
      const geo = new THREE.CylinderGeometry(w * topScale, w * 1.15, h, 56, 20);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) {
        let vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k);
        const yn = (vy + h / 2) / h;
        const ang = Math.atan2(vz, vx);
        const talus = Math.pow(clamp(1.0 - yn, 0, 1), 2.2) * 0.32;
        const flute1 = sx.ridged(Math.cos(ang) * 3.8 + cx * 0.005, Math.sin(ang) * 3.8 + cz * 0.005, 2) * 0.18 - 0.08;
        const flute2 = sx.ridged(Math.cos(ang) * 9.5 + cx * 0.01, Math.sin(ang) * 9.5 + cz * 0.01, 2) * 0.07 - 0.03;
        const ledgeStep = (Math.floor(yn * 12.0) / 12.0 - yn) * 0.045 + Math.sin(yn * 28.0) * 0.014;
        const radScale = 1.0 + talus + (flute1 + flute2 + ledgeStep) * (0.28 + 0.72 * yn);
        vx *= radScale; vz *= radScale;
        if (yn > 0.96) {
          vy += sx.fbm((vx + cx) / 65, (vz + cz) / 65, 2) * 1.4;
        }
        p.setXYZ(k, vx + cx, vy + baseDuneY, vz + cz);
      }
      geo.computeVertexNormals();
      mg.push(geo);
    }
    const mesaMat = new THREE.MeshStandardMaterial({ color: 0xc48858, roughness: 0.92 });
    mesaMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMesaW;\nvarying vec3 vMesaN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMesaW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvMesaN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vMesaW;\nvarying vec3 vMesaN;\n${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // Eroded sandstone mesa cliffs: horizontal sedimentary rock strata + vertical sandstone buttresses & crevices
          float uFlute = vMesaW.x * 0.055 + vMesaW.z * 0.055;
          float vFlute1 = ridged2(vec2(uFlute, vMesaW.y * 0.004));
          float vFlute2 = ridged2(vec2(vMesaW.x * 0.14 - vMesaW.z * 0.14, vMesaW.y * 0.009));
          float yWarp = vMesaW.y + fbm2_3(vMesaW.xz * 0.008) * 5.0;
          float hStrata1 = fbm2_3(vec2(yWarp * 0.28, uFlute * 0.25));
          float hStrata2 = smoothstep(0.28, 0.72, fract(yWarp * 0.18 + hStrata1 * 0.4));
          float hFine = 0.5 + 0.5 * sin(yWarp * 1.4 + hStrata1 * 3.0);
          float hBed = hStrata1 * 0.46 + hStrata2 * 0.34 + hFine * 0.20;
          vec3 cCrevice = vec3(0.24, 0.14, 0.08);
          vec3 cMid     = vec3(0.68, 0.44, 0.26);
          vec3 cLit     = vec3(1.02, 0.76, 0.45);
          vec3 cSand    = vec3(0.92, 0.72, 0.46);
          vec3 rockC = mix(cCrevice, cMid, clamp(hBed * 0.58 + vFlute1 * 0.42, 0.0, 1.0));
          rockC = mix(rockC, cLit, smoothstep(0.42, 0.82, hBed * 0.55 + vFlute2 * 0.45));
          float creviceAO = smoothstep(0.36, 0.08, vFlute1) * 0.42 + smoothstep(0.28, 0.05, hStrata2) * 0.28;
          rockC *= 1.0 - creviceAO;
          float sandBlend = smoothstep(0.55, 0.88, vMesaN.y) + smoothstep(52.0, 8.0, vMesaW.y) * 0.68;
          diffuseColor.rgb = mix(rockC, cSand, clamp(sandBlend, 0.0, 0.88));
        `)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            float eM = 0.5;
            float yW = vMesaW.y * 0.12 + fbm2_3(vMesaW.xz * 0.008) * 0.45;
            float h0 = ridged2(vec2(vMesaW.x * 0.065 + vMesaW.z * 0.065, vMesaW.y * 0.005)) + 0.40 * ridged2(vec2(vMesaW.x * 0.18 - vMesaW.z * 0.18, vMesaW.y * 0.012)) + sin(yW * 2.4) * 0.28;
            float hx = ridged2(vec2((vMesaW.x + eM) * 0.065 + vMesaW.z * 0.065, vMesaW.y * 0.005)) + 0.40 * ridged2(vec2((vMesaW.x + eM) * 0.18 - vMesaW.z * 0.18, vMesaW.y * 0.012)) + sin(yW * 2.4) * 0.28;
            float hz = ridged2(vec2(vMesaW.x * 0.065 + (vMesaW.z + eM) * 0.065, vMesaW.y * 0.005)) + 0.40 * ridged2(vec2(vMesaW.x * 0.18 - (vMesaW.z + eM) * 0.18, vMesaW.y * 0.012)) + sin(yW * 2.4) * 0.28;
            vec3 dNM = vec3((h0 - hx) * 2.4, 0.0, (h0 - hz) * 2.4);
            normal = normalize(normal + (viewMatrix * vec4(dNM, 0.0)).xyz);
          }
        `)
        .replace('#include <fog_fragment>', `
          #ifdef USE_FOG
            float dMesa = length(cameraPosition - vMesaW);
            float dustPlume = 0.72 + 0.28 * fbm2_3(vec2(vMesaW.x * 0.006 + vMesaW.z * 0.006, vMesaW.y * 0.018));
            float baseDust = exp(-max(vMesaW.y - 14.0, 0.0) * 0.026) * 0.52 * dustPlume;
            float upperHaze = smoothstep(580.0, 2300.0, dMesa) * 0.28;
            float fMesa = clamp(max(upperHaze, (1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth)) * 0.48) + baseDust, 0.0, 0.72);
            vec3 dustCol = mix(fogColor, vec3(0.96, 0.78, 0.52), smoothstep(85.0, 0.0, vMesaW.y) * 0.55);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, dustCol, fMesa);
          #endif
        `);
    };
    const mm = new THREE.Mesh(mergeGeometries(mg), mesaMat);
    // All mesas are >= 900m from origin, outside the [-24..24m] shadow camera frustum
    mm.receiveShadow = true; mm.castShadow = false;
    g.add(mm);

    // Wind-blown golden sand haze ribbons drifting over mid-ground dune crests & troughs
    const sandMistMat = new THREE.ShaderMaterial({
      uniforms: { uTime: timeU },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        ${GLSL_NOISE}
        void main(){
          vec2 u = vUv - 0.5;
          float env = smoothstep(0.5, 0.08, abs(u.x)) * smoothstep(0.5, 0.06, abs(u.y));
          float n = fbm2_3(vec2(vUv.x * 3.8 - uTime * 0.12, vUv.y * 2.4));
          float a = env * (0.35 + 0.65 * n) * 0.16;
          vec3 col = mix(vec3(0.90, 0.68, 0.42), vec3(1.0, 0.86, 0.60), vUv.y * 0.6 + n * 0.4);
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const [hx, hy, hz, hw, hh, hry] of [
      [-85, 16, -95, 160, 22, 0.45],
      [65, 14, -140, 190, 24, -0.25],
      [-150, 20, -180, 210, 28, 0.32],
      [15, 13, -185, 220, 25, 0.05],
    ]) {
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(hw, hh), sandMistMat);
      sm.position.set(hx, hy, hz);
      sm.rotation.y = hry;
      g.add(sm);
    }

    // Wind sock + fuel bladder near pad
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.4 }));
    pole.position.set(22, 3.5, -14); g.add(pole);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.8, 12, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff6a1a, side: THREE.DoubleSide, roughness: 0.8 }));
    sock.position.set(23.4, 6.8, -14); g.add(sock);
    const bl = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 5, 6, 12).rotateZ(Math.PI / 2).scale(1, 0.55, 1), new THREE.MeshStandardMaterial({ color: 0x3a3428, roughness: 0.85 }));
    bl.position.set(-20, 0.75, 16); bl.castShadow = bl.receiveShadow = true; g.add(bl);
    return {
      group: g, padY, heightAt: height, floor: 0,
      update(dt, t) {
        timeU.value = t;
        sock.rotation.x = Math.sin(t * 3) * 0.12;
        sock.rotation.y = Math.sin(t * 1.3) * 0.2;
      },
    };
  },
};

// ============================================================ 3. NEON
const neon = {
  id: 'neon', name: 'Neon', sub: 'Kowloon arcology · monsoon · 02:40', swatch: '#ff2bd6',
  accent: '#ff2bd6', night: true, beam: 0.65,
  sky: { top: '#050812', horizon: '#141e34', bottom: '#03050a', sharp: 0.48, sunDir: [0.2, 0.7, 0.3], sunColor: '#687898', sunSize: 0.0, sunGlow: 0.06, clouds: 0.85, cloudColor: '#1c2842', cloudShadow: '#080c16', cloudScale: 1.15, cloudCover: 0.78 },
  fog: { color: '#0c1324', density: 0.00075 },
  sun: { color: '#687898', intensity: 0.44 }, hemi: { sky: '#283856', ground: '#0a0e18', intensity: 0.38 },
  exposure: 0.88, envIntensity: 0.64,
  bloom: { strength: 0.62, radius: 0.44, threshold: 0.88 },
  grade: { lift: [0.002, 0.003, 0.006], gain: [1.01, 1.00, 1.03], vignette: 0.38, grain: 0.035, ca: 0.0012 },
  weather: { kind: 'rain', count: 4000, color: '#b8cce8', fall: 28, wind: [3, 1], len: 0.034, opacity: 0.26, box: 110 },
  ambience: { wind: 0.2, rain: 0.6, hum: 0.5 },
  livery: { paint: '#181b22', paint2: '#101218', trim: '#090b0f', blade: '#101216', glow: '#ff2bd6', glowIntensity: 3.6, glass: '#180c24', irid: 1.0, decal: '#d0d8e4', rough: 0.30, metal: 0.72, interior: '#1a1d22', missile: '#22242a' },
  build(ctx) {
    const g = new THREE.Group(), rnd = mulberry32(99), padY = 0;
    const timeU = { value: 0 };

    // Half-res planar reflection render target for the wet plaza & helipad
    const reflRT = new THREE.WebGLRenderTarget(800, 450, {
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      depthBuffer: true,
    });
    const reflCam = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 4500);
    const reflTexU = { value: reflRT.texture };
    const reflVPU = { value: new THREE.Matrix4() };
    const reflPlaneY = 0.26;

    // Wet ground with street-light grid & long neon puddle reflections
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x2 = c.getContext('2d');
    x2.fillStyle = '#030407'; x2.fillRect(0, 0, 512, 512);
    x2.fillStyle = '#0a0b10';
    x2.fillRect(0, 0, 512, 64); x2.fillRect(0, 448, 512, 64); x2.fillRect(0, 0, 64, 512); x2.fillRect(448, 0, 64, 512);
    x2.fillStyle = '#ffd890';
    for (let i = 0; i < 512; i += 32) { x2.fillRect(i, 2, 14, 3); x2.fillRect(i, 507, 14, 3); x2.fillRect(2, i, 3, 14); x2.fillRect(507, i, 3, 14); }
    x2.fillStyle = '#ffb060';
    for (let i = 16; i < 512; i += 64) { x2.beginPath(); x2.arc(i, 60, 4, 0, 7); x2.fill(); x2.beginPath(); x2.arc(i, 452, 4, 0, 7); x2.fill(); x2.beginPath(); x2.arc(60, i, 4, 0, 7); x2.fill(); x2.beginPath(); x2.arc(452, i, 4, 0, 7); x2.fill(); }
    x2.fillStyle = '#ff2050'; for (let i = 100; i < 420; i += 40) x2.fillRect(i, 20, 18, 4);
    x2.fillStyle = '#e8f0ff'; for (let i = 100; i < 420; i += 40) x2.fillRect(i, 40, 18, 4);
    const et = new THREE.CanvasTexture(c); et.wrapS = et.wrapT = THREE.RepeatWrapping; et.repeat.set(100, 100); et.colorSpace = THREE.SRGBColorSpace; et.anisotropy = 8;

    // Shared wet-puddle planar reflection shader for plaza and ground
    const applyWetPlazaShader = (mat, isPlaza) => {
      mat.customProgramCacheKey = () => 'wet_plaza_' + (isPlaza ? '1' : '0');
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = timeU;
        sh.uniforms.uReflTex = reflTexU;
        sh.uniforms.uReflVP = reflVPU;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWetW;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWetW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>\nvarying vec3 vWetW;\nuniform float uTime;\nuniform sampler2D uReflTex;\nuniform mat4 uReflVP;\n${GLSL_NOISE}
          float wetSplashLayer(vec2 xz, float scS, float offS, float t){
            vec2 sCell = floor(xz * scS + offS);
            vec2 sUV = fract(xz * scS + offS) - 0.5;
            float sH = hash12(sCell);
            if (sH < 0.58) return 0.0;
            vec2 sOff = (vec2(hash12(sCell + 3.1), hash12(sCell + 8.7)) - 0.5) * 0.34;
            float sR = length(sUV - sOff);
            float sPh = fract(t * (1.25 + sH * 0.55) + sH * 6.28);
            float rRad = 0.16 + sPh * 0.30;
            float hollow = smoothstep(0.08, 0.13, sR);
            float ring1 = smoothstep(0.026, 0.0, abs(sR - rRad));
            float ring2 = smoothstep(0.022, 0.0, abs(sR - rRad * 0.58)) * 0.55;
            return (ring1 + ring2) * hollow * (1.0 - sPh) * smoothstep(0.05, 0.18, sPh);
          }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            {
              float nPudC = fbm2_3(vWetW.xz * 0.065) * 0.68 + fbm2_3(vWetW.xz * 0.24) * 0.32;
              float pudC = smoothstep(0.32, 0.56, nPudC);
              float asphGrain = (vnoise(vWetW.xz * 3.4) - 0.5) * 0.032 + (vnoise(vWetW.xz * 14.0) - 0.5) * 0.018;
              diffuseColor.rgb = mix(diffuseColor.rgb + asphGrain, diffuseColor.rgb * 0.16, pudC);
            }
          `)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            float nPud = fbm2_3(vWetW.xz * 0.065) * 0.68 + fbm2_3(vWetW.xz * 0.24) * 0.32;
            float puddle = smoothstep(0.32, 0.56, nPud);
            roughnessFactor = mix(0.54, 0.014, puddle);
          `)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            {
              vec2 wpXZ = vWetW.xz;
              float nPud2 = fbm2_3(wpXZ * 0.065) * 0.68 + fbm2_3(wpXZ * 0.24) * 0.32;
              float pudMask = smoothstep(0.32, 0.56, nPud2);
              float eW = 0.16;
              float h0 = (vnoise(wpXZ * 2.2) * 0.65 + vnoise(wpXZ * 9.5) * 0.35) * (1.0 - pudMask * 0.90);
              float hx = (vnoise((wpXZ + vec2(eW, 0.)) * 2.2) * 0.65 + vnoise((wpXZ + vec2(eW, 0.)) * 9.5) * 0.35) * (1.0 - pudMask * 0.90);
              float hz = (vnoise((wpXZ + vec2(0., eW)) * 2.2) * 0.65 + vnoise((wpXZ + vec2(0., eW)) * 9.5) * 0.35) * (1.0 - pudMask * 0.90);
              if (pudMask > 0.04) {
                vec2 rCell0 = floor(wpXZ * 1.35);
                vec2 rF0 = fract(wpXZ * 1.35) - 0.5;
                float rPh0 = fract(uTime * 1.45 + hash12(rCell0));
                float rD0 = length(rF0);
                h0 += sin((rD0 - rPh0 * 0.44) * 38.0) * exp(-rD0 * 5.8) * (1.0 - rPh0) * pudMask * 0.24;
                vec2 rCell1 = floor(wpXZ * 2.15 + 19.3);
                vec2 rF1 = fract(wpXZ * 2.15 + 19.3) - 0.5;
                float rPh1 = fract(uTime * 1.85 + hash12(rCell1));
                float rD1 = length(rF1);
                h0 += sin((rD1 - rPh1 * 0.44) * 38.0) * exp(-rD1 * 5.8) * (1.0 - rPh1) * pudMask * 0.24;
              }
              vec3 dNW = vec3((h0 - hx) * 0.26, 0.0, (h0 - hz) * 0.26);
              normal = normalize(normal + (viewMatrix * vec4(dNW, 0.0)).xyz);
            }
          `)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            {
              vec3 Vw = normalize(cameraPosition - vWetW);
              float fresW = 0.24 + 0.76 * pow(clamp(1.0 - max(Vw.y, 0.0), 0.0, 1.0), 2.1);
              float nP = fbm2_3(vWetW.xz * 0.065) * 0.68 + fbm2_3(vWetW.xz * 0.24) * 0.32;
              float pud = smoothstep(0.32, 0.56, nP);
              vec4 clipR = uReflVP * vec4(vWetW.x, ${reflPlaneY.toFixed(2)}, vWetW.z, 1.0);
              if (clipR.w > 0.1) {
                vec2 baseUV = clipR.xy / clipR.w * 0.5 + 0.5;
                vec2 rCell = floor(vWetW.xz * 1.45);
                vec2 rF = fract(vWetW.xz * 1.45) - 0.5;
                float rPhase = fract(uTime * 1.45 + hash12(rCell));
                vec2 rainRip = normalize(rF + vec2(1e-4)) * sin((length(rF) - rPhase * 0.45) * 36.0) * exp(-length(rF) * 5.8) * (1.0 - rPhase) * 0.0056 * pud;
                vec2 microN = vec2(vnoise(vWetW.xz * 3.0) - 0.5, vnoise(vWetW.xz * 3.0 + 6.1) - 0.5) * mix(0.018, 0.0025, pud);
                float vSpread = mix(0.068, 0.0045, pud);
                vec2 uv0 = clamp(baseUV + rainRip + microN, 0.002, 0.998);
                vec2 dUV = vec2(0.0018 * (1.0 - pud), vSpread * 0.65);
                vec3 reflCol = texture2D(uReflTex, uv0).rgb * 0.46
                             + texture2D(uReflTex, clamp(uv0 + dUV, 0.002, 0.998)).rgb * 0.27
                             + texture2D(uReflTex, clamp(uv0 - dUV, 0.002, 0.998)).rgb * 0.27;
                float reflBoost = mix(${isPlaza ? '0.28' : '0.20'}, ${isPlaza ? '1.35' : '1.05'}, pud) * fresW;
                totalEmissiveRadiance += reflCol * reflBoost;
              }
              // Expanding hollow concentric raindrop ripple rings in wet puddles
              float dCamSplash = length(cameraPosition.xz - vWetW.xz);
              float splashFade = smoothstep(65.0, 12.0, dCamSplash);
              if (splashFade > 0.01 && pud > 0.05) {
                float splashGlow = wetSplashLayer(vWetW.xz, 1.05, 0.0, uTime)
                                 + wetSplashLayer(vWetW.xz, 1.72, 13.7, uTime);
                vec3 spTint = mix(vec3(0.28, 0.78, 0.98), vec3(0.92, 0.36, 0.82), 0.5 + 0.5 * sin(vWetW.x * 0.09 + vWetW.z * 0.09));
                totalEmissiveRadiance += spTint * splashGlow * splashFade * pud * 0.16;
              }
              // Concentric plaza ring & cyan/magenta puddle reflections
              float rPlz = length(vWetW.xz);
              float ringCyan = exp(-abs(rPlz - 13.1) * 0.65) * 0.85 + exp(-abs(rPlz - 30.0) * 0.45) * 0.55 + exp(-abs(rPlz - 60.0) * 0.45) * 0.50;
              float ringMag = exp(-abs(rPlz - 92.0) * 0.45) * 0.50 + exp(-abs(rPlz - 22.0) * 0.25) * 0.28;
              totalEmissiveRadiance += (vec3(0.18, 0.88, 1.0) * ringCyan + vec3(0.95, 0.16, 0.72) * ringMag) * (0.28 + 0.72 * pud);
            }
          `);
      };
    };

    const groundMat = new THREE.MeshStandardMaterial({ color: 0x040508, roughness: 0.26, metalness: 0.55, emissive: 0xffffff, emissiveMap: et, emissiveIntensity: 0.28, envMapIntensity: 0.55 });
    applyWetPlazaShader(groundMat, false);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), groundMat);
    ground.receiveShadow = true;
    g.add(ground);

    // Plaza with wet near-black asphalt, concentric neon rings & planar puddle reflections
    const plazaMat = new THREE.MeshStandardMaterial({ color: 0x05070b, roughness: 0.24, metalness: 0.52, envMapIntensity: 0.60 });
    applyWetPlazaShader(plazaMat, true);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(98, 96).rotateX(-Math.PI / 2), plazaMat);
    plaza.position.y = 0.02; plaza.receiveShadow = true; g.add(plaza);

    const ringM = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2bd6, emissiveIntensity: 1.6 });
    const ringCyanM = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x5ef2ff, emissiveIntensity: 2.0 });
    const ringMeshes = [];
    for (const [r, mat] of [[30, ringCyanM], [60, ringCyanM], [92, ringM]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.18, 128).rotateX(-Math.PI / 2), mat);
      ring.position.y = 0.04; g.add(ring); ringMeshes.push(ring);
    }
    const padObj = helipad(g, padY + 0.3, {
      base: '#080b10', line: '#dce4ee', accent: '#9ab0c8', lights: '#38f8ff',
      side: 0x0c1018, rough: 0.24, metal: 0.48, envInt: 0.55, surfaceMode: 2,
      lightInt: 5.5, poolInt: 0.90, reflTex: reflTexU, reflVP: reflVPU, timeU,
    });

    // Buildings: preserve exact RNG sequence for list so billboard attachments & heights match target 1:1
    const list = [];
    for (let i = -26; i < 26; i++) for (let j = -26; j < 26; j++) {
      const cx = i * 80 + 40, cz = j * 80 + 40, r = Math.hypot(cx, cz);
      if (r < 125) continue;
      const sub = rnd() < 0.45 ? 2 : 1;
      for (let s = 0; s < sub; s++) for (let t = 0; t < sub; t++) {
        const w = sub === 2 ? 22 + rnd() * 6 : 36 + rnd() * 22, d = sub === 2 ? 22 + rnd() * 6 : 36 + rnd() * 22;
        const ox = sub === 2 ? (s - 0.5) * 30 : 0, oz = sub === 2 ? (t - 0.5) * 30 : 0;
        const down = Math.exp(-((cx - 420) ** 2 + (cz + 300) ** 2) / (2 * 650 ** 2));
        const hgt = clamp(18 + rnd() ** 2.2 * 90 + down * 70 * rnd() + (r < 300 ? 25 * rnd() : 0), 12, 165);
        list.push([cx + ox, cz + oz, w, hgt, d]);
      }
    }
    const extraTowers = [
      [-110, -180, 38, 178, 36],
      [-55, -210, 34, 195, 34],
      [25, -230, 36, 172, 36],
      [95, -195, 32, 164, 32],
      [155, -165, 38, 158, 36],
      [-145, -130, 34, 152, 34],
    ];
    const allBlds = [...list, ...extraTowers];

    // Near-black glass & concrete facades with architectural spandrel ledges, vertical pilasters & mechanical floors
    const bmat = new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.30, metalness: 0.56, envMapIntensity: 0.48 });
    bmat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; varying vec4 vInst;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          mat4 instM = modelMatrix * instanceMatrix;
          vWP = (instM*vec4(position,1.)).xyz; vWN = normalize(mat3(instM)*normal);
          vInst = vec4(floor(instanceMatrix[3].xz + 0.5), floor(instanceMatrix[1].y + 0.5), floor(instanceMatrix[0].x + 0.5));`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; varying vec4 vInst; uniform float uTime;\n' + GLSL_NOISE)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 anN = abs(vWN);
            if (anN.y < 0.5) {
              vec2 fcN = anN.x > anN.z ? vec2(vWP.z, vWP.y) : vec2(vWP.x, vWP.y);
              vec2 fN = fract(fcN / vec2(3.2, 3.5));
              float ledgeN = sin(fN.y * 6.28318) * 0.28 + sin(fract(fcN.y / 14.0) * 6.28318) * 0.35;
              float pilN = sin(fract(fcN.x / 12.8) * 6.28318) * 0.26;
              vec3 dNB = anN.x > anN.z ? vec3(0.0, ledgeN, pilN) : vec3(pilN, ledgeN, 0.0);
              normal = normalize(normal + (viewMatrix * vec4(dNB * 0.45, 0.0)).xyz);
            }
          }
        `)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec3 an = abs(vWN);
            vec2 instXY = floor(vInst.xy + 0.5);
            float seed = hash12(instXY);
            float h = vInst.z;
            float distB = length(vWP.xz);
            float dCam = length(cameraPosition - vWP);
            if (an.y < 0.5) {
              vec2 fc = an.x > an.z ? vec2(vWP.z, vWP.y) : vec2(vWP.x, vWP.y);
              vec2 cs = vec2(3.2, 3.5);
              vec2 uvG = fc / cs;
              vec2 cell = floor(uvG);
              vec2 f = fract(uvG);
              float px = clamp(dCam * 0.00042, 0.014, 0.14);
              float pilaster = smoothstep(0.82 - px, 0.85 + px, fract(fc.x / (cs.x * 4.0)));
              float mechBand = step(0.86, fract(cell.y / 12.0));
              float spandrel = smoothstep(0.24 - px, 0.27 + px, f.y) * (1.0 - smoothstep(0.77 - px, 0.80 + px, f.y)) * (1.0 - mechBand);
              float mullion = smoothstep(0.15 - px, 0.18 + px, f.x) * (1.0 - smoothstep(0.82 - px, 0.85 + px, f.x));
              float win = mullion * spandrel * (1.0 - pilaster);
              float lodFade = smoothstep(780.0, 220.0, dCam);
              float faceIdx = an.x > an.z ? (vWN.x > 0.0 ? 1.0 : 2.0) : (vWN.z > 0.0 ? 3.0 : 4.0);
              float floorHash = hash12(vec2(cell.y, instXY.x + instXY.y * 13.0 + faceIdx * 7.0));
              float suiteHash = hash12(vec2(floor(cell.x * 0.5), cell.y + instXY.x * 3.0 + faceIdx * 19.0));
              float cellHash  = hash12(cell + instXY * 17.0 + vec2(faceIdx * 31.0, 0.0));
              // Clean dark floor bands + grouped horizontal office suites
              float darkFloor = step(0.28, floorHash);
              float litProb = (0.18 + 0.38 * step(0.54, floorHash)) * darkFloor;
              float r = mix(suiteHash, cellHash, 0.45);
              float lit = step(1.0 - litProb, r);
              float colSeed = hash12(vec2(floor(cell.x * 0.5) + instXY.x, cell.y + instXY.y));
              vec3 wcWarm = mix(vec3(1.0, 0.72, 0.34), vec3(1.0, 0.90, 0.68), floorHash);
              vec3 wcCool = mix(vec3(0.32, 0.88, 1.0), vec3(0.76, 0.94, 1.0), suiteHash);
              vec3 wc = mix(wcWarm, wcCool, step(0.56, colSeed));
              wc = mix(wc, vec3(1.0, 0.28, 0.78), step(0.88, colSeed));
              float roomGrad = 0.68 + 0.32 * f.y;
              float blinds = mix(1.0, 0.86 + 0.14 * step(0.45, fract(f.y * 4.0)), smoothstep(240.0, 90.0, dCam));
              float winGlow = mix(litProb * 0.42 * spandrel, win * lit * roomGrad * blinds, lodFade);
              totalEmissiveRadiance += wc * winGlow * 1.75 * step(3.5, vWP.y);
              // Subtle neon roofline trim on select towers
              float band = step(h - 1.8, vWP.y) * step(vWP.y, h - 1.1) * step(0.62, seed);
              vec3 nc = mix(vec3(1.0, 0.22, 0.78), vec3(0.18, 0.88, 1.0), step(0.52, seed));
              totalEmissiveRadiance += nc * band * 1.25;
              // Near-black concrete/steel architectural spandrels, ledges & dark unlit glass
              float ledgeHighlight = smoothstep(0.18, 0.24, f.y) * (1.0 - smoothstep(0.24, 0.30, f.y));
              vec3 facBase = mix(vec3(0.006, 0.008, 0.013), vec3(0.020, 0.025, 0.038), (1.0 - spandrel) * 0.55 + pilaster * 0.45 + ledgeHighlight * 0.35);
              diffuseColor.rgb = mix(facBase, vec3(0.002, 0.004, 0.008), win * (1.0 - lit));
              // Very subtle street-level neon bounce only at the very bottom (< 12m) so facades stay near-black
              float lowGlow = exp(-max(vWP.y - 3.5, 0.0) * 0.10) * smoothstep(380.0, 85.0, distB);
              vec3 bounceCol = mix(vec3(0.16, 0.06, 0.22), vec3(0.05, 0.16, 0.24), 0.5 + 0.5 * sin(instXY.x * 0.02 + instXY.y * 0.02));
              totalEmissiveRadiance += bounceCol * lowGlow * 0.06;
            } else {
              // Rooftop gravel/concrete slab with subtle wet sheen
              diffuseColor.rgb = vec3(0.008, 0.010, 0.016);
            }
          }`)
        .replace('#include <fog_fragment>', `
          #ifdef USE_FOG
            float dBld = length(cameraPosition - vWP);
            // Subtle dark rainy monsoon depth haze (no bright cartoon lavender wash!)
            float layerHaze = smoothstep(170.0, 720.0, dBld) * (0.42 + 0.20 * exp(-max(vWP.y - 20.0, 0.0) * 0.015));
            float fBld = clamp(max(1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth), layerHaze), 0.0, 0.78);
            vec3 hazeCol = mix(vec3(0.07, 0.08, 0.13), vec3(0.03, 0.04, 0.08), smoothstep(0.0, 165.0, vWP.y));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeCol, fBld);
          #endif
        `);
    };
    // High-detail Kowloon skyscraper unit geometry:
    // main shaft + protruding horizontal floor ledges + vertical corner/face pilasters + stepped setbacks + roof parapet + rooftop HVAC/elevator penthouses
    const bgParts = [
      new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      // Podium & mid-rise architectural setback tiers
      new THREE.BoxGeometry(1.06, 0.16, 1.06).translate(0, 0.08, 0),
      new THREE.BoxGeometry(1.03, 0.42, 1.03).translate(0, 0.21, 0),
      // Horizontal protruding floor/mechanical ledges along shaft height
      new THREE.BoxGeometry(1.045, 0.016, 1.045).translate(0, 0.28, 0),
      new THREE.BoxGeometry(1.045, 0.016, 1.045).translate(0, 0.52, 0),
      new THREE.BoxGeometry(1.045, 0.016, 1.045).translate(0, 0.76, 0),
      new THREE.BoxGeometry(1.055, 0.022, 1.055).translate(0, 0.99, 0),
      // Vertical structural pilasters / buttress fins on all 4 faces
      new THREE.BoxGeometry(1.04, 0.98, 0.08).translate(0, 0.49, 0.26),
      new THREE.BoxGeometry(1.04, 0.98, 0.08).translate(0, 0.49, -0.26),
      new THREE.BoxGeometry(0.08, 0.98, 1.04).translate(0.26, 0.49, 0),
      new THREE.BoxGeometry(0.08, 0.98, 1.04).translate(-0.26, 0.49, 0),
      // Rooftop parapet walls (hollow perimeter wall around main roof)
      new THREE.BoxGeometry(1.02, 0.035, 0.04).translate(0, 1.017, 0.49),
      new THREE.BoxGeometry(1.02, 0.035, 0.04).translate(0, 1.017, -0.49),
      new THREE.BoxGeometry(0.04, 0.035, 0.94).translate(0.49, 1.017, 0),
      new THREE.BoxGeometry(0.04, 0.035, 0.94).translate(-0.49, 1.017, 0),
      // Multi-tier setback penthouses & offset mechanical/HVAC enclosures
      new THREE.BoxGeometry(0.74, 0.12, 0.74).translate(0, 1.06, 0),
      new THREE.BoxGeometry(0.77, 0.016, 0.77).translate(0, 1.12, 0),
      new THREE.BoxGeometry(0.44, 0.09, 0.44).translate(-0.08, 1.165, 0.06),
      new THREE.BoxGeometry(0.24, 0.06, 0.28).translate(0.20, 1.15, -0.14),
      new THREE.BoxGeometry(0.18, 0.05, 0.22).translate(-0.22, 1.145, -0.18),
    ];
    const bg = mergeGeometries(bgParts);
    const blds = new THREE.InstancedMesh(bg, bmat, allBlds.length);
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion();
    allBlds.forEach(([x, z, w, h, d], i) => { mt.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(w, h, d)); blds.setMatrixAt(i, mt); });
    blds.castShadow = true; blds.receiveShadow = true;
    g.add(blds);

    // Rooftop antenna spires, communications masts, cooling towers, water tanks & facade HVAC/pipe clutter
    const tall = allBlds.filter(b => b[3] > 90);
    const spireMat = new THREE.MeshStandardMaterial({ color: 0x0c1018, roughness: 0.36, metalness: 0.82 });
    const spireUnitGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.08, 0.38, 18, 6).translate(0, 9, 0),
      new THREE.CylinderGeometry(0.04, 0.14, 14, 6).translate(2.4, 7, -1.8),
      new THREE.BoxGeometry(1.8, 0.18, 0.18).translate(0, 11.5, 0),
      new THREE.BoxGeometry(0.18, 0.18, 1.8).translate(0, 14.5, 0),
    ]);
    const spires = new THREE.InstancedMesh(spireUnitGeo, spireMat, tall.length);
    const avMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2222, emissiveIntensity: 4.2 });
    const av = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), avMat, tall.length * 2);
    tall.forEach(([x, z, w, h, d], i) => {
      mt.makeTranslation(x, h * 1.18, z); spires.setMatrixAt(i, mt);
      mt.makeTranslation(x + w * 0.35, h * 1.14 + 0.5, z + d * 0.35); av.setMatrixAt(i * 2, mt);
      mt.makeTranslation(x, h * 1.18 + 18.2, z); av.setMatrixAt(i * 2 + 1, mt);
    });
    g.add(spires, av);

    // Dedicated rooftop & facade greeble clutter on visible towers (cooling units, water tanks, radar dishes, vertical pipe conduits)
    const clutterRnd = mulberry32(777);
    const nearClutterBlds = allBlds.filter(b => Math.hypot(b[0], b[1]) < 620 && b[3] > 28);
    const roofClutterGeo = mergeGeometries([
      // Twin cylindrical rooftop water tanks on steel frame
      new THREE.CylinderGeometry(1.4, 1.4, 3.2, 10).translate(-3.2, 2.2, -2.6),
      new THREE.CylinderGeometry(1.2, 1.2, 2.8, 10).translate(-0.2, 2.0, -2.8),
      // Louvered HVAC chiller bank + exhaust ducts
      new THREE.BoxGeometry(4.2, 2.2, 2.8).translate(2.8, 1.1, 2.2),
      new THREE.CylinderGeometry(0.55, 0.55, 1.6, 8).translate(1.8, 2.6, 2.2),
      new THREE.CylinderGeometry(0.55, 0.55, 1.6, 8).translate(3.6, 2.6, 2.2),
      // Angled microwave comms dish + mast
      new THREE.CylinderGeometry(0.14, 0.22, 6.5, 6).translate(3.5, 3.25, -3.2),
      new THREE.ConeGeometry(1.35, 0.7, 10, 1, true).rotateX(Math.PI * 0.42).translate(3.5, 5.4, -2.8),
    ]);
    const roofClutterMesh = new THREE.InstancedMesh(roofClutterGeo, spireMat, nearClutterBlds.length);
    const eClutter = new THREE.Euler();
    nearClutterBlds.forEach(([x, z, w, h, d], i) => {
      const sc = clamp(Math.min(w, d) / 34, 0.55, 1.25);
      q.setFromEuler(eClutter.set(0, Math.floor(clutterRnd() * 4) * (Math.PI * 0.5), 0));
      mt.compose(new THREE.Vector3(x, h * 1.06, z), q, new THREE.Vector3(sc, sc, sc));
      roofClutterMesh.setMatrixAt(i, mt);
    });
    roofClutterMesh.castShadow = roofClutterMesh.receiveShadow = true;
    g.add(roofClutterMesh);

    // Holographic & LED facade billboards facing the plaza: crisp glowing HUD screens mounted on dark obsidian backings
    const near = list.filter(b => Math.hypot(b[0], b[1]) < 650 && b[3] > 40);
    const bbMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
      vertexShader: `varying vec2 vUv; varying float vSeed;
#include <fog_pars_vertex>
        void main(){
          vUv = uv;
          vec3 iPos = floor(instanceMatrix[3].xyz + 0.5);
          vSeed = fract(iPos.x * 0.0137 + iPos.z * 0.0071 + iPos.y * 0.0053);
          vec4 mvPosition = viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.); gl_Position = projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vSeed;
#include <fog_pars_fragment>
        ${GLSL_NOISE}
        void main(){
          float sId = floor(vSeed * 256.0);
          float pal = fract(sId * 0.173);
          vec3 a = pal < 0.38 ? vec3(1.0, 0.20, 0.76) : pal < 0.76 ? vec3(0.14, 0.88, 1.0) : vec3(1.0, 0.76, 0.22);
          vec3 b = mix(vec3(1.0, 0.74, 0.28), vec3(0.68, 0.32, 1.0), step(0.45, fract(sId * 0.29)));
          vec2 u = vUv;
          float scan = 0.88 + 0.12 * sin(u.y * 92.0);
          // Sleek horizontal scan-bars & equalizer telemetry (no window-like rectangular blocks!)
          float rowId = floor(u.y * 10.0);
          float rowFill = 0.28 + 0.60 * hash12(vec2(rowId, sId));
          float bars = smoothstep(0.32, 0.38, fract(u.y * 10.0)) * smoothstep(0.84, 0.78, fract(u.y * 10.0)) * step(0.08, u.x) * step(u.x, 0.08 + rowFill);
          float fineTicks = step(0.65, fract(u.x * 24.0)) * smoothstep(0.38, 0.44, fract(u.y * 18.0)) * smoothstep(0.72, 0.66, fract(u.y * 18.0)) * step(0.08, u.x) * step(u.x, 0.92);
          float radC = length((u - vec2(0.5, 0.54)) * vec2(1.0, 1.34));
          float circ = smoothstep(0.15, 0.12, radC) * 0.82 + smoothstep(0.030, 0.007, abs(radC - 0.24)) * 0.96;
          float circRing = smoothstep(0.022, 0.005, abs(radC - 0.34));
          float mode = fract(sId * 0.37);
          float m = mode < 0.62 ? max(circ + circRing, bars * 0.28) : bars * 0.72 + fineTicks * 0.42;
          vec3 bgCol = mix(vec3(0.005, 0.007, 0.012), a * 0.05, 0.35);
          vec3 fgCol = mix(a, b, u.y * 0.60) * 1.62;
          vec3 col = mix(bgCol, fgCol, clamp(m, 0.0, 1.0)) * scan;
          float frame = step(u.x, 0.028) + step(0.972, u.x) + step(u.y, 0.024) + step(0.976, u.y);
          float innerFrame = (step(abs(u.x - 0.5), 0.45) - step(abs(u.x - 0.5), 0.442)) * step(abs(u.y - 0.5), 0.46);
          col += a * clamp(frame, 0.0, 1.0) * 1.82 + b * innerFrame * 0.68;
          gl_FragColor = vec4(col, 0.96);
          #include <fog_fragment>
        }`,
      fog: true, side: THREE.DoubleSide, transparent: false, depthWrite: true,
    });
    // Preserve exact rnd() sequence for primary billboards first
    const primaryPlacements = near.map(([x, z, w, h, d]) => {
      const toC = new THREE.Vector3(-x, 0, -z).normalize();
      let n, px, pz, span;
      if (Math.abs(toC.x) > Math.abs(toC.z)) { n = new THREE.Vector3(Math.sign(toC.x), 0, 0); px = x + n.x * (w / 2 + 0.35); pz = z; span = d; }
      else { n = new THREE.Vector3(0, 0, Math.sign(toC.z)); px = x; pz = z + n.z * (d / 2 + 0.35); span = w; }
      const bw = Math.min(span * 0.7, 18 + rnd() * 10), bh = bw * (0.6 + rnd() * 1.2);
      const y = clamp(h * (0.45 + rnd() * 0.35), bh / 2 + 6, h - bh / 2 - 2);
      return { px, y, pz, bw, bh, n };
    });

    // Flying traffic lanes (consuming exact same rnd() sequence!)
    const lanes = [];
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI, alt = 55 + rnd() * 110;
      const off = (rnd() - 0.5) * 1600;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      lanes.push({ dir, base: perp.multiplyScalar(off).setY(alt), speed: (30 + rnd() * 40) * (rnd() < 0.5 ? -1 : 1) });
    }
    const NC = 700;
    const cp = new Float32Array(NC * 3), cc = new Float32Array(NC * 3), cs = [];
    for (let i = 0; i < NC; i++) {
      const L = lanes[i % lanes.length];
      cs.push({ L, t: (rnd() - 0.5) * 3000, lat: (rnd() - 0.5) * 6 });
      const col = L.speed > 0 ? [1, 0.95, 0.9] : [1, 0.15, 0.1];
      cc.set(col.map(v => v * 2.2), i * 3);
    }

    // Add secondary neon signs ONLY on the perpendicular side face so two billboards never overlap on the same building face!
    const rnd2 = mulberry32(314);
    const extraPlacements = [];
    for (const [x, z, w, h, d] of allBlds) {
      const r = Math.hypot(x, z);
      if (r > 480 || h < 42) continue;
      if (rnd2() > 0.65) continue;
      const toC = new THREE.Vector3(-x, 0, -z).normalize();
      let n, px, pz, span, latOff = (rnd2() - 0.5) * 0.22;
      if (Math.abs(toC.x) <= Math.abs(toC.z)) {
        n = new THREE.Vector3(Math.sign(toC.x || 1), 0, 0);
        px = x + n.x * (w / 2 + 0.35); pz = z + latOff * d; span = d;
      } else {
        n = new THREE.Vector3(0, 0, Math.sign(toC.z || 1));
        px = x + latOff * w; pz = z + n.z * (d / 2 + 0.35); span = w;
      }
      const bw = Math.min(span * 0.56, 12 + rnd2() * 8);
      const bh = bw * (0.75 + rnd2() * 0.85);
      const y = clamp(14 + rnd2() * Math.min(h - bh - 6, 62), bh / 2 + 5, h - bh / 2 - 2);
      extraPlacements.push({ px, y, pz, bw, bh, n });
    }
    const allSignPlacements = [...primaryPlacements, ...extraPlacements];
    const bb = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), bbMat, allSignPlacements.length);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x080a10, roughness: 0.5, metalness: 0.7 });
    const bbFrames = new THREE.InstancedMesh(new THREE.BoxGeometry(1.03, 1.03, 0.32).translate(0, 0, -0.18), frameMat, allSignPlacements.length);
    allSignPlacements.forEach(({ px, y, pz, bw, bh, n }, i) => {
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      mt.compose(new THREE.Vector3(px, y, pz), q, new THREE.Vector3(bw, bh, 1));
      bb.setMatrixAt(i, mt);
      bbFrames.setMatrixAt(i, mt);
    });
    g.add(bbFrames, bb);

    const cgeo = new THREE.BufferGeometry();
    cgeo.setAttribute('position', new THREE.BufferAttribute(cp, 3));
    cgeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    const cars = new THREE.Points(cgeo, new THREE.PointsMaterial({ size: 2.0, vertexColors: true, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
    cars.frustumCulled = false;
    g.add(cars);

    // Giant hologram pylon at the plaza edge
    const holo = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 60, 48, 1, true), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float l = step(.5, fract(vUv.y*40. - uTime*2.)); float s = step(.8, fract(vUv.x*12. + uTime*.1));
        vec3 c = mix(vec3(.1,.9,1.), vec3(1.,.2,.8), vUv.y); float a = (.08 + .18*l*s + .28*smoothstep(.97,1.,vUv.y)) * smoothstep(0.,.1,vUv.y);
        gl_FragColor = vec4(c*1.4*a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    holo.position.set(70, 30, -70);
    g.add(holo);

    // 3D rain splash micro-crowns & rebounding water droplets across the helipad and wet plaza
    const NSPLASH = 520;
    const spPos = new Float32Array(NSPLASH * 3);
    const spSeed = new Float32Array(NSPLASH);
    const spRnd = mulberry32(909);
    for (let i = 0; i < NSPLASH; i++) {
      const a = spRnd() * Math.PI * 2;
      const u = spRnd();
      const r = u < 0.45 ? Math.sqrt(spRnd()) * 13.5 : 13.5 + Math.pow(spRnd(), 1.35) * 68.0;
      const sx = Math.cos(a) * r, sz = Math.sin(a) * r;
      const sy = (r < 13.8 ? padY + 0.31 : 0.03) + spRnd() * 0.14;
      spPos[i * 3] = sx;
      spPos[i * 3 + 1] = sy;
      spPos[i * 3 + 2] = sz;
      spSeed[i] = spRnd();
    }
    const spGeo = new THREE.BufferGeometry();
    spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    spGeo.setAttribute('aSeed', new THREE.BufferAttribute(spSeed, 1));
    const splashMat = new THREE.ShaderMaterial({
      uniforms: { uTime: timeU },
      vertexShader: `attribute float aSeed; uniform float uTime; varying float vAlpha; varying float vSeed; varying float vPh;
        void main(){
          vSeed = aSeed;
          float ph = fract(uTime * (2.4 + aSeed * 1.6) + aSeed * 17.3);
          vPh = ph;
          vec3 p = position;
          p.y += sin(ph * 3.14159) * 0.04;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vAlpha = sin(ph * 3.14159) * (1.0 - ph) * smoothstep(55.0, 8.0, -mv.z);
          gl_PointSize = clamp((1.4 + aSeed * 1.4) * (28.0 / max(-mv.z, 3.0)), 1.0, 3.8);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vAlpha; varying float vSeed; varying float vPh;
        void main(){
          vec2 u = (gl_PointCoord - 0.5) * vec2(1.0, 2.2);
          float r = length(u) * 2.0;
          if (r > 1.0 || vAlpha < 0.02) discard;
          float ringRad = 0.35 + vPh * 0.55;
          float crown = smoothstep(0.22, 0.0, abs(r - ringRad)) * smoothstep(0.18, 0.36, r);
          vec3 c = mix(vec3(0.32, 0.82, 1.0), vec3(0.95, 0.35, 0.82), step(0.55, vSeed));
          gl_FragColor = vec4(c, crown * vAlpha * 0.24);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const splashPoints = new THREE.Points(spGeo, splashMat);
    g.add(splashPoints);

    const floor = 175;
    const grid = new Map();
    allBlds.forEach(b => { const k = Math.floor(b[0] / 80) + ',' + Math.floor(b[1] / 80); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); });
    const nearIdx = (i, j) => grid.get(i + ',' + j) || [];
    const heightAt = (x, z) => {
      if (Math.hypot(x, z) < 110) return padY;
      const i = Math.floor(x / 80), j = Math.floor(z / 80);
      let top = 0;
      for (const b of nearIdx(i, j)) if (Math.abs(x - b[0]) < b[2] / 2 && Math.abs(z - b[1]) < b[4] / 2) top = Math.max(top, b[3]);
      return top;
    };
    const _fwd = new THREE.Vector3(), _look = new THREE.Vector3();
    return {
      group: g, padY, heightAt, floor, floorRadius: 110,
      update(dt, t, camera, renderer, scene, skyMesh) {
        timeU.value = t; bbMat.uniforms.uTime.value = t; holo.material.uniforms.uTime.value = t;
        avMat.emissiveIntensity = (Math.sin(t * 3) > 0.6 ? 4.2 : 0.9);
        for (let i = 0; i < NC; i++) {
          const c0 = cs[i]; c0.t += c0.L.speed * dt; if (c0.t > 1500) c0.t -= 3000; if (c0.t < -1500) c0.t += 3000;
          cp[i * 3] = c0.L.base.x + c0.L.dir.x * c0.t - c0.L.dir.z * c0.lat;
          cp[i * 3 + 1] = c0.L.base.y;
          cp[i * 3 + 2] = c0.L.base.z + c0.L.dir.z * c0.t + c0.L.dir.x * c0.lat;
        }
        cgeo.attributes.position.needsUpdate = true;

        // Render half-res planar reflection when camera is above plaza level
        if (camera && renderer && scene && camera.position.y > reflPlaneY + 0.05) {
          camera.updateMatrixWorld();
          const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
          _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
          reflCam.fov = camera.fov;
          reflCam.aspect = camera.aspect;
          reflCam.near = camera.near;
          reflCam.far = 4500;
          reflCam.position.set(cx, 2 * reflPlaneY - cy, cz);
          _look.set(cx + _fwd.x * 60, 2 * reflPlaneY - (cy + _fwd.y * 60), cz + _fwd.z * 60);
          reflCam.up.set(0, 1, 0);
          reflCam.lookAt(_look);
          reflCam.updateMatrixWorld();
          reflCam.updateProjectionMatrix();
          reflVPU.value.multiplyMatrices(reflCam.projectionMatrix, reflCam.matrixWorldInverse);

          const prevRT = renderer.getRenderTarget();
          const prevShadow = renderer.shadowMap.autoUpdate;
          renderer.shadowMap.autoUpdate = false;
          ground.visible = false;
          plaza.visible = false;
          padObj.mesh.visible = false;
          splashPoints.visible = false;
          for (const rm of ringMeshes) rm.visible = false;
          if (skyMesh) skyMesh.position.copy(reflCam.position);

          renderer.setRenderTarget(reflRT);
          renderer.clear();
          renderer.render(scene, reflCam);
          renderer.setRenderTarget(prevRT);

          renderer.shadowMap.autoUpdate = prevShadow;
          if (skyMesh) skyMesh.position.copy(camera.position);
          ground.visible = true;
          plaza.visible = true;
          padObj.mesh.visible = true;
          splashPoints.visible = true;
          for (const rm of ringMeshes) rm.visible = true;
        }
      },
    };
  },
};

// ============================================================ 4. TEMPEST
const tempest = {
  id: 'tempest', name: 'Tempest', sub: 'North Atlantic · sea state 7 · rig Ægir', swatch: '#9fd8ff',
  accent: '#9fd8ff', night: true, beam: 0.6,
  sky: { top: '#070e17', horizon: '#1a2838', bottom: '#05080e', sharp: 0.50, sunDir: [-0.35, 0.45, -0.82], sunColor: '#98bce0', sunSize: 0, sunGlow: 0.30, clouds: 1.0, cloudColor: '#2e4052', cloudShadow: '#080e16', cloudScale: 0.72, cloudCover: 0.86 },
  fog: { color: '#14202c', density: 0.00125 },
  sun: { color: '#b8d4f0', intensity: 2.55 }, hemi: { sky: '#4e6c8a', ground: '#16202c', intensity: 0.96 },
  exposure: 0.98, envIntensity: 1.12,
  bloom: { strength: 0.54, radius: 0.42, threshold: 0.88 },
  grade: { lift: [0.004, 0.008, 0.014], gain: [0.97, 1.01, 1.06], vignette: 0.40, grain: 0.04, ca: 0.0012 },
  weather: { kind: 'rain', count: 5600, color: '#ccddef', fall: 27, wind: [-9, 4], len: 0.042, opacity: 0.34, box: 105 },
  ambience: { wind: 0.7, rain: 0.8, hum: 0, storm: true },
  livery: { paint: '#687380', paint2: '#4c5662', trim: '#282e36', blade: '#2c3238', glow: '#9fd8ff', glowIntensity: 3.0, glass: '#1c2a38', irid: 0.7, decal: '#22272d', rough: 0.46, metal: 0.52, interior: '#2a2f36', missile: '#4a4f55' },
  build(ctx) {
    const g = new THREE.Group(), deckY = 24, padY = 24.25;
    const amp = 4.35;
    const timeU = { value: 0 };
    const water = waterMesh({ y: 0, deep: '#030b14', shallow: '#102838', sky: '#24384c', horizon: '#32485c', amp, foam: 1.25, sunDir: [-0.35, 0.45, -0.82], sunColor: '#a8c6e2', spec: 0.82, detail: 1.45, freq: 1 });
    g.add(water);

    // Procedural weathered steel & grated catwalk materials
    const steel = new THREE.MeshStandardMaterial({ color: 0x323a42, roughness: 0.36, metalness: 0.74 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.42, metalness: 0.78 });
    const rustSteel = new THREE.MeshStandardMaterial({ color: 0x543c2c, roughness: 0.62, metalness: 0.56 });
    const pipeSteel = new THREE.MeshStandardMaterial({ color: 0x4a5460, roughness: 0.28, metalness: 0.85 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0x9a7832, roughness: 0.34, metalness: 0.78 });
    const craneYellow = new THREE.MeshStandardMaterial({ color: 0xb48820, roughness: 0.44, metalness: 0.46 });
    const red = new THREE.MeshStandardMaterial({ color: 0x72241b, roughness: 0.52, metalness: 0.44 });
    const valveRed = new THREE.MeshStandardMaterial({ color: 0xc42618, roughness: 0.38, metalness: 0.52 });
    const buoyOrange = new THREE.MeshStandardMaterial({ color: 0xe85218, roughness: 0.46, metalness: 0.18 });

    // High-contrast industrial steel bar-grating texture for main rig deck & perimeter catwalks
    const gc = document.createElement('canvas'); gc.width = gc.height = 512;
    const gx = gc.getContext('2d');
    gx.fillStyle = '#0c1015'; gx.fillRect(0, 0, 512, 512);
    // Fine bearing bars & twisted cross rods
    for (let i = 0; i < 512; i += 8) {
      gx.fillStyle = '#2d3640'; gx.fillRect(i, 0, 3, 512);
    }
    for (let j = 0; j < 512; j += 16) {
      gx.fillStyle = '#384350'; gx.fillRect(0, j, 512, 3);
    }
    // Heavy framing I-beam panel borders & bolt heads
    for (let i = 0; i < 512; i += 64) {
      for (let j = 0; j < 512; j += 128) {
        gx.strokeStyle = '#485464'; gx.lineWidth = 5;
        gx.strokeRect(i + 2.5, j + 2.5, 59, 123);
        gx.fillStyle = '#627082';
        for (const [bx, by] of [[i + 7, j + 7], [i + 57, j + 7], [i + 7, j + 121], [i + 57, j + 121]]) {
          gx.fillRect(bx - 2, by - 2, 4, 4);
        }
      }
    }
    const grateTex = new THREE.CanvasTexture(gc); grateTex.wrapS = grateTex.wrapT = THREE.RepeatWrapping; grateTex.repeat.set(20, 20); grateTex.colorSpace = THREE.SRGBColorSpace; grateTex.anisotropy = 8;
    const deckMat = new THREE.MeshStandardMaterial({ map: grateTex, roughness: 0.26, metalness: 0.72, envMapIntensity: 1.20 });
    deckMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDeckW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDeckW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vDeckW;\nuniform float uTime;\n${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 dXZ = vDeckW.xz;
            float nRust = fbm2_3(dXZ * 0.22);
            float edgeRust = smoothstep(19.0, 24.0, max(abs(dXZ.x), abs(dXZ.y)));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.18, 0.10), edgeRust * 0.55 + nRust * 0.16);
          }
        `)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          {
            float nP = fbm2_3(vDeckW.xz * 0.28);
            roughnessFactor = mix(0.05, 0.36, smoothstep(0.32, 0.64, nP));
          }
        `)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (vDeckW.y > 23.2) {
            vec2 gUV = vDeckW.xz * 12.0;
            float gxBar = sin(gUV.x * 6.28318) * 0.22;
            float gzBar = sin(gUV.y * 3.14159) * 0.18;
            vec3 dND = vec3(gxBar, 0.0, gzBar);
            normal = normalize(normal + (viewMatrix * vec4(dND, 0.0)).xyz);
          }
        `)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if (vDeckW.y > 23.5) {
            vec2 dXZ = vDeckW.xz;
            float nP = smoothstep(0.34, 0.62, fbm2_3(dXZ * 0.25));
            float grBar = 0.65 + 0.35 * step(0.15, sin(dXZ.x * 42.0) * sin(dXZ.y * 24.0));
            // Focused white-blue deck floodlight pools around the helideck and perimeter catwalks
            float pool = exp(-length(dXZ - vec2(-16.0, 11.5)) * 0.28) * 1.12
                       + exp(-length(dXZ - vec2(13.5, 12.0)) * 0.28) * 1.12
                       + exp(-length(dXZ - vec2(-13.5, -12.5)) * 0.28) * 0.85
                       + exp(-length(dXZ - vec2(16.5, -9.5)) * 0.28) * 0.85
                       + exp(-length(dXZ - vec2(13.2, -2.5)) * 0.30) * 0.98;
            vec3 Vd = normalize(cameraPosition - vDeckW);
            float fresD = 0.18 + 0.82 * pow(clamp(1.0 - max(Vd.y, 0.0), 0.0, 1.0), 2.4);
            totalEmissiveRadiance += vec3(0.74, 0.88, 1.0) * pool * (0.32 + 0.68 * nP * fresD) * grBar * 0.68;
            // Warm flare & right-side amber floodlight reflection on wet steel deck
            float warmPool = exp(-length(dXZ - vec2(-14.0, -14.0)) * 0.16) * 0.50
                           + exp(-length(dXZ - vec2(-8.0, -9.5)) * 0.15) * 0.68
                           + exp(-length(dXZ - vec2(18.0, 8.0)) * 0.16) * 0.44;
            totalEmissiveRadiance += vec3(1.0, 0.54, 0.15) * warmPool * (0.28 + 0.72 * nP) * grBar * 0.46;
          }
        `);
    };

    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };

    // Main platform deck + substructure I-beams + under-deck truss chords
    add(new THREE.BoxGeometry(48, 2.8, 48), deckMat, 0, deckY - 1.4, 0);
    add(new THREE.BoxGeometry(50, 0.5, 50), rustSteel, 0, deckY - 3.0, 0);

    // Painted "HX-9" deck stencil marking on the front-foreground grating (clearly visible in tempest_wide)
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 128;
    const sxCtx = sc.getContext('2d');
    sxCtx.clearRect(0, 0, 256, 128);
    sxCtx.strokeStyle = 'rgba(220, 230, 240, 0.78)';
    sxCtx.lineWidth = 6;
    sxCtx.strokeRect(8, 8, 240, 112);
    sxCtx.fillStyle = 'rgba(228, 236, 244, 0.88)';
    sxCtx.font = 'bold 68px sans-serif';
    sxCtx.textAlign = 'center';
    sxCtx.textBaseline = 'middle';
    sxCtx.fillText('HX-9', 128, 66);
    const stenTex = new THREE.CanvasTexture(sc); stenTex.colorSpace = THREE.SRGBColorSpace;
    const stenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 3.5).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: stenTex, transparent: true, roughness: 0.42, metalness: 0.35, polygonOffset: true, polygonOffsetFactor: -1 })
    );
    stenMesh.position.set(-5.8, deckY + 0.02, 16.5);
    stenMesh.rotation.y = Math.PI * 0.25;
    stenMesh.receiveShadow = true;
    g.add(stenMesh);

    // Cantilevered perimeter grated catwalks, safety railings, mid-rails, toe-boards & under-catwalk gusset brackets
    const catParts = [];
    for (const s of [-1, 1]) {
      catParts.push(new THREE.BoxGeometry(52, 0.20, 2.3).translate(0, deckY - 0.35, s * 25.1));
      catParts.push(new THREE.BoxGeometry(2.3, 0.20, 48).translate(s * 25.1, deckY - 0.35, 0));
      // Lower suspended inspection catwalk tier along front (+z) and left (-x) edges
      catParts.push(new THREE.BoxGeometry(46, 0.16, 1.4).translate(0, deckY - 2.35, s * 24.6));
      catParts.push(new THREE.BoxGeometry(1.4, 0.16, 44).translate(s * 24.6, deckY - 2.35, 0));
      for (const hrY of [0.15, 0.55, 0.95, 1.32]) {
        const hThick = hrY < 0.2 ? 0.22 : 0.055;
        catParts.push(new THREE.BoxGeometry(52.4, hThick, 0.055).translate(0, deckY - 0.25 + hrY, s * 26.15));
        catParts.push(new THREE.BoxGeometry(0.055, hThick, 52.4).translate(s * 26.15, deckY - 0.25 + hrY, 0));
        catParts.push(new THREE.BoxGeometry(48.4, hThick, 0.055).translate(0, deckY + hrY, s * 23.95));
        catParts.push(new THREE.BoxGeometry(0.055, hThick, 48.4).translate(s * 23.95, deckY + hrY, 0));
      }
      for (let p = -26; p <= 26; p += 2.2) {
        catParts.push(new THREE.BoxGeometry(0.065, 1.48, 0.065).translate(p, deckY + 0.45, s * 26.15));
        catParts.push(new THREE.BoxGeometry(0.065, 1.48, 0.065).translate(s * 26.15, deckY + 0.45, p));
        if (Math.abs(p) <= 24) {
          catParts.push(new THREE.BoxGeometry(0.065, 1.42, 0.065).translate(p, deckY + 0.7, s * 23.95));
          catParts.push(new THREE.BoxGeometry(0.065, 1.42, 0.065).translate(s * 23.95, deckY + 0.7, p));
        }
      }
      for (let p = -22; p <= 22; p += 3.6) {
        catParts.push(new THREE.BoxGeometry(0.16, 2.7, 0.16).rotateX(s * 0.65).translate(p, deckY - 1.5, s * 24.8));
        catParts.push(new THREE.BoxGeometry(0.16, 2.7, 0.16).rotateZ(-s * 0.65).translate(s * 24.8, deckY - 1.5, p));
      }
    }
    const catMesh = new THREE.Mesh(mergeGeometries(catParts), steel);
    catMesh.castShadow = catMesh.receiveShadow = true;
    g.add(catMesh);

    // High-detail industrial pipework, 90° elbows, bolted flanges, manifolds & red handwheel valves along deck perimeter, underdeck & derrick
    const pipeParts = [], valveParts = [], brassParts = [], buoyParts = [];
    for (const sEdge of [-1, 1]) {
      for (const rOff of [0, 0.52, 1.04, 1.56]) {
        const py = deckY - 0.58 - rOff * 0.58;
        pipeParts.push(new THREE.CylinderGeometry(0.24, 0.24, 46, 10).rotateZ(Math.PI / 2).translate(0, py, sEdge * 24.35));
        pipeParts.push(new THREE.CylinderGeometry(0.24, 0.24, 46, 10).rotateX(Math.PI / 2).translate(sEdge * 24.35, py, 0));
        pipeParts.push(new THREE.CylinderGeometry(0.28, 0.28, 44, 10).rotateZ(Math.PI / 2).translate(0, deckY - 2.05, sEdge * (22.9 - rOff * 0.65)));
        pipeParts.push(new THREE.CylinderGeometry(0.28, 0.28, 44, 10).rotateX(Math.PI / 2).translate(sEdge * (22.9 - rOff * 0.65), deckY - 2.05, 0));
        // Bolted pipe flanges & clamp collars every 5.0m
        for (let fp = -20; fp <= 20; fp += 5.0) {
          pipeParts.push(new THREE.CylinderGeometry(0.35, 0.35, 0.14, 10).rotateZ(Math.PI / 2).translate(fp, py, sEdge * 24.35));
          pipeParts.push(new THREE.CylinderGeometry(0.35, 0.35, 0.14, 10).rotateX(Math.PI / 2).translate(sEdge * 24.35, py, fp));
        }
      }
    }
    // Heavy over-the-edge 90° elbow drop-pipes & riser manifolds along front (+z) and left (-x) deck edges (prominent in tempest_wide)
    for (const ex of [-14.0, -9.5, -5.0, 4.5, 8.2, 11.8]) {
      pipeParts.push(new THREE.CylinderGeometry(0.28, 0.28, 3.6, 10).rotateX(Math.PI / 2).translate(ex, deckY + 0.35, 22.8));
      pipeParts.push(new THREE.SphereGeometry(0.32, 10, 8).translate(ex, deckY + 0.35, 24.6));
      pipeParts.push(new THREE.CylinderGeometry(0.28, 0.28, 5.2, 10).translate(ex, deckY - 2.25, 24.6));
      brassParts.push(new THREE.CylinderGeometry(0.36, 0.36, 0.18, 10).translate(ex, deckY - 0.6, 24.6));
      valveParts.push(new THREE.TorusGeometry(0.38, 0.06, 6, 12).translate(ex, deckY + 0.85, 23.2));
    }
    for (const ez of [-12.0, -7.0, -2.0, 9.5, 13.5, 17.5]) {
      pipeParts.push(new THREE.CylinderGeometry(0.28, 0.28, 3.6, 10).rotateZ(Math.PI / 2).translate(-22.8, deckY + 0.35, ez));
      pipeParts.push(new THREE.SphereGeometry(0.32, 10, 8).translate(-24.6, deckY + 0.35, ez));
      pipeParts.push(new THREE.CylinderGeometry(0.28, 0.28, 5.2, 10).translate(-24.6, deckY - 2.25, ez));
      brassParts.push(new THREE.CylinderGeometry(0.36, 0.36, 0.18, 10).translate(-24.6, deckY - 0.6, ez));
      valveParts.push(new THREE.TorusGeometry(0.38, 0.06, 6, 12).rotateY(Math.PI / 2).translate(-23.2, deckY + 0.85, ez));
    }
    // Vertical marine riser bundles & J-tubes with 90° bends into underdeck manifolds
    for (const [px, pz] of [[-21, 20], [-20, 21.5], [-19, 20.8], [21, 20], [20, 21.5], [19, 20.8], [-21, -20], [-19.8, -21.2], [21, -20], [19.8, -21.2]]) {
      pipeParts.push(new THREE.CylinderGeometry(0.30, 0.30, 28, 10).translate(px, deckY - 14, pz));
      for (let ry = deckY - 24; ry <= deckY - 2; ry += 4.5) {
        pipeParts.push(new THREE.CylinderGeometry(0.40, 0.40, 0.24, 10).translate(px, ry, pz));
      }
    }
    // Deck-level elbowed manifold stations, pressure gauges & red handwheel valves along all 4 catwalk edges
    for (let i = 0; i < 9; i++) {
      const vz = -16 + i * 3.8;
      // Left (-x) manifold station with vertical standpipe + 90-deg horizontal bend + flange + red valve wheel
      pipeParts.push(new THREE.CylinderGeometry(0.18, 0.18, 2.3, 8).translate(-23.2, deckY + 0.35, vz));
      pipeParts.push(new THREE.CylinderGeometry(0.18, 0.18, 1.3, 8).rotateZ(Math.PI / 2).translate(-23.75, deckY + 1.35, vz));
      pipeParts.push(new THREE.SphereGeometry(0.21, 8, 6).translate(-23.2, deckY + 1.35, vz));
      brassParts.push(new THREE.CylinderGeometry(0.23, 0.23, 0.15, 8).translate(-23.2, deckY + 0.85, vz));
      valveParts.push(new THREE.TorusGeometry(0.34, 0.055, 6, 12).rotateY(Math.PI / 2).translate(-22.82, deckY + 1.1, vz));
      // Front (+z) manifold station
      const vx = -18 + i * 3.8;
      pipeParts.push(new THREE.CylinderGeometry(0.18, 0.18, 2.3, 8).translate(vx, deckY + 0.35, 23.2));
      pipeParts.push(new THREE.CylinderGeometry(0.18, 0.18, 1.3, 8).rotateX(Math.PI / 2).translate(vx, deckY + 1.35, 23.75));
      pipeParts.push(new THREE.SphereGeometry(0.21, 8, 6).translate(vx, deckY + 1.35, 23.2));
      brassParts.push(new THREE.CylinderGeometry(0.23, 0.23, 0.15, 8).translate(vx, deckY + 0.85, 23.2));
      valveParts.push(new THREE.TorusGeometry(0.34, 0.055, 6, 12).translate(vx, deckY + 1.1, 22.82));
      // Rear (-z) manifold station (visible in tempest_hero behind helipad)
      pipeParts.push(new THREE.CylinderGeometry(0.18, 0.18, 2.4, 8).translate(vx * 0.85, deckY + 0.4, -23.2));
      pipeParts.push(new THREE.CylinderGeometry(0.18, 0.18, 1.3, 8).rotateX(Math.PI / 2).translate(vx * 0.85, deckY + 1.45, -23.8));
      valveParts.push(new THREE.TorusGeometry(0.34, 0.055, 6, 12).translate(vx * 0.85, deckY + 1.15, -22.82));
    }
    // Tall vertical standpipe & high-pressure mud riser bundle inside/alongside the Derrick (-16, deckY, -16) with 90° top elbows
    for (const [rx, rz, rh] of [
      [-14.2, -14.8, 34], [-14.7, -14.3, 32], [-15.2, -13.9, 29],
      [-16.0, -16.0, 39], [-17.4, -14.6, 26], [-13.6, -15.4, 22],
    ]) {
      pipeParts.push(new THREE.CylinderGeometry(0.18, 0.20, rh, 10).translate(rx, deckY + rh * 0.5, rz));
      // 90° elbow at top of each standpipe into derrick manifold
      pipeParts.push(new THREE.SphereGeometry(0.22, 8, 6).translate(rx, deckY + rh, rz));
      pipeParts.push(new THREE.CylinderGeometry(0.17, 0.17, 2.2, 8).rotateZ(Math.PI / 2).translate(rx - 1.1, deckY + rh, rz));
      for (let cy = 4; cy < rh; cy += 4.0) {
        brassParts.push(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 8).translate(rx, deckY + cy, rz));
      }
    }
    // Orange life-ring buoys mounted on perimeter safety railings
    for (const [bx, bz, rotY] of [[-23.8, 8, Math.PI / 2], [-23.8, -6, Math.PI / 2], [-8, 23.8, 0], [6, 23.8, 0], [-6, -23.8, 0], [10, -23.8, 0]]) {
      const bg2 = new THREE.TorusGeometry(0.42, 0.11, 8, 16);
      if (rotY) bg2.rotateY(rotY);
      bg2.translate(bx, deckY + 0.78, bz);
      buoyParts.push(bg2);
    }
    g.add(new THREE.Mesh(mergeGeometries(pipeParts), pipeSteel));
    g.add(new THREE.Mesh(mergeGeometries(valveParts), valveRed));
    g.add(new THREE.Mesh(mergeGeometries(brassParts), brassMat));
    g.add(new THREE.Mesh(mergeGeometries(buoyParts), buoyOrange));

    // 4 main support columns + heavy cross-bracing
    for (const sx2 of [-1, 1]) for (const sz of [-1, 1]) {
      add(new THREE.CylinderGeometry(2.3, 2.7, 70, 20), rustSteel, sx2 * 18, deckY - 38, sz * 18);
      add(new THREE.CylinderGeometry(2.9, 2.9, 2.5, 20), red, sx2 * 18, 1.2, sz * 18);
    }
    for (const y of [6, -8]) {
      add(new THREE.BoxGeometry(36, 1.1, 1.1), darkSteel, 0, y, 18); add(new THREE.BoxGeometry(36, 1.1, 1.1), darkSteel, 0, y, -18);
      add(new THREE.BoxGeometry(1.1, 1.1, 36), darkSteel, 18, y, 0); add(new THREE.BoxGeometry(1.1, 1.1, 36), darkSteel, -18, y, 0);
    }
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.45, 0.45, 40, 10), darkSteel, 0, 8, s * 18, 0, 0, 1.0);
      add(new THREE.CylinderGeometry(0.45, 0.45, 40, 10), darkSteel, s * 18, 8, 0, 1.0, 0, 0);
    }

    // Derrick lattice tower (-16, deckY, -16) with dense X-bracing, intermediate service platforms & work lights
    const der = [];
    const H = 42, b0 = 5.2, b1 = 1.3;
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = new THREE.Vector3(dx * b0, 0, dz * b0), b = new THREE.Vector3(dx * b1, H, dz * b1);
      const geo = new THREE.CylinderGeometry(0.28, 0.34, a.distanceTo(b), 8);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
      geo.translate((a.x + b.x) / 2, H / 2, (a.z + b.z) / 2); der.push(geo);
    }
    for (let i = 0; i < 10; i++) {
      const y0 = i * 4, y1 = (i + 1) * 4;
      const w0 = lerp(b0, b1, y0 / H) * 2, w1 = lerp(b0, b1, y1 / H) * 2;
      der.push(
        new THREE.BoxGeometry(w0, 0.24, 0.24).translate(0, y0, w0 / 2),
        new THREE.BoxGeometry(w0, 0.24, 0.24).translate(0, y0, -w0 / 2),
        new THREE.BoxGeometry(0.24, 0.24, w0).translate(w0 / 2, y0, 0),
        new THREE.BoxGeometry(0.24, 0.24, w0).translate(-w0 / 2, y0, 0)
      );
      if (i === 2 || i === 5 || i === 8) {
        // Cantilevered monkey-board / service grating platforms on the derrick
        der.push(new THREE.BoxGeometry(w0 + 1.4, 0.18, w0 + 1.4).translate(0, y0, 0));
        der.push(new THREE.BoxGeometry(w0 + 1.45, 0.06, 0.06).translate(0, y0 + 0.9, (w0 + 1.4) * 0.5));
        der.push(new THREE.BoxGeometry(0.06, 0.06, w0 + 1.45).translate((w0 + 1.4) * 0.5, y0 + 0.9, 0));
      }
      const diagLen = Math.hypot((w0 + w1) * 0.5, 4.0);
      const ang = Math.atan2((w0 + w1) * 0.5, 4.0);
      const ym = (y0 + y1) * 0.5, wm = (w0 + w1) * 0.25;
      for (const s of [-1, 1]) {
        der.push(new THREE.BoxGeometry(0.13, diagLen, 0.13).rotateZ(s * ang).translate(0, ym, wm));
        der.push(new THREE.BoxGeometry(0.13, diagLen, 0.13).rotateZ(s * ang).translate(0, ym, -wm));
        der.push(new THREE.BoxGeometry(0.13, diagLen, 0.13).rotateX(s * ang).translate(wm, ym, 0));
        der.push(new THREE.BoxGeometry(0.13, diagLen, 0.13).rotateX(s * ang).translate(-wm, ym, 0));
      }
    }
    const derM = new THREE.Mesh(mergeGeometries(der), red); derM.position.set(-16, deckY, -16); derM.castShadow = true; g.add(derM);
    const derLight = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2010, emissiveIntensity: 3.5 }));
    derLight.position.set(-16, deckY + H + 0.5, -16); g.add(derLight);
    const warmBulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb048, emissiveIntensity: 3.8 });
    const redBulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2818, emissiveIntensity: 3.8 });
    const workLightMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xe0f2ff, emissiveIntensity: 3.5 });
    add(new THREE.SphereGeometry(0.24, 8, 6), warmBulbMat, -12.1, deckY + 10.8, -14.8);
    add(new THREE.SphereGeometry(0.22, 8, 6), redBulbMat, -16.0, deckY + 13.5, -13.2);
    for (const [lx, ly, lz] of [[-12.2, deckY + 6.4, -12.6], [-19.4, deckY + 6.8, -13.5], [-19.8, deckY + 11.2, -12.2], [-9.8, deckY + 7.2, -11.5]]) {
      add(new THREE.SphereGeometry(0.20, 8, 6), workLightMat, lx, ly, lz);
    }

    // Helper to build open 4-chord lattice crane boom between two 3D points
    const buildLatticeBoom = (p0, p1, r0, r1, segs, mat) => {
      const dir = p1.clone().sub(p0);
      const len = dir.length();
      const parts = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const c0 = new THREE.Vector3(sx * r0, 0, sz * r0);
        const c1 = new THREE.Vector3(sx * r1, len, sz * r1);
        const cg = new THREE.CylinderGeometry(0.065, 0.08, c0.distanceTo(c1), 6);
        cg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c1.clone().sub(c0).normalize()));
        cg.translate((c0.x + c1.x) * 0.5, len * 0.5, (c0.z + c1.z) * 0.5);
        parts.push(cg);
      }
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs;
        const y0 = t0 * len, y1 = t1 * len, ym = (y0 + y1) * 0.5;
        const w0 = lerp(r0, r1, t0) * 2, w1 = lerp(r0, r1, t1) * 2, wm = (w0 + w1) * 0.25;
        const dL = Math.hypot((w0 + w1) * 0.5, len / segs);
        const ang = Math.atan2((w0 + w1) * 0.5, len / segs);
        parts.push(
          new THREE.BoxGeometry(w0, 0.05, 0.05).translate(0, y0, w0 * 0.5),
          new THREE.BoxGeometry(w0, 0.05, 0.05).translate(0, y0, -w0 * 0.5),
          new THREE.BoxGeometry(0.05, 0.05, w0).translate(w0 * 0.5, y0, 0),
          new THREE.BoxGeometry(0.05, 0.05, w0).translate(-w0 * 0.5, y0, 0),
          new THREE.BoxGeometry(0.04, dL, 0.04).rotateZ(ang).translate(0, ym, wm),
          new THREE.BoxGeometry(0.04, dL, 0.04).rotateZ(-ang).translate(0, ym, -wm),
          new THREE.BoxGeometry(0.04, dL, 0.04).rotateX(ang).translate(wm, ym, 0),
          new THREE.BoxGeometry(0.04, dL, 0.04).rotateX(-ang).translate(-wm, ym, 0)
        );
      }
      const bg = mergeGeometries(parts);
      bg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
      bg.translate(p0.x, p0.y, p0.z);
      const bm = new THREE.Mesh(bg, mat);
      bm.castShadow = bm.receiveShadow = true;
      g.add(bm);
    };

    // Crane 1 (yellow offshore crane boom framing upper-right of tempest_hero & visible in tempest_wide)
    const c1Base = new THREE.Vector3(21.0, deckY + 8.2, -13.0);
    const c1Tip = new THREE.Vector3(-5.8, deckY + 10.8, -15.2);
    add(new THREE.CylinderGeometry(1.0, 1.3, 7.2, 14), craneYellow, 21.5, deckY + 3.6, -12.5);
    add(new THREE.BoxGeometry(3.0, 2.2, 2.4), craneYellow, 21.5, deckY + 8.0, -12.5, 0, 0.45, 0);
    buildLatticeBoom(c1Base, c1Tip, 0.56, 0.32, 16, craneYellow);
    add(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), darkSteel, -5.8, deckY + 9.1, -15.2);
    add(new THREE.BoxGeometry(0.60, 0.84, 0.46), craneYellow, -5.8, deckY + 7.4, -15.2);
    // Draped catenary festoon hydraulic/power cables & top pendant stay wires along Crane 1 boom
    const c1Cables = [];
    for (let bSpan = 0; bSpan < 5; bSpan++) {
      const f0 = bSpan / 5, f1 = (bSpan + 1) / 5;
      const pA = c1Base.clone().lerp(c1Tip, f0);
      const pB = c1Base.clone().lerp(c1Tip, f1);
      for (let seg = 0; seg < 8; seg++) {
        const u0 = seg / 8, u1 = (seg + 1) / 8;
        const q0 = pA.clone().lerp(pB, u0);
        const q1 = pA.clone().lerp(pB, u1);
        q0.y -= 0.45 + Math.sin(u0 * Math.PI) * 0.95;
        q1.y -= 0.45 + Math.sin(u1 * Math.PI) * 0.95;
        const cDir = q1.clone().sub(q0);
        const cg = new THREE.CylinderGeometry(0.024, 0.024, cDir.length(), 5);
        cg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), cDir.clone().normalize()));
        cg.translate((q0.x + q1.x) * 0.5, (q0.y + q1.y) * 0.5, (q0.z + q1.z) * 0.5);
        c1Cables.push(cg);
      }
    }
    g.add(new THREE.Mesh(mergeGeometries(c1Cables), darkSteel));

    // Crane 2 on left deck edge (-23.2, deckY, 5.2): detailed offshore crane pedestal + turret + lattice boom framing left of tempest_wide
    const cpx = -23.2, cpz = 5.2;
    add(new THREE.CylinderGeometry(0.88, 1.10, 5.4, 16), rustSteel, cpx, deckY + 0.7, cpz);
    add(new THREE.CylinderGeometry(1.22, 1.22, 0.34, 16), steel, cpx, deckY + 2.7, cpz);
    add(new THREE.CylinderGeometry(1.62, 1.62, 0.14, 16), darkSteel, cpx, deckY + 1.9, cpz);
    add(new THREE.TorusGeometry(1.58, 0.045, 6, 20).rotateX(Math.PI / 2), steel, cpx, deckY + 2.65, cpz);
    for (let k = 0; k < 8; k++) {
      const ka = (k / 8) * Math.PI * 2;
      add(new THREE.BoxGeometry(0.09, 1.7, 0.45), rustSteel, cpx + Math.cos(ka) * 0.98, deckY + 0.95, cpz + Math.sin(ka) * 0.98, 0, -ka, 0);
    }
    add(new THREE.BoxGeometry(2.4, 1.9, 2.9), pipeSteel, cpx, deckY + 3.7, cpz, 0, -0.58, 0);
    add(new THREE.BoxGeometry(1.2, 1.5, 1.4), steel, cpx + 0.85, deckY + 3.9, cpz + 0.55, 0, -0.58, 0);
    add(new THREE.CylinderGeometry(0.58, 0.58, 1.8, 14).rotateZ(Math.PI / 2), darkSteel, cpx + 0.4, deckY + 3.5, cpz - 0.5, 0, -0.58, 0);
    buildLatticeBoom(new THREE.Vector3(cpx - 0.3, deckY + 4.5, cpz + 0.3), new THREE.Vector3(cpx + 0.6, deckY + 8.5, cpz - 0.6), 0.40, 0.24, 5, steel);
    buildLatticeBoom(new THREE.Vector3(cpx + 0.4, deckY + 3.7, cpz - 0.5), new THREE.Vector3(-10.5, deckY + 17.2, -9.5), 0.55, 0.28, 14, pipeSteel);
    const stayStart = new THREE.Vector3(cpx + 0.6, deckY + 8.5, cpz - 0.6);
    const boomTip = new THREE.Vector3(-10.5, deckY + 17.2, -9.5);
    const stayDir = boomTip.clone().sub(stayStart);
    const stayGeo = new THREE.CylinderGeometry(0.028, 0.028, stayDir.length(), 6);
    stayGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), stayDir.clone().normalize()));
    stayGeo.translate((stayStart.x + boomTip.x) * 0.5, (stayStart.y + boomTip.y) * 0.5, (stayStart.z + boomTip.z) * 0.5);
    g.add(new THREE.Mesh(stayGeo, darkSteel));
    add(new THREE.CylinderGeometry(0.03, 0.03, 7.6, 6), darkSteel, -11.4, deckY + 12.2, -8.2);
    add(new THREE.CylinderGeometry(0.03, 0.03, 7.6, 6), darkSteel, -11.2, deckY + 12.2, -8.0);
    add(new THREE.BoxGeometry(0.56, 0.88, 0.44), rustSteel, -11.3, deckY + 8.2, -8.1);

    // Industrial Accommodation Block (16.5, deckY + 5.25, 17.5)
    const wc = document.createElement('canvas'); wc.width = 512; wc.height = 256; const wx = wc.getContext('2d');
    wx.fillStyle = '#38414c'; wx.fillRect(0, 0, 512, 256);
    for (let x = 0; x < 512; x += 8) {
      wx.fillStyle = x % 16 === 0 ? 'rgba(18,22,28,0.45)' : 'rgba(90,102,115,0.22)';
      wx.fillRect(x, 0, 4, 256);
    }
    wx.fillStyle = '#222830';
    for (let r = 0; r <= 4; r++) wx.fillRect(0, r * 62, 512, 8);

    const em = document.createElement('canvas'); em.width = 512; em.height = 256; const ex = em.getContext('2d');
    ex.fillStyle = '#000000'; ex.fillRect(0, 0, 512, 256);
    const wRnd = mulberry32(44);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) {
      const wx0 = 14 + k * 49, wy0 = 18 + r * 62;
      wx.fillStyle = '#14181c'; wx.fillRect(wx0 - 2, wy0 - 2, 28, 30);
      const isLit = wRnd() < 0.56;
      if (isLit) {
        const warm = wRnd() < 0.7;
        wx.fillStyle = warm ? '#d8c098' : '#9cb8c8';
        wx.fillRect(wx0, wy0, 24, 26);
        wx.fillStyle = '#1c2228';
        wx.fillRect(wx0 + 11, wy0, 2, 26);
        wx.fillRect(wx0, wy0 + 12, 24, 2);
        ex.fillStyle = warm ? '#ffd898' : '#a8dcf4';
        ex.fillRect(wx0, wy0, 24, 26);
        ex.fillStyle = '#000000';
        ex.fillRect(wx0 + 11, wy0, 2, 26);
        ex.fillRect(wx0, wy0 + 12, 24, 2);
      } else {
        wx.fillStyle = '#1c2630';
        wx.fillRect(wx0, wy0, 24, 26);
      }
    }
    const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace;
    const emt = new THREE.CanvasTexture(em); emt.colorSpace = THREE.SRGBColorSpace;
    const accMat = new THREE.MeshStandardMaterial({
      map: wt, emissiveMap: emt, emissive: 0xffffff, emissiveIntensity: 0.72,
      roughness: 0.52, metalness: 0.45,
    });
    add(new THREE.BoxGeometry(13, 10.5, 9), accMat, 16.5, deckY + 5.25, 17.5);
    const qWalk = [];
    for (let fl = 1; fl <= 4; fl++) {
      const fy = deckY + fl * 2.55;
      qWalk.push(new THREE.BoxGeometry(13.8, 0.14, 9.8).translate(16.5, fy, 17.5));
      qWalk.push(new THREE.BoxGeometry(13.9, 0.04, 9.9).translate(16.5, fy + 0.9, 17.5));
      qWalk.push(new THREE.BoxGeometry(13.9, 0.04, 9.9).translate(16.5, fy + 0.45, 17.5));
    }
    for (let k = 0; k <= 5; k++) {
      const qx = 10 + k * 2.6;
      qWalk.push(new THREE.BoxGeometry(0.14, 11.4, 0.14).translate(qx, deckY + 5.7, 12.65));
      qWalk.push(new THREE.BoxGeometry(0.14, 11.4, 0.14).translate(qx, deckY + 5.7, 22.35));
    }
    g.add(new THREE.Mesh(mergeGeometries(qWalk), darkSteel));

    // Helideck: dark wet steel pad + green perimeter fixtures
    helipad(g, padY, {
      base: '#151b22', line: '#dce4ec', accent: '#c8a228', lights: '#32ff72',
      side: 0x1e242a, r: 14, surfaceMode: 3, rough: 0.24, metal: 0.46,
      lightInt: 3.8, poolInt: 0.62, timeU,
    });

    // Tall vertical lattice flare boom behind accommodation block + secondary flare mast by derrick
    const buildFlareTower = (fx, fz, fh) => {
      const fp = [];
      for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
        fp.push(new THREE.CylinderGeometry(0.1, 0.14, fh, 6).translate(fx + dx, deckY + fh / 2, fz + dz));
      }
      for (let y = 2; y < fh; y += 2.5) {
        fp.push(new THREE.BoxGeometry(1.3, 0.08, 1.3).translate(fx, deckY + y, fz));
      }
      fp.push(new THREE.CylinderGeometry(0.22, 0.28, fh + 1.5, 8).translate(fx, deckY + (fh + 1.5) / 2, fz));
      g.add(new THREE.Mesh(mergeGeometries(fp), darkSteel));
    };
    buildFlareTower(20.5, 6.5, 22);
    buildFlareTower(-21.5, -18.5, 23);

    // Hot turbulent gas flare flames
    const flameMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vP;
        void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime; varying vec2 vUv; varying vec3 vP;
        ${GLSL_NOISE}
        void main(){
          vec2 u = vUv;
          float h = u.y;
          float center = abs(u.x - 0.5) * 2.0;
          float n1 = fbm2_3(vec2(u.x * 5.5, h * 4.5 - uTime * 4.5));
          float n2 = ridged2(vec2(u.x * 11.0 + 3.1, h * 9.0 - uTime * 7.2));
          float width = mix(0.16, 0.78, pow(clamp(h, 0.0, 1.0), 0.62)) * (0.55 + 0.62 * n1);
          float shape = smoothstep(width, width * 0.08, center + (n2 - 0.5) * 0.24 * h) * smoothstep(0.0, 0.10, h) * smoothstep(1.0, 0.26, h + (n1 - 0.5) * 0.42);
          vec3 cCore = vec3(1.0, 0.98, 0.88) * 3.2;
          vec3 cMid = vec3(1.0, 0.60, 0.14) * 2.2;
          vec3 cTip = vec3(0.92, 0.24, 0.04) * 1.05;
          vec3 col = mix(cMid, cCore, smoothstep(0.48, 0.06, center + h * 0.30));
          col = mix(col, cTip, smoothstep(0.36, 0.86, h));
          gl_FragColor = vec4(col * shape, shape * 0.96);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const makeFlameCluster = (x, y, z, scale = 1) => {
      const fg = new THREE.Group();
      fg.position.set(x, y, z);
      for (let a = 0; a < 4; a++) {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(4.0 * scale, 7.0 * scale).translate(0, 3.0 * scale, 0), flameMat);
        plane.rotation.y = (a / 4) * Math.PI;
        plane.rotation.z = -0.18;
        fg.add(plane);
      }
      g.add(fg);
      return fg;
    };
    makeFlameCluster(20.5, deckY + 23.2, 6.5, 0.98);
    makeFlameCluster(-21.5, deckY + 24.2, -18.5, 0.72);

    // Scene lights: gas flares, right-side warm sodium floodlight, and cool overhead deck floodlights for wet naval grey sheen
    const fl = new THREE.PointLight(0xff8e36, 220, 48, 1.8); fl.position.set(20.5, deckY + 25, 6.5); g.add(fl);
    const fl2 = new THREE.PointLight(0xff9840, 68, 28, 1.8); fl2.position.set(-9.5, deckY + 8, -11.5); g.add(fl2);
    const deckFlood1 = new THREE.PointLight(0xd4ecff, 110, 42, 1.5); deckFlood1.position.set(-14, deckY + 9, 13); g.add(deckFlood1);
    const deckFlood2 = new THREE.PointLight(0xd4ecff, 115, 42, 1.5); deckFlood2.position.set(13, deckY + 8, 9); g.add(deckFlood2);
    const craneLight = new THREE.PointLight(0xd0e8ff, 78, 30, 1.5); craneLight.position.set(-26.5, deckY + 6.5, 20.5); g.add(craneLight);

    // Deck floodlight stanchions & glowing fixtures around helipad perimeter + catwalk corners
    const floodBulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f4ff, emissiveIntensity: 4.5 });
    const floodPositions = [
      [-16.0, 11.5], [13.5, 12.0], [-13.5, -12.5], [16.5, -9.5], [13.0, -2.5], [-6.0, 19.0],
    ];
    for (const [fx, fz] of floodPositions) {
      add(new THREE.CylinderGeometry(0.14, 0.18, 0.55, 10), steel, fx, deckY + 0.28, fz);
      add(new THREE.BoxGeometry(0.46, 0.26, 0.30), darkSteel, fx, deckY + 0.62, fz, 0, Math.atan2(-fx, -fz), 0);
      add(new THREE.SphereGeometry(0.17, 8, 6), floodBulbMat, fx, deckY + 0.62, fz);
    }
    // Corner catwalk amber & white navigation/work stanchion lights
    for (const [cx, cz] of [[-25.5, 25.5], [25.5, 25.5], [-25.5, -25.5], [25.5, -25.5]]) {
      add(new THREE.CylinderGeometry(0.08, 0.10, 1.8, 8), steel, cx, deckY + 0.9, cz);
      add(new THREE.SphereGeometry(0.16, 8, 6), warmBulbMat, cx, deckY + 1.85, cz);
    }

    // Tight, realistic light halos & warm right-side sodium floodlight glow
    const haloSprites = [];
    const addHalo = (x, y, z, size, colHex, opacity) => {
      const sm = new THREE.SpriteMaterial({
        map: dotTexture(), color: new THREE.Color(colHex),
        transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      });
      const sp = new THREE.Sprite(sm);
      sp.position.set(x, y, z);
      sp.scale.set(size, size, 1);
      g.add(sp);
      haloSprites.push(sp);
    };
    addHalo(-12.1, deckY + 10.8, -14.8, 3.8, '#ffaa38', 0.76);
    addHalo(-16.0, deckY + 13.5, -13.2, 2.8, '#ff3020', 0.70);
    addHalo(-12.2, deckY + 6.4, -12.6, 3.4, '#d8f0ff', 0.68);
    addHalo(-19.4, deckY + 6.8, -13.5, 3.2, '#d8f0ff', 0.62);
    addHalo(-19.8, deckY + 11.2, -12.2, 3.2, '#d8f0ff', 0.62);
    addHalo(-9.8, deckY + 7.2, -11.5, 3.4, '#d8f0ff', 0.65);
    // Warm right-side sodium floodlight haze in tempest_hero
    addHalo(-10.2, deckY + 5.0, -14.2, 12.0, '#ff9838', 0.24);
    // Flare towers: tight hot glow around the flames
    addHalo(20.5, deckY + 25.4, 6.5, 7.5, '#ff9838', 0.38);
    addHalo(20.5, deckY + 25.0, 6.5, 3.4, '#fff2c8', 0.72);
    addHalo(-21.5, deckY + 26.0, -18.5, 5.8, '#ff9838', 0.34);
    addHalo(-21.5, deckY + 25.6, -18.5, 2.6, '#fff2c8', 0.68);
    for (const [fx, fz] of [[-16.0, 11.5], [13.5, 12.0], [-13.5, -12.5], [16.5, -9.5], [13.0, -2.5]]) {
      addHalo(fx, deckY + 0.75, fz, 3.4, '#d8eeff', 0.58);
    }
    for (const [cx, cz] of [[-25.5, 25.5], [25.5, 25.5], [-25.5, -25.5], [25.5, -25.5]]) {
      addHalo(cx, deckY + 1.85, cz, 2.6, '#ffaa38', 0.55);
    }

    // Procedural rain-haze & crashing leg sea-spray mist billboards
    const mistMat = new THREE.ShaderMaterial({
      uniforms: { uTime: timeU, uColor: { value: new THREE.Color('#8ca8c4') }, uAlpha: { value: 0.30 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime, uAlpha; uniform vec3 uColor; varying vec2 vUv;
        ${GLSL_NOISE}
        void main(){
          vec2 u = vUv - 0.5;
          float r = length(u) * 2.0;
          if (r > 1.0) discard;
          float n = fbm2_3(vUv * 4.2 + vec2(uTime * 0.22, -uTime * 0.14));
          float n2 = ridged2(vUv * 8.5 - vec2(0.0, uTime * 0.38));
          float mask = smoothstep(1.0, 0.15, r) * (0.35 + 0.65 * (n * 0.65 + n2 * 0.35));
          gl_FragColor = vec4(uColor * (0.85 + 0.35 * n2), mask * uAlpha);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const sprayMat = mistMat.clone();
    sprayMat.uniforms = { uTime: timeU, uColor: { value: new THREE.Color('#9ab4cc') }, uAlpha: { value: 0.24 } };

    // Subtle sea spray mist around the 4 support columns near the waterline (waterMesh legFoam handles the surface whitewater)
    for (const [lx, ly, lz, sw, sh] of [
      [18, 2.2, 18, 9.5, 6.0], [-18, 2.2, 18, 9.5, 6.0], [18, 2.2, -18, 9.5, 6.0], [-18, 2.2, -18, 9.5, 6.0],
      // Wave spray plume rising behind outer deck edges in tempest_hero
      [12.5, deckY + 0.6, -24.2, 12, 7.0], [-10.5, deckY + 0.8, -24.2, 12, 7.5],
    ]) {
      for (let a = 0; a < 2; a++) {
        const pm = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), sprayMat);
        pm.position.set(lx, ly, lz);
        pm.rotation.y = a * Math.PI * 0.45 + 0.35;
        g.add(pm);
      }
    }
    // Subtle storm mist behind outer rig edges (kept clear of derrick base so derrick pipework & lattice stay crisp!)
    for (const [mx, my, mz, mw, mh, ry, mat] of [
      [-23, deckY + 5.5, -10, 16, 11, 0.5, mistMat],
      [-6, deckY + 8.0, -25, 22, 13, 0.2, mistMat],
    ]) {
      const hm = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), mat);
      hm.position.set(mx, my, mz);
      hm.rotation.y = ry;
      g.add(hm);
    }

    let tt = 0;
    return {
      group: g, padY, floor: 0, water, storm: true,
      heightAt: (x, z) => (Math.abs(x) < 24 && Math.abs(z) < 24 ? (Math.hypot(x, z) < 14.5 ? padY : deckY) : oceanHeight(x, z, tt, amp)),
      surfaceIsWater: (x, z) => !(Math.abs(x) < 24 && Math.abs(z) < 24),
      update(dt, t) {
        tt = t; timeU.value = t;
        water.material.uniforms.uTime.value = t;
        flameMat.uniforms.uTime.value = t;
        fl.intensity = 210 + Math.sin(t * 17) * 35 + Math.sin(t * 7) * 20;
        fl2.intensity = 65 + Math.cos(t * 15) * 10;
      },
    };
  },
};

// ============================================================ 5. ECLIPSE
const eclipse = {
  id: 'eclipse', name: 'Eclipse', sub: 'Kepler-452c · binary dusk · ringed giant', swatch: '#ff4a32',
  accent: '#ff3a2a', night: false, beam: 0.18,
  sky: { top: '#141924', horizon: '#b87852', bottom: '#502414', sharp: 0.56, sunDir: [0.55, 0.22, 0.62], sunColor: '#ffdfc0', sunSize: 0.00045, sunGlow: 1.25, planet: 1, planetDir: [-0.42, 0.36, -0.83], planetColor: '#e4d4be', planetSize: 0.34, ring: 1, sun2: 1, sun2Dir: [0.75, 0.08, 0.3], sun2Color: '#ff7042', clouds: 0.14, cloudColor: '#c8906e', cloudShadow: '#3e2420', cloudScale: 0.5, cloudCover: 0.20 },
  fog: { color: '#b47854', density: 0.00068 },
  sun: { color: '#ffc8a8', intensity: 4.0 }, hemi: { sky: '#7c6256', ground: '#321a10', intensity: 0.50 },
  exposure: 0.88, envIntensity: 0.64,
  bloom: { strength: 0.50, radius: 0.5, threshold: 0.88 },
  grade: { lift: [0.006, 0.002, 0.004], gain: [1.03, 0.98, 0.93], vignette: 0.40, grain: 0.04, ca: 0.0012 },
  weather: { kind: 'dust', count: 2000, color: '#e6a67e', size: 0.11, fall: 0.15, wind: [3, -1], opacity: 0.36, additive: false },
  ambience: { wind: 0.4, rain: 0, hum: 0.12 },
  livery: { paint: '#dcd6cc', paint2: '#18181c', trim: '#101114', blade: '#1a1a1e', glow: '#ff3a2a', glowIntensity: 3.6, glass: '#3a1610', irid: 0.9, decal: '#18181c', rough: 0.42, metal: 0.12, interior: '#2a2526', missile: '#e0dad0' },
  build() {
    const g = new THREE.Group(), sx = new Simplex(5), padY = 0;
    const timeU = { value: 0 };
    const raw = (x, z) => {
      // Multi-octave ridged canyon walls + fine stepped sedimentary mesa terraces & caprock ledges
      let b = sx.ridged(x / 860, z / 860, 4) * 305 + sx.fbm(x / 260, z / 260, 3) * 42 + (sx.ridged(x / 135, z / 135, 3) - 0.46) * 22 - 100;
      const canyon = Math.abs(sx.fbm(x / 880, z / 880, 3));
      b -= smooth(0.12, 0.0, canyon) * 86;
      // Sculpted canyon buttes & craggy mesas framing eclipse_hero (-x,-z) and eclipse_rear (+x,-z) (with fast distance early-out)
      const d1 = (x + 360) ** 2 + (z + 420) ** 2;
      if (d1 < 720000) b += Math.exp(-d1 / (2 * 225 ** 2)) * 88 * (0.84 + 0.22 * sx.ridged(x / 135, z / 135, 2));
      const d2 = (x + 480) ** 2 + (z - 120) ** 2;
      if (d2 < 850000) b += Math.exp(-d2 / (2 * 245 ** 2)) * 96 * (0.85 + 0.20 * sx.ridged(x / 140, z / 140, 2));
      const d3 = (x - 280) ** 2 + (z + 520) ** 2;
      if (d3 < 950000) b += Math.exp(-d3 / (2 * 260 ** 2)) * 118 * (0.84 + 0.22 * sx.ridged(x / 145, z / 145, 2));
      const d4 = (x - 420) ** 2 + (z + 240) ** 2;
      if (d4 < 500000) b += Math.exp(-d4 / (2 * 185 ** 2)) * 82 * (0.84 + 0.22 * sx.ridged(x / 125, z / 125, 2));
      // Natural sedimentary mesa caprock limit so summits form flat/craggy mesa tops rather than needle spikes
      const cap = 148 + sx.fbm(x / 240, z / 240, 2) * 22;
      if (b > cap) b = cap + (b - cap) * 0.20;
      // Finer two-tier sedimentary mesa/butte terrace steps (11m major benches + 3.8m sub-ledges)
      const step1 = 11.0, f1 = b / step1, fl1 = Math.floor(f1), fr1 = f1 - fl1;
      b = lerp(b, (fl1 + smooth(0.18, 0.82, fr1)) * step1, 0.48);
      const step2 = 3.8, f2 = b / step2, fl2 = Math.floor(f2), fr2 = f2 - fl2;
      b = lerp(b, (fl2 + smooth(0.22, 0.78, fr2)) * step2, 0.26);
      return b;
    };
    const height = (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 14.6) return padY - 0.10;
      const nearPad = (padY - 0.06 + sx.fbm(x / 22, z / 22, 2) * 0.42 + sx.fbm(x / 130, z / 130, 3) * 6.2 * smooth(36, 145, r)) * smooth(14.6, 21, r);
      if (r <= 36) return nearPad;
      const open = smooth(125, 640, r);
      return lerp(nearPad, raw(x, z) * open, smooth(36, 185, r));
    };
    const cSand = lin('#8c5a3c'), cTan = lin('#b47e58'), cDark = lin('#341e12');
    g.add(terrainMesh({
      half: 3200, seg: 340, pow: 1.56, height, rough: 0.92, bump: 0.95, envInt: 0.50,
      detail: { mode: 3, sunDir: eclipse.sky.sunDir, fogSun: '#dca078', fogHigh: '#684c40', fogHeight: 0.0024 },
      color: (x, z, h, ny) => {
        const macro = 0.5 + 0.5 * sx.fbm(x / 320, z / 320, 3);
        let c = mixc(cSand, cTan, clamp(macro, 0, 1));
        c = mixc(c, cDark, smooth(0.68, 0.22, ny) * 0.44);
        return c;
      },
    }));
    helipad(g, padY + 0.02, { base: '#262220', line: '#e0dad2', accent: '#ff3a2a', lights: '#ff3a2a', side: 0x1e1a18, surfaceMode: 4, rough: 0.85 });

    // Real weathered angular & stratified desert boulders (3 distinct rock archetypes, NO flat pancake squashing!)
    const buildBoulderGeo = (seedOff, tallness, angularity) => {
      const bg = mergeVertices(new THREE.IcosahedronGeometry(1, 3));
      const rp = bg.attributes.position;
      // Pseudo-random fracture planes for angular chiseled rock faces
      const planes = [
        [0.72, 0.48, 0.50], [-0.68, 0.52, -0.51], [0.18, 0.84, -0.51],
        [-0.45, 0.38, 0.81], [0.58, -0.25, -0.77], [-0.82, 0.22, 0.53],
        [0.32, -0.45, 0.83], [-0.28, 0.76, 0.58],
      ];
      for (let k = 0; k < rp.count; k++) {
        let vx = rp.getX(k), vy = rp.getY(k), vz = rp.getZ(k);
        const n1 = 0.5 + 0.5 * sx.fbm(vx * 1.45 + seedOff, vz * 1.45 - seedOff * 0.7, 3);
        const n2 = sx.ridged(vx * 2.4 + vy * 1.6 + seedOff, vz * 2.4 - vy * 1.6, 2);
        // Chiseled angular plane beveling
        let bevel = 1.0;
        for (const [px, py, pz] of planes) {
          const d = vx * px + vy * py + vz * pz;
          if (d > 0.38) bevel -= (d - 0.38) * angularity * 1.35;
        }
        const sc = (0.68 + 0.26 * n1 + 0.24 * n2) * clamp(bevel, 0.52, 1.18);
        vx *= sc;
        vy *= sc * tallness;
        vz *= sc;
        // Embed base into regolith without squashing the upper rock volume
        if (vy < -0.38) vy = -0.38 + (vy + 0.38) * 0.30;
        rp.setXYZ(k, vx, vy, vz);
      }
      bg.computeVertexNormals();
      return bg;
    };

    const rockGeoA = buildBoulderGeo(1.3, 1.05, 0.46); // Chiseled blocky sandstone boulder
    const rockGeoB = buildBoulderGeo(5.7, 1.28, 0.56); // Upright weathered monolith/outcrop boulder
    const rockGeoC = buildBoulderGeo(9.4, 0.88, 0.42); // Broad stratified bench boulder

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3d2216, roughness: 0.93, metalness: 0.03 });
    rockMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRockW;\nvarying vec3 vRockN;\nvarying vec3 vRockL;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vRockL = position;
          vec4 rwp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vRockW = rwp.xyz;
          vRockN = normalize(mat3(modelMatrix * instanceMatrix) * normal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vRockW;\nvarying vec3 vRockN;\nvarying vec3 vRockL;\n${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // High-detail weathered basalt & fractured red-rock boulder texture (world-space strata + triplanar rock grain)
          float rWarp = fbm2_3(vRockW.xz * 0.85) * 1.4;
          float rStrata = 0.5 + 0.5 * sin(vRockW.y * 3.2 + rWarp);
          float rGrain  = fbm2_3(vRockW.xz * 2.8 + vRockW.y * 2.2) * 0.64 + vnoise(vRockW.xz * 12.0 + vRockW.y * 8.0) * 0.36;
          float rCracks = smoothstep(0.62, 0.86, ridged2(vRockW.xz * 2.5 + vRockW.y * 2.0));
          vec3 rBasalt  = vec3(0.14, 0.075, 0.045);
          vec3 rSand    = vec3(0.34, 0.19, 0.11);
          vec3 rOchre   = vec3(0.46, 0.27, 0.16);
          vec3 rDust    = vec3(0.54, 0.35, 0.22);
          vec3 rCol = mix(rBasalt, rSand, clamp(rGrain * 0.78 + rStrata * 0.22, 0.0, 1.0));
          rCol = mix(rCol, rOchre, smoothstep(0.64, 0.90, rStrata * 0.5 + rGrain * 0.5) * 0.32);
          rCol *= 1.0 - rCracks * 0.42;
          // Subtle ground-contact ambient occlusion only at the very bottom base of boulder
          float groundAO = smoothstep(-0.52, -0.14, vRockL.y);
          rCol *= 0.58 + 0.42 * groundAO;
          // Subtle settled desert dust on upward-facing rock ledges
          float topDust = smoothstep(0.52, 0.88, vRockN.y + (rGrain - 0.5) * 0.28) * groundAO;
          diffuseColor.rgb = mix(rCol, rDust, topDust * 0.28);
        `)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec2 rUV = vRockW.xz * 2.8 + vRockW.y * 2.1;
            float eR = 0.05;
            float h0 = fbm2_3(rUV) * 0.55 + ridged2(rUV * 1.5) * 0.45;
            float hx = fbm2_3(rUV + vec2(eR, 0.)) * 0.55 + ridged2((rUV + vec2(eR, 0.)) * 1.5) * 0.45;
            float hz = fbm2_3(rUV + vec2(0., eR)) * 0.55 + ridged2((rUV + vec2(0., eR)) * 1.5) * 0.45;
            vec3 dNR = vec3((h0 - hx) * 1.65, (h0 - hx) * 0.55, (h0 - hz) * 1.65);
            normal = normalize(normal + (viewMatrix * vec4(dNR, 0.0)).xyz);
          }
        `);
    };

    const rnd = mulberry32(31);
    const pts = scatter(920, rnd, (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 17.5) return null;
      // Keep the immediate camera lens path in eclipse_hero clear
      if (x > 2 && x < 11 && z > -1 && z < 5.5) return null;
      if (slopeAt(height, x, z) < 0.88) return null;
      return [x, height(x, z), z];
    }, 360);

    // Curated hero weathered boulders & rock clusters in eclipse_hero and eclipse_rear
    const heroBoulders = [
      // eclipse_hero foreground & mid-ground rock outcrops
      [-18.5, height(-18.5, -14.0), -14.0, 1.45, 1.15, 1.35, 0.4, 1],
      [-25.0, height(-25.0, -22.0), -22.0, 2.20, 1.75, 1.95, 1.1, 0],
      [-14.2, height(-14.2, 8.5), 8.5, 1.15, 0.92, 1.08, 2.1, 2],
      [16.8, height(16.8, -11.5), -11.5, 1.55, 1.25, 1.40, 0.8, 0],
      [-34.0, height(-34.0, -32.0), -32.0, 2.85, 2.35, 2.50, 1.7, 1],
      [-8.5, height(-8.5, -24.5), -24.5, 1.70, 1.30, 1.55, 2.6, 0],
      // eclipse_rear foreground & mid-ground rock outcrops (looking from -x,+z toward +x,-z)
      [17.5, height(17.5, -16.5), -16.5, 1.65, 1.35, 1.50, 0.5, 1],
      [24.0, height(24.0, -24.0), -24.0, 2.45, 1.95, 2.15, 1.9, 0],
      [12.5, height(12.5, -21.0), -21.0, 1.35, 1.05, 1.25, 2.4, 2],
      [29.0, height(29.0, -12.0), -12.0, 2.10, 1.65, 1.85, 1.2, 0],
      [-15.5, height(-15.5, 14.2), 14.2, 0.95, 0.78, 0.88, 0.9, 2],
    ];

    const buckets = [[], [], []];
    pts.forEach((p, i) => {
      const rDist = Math.hypot(p[0], p[2]);
      const maxS = rDist < 32 ? 1.65 : 3.8;
      const s = Math.min(maxS, 0.48 + rnd() ** 2.4 * 3.6);
      const sxB = s * (0.88 + rnd() * 0.36);
      // Natural 3D boulder height (0.78..1.24 of width — never squashed into pancakes!)
      const syB = s * (0.78 + rnd() * 0.46);
      const szB = s * (0.88 + rnd() * 0.36);
      const yaw = rnd() * Math.PI * 2;
      const tiltX = (rnd() - 0.5) * 0.28, tiltZ = (rnd() - 0.5) * 0.28;
      buckets[i % 3].push([p[0], p[1] + syB * 0.16, p[2], sxB, syB, szB, yaw, tiltX, tiltZ]);
    });
    for (const [bx, by, bz, sxB, syB, szB, yaw, arch] of heroBoulders) {
      buckets[arch % 3].push([bx, by + syB * 0.18, bz, sxB, syB, szB, yaw, 0.08, -0.06]);
    }

    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    [rockGeoA, rockGeoB, rockGeoC].forEach((geo, bIdx) => {
      const listB = buckets[bIdx];
      const meshB = new THREE.InstancedMesh(geo, rockMat, listB.length);
      listB.forEach(([x, y, z, sxB, syB, szB, yaw, tx, tz], i) => {
        q.setFromEuler(e.set(tx, yaw, tz));
        mt.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sxB, syB, szB));
        meshB.setMatrixAt(i, mt);
      });
      meshB.castShadow = meshB.receiveShadow = true;
      g.add(meshB);
    });

    // Angular scree & fractured desert stones scattered around pad perimeter (r = 15.2 .. 95m) and around boulder bases
    const screeRnd = mulberry32(53);
    const screePts = [];
    for (let i = 0; i < 780; i++) {
      const a = screeRnd() * Math.PI * 2;
      const t = screeRnd();
      const r = t < 0.55 ? 15.2 + (t / 0.55) * 24.0 : 39.2 + ((t - 0.55) / 0.45) * 65.0;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (x > 2 && x < 12 && z > -2 && z < 6) continue;
      screePts.push([x, height(x, z), z, 0.20 + screeRnd() ** 2.0 * 0.52]);
    }
    const screeGeo = mergeVertices(new THREE.IcosahedronGeometry(1, 2));
    const sp = screeGeo.attributes.position;
    for (let k = 0; k < sp.count; k++) {
      let vx = sp.getX(k), vy = sp.getY(k), vz = sp.getZ(k);
      const sc = 0.74 + 0.34 * (0.5 + 0.5 * sx.noise(vx * 1.9, vz * 1.9));
      sp.setXYZ(k, vx * sc * 1.12, vy * sc * 0.88, vz * sc);
    }
    screeGeo.computeVertexNormals();
    const screeMesh = new THREE.InstancedMesh(screeGeo, rockMat, screePts.length);
    screePts.forEach(([x, y, z, s], i) => {
      q.setFromEuler(e.set((screeRnd() - 0.5) * 0.45, screeRnd() * Math.PI * 2, (screeRnd() - 0.5) * 0.45));
      mt.compose(new THREE.Vector3(x, y + s * 0.14, z), q, new THREE.Vector3(s * (0.9 + screeRnd() * 0.42), s * (0.76 + screeRnd() * 0.42), s * (0.9 + screeRnd() * 0.42)));
      screeMesh.setMatrixAt(i, mt);
    });
    screeMesh.castShadow = screeMesh.receiveShadow = true;
    g.add(screeMesh);

    // Drifting canyon dust-haze ribbons between mid-ground mesas and distant canyon walls
    const dustHazeMat = new THREE.ShaderMaterial({
      uniforms: { uTime: timeU },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        ${GLSL_NOISE}
        void main(){
          vec2 u = vUv - 0.5;
          float env = smoothstep(0.5, 0.08, abs(u.x)) * smoothstep(0.5, 0.08, abs(u.y));
          float n = fbm2_3(vec2(vUv.x * 3.6 + uTime * 0.08, vUv.y * 2.2));
          float a = env * (0.35 + 0.65 * n) * 0.20;
          vec3 col = mix(vec3(0.76, 0.50, 0.35), vec3(0.92, 0.68, 0.50), vUv.y * 0.6 + n * 0.4);
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const [dx, dy, dz, dw, dh, dry] of [
      [-160, 18, -210, 240, 32, 0.65],
      [-240, 24, -90, 220, 30, 1.15],
      [170, 20, -220, 240, 32, -0.65],
      [90, 16, -280, 260, 34, -0.25],
    ]) {
      const dm = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), dustHazeMat);
      dm.position.set(dx, dy, dz);
      dm.rotation.y = dry;
      g.add(dm);
    }

    // Monolith beacon (alien relic)
    const mono = new THREE.Mesh(new THREE.BoxGeometry(3, 18, 1.2), new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.12, metalness: 0.95 }));
    mono.position.set(-40, height(-40, 30) + 9, 30); mono.rotation.y = 0.4; mono.castShadow = true; g.add(mono);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 17, 1.25), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff3a2a, emissiveIntensity: 3.2 }));
    seam.position.copy(mono.position); seam.rotation.y = 0.4; g.add(seam);
    return {
      group: g, padY, heightAt: height, floor: 0,
      update(dt, t, camera, renderer, scene, sky, skyMat) {
        timeU.value = t;
        seam.material.emissiveIntensity = 2.6 + Math.sin(t * 1.3) * 1.2;
        if (skyMat && camera) {
          // Ensure the ringed gas giant frames both eclipse_hero (upper-left) and eclipse_rear (upper-right)
          if (camera.position.x < -2 && camera.position.z > 5) {
            skyMat.uniforms.uPlanetDir.value.set(0.86, 0.16, -0.48).normalize();
            skyMat.uniforms.uPlanetSize.value = 0.22;
          } else {
            skyMat.uniforms.uPlanetDir.value.set(-0.42, 0.36, -0.83).normalize();
            skyMat.uniforms.uPlanetSize.value = 0.34;
          }
        }
      },
    };
  },
};

// ============================================================ 6. STRATOS
// =================================================================================================
// LOCKED STRATOS LAYOUT (REQUIRED — DO NOT MODIFY OR REGRESS):
//   1. Summit pad (r < 14.6m, plateau edge r ~ 22..33m) = local high point at y = 0.
//   2. Terrain drops steeply away just beyond the summit plateau down to y = -260m (well below clouds).
//   3. A billowing sunlit cloud sea (cA at y = -38, cB at y = -64) fills everything below to the horizon.
//   4. ONLY a few distant (>= 800m from origin) jagged snowy peaks poke through the sea of clouds
//      (matching captures/drafts_r6/stratos_hero.png and captures/drafts_r6/stratos_wide.png).
//   NEVER add nearby peaks (< 800m), mountain walls around the summit, or raise the cloud deck!
// =================================================================================================
const stratos = {
  id: 'stratos', name: 'Stratos', sub: 'Summit 8,611 m · sea of clouds · first light', swatch: '#ffc65a',
  accent: '#ffc65a', night: false, beam: 0.08,
  sky: { top: '#243658', horizon: '#f8cc98', bottom: '#d8a482', sharp: 0.64, sunDir: [-0.46, 0.082, -0.88], sunColor: '#ffe0a6', sunSize: 0.0014, sunGlow: 2.8, stars: 0.08, clouds: 0.10, cloudColor: '#ffe6ce', cloudShadow: '#8c96b8', cloudScale: 0.4, cloudCover: 0.14 },
  fog: { color: '#ecd0b4', density: 0.00018 },
  sun: { color: '#ffca88', intensity: 4.8 }, hemi: { sky: '#7c94c2', ground: '#5c4c44', intensity: 0.54 },
  exposure: 0.92, envIntensity: 0.72,
  bloom: { strength: 0.50, radius: 0.55, threshold: 0.90 },
  grade: { lift: [0.005, 0.003, 0.006], gain: [1.05, 1.0, 0.95], vignette: 0.36, grain: 0.03, ca: 0.001 },
  weather: { kind: 'dust', count: 600, color: '#ffffff', size: 0.05, fall: 0.25, wind: [5, -2], opacity: 0.40, additive: true },
  ambience: { wind: 0.5, rain: 0, hum: 0 },
  livery: { paint: '#e4e7ec', paint2: '#1a2744', trim: '#0e121a', blade: '#1a2030', glow: '#ffc65a', glowIntensity: 3.2, glass: '#5a3a10', irid: 1.0, decal: '#1a2744', rough: 0.38, metal: 0.3, interior: '#262a33', missile: '#d8dce2' },
  build() {
    const g = new THREE.Group(), sx = new Simplex(23), padY = 0;

    // LOCKED DISTANT PEAKS (ALL >= 850m from origin; NO peaks anywhere inside r < 800m!):
    //  - Peak 1 (-670, -628, r = 918m): sharp snowy Matterhorn-like peak just left of rotor mast in stratos_hero
    //    AND behind the right prayer-flag pole in stratos_wide.
    //  - Peak 2 (-685, -830, r = 1076m): smaller distant snowy peak slightly right of rotor mast in stratos_hero.
    //  - Massif 3 (-435..-240, -755..-860, r = 866..893m): jagged sunlit Himalayan granite massif on the right
    //    of stratos_hero (off-screen right in stratos_wide).
    //  - Crag 4 (-815..-835, 390..335, r = 900..903m): twin snowy crag on the far-left of stratos_wide.
    //  - Crag 5 (-880..-870, 95..145, r = 882..885m): smaller rocky island crag mid-left in stratos_wide.
    const distantPeaks = [
      // 1) Center-left sharp snowy peak in stratos_hero / right-side peak behind flag pole in stratos_wide (r = 918..941m)
      { x: -670, z: -628, h: 42, rad: 155 },
      { x: -640, z: -690, h: 16, rad: 125 },
      // 2) Smaller distant sharp peak just right of rotor mast in stratos_hero (r = 1076m)
      { x: -685, z: -830, h: 36, rad: 140 },
      // 3) Right-side jagged sunlit Himalayan massif in stratos_hero (r = 866..893m)
      { x: -435, z: -755, h: 86, rad: 185 },
      { x: -380, z: -785, h: 94, rad: 175 },
      { x: -320, z: -805, h: 44, rad: 150 },
      { x: -240, z: -860, h: 12, rad: 120 },
      // 4) Far-left twin snowy crag in stratos_wide (r = 900..903m)
      { x: -815, z: 390, h: 34, rad: 145 },
      { x: -835, z: 335, h: 24, rad: 135 },
      // 5) Mid-left rocky crag island in stratos_wide (r = 882..885m)
      { x: -880, z: 95, h: 18, rad: 140 },
      { x: -870, z: 145, h: 8, rad: 120 },
    ];

    // Evaluates ONLY the distant (>= 850m) jagged peaks; returns -260m everywhere else!
    const evalDistantPeaks = (x, z) => {
      let h = -260;
      for (let i = 0; i < distantPeaks.length; i++) {
        const p = distantPeaks[i];
        const dx = x - p.x, dz = z - p.z;
        const maxD = p.rad * 2.15;
        if (dx > maxD || dx < -maxD || dz > maxD || dz < -maxD) continue;
        const d = Math.hypot(dx, dz) / p.rad;
        if (d > 2.15) continue;
        const ang = Math.atan2(dz, dx);
        const spur = 0.76 + 0.24 * sx.ridged(Math.cos(ang) * 2.1 + p.x * 0.01, Math.sin(ang) * 2.1 + p.z * 0.01, 2);
        const cone = (p.h + 68) * Math.exp(-Math.pow(d, 1.36) * 1.52) * spur - 68;
        if (cone > h) h = cone;
      }
      if (h > -135) {
        // Bold pyramid arete facets without noisy high-frequency pin-cushion spikes
        const crag = (sx.ridged(x / 85, z / 85, 3) - 0.42) * 32;
        h += crag * smooth(-125, -35, h);
      }
      return h;
    };

    const summitHeight = (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 14.6) return padY - 0.10;
      const wideCamSide = smooth(-2, 14, x);
      const dropStart = 23.2 + wideCamSide * 10.5;
      const dropEnd = 35.0 + wideCamSide * 15.0;
      // Wind-sculpted snow cornices & sastrugi around the summit pad perimeter
      if (r < dropEnd) {
        const sastrugi = (sx.fbm(x / 11, z / 11, 2) * 0.24 + (sx.ridged(x / 6.5, z / 6.5, 2) - 0.5) * 0.14);
        const crownH = padY - 0.06 - smooth(15.0, dropStart + 2.0, r) * 1.18 + sastrugi * smooth(14.6, 18.5, r);
        if (r <= dropStart) return crownH;
        return lerp(crownH, -260, smooth(dropStart, dropEnd, r));
      }
      return -260;
    };

    const height = (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 55.0) return summitHeight(x, z);
      // LOCKED: Everything between the summit plateau (r = 50m) and r = 640m is deep abyss (-260m) below the cloud sea!
      if (r < 640 || x > -60) return -260;
      return evalDistantPeaks(x, z);
    };

    const rock = lin('#181920'), snow = lin('#f6f4f8'), shade = lin('#2e2d38'), warm = lin('#4e403c');
    const mainTerrain = terrainMesh({
      half: 3200, seg: 224, pow: 1.56, height: summitHeight, rough: 0.76, bump: 0.88, envInt: 0.88,
      detail: { mode: 4, sunDir: stratos.sky.sunDir, fogSun: '#ffe0bc', fogHigh: '#e4c4b4', fogHeight: 0.0014 },
      color: (x, z, h, ny) => {
        if (h < -90) return rock;
        let c = mixc(rock, shade, clamp(sx.noise(x / 45, z / 45) * 0.5 + 0.5, 0, 1));
        c = mixc(c, warm, clamp(sx.noise(x / 13, z / 13), 0, 1) * 0.35);
        const r = Math.hypot(x, z);
        const slopeThresh = r < 45 ? 0.52 : 0.72;
        const snowAmt = smooth(slopeThresh, slopeThresh + 0.18, ny + sx.noise(x / 18, z / 18) * 0.08) * smooth(-90, -25, h);
        c = mixc(c, snow, snowAmt * (r < 30 ? 0.68 : 0.85));
        return c;
      },
    });
    g.add(mainTerrain);

    // Localized high-resolution patches ONLY over the distant (>= 850m) peak clusters so their silhouettes are razor-sharp
    const makeDistantPeakPatch = (cx, cz, w, d, segX, segZ) => {
      const pg = new THREE.PlaneGeometry(w, d, segX, segZ).rotateX(-Math.PI / 2);
      pg.translate(cx, 0, cz);
      const pp = pg.attributes.position;
      const pc = new Float32Array(pp.count * 3);
      for (let k = 0; k < pp.count; k++) {
        const x = pp.getX(k), z = pp.getZ(k);
        const h = evalDistantPeaks(x, z);
        pp.setY(k, h);
        pc[k * 3] = 0.24; pc[k * 3 + 1] = 0.24; pc[k * 3 + 2] = 0.28;
      }
      pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
      pg.computeVertexNormals();
      const m = new THREE.Mesh(pg, mainTerrain.material);
      g.add(m);
    };
    // Patch A covers distant peaks 1, 2, 3 (-850..-110, -1030..-450, all >= 850m)
    makeDistantPeakPatch(-480, -740, 760, 580, 144, 110);
    // Patch B covers distant crags 4, 5 in stratos_wide (-1045..-665, -75..+565, all >= 850m)
    makeDistantPeakPatch(-855, 245, 380, 640, 76, 110);

    helipad(g, padY + 0.02, { base: '#262a32', line: '#ffffff', accent: '#ffc65a', lights: '#ffb84d', side: 0x20242c, surfaceMode: 5, rough: 0.76, lightInt: 4.2, poolInt: 0.65 });

    // Exposed dark granite rock outcrops & wind-carved snow boulders around the summit ridge edge (r = 16..34m)
    const sumRockGeo = mergeVertices(new THREE.IcosahedronGeometry(1, 3));
    const srp = sumRockGeo.attributes.position;
    for (let k = 0; k < srp.count; k++) {
      let vx = srp.getX(k), vy = srp.getY(k), vz = srp.getZ(k);
      const sc = 0.72 + 0.38 * (0.5 + 0.5 * sx.ridged(vx * 1.8 + 2.1, vz * 1.8 - 1.3, 2));
      srp.setXYZ(k, vx * sc * 1.25, vy * sc * 0.78, vz * sc);
    }
    sumRockGeo.computeVertexNormals();
    const sumRockPositions = [
      [-17.5, -13.5, 1.4, 0.85, 1.2, 0.4], [-19.2, -6.5, 1.1, 0.70, 0.95, 1.2],
      [-14.5, -17.8, 1.3, 0.80, 1.1, 2.1], [5.5, -19.5, 1.2, 0.72, 1.0, 0.8],
      [-16.8, 9.5, 1.35, 0.75, 1.15, 1.7], [15.5, -15.2, 1.15, 0.68, 0.95, 2.5],
    ];
    const sumRocks = new THREE.InstancedMesh(sumRockGeo, mainTerrain.material, sumRockPositions.length);
    const mtS = new THREE.Matrix4(), qS = new THREE.Quaternion(), eS = new THREE.Euler();
    sumRockPositions.forEach(([rx, rz, sxR, syR, szR, ry], i) => {
      qS.setFromEuler(eS.set(0.1, ry, -0.08));
      mtS.compose(new THREE.Vector3(rx, height(rx, rz) + syR * 0.22, rz), qS, new THREE.Vector3(sxR, syR, szR));
      sumRocks.setMatrixAt(i, mtS);
    });
    sumRocks.castShadow = sumRocks.receiveShadow = true;
    g.add(sumRocks);

    // Summit cairn + Tibetan prayer flags
    const flagsM = ['#d83a2a', '#e8b828', '#2a72d8', '#f0eee8', '#2aa858'].map(c => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.88 }));
    const flags = [];
    const pA = new THREE.Vector3(-19.5, 0, -6.0), pB = new THREE.Vector3(-8, 0, -21), pC = new THREE.Vector3(9, 0, -20);
    const poleM = new THREE.MeshStandardMaterial({ color: 0x2e241c, roughness: 0.9 });
    for (const p of [pA, pB, pC]) {
      const py = height(p.x, p.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 4.8, 8), poleM);
      pole.position.set(p.x, py + 2.4, p.z); pole.castShadow = true; g.add(pole);
    }
    const cairn = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 1), new THREE.MeshStandardMaterial({ color: 0x3e3a42, roughness: 0.92 }));
    cairn.position.set(pB.x, height(pB.x, pB.z) + 0.45, pB.z); cairn.scale.set(1, 0.68, 1); g.add(cairn);

    const addFlagSpan = (v0, v1, count, yOff, sag) => {
      const spanDir = v1.clone().sub(v0);
      const yaw = Math.atan2(-spanDir.z, spanDir.x);
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const p = v0.clone().lerp(v1, t);
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.42), flagsM[i % 5]);
        const baseH = lerp(height(v0.x, v0.z), height(v1.x, v1.z), t);
        f.position.set(p.x, baseH + yOff - Math.sin(t * Math.PI) * sag, p.z);
        f.rotation.y = yaw;
        f.userData.baseYaw = yaw;
        f.castShadow = true; g.add(f); flags.push(f);
      }
    };
    addFlagSpan(pA, pB, 18, 4.4, 1.1);
    addFlagSpan(pA, pB, 18, 3.2, 1.25);
    addFlagSpan(pB, pC, 18, 4.4, 1.05);
    addFlagSpan(pB, pC, 18, 3.2, 1.2);

    // LOCKED CLOUD SEA (y = -38 and y = -64): billowing sunlit stratocumulus filling everything below the summit to the horizon
    const cloudMat = (y, cover, dark) => new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(-0.46, 0.082, -0.88).normalize() },
        uLit: { value: C(dark ? '#f0cca8' : '#ffe8c8') },
        uShade: { value: C(dark ? '#685c78' : '#7c6e8c') },
        uHor: { value: C('#f6cfa8') },
        uCover: { value: cover },
        uAmp: { value: dark ? 16.0 : 28.0 },
      },
      vertexShader: /* glsl */`
        uniform float uTime, uAmp;
        varying vec3 vW; varying float vBillow;
        ${GLSL_NOISE}
        float sphereDome(float v){
          return sqrt(max(0.0, 1.0 - v * v * 1.35));
        }
        float cloudDome(vec2 xz){
          vec2 p = xz * 0.0085 + vec2(uTime * 0.0020, uTime * 0.0010);
          vec2 w = vec2(vnoise(p * 0.55), vnoise(p * 0.55 + 4.7)) * 0.65;
          float d1 = sphereDome(voronoi2(p * 0.85 + w));
          float d2 = sphereDome(voronoi2(p * 1.95 - w * 0.55 + 2.3));
          float macro = fbm2_3(p * 2.2 + w * 0.6) * 0.55 + vnoise(xz * 0.0022) * 0.45;
          return d1 * 0.52 + d2 * 0.30 + macro * 0.18;
        }
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          float b = cloudDome(w.xz);
          float dist = length(w.xz - cameraPosition.xz);
          float padSafe = smoothstep(42.0, 95.0, length(w.xz));
          float dispFade = smoothstep(7500.0, 180.0, dist) * padSafe;
          w.y += (b - 0.40) * uAmp * dispFade;
          vW = w.xyz;
          vBillow = b;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime, uCover;
        uniform vec3 uSun, uLit, uShade, uHor;
        varying vec3 vW; varying float vBillow;
        ${GLSL_NOISE}
        float sphereDome(float v){
          return sqrt(max(0.0, 1.0 - v * v * 1.35));
        }
        float cloudFast(vec2 xz, float detail){
          vec2 p = xz * 0.0095 + vec2(uTime * 0.0020, uTime * 0.0010);
          vec2 w = vec2(vnoise(p * 0.55), vnoise(p * 0.55 + 4.7)) * 0.65;
          float d1 = sphereDome(voronoi2(p * 0.90 + w));
          float d2 = sphereDome(voronoi2(p * 2.15 - w * 0.55 + 2.3));
          float f1 = fbm2_3(p * 3.4 + w) * (0.50 + 0.50 * detail);
          float fine = detail > 0.05 ? vnoise(p * 8.5 - w) * 0.14 * detail : 0.0;
          return d1 * 0.48 + d2 * 0.30 + f1 * 0.22 + fine;
        }
        void main(){
          float dist = length(vW.xz - cameraPosition.xz);
          float detFade = smoothstep(3200.0, 140.0, dist);
          float n0 = cloudFast(vW.xz, detFade);
          float d = smoothstep(uCover, uCover + 0.10, n0);
          // Crisp 3D normal of billowing stratocumulus domes + warm sunrise self-shadowing
          float eps = 5.2;
          float nx = cloudFast(vW.xz + vec2(eps, 0.0), detFade * 0.7);
          float nz = cloudFast(vW.xz + vec2(0.0, eps), detFade * 0.7);
          vec3 cN = normalize(vec3((n0 - nx) * 8.2, 1.0, (n0 - nz) * 8.2));
          float ns1 = cloudFast(vW.xz + uSun.xz * 20.0, 0.0);
          float occ = clamp((ns1 - n0) * 5.6, -0.30, 0.88);
          float ndl = dot(cN, normalize(vec3(uSun.x, 0.22, uSun.z)));
          float lit = clamp(ndl * 0.66 + 0.34 - occ * 0.68, 0.0, 1.0);
          // Deep dusty-violet/lavender-slate cloud troughs vs creamy golden-apricot sunlit cloud tops
          float troughAO = smoothstep(0.26, 0.76, n0);
          vec3 deepTrough = vec3(0.42, 0.37, 0.50);
          vec3 shadeCol   = mix(deepTrough, uShade, troughAO);
          vec3 col = mix(shadeCol, uLit, smoothstep(0.16, 0.82, lit) * (0.42 + 0.58 * troughAO));
          // Golden-peach sunrise forward scattering & rim glow on cloud billows
          vec3 V = normalize(cameraPosition - vW);
          float fwd = pow(max(dot(-V, uSun), 0.0), 2.8);
          float rim = smoothstep(0.54, 0.84, n0) * smoothstep(0.42, 0.88, lit);
          col += vec3(0.98, 0.68, 0.38) * (fwd * 0.16 + rim * 0.14);
          float fade = smoothstep(7500.0, 2000.0, dist);
          vec3 horCol = mix(uHor, vec3(0.98, 0.82, 0.64), pow(max(dot(-V, uSun), 0.0), 2.2) * 0.42);
          col = mix(horCol, col, fade);
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), mix(1.0, d, fade));
        }
      `,
      transparent: true, depthWrite: false,
    });
    const makeCloudPlane = (half, seg, pow) => {
      const cg = new THREE.PlaneGeometry(half * 2, half * 2, seg, seg).rotateX(-Math.PI / 2);
      const cp = cg.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i) / half, z = cp.getZ(i) / half;
        cp.setX(i, Math.sign(x) * Math.pow(Math.abs(x), pow) * half);
        cp.setZ(i, Math.sign(z) * Math.pow(Math.abs(z), pow) * half);
      }
      return cg;
    };
    const cA = new THREE.Mesh(makeCloudPlane(8000, 160, 1.62), cloudMat(-38, 0.02, false)); cA.position.y = -38;
    const cB = new THREE.Mesh(makeCloudPlane(8000, 72, 1.50), cloudMat(-64, 0.0, true)); cB.position.y = -64;
    cA.renderOrder = 1; cB.renderOrder = 0;
    g.add(cB, cA);
    return {
      group: g, padY, heightAt: height, floor: 0, minAlt: -120,
      update(dt, t) {
        cA.material.uniforms.uTime.value = t; cB.material.uniforms.uTime.value = t * 0.7;
        flags.forEach((f, i) => {
          const by = f.userData.baseYaw ?? (Math.PI / 4);
          f.rotation.y = by + Math.sin(t * 5.5 + i * 0.8) * 0.22;
          f.rotation.x = Math.sin(t * 4.3 + i * 0.7) * 0.14;
        });
      },
    };
  },
};

export const THEMES = [borealis, dune, neon, tempest, eclipse, stratos];


