// CPU-simulated GPU-rendered point particles (fire, smoke, sparks, spray, dust).
import * as THREE from 'three';

export class Particles {
  constructor(scene, cap = 6000, { additive = false, smoke = false } = {}) {
    this.cap = cap; this.i = 0; this.alive = 0;
    this.pos = new Float32Array(cap * 3); this.vel = new Float32Array(cap * 3);
    this.c0 = new Float32Array(cap * 3); this.c1 = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap); this.a0 = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.grav = new Float32Array(cap); this.rise = new Float32Array(cap);
    this.aCol = new Float32Array(cap * 3); this.aSize = new Float32Array(cap); this.aAlpha = new Float32Array(cap); this.aSeed = new Float32Array(cap);
    for (let k = 0; k < cap; k++) this.aSeed[k] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.aCol, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.aSeed, 1));
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) g.attributes[k].setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 600 } }]),
      vertexShader: `attribute vec3 aColor; attribute float aSize, aAlpha, aSeed; uniform float uScale;
        varying vec3 vC; varying float vA, vS;
        #include <fog_pars_vertex>
        void main(){ vC = aColor; vA = aAlpha; vS = aSeed;
          vec4 mvPosition = modelViewMatrix*vec4(position,1.);
          gl_PointSize = aAlpha > 0.001 ? clamp(aSize*uScale/-mvPosition.z, 1., 900.) : 0.;
          gl_Position = projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `varying vec3 vC; varying float vA, vS;
        #include <fog_pars_fragment>
        void main(){
          vec2 p = gl_PointCoord-.5; float r = length(p)*2.;
          if(r>1.) discard;
          float a = ${smoke ? `smoothstep(1.,.2,r) * (.75+.25*sin(atan(p.y,p.x)*3.+vS*30.)*r)` : `pow(max(1.-r, 0.), 1.6)`};
          ${additive ? `gl_FragColor = vec4(vC*a*vA, 1.);` : `gl_FragColor = vec4(vC, a*vA);`}
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 8 : 7;
    this.points.userData.fx = true;
    scene.add(this.points);
  }

  emit(o) {
    const k = this.i; this.i = (this.i + 1) % this.cap;
    this.pos[k * 3] = o.p.x; this.pos[k * 3 + 1] = o.p.y; this.pos[k * 3 + 2] = o.p.z;
    const sp = o.spread || 0;
    this.vel[k * 3] = (o.v?.x || 0) + (Math.random() - 0.5) * sp;
    this.vel[k * 3 + 1] = (o.v?.y || 0) + (Math.random() - 0.5) * sp;
    this.vel[k * 3 + 2] = (o.v?.z || 0) + (Math.random() - 0.5) * sp;
    const c0 = o.c0 || [1, 1, 1], c1 = o.c1 || c0;
    this.c0.set(c0, k * 3); this.c1.set(c1, k * 3);
    this.life[k] = 0; this.max[k] = o.life || 1;
    this.s0[k] = o.s0 ?? 1; this.s1[k] = o.s1 ?? this.s0[k]; this.a0[k] = o.a ?? 1;
    this.drag[k] = o.drag ?? 0.5; this.grav[k] = o.g ?? 0; this.rise[k] = o.rise ?? 0;
  }

  update(dt) {
    const { pos, vel } = this;
    for (let k = 0; k < this.cap; k++) {
      if (this.life[k] >= this.max[k]) { this.aAlpha[k] = 0; continue; }
      this.life[k] += dt;
      const t = Math.min(1, this.life[k] / this.max[k]);
      const d = Math.exp(-this.drag[k] * dt);
      vel[k * 3] *= d; vel[k * 3 + 1] = vel[k * 3 + 1] * d - this.grav[k] * dt + this.rise[k] * dt; vel[k * 3 + 2] *= d;
      pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
      for (let c = 0; c < 3; c++) this.aCol[k * 3 + c] = this.c0[k * 3 + c] + (this.c1[k * 3 + c] - this.c0[k * 3 + c]) * t;
      this.aSize[k] = this.s0[k] + (this.s1[k] - this.s0[k]) * Math.sqrt(t);
      this.aAlpha[k] = this.a0[k] * (t < 0.08 ? t / 0.08 : 1) * (1 - t) * (1 - t * 0.3);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
  }

  setScale(h) { this.points.material.uniforms.uScale.value = h * 0.6; }
}
