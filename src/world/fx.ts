import * as THREE from "three";

/* Shader effects: exhaust plume, billowing smoke and vapour, the max-Q
   condensation collar and soft glow sprites. All alpha/pow inputs are
   clamped so no pixel can go NaN (bloom would spread it into a blob). */

export const NOISE = /* glsl */ `
  float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

/* ------------------------------------------------------------------ */
/* Plume                                                               */
/* ------------------------------------------------------------------ */
const plumeVert = /* glsl */ `
  uniform float uLen, uR0, uR1, uExp, uDiamond, uDF;
  varying float vV;
  varying vec3 vN, vView, vW;
  void main() {
    vec3 p = position;
    float v = clamp(-p.y, 0.0, 1.0);
    float r = mix(uR0, uR1, pow(max(v, 0.0), max(uExp, 0.05)));
    r *= 1.0 + uDiamond * 0.1 * sin(v * uDF * 6.2831853) * (1.0 - v);
    vec3 q = vec3(p.x * r, -v * uLen, p.z * r);
    vV = v;
    vec4 w = modelMatrix * vec4(q, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * vec3(p.x, 0.0, p.z));
    vView = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const plumeFrag = /* glsl */ `
  uniform float uTime, uAmt, uGain, uSoft, uCoreFall, uDiamond, uDF, uTail, uLen, uSpeed;
  uniform vec3 uCore, uMid, uEdge;
  varying float vV;
  varying vec3 vN, vView, vW;
  ${NOISE}
  void main() {
    float rim = clamp(abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0);
    float body = pow(rim, max(uSoft, 0.1));
    float core = exp(-vV * uCoreFall);
    float wave = sin(vV * uDF * 6.2831853 - 1.3);
    float dia = uDiamond * smoothstep(0.6, 1.0, wave) * (1.0 - smoothstep(0.0, 0.55, vV));
    float n = fbm(vec3(vW.x * 2.2, vV * uLen * 1.4 - uTime * uSpeed, vW.z * 2.2));
    float fade = (1.0 - smoothstep(uTail, 1.0, vV)) * smoothstep(0.0, 0.015, vV);
    vec3 col = mix(uEdge, uMid, clamp(core * 1.4 + rim * 0.2, 0.0, 1.0));
    col = mix(col, uCore, clamp(core * rim * 1.2, 0.0, 1.0));
    col += uCore * dia * rim * 2.2;
    float a = body * fade * (0.45 + 0.75 * n) * uAmt + dia * rim * rim * 0.35 * uAmt;
    a = clamp(a, 0.0, 1.0);
    gl_FragColor = vec4(col * uGain * a, a);
  }
`;

export type PlumeLook = {
  len: number; r0: number; r1: number; exp: number; diamond: number; df: number;
  soft: number; coreFall: number; tail: number; gain: number; speed: number;
};

/** Exhaust plume. Default colours are for a methalox engine: little soot, so the flame is paler
 *  and slightly rosy compared with a kerosene plume. */
export class Plume {
  mesh: THREE.Mesh;
  u: Record<string, THREE.IUniform>;
  constructor(look: PlumeLook, colors = { core: "#fff8f0", mid: "#ffc488", edge: "#ff6a44" }) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 32, 40, true);
    geo.translate(0, -0.5, 0);
    this.u = {
      uTime: { value: 0 }, uAmt: { value: 0 },
      uLen: { value: look.len }, uR0: { value: look.r0 }, uR1: { value: look.r1 }, uExp: { value: look.exp },
      uDiamond: { value: look.diamond }, uDF: { value: look.df }, uSoft: { value: look.soft }, uCoreFall: { value: look.coreFall },
      uTail: { value: look.tail }, uGain: { value: look.gain }, uSpeed: { value: look.speed },
      uCore: { value: new THREE.Color(colors.core) }, uMid: { value: new THREE.Color(colors.mid) }, uEdge: { value: new THREE.Color(colors.edge) },
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: plumeVert, fragmentShader: plumeFrag, uniforms: this.u,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }
  set(look: Partial<PlumeLook>) {
    const map: Record<string, string> = { len: "uLen", r0: "uR0", r1: "uR1", exp: "uExp", diamond: "uDiamond", df: "uDF", soft: "uSoft", coreFall: "uCoreFall", tail: "uTail", gain: "uGain", speed: "uSpeed" };
    for (const k in look) this.u[map[k]].value = look[k as keyof PlumeLook];
  }
}

/* ------------------------------------------------------------------ */
/* Smoke / vapour: camera-facing instanced billboards                   */
/* ------------------------------------------------------------------ */
const smokeVert = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uT, uTime, uMode, uStagger, uSpread, uRise, uSize, uAmt, uRate, uFlat, uSide, uNear;
  uniform vec3 uOrigin[4];
  uniform vec3 uGlowPos;
  uniform float uGlowR;
  varying vec2 vUv;
  varying float vAlpha, vGlow, vSeed, vAge;
  varying vec3 vL, vUp;
  void main() {
    float age;
    if (uMode < 0.5) age = clamp((uT - aSeed.x * uStagger) / max(0.001, 1.0 - uStagger), 0.0, 1.0);
    else age = fract(uTime * uRate * (0.7 + aSeed.w * 0.6) + aSeed.x);
    int idx = int(floor(aSeed.y * 3.999));
    vec3 o = uOrigin[0];
    if (idx == 1) o = uOrigin[1]; else if (idx == 2) o = uOrigin[2]; else if (idx == 3) o = uOrigin[3];
    float ang = aSeed.y * 6.2831853 * 7.0 + aSeed.z * 3.0;
    vec3 dir = vec3(cos(ang), 0.0, sin(ang));
    // optional bias toward the two flame trench exits (+x and -x)
    float s = aSeed.z > 0.5 ? 1.0 : -1.0;
    dir = normalize(mix(dir, vec3(s, 0.0, (aSeed.w - 0.5) * 0.9), uSide));
    float out_ = 1.0 - pow(max(1.0 - age, 0.0), 2.4);
    float size = uSize * (0.35 + 1.25 * out_) * (0.55 + aSeed.w * 0.9);
    vec3 c = o + dir * uSpread * out_ * (0.35 + aSeed.x * 0.9);
    c.y += uRise * age * (0.3 + aSeed.z * 0.9) + size * uFlat;
    c.y += sin(uTime * 0.3 + aSeed.x * 20.0) * 0.08 * size;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float rot = aSeed.w * 6.28 + uTime * 0.05 * (aSeed.z - 0.5);
    vec2 cr = vec2(cos(rot) * position.x - sin(rot) * position.y, sin(rot) * position.x + cos(rot) * position.y);
    vec3 w = (modelMatrix * vec4(c, 1.0)).xyz + (right * cr.x + up * cr.y) * size;
    vUv = uv;
    vSeed = aSeed.x;
    vAge = age;
    float life = uMode < 0.5 ? smoothstep(0.0, 0.05, age) : smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.45, 1.0, age));
    vAlpha = uAmt * life * step(0.0001, age);
    // puffs that drift up to the lens thin out instead of turning the frame into a grey wall
    float camD = distance(w, cameraPosition);
    vAlpha *= clamp((camD - uNear * 0.35) / max(uNear * 0.65, 0.001), 0.0, 1.0);
    vGlow = exp(-pow(max(distance(w, uGlowPos), 0.0) / max(uGlowR, 0.01), 2.0));
    // light directions in the billboard's own (rotated) frame, for a lit puff look
    vec3 cw = (modelMatrix * vec4(c, 1.0)).xyz;
    vec3 L = (viewMatrix * vec4(normalize(uGlowPos - cw + vec3(0.0, 0.001, 0.0)), 0.0)).xyz;
    vec3 U = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    mat2 ir = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
    vL = vec3(ir * L.xy, L.z);
    vUp = vec3(ir * U.xy, U.z);
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;
const smokeFrag = /* glsl */ `
  uniform float uTime, uGlow, uOpacity;
  uniform vec3 uDark, uLit, uGlowColor;
  varying vec2 vUv;
  varying float vAlpha, vGlow, vSeed, vAge;
  varying vec3 vL, vUp;
  ${NOISE}
  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    float d = length(c);
    float n = fbm(vec3(c * 1.7 + vSeed * 13.0, uTime * 0.12 + vSeed * 4.0));
    float n2 = vnoise(vec3(c * 4.6 + vSeed * 7.0, uTime * 0.2 + vSeed));
    // cauliflower edge: two octaves of noise eat into the disc
    float edge = d + (n - 0.5) * 0.75 + (n2 - 0.5) * 0.28;
    float a = smoothstep(1.0, 0.42, edge) * vAlpha * uOpacity;
    // a fake sphere normal, roughened by the noise, lit from above and from the plume
    vec3 nrm = normalize(vec3(c * 0.9 + (vec2(n, n2) - 0.5) * 1.1, sqrt(max(0.0, 1.0 - min(d * d, 1.0))) + 0.3));
    float top = clamp(dot(nrm, normalize(vUp + vec3(0.0, 0.0, 0.001))) * 0.5 + 0.5, 0.0, 1.0);
    float hot = clamp(dot(nrm, normalize(vL + vec3(0.0, 0.0, 0.001))), 0.0, 1.0);
    float shade = mix(0.18, 1.0, top) * (0.65 + 0.45 * n);
    vec3 col = mix(uDark, uLit, clamp(shade, 0.0, 1.0));
    float g = vGlow * uGlow;
    col += uGlowColor * g * (0.3 + 1.6 * hot) * (0.6 + 0.6 * n);
    col += vec3(1.0, 0.86, 0.62) * pow(vGlow, 3.0) * uGlow * hot * 1.4;
    gl_FragColor = vec4(min(col, vec3(4.0)), clamp(a, 0.0, 1.0));
  }
`;

export type SmokeLook = {
  mode: 0 | 1; stagger: number; spread: number; rise: number; size: number; rate?: number; flat?: number; side?: number;
  dark: string; lit: string; opacity?: number; near?: number;
};

export class Smoke {
  mesh: THREE.InstancedMesh;
  u: Record<string, THREE.IUniform>;
  constructor(count: number, look: SmokeLook, seed = 1) {
    const geo = new THREE.PlaneGeometry(2, 2);
    const seeds = new Float32Array(count * 4);
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < count * 4; i++) seeds[i] = rnd();
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    this.u = {
      uT: { value: 0 }, uTime: { value: 0 }, uMode: { value: look.mode }, uStagger: { value: look.stagger },
      uSpread: { value: look.spread }, uRise: { value: look.rise }, uSize: { value: look.size }, uAmt: { value: 0 },
      uRate: { value: look.rate ?? 0.2 }, uNear: { value: look.near ?? 0 }, uFlat: { value: look.flat ?? 0.35 }, uSide: { value: look.side ?? 0 },
      uOrigin: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uGlowPos: { value: new THREE.Vector3() }, uGlowR: { value: 6 }, uGlow: { value: 0 },
      uDark: { value: new THREE.Color(look.dark) }, uLit: { value: new THREE.Color(look.lit) },
      uGlowColor: { value: new THREE.Color("#ff8a2a") }, uOpacity: { value: look.opacity ?? 0.9 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: smokeVert, fragmentShader: smokeFrag, uniforms: this.u, transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    // identity instance matrices: positions are computed in the shader
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }
  origin(i: number, x: number, y: number, z: number) { (this.u.uOrigin.value as THREE.Vector3[])[i].set(x, y, z); }
}

/* ------------------------------------------------------------------ */
/* Max-Q condensation collar                                           */
/* ------------------------------------------------------------------ */
export function vaporCone() {
  const geo = new THREE.CylinderGeometry(0.47, 1.25, 2.4, 40, 12, true);
  geo.translate(0, -1.2, 0);
  const u = { uTime: { value: 0 }, uAmt: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN, vV, vP;
      void main() {
        vUv = uv; vP = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAmt;
      varying vec2 vUv; varying vec3 vN, vV, vP;
      ${NOISE}
      void main() {
        float rim = 1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
        float n = fbm(vec3(vP.x * 3.0, vP.y * 1.2 + uTime * 3.5, vP.z * 3.0));
        float streak = fbm(vec3(atan(vP.z, vP.x) * 4.0, vP.y * 0.6 + uTime * 6.0, 1.0));
        float fall = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
        float a = pow(rim, 2.0) * fall * (0.3 + n * 0.9) * (0.6 + streak * 0.6) * uAmt * 0.32;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, clamp(a, 0.0, 1.0));
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 6;
  return { mesh, u };
}

/* ------------------------------------------------------------------ */
/* Glow sprite (always faces the camera)                               */
/* ------------------------------------------------------------------ */
export function glowSprite(color: string, soft = 1.0) {
  const u = { uColor: { value: new THREE.Color(color) }, uAmt: { value: 0 }, uSoft: { value: soft } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float s = length(modelMatrix[0].xyz);
        vec3 w = c + (right * position.x + up * position.y) * s;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmt, uSoft;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = (exp(-d * d * 4.0 * uSoft) * 0.8 + exp(-d * d * 40.0) * 0.6) * (1.0 - smoothstep(0.85, 1.0, d)) * uAmt;
        a = clamp(a, 0.0, 4.0);
        gl_FragColor = vec4(uColor * a, clamp(a, 0.0, 1.0));
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.frustumCulled = false;
  m.renderOrder = 7;
  return { mesh: m, u };
}

/* ------------------------------------------------------------------ */
/* Ballistic particles: sparks, ice, water deluge, debris              */
/* ------------------------------------------------------------------ */
export type SparkLook = {
  rate: number; life: number; origin: [number, number, number]; ring?: number; spread?: [number, number, number];
  vel: [number, number, number]; radial?: number; velRand?: [number, number, number]; grav: number; size: number;
  color: string; color2?: string; additive?: boolean; floor?: number; drag?: number;
};

export class Sparks {
  mesh: THREE.Points;
  u: Record<string, THREE.IUniform>;
  constructor(count: number, look: SparkLook, seed = 1) {
    const geo = new THREE.BufferGeometry();
    const a = new Float32Array(count * 4), b = new Float32Array(count * 4);
    let s = seed * 7919 + 13;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count * 4; i++) { a[i] = rnd(); b[i] = rnd(); }
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(a, 4));
    geo.setAttribute("aSeed2", new THREE.BufferAttribute(b, 4));
    const v3 = (x?: [number, number, number]) => new THREE.Vector3(...(x ?? [0, 0, 0]));
    this.u = {
      uTime: { value: 0 }, uAmt: { value: 0 }, uRate: { value: look.rate }, uLife: { value: look.life },
      uOrigin: { value: v3(look.origin) }, uRing: { value: look.ring ?? 0 }, uSpread: { value: v3(look.spread) },
      uVel: { value: v3(look.vel) }, uRadial: { value: look.radial ?? 0 }, uVelRand: { value: v3(look.velRand) },
      uGrav: { value: look.grav }, uSize: { value: look.size }, uScale: { value: 800 }, uFloor: { value: look.floor ?? -1e4 },
      uDrag: { value: look.drag ?? 0 },
      uColor: { value: new THREE.Color(look.color) }, uColor2: { value: new THREE.Color(look.color2 ?? look.color) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false,
      blending: look.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed, aSeed2;
        uniform float uTime, uAmt, uRate, uLife, uRing, uRadial, uGrav, uSize, uScale, uFloor, uDrag;
        uniform vec3 uOrigin, uSpread, uVel, uVelRand;
        varying float vA, vHeat;
        void main() {
          float age = fract(uTime * uRate * (0.8 + aSeed.w * 0.4) + aSeed.x);
          float tt = age * uLife;
          float ang = aSeed.y * 6.2831853;
          vec3 rdir = vec3(cos(ang), 0.0, sin(ang));
          vec3 o = uOrigin + rdir * uRing + (aSeed2.xyz - 0.5) * 2.0 * uSpread;
          vec3 v = uVel + rdir * uRadial * (0.4 + aSeed.z) + (vec3(aSeed.z, aSeed2.w, aSeed.w) - 0.5) * 2.0 * uVelRand;
          // simple linear drag on the launch velocity
          float k = uDrag > 0.0 ? (1.0 - exp(-uDrag * tt)) / uDrag : tt;
          vec3 p = o + v * k + vec3(0.0, 0.5 * uGrav * tt * tt, 0.0);
          p.y = max(p.y, uFloor);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float life = smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.55, 1.0, age));
          // amount also thins the population so low values look sparse, not dim
          vA = life * step(aSeed2.w, uAmt) * min(1.0, uAmt * 2.0);
          vHeat = 1.0 - age;
          gl_PointSize = clamp(uSize * uScale * (0.45 + aSeed.z * 0.9) / max(-mv.z, 0.1), 0.0, 48.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor, uColor2;
        varying float vA, vHeat;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.2, 1.0, d)) * vA;
          if (a < 0.003) discard;
          vec3 col = mix(uColor2, uColor, clamp(vHeat * 1.3, 0.0, 1.0));
          gl_FragColor = vec4(col * (1.0 + (1.0 - d) * 0.6), clamp(a, 0.0, 1.0));
        }`,
    });
    this.mesh = new THREE.Points(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
}

/* ------------------------------------------------------------------ */
/* Heat shimmer: screen-space refraction in an ellipse around the plume */
/* ------------------------------------------------------------------ */
export const ShimmerShader = {
  uniforms: {
    tDiffuse: { value: null }, uC: { value: new THREE.Vector2(0.5, 0.5) }, uR: { value: new THREE.Vector2(0.1, 0.3) },
    uAmt: { value: 0 }, uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uC, uR; uniform float uAmt, uTime;
    varying vec2 vUv;
    ${NOISE}
    void main() {
      vec2 d = (vUv - uC) / max(uR, vec2(0.001));
      float m = exp(-dot(d, d) * 1.6);
      vec2 off = vec2(0.0);
      if (m > 0.01) {
        float n1 = vnoise(vec3(vUv * vec2(46.0, 26.0) + vec2(0.0, -uTime * 3.4), uTime * 0.7));
        float n2 = vnoise(vec3(vUv * vec2(42.0, 24.0) + vec2(7.0, -uTime * 2.9), uTime * 0.7 + 3.0));
        off = (vec2(n1, n2) - 0.5) * uAmt * m * 0.011;
      }
      gl_FragColor = texture2D(tDiffuse, vUv + off);
    }`,
};
