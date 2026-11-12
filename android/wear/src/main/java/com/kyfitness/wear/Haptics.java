package com.kyfitness.wear;

import android.content.Context;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/** Short vibration patterns for laps, pauses and heart-rate zone changes. */
final class Haptics {
    private Haptics() {}

    private static Vibrator vibrator(Context c) {
        // VibratorManager exists from Android 12 (Wear OS 4); Wear OS 3 has only the plain vibrator service.
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            VibratorManager vm = c.getSystemService(VibratorManager.class);
            return vm == null ? null : vm.getDefaultVibrator();
        }
        return (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
    }

    private static void play(Context c, long[] pattern) {
        Vibrator v = vibrator(c);
        if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createWaveform(pattern, -1));
    }

    static void tick(Context c) { play(c, new long[] {0, 60}); }
    static void lap(Context c) { play(c, new long[] {0, 90, 80, 90}); }
    /** A warning that a step is about to change (ten seconds out by default). */
    static void warn(Context c) { play(c, new long[] {0, 140, 110, 140}); }
    static void alert(Context c) { play(c, new long[] {0, 220, 100, 220, 100, 220}); }
}