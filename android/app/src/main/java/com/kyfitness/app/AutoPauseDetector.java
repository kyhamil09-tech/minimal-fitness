package com.kyfitness.app;

import java.util.ArrayDeque;

/**
 * Decides when a workout should pause itself because you have stopped, and resume when you move again. It is fed one reading at a
 * time with the time the reading was taken, so it runs the same whether the screen is on or off and can be tested without a clock.
 *
 * Stopped means slower than {@link #PAUSE_BELOW_MS} for {@link #STILL_MS} in a row; moving again means faster than the resume speed
 * for {@link #MOVING_MS} in a row. A walker resumes at a gentler speed than a runner, or a slow walk would never un-pause. When the
 * reading has no speed of its own, speed is worked out from how far the position moved over the last few seconds, and anything inside
 * the position's own accuracy circle counts as standing still, so GPS wobble does not look like walking.
 *
 * A manual pause or resume always wins: while you have paused by hand it does nothing, and after you resume by hand it starts over.
 * This class exists once for the phone and once for the watch (the same logic, a different package), with a copy in the web app for
 * browsers (src/lib/autoPause.ts); keep the three in step.
 */
final class AutoPauseDetector {
    enum Action { NONE, PAUSE, RESUME }

    static final long STILL_MS = 6_000;
    static final long MOVING_MS = 2_000;
    /** No pausing in the first seconds, while the first position is still settling. */
    static final long WARMUP_MS = 10_000;
    static final double PAUSE_BELOW_MS = 0.7;
    static final double RESUME_ABOVE_RUN_MS = 1.4;
    static final double RESUME_ABOVE_WALK_MS = 1.0;
    private static final long TRAIL_MS = 6_000;
    private static final long MIN_TRAIL_MS = 3_000;

    private final boolean enabled;
    private final double resumeAbove;
    private final long beganAt;
    private boolean autoPaused = false;
    private boolean manualPaused = false;
    private long stillSince = -1;
    private long movingSince = -1;
    private final ArrayDeque<double[]> trail = new ArrayDeque<>(); // time, latitude, longitude

    AutoPauseDetector(boolean enabled, boolean walkLike, long beganAt) {
        this.enabled = enabled;
        this.resumeAbove = walkLike ? RESUME_ABOVE_WALK_MS : RESUME_ABOVE_RUN_MS;
        this.beganAt = beganAt;
    }

    /** True for the sports where people move slowly enough that the resume speed has to be lower. */
    static boolean walkLike(String sport) {
        return "Walking".equals(sport) || "Hiking".equals(sport);
    }

    boolean isAutoPaused() {
        return autoPaused;
    }

    /** You paused or resumed by hand: stand down, and start over from here. */
    void setManualPaused(boolean paused) {
        manualPaused = paused;
        autoPaused = false;
        stillSince = -1;
        movingSince = -1;
    }

    /** A position reading. {@code speed} is the receiver's own speed in m/s, or NaN when it has none. */
    Action onFix(long ts, double lat, double lng, double accuracy, double speed) {
        double[] last = trail.peekLast();
        if (last != null && ts <= last[0]) return Action.NONE; // not newer than what was already seen
        trail.addLast(new double[] {ts, lat, lng});
        while (trail.size() > 1 && ts - trail.peekFirst()[0] > TRAIL_MS) trail.removeFirst();
        double v = Double.isNaN(speed) ? displacementSpeed(accuracy) : speed;
        return onSpeed(ts, v);
    }

    /** A speed reading in m/s (NaN when unknown, which changes nothing). */
    Action onSpeed(long ts, double speed) {
        if (!enabled || manualPaused || Double.isNaN(speed) || ts - beganAt < WARMUP_MS) return Action.NONE;
        if (!autoPaused) {
            movingSince = -1;
            if (speed < PAUSE_BELOW_MS) {
                if (stillSince < 0) stillSince = ts;
                if (ts - stillSince >= STILL_MS) {
                    autoPaused = true;
                    stillSince = -1;
                    return Action.PAUSE;
                }
            } else {
                stillSince = -1;
            }
        } else {
            stillSince = -1;
            if (speed >= resumeAbove) {
                if (movingSince < 0) movingSince = ts;
                if (ts - movingSince >= MOVING_MS) {
                    autoPaused = false;
                    movingSince = -1;
                    return Action.RESUME;
                }
            } else {
                movingSince = -1;
            }
        }
        return Action.NONE;
    }

    /** Speed from how far the position moved over the last few seconds; NaN when there is not enough to tell. */
    private double displacementSpeed(double accuracy) {
        double[] a = trail.peekFirst();
        double[] b = trail.peekLast();
        if (a == null || b == null) return Double.NaN;
        long span = (long) (b[0] - a[0]);
        if (span < MIN_TRAIL_MS) return Double.NaN;
        double d = meters(a[1], a[2], b[1], b[2]);
        if (d <= Math.max(3.0, Double.isNaN(accuracy) ? 0 : accuracy)) return 0;
        return d / (span / 1000.0);
    }

    private static double meters(double lat1, double lng1, double lat2, double lng2) {
        double r = 6_371_000.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * r * Math.asin(Math.min(1.0, Math.sqrt(h)));
    }
}
