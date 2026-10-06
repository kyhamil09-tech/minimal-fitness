package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import com.google.android.gms.wearable.DataMap;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Locale;

/** Today's water as the phone last reported it, for the Fuel tile. Water added from the tile is shown at once and sent to the phone. */
final class WaterStore {
    private static final String FILE = "ky_water";

    private WaterStore() {}

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** Stores the phone's numbers. The total belongs to the day the phone sent it. */
    static void apply(Context c, DataMap m) {
        long at = m.getLong("at", System.currentTimeMillis());
        String day = Instant.ofEpochMilli(at).atZone(ZoneId.systemDefault()).toLocalDate().toString();
        p(c).edit()
            .putString("day", day)
            .putInt("ml", m.getInt("ml", 0))
            .putInt("goal", m.getInt("goal", 2500))
            .putBoolean("imperial", m.getBoolean("imperial", false))
            .putInt("step1", m.getInt("step1", 250))
            .putInt("step2", m.getInt("step2", 500))
            .apply();
    }

    /** A total from an earlier day counts as zero until the phone reports again. */
    static int totalMl(Context c) {
        SharedPreferences prefs = p(c);
        return LocalDate.now().toString().equals(prefs.getString("day", "")) ? prefs.getInt("ml", 0) : 0;
    }

    static int goalMl(Context c) {
        return Math.max(1, p(c).getInt("goal", 2500));
    }

    static boolean imperial(Context c) {
        return p(c).getBoolean("imperial", false);
    }

    static int stepMl(Context c, int which) {
        return p(c).getInt(which == 1 ? "step1" : "step2", which == 1 ? 250 : 500);
    }

    /** Adds water on the watch straight away; the phone gets the same amount to log and answers with the true total. */
    static void addLocal(Context c, int ml) {
        SharedPreferences prefs = p(c);
        prefs.edit().putString("day", LocalDate.now().toString()).putInt("ml", totalMl(c) + ml).apply();
    }

    /** A counter that makes every drawn tile's buttons unique, so a repeated tap id can be told apart from a new tap. */
    static int nextNonce(Context c) {
        SharedPreferences prefs = p(c);
        int n = prefs.getInt("nonce", 0) + 1;
        prefs.edit().putInt("nonce", n).apply();
        return n;
    }

    static int handledNonce(Context c) {
        return p(c).getInt("handled", 0);
    }

    static void markHandled(Context c, int nonce) {
        p(c).edit().putInt("handled", nonce).apply();
    }

    /** "750 ml" or "1.3 L"; "25 fl oz" in imperial. */
    static String format(int ml, boolean imperial) {
        if (imperial) return Math.round(ml / 29.5735f) + " fl oz";
        if (ml < 1000) return ml + " ml";
        return String.format(Locale.US, "%.1f L", ml / 1000f);
    }
}
