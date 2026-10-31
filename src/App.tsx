import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import type { World } from "./world/World";
import { ROUTE_AT, P, telemetry as telemetryAt } from "./world/story";
import { Rumble } from "./world/audio";
import Loader, { SEQUENCE, tSeconds } from "./components/Loader";
import Cursor from "./components/Cursor";
import Agent from "./components/Agent";
import Palette, { type Command } from "./components/Palette";
import {
  certifications, copy, education, experience, featured, mission, profile, projects, publications, site, skills, vehicleParts,
} from "./data/content";

gsap.registerPlugin(ScrollTrigger, SplitText);

// Sections in scroll order, each tied to a flight phase in the 3D story (see world/story.ts ROUTE_AT).
// Sections without content (for example no publications) drop out of the nav, the palette and the numbering.
const ROUTE = [
  { id: "about", label: "About", phase: "Liftoff" },
  { id: "experience", label: "Experience", phase: "Max-Q", hide: !experience.length },
  { id: "featured", label: featured.navLabel || featured.title, phase: "Staging" },
  { id: "projects", label: "Projects", phase: "Second stage", hide: !projects.length },
  { id: "research", label: "Papers", phase: "Fairing", hide: !publications.length },
  { id: "toolkit", label: "Toolkit", phase: "Orbit" },
  { id: "vehicle", label: "Vehicle", phase: "Breakdown", hide: !vehicleParts.length },
  { id: "contact", label: "Contact", phase: "Landing" },
].filter((r) => !r.hide);
/** two-digit section number shown in each panel */
const num = (id: string) => String(ROUTE.findIndex((r) => r.id === id) + 1).padStart(2, "0");

const fmtClock = (s: number) => {
  const sign = s < 0 ? "T-" : "T+";
  const a = Math.abs(Math.round(s));
  return `${sign}${String(Math.floor(a / 3600)).padStart(2, "0")}:${String(Math.floor((a % 3600) / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const loader = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const black = useRef<HTMLDivElement>(null);
  const hud = useRef<Record<string, HTMLElement | null>>({});
  const labelEls = useRef<Record<string, HTMLElement | null>>({});
  const lenisRef = useRef<Lenis | null>(null);
  const worldRef = useRef<World | null>(null);
  const audio = useRef<Rumble | null>(null);
  const [active, setActive] = useState(-1);
  const [loopStep, setLoopStep] = useState(0);
  const [menu, setMenu] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentSeed, setAgentSeed] = useState<string | undefined>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const [hot, setHot] = useState<string | null>(null);

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
    const params = new URLSearchParams(location.search);
    let world: World | null = null;
    let lenis: Lenis | null = null;
    const cleanups: (() => void)[] = [];
    const L = loader.current!;
    const num = L.querySelector<HTMLElement>(".loader__num")!;
    const bar = L.querySelector<HTMLElement>(".loader__bar i")!;
    const lines = Array.from(L.querySelectorAll<HTMLElement>(".loader__log li"));
    document.documentElement.classList.add("is-loading");
    lines.forEach((l) => l.classList.remove("is-on", "is-go"));

    // countdown clock runs from the first to the last countdown line as the boot advances;
    // the boot has 8 milestones (k = 0..7), spread over however many lines content.ts has
    const counter = { v: 0 };
    const N = Math.max(1, SEQUENCE.length);
    const tA = tSeconds(SEQUENCE[0]?.[0] ?? "T-10:00"), tB = tSeconds(SEQUENCE[N - 1]?.[0] ?? "T-00:10");
    const stepTo = (k: number, dur = 0.45) => {
      const i = Math.round((k / 7) * (N - 1));
      lines.forEach((l, j) => { l.classList.toggle("is-on", j <= i); l.classList.toggle("is-go", j < i); });
      return gsap.to(counter, {
        v: (i + 1) / N, duration: reduce ? 0 : dur, ease: "power2.out",
        onUpdate: () => {
          const s = Math.max(0, Math.round(tA - counter.v * (tA - tB)));
          num.textContent = `T-${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
          bar.style.transform = `scaleX(${counter.v})`;
        },
      });
    };

    const ctx = gsap.context(() => {}, root);
    // StrictMode runs this twice in dev: the first boot must stop once cleaned up
    let dead = false;

    const boot = async () => {
      await stepTo(0, 0.35);
      await stepTo(1, 0.35);
      await Promise.all([
        document.fonts.load("800 64px 'Unbounded Variable'"),
        document.fonts.load("700 40px 'JetBrains Mono Variable'"),
      ]).catch(() => null);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (dead) return;
      try {
        if (params.has("nogl")) throw new Error("WebGL disabled");
        const { World } = await import("./world/World");
        if (dead) return;
        world = new World(canvas.current!, { mobile, reduce, adapt: !params.has("noadapt") });
        worldRef.current = world;
      } catch {
        setNoGL(true);
        document.documentElement.classList.add("nogl");
      }
      await stepTo(2, 0.3);
      await stepTo(3, 0.3);
      await document.fonts.ready;
      if (dead) return;

      /* ---- scroll -> story mapping ---- */
      const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-wp]"));
      let anchors: [number, number][] = [[0, 0], [1, 1]];
      const docTop = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY;
      const anchorOf = (el: HTMLElement) => {
        const vh = window.innerHeight;
        const spacer = el.parentElement?.classList.contains("pin-spacer") ? el.parentElement : null;
        if (spacer) return [[docTop(spacer), ROUTE_AT[el.id] - 0.055], [docTop(spacer) + spacer.offsetHeight - vh, ROUTE_AT[el.id] + 0.055]] as [number, number][];
        if (el.id === "contact") return [[docTop(el), ROUTE_AT.contact]] as [number, number][];
        const mark = el.querySelector<HTMLElement>(".mark") ?? el;
        return [[docTop(mark) - vh / 2, ROUTE_AT[el.id]]] as [number, number][];
      };
      const computeAnchors = () => {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const list: [number, number][] = [[0, 0]];
        sections.forEach((el) => list.push(...anchorOf(el)));
        list.push([max, 1]);
        anchors = list.filter((a, i) => i === 0 || (a[0] > list[i - 1][0] && a[1] > list[i - 1][1]));
        (window as unknown as { __anchors?: [number, number][] }).__anchors = anchors;
        onScroll();
      };
      const storyAt = (y: number) => {
        for (let i = 1; i < anchors.length; i++) {
          const [y0, p0] = anchors[i - 1], [y1, p1] = anchors[i];
          if (y <= y1) return p0 + ((p1 - p0) * Math.max(0, y - y0)) / (y1 - y0);
        }
        return 1;
      };

      if (!reduce) {
        lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
        lenisRef.current = lenis;
        lenis.on("scroll", ScrollTrigger.update);
        const raf = (time: number) => lenis!.raf(time * 1000);
        gsap.ticker.add(raf);
        gsap.ticker.lagSmoothing(0);
        cleanups.push(() => { gsap.ticker.remove(raf); lenis!.destroy(); lenisRef.current = null; });
        lenis.stop();
      }

      ctx.add(() => buildScroll(mobile, reduce));
      ScrollTrigger.addEventListener("refresh", computeAnchors);
      cleanups.push(() => ScrollTrigger.removeEventListener("refresh", computeAnchors));

      function onScroll() {
        const p = storyAt(window.scrollY);
        world?.setProgress(p);
        if (!world) paintTelemetry(p);
        if (hud.current.bar) hud.current.bar.style.transform = `scaleY(${p})`;
        let idx = -1;
        ROUTE.forEach((r, i) => { if (p >= ROUTE_AT[r.id] - (r.id === "projects" ? 0.062 : r.id === "contact" ? 0.012 : 0.05)) idx = i; });
        setActive(idx);
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener("scroll", onScroll));
      ScrollTrigger.refresh();
      computeAnchors();

      const onMove = (e: PointerEvent) => world?.setPointer((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      if (!mobile) window.addEventListener("pointermove", onMove, { passive: true });
      let rt = 0;
      const onResize = () => { world?.resize(); clearTimeout(rt); rt = window.setTimeout(() => ScrollTrigger.refresh(), 200); };
      window.addEventListener("resize", onResize);
      cleanups.push(() => { window.removeEventListener("pointermove", onMove); window.removeEventListener("resize", onResize); });

      if (world) {
        world.onDegrade = () => document.documentElement.classList.add("lowfx");
        world.onBlack = (v) => { if (black.current) black.current.style.opacity = String(v); };
        world.onTelemetry = (_t, p) => paintTelemetry(p);
        world.onLabels = (list, vis) => {
          const box = hud.current.labels;
          if (box) box.style.opacity = String(vis);
          for (const l of list) {
            const el = labelEls.current[l.id];
            if (el) el.style.transform = `translate3d(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px, 0)`;
          }
        };
      }
      (window as unknown as { __world?: World | null; __lenis?: Lenis | null }).__world = world;
      (window as unknown as { __lenis?: Lenis | null }).__lenis = lenis;

      await stepTo(4, 0.3);
      if (dead) return;
      world?.warm();
      await stepTo(5, 0.25);
      await stepTo(6, 0.25);
      await stepTo(7, 0.35);
      if (dead) return;
      lines.forEach((l) => l.classList.add("is-go"));

      // exit: the log lifts away, the floodlights come on, the camera settles on the pad
      document.documentElement.classList.remove("is-loading");
      world?.setIntro(reduce ? 1 : 0);
      world?.start();
      ctx.add(() => {
        const tl = gsap.timeline({ onComplete: () => lenis?.start() });
        if (reduce) {
          tl.set(L, { autoAlpha: 0 });
          world?.setIntro(1);
          return;
        }
        const intro = { v: 0 };
        tl.to(".loader__inner", { y: -30, autoAlpha: 0, duration: 0.6, ease: "power3.in", delay: 0.35 })
          .to(L, { autoAlpha: 0, duration: 0.9, ease: "power2.inOut" }, "-=0.2")
          .to(intro, { v: 1, duration: 3.6, ease: "power2.inOut", onUpdate: () => world?.setIntro(intro.v) }, "<")
          .fromTo(".hero__name .ch", { yPercent: 115 }, { yPercent: 0, duration: 1.3, stagger: 0.035, ease: "expo.out" }, "-=2.2")
          .fromTo(".hero__kicker, .hero__meta > *, .hud__fade", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.06, ease: "power3.out", clearProps: "transform" }, "-=1.1");
      });
    };

    function paintTelemetry(p: number) {
      const t = telemetryAt(p);
      const h = hud.current;
      if (h.clock) h.clock.textContent = fmtClock(t.t);
      if (h.phase) h.phase.textContent = t.booster ? `${t.phase} · Booster` : t.phase;
      if (h.alt) h.alt.textContent = t.alt < 10 ? t.alt.toFixed(2) : t.alt.toFixed(1);
      if (h.vel) h.vel.textContent = String(Math.round(t.vel)).padStart(4, "0");
      if (h.dr) h.dr.textContent = String(Math.round(t.dr));
      if (h.q) h.q.textContent = t.q.toFixed(1);
      if (h.qbar) h.qbar.style.transform = `scaleX(${Math.min(1, t.q / 35)})`;
      audio.current?.set(p > P.IGN && p < P.MECO ? 1 : p > P.S2IGN && p < P.SECO ? 0.5 : p > P.BLK1 && p < P.TD ? 0.8 : 0, p < 0.3 || p > P.BLK1 ? 1 : 0.1);
    }

    boot();

    return () => {
      dead = true;
      cleanups.forEach((c) => c());
      ctx.revert();
      world?.dispose();
      worldRef.current = null;
      document.documentElement.classList.remove("is-loading");
    };
  }, []);

  useEffect(() => { worldRef.current?.setHighlight(hot); }, [hot]);

  const go = useCallback((id: string) => {
    setMenu(false);
    const to = (y: number) => { if (lenisRef.current) lenisRef.current.scrollTo(y, { duration: 2.2 }); else window.scrollTo(0, y); };
    if (id === "top") return to(0);
    const el = document.getElementById(id);
    if (!el) return;
    const vh = window.innerHeight;
    const top = (x: HTMLElement) => x.getBoundingClientRect().top + window.scrollY;
    const spacer = el.parentElement?.classList.contains("pin-spacer") ? el.parentElement : null;
    if (spacer) return to(top(spacer));
    if (id === "contact") return to(document.documentElement.scrollHeight - vh);
    const mark = el.querySelector<HTMLElement>(".mark") ?? el;
    to(top(mark) - vh / 2);
  }, []);

  const openAgent = useCallback((seed?: string) => { setAgentSeed(seed); setAgentOpen(true); }, []);
  const closeAgent = useCallback(() => { setAgentOpen(false); setAgentSeed(undefined); }, []);
  const toggleSound = useCallback(() => {
    if (!audio.current) audio.current = new Rumble();
    setSound(audio.current.toggle());
  }, []);
  useEffect(() => () => audio.current?.dispose(), []);
  const downloadResume = useCallback(() => {
    const a = document.createElement("a");
    a.href = site.resume;
    a.download = site.resumeFileName;
    a.click();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("has-dialog", agentOpen || paletteOpen);
    const l = lenisRef.current;
    if (!l) return;
    if (agentOpen || paletteOpen) l.stop(); else l.start();
  }, [agentOpen, paletteOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands: Command[] = useMemo(() => [
    { id: "agent", label: "Ask my agent a question", hint: "AI", run: () => openAgent() },
    { id: "resume", label: "Download resume (PDF)", hint: "PDF", run: downloadResume },
    { id: "email", label: "Copy email address", hint: profile.email, run: () => navigator.clipboard?.writeText(profile.email) },
    ...ROUTE.map((r) => ({ id: `go-${r.id}`, label: `Go to ${r.label}`, hint: r.phase, run: () => go(r.id) })),
    { id: "go-top", label: "Back to the pad", run: () => go("top") },
    { id: "sound", label: "Toggle engine sound", run: toggleSound },
    ...site.socials.map((l) => ({ id: `link-${l.label}`, label: `Open ${l.label}`, run: () => window.open(l.href, "_blank", "noopener") })),
  ], [go, openAgent, downloadResume, toggleSound]);

  const projectIndex = (title: string) => projects.findIndex((p) => p.title === title) + 1;

  return (
    <div ref={root}>
      <a className="skip" href="#about">Skip to content</a>
      <canvas className={`world${noGL ? " world--none" : ""}`} ref={canvas} aria-hidden="true" />
      <div className="fallback" aria-hidden="true" />
      <div className="blackout" ref={black} aria-hidden="true" />
      <div className="scrim" aria-hidden="true" />
      <Loader ref={loader} />
      <Cursor />

      {/* exploded-view labels, positioned from the 3D scene */}
      <div className="plabels" ref={(el) => (hud.current.labels = el)} aria-hidden="true">
        {vehicleParts.map((v, i) => (
          <div key={v.id} className={`plabel${hot === v.id ? " is-hot" : ""}`} ref={(el) => (labelEls.current[v.id] = el)}>
            <span className="plabel__n">{i + 1}</span><span className="plabel__t">{v.name}</span>
          </div>
        ))}
      </div>

      {/* ---------- HUD ---------- */}
      <header className="hud">
        <a href="#top" className="hud__mark hud__fade" onClick={(e) => { e.preventDefault(); go("top"); }} aria-label="Back to the top">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2c4 4 6 9 6 15v7l3 4h-6l-1 2h-4l-1-2H7l3-4v-7c0-6 2-11 6-15z" /><circle cx="16" cy="14" r="2.4" /></svg>
          <span><b>{profile.name}</b><em>{profile.tagline}</em></span>
        </a>
        <div className="mclock hud__fade" aria-hidden="true">
          <span className="mclock__t" ref={(el) => (hud.current.clock = el)}>T-00:00:10</span>
          <span className="mclock__p" ref={(el) => (hud.current.phase = el)}>Terminal count</span>
        </div>
        <button className="hud__menu hud__fade" aria-expanded={menu} aria-controls="route" onClick={() => setMenu((m) => !m)}>
          {menu ? "Close" : "Sections"}
        </button>
        <nav id="route" className={`route hud__fade${menu ? " route--open" : ""}`} aria-label="Sections">
          <ol>
            {ROUTE.map((r, i) => (
              <li key={r.id} className={i === active ? "is-active" : i < active ? "is-past" : ""}>
                <a href={`#${r.id}`} onClick={(e) => { e.preventDefault(); go(r.id); }} aria-current={i === active ? "true" : undefined}>
                  <span className="route__l">{r.label}</span>
                  <span className="route__p">{r.phase}</span>
                  <i aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
          <div className="route__track" aria-hidden="true"><i ref={(el) => (hud.current.bar = el)} /></div>
        </nav>
        <dl className="telemetry hud__fade" aria-hidden="true">
          <div><dt>Alt</dt><dd><span ref={(el) => (hud.current.alt = el)}>0.00</span> km</dd></div>
          <div><dt>Vel</dt><dd><span ref={(el) => (hud.current.vel = el)}>0000</span> m/s</dd></div>
          <div className="telemetry__dr"><dt>Dwn</dt><dd><span ref={(el) => (hud.current.dr = el)}>0</span> km</dd></div>
          <div className="telemetry__q"><dt>Q</dt><dd><span ref={(el) => (hud.current.q = el)}>0.0</span> kPa</dd><b className="qbar"><i ref={(el) => (hud.current.qbar = el)} /></b></div>
        </dl>
        <div className="dock hud__fade">
          <button className="dock__btn dock__btn--agent" onClick={() => openAgent()} data-cursor="Ask">
            <i aria-hidden="true" /> Ask my agent
          </button>
          <a className="dock__btn" href={site.resume} download={site.resumeFileName} data-cursor="PDF">Resume</a>
          <button className="dock__btn dock__btn--icon" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Turn engine sound off" : "Turn engine sound on"} data-cursor={sound ? "Mute" : "Sound"}>
            <svg className={`spk${sound ? " spk--on" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
              <path className="spk__w1" d="M15.2 9.2a4 4 0 0 1 0 5.6" />
              <path className="spk__w2" d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8" />
              <path className="spk__x" d="M15.5 9.5l5 5m0-5l-5 5" />
            </svg>
          </button>
          <button className="dock__btn dock__btn--kbd" onClick={() => setPaletteOpen(true)} aria-label="Open command menu">
            <kbd>{typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl"}</kbd><kbd>K</kbd>
          </button>
        </div>
      </header>

      <Agent open={agentOpen} onClose={closeAgent} seed={agentSeed} />
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} onAsk={(q) => openAgent(q)} />

      <main>
        {/* ---------- HERO ---------- */}
        <section className="hero" id="top">
          <div className="hero__top"><p className="hero__kicker"><i /> {mission.pad} · {mission.company} · Terminal count</p></div>
          <h1 className="hero__name" aria-label={profile.name} style={{ "--chars": Math.max(6, profile.first.length, profile.last.length) } as React.CSSProperties}>
            <span className="hero__line" aria-hidden="true">{[...profile.first].map((c, i) => <span className="ch" key={i}>{c}</span>)}</span>
            <span className="hero__line hero__line--2" aria-hidden="true">{[...profile.last].map((c, i) => <span className="ch" key={i}>{c}</span>)}</span>
          </h1>
          <div className="hero__meta">
            <p className="hero__role">{profile.role}</p>
            <p className="hero__lede">{profile.intro}</p>
            <div className="hero__actions">
              <button className="btn btn--solid" onClick={() => openAgent()}>Ask my agent</button>
              <a className="btn" href={site.resume} download={site.resumeFileName}>Download resume</a>
            </div>
            <p className="hero__scroll"><i /><span>Scroll to launch</span></p>
          </div>
        </section>

        {/* ---------- ABOUT / LIFTOFF ---------- */}
        <section className="stage stage--left" id="about" data-wp>
          <span className="mark" aria-hidden="true" />
          <div className="panel panel--split">
            <div className="panel__head">
              <p className="panel__wp"><b>{num("about")}</b> Liftoff <span>T+00:00:09</span></p>
              <h2 className="h2 reveal">{copy.aboutTitle}</h2>
              {profile.facts.length > 0 && <p className="panel__facts">{profile.facts.map((f) => <span key={f}>{f}</span>)}</p>}
            </div>
            <div className="panel__body">
              {profile.about.map((p) => <p key={p.slice(0, 16)}>{p}</p>)}
            </div>
          </div>
        </section>

        {/* ---------- EXPERIENCE / MAX-Q ---------- */}
        <section className="stage stage--right" id="experience" data-wp>
          <span className="mark" aria-hidden="true" />
          <div className="panel panel--xl">
            <p className="panel__wp"><b>{num("experience")}</b> Max-Q <span>T+00:01:12</span></p>
            <h2 className="h2 reveal">{copy.experienceTitle}</h2>
            <ol className="timeline">
              {experience.map((e) => (
                <li key={e.role + e.org}>
                  <p className="timeline__when">{e.start} to {e.end}</p>
                  <h3 className="h3">{e.role}</h3>
                  <p className="timeline__org">{e.org}, {e.place}</p>
                  <ul>{e.points.map((p) => <li key={p.slice(0, 20)}>{p}</li>)}</ul>
                </li>
              ))}
              <li className="timeline__edu">
                <p className="timeline__when">{education.start} to {education.end}</p>
                <h3 className="h3">{education.degree}</h3>
                <p className="timeline__org">{education.school}, {education.place}</p>
                <ul>{education.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </li>
            </ol>
          </div>
        </section>

        {/* ---------- FLAGSHIP / STAGING ---------- */}
        <section className="stage stage--left" id="featured" data-wp>
          <span className="mark" aria-hidden="true" />
          <div className="panel panel--split">
            <div className="panel__head">
              <p className="panel__wp"><b>{num("featured")}</b> Staging <span>{copy.featuredKicker}</span></p>
              <h2 className="h2 reveal">{featured.title}</h2>
              <p className="panel__tag">{featured.tagline}</p>
              <p className="panel__desc">{featured.description}</p>
            </div>
            <div>
              {featured.loop.length > 0 && <>
              <p className="loop__h">{featured.loopTitle}</p>
              <div className="loop" role="group" aria-label={featured.loopTitle}>
                {featured.loop.map((l, i) => (
                  <button key={l.name} className={`loop__b${loopStep === i ? " is-on" : ""}`} aria-pressed={loopStep === i} onClick={() => setLoopStep(i)} onMouseEnter={() => setLoopStep(i)}>
                    <span>{i + 1}</span>{l.name}
                  </button>
                ))}
              </div>
              <p className="loop__text" aria-live="polite">{featured.loop[Math.min(loopStep, featured.loop.length - 1)].text}</p>
              </>}
              <ul className="facts">{featured.facts.map((f) => <li key={f}>{f}</li>)}</ul>
              <p className="stack">{featured.stack.join(" / ")}</p>
            </div>
          </div>
        </section>

        {/* ---------- PROJECTS / SECOND STAGE ---------- */}
        <section className="reel" id="projects" data-wp>
          <span className="mark" aria-hidden="true" />
          <div className="reel__head">
            <p className="panel__wp"><b>{num("projects")}</b> Second stage <span>{projects.length} projects</span></p>
            <h2 className="h2 reveal">{copy.projectsTitle}</h2>
            <p className="reel__hint">Keep scrolling to pan across.</p>
          </div>
          <div className="reel__track">
            {projects.map((p, i) => (
              <article className="card" key={p.title}>
                <header className="card__top">
                  <span className="card__n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="card__cat">{p.category}</span>
                  <span className="card__year">{p.year}</span>
                </header>
                <h3 className="card__title">{p.title}</h3>
                <p className="card__sum">{p.summary}</p>
                <p className="card__detail">{p.detail}</p>
                {p.metric && <p className="card__metric"><b>{p.metric.value}</b><span>{p.metric.label}</span></p>}
                <p className="stack">{p.stack.join(" / ")}</p>
                {p.links && p.links.length > 0 && (
                  <p className="card__links">{p.links.map((l) => <a key={l.href + l.label} className="btn btn--sm" href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}</p>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* ---------- RESEARCH / FAIRING (hidden when there are no publications) ---------- */}
        {publications.length > 0 && <section className="stage stage--right" id="research" data-wp>
          <span className="mark" aria-hidden="true" />
          <div className="panel panel--wide">
            <p className="panel__wp"><b>{num("research")}</b> Fairing separation <span>T+00:03:26</span></p>
            <h2 className="h2 reveal">{copy.researchTitle}</h2>
            {copy.researchIntro && <p className="panel__tag">{copy.researchIntro}</p>}
            <ul className="pubs">
              {publications.map((p) => (
                <li key={p.title} className={p.award ? "pub--award" : ""}>
                  <p className="pubs__venue">{p.publisher} · {p.year}</p>
                  <h3 className="pubs__title">{p.href ? <a href={p.href} target="_blank" rel="noreferrer">{p.title}</a> : p.title}</h3>
                  <p className="pubs__meta">{p.venue}, {p.where}</p>
                  {p.note && <p className="pubs__note">{p.award && <i aria-hidden="true" />}{p.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        </section>}

        {/* ---------- TOOLKIT / ORBIT ---------- */}
        <section className="stage stage--left" id="toolkit" data-wp>
          <span className="mark" aria-hidden="true" />
          <div className="panel panel--xl">
            <p className="panel__wp"><b>{num("toolkit")}</b> Orbit insertion <span>T+00:08:42</span></p>
            <h2 className="h2 reveal">{copy.toolkitTitle}</h2>
            <div className="skills">
              {skills.map((g) => (
                <div key={g.group}>
                  <h3 className="h4">{g.group}</h3>
                  <ul>{g.items.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              ))}
            </div>
            {certifications.length > 0 && <>
            <h3 className="h4 certs__h">{copy.certificationsTitle}</h3>
            <ul className="certs">
              {certifications.map((c) => (
                <li key={c.name}><span>{c.name}</span><span>{c.issuer}</span><span>{c.date}</span></li>
              ))}
            </ul>
            </>}
          </div>
        </section>

        {/* ---------- VEHICLE / EXPLODED VIEW ---------- */}
        {vehicleParts.length > 0 && <section className="stage stage--bottom" id="vehicle" data-wp>
          <span className="mark" aria-hidden="true" />
          <div className="panel panel--strip">
            <div className="strip__head">
              <p className="panel__wp"><b>{num("vehicle")}</b> Vehicle breakdown</p>
              <h2 className="h2 h2--sm reveal">{copy.vehicleTitle}</h2>
              <p className="panel__tag">{copy.vehicleIntro}</p>
            </div>
            <ol className="parts">
              {vehicleParts.map((v, i) => (
                <li key={v.id} className={hot === v.id ? "is-hot" : ""} onMouseEnter={() => setHot(v.id)} onMouseLeave={() => setHot(null)}
                  onFocus={() => setHot(v.id)} onBlur={() => setHot(null)} tabIndex={0}>
                  <p className="parts__n">{i + 1}</p>
                  <div>
                    <h3>{v.name}</h3>
                    <p className="parts__note">{v.note}</p>
                    {v.projects.length > 0 && <p className="parts__proj">{v.projects.map((t) => (projectIndex(t) > 0 ? `${String(projectIndex(t)).padStart(2, "0")} ${t}` : t)).join(", ")}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>}

        {/* ---------- CONTACT / DEPLOY AND LANDING ---------- */}
        <section className="contactwrap" id="contact" data-wp>
          <div className="contactwrap__sticky">
            <div className="contact">
              <p className="panel__wp"><b>{num("contact")}</b> Payload deploy and booster landing</p>
              <h2 className="contact__h reveal">{copy.contactTitle}</h2>
              <p className="contact__lead">{copy.contactLead}</p>
              <a className="contact__email" href={`mailto:${profile.email}`} data-cursor="Write">{profile.email}</a>
              <div className="contact__row">
                <a className="btn btn--solid" href={site.resume} download={site.resumeFileName}>Download resume</a>
                <CopyButton />
                {site.socials.map((l) => <a key={l.label} className="btn" href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}
              </div>
            </div>
            <footer className="footer">
              {site.footerNote && <p>{site.footerNote}</p>}
              <p>Every model is procedural, rendered live with Three.js.</p>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}

function CopyButton() {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(t); }, [copied]);
  return (
    <button className="btn" onClick={async () => {
      try { await navigator.clipboard.writeText(profile.email); setCopied(true); } catch { window.location.href = `mailto:${profile.email}`; }
    }}>
      {copied ? "Copied" : "Copy email"}
      <span className="sr-only" aria-live="polite">{copied ? "Email address copied" : ""}</span>
    </button>
  );
}

/* -------------------------------------------------------------- */
/* Scroll choreography                                             */
/* -------------------------------------------------------------- */
function buildScroll(mobile: boolean, reduce: boolean) {
  const reel = document.querySelector<HTMLElement>(".reel");
  const track = document.querySelector<HTMLElement>(".reel__track");
  if (reel && track && !mobile) {
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    const pan = gsap.to(track, {
      x: () => -dist(), ease: "none",
      scrollTrigger: { trigger: reel, start: "top top", end: () => `+=${Math.max(dist(), window.innerHeight * 0.9)}`, pin: true, scrub: reduce ? true : 0.6, invalidateOnRefresh: true },
    });
    if (!reduce) {
      gsap.utils.toArray<HTMLElement>(".card").forEach((card) => {
        gsap.fromTo(card, { y: 60, opacity: 0.3 }, {
          y: 0, opacity: 1, ease: "power1.out",
          scrollTrigger: { trigger: card, containerAnimation: pan, start: "left 104%", end: "left 66%", scrub: true },
        });
      });
    }
  }
  if (reduce) return;

  gsap.utils.toArray<HTMLElement>(".reveal").forEach((h) => {
    const split = SplitText.create(h, { type: "words", mask: "words" });
    gsap.fromTo(split.words, { yPercent: 110 }, {
      yPercent: 0, duration: 1, stagger: 0.05, ease: "expo.out",
      scrollTrigger: { trigger: h, start: "top 90%", toggleActions: "play none none reverse" },
    });
  });

  gsap.utils.toArray<HTMLElement>(".stage").forEach((s) => {
    const panel = s.querySelector<HTMLElement>(".panel");
    if (!panel) return;
    const fromX = mobile ? 0 : s.classList.contains("stage--right") ? 40 : s.classList.contains("stage--left") ? -40 : 0;
    gsap.fromTo(panel, { x: fromX, y: 50, autoAlpha: 0 }, {
      x: 0, y: 0, autoAlpha: 1, duration: 1.1, ease: "power3.out",
      scrollTrigger: { trigger: panel, start: "top 94%", toggleActions: "play none none reverse" },
    });
  });
  gsap.fromTo(".contact", { y: 50, autoAlpha: 0 }, {
    y: 0, autoAlpha: 1, duration: 1.1, ease: "power3.out",
    scrollTrigger: { trigger: "#contact", start: "top 70%", toggleActions: "play none none reverse" },
  });

  gsap.to(".hero__line", {
    xPercent: (i) => (i === 0 ? -10 : 10), autoAlpha: 0, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
  });
  gsap.to(".hero__meta, .hero__top", {
    y: -70, autoAlpha: 0, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "15% top", end: "65% top", scrub: true },
  });
}
