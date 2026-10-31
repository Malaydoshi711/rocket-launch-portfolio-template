import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mission } from "../data/content";
import { PALETTE } from "./palette";
import { boosterLivery, brushed, carbonWeave, fairingLivery, foil, frostTex, heatRamp, regenTubes, solarCells, tankBump, upperLivery } from "./textures";

/* Two-stage launch vehicle, modelled procedurally.
   Units: 1 = about 5 m. y = 0 at the first stage nozzle exits.
   Static pieces that share a material are merged to keep draw calls low. */

export const R1 = 0.42;          // core radius
export const S1_TOP = 8.4;       // top of the interstage
export const S2_TOP = 10.62;     // top of the avionics ring
export const NOSE = 12.95;

type Piece = { geo: THREE.BufferGeometry; mat: THREE.Material };

/** Merge pieces that share a material into one mesh each. */
export function bake(pieces: Piece[], shadow = true) {
  const g = new THREE.Group();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of pieces) {
    const list = byMat.get(p.mat) ?? [];
    list.push(p.geo);
    byMat.set(p.mat, list);
  }
  byMat.forEach((geos, mat) => {
    const anyNon = geos.some((x) => !x.index);
    const norm = geos.map((x) => {
      let y = anyNon && x.index ? x.toNonIndexed() : x;
      // keep only the attributes every piece has
      for (const k of Object.keys(y.attributes)) if (!["position", "normal", "uv"].includes(k)) y.deleteAttribute(k);
      if (!y.attributes.uv) {
        y = y.clone();
        y.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(y.attributes.position.count * 2), 2));
      }
      return y;
    });
    const merged = norm.length === 1 ? norm[0] : mergeGeometries(norm, false)!;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    g.add(m);
  });
  return g;
}

const at = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(s, s, s),
  );
  return geo.applyMatrix4(m);
};

const lathe = (pts: [number, number][], segs = 48, phiStart = 0, phiLen = Math.PI * 2) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLen);

export type Mats = ReturnType<typeof makeMats>;

export function makeMats() {
  const s1Bump = tankBump([0.08, 0.36, 0.385, 0.62, 0.86, 0.975], [0.12, 0.165, 0.21, 0.255, 0.3, 0.43, 0.475, 0.52, 0.565, 0.66, 0.705, 0.75, 0.795, 0.9, 0.945], [0.25, 0.5, 0.75, 0.998]);
  const white = (map?: THREE.Texture, bump?: THREE.Texture) => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map, roughness: 0.38, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.22,
    bumpMap: bump ?? null, bumpScale: 0.55,
  });
  const weave = carbonWeave();
  const carbonMat = (rx: number, ry: number) => {
    const map = weave.map.clone(), bump = weave.bump.clone();
    map.repeat.set(rx, ry); bump.repeat.set(rx, ry);
    map.needsUpdate = bump.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({ color: 0xffffff, map, bumpMap: bump, bumpScale: 0.6, roughness: 0.42, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  };
  const brush = brushed();
  brush.repeat.set(2, 2);
  const tubes = regenTubes(60);
  const frost = (bands: [number, number, number][], seed: number) => new THREE.MeshStandardMaterial({
    map: frostTex(bands, seed), alphaTest: 0.03, roughness: 0.82, metalness: 0, color: 0xf4f8ff,
    emissive: 0x1a2230, emissiveIntensity: 0.6,
  });
  return {
    s1: white(boosterLivery(false), s1Bump),
    s1Soot: white(boosterLivery(true), s1Bump),
    s2: white(upperLivery(mission.vehicle, [0.12, 0.88])),
    fairFront: (() => { const m = white(fairingLivery(true)); m.side = THREE.DoubleSide; return m; })(),
    fairBack: (() => { const m = white(fairingLivery(false)); m.side = THREE.DoubleSide; return m; })(),
    carbon: carbonMat(40, 5),
    carbonLeg: carbonMat(1.5, 10),
    paintGrey: new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.55, metalness: 0.2 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.42, metalness: 0.85, roughnessMap: brush }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 0.32, metalness: 1.0, roughnessMap: brush }),
    titanium: new THREE.MeshStandardMaterial({ color: 0x5d6168, roughness: 0.5, metalness: 0.9, roughnessMap: brush }),
    // nozzle materials glow with heat while the engine runs; the first stage bells show their cooling tubes
    bell: new THREE.MeshStandardMaterial({ color: 0x2f3034, roughness: 0.36, metalness: 0.9, emissive: 0xffffff, emissiveMap: heatRamp(), emissiveIntensity: 0, side: THREE.DoubleSide, bumpMap: tubes, bumpScale: 0.9 }),
    mvac: new THREE.MeshStandardMaterial({ color: 0x3b3f47, roughness: 0.3, metalness: 0.95, emissive: 0xffffff, emissiveMap: heatRamp(), emissiveIntensity: 0, side: THREE.DoubleSide, roughnessMap: brush }),
    copper: new THREE.MeshStandardMaterial({ color: 0xa8643a, roughness: 0.35, metalness: 1.0, bumpMap: tubes, bumpScale: 0.6 }),
    foil: new THREE.MeshStandardMaterial({ color: 0xffffff, map: foil(), roughness: 0.28, metalness: 1.0 }),
    solar: new THREE.MeshStandardMaterial({ color: 0xffffff, map: solarCells(), roughness: 0.25, metalness: 0.4 }),
    blackBox: new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.6, metalness: 0.3 }),
    amber: new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: PALETTE.highlight, emissiveIntensity: 1.6 }),
    green: new THREE.MeshStandardMaterial({ color: 0x08200c, emissive: 0x4dff7a, emissiveIntensity: 2.2 }),
    // rime ice on the methane (lower) and oxygen (upper) tanks
    frost1: frost([[0.09, 0.355, 0.55], [0.39, 0.965, 0.92]], 3),
    frost2: frost([[0.05, 0.42, 0.95], [0.5, 0.95, 0.6]], 5),
  };
}

/** Cylinder from a to b. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8, r2 = r) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Grid fin: frame plus a true lattice of crossing plates clipped to the frame. */
function gridFinPieces(M: Mats, fw: number, fh: number): Piece[] {
  const out: Piece[] = [];
  const t = 0.018, d = 0.04;
  const frame = (w: number, h: number, x: number, y: number) => {
    const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    return at(g, x, y, 0);
  };
  out.push({ geo: frame(fw + t, t, 0, fh), mat: M.titanium }, { geo: frame(fw + t, t, 0, 0), mat: M.titanium });
  out.push({ geo: frame(t, fh, -fw / 2, fh / 2), mat: M.titanium }, { geo: frame(t, fh, fw / 2, fh / 2), mat: M.titanium });
  const step = 0.034;
  for (const s of [1, -1]) {
    // lines x*s - y = c, clipped to [-fw/2, fw/2] x [0, fh]
    for (let c = -fh - fw / 2 + step / 2; c < fw / 2; c += step) {
      const pts: THREE.Vector2[] = [];
      const yAt = (x: number) => x * s - c;
      const xAt = (y: number) => (y + c) * s;
      for (const x of [-fw / 2, fw / 2]) { const y = yAt(x); if (y >= 0 && y <= fh) pts.push(new THREE.Vector2(x, y)); }
      for (const y of [0, fh]) { const x = xAt(y); if (x > -fw / 2 && x < fw / 2) pts.push(new THREE.Vector2(x, y)); }
      if (pts.length < 2) continue;
      const [a, b] = pts;
      const len = a.distanceTo(b);
      if (len < 0.02) continue;
      out.push({ geo: at(new THREE.BoxGeometry(len, 0.0045, d * 0.92), (a.x + b.x) / 2, (a.y + b.y) / 2, 0, 0, 0, Math.atan2(b.y - a.y, b.x - a.x)), mat: M.titanium });
    }
  }
  // root fitting and actuator shaft
  out.push({ geo: at(new THREE.BoxGeometry(0.1, 0.05, 0.05), 0, -0.025, 0), mat: M.darkMetal });
  out.push({ geo: at(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 10), 0, -0.04, -0.02, Math.PI / 2), mat: M.steel });
  return out;
}

export type Rocket = ReturnType<typeof buildRocket>;

/** Builds the whole stack. Part groups can be repositioned independently for
 *  staging, the exploded view and the booster landing. */
export function buildRocket(M: Mats, opts: { sooty?: boolean; hi?: boolean } = {}) {
  const seg = opts.hi === false ? 36 : 72;
  const root = new THREE.Group();
  const stage1 = new THREE.Group();
  const stage2 = new THREE.Group();
  root.add(stage1, stage2);

  /* ---------- first stage engines: 7 bells, centre + ring of 6 ---------- */
  const hi = opts.hi !== false;
  const enginePieces: Piece[] = [];
  const bellProfile: [number, number][] = [
    [0.118, 0.0], [0.116, 0.025], [0.111, 0.06], [0.104, 0.11], [0.096, 0.16], [0.087, 0.215], [0.078, 0.27], [0.068, 0.325],
    [0.059, 0.375], [0.051, 0.415], [0.046, 0.442], [0.045, 0.46], [0.052, 0.48], [0.062, 0.5], [0.07, 0.53], [0.072, 0.56],
    [0.072, 0.61], [0.064, 0.635], [0.05, 0.65],
  ];
  const enginePos: [number, number][] = [[0, 0]];
  for (let i = 0; i < 6; i++) enginePos.push([Math.cos((i / 6) * Math.PI * 2 + 0.26) * 0.27, Math.sin((i / 6) * Math.PI * 2 + 0.26) * 0.27]);
  enginePos.forEach(([x, z], ei) => {
    enginePieces.push({ geo: at(lathe(bellProfile, hi ? 44 : 24), x, 0, z), mat: M.bell });
    // lip ring, regen manifold at the throat, injector dome
    enginePieces.push({ geo: at(new THREE.TorusGeometry(0.118, 0.007, 6, hi ? 40 : 24), x, 0.003, z, Math.PI / 2), mat: M.steel });
    enginePieces.push({ geo: at(new THREE.TorusGeometry(0.06, 0.012, 6, 20), x, 0.36, z, Math.PI / 2), mat: M.copper });
    enginePieces.push({ geo: at(new THREE.SphereGeometry(0.058, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), x, 0.645, z), mat: M.steel });
    if (!hi) return;
    // turbopump: housing, volute and gas-generator exhaust running down beside the bell
    const a = Math.atan2(z, x) + (ei ? 0.9 : 0);
    const px = x + Math.cos(a) * 0.085, pz = z + Math.sin(a) * 0.085;
    enginePieces.push({ geo: at(new THREE.CylinderGeometry(0.03, 0.034, 0.12, 12), px, 0.69, pz), mat: M.steel });
    enginePieces.push({ geo: at(new THREE.TorusGeometry(0.036, 0.012, 6, 16), px, 0.66, pz, Math.PI / 2), mat: M.darkMetal });
    enginePieces.push({ geo: rod(V(px, 0.64, pz), V(px + Math.cos(a) * 0.04, 0.3, pz + Math.sin(a) * 0.04), 0.011, 8), mat: M.darkMetal });
    // feed line from the pump into the chamber
    const feed = new THREE.CatmullRomCurve3([V(px, 0.74, pz), V((px + x) / 2, 0.78, (pz + z) / 2), V(x, 0.7, z)]);
    enginePieces.push({ geo: new THREE.TubeGeometry(feed, 8, 0.012, 6), mat: M.steel });
    // two gimbal actuators per engine, at right angles, from the chamber up into the thrust structure
    for (const k of [0, 1]) {
      const b2 = a + (k ? Math.PI / 2 : -Math.PI / 2) * 0.9;
      const lo = V(x + Math.cos(b2) * 0.075, 0.52, z + Math.sin(b2) * 0.075);
      const up = V(x + Math.cos(b2) * 0.11, 0.86, z + Math.sin(b2) * 0.11);
      const mid = lo.clone().lerp(up, 0.45);
      enginePieces.push({ geo: rod(lo, mid, 0.008, 6), mat: M.steel });
      enginePieces.push({ geo: rod(mid, up, 0.016, 8), mat: M.darkMetal });
    }
  });
  const engines = bake(enginePieces);
  engines.name = "engines";
  stage1.add(engines);

  /* ---------- thrust section: skirt, heat shield, TVC, leg housings ---------- */
  const thrustPieces: Piece[] = [
    { geo: lathe([[R1 + 0.035, 0.5], [R1 + 0.035, 0.56], [R1 + 0.012, 0.66], [R1, 0.98], [R1, 1.0]], seg), mat: M.carbon },
    { geo: at(new THREE.CylinderGeometry(R1 + 0.02, R1 + 0.02, 0.03, seg), 0, 0.6, 0), mat: M.darkMetal },
    // heat shield across the base, the bells pass through it
    { geo: at(new THREE.CylinderGeometry(R1 + 0.03, R1 + 0.03, 0.012, seg), 0, 0.505, 0), mat: M.blackBox },
  ];
  for (let i = 1; i < enginePos.length; i++) {
    const [x, z] = enginePos[i];
    thrustPieces.push({ geo: at(new THREE.CylinderGeometry(0.085, 0.085, 0.014, 20), x, 0.513, z), mat: M.darkMetal });
  }
  // bolt rings on the skirt flange (instanced as merged tiny boxes)
  for (let i = 0; i < (hi ? 64 : 24); i++) {
    const a = (i / (hi ? 64 : 24)) * Math.PI * 2;
    thrustPieces.push({ geo: at(new THREE.BoxGeometry(0.012, 0.012, 0.01), Math.sin(a) * (R1 + 0.038), 0.53, Math.cos(a) * (R1 + 0.038), 0, a, 0), mat: M.steel });
  }
  // leg housings and hinge clevises
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = Math.cos(a), cz = Math.sin(a);
    thrustPieces.push({ geo: at(new THREE.BoxGeometry(0.16, 0.12, 0.06), cx * (R1 + 0.02), 0.44, cz * (R1 + 0.02), 0, -a + Math.PI / 2, 0), mat: M.darkMetal });
    thrustPieces.push({ geo: at(new THREE.BoxGeometry(0.06, 0.05, 0.05), cx * (R1 + 0.015), 1.64, cz * (R1 + 0.015), 0, -a + Math.PI / 2, 0), mat: M.darkMetal });
  }
  const thrust = bake(thrustPieces);
  thrust.name = "thrust";
  stage1.add(thrust);

  // landing legs: tapered carbon A-frame, hinged at the base, stowed along the body
  const legs: THREE.Group[] = [];
  const legShape = new THREE.Shape();
  legShape.moveTo(-0.06, 0.02); legShape.lineTo(0.06, 0.02); legShape.lineTo(0.034, 1.28); legShape.lineTo(-0.034, 1.28); legShape.closePath();
  const legGeo = new THREE.ExtrudeGeometry(legShape, { depth: 0.036, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 1 });
  legGeo.translate(0, 0, 0.012);
  const legGeoPieces: Piece[] = [
    { geo: legGeo, mat: M.carbonLeg },
    // spine, upper tip cap, foot pad
    { geo: at(new THREE.BoxGeometry(0.018, 1.18, 0.012), 0, 0.64, 0.062), mat: M.paintGrey },
    { geo: at(new THREE.BoxGeometry(0.07, 0.2, 0.06), 0, 1.18, 0.03), mat: M.paintGrey },
    { geo: at(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 20), 0, 1.3, 0.03), mat: M.darkMetal },
    // hinge clevis and pin
    { geo: at(new THREE.CylinderGeometry(0.026, 0.026, 0.15, 12), 0, 0.02, 0.03, 0, 0, Math.PI / 2), mat: M.steel },
    // telescoping pusher strut lying in the leg's channel
    { geo: rod(V(0, 0.12, 0.06), V(0, 0.7, 0.064), 0.016, 8), mat: M.darkMetal },
    { geo: rod(V(0, 0.7, 0.064), V(0, 1.08, 0.066), 0.01, 8), mat: M.steel },
  ];
  const legProto = bake(legGeoPieces);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * (R1 + 0.03), 0.42, Math.sin(a) * (R1 + 0.03));
    pivot.rotation.y = -a + Math.PI / 2; // local +z points away from the body
    const hinge = new THREE.Group();
    hinge.add(legProto.clone());
    pivot.add(hinge);
    stage1.add(pivot);
    legs.push(hinge);
  }

  /* ---------- first stage tanks ---------- */
  const rw = -1.1; // raceway angle
  const tankPieces: Piece[] = [
    { geo: at(new THREE.CylinderGeometry(R1, R1, 6.4, seg, 1, true), 0, 4.2, 0), mat: opts.sooty ? M.s1Soot : M.s1 },
    // raceway carrying cables and pressurant lines, with clamp blocks along it
    { geo: at(new THREE.BoxGeometry(0.07, 6.2, 0.045), Math.cos(rw) * (R1 + 0.02), 4.2, Math.sin(rw) * (R1 + 0.02), 0, -rw + Math.PI / 2, 0), mat: M.paintGrey },
    // LOX vent port near the top, with a louvred cover
    { geo: at(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 12), Math.cos(0.9) * (R1 + 0.02), 7.15, Math.sin(0.9) * (R1 + 0.02), 0, -0.9, Math.PI / 2), mat: M.darkMetal },
    // tank domes (seen when the stack comes apart)
    { geo: lathe([[R1, 7.4], [R1 * 0.92, 7.5], [R1 * 0.7, 7.58], [R1 * 0.4, 7.63], [0, 7.645]], hi ? 40 : 20), mat: M.paintGrey },
    { geo: lathe([[0, 0.86], [R1 * 0.4, 0.875], [R1 * 0.7, 0.92], [R1 * 0.92, 0.98], [R1, 1.0]], hi ? 40 : 20), mat: M.paintGrey },
  ];
  for (let y = 1.3; y < 7.2; y += 0.38) {
    tankPieces.push({ geo: at(new THREE.BoxGeometry(0.09, 0.035, 0.05), Math.cos(rw) * (R1 + 0.024), y, Math.sin(rw) * (R1 + 0.024), 0, -rw + Math.PI / 2, 0), mat: M.darkMetal });
  }
  // a pressurant line running beside the raceway, standing off on brackets
  const pl = rw + 0.17;
  tankPieces.push({ geo: at(new THREE.CylinderGeometry(0.012, 0.012, 6.0, 8), Math.cos(pl) * (R1 + 0.025), 4.25, Math.sin(pl) * (R1 + 0.025)), mat: M.steel });
  // a ring of vent louvres in the interstage band
  for (let i = 0; i < 3; i++) {
    const a = 0.75 + i * 0.12;
    tankPieces.push({ geo: at(new THREE.BoxGeometry(0.075, 0.012, 0.016), Math.cos(a) * (R1 + 0.006), 7.05 - i * 0.022 - 0.03, Math.sin(a) * (R1 + 0.006), 0, -a + Math.PI / 2, 0), mat: M.blackBox });
  }
  const s1tank = bake(tankPieces);
  s1tank.name = "s1tank";
  stage1.add(s1tank);

  // rime ice shell on the cryogenic tanks (hidden on the display copy)
  const frost = new THREE.Group();
  frost.name = "frost";
  const f1 = new THREE.Mesh(at(new THREE.CylinderGeometry(R1 + 0.005, R1 + 0.005, 6.4, seg, 1, true), 0, 4.2, 0), M.frost1);
  f1.receiveShadow = true;
  frost.add(f1);
  stage1.add(frost);

  /* ---------- interstage + grid fins ---------- */
  const interPieces: Piece[] = [
    { geo: lathe([[R1, 7.4], [R1 + 0.004, 7.42], [R1 + 0.004, 8.36], [R1 - 0.01, 8.4], [R1 - 0.04, 8.4]], seg), mat: M.carbon },
    { geo: at(new THREE.TorusGeometry(R1 + 0.006, 0.006, 6, seg), 0, 7.43, 0, Math.PI / 2), mat: M.darkMetal },
    { geo: at(new THREE.TorusGeometry(R1 + 0.006, 0.005, 6, seg), 0, 8.35, 0, Math.PI / 2), mat: M.darkMetal },
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    // fin actuator housings above each fin root
    interPieces.push({ geo: at(new THREE.BoxGeometry(0.13, 0.16, 0.05), Math.cos(a) * (R1 + 0.022), 8.18, Math.sin(a) * (R1 + 0.022), 0, -a + Math.PI / 2, 0), mat: M.darkMetal });
    // cold-gas thruster pods between the fins
    const b2 = a + Math.PI / 4;
    interPieces.push({ geo: at(new THREE.BoxGeometry(0.08, 0.1, 0.04), Math.cos(b2) * (R1 + 0.018), 8.2, Math.sin(b2) * (R1 + 0.018), 0, -b2 + Math.PI / 2, 0), mat: M.blackBox });
  }
  const inter = bake(interPieces);
  inter.name = "interstage";
  stage1.add(inter);
  const fins: THREE.Group[] = [];
  const finProto = bake(gridFinPieces(M, 0.34, 0.3));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * (R1 + 0.02), 8.05, Math.sin(a) * (R1 + 0.02));
    pivot.rotation.y = -a + Math.PI / 2;
    const hinge = new THREE.Group();
    const f = finProto.clone();
    f.position.z = 0.025;
    hinge.add(f);
    pivot.add(hinge);
    inter.add(pivot);
    fins.push(hinge);
  }

  /* ---------- second stage ---------- */
  const mvacPieces: Piece[] = [
    { geo: lathe([[0.34, 7.48], [0.326, 7.55], [0.31, 7.62], [0.28, 7.71], [0.25, 7.8], [0.215, 7.89], [0.18, 7.98], [0.145, 8.06], [0.115, 8.12], [0.07, 8.22], [0.062, 8.25]], hi ? 72 : 40), mat: M.mvac },
    { geo: lathe([[0.062, 8.25], [0.085, 8.3], [0.09, 8.38], [0.07, 8.42]], 24), mat: M.copper },
    { geo: at(new THREE.TorusGeometry(0.34, 0.01, 6, hi ? 64 : 40), 0, 7.48, 0, Math.PI / 2), mat: M.steel },
    // stiffener bands on the radiatively cooled extension and the manifold where it bolts on
    { geo: at(new THREE.TorusGeometry(0.283, 0.005, 5, 56), 0, 7.7, 0, Math.PI / 2), mat: M.darkMetal },
    { geo: at(new THREE.TorusGeometry(0.218, 0.005, 5, 48), 0, 7.885, 0, Math.PI / 2), mat: M.darkMetal },
    { geo: at(new THREE.TorusGeometry(0.118, 0.014, 6, 32), 0, 8.115, 0, Math.PI / 2), mat: M.copper },
  ];
  // turbopump and actuators above the vacuum engine
  mvacPieces.push({ geo: at(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 12), 0.13, 8.33, 0), mat: M.steel });
  mvacPieces.push({ geo: rod(V(0.08, 8.2, 0.06), V(0.2, 8.38, 0.1), 0.012), mat: M.darkMetal });
  mvacPieces.push({ geo: rod(V(-0.06, 8.2, 0.08), V(-0.14, 8.38, 0.18), 0.012), mat: M.darkMetal });
  const mvac = bake(mvacPieces);
  mvac.name = "mvac";
  stage2.add(mvac);

  const s2Pieces: Piece[] = [
    { geo: lathe([[0.1, 8.4], [R1 - 0.02, 8.42], [R1, 8.46], [R1, 10.42]], seg), mat: M.s2 },
    { geo: at(new THREE.CylinderGeometry(R1 + 0.004, R1 + 0.004, 0.03, seg, 1, true), 0, 8.48, 0), mat: M.darkMetal },
    { geo: at(new THREE.BoxGeometry(0.06, 1.9, 0.04), Math.cos(rw) * (R1 + 0.018), 9.45, Math.sin(rw) * (R1 + 0.018), 0, -rw + Math.PI / 2, 0), mat: M.paintGrey },
    { geo: lathe([[R1, 10.42], [R1 * 0.85, 10.5], [R1 * 0.5, 10.56], [0, 10.58]], hi ? 40 : 20), mat: M.paintGrey },
  ];
  const s2tank = bake(s2Pieces);
  const f2 = new THREE.Mesh(at(new THREE.CylinderGeometry(R1 + 0.005, R1 + 0.005, 1.9, seg, 1, true), 0, 9.47, 0), M.frost2);
  stage2.add(f2);
  s2tank.name = "s2tank";
  stage2.add(s2tank);

  // avionics ring: boxes, antennas, harness
  const avPieces: Piece[] = [
    { geo: at(new THREE.CylinderGeometry(R1, R1, 0.2, seg, 1, true), 0, 10.52, 0), mat: M.darkMetal },
    { geo: at(new THREE.CylinderGeometry(R1 - 0.02, R1 - 0.02, 0.012, seg), 0, 10.62, 0), mat: M.titanium },
  ];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = R1 + 0.022;
    avPieces.push({ geo: at(new THREE.BoxGeometry(0.11, 0.12, 0.04), Math.cos(a) * r, 10.52, Math.sin(a) * r, 0, -a + Math.PI / 2, 0), mat: i % 3 ? M.blackBox : M.foil });
  }
  const avionics = bake(avPieces);
  avionics.name = "avionics";
  stage2.add(avionics);

  /* ---------- payload: a small spacecraft on a conical adapter ---------- */
  const payload = new THREE.Group();
  payload.name = "payload";
  stage2.add(payload);
  payload.add(bake([
    { geo: lathe([[R1 - 0.05, 10.62], [0.22, 10.82], [0.2, 10.84]], 32), mat: M.titanium },
  ]));
  const sat = new THREE.Group();
  sat.position.y = 11.2;
  payload.add(sat);
  sat.add(bake([
    { geo: new THREE.BoxGeometry(0.4, 0.5, 0.4), mat: M.foil },
    { geo: at(new THREE.BoxGeometry(0.41, 0.03, 0.41), 0, 0.26, 0), mat: M.blackBox },
    { geo: at(new THREE.BoxGeometry(0.41, 0.03, 0.41), 0, -0.26, 0), mat: M.blackBox },
    // dish antenna and feed
    { geo: at(lathe([[0.0, 0], [0.06, 0.008], [0.12, 0.03], [0.16, 0.06], [0.155, 0.064], [0.0, 0.006]], 24), 0, 0.29, 0), mat: M.paintGrey },
    { geo: at(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), 0, 0.36, 0), mat: M.steel },
    // star trackers
    { geo: at(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 10), 0.13, 0.3, 0.13, 0.3, 0, 0), mat: M.blackBox },
  ]));
  // two solar wings, three folded panels each
  const wings: { panels: THREE.Group[]; side: number }[] = [];
  for (const side of [1, -1]) {
    const panels: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
      const pg = new THREE.Group();
      pg.add(bake([
        { geo: new THREE.BoxGeometry(0.4, 0.46, 0.012), mat: M.solar },
        { geo: at(new THREE.BoxGeometry(0.4, 0.46, 0.004), 0, 0, -0.008), mat: M.paintGrey },
      ], false));
      sat.add(pg);
      panels.push(pg);
    }
    wings.push({ panels, side });
  }

  /* ---------- fairing halves ---------- */
  const fairProfile: [number, number][] = [
    [R1 + 0.005, 10.5], [R1 + 0.05, 10.6], [0.47, 10.68], [0.47, 11.6], [0.462, 11.8], [0.44, 12.0], [0.405, 12.2],
    [0.355, 12.4], [0.29, 12.58], [0.21, 12.74], [0.12, 12.86], [0.05, 12.93], [0.0, 12.95],
  ];
  const fairings: THREE.Group[] = [];
  for (const k of [0, 1]) {
    const half = new THREE.Group();
    // hinge at the base of the half's outer edge
    const geo = lathe(fairProfile, hi ? 64 : 32, k * Math.PI, Math.PI);
    // map v by height so the livery is not squashed onto the ogive
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (pos.getY(i) - 10.5) / (NOSE - 10.5));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, k === 0 ? M.fairFront : M.fairBack);
    m.castShadow = m.receiveShadow = true;
    half.add(m);
    stage2.add(half);
    fairings.push(half);
  }

  // amber navigation strobes (tiny emissive dots that bloom)
  const strobes = bake([
    { geo: at(new THREE.SphereGeometry(0.018, 8, 6), Math.cos(0.4) * (R1 + 0.01), 7.3, Math.sin(0.4) * (R1 + 0.01)), mat: M.amber },
    { geo: at(new THREE.SphereGeometry(0.014, 8, 6), Math.cos(0.4) * (R1 + 0.01), 1.2, Math.sin(0.4) * (R1 + 0.01)), mat: M.green },
  ], false);
  stage1.add(strobes);

  return {
    root, stage1, stage2, engines, enginePos, thrust, legs, s1tank, frost: [frost, f2] as THREE.Object3D[], interstage: inter, fins, mvac, s2tank, avionics, payload, sat, wings, fairings,
    /** fold / unfold: 0 = stowed, 1 = deployed */
    setLegs(v: number) { for (const l of legs) l.rotation.x = v * 2.0; },
    setFins(v: number) { for (const f of fins) f.rotation.x = v * (Math.PI / 2); },
    setWings(v: number) {
      for (const w of wings) {
        w.panels.forEach((p, i) => {
          // folded: stacked flat against the bus side; deployed: in a line
          const fold = new THREE.Vector3(w.side * (0.215 + i * 0.016), 0, 0);
          const open = new THREE.Vector3(w.side * (0.43 + i * 0.41), 0, 0);
          const e = THREE.MathUtils.clamp(v * 3 - i * 0.9, 0, 1);
          const k = e * e * (3 - 2 * e);
          p.position.lerpVectors(fold, open, k);
          // folded panels face sideways, open panels face +z
          p.rotation.set(0, (1 - k) * (w.side * Math.PI) / 2 + (i % 2 ? (1 - k) * Math.PI : 0), 0);
        });
      }
    },
    setFairing(open: number, drift: number) {
      fairings.forEach((h, k) => {
        const s = k === 0 ? 1 : -1;
        // rotate outward about the base edge, then drift away
        h.position.set(s * (R1 + 0.05 + drift * 3.5), 10.5 - drift * 1.5, drift * 0.6 * s);
        // once free, the halves tumble as they fall away
        h.rotation.set(drift * 0.45 * s, drift * 0.3, -s * open * 0.9 - s * drift * 0.55);
        h.children[0].position.set(-s * (R1 + 0.05), -10.5, 0);
      });
    },
  };
}
