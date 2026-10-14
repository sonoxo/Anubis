// Environment manager: sky dome, sun/hemisphere lights with heli-following shadows, PMREM reflections
// rebuilt per theme, fog, weather, lightning, theme switching with cached worlds.
import * as THREE from 'three';
import { makeSkyMaterial, setSky, Weather } from './world.js';

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.skyMat = makeSkyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -1000;
    scene.add(this.sky);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera; sc.left = -44; sc.right = 44; sc.top = 44; sc.bottom = -44; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.6);
    scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0x000000, 0.001);
    scene.fog = this.fog;
    this.weather = new Weather(scene);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), this.skyMat);
    this.envScene.add(this.envSky);
    this.envCards = new THREE.Group();
    this.envScene.add(this.envCards);
    this.cache = {};
    this.theme = null; this.world = null;
    this.dim = 1;
    this.flash = 0; this.nextStrike = 6;
    this.bolt = null;
    this.onThunder = () => {};
  }

  setTheme(theme) {
    if (this.world) this.world.group.visible = false;
    if (!this.cache[theme.id]) {
      const w = theme.build({ renderer: this.renderer, scene: this.scene, env: this });
      w.group.traverse(o => { if (o.isMesh && o.castShadow === undefined) o.castShadow = false; });
      this.scene.add(w.group);
      this.cache[theme.id] = w;
    }
    this.world = this.cache[theme.id];
    this.world.group.visible = true;
    this.theme = theme;
    this.skyCfg = setSky(this.skyMat, theme.sky);
    this.fogColor = new THREE.Color(theme.fog.color);
    this.fog.color.copy(this.fogColor); this.fog.density = theme.fog.density;
    this.sunDir = new THREE.Vector3(...theme.sky.sunDir).normalize();
    // keep shadows readable when the sun grazes the horizon while preserving long golden-hour shadows
    if (this.sunDir.y < 0.095) this.sunDir.y = 0.095 + (this.sunDir.y * 0.25);
    this.sunDir.normalize();
    this.sun.color.set(theme.sun.color); this.sunBase = theme.sun.intensity;
    this.hemi.color.set(theme.hemi.sky); this.hemi.groundColor.set(theme.hemi.ground); this.hemiBase = theme.hemi.intensity;
    // Populate envCards for richer PMREM specular reflections
    this.envCards.clear();
    if (theme.id === 'neon') {
      const cols = [0xff2bd6, 0x20e8ff, 0xff2bd6, 0x20e8ff];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.35;
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(3.2, 9.5),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i % 4]).multiplyScalar(0.95), side: THREE.DoubleSide })
        );
        m.position.set(Math.cos(a) * 44, 5.5, Math.sin(a) * 44);
        m.lookAt(0, 3.5, 0);
        this.envCards.add(m);
      }
    } else if (theme.id === 'tempest') {
      const flareCard = new THREE.Mesh(new THREE.PlaneGeometry(9, 11), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9232).multiplyScalar(1.65), side: THREE.DoubleSide }));
      flareCard.position.set(-32, 14, -20); flareCard.lookAt(0, 0, 0);
      const coolCard1 = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb8dcf8).multiplyScalar(1.35), side: THREE.DoubleSide }));
      coolCard1.position.set(26, 12, 22); coolCard1.lookAt(0, 0, 0);
      const coolCard2 = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa8d0f0).multiplyScalar(1.2), side: THREE.DoubleSide }));
      coolCard2.position.set(-24, 12, 24); coolCard2.lookAt(0, 0, 0);
      this.envCards.add(flareCard, coolCard1, coolCard2);
    } else if (theme.id === 'borealis') {
      const moonCard = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x88c0f0).multiplyScalar(1.15), side: THREE.DoubleSide }));
      moonCard.position.set(-22, 16, 26); moonCard.lookAt(0, 0, 0);
      const aurCard = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x38f5a8).multiplyScalar(0.95), side: THREE.DoubleSide }));
      aurCard.position.set(8, 14, -34); aurCard.lookAt(0, 0, 0);
      this.envCards.add(moonCard, aurCard);
    }
    // environment reflections from this sky + cards
    this.skyMat.uniforms.uTime.value = 30; this.skyMat.uniforms.uDim.value = 1; this.skyMat.uniforms.uFlash.value = 0;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 200);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = theme.envIntensity ?? 1;
    this.weather.set(theme.weather);
    this.nextStrike = 3 + Math.random() * 4;
    return this.world;
  }

  setDim(d) { this.dim = d; }

  update(dt, t, camera, heliPos) {
    this.sky.position.copy(camera.position);
    const u = this.skyMat.uniforms;
    u.uTime.value = t;
    // lightning
    if (this.world?.storm) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) { this.strike(camera); this.nextStrike = 4 + Math.random() * 9; }
    }
    this.flash *= Math.exp(-7 * dt);
    if (this.flashSeq) {
      this.flashSeq.t += dt;
      for (const p of this.flashSeq.pulses) if (!p.done && this.flashSeq.t > p.at) { p.done = true; this.flash = Math.max(this.flash, p.k); }
      if (this.flashSeq.t > 1.2) { this.flashSeq = null; if (this.bolt) { this.scene.remove(this.bolt); this.bolt = null; } }
    }
    if (this.bolt) this.bolt.material.opacity = Math.min(1, this.flash * 1.5);
    u.uFlash.value = this.flash;
    u.uDim.value = this.dim;
    if (this.world?.water) this.world.water.material.uniforms.uFlash.value = this.flash, this.world.water.material.uniforms.uDim.value = 0.4 + 0.6 * this.dim;
    this.fog.color.copy(this.fogColor).multiplyScalar(0.25 + 0.75 * this.dim);
    this.sun.intensity = this.sunBase * (0.12 + 0.88 * this.dim) + this.flash * 2;
    this.hemi.intensity = this.hemiBase * (0.25 + 0.75 * this.dim) + this.flash * 3;
    this.scene.environmentIntensity = (this.theme?.envIntensity ?? 1) * (0.25 + 0.75 * this.dim);
    // shadow frustum follows the aircraft
    this.sun.target.position.copy(heliPos);
    this.sun.position.copy(heliPos).addScaledVector(this.sunDir, 120);
    this.world?.update?.(dt, t, camera, this.renderer, this.scene, this.sky, this.skyMat);
    this.weather.update(dt, t, camera);
  }

  strike(camera) {
    const a = Math.random() * Math.PI * 2, r = 400 + Math.random() * 900;
    const base = new THREE.Vector3(camera.position.x + Math.cos(a) * r, 0, camera.position.z + Math.sin(a) * r);
    const pts = [];
    let p = base.clone().setY(520);
    for (let i = 0; i < 18; i++) { pts.push(p.clone()); p = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 60, -520 / 17, (Math.random() - 0.5) * 60)); }
    pts[pts.length - 1].y = 0;
    if (this.bolt) this.scene.remove(this.bolt);
    this.bolt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0), 80, 1.4, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 7, 10), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.scene.add(this.bolt);
    this.flashSeq = { t: 0, pulses: [{ at: 0, k: 1.2 }, { at: 0.12, k: 0.7 }, { at: 0.26, k: 1.0 }, { at: 0.5, k: 0.5 }] };
    const dist = base.distanceTo(camera.position);
    this.onThunder(dist);
  }
}
