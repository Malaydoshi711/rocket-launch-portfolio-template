// =====================================================================
// All site content lives here. This is the only file you need to edit to
// make the portfolio yours: the page, the 3D world (painted vehicle
// markings, loader countdown, exploded view), the Ctrl/Cmd+K palette, the
// "Ask my agent" console, index.html meta tags, sitemap.xml and robots.txt
// all read from it.
//
// Sample portfolio: the person, companies and projects are fictional.
// =====================================================================

export const profile = {
  name: "Nikhil Varma",
  /** The hero splits the name over two lines: first line, second line. */
  first: "Nikhil",
  last: "Varma",
  /** Full title, used in the hero, page title and agent. */
  role: "Propulsion and GNC Engineer",
  /** Short label under the name in the top bar. */
  tagline: "Propulsion and GNC",
  /** Used by the agent when it talks about you in the third person. */
  pronouns: { subject: "he", object: "him", possessive: "his" },
  location: "Bengaluru, India",
  /** For JSON-LD (search engines). */
  city: "Bengaluru",
  countryCode: "IN",
  timezone: "IST, UTC+5:30",
  email: "nikhil@example.com",
  intro:
    "I design rocket engines and the guidance software that brings boosters home. Five years of hot fires, hop tests and flight code at a small launch company in Bengaluru.",
  /** Small facts listed under the About heading. */
  facts: ["Bengaluru, India", "12.97° N, 77.59° E", "5 years in launch"],
  /** One sentence the agent uses for "what do you focus on". */
  focus:
    "Nikhil works where propulsion hardware meets guidance and control software: rocket engines and injectors, powered descent guidance, navigation filters, thrust vector control, and the test stands and hop vehicles where they are proven.",
  /** Topics for the JSON-LD Person block. */
  knowsAbout: ["Rocket propulsion", "Guidance, navigation and control", "Powered descent guidance", "Thrust vector control", "Kalman filtering", "Hot fire testing"],
  about: [
    "I'm a propulsion and GNC engineer at Halyard Launch Systems in Bengaluru, where I lead landing guidance and thrust vector control for our reusable first stage. I joined as a propulsion engineer in 2021 and spent my first two years on Ember, our methalox engine, from injector cold flows to its 41st hot fire.",
    "I like the seam between hardware and software. An engine is only as good as the controller that throttles it, and a guidance law is only as good as the actuator that has to follow it. Most of my work lives in that loop: models, test data, flight code, and the test stand where they all meet.",
    "Before Halyard I wrote attitude control software for a 3U cubesat at Orbitwise Dynamics. I studied aerospace engineering at Nilgiri Institute of Technology and captained Team Sarus, our student rocketry team, to a 3.1 km hybrid flight.",
  ],
};

/** Site-wide settings. index.html, sitemap.xml and robots.txt are generated from this. */
export const site = {
  /** Your domain, with a trailing slash. Used for canonical, Open Graph, JSON-LD, sitemap and robots. */
  url: "https://example.com/",
  title: `${profile.name} · ${profile.role}`,
  description:
    "Nikhil Varma is a propulsion and GNC engineer in Bengaluru: methalox engines, landing guidance, thrust vector control and hop-test vehicles. A sample portfolio with a fictional persona.",
  /** Shorter line for social cards. */
  shareDescription: "Rocket engines, landing guidance and the flight code that brings boosters home. A scroll-driven launch, rendered live in WebGL.",
  locale: "en_IN",
  lang: "en",
  themeColor: "#04060b",
  /** Put your PDF in public/ and point to it here. */
  resume: "/Resume.pdf",
  /** File name the browser saves the resume as. */
  resumeFileName: "Nikhil_Varma_Resume.pdf",
  /** 1200x630 social preview image in public/. */
  ogImage: "/og.png",
  /** Small print in the footer. Set to "" to hide it. */
  footerNote: "Sample portfolio. The person, companies and projects are fictional.",
  /** True for the demo persona: the agent then says the person is fictional. Set to false. */
  fictional: true,
  /** Shown as buttons in the contact section and as commands in the Ctrl/Cmd+K palette. Remove any you don't use. */
  socials: [
    { label: "LinkedIn", href: "#" },
    { label: "GitHub", href: "#" },
    { label: "X", href: "#" },
  ],
};

/**
 * Words painted on the 3D vehicle and shown by the loader. Purely visual,
 * but persona specific, so change them freely. Keep the wordmark short
 * (about 4 to 9 capital letters) so it fits along the booster.
 */
export const mission = {
  /** Organisation named in the hero kicker ("Pad 2 · Company · Terminal count"). */
  company: "Halyard Launch Systems",
  /** Painted vertically on the booster and the payload fairing. */
  wordmark: "HALYARD",
  /** Vehicle name: painted on the second stage, used in serial numbers and the loader. */
  vehicle: "H2",
  /** Booster and upper stage tail numbers, used in the painted serials. */
  booster: "B04",
  upper: "U11",
  pad: "Pad 2",
  /** Flag painted on the booster: stripes top to bottom, optional centre wheel colour. Set to null for none. */
  flag: { stripes: ["#ff9933", "#ffffff", "#138808"], wheel: "#000080" } as { stripes: string[]; wheel?: string } | null,
  /** Loader countdown: each line is ticked off while the 3D scene builds. The last one holds for your scroll. */
  countdown: [
    ["T-10:00", "Range is green, pad is clear"],
    ["T-08:00", "Flight computer on internal power"],
    ["T-06:30", "Loading liquid oxygen and methane"],
    ["T-04:00", "Guidance aligned to the pad"],
    ["T-02:00", "Compiling shaders"],
    ["T-01:00", "Tanks pressurised for flight"],
    ["T-00:30", "Engine chill complete"],
    ["T-00:10", "Hold. Ignition is on your scroll."],
  ] as [string, string][],
};

/** Headings and short lines of copy for each section. */
export const copy = {
  aboutTitle: "I build engines and teach rockets where to land.",
  experienceTitle: "Experience",
  featuredKicker: "Flagship project",
  projectsTitle: "Hardware, flight code and test stands",
  researchTitle: "Papers and talks",
  researchIntro: "What the hardware taught me, written down for other people who build it.",
  toolkitTitle: "Toolkit",
  certificationsTitle: "Certifications",
  vehicleTitle: "The vehicle, part by part",
  vehicleIntro: "Each section of the stack and the work I did on it. Hover a part to find it.",
  contactTitle: "Let's talk about what you're building.",
  contactLead: "Engines, landing guidance, test stands or a vehicle that needs to come back in one piece. I read every message.",
};

export type Experience = {
  role: string;
  org: string;
  place: string;
  start: string;
  end: string;
  points: string[];
};

export const experience: Experience[] = [
  {
    role: "Senior Propulsion and GNC Engineer",
    org: "Halyard Launch Systems",
    place: "Bengaluru",
    start: "Jul 2023",
    end: "Present",
    points: [
      "Lead landing guidance and thrust vector control for the H2 reusable first stage, with a team of four engineers.",
      "Wrote the powered descent guidance that flew on the Heron hop vehicle: 11 flights, every one landed within 0.6 m of the target.",
      "Own the 6-DOF flight simulator and the hardware in the loop rig that every flight software release has to pass.",
      "Serve as test conductor for hot fires and hop tests, including the go and no-go calls on the count.",
    ],
  },
  {
    role: "Propulsion Engineer",
    org: "Halyard Launch Systems",
    place: "Bengaluru",
    start: "Aug 2021",
    end: "Jun 2023",
    points: [
      "Designed the coaxial swirl injector and the regenerative cooling channels for Ember, the company's 35 kN methalox engine.",
      "Took Ember from first ignition to a 120 second full duration burn across 41 hot fires.",
      "Built the test stand data system: 64 channels at 10 kHz with a 5 ms hardware redline abort.",
    ],
  },
  {
    role: "GNC Engineer",
    org: "Orbitwise Dynamics",
    place: "Bengaluru",
    start: "Jun 2020",
    end: "Jul 2021",
    points: [
      "Wrote the attitude determination and control software for Kite-1, a 3U Earth observation cubesat.",
      "Kite-1 detumbled in 2.5 orbits after deployment and held 0.4 degree pointing on imaging passes.",
    ],
  },
];

export const education = {
  degree: "BTech, Aerospace Engineering",
  school: "Nilgiri Institute of Technology",
  place: "Coimbatore",
  start: "2016",
  end: "2020",
  points: [
    "Captain of Team Sarus, the student rocketry team, in my final year.",
    "Final year thesis on throttling hybrid rocket motors.",
  ],
};

export type Project = {
  title: string;
  summary: string;
  detail: string;
  /** Any short label, shown on the card. */
  category: string;
  stack: string[];
  metric?: { value: string; label: string };
  year: string;
  /** Optional links, shown as buttons on the card. */
  links?: { label: string; href: string }[];
};

export const featured = {
  title: "Heron",
  /** Label in the side nav and palette (keep it short). Defaults to the title. */
  navLabel: "Heron",
  /** Heading above the step-by-step loop. */
  loopTitle: "The landing loop, step by step",
  tagline: "A hop vehicle that climbs 300 m on one engine and lands back on its pad.",
  description:
    "Heron is Halyard's 4.2 m test vehicle for proving reusable landing before we risk a full booster on it. I led its guidance, navigation and control: the convex descent planner, the navigation filter that fuses IMU, GNSS and a laser altimeter, and the TVC loop that steers a single throttling Ember engine. Over 11 flights it went from a 20 m hover to a 300 m climb with a 90 m sideways divert.",
  facts: [
    "11 flights, 11 landings",
    "Mean touchdown error of 0.38 m, worst case 0.6 m",
    "Guidance re-plans at 10 Hz, each solve under 18 ms",
  ],
  stack: ["C++", "Convex optimization", "Kalman filtering", "TVC", "Hardware in the loop"],
  loop: [
    { name: "Navigate", text: "An error state Kalman filter fuses the IMU, GNSS and a laser altimeter into position, velocity and attitude at 200 Hz." },
    { name: "Guide", text: "A convex solver plans the fuel optimal path to the pad, and plans it again ten times a second as the vehicle drifts." },
    { name: "Control", text: "An attitude and throttle controller turns the planned thrust vector into gimbal angles and an engine throttle command." },
    { name: "Actuate", text: "Two electromechanical actuators gimbal the engine up to 6 degrees, while Ember throttles between 40 and 100 percent." },
  ],
};

export const projects: Project[] = [
  {
    title: "Ember 35 kN methalox engine",
    summary: "The regeneratively cooled methane and liquid oxygen engine that powers Heron and Halyard's upper stage program.",
    detail:
      "Additively manufactured copper alloy chamber with 96 cooling channels, 42 bar chamber pressure and throttling from 100 down to 40 percent. I owned the thermal model that sized the channels and correlated it against thermocouple data from every test.",
    category: "Propulsion",
    stack: ["Regen cooling", "Thermal modelling", "Additive manufacturing", "Hot fire testing"],
    metric: { value: "120 s", label: "full duration burn" },
    year: "2022",
  },
  {
    title: "Coaxial swirl injector",
    summary: "The injector that set Ember's combustion efficiency and kept the chamber stable.",
    detail:
      "61 coaxial swirl elements, validated with water cold flows and high speed video for spray angle and mixing, then tuned on hot fire by adjusting the recess. No combustion instability across the throttle range.",
    category: "Propulsion",
    stack: ["Injector design", "Cold flow testing", "High speed imaging", "CFD"],
    metric: { value: "97.8%", label: "c* efficiency" },
    year: "2022",
  },
  {
    title: "Powered descent guidance",
    summary: "Fuel optimal landing trajectories, solved on the flight computer during the descent.",
    detail:
      "Lossless convexification turns the landing problem into a second order cone program. I wrote a solver in C++ with no dynamic memory that re-plans at 10 Hz, and checked it over 5,000 Monte Carlo runs before it flew on Heron.",
    category: "GNC",
    stack: ["C++", "SOCP", "Lossless convexification", "Monte Carlo"],
    metric: { value: "18 ms", label: "worst case solve time" },
    year: "2024",
  },
  {
    title: "Electromechanical TVC",
    summary: "A two axis engine gimbal that replaced the hydraulic unit on the hop vehicle.",
    detail:
      "Twin ball screw actuators, a 6 degree gimbal range and 22 degrees per second slew. I designed the control loop and the actuator model used in simulation. The new system is 9 kg lighter than the hydraulic one.",
    category: "GNC",
    stack: ["Control design", "Actuator modelling", "Simulink", "Hardware in the loop"],
    metric: { value: "9 Hz", label: "closed loop bandwidth" },
    year: "2023",
  },
  {
    title: "Landing navigation filter",
    summary: "An error state Kalman filter that fuses IMU, GNSS and a laser altimeter for landing.",
    detail:
      "Handles GNSS dropouts close to the ground and rejects altimeter returns off the dust kicked up by the plume. Touchdown altitude error stayed under 4 cm on every Heron flight.",
    category: "GNC",
    stack: ["ESKF", "Sensor fusion", "C++", "Flight data analysis"],
    metric: { value: "4 cm", label: "altitude error at touchdown" },
    year: "2024",
  },
  {
    title: "Boostback and entry burn planner",
    summary: "Plans the burns that bring the H2 booster back to the landing zone.",
    detail:
      "A shooting method planner for the boostback, entry and landing burns, using grid fin aerodynamics from CFD tables. It shows mission planners exactly how much propellant margin a return to the launch site costs.",
    category: "GNC",
    stack: ["Trajectory optimization", "Python", "Aero databases", "Mission analysis"],
    metric: { value: "7%", label: "less propellant than the baseline plan" },
    year: "2025",
  },
  {
    title: "Hot fire test stand DAQ",
    summary: "The data and safety system behind every Ember test.",
    detail:
      "64 channels sampled at 10 kHz on a real time Linux box, with redlines checked in an FPGA so an abort never waits on software. I also built the dashboards the crew watches during the count.",
    category: "Test and avionics",
    stack: ["Real time Linux", "FPGA", "Instrumentation", "Python"],
    metric: { value: "5 ms", label: "redline to abort" },
    year: "2021",
  },
  {
    title: "Cryogenic loading autosequencer",
    summary: "Software that loads liquid oxygen and methane without a person on every valve.",
    detail:
      "A state machine with interlocks, chilldown logic and automatic holds, proven first against a thermal model of the tanks. Loading went from a manual 3 hour procedure to an automated 1 hour 50 minutes.",
    category: "Test and avionics",
    stack: ["State machines", "Cryogenics", "Ground software", "Thermal modelling"],
    metric: { value: "38%", label: "shorter propellant loading" },
    year: "2024",
  },
  {
    title: "Kite-1 cubesat ADCS",
    summary: "Attitude determination and control for a 3U Earth observation cubesat.",
    detail:
      "B-dot detumbling, a multiplicative extended Kalman filter on sun sensors and magnetometers, and reaction wheel pointing for imaging passes. Detumbled in 2.5 orbits and held 0.4 degree pointing.",
    category: "GNC",
    stack: ["MEKF", "Reaction wheels", "Magnetorquers", "Embedded C"],
    metric: { value: "0.4°", label: "pointing accuracy" },
    year: "2021",
  },
  {
    title: "Sarus-3 hybrid sounding rocket",
    summary: "A nitrous oxide and paraffin hybrid rocket built by a student team of 22.",
    detail:
      "As captain I led the motor design and the dual deploy recovery avionics. Sarus-3 reached 3.1 km and was recovered intact, the team's highest flight at the time.",
    category: "Student rocketry",
    stack: ["Hybrid motors", "Recovery avionics", "OpenRocket", "Team lead"],
    metric: { value: "3.1 km", label: "apogee" },
    year: "2019",
  },
];

/**
 * Exploded view: each part of the 3D vehicle and the work behind it.
 * `id` picks the 3D part to highlight and must be one of:
 *   "payload" | "avionics" | "interstage" | "tanks" | "tvc" | "engines"
 * Leave a part out to hide its label. `projects` lists project titles from
 * the projects array above (the card numbers are looked up automatically).
 */
export type PartId = "payload" | "avionics" | "interstage" | "tanks" | "tvc" | "engines";
export const vehicleParts: { id: PartId; name: string; note: string; projects: string[] }[] = [
  { id: "payload", name: "Payload", note: "Spacecraft attitude control", projects: ["Kite-1 cubesat ADCS"] },
  { id: "avionics", name: "Avionics bay", note: "Flight software and navigation", projects: ["Powered descent guidance", "Landing navigation filter"] },
  { id: "interstage", name: "Interstage and grid fins", note: "Getting the booster home", projects: ["Boostback and entry burn planner"] },
  { id: "tanks", name: "Propellant tanks", note: "Methane and liquid oxygen", projects: ["Cryogenic loading autosequencer"] },
  { id: "tvc", name: "Thrust structure and TVC", note: "Steering the engines", projects: ["Electromechanical TVC"] },
  { id: "engines", name: "Engines", note: "Where the thrust comes from", projects: ["Ember 35 kN methalox engine", "Coaxial swirl injector"] },
];

/** Leave the array empty to hide the Papers section (nav and palette adapt). */
export type Publication = {
  title: string;
  venue: string;
  where: string;
  publisher: string;
  year: string;
  note?: string;
  /** Marks the entry with an award badge; the agent mentions it. */
  award?: boolean;
  href?: string;
};

export const publications: Publication[] = [
  {
    title: "Real time powered descent guidance on a radiation tolerant flight computer",
    venue: "Launch Vehicle GNC Conference 2025",
    where: "Hyderabad",
    publisher: "Conference paper",
    year: "2025",
    award: true,
    note: "Best Paper, guidance track",
  },
  {
    title: "Correlating wall heat flux in additively manufactured regenerative cooling channels",
    venue: "Journal of Space Propulsion",
    where: "Volume 14",
    publisher: "Journal article",
    year: "2023",
    note: "The thermal model behind Ember's cooling channels",
  },
  {
    title: "Eleven hops: what a small test vehicle taught us about landing",
    venue: "Bengaluru Space Engineering Forum 2026",
    where: "Bengaluru",
    publisher: "Invited talk",
    year: "2026",
  },
];

export const skills: { group: string; items: string[] }[] = [
  {
    group: "Propulsion",
    items: ["Thermochemistry (CEA)", "Injector design", "Regenerative cooling", "Combustion stability", "Cold flow and hot fire testing", "CFD (OpenFOAM)"],
  },
  {
    group: "Guidance, navigation and control",
    items: ["Convex optimization", "Kalman filtering", "Optimal control", "6-DOF simulation", "Attitude determination", "TVC control", "Monte Carlo analysis"],
  },
  {
    group: "Software",
    items: ["C++17", "Python", "MATLAB and Simulink", "Embedded Linux", "FPGA basics", "Git and CI"],
  },
  {
    group: "Test and hardware",
    items: ["Data acquisition", "Hardware in the loop", "Cryogenic systems", "Pressure systems", "Test conducting"],
  },
];

export const certifications = [
  { name: "Hazardous Test Operations Conductor", issuer: "Halyard Launch Systems", date: "2023" },
  { name: "Functional Safety for Flight Software", issuer: "Avionics Assurance Academy", date: "2024" },
  { name: "Cryogenic Fluids Safety, Level 2", issuer: "Southern Cryogenics Safety Board", date: "2022" },
  { name: "Pressure Systems Design and Safety", issuer: "Deccan Engineering Institute", date: "2021" },
];

/**
 * The "Ask my agent" console. Suggestions are the starter questions; leave
 * the array empty to generate them from your content. Synonyms teach the
 * offline retrieval your field's vocabulary: a word a visitor might type,
 * mapped to words that appear in your content.
 */
export const agent = {
  suggestions: [] as string[],
  placeholder: "Ask about engines, guidance or experience",
  synonyms: {
    engine: ["ember", "propulsion", "methalox", "injector"], engines: ["ember", "propulsion", "injector"], propulsion: ["ember", "injector", "engine"],
    rocket: ["ember", "heron", "sarus", "vehicle"], landing: ["heron", "descent", "guidance", "navigation"], land: ["heron", "descent", "landing"],
    hop: ["heron"], gnc: ["guidance", "navigation", "control", "tvc", "kalman"], guidance: ["descent", "heron", "boostback"], control: ["tvc", "adcs", "gnc"],
    satellite: ["kite-1", "cubesat", "adcs"], cubesat: ["kite-1", "adcs"], test: ["daq", "stand", "hot", "fire"], testing: ["daq", "stand", "hot", "fire"],
  } as Record<string, string[]>,
};
