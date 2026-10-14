// Tandem cockpit: armored crashworthy ejection seats with 5-point harnesses, high-res 512x512 live canvas MFDs
// with OSB bezel keys, Up-Front Controller (UFC), standby ADI/ASI gauges, fire T-handles, dual-combiner pilot HUD,
// gunner's optical relay unit fed by the nose-turret camera, moving cyclic/collective/pedals, cockpit lighting, crew.
import * as THREE from 'three';
import { mk, grp } from './mk.js';
import { merge, slab, polyBars, V3 } from '../core/geo.js';
import { damp, clamp } from '../core/noise.js';

const TAU = Math.PI * 2;
const GREEN = '#7dffb0', CYAN = '#6fe9ff', AMBER = '#ffb347', DIMG = 'rgba(125,255,176,.42)', RED = '#ff5a4a';

class Screen {
  constructor(w = 384, h = 384) {
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, color: new THREE.Color(1.45, 1.45, 1.45) });
  }
  frame(title, osbTop = [], osbBot = [], osbL = [], osbR = []) {
    const g = this.g, w = this.c.width, h = this.c.height;
    g.save();
    g.setTransform(w / 256, 0, 0, h / 256, 0, 0);
    g.fillStyle = '#030a07'; g.fillRect(0, 0, 256, 256);
    // Fine LCD scanlines (single batched path)
    g.strokeStyle = 'rgba(125,255,176,.05)'; g.lineWidth = 0.75;
    g.beginPath();
    for (let y = 0; y < 256; y += 4) { g.moveTo(0, y + 0.5); g.lineTo(256, y + 0.5); }
    g.stroke();
    // Inner tactical border
    g.strokeStyle = 'rgba(111,233,255,0.22)'; g.lineWidth = 1;
    g.strokeRect(18, 18, 220, 220);
    // OSB perimeter legends
    g.font = '600 7.5px "JetBrains Mono", monospace';
    for (let i = 0; i < 5; i++) {
      const x = 44 + i * 42;
      if (osbTop[i]) {
        const act = osbTop[i].startsWith('*');
        const lbl = act ? osbTop[i].slice(1) : osbTop[i];
        if (act) { g.fillStyle = 'rgba(125,255,176,0.22)'; g.fillRect(x - 15, 2, 30, 11); }
        g.fillStyle = act ? CYAN : DIMG; g.textAlign = 'center';
        g.fillText(lbl, x, 10.5);
      }
      if (osbBot[i]) {
        const act = osbBot[i].startsWith('*');
        const lbl = act ? osbBot[i].slice(1) : osbBot[i];
        if (act) { g.fillStyle = 'rgba(125,255,176,0.22)'; g.fillRect(x - 15, 243, 30, 11); }
        g.fillStyle = act ? CYAN : DIMG; g.textAlign = 'center';
        g.fillText(lbl, x, 251.5);
      }
      const y = 48 + i * 40;
      if (osbL[i]) {
        g.fillStyle = DIMG; g.textAlign = 'left';
        g.fillText(osbL[i], 3, y);
      }
      if (osbR[i]) {
        g.fillStyle = DIMG; g.textAlign = 'right';
        g.fillText(osbR[i], 253, y);
      }
    }
    g.font = '700 9.5px "JetBrains Mono", monospace'; g.fillStyle = CYAN; g.textAlign = 'left';
    g.fillText(title, 22, 29);
    g.restore();
  }
  done() { this.tex.needsUpdate = true; }
}

function txt(g, s, x, y, col = GREEN, size = 11, align = 'left', weight = 500) {
  g.font = `${weight} ${size}px "JetBrains Mono", monospace`; g.fillStyle = col; g.textAlign = align; g.fillText(s, x, y);
}

function drawPFD(S, s) {
  const g = S.g, sc = S.c.width / 256;
  S.frame('PFD · FLT', ['*PFD', 'ND', 'ENG', 'WPN', 'FCR'], ['BARO', 'RAD', 'HOV', '*AUTO', 'DECL'], ['SPD', 'ATT', 'ALT', 'VSI', 'HDG'], ['FLIR', 'SYM', 'BRT', 'MSG', 'TST']);
  g.save(); g.scale(sc, sc);
  const cx = 128, cy = 128;
  // Attitude sphere viewport
  g.save(); g.beginPath(); g.rect(42, 34, 172, 168); g.clip();
  g.translate(cx, cy); g.rotate(-s.roll);
  const k = 250;
  const skyGrd = g.createLinearGradient(0, -180 + s.pitch * k, 0, s.pitch * k);
  skyGrd.addColorStop(0, 'rgba(18,75,135,0.48)'); skyGrd.addColorStop(1, 'rgba(48,145,210,0.34)');
  g.fillStyle = skyGrd; g.fillRect(-260, -260 + s.pitch * k, 520, 260);
  const gndGrd = g.createLinearGradient(0, s.pitch * k, 0, 180 + s.pitch * k);
  gndGrd.addColorStop(0, 'rgba(155,95,38,0.40)'); gndGrd.addColorStop(1, 'rgba(70,38,14,0.48)');
  g.fillStyle = gndGrd; g.fillRect(-260, s.pitch * k, 520, 260);
  g.strokeStyle = GREEN; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-150, s.pitch * k); g.lineTo(150, s.pitch * k); g.stroke();
  // Pitch ladder rungs
  g.lineWidth = 1.2;
  for (let d = -30; d <= 30; d += 5) {
    if (!d) continue;
    const y = (s.pitch - d * Math.PI / 180) * k;
    const w = d % 10 === 0 ? 28 : 14;
    g.beginPath();
    if (d < 0) g.setLineDash([4, 3]);
    g.moveTo(-w, y); g.lineTo(-7, y); g.moveTo(7, y); g.lineTo(w, y);
    g.stroke(); g.setLineDash([]);
    if (d % 10 === 0) {
      g.beginPath();
      const tip = d > 0 ? 4 : -4;
      g.moveTo(-w, y); g.lineTo(-w, y + tip); g.moveTo(w, y); g.lineTo(w, y + tip); g.stroke();
      txt(g, String(Math.abs(d)), w + 4, y + 3, GREEN, 8, 'left', 600);
      txt(g, String(Math.abs(d)), -w - 4, y + 3, GREEN, 8, 'right', 600);
    }
  }
  g.restore();
  // Attitude viewport border + bank angle scale
  g.strokeStyle = 'rgba(125,255,176,0.35)'; g.lineWidth = 1; g.strokeRect(42, 34, 172, 168);
  g.strokeStyle = GREEN; g.lineWidth = 1.2;
  g.beginPath(); g.arc(cx, cy, 76, -Math.PI * 0.82, -Math.PI * 0.18); g.stroke();
  for (const ba of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const a = -Math.PI / 2 + ba * Math.PI / 180;
    const r0 = 76, r1 = ba % 30 === 0 ? 82 : 79;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
  }
  g.save(); g.translate(cx, cy); g.rotate(-s.roll); g.fillStyle = GREEN;
  g.beginPath(); g.moveTo(0, -75); g.lineTo(-4.5, -67); g.lineTo(4.5, -67); g.closePath(); g.fill(); g.restore();
  // Fixed aircraft W symbol + flight path vector
  g.strokeStyle = AMBER; g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(cx - 38, cy); g.lineTo(cx - 14, cy); g.lineTo(cx - 7, cy + 7); g.lineTo(cx, cy);
  g.lineTo(cx + 7, cy + 7); g.lineTo(cx + 14, cy); g.lineTo(cx + 38, cy);
  g.stroke();
  const fpvX = cx + clamp(s.yawCmd * 18, -28, 28), fpvY = cy - clamp(s.vs * 1.8, -32, 32);
  g.strokeStyle = CYAN; g.lineWidth = 1.4;
  g.beginPath(); g.arc(fpvX, fpvY, 4.5, 0, TAU);
  g.moveTo(fpvX - 11, fpvY); g.lineTo(fpvX - 4.5, fpvY);
  g.moveTo(fpvX + 4.5, fpvY); g.lineTo(fpvX + 11, fpvY);
  g.moveTo(fpvX, fpvY - 4.5); g.lineTo(fpvX, fpvY - 9); g.stroke();

  // Left Airspeed Tape & Box
  const kts = s.speed * 1.944;
  g.fillStyle = 'rgba(2,10,8,0.82)'; g.fillRect(19, 34, 22, 168);
  g.strokeStyle = 'rgba(125,255,176,0.4)'; g.strokeRect(19, 34, 22, 168);
  g.save(); g.beginPath(); g.rect(19, 34, 22, 168); g.clip();
  for (let v = Math.floor((kts - 40) / 10) * 10; v <= kts + 40; v += 10) {
    if (v < 0) continue;
    const y = cy - (v - kts) * 1.8;
    g.strokeStyle = GREEN; g.beginPath(); g.moveTo(36, y); g.lineTo(41, y); g.stroke();
    txt(g, String(v), 34, y + 3, DIMG, 7.5, 'right');
  }
  g.restore();
  g.fillStyle = '#03120c'; g.fillRect(18, cy - 10, 26, 20);
  g.strokeStyle = GREEN; g.lineWidth = 1.5; g.strokeRect(18, cy - 10, 26, 20);
  txt(g, String(Math.round(kts)).padStart(3, '0'), 31, cy + 4, '#fff', 10.5, 'center', 700);
  txt(g, 'KT', 30, 212, CYAN, 7.5, 'center', 600);

  // Right Altitude Tape & Box + VSI strip
  const agl = s.agl;
  g.fillStyle = 'rgba(2,10,8,0.82)'; g.fillRect(215, 34, 22, 168);
  g.strokeStyle = 'rgba(125,255,176,0.4)'; g.strokeRect(215, 34, 22, 168);
  g.save(); g.beginPath(); g.rect(215, 34, 22, 168); g.clip();
  for (let a = Math.floor((agl - 50) / 10) * 10; a <= agl + 50; a += 10) {
    if (a < 0) continue;
    const y = cy - (a - agl) * 1.5;
    g.strokeStyle = GREEN; g.beginPath(); g.moveTo(215, y); g.lineTo(220, y); g.stroke();
    txt(g, String(a), 222, y + 3, DIMG, 7.5, 'left');
  }
  g.restore();
  g.fillStyle = '#03120c'; g.fillRect(212, cy - 10, 26, 20);
  g.strokeStyle = GREEN; g.lineWidth = 1.5; g.strokeRect(212, cy - 10, 26, 20);
  txt(g, String(Math.round(agl)) + 'R', 225, cy + 4, '#fff', 10, 'center', 700);
  const vs = clamp(s.vs / 12, -1, 1);
  g.fillStyle = CYAN; g.fillRect(239, cy - Math.max(0, vs) * 68, 3, Math.abs(vs) * 68);
  txt(g, (s.vs >= 0 ? '+' : '') + s.vs.toFixed(1), 226, 212, CYAN, 7.5, 'center', 600);

  // Top TQ / NR status box
  g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(102, 20, 96, 12);
  g.strokeStyle = 'rgba(125,255,176,0.4)'; g.strokeRect(102, 20, 96, 12);
  txt(g, `TQ ${Math.round(s.torque * 100)}%   NR ${Math.round(s.rpm * 100)}%`, 150, 29, GREEN, 8, 'center', 600);

  // Bottom Heading Tape
  const hd = ((s.heading * 180 / Math.PI) % 360 + 360) % 360;
  g.fillStyle = 'rgba(2,10,8,0.82)'; g.fillRect(48, 216, 160, 22);
  g.strokeStyle = 'rgba(125,255,176,0.4)'; g.strokeRect(48, 216, 160, 22);
  g.save(); g.beginPath(); g.rect(48, 216, 160, 22); g.clip();
  for (let d = -45; d <= 45; d += 5) {
    const v = Math.round(hd / 5) * 5 + d, x = cx + (v - hd) * 2.1;
    g.strokeStyle = GREEN; g.beginPath(); g.moveTo(x, 216); g.lineTo(x, v % 10 === 0 ? 223 : 220); g.stroke();
    if (v % 30 === 0) {
      const deg = ((v % 360) + 360) % 360;
      const lbl = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg / 10 | 0).padStart(2, '0');
      txt(g, lbl, x, 234, deg % 90 === 0 ? AMBER : GREEN, 8.5, 'center', 600);
    }
  }
  g.restore();
  g.fillStyle = '#03120c'; g.fillRect(cx - 16, 204, 32, 13);
  g.strokeStyle = AMBER; g.strokeRect(cx - 16, 204, 32, 13);
  txt(g, String(Math.round(hd)).padStart(3, '0') + '°', cx, 213.5, AMBER, 9, 'center', 700);
  g.restore();
  S.done();
}

function drawNAV(S, s, trail, t) {
  const g = S.g, sc = S.c.width / 256;
  S.frame('TSD · TAC', ['PFD', '*TSD', 'WPN', 'FCR', 'COM'], ['*MAP', 'RTE', 'THRT', 'COORD', 'ZOOM'], ['N-UP', '*H-UP', 'CTR', 'DECL', 'GRID'], ['WP1', 'WP2', 'LZ', 'MARK', 'TGT']);
  g.save(); g.scale(sc, sc);
  const cx = 128, cy = 134;
  g.save(); g.beginPath(); g.rect(20, 32, 216, 192); g.clip();
  g.translate(cx, cy); g.rotate(s.heading - Math.PI / 2);
  const scale = 0.28;
  const ox = (s.x * scale) % 24, oz = (s.z * scale) % 24;
  // Topographic elevation contour lines
  g.strokeStyle = 'rgba(85,175,115,0.14)'; g.lineWidth = 1;
  for (const [tx, tz, rx, rz] of [[-45, -35, 38, 24], [52, -40, 44, 30], [-30, 55, 50, 28], [60, 45, 32, 22]]) {
    for (let ring = 1; ring <= 3; ring++) {
      g.beginPath();
      g.ellipse(tx - s.x * scale * 0.4, tz - s.z * scale * 0.4, rx * ring * 0.42, rz * ring * 0.42, 0.4, 0, TAU);
      g.stroke();
    }
  }
  // Tactical grid
  g.strokeStyle = 'rgba(111,233,255,.11)'; g.lineWidth = 0.8;
  for (let i = -8; i <= 8; i++) {
    g.beginPath(); g.moveTo(i * 24 - ox, -170); g.lineTo(i * 24 - ox, 170); g.stroke();
    g.beginPath(); g.moveTo(-170, i * 24 - oz); g.lineTo(170, i * 24 - oz); g.stroke();
  }
  // Planned route line & waypoints
  const hpx = -s.x * scale, hpz = -s.z * scale;
  const wp1x = hpx + 54, wp1z = hpz - 42;
  const wp2x = hpx - 48, wp2z = hpz - 68;
  g.strokeStyle = 'rgba(111,233,255,0.45)'; g.setLineDash([4, 3]); g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(hpx, hpz); g.lineTo(wp1x, wp1z); g.lineTo(wp2x, wp2z); g.stroke(); g.setLineDash([]);
  for (const [wx, wz, lbl] of [[wp1x, wp1z, 'WP1'], [wp2x, wp2z, 'LZ-A']]) {
    g.strokeStyle = CYAN; g.strokeRect(wx - 4, wz - 4, 8, 8);
    txt(g, lbl, wx + 7, wz + 3, CYAN, 7.5, 'left', 600);
  }
  // Simulated SAM threat ring
  g.strokeStyle = 'rgba(255,90,74,0.55)'; g.setLineDash([3, 2]);
  g.beginPath(); g.arc(wp2x - 18, wp2z + 22, 22, 0, TAU); g.stroke(); g.setLineDash([]);
  txt(g, 'SA-15', wp2x - 18, wp2z + 25, RED, 7, 'center', 700);
  // Flight trail
  g.fillStyle = CYAN;
  for (let i = 0; i < trail.length; i++) {
    const p = trail[i]; g.globalAlpha = i / trail.length;
    g.fillRect((p.x - s.x) * scale - 1, (p.z - s.z) * scale - 1, 2.2, 2.2);
  }
  g.globalAlpha = 1;
  // Home pad
  g.strokeStyle = AMBER; g.lineWidth = 1.4; g.beginPath(); g.arc(hpx, hpz, 6.5, 0, TAU); g.stroke();
  txt(g, 'H', hpx, hpz + 3, AMBER, 8, 'center', 700);
  g.restore();

  // Compass rose & range rings + sweep
  g.strokeStyle = 'rgba(125,255,176,.35)'; g.lineWidth = 1;
  for (const r of [34, 68, 96]) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
  for (let deg = 0; deg < 360; deg += 10) {
    const a = (deg * Math.PI / 180) - s.heading - Math.PI / 2;
    const r0 = 96, r1 = deg % 30 === 0 ? 90 : 93;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
  }
  const a = (t * 1.6) % TAU;
  const grd = g.createConicGradient ? g.createConicGradient(a - 0.6, cx, cy) : null;
  if (grd) {
    grd.addColorStop(0, 'rgba(125,255,176,0)'); grd.addColorStop(0.095, 'rgba(125,255,176,.22)'); grd.addColorStop(0.1, 'rgba(125,255,176,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 96, 0, TAU); g.fill();
  }
  // Ownship icon
  g.fillStyle = AMBER; g.beginPath(); g.moveTo(cx, cy - 9); g.lineTo(cx - 6, cy + 6); g.lineTo(cx, cy + 3); g.lineTo(cx + 6, cy + 6); g.fill();
  // Bottom tactical status bar
  g.fillStyle = 'rgba(2,10,8,0.85)'; g.fillRect(20, 224, 216, 16);
  txt(g, 'GS ' + String(Math.round(s.speed * 1.944)).padStart(3, '0') + 'KT', 24, 235, GREEN, 8.5, 'left', 600);
  txt(g, 'WP1 1.4KM', 128, 235, CYAN, 8.5, 'center', 600);
  txt(g, 'RNG 2.0KM', 232, 235, DIMG, 8.5, 'right', 600);
  g.restore();
  S.done();
}

function bar(g, x, y, hh, v, label, col, warn = 0.92) {
  g.fillStyle = 'rgba(4,16,12,0.85)'; g.fillRect(x, y, 16, hh);
  g.strokeStyle = 'rgba(125,255,176,.38)'; g.lineWidth = 1; g.strokeRect(x, y, 16, hh);
  for (let t = 0.2; t < 1.0; t += 0.2) {
    const ty = y + hh - t * (hh - 4) - 2;
    g.beginPath(); g.moveTo(x + 12, ty); g.lineTo(x + 16, ty); g.stroke();
  }
  const vv = clamp(v, 0, 1.08);
  const cFill = vv > warn ? RED : col;
  g.fillStyle = cFill; g.fillRect(x + 2, y + hh - vv * (hh - 4) - 2, 10, vv * (hh - 4));
  // Redline tick
  const wy = y + hh - clamp(warn, 0, 1) * (hh - 4) - 2;
  g.strokeStyle = RED; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 1, wy); g.lineTo(x + 17, wy); g.stroke();
  txt(g, label, x + 8, y + hh + 11, CYAN, 7.5, 'center', 600);
  g.fillStyle = '#03120c'; g.fillRect(x - 2, y - 14, 20, 11);
  g.strokeStyle = 'rgba(125,255,176,0.35)'; g.lineWidth = 0.8; g.strokeRect(x - 2, y - 14, 20, 11);
  txt(g, String(Math.round(v * 100)), x + 8, y - 5.5, cFill, 8, 'center', 700);
}

function drawENG(S, s) {
  const g = S.g, sc = S.c.width / 256;
  S.frame('ENG · SYS', ['PFD', 'TSD', '*ENG', 'FUEL', 'ELEC'], ['*MAIN', 'HYD', 'ECS', 'VIB', 'TEST'], ['ENG1', 'ENG2', 'GBX', 'APU', 'BATT'], ['GEN1', 'GEN2', 'PUMP', 'FAN', 'PROP']);
  g.save(); g.scale(sc, sc);
  const y = 50, hh = 112;
  bar(g, 24, y, hh, s.rpm, 'NR', GREEN, 1.04);
  bar(g, 48, y, hh, s.rpm * (0.98 + s.thrust * 0.04), 'NP', GREEN, 1.04);
  bar(g, 76, y, hh, s.torque * 0.98, 'TQ1', CYAN, 0.92);
  bar(g, 100, y, hh, s.torque * 1.01, 'TQ2', CYAN, 0.92);
  bar(g, 128, y, hh, (s.tgt - 15) / 900, 'TGT1', AMBER, 0.92);
  bar(g, 152, y, hh, (s.tgt - 12) / 900, 'TGT2', AMBER, 0.92);
  bar(g, 180, y, hh, s.fuel, 'FUEL', GREEN, 1.5);
  bar(g, 204, y, hh, s.rpm > 0.1 ? 0.82 + s.thrust * 0.08 : 0, 'HYD', CYAN, 1.5);

  // Lower system telemetry boxes
  g.fillStyle = 'rgba(4,16,12,0.85)';
  g.fillRect(22, 180, 102, 54); g.fillRect(132, 180, 102, 54);
  g.strokeStyle = 'rgba(111,233,255,0.32)'; g.lineWidth = 1;
  g.strokeRect(22, 180, 102, 54); g.strokeRect(132, 180, 102, 54);

  const ng = (s.rpm * 94.2 + s.thrust * 4.6).toFixed(1);
  txt(g, 'NG1 ' + ng + '%', 28, 192, GREEN, 8, 'left', 600);
  txt(g, 'NG2 ' + ng + '%', 28, 204, GREEN, 8, 'left', 600);
  txt(g, `OIL  92°C  78PSI`, 28, 216, CYAN, 7.5, 'left', 500);
  txt(g, `HYD  3000 / 2980`, 28, 228, GREEN, 7.5, 'left', 500);

  txt(g, `BATT ${(28.2 - s.thrust * 0.4).toFixed(1)}V  GEN ${s.rpm > 0.5 ? 'ON' : 'OFF'}`, 138, 192, GREEN, 8, 'left', 600);
  txt(g, `FUEL ${Math.round(s.fuel * 1420)} KG`, 138, 204, AMBER, 8, 'left', 600);
  txt(g, `FAN TILT  ${Math.round(s.fanTilt * 90)}°`, 138, 216, CYAN, 7.5, 'left', 500);
  txt(g, `PUSHER    ${Math.round(s.propThrust * 100)}%`, 138, 228, CYAN, 7.5, 'left', 500);
  g.restore();
  S.done();
}

function drawWPN(S, s) {
  const g = S.g, sc = S.c.width / 256;
  S.frame('WPN · SMS', ['PFD', 'TSD', 'ENG', '*WPN', 'ASE'], ['*GUN', 'RKT', 'MSL', 'JETT', 'SAFE'], ['M230', 'AGM1', 'AGM2', 'HYD1', 'FLR'], ['TADS', 'IIR', 'LASR', 'CHAFF', 'IRCM']);
  g.save(); g.scale(sc, sc);
  const am = s.ammo || {};
  const cx = 128;
  const armed = s.stance === 'combat';
  // Master Arm status banner
  g.fillStyle = armed ? 'rgba(255,65,55,0.88)' : 'rgba(40,120,85,0.32)';
  g.fillRect(156, 20, 78, 14);
  g.strokeStyle = armed ? RED : GREEN; g.strokeRect(156, 20, 78, 14);
  txt(g, armed ? 'MASTER ARM' : 'SAFE · SIM', 195, 30, armed ? '#fff' : GREEN, 8, 'center', 700);

  // STRIX top-down planform silhouette
  g.strokeStyle = GREEN; g.lineWidth = 1.3;
  g.beginPath();
  g.moveTo(cx, 38); g.lineTo(cx + 11, 72); g.lineTo(cx + 15, 136); g.lineTo(cx + 6, 208);
  g.lineTo(cx - 6, 208); g.lineTo(cx - 15, 136); g.lineTo(cx - 11, 72); g.closePath(); g.stroke();
  // Stub wings & lift fans
  g.beginPath(); g.moveTo(cx + 15, 108); g.lineTo(cx + 76, 100); g.lineTo(cx + 76, 122); g.lineTo(cx + 15, 128); g.stroke();
  g.beginPath(); g.moveTo(cx - 15, 108); g.lineTo(cx - 76, 100); g.lineTo(cx - 76, 122); g.lineTo(cx - 15, 128); g.stroke();
  g.beginPath(); g.arc(cx + 88, 111, 12, 0, TAU); g.stroke();
  g.beginPath(); g.arc(cx - 88, 111, 12, 0, TAU); g.stroke();

  // Pylon boxes
  for (const sd of [-1, 1]) {
    const px = cx + sd * 46;
    g.fillStyle = 'rgba(4,18,14,0.9)'; g.fillRect(px - 14, 90, 28, 38);
    g.strokeStyle = armed ? AMBER : GREEN; g.strokeRect(px - 14, 90, 28, 38);
    txt(g, 'RKT', px, 102, CYAN, 7.5, 'center', 600);
    const cnt = sd > 0 ? Math.ceil((am.rkt ?? 38) / 2) : Math.floor((am.rkt ?? 38) / 2);
    txt(g, String(cnt).padStart(2, '0'), px, 120, GREEN, 11, 'center', 700);
  }
  // Nose Gun box
  g.fillStyle = 'rgba(4,18,14,0.9)'; g.fillRect(cx - 26, 46, 52, 22);
  g.strokeStyle = GREEN; g.strokeRect(cx - 26, 46, 52, 22);
  txt(g, `30MM  ${String(am.gun ?? 1200).padStart(4, '0')}`, cx, 60, GREEN, 8, 'center', 700);

  // Internal Bay Missiles box
  g.fillStyle = 'rgba(4,18,14,0.9)'; g.fillRect(cx - 32, 142, 64, 32);
  g.strokeStyle = CYAN; g.strokeRect(cx - 32, 142, 64, 32);
  txt(g, 'AGM-179 BAY', cx, 154, CYAN, 7.5, 'center', 600);
  txt(g, `${am.msl ?? 6} RDY`, cx, 168, '#fff', 10, 'center', 700);

  // Countermeasures & IRCM footer
  g.fillStyle = 'rgba(4,18,14,0.9)'; g.fillRect(24, 216, 208, 18);
  g.strokeStyle = 'rgba(125,255,176,0.35)'; g.strokeRect(24, 216, 208, 18);
  txt(g, `FLR/CHF ${am.flr ?? 60}   IRCM ON   LASER 1688`, cx, 228, GREEN, 8, 'center', 600);
  g.restore();
  S.done();
}

function drawHUD(S, s) {
  const g = S.g, w = S.c.width, h = S.c.height, sc = w / 256;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.save(); g.scale(sc, sc);
  const col = '#4eff98', cx = 128, cy = 128;
  // Subtle combiner glass outer frame glow
  g.strokeStyle = 'rgba(78,255,152,0.22)'; g.lineWidth = 1.5;
  g.strokeRect(6, 6, 244, 244);

  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.8;
  g.save(); g.translate(cx, cy); g.rotate(-s.roll);
  const k = 300;
  for (let d = -20; d <= 20; d += 5) {
    const y = (s.pitch - d * Math.PI / 180) * k;
    if (Math.abs(y) > 96) continue;
    g.beginPath();
    if (d === 0) {
      g.moveTo(-105, y); g.lineTo(-22, y); g.moveTo(22, y); g.lineTo(105, y);
    } else {
      g.setLineDash(d < 0 ? [5, 4] : []);
      g.moveTo(-44, y); g.lineTo(-18, y); g.moveTo(-18, y + (d > 0 ? 4 : -4));
      g.moveTo(44, y); g.lineTo(18, y); g.lineTo(18, y + (d > 0 ? 4 : -4));
      txt(g, String(Math.abs(d)), -48, y + 3, col, 8, 'right', 600);
      txt(g, String(Math.abs(d)), 48, y + 3, col, 8, 'left', 600);
    }
    g.stroke(); g.setLineDash([]);
  }
  g.restore();
  // Bore cross & flight path symbol
  g.beginPath(); g.arc(cx, cy, 5.5, 0, TAU);
  g.moveTo(cx - 16, cy); g.lineTo(cx - 5.5, cy);
  g.moveTo(cx + 5.5, cy); g.lineTo(cx + 16, cy);
  g.moveTo(cx, cy - 5.5); g.lineTo(cx, cy - 12); g.stroke();
  // Boxed speed & radar altitude
  g.strokeRect(12, cy - 12, 42, 22);
  txt(g, String(Math.round(s.speed * 1.944)).padStart(3, ' '), 33, cy + 4, col, 13, 'center', 700);
  txt(g, 'IAS', 33, cy - 15, col, 7.5, 'center', 600);

  g.strokeRect(202, cy - 12, 44, 22);
  txt(g, String(Math.round(s.agl)) + 'R', 224, cy + 4, col, 13, 'center', 700);
  txt(g, 'RADALT', 224, cy - 15, col, 7.5, 'center', 600);

  // Heading tape at top
  const hd = ((s.heading * 180 / Math.PI) % 360 + 360) % 360;
  txt(g, String(Math.round(hd)).padStart(3, '0'), cx, 22, col, 12, 'center', 700);
  g.save(); g.beginPath(); g.rect(58, 24, 140, 18); g.clip();
  for (let d = -30; d <= 30; d += 5) {
    const v = Math.round(hd / 5) * 5 + d, x = cx + (v - hd) * 2.5;
    g.beginPath(); g.moveTo(x, 26); g.lineTo(x, v % 10 === 0 ? 34 : 30); g.stroke();
  }
  g.restore();
  g.beginPath(); g.moveTo(cx, 35); g.lineTo(cx - 4, 41); g.lineTo(cx + 4, 41); g.closePath(); g.stroke();

  txt(g, `NR ${Math.round(s.rpm * 100)}%   TQ ${Math.round(s.torque * 100)}%   TGT ${Math.round(s.tgt)}°C`, cx, 242, col, 9.5, 'center', 600);
  if (s.stance === 'combat') {
    g.strokeRect(cx - 28, cy - 28, 56, 56);
    txt(g, 'ARM · M230', cx, cy + 42, col, 9, 'center', 700);
  }
  g.restore();
  S.done();
}

/** Crisp canvas texture for standby Attitude Indicator (SAI), Standby Airspeed/Altimeter, and UFC scratchpad */
function makeStandbyAndUFCTextures() {
  // 1. Standby Attitude Indicator & Airspeed dial (256x128)
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#080c0e'; g.fillRect(0, 0, 256, 128);
  // Left dial: Standby ADI
  g.save(); g.beginPath(); g.arc(64, 64, 54, 0, TAU); g.clip();
  g.fillStyle = '#185488'; g.fillRect(10, 10, 108, 54);
  g.fillStyle = '#683c18'; g.fillRect(10, 64, 108, 54);
  g.strokeStyle = '#e8f4ec'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(10, 64); g.lineTo(118, 64); g.stroke();
  for (const dy of [-24, -12, 12, 24]) {
    g.lineWidth = 1.2; g.beginPath(); g.moveTo(46, 64 + dy); g.lineTo(82, 64 + dy); g.stroke();
  }
  g.strokeStyle = AMBER; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(34, 64); g.lineTo(54, 64); g.lineTo(58, 70); g.moveTo(94, 64); g.lineTo(74, 64); g.lineTo(70, 70); g.stroke();
  g.restore();
  g.strokeStyle = '#6fe9ff'; g.lineWidth = 2; g.beginPath(); g.arc(64, 64, 55, 0, TAU); g.stroke();

  // Right dial: Standby Airspeed / Altimeter
  g.save(); g.translate(192, 64);
  g.fillStyle = '#060c0a'; g.beginPath(); g.arc(0, 0, 54, 0, TAU); g.fill();
  g.strokeStyle = '#7dffb0'; g.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12 - Math.PI / 2;
    g.beginPath(); g.moveTo(Math.cos(a) * 42, Math.sin(a) * 42); g.lineTo(Math.cos(a) * 51, Math.sin(a) * 51); g.stroke();
  }
  g.strokeStyle = '#ffffff'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(28, -22); g.stroke();
  g.fillStyle = '#03120c'; g.fillRect(-26, 12, 52, 16);
  g.strokeStyle = '#6fe9ff'; g.lineWidth = 1; g.strokeRect(-26, 12, 52, 16);
  txt(g, '1013', 0, 24, '#7dffb0', 11, 'center', 700);
  g.restore();
  g.strokeStyle = '#6fe9ff'; g.lineWidth = 2; g.beginPath(); g.arc(192, 64, 55, 0, TAU); g.stroke();

  const stbyTex = new THREE.CanvasTexture(c);
  stbyTex.colorSpace = THREE.SRGBColorSpace;
  const stbyMat = new THREE.MeshBasicMaterial({ map: stbyTex });

  // 2. UFC (Up-Front Controller) backlit keypad & scratchpad (256x128)
  const cu = document.createElement('canvas'); cu.width = 256; cu.height = 128;
  const gu = cu.getContext('2d');
  gu.fillStyle = '#0c1014'; gu.fillRect(0, 0, 256, 128);
  // Scratchpad window
  gu.fillStyle = '#020c08'; gu.fillRect(10, 8, 236, 26);
  gu.strokeStyle = '#4eff98'; gu.lineWidth = 1.2; gu.strokeRect(10, 8, 236, 26);
  txt(gu, 'UHF 243.000  ▾  IFF M4  ▾  WPT 01', 128, 25, '#7dffb0', 11, 'center', 700);
  // 6x2 backlit tactical keys
  const keys = ['COM1', 'COM2', 'NAV', 'IFF', 'AP', 'FCR', '1', '2', '3', 'CLR', 'ENT', 'EMER'];
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 6; k++) {
      const kx = 12 + k * 39, ky = 42 + r * 38;
      gu.fillStyle = '#141a20'; gu.fillRect(kx, ky, 33, 30);
      gu.strokeStyle = '#57ff9a'; gu.lineWidth = 1.2; gu.strokeRect(kx, ky, 33, 30);
      txt(gu, keys[r * 6 + k], kx + 16.5, ky + 19, '#7dffb0', 9, 'center', 700);
    }
  }
  const ufcTex = new THREE.CanvasTexture(cu);
  ufcTex.colorSpace = THREE.SRGBColorSpace;
  const ufcMat = new THREE.MeshBasicMaterial({ map: ufcTex });

  return { stbyMat, ufcMat };
}

export function buildCockpit(M, body) {
  const group = grp(body, null, null, 'cockpit');
  const screens = { pfd: new Screen(), nav: new Screen(), eng: new Screen(), wpn: new Screen(), hud: new Screen() };
  screens.hud.mat = new THREE.MeshBasicMaterial({ map: screens.hud.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.96 });
  const { stbyMat, ufcMat } = makeStandbyAndUFCTextures();

  // Sensor display (TADS/FLIR thermal feed with synthetic FLIR terrain/reticle so it never displays blank static)
  const sensorMat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, uHas: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D tMap; uniform float uHas,uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      float n2(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y);
      }
      void main(){
        vec3 c = uHas>.5 ? texture2D(tMap, vUv).rgb : vec3(0.);
        float lCam = dot(c, vec3(.3,.59,.11));
        lCam = pow(clamp(lCam*1.5, 0., 1.), .65);
        // Synthetic FLIR ridge & hotspot signature blended when camera feed is dark or unrendered
        float ridge = 0.48 + 0.14*sin(vUv.x*5.5 + 0.4) + 0.06*sin(vUv.x*14.0 - 0.8);
        float isGnd = smoothstep(ridge + 0.02, ridge - 0.04, vUv.y);
        float terr = isGnd * (0.28 + 0.42 * n2(vec2(vUv.x * 16.0, vUv.y * 24.0))) + (1.0 - isGnd) * (0.08 + 0.12 * (1.0 - vUv.y));
        float hotSpot = exp(-pow(length((vUv - vec2(0.5, 0.46)) * vec2(8.0, 11.0)), 2.0)) * 0.72;
        float grain = (h(vUv*320. + fract(uTime)*17.) - 0.5) * 0.06;
        float l = clamp(mix(terr + hotSpot, max(lCam, (terr + hotSpot)*0.55), uHas * step(0.02, lCam)) + grain, 0.04, 0.96);
        vec3 col = mix(vec3(0.02, 0.10, 0.07), vec3(0.45, 1.0, 0.72), l);
        // Crisp FLIR targeting crosshair, FOV brackets & azimuth ticks
        vec2 d = abs(vUv - 0.5);
        float ch = step(d.x, .0035)*step(.028, d.y)*step(d.y, .16) + step(d.y, .0045)*step(.028, d.x)*step(d.x, .16);
        float brk = (step(abs(d.x - .28), .004)*step(d.y, .24)*step(.18, d.y)) + (step(abs(d.y - .24), .005)*step(d.x, .28)*step(.21, d.x));
        float dotC = step(length(d), .006);
        col = mix(col, vec3(0.55, 1.0, 0.80)*1.35, clamp(ch + brk + dotC, 0., 1.));
        col *= 0.90 + 0.10 * sin(vUv.y * 420.0);
        gl_FragColor = vec4(col, 1.);
      }`,
  });

  const intMat = M.interior, darkMat = M.interiorDark;
  const sticks = [], collectives = [], pedals = [], heads = [];

  // Glass reflection overlay for MFD screens
  const mfdGlassMat = new THREE.MeshStandardMaterial({
    color: 0x061210, roughness: 0.06, metalness: 0.25,
    transparent: true, opacity: 0.14, depthWrite: false,
  });

  function bezel(parent, x, y, z, size, screenMat, tilt) {
    const b = grp(parent, [x, y, z]);
    b.rotation.set(0, -Math.PI / 2, tilt, 'ZYX');
    // Multi-stepped machined MFD bezel housing + corner mounting bosses
    mk(b, merge([
      new THREE.BoxGeometry(size + 0.068, size + 0.068, 0.028),
      new THREE.BoxGeometry(size + 0.026, size + 0.026, 0.034),
    ]), M.trim, { shadow: false, sys: 'avionics' });
    mk(b, new THREE.PlaneGeometry(size, size), screenMat, { p: [0, 0, 0.0175], shadow: false, sys: 'avionics' });
    mk(b, new THREE.PlaneGeometry(size, size), mfdGlassMat, { p: [0, 0, 0.0185], shadow: false, sys: 'avionics' });
    const bt = [], btTicks = [];
    for (let i = 0; i < 5; i++) {
      const o = (i - 2) * size / 5;
      bt.push(new THREE.BoxGeometry(0.018, 0.012, 0.014).translate(o, size / 2 + 0.021, 0.018));
      bt.push(new THREE.BoxGeometry(0.018, 0.012, 0.014).translate(o, -size / 2 - 0.021, 0.018));
      bt.push(new THREE.BoxGeometry(0.012, 0.018, 0.014).translate(size / 2 + 0.021, o, 0.018));
      bt.push(new THREE.BoxGeometry(0.012, 0.018, 0.014).translate(-size / 2 - 0.021, o, 0.018));
      // Backlit green LED key legends on every OSB pushbutton
      btTicks.push(new THREE.BoxGeometry(0.011, 0.003, 0.004).translate(o, size / 2 + 0.021, 0.025));
      btTicks.push(new THREE.BoxGeometry(0.011, 0.003, 0.004).translate(o, -size / 2 - 0.021, 0.025));
      btTicks.push(new THREE.BoxGeometry(0.003, 0.011, 0.004).translate(size / 2 + 0.021, o, 0.025));
      btTicks.push(new THREE.BoxGeometry(0.003, 0.011, 0.004).translate(-size / 2 - 0.021, o, 0.025));
    }
    // 4 corner brightness/contrast rotary knobs
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      bt.push(new THREE.CylinderGeometry(0.009, 0.011, 0.018, 10).rotateX(Math.PI / 2).translate(sx * (size / 2 + 0.021), sy * (size / 2 + 0.021), 0.020));
    }
    mk(b, merge(bt), M.darkMetal, { shadow: false, sys: 'avionics' });
    mk(b, merge(btTicks), M.ledG, { shadow: false, sys: 'avionics' });
    return b;
  }

  function switches(parent, x0, x1, y, z, n, rows = 2) {
    const geos = [];
    const guards = [];
    for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
      const x = x0 + (x1 - x0) * (i + 0.5) / n;
      const rz = z + (r - (rows - 1) / 2) * 0.048;
      geos.push(new THREE.CylinderGeometry(0.0055, 0.0055, 0.028, 6).rotateZ(-0.35 + (i % 3) * 0.3).translate(x, y + 0.014, rz));
      geos.push(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 8).translate(x, y + 0.003, rz));
      if ((i + r) % 4 === 0) {
        guards.push(new THREE.BoxGeometry(0.022, 0.018, 0.024).translate(x, y + 0.009, rz));
      }
    }
    mk(parent, merge(geos), M.steel, { shadow: false, sys: 'avionics' });
    if (guards.length) mk(parent, merge(guards), M.red, { shadow: false, sys: 'avionics' });
    const ledsG = [], ledsA = [];
    for (let i = 0; i < n; i++) {
      const gBox = new THREE.BoxGeometry(0.014, 0.004, 0.009).translate(x0 + (x1 - x0) * (i + 0.5) / n, y + 0.003, z + rows * 0.028);
      if (i % 3 === 0) ledsA.push(gBox); else ledsG.push(gBox);
    }
    if (ledsG.length) mk(parent, merge(ledsG), M.ledG, { shadow: false, sys: 'avionics' });
    if (ledsA.length) mk(parent, merge(ledsA), M.ledA, { shadow: false, sys: 'avionics' });
  }

  function seat(parent, x, fy, isPilot = true) {
    const s = grp(parent, [x, fy, 0]);
    // Armored base bucket + side ballistic protection wings + hydraulic shock-attenuation struts
    mk(s, merge([
      new THREE.BoxGeometry(0.42, 0.18, 0.40).translate(0.02, 0.12, 0),
      new THREE.BoxGeometry(0.36, 0.24, 0.03).translate(-0.02, 0.30, -0.215),
      new THREE.BoxGeometry(0.36, 0.24, 0.03).translate(-0.02, 0.30, 0.215),
    ]), M.darkMetal, { shadow: false, sys: 'crew' });
    // Ribbed seat pan cushion
    const panGeos = [new THREE.BoxGeometry(0.44, 0.075, 0.40).translate(0.03, 0.24, 0)];
    for (let k = 0; k < 4; k++) panGeos.push(new THREE.BoxGeometry(0.075, 0.02, 0.38).translate(-0.10 + k * 0.09, 0.282, 0));
    mk(s, merge(panGeos), M.seat, { shadow: false, sys: 'crew' });

    const back = grp(s, [-0.20, 0.26, 0], [0, 0, 0.20]);
    const headH = isPilot ? 0.84 : 0.78;
    // Ribbed backrest cushion + narrow contoured armored headrest (sized so gunner headrest never blocks pilot HUD)
    const backCushGeos = [
      new THREE.BoxGeometry(0.08, 0.68, 0.42).translate(0, 0.34, 0),
      new THREE.BoxGeometry(0.095, 0.20, 0.21).translate(0.01, headH, 0),
    ];
    for (let k = 0; k < 5; k++) backCushGeos.push(new THREE.BoxGeometry(0.022, 0.09, 0.38).translate(0.042, 0.10 + k * 0.12, 0));
    mk(back, merge(backCushGeos), M.seat, { shadow: false, sys: 'crew' });

    // Armored boron-carbide side wing plates + twin guide rails + narrow headrest armor shell
    mk(back, merge([
      new THREE.BoxGeometry(0.18, 0.56, 0.028).translate(0.04, 0.42, -0.225),
      new THREE.BoxGeometry(0.18, 0.56, 0.028).translate(0.04, 0.42, 0.225),
      new THREE.BoxGeometry(0.12, 0.22, 0.25).translate(-0.03, headH, 0),
      new THREE.BoxGeometry(0.14, 0.18, 0.026).translate(0.02, headH, -0.125),
      new THREE.BoxGeometry(0.14, 0.18, 0.026).translate(0.02, headH, 0.125),
    ]), M.darkMetal, { shadow: false, sys: 'crew' });

    // Twin ejection guide rails + overhead canopy-breaker horns
    mk(back, merge([
      new THREE.BoxGeometry(0.055, headH + 0.14, 0.032).translate(-0.06, (headH + 0.14) * 0.5, -0.18),
      new THREE.BoxGeometry(0.055, headH + 0.14, 0.032).translate(-0.06, (headH + 0.14) * 0.5, 0.18),
      new THREE.ConeGeometry(0.018, 0.07, 6).translate(-0.04, headH + 0.14, -0.08),
      new THREE.ConeGeometry(0.018, 0.07, 6).translate(-0.04, headH + 0.14, 0.08),
    ]), M.steel, { shadow: false, sys: 'crew' });

    // 5-point inertia-reel shoulder harness straps + metallic adjuster buckles
    mk(back, merge([-0.085, 0.085].map(z => new THREE.BoxGeometry(0.016, 0.52, 0.048).rotateZ(-0.10).translate(0.072, 0.42, z))), M.suit, { shadow: false, sys: 'crew' });
    mk(back, merge([-0.085, 0.085].map(z => new THREE.BoxGeometry(0.022, 0.032, 0.056).rotateZ(-0.10).translate(0.082, 0.52, z))), M.steel, { shadow: false, sys: 'crew' });
    // Center-mount dual-loop yellow/black ejection handle
    mk(s, new THREE.TorusGeometry(0.048, 0.012, 8, 16, Math.PI), M.yellow, { p: [0.26, 0.25, 0], r: [0, Math.PI / 2, 0], shadow: false, sys: 'crew' });
    return s;
  }

  function crew(parent, x, fy, isPilot) {
    const c = grp(parent, [x, fy, 0]);
    const suit = M.suit;
    const suitGeos = [];
    const bootGeos = [];
    // Legs + flight boots
    for (const z of [-0.11, 0.11]) {
      suitGeos.push(new THREE.CapsuleGeometry(0.075, 0.36, 4, 8).rotateZ(Math.PI / 2 - 0.12).translate(0.20, 0.36, z));
      suitGeos.push(new THREE.CapsuleGeometry(0.060, 0.36, 4, 8).rotateZ(0.50).translate(0.48, 0.18, z));
      bootGeos.push(new THREE.BoxGeometry(0.20, 0.08, 0.09).translate(0.60, 0.02, z));
    }
    // Torso
    suitGeos.push(new THREE.CapsuleGeometry(0.16, 0.32, 4, 10).scale(0.85, 1, 1.05).rotateZ(0.18).translate(-0.08, 0.66, 0));
    // Arms + gloved hands reaching toward cyclic & collective
    for (const z of [-0.20, 0.20]) {
      suitGeos.push(new THREE.CapsuleGeometry(0.052, 0.24, 4, 8).rotateZ(0.50).translate(-0.05, 0.68, z));
      suitGeos.push(new THREE.CapsuleGeometry(0.046, 0.24, 4, 8).rotateZ(Math.PI / 2 - 0.30).translate(0.14, 0.54, z * 0.72));
      bootGeos.push(new THREE.SphereGeometry(0.042, 8, 6).scale(1.2, 0.85, 0.9).translate(0.28, 0.49, z * 0.65));
    }
    mk(c, merge(suitGeos), suit, { shadow: false, sys: 'crew' });
    mk(c, merge(bootGeos), M.rubber, { shadow: false, sys: 'crew' });
    // Tactical survival vest + chest pouches + oxygen hose + 5-point harness straps & rotary quick-release cam buckle
    mk(c, merge([
      new THREE.BoxGeometry(0.16, 0.30, 0.34).rotateZ(0.18).translate(0.03, 0.66, 0),
      new THREE.BoxGeometry(0.05, 0.11, 0.085).rotateZ(0.18).translate(0.11, 0.64, -0.09),
      new THREE.BoxGeometry(0.05, 0.11, 0.085).rotateZ(0.18).translate(0.11, 0.64, 0.09),
      // Right-thigh tactical kneeboard pad
      new THREE.BoxGeometry(0.15, 0.018, 0.11).rotateZ(-0.12).translate(0.23, 0.44, 0.11),
    ]), M.darkMetal, { shadow: false, sys: 'crew' });
    // Illuminated kneeboard checklist/map display on right thigh
    mk(c, new THREE.PlaneGeometry(0.12, 0.085).rotateX(-Math.PI / 2).rotateY(-0.12), screens.nav.mat, { p: [0.23, 0.451, 0.11], shadow: false, sys: 'crew' });
    // Quick-release rotary harness buckle on chest
    mk(c, new THREE.CylinderGeometry(0.032, 0.032, 0.018, 12).rotateZ(Math.PI / 2 - 0.18), M.steel, { p: [0.115, 0.56, 0], shadow: false, sys: 'crew' });

    // Head + HGU-56/P flight helmet + dual NVG/HMD binocular pods + boom mic
    const head = grp(c, [-0.15, 1.0, 0]);
    mk(head, new THREE.CylinderGeometry(0.05, 0.06, 0.10, 8), suit, { p: [0, -0.12, 0], shadow: false, sys: 'crew' });
    const hg = new THREE.SphereGeometry(0.145, 22, 16); hg.scale(1.06, 1, 0.96);
    mk(head, hg, M.helmet, { shadow: false, sys: 'crew' });
    mk(head, new THREE.SphereGeometry(0.149, 22, 12, -Math.PI / 2.3, Math.PI / 1.15, Math.PI / 3.2, Math.PI / 3.3).rotateY(Math.PI), M.visor, { shadow: false, sys: 'crew' });
    // NVG brow battery mount + dual binocular NVG tubes + HMD monocle arm + comms ear-cup boom mic
    mk(head, merge([
      new THREE.BoxGeometry(0.05, 0.042, 0.068).translate(0.135, 0.082, 0),
      new THREE.CylinderGeometry(0.016, 0.018, 0.075, 10).rotateZ(Math.PI / 2 - 0.35).translate(0.168, 0.095, -0.032),
      new THREE.CylinderGeometry(0.016, 0.018, 0.075, 10).rotateZ(Math.PI / 2 - 0.35).translate(0.168, 0.095, 0.032),
      new THREE.BoxGeometry(0.06, 0.024, 0.024).translate(0.12, 0.0, 0.082),
      new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6).rotateZ(Math.PI / 2 + 0.25).rotateY(-0.35).translate(0.09, -0.045, -0.085),
    ]), M.darkMetal, { shadow: false, sys: 'crew' });
    mk(head, new THREE.CylinderGeometry(0.042, 0.052, 0.08, 10).rotateZ(Math.PI / 2 - 0.3), M.rubber, { p: [0.115, -0.055, 0], shadow: false, sys: 'crew' });
    mk(head, merge([
      new THREE.CircleGeometry(0.011, 10).rotateY(Math.PI / 2).translate(0.151, 0.0, 0.082),
      new THREE.CircleGeometry(0.013, 10).rotateY(Math.PI / 2).translate(0.204, 0.108, -0.032),
      new THREE.CircleGeometry(0.013, 10).rotateY(Math.PI / 2).translate(0.204, 0.108, 0.032),
    ]), M.glowSoft, { shadow: false, sys: 'crew' });
    heads.push({ head, isPilot });
    return { c, head };
  }

  function controls(parent, x, fy) {
    // Cyclic stick with ribbed accordion boot, S-bend shaft, ergonomic fighter grip, China-hat trim & trigger
    const cyc = grp(parent, [x + 0.42, fy + 0.04, 0]);
    const bootGeos = [];
    for (let b = 0; b < 4; b++) bootGeos.push(new THREE.TorusGeometry(0.048 - b * 0.006, 0.012, 6, 14).rotateX(Math.PI / 2).translate(0, 0.015 + b * 0.016, 0));
    bootGeos.push(
      new THREE.CapsuleGeometry(0.028, 0.10, 6, 10).rotateZ(0.28).translate(-0.06, 0.45, 0),
      new THREE.BoxGeometry(0.052, 0.036, 0.048).rotateZ(0.20).translate(-0.075, 0.51, 0)
    );
    mk(cyc, merge(bootGeos), M.rubber, { shadow: false, sys: 'crew' });
    mk(cyc, merge([
      new THREE.CylinderGeometry(0.015, 0.017, 0.42, 10).rotateZ(0.14).translate(-0.03, 0.22, 0),
      new THREE.CylinderGeometry(0.012, 0.008, 0.016, 8).translate(-0.078, 0.532, 0.012),
    ]), M.darkMetal, { shadow: false, sys: 'crew' });
    mk(cyc, merge([
      new THREE.BoxGeometry(0.018, 0.014, 0.018).translate(-0.055, 0.525, -0.012),
      new THREE.BoxGeometry(0.016, 0.022, 0.012).translate(-0.035, 0.47, 0),
    ]), M.ledR, { shadow: false, sys: 'crew' });
    sticks.push(cyc);

    // Collective lever with dual twist-grip throttles and multi-switch collective head box
    const col = grp(parent, [x - 0.12, fy + 0.30, -0.30]);
    mk(col, merge([
      new THREE.BoxGeometry(0.09, 0.07, 0.08),
      new THREE.CylinderGeometry(0.018, 0.018, 0.46, 10).rotateZ(-Math.PI / 2 + 0.25).translate(0.22, 0.06, 0),
      new THREE.BoxGeometry(0.14, 0.068, 0.074).rotateZ(0.25).translate(0.45, 0.125, 0),
    ]), M.darkMetal, { shadow: false, sys: 'crew' });
    mk(col, merge([
      new THREE.CylinderGeometry(0.024, 0.024, 0.14, 12).rotateZ(-Math.PI / 2 + 0.25).translate(0.32, 0.088, 0),
      new THREE.CylinderGeometry(0.010, 0.014, 0.018, 8).translate(0.46, 0.165, 0.015),
    ]), M.rubber, { shadow: false, sys: 'crew' });
    mk(col, new THREE.BoxGeometry(0.014, 0.010, 0.014), M.ledA, { p: [0.48, 0.16, -0.018], shadow: false, sys: 'crew' });
    collectives.push(col);

    // Rudder / anti-torque pedals with ribbed toe brakes & linkage tubes
    for (const z of [-0.12, 0.12]) {
      const p = grp(parent, [x + 0.78, fy + 0.02, z]);
      mk(p, merge([
        new THREE.BoxGeometry(0.026, 0.19, 0.095).rotateZ(0.35).translate(0, 0.095, 0),
        new THREE.CylinderGeometry(0.010, 0.010, 0.22, 8).rotateZ(Math.PI / 2 - 0.2).translate(0.08, 0.05, 0),
      ]), M.darkMetal, { shadow: false, sys: 'crew' });
      pedals.push({ p, z, x0: x + 0.78 });
    }
  }

  function panel(parent, x, fy, top, halfW, mfdSize, mfds, extra) {
    const p = grp(parent, [x, 0, 0]);
    const ph = top - fy - 0.04;
    const pcy = fy + ph / 2 + 0.04;
    const pnl = grp(p, [0, pcy, 0], [0, 0, -0.18]);
    // Stepped main instrument panel face + recessed sub-panel backing
    mk(pnl, merge([
      new THREE.BoxGeometry(0.10, ph, halfW * 2.02),
      new THREE.BoxGeometry(0.112, ph - 0.04, halfW * 1.94),
    ]), intMat, { shadow: false, sys: 'avionics' });

    // Deep sculpted anti-glare overhang shroud (glare shield) + padded leather coaming lip roll
    mk(p, slab([[0.14, 0.01], [-0.24, 0.01], [-0.30, -0.045], [0.14, -0.08]], halfW * 2.08, 0.015), M.interiorDark, { p: [0.0, top + 0.02, 0], shadow: false, sys: 'avionics' });
    const lipPts = [
      V3(-0.28, top - 0.022, -halfW * 0.98),
      V3(-0.30, top - 0.012, -halfW * 0.55),
      V3(-0.31, top - 0.008, 0),
      V3(-0.30, top - 0.012, halfW * 0.55),
      V3(-0.28, top - 0.022, halfW * 0.98),
    ];
    mk(p, polyBars(lipPts, 0.022, 8), M.rubber, { shadow: false, sys: 'avionics' });

    // Brow warning/caution pushbuttons + illuminated ENG 1 / APU / ENG 2 Fire T-handles flush on the glare shield lip
    const browY = top - 0.034, browX = -0.292;
    mk(p, merge([
      new THREE.BoxGeometry(0.028, 0.022, 0.082).translate(browX, browY, -0.24),
      new THREE.BoxGeometry(0.028, 0.022, 0.082).translate(browX, browY, 0.24),
      new THREE.BoxGeometry(0.032, 0.026, 0.20).translate(browX, browY, 0),
    ]), M.darkMetal, { shadow: false, sys: 'avionics' });
    // MASTER WARN (red) & ENG 1 / ENG 2 FIRE T-handles
    mk(p, merge([
      new THREE.BoxGeometry(0.016, 0.014, 0.032).translate(browX - 0.012, browY, -0.260),
      new THREE.BoxGeometry(0.018, 0.015, 0.048).translate(browX - 0.014, browY, -0.062),
      new THREE.BoxGeometry(0.018, 0.015, 0.048).translate(browX - 0.014, browY, 0.062),
    ]), M.ledR, { shadow: false, sys: 'avionics' });
    // MASTER CAUT (amber) & APU FIRE handle
    mk(p, merge([
      new THREE.BoxGeometry(0.016, 0.014, 0.032).translate(browX - 0.012, browY, -0.220),
      new THREE.BoxGeometry(0.016, 0.014, 0.032).translate(browX - 0.012, browY, 0.220),
      new THREE.BoxGeometry(0.018, 0.015, 0.044).translate(browX - 0.014, browY, 0),
    ]), M.ledA, { shadow: false, sys: 'avionics' });
    // 3 GREEN landing gear downlock status lights on right brow
    mk(p, merge([-0.016, 0, 0.016].map(dz => new THREE.BoxGeometry(0.014, 0.011, 0.011).translate(browX - 0.012, browY, 0.262 + dz))), M.ledG, { shadow: false, sys: 'avionics' });

    mfds.forEach(([z, y, mat]) => bezel(p, -0.065 + (y - pcy) * 0.18, y, z, mfdSize, mat, -0.18));

    // Lower sub-panels below the left & right MFDs: Caution/Advisory Annunciator Matrix + Armament/Countermeasure Control Panel
    const subY = fy + 0.24, subX = -0.068 + (subY - pcy) * 0.18;
    const subDarkGeos = [
      new THREE.BoxGeometry(0.028, 0.095, 0.21).rotateZ(-0.18).translate(subX, subY, -0.245),
      new THREE.BoxGeometry(0.028, 0.095, 0.21).rotateZ(-0.18).translate(subX, subY, 0.245),
      // Guarded Master Arm switch housing & Emergency Jettison button bezel
      new THREE.CylinderGeometry(0.016, 0.018, 0.022, 12).rotateZ(Math.PI / 2 - 0.18).translate(subX - 0.012, subY - 0.01, -0.31),
      new THREE.CylinderGeometry(0.016, 0.018, 0.022, 12).rotateZ(Math.PI / 2 - 0.18).translate(subX - 0.012, subY - 0.01, 0.31),
    ];
    const subLedG = [], subLedA = [], subSteel = [];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        const ly = subY + 0.018 - r * 0.026;
        const lx = -0.082 + (ly - pcy) * 0.18;
        const lz = -0.295 + c * 0.036;
        const tile = new THREE.BoxGeometry(0.008, 0.014, 0.028).rotateZ(-0.18).translate(lx, ly, lz);
        if ((r + c) % 3 === 0) subLedA.push(tile); else subLedG.push(tile);
      }
    }
    for (let c = 0; c < 5; c++) {
      const lz = 0.175 + c * 0.034;
      subSteel.push(new THREE.CylinderGeometry(0.0045, 0.0045, 0.024, 6).rotateZ(Math.PI / 2 - 0.35).translate(subX - 0.018, subY + 0.012, lz));
      subLedG.push(new THREE.BoxGeometry(0.008, 0.008, 0.016).rotateZ(-0.18).translate(subX - 0.015, subY - 0.022, lz));
    }
    mk(p, merge(subDarkGeos), M.darkMetal, { shadow: false, sys: 'avionics' });
    mk(p, merge(subLedG), M.ledG, { shadow: false, sys: 'avionics' });
    mk(p, merge(subLedA), M.ledA, { shadow: false, sys: 'avionics' });
    mk(p, merge(subSteel), M.steel, { shadow: false, sys: 'avionics' });
    mk(p, new THREE.CylinderGeometry(0.012, 0.012, 0.026, 12).rotateZ(Math.PI / 2 - 0.18), M.yellow, { p: [subX - 0.014, subY - 0.01, -0.31], shadow: false, sys: 'avionics' });
    mk(p, new THREE.BoxGeometry(0.020, 0.026, 0.022).rotateZ(-0.18), M.red, { p: [subX - 0.014, subY - 0.01, 0.31], shadow: false, sys: 'avionics' });

    if (extra) extra(p);
    return p;
  }

  function consoles(parent, x0, x1, fy, halfW) {
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    for (const sd of [-1, 1]) {
      const c = grp(parent, [cx, fy, sd * (halfW - 0.07)]);
      // Main console cabinet + dark-anodized top control plate + raised instrument module bays
      mk(c, new THREE.BoxGeometry(len, 0.34, 0.15), intMat, { p: [0, 0.17, 0], shadow: false, sys: 'avionics' });
      mk(c, new THREE.BoxGeometry(len - 0.02, 0.014, 0.135), M.interiorDark, { p: [0, 0.345, 0], shadow: false, sys: 'avionics' });
      const modGeos = [];
      for (let m = 0; m < 4; m++) {
        const mx = -len * 0.36 + m * (len * 0.24);
        modGeos.push(new THREE.BoxGeometry(len * 0.21, 0.018, 0.12).translate(mx, 0.354, 0));
      }
      if (sd < 0) {
        // Left console dual power levers (ENG 1 / ENG 2 throttle quadrant)
        modGeos.push(new THREE.BoxGeometry(0.18, 0.035, 0.08).translate(0.12, 0.365, 0.01));
        modGeos.push(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8).rotateZ(-0.25).translate(0.14, 0.40, -0.015));
        modGeos.push(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8).rotateZ(-0.25).translate(0.14, 0.40, 0.025));
      }
      mk(c, merge(modGeos), M.darkMetal, { shadow: false, sys: 'avionics' });
      if (sd < 0) {
        mk(c, merge([
          new THREE.CylinderGeometry(0.014, 0.014, 0.028, 10).rotateX(Math.PI / 2).translate(0.16, 0.44, -0.015),
          new THREE.CylinderGeometry(0.014, 0.014, 0.028, 10).rotateX(Math.PI / 2).translate(0.16, 0.44, 0.025),
        ]), M.yellow, { shadow: false, sys: 'avionics' });
      }
      switches(c, -len / 2 + 0.06, len / 2 - 0.06, 0.358, 0, 8, 2);

      // Upper cockpit tub wall: quilted ballistic liner + vertical structural ribs + circuit breaker matrix + ECS louvers
      const wallZ = sd * 0.045;
      const ribGeos = [
        // Longitudinal sill conduit & ECS air duct along upper tub wall
        new THREE.BoxGeometry(len, 0.045, 0.042).translate(0, 0.64, wallZ),
        new THREE.BoxGeometry(len * 0.42, 0.16, 0.026).translate(-len * 0.22, 0.50, wallZ),
      ];
      for (let r = 0; r < 4; r++) {
        const rx = -len * 0.40 + r * (len * 0.27);
        ribGeos.push(new THREE.BoxGeometry(0.036, 0.42, 0.032).translate(rx, 0.50, wallZ));
      }
      mk(c, merge(ribGeos), M.darkMetal, { shadow: false, sys: 'struct' });

      // Circuit-breaker button grid on the side wall panel
      const cbGeos = [];
      for (let r = 0; r < 3; r++) {
        for (let k = 0; k < 7; k++) {
          cbGeos.push(new THREE.CylinderGeometry(0.0045, 0.0045, 0.014, 6).rotateX(Math.PI / 2).translate(-len * 0.38 + k * 0.048, 0.45 + r * 0.042, wallZ - sd * 0.014));
        }
      }
      mk(c, merge(cbGeos), M.steel, { shadow: false, sys: 'avionics' });

      // Canopy manual lock / emergency jettison lever on forward upper sill
      if (sd < 0) {
        mk(c, new THREE.BoxGeometry(0.14, 0.022, 0.024).rotateZ(0.18), M.yellow, { p: [len * 0.28, 0.66, wallZ - sd * 0.02], shadow: false, sys: 'struct' });
      }
    }
  }

  // ---------------- gunner (front) ----------------
  const gx = 4.72, gfy = 0.98;
  mk(group, new THREE.BoxGeometry(1.95, 0.04, 0.78), darkMat, { p: [5.1, gfy - 0.02, 0], shadow: false, sys: 'struct' });
  seat(group, gx, gfy, false);
  const gunner = crew(group, gx + 0.02, gfy + 0.02, false);
  controls(group, gx, gfy);
  panel(group, 5.78, gfy, 1.66, 0.40, 0.21, [[0.23, 1.44, screens.wpn.mat], [-0.23, 1.44, screens.nav.mat]], (p) => {
    // Optical Relay Tube (ORT / TADS sight hood) with sun visor, brow buffer & dual target handgrips
    const ort = grp(p, [-0.20, 1.47, 0]);
    mk(ort, new THREE.BoxGeometry(0.28, 0.19, 0.22), M.interiorDark, { shadow: false, sys: 'avionics' });
    mk(ort, new THREE.PlaneGeometry(0.17, 0.13).rotateY(-Math.PI / 2), sensorMat, { p: [-0.141, 0.005, 0], shadow: false, sys: 'avionics' });
    mk(ort, new THREE.BoxGeometry(0.06, 0.025, 0.23), M.trim, { p: [-0.14, 0.095, 0], shadow: false, sys: 'avionics' });
    mk(ort, merge([-1, 1].map(sd => new THREE.CapsuleGeometry(0.024, 0.11, 4, 8).rotateZ(0.4).rotateX(sd * 0.3).translate(-0.16, -0.055, sd * 0.16))), M.rubber, { shadow: false, sys: 'avionics' });
  });
  consoles(group, 4.15, 5.45, gfy, 0.42);

  // ---------------- pilot (rear, raised) ----------------
  const px = 2.42, pfy = 1.28;
  mk(group, new THREE.BoxGeometry(2.2, 0.5, 0.86), darkMat, { p: [2.7, pfy - 0.25, 0], shadow: false, sys: 'struct' });
  seat(group, px, pfy, true);
  const pilot = crew(group, px + 0.02, pfy + 0.02, true);
  controls(group, px, pfy);
  panel(group, 3.62, pfy, 2.06, 0.46, 0.23, [[0.245, 1.77, screens.eng.mat], [-0.245, 1.77, screens.pfd.mat]], (p) => {
    // Center TADS/FLIR repeater display at top-center
    const ufd = grp(p, [-0.042, 1.855, 0], [0, 0, -0.18]);
    mk(ufd, new THREE.BoxGeometry(0.05, 0.112, 0.165), M.trim, { shadow: false, sys: 'avionics' });
    mk(ufd, new THREE.PlaneGeometry(0.145, 0.094).rotateY(-Math.PI / 2), sensorMat, { p: [-0.026, 0, 0], shadow: false, sys: 'avionics' });
    mk(ufd, new THREE.PlaneGeometry(0.145, 0.094).rotateY(-Math.PI / 2), mfdGlassMat, { p: [-0.027, 0, 0], shadow: false, sys: 'avionics' });

    // Up-Front Controller (UFC) keypad in middle-center
    const ufc = grp(p, [-0.068, 1.70, 0], [0, 0, -0.18]);
    mk(ufc, new THREE.BoxGeometry(0.045, 0.102, 0.175), M.darkMetal, { shadow: false, sys: 'avionics' });
    mk(ufc, new THREE.PlaneGeometry(0.16, 0.086).rotateY(-Math.PI / 2), ufcMat, { p: [-0.0235, 0, 0], shadow: false, sys: 'avionics' });

    // Dual Standby Instruments (SAI attitude sphere + Standby Airspeed/Altimeter) proud of lower center panel
    const stby = grp(p, [-0.096, 1.545, 0], [0, 0, -0.18]);
    mk(stby, merge([
      new THREE.BoxGeometry(0.038, 0.088, 0.170),
      new THREE.CylinderGeometry(0.038, 0.038, 0.048, 20).rotateZ(Math.PI / 2).translate(-0.006, 0, -0.043),
      new THREE.CylinderGeometry(0.038, 0.038, 0.048, 20).rotateZ(Math.PI / 2).translate(-0.006, 0, 0.043),
    ]), M.trim, { shadow: false, sys: 'avionics' });
    mk(stby, new THREE.PlaneGeometry(0.158, 0.078).rotateY(-Math.PI / 2), stbyMat, { p: [-0.031, 0, 0], shadow: false, sys: 'avionics' });
    mk(stby, new THREE.PlaneGeometry(0.158, 0.078).rotateY(-Math.PI / 2), mfdGlassMat, { p: [-0.032, 0, 0], shadow: false, sys: 'avionics' });

    // Dual-combiner collimated HUD assembly on the glare shield deck (open side stanchions, no center bar obstruction)
    const hud = grp(p, [-0.04, 2.20, 0]);
    // Base projector barrel & collimator condenser lens on glare shield
    mk(hud, merge([
      new THREE.BoxGeometry(0.18, 0.032, 0.25).translate(0, -0.125, 0),
      new THREE.CylinderGeometry(0.068, 0.078, 0.036, 20).translate(0.01, -0.105, 0),
      // Twin angled side support stanchions
      new THREE.BoxGeometry(0.022, 0.21, 0.014).rotateZ(0.24).translate(-0.01, -0.02, -0.118),
      new THREE.BoxGeometry(0.022, 0.21, 0.014).rotateZ(0.24).translate(-0.01, -0.02, 0.118),
      // Upper combiner bracket arms
      new THREE.BoxGeometry(0.016, 0.08, 0.012).rotateZ(0.32).translate(-0.032, 0.075, -0.118),
      new THREE.BoxGeometry(0.016, 0.08, 0.012).rotateZ(0.32).translate(-0.032, 0.075, 0.118),
    ]), M.darkMetal, { shadow: false, sys: 'avionics' });
    mk(hud, new THREE.CircleGeometry(0.062, 20).rotateX(-Math.PI / 2), M.lens, { p: [0.01, -0.086, 0], shadow: false, sys: 'avionics' });
    // Primary HUD combiner glass & symbology plane + upper secondary combiner glass
    const combGrp = grp(hud, [-0.01, -0.005, 0], [0, 0, 0.24]);
    const comb = mk(combGrp, new THREE.PlaneGeometry(0.228, 0.176).rotateY(-Math.PI / 2), screens.hud.mat, { shadow: false, sys: 'fx' });
    comb.userData.keep = true; comb.renderOrder = 6;
    const combGlass = mk(combGrp, new THREE.PlaneGeometry(0.232, 0.180).rotateY(-Math.PI / 2), mfdGlassMat, { p: [0.002, 0, 0], shadow: false, sys: 'avionics' });
    combGlass.renderOrder = 5;
    const upperComb = mk(hud, new THREE.PlaneGeometry(0.228, 0.052).rotateY(-Math.PI / 2), mfdGlassMat, { p: [-0.035, 0.095, 0], r: [0, 0, 0.34], shadow: false, sys: 'avionics' });
    upperComb.renderOrder = 5;
  });
  consoles(group, 1.75, 3.35, pfy, 0.50);

  // Interior canopy sill rails, rear-view mirrors, standby magnetic compass & boarding grab handles
  mk(group, merge([
    new THREE.BoxGeometry(1.9, 0.038, 0.048).translate(5.1, 1.78, -0.44),
    new THREE.BoxGeometry(1.9, 0.038, 0.048).translate(5.1, 1.78, 0.44),
    new THREE.BoxGeometry(2.3, 0.042, 0.052).translate(2.7, 2.10, -0.52),
    new THREE.BoxGeometry(2.3, 0.042, 0.052).translate(2.7, 2.10, 0.52),
    // Twin angled rear-view mirrors on pilot forward canopy arch (x = 3.88)
    new THREE.BoxGeometry(0.028, 0.055, 0.11).rotateY(-0.28).rotateZ(0.15).translate(3.84, 2.52, -0.26),
    new THREE.BoxGeometry(0.028, 0.055, 0.11).rotateY(0.28).rotateZ(0.15).translate(3.84, 2.52, 0.26),
    // Standby magnetic whiskey compass housing on center canopy arch
    new THREE.CylinderGeometry(0.026, 0.028, 0.048, 12).translate(3.85, 2.71, 0),
    // Overhead cockpit grab handles
    new THREE.CylinderGeometry(0.008, 0.008, 0.18, 8).rotateZ(Math.PI / 2 - 0.15).translate(3.55, 2.68, -0.22),
    new THREE.CylinderGeometry(0.008, 0.008, 0.18, 8).rotateZ(Math.PI / 2 - 0.15).translate(3.55, 2.68, 0.22),
  ]), M.darkMetal, { shadow: false, sys: 'struct' });
  // Reflective mirror glass faces
  mk(group, merge([
    new THREE.PlaneGeometry(0.10, 0.046).rotateY(-Math.PI / 2 - 0.28).translate(3.824, 2.52, -0.26),
    new THREE.PlaneGeometry(0.10, 0.046).rotateY(-Math.PI / 2 + 0.28).translate(3.824, 2.52, 0.26),
  ]), M.visor, { shadow: false, sys: 'struct' });

  // Eye points for the cockpit camera
  const eyePilot = new THREE.Object3D(); eyePilot.position.set(px - 0.06, pfy + 1.03, 0); group.add(eyePilot);
  const eyeGunner = new THREE.Object3D(); eyeGunner.position.set(gx - 0.06, gfy + 1.03, 0); group.add(eyeGunner);

  const trail = [];
  let acc = 10, trailAcc = 0, t = 0;
  return {
    group, screens, sensorMat, eyePilot, eyeGunner, pilotHead: pilot.head, gunnerHead: gunner.head,
    update(dt, s, heli) {
      t += dt;
      const cyc = s.cyclic;
      for (const st of sticks) { st.rotation.z = damp(st.rotation.z, -cyc.pitch * 0.22, 8, dt); st.rotation.x = damp(st.rotation.x, cyc.roll * 0.22, 8, dt); }
      for (const c of collectives) c.rotation.z = damp(c.rotation.z, (s.collective - 0.3) * 0.5, 6, dt);
      for (const p of pedals) p.p.position.x = p.x0 + Math.sign(p.z) * s.yawCmd * 0.05;
      // Heads: gunner tracks the sensor, pilot scans
      gunner.head.rotation.y = damp(gunner.head.rotation.y, clamp(heli.sensorAim.az, -1.2, 1.2), 3, dt);
      gunner.head.rotation.z = damp(gunner.head.rotation.z, clamp(heli.sensorAim.el, -0.4, 0.3), 3, dt);
      pilot.head.rotation.y = Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.13) * 0.3;
      pilot.head.rotation.z = Math.sin(t * 0.21) * 0.08;
      sensorMat.uniforms.uTime.value = t;
      trailAcc += dt;
      if (trailAcc > 0.5) { trailAcc = 0; trail.push({ x: s.x, z: s.z }); if (trail.length > 80) trail.shift(); }
      acc += dt;
      const interval = (!pilot.head.visible) ? 1 / 12 : 0.4;
      if (acc > interval) {
        acc = 0;
        drawPFD(screens.pfd, s); drawNAV(screens.nav, s, trail, t); drawENG(screens.eng, s); drawWPN(screens.wpn, s); drawHUD(screens.hud, s);
      }
    },
  };
}
