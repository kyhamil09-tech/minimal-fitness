package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import com.google.android.gms.wearable.DataMap;

/** The few numbers the phone app sends for the watch's complications: readiness, the month's goal, the running fast, the step goal. */
final class GlanceStore {
    private static final String FILE = "ky_glance";

    private GlanceStore() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static void apply(Context c, DataMap m) {
        p(c).edit()
            .putInt("readiness", m.getInt("readiness", -1))
            .putString("readinessLabel", m.getString("readinessLabel", ""))
            .putInt("stepGoal", m.getInt("stepGoal", 10000))
            .putInt("monthPct", m.getInt("monthPct", -1))
            .putString("monthText", m.getString("monthText", ""))
            .putString("monthKind", m.getString("monthKind", ""))
            .putBoolean("fastActive", m.getBoolean("fastActive", false))
            .putLong("fastStartMs", m.getLong("fastStartMs", 0L))
            .putFloat("fastGoalHours", m.getFloat("fastGoalHours", 16f))
            .apply();
    }

    static int readiness(Context c) { return p(c).getInt("readiness", -1); }
    static String readinessLabel(Context c) { return p(c).getString("readinessLabel", ""); }
    static int stepGoal(Context c) { return Math.max(1, p(c).getInt("stepGoal", 10000)); }
    static int monthPct(Context c) { return p(c).getInt("monthPct", -1); }
    static String monthText(Context c) { return p(c).getString("monthText", ""); }
    static String monthKind(Context c) { return p(c).getString("monthKind", ""); }
    static boolean fastActive(Context c) { return p(c).getBoolean("fastActive", false) && p(c).getLong("fastStartMs", 0L) > 0; }
    static long fastStartMs(Context c) { return p(c).getLong("fastStartMs", 0L); }
    static float fastGoalHours(Context c) { return p(c).getFloat("fastGoalHours", 16f); }
}
