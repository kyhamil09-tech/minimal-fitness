/** A short two-tone beep for the end of a rest, made on the phone (no sound file, nothing downloaded). */
let ctx: AudioContext | null = null;

export const playBeep = (): void => {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    const c = ctx;
    if (c.state === 'suspended') void c.resume();
    [880, 1175].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      const t = c.currentTime + i * 0.22;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch {
    // audio not available
  }
};
