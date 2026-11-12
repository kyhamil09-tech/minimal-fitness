package com.kyfitness.app;

import java.util.ArrayList;
import java.util.List;

/**
 * Process-wide buffer of the current workout's raw samples (GPS fixes and heart-rate readings).
 * The web view is paused whenever the phone's screen is off, so samples are kept here natively and
 * the app collects them when it is running again; nothing is lost while the phone is in a pocket.
 */
final class SampleBuffer {
    private static final List<double[]> fixes = new ArrayList<>(); // ts, lat, lng, alt (NaN if none), accuracy, speed m/s (NaN if none), bearing degrees (NaN if none)
    private static final List<long[]> hr = new ArrayList<>(); // ts, bpm
    private static boolean recording = false;
    private static long beganAt = 0;
    /** Samples later than this are not part of the workout (the watch ended it while the app was asleep). */
    private static long endedAt = Long.MAX_VALUE;
    private static boolean usedBarometer = false;
    /**
     * When the workout paused itself because you stopped, and when it resumed: [time, 1 for paused or 0 for resumed]. This is worked out
     * here, beside the GPS fixes, because the web view that shows the workout is asleep whenever the screen is off. It reads the list
     * when it wakes and applies each change at the time it happened.
     */
    private static final List<long[]> pauses = new ArrayList<>();
    private static AutoPauseDetector autoPause = null;

    private SampleBuffer() {}

    static synchronized void begin() {
        fixes.clear();
        hr.clear();
        pauses.clear();
        autoPause = null;
        usedBarometer = false;
        recording = true;
        beganAt = System.currentTimeMillis();
        endedAt = Long.MAX_VALUE;
    }

    static synchronized long beganAt() {
        return beganAt;
    }

    /** Stops taking samples after {@code ts}: the workout was ended then. */
    static synchronized void endAt(long ts) {
        endedAt = ts;
    }

    static synchronized void end() {
        recording = false;
    }

    /** Remembers that this workout's altitude came from the barometer. */
    static synchronized void noteBarometer() {
        usedBarometer = true;
    }

    static synchronized boolean usedBarometer() {
        return usedBarometer;
    }

    static synchronized boolean isRecording() {
        return recording;
    }

    static synchronized void addFix(long ts, double lat, double lng, double alt, double accuracy, double speed, double bearing) {
        if (recording && ts <= endedAt) fixes.add(new double[] {ts, lat, lng, alt, accuracy, speed, bearing});
    }

    /** Turns automatic pausing on for the workout that has just begun (call right after {@link #begin()}). */
    static synchronized void configureAutoPause(boolean enabled, boolean walkLike) {
        autoPause = enabled ? new AutoPauseDetector(true, walkLike, System.currentTimeMillis()) : null;
    }

    /** You paused or resumed by hand: automatic pausing stands down, or starts over. */
    static synchronized void setManualPaused(boolean paused) {
        if (autoPause != null) autoPause.setManualPaused(paused);
    }

    /**
     * Gives the position reading to the automatic pause. When it decides the workout should pause or carry on, the change is kept for
     * the app to pick up, and returned so the caller can tell the spoken cues (outside this lock, which they must not be called inside).
     */
    static synchronized AutoPauseDetector.Action autoPauseFix(long ts, double lat, double lng, double accuracy, double speed) {
        if (!recording || autoPause == null || ts > endedAt) return AutoPauseDetector.Action.NONE;
        AutoPauseDetector.Action a = autoPause.onFix(ts, lat, lng, accuracy, speed);
        if (a != AutoPauseDetector.Action.NONE) pauses.add(new long[] {ts, a == AutoPauseDetector.Action.PAUSE ? 1 : 0});
        return a;
    }

    static synchronized List<long[]> pausesFrom(int from) {
        return new ArrayList<>(pauses.subList(Math.min(Math.max(from, 0), pauses.size()), pauses.size()));
    }

    static synchronized int pauseCount() {
        return pauses.size();
    }

    static synchronized void addHeartRate(long ts, int bpm) {
        if (recording && ts <= endedAt) hr.add(new long[] {ts, bpm});
    }

    static synchronized List<double[]> fixesFrom(int from) {
        return new ArrayList<>(fixes.subList(Math.min(Math.max(from, 0), fixes.size()), fixes.size()));
    }

    static synchronized int fixCount() {
        return fixes.size();
    }

    static synchronized List<long[]> heartRateFrom(int from) {
        return new ArrayList<>(hr.subList(Math.min(Math.max(from, 0), hr.size()), hr.size()));
    }

    static synchronized int heartRateCount() {
        return hr.size();
    }
}