package com.kyfitness.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Meals said into the watch ("two eggs and toast") while the app was not looking. They wait here, as text with the time they were said,
 * until the app opens and turns them into food entries with its own food parser.
 */
final class FoodInbox {
    private static final String PREFS = "ky_food_inbox";
    private static final String KEY = "pending";
    private static final int MAX = 30;

    private FoodInbox() {}

    static synchronized void add(Context c, String text) {
        String clean = text == null ? "" : text.trim();
        if (clean.isEmpty() || clean.length() > 300) return;
        try {
            JSONObject one = new JSONObject();
            one.put("at", System.currentTimeMillis());
            one.put("text", clean);
            SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray all = new JSONArray(p.getString(KEY, "[]"));
            all.put(one);
            JSONArray kept = new JSONArray();
            for (int i = Math.max(0, all.length() - MAX); i < all.length(); i++) kept.put(all.get(i));
            p.edit().putString(KEY, kept.toString()).apply();
        } catch (JSONException ignored) {
            // cannot happen for these values
        }
    }

    /** The waiting meals as a JSON list of {at, text}, removed once handed over. */
    static synchronized String take(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String s = p.getString(KEY, "[]");
        p.edit().remove(KEY).apply();
        return s;
    }
}
