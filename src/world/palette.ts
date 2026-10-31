/* Colours of the 3D world in one place.
   The page UI colours are CSS variables at the top of src/styles.css
   (--amber is the accent there). Keep `accent` below close to it so the
   painted vehicle and the interface feel like one brand.
   The words painted on the vehicle come from `mission` in src/data/content.ts. */

export const PALETTE = {
  /** vehicle paint, lettering ink and the accent stripe / logo colour */
  paint: "#e7eaee",
  ink: "#14171c",
  accent: "#e9a23b",
  /** glow used to highlight a part in the exploded view and for small status lamps */
  highlight: 0xffa53a,
};

/** "#e9a23b", 0.8 -> "rgba(233,162,59,0.8)" */
export function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
