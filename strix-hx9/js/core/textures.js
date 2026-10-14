// Procedural canvas textures: panel lines, normal map, rivets, grime, camo, tire tread, decals, pad markings.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function tex(c, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

/** Convert a greyscale height canvas into a tangent-space normal map canvas (with optional oil-canning field). */
function heightToNormalCanvas(heightCanvas, strength = 3.2, oilField = null) {
  const S = heightCanvas.width;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, S, S).data;
  const cn = cv(S, S), gn = cn.getContext('2d');
  const out = gn.createImageData(S, S);
  const dst = out.data;
  const mask = S - 1;
  const H = (x, y) => src[((y & mask) * S + (x & mask)) * 4] / 255;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tl = H(x - 1, y - 1), t = H(x, y - 1), tr = H(x + 1, y - 1);
      const l = H(x - 1, y), r = H(x + 1, y);
      const bl = H(x - 1, y + 1), b = H(x, y + 1), br = H(x + 1, y + 1);
      let dx = ((tr + 2 * r + br) - (tl + 2 * l + bl)) * -strength;
      let dy = ((bl + 2 * b + br) - (tl + 2 * t + tr)) * -strength;
      if (oilField) {
        const idx2 = (y * S + x) * 2;
        dx += oilField[idx2];
        dy += oilField[idx2 + 1];
      }
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      dst[i] = ((dx * inv * 0.5 + 0.5) * 255) | 0;
      dst[i + 1] = ((-dy * inv * 0.5 + 0.5) * 255) | 0;
      dst[i + 2] = ((inv * 0.5 + 0.5) * 255) | 0;
      dst[i + 3] = 255;
    }
  }
  gn.putImageData(out, 0, 0);
  return cn;
}

//** Tiling 4m x 4m aircraft skin: high-res normal map, recessed panel lines, rivet rows, fasteners, edge wear, grime. */
export function makeSkinTextures(seed = 11) {
  const S = 1024, rnd = mulberry32(seed);
  const cb = cv(S, S), gb = cb.getContext('2d');
  const cr = cv(S, S), gr = cr.getContext('2d');
  const cg = cv(S, S), gg = cg.getContext('2d');
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, S, S);
  gr.fillStyle = '#888888'; gr.fillRect(0, 0, S, S);
  // Neutral base near white so dark liveries keep true color while panel seams/rivets darken cleanly
  gg.fillStyle = '#f0f0f0'; gg.fillRect(0, 0, S, S);

  // Subtle multi-scale grime & roughness mottling
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 38;
    const v = (180 + rnd() * 70) | 0;
    gg.fillStyle = `rgba(${v},${v},${v},${0.025 + rnd() * 0.045})`;
    gg.beginPath(); gg.arc(x, y, r, 0, 7); gg.fill();
    const rv = (90 + rnd() * 95) | 0;
    gr.fillStyle = `rgba(${rv},${rv},${rv},${0.035 + rnd() * 0.045})`;
    gr.beginPath(); gr.arc(x, y, r, 0, 7); gr.fill();
  }

  const wrapDraw = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };

  // Rows of panels (heights normalised so the tile wraps seamlessly)
  const rows = []; let tot = 0;
  while (tot < S) { const h = 90 + rnd() * 130; rows.push(h); tot += h; }
  const k = S / tot; let y = 0;
  for (const rh0 of rows) {
    const rh = rh0 * k;
    const cols = []; let ct = 0;
    while (ct < S) { const w = 110 + rnd() * 220; cols.push(w); ct += w; }
    const kc = S / ct; let x = rnd() * S;
    for (const cw0 of cols) {
      const cw = cw0 * kc;
      const px = x, py = y, pw = cw, ph = rh;
      const tone = (rnd() - 0.5) * 24;
      const rv = (134 + (rnd() - 0.5) * 72) | 0;
      const panelBump = (128 + (rnd() - 0.5) * 20) | 0;

      const wrapDraw = (fn) => {
        for (const ox of [-S, 0, S]) {
          if (px + ox + pw < -6 || px + ox > S + 6) continue;
          for (const oy of [-S, 0, S]) {
            if (py + oy + ph < -6 || py + oy > S + 6) continue;
            fn(ox, oy);
          }
        }
      };

      wrapDraw((ox, oy) => {
        const rx = px + ox, ry = py + oy;
        // Per-panel base height & tone & roughness variation
        gb.fillStyle = `rgb(${panelBump},${panelBump},${panelBump})`;
        gb.fillRect(rx + 1, ry + 1, pw - 2, ph - 2);

        gg.fillStyle = `rgba(${tone > 0 ? 255 : 0},${tone > 0 ? 255 : 0},${tone > 0 ? 255 : 0},${Math.abs(tone) / 165})`;
        gg.fillRect(rx, ry, pw, ph);

        gr.fillStyle = `rgba(${rv},${rv},${rv},0.58)`;
        gr.fillRect(rx + 1.5, ry + 1.5, pw - 3, ph - 3);

        // Soft cavity AO halo around panel seam
        gg.strokeStyle = 'rgba(14,16,20,0.12)'; gg.lineWidth = 3.2;
        gg.strokeRect(rx, ry, pw, ph);
        gg.strokeStyle = 'rgba(10,12,16,0.20)'; gg.lineWidth = 1.8;
        gg.strokeRect(rx, ry, pw, ph);

        // Recessed chamfer shoulder into the seam trench on height map (no raised outer ridge)
        gb.strokeStyle = '#525252'; gb.lineWidth = 2.4;
        gb.strokeRect(rx + 0.5, ry + 0.5, pw, ph);

        // Deep recessed panel seam trench
        gb.strokeStyle = '#181818'; gb.lineWidth = 1.3;
        gb.strokeRect(rx + 0.5, ry + 0.5, pw, ph);

        // Crisp dark seam line in diffuse & high roughness in seam groove
        gg.strokeStyle = 'rgba(8,10,14,0.44)'; gg.lineWidth = 1.2;
        gg.strokeRect(rx + 0.5, ry + 0.5, pw, ph);
        gr.strokeStyle = 'rgba(244,244,244,0.88)'; gr.lineWidth = 1.8;
        gr.strokeRect(rx + 0.5, ry + 0.5, pw, ph);
      });

      // Secondary internal sub-panel division
      if (rnd() < 0.45 && pw > 150) {
        const sx = px + pw * (0.35 + rnd() * 0.3);
        wrapDraw((ox, oy) => {
          gb.strokeStyle = '#262626'; gb.lineWidth = 1.2;
          gb.beginPath(); gb.moveTo(sx + ox, py + oy + 1.5); gb.lineTo(sx + ox, py + oy + ph - 1.5); gb.stroke();
          gg.strokeStyle = 'rgba(12,14,18,0.30)'; gg.lineWidth = 1.0;
          gg.beginPath(); gg.moveTo(sx + ox, py + oy + 1.5); gb.lineTo(sx + ox, py + oy + ph - 1.5); gg.stroke();
        });
      }

      // Rivet rows & flush fasteners along panel perimeter (batched paths per panel)
      if (rnd() < 0.90) {
        const step = 8.5 + rnd() * 3.5;
        const inset = 5.5;
        wrapDraw((ox, oy) => {
          const pts = [];
          for (let t = 7; t < pw - 6; t += step) {
            pts.push([px + ox + t, py + inset + oy], [px + ox + t, py + ph - inset + oy]);
          }
          for (let t = 7; t < ph - 6; t += step) {
            pts.push([px + inset + ox, py + oy + t], [px + pw - inset + ox, py + oy + t]);
          }
          gb.fillStyle = '#404040'; gb.beginPath();
          for (let i = 0; i < pts.length; i++) { const [rx, ry] = pts[i]; gb.moveTo(rx + 1.45, ry); gb.arc(rx, ry, 1.45, 0, 7); }
          gb.fill();
          gb.fillStyle = '#b2b2b2'; gb.beginPath();
          for (let i = 0; i < pts.length; i++) { const [rx, ry] = pts[i]; gb.moveTo(rx + 0.90, ry); gb.arc(rx, ry, 0.90, 0, 7); }
          gb.fill();
          gg.fillStyle = 'rgba(14,16,20,0.34)'; gg.beginPath();
          for (let i = 0; i < pts.length; i++) { const [rx, ry] = pts[i]; gg.moveTo(rx + 1.25, ry); gg.arc(rx, ry, 1.25, 0, 7); }
          gg.fill();
          gg.fillStyle = 'rgba(238,242,246,0.18)'; gg.beginPath();
          for (let i = 0; i < pts.length; i++) { const [rx, ry] = pts[i]; gg.moveTo(rx + 0.60, ry); gg.arc(rx, ry, 0.60, 0, 7); }
          gg.fill();
        });
      }

      // Fine edge wear & maintenance micro-scratches along panel leading edges & corners
      if (rnd() < 0.72) {
        const nScr = 3 + (rnd() * 5 | 0);
        for (let s = 0; s < nScr; s++) {
          const onVert = rnd() < 0.55;
          const sx0 = onVert ? px + (rnd() < 0.7 ? 2.5 : pw - 2.5) : px + 8 + rnd() * Math.max(4, pw - 16);
          const sy0 = onVert ? py + 8 + rnd() * Math.max(4, ph - 16) : py + (rnd() < 0.5 ? 2.5 : ph - 2.5);
          const slen = 6 + rnd() * 18;
          const sang = (rnd() - 0.5) * 0.45;
          wrapDraw((ox, oy) => {
            gg.strokeStyle = 'rgba(245,248,252,0.22)'; gg.lineWidth = 0.85;
            gg.beginPath(); gg.moveTo(sx0 + ox, sy0 + oy);
            gg.lineTo(sx0 + ox - Math.cos(sang) * slen, sy0 + oy + Math.sin(sang) * slen);
            gg.stroke();
            gr.strokeStyle = 'rgba(65,65,65,0.45)'; gr.lineWidth = 0.95;
            gr.beginPath(); gr.moveTo(sx0 + ox, sy0 + oy);
            gg.lineTo(sx0 + ox - Math.cos(sang) * slen, sy0 + oy + Math.sin(sang) * slen);
            gr.stroke();
          });
        }
      }

      // Access hatches with Camloc / Dzus fasteners
      if (rnd() < 0.48 && pw > 130 && ph > 95) {
        const hw = 35 + rnd() * 60, hh = 25 + rnd() * 42;
        const hx = px + 17 + rnd() * (pw - hw - 34), hy = py + 17 + rnd() * (ph - hh - 34);
        wrapDraw((ox, oy) => {
          gb.strokeStyle = '#222222'; gb.lineWidth = 1.6;
          rr(gb, hx + ox, hy + oy, hw, hh, 5); gb.stroke();
          gb.strokeStyle = '#b0b0b0'; gb.lineWidth = 0.9;
          rr(gb, hx + ox + 1, hy + oy + 1, hw - 2, hh - 2, 4); gb.stroke();

          gg.strokeStyle = 'rgba(14,16,20,0.70)'; gg.lineWidth = 1.35;
          rr(gg, hx + ox, hy + oy, hw, hh, 5); gg.stroke();
          gg.strokeStyle = 'rgba(255,255,255,0.24)'; gg.lineWidth = 0.85;
          rr(gg, hx + ox + 1.2, hy + oy + 1.2, hw - 2.4, hh - 2.4, 4); gg.stroke();

          for (const [fx, fy] of [[hx + 4.5, hy + 4.5], [hx + hw - 4.5, hy + 4.5], [hx + 4.5, hy + hh - 4.5], [hx + hw - 4.5, hy + hh - 4.5]]) {
            gb.fillStyle = '#383838'; gb.beginPath(); gb.arc(fx + ox, fy + oy, 2.3, 0, 7); gb.fill();
            gb.fillStyle = '#bcbcbc'; gb.fillRect(fx + ox - 1.8, fy + oy - 0.4, 3.6, 0.8);
            gg.fillStyle = 'rgba(22,24,28,0.70)'; gg.beginPath(); gg.arc(fx + ox, fy + oy, 2.1, 0, 7); gg.fill();
          }
          gr.fillStyle = 'rgba(106,106,106,0.45)'; gr.fillRect(hx + ox, hy + oy, hw, hh);
        });
      }

      // Cooling louver slots
      if (rnd() < 0.16 && pw > 100 && ph > 70) {
        const vx = px + 16 + rnd() * (pw - 70), vy = py + 16 + rnd() * Math.max(1, ph - 55);
        wrapDraw((ox, oy) => {
          for (let s = 0; s < 7; s++) {
            gb.fillStyle = '#181818'; gb.fillRect(vx + ox, vy + oy + s * 5.5, 39, 2.5);
            gb.fillStyle = '#c4c4c4'; gb.fillRect(vx + ox, vy + oy + s * 5.5 + 2.5, 39, 1.3);
            gg.fillStyle = 'rgba(16,18,22,0.68)'; gg.fillRect(vx + ox, vy + oy + s * 5.5, 39, 2.5);
          }
        });
      }
      x += cw;
    }
    y += rh;
  }

  // Longitudinal airflow / hydraulic / exhaust grime streaks (along X -> U) and gravity streaks (along Y -> V)
  for (let i = 0; i < 280; i++) {
    const x0 = rnd() * S, y0 = rnd() * S, len = 30 + rnd() * 145;
    const grd = gg.createLinearGradient(x0, 0, x0 - len, 0);
    grd.addColorStop(0, 'rgba(32,28,24,0.18)'); grd.addColorStop(1, 'rgba(32,28,24,0)');
    gg.fillStyle = grd; gg.fillRect(x0 - len, y0, len, 1 + rnd() * 2.2);
  }
  for (let i = 0; i < 240; i++) {
    const x0 = rnd() * S, y0 = rnd() * S, len = 25 + rnd() * 125;
    const grd = gg.createLinearGradient(0, y0, 0, y0 + len);
    grd.addColorStop(0, 'rgba(36,32,28,0.16)'); grd.addColorStop(1, 'rgba(36,32,28,0)');
    gg.fillStyle = grd; gg.fillRect(x0, y0, 1 + rnd() * 2.2, len);
  }

  // Subtle low-frequency skin oil-canning wave in the normal map
  const oilField = new Float32Array(S * S * 2);
  for (let py = 0; py < S; py++) {
    const sy = Math.sin((py / S) * Math.PI * 16) * 0.048;
    for (let px = 0; px < S; px++) {
      const sx = Math.sin((px / S) * Math.PI * 12) * 0.048;
      const idx = (py * S + px) * 2;
      oilField[idx] = sx;
      oilField[idx + 1] = sy;
    }
  }
  const cn = heightToNormalCanvas(cb, 3.8, oilField);

  return {
    bump: tex(cb, false),
    normal: tex(cn, false),
    rough: tex(cr, false),
    grime: tex(cg, true),
    grimeCanvas: cg,
  };
}

/** Disruptive three-tone tactical camo baked with panel lines, rivets, edge wear, and grime from the skin texture. */
export function makeCamo(colors, seed = 3, grimeCanvas = null) {
  const S = 1024, c = cv(S, S), g = c.getContext('2d'), rnd = mulberry32(seed);
  // Warm desert three-tone disruptive camo matching draft & target renders (dominant light sand, medium khaki, muted olive-earth)
  const pal = [...colors];
  if (pal.length >= 3 && (pal[0] === '#c4a47a' || pal[0] === '#e2c69c' || pal[0] === '#dac196')) {
    pal[0] = '#dec69d'; // dominant warm desert sand
    pal[1] = '#c2a376'; // medium desert tan
    pal[2] = '#9a7e56'; // muted khaki-earth band
  }
  g.fillStyle = pal[0]; g.fillRect(0, 0, S, S);
  for (let layer = 1; layer < pal.length; layer++) {
    g.save();
    g.fillStyle = pal[layer];
    g.globalAlpha = 1.0;
    const count = layer === 1 ? 14 : 9;
    for (let i = 0; i < count; i++) {
      const cx = rnd() * S, cy = rnd() * S;
      const pts = 9 + (rnd() * 5 | 0), r = (layer === 1 ? 105 : 82) + rnd() * 135;
      const shape = [];
      for (let p = 0; p < pts; p++) {
        const a = (p / pts) * Math.PI * 2, rr2 = r * (0.62 + rnd() * 0.56);
        shape.push([Math.cos(a) * rr2 * 1.65, Math.sin(a) * rr2 * 0.75]);
      }
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.beginPath();
        for (let p = 0; p < pts; p++) {
          const cur = shape[p], nxt = shape[(p + 1) % pts];
          const mx = cx + ox + (cur[0] + nxt[0]) * 0.5, my = cy + oy + (cur[1] + nxt[1]) * 0.5;
          if (p === 0) g.moveTo(mx, my);
          g.quadraticCurveTo(cx + ox + nxt[0], cy + oy + nxt[1], cx + ox + (nxt[0] + shape[(p + 2) % pts][0]) * 0.5, cy + oy + (nxt[1] + shape[(p + 2) % pts][1]) * 0.5);
        }
        g.closePath(); g.fill();
      }
    }
    g.restore();
  }
  // Bake panel lines, rivets, grime, and edge wear directly over the camo pattern
  if (grimeCanvas) {
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.drawImage(grimeCanvas, 0, 0, S, S);
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.16;
    g.drawImage(grimeCanvas, 0, 0, S, S);
    g.restore();
  }
  return tex(c, true);
}

/** Aircraft tire tread normal/bump map: circumferential grooves and cross-ribs. */
export function makeTireTexture() {
  const W = 512, H = 512, c = cv(W, H), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
  // Circumferential tread grooves
  for (const x of [110, 175, 256, 337, 402]) {
    g.fillStyle = '#181818'; g.fillRect(x - 10, 0, 20, H);
    g.fillStyle = '#b8b8b8'; g.fillRect(x - 13, 0, 3, H); g.fillRect(x + 10, 0, 3, H);
  }
  // Cross sipes / lug blocks
  for (let y = 0; y < H; y += 16) {
    g.fillStyle = '#2a2a2a';
    g.fillRect(70, y, 36, 4);
    g.fillRect(406, y + 8, 36, 4);
    g.fillRect(190, y + 4, 54, 3);
    g.fillRect(268, y + 12, 54, 3);
  }
  const cn = heightToNormalCanvas(c, 2.8);
  return { bump: tex(c, false), normal: tex(cn, false) };
}

/** Matte composite rotor blade texture with subtle weave & spanwise panel seams. */
export function makeBladeTexture() {
  const W = 512, H = 128, c = cv(W, H), g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, W, H);
  // Spanwise carbon composite micro-striations
  for (let y = 0; y < H; y += 2) {
    g.fillStyle = y % 4 === 0 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
    g.fillRect(0, y, W, 1);
  }
  // Chordwise rib seams
  for (let x = 48; x < W; x += 64) {
    g.fillStyle = 'rgba(20,20,20,0.35)';
    g.fillRect(x, 0, 2, H);
  }
  return tex(c, true);
}

/** Warning stripes (yellow/black). */
export function makeStripes(a = '#e8b321', b = '#151515') {
  const c = cv(128, 128), g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, 128, 128);
  g.fillStyle = b;
  for (let i = -128; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - 128, 128); g.lineTo(i - 128, 128); g.fill(); }
  return tex(c, true);
}

/** White-on-transparent text / glyph decal. */
export function makeDecal(draw, w = 512, h = 128) {
  const c = cv(w, h), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  draw(g, w, h);
  const t = tex(c, true, false);
  return t;
}

export function textDecal(text, { w = 512, h = 128, size = 80, weight = 600, font = 'Space Grotesk', spacing = 6, align = 'center' } = {}) {
  return makeDecal((g) => {
    g.font = `${weight} ${size}px "${font}", sans-serif`;
    g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = spacing + 'px';
    g.textAlign = align;
    g.fillText(text, align === 'center' ? w / 2 : 8, h / 2 + 4);
  }, w, h);
}

/** Helipad markings with weathered asphalt/concrete, expansion joints, skid marks, and worn paint. */
export function makePadTexture(base = '#2a2c30', line = '#e9edf2', accent = '#ffcc33', label = 'HX-9') {
  const S = 1024, c = cv(S, S), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 1024, 1024);
  const rnd = mulberry32(5);
  // Concrete/asphalt aggregate speckle & weathering patches
  for (let i = 0; i < 3600; i++) {
    const v = (rnd() * 65) | 0;
    g.fillStyle = rnd() < 0.65 ? `rgba(${v},${v},${v},.14)` : `rgba(${180 + v},${175 + v},${170 + v},.07)`;
    g.fillRect(rnd() * 1024, rnd() * 1024, 2 + rnd() * 9, 2 + rnd() * 6);
  }
  for (let i = 0; i < 28; i++) {
    const cx = 512 + (rnd() - 0.5) * 680, cy = 512 + (rnd() - 0.5) * 680, r = 25 + rnd() * 130;
    const grd = g.createRadialGradient(cx, cy, 2, cx, cy, r);
    grd.addColorStop(0, 'rgba(0,0,0,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  }
  // Concrete slab expansion joints & fine surface cracks
  g.strokeStyle = 'rgba(10,12,15,0.28)'; g.lineWidth = 1.6;
  for (let p = 128; p < 1024; p += 128) {
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 1024); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(1024, p); g.stroke();
  }
  g.strokeStyle = 'rgba(15,15,18,0.25)'; g.lineWidth = 1.1;
  for (let c0 = 0; c0 < 18; c0++) {
    let cx = 512 + (rnd() - 0.5) * 700, cy = 512 + (rnd() - 0.5) * 700;
    g.beginPath(); g.moveTo(cx, cy);
    for (let s = 0; s < 8; s++) { cx += (rnd() - 0.5) * 45; cy += (rnd() - 0.5) * 45; g.lineTo(cx, cy); }
    g.stroke();
  }
  // Painted markings
  g.strokeStyle = accent; g.lineWidth = 26; g.beginPath(); g.arc(512, 512, 380, 0, 7); g.stroke();
  g.strokeStyle = line; g.lineWidth = 6; g.beginPath(); g.arc(512, 512, 440, 0, 7); g.stroke();
  g.setLineDash([30, 26]); g.lineWidth = 4; g.beginPath(); g.arc(512, 512, 470, 0, 7); g.stroke(); g.setLineDash([]);
  g.fillStyle = line;
  const hw = 46, hh = 330, gap = 120;
  g.fillRect(512 - gap - hw / 2, 512 - hh / 2, hw, hh);
  g.fillRect(512 + gap - hw / 2, 512 - hh / 2, hw, hh);
  g.fillRect(512 - gap, 512 - hw / 2, gap * 2, hw);
  g.font = '600 46px "JetBrains Mono", monospace'; g.textAlign = 'center';
  g.fillText(label, 512, 512 + 250);
  g.font = '500 30px "JetBrains Mono", monospace';
  g.fillText('MAX 12T', 512, 512 - 220);
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2;
    g.save(); g.translate(512 + Math.cos(a) * 410, 512 + Math.sin(a) * 410); g.rotate(a);
    g.fillStyle = i % 9 === 0 ? accent : 'rgba(255,255,255,.5)'; g.fillRect(-2, -12, 4, i % 9 === 0 ? 24 : 12); g.restore();
  }
  // Distressed paint scuffing & tire rubber marks in touchdown zone
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 480;
    g.fillStyle = base; g.globalAlpha = 0.08 + rnd() * 0.18;
    g.fillRect(512 + Math.cos(a) * r, 512 + Math.sin(a) * r, 2 + rnd() * 8, 2 + rnd() * 6);
  }
  g.globalAlpha = 1;
  // Center oil/exhaust stain & tire skid streaks
  const centerStain = g.createRadialGradient(512, 512, 10, 512, 512, 190);
  centerStain.addColorStop(0, 'rgba(10,10,12,0.26)');
  centerStain.addColorStop(0.6, 'rgba(12,12,14,0.12)');
  centerStain.addColorStop(1, 'rgba(12,12,14,0)');
  g.fillStyle = centerStain; g.beginPath(); g.arc(512, 512, 190, 0, 7); g.fill();
  g.strokeStyle = 'rgba(12,12,14,0.22)'; g.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    const x0 = 512 + (rnd() - 0.5) * 220, y0 = 512 + (rnd() - 0.5) * 220;
    const ang = 0.55 + (rnd() - 0.5) * 0.4, len = 20 + rnd() * 55;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); g.stroke();
  }
  const t = tex(c, true, false);
  return t;
}

/** Small tiling noise for terrain micro detail. */
export function makeNoiseTexture(seed = 9, S = 256) {
  const c = cv(S, S), g = c.getContext('2d'), rnd = mulberry32(seed);
  const img = g.createImageData(S, S);
  const base = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) base[i] = rnd();
  // blur pass for softer grain
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += base[((y + dy + S) % S) * S + ((x + dx + S) % S)];
    const v = (s / 9) * 255 | 0, i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}
