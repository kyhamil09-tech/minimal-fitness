package com.kyfitness.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Everything the watch measured on its own and handed over (heart rate, step counts, asleep/awake changes and the
 * day's calories, distance and floors). One small file per kind per day, kept for 35 days, with duplicate readings
 * dropped, because the watch re-sends the current hour as it fills.
 */
final class WatchVitals {
    private static final String DIR = "watch_vitals";
    private static final String PREFS = "ky_watch_vitals";
    private static final int KEEP_DAYS = 35;
    private static final String[] DAILY_FIELDS = {"steps", "kcal", "dist", "floors"};

    private WatchVitals() {}

    private static File dir(Context c) {
        File d = new File(c.getFilesDir(), DIR);
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String dayKey(long t) {
        return Instant.ofEpochMilli(t).atZone(ZoneId.systemDefault()).toLocalDate().toString();
    }

    private static List<long[]> readRows(File f) {
        List<long[]> rows = new ArrayList<>();
        if (!f.exists()) return rows;
        try (BufferedReader in = new BufferedReader(new FileReader(f))) {
            String line;
            while ((line = in.readLine()) != null) {
                int i = line.indexOf(',');
                if (i <= 0) continue;
                try {
                    rows.add(new long[] {Long.parseLong(line.substring(0, i)), Long.parseLong(line.substring(i + 1))});
                } catch (NumberFormatException ignored) {
                    // a damaged line is skipped
                }
            }
        } catch (IOException ignored) {
            // unreadable file: treated as empty
        }
        return rows;
    }

    /** Adds the rows that are not stored yet. {@code perDay} keeps one file per day, otherwise one file for all. */
    private static int mergeRows(Context c, String kind, JSONArray rows, boolean perDay) {
        if (rows == null || rows.length() == 0) return 0;
        Map<String, Set<Long>> known = new HashMap<>();
        Map<String, StringBuilder> fresh = new HashMap<>();
        int added = 0;
        for (int i = 0; i < rows.length(); i++) {
            JSONArray row = rows.optJSONArray(i);
            if (row == null || row.length() < 2) continue;
            long t = row.optLong(0);
            long v = row.optLong(1);
            if (t <= 0) continue;
            String name = perDay ? kind + "_" + dayKey(t) + ".csv" : kind + ".csv";
            Set<Long> have = known.get(name);
            if (have == null) {
                have = new HashSet<>();
                for (long[] r : readRows(new File(dir(c), name))) have.add(r[0]);
                known.put(name, have);
            }
            if (!have.add(t)) continue;
            StringBuilder sb = fresh.get(name);
            if (sb == null) {
                sb = new StringBuilder();
                fresh.put(name, sb);
            }
            sb.append(t).append(',').append(v).append('\n');
            added++;
        }
        for (Map.Entry<String, StringBuilder> e : fresh.entrySet()) {
            try (FileOutputStream out = new FileOutputStream(new File(dir(c), e.getKey()), true)) {
                out.write(e.getValue().toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            } catch (IOException ignored) {
                // storage full: these readings are lost, later ones may still fit
            }
        }
        return added;
    }

    /** Stores a batch the watch sent. Returns how many new heart-rate readings it held. */
    static synchronized int merge(Context c, String json) {
        int added = 0;
        try {
            JSONObject o = new JSONObject(json);
            added += mergeRows(c, "hr", o.optJSONArray("hr"), true);
            mergeRows(c, "st", o.optJSONArray("st"), true);
            mergeRows(c, "as", o.optJSONArray("as"), false);
            JSONObject daily = o.optJSONObject("daily");
            if (daily != null) mergeDaily(c, daily);
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("lastSyncAt", System.currentTimeMillis()).apply();
        } catch (JSONException ignored) {
            // a damaged batch is ignored; the watch sends the hour again
        }
        trim(c);
        return added;
    }

    private static void mergeDaily(Context c, JSONObject incoming) throws JSONException {
        File f = new File(dir(c), "daily.json");
        JSONObject all = new JSONObject();
        if (f.exists()) {
            try (BufferedReader in = new BufferedReader(new FileReader(f))) {
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = in.readLine()) != null) sb.append(line);
                all = new JSONObject(sb.toString());
            } catch (IOException | JSONException ignored) {
                all = new JSONObject();
            }
        }
        Iterator<String> days = incoming.keys();
        while (days.hasNext()) {
            String day = days.next();
            JSONObject in = incoming.optJSONObject(day);
            if (in == null) continue;
            JSONObject have = all.optJSONObject(day);
            if (have == null) have = new JSONObject();
            // The totals only grow during a day, so the larger value is the newer one.
            for (String field : DAILY_FIELDS) {
                if (in.has(field)) have.put(field, Math.max(have.optDouble(field, 0), in.optDouble(field, 0)));
            }
            all.put(day, have);
        }
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(all.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (IOException ignored) {
            // not saved this time
        }
    }

    private static void trim(Context c) {
        String cutoff = LocalDate.now().minusDays(KEEP_DAYS).toString();
        File[] files = dir(c).listFiles();
        if (files == null) return;
        for (File f : files) {
            String n = f.getName();
            int u = n.indexOf('_');
            if (u > 0 && n.endsWith(".csv") && n.length() >= u + 11 && n.substring(u + 1, u + 11).compareTo(cutoff) < 0) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
    }

    static long lastSyncAt(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("lastSyncAt", 0);
    }

    private static JSONArray collect(Context c, String kind, long sinceMs) {
        List<long[]> all = new ArrayList<>();
        LocalDate day = LocalDate.parse(dayKey(sinceMs));
        LocalDate today = LocalDate.now();
        while (!day.isAfter(today)) {
            for (long[] r : readRows(new File(dir(c), kind + "_" + day + ".csv"))) if (r[0] >= sinceMs) all.add(r);
            day = day.plusDays(1);
        }
        all.sort((a, b) -> Long.compare(a[0], b[0]));
        JSONArray out = new JSONArray();
        for (long[] r : all) out.put(new JSONArray().put(r[0]).put(r[1]));
        return out;
    }

    /** Readings newer than {@code sinceMs}, the sleep/awake changes since a day earlier, and the daily totals. */
    static synchronized JSONObject read(Context c, long sinceMs) throws JSONException {
        long earliest = System.currentTimeMillis() - KEEP_DAYS * 24L * 3600_000;
        long since = Math.max(sinceMs, earliest);
        JSONObject out = new JSONObject();
        out.put("hr", collect(c, "hr", since));
        out.put("st", collect(c, "st", since));
        JSONArray states = new JSONArray();
        for (long[] r : readRows(new File(dir(c), "as.csv"))) if (r[0] >= since - 24L * 3600_000) states.put(new JSONArray().put(r[0]).put(r[1]));
        out.put("as", states);
        JSONObject daily = new JSONObject();
        File f = new File(dir(c), "daily.json");
        if (f.exists()) {
            try (BufferedReader in = new BufferedReader(new FileReader(f))) {
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = in.readLine()) != null) sb.append(line);
                daily = new JSONObject(sb.toString());
            } catch (IOException | JSONException ignored) {
                daily = new JSONObject();
            }
        }
        out.put("daily", daily);
        out.put("lastSyncAt", lastSyncAt(c));
        return out;
    }
}
