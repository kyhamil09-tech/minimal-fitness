package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.health.services.client.HealthServices;
import androidx.health.services.client.data.DataType;
import androidx.health.services.client.data.ExerciseCapabilities;
import androidx.health.services.client.data.ExerciseType;
import androidx.health.services.client.data.ExerciseTypeCapabilities;
import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;

/**
 * What this watch's Health Services can record: which sports it supports, and whether it counts strength reps by itself. Asked once
 * in a while and remembered, so the sport list can leave out what the watch cannot do instead of failing when you start it.
 */
final class WatchCaps {
    private static final String FILE = "ky_caps";
    private static final String TAG = "KyCaps";
    private static volatile long lastAsk = 0;

    private WatchCaps() {}

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** Asks Health Services what it supports (at most every ten minutes). */
    static void refresh(Context ctx) {
        final Context app = ctx.getApplicationContext();
        long now = System.currentTimeMillis();
        if (now - lastAsk < 10 * 60_000) return;
        lastAsk = now;
        try {
            Futures.addCallback(
                HealthServices.getClient(app).getExerciseClient().getCapabilitiesAsync(),
                new FutureCallback<ExerciseCapabilities>() {
                    @Override
                    public void onSuccess(@Nullable ExerciseCapabilities caps) {
                        if (caps == null) return;
                        StringBuilder ids = new StringBuilder(",");
                        for (ExerciseType t : caps.getSupportedExerciseTypes()) ids.append(t.getId()).append(',');
                        boolean reps = false;
                        try {
                            ExerciseTypeCapabilities st = caps.getExerciseTypeCapabilities(ExerciseType.STRENGTH_TRAINING);
                            reps = st != null && st.getSupportedDataTypes().contains(DataType.REP_COUNT);
                        } catch (RuntimeException ignored) {
                            // strength training is not supported here: no rep counting either
                        }
                        // Which of the step sports this watch counts steps for while you exercise.
                        StringBuilder stepIds = new StringBuilder(",");
                        ExerciseType[] stepSports = {ExerciseType.WALKING, ExerciseType.RUNNING, ExerciseType.HIKING, ExerciseType.RUNNING_TREADMILL};
                        for (ExerciseType t : stepSports) {
                            try {
                                ExerciseTypeCapabilities c = caps.getExerciseTypeCapabilities(t);
                                if (c != null && c.getSupportedDataTypes().contains(DataType.STEPS_TOTAL)) stepIds.append(t.getId()).append(',');
                            } catch (RuntimeException ignored) {
                                // not supported here
                            }
                        }
                        p(app).edit().putString("types", ids.toString()).putBoolean("reps", reps).putString("stepTypes", stepIds.toString()).apply();
                        Log.i(TAG, "supported sports stored; rep counting = " + reps);
                    }

                    @Override
                    public void onFailure(@NonNull Throwable t) {
                        Log.w(TAG, "Could not read the watch's capabilities: " + t.getMessage());
                    }
                },
                ContextCompat.getMainExecutor(app));
        } catch (RuntimeException e) {
            Log.w(TAG, "Health Services unavailable: " + e.getMessage());
        }
    }

    /** True when the watch can record this sport (or when it has not been asked yet, so nothing is hidden by guesswork). */
    static boolean supports(Context c, ExerciseType type) {
        String types = p(c).getString("types", "");
        return types.isEmpty() || types.contains("," + type.getId() + ",");
    }

    /** True when the watch counts steps during this kind of exercise (it is asked once, so this is false until it has been). */
    static boolean stepsTotal(Context c, ExerciseType type) {
        return p(c).getString("stepTypes", "").contains("," + type.getId() + ",");
    }

    /** True when the watch counts strength reps from wrist movement. */
    static boolean repCounting(Context c) {
        return p(c).getBoolean("reps", false);
    }
}
