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
    static boolean autoLap(Context c) { return p(c).getBoolean("autoLap", true); }
    static boolean lapHaptics(Context c) { return p(c).getBoolean("lapHaptics", true); }
    static boolean zoneAlerts(Context c) { return p(c).getBoolean("zoneAlerts", false); }
    /** Heart rate, calories, distance, floors and the asleep/awake state, collected all day for the phone app. */
    static boolean allDay(Context c) { return p(c).getBoolean("allDay", true); }

    /** Offer to record a run or ride when the watch notices you started one. */
    static boolean detect(Context c) { return p(c).getBoolean("detect", true); }
    /** The same for walks, off by default because everyday walking is frequent. */
    static boolean detectWalks(Context c) { return p(c).getBoolean("detectWalks", false); }

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

    /** Adds or removes a favourite; at most four, the oldest drops out. */
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
    /** Seconds per kilometre, or 0 when the pace alert is off. */
    static float targetPace(Context c) { return p(c).getFloat("targetPace", 0f); }
    static void setTargetPace(Context c, float secPerKm) { p(c).edit().putFloat("targetPace", secPerKm).apply(); }
    /** Heart-rate zone 1-5, or 0 when off. */
    static int targetZone(Context c) { return p(c).getInt("targetZone", 0); }
    static void setTargetZone(Context c, int zone) { p(c).edit().putInt("targetZone", zone).apply(); }
    static boolean beatOn(Context c) { return p(c).getBoolean("beatOn", false); }
    static int beatBpm(Context c) { return p(c).getInt("beatBpm", 170); }
    static void setBeat(Context c, boolean on, int bpm) { p(c).edit().putBoolean("beatOn", on).putInt("beatBpm", bpm).apply(); }
    static String intervalId(Context c) { return p(c).getString("intervalId", "5x3"); }
    static void setIntervalId(Context c, String id) { p(c).edit().putString("intervalId", id).apply(); }
}