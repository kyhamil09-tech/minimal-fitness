package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Locale;

/** On-watch workout settings. */
final class WatchPrefs {
    private static final String FILE = "ky_prefs";

    private WatchPrefs() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static boolean autoPause(Context c) { return p(c).getBoolean("autoPause", true); }
    /** Count strength reps from wrist movement (only offered when the watch supports it). */
    static boolean autoReps(Context c) { return p(c).getBoolean("autoReps", false); }
    /** Seconds before an interval step ends to buzz a warning (0 = off). */
    static int stepWarnSec(Context c) { return p(c).getInt("stepWarnSec", 10); }
    static void setStepWarnSec(Context c, int sec) { p(c).edit().putInt("stepWarnSec", sec).apply(); }
    /** Tick the last three seconds of an interval step. */
    static boolean stepCountdown(Context c) { return p(c).getBoolean("stepCountdown", true); }
    static boolean autoLap(Context c) { return p(c).getBoolean("autoLap", true); }
    static boolean lapHaptics(Context c) { return p(c).getBoolean("lapHaptics", true); }
    static boolean zoneAlerts(Context c) { return p(c).getBoolean("zoneAlerts", false); }
    /** Heart rate, calories, distance, floors and the asleep/awake state, collected all day for the phone app. */
    static boolean allDay(Context c) { return p(c).getBoolean("allDay", true); }

    /** Offer to record a run or ride when the watch notices you started one. */
    static boolean detect(Context c) { return p(c).getBoolean("detect", true); }
    /** The same for walks, off by default because everyday walking is frequent. */
    static boolean detectWalks(Context c) { return p(c).getBoolean("detectWalks", false); }

    /**
     * Keep a dim always-on screen showing the workout the whole time. Off (the default) lets the screen sleep like any other app and
     * wake with the watch's own gestures (raise your wrist, tilt, a tap), which uses far less battery on a long workout.
     */
    static boolean alwaysOnWorkout(Context c) { return p(c).getBoolean("alwaysOn", false); }

    /** The fast timer: its row, screen, tile line and complication. Off saves the little battery they use. */
    static boolean fasting(Context c) { return p(c).getBoolean("fasting", true); }

    /** Wrist nudges (see NudgeReceiver): water well behind the day's pace, and a meal time with nothing logged. Both off until chosen. */
    static boolean nudgeWater(Context c) { return p(c).getBoolean("nudgeWater", false); }
    static boolean nudgeMeal(Context c) { return p(c).getBoolean("nudgeMeal", false); }

    static void set(Context c, String key, boolean value) {
        p(c).edit().putBoolean(key, value).apply();
    }

    /** Miles when the phone said so, otherwise by the watch's region. */
    static boolean miles(Context c) {
        SharedPreferences sp = p(c);
        if (sp.contains("miles")) return sp.getBoolean("miles", false);
        String country = Locale.getDefault().getCountry();
        return "US".equals(country) || "LR".equals(country) || "MM".equals(country);
    }

    static void setMiles(Context c, boolean miles) {
        p(c).edit().putBoolean("miles", miles).apply();
    }

    /** Quick-start workouts shown on the watch's main page (workout type names, in order). */
    static final String DEFAULT_FAVORITES = "Running,Walking,Cycling,Strength";

    static java.util.List<String> favorites(Context c) {
        String raw = p(c).getString("favorites", DEFAULT_FAVORITES);
        java.util.List<String> out = new java.util.ArrayList<>();
        for (String s : raw.split(",")) if (!s.isEmpty()) out.add(s);
        return out;
    }

    /** Adds or removes a favorite; at most four, the oldest drops out. */
    static void toggleFavorite(Context c, String type) {
        java.util.List<String> favs = favorites(c);
        if (favs.contains(type)) {
            if (favs.size() > 1) favs.remove(type);
        } else {
            favs.add(type);
            while (favs.size() > 4) favs.remove(0);
        }
        p(c).edit().putString("favorites", android.text.TextUtils.join(",", favs)).apply();
    }

    /** Last goal used for a sport: type (0 open, 1 distance, 2 time, 3 calories). */
    static int goalType(Context c, String sport) { return p(c).getInt("goalType_" + sport, 0); }

    static float goalValue(Context c, String sport, int goalType, float fallback) {
        return p(c).getFloat("goalValue_" + sport + "_" + goalType, fallback);
    }

    static void setGoal(Context c, String sport, int goalType, float value) {
        p(c).edit().putInt("goalType_" + sport, goalType).putFloat("goalValue_" + sport + "_" + goalType, value).apply();
    }

    // ---- pace and heart-rate alerts, and the cadence beat ----
    /** Seconds per kilometer, or 0 when the pace alert is off. */
    static float targetPace(Context c) { return p(c).getFloat("targetPace", 0f); }
    static void setTargetPace(Context c, float secPerKm) { p(c).edit().putFloat("targetPace", secPerKm).apply(); }
    /** Heart-rate zone 1-5, or 0 when off. */
    static int targetZone(Context c) { return p(c).getInt("targetZone", 0); }
    static void setTargetZone(Context c, int zone) { p(c).edit().putInt("targetZone", zone).apply(); }
    static boolean beatOn(Context c) { return p(c).getBoolean("beatOn", false); }
    static int beatBpm(Context c) { return p(c).getInt("beatBpm", 170); }
    static void setBeat(Context c, boolean on, int bpm) { p(c).edit().putBoolean("beatOn", on).putInt("beatBpm", bpm).apply(); }
    /** Pool length in meters for pool swims (25 m, 50 m, 25 yd = 22.86 m). */
    static float poolLengthM(Context c) { return p(c).getFloat("poolLengthM", 25f); }
    static void setPoolLengthM(Context c, float meters) { p(c).edit().putFloat("poolLengthM", meters).apply(); }
    static String intervalId(Context c) { return p(c).getString("intervalId", "5x3"); }
    static void setIntervalId(Context c, String id) { p(c).edit().putString("intervalId", id).apply(); }
}
