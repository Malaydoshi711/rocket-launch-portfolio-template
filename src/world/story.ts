/* The flight, as pure functions of story progress p (0 = on the pad,
   1 = booster back on the landing zone). Scrolling sets p; every visual
   state is derived from it, so scrubbing backwards is always consistent. */

export const P = {
  IGN: 0.03, LIFT: 0.058, MAXQ: 0.25, MECO: 0.345, SEP: 0.355, S2IGN: 0.405, FAIR: 0.655,
  SECO: 0.745, ASM0: 0.79, ASM1: 0.845, DEP0: 0.9, DEP1: 0.94, BLK0: 0.942, BLK1: 0.958, TD: 0.99,
};

/** where each section's scene sits on the story */
export const ROUTE_AT: Record<string, number> = {
  about: 0.12, experience: 0.25, featured: 0.38, projects: 0.525, research: 0.66, toolkit: 0.76, vehicle: 0.86, contact: 0.9,
};

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const ss = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Monotone cubic interpolation through a table of [p, value] rows. */
function table(rows: [number, number][]) {
  const n = rows.length;
  const m: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = rows[Math.max(0, i - 1)], next = rows[Math.min(n - 1, i + 1)];
    const d0 = i > 0 ? (rows[i][1] - prev[1]) / (rows[i][0] - prev[0]) : 0;
    const d1 = i < n - 1 ? (next[1] - rows[i][1]) / (next[0] - rows[i][0]) : 0;
    m.push(i === 0 || i === n - 1 || d0 * d1 <= 0 ? 0 : (2 * d0 * d1) / (d0 + d1));
  }
  return (x: number) => {
    if (x <= rows[0][0]) return rows[0][1];
    if (x >= rows[n - 1][0]) return rows[n - 1][1];
    let i = 0;
    while (x > rows[i + 1][0]) i++;
    const [x0, y0] = rows[i], [x1, y1] = rows[i + 1];
    const h = x1 - x0, t = (x - x0) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1];
  };
}

/** scene altitude of the vehicle above the pad (scene units) */
export const altitude = table([
  [0, 0], [P.LIFT, 0], [0.09, 2.5], [0.12, 11], [0.18, 62], [0.25, 168], [0.31, 300], [0.38, 420], [0.47, 520], [0.58, 600], [0.66, 640], [0.76, 700], [1, 700],
]);
/** horizontal travel used to drift the ground and clouds */
export const drift = table([[0, 0], [0.12, 0], [0.18, 6], [0.25, 40], [0.31, 120], [0.38, 300], [1, 300]]);
/** pitch over from vertical, radians */
export const pitch = table([[0, 0], [0.09, 0], [0.18, 0.12], [0.25, 0.3], [0.38, 0.75], [0.47, 0.95], [0.66, 1.25], [0.76, 1.47], [1, 1.47]]);

/** telemetry rows: p, mission seconds, altitude km, velocity m/s, downrange km, dynamic pressure kPa */
const T: [number, number, number, number, number, number][] = [
  [0, -10, 0, 0, 0, 0], [P.IGN, -3, 0, 0, 0, 0], [P.LIFT, 0, 0, 0, 0, 0], [0.12, 9, 0.09, 42, 0, 1.1],
  [0.18, 42, 3.6, 270, 1, 18.5], [0.25, 72, 12.1, 486, 6, 32.4], [0.31, 118, 38, 1290, 41, 8.2], [P.MECO, 154, 66, 2240, 84, 0.9],
  [0.38, 162, 71, 2235, 92, 0.4], [0.47, 178, 85, 2360, 118, 0.08], [0.58, 196, 98, 2690, 158, 0.02], [0.66, 206, 105, 2860, 181, 0],
  [0.72, 410, 182, 5900, 940, 0], [P.SECO, 522, 210, 7790, 1660, 0], [0.86, 570, 210, 7790, 2030, 0], [P.DEP1, 610, 210, 7790, 2340, 0], [P.BLK0, 612, 210, 7790, 2350, 0],
];
// the booster's landing, told after the cut (its own clock)
const TB: [number, number, number, number, number, number][] = [
  [P.BLK1, 441, 1.4, 260, 0.3, 0], [0.975, 452, 0.35, 70, 0.05, 0], [P.TD, 461, 0, 0, 0, 0], [1, 468, 0, 0, 0, 0],
];

export type Telemetry = { t: number; alt: number; vel: number; dr: number; q: number; phase: string; booster: boolean };

const rowAt = (rows: typeof T, p: number) => {
  if (p <= rows[0][0]) return rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (p <= rows[i][0]) {
      const a = rows[i - 1], b = rows[i];
      const k = (p - a[0]) / (b[0] - a[0]);
      return a.map((v, j) => v + (b[j] - v) * k) as typeof a;
    }
  }
  return rows[rows.length - 1];
};

export const PHASES: [number, string][] = [
  [0, "Terminal count"], [P.IGN, "Ignition"], [P.LIFT, "Liftoff"], [0.2, "Max-Q"], [0.3, "Ascent"], [P.MECO, "MECO"], [P.SEP, "Stage separation"],
  [P.S2IGN, "Second stage burn"], [0.63, "Fairing separation"], [0.7, "Second stage burn"], [P.SECO, "Orbit insertion"], [0.8, "Vehicle breakdown"],
  [P.DEP0, "Payload deploy"], [P.BLK1, "Booster landing"], [P.TD, "Touchdown"],
];

export function telemetry(p: number): Telemetry {
  const booster = p >= P.BLK1 - 0.004;
  const r = booster ? rowAt(TB, p) : rowAt(T, p);
  let phase = PHASES[0][1];
  for (const [at, name] of PHASES) if (p >= at) phase = name;
  return { t: r[1], alt: r[2], vel: r[3], dr: r[4], q: r[5], phase, booster };
}

/* ---------------- camera keys ---------------- */
export type Frame = "ground" | "rocket" | "world" | "display";
export type Key = {
  p: number; f: Frame; pos: [number, number, number]; look: [number, number, number]; fov?: number;
  shift?: [number, number]; mshift?: [number, number]; mpos?: [number, number, number];
};

// shift: fraction of the viewport to move the subject (x right, y up) so it
// sits in the space the text panel leaves free
export const KEYS: Key[] = [
  { p: 0, f: "ground", pos: [11.5, 3.6, 17.5], look: [0, 7.6, 0], fov: 40, shift: [0.17, 0], mshift: [0, 0.16] },
  { p: 0.036, f: "ground", pos: [11, 2.8, 16.8], look: [0, 6.8, 0], fov: 40, shift: [0.17, 0], mshift: [0, 0.16] },
  { p: 0.12, f: "ground", pos: [16, 2.2, 31], look: [0, 12.5, 0], fov: 42, shift: [0.22, 0], mshift: [0, 0.2] },
  { p: 0.18, f: "rocket", pos: [10, 3, 22], look: [0, 4, 0], fov: 40, shift: [0, 0], mshift: [0, 0.2] },
  { p: 0.25, f: "rocket", pos: [-12, 6.5, 21], look: [0, 5.5, 0], fov: 40, shift: [-0.27, 0], mshift: [0, 0.22] },
  { p: 0.32, f: "rocket", pos: [7, 7, 15], look: [0, 6, 0], fov: 40, shift: [0, 0], mshift: [0, 0.2] },
  { p: 0.38, f: "rocket", pos: [8, 11, 16], look: [0, 5, 0], fov: 40, shift: [0.22, 0], mshift: [0, 0.2] },
  { p: 0.43, f: "rocket", pos: [-5, 13.5, 13], look: [0, 8, 0], fov: 40, shift: [0, 0.1], mshift: [0, 0.22] },
  { p: 0.47, f: "rocket", pos: [-8, 15.5, 9], look: [0, 7, 0], fov: 42, shift: [0.14, 0.22], mshift: [0, 0.22] },
  { p: 0.58, f: "rocket", pos: [7.5, 14.5, 10], look: [0, 7.5, 0], fov: 42, shift: [0.14, 0.22], mshift: [0, 0.22] },
  { p: 0.66, f: "rocket", pos: [-8, 15.5, 10], look: [0, 11.4, 0], fov: 40, shift: [-0.27, 0], mshift: [0, 0.22] },
  { p: 0.76, f: "world", pos: [5.5, 3.4, 12.5], look: [10, 0.3, 0], fov: 40, shift: [0.21, 0], mshift: [0, 0.22] },
  { p: 0.8, f: "world", pos: [-22, 6, 36], look: [-26, 0, 0], fov: 40, shift: [0, 0.1], mshift: [0, 0.2] },
  { p: 0.86, f: "display", pos: [0, 1.2, 20.5], look: [0, 0.5, 0], fov: 40, shift: [0, 0.2], mshift: [0, 0.2], mpos: [0, 1.2, 50] },
  { p: 0.905, f: "display", mpos: [8.5, 1.6, 13], mshift: [0, 0.3], pos: [7.2, 1.6, 9], look: [10.4, 0.2, 1.5], fov: 40, shift: [0.26, 0] },
  { p: 0.95, f: "display", mpos: [9.5, 1.2, 11], mshift: [0, 0.3], pos: [8.8, 1.2, 7.5], look: [11.3, 0.1, 1.8], fov: 40, shift: [0.24, 0] },
  { p: 0.9501, f: "rocket", pos: [4, 0, 20], look: [0, 4.5, 0], fov: 42, shift: [0.2, 0], mshift: [0, 0.3], mpos: [4, 0, 30] },
  { p: 0.975, f: "rocket", pos: [3.6, 1.6, 16], look: [0, 4.2, 0], fov: 42, shift: [0.2, 0], mshift: [0, 0.27], mpos: [3.5, 2.4, 37] },
  { p: 1, f: "world", pos: [3.2, 2.1, 13.5], look: [0, 4.6, 0], fov: 42, shift: [0.2, 0], mshift: [0, 0.27], mpos: [3, 3, 37] },
];
