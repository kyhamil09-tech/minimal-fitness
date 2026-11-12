/** Moving less than this since the last check counts as standing still (GPS drifts a few meters on its own). */
export const MOVE_KM = 0.01;

/** True when the distance has grown enough since `prevKm` to count as moving. */
export const hasMoved = (prevKm: number, km: number): boolean => km - prevKm >= MOVE_KM;

/** True when there has been no movement for `minutes` minutes. */
export const checkInDue = (lastMoveAt: number, now: number, minutes: number): boolean => now - lastMoveAt >= minutes * 60_000;
