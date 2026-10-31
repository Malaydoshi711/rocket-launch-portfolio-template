import * as THREE from "three";
import { NOISE } from "./fx";

/* Night sky dome, stars, the cloud deck, the Earth with its atmosphere,
   and the orbit trace. */

export const RE = 12000;

export function buildSkyDome() {
  const u = {
    uSpace: { value: 0 }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uSunAmt: { value: 0 },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(20000, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, depthWrite: false,
      vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uSpace, uSunAmt; uniform vec3 uSun; varying vec3 vD;
        void main() {
          float h = vD.y;
          // ground night: navy zenith, a faint warm haze of distant towns at the horizon
          vec3 zen = vec3(0.012, 0.022, 0.05);
          vec3 hor = vec3(0.05, 0.075, 0.12);
          vec3 haze = vec3(0.16, 0.11, 0.07);
          vec3 g = mix(hor, zen, smoothstep(-0.02, 0.5, h));
          g += haze * exp(-max(h + 0.01, 0.0) * 22.0) * 0.55;
          g = mix(vec3(0.02, 0.025, 0.035), g, smoothstep(-0.06, 0.0, h));
          // space: black with a thin glow where the sun is about to rise
          float sd = max(dot(normalize(vD), normalize(uSun)), 0.0);
          vec3 s = vec3(0.002, 0.004, 0.012) + vec3(1.0, 0.55, 0.22) * pow(sd, 18.0) * 0.35 * uSunAmt;
          gl_FragColor = vec4(mix(g, s, uSpace), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, u };
}

export function buildStars(n: number) {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let s = 12345;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const th = r() * Math.PI * 2;
    const y = r() * 2 - 1;
    const rr = Math.sqrt(1 - y * y);
    pos.set([Math.cos(th) * rr * 18000, y * 18000, Math.sin(th) * rr * 18000], i * 3);
    const b = 0.35 + Math.pow(r(), 3) * 1.4;
    const warm = r();
    col.set([b * (0.85 + warm * 0.15), b * (0.88 + 0.06 * warm), b * (1.0 - warm * 0.15)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -9;
  return pts;
}

/** Stack of noise layers forming a deck of cloud the vehicle climbs through. */
export function buildClouds(layers: number) {
  const group = new THREE.Group();
  const mats: THREE.ShaderMaterial[] = [];
  for (let i = 0; i < layers; i++) {
    const u = {
      uTime: { value: 0 }, uLayer: { value: i / Math.max(1, layers - 1) }, uAmt: { value: 1 },
      uGlowPos: { value: new THREE.Vector3() }, uGlow: { value: 0 }, uOff: { value: new THREE.Vector2() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec3 vW; varying vec2 vL; void main(){ vL = position.xy; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uLayer, uAmt, uGlow; uniform vec3 uGlowPos; uniform vec2 uOff;
        varying vec3 vW; varying vec2 vL;
        ${NOISE}
        void main() {
          vec2 q = (vL + uOff) * 0.006;
          float n = fbm(vec3(q, uLayer * 3.1 + uTime * 0.01));
          float n2 = fbm(vec3(q * 3.3 + 7.0, uLayer * 2.0 - uTime * 0.02));
          float d = n * 0.75 + n2 * 0.35;
          // thicker in the middle layers of the deck
          float mid = 1.0 - abs(uLayer - 0.5) * 1.2;
          float a = smoothstep(0.48 - mid * 0.08, 0.78, d);
          float r = length(vL);
          a *= 1.0 - smoothstep(500.0, 1150.0, r);
          a *= uAmt * 0.62;
          vec3 top = vec3(0.30, 0.35, 0.46);
          vec3 low = vec3(0.07, 0.09, 0.14);
          vec3 col = mix(low, top, clamp(uLayer * 0.7 + n2 * 0.5, 0.0, 1.0));
          float gd = distance(vW, uGlowPos);
          col += vec3(1.0, 0.5, 0.18) * uGlow * exp(-gd * gd * 0.0006) * 1.2;
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 150 + i * (36 / Math.max(1, layers - 1));
    m.renderOrder = 2;
    m.frustumCulled = false;
    group.add(m);
    mats.push(mat);
  }
  return { group, mats };
}

export function buildEarth(seg: number) {
  const group = new THREE.Group();
  const u = { uSun: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 }, uAmt: { value: 1 } };
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(RE, seg, Math.round(seg / 2)),
    new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: /* glsl */ `
        varying vec3 vN, vO, vW;
        void main() {
          vO = normalize(position);
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uTime, uAmt;
        varying vec3 vN, vO, vW;
        ${NOISE}
        void main() {
          vec3 n = normalize(vN);
          vec3 v = normalize(cameraPosition - vW);
          vec3 p = vO;
          float cont = fbm(p * 4.0 + 3.0) + fbm(p * 11.0) * 0.25;
          float land = smoothstep(0.6, 0.64, cont);
          float cl = fbm(p * 22.0 + vec3(0.0, 0.0, uTime * 0.0015));
          float clouds = smoothstep(0.52, 0.78, cl) * 0.85;
          float sunD = dot(n, normalize(uSun));
          float day = smoothstep(-0.08, 0.25, sunD);
          // night side: moonlit ocean, darker land, amber city lights
          vec3 night = mix(vec3(0.006, 0.016, 0.04), vec3(0.012, 0.016, 0.018), land);
          night += vec3(0.05, 0.06, 0.08) * clouds;
          float c1 = smoothstep(0.66, 0.8, fbm(p * 90.0));
          float c2 = smoothstep(0.7, 0.86, vnoise(p * 900.0));
          float cities = land * (c1 * 0.6 + c2 * c1 * 1.6) * (1.0 - clouds * 0.8);
          night += vec3(1.0, 0.6, 0.24) * cities * 0.9;
          vec3 dayc = mix(vec3(0.03, 0.09, 0.22), vec3(0.16, 0.17, 0.11), land);
          dayc = mix(dayc, vec3(0.85, 0.88, 0.92), clouds);
          vec3 col = mix(night, dayc, day * 0.9);
          // atmospheric limb and the sunrise band along the terminator
          float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
          float term = exp(-abs(sunD + 0.03) * 9.0);
          col += vec3(0.08, 0.22, 0.6) * fres * 0.7;
          col += vec3(1.0, 0.48, 0.16) * term * (0.25 + fres * 1.6);
          gl_FragColor = vec4(col * uAmt, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  earth.frustumCulled = false;
  group.add(earth);

  const au = { uSun: u.uSun, uAmt: { value: 1 } };
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(RE * 1.025, seg, Math.round(seg / 2)),
    new THREE.ShaderMaterial({
      uniforms: au, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      vertexShader: /* glsl */ `varying vec3 vN, vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uAmt; varying vec3 vN, vW;
        void main() {
          vec3 v = normalize(cameraPosition - vW);
          vec3 n = -normalize(vN);
          float k = clamp(dot(n, v), 0.0, 1.0);
          // brightest in a thin band just outside the planet's edge
          float band = pow(clamp(1.0 - k, 0.0, 1.0), 6.0) * smoothstep(0.0, 0.08, k);
          float sunSide = pow(max(dot(normalize(-vN), normalize(uSun)) * 0.5 + 0.5, 0.0), 4.0);
          vec3 col = mix(vec3(0.12, 0.35, 0.95), vec3(1.0, 0.58, 0.25), sunSide) * band * (0.9 + sunSide * 1.8);
          float a = clamp(band * uAmt, 0.0, 1.0);
          gl_FragColor = vec4(col * uAmt, a);
        }`,
    }),
  );
  atmo.frustumCulled = false;
  group.add(atmo);
  return { group, earth, u, au };
}

/** The target orbit drawn as a dashed amber ring around the Earth's centre. */
export function buildOrbitRing(radius: number) {
  const n = 720;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * radius, Math.cos(a) * radius, 0));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineDashedMaterial({ color: 0xffb04a, dashSize: 14, gapSize: 10, transparent: true, opacity: 0, depthWrite: false });
  const line = new THREE.Line(g, mat);
  line.computeLineDistances();
  line.frustumCulled = false;
  return { line, mat };
}
