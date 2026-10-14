// Material library + livery application. Every theme re-skins the airframe through applyLivery().
import * as THREE from 'three';
import { makeSkinTextures, makeStripes, makeCamo, makeTireTexture, makeBladeTexture } from './textures.js';
import { GLSL_NOISE } from './noise.js';

export function createMaterials() {
  const T = makeSkinTextures(11);
  for (const t of [T.bump, T.normal, T.rough, T.grime]) t.repeat.set(0.25, 0.25);
  const tireT = makeTireTexture();
  tireT.normal.repeat.set(6, 1); tireT.bump.repeat.set(6, 1);
  const bladeT = makeBladeTexture();
  bladeT.repeat.set(3, 1);
  const stripes = makeStripes();
  stripes.repeat.set(4, 1);

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const M = { T, tireT, bladeT };

  // Shared uniforms for airframe-space procedural AO, exhaust soot, leading-edge wear, dust, rain wetness, and directional env response
  M.skinUniforms = {
    uHeliInv: { value: new THREE.Matrix4() },
    uExplode: { value: 0 },
    uWet: { value: 0 },
    uSootStrength: { value: 1.0 },
    uSootTheme: { value: 1.0 },
    uWearStrength: { value: 1.0 },
    uDust: { value: 0.0 },
    uDustColor: { value: new THREE.Color(0.76, 0.58, 0.38) },
    uEnvSky: { value: new THREE.Color(0.18, 0.28, 0.36) },
    uEnvKey: { value: new THREE.Color(0.46, 0.68, 0.86) },
    uEnvFill: { value: new THREE.Color(0.24, 0.62, 0.52) },
    uEnvGnd: { value: new THREE.Color(0.04, 0.08, 0.12) },
    uKeyDir1: { value: new THREE.Vector3(0.28, 0.78, -0.56).normalize() },
    uKeyDir2: { value: new THREE.Vector3(-0.42, 0.68, -0.60).normalize() },
    uEnvStrength: { value: 0.55 },
    uSpecStrength: { value: 0.58 },
    uDiffCompress: { value: 0.25 },
    uSpecCompress: { value: 0.30 },
    uThemeMode: { value: 1.0 },
  };

  M.glassUniforms = {
    uSkyTop: { value: new THREE.Color(0.28, 0.86, 0.62) },
    uSkyHor: { value: new THREE.Color(0.10, 0.18, 0.26) },
    uSignA: { value: new THREE.Color(0.32, 0.96, 0.68) },
    uSignB: { value: new THREE.Color(0.68, 0.34, 0.94) },
    uReflBoost: { value: 0.75 },
  };

  M.crewUniforms = {
    uCrewLightCol: { value: new THREE.Color(0.32, 0.78, 0.68) },
    uCrewTopCol: { value: new THREE.Color(0.45, 0.62, 0.78) },
    uCrewBoost: { value: 0.45 },
  };

  const enhanceCrew = (mat, boostMul = 1.0) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCrewLightCol = M.crewUniforms.uCrewLightCol;
      sh.uniforms.uCrewTopCol = M.crewUniforms.uCrewTopCol;
      sh.uniforms.uCrewBoost = M.crewUniforms.uCrewBoost;
      sh.uniforms.uCrewMul = { value: boostMul };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCrewObjN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrewObjN = normalize(objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uCrewLightCol, uCrewTopCol;\nuniform float uCrewBoost, uCrewMul;\nvarying vec3 vCrewObjN;')
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          vec3 cn = normalize(vCrewObjN);
          // Directional MFD instrument glow from forward-down (+x, -y) + overhead canopy sky light (+y)
          float mfdW = clamp(cn.x * 0.75 - cn.y * 0.20 + 0.35, 0.0, 1.0);
          float topW = clamp(cn.y * 0.80 + 0.20, 0.0, 1.0);
          vec3 crewIrr = uCrewLightCol * mfdW * 0.95 + uCrewTopCol * topW * 0.75;
          reflectedLight.indirectDiffuse += diffuseColor.rgb * crewIrr * uCrewBoost * uCrewMul;
        `);
    };
    return mat;
  };

  const enhanceSkin = (mat, { isTrim = false, sootMul = 1.0 } = {}) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uHeliInv = M.skinUniforms.uHeliInv;
      sh.uniforms.uExplode = M.skinUniforms.uExplode;
      sh.uniforms.uWet = M.skinUniforms.uWet;
      sh.uniforms.uSootStrength = { value: sootMul };
      sh.uniforms.uSootTheme = M.skinUniforms.uSootTheme;
      sh.uniforms.uWearStrength = M.skinUniforms.uWearStrength;
      sh.uniforms.uDust = M.skinUniforms.uDust;
      sh.uniforms.uDustColor = M.skinUniforms.uDustColor;
      sh.uniforms.uEnvSky = M.skinUniforms.uEnvSky;
      sh.uniforms.uEnvKey = M.skinUniforms.uEnvKey;
      sh.uniforms.uEnvFill = M.skinUniforms.uEnvFill;
      sh.uniforms.uEnvGnd = M.skinUniforms.uEnvGnd;
      sh.uniforms.uKeyDir1 = M.skinUniforms.uKeyDir1;
      sh.uniforms.uKeyDir2 = M.skinUniforms.uKeyDir2;
      sh.uniforms.uEnvStrength = M.skinUniforms.uEnvStrength;
      sh.uniforms.uSpecStrength = M.skinUniforms.uSpecStrength;
      sh.uniforms.uDiffCompress = M.skinUniforms.uDiffCompress;
      sh.uniforms.uSpecCompress = M.skinUniforms.uSpecCompress;
      sh.uniforms.uThemeMode = M.skinUniforms.uThemeMode;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uHeliInv;\nvarying vec3 vAirP;\nvarying vec3 vAirN;\nvarying vec3 vSkinWorldP;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          mat4 toAir = uHeliInv * modelMatrix;
          vAirP = (toAir * vec4(position, 1.0)).xyz;
          vAirN = normalize(mat3(toAir) * objectNormal);
          vSkinWorldP = (modelMatrix * vec4(position, 1.0)).xyz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uExplode, uWet, uSootStrength, uSootTheme, uWearStrength, uDust, uEnvStrength, uSpecStrength, uDiffCompress, uSpecCompress, uThemeMode;
          uniform vec3 uDustColor, uEnvSky, uEnvKey, uEnvFill, uEnvGnd, uKeyDir1, uKeyDir2;
          varying vec3 vAirP;
          varying vec3 vAirN;
          varying vec3 vSkinWorldP;
          ` + GLSL_NOISE)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          float airKeep = clamp(1.0 - uExplode * 1.5, 0.0, 1.0);
          vec3 ap = vAirP;
          vec3 an = normalize(vAirN);
          float absZ = abs(ap.z);

          float rMapVal = clamp(roughnessFactor / max(roughness, 0.001), 0.0, 1.0);
          float seamMask = smoothstep(0.86, 0.60, rMapVal);
          roughnessFactor = clamp(roughness * (0.90 + (rMapVal - 0.52) * 0.85), 0.14, 0.94);

          // 1. Exhaust plume soot, aft-shoulder downwash & tempered heat discoloration on aft nacelle & tailboom
          float exPlumeX = (1.0 - smoothstep(-2.15, -1.55, ap.x)) * smoothstep(-7.1, -3.0, ap.x);
          float exPlumeY = exp(-pow((ap.y - 2.38) / 0.56, 2.0));
          float exPlumeZ = exp(-pow((absZ - 0.38) / 0.56, 2.0)) + 0.72 * exp(-pow((absZ - 0.98) / 0.42, 2.0));
          float sootPlume = exPlumeX * exPlumeY * exPlumeZ;

          // Aft fuselage shoulder wash right below/behind exhaust nozzle (reads in hero, profile & rear shots)
          float shX = (1.0 - smoothstep(-1.35, -0.80, ap.x)) * smoothstep(-4.2, -2.5, ap.x);
          float shY = exp(-pow((ap.y - 2.18) / 0.48, 2.0));
          float shZ = smoothstep(0.32, 0.58, absZ) * (1.0 - smoothstep(1.18, 1.42, absZ));
          float sootShoulder = shX * shY * shZ * 0.82;

          float exNacX = (1.0 - smoothstep(-0.35, 0.25, ap.x)) * smoothstep(-3.08, -2.62, ap.x);
          float exNacY = exp(-pow((ap.y - 2.78) / 0.38, 2.0));
          float exNacZ = smoothstep(0.66, 0.92, absZ) * (1.0 - smoothstep(1.66, 1.80, absZ));
          float sootNacelle = exNacX * exNacY * exNacZ;

          vec2 spUv = vec2(ap.x * 1.6, ap.y * 9.5 + ap.z * 7.2);
          float streakNoise = 0.52 + 0.48 * (vnoise(spUv) * 0.60 + vnoise(spUv * 2.4) * 0.40) + (1.0 - seamMask) * 0.30;
          float sootRaw = (sootPlume * 0.92 + sootShoulder * 0.72 + sootNacelle * 0.98) * streakNoise * uSootStrength * uSootTheme * airKeep;
          float soot = clamp(sootRaw, 0.0, 0.88);
          // Restrict thermal oxidation halo strictly to the aft nacelle exhaust shroud (x = -1.25..-2.95, behind the roundel)
          float exHeatX = (1.0 - smoothstep(-1.55, -1.05, ap.x)) * smoothstep(-3.05, -2.55, ap.x);
          float heatZone = clamp((exHeatX * exNacY * exNacZ * 1.05 + sootShoulder * 0.32) * (0.62 + 0.38 * vnoise(spUv * 1.5)) * uSootStrength * uSootTheme * airKeep, 0.0, 0.82);
          float heatHalo = clamp(heatZone, 0.0, 0.74);

          // 1b. Operational hydraulic & oil weep streaks below rotor pylon, nacelle root & weapon bay seams
          float pyStreakZone = smoothstep(-2.3, -1.6, ap.x) * (1.0 - smoothstep(0.8, 1.4, ap.x)) * smoothstep(1.52, 1.95, ap.y) * (1.0 - smoothstep(2.85, 3.15, ap.y)) * smoothstep(0.28, 0.65, absZ);
          float wStreakNoise = smoothstep(0.56, 0.86, vnoise(vec2(ap.x * 22.0 + ap.y * 4.5, ap.y * 2.4 - absZ * 1.5)) * 0.72 + (1.0 - rMapVal) * 0.28);
          float hydStreak = clamp((pyStreakZone * wStreakNoise * 0.65 + (1.0 - seamMask) * wStreakNoise * 0.28) * uSootStrength * airKeep, 0.0, 0.55);

          // 2. Leading-edge fine scratches driven by panel/grime texture (rMapVal) + high-freq anisotropic scratch noise
          float chineY = 1.30 + smoothstep(6.5, 1.5, ap.x) * 0.28 + smoothstep(1.5, -3.3, ap.x) * 0.42;
          float chineBevel = exp(-pow((ap.y - chineY) / 0.078, 2.0)) * smoothstep(-5.8, 7.3, ap.x) * airKeep;
          float leWing = exp(-pow((ap.x - (1.05 - (absZ - 1.2) * 0.2)) / 0.095, 2.0)) * smoothstep(1.12, 1.32, absZ) * (1.0 - smoothstep(3.45, 3.68, absZ)) * exp(-pow((ap.y - 1.72) / 0.15, 2.0));
          float leNose = smoothstep(6.35, 7.35, ap.x) * smoothstep(0.15, 0.75, an.x);
          float leChine = exp(-pow((ap.y - chineY) / 0.068, 2.0)) * smoothstep(0.32, 0.58, absZ) * smoothstep(0.5, 7.3, ap.x);
          float leNacelle = exp(-pow((ap.x - 1.36) / 0.18, 2.0)) * exp(-pow((ap.y - 2.78) / 0.48, 2.0)) * smoothstep(0.68, 0.95, absZ);
          float leFan = smoothstep(0.42, 0.86, ap.x) * (1.0 - smoothstep(0.90, 1.12, ap.x)) * smoothstep(2.82, 3.12, absZ) * exp(-pow((ap.y - 1.73) / 0.32, 2.0));
          float leTail = smoothstep(0.45, 0.85, an.x) * (1.0 - smoothstep(-6.0, -5.6, ap.x)) * smoothstep(2.05, 2.25, ap.y);

          float scrNoise1 = vnoise(vec2(ap.x * 26.0, ap.y * 88.0 + ap.z * 88.0));
          float scrNoise2 = vnoise(vec2(ap.x * 54.0 - ap.y * 20.0, ap.y * 145.0 - ap.z * 125.0));
          float scratchTex = smoothstep(0.56, 0.85, scrNoise1 * 0.58 + scrNoise2 * 0.42 + (rMapVal - 0.5) * 0.28);
          float leZone = clamp(leWing * 0.88 + leNose * 0.62 + leChine * 0.45 + leNacelle * 0.72 + leFan * 0.62 + leTail * 0.56, 0.0, 1.0);
          float edgeWear = clamp(leZone * (0.26 + 0.74 * scratchTex) * uWearStrength * airKeep, 0.0, 0.68);

          // 3. Lower-hull, sponson & lift-fan operational dust/grime weathering across all liveries
          float dustAllow = (1.0 - smoothstep(7.15, 7.42, ap.x)) * (1.0 - smoothstep(5.0, 5.4, ap.x) * (1.0 - smoothstep(0.78, 0.92, ap.y))) * ${isTrim ? '0.15' : '1.0'};
          float lowerHull = 1.0 - smoothstep(chineY - 0.25, chineY + 0.28, ap.y);
          float lowerFan = smoothstep(2.50, 2.92, absZ) * (1.0 - smoothstep(1.48, 1.92, ap.y));
          float lowerSponson = smoothstep(-3.4, -2.9, ap.x) * (1.0 - smoothstep(-1.4, -1.0, ap.x)) * (1.0 - smoothstep(1.05, 1.62, ap.y));
          float dustGrime = clamp((rMapVal - 0.36) * 1.25, 0.0, 1.0);
          float dustNoise = 0.55 * vnoise(vec2(ap.x * 2.2, ap.y * 6.8 + ap.z * 3.8)) + 0.45 * vnoise(vec2(ap.x * 7.8, ap.y * 19.0 - ap.z * 9.5));
          float dustSeam = (1.0 - seamMask) * (1.0 - smoothstep(1.30, 2.55, ap.y)) * 0.34;
          float dustMask = clamp((max(lowerHull, max(lowerFan, lowerSponson)) * (0.40 + 0.32 * dustGrime + 0.36 * dustNoise) + dustSeam) * dustAllow * uDust * airKeep, 0.0, 0.78);

          // 4. Fine vertical rain streaks & panel-seam runoff drips (Tempest & Neon)
          float topWet = uWet * smoothstep(-0.55, 0.45, an.y) * 0.65;
          float flankVert = smoothstep(0.28, 0.70, abs(an.z)) * (1.0 - smoothstep(0.55, 0.88, abs(an.y)));
          vec2 rainUv1 = vec2(ap.x * 30.0 + sin(ap.y * 5.5) * 0.20, ap.y * 1.25 - absZ * 0.6);
          vec2 rainUv2 = vec2(ap.x * 64.0 - sin(ap.y * 9.0) * 0.14, ap.y * 2.0 + absZ * 0.9);
          float rStreak1 = smoothstep(0.54, 0.84, vnoise(rainUv1) * 0.74 + (1.0 - rMapVal) * 0.26);
          float rStreak2 = smoothstep(0.60, 0.88, vnoise(rainUv2));
          float canopyDripZone = smoothstep(1.22, 1.48, ap.y) * (1.0 - smoothstep(2.32, 2.68, ap.y)) * smoothstep(1.2, 1.8, ap.x) * (1.0 - smoothstep(5.6, 6.3, ap.x));
          float seamDrip = (1.0 - seamMask) * (0.42 + 0.58 * rStreak1);
          float wetRunoff = clamp(((rStreak1 * 0.56 + rStreak2 * 0.44) * (0.40 + 0.60 * canopyDripZone) * flankVert + seamDrip * 0.38) * uWet * airKeep, 0.0, 0.88);

          // 5. Analytical airframe crevice & self-occlusion AO
          float aoCrevice = 1.0;
          float wr = exp(-pow((absZ - 1.05) / 0.24, 2.0)) * exp(-pow((ap.y - 1.66) / 0.22, 2.0)) * smoothstep(-1.1, -0.5, ap.x) * (1.0 - smoothstep(0.85, 1.4, ap.x));
          float nv = exp(-pow((absZ - 0.58) / 0.22, 2.0)) * exp(-pow((ap.y - 2.82) / 0.35, 2.0)) * smoothstep(-2.4, -1.8, ap.x) * (1.0 - smoothstep(1.0, 1.6, ap.x));
          float sp = exp(-pow((absZ - 0.96) / 0.22, 2.0)) * exp(-pow((ap.y - 1.15) / 0.25, 2.0)) * smoothstep(-3.3, -2.8, ap.x) * (1.0 - smoothstep(-0.1, 0.6, ap.x));
          float py = exp(-pow((ap.y - 2.88) / 0.16, 2.0)) * (1.0 - smoothstep(0.25, 0.55, absZ)) * smoothstep(-2.3, -1.7, ap.x) * (1.0 - smoothstep(0.9, 1.45, ap.x));
          float belly = (1.0 - smoothstep(0.72, 1.30, ap.y)) * (1.0 - smoothstep(-0.75, 0.15, an.y)) * 0.32;
          float underWing = (1.0 - smoothstep(-0.8, 0.05, an.y)) * 0.20;
          aoCrevice -= (wr * 0.34 + nv * 0.36 + sp * 0.32 + py * 0.30 + belly + underWing) * airKeep;
          aoCrevice = clamp(aoCrevice, 0.46, 1.0);

          // 6. Apply diffuse albedo weathering BEFORE lights_fragment_begin so both direct & indirect lighting respond
          if (uThemeMode > 2.5 && uThemeMode < 3.5) {
            // Tempest: subtle two-tone naval tactical band modulation on nacelle & upper hull matching target render
            float tBand = smoothstep(0.34, 0.66, sin(ap.x * 2.85 - ap.y * 1.25 + (rMapVal - 0.5) * 0.65) * 0.5 + 0.5);
            float upperBandGate = 0.40 + 0.60 * smoothstep(1.55, 2.38, ap.y);
            diffuseColor.rgb *= mix(1.0, mix(0.78, 1.16, tBand), upperBandGate);
          }
          // Wet pigment darkening & vertical rain-streak contrast + hydraulic weep streaks
          diffuseColor.rgb *= 1.0 - topWet * 0.08 - wetRunoff * 0.12 - hydStreak * 0.26;
          // Tempered bronze/violet heat-oxidation halo on aft nacelle + matte carbon exhaust soot core
          float isDarkLivery = step(0.5, uThemeMode) * step(uThemeMode, 3.5);
          vec3 heatCol = mix(vec3(0.34, 0.19, 0.08), vec3(0.12, 0.15, 0.26), smoothstep(0.34, 0.74, heatHalo));
          diffuseColor.rgb = mix(diffuseColor.rgb, heatCol, heatHalo * 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.012, 0.012), soot);
          // Powdery lower-hull & lift-fan operational dust / arctic frost / sea-salt spray
          diffuseColor.rgb = mix(diffuseColor.rgb, uDustColor * (0.90 + 0.16 * dustNoise), dustMask * 0.58);
          // Fine bare-metal leading-edge micro-scratches & panel-corner wear
          vec3 scratchMetal = mix(diffuseColor.rgb * 1.28 + vec3(0.06, 0.065, 0.075), vec3(0.62, 0.66, 0.72), smoothstep(0.18, 0.48, edgeWear));
          diffuseColor.rgb = mix(diffuseColor.rgb, scratchMetal, edgeWear * 0.60);
          diffuseColor.rgb *= mix(1.0, aoCrevice, 0.55);

          // 7. Adjust roughness for matte soot, powdery dust, polished leading-edge scratches, oil streaks & glossy rain streaks
          roughnessFactor = mix(roughnessFactor, 0.95, soot * 0.84);
          roughnessFactor = mix(roughnessFactor, 0.92, dustMask * 0.84);
          roughnessFactor = mix(roughnessFactor, 0.22, hydStreak * 0.56);
          roughnessFactor = mix(roughnessFactor, 0.16, edgeWear * 0.68);
          roughnessFactor = mix(roughnessFactor, clamp(roughnessFactor * 0.58, 0.18, 0.34), max(topWet * 0.45, wetRunoff * 0.75));
        `)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          // Airframe-aware side-flank self-occlusion vs dorsal-crown exposure
          float isSideFlank = smoothstep(0.54, 0.76, abs(an.z)) * (1.0 - smoothstep(0.15, 0.76, an.y)) * airKeep;
          float isDorsalCrown = clamp(
            smoothstep(2.60, 2.95, ap.y) * smoothstep(0.36, 0.78, an.y) +
            smoothstep(0.68, 0.88, an.y) * smoothstep(1.25, 1.72, ap.y) +
            smoothstep(1.18, 1.34, absZ) * smoothstep(0.55, 0.82, an.y),
            0.0, 1.0
          ) * airKeep;
          float flankAtten = mix(1.0, 0.14 + 0.38 * chineBevel, isSideFlank);

          // Independent soft-knee compression & theme light balancing
          if (uThemeMode > 0.5 && uThemeMode < 1.5) {
            // Borealis: dark obsidian hull diffuse; tame nose-cone hotspot & flat side-flank sky wash
            reflectedLight.directDiffuse *= 0.26 * flankAtten;
            float noseClamp = 1.0 - 0.68 * smoothstep(5.4, 7.0, ap.x) * (1.0 - isDorsalCrown * 0.4);
            reflectedLight.directSpecular *= noseClamp * 0.46 * flankAtten;
            reflectedLight.indirectSpecular *= mix(0.68, 0.14 + 0.34 * chineBevel, isSideFlank);
          } else if (uThemeMode > 1.5 && uThemeMode < 2.5) {
            // Neon: keep night graphite dark & neutral across hull, nacelle, wing & tail fin (suppress purple/magenta PMREM & hemi wash)
            float lDDN = dot(reflectedLight.directDiffuse, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, vec3(lDDN) * vec3(0.88, 0.92, 1.02), 0.85) * 0.22 * flankAtten;
            float lDSN = dot(reflectedLight.directSpecular, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.directSpecular = mix(reflectedLight.directSpecular, vec3(lDSN) * vec3(0.90, 0.94, 1.04), 0.80) * 0.28 * flankAtten;
            float lIDN = dot(reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, vec3(lIDN) * vec3(0.88, 0.92, 1.02), 0.85) * 0.28;
            float lISN = dot(reflectedLight.indirectSpecular, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, vec3(lISN) * vec3(0.92, 0.94, 1.02), 0.72) * 0.22 * mix(0.75, 0.18 + 0.34 * chineBevel, isSideFlank);
          } else if (uThemeMode > 2.5 && uThemeMode < 3.5) {
            // Tempest: cohesive dark naval slate across upper and lower cheeks + cool-balanced deck floodlight response
            float tempestSide = mix(0.68, 0.36, smoothstep(-0.25, 0.55, an.y) * smoothstep(0.45, 0.78, abs(an.z))) + 0.24 * chineBevel;
            float lumaDD = dot(reflectedLight.directDiffuse, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, vec3(lumaDD) * vec3(0.76, 0.88, 1.02), 0.95) * 0.13 * tempestSide;
            float lumaID = dot(reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, vec3(lumaID) * vec3(0.78, 0.89, 1.02), 0.85) * mix(0.82, 0.56, smoothstep(-0.15, 0.55, an.y) * smoothstep(0.45, 0.78, abs(an.z)));
            float lumaDS = dot(reflectedLight.directSpecular, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.directSpecular = mix(reflectedLight.directSpecular, vec3(lumaDS) * vec3(0.82, 0.92, 1.05), 0.95) * 0.32 * tempestSide;
            float lumaIS = dot(reflectedLight.indirectSpecular, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, vec3(lumaIS) * vec3(0.80, 0.92, 1.06), 0.95) * mix(0.56, 0.28 + 0.32 * chineBevel, isSideFlank);
          } else if (uThemeMode > 4.5) {
            // Dune: sculpt 3D facet contrast on shadowed +Z flank while preserving warm desert sand bounce on lower cheek
            float duneFlankDiff = mix(1.0, 0.78 + 0.22 * chineBevel, isSideFlank) * mix(0.84, 1.0, smoothstep(-0.55, 0.25, an.y));
            float lIDD = dot(reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722));
            vec3 coolEarthAmb = mix(reflectedLight.indirectDiffuse, vec3(lIDD) * vec3(0.95, 0.96, 1.01), 0.25 * isSideFlank);
            reflectedLight.indirectDiffuse = coolEarthAmb * duneFlankDiff;
            reflectedLight.directSpecular *= mix(0.82, 0.34 + 0.42 * chineBevel, isSideFlank) * (1.0 - dustMask * 0.76);
            reflectedLight.indirectSpecular *= mix(0.70, 0.22 + 0.36 * chineBevel, isSideFlank) * (1.0 - dustMask * 0.80);
          }
          if (uDiffCompress > 0.01) {
            reflectedLight.directDiffuse = reflectedLight.directDiffuse / (1.0 + reflectedLight.directDiffuse * uDiffCompress);
          }
          if (uSpecCompress > 0.01) {
            reflectedLight.directSpecular = reflectedLight.directSpecular / (1.0 + reflectedLight.directSpecular * uSpecCompress);
          }

          // Matte soot absorbs diffuse & specular across all liveries; subtle tempered exhaust heat ring & edge wear catch ambient sheen
          float sootAbsorb = clamp(soot * 0.80, 0.0, 0.80);
          reflectedLight.directDiffuse *= 1.0 - sootAbsorb * 0.68;
          reflectedLight.indirectDiffuse *= aoCrevice * (1.0 - sootAbsorb * 0.72) * mix(1.0, 0.34, isSideFlank * step(0.5, uThemeMode) * step(uThemeMode, 2.5));
          reflectedLight.directSpecular *= 1.0 - sootAbsorb * 0.84;
          reflectedLight.indirectSpecular *= mix(1.0, aoCrevice, 0.65) * (1.0 - dustMask * 0.72) * (1.0 - sootAbsorb * 0.86);

          // Subtle tempered bronze-amber & blue-violet exhaust heat-oxidation patina at the aft exhaust shroud + metallic edge wear
          float heatRing = heatHalo * (1.0 - soot * 0.65);
          vec3 temperTint = mix(vec3(0.42, 0.24, 0.11), vec3(0.20, 0.25, 0.42), smoothstep(0.36, 0.72, heatHalo));
          float darkWeathBoost = mix(1.0, 1.25, isDarkLivery);
          reflectedLight.indirectDiffuse += (temperTint * heatRing * 0.022 + uDustColor * dustMask * isDarkLivery * 0.014) * darkWeathBoost * aoCrevice * airKeep;
          reflectedLight.indirectSpecular += (temperTint * heatRing * 0.036 + vec3(0.52, 0.58, 0.66) * edgeWear * 0.028 + vec3(0.32, 0.30, 0.26) * hydStreak * 0.022) * darkWeathBoost * aoCrevice * airKeep;

          // 8. Directional key vs shadow shading + dorsal-crown & chine-bevel specular lobes
          vec3 wN = normalize(inverseTransformDirection(normal, viewMatrix));
          vec3 wV = normalize(cameraPosition - vSkinWorldP);
          vec3 wR = reflect(-wV, wN);
          float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float fresnel = 0.14 + 0.56 * pow(1.0 - ndv, 2.2);
          float gloss = clamp(1.0 - roughnessFactor * 0.68, 0.22, 0.92);
          float panelGloss = clamp(1.08 - (rMapVal - 0.50) * 0.44, 0.76, 1.24) * seamMask;

          // Strong key-side vs shadow-side separation: upward/key-facing facets illuminated, lower/shadow flanks dark but readable
          float skyW = smoothstep(-0.02, 0.72, wN.y);
          float isTempestMode = step(2.5, uThemeMode) * step(uThemeMode, 3.5);
          float shadowSideMask = mix(
            mix(0.24, 1.0, smoothstep(-0.48, 0.28, wN.y)) * mix(1.0, 0.34, isSideFlank),
            mix(0.46, 0.66, smoothstep(-0.55, 0.45, wN.y)),
            isTempestMode
          );
          float k1 = clamp(dot(wN, uKeyDir1), 0.0, 1.0);
          float k2 = clamp(dot(wN, uKeyDir2), 0.0, 1.0);
          float gndW = (1.0 - smoothstep(-0.85, 0.02, wN.y)) * 0.22;
          vec3 envIrr = (uEnvSky * skyW + uEnvKey * pow(k1, 1.25) * 0.85 + uEnvFill * pow(k2, 1.25) * 0.60) * shadowSideMask + uEnvGnd * gndW;
          reflectedLight.indirectDiffuse += diffuseColor.rgb * (1.0 - metalnessFactor) * envIrr * aoCrevice * uEnvStrength;

          // Dual-lobe (broad composite sheen + crisp clearcoat/edge glint) half-vector key specular highlights
          vec3 H1 = normalize(wV + uKeyDir1);
          vec3 H2 = normalize(wV + uKeyDir2);
          float nh1 = clamp(dot(wN, H1), 0.0, 1.0);
          float nh2 = clamp(dot(wN, H2), 0.0, 1.0);
          float g1 = smoothstep(-0.08, 0.28, dot(wN, uKeyDir1));
          float g2 = smoothstep(-0.08, 0.28, dot(wN, uKeyDir2));
          float sLobe1 = (0.52 * pow(nh1, mix(4.5, 11.0, gloss)) + 0.85 * pow(nh1, mix(16.0, 38.0, gloss))) * g1;
          float sLobe2 = (0.52 * pow(nh2, mix(4.2, 10.5, gloss)) + 0.80 * pow(nh2, mix(14.0, 34.0, gloss))) * g2;

          float crownSpecMul = mix(0.75, 0.18 + 0.56 * chineBevel, isSideFlank) * (1.0 + 0.68 * isDorsalCrown) * (1.0 - dustMask * 0.78) * (1.0 + edgeWear * 0.55) * (1.0 + wetRunoff * 0.42);
          float upSpecGate = smoothstep(-0.12, 0.38, wN.y) * crownSpecMul;
          float rSky = smoothstep(-0.05, 0.68, wR.y) * upSpecGate;
          float rKey = pow(clamp(dot(wR, uKeyDir1), 0.0, 1.0), 2.0) * upSpecGate;
          float rFill = pow(clamp(dot(wR, uKeyDir2), 0.0, 1.0), 1.9) * smoothstep(-0.18, 0.35, wN.y) * crownSpecMul;
          float rGnd = (1.0 - smoothstep(-0.65, -0.05, wR.y)) * (1.0 - smoothstep(-0.12, 0.22, wN.y));

          vec3 specEnv = uEnvSky * rSky * 0.60
                       + uEnvKey * (rKey * 0.82 + sLobe1 * 1.35 * crownSpecMul)
                       + uEnvFill * (rFill * 0.78 + sLobe2 * 1.25 * crownSpecMul)
                       + uEnvGnd * rGnd * 0.22;
          reflectedLight.indirectSpecular += specEnv * fresnel * gloss * panelGloss * aoCrevice * uSpecStrength;

          // Theme-specific physically-motivated local light interactions
          if (uThemeMode > 0.5 && uThemeMode < 1.5) {
            // Borealis: subtle localized emerald-green EL strip bounce on top of stub-wing root right beneath nacelle strip
            float elWingBounce = exp(-pow((ap.x + 0.15) / 1.25, 2.0)) * exp(-pow((absZ - 1.32) / 0.52, 2.0)) * exp(-pow((ap.y - 1.75) / 0.22, 2.0)) * smoothstep(0.15, 0.75, an.y);
            reflectedLight.indirectSpecular += vec3(0.20, 0.88, 0.60) * elWingBounce * 0.24 * panelGloss * airKeep;
          } else if (uThemeMode > 1.5 && uThemeMode < 2.5) {
            // Neon: subtle pink/magenta & cyan sign rim speculars on dark graphite upper bevels & chine (excluding tail pusher duct)
            float edgeRim = pow(1.0 - ndv, 2.8);
            float ductExclude = smoothstep(-7.2, -5.8, ap.x);
            float bevelGate = clamp(isDorsalCrown * 0.55 + chineBevel * 0.85, 0.0, 1.0) * ductExclude;
            float rimGate = (0.10 + 0.90 * edgeRim) * bevelGate * gloss * panelGloss * aoCrevice;
            float pinkMix = smoothstep(0.45, -0.35, ap.x * 0.18 + wN.x * 0.35);
            vec3 neonRim = mix(vec3(0.32, 0.78, 0.92), vec3(0.88, 0.28, 0.68), pinkMix);
            float signGlintPink = pow(nh2, 26.0) * g2 * bevelGate;
            float signGlintCyan = pow(nh1, 26.0) * g1 * bevelGate;
            reflectedLight.indirectSpecular += (neonRim * rimGate * 0.09 + vec3(0.92, 0.25, 0.72) * signGlintPink * 0.08 + vec3(0.25, 0.82, 0.95) * signGlintCyan * 0.07) * airKeep;
          } else if (uThemeMode > 2.5 && uThemeMode < 3.5) {
            // Tempest: crisp vertical rain-rivulet glints under canopy sills & along upper cheek seams + balanced upper/lower cheek contrast
            float tempestUpperCheek = smoothstep(0.10, 0.55, an.y) * smoothstep(0.42, 0.72, abs(an.z)) * smoothstep(0.2, 1.5, ap.x) * (1.0 - smoothstep(2.05, 2.30, ap.y));
            reflectedLight.directDiffuse *= 1.0 - tempestUpperCheek * 0.42;
            reflectedLight.indirectDiffuse *= 1.0 - tempestUpperCheek * 0.25;
            float tempestLowerCheek = smoothstep(0.05, -0.45, an.y) * smoothstep(0.42, 0.75, abs(an.z)) * smoothstep(0.2, 1.5, ap.x) * smoothstep(1.05, 1.30, ap.y);
            reflectedLight.indirectDiffuse += diffuseColor.rgb * uEnvKey * tempestLowerCheek * 0.12 * aoCrevice * airKeep;
            float rivuletWave = smoothstep(0.62, 0.94, sin(ap.x * 46.0 + sin(ap.y * 8.0) * 0.35) * 0.5 + 0.5);
            float sillRainGlint = canopyDripZone * clamp(wetRunoff * 0.65 + rivuletWave * rStreak1 * 0.65, 0.0, 1.0) * smoothstep(0.35, 0.85, abs(an.z)) * (0.20 + 0.80 * fresnel);
            reflectedLight.indirectSpecular += vec3(0.66, 0.80, 0.96) * sillRainGlint * 0.13 * aoCrevice * airKeep;
          } else if (uThemeMode > 3.5 && uThemeMode < 4.5) {
            // Stratos: warm golden-pink sunrise rim light along sun-facing upper edges
            float sunRim = pow(1.0 - ndv, 2.0) * smoothstep(-0.10, 0.45, dot(wN, uKeyDir1)) * smoothstep(-0.10, 0.55, wN.y);
            reflectedLight.indirectSpecular += vec3(1.0, 0.72, 0.42) * sunRim * gloss * panelGloss * 0.34;
          } else if (uThemeMode > 4.5) {
            // Dune: warm golden-hour rim glint on dorsal crowns, nacelle top deck, and chine bevel + warm desert pad bounce on lower cheek
            float duneCrownRim = pow(1.0 - ndv, 2.1) * clamp(isDorsalCrown * 0.75 + chineBevel * 0.85 + smoothstep(0.35, 0.78, wN.y) * 0.5, 0.0, 1.0);
            reflectedLight.indirectSpecular += vec3(1.0, 0.76, 0.44) * duneCrownRim * gloss * panelGloss * 0.26 * (1.0 - dustMask * 0.85) * airKeep;
            float sandPadBounce = clamp(-wN.y * 0.55 + 0.28, 0.0, 0.68) * (1.0 - smoothstep(1.45, 2.25, ap.y));
            reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.92, 0.74, 0.48) * sandPadBounce * 0.24 * aoCrevice * airKeep;
          }
        `);
    };
    const origClone = mat.clone.bind(mat);
    mat.clone = () => { const c = origClone(); c.onBeforeCompile = mat.onBeforeCompile; return c; };
    return mat;
  };

  const coolTempestMetal = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uThemeMode = M.skinUniforms.uThemeMode;
      sh.uniforms.uHeliInv = M.skinUniforms.uHeliInv;
      sh.uniforms.uExplode = M.skinUniforms.uExplode;
      sh.uniforms.uDust = M.skinUniforms.uDust;
      sh.uniforms.uDustColor = M.skinUniforms.uDustColor;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uHeliInv;\nvarying vec3 vMetAirP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMetAirP = (uHeliInv * modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uThemeMode, uExplode, uDust;\nuniform vec3 uDustColor;\nvarying vec3 vMetAirP;')
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          float metKeep = clamp(1.0 - uExplode * 1.5, 0.0, 1.0);
          float isGearZone = smoothstep(6.68, 6.82, vMetAirP.x) * (1.0 - smoothstep(7.18, 7.32, vMetAirP.x))
                           + smoothstep(-2.45, -2.15, vMetAirP.x) * (1.0 - smoothstep(-1.45, -1.20, vMetAirP.x));
          float gearDust = (1.0 - smoothstep(0.26, 0.68, vMetAirP.y)) * isGearZone * uDust * metKeep * 0.42;
          diffuseColor.rgb = mix(diffuseColor.rgb, uDustColor * 0.78, gearDust);
          roughnessFactor = mix(roughnessFactor, 0.88, gearDust);
        `)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          if (uThemeMode > 1.5 && uThemeMode < 2.5) {
            // Neon: desaturate purple sky/PMREM wash on rotor blades & machined metal while keeping crisp cool-silver speculars
            float lDDM = dot(reflectedLight.directDiffuse, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, vec3(lDDM) * vec3(0.86, 0.92, 1.02), 0.88) * 0.34;
            float lIDM = dot(reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, vec3(lIDM) * vec3(0.86, 0.92, 1.02), 0.88) * 0.36;
            float lDSM = dot(reflectedLight.directSpecular, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.directSpecular = mix(reflectedLight.directSpecular, vec3(lDSM) * vec3(0.88, 0.94, 1.04), 0.82) * 0.68;
            float lISM = dot(reflectedLight.indirectSpecular, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, vec3(lISM) * vec3(0.88, 0.94, 1.04), 0.82) * 0.64;
          } else if (uThemeMode > 2.5 && uThemeMode < 3.5) {
            float lDD = dot(reflectedLight.directDiffuse, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, vec3(lDD) * vec3(0.78, 0.88, 1.02), 0.95) * 0.36;
            float lDS = dot(reflectedLight.directSpecular, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.directSpecular = mix(reflectedLight.directSpecular, vec3(lDS) * vec3(0.82, 0.92, 1.04), 0.95) * 0.52;
            float lIS = dot(reflectedLight.indirectSpecular, vec3(0.2126, 0.7152, 0.0722));
            reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, vec3(lIS) * vec3(0.80, 0.92, 1.05), 0.95);
          }
          reflectedLight.indirectSpecular *= 1.0 - gearDust * 0.75;
        `);
    };
    const origClone = mat.clone.bind(mat);
    mat.clone = () => { const c = origClone(); c.onBeforeCompile = mat.onBeforeCompile; return c; };
    return mat;
  };

  M.paint = enhanceSkin(phys({
    color: 0x2c3438, roughness: 0.46, metalness: 0.20,
    map: T.grime, normalMap: T.normal, normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: T.rough,
    clearcoat: 0.0,
    envMapIntensity: 1.2,
  }));

  M.paint2 = enhanceSkin(phys({
    color: 0x1e2428, roughness: 0.40, metalness: 0.24,
    map: T.grime, normalMap: T.normal, normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: T.rough,
    clearcoat: 0.0,
    envMapIntensity: 1.2,
  }));

  M.trim = enhanceSkin(phys({
    color: 0x181c22, roughness: 0.36, metalness: 0.28,
    map: T.grime, normalMap: T.normal, normalScale: new THREE.Vector2(0.48, 0.48),
    roughnessMap: T.rough, clearcoat: 0.0,
    envMapIntensity: 1.15,
  }), { isTrim: true, sootMul: 0.5 });

  M.composite = enhanceSkin(phys({
    color: 0x22262c, roughness: 0.42, metalness: 0.18,
    map: T.grime, normalMap: T.normal, normalScale: new THREE.Vector2(0.45, 0.45),
    roughnessMap: T.rough, clearcoat: 0.0,
    envMapIntensity: 1.15,
  }), { isTrim: true, sootMul: 0.5 });

  M.metal = coolTempestMetal(std({ color: 0xaab2ba, roughness: 0.26, metalness: 0.78, envMapIntensity: 2.0 }));
  M.darkMetal = coolTempestMetal(std({ color: 0x484e56, roughness: 0.34, metalness: 0.58, normalMap: T.normal, normalScale: new THREE.Vector2(0.28, 0.28), envMapIntensity: 1.8 }));
  M.steel = coolTempestMetal(std({ color: 0xd6dce2, roughness: 0.18, metalness: 0.85, envMapIntensity: 2.2 }));
  M.titanium = coolTempestMetal(std({ color: 0x969184, roughness: 0.28, metalness: 0.78, envMapIntensity: 2.0 }));
  M.brass = std({ color: 0xb48c4c, roughness: 0.28, metalness: 0.85, envMapIntensity: 1.6 });
  M.rubber = std({
    color: 0x181a1d, roughness: 0.82, metalness: 0.04,
    normalMap: tireT.normal, normalScale: new THREE.Vector2(1.2, 1.2),
  });
  M.rubber.onBeforeCompile = (sh) => {
    sh.uniforms.uHeliInv = M.skinUniforms.uHeliInv;
    sh.uniforms.uExplode = M.skinUniforms.uExplode;
    sh.uniforms.uDust = M.skinUniforms.uDust;
    sh.uniforms.uDustColor = M.skinUniforms.uDustColor;
    sh.uniforms.uWet = M.skinUniforms.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uHeliInv;\nvarying vec3 vRubAirP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRubAirP = (uHeliInv * modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uExplode, uDust, uWet;\nuniform vec3 uDustColor;\nvarying vec3 vRubAirP;\n' + GLSL_NOISE)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float rubKeep = clamp(1.0 - uExplode * 1.5, 0.0, 1.0);
        float tireZone = (1.0 - smoothstep(0.45, 0.95, vRubAirP.y)) * rubKeep;
        float treadDust = (0.45 + 0.55 * vnoise(vRubAirP.xy * 18.0 + vRubAirP.z * 14.0)) * tireZone * uDust;
        roughnessFactor = mix(roughnessFactor, 0.95, clamp(treadDust * 0.85, 0.0, 0.85));
        roughnessFactor = mix(roughnessFactor, 0.36, uWet * 0.55);
      `)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        diffuseColor.rgb *= 1.0 - uWet * 0.25;
        diffuseColor.rgb = mix(diffuseColor.rgb, uDustColor * 0.68, clamp(treadDust * 0.65, 0.0, 0.62));
      `);
  };

  // Rotor blades: composite skin with crisp metallic leading-edge erosion strip + painted tip band + tiny point LED
  M.blade = coolTempestMetal(phys({
    color: 0x22262c, roughness: 0.42, metalness: 0.18,
    map: bladeT, bumpMap: bladeT, bumpScale: 0.22,
    clearcoat: 0.0,
    envMapIntensity: 1.15,
  }));
  M.bladeLE = coolTempestMetal(std({ color: 0x7c8690, roughness: 0.24, metalness: 0.72, envMapIntensity: 1.8 }));
  M.bladeTip = coolTempestMetal(std({ color: 0xdca824, roughness: 0.42, metalness: 0.20, envMapIntensity: 1.4 }));
  M.tipLED = std({ color: 0x182828, emissive: 0x5ef2ff, emissiveIntensity: 2.6, roughness: 0.15 });

  // Canopy glass: dark transparent armoured glazing that reflects sky/aurora/neon signs while keeping the crew inside clearly visible
  M.glass = new THREE.MeshPhysicalMaterial({
    color: 0x0c141c, metalness: 0.02, roughness: 0.06, transparent: true, opacity: 0.14,
    iridescence: 0.20, iridescenceIOR: 1.50, iridescenceThicknessRange: [220, 480],
    clearcoat: 0.55, clearcoatRoughness: 0.04, reflectivity: 0.85, ior: 1.50,
    envMapIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false,
  });
  M.glass.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = M.skinUniforms.uWet;
    sh.uniforms.uThemeMode = M.skinUniforms.uThemeMode;
    sh.uniforms.uSkyTop = M.glassUniforms.uSkyTop;
    sh.uniforms.uSkyHor = M.glassUniforms.uSkyHor;
    sh.uniforms.uSignA = M.glassUniforms.uSignA;
    sh.uniforms.uSignB = M.glassUniforms.uSignB;
    sh.uniforms.uReflBoost = M.glassUniforms.uReflBoost;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGlassUv;\nvarying vec3 vWorldN;\nvarying vec3 vWorldP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGlassUv = uv;
        vWorldP = (modelMatrix * vec4(position, 1.0)).xyz;
        vWorldN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWet, uReflBoost, uThemeMode;
        uniform vec3 uSkyTop, uSkyHor, uSignA, uSignB;
        varying vec2 vGlassUv;
        varying vec3 vWorldN;
        varying vec3 vWorldP;
        ` + GLSL_NOISE)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        vec3 V = normalize(cameraPosition - vWorldP);
        vec3 Nout = normalize(vWorldN);
        vec3 N = Nout * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 R = reflect(-V, N);
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fresnel = pow(1.0 - ndv, 2.8);

        // Wet rain rivulets, streaks & droplets on canopy glazing in Tempest / Neon
        float rNoise1 = vnoise(vec2(vWorldP.x * 22.0 + vWorldP.z * 18.0, vWorldP.y * 46.0 - vWorldP.x * 12.0));
        float rRivulet = vnoise(vec2(vWorldP.x * 38.0 - vWorldP.y * 10.0, vWorldP.y * 8.0));
        float rainStreaks = uWet * (0.10 * smoothstep(0.76, 0.94, rNoise1) + 0.08 * smoothstep(0.80, 0.96, rRivulet));

        vec3 baseOut = outgoingLight / (1.0 + outgoingLight * 1.8);
        if (uThemeMode > 2.5 && uThemeMode < 3.5) {
          float lOut = dot(baseOut, vec3(0.2126, 0.7152, 0.0722));
          baseOut = mix(baseOut, vec3(lOut) * vec3(0.78, 0.90, 1.04), 0.92);
        }

        if (gl_FrontFacing) {
          float upperCrown = smoothstep(0.18, 0.72, Nout.y);
          float skyGrad = smoothstep(0.05, 0.76, R.y);
          float bandA = pow(smoothstep(0.52, 0.94, sin(R.x * 3.0 + R.z * 2.2 + 0.6) * 0.5 + 0.5), 2.6) * smoothstep(0.10, 0.76, R.y) * smoothstep(0.24, 0.76, Nout.y);
          float bandB = pow(smoothstep(0.56, 0.95, cos(R.x * 2.5 - R.y * 2.8) * 0.5 + 0.5), 2.8) * smoothstep(0.22, 0.76, Nout.y);
          vec3 envRefl = mix(uSkyHor * 0.18, uSkyTop, skyGrad * upperCrown)
                       + uSignA * bandA * 0.85
                       + uSignB * bandB * 0.65;
          float reflMask = clamp((0.16 * upperCrown + 0.58 * fresnel + 0.58 * (bandA + bandB * 0.70)) * uReflBoost, 0.0, 0.88);
          vec3 finalRgb = baseOut * 0.10 + envRefl * (0.16 + 0.78 * reflMask) + vec3(0.76, 0.88, 1.0) * rainStreaks * 0.55;
          float alpha = clamp(0.08 + fresnel * 0.22 + reflMask * 0.28 + rainStreaks * 0.18, 0.08, 0.38);
          gl_FragColor = vec4(finalRgb, alpha);
        } else {
          // Inside cockpit view: grazing Fresnel reflection of green/cyan MFD displays & sky rim on curved canopy panels
          float sideCurve = smoothstep(0.20, 0.78, abs(Nout.z));
          float topCurve = smoothstep(0.35, 0.88, Nout.y);
          float inFres = pow(1.0 - ndv, 2.2);
          float mfdBand = pow(smoothstep(0.35, 0.92, sin(R.x * 7.5 + R.z * 5.0) * 0.5 + 0.5), 2.2) * (0.35 + 0.65 * sideCurve);
          vec3 mfdRefl = mix(vec3(0.22, 0.95, 0.64), vec3(0.28, 0.84, 0.98), smoothstep(-0.2, 0.4, R.z)) * (0.28 * inFres + 0.36 * mfdBand * (0.3 + 0.7 * inFres));
          vec3 skyRimRefl = mix(uSkyHor, uSkyTop, smoothstep(-0.2, 0.6, Nout.y)) * (0.18 * topCurve + 0.32 * inFres);
          vec3 inRgb = baseOut * 0.08 + mfdRefl * 0.55 + skyRimRefl * 0.38 + vec3(0.76, 0.88, 1.0) * rainStreaks * 0.65;
          float inAlpha = clamp(0.045 + inFres * 0.16 + sideCurve * 0.055 + rainStreaks * 0.18, 0.045, 0.24);
          gl_FragColor = vec4(inRgb, inAlpha);
        }
      `);
  };

  // Recessed formation light strips: thin, crisp aircraft EL strips + dimmer duct/intake rings
  M.glow = std({ color: 0x10181c, emissive: 0x5ef2ff, emissiveIntensity: 1.5, roughness: 0.25, metalness: 0.2 });
  M.glowSoft = std({ color: 0x0c1418, emissive: 0x5ef2ff, emissiveIntensity: 0.75, roughness: 0.3, metalness: 0.2 });
  M.glowRing = std({ color: 0x0a1014, emissive: 0x5ef2ff, emissiveIntensity: 0.65, roughness: 0.3, metalness: 0.25 });
  M.formationDot = std({ color: 0x081810, emissive: 0x38ff88, emissiveIntensity: 0.75, roughness: 0.25 });
  M.heat = std({ color: 0x120604, emissive: 0xff5a1a, emissiveIntensity: 0, roughness: 0.7, metalness: 0.6 });
  M.lens = phys({ color: 0x05080c, roughness: 0.03, metalness: 0.85, clearcoat: 1.0, clearcoatRoughness: 0.02, iridescence: 0.7, iridescenceIOR: 1.6, envMapIntensity: 2.8 });
  M.lensRed = phys({ color: 0x140305, emissive: 0xff2030, emissiveIntensity: 0.12, roughness: 0.04, metalness: 0.6, clearcoat: 1.0, envMapIntensity: 2.2 });
  M.interior = enhanceCrew(std({ color: 0x32373e, roughness: 0.68, metalness: 0.22 }), 0.78);
  M.interiorDark = enhanceCrew(std({ color: 0x181c22, roughness: 0.76, metalness: 0.16 }), 0.68);
  M.seat = enhanceCrew(std({ color: 0x44423c, roughness: 0.88 }), 0.75);
  M.suit = enhanceCrew(std({ color: 0x606a56, roughness: 0.82 }), 1.0);
  M.helmet = enhanceCrew(std({ color: 0xe2e4de, roughness: 0.28, metalness: 0.15, envMapIntensity: 2.0 }), 1.15);
  M.visor = std({ color: 0x080a0e, roughness: 0.04, metalness: 0.92, envMapIntensity: 2.8 });
  M.yellow = std({ color: 0xe8b321, roughness: 0.45, metalness: 0.15 });
  M.red = std({ color: 0xc82820, roughness: 0.45, metalness: 0.15 });
  M.stripes = std({ map: stripes, roughness: 0.55 });
  M.navRed = std({ color: 0x280404, emissive: 0xff2218, emissiveIntensity: 1.1, roughness: 0.15 });
  M.navGreen = std({ color: 0x04280c, emissive: 0x18ff62, emissiveIntensity: 1.1, roughness: 0.15 });
  M.navWhite = std({ color: 0x282828, emissive: 0xfff8ee, emissiveIntensity: 0.9, roughness: 0.15 });
  M.strobe = std({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 0 });
  M.beacon = std({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 0 });
  M.ledG = std({ color: 0x001100, emissive: 0x3cff7a, emissiveIntensity: 1.0 });
  M.ledA = std({ color: 0x110800, emissive: 0xffa420, emissiveIntensity: 1.0 });
  M.ledR = std({ color: 0x110000, emissive: 0xff3030, emissiveIntensity: 1.0 });
  M.missile = std({ color: 0x585c50, roughness: 0.48, metalness: 0.25, normalMap: T.normal, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 1.8 });
  M.missileNose = std({ color: 0x0b0c0e, roughness: 0.08, metalness: 0.65, envMapIntensity: 2.0 });
  M.decal = std({ color: 0xffffff, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });

  // x-ray system colours
  const sysCol = { engine: 0xff7a3d, drive: 0xffc94d, fuel: 0x37ff9e, elec: 0x3dc8ff, hyd: 0xb57dff, avionics: 0x7dffe4,
    weapon: 0xff3d5a, crew: 0xaab4c4, struct: 0x8aa0b8, rotor: 0xdfe8ff, gear: 0x9fb0c0 };
  M.sysColor = sysCol;
  M.sys = {};
  for (const k in sysCol) {
    M.sys[k] = std({ color: new THREE.Color(sysCol[k]).multiplyScalar(0.25), emissive: sysCol[k], emissiveIntensity: 0.55,
      roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.92 });
  }
  M.camoCache = {};
  return M;
}

const C = (v) => new THREE.Color(v);

/** Apply a livery description to the shared materials. */
export function applyLivery(M, L) {
  const glowHex = (L.glow || '').toLowerCase();
  const isBorealis = glowHex === '#46ffc8';
  const isNeon = glowHex === '#ff2bd6';
  const isTempest = glowHex === '#9fd8ff';
  const isStratos = glowHex === '#ffc65a';
  const isEclipse = glowHex === '#ff3a2a';
  const isDune = !!L.camo;
  const isNight = isBorealis || isNeon || isTempest;

  if (L.camo) {
    const key = L.camo.join();
    if (!M.camoCache[key]) {
      const t = makeCamo(L.camo, 3, M.T.grimeCanvas);
      t.repeat.set(0.25, 0.25);
      t.anisotropy = M.T.grime.anisotropy;
      M.camoCache[key] = t;
    }
    M.paint.map = M.camoCache[key];
    // Balanced CARC multiplier so 5.3 sun intensity doesn't blow out desert camo into plasticky orange
    M.paint.color.set(0xffffff).multiplyScalar(0.98);
  } else if (isBorealis) {
    // Neutral dark obsidian composite (no green-teal base tint)
    M.paint.map = M.T.grime;
    M.paint.color.set('#14171c');
  } else if (isNeon) {
    // Deep night satin graphite composite (never lilac/grey)
    M.paint.map = M.T.grime;
    M.paint.color.set('#1b1e25');
  } else if (isTempest) {
    // Wet naval slate-charcoal matching draft render contrast
    M.paint.map = M.T.grime;
    M.paint.color.set('#1c2530');
  } else {
    M.paint.map = M.T.grime;
    M.paint.color.copy(C(L.paint));
  }
  M.paint.needsUpdate = true;

  // Dielectric paint (metalness <= 0.26), calibrated roughness/normalScale/envMapIntensity per theme
  if (isDune) {
    // Matte-tactical desert CARC coating (crisp normal relief, zero plasticky gloss)
    M.paint.roughness = 0.72;
    M.paint.metalness = 0.08;
    M.paint.normalScale.set(1.02, 1.02);
    M.paint.clearcoat = 0.0;
    M.paint.envMapIntensity = 0.72;
  } else if (isBorealis) {
    M.paint.roughness = 0.36;
    M.paint.metalness = 0.22;
    M.paint.normalScale.set(1.05, 1.05);
    M.paint.clearcoat = 0.0;
    M.paint.envMapIntensity = 0.82;
  } else if (isNeon) {
    M.paint.roughness = 0.34;
    M.paint.metalness = 0.22;
    M.paint.normalScale.set(1.08, 1.08);
    M.paint.clearcoat = 0.0;
    M.paint.envMapIntensity = 0.45;
  } else if (isTempest) {
    M.paint.roughness = 0.32;
    M.paint.metalness = 0.22;
    M.paint.normalScale.set(1.12, 1.12);
    M.paint.clearcoat = 0.0;
    M.paint.envMapIntensity = 0.48;
  } else {
    const r0 = L.rough ?? 0.44;
    M.paint.roughness = r0;
    M.paint.metalness = Math.min(0.24, L.metal ?? 0.20);
    M.paint.normalScale.set(1.12, 1.12);
    M.paint.clearcoat = 0.0;
    M.paint.envMapIntensity = 1.20;
  }

  // Secondary fairings & lift-fan shrouds
  if (isDune) {
    M.paint2.color.set('#ccb286');
    M.paint2.roughness = 0.68;
    M.paint2.metalness = 0.10;
    M.paint2.normalScale.set(0.95, 0.95);
    M.paint2.clearcoat = 0.0;
    M.paint2.envMapIntensity = 0.72;
  } else if (isBorealis) {
    M.paint2.color.set('#101318');
    M.paint2.roughness = 0.34;
    M.paint2.metalness = 0.24;
    M.paint2.normalScale.set(0.90, 0.90);
    M.paint2.clearcoat = 0.0;
    M.paint2.envMapIntensity = 0.82;
  } else if (isNeon) {
    M.paint2.color.set('#12151b');
    M.paint2.roughness = 0.32;
    M.paint2.metalness = 0.24;
    M.paint2.normalScale.set(0.92, 0.92);
    M.paint2.clearcoat = 0.0;
    M.paint2.envMapIntensity = 0.45;
  } else if (isTempest) {
    M.paint2.color.set('#141c24');
    M.paint2.roughness = 0.30;
    M.paint2.metalness = 0.22;
    M.paint2.normalScale.set(0.98, 0.98);
    M.paint2.clearcoat = 0.0;
    M.paint2.envMapIntensity = 0.48;
  } else {
    M.paint2.color.copy(C(L.paint2));
    M.paint2.roughness = Math.max(0.32, M.paint.roughness - 0.05);
    M.paint2.metalness = Math.min(0.26, M.paint.metalness + 0.04);
    M.paint2.normalScale.set(0.95, 0.95);
    M.paint2.clearcoat = 0.0;
    M.paint2.envMapIntensity = isStratos ? 0.85 : 1.20;
  }

  if (isBorealis) {
    M.trim.color.set('#0a0c10');
    M.composite.color.set('#12151a');
    M.blade.color.set('#111418');
  } else if (isNeon) {
    M.trim.color.set('#0a0c10');
    M.composite.color.set('#12151c');
    M.blade.color.set('#111419');
  } else if (isTempest) {
    M.trim.color.set('#0d1218');
    M.composite.color.set('#161d24');
    M.blade.color.set('#141a21');
  } else {
    M.trim.color.copy(C(L.trim));
    M.composite.color.copy(C(L.trim)).multiplyScalar(1.3);
    M.blade.color.copy(C(L.blade ?? L.trim));
  }
  M.trim.metalness = 0.26;
  M.trim.clearcoat = 0.0;
  M.trim.envMapIntensity = isNeon ? 0.45 : isTempest ? 0.48 : isNight ? 0.82 : isDune ? 0.72 : 1.15;

  // Configure directional environment response, weathering intensities, canopy reflections & cockpit crew lighting per theme
  const su = M.skinUniforms;
  const gu = M.glassUniforms;
  const cu = M.crewUniforms;
  if (isBorealis) {
    su.uEnvSky.value.setRGB(0.22, 0.34, 0.46);
    su.uEnvKey.value.setRGB(0.56, 0.78, 0.94);
    su.uEnvFill.value.setRGB(0.26, 0.74, 0.60);
    su.uEnvGnd.value.setRGB(0.02, 0.04, 0.07);
    su.uKeyDir1.value.set(0.22, 0.76, 0.61).normalize();
    su.uKeyDir2.value.set(-0.45, 0.72, 0.52).normalize();
    su.uEnvStrength.value = 0.42;
    su.uSpecStrength.value = 0.84;
    su.uDiffCompress.value = 0.45;
    su.uSpecCompress.value = 0.85;
    su.uThemeMode.value = 1.0;
    su.uDust.value = 0.26;
    su.uDustColor.value.setRGB(0.24, 0.32, 0.36);
    su.uWearStrength.value = 1.08;
    su.uSootTheme.value = 1.25;

    gu.uSkyTop.value.setRGB(0.24, 0.88, 0.60);
    gu.uSkyHor.value.setRGB(0.06, 0.16, 0.24);
    gu.uSignA.value.setRGB(0.28, 0.96, 0.66);
    gu.uSignB.value.setRGB(0.14, 0.72, 0.60);
    gu.uReflBoost.value = 0.62;

    cu.uCrewLightCol.value.setRGB(0.28, 0.95, 0.74);
    cu.uCrewTopCol.value.setRGB(0.46, 0.72, 0.88);
    cu.uCrewBoost.value = 0.68;
  } else if (isNeon) {
    su.uEnvSky.value.setRGB(0.16, 0.18, 0.22);
    su.uEnvKey.value.setRGB(0.40, 0.43, 0.50);
    su.uEnvFill.value.setRGB(0.38, 0.28, 0.40);
    su.uEnvGnd.value.setRGB(0.06, 0.05, 0.08);
    su.uKeyDir1.value.set(0.54, 0.58, 0.61).normalize();
    su.uKeyDir2.value.set(-0.28, 0.72, 0.63).normalize();
    su.uEnvStrength.value = 0.36;
    su.uSpecStrength.value = 0.44;
    su.uDiffCompress.value = 1.35;
    su.uSpecCompress.value = 0.75;
    su.uThemeMode.value = 2.0;
    su.uDust.value = 0.24;
    su.uDustColor.value.setRGB(0.22, 0.24, 0.28);
    su.uWearStrength.value = 1.04;
    su.uSootTheme.value = 1.22;

    gu.uSkyTop.value.setRGB(0.18, 0.76, 0.95);
    gu.uSkyHor.value.setRGB(0.14, 0.08, 0.22);
    gu.uSignA.value.setRGB(0.22, 0.90, 1.0);
    gu.uSignB.value.setRGB(1.0, 0.20, 0.80);
    gu.uReflBoost.value = 0.56;

    cu.uCrewLightCol.value.setRGB(0.24, 0.90, 1.0);
    cu.uCrewTopCol.value.setRGB(0.72, 0.42, 0.88);
    cu.uCrewBoost.value = 0.68;
  } else if (isTempest) {
    su.uEnvSky.value.setRGB(0.20, 0.28, 0.36);
    su.uEnvKey.value.setRGB(0.68, 0.82, 0.96);
    su.uEnvFill.value.setRGB(0.48, 0.64, 0.80);
    su.uEnvGnd.value.setRGB(0.06, 0.09, 0.14);
    su.uKeyDir1.value.set(0.42, 0.70, 0.58).normalize();
    su.uKeyDir2.value.set(-0.48, 0.68, 0.55).normalize();
    su.uEnvStrength.value = 0.20;
    su.uSpecStrength.value = 0.58;
    su.uDiffCompress.value = 2.10;
    su.uSpecCompress.value = 0.55;
    su.uThemeMode.value = 3.0;
    su.uDust.value = 0.34;
    su.uDustColor.value.setRGB(0.28, 0.34, 0.40);
    su.uWearStrength.value = 1.25;
    su.uSootTheme.value = 1.38;

    gu.uSkyTop.value.setRGB(0.56, 0.74, 0.90);
    gu.uSkyHor.value.setRGB(0.12, 0.20, 0.28);
    gu.uSignA.value.setRGB(0.74, 0.88, 1.0);
    gu.uSignB.value.setRGB(0.50, 0.66, 0.82);
    gu.uReflBoost.value = 0.58;

    cu.uCrewLightCol.value.setRGB(0.54, 0.80, 0.94);
    cu.uCrewTopCol.value.setRGB(0.74, 0.86, 0.98);
    cu.uCrewBoost.value = 0.58;
  } else if (isStratos) {
    su.uEnvSky.value.setRGB(0.22, 0.22, 0.30);
    su.uEnvKey.value.setRGB(0.86, 0.58, 0.36);
    su.uEnvFill.value.setRGB(0.26, 0.32, 0.44);
    su.uEnvGnd.value.setRGB(0.16, 0.14, 0.18);
    su.uKeyDir1.value.set(0.76, 0.22, -0.61).normalize();
    su.uKeyDir2.value.set(-0.35, 0.65, 0.65).normalize();
    su.uEnvStrength.value = 0.18;
    su.uSpecStrength.value = 0.28;
    su.uDiffCompress.value = 0.08;
    su.uSpecCompress.value = 0.12;
    su.uThemeMode.value = 4.0;
    su.uDust.value = 0.32;
    su.uDustColor.value.setRGB(0.62, 0.64, 0.68);
    su.uWearStrength.value = 1.10;
    su.uSootTheme.value = 1.32;

    gu.uSkyTop.value.setRGB(0.58, 0.52, 0.46);
    gu.uSkyHor.value.setRGB(0.82, 0.60, 0.42);
    gu.uSignA.value.setRGB(0.92, 0.68, 0.44);
    gu.uSignB.value.setRGB(0.42, 0.48, 0.62);
    gu.uReflBoost.value = 0.40;

    cu.uCrewLightCol.value.setRGB(0.88, 0.68, 0.46);
    cu.uCrewTopCol.value.setRGB(0.68, 0.74, 0.86);
    cu.uCrewBoost.value = 0.26;
  } else if (isDune) {
    // Dune: golden-hour dorsal crown + cooler shadowed flank contrast + warm desert sand lower-hull weathering
    su.uEnvSky.value.setRGB(0.32, 0.36, 0.42);
    su.uEnvKey.value.setRGB(0.88, 0.64, 0.36);
    su.uEnvFill.value.setRGB(0.24, 0.22, 0.20);
    su.uEnvGnd.value.setRGB(0.26, 0.19, 0.11);
    su.uKeyDir1.value.set(0.62, 0.42, -0.42).normalize();
    su.uKeyDir2.value.set(-0.38, 0.65, 0.52).normalize();
    su.uEnvStrength.value = 0.28;
    su.uSpecStrength.value = 0.30;
    su.uDiffCompress.value = 0.22;
    su.uSpecCompress.value = 0.32;
    su.uThemeMode.value = 5.0;
    su.uDust.value = 0.88;
    su.uDustColor.value.setRGB(0.86, 0.74, 0.54);
    su.uWearStrength.value = 1.15;
    su.uSootTheme.value = 1.35;

    gu.uSkyTop.value.setRGB(0.64, 0.70, 0.80);
    gu.uSkyHor.value.setRGB(0.78, 0.58, 0.38);
    gu.uSignA.value.setRGB(0.92, 0.70, 0.44);
    gu.uSignB.value.setRGB(0.48, 0.60, 0.74);
    gu.uReflBoost.value = 0.52;

    cu.uCrewLightCol.value.setRGB(0.72, 0.62, 0.48);
    cu.uCrewTopCol.value.setRGB(0.82, 0.76, 0.68);
    cu.uCrewBoost.value = 0.26;
  } else {
    // Eclipse: warm canyon twilight + subtle red-ochre canyon dust on lower hull & tires
    su.uEnvSky.value.setRGB(0.24, 0.22, 0.20);
    su.uEnvKey.value.setRGB(0.42, 0.30, 0.22);
    su.uEnvFill.value.setRGB(0.20, 0.17, 0.15);
    su.uEnvGnd.value.setRGB(0.18, 0.12, 0.09);
    su.uKeyDir1.value.set(0.62, 0.35, -0.45).normalize();
    su.uKeyDir2.value.set(-0.45, 0.55, 0.45).normalize();
    su.uEnvStrength.value = 0.14;
    su.uSpecStrength.value = 0.18;
    su.uDiffCompress.value = 0.10;
    su.uSpecCompress.value = 0.15;
    su.uThemeMode.value = 0.0;
    su.uDust.value = 0.52;
    su.uDustColor.value.setRGB(0.74, 0.48, 0.32);
    su.uWearStrength.value = 1.12;
    su.uSootTheme.value = 1.28;

    gu.uSkyTop.value.setRGB(0.62, 0.52, 0.38);
    gu.uSkyHor.value.setRGB(0.72, 0.58, 0.42);
    gu.uSignA.value.setRGB(0.68, 0.56, 0.40);
    gu.uSignB.value.setRGB(0.48, 0.44, 0.38);
    gu.uReflBoost.value = 0.44;

    cu.uCrewLightCol.value.setRGB(0.66, 0.58, 0.46);
    cu.uCrewTopCol.value.setRGB(0.78, 0.74, 0.68);
    cu.uCrewBoost.value = 0.24;
  }

  // Crew & cockpit interior base colors
  M.helmet.color.set(isTempest ? 0xc2c8cc : isNight ? 0x98a49e : 0xd8dcd6);
  M.helmet.emissive.set(isBorealis ? 0x102820 : isNeon ? 0x102430 : isTempest ? 0x141e28 : 0x060808);
  M.helmet.emissiveIntensity = isNight ? 0.18 : 0.04;
  M.suit.color.set(isNight ? 0x586254 : 0x606a56);
  M.suit.emissive.set(isBorealis ? 0x0c1c18 : isNeon ? 0x0c1a24 : isTempest ? 0x0e161e : 0x040604);
  M.suit.emissiveIntensity = isNight ? 0.14 : 0.03;
  M.seat.emissive.set(isNight ? 0x0a1016 : 0x000000);
  M.seat.emissiveIntensity = isNight ? 0.08 : 0.0;
  M.interior.color.copy(C(L.interior ?? 0x2c3036));
  M.interior.emissive.set(isNight ? 0x080e14 : 0x000000);
  M.interior.emissiveIntensity = isNight ? 0.08 : 0.0;

  // Calibrated formation strip & duct ring & tip LED intensities
  const glowCol = isEclipse ? C('#ff7638') : isDune ? C('#ffde9e') : C(L.glow);
  M.glow.emissive.copy(glowCol);
  M.glowSoft.emissive.copy(glowCol);
  M.glowRing.emissive.copy(glowCol);
  M.glow.color.copy(glowCol).multiplyScalar(0.72);
  M.glowSoft.color.copy(glowCol).multiplyScalar(0.38);
  M.glowRing.color.copy(glowCol).multiplyScalar(0.18);
  if (M.tipLED) {
    // Crisp rotor-tip point LEDs: emerald in Borealis, subtle in Neon, cool white-cyan in Tempest, warm amber in Eclipse
    const tipCol = isTempest ? C('#d8f8ff') : isEclipse ? C('#ff9648') : glowCol;
    M.tipLED.emissive.copy(tipCol);
    M.tipLED.color.copy(tipCol).multiplyScalar(0.88);
    M.tipLED.userData.base = isBorealis ? 5.2 : isTempest ? 4.8 : isEclipse ? 3.2 : isNeon ? 1.8 : 1.4;
  }
  const baseGlow = isBorealis ? 3.65 : isNeon ? 2.55 : isTempest ? 0.35 : isEclipse ? 1.75 : isStratos ? 1.85 : 2.25;
  M.glow.userData.base = baseGlow;
  M.glowSoft.userData.base = baseGlow * 0.45;
  M.glowRing.userData.base = isNeon ? baseGlow * 0.24 : isBorealis ? baseGlow * 0.04 : 0.02;

  M.glass.color.copy(C(L.glass));
  M.glass.iridescence = (L.irid ?? 0.85) * 0.22;
  M.glass.opacity = 0.14;
  const decalCol = isTempest ? C('#b8cad8') : isBorealis ? C('#8cb8a8') : isNeon ? C('#c2d0e2') : L.camo ? C('#ece0cc') : C(L.decal);
  M.decal.color.copy(decalCol);
  M.decal.emissive.copy(decalCol);
  M.decal.emissiveIntensity = isNeon ? 0.30 : isBorealis ? 0.24 : isNight ? 0.22 : 0.0;
  M.decal.opacity = isNight ? 0.88 : (L.decalOpacity ?? 0.88);
  if (M.stripes) {
    M.stripes.emissive.set(isNeon ? '#ff8820' : '#000000');
    M.stripes.emissiveIntensity = isNeon ? 0.14 : 0.0;
  }
  M.missile.color.copy(C(L.missile ?? 0x585c50));
  M.livery = L;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
