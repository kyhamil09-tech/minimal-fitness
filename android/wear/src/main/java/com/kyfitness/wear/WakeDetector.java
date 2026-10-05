package com.kyfitness.wear;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Decides when you are lightly asleep or stirring, so the smart alarm can wake you at a gentle moment inside its window. Two signs:
 * movement (the wrist accelerometer, in 30-second pieces) and a heart rate that has risen well above its level at the start of the
 * window. Either one, after the first two minutes, counts as "a good moment". Pure logic with no Android classes.
 */
final class WakeDetector {
    static final long EPOCH_MS = 30_000;
    private static final int BASELINE_SAMPLES = 8;
    private static final double HR_RISE = 1.08;
    private static final double MOVE_LEVEL = 0.25; // average m/s^2 away from gravity within an epoch
    private static final long MIN_WAIT_MS = 2 * 60_000;

    private final long startMs;
    private final List<Double> firstHr = new ArrayList<>();
    private double baseline = 0;
    private int hrHigh = 0;
    private long epochStart;
    private double epochSum = 0;
    private int epochN = 0;
    private final boolean[] recentMove = new boolean[3];
    private int epochIdx = 0;

    WakeDetector(long startMs) {
        this.startMs = startMs;
        this.epochStart = startMs;
    }

    /** A heart-rate reading in bpm (0 or less means none). */
    void onHeartRate(double bpm) {
        if (bpm < 30 || bpm > 200) return;
        if (baseline == 0) {
            firstHr.add(bpm);
            if (firstHr.size() >= BASELINE_SAMPLES) {
                List<Double> sorted = new ArrayList<>(firstHr);
                Collections.sort(sorted);
                baseline = sorted.get(sorted.size() / 2);
            }
            return;
        }
        if (bpm >= baseline * HR_RISE) hrHigh++;
        else hrHigh = 0;
    }

    /** One accelerometer reading: the size of the acceleration in m/s^2. */
    void onAccel(long now, double magnitude) {
        epochSum += Math.abs(magnitude - 9.81);
        epochN++;
        if (now - epochStart >= EPOCH_MS) {
            recentMove[epochIdx % recentMove.length] = epochN > 0 && epochSum / epochN > MOVE_LEVEL;
            epochIdx++;
            epochStart = now;
            epochSum = 0;
            epochN = 0;
        }
    }

    boolean moving() {
        int n = 0;
        for (boolean b : recentMove) if (b) n++;
        return n >= 2;
    }

    boolean heartRising() {
        return baseline > 0 && hrHigh >= 3;
    }

    /** True when it is a good moment to wake you. */
    boolean shouldWake(long now) {
        if (now - startMs < MIN_WAIT_MS) return false;
        return moving() || heartRising();
    }
}
