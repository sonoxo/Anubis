// Power-flow view: animated energy conduits between real components — shaft torque, electrical bus,
// fuel feed, hydraulics, sensor data — flow speed tied to live engine/rotor state.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const FLOW_TYPES = {
  torque: { color: '#ffb02e', label: 'Shaft torque', r: 0.075 },
  elec: { color: '#38c8ff', label: 'Electric bus', r: 0.05 },
  fuel: { color: '#3dff9e', label: 'Fuel feed', r: 0.045 },
  hyd: { color: '#b77dff', label: 'Hydraulics', r: 0.036 },
  data: { color: '#e8f0ff', label: 'Sensor data', r: 0.022 },
};

function flowMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uSpeed: { value: 1 }, uLen: { value: 1 }, uOn: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime,uSpeed,uLen,uOn; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float s = vUv.x*uLen;
        float dash = fract(s*1.6 - uTime*uSpeed);
        float pulse = smoothstep(0.,.08,dash)*smoothstep(.55,.12,dash);
        float rim = .35 + .65*pow(clamp(1.-abs(dot(normalize(vN),normalize(vV))), 0., 1.), 1.5);
        vec3 c = uColor*(.32 + pulse*2.6*uOn)*rim;
        gl_FragColor = vec4(c, 1.);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

export class PowerFlow {
  constructor(heli) {
    this.heli = heli;
    this.group = new THREE.Group();
    this.group.visible = false;
    heli.body.add(this.group);
    this.flows = [];
    const n = heli.internals.nodes;
    const add = (type, pts, speedKey = 'rpm') => {
      const T = FLOW_TYPES[type];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
      const len = curve.getLength();
      const mat = flowMaterial(T.color);
      mat.uniforms.uLen.value = len;
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(len * 6)), T.r, 8), mat);
      mesh.renderOrder = 10;
      this.group.add(mesh);
      this.flows.push({ mesh, mat, type, speedKey });
    };
    for (const sd of [1, -1]) {
      add('torque', [V(-1.6, 2.78, sd * 1.08), n['engineFront' + sd], V(0.65, 2.86, sd * 0.6), V(0.42, 2.92, sd * 0.32), V(0.25, 2.92, 0)], 'eng');
      add('fuel', [V(-0.5, 1.55, sd * 0.4), V(-0.4, 2.0, sd * 0.7), V(-0.5, 2.4, sd * 0.95), V(-0.6, 2.7, sd * 1.08)], 'fuel');
      add('elec', [n.inverter, V(-0.8, 1.35, sd * 0.6), V(-0.1, 1.6, sd * 1.2), V(0.0, 1.62, sd * 2.4), V(0.0, 1.48, sd * 3.7), V(0.0, 1.36, sd * 4.88)], 'fan');
      add('hyd', [n.hydPump, V(0.4, 2.2, sd * 0.6), V(-0.2, 1.5, sd * 1.0), V(-0.45, 1.25, sd * 1.12)], 'hyd');
      add('hyd', [n.hydPump, V(-0.4, 2.0, sd * 0.5), V(-1.6, 1.3, sd * 0.95), V(-1.75, 1.1, sd * 1.18)], 'hyd');
    }
    add('torque', [n.gearbox, V(0.25, 3.5, 0), V(0.25, 4.18, 0), V(0.25, 5.0, 0)], 'rotor');
    add('torque', [n.gearbox, V(-0.47, 2.82, 0), V(-4.0, 2.52, 0), V(-7.62, 2.24, 0), V(-8.28, 2.2, 0)], 'prop');
    add('elec', [V(-0.15, 3.1, 0.34), V(-0.6, 2.4, 0.3), V(-1.2, 1.4, 0.1), n.inverter], 'gen');
    add('elec', [n.inverter, V(-2.1, 1.15, 0), n.battery], 'gen');
    add('elec', [n.battery, V(-2.0, 0.98, 0), V(1.0, 0.92, 0), V(3.6, 1.0, 0), V(6.0, 1.05, 0), n.avionics], 'gen');
    add('elec', [V(0.25, 2.95, 0.1), V(0.3, 3.8, 0.12), V(0.3, 4.7, 0.12), V(0.25, 5.5, 0)], 'gen');
    add('hyd', [n.hydPump, V(0.5, 3.0, 0.2), V(0.4, 3.18, 0.3)], 'hyd');
    add('hyd', [n.hydPump, V(2.0, 1.2, 0.2), V(5.0, 0.95, 0.15), V(6.9, 1.0, 0)], 'hyd');
    add('data', [V(7.6, 1.08, 0), V(7.2, 1.2, 0.1), n.avionics], 'data');
    add('data', [n.avionics, V(5.9, 1.4, 0.2), V(4.8, 1.6, 0.25), V(3.6, 1.8, 0.3)], 'data');
    add('data', [V(0.25, 5.5, 0), V(0.32, 4.6, -0.1), V(0.3, 3.2, -0.1), V(1.4, 1.6, -0.2), V(6.3, 1.2, -0.2)], 'data');
    add('data', [n.avionics, V(5.4, 0.85, 0), V(5.3, 0.7, 0)], 'data');
    // glowing nodes at components
    const nodeMat = (c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.5), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const nodes = [[n.gearbox, 'torque', 0.22], [n.engine1, 'torque', 0.18], [n['engine-1'], 'torque', 0.18], [n.generator, 'elec', 0.16], [n.battery, 'elec', 0.2], [n.inverter, 'elec', 0.14], [n.fuel, 'fuel', 0.2], [n.avionics, 'data', 0.15], [n.hydPump, 'hyd', 0.12], [V(-8.28, 2.2, 0), 'torque', 0.16], [V(0, 1.36, 4.88), 'elec', 0.14], [V(0, 1.36, -4.88), 'elec', 0.14]];
    this.nodes = nodes.map(([p, t, r]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), nodeMat(FLOW_TYPES[t].color)); m.position.copy(p); m.renderOrder = 11; this.group.add(m); return m; });
    this.t = 0;
  }

  setActive(on) { this.group.visible = on; }

  update(dt, s) {
    if (!this.group.visible) return;
    this.t += dt;
    const sp = {
      eng: s.rpm * (0.6 + s.torque), rotor: s.rpm * (0.5 + s.thrust), prop: s.rpm * (0.25 + s.propThrust * 1.2),
      fuel: s.rpm * (0.3 + s.thrust * 0.7) + 0.02, fan: s.rpm * (0.3 + 0.7 * Math.max(s.fanTilt, 1 - s.speed / 30)),
      gen: 0.25 + s.rpm * 0.8, hyd: 0.2 + s.rpm * 0.4, data: 1.2,
    };
    for (const f of this.flows) {
      const v = sp[f.speedKey] ?? 1;
      f.mat.uniforms.uTime.value += dt * v * 2.2;
      f.mat.uniforms.uOn.value = Math.min(1, v * 3);
    }
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 4);
    for (const m of this.nodes) m.scale.setScalar(pulse);
  }
}
