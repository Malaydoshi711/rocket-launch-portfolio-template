import * as THREE from "three";
import { bake } from "./rocket";
import { concrete, contactShadow, groundTex, lampBank, landingPad } from "./textures";

/* The launch site at night: apron, launch mount, service tower with crew
   arm and umbilicals, floodlight masts with light shafts, lightning masts,
   a water tower, distant lights and the booster landing zone. */

export const MOUNT_TOP = 1.7;              // the vehicle's nozzle exits sit here
export const LZ = new THREE.Vector3(-26, 0, 22); // landing zone centre
export const LZ_TOP = 0.06;

type Piece = { geo: THREE.BufferGeometry; mat: THREE.Material };

const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  return g;
};

/** Box from a to b (a strut). */
function strut(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(t, len, t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

const beamFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uAmt;
  varying vec2 vUv; varying vec3 vN, vV;
  void main() {
    float along = clamp(vUv.y, 0.0, 1.0);
    float edge = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
    float a = pow(along, 2.6) * pow(edge, 2.0) * uAmt;
    gl_FragColor = vec4(uColor * a, clamp(a, 0.0, 1.0));
  }
`;
const beamVert = /* glsl */ `
  varying vec2 vUv; varying vec3 vN, vV;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export function buildPad(opts: { mobile: boolean }) {
  const env = new THREE.Group();

  const concreteMat = new THREE.MeshStandardMaterial({ map: concrete(), roughness: 0.92, metalness: 0 });
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 1, metalness: 0, color: 0x9aa4b0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5d636c, roughness: 0.55, metalness: 0.75 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.6, metalness: 0.7 });
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.62, metalness: 0.6 });
  const paleMat = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.6, metalness: 0.2 });
  const conc = new THREE.MeshStandardMaterial({ color: 0x6b7078, roughness: 0.9 });
  const red = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 3 });

  /* ---------- ground ---------- */
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2600, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  env.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), concreteMat);
  apron.rotation.x = -Math.PI / 2;
  apron.receiveShadow = true;
  env.add(apron);

  /* ---------- launch mount ---------- */
  const mountPieces: Piece[] = [];
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) mountPieces.push({ geo: box(0.5, 1.4, 0.5, x, 0.7, z), mat: conc });
  mountPieces.push({ geo: box(2.7, 0.3, 0.65, 0, 1.55, -1.02), mat: darkSteel });
  mountPieces.push({ geo: box(2.7, 0.3, 0.65, 0, 1.55, 1.02), mat: darkSteel });
  mountPieces.push({ geo: box(0.65, 0.3, 1.4, -1.02, 1.55, 0), mat: darkSteel });
  mountPieces.push({ geo: box(0.65, 0.3, 1.4, 1.02, 1.55, 0), mat: darkSteel });
  // sound suppression: a water ring main around the deck with risers and spray heads
  const ring = new THREE.TorusGeometry(1.75, 0.045, 8, 48);
  ring.rotateX(Math.PI / 2); ring.translate(0, 1.45, 0);
  mountPieces.push({ geo: ring, mat: paleMat });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    mountPieces.push({ geo: box(0.07, 0.4, 0.07, Math.cos(a) * 1.75, 1.62, Math.sin(a) * 1.75), mat: paleMat });
    mountPieces.push({ geo: box(0.16, 0.08, 0.1, Math.cos(a) * 1.68, 1.84, Math.sin(a) * 1.68, 0, -a, -0.5), mat: darkSteel });
  }
  // the deck's bolted top plates
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    mountPieces.push({ geo: box(0.05, 0.03, 0.05, Math.cos(a) * 1.15, 1.715, Math.sin(a) * 1.15), mat: steel });
  }
  // flame deflector: two inclined plates sending exhaust both ways along the trench
  mountPieces.push({ geo: box(1.2, 0.08, 1.2, 0.45, 0.35, 0, 0, 0, -0.6), mat: darkSteel });
  mountPieces.push({ geo: box(1.2, 0.08, 1.2, -0.45, 0.35, 0, 0, 0, 0.6), mat: darkSteel });
  // trench walls
  for (const s of [1, -1]) {
    mountPieces.push({ geo: box(7, 0.25, 0.18, s * 5.5, 0.12, -0.75), mat: conc });
    mountPieces.push({ geo: box(7, 0.25, 0.18, s * 5.5, 0.12, 0.75), mat: conc });
  }
  env.add(bake(mountPieces));
  // ambient occlusion pooled under the mount
  const shadowTex = contactShadow();
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: 0x000000, alphaMap: shadowTex, opacity: 0.85 }));
  ao.rotation.x = -Math.PI / 2; ao.position.y = 0.012; ao.renderOrder = 1;
  env.add(ao);

  // hold-down clamps: hooked arms over the skirt flange that swing open at release
  const clamps: THREE.Group[] = [];
  const clampProto = bake([
    { geo: box(0.2, 0.1, 0.2, 0, 0.05, 0), mat: darkSteel },
    { geo: box(0.08, 0.34, 0.11, -0.02, 0.24, 0), mat: steel },
    { geo: box(0.16, 0.06, 0.1, -0.08, 0.41, 0), mat: steel },
    { geo: box(0.05, 0.08, 0.1, -0.15, 0.37, 0), mat: steel },
    { geo: new THREE.CylinderGeometry(0.035, 0.035, 0.24, 10).rotateX(Math.PI / 2).translate(0.06, 0.1, 0), mat: paleMat },
  ]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * 0.62, MOUNT_TOP, Math.sin(a) * 0.62);
    pivot.rotation.y = -a; // local +x points outward
    const arm = new THREE.Group();
    arm.add(clampProto.clone());
    pivot.add(arm);
    env.add(pivot);
    clamps.push(arm);
  }
  /* ---------- service tower ---------- */
  const TX = -2.65, TZ = -0.7, W = 1.3, LV = 14, LH = 1.15;
  const towerPieces: Piece[] = [];
  const lampPieces: Piece[] = [];
  const warm = new THREE.MeshStandardMaterial({ color: 0x1a1408, emissive: 0xffd9a0, emissiveIntensity: 2.4 });
  const cx = [TX - W / 2, TX + W / 2], cz = [TZ - W / 2, TZ + W / 2];
  for (const x of cx) for (const z of cz) towerPieces.push({ geo: box(0.08, LV * LH, 0.08, x, (LV * LH) / 2, z), mat: towerMat });
  for (let l = 0; l <= LV; l++) {
    const y = l * LH;
    towerPieces.push({ geo: box(W, 0.05, 0.05, TX, y, cz[0]), mat: towerMat });
    towerPieces.push({ geo: box(W, 0.05, 0.05, TX, y, cz[1]), mat: towerMat });
    towerPieces.push({ geo: box(0.05, 0.05, W, cx[0], y, TZ), mat: towerMat });
    towerPieces.push({ geo: box(0.05, 0.05, W, cx[1], y, TZ), mat: towerMat });
    if (l < LV) {
      const y1 = y + LH, flip = l % 2 ? 1 : -1;
      // diagonals on all four faces, zig-zagging up the tower
      towerPieces.push({ geo: strut(new THREE.Vector3(flip > 0 ? cx[0] : cx[1], y, cz[0]), new THREE.Vector3(flip > 0 ? cx[1] : cx[0], y1, cz[0]), 0.035), mat: towerMat });
      towerPieces.push({ geo: strut(new THREE.Vector3(flip > 0 ? cx[0] : cx[1], y, cz[1]), new THREE.Vector3(flip > 0 ? cx[1] : cx[0], y1, cz[1]), 0.035), mat: towerMat });
      towerPieces.push({ geo: strut(new THREE.Vector3(cx[0], y, flip > 0 ? cz[0] : cz[1]), new THREE.Vector3(cx[0], y1, flip > 0 ? cz[1] : cz[0]), 0.035), mat: towerMat });
      towerPieces.push({ geo: strut(new THREE.Vector3(cx[1], y, flip > 0 ? cz[1] : cz[0]), new THREE.Vector3(cx[1], y1, flip > 0 ? cz[0] : cz[1]), 0.035), mat: towerMat });
    }
    if (l % 3 === 0 && l > 0) {
      towerPieces.push({ geo: box(W + 0.3, 0.04, W + 0.3, TX, y, TZ), mat: steel });
      // hand rails around the work platforms
      const e = (W + 0.3) / 2;
      for (const h of [0.22, 0.42]) {
        towerPieces.push({ geo: box(W + 0.3, 0.02, 0.02, TX, y + h, TZ - e), mat: paleMat });
        towerPieces.push({ geo: box(W + 0.3, 0.02, 0.02, TX, y + h, TZ + e), mat: paleMat });
        towerPieces.push({ geo: box(0.02, 0.02, W + 0.3, TX - e, y + h, TZ), mat: paleMat });
      }
      for (let k = 0; k < 5; k++) {
        const o = -e + (k / 4) * 2 * e;
        towerPieces.push({ geo: box(0.02, 0.42, 0.02, TX + o, y + 0.21, TZ - e), mat: paleMat });
        towerPieces.push({ geo: box(0.02, 0.42, 0.02, TX + o, y + 0.21, TZ + e), mat: paleMat });
      }
      lampPieces.push({ geo: box(0.12, 0.06, 0.05, TX + W / 2 + 0.1, y - 0.1, TZ + e), mat: warm });
      lampPieces.push({ geo: box(0.12, 0.06, 0.05, TX - W / 2 - 0.1, y - 0.1, TZ + e), mat: warm });
    }
    // gusset plates at each node
    if (l > 0 && l < LV) for (const x of cx) towerPieces.push({ geo: box(0.13, 0.13, 0.012, x, y, cz[1] + 0.04), mat: towerMat });
  }
  // cable trays and pipe runs down the tower face
  towerPieces.push({ geo: box(0.16, LV * LH, 0.05, TX + 0.2, (LV * LH) / 2, TZ + W / 2 + 0.06), mat: darkSteel });
  towerPieces.push({ geo: box(0.05, LV * LH, 0.05, TX - 0.25, (LV * LH) / 2, TZ + W / 2 + 0.08), mat: paleMat });
  towerPieces.push({ geo: box(0.04, LV * LH, 0.04, TX - 0.15, (LV * LH) / 2, TZ + W / 2 + 0.08), mat: steel });
  // zig-zag stair flights inside the tower
  for (let l = 0; l < LV; l++) {
    const y = l * LH, f = l % 2 ? 1 : -1;
    towerPieces.push({ geo: strut(new THREE.Vector3(TX + 0.25, y + 0.05, TZ + f * 0.3), new THREE.Vector3(TX + 0.25, y + LH - 0.05, TZ - f * 0.3), 0.14).scale(1, 1, 1), mat: steel });
  }
  // elevator shaft, roof crane and a pipe run
  towerPieces.push({ geo: box(0.4, LV * LH, 0.4, TX - 0.35, (LV * LH) / 2, TZ - 0.35), mat: darkSteel });
  towerPieces.push({ geo: box(0.08, 2.4, 0.08, TX, LV * LH + 1.2, TZ), mat: towerMat });
  towerPieces.push({ geo: box(2.6, 0.12, 0.12, TX + 0.6, LV * LH + 2.3, TZ), mat: towerMat });
  towerPieces.push({ geo: box(0.07, LV * LH, 0.07, TX + W / 2 + 0.08, (LV * LH) / 2, TZ + 0.3), mat: paleMat });
  env.add(bake(towerPieces));
  env.add(bake(lampPieces, false));
  const towerLight = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), red);
  towerLight.position.set(TX, LV * LH + 2.45, TZ);
  env.add(towerLight);

  // crew access arm (swings away before launch)
  const armPivot = new THREE.Group();
  armPivot.position.set(TX + W / 2, MOUNT_TOP + 10.95, TZ + 0.2);
  const armLen = Math.abs(armPivot.position.x) - 0.5;
  armPivot.add(bake([
    { geo: box(armLen, 0.06, 0.06, armLen / 2, 0.36, -0.18), mat: towerMat },
    { geo: box(armLen, 0.06, 0.06, armLen / 2, 0.36, 0.18), mat: towerMat },
    { geo: box(armLen, 0.06, 0.42, armLen / 2, 0, 0), mat: steel },
    { geo: box(0.6, 0.5, 0.5, armLen - 0.18, 0.26, 0.05), mat: paleMat },
    ...Array.from({ length: 5 }, (_, i) => ({ geo: box(0.03, 0.36, 0.03, (i + 0.5) * (armLen / 5), 0.18, 0.18), mat: towerMat })),
  ]));
  env.add(armPivot);

  // umbilical arms with hoses to each stage (drop away at liftoff)
  const umbilicals: THREE.Group[] = [];
  for (const y of [MOUNT_TOP + 7.0, MOUNT_TOP + 9.3]) {
    const pivot = new THREE.Group();
    pivot.position.set(TX + W / 2, y, TZ + 0.45);
    const reach = Math.abs(pivot.position.x) - 0.45;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(reach * 0.5, -0.35, 0.2), new THREE.Vector3(reach, -0.1, 0.45),
    ]);
    pivot.add(bake([
      { geo: box(reach * 0.6, 0.08, 0.08, reach * 0.3, 0.12, 0), mat: towerMat },
      { geo: new THREE.TubeGeometry(curve, 16, 0.035, 6), mat: darkSteel },
      { geo: new THREE.TubeGeometry(curve.clone(), 16, 0.02, 6).translate(0, 0.08, -0.05), mat: paleMat },
    ]));
    env.add(pivot);
    umbilicals.push(pivot);
  }

  /* ---------- floodlights ---------- */
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: lampBank(), emissiveIntensity: 2.2 });
  const floodSpots: THREE.SpotLight[] = [];
  const beams: THREE.ShaderMaterial[] = [];
  const lampMats = [lampMat];
  const floods: [number, number, number][] = [[11, 0, 9], [-10, 0, 10], [8, 0, -11]];
  const target = new THREE.Vector3(0, 7, 0);
  floods.forEach(([x, , z], i) => {
    const h = 6.5 + (i % 2) * 1.2;
    const head = new THREE.Vector3(x, h, z);
    const poles: Piece[] = [
      { geo: box(0.14, h, 0.14, x, h / 2, z), mat: towerMat },
      { geo: box(0.6, 0.2, 0.6, x, 0.1, z), mat: conc },
    ];
    env.add(bake(poles));
    const lamp = new THREE.Group();
    lamp.position.copy(head);
    lamp.lookAt(target);
    lamp.add(bake([{ geo: box(1.3, 0.75, 0.2, 0, 0, -0.06), mat: darkSteel }]));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.65), lampMat);
    face.position.z = 0.05;
    lamp.add(face);
    env.add(lamp);

    const spot = new THREE.SpotLight(0xffe2b8, 0, 0, 0.32, 0.65, 1.6);
    spot.position.copy(head).add(new THREE.Vector3(0, 0.1, 0));
    spot.target.position.copy(target).add(new THREE.Vector3(0, -1.2 + i * 1.2, 0));
    if (i === 0 && !opts.mobile) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.0004;
      spot.shadow.normalBias = 0.02;
      spot.shadow.camera.near = 4;
      spot.shadow.camera.far = 60;
      spot.shadow.radius = 3;
    }
    env.add(spot, spot.target);
    floodSpots.push(spot);

    // visible light shaft
    const len = head.distanceTo(target) * 0.85;
    // narrow at the lamp, widening toward the vehicle; lookAt points +z at it
    const geo = new THREE.CylinderGeometry(0.35, 2.6, len, 24, 1, true);
    geo.translate(0, -len / 2, 0);
    geo.rotateX(-Math.PI / 2);
    const bm = new THREE.ShaderMaterial({
      vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color("#ffdcae") }, uAmt: { value: 0 } },
    });
    const beam = new THREE.Mesh(geo, bm);
    beam.position.copy(head);
    beam.lookAt(target);
    beam.renderOrder = 3;
    env.add(beam);
    beams.push(bm);
  });

  /* ---------- lightning masts and catenary wire ---------- */
  const masts: [number, number][] = [[-8, -7], [7, -6.5], [1, -15]];
  const mastPieces: Piece[] = [];
  const tops = masts.map(([x, z]) => new THREE.Vector3(x, 22, z));
  masts.forEach(([x, z]) => {
    mastPieces.push({ geo: new THREE.CylinderGeometry(0.06, 0.16, 22, 8).translate(x, 11, z), mat: towerMat });
  });
  for (let i = 0; i < tops.length; i++) {
    const a = tops[i], b = tops[(i + 1) % tops.length];
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y -= 2.4;
    const c = new THREE.QuadraticBezierCurve3(a, mid, b);
    mastPieces.push({ geo: new THREE.TubeGeometry(c, 24, 0.012, 4), mat: darkSteel });
  }
  env.add(bake(mastPieces, false));
  tops.forEach((t) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), red); l.position.copy(t).setY(22.1); env.add(l); });

  /* ---------- water tower (sound suppression) ---------- */
  const wt = new THREE.Vector3(-30, 0, -34);
  const wtPieces: Piece[] = [
    { geo: new THREE.SphereGeometry(3, 24, 16).translate(wt.x, 15, wt.z), mat: paleMat },
    { geo: new THREE.CylinderGeometry(0.5, 0.5, 13, 10).translate(wt.x, 6.5, wt.z), mat: towerMat },
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    wtPieces.push({ geo: strut(new THREE.Vector3(wt.x + Math.cos(a) * 3.2, 0, wt.z + Math.sin(a) * 3.2), new THREE.Vector3(wt.x + Math.cos(a) * 2.2, 13.5, wt.z + Math.sin(a) * 2.2), 0.18), mat: towerMat });
  }
  env.add(bake(wtPieces, false));
  const wtl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), red);
  wtl.position.set(wt.x, 18.1, wt.z);
  env.add(wtl);

  /* ---------- distant lights ---------- */
  let distant: THREE.Points;
  {
    const n = opts.mobile ? 500 : 1100;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const clusters = Array.from({ length: 14 }, () => [r() * Math.PI * 2, 140 + r() * 900] as const);
    for (let i = 0; i < n; i++) {
      const [a0, d0] = clusters[i % clusters.length];
      const a = a0 + (r() - 0.5) * 0.12, d = d0 + (r() - 0.5) * 60;
      pos.set([Math.cos(a) * d, 0.4 + r() * 2, Math.sin(a) * d], i * 3);
      const w = r();
      col.set(w > 0.7 ? [0.9, 0.95, 1.0] : [1.0, 0.7 + w * 0.2, 0.4], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    distant = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
    env.add(distant);
  }

  /* ---------- landing zone ---------- */
  const lz = new THREE.Group();
  lz.position.copy(LZ);
  const lzPad = new THREE.Mesh(new THREE.CircleGeometry(5.5, 64), new THREE.MeshStandardMaterial({ map: landingPad(), roughness: 0.9 }));
  lzPad.rotation.x = -Math.PI / 2;
  lzPad.position.y = LZ_TOP;
  lzPad.receiveShadow = true;
  lz.add(lzPad);
  const lzShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTex, transparent: true, depthWrite: false, opacity: 0 }));
  lzShadow.rotation.x = -Math.PI / 2; lzShadow.position.y = LZ_TOP + 0.01; lzShadow.renderOrder = 1;
  lz.add(lzShadow);
  const lzSpots: THREE.SpotLight[] = [];
  for (const [x, z] of [[7, 5], [-6, 6]]) {
    lz.add(bake([{ geo: box(0.12, 5, 0.12, x, 2.5, z), mat: towerMat }]));
    const lamp = new THREE.Group();
    lamp.position.set(x, 5, z);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45), lampMat);
    f.position.z = 0.04;
    lamp.add(bake([{ geo: box(0.9, 0.55, 0.15, 0, 0, -0.04), mat: darkSteel }]), f);
    // lz has an identity world matrix here, so this aims in its local frame
    lamp.lookAt(new THREE.Vector3(0, 2, 0));
    lz.add(lamp);
    const sp = new THREE.SpotLight(0xffe2b8, 0, 0, 0.6, 0.7, 1.6);
    sp.position.set(x, 5.2, z);
    sp.target.position.set(0, 1.5, 0);
    lz.add(sp, sp.target);
    lzSpots.push(sp);
  }
  env.add(lz);

  return {
    env, armPivot, umbilicals, distant, floodSpots, beams, lampMats, lzSpots, towerLight, lzShadow, warm,
    /** 0 = clamped, 1 = released */
    setClamps(v: number) { clamps.forEach((c) => { c.rotation.z = -v * 0.75; }); },
    /** 0 = in place, 1 = retracted */
    setArm(v: number) { armPivot.rotation.y = v * 1.25; },
    setUmbilicals(v: number) { umbilicals.forEach((u, i) => { u.rotation.z = -v * (0.9 + i * 0.2); u.rotation.y = v * 0.4; }); },
  };
}
