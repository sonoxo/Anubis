// Render modes: skin, x-ray hologram, power flow, air flow, exploded assembly with part callouts.
import * as THREE from 'three';
import { FLOW_TYPES } from './powerflow.js';
import { damp } from '../core/noise.js';

function holoMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#5ef2ff') }, uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vec4 mv = viewMatrix*w; vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime,uOpacity; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float f = pow(clamp(1.-abs(dot(normalize(vN), normalize(vV))), 0., 1.), 2.4);
        float scan = smoothstep(.92,1.,sin(vW.y*26. - uTime*3.)) * .25;
        float band = smoothstep(.0,.02, .02-abs(fract(vW.x*.05 - uTime*.12)-.5)+.0) ;
        vec3 c = uColor*(f*1.1 + .02 + scan*.5 + band*.35);
        gl_FragColor = vec4(c*uOpacity, 1.);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export class Modes {
  constructor(heli, M, power, air, env, labelsEl) {
    this.heli = heli; this.M = M; this.power = power; this.air = air; this.env = env;
    this.mode = 'normal';
    this.holo = holoMaterial();
    this.holoGlass = holoMaterial(); this.holoGlass.uniforms.uOpacity.value = 0.5;
    this.explode = 0; this.explodeTarget = 0;
    this.dim = 1;
    this.labelsEl = labelsEl;
    this.labels = heli.parts.filter(p => p.label).map(p => {
      const el = document.createElement('div');
      el.className = 'plabel';
      el.innerHTML = p.label;
      labelsEl.appendChild(el);
      return { p, el };
    });
    this.meshes = [];
    heli.root.traverse(o => { if (o.isMesh && o.userData.mat0) this.meshes.push(o); });
  }

  set(mode) {
    this.mode = mode;
    const xr = mode === 'xray' || mode === 'power';
    const M = this.M;
    for (const m of this.meshes) {
      const sys = m.userData.sys;
      if (m.userData.keep || sys === 'fx') continue;
      if (!xr) { m.material = m.userData.mat0; m.visible = true; continue; }
      if (sys === 'decal') { m.visible = false; continue; }
      m.visible = true;
      if (sys === 'skin' || sys === 'glass' || sys === 'struct' || sys === 'blade') m.material = sys === 'glass' ? this.holoGlass : this.holo;
      else if (mode === 'power' && sys !== 'rotor') m.material = M.sys[sys] ? this.dimSys(sys) : this.holo;
      else m.material = M.sys[sys] || this.holo;
    }
    this.holo.uniforms.uOpacity.value = mode === 'power' ? 0.16 : 0.34;
    this.holoGlass.uniforms.uOpacity.value = mode === 'power' ? 0.08 : 0.16;
    this.heli.internals.root.visible = xr || mode === 'explode';
    this.heli.rotor.radar.visible = xr || mode === 'explode';
    this.power.setActive(mode === 'power');
    this.air.setActive(mode === 'air');
    this.explodeTarget = mode === 'explode' ? 1 : 0;
    this.labelsEl.classList.toggle('show', mode === 'explode');
    this.dimTarget = xr ? 0.28 : mode === 'air' ? 0.42 : mode === 'explode' ? 0.85 : 1;
    // legend
    return xr || mode === 'air' || mode === 'explode';
  }

  dimSys(sys) {
    this._dimmed = this._dimmed || {};
    if (!this._dimmed[sys]) { const m = this.M.sys[sys].clone(); m.opacity = 0.35; m.emissiveIntensity = 0.25; this._dimmed[sys] = m; }
    return this._dimmed[sys];
  }

  legend() {
    if (this.mode === 'power') return Object.values(FLOW_TYPES).map(t => `<span style="color:${t.color}"><i></i><b style="color:var(--dim);font-weight:400">${t.label}</b></span>`).join('');
    if (this.mode === 'xray') {
      const c = this.M.sysColor;
      const items = [['engine', 'Propulsion'], ['drive', 'Drivetrain'], ['fuel', 'Fuel'], ['elec', 'Electrical'], ['hyd', 'Hydraulic'], ['avionics', 'Avionics'], ['weapon', 'Weapons']];
      return items.map(([k, l]) => `<span style="color:#${new THREE.Color(c[k]).getHexString()}"><i></i><b style="color:var(--dim);font-weight:400">${l}</b></span>`).join('');
    }
    if (this.mode === 'air') return ['#2a6aff:Inflow', '#9ff8ff:Wake / slipstream', '#a0c8ff:Tip vortices', '#ff9a40:Hot exhaust'].map(s => { const [c, l] = s.split(':'); return `<span style="color:${c}"><i></i><b style="color:var(--dim);font-weight:400">${l}</b></span>`; }).join('');
    if (this.mode === 'explode') return `<span><b style="color:var(--dim);font-weight:400">${this.labels.length} assemblies · drag to inspect</b></span>`;
    return '';
  }

  update(dt, t, camera, accent, w, h) {
    this.holo.uniforms.uTime.value = t; this.holoGlass.uniforms.uTime.value = t;
    if (accent) { this.holo.uniforms.uColor.value.copy(accent); this.holoGlass.uniforms.uColor.value.copy(accent); }
    this.explode = damp(this.explode, this.explodeTarget, 2.6, dt);
    const e = this.explode < 0.001 ? 0 : this.explode;
    const eased = e * e * (3 - 2 * e);
    this.heli.explodeT = eased;
    if (e === 0 && this.explodeTarget === 0 && this.mode !== 'explode') this.heli.explodeT = 0;
    this.dim = damp(this.dim, this.dimTarget ?? 1, 3, dt);
    this.env.setDim(this.dim);
    if (this.mode === 'explode' || e > 0.01) {
      const v = new THREE.Vector3();
      for (const L of this.labels) {
        v.copy(L.p.anchor).applyMatrix4(L.p.g.matrixWorld);
        v.project(camera);
        const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
        L.el.style.opacity = vis ? Math.min(1, e * 1.5) : 0;
        L.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w + 8}px, ${(-v.y * 0.5 + 0.5) * h - 6}px)`;
      }
    }
  }
}
