package com.kyfitness.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;
import java.time.LocalDate;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * Today's water as the widget and the watch show it. The app's own log is the real record; this holds the total the app last
 * reported, plus whatever was added from the home-screen widget or the watch while the app was closed. Those additions are kept
 * as a list ([epoch ms, ml]) that the app picks up the next time it runs and adds to its log.
 */
final class WaterStore {
    private static final String PREFS = "ky_water";
    private static final int MAX_PENDING = 200;

    private WaterStore() {}

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String today() {
        return LocalDate.now().toString();
    }

    /** The first reading of a new day starts the total from zero. */
    private static void rollDay(SharedPreferences prefs) {
        String day = today();
        if (!day.equals(prefs.getString("day", ""))) prefs.edit().putString("day", day).putInt("ml", 0).apply();
    }

    static synchronized int totalMl(Context c) {
        SharedPreferences prefs = p(c);
        rollDay(prefs);
        return prefs.getInt("ml", 0);
    }

    static int goalMl(Context c) {
        return Math.max(1, p(c).getInt("goal", 2500));
    }

    static boolean imperial(Context c) {
        return p(c).getBoolean("imperial", false);
    }

    /** The two amounts the widget's buttons add, in ml. */
    static int stepMl(Context c, int which) {
        return p(c).getInt(which == 1 ? "step1" : "step2", which == 1 ? 250 : 500);
    }

    private static int pendingSum(SharedPreferences prefs) {
        try {
            JSONArray log = new JSONArray(prefs.getString("pending", "[]"));
            int sum = 0;
            // Requests to take a drink back ([time, -1]) are not water.
            for (int i = 0; i < log.length(); i++) sum += Math.max(0, log.getJSONArray(i).getInt(1));
            return sum;
        } catch (JSONException e) {
            return 0;
        }
    }

    /** Adds water from the widget or the watch: shown straight away, and kept for the app to log. */
    static synchronized void add(Context c, int ml) {
        if (ml <= 0 || ml > 2000) return;
        SharedPreferences prefs = p(c);
        rollDay(prefs);
        try {
            JSONArray log = new JSONArray(prefs.getString("pending", "[]"));
            if (log.length() >= MAX_PENDING) return;
            log.put(new JSONArray().put(System.currentTimeMillis()).put(ml));
            prefs.edit().putString("pending", log.toString()).putInt("ml", prefs.getInt("ml", 0) + ml).putInt("lastMl", ml).apply();
        } catch (JSONException e) {
            // a damaged list is dropped; the total from the app corrects the display on its next report
            prefs.edit().remove("pending").apply();
        }
    }

    /** The amount of the most recent drink today (the app's last entry or the last one added from the widget or watch), 0 if unknown. */
    static int lastMl(Context c) {
        SharedPreferences prefs = p(c);
        return today().equals(prefs.getString("day", "")) ? prefs.getInt("lastMl", 0) : 0;
    }

    /**
     * Takes back the last drink, from the watch. A drink still waiting for the app is simply removed from the waiting list. One the
     * app has already logged cannot be changed from here, so a request ({@code [time, -1]}) is left for the app, which removes its
     * latest entry for today the next time it looks; the shown total drops by the last drink's amount at once.
     */
    static synchronized void undoLast(Context c) {
        SharedPreferences prefs = p(c);
        rollDay(prefs);
        try {
            JSONArray log = new JSONArray(prefs.getString("pending", "[]"));
            int total = prefs.getInt("ml", 0);
            int last = prefs.getInt("lastMl", 0);
            // The newest waiting drink, if there is one, is the one to take back.
            int idx = -1;
            for (int i = log.length() - 1; i >= 0; i--) {
                if (log.getJSONArray(i).getInt(1) > 0) {
                    idx = i;
                    break;
                }
            }
            if (idx >= 0) {
                int ml = log.getJSONArray(idx).getInt(1);
                JSONArray kept = new JSONArray();
                for (int i = 0; i < log.length(); i++) if (i != idx) kept.put(log.get(i));
                // What is now the newest waiting drink becomes the "last" one; with none waiting the app's own is unknown until it reports.
                int newLast = 0;
                for (int i = kept.length() - 1; i >= 0; i--) {
                    int v = kept.getJSONArray(i).getInt(1);
                    if (v > 0) {
                        newLast = v;
                        break;
                    }
                }
                prefs.edit().putString("pending", kept.toString()).putInt("ml", Math.max(0, total - ml)).putInt("lastMl", newLast).apply();
            } else if (log.length() < MAX_PENDING) {
                log.put(new JSONArray().put(System.currentTimeMillis()).put(-1));
                prefs.edit().putString("pending", log.toString()).putInt("ml", Math.max(0, total - Math.max(0, last))).putInt("lastMl", 0).apply();
            }
        } catch (JSONException e) {
            prefs.edit().remove("pending").apply();
        }
    }

    /** The app reports today's total (its own log, without what is still waiting) with the goal and how amounts are shown. */
    static synchronized void setFromApp(Context c, int totalMl, int goalMl, boolean imperial, int step1Ml, int step2Ml, int lastMl) {
        SharedPreferences prefs = p(c);
        prefs.edit()
            .putString("day", today())
            .putInt("lastMl", Math.max(0, lastMl))
            .putInt("ml", Math.max(0, totalMl) + pendingSum(prefs))
            .putInt("goal", Math.max(1, goalMl))
            .putBoolean("imperial", imperial)
            .putInt("step1", Math.max(1, step1Ml))
            .putInt("step2", Math.max(1, step2Ml))
            .apply();
    }

    /** Hands the waiting additions to the app and empties the list. */
    static synchronized String takePending(Context c) {
        SharedPreferences prefs = p(c);
        String json = prefs.getString("pending", "[]");
        prefs.edit().remove("pending").apply();
        return json == null ? "[]" : json;
    }

    /** "750 ml" or "1.3 L"; "25 fl oz" when the app shows imperial units. */
    static String format(int ml, boolean imperial) {
        if (imperial) return Math.round(ml / 29.5735f) + " fl oz";
        if (ml < 1000) return ml + " ml";
        return String.format(Locale.US, "%.1f L", ml / 1000f);
    }

    /** Sends today's total and goal to the watch for its Fuel tile. */
    static void pushToWatch(Context c) {
        try {
            PutDataMapRequest req = PutDataMapRequest.create("/ky/water");
            DataMap m = req.getDataMap();
            m.putInt("ml", totalMl(c));
            m.putInt("goal", goalMl(c));
            m.putBoolean("imperial", imperial(c));
            m.putInt("step1", stepMl(c, 1));
            m.putInt("step2", stepMl(c, 2));
            m.putInt("lastMl", lastMl(c));
            m.putLong("at", System.currentTimeMillis());
            PutDataRequest put = req.asPutDataRequest();
            put.setUrgent();
            Wearable.getDataClient(c.getApplicationContext()).putDataItem(put);
        } catch (RuntimeException e) {
            // no watch or Play services link: the watch keeps what it had
        }
    }
}
