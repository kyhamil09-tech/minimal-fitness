package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Workouts finished on the watch, kept on the watch (most recent first). */
final class WorkoutStore {
    private static final String PREFS = "ky_workouts";
    private static final String KEY = "history";
    private static final int MAX = 20;

    private WorkoutStore() {}

    static void add(Context ctx, String type, long startedAt, long durationMs, int avgHr, int maxHr, double kcal, String distanceText) {
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray old = new JSONArray(prefs.getString(KEY, "[]"));
            JSONArray next = new JSONArray();
            JSONObject entry = new JSONObject();
            entry.put("type", type);
            entry.put("startedAt", startedAt);
            entry.put("durationMs", durationMs);
            entry.put("avgHr", avgHr);
            entry.put("maxHr", maxHr);
            entry.put("kcal", Math.round(kcal));
            entry.put("distance", distanceText);
            next.put(entry);
            for (int i = 0; i < old.length() && next.length() < MAX; i++) next.put(old.get(i));
            prefs.edit().putString(KEY, next.toString()).apply();
        } catch (JSONException ignored) {
            // History is best effort.
        }
    }

    /** One display line per workout, newest first. */
    static List<String> lines(Context ctx, int limit) {
        List<String> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"));
            DateFormat df = DateFormat.getDateInstance(DateFormat.SHORT);
            for (int i = 0; i < arr.length() && out.size() < limit; i++) {
                JSONObject e = arr.getJSONObject(i);
                long mins = Math.max(1, Math.round(e.optLong("durationMs") / 60000.0));
                StringBuilder sb = new StringBuilder();
                sb.append(e.optString("type")).append(" ").append(mins).append("m");
                if (e.optInt("avgHr") > 0) sb.append(" - ").append(e.optInt("avgHr")).append(" bpm");
                if (e.optInt("kcal") > 0) sb.append(" - ").append(e.optInt("kcal")).append(" kcal");
                String dist = e.optString("distance");
                if (!dist.isEmpty()) sb.append(" - ").append(dist);
                sb.append("\n").append(df.format(new Date(e.optLong("startedAt"))));
                out.add(sb.toString());
            }
        } catch (JSONException ignored) {
            // Show nothing if the stored value is unreadable.
        }
        return out;
    }
}
