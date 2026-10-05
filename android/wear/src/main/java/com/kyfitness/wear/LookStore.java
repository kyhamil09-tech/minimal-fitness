package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import com.google.android.gms.wearable.DataMap;

/**
 * The look the phone chose (accent palette and background), kept on the watch so the watch app and tile match it. The phone sends
 * one small item whenever the look changes; this stores it and the screens read it through {@link Ui#apply}. A watch screen is always
 * dark, so the phone sends the dark tone of whatever background is picked.
 */
final class LookStore {
    private static final String PREFS = "ky_look";
    private static final String[] KEYS = {"bg", "card", "edge", "ink", "muted", "accent", "accent2", "blue", "green", "yellow", "orange", "red", "purple", "onAccent"};

    private LookStore() {}

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Stores what the phone sent. Returns true when something actually changed. */
    static boolean apply(Context c, DataMap m) {
        SharedPreferences.Editor e = p(c).edit();
        boolean changed = false;
        SharedPreferences old = p(c);
        for (String k : KEYS) {
            String v = m.getString(k, null);
            if (v == null || v.length() < 7) continue;
            if (!v.equals(old.getString(k, null))) changed = true;
            e.putString(k, v);
        }
        if (changed) e.putInt("version", old.getInt("version", 0) + 1);
        e.apply();
        return changed;
    }

    static int color(Context c, String key, int fallback) {
        String s = p(c).getString(key, null);
        if (s == null) return fallback;
        try {
            return Color.parseColor(s);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    /** Goes up each time the look changes, so an open screen knows to redraw. */
    static int version(Context c) {
        return p(c).getInt("version", 0);
    }
}
