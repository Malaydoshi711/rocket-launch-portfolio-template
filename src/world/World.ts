import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PALETTE } from "./palette";
import type { PartId } from "../data/content";
import { buildRocket, makeMats, type Rocket } from "./rocket";
import { buildPad, LZ, LZ_TOP, MOUNT_TOP } from "./pad";
import { R1 } from "./rocket";
import { Plume, ShimmerShader, Smoke, Sparks, glowSprite, vaporCone } from "./fx";
import { RE, buildClouds, buildEarth, buildOrbitRing, buildSkyDome, buildStars } from "./sky";
import { KEYS, P, altitude, clamp01, drift, lerp, pitch, ss, telemetry, type Key, type Telemetry } from "./story";

export type Label = { id: string; x: number; y: number; on: number };

const D = new THREE.Vector3(-26, 1, -4); // where the exploded vehicle floats
const PART_IDS: readonly PartId[] = ["payload", "avionics", "interstage", "tanks", "tvc", "engines"];

export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer?: EffectComposer;
  private bloom?: UnrealBloomPass;
  private raf = 0;
  private running = false;
  private t0 = performance.now();
  private lastT = 0;
  private dt = 1 / 60;
  private slowFrames = 0;
  private degraded = false;
  private target = 0;
  private p = 0;
  private intro = 1;
  private pointer = new THREE.Vector2();
  private ps = new THREE.Vector2();
  private highlight: string | null = null;
  private hl: Record<string, number> = {};
  private frameCost = 0;

  private rocket: Rocket;
  private display: Rocket;
  private displayGroup = new THREE.Group();
  private displayWobble = new THREE.Group();
  private displayMats: Record<string, THREE.MeshStandardMaterial[]> = {};
  private displayParts: Record<string, THREE.Object3D[]> = {};
  private pad: ReturnType<typeof buildPad>;
  private sky: ReturnType<typeof buildSkyDome>;
  private stars: THREE.Points;
  private clouds: ReturnType<typeof buildClouds>;
  private earth: ReturnType<typeof buildEarth>;
  private orbit: ReturnType<typeof buildOrbitRing>;
  private orbitGroup = new THREE.Group();
  private mats: ReturnType<typeof makeMats>;
  private plume1: Plume;
  private plume1b: Plume;
  private plume2: Plume;
  private smoke: Smoke;
  private vent: Smoke;
  private landSmoke: Smoke;
  private vapor: ReturnType<typeof vaporCone>;
  private flash: ReturnType<typeof glowSprite>;
  private sepPuff: ReturnType<typeof glowSprite>;
  private rcs: ReturnType<typeof glowSprite>[] = [];
  private sunGlow: ReturnType<typeof glowSprite>;
  private moonGlow: ReturnType<typeof glowSprite>;
  private hemi: THREE.HemisphereLight;
  private moon: THREE.DirectionalLight;
  private sun: THREE.DirectionalLight;
  private plumeLight: THREE.PointLight;
  private fog: THREE.FogExp2;
  // liftoff detail
  private enginePlumes: Plume[] = [];
  private trenchJets: Plume[] = [];
  private rcsJets: Plume[] = [];
  private sepMotors: ReturnType<typeof glowSprite>[] = [];
  private tea: ReturnType<typeof glowSprite>;
  private reentry: ReturnType<typeof glowSprite>;
  private sparks: Sparks;
  private deluge: Sparks;
  private ice: Sparks;
  private chill: Smoke;
  private dust: Smoke;
  private shimmer?: ShaderPass;
  private rim: THREE.DirectionalLight;
  private shake = 0;
  private time = 0;
  private v4 = new THREE.Vector3();

  // scratch objects (no per-frame allocation)
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private sunDir = new THREE.Vector3(1, 0, 0);
  private labels: Label[] = PART_IDS.map((id) => ({ id, x: 0, y: 0, on: 0 }));
  private shift = new THREE.Vector2();
  private fov = 40;

  onTelemetry?: (t: Telemetry, p: number) => void;
  onLabels?: (l: Label[], vis: number) => void;
  onBlack?: (v: number) => void;
  onDegrade?: () => void;

  constructor(canvas: HTMLCanvasElement, private opts: { mobile: boolean; reduce: boolean; adapt: boolean }) {
    const m = opts.mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !m, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, m ? 1.25 : 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !m;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 40000);

    // procedural environment light for reflections on paint and metal
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.08;
    this.fog = new THREE.FogExp2(0x0a1220, 0.006);
    this.scene.fog = this.fog;

    this.sky = buildSkyDome();
    this.scene.add(this.sky.mesh);
    this.stars = buildStars(m ? 1400 : 3000);
    this.scene.add(this.stars);
    this.moonGlow = glowSprite("#c9d6ff", 1.3);
    this.moonGlow.mesh.scale.setScalar(900);
    this.scene.add(this.moonGlow.mesh);
    this.sunGlow = glowSprite("#ffb46a", 0.8);
    this.sunGlow.mesh.scale.setScalar(5200);
    this.scene.add(this.sunGlow.mesh);

    this.hemi = new THREE.HemisphereLight(0x30466e, 0x07090d, 0.9);
    this.moon = new THREE.DirectionalLight(0xa9bbff, 0.55);
    this.moon.position.set(-5, 6, -6);
    this.sun = new THREE.DirectionalLight(0xffd6a8, 0);
    this.plumeLight = new THREE.PointLight(0xff9440, 0, 0, 1.8);
    // cool rim light from behind and to the right, to separate the vehicle from the night sky
    this.rim = new THREE.DirectionalLight(0x9fb6ff, 0.7);
    this.rim.position.set(8, 5, -10);
    this.scene.add(this.hemi, this.moon, this.sun, this.sun.target, this.plumeLight, this.rim);

    /* environment: pad, clouds (move with altitude) */
    this.pad = buildPad({ mobile: m });
    this.scene.add(this.pad.env);
    this.clouds = buildClouds(m ? 3 : 5);
    this.pad.env.add(this.clouds.group);
    this.earth = buildEarth(m ? 96 : 160);
    this.scene.add(this.earth.group);
    this.orbit = buildOrbitRing(RE + altitude(1));
    this.orbitGroup.add(this.orbit.line);
    this.scene.add(this.orbitGroup);

    /* vehicle */
    this.mats = makeMats();
    this.rocket = buildRocket(this.mats, { hi: !m });
    this.scene.add(this.rocket.root);

    this.plume1 = new Plume({ len: 9, r0: 0.38, r1: 0.9, exp: 0.7, diamond: 1, df: 6, soft: 1.2, coreFall: 6, tail: 0.45, gain: 2.2, speed: 4 });
    this.rocket.stage1.add(this.plume1.mesh);
    // a tight inner core for the white-hot look near the nozzles
    this.plume1b = new Plume({ len: 2.4, r0: 0.34, r1: 0.25, exp: 1, diamond: 1.4, df: 3, soft: 0.6, coreFall: 2.5, tail: 0.3, gain: 2.6, speed: 6 },
      { core: "#ffffff", mid: "#fff0d0", edge: "#ffb060" });
    this.rocket.stage1.add(this.plume1b.mesh);
    this.plume2 = new Plume({ len: 16, r0: 0.33, r1: 4.2, exp: 0.55, diamond: 0, df: 2, soft: 1.6, coreFall: 3, tail: 0.25, gain: 1.6, speed: 3 },
      { core: "#f2f6ff", mid: "#9fb8ff", edge: "#ff8a3a" });
    this.plume2.mesh.position.y = 7.48;
    this.rocket.stage2.add(this.plume2.mesh);

    // one small core plume per engine, lit in sequence at ignition (desktop only)
    if (!m) {
      const order = [0, 0.0016, 0.0032, 0.0048, 0.0016, 0.0032, 0.0048];
      this.rocket.enginePos.forEach(([x, z], i) => {
        const pl = new Plume({ len: 1.3, r0: 0.1, r1: 0.15, exp: 1, diamond: 1.8, df: 3.4, soft: 0.7, coreFall: 2.4, tail: 0.3, gain: 2.3, speed: 7 },
          { core: "#ffffff", mid: "#ffe2b0", edge: "#ff9a48" });
        pl.mesh.position.set(x, 0, z);
        pl.mesh.userData.delay = order[i];
        this.rocket.stage1.add(pl.mesh);
        this.enginePlumes.push(pl);
      });
    }
    // flame trench: the deflector throws the exhaust both ways along the trench
    for (const sgn of [1, -1]) {
      const j = new Plume({ len: 8, r0: 0.4, r1: 1.9, exp: 0.55, diamond: 0, df: 2, soft: 1.15, coreFall: 2.6, tail: 0.25, gain: 1.35, speed: 5 },
        { core: "#fff1d6", mid: "#ffa04a", edge: "#ff4e14" });
      j.mesh.position.set(sgn * 0.8, 0.38, 0);
      j.mesh.rotation.z = sgn * Math.PI / 2;
      this.pad.env.add(j.mesh);
      this.trenchJets.push(j);
    }
    // cold-gas thrusters on the booster's interstage
    for (const sgn of [1, -1]) {
      const j = new Plume({ len: 1.1, r0: 0.025, r1: 0.24, exp: 0.7, diamond: 0, df: 1, soft: 1.3, coreFall: 3, tail: 0.15, gain: 1.1, speed: 9 },
        { core: "#ffffff", mid: "#e4ecff", edge: "#a8bcdc" });
      j.mesh.position.set(sgn * (R1 + 0.03), 8.2, 0);
      j.mesh.rotation.z = sgn * Math.PI / 2;
      this.rocket.stage1.add(j.mesh);
      this.rcsJets.push(j);
    }
    // stage separation motors around the interstage
    for (let i = 0; i < 4; i++) {
      const g = glowSprite("#fff0d8", 1.6);
      const a = (i / 4) * Math.PI * 2;
      g.mesh.position.set(Math.cos(a) * (R1 + 0.05), 8.38, Math.sin(a) * (R1 + 0.05));
      g.mesh.scale.setScalar(0.9);
      this.rocket.root.add(g.mesh);
      this.sepMotors.push(g);
    }
    // igniter light-up just before the engines catch. This is a methalox vehicle, so there is no
    // TEA-TEB green flash (that belongs to kerosene engines): the spark torch igniters burn
    // methane and oxygen, which shows as a brief flickering blue-violet glow in each chamber
    this.tea = glowSprite("#8fa2ff", 1.1);
    this.scene.add(this.tea.mesh);
    // re-entry heating around the booster's base on the way down
    this.reentry = glowSprite("#ff7a2a", 0.9);
    this.reentry.mesh.position.set(0, 0.3, 0);
    this.rocket.stage1.add(this.reentry.mesh);

    // ignition sparks thrown out from under the engines
    this.sparks = new Sparks(m ? 220 : 520, { rate: 1.1, life: 1.1, origin: [0, MOUNT_TOP - 0.05, 0], ring: 0.25, radial: 4.5, vel: [0, 2.6, 0], velRand: [1.6, 2.2, 1.6], grav: -9, size: 0.055, color: "#fff4cc", color2: "#ff5a12", additive: true, floor: 0.05, drag: 0.6 }, 3);
    this.pad.env.add(this.sparks.mesh);
    // sound suppression water: spray heads around the deck aim inward and up
    this.deluge = new Sparks(m ? 260 : 760, { rate: 1.4, life: 0.95, origin: [0, 1.84, 0], ring: 1.68, radial: -2.6, vel: [0, 2.3, 0], velRand: [0.45, 0.7, 0.45], grav: -7.5, size: 0.05, color: "#e6eef8", color2: "#9fb2cc", floor: 1.7 }, 5);
    this.pad.env.add(this.deluge.mesh);
    // ice shed from the tanks as the vehicle shakes loose
    this.ice = new Sparks(m ? 120 : 360, { rate: 0.7, life: 1.7, origin: [0, 4.4, 0], ring: R1 + 0.01, spread: [0, 3.0, 0], radial: 0.7, vel: [0, -0.4, 0], velRand: [0.25, 0.3, 0.25], grav: -7, size: 0.05, color: "#f4f8ff", color2: "#c2d0e4" }, 9);
    this.rocket.stage1.add(this.ice.mesh);
    // engine chill-down: cold vapour rolling off the engine section before ignition
    this.chill = new Smoke(m ? 30 : 70, { mode: 1, stagger: 0, spread: 1.5, rise: -0.9, size: 0.3, rate: 0.25, flat: 0, dark: "#56627a", lit: "#c8d2e2", opacity: 0.34 }, 13);
    this.chill.origin(0, 0.15, 0.1, 0.1); this.chill.origin(1, -0.15, 0.15, -0.1); this.chill.origin(2, 0.1, 0.35, -0.2); this.chill.origin(3, -0.1, 0.3, 0.2);
    this.rocket.stage1.add(this.chill.mesh);
    // dust blown off the landing pad
    this.dust = new Smoke(m ? 40 : 100, { mode: 0, stagger: 0.4, spread: 15, rise: 0.8, size: 1.5, flat: 0.2, side: 0, dark: "#29251f", lit: "#94877a", opacity: 0.5 }, 17);
    this.dust.origin(0, 0, 0.2, 0); this.dust.origin(1, 0.8, 0.2, 0.4); this.dust.origin(2, -0.8, 0.2, -0.4); this.dust.origin(3, 0.3, 0.2, -0.8);
    this.scene.add(this.dust.mesh);

    this.vapor = vaporCone();
    this.vapor.mesh.position.y = 10.75;
    this.rocket.root.add(this.vapor.mesh);

    this.smoke = new Smoke(m ? 150 : 360, { mode: 0, stagger: 0.55, spread: 24, rise: 4.6, size: 3.0, flat: 0.32, side: 0.85, dark: "#151a22", lit: "#9aa3b3", opacity: 0.9, near: 12 }, 3);
    this.smoke.origin(0, 0, 0.6, 0); this.smoke.origin(1, 2.5, 0.4, 0); this.smoke.origin(2, -2.5, 0.4, 0); this.smoke.origin(3, 0, 1.2, 0);
    this.pad.env.add(this.smoke.mesh);
    this.vent = new Smoke(m ? 50 : 90, { mode: 1, stagger: 0, spread: 2.4, rise: -1.1, size: 0.42, rate: 0.14, flat: 0, dark: "#4a5566", lit: "#b7c1d1", opacity: 0.3 }, 7);
    this.scene.add(this.vent.mesh);
    this.landSmoke = new Smoke(m ? 60 : 110, { mode: 0, stagger: 0.5, spread: 12, rise: 2.5, size: 1.3, flat: 0.25, side: 0, dark: "#1c2129", lit: "#8a93a2", opacity: 0.5 }, 11);
    this.scene.add(this.landSmoke.mesh);

    this.flash = glowSprite("#ffd9a0", 0.6);
    this.scene.add(this.flash.mesh);
    this.sepPuff = glowSprite("#dfe8ff", 1.5);
    this.scene.add(this.sepPuff.mesh);
    for (let i = 0; i < 2; i++) {
      const r = glowSprite("#e8eeff", 2);
      r.mesh.scale.setScalar(0.9);
      this.rcs.push(r);
      this.rocket.stage1.add(r.mesh);
      r.mesh.position.set(i ? -0.55 : 0.55, 8.2, 0);
    }

    /* exploded view: a second copy with its own materials for highlighting */
    this.display = buildRocket(this.mats, { hi: !m });
    this.displayGroup.position.copy(D);
    // on tall phone screens the breakdown stands upright
    if (m) this.displayGroup.rotation.z = Math.PI / 2;
    this.displayGroup.add(this.displayWobble);
    this.displayWobble.add(this.display.root);
    this.display.root.rotation.z = -Math.PI / 2;
    this.scene.add(this.displayGroup);
    const d = this.display;
    // in the breakdown the legs travel with the thrust section
    d.legs.forEach((l) => d.thrust.add(l.parent!));
    const groups: Record<string, THREE.Object3D[]> = {
      payload: [d.payload, ...d.fairings], avionics: [d.avionics], interstage: [d.interstage],
      tanks: [d.s1tank, d.s2tank], tvc: [d.thrust], engines: [d.engines, d.mvac],
    };
    this.displayParts = groups;
    for (const id of PART_IDS) {
      this.displayMats[id] = [];
      for (const g of groups[id]) {
        g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
          if (mat.emissiveMap) { mat.emissiveMap = null; }
          mat.emissive = new THREE.Color(PALETTE.highlight);
          mat.emissiveIntensity = 0;
          mesh.material = mat;
          this.displayMats[id].push(mat);
        });
      }
      this.hl[id] = 0;
    }
    d.setLegs(0.15);
    d.setFins(1);
    d.root.traverse((o) => { o.castShadow = false; });
    d.frost.forEach((f) => (f.visible = false));

    if (!m) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.shimmer = new ShaderPass(ShimmerShader);
      this.shimmer.enabled = false;
      this.composer.addPass(this.shimmer);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.55, 0.5, 0.86);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
    this.apply(0, 0, true);
  }

  /* ---------------- inputs ---------------- */
  setProgress(p: number) { this.target = clamp01(p); }
  setIntro(v: number) { this.intro = v; }
  setPointer(x: number, y: number) { this.pointer.set(x, y); }
  setHighlight(id: string | null) { this.highlight = id; }
  get frameMs() { return this.frameCost; }
  get settled() { return Math.abs(this.target - this.p) < 0.0015; }

  /* ---------------- story → scene ---------------- */
  private keyToWorld(k: Key, which: "pos" | "look", out: THREE.Vector3) {
    const [x, y, z] = which === "pos" && this.opts.mobile && k.mpos ? k.mpos : k[which];
    out.set(x, y, z);
    if (k.f === "ground") out.add(this.pad.env.position);
    else if (k.f === "rocket") out.applyMatrix4(this.rocket.root.matrixWorld);
    else if (k.f === "display") out.applyMatrix4(this.displayGroup.matrixWorld);
    return out;
  }

  private placeCamera(p: number) {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = ss(a.p, b.p, p);
    this.keyToWorld(a, "pos", this.v1);
    this.keyToWorld(b, "pos", this.v2);
    this.camPos.lerpVectors(this.v1, this.v2, t);
    this.keyToWorld(a, "look", this.v1);
    this.keyToWorld(b, "look", this.v2);
    this.camLook.lerpVectors(this.v1, this.v2, t);
    const m = this.opts.mobile;
    const sa = (m ? a.mshift : a.shift) ?? [0, 0], sb = (m ? b.mshift : b.shift) ?? [0, 0];
    this.shift.set(lerp(sa[0], sb[0], t), lerp(sa[1], sb[1], t));
    this.fov = lerp(a.fov ?? 40, b.fov ?? 40, t);

    // cinematic intro: from a high aerial pass down to the hero framing
    if (this.intro < 1) {
      const e = 1 - Math.pow(1 - this.intro, 3);
      this.v1.set(46, 34, 52).add(this.pad.env.position);
      this.camPos.lerpVectors(this.v1, this.camPos, e);
      this.v2.set(0, 4, 0).add(this.pad.env.position);
      this.camLook.lerpVectors(this.v2, this.camLook, e);
    }
    // never dip under the ground on the pad scenes
    if (this.pad.env.visible) this.camPos.y = Math.max(this.camPos.y, this.pad.env.position.y + 0.8);
    // gentle pointer parallax
    const dist = this.camPos.distanceTo(this.camLook);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();
    this.v3.set(this.ps.x * dist * 0.025, this.ps.y * dist * 0.015, 0).applyQuaternion(this.camera.quaternion);
    this.camera.position.add(this.v3);
    // engine rumble: a small, fast, irregular shake while the engines are close
    if (this.shake > 0.001 && !this.opts.reduce) {
      const t = this.time, k = this.shake * dist * 0.0035;
      this.v3.set((Math.sin(t * 41) + Math.sin(t * 23.7) * 0.6) * k, (Math.cos(t * 37.3) + Math.sin(t * 29.1) * 0.5) * k, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.add(this.v3);
      this.v4.copy(this.camLook).addScaledVector(this.v3, 0.4);
      this.camera.lookAt(this.v4);
    } else this.camera.lookAt(this.camLook);

    const w = window.innerWidth, h = window.innerHeight;
    const aspect = w / h;
    // keep a minimum horizontal field of view on tall phone screens
    const minH = 30;
    const vMin = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(minH / 2)) / aspect) * 180) / Math.PI;
    this.camera.fov = Math.max(this.fov, vMin);
    this.camera.aspect = aspect;
    this.camera.setViewOffset(w, h, -this.shift.x * w, this.shift.y * h, w, h);
    this.camera.updateProjectionMatrix();
  }

  private apply(p: number, t: number, snap = false) {
    const R = this.rocket, pad = this.pad;
    const landing = p >= P.BLK1 - 0.008;
    const H = altitude(p);
    const dr = drift(p);

    /* ---- where things are ---- */
    if (!landing) {
      pad.env.position.set(-dr * 0.2, -(H + MOUNT_TOP), 0);
      R.root.position.set(0, 0, 0);
      R.root.rotation.set(0, 0, -pitch(p));
      // after insertion the stage coasts off, out of the breakdown shot
      R.root.position.x = ss(0.765, 0.84, p) * 70;
    } else {
      pad.env.position.set(-LZ.x, 0, -LZ.z);
      const k = ss(P.BLK1 - 0.004, P.TD, p);
      const yAlt = lerp(34, 0, 1 - Math.pow(1 - k, 2.2));
      R.root.position.set(Math.sin(t * 0.7) * 0.02 * (1 - k), LZ_TOP + 0.14 + yAlt, 0);
      R.root.rotation.set(0, 0, (1 - k) * 0.05);
    }
    R.root.updateMatrixWorld(true);
    const envY = pad.env.position.y;
    pad.env.visible = landing || H < 205;

    /* ---- staging ---- */
    const s1 = R.stage1;
    if (landing) {
      s1.visible = true;
      s1.position.set(0, 0, 0);
      s1.rotation.set(0, 0, 0);
      R.stage2.visible = false;
      R.setLegs(ss(0.962, 0.982, p));
      R.setFins(1);
    } else {
      R.stage2.visible = p < 0.845;
      const sep = clamp01((p - P.SEP) / (0.47 - P.SEP));
      const flip = ss(0.362, 0.44, p) * Math.PI;
      s1.visible = p < 0.475;
      // rotate about the stage's centre while falling back
      s1.rotation.set(0, 0, flip * 0.98);
      this.v1.set(0, 4.2, 0).applyEuler(s1.rotation);
      s1.position.set(-sep * 1.5, -(0.5 * ss(P.SEP, 0.36, p) + 26 * sep * sep) + 4.2, sep * 1.2).sub(this.v1);
      if (p < P.SEP) s1.position.set(0, 0, 0), s1.rotation.set(0, 0, 0);
      R.setLegs(0);
      R.setFins(ss(0.37, 0.4, p));
    }

    /* ---- fairing and payload ---- */
    const fo = ss(P.FAIR - 0.012, P.FAIR + 0.018, p);
    const fd = clamp01((p - P.FAIR) / 0.06);
    R.setFairing(fo, fd * fd * 2.2);
    R.fairings.forEach((f) => (f.visible = fd < 0.99));
    // the returning booster wears its soot
    const tankMesh = R.s1tank.children[0] as THREE.Mesh;
    const want = landing ? this.mats.s1Soot : this.mats.s1;
    if (tankMesh.material !== want) tankMesh.material = want;
    R.setWings(0);

    /* ---- pad hardware ---- */
    pad.setArm(ss(0.004, 0.026, p));
    pad.setUmbilicals(ss(P.LIFT - 0.004, P.LIFT + 0.01, p));

    /* ---- engines ---- */
    const s1on = landing ? ss(P.BLK1 - 0.004, P.BLK1 + 0.004, p) * (1 - ss(P.TD - 0.004, P.TD + 0.002, p))
      : ss(P.IGN + 0.002, P.IGN + 0.012, p) * (1 - ss(P.MECO - 0.004, P.MECO + 0.002, p));
    const s2on = landing ? 0 : ss(P.S2IGN, P.S2IGN + 0.01, p) * (1 - ss(P.SECO - 0.006, P.SECO, p));
    const flick = 0.92 + Math.sin(t * 47) * 0.04 + Math.sin(t * 31.3) * 0.04;
    const thin = ss(60, 420, H); // thinning air: the plume blooms outward
    if (landing) {
      this.plume1.set({ len: 4.2, r0: 0.11, r1: 0.42, exp: 0.9, diamond: 1.4, df: 5, soft: 1.1, coreFall: 5, tail: 0.4, gain: 2.4 });
      this.plume1b.set({ len: 1.1, r0: 0.1, r1: 0.06, diamond: 1.5, df: 2.5 });
    } else {
      this.plume1.set({ len: lerp(9, 22, thin), r0: 0.38, r1: lerp(0.95, 7.5, thin), exp: lerp(0.75, 0.45, thin), diamond: 1 - thin, soft: lerp(1.2, 2.2, thin), tail: lerp(0.45, 0.2, thin), gain: lerp(2.2, 1.3, thin) });
      this.plume1b.set({ len: lerp(2.4, 1.2, thin), r0: 0.34, r1: lerp(0.25, 0.6, thin), diamond: 1.4 * (1 - thin), df: 3 });
    }
    this.plume1.u.uAmt.value = s1on * flick;
    this.plume1b.u.uAmt.value = s1on * flick;
    this.plume1.mesh.visible = this.plume1b.mesh.visible = s1on > 0.001;
    this.plume2.u.uAmt.value = s2on * flick;
    this.plume2.mesh.visible = s2on > 0.001;
    this.plume1.u.uTime.value = this.plume1b.u.uTime.value = this.plume2.u.uTime.value = t;
    this.mats.bell.emissiveIntensity = s1on * 2.2;
    this.mats.mvac.emissiveIntensity = s2on * 2.6 + ss(P.SECO, P.SECO + 0.05, p) * (1 - ss(P.SECO + 0.05, 0.8, p)) * 1.2;

    // individual engines light centre first, then in opposite pairs
    const off = landing ? 1 - ss(P.TD - 0.004, P.TD + 0.002, p) : 1 - ss(P.MECO - 0.004, P.MECO + 0.002, p);
    this.enginePlumes.forEach((pl, i) => {
      const d0 = pl.mesh.userData.delay as number;
      const on = landing ? (i === 0 ? s1on : 0) : ss(P.IGN + d0, P.IGN + d0 + 0.0018, p) * off * (1 - thin);
      pl.u.uAmt.value = on * flick;
      pl.u.uTime.value = t + i * 0.37;
      pl.mesh.visible = on > 0.001;
    });

    // nozzle exit in world space
    const nozzle = this.v2.set(0, -0.2, 0).applyMatrix4(s1.matrixWorld);
    this.plumeLight.position.copy(nozzle);
    this.plumeLight.intensity = s1on * (landing ? 70 : 120 * (1 - thin * 0.9)) * flick;
    if (this.shimmer) {
      const amt = s1on * (1 - thin) * (landing ? 0.7 : 1);
      const u = this.shimmer.uniforms;
      this.v3.copy(nozzle).project(this.camera);
      this.v4.set(0, -4, 0).applyMatrix4(s1.matrixWorld).project(this.camera);
      const on = amt > 0.01 && this.v3.z < 1 && Math.abs(this.v3.x) < 1.6 && Math.abs(this.v3.y) < 1.6;
      this.shimmer.enabled = on;
      if (on) {
        const w = window.innerWidth, h = window.innerHeight;
        const lp = Math.hypot((this.v4.x - this.v3.x) * w / 2, (this.v4.y - this.v3.y) * h / 2);
        u.uC.value.set(lerp(this.v3.x, this.v4.x, 0.35) * 0.5 + 0.5, lerp(this.v3.y, this.v4.y, 0.35) * 0.5 + 0.5);
        u.uR.value.set(Math.max(0.03, (lp * 0.42) / w), Math.max(0.04, (lp * 0.65) / h));
        u.uAmt.value = amt;
        u.uTime.value = t;
      }
    }

    // ignition flash at the mount, then a staging puff
    const ign = ss(P.IGN, P.IGN + 0.006, p) * (1 - ss(P.LIFT + 0.01, 0.1, p));
    this.flash.mesh.position.copy(nozzle);
    this.flash.mesh.scale.setScalar(landing ? 5 : 8 + ign * 4);
    this.flash.u.uAmt.value = landing ? s1on * 0.6 * flick : ign * 0.85 * flick + s1on * 0.2 * (1 - thin);
    this.flash.mesh.visible = this.flash.u.uAmt.value > 0.002;
    const puff = ss(P.SEP - 0.002, P.SEP + 0.004, p) * (1 - ss(P.SEP + 0.006, P.SEP + 0.03, p));
    this.sepPuff.mesh.position.set(0, 8.3, 0).applyMatrix4(R.root.matrixWorld);
    this.sepPuff.mesh.scale.setScalar(2 + puff * 3);
    this.sepPuff.u.uAmt.value = puff * 0.9;
    this.sepPuff.mesh.visible = puff > 0.002;
    const rcsOn = !landing && p > 0.362 && p < 0.44;
    this.rcs.forEach((r, i) => { r.u.uAmt.value = rcsOn ? Math.max(0, Math.sin(t * 9 + i * 2.1)) * 0.35 : 0; r.mesh.visible = rcsOn; });
    this.rcsJets.forEach((j, i) => {
      const pulse = rcsOn ? Math.max(0, Math.sin(t * 9 + i * 2.1)) : 0;
      j.u.uAmt.value = pulse * 0.9; j.u.uTime.value = t; j.mesh.visible = pulse > 0.01;
    });
    this.sepMotors.forEach((g, i) => {
      const a = puff * (0.8 + 0.2 * Math.sin(t * 50 + i * 1.3));
      g.u.uAmt.value = a * 1.3; g.mesh.visible = a > 0.002 && !landing;
    });

    /* ---- liftoff details: igniter flash, sparks, deluge, ice, frost, clamps, trench ---- */
    const teaAmt = landing ? 0 : ss(P.IGN - 0.005, P.IGN - 0.002, p) * (1 - ss(P.IGN, P.IGN + 0.004, p));
    this.tea.mesh.position.copy(nozzle);
    this.tea.mesh.scale.setScalar(2.6 + teaAmt);
    this.tea.u.uAmt.value = teaAmt * (0.75 + 0.25 * Math.sin(t * 60));
    this.tea.mesh.visible = teaAmt > 0.002;
    const sp = landing ? 0 : ss(P.IGN - 0.005, P.IGN - 0.001, p) * (1 - ss(P.LIFT + 0.008, P.LIFT + 0.03, p));
    this.sparks.u.uAmt.value = sp; this.sparks.u.uTime.value = t; this.sparks.mesh.visible = sp > 0.002 && H < 30;
    const dl = landing ? 0 : ss(P.IGN - 0.018, P.IGN - 0.008, p) * (1 - ss(0.085, 0.11, p));
    this.deluge.u.uAmt.value = dl; this.deluge.u.uTime.value = t; this.deluge.mesh.visible = dl > 0.002 && H < 40;
    const ic = landing ? 0 : ss(P.LIFT - 0.004, P.LIFT + 0.002, p) * (1 - ss(P.LIFT + 0.03, P.LIFT + 0.055, p));
    this.ice.u.uAmt.value = ic; this.ice.u.uTime.value = t; this.ice.mesh.visible = ic > 0.002;
    const thaw = landing ? 1.01 : lerp(0.03, 1.01, ss(P.LIFT - 0.006, P.LIFT + 0.045, p));
    this.mats.frost1.alphaTest = this.mats.frost2.alphaTest = thaw;
    R.frost.forEach((f) => (f.visible = thaw < 1));
    const ch = landing ? 0 : (0.35 + 0.65 * ss(P.IGN - 0.022, P.IGN - 0.01, p)) * (1 - ss(P.IGN - 0.001, P.IGN + 0.004, p));
    this.chill.u.uAmt.value = ch; this.chill.u.uTime.value = t; this.chill.mesh.visible = ch > 0.002;
    pad.setClamps(landing ? 0 : ss(P.LIFT - 0.002, P.LIFT + 0.006, p));
    const tj = landing ? 0 : s1on * (1 - ss(3, 16, H));
    this.trenchJets.forEach((j, i) => { j.u.uAmt.value = tj * flick * 0.85; j.u.uTime.value = t + i; j.mesh.visible = tj > 0.002; });
    const re = landing ? 1 - ss(P.BLK1, 0.972, p) : 0;
    this.reentry.mesh.scale.setScalar(3.4);
    this.reentry.u.uAmt.value = re * (0.7 + 0.1 * Math.sin(t * 13));
    this.reentry.mesh.visible = re > 0.002;
    this.shake = landing ? s1on * 0.25 * (1 - ss(0.99, 1, p)) : s1on * (1 - ss(4, 45, H)) + ign * 0.4;
    this.time = t;

    /* ---- max-Q collar ---- */
    const vq = ss(0.205, 0.24, p) * (1 - ss(0.265, 0.29, p));
    this.vapor.u.uAmt.value = vq;
    this.vapor.u.uTime.value = t;
    this.vapor.mesh.visible = vq > 0.002;

    /* ---- smoke and vapour ---- */
    this.smoke.u.uT.value = clamp01((p - P.IGN) / 0.16);
    this.smoke.u.uAmt.value = ss(P.IGN, P.IGN + 0.01, p) * (landing ? 0 : 1);
    this.smoke.mesh.visible = !landing && p > P.IGN && H < 205;
    this.smoke.u.uTime.value = t;
    this.smoke.u.uGlowPos.value.copy(nozzle);
    this.smoke.u.uGlowR.value = 11;
    this.smoke.u.uGlow.value = s1on * (1 - ss(10, 40, H)) * 0.75;

    const ventAmt = landing ? ss(P.TD, P.TD + 0.004, p) : 1 - ss(P.IGN - 0.012, P.IGN + 0.004, p);
    this.vent.u.uAmt.value = ventAmt;
    this.vent.mesh.visible = ventAmt > 0.002;
    this.vent.u.uTime.value = t;
    if (landing) {
      const by = R.root.position.y;
      this.vent.origin(0, 0.3, by + 7.2, 0.3); this.vent.origin(1, -0.3, by + 6.4, 0.2);
      this.vent.origin(2, 0.4, by + 0.5, -0.3); this.vent.origin(3, -0.2, by + 3.0, 0.4);
    } else {
      this.vent.origin(0, 0.32, 7.15, 0.3); this.vent.origin(1, -0.3, 10.3, 0.25);
      this.vent.origin(2, -1.5, envY + 0.5, -0.1); this.vent.origin(3, 0.9, envY + 1.5, 0.8);
    }

    const ls = landing ? ss(0.966, 0.995, p) : 0;
    this.landSmoke.u.uT.value = clamp01((p - 0.966) / 0.034);
    this.landSmoke.u.uAmt.value = ls > 0 ? 1 - ss(P.TD, 1, p) * 0.55 : 0;
    this.landSmoke.mesh.visible = landing && p > 0.966;
    this.landSmoke.origin(0, 0, 0.4, 0); this.landSmoke.origin(1, 1, 0.3, 0.5); this.landSmoke.origin(2, -1, 0.3, -0.5); this.landSmoke.origin(3, 0, 0.3, 1);
    this.landSmoke.u.uTime.value = t;
    const du = landing ? ss(0.972, 0.978, p) * (1 - 0.4 * ss(P.TD, 1, p)) : 0;
    this.dust.u.uT.value = clamp01((p - 0.972) / 0.028);
    this.dust.u.uAmt.value = du; this.dust.u.uTime.value = t; this.dust.mesh.visible = du > 0.002;
    this.dust.u.uGlowPos.value.copy(nozzle); this.dust.u.uGlowR.value = 6; this.dust.u.uGlow.value = s1on * 0.6;
    const yAlt = R.root.position.y - LZ_TOP - 0.14;
    (pad.lzShadow.material as THREE.MeshBasicMaterial).opacity = landing ? 0.85 * (1 - ss(0, 14, yAlt)) : 0;
    pad.lzShadow.scale.setScalar(1 + yAlt * 0.08);
    this.landSmoke.u.uGlowPos.value.copy(nozzle);
    this.landSmoke.u.uGlow.value = s1on;

    /* ---- clouds ---- */
    this.clouds.group.visible = !landing && H > 40 && H < 520;
    if (this.clouds.group.visible) {
      for (const mat of this.clouds.mats) {
        mat.uniforms.uTime.value = t;
        mat.uniforms.uGlowPos.value.copy(nozzle);
        mat.uniforms.uGlow.value = s1on * (1 - ss(150, 320, H)) * 0.2;
        mat.uniforms.uAmt.value = ss(40, 110, H) * (1 - ss(380, 520, H));
        mat.uniforms.uOff.value.set(dr * 0.8, 0);
      }
    }

    /* ---- space: sky, earth, sun ---- */
    const space = landing ? 0 : ss(120, 420, H);
    this.sky.u.uSpace.value = space;
    const dip = Math.acos(RE / (RE + Math.max(H, 1)));
    const el = -dip + 0.012;
    this.sunDir.set(Math.cos(el) * 0.94, Math.sin(el), -Math.cos(el) * 0.34).normalize();
    this.sky.u.uSun.value.copy(this.sunDir);
    this.sky.u.uSunAmt.value = space;
    this.earth.u.uSun.value.copy(this.sunDir);
    const showEarth = !landing && H > 190;
    this.earth.group.visible = showEarth;
    this.earth.group.position.set(0, -(RE + H), 0);
    this.earth.group.rotation.set(0, 0, (dr * 4 + Math.max(0, p - 0.6) * 900) / RE + t * 0.00004);
    this.earth.u.uTime.value = t;
    this.earth.au.uAmt.value = ss(300, 520, H);
    this.orbitGroup.position.copy(this.earth.group.position);
    const ob = ss(0.715, 0.76, p) * (1 - ss(0.81, 0.845, p));
    this.orbit.mat.opacity = ob * 0.75;
    this.orbit.line.visible = ob > 0.002 && !landing;

    this.sun.intensity = space * 3.2;
    this.sun.position.copy(this.sunDir).multiplyScalar(100);
    this.sun.target.position.set(0, 0, 0);
    this.sunGlow.mesh.position.copy(this.sunDir).multiplyScalar(15000);
    this.sunGlow.u.uAmt.value = space * 0.85;
    this.sunGlow.mesh.visible = space > 0.01;
    this.moonGlow.mesh.position.set(-0.55, 0.42, -0.72).normalize().multiplyScalar(15000);
    this.moonGlow.u.uAmt.value = (1 - space) * 0.35;
    (this.stars.material as THREE.PointsMaterial).opacity = lerp(0.42, 1, space);
    this.scene.environmentIntensity = lerp(0.07, 0.14, space);
    this.hemi.intensity = lerp(0.85, 0.25, space);
    this.moon.intensity = lerp(0.5, 0.15, space);
    this.fog.density = landing ? 0.0055 : lerp(0.0062, 0, ss(10, 160, H));

    /* ---- floodlights (switch on during the intro) ---- */
    const lampsOn = (i: number) => ss(0.25 + i * 0.12, 0.33 + i * 0.12, this.intro);
    const nearPad = landing ? 1 : 1 - ss(60, 200, H);
    // the floods stutter as the pad shakes and the steam rolls past them
    const fl = landing ? 0 : ss(P.IGN, P.IGN + 0.006, p) * (1 - ss(P.LIFT + 0.03, 0.11, p));
    const flk = (i: number) => 1 - fl * 0.45 * Math.max(0, Math.sin(t * 37.1 + i * 2.1) * Math.sin(t * 13.3 + i * 0.7));
    pad.floodSpots.forEach((s, i) => { s.intensity = lampsOn(i) * nearPad * (landing ? 120 : 170) * flk(i); });
    pad.beams.forEach((b, i) => { b.uniforms.uAmt.value = lampsOn(i) * nearPad * (landing ? 0.04 : 0.07 * (1 - 0.9 * ss(P.IGN - 0.004, P.IGN + 0.012, p))); });
    this.pad.lampMats[0].emissiveIntensity = (0.2 + lampsOn(0) * 2.2) * flk(0);
    this.rim.intensity = (1 - space) * 0.7;
    pad.lzSpots.forEach((s) => { s.intensity = landing ? 90 : 0; });
    pad.towerLight.visible = Math.sin(t * 3) > 0.2;
    pad.distant.visible = landing || H < 40;

    /* ---- exploded view ---- */
    this.layoutDisplay(p, t, landing);

    /* ---- black cut between payload deploy and the landing ---- */
    const black = ss(P.BLK0 - 0.006, P.BLK0 + 0.004, p) * (1 - ss(P.BLK1 - 0.002, P.BLK1 + 0.01, p));
    this.onBlack?.(black);

    if (snap) this.placeCamera(p);
  }

  private layoutDisplay(p: number, t: number, landing: boolean) {
    const d = this.display;
    const vis = !landing && p > P.ASM0 - 0.01;
    this.displayGroup.visible = vis;
    if (!vis) { this.onLabels?.(this.labels, 0); return; }
    // exploded offsets along the vehicle axis, centred on the group
    const asm = (i: number) => ss(P.ASM0 + i * 0.006, P.ASM1 - (5 - i) * 0.004, p);
    const off = (o: THREE.Object3D, y: number, i: number, from: number) => {
      const k = asm(i);
      o.position.set(0, y, 0);
      o.position.x += (1 - k) * from * 0.6;
      o.position.y += (1 - k) * (i - 3) * 2.5;
      o.visible = k > 0.02;
    };
    const dep = ss(P.DEP0, P.DEP1, p);
    off(d.engines, -2.6, 0, -9); off(d.mvac, 2.0, 4, 6);
    off(d.thrust, -1.3, 1, 8);
    off(d.s1tank, 0, 2, -10); off(d.interstage, 1.3, 3, 9);
    off(d.s2tank, 2.0, 4, -8); off(d.avionics, 3.1, 5, 10);
    off(d.payload, 4.4 + dep * 2.8, 5, -12);
    d.payload.position.z = dep * 1.6;
    d.payload.rotation.set(0, 0, 0);
    d.sat.rotation.set(0, dep * 0.7, dep * 0.25);
    d.setWings(dep);
    d.setFairing(0.55 + dep * 0.4, 0.2 + dep * 2.5);
    d.fairings.forEach((f) => { f.position.y += d.payload.position.y - dep * 3; f.position.z -= dep * 4; f.visible = dep < 0.6 && asm(5) > 0.02; });
    d.stage1.position.set(0, 0, 0);
    d.root.position.set(-7.6, 0, 0);
    this.displayWobble.rotation.set(0.04 + Math.sin(t * 0.2) * 0.02, (this.opts.mobile ? 0 : -0.14) + Math.sin(t * 0.13) * 0.05, 0);

    // highlight the hovered part
    for (const id of PART_IDS) {
      const goal = this.highlight === id ? 1 : 0;
      this.hl[id] += (goal - this.hl[id]) * (1 - Math.exp(-this.dt * 8));
      for (const m of this.displayMats[id]) m.emissiveIntensity = this.hl[id] * 0.55;
    }

    // screen positions for the HTML labels (above each part)
    this.displayGroup.updateMatrixWorld(true);
    const lv = ss(P.ASM1 - 0.01, P.ASM1 + 0.004, p) * (1 - ss(P.DEP0 - 0.008, P.DEP0 + 0.004, p));
    const w = window.innerWidth, h = window.innerHeight;
    const anchorY: Record<string, number> = { payload: 11.4, avionics: 10.5, interstage: 7.9, tanks: 4.2, tvc: 0.75, engines: 0.3 };
    this.labels.forEach((L) => {
      const g = this.displayParts[L.id][0];
      // labels alternate above and below the stack so they never collide
      const k = PART_IDS.indexOf(L.id as (typeof PART_IDS)[number]);
      this.v1.set(this.opts.mobile ? 0.8 : k % 2 ? 0.8 : -0.8, anchorY[L.id], 0);
      g.parent!.localToWorld(this.v1.add(g.position));
      this.v1.project(this.camera);
      L.x = (this.v1.x * 0.5 + 0.5) * w;
      L.y = (-this.v1.y * 0.5 + 0.5) * h;
      L.on = lv;
    });
    this.onLabels?.(this.labels, lv);
  }

  /* ---------------- loop ---------------- */
  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const c0 = performance.now();
    const t = (c0 - this.t0) / 1000;
    const raw = Math.max(0.001, t - this.lastT);
    this.dt = Math.min(0.1, raw);
    this.lastT = t;
    if (this.opts.adapt && !this.degraded && t > 5) {
      // seconds spent in slow frames (under ~30 fps), decaying while frames are fast
      this.slowFrames = raw > 0.034 ? this.slowFrames + Math.min(raw, 0.5) : Math.max(0, this.slowFrames - raw * 0.5);
      if (this.slowFrames > 3) this.degrade();
    }
    // progress eases toward the scroll target (dt capped higher so slow frames still converge)
    const pdt = Math.min(0.25, raw);
    this.p += (this.target - this.p) * (this.opts.reduce ? 1 : 1 - Math.exp(-pdt * 3.2));
    // never interpolate through the black cut: jump across it
    if ((this.p < P.BLK0 && this.target > P.BLK1) || (this.p > P.BLK1 && this.target < P.BLK0)) this.p = this.target;
    if (Math.abs(this.target - this.p) < 1e-5) this.p = this.target;
    this.ps.lerp(this.pointer, 1 - Math.exp(-this.dt * 2.5));
    this.apply(this.p, t);
    this.placeCamera(this.p);
    this.onTelemetry?.(telemetry(this.p), this.p);
    const c1 = performance.now();
    this.frameCost += (c1 - c0 - this.frameCost) * 0.05;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };

  private degrade() {
    this.degraded = true;
    this.composer?.dispose();
    this.composer = undefined;
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.onDegrade?.();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now();
    this.lastT = 0;
    this.frame();
  }

  /** Compile shaders and render once behind the loader. */
  warm() {
    this.apply(this.target, 0, true);
    this.renderer.compile(this.scene, this.camera);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  /** Jump without easing (used for reduced motion and resizes). */
  snap() { this.p = this.target; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.setSize(w / 2, h / 2);
    for (const sp of [this.sparks, this.deluge, this.ice]) if (sp) sp.u.uScale.value = h * Math.min(window.devicePixelRatio, this.opts.mobile ? 1.25 : 1.5) * 0.9;
    this.placeCamera(this.p);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
    });
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
