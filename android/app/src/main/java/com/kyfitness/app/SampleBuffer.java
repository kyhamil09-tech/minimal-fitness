package com.kyfitness.app;

import java.util.ArrayList;
import java.util.List;

/**
 * Process-wide buffer of the current workout's raw samples (GPS fixes and heart-rate readings).
 * The web view is paused whenever the phone's screen is off, so samples are kept here natively and
 * the app collects them when it is running again; nothing is lost while the phone is in a pocket.
 */
final class SampleBuffer {
    private static final List<double[]> fixes = new ArrayList<>(); // ts, lat, lng, alt (NaN if none), accuracy
    private static final List<long[]> hr = new ArrayList<>(); // ts, bpm
    private static boolean recording = false;
    private static boolean usedBarometer = false;

    private SampleBuffer() {}

    static synchronized void begin() {
        fixes.clear();
        hr.clear();
        usedBarometer = false;
        recording = true;
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

    static synchronized void addFix(long ts, double lat, double lng, double alt, double accuracy) {
        if (recording) fixes.add(new double[] {ts, lat, lng, alt, accuracy});
    }

    static synchronized void addHeartRate(long ts, int bpm) {
        if (recording) hr.add(new long[] {ts, bpm});
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