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
            .putInt("maxHr", m.getInt("maxHr", 0))
            .putInt("sleepMin", m.getInt("sleepMin", -1))
            .putInt("sleepDeep", m.getInt("sleepDeep", 0))
            .putInt("sleepRem", m.getInt("sleepRem", 0))
            .putInt("sleepLight", m.getInt("sleepLight", 0))
            .putInt("sleepAwake", m.getInt("sleepAwake", 0))
            .putInt("sleepScore", m.getInt("sleepScore", -1))
            .putInt("sleepGoalMin", m.getInt("sleepGoalMin", 480))
            .putString("sleepBed", m.getString("sleepBed", ""))
            .putString("sleepWake", m.getString("sleepWake", ""))
            .putString("sleepDate", m.getString("sleepDate", ""))
            .putInt("eatEaten", m.getInt("eatEaten", 0))
            .putInt("eatGoal", m.getInt("eatGoal", 0))
            .putInt("eatLeft", m.getInt("eatLeft", 0))
            .putInt("eatP", m.getInt("eatP", 0))
            .putInt("eatPGoal", m.getInt("eatPGoal", 0))
            .putLong("eatLastMs", m.getLong("eatLastMs", 0L))
            .putInt("sleepDebtMin", m.getInt("sleepDebtMin", -1))
            .putInt("sleepDebtNights", m.getInt("sleepDebtNights", 0))
            .putString("eatDay", java.time.LocalDate.now().toString())
            .apply();
    }

    /** This week's sleep debt in minutes, or -1 when the phone has no tracked nights. */
    static int sleepDebtMin(Context c) { return p(c).getInt("sleepDebtMin", -1); }
    static int sleepDebtNights(Context c) { return p(c).getInt("sleepDebtNights", 0); }

    /** Calories for the Eat tile and complication. They count only for the day the phone sent them: after midnight nothing is eaten yet. */
    static boolean eatKnown(Context c) { return p(c).getInt("eatGoal", 0) > 0; }
    private static boolean eatToday(Context c) { return java.time.LocalDate.now().toString().equals(p(c).getString("eatDay", "")); }
    static int eatGoal(Context c) { return p(c).getInt("eatGoal", 0); }
    static int eatEaten(Context c) { return eatToday(c) ? p(c).getInt("eatEaten", 0) : 0; }
    static int eatLeft(Context c) { return eatToday(c) ? p(c).getInt("eatLeft", p(c).getInt("eatGoal", 0)) : p(c).getInt("eatGoal", 0); }
    static int eatP(Context c) { return eatToday(c) ? p(c).getInt("eatP", 0) : 0; }
    static int eatPGoal(Context c) { return p(c).getInt("eatPGoal", 0); }
    static long eatLastMs(Context c) { return eatToday(c) ? p(c).getLong("eatLastMs", 0L) : 0L; }

    /** The phone's highest heart rate for you, or 0 when it has not said (the watch then assumes 190). */
    static int maxHr(Context c) { return p(c).getInt("maxHr", 0); }

    /** Minutes asleep last night, or -1 when the phone has no night yet. */
    static int sleepMin(Context c) { return p(c).getInt("sleepMin", -1); }
    static int sleepDeep(Context c) { return p(c).getInt("sleepDeep", 0); }
    static int sleepRem(Context c) { return p(c).getInt("sleepRem", 0); }
    static int sleepLight(Context c) { return p(c).getInt("sleepLight", 0); }
    static int sleepAwake(Context c) { return p(c).getInt("sleepAwake", 0); }
    static int sleepScore(Context c) { return p(c).getInt("sleepScore", -1); }
    static int sleepGoalMin(Context c) { return Math.max(60, p(c).getInt("sleepGoalMin", 480)); }
    static String sleepBed(Context c) { return p(c).getString("sleepBed", ""); }
    static String sleepWake(Context c) { return p(c).getString("sleepWake", ""); }
    /** The morning the night ended, "yyyy-MM-dd". */
    static String sleepDate(Context c) { return p(c).getString("sleepDate", ""); }

    /** Updates the running fast at once when it is started or ended on the watch; the phone confirms with its own numbers a moment later. */
    static void setFast(Context c, boolean active, long startMs, float goalHours) {
        SharedPreferences.Editor e = p(c).edit().putBoolean("fastActive", active).putLong("fastStartMs", active ? startMs : 0L);
        if (active) e.putFloat("fastGoalHours", goalHours);
        e.apply();
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

