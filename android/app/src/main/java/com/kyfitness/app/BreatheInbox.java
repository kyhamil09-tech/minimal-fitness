package com.kyfitness.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * Breathing sessions done on the watch while the app was closed. The watch sends "endMs|patternId|seconds|bpmStart|bpmEnd"; they wait here
 * until the app opens and adds them to its history.
 */
final class BreatheInbox {
    private static final String PREFS = "ky_breathe_inbox";
    private static final String KEY = "pending";
    private static final int MAX = 50;

    private BreatheInbox() {}

    static synchronized void add(Context c, String line) {
        String[] f = line.trim().split("\\|", -1);
        if (f.length < 3) return;
        try {
            JSONArray one = new JSONArray();
            one.put(Long.parseLong(f[0]));
            one.put(f[1]);
            one.put(Integer.parseInt(f[2]));
            one.put(f.length > 3 && !f[3].isEmpty() ? Integer.parseInt(f[3]) : 0);
            one.put(f.length > 4 && !f[4].isEmpty() ? Integer.parseInt(f[4]) : 0);
            SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray all = new JSONArray(p.getString(KEY, "[]"));
            all.put(one);
            // Keep the newest few if the app stays closed for a long time.
            JSONArray kept = new JSONArray();
            for (int i = Math.max(0, all.length() - MAX); i < all.length(); i++) kept.put(all.get(i));
            p.edit().putString(KEY, kept.toString()).apply();
        } catch (NumberFormatException | JSONException ignored) {
            // malformed message: ignore
        }
    }

    /** The waiting sessions, removed once handed over. */
    static synchronized String take(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String s = p.getString(KEY, "[]");
        p.edit().remove(KEY).apply();
        return s;
    }
}
