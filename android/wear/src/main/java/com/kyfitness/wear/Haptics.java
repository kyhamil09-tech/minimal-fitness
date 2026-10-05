package com.kyfitness.wear;

import android.content.Context;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/** Short vibration patterns for laps, pauses and heart-rate zone changes. */
final class Haptics {
    private Haptics() {}

    private static Vibrator vibrator(Context c) {
        VibratorManager vm = c.getSystemService(VibratorManager.class);
        return vm == null ? null : vm.getDefaultVibrator();
    }

    private static void play(Context c, long[] pattern) {
        Vibrator v = vibrator(c);
        if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createWaveform(pattern, -1));
    }

    static void tick(Context c) { play(c, new long[] {0, 60}); }
    static void lap(Context c) { play(c, new long[] {0, 90, 80, 90}); }
    static void alert(Context c) { play(c, new long[] {0, 220, 100, 220, 100, 220}); }
}