package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.time.LocalDate;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The watch's own all-day readings, kept on the watch until the phone has them:
 * heart rate samples, cumulative step counts, sleep/awake changes, and today's totals for calories,
 * distance and floors. A line per reading in one small file (three days kept), totals in preferences.
 */
final class VitalsStore {
    private static final String FILE = "vitals.log";
    private static final String PREFS = "ky_vitals";
    private static final long KEEP_MS = 3L * 24 * 3600_000;
    private static final long STEP_SAMPLE_GAP_MS = 60_000;
    private static final Object LOCK = new Object();

    private VitalsStore() {}

    private static File file(Context c) {
        return new File(c.getFilesDir(), FILE);
    }

    private static void append(Context c, String line) {
        synchronized (LOCK) {
            try (FileOutputStream out = new FileOutputStream(file(c), true)) {
                out.write((line + "\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
            } catch (IOException ignored) {
                // storage full or unavailable: the reading is dropped, the next one tries again
            }
        }
    }

    static void addHr(Context c, long t, int bpm) {
        append(c, "h," + t + "," + bpm);
    }

    /** Cumulative steps today, kept at most once a minute and only when the count changed. */
    static void addSteps(Context c, long t, long stepsToday) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long lastT = p.getLong("stepT", 0);
        long lastS = p.getLong("stepS", -1);
        if (stepsToday == lastS || t - lastT < STEP_SAMPLE_GAP_MS) return;
        p.edit().putLong("stepT", t).putLong("stepS", stepsToday).apply();
        append(c, "p," + t + "," + stepsToday);
    }

    /** The app's codes: 0 unknown, 1 exercise, 2 asleep, 3 awake. */
    static void addState(Context c, long t, int code) {
        append(c, "s," + t + "," + code);
    }

    /** Today's total for one kind of daily number: "steps", "kcal", "dist" (metres) or "floors". */
    static void setDaily(Context c, String field, double value) {
        synchronized (LOCK) {
            SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String today = LocalDate.now().toString();
            try {
                JSONObject all = new JSONObject(p.getString("daily", "{}"));
                JSONObject day = all.optJSONObject(today);
                if (day == null) day = new JSONObject();
                day.put(field, value);
                all.put(today, day);
                // keep the last eight days
                JSONArray names = all.names();
                if (names != null && names.length() > 8) {
                    java.util.List<String> keys = new java.util.ArrayList<>();
                    for (int i = 0; i < names.length(); i++) keys.add(names.getString(i));
                    java.util.Collections.sort(keys);
                    for (int i = 0; i < keys.size() - 8; i++) all.remove(keys.get(i));
                }
                p.edit().putString("daily", all.toString()).apply();
            } catch (JSONException ignored) {
                // a bad value is skipped
            }
        }
    }

    /**
     * Everything recorded in [fromMs, toMs) as the JSON the phone expects, or null when that hour holds nothing and
     * {@code withDaily} is false. Old lines are dropped as a side effect.
     */
    static String payload(Context c, long fromMs, long toMs, boolean withDaily) {
        JSONArray hr = new JSONArray();
        JSONArray st = new JSONArray();
        JSONArray as = new JSONArray();
        long cutoff = System.currentTimeMillis() - KEEP_MS;
        boolean oldLines = false;
        synchronized (LOCK) {
            File f = file(c);
            if (f.exists()) {
                try (BufferedReader in = new BufferedReader(new FileReader(f))) {
                    String line;
                    while ((line = in.readLine()) != null) {
                        String[] parts = line.split(",");
                        if (parts.length < 3) continue;
                        long t;
                        long v;
                        try {
                            t = Long.parseLong(parts[1]);
                            v = Long.parseLong(parts[2]);
                        } catch (NumberFormatException e) {
                            continue;
                        }
                        if (t < cutoff) {
                            oldLines = true;
                            continue;
                        }
                        if (t < fromMs || t >= toMs) continue;
                        JSONArray row = new JSONArray().put(t).put(v);
                        switch (parts[0]) {
                            case "h": hr.put(row); break;
                            case "p": st.put(row); break;
                            case "s": as.put(row); break;
                            default: break;
                        }
                    }
                } catch (IOException ignored) {
                    // unreadable: send what we have
                }
                if (oldLines) trim(c, cutoff);
            }
        }
        JSONObject out = new JSONObject();
        try {
            out.put("v", 1);
            out.put("hr", hr);
            out.put("st", st);
            out.put("as", as);
            boolean any = hr.length() + st.length() + as.length() > 0;
            if (withDaily) {
                String daily = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("daily", "{}");
                out.put("daily", new JSONObject(daily));
                any = true;
            }
            return any ? out.toString() : null;
        } catch (JSONException e) {
            return null;
        }
    }

    private static void trim(Context c, long cutoff) {
        File f = file(c);
        File tmp = new File(c.getFilesDir(), FILE + ".tmp");
        try (BufferedReader in = new BufferedReader(new FileReader(f)); FileOutputStream out = new FileOutputStream(tmp)) {
            String line;
            while ((line = in.readLine()) != null) {
                String[] parts = line.split(",");
                if (parts.length < 3) continue;
                try {
                    if (Long.parseLong(parts[1]) < cutoff) continue;
                } catch (NumberFormatException e) {
                    continue;
                }
                out.write((line + "\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
        } catch (IOException e) {
            return;
        }
        //noinspection ResultOfMethodCallIgnored
        tmp.renameTo(f);
    }
}
