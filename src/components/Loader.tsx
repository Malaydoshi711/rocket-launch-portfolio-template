import { forwardRef } from "react";
import { mission } from "../data/content";

/** Countdown lines from content.ts (mission.countdown). */
export const SEQUENCE = mission.countdown;

/** "T-10:00" -> 600 seconds (falls back to 0 for anything unparsable). */
export const tSeconds = (s: string) => {
  const m = /(\d+):(\d+)/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/** Launch countdown with a sequencer log. Lines and the clock are driven
 *  from App while the world builds. */
const Loader = forwardRef<HTMLDivElement>(function Loader(_, ref) {
  return (
    <div className="loader" ref={ref} role="status" aria-live="polite">
      <div className="loader__inner">
        <p className="loader__label">{mission.vehicle} · {mission.pad} · Autosequence</p>
        <p className="loader__clock"><span className="loader__num">{SEQUENCE[0]?.[0] ?? "T-10:00"}</span></p>
        <ol className="loader__log">
          {SEQUENCE.map(([t, l], i) => (
            <li key={t + i} data-i={i}><span>{t}</span>{l}<b>GO</b></li>
          ))}
        </ol>
        <div className="loader__bar"><i /></div>
      </div>
    </div>
  );
});

export default Loader;
