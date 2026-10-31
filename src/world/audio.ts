/** Engine rumble synthesised with WebAudio: filtered brown noise whose level
 *  and brightness follow thrust. Off until the visitor turns it on. */
export class Rumble {
  private ctx?: AudioContext;
  private gain?: GainNode;
  private lp?: BiquadFilterNode;
  private on = false;

  private init() {
    const ctx = new AudioContext();
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 120;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    src.connect(this.lp).connect(this.gain).connect(ctx.destination);
    src.start();
    this.ctx = ctx;
  }

  toggle() {
    if (!this.ctx) this.init();
    this.on = !this.on;
    if (this.on) this.ctx!.resume(); else this.gain!.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.1);
    return this.on;
  }

  /** thrust 0..1, air 0..1 (1 = dense atmosphere) */
  set(thrust: number, air: number) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.gain!.gain.setTargetAtTime(0.02 + thrust * (0.25 + air * 0.35), now, 0.15);
    this.lp!.frequency.setTargetAtTime(90 + thrust * air * 520, now, 0.2);
  }

  dispose() { this.ctx?.close(); }
}
