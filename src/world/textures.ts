import * as THREE from "three";
import { mission } from "../data/content";
import { PALETTE, rgba } from "./palette";

const SN = (stage: string, n: string) => `S/N ${mission.vehicle}-${stage}-${n}`;

/* Procedural canvas textures: livery, concrete, foil, solar cells.
   Everything is drawn at runtime; no image files are downloaded. */

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function toTex(c: HTMLCanvasElement, srgb = true, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, seed: number, dark = true) {
  const r = rand(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = dark ? `rgba(40,45,55,${alpha * r()})` : `rgba(255,255,255,${alpha * r()})`;
    const s = 1 + r() * 2.5;
    g.fillRect(r() * w, r() * h, s, s);
  }
}

/** First stage body: u wraps the circumference (u=0 faces +z), v runs base to top. */
export function boosterLivery(sooty = false) {
  const W = 1024, H = 2048;
  const [c, g] = canvas(W, H);
  g.fillStyle = PALETTE.paint;
  g.fillRect(0, 0, W, H);
  // faint vertical streaks from the paint process
  const r = rand(7);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(120,128,140,${0.025 * r()})`;
    g.fillRect(r() * W, 0, 2 + r() * 10, H);
  }
  grain(g, W, H, 9000, 0.06, 3);
  // weld lines and tank domes (horizontal)
  g.strokeStyle = "rgba(70,78,92,0.55)";
  g.lineWidth = 2;
  for (const v of [0.08, 0.36, 0.385, 0.62, 0.86, 0.975]) {
    g.beginPath(); g.moveTo(0, H * (1 - v)); g.lineTo(W, H * (1 - v)); g.stroke();
  }
  g.strokeStyle = "rgba(70,78,92,0.25)";
  g.lineWidth = 1.5;
  for (let v = 0.12; v < 0.97; v += 0.045) {
    g.beginPath(); g.moveTo(0, H * (1 - v)); g.lineTo(W, H * (1 - v)); g.stroke();
  }
  // vertical seams
  g.strokeStyle = "rgba(70,78,92,0.35)";
  for (const u of [0.25, 0.5, 0.75, 1]) {
    g.beginPath(); g.moveTo(W * u - 1, 0); g.lineTo(W * u - 1, H); g.stroke();
  }
  // vertical wordmark, facing the camera side
  g.save();
  g.translate(W * 0.115, H * 0.52);
  g.rotate(-Math.PI / 2);
  g.fillStyle = PALETTE.ink;
  g.font = "800 132px 'Unbounded Variable', 'Arial Black', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  fitText(g, mission.wordmark, 132, H * 0.4);
  g.restore();
  // a thin amber band and the stage mark
  g.fillStyle = PALETTE.accent;
  g.fillRect(0, H * 0.075, W, 14);
  g.fillStyle = PALETTE.ink;
  g.font = "700 46px 'JetBrains Mono Variable', monospace";
  g.fillText(`${mission.vehicle}-${mission.booster}`, W * 0.07, H * 0.16);
  g.font = "600 26px 'JetBrains Mono Variable', monospace";
  g.fillText("LOX", W * 0.62, H * 0.2);
  g.fillText("CH4", W * 0.62, H * 0.63);
  // small warning chevrons near the base
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? PALETTE.ink : PALETTE.accent;
    g.fillRect(W * (0.32 + i * 0.012), H * 0.935, W * 0.012, 26);
  }
  // company mark above the wordmark, flag, stencils and access panels
  mark(g, W * 0.115, H * 0.255, 34, PALETTE.ink, PALETTE.accent);
  if (mission.flag) flag(g, W * 0.065, H * 0.215, 104, 68, mission.flag);
  stencils(g, W, H, [
    [0.05, 0.905, "LOX FILL / DRAIN"], [0.05, 0.917, "DO NOT OBSTRUCT"],
    [0.2, 0.89, "CAUTION  PRESSURIZED VESSEL"], [0.2, 0.902, "MEOP 4.1 BAR"],
    [0.31, 0.06, "NO STEP"], [0.56, 0.06, "NO STEP"], [0.81, 0.06, "NO STEP"],
    [0.06, 0.45, SN(mission.booster, "0117")], [0.62, 0.215, "GN2 PURGE"], [0.62, 0.645, "FILL 4.2 BAR"],
    [0.4, 0.372, "COMMON DOME  DO NOT DRILL"], [0.88, 0.5, "RACEWAY"],
  ]);
  for (const [u, v] of [[0.22, 0.83], [0.47, 0.83], [0.72, 0.83], [0.22, 0.55], [0.72, 0.55]] as [number, number][]) accessPanel(g, W * u, H * v, 46, 30);
  if (sooty) {
    const gr = g.createLinearGradient(0, H, 0, H * 0.45);
    gr.addColorStop(0, "rgba(28,24,22,0.92)");
    gr.addColorStop(0.35, "rgba(40,34,30,0.55)");
    gr.addColorStop(1, "rgba(40,34,30,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }
  return toTex(c, true, 8);
}

/** Second stage and fairing: wordmark across the front. */
export function upperLivery(text: string, lines: number[]) {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#eceef1";
  g.fillRect(0, 0, W, H);
  grain(g, W, H, 3000, 0.05, 11);
  g.strokeStyle = "rgba(70,78,92,0.45)";
  g.lineWidth = 2;
  for (const v of lines) { g.beginPath(); g.moveTo(0, H * (1 - v)); g.lineTo(W, H * (1 - v)); g.stroke(); }
  if (text) {
    g.fillStyle = PALETTE.ink;
    g.font = "800 64px 'Unbounded Variable', 'Arial Black', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.translate(W * 0.1, H * 0.5);
    fitText(g, text, 64, W * 0.17);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  stencils(g, W, H, [[0.2, 0.42, "LOX"], [0.2, 0.62, "CH4"], [0.36, 0.5, "NO STEP"], [0.62, 0.42, SN(mission.upper, "0042")]], 15);
  return toTex(c, true, 8);
}

/** Fairing half: u spans one half of the circumference. */
export function fairingLivery(front: boolean) {
  const W = 1024, H = 1024;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#eef0f3";
  g.fillRect(0, 0, W, H);
  grain(g, W, H, 4000, 0.045, front ? 5 : 6);
  // separation rail along both edges
  g.fillStyle = "#3a404a";
  g.fillRect(0, 0, 10, H);
  g.fillRect(W - 10, 0, 10, H);
  g.strokeStyle = "rgba(70,78,92,0.35)";
  g.lineWidth = 2;
  for (const v of [0.18, 0.42]) { g.beginPath(); g.moveTo(0, H * (1 - v)); g.lineTo(W, H * (1 - v)); g.stroke(); }
  // acoustic panel joints and a seam groove at the separation plane
  g.strokeStyle = "rgba(70,78,92,0.22)";
  g.lineWidth = 1.5;
  for (const u of [0.33, 0.66]) { g.beginPath(); g.moveTo(W * u, H * 0.45); g.lineTo(W * u, H); g.stroke(); }
  g.fillStyle = "rgba(20,23,28,0.9)";
  for (let y = 20; y < H; y += 34) { g.fillRect(14, y, 5, 5); g.fillRect(W - 19, y, 5, 5); }
  if (front) {
    mark(g, W * 0.21, H * 0.28, 40, PALETTE.ink, PALETTE.accent);
    stencils(g, W, H, [[0.42, 0.9, "NO STEP"], [0.06, 0.95, "SEP PLANE"], [0.42, 0.93, "PAYLOAD ACCESS DOOR"]], 18);
    accessPanel(g, W * 0.46, H * 0.86, 60, 44);
    g.save();
    g.translate(W * 0.21, H * 0.66);
    g.rotate(-Math.PI / 2);
    g.fillStyle = PALETTE.ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    fitText(g, mission.wordmark, 58, H * 0.36);
    g.restore();
    g.fillStyle = PALETTE.accent;
    g.fillRect(W * 0.3, H * 0.52, 16, H * 0.28);
  }
  return toTex(c, true, 8);
}

/** Emissive heat gradient along a nozzle (v = 0 exit, v = 1 throat). */
export function heatRamp() {
  const [c, g] = canvas(4, 256);
  const gr = g.createLinearGradient(0, 256, 0, 0);
  gr.addColorStop(0, "#000000");
  gr.addColorStop(0.35, "#2a0600");
  gr.addColorStop(0.7, "#b03a08");
  gr.addColorStop(1, "#ffb15a");
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  return toTex(c);
}

/** Launch pad apron: concrete slabs, stains, painted markings. */
export function concrete() {
  const S = 2048;
  const [c, g] = canvas(S, S);
  g.fillStyle = "#5d6168";
  g.fillRect(0, 0, S, S);
  const r = rand(21);
  // slab tone variation
  const n = 16;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = 0.9 + r() * 0.2;
    g.fillStyle = `rgba(${Math.round(92 * k)},${Math.round(97 * k)},${Math.round(104 * k)},1)`;
    g.fillRect((i * S) / n, (j * S) / n, S / n, S / n);
  }
  grain(g, S, S, 60000, 0.12, 9);
  grain(g, S, S, 20000, 0.06, 10, false);
  // soot and water stains around the mount
  for (let i = 0; i < 40; i++) {
    const x = S / 2 + (r() - 0.5) * S * 0.35, y = S / 2 + (r() - 0.5) * S * 0.35;
    const rad = 40 + r() * 220;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(20,20,22,${0.25 + r() * 0.25})`);
    gr.addColorStop(1, "rgba(20,20,22,0)");
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // expansion joints
  g.strokeStyle = "rgba(25,27,30,0.7)";
  g.lineWidth = 3;
  for (let i = 1; i < n; i++) {
    g.beginPath(); g.moveTo((i * S) / n, 0); g.lineTo((i * S) / n, S); g.stroke();
    g.beginPath(); g.moveTo(0, (i * S) / n); g.lineTo(S, (i * S) / n); g.stroke();
  }
  // flame trench (dark channel running along x)
  g.fillStyle = "#121315";
  g.fillRect(S * 0.555, S * 0.47, S * 0.3, S * 0.06);
  g.fillRect(S * 0.145, S * 0.47, S * 0.3, S * 0.06);
  // painted markings
  g.strokeStyle = rgba(PALETTE.accent, 0.8);
  g.lineWidth = 10;
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.2, 0, Math.PI * 2); g.stroke();
  g.setLineDash([60, 40]);
  g.lineWidth = 8;
  g.strokeStyle = "rgba(230,230,225,0.55)";
  g.strokeRect(S * 0.1, S * 0.1, S * 0.8, S * 0.8);
  g.setLineDash([]);
  return toTex(c, true, 8);
}

/** Landing zone: a ringed circle with a centre mark. */
export function landingPad() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  g.fillStyle = "#585c63";
  g.fillRect(0, 0, S, S);
  grain(g, S, S, 30000, 0.12, 31);
  const r = rand(4);
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (r() - 0.5) * S * 0.25, y = S / 2 + (r() - 0.5) * S * 0.25, rad = 60 + r() * 160;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, "rgba(18,18,20,0.4)");
    gr.addColorStop(1, "rgba(18,18,20,0)");
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.strokeStyle = "rgba(240,240,236,0.85)";
  g.lineWidth = 22;
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = rgba(PALETTE.accent, 0.9);
  g.lineWidth = 10;
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.34, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "rgba(240,240,236,0.85)";
  g.save();
  g.translate(S / 2, S / 2);
  for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.fillRect(-12, S * 0.06, 24, S * 0.16); }
  g.restore();
  return toTex(c, true, 8);
}

/** Gold multilayer insulation: crinkled foil as a colour map. */
export function foil() {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = "#b8862f";
  g.fillRect(0, 0, S, S);
  const r = rand(77);
  for (let i = 0; i < 900; i++) {
    const x = r() * S, y = r() * S, w = 10 + r() * 50, h = 6 + r() * 30;
    const l = r();
    g.fillStyle = l > 0.5 ? `rgba(255,222,140,${0.15 * r()})` : `rgba(90,55,10,${0.2 * r()})`;
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI); g.fillRect(-w / 2, -h / 2, w, h); g.restore();
  }
  return toTex(c);
}

/** Solar cells: dark blue tiles with silver busbars. */
export function solarCells() {
  const W = 512, H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#c9ccd2";
  g.fillRect(0, 0, W, H);
  const cols = 6, rows = 8, pad = 4;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = (i * W) / cols + pad, y = (j * H) / rows + pad;
    const w = W / cols - pad * 2, h = H / rows - pad * 2;
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, "#14244a");
    gr.addColorStop(1, "#0b1530");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(160,175,205,0.35)";
    g.fillRect(x + w * 0.33, y, 1.5, h);
    g.fillRect(x + w * 0.66, y, 1.5, h);
  }
  return toTex(c);
}

/** Ground beyond the pad: dark scrub with faint roads. */
export function groundTex() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  g.fillStyle = "#11161c";
  g.fillRect(0, 0, S, S);
  const r = rand(55);
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S, rad = 4 + r() * 40;
    g.fillStyle = r() > 0.5 ? `rgba(26,36,34,${0.5 * r()})` : `rgba(8,10,14,${0.5 * r()})`;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  return t;
}

/** Floodlight lamp bank face. */
export function lampBank() {
  const W = 256, H = 128;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#15171b";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    const x = 14 + i * 40, y = 14 + j * 38;
    const gr = g.createRadialGradient(x + 15, y + 14, 0, x + 15, y + 14, 18);
    gr.addColorStop(0, "#ffffff");
    gr.addColorStop(0.5, "#ffe9c4");
    gr.addColorStop(1, "#5a4a32");
    g.fillStyle = gr;
    g.fillRect(x, y, 30, 28);
  }
  return toTex(c);
}

/* ------------------------------------------------------------------ */
/* Detail helpers and extra maps                                       */
/* ------------------------------------------------------------------ */

/** Fictional company mark: a ring cut by a rising chevron. */
function mark(g: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string, accent: string) {
  g.save();
  g.translate(x, y);
  g.lineWidth = r * 0.16;
  g.strokeStyle = ink;
  g.beginPath(); g.arc(0, 0, r, Math.PI * 0.62, Math.PI * 2.38); g.stroke();
  g.fillStyle = accent;
  g.beginPath(); g.moveTo(-r * 0.55, r * 0.5); g.lineTo(0, -r * 0.75); g.lineTo(r * 0.55, r * 0.5); g.lineTo(0, r * 0.1); g.closePath(); g.fill();
  g.restore();
}

/** A small striped flag drawn upright (stripes top to bottom, optional centre wheel), from mission.flag. */
function flag(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: { stripes: string[]; wheel?: string }) {
  const n = Math.max(1, f.stripes.length);
  f.stripes.forEach((c, i) => { g.fillStyle = c; g.fillRect(x, y + (i * h) / n, w, h / n + 0.5); });
  if (f.wheel) {
    g.strokeStyle = f.wheel; g.lineWidth = 1.6;
    const cx = x + w / 2, cy = y + h / 2, r = h / 7;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
  }
  g.strokeStyle = "rgba(20,23,28,0.35)"; g.lineWidth = 1; g.strokeRect(x, y, w, h);
}

/** Draws a heavy display word centred at the origin, shrinking the font so it never exceeds maxW. */
function fitText(g: CanvasRenderingContext2D, text: string, size: number, maxW: number) {
  const font = (px: number) => `800 ${px}px 'Unbounded Variable', 'Arial Black', sans-serif`;
  g.font = font(size);
  const w = g.measureText(text).width;
  if (w > maxW) g.font = font(Math.max(12, Math.floor((size * maxW) / w)));
  g.fillText(text, 0, 0);
}

function stencils(g: CanvasRenderingContext2D, W: number, H: number, list: [number, number, string][], size = 17) {
  g.save();
  g.fillStyle = "rgba(20,23,28,0.82)";
  g.font = `700 ${size}px 'JetBrains Mono Variable', monospace`;
  g.textAlign = "left";
  g.textBaseline = "middle";
  for (const [u, v, t] of list) g.fillText(t, W * u, H * v);
  g.restore();
}

function accessPanel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.save();
  g.strokeStyle = "rgba(60,66,78,0.6)"; g.lineWidth = 1.5;
  g.strokeRect(x, y, w, h);
  g.fillStyle = "rgba(60,66,78,0.7)";
  for (const [a, b] of [[3, 3], [w - 6, 3], [3, h - 6], [w - 6, h - 6]]) g.fillRect(x + a, y + b, 3, 3);
  g.restore();
}

/** Height map for painted tank barrels (white = raised): weld seams, panel lines, rivet rows, faint oil-canning. */
export function tankBump(welds: number[], panels: number[], seams: number[], H = 2048) {
  const W = 1024;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#808080";
  g.fillRect(0, 0, W, H);
  const r = rand(17);
  for (let i = 0; i < 220; i++) {
    const x = r() * W, y = r() * H, rad = 30 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const l = r() > 0.5 ? 255 : 0;
    gr.addColorStop(0, `rgba(${l},${l},${l},0.05)`);
    gr.addColorStop(1, `rgba(${l},${l},${l},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // weld beads: raised line with a groove either side, plus rivet rows
  for (const v of welds) {
    const y = H * (1 - v);
    g.fillStyle = "#4a4a4a"; g.fillRect(0, y - 4, W, 8);
    g.fillStyle = "#c8c8c8"; g.fillRect(0, y - 1.5, W, 3);
    g.fillStyle = "#d8d8d8";
    for (let x = 4; x < W; x += 9) { g.fillRect(x, y - 9, 2.5, 2.5); g.fillRect(x + 4, y + 7, 2.5, 2.5); }
  }
  g.fillStyle = "#5e5e5e";
  for (const v of panels) g.fillRect(0, H * (1 - v) - 1, W, 2);
  for (const u of seams) {
    g.fillStyle = "#4e4e4e"; g.fillRect(W * u - 2, 0, 4, H);
    g.fillStyle = "#c0c0c0";
    for (let y = 6; y < H; y += 12) g.fillRect(W * u + 5, y, 2, 2);
  }
  const t = toTex(c, false, 8);
  return t;
}

/** Regeneratively cooled nozzle: hundreds of brazed tubes running along the bell (u wraps). */
export function regenTubes(tubes = 60) {
  const W = tubes * 8, H = 8;
  const [c, g] = canvas(W, H);
  for (let i = 0; i < tubes; i++) {
    const gr = g.createLinearGradient(i * 8, 0, i * 8 + 8, 0);
    gr.addColorStop(0, "#202020"); gr.addColorStop(0.5, "#f0f0f0"); gr.addColorStop(1, "#202020");
    g.fillStyle = gr; g.fillRect(i * 8, 0, 8, H);
  }
  const t = toTex(c, false, 4);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

/** Twill carbon-fibre weave. Returned as colour and height maps (tile with repeat). */
export function carbonWeave() {
  const S = 128, n = 8, cell = S / n;
  const [c, g] = canvas(S, S);
  const [hc, hg] = canvas(S, S);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const warp = ((i + j * 2) % 4) < 2; // 2/2 twill
    const x = i * cell, y = j * cell;
    const gr = warp ? g.createLinearGradient(x, y, x + cell, y) : g.createLinearGradient(x, y, x, y + cell);
    gr.addColorStop(0, "#1a1c20"); gr.addColorStop(0.5, warp ? "#3c4047" : "#2e3238"); gr.addColorStop(1, "#1a1c20");
    g.fillStyle = gr; g.fillRect(x, y, cell, cell);
    const hr = warp ? hg.createLinearGradient(x, y, x + cell, y) : hg.createLinearGradient(x, y, x, y + cell);
    hr.addColorStop(0, "#303030"); hr.addColorStop(0.5, "#e0e0e0"); hr.addColorStop(1, "#303030");
    hg.fillStyle = hr; hg.fillRect(x, y, cell, cell);
  }
  const map = toTex(c, true, 8), bump = toTex(hc, false, 8);
  for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return { map, bump };
}

/** Frost on the cryogenic tanks: plates of rime separated by cracks.
 *  Alpha holds a per-plate threshold so raising alphaTest makes plates fall
 *  off one by one. `bands` are [v0, v1, density] ranges along the tank. */
export function frostTex(bands: [number, number, number][], seed = 3) {
  const W = 256, H = 512;
  // raw RGBA (not a canvas): a canvas premultiplies alpha, so the colour under every crack
  // would be stored as black and bilinear filtering would draw dark outlines round each plate
  const data = new Uint8Array(W * H * 4);
  const r = rand(seed);
  // condensation streaks running down the rime (per column, applied below)
  const streak = new Float32Array(W * H);
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(r() * W), y0 = Math.floor(r() * H), len = 10 + r() * 60, k = 0.25 * r();
    for (let y = y0; y < Math.min(H, y0 + len); y++) streak[y * W + x] = k;
  }
  // jittered grid of plate seeds, wider than tall like real rime sheets
  const gx = 22, gy = 64;
  const pts: { x: number; y: number; k: number; b: number }[] = [];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) pts.push({ x: ((i + r()) / gx) * W, y: ((j + r()) / gy) * H, k: r(), b: r() });
  const cov = (v: number) => {
    let d = 0;
    for (const [a, b, den] of bands) d = Math.max(d, den * Math.min(1, Math.max(0, (v - a) / 0.03), Math.max(0, (b - v) / 0.03)));
    return d;
  };
  for (let y = 0; y < H; y++) {
    const v = 1 - y / H;
    const cv = cov(v);
    const cj = Math.floor((y / H) * gy);
    for (let x = 0; x < W; x++) {
      const ci = Math.floor((x / W) * gx);
      let d1 = 1e9, d2 = 1e9, best = pts[0], second = pts[0];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const jj = cj + dj; if (jj < 0 || jj >= gy) continue;
        const ii = (ci + di + gx) % gx;
        const p = pts[jj * gx + ii];
        let dx = Math.abs(p.x - x); dx = Math.min(dx, W - dx);
        const dy = p.y - y;
        const d = dx * dx + dy * dy * 4;
        if (d < d1) { d2 = d1; second = best; d1 = d; best = p; } else if (d < d2) { d2 = d; second = p; }
      }
      const gap = Math.sqrt(d2) - Math.sqrt(d1);
      // rime is one continuous crust: only some plate boundaries have opened into cracks
      // (always where a neighbouring plate has already fallen), the rest read as faint ridges
      const pairOpen = ((best.k * 7.13 + second.k * 7.13 + best.b * second.b * 3.1) % 1) < 0.32;
      const neighbourGone = second.k >= cv;
      const crack = gap < 1.1 && (pairOpen || neighbourGone);
      const ridge = gap < 2.4 ? 1 - gap / 2.4 : 0;
      // plates survive by a threshold; thin coverage means many plates are already bare
      const keep = best.k < cv;
      const a = crack || !keep ? 0 : Math.round(8 + (1 - best.k / Math.max(cv, 0.001)) * 247);
      const n = r();
      const l = 226 + best.b * 22 + n * 7 - ridge * 26;
      // rows run bottom to top in a DataTexture: v = 0 at the base of the tank
      const o = ((H - 1 - y) * W + x) * 4;
      const sk = streak[y * W + x];
      const R = (l - 8) * (1 - sk) + 170 * sk, G = (l - 2) * (1 - sk) + 185 * sk, B = (l + 12) * (1 - sk) + 205 * sk;
      data[o] = Math.min(255, R); data[o + 1] = Math.min(255, G); data[o + 2] = Math.min(255, B); data[o + 3] = a;
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter; // no mips: keeps the alpha test crisp
  t.generateMipmaps = false;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Soft radial shadow used for cheap contact shadows. */
export function contactShadow() {
  const S = 256;
  const [c, g] = canvas(S, S);
  // greyscale (used as an alphaMap, which reads the green channel)
  g.fillStyle = "#000"; g.fillRect(0, 0, S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, "rgb(220,220,220)");
  gr.addColorStop(0.35, "rgb(140,140,140)");
  gr.addColorStop(1, "rgb(0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return toTex(c, false, 1);
}

/** Brushed-metal roughness: fine streaks along u (tile it). */
export function brushed(seed = 41) {
  const W = 256, H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#7a7a7a";
  g.fillRect(0, 0, W, H);
  const r = rand(seed);
  for (let i = 0; i < 1400; i++) {
    const l = Math.round(90 + r() * 90);
    g.fillStyle = `rgba(${l},${l},${l},0.35)`;
    g.fillRect(r() * W, r() * H, 20 + r() * 120, 1);
  }
  const t = toTex(c, false, 8);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
