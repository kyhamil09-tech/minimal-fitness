import type { Fix } from './geo';

/**
 * A Kalman filter for GPS positions. Each reading comes with an accuracy (the radius that holds the true position about two
 * times in three); the filter trusts accurate readings more, lets the estimate drift with a modelled walking or running speed
 * between readings, and so smooths the zig-zag a phone draws while you move in a straight line. Distance measured on the
 * smoothed track no longer grows from jitter, which otherwise adds a few percent on a long run.
 *
 * This is the standard "position with variance" form: one variance shared by latitude and longitude, grown by
 * {@code qMetersPerSecond}^2 per second and reduced by every measurement.
 */
export class GpsKalman {
  private lat = 0;
  private lng = 0;
  private variance = -1;
  private ts = 0;

  /** {@code qMetersPerSecond}: how fast you can plausibly move between readings. 3 suits running and walking; use more for cycling. */
  constructor(private qMetersPerSecond = 3) {}

  get ready() {
    return this.variance >= 0;
  }

  reset() {
    this.variance = -1;
  }

  /** Feeds a reading and returns the smoothed position. The first reading (and the first after a reset) is returned unchanged. */
  update(f: Fix): { lat: number; lng: number } {
    const accuracy = Math.max(1, f.acc ?? 10);
    if (this.variance < 0) {
      this.lat = f.lat;
      this.lng = f.lng;
      this.variance = accuracy * accuracy;
      this.ts = f.ts;
      return { lat: f.lat, lng: f.lng };
    }
    const dt = f.ts - this.ts;
    if (dt > 0) {
      // The chip's own speed says how far the next position can plausibly be: a runner at 3 m/s and a rider at 9 m/s need different trust.
      const q = f.speed != null && f.speed >= 0 ? Math.max(1, Math.min(12, f.speed * 1.3 + 0.8)) : this.qMetersPerSecond;
      this.variance += (dt * q * q) / 1000;
      this.ts = f.ts;
    }
    const k = this.variance / (this.variance + accuracy * accuracy);
    this.lat += k * (f.lat - this.lat);
    this.lng += k * (f.lng - this.lng);
    this.variance = (1 - k) * this.variance;
    return { lat: this.lat, lng: this.lng };
  }
}

/** Smooths a whole list of fixes in order (used by imports, where there is no live stream). */
export const smoothFixes = (fixes: Fix[], qMetersPerSecond = 3): Fix[] => {
  const k = new GpsKalman(qMetersPerSecond);
  return fixes.map((f) => ({ ...f, ...k.update(f) }));
};
