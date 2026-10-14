// STRIX HX-9 — bootstrap, render pipeline, UI, main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createMaterials, applyLivery } from './core/materials.js';
import { Helicopter } from './heli/helicopter.js';
import { Environment } from './world/environment.js';
import { THEMES } from './world/themes.js';
import { FlightSim } from './sim/flight.js';
import { Particles } from './fx/particles.js';
import { Weapons } from './fx/weapons.js';
import { AirFlow } from './fx/airflow.js';
import { PowerFlow } from './fx/powerflow.js';
import { Modes } from './fx/modes.js';
import { AudioEngine } from './audio/audio.js';
import { CameraRig } from './ui/camera.js';
import { clamp, damp } from './core/noise.js';

const $ = (id) => document.getElementById(id);
const progress = (p, msg) => { $('lprog').style.width = (p * 100) + '%'; $('lmsg').textContent = msg; };
const tick = () => new Promise(r => { let done = false; const f = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 16); });

async function boot() {
  progress(0.05, 'renderer');
  await tick();
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  $('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.15, 16000);
  camera.position.set(-16, 6, 18);

  progress(0.15, 'materials');
  await tick();
  const M = createMaterials();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  for (const k of ['bump', 'normal', 'rough', 'grime']) if (M.T[k]) M.T[k].anisotropy = maxAniso;

  progress(0.3, 'airframe');
  await tick();
  const heli = new Helicopter(M);
  scene.add(heli.root);
  heli.root.traverse(o => { if (o.isMesh && o.material?.transparent) o.castShadow = false; });

  progress(0.5, 'environment');
  await tick();
  const env = new Environment(renderer, scene);
  // Crisp sun shadow frustum around the aircraft and pad with clean bias (no peter-panning)
  env.sun.shadow.mapSize.set(4096, 4096);
  {
    const sc = env.sun.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 22; sc.bottom = -22; sc.near = 50; sc.far = 195;
    sc.updateProjectionMatrix();
    env.sun.shadow.bias = -0.00006;
    env.sun.shadow.normalBias = 0.005;
    env.sun.shadow.radius = 1.15;
  }

  const sim = new FlightSim();
  heli.sim = sim;

  const fx = { add: new Particles(scene, 7000, { additive: true }), smoke: new Particles(scene, 7000, { smoke: true }) };
  const audio = new AudioEngine();
  let world = null;
  const weapons = new Weapons(scene, heli, fx, audio, () => world);
  weapons.camera = camera;
  const air = new AirFlow(scene, heli, () => world);
  const power = new PowerFlow(heli);
  const modes = new Modes(heli, M, power, air, env, $('labels'));
  const rig = new CameraRig(camera, renderer.domElement, heli, (x, z) => (world ? Math.max(world.heightAt(x, z), world.waterY ?? -1e9) : 0));

  // ---------------- half-res screen-space AO depth+normal prepass (exterior airframe + pad contact only)
  const aoScale = 0.5;
  const aoRT = new THREE.WebGLRenderTarget(Math.round(innerWidth * aoScale), Math.round(innerHeight * aoScale), {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType, generateMipmaps: false,
  });
  aoRT.depthTexture = new THREE.DepthTexture(Math.round(innerWidth * aoScale), Math.round(innerHeight * aoScale), THREE.UnsignedIntType);
  const aoNormalMat = new THREE.MeshNormalMaterial();
  const aoPadDisc = new THREE.Mesh(new THREE.CircleGeometry(13.5, 36).rotateX(-Math.PI / 2), aoNormalMat);
  aoPadDisc.visible = false;
  aoPadDisc.castShadow = false;
  aoPadDisc.receiveShadow = false;
  scene.add(aoPadDisc);
  const aoMeshes = [];
  heli.root.traverse(o => {
    if (o.isMesh) {
      const s = o.userData.sys;
      const skip = !o.castShadow || o.userData.keep || o.userData.noAO ||
        s === 'fx' || s === 'glass' || s === 'decal' ||
        s === 'engine' || s === 'drive' || s === 'fuel' || s === 'elec' || s === 'avionics' || s === 'cockpit' ||
        o.material?.transparent;
      aoMeshes.push({ o, skip });
    }
  });
  function renderAOPass() {
    if (state.mode !== 'normal') return;
    const dpr = renderer.getPixelRatio();
    const tw = Math.max(1, Math.round((renderer.domElement.width / dpr) * aoScale));
    const th = Math.max(1, Math.round((renderer.domElement.height / dpr) * aoScale));
    if (aoRT.width !== tw || aoRT.height !== th) aoRT.setSize(tw, th);
    const prevBg = scene.background;
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    scene.background = null;
    const savedSceneVis = new Array(scene.children.length);
    for (let i = 0; i < scene.children.length; i++) {
      const c = scene.children[i];
      savedSceneVis[i] = c.visible;
      if (c !== heli.root && c !== aoPadDisc) c.visible = false;
    }
    const savedVis = new Array(aoMeshes.length);
    for (let i = 0; i < aoMeshes.length; i++) {
      const m = aoMeshes[i];
      savedVis[i] = m.o.visible;
      if (m.skip) m.o.visible = false;
    }
    const agl = sim.agl || 0;
    aoPadDisc.visible = agl < 8;
    aoPadDisc.position.set(heli.root.position.x, (world ? world.padY : heli.root.position.y) + (heli.padYOffset || 0) + 0.01, heli.root.position.z);
    scene.overrideMaterial = aoNormalMat;
    renderer.setRenderTarget(aoRT);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = null;
    renderer.shadowMap.autoUpdate = prevShadow;
    aoPadDisc.visible = false;
    for (let i = 0; i < aoMeshes.length; i++) aoMeshes[i].o.visible = savedVis[i];
    for (let i = 0; i < scene.children.length; i++) scene.children[i].visible = savedSceneVis[i];
    scene.background = prevBg;
  }

  // ---------------- post
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.4, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tAoDepth: { value: null },
      tAoNorm: { value: null },
      uProj: { value: new THREE.Matrix4() },
      uInvProj: { value: new THREE.Matrix4() },
      uAoOn: { value: 1.0 },
      uTime: { value: 0 },
      uLift: { value: new THREE.Vector3() },
      uGain: { value: new THREE.Vector3(1, 1, 1) },
      uVig: { value: 0.35 },
      uGrain: { value: 0.025 },
      uCA: { value: 0.001 },
      uFlash: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse, tAoDepth, tAoNorm;
      uniform mat4 uProj, uInvProj;
      uniform float uAoOn, uTime, uVig, uGrain, uCA, uFlash;
      uniform vec3 uLift, uGain;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      vec3 viewPosFromDepth(vec2 uv, float d){
        vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        vec4 vp = uInvProj * clip;
        return vp.xyz / max(vp.w, 1e-6);
      }
      float computeSSAO(vec2 uv){
        float d = texture2D(tAoDepth, uv).r;
        if (d >= 0.9999) return 1.0;
        vec3 P = viewPosFromDepth(uv, d);
        float dist = -P.z;
        if (dist > 58.0 || dist < 0.2) return 1.0;
        vec3 N = normalize(texture2D(tAoNorm, uv).xyz * 2.0 - 1.0);
        float radius = clamp(0.42 / max(dist * 0.08, 0.35), 0.003, 0.036);
        float occ = 0.0;
        for (int i = 0; i < 12; i++) {
          float fi = float(i);
          float r = radius * ((fi + 0.5) / 12.0);
          float ang = fi * 2.3999632;
          vec2 suv = uv + vec2(cos(ang), sin(ang) * 1.777) * r;
          float sd = texture2D(tAoDepth, suv).r;
          if (sd < 0.9999) {
            vec3 S = viewPosFromDepth(suv, sd);
            vec3 v = S - P;
            float l = length(v);
            if (l > 0.012 && l < 1.25) {
              float ndv = max(0.0, dot(N, v / l) - 0.12);
              float atten = 1.0 - smoothstep(0.20, 1.25, l);
              occ += ndv * atten;
            }
          }
        }
        float ao = clamp(1.0 - (occ / 12.0) * 1.55, 0.52, 1.0);
        return mix(1.0, ao, smoothstep(58.0, 34.0, dist));
      }
      void main(){
        vec2 d = vUv-.5; float r2 = dot(d,d);
        vec2 ca = d * uCA * smoothstep(0.05, 0.65, r2);
        vec3 c;
        c.r = texture2D(tDiffuse, vUv + ca).r;
        c.g = texture2D(tDiffuse, vUv).g;
        c.b = texture2D(tDiffuse, vUv - ca).b;
        if (uAoOn > 0.5) {
          c *= computeSSAO(vUv);
        }
        c = c*uGain + uLift*(1.-c);
        c *= 1. - uVig*smoothstep(.15,.78,r2*1.5);
        c += (h(vUv*vec2(1920.,1080.)+fract(uTime)*91.)-.5)*uGrain;
        c += uFlash*vec3(.6,.65,.8);
        gl_FragColor = vec4(c,1.);
      }`,
  });
  grade.uniforms.tAoDepth.value = aoRT.depthTexture;
  grade.uniforms.tAoNorm.value = aoRT.texture;
  composer.addPass(grade);

  // ---------------- sensor camera render target (gunner thermal display)
  const sensorRT = new THREE.WebGLRenderTarget(320, 240, { type: THREE.HalfFloatType });
  heli.cockpit.sensorMat.uniforms.tMap.value = sensorRT.texture;

  // ---------------- state & UI
  const state = { theme: 0, view: 'orbit', mode: 'normal', stance: 'parked', themeFade: 0 };
  const accent = new THREE.Color('#5ef2ff');
  const accentTarget = new THREE.Color('#5ef2ff');
  let themeCfg = THEMES[0];

  const themeNav = $('themes');
  THEMES.forEach((t, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<i style="color:${t.swatch};background:${t.swatch}"></i><span>${t.name}</span>`;
    b.onclick = () => switchTheme(i);
    themeNav.appendChild(b);
  });

  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1800); }

  function applyThemeNow(i) {
    const t = THEMES[i];
    themeCfg = t;
    world = env.setTheme(t);
    sim.setWorld(world);
    applyLivery(M, t.livery);
    accentTarget.set(t.accent);

    // Detect if the helipad cylinder top sits above world.padY (e.g. neon pad at +0.3m)
    let padTopOffset = 0;
    world.group.traverse(o => {
      if (o.isMesh && o.geometry?.type === 'CylinderGeometry' && (o.geometry.parameters?.radiusTop ?? 0) >= 12) {
        const topY = o.position.y + (o.geometry.parameters.height ?? 0.5) * 0.5;
        padTopOffset = Math.max(padTopOffset, topY - world.padY);
      }
    });
    heli.padYOffset = padTopOffset;

    renderer.toneMappingExposure = t.exposure;
    bloom.strength = t.bloom.strength * 0.52;
    bloom.radius = Math.min(0.46, t.bloom.radius * 0.85);
    bloom.threshold = Math.max(0.92, t.bloom.threshold + 0.06);

    grade.uniforms.uLift.value.set(...t.grade.lift);
    grade.uniforms.uGain.value.set(...t.grade.gain);
    grade.uniforms.uVig.value = t.grade.vignette;
    grade.uniforms.uGrain.value = Math.min(0.022, t.grade.grain * 0.55);
    grade.uniforms.uCA.value = t.grade.ca * 0.5;

    audio.setAmbience(t.ambience);
    const c = new THREE.Color(t.accent);
    document.documentElement.style.setProperty('--accent', t.accent);
    document.documentElement.style.setProperty('--accent-rgb', `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`);
    [...themeNav.children].forEach((b, k) => b.classList.toggle('on', k === i));
    if (!sim.airborne) { heli.root.position.copy(sim.pos); }
    rig.last.copy(sim.pos);
  }

  let switching = false;
  async function switchTheme(i, instant = false) {
    if (switching || (i === state.theme && !instant)) return;
    switching = true;
    state.theme = i;
    const t = THEMES[i];
    $('themeTitle').querySelector('.t1').textContent = t.name.toUpperCase();
    $('themeTitle').querySelector('.t2').textContent = t.sub;
    if (!instant) {
      audio.whoosh();
      $('fade').classList.add('on');
      await new Promise(r => setTimeout(r, 600));
    }
    const camOff = camera.position.clone().sub(heli.root.position);
    const tgtOff = rig.controls.target.clone().sub(heli.root.position);
    applyThemeNow(i);
    heli.root.position.copy(sim.pos);
    camera.position.copy(sim.pos).add(camOff); rig.controls.target.copy(sim.pos).add(tgtOff);
    rig.last.copy(sim.pos);
    if (!instant) {
      await new Promise(r => setTimeout(r, 900));
      $('fade').classList.remove('on');
    }
    switching = false;
  }

  function setView(v) {
    state.view = v; rig.setMode(v);
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    document.body.classList.toggle('cockpit', v === 'cockpit'); document.body.classList.toggle('cinema', v === 'cinema');
    heli.cockpit.pilotHead.visible = v !== 'cockpit';
    audio.click();
  }
  function setMode(m) {
    if (state.mode === m && m !== 'normal') m = 'normal';
    state.mode = m;
    const show = modes.set(m);
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    const lg = $('legend'); lg.innerHTML = modes.legend(); lg.classList.toggle('show', show);
    audio.click();
  }
  function setStance(s) {
    if (s === 'board' && sim.airborne) { toast('Boarding only on the ground'); return; }
    if (s === 'parked' && sim.airborne) { toast('Land first to park'); return; }
    const prev = state.stance;
    state.stance = s;
    heli.setStance(s, sim.airborne);
    document.querySelectorAll('[data-stance]').forEach(b => b.classList.toggle('on', b.dataset.stance === s));
    if (s === 'board' || prev === 'board') audio.canopy();
    if (s === 'combat') audio.bay();
    if (s === 'parked' && !['parked', 'spooldown'].includes(sim.phase)) { /* parked stance on the ground: keep engine state */ }
    toast({ parked: 'Parked · systems safe', board: 'Boarding · canopies open', combat: 'Combat · master arm', cruise: 'Cruise · fans to thrust', stealth: 'Stealth · emitters dark' }[s]);
    audio.click();
  }
  function fly() {
    audio.init();
    if (state.stance === 'board') setStance('parked');
    const r = sim.toggle();
    toast({ launch: 'Engine start · rotor spool-up', abort: 'Start aborted', rtb: 'Returning to pad', resume: 'Resuming sortie' }[r] || '');
    audio.click(0.2);
  }

  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  document.querySelectorAll('[data-stance]').forEach(b => b.onclick = () => setStance(b.dataset.stance));
  $('flyBtn').onclick = fly;
  $('soundBtn').onclick = () => { audio.init(); audio.setMuted(!audio.muted); $('soundBtn').classList.toggle('muted', audio.muted); };
  $('helpBtn').onclick = () => $('help').classList.toggle('show');
  const fire = (w, on = true) => {
    audio.init();
    const tgt = null;
    if (w === 'gun') { weapons.setGun(on, tgt); weapons.target = null; }
    if (!on) return;
    if (w === 'rockets') weapons.fireRockets(tgt);
    if (w === 'missile') weapons.fireMissile(tgt);
    if (w === 'flares') weapons.fireFlares();
    const b = document.querySelector(`[data-weapon="${w}"]`); b.classList.add('fire'); setTimeout(() => b.classList.remove('fire'), 160);
  };
  document.querySelectorAll('[data-weapon]').forEach(b => {
    const w = b.dataset.weapon;
    if (w === 'gun') {
      b.onpointerdown = () => fire('gun', true);
      b.onpointerup = b.onpointerleave = () => fire('gun', false);
    } else b.onclick = () => fire(w);
  });
  weapons.onChange = () => {
    $('aGun').textContent = weapons.ammo.gun; $('aRkt').textContent = weapons.ammo.rkt; $('aMsl').textContent = weapons.ammo.msl; $('aFlr').textContent = weapons.ammo.flr;
    for (const [id, k] of [['aGun', 'gun'], ['aRkt', 'rkt'], ['aMsl', 'msl'], ['aFlr', 'flr']]) $(id).parentElement.classList.toggle('empty', weapons.ammo[k] <= 0);
  };
  sim.events.fire = (type, tgt) => {
    if (type === 'gun') { weapons.setGun(true, tgt); }
    else if (type === 'gunStop') { weapons.setGun(false); weapons.target = null; }
    else if (type === 'rockets') { weapons.fireRockets(tgt, 6); }
    else if (type === 'missile') weapons.fireMissile(tgt);
    else if (type === 'flares') weapons.fireFlares();
  };
  let lastPhase = sim.phase, lastGear = 1;
  sim.events.phase = (p) => {
    if (p === 'takeoff') toast('Lift-off');
    if (p === 'flying') toast('Autonomous sortie');
    if (p === 'landing') toast('Final approach');
    if (p === 'spooldown') toast('Touchdown · shutdown');
  };

  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    audio.init();
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === ' ') { e.preventDefault(); fly(); }
    if (k === '1') setView('orbit'); if (k === '2') setView('chase'); if (k === '3') setView('cockpit'); if (k === '4') setView('cinema');
    if (k === 'q') setMode('normal'); if (k === 'x') setMode('xray'); if (k === 'p') setMode('power'); if (k === 'a') setMode('air'); if (k === 'e') setMode('explode');
    if (k === 'f') fire('gun', true); if (k === 'r') fire('rockets'); if (k === 'm') fire('missile'); if (k === 'c') fire('flares');
    if (k === 't') switchTheme((state.theme + 1) % THEMES.length);
    if (k === 's') $('soundBtn').click();
    if (k === 'h') $('help').classList.toggle('show');
  });
  window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); keys[k] = false; if (k === 'f') fire('gun', false); });
  window.addEventListener('pointerdown', () => audio.init(), { once: true });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    const scale = h * renderer.getPixelRatio() * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    fx.add.points.material.uniforms.uScale.value = scale; fx.smoke.points.material.uniforms.uScale.value = scale;
  }
  window.addEventListener('resize', resize);

  // ---------------- HUD
  const att = $('attitude').getContext('2d');
  const ringEl = $('flyRing');
  const tele = { rpm: $('tRpm'), alt: $('tAlt'), spd: $('tSpd'), hdg: $('tHdg'), vs: $('tVs'), tq: $('tTq'), tgt: $('tTgt'), fuel: $('tFuel'), bar: $('tRpmBar'), phase: $('tPhase') };
  let hudAcc = 0;
  const phaseName = { parked: 'COLD · PARKED', spoolup: 'ENGINE START · SPOOL', takeoff: 'LIFT-OFF · HOVER CHECK', flying: 'AUTONOMOUS · SORTIE', rtb: 'RTB · INBOUND PAD', landing: 'FINAL · DESCENT', spooldown: 'SHUTDOWN · ROTOR BRAKE' };
  function hud(dt, S) {
    hudAcc += dt; if (hudAcc < 0.1) return; hudAcc = 0;
    tele.rpm.textContent = Math.round(S.rpm * 100);
    tele.alt.textContent = Math.round(S.agl);
    tele.spd.textContent = Math.round(S.speed * 1.944);
    tele.hdg.textContent = String(Math.round(((S.heading * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0');
    tele.vs.textContent = S.vs.toFixed(1);
    tele.tq.textContent = Math.round(S.torque * 100);
    tele.tgt.textContent = Math.round(S.tgt);
    tele.fuel.textContent = Math.round(S.fuel * 100);
    tele.bar.style.width = (S.rpm * 100) + '%';
    tele.phase.textContent = phaseName[sim.phase] + (state.stance === 'combat' ? ' · ARMED' : state.stance === 'stealth' ? ' · EMCON' : '');
    ringEl.style.strokeDashoffset = 283 * (1 - S.rpm);
    const lbl = { parked: 'LAUNCH', spooldown: 'LAUNCH', spoolup: 'ABORT', takeoff: 'LAND', flying: 'LAND', rtb: 'RESUME', landing: 'RESUME' }[sim.phase];
    $('flyLabel').textContent = lbl;
    // attitude ball
    const w = 120, c = att;
    c.clearRect(0, 0, w, w);
    c.save(); c.beginPath(); c.arc(60, 60, 54, 0, 7); c.clip();
    c.translate(60, 60); c.rotate(-S.roll);
    const off = S.pitch * 140;
    c.fillStyle = 'rgba(120,180,255,.16)'; c.fillRect(-90, -150 + off, 180, 150);
    c.fillStyle = 'rgba(255,170,90,.12)'; c.fillRect(-90, off, 180, 150);
    c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent'); c.lineWidth = 2;
    c.beginPath(); c.moveTo(-70, off); c.lineTo(70, off); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1;
    for (const d of [-20, -10, 10, 20]) { const y = off - d * Math.PI / 180 * 140; c.beginPath(); c.moveTo(-14, y); c.lineTo(14, y); c.stroke(); }
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(60, 60, 54, 0, 7); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(34, 60); c.lineTo(52, 60); c.lineTo(60, 68); c.lineTo(68, 60); c.lineTo(86, 60); c.stroke();
  }

  // ---------------- initial theme
  progress(0.65, 'worlds');
  await tick();
  const q0 = new URLSearchParams(location.search);
  const startTheme = clamp(parseInt(q0.get('theme') ?? '0', 10) || 0, 0, THEMES.length - 1);
  applyThemeNow(startTheme);
  state.theme = startTheme;
  heli.setStance('parked', false);
  setView('orbit');
  rig.controls.target.set(0, world.padY + 2.4, 0);
  camera.position.set(15, world.padY + 4.5, 14);
  window.APP = { power, air, heli, sim, camera, rig, env, M, modes, weapons, scene, renderer, setView, setMode, setStance, switchTheme, fly, state, THEMES };
  resize();
  progress(0.85, 'compiling shaders');
  await tick();
  // pre-warm: build remaining worlds lazily in the background when in interactive mode
  if (!q0.get('shot') && !q0.get('capture')) {
    let warmIdx = 1;
    const warm = () => {
      if (warmIdx >= THEMES.length) return;
      const t = THEMES[warmIdx++];
      if (!env.cache[t.id]) { const w = t.build({ renderer }); w.group.visible = false; scene.add(w.group); env.cache[t.id] = w; }
      setTimeout(warm, 900);
    };
    setTimeout(warm, 3500);
  }
  progress(1, 'ready');
  setTimeout(() => $('loader').classList.add('hide'), 300);

  // ---------------- loop
  const clock = new THREE.Clock();
  let t = 0, frame = 0;
  const S = { x: 0, z: 0 };
  const prevPos = new THREE.Vector3();
  let lastStep = performance.now();
  let lastShadowKey = '', lastCamKey = '';
  // keep simulating even when the host throttles animation frames (embedded / hidden panes)
  setInterval(() => { if (performance.now() - lastStep > 150) step(); }, 40);
  function loop() { requestAnimationFrame(loop); step(); }
  function step() {
    lastStep = performance.now();
    const dt = Math.min(clock.getDelta(), 1 / 20) * (window.APP?.timeScale || 1);
    t += dt; frame++;
    sim.update(dt, state.stance);
    // pose
    heli.root.position.copy(sim.pos);
    heli.root.rotation.set(sim.roll, sim.heading, sim.pitch, 'YZX');
    heli.velocity = sim.vel;
    // flight-driven stance automation
    if (sim.airborne && state.stance === 'board') setStance('parked');
    if (sim.airborne && state.stance === 'parked') { state.stance = 'cruise'; heli.setStance('cruise', true); document.querySelectorAll('[data-stance]').forEach(b => b.classList.toggle('on', b.dataset.stance === 'cruise')); }
    if (!sim.airborne && sim.phase === 'parked' && state.stance === 'cruise' && lastPhase !== 'parked') { state.stance = 'parked'; heli.setStance('parked', false); document.querySelectorAll('[data-stance]').forEach(b => b.classList.toggle('on', b.dataset.stance === 'parked')); }
    lastPhase = sim.phase;
    // sim state object for consumers
    Object.assign(S, {
      x: sim.pos.x, z: sim.pos.z, rpm: sim.rpm, collective: sim.collective, cyclic: sim.cyclic, yawCmd: sim.yawCmd, thrust: sim.thrust,
      torque: sim.torque, tgt: sim.tgt, fuel: sim.fuel, propThrust: sim.propThrust, speed: sim.speed, vs: sim.vel.y, agl: sim.agl,
      airborne: sim.airborne, heading: sim.heading, pitch: sim.pitch, roll: sim.roll, phase: sim.phase, stance: state.stance,
      vel: sim.vel, fanTilt: heli.anim.fanTilt, ammo: weapons.ammo,
    });
    if (heli.anim.gear > 0.02 && heli.anim.gear < 0.98 && lastGear !== Math.round(heli.target.gear)) { lastGear = Math.round(heli.target.gear); audio.gear(); }
    // sensor turret behaviour
    if (!weapons.firingGun) {
      heli.sensorAim.az = Math.sin(t * 0.21) * 0.7;
      heli.sensorAim.el = -0.15 + Math.sin(t * 0.33) * 0.12;
    }
    accent.lerp(accentTarget, 1 - Math.exp(-2 * dt));
    heli.update(dt, S, themeCfg, accent);
    env.update(dt, t, camera, heli.root.position);
    weapons.update(dt, t);
    fx.add.update(dt); fx.smoke.update(dt);
    air.update(dt, S);
    power.update(dt, S);
    rig.shake = Math.max(rig.shake * Math.exp(-5 * dt), weapons.shake);
    rig.update(dt, t);
    modes.update(dt, t, camera, accent, innerWidth, innerHeight);
    audio.listener = camera.position;
    audio.update(S, camera.position.distanceTo(heli.root.position), state.view === 'cockpit', S.speed);
    hud(dt, S);
    grade.uniforms.uTime.value = t;
    grade.uniforms.uFlash.value = env.flash * 0.06;
    grade.uniforms.uProj.value.copy(camera.projectionMatrix);
    grade.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    grade.uniforms.uAoOn.value = state.mode === 'normal' ? 1.0 : 0.0;
    // gunner thermal feed (only when someone could see it)
    if (state.view === 'cockpit' && frame % 3 === 0) {
      heli.root.updateMatrixWorld(true);
      const prevBg = scene.background;
      renderer.setRenderTarget(sensorRT);
      renderer.render(scene, heli.sensor.cam);
      renderer.setRenderTarget(null);
      scene.background = prevBg;
      heli.cockpit.sensorMat.uniforms.uHas.value = 1;
    }
    const shadowKey = `${state.theme}:${sim.heading.toFixed(3)}:${(heli.anim.gear ?? 1).toFixed(2)}:${(heli.anim.fanTilt ?? 0).toFixed(2)}:${state.stance}:${state.mode}`;
    const camKey = `${shadowKey}:${camera.position.x.toFixed(2)}:${camera.position.y.toFixed(2)}:${camera.position.z.toFixed(2)}:${camera.fov}:${renderer.domElement.width}`;
    const needShadow = (shadowKey !== lastShadowKey || sim.airborne || sim.rpm > 0.01 || frame < 4);
    const needRender = (!q0.has('capture') || needShadow || camKey !== lastCamKey || frame % 8 === 0);
    if (needRender) {
      lastCamKey = camKey;
      renderAOPass();
      if (needShadow) lastShadowKey = shadowKey;
      renderer.shadowMap.autoUpdate = needShadow;
      renderer.shadowMap.needsUpdate = needShadow;
      composer.render();
    }
    prevPos.copy(sim.pos);
  }
  loop();
}

boot().catch((e) => { console.error(e); const m = document.getElementById('lmsg'); if (m) m.textContent = 'error: ' + e.message; });
