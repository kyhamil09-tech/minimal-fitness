package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** The strength sessions the phone offers (today's plan day, your routines, starter templates), shown when you start Strength here. */
final class RoutineStore {
    private static final String FILE = "ky_routines";

    static final class Routine {
        final String id;
        final String name;
        final String sub;

        Routine(String id, String name, String sub) {
            this.id = id;
            this.name = name;
            this.sub = sub;
        }
    }

    private RoutineStore() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static void save(Context c, String json) {
        p(c).edit().putString("json", json == null ? "[]" : json).apply();
    }

    /** A routine's exercises with the sets last used, for running a strength session without the phone. */
    static final class Detail {
        String unit = "kg";
        final List<LocalStrength.Item> items = new ArrayList<>();
    }

    static Detail detail(Context c, String routineId) {
        Detail d = new Detail();
        try {
            JSONArray a = new JSONArray(p(c).getString("json", "[]"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                d.unit = o.optString("u", d.unit);
                if (!o.optString("id", "").equals(routineId)) continue;
                JSONArray ex = o.optJSONArray("ex");
                for (int k = 0; ex != null && k < ex.length(); k++) {
                    JSONObject e = ex.getJSONObject(k);
                    LocalStrength.Item it = new LocalStrength.Item();
                    it.id = e.optString("id", "");
                    it.name = e.optString("n", "Exercise " + (k + 1));
                    it.step = e.optDouble("step", "lb".equals(d.unit) ? 5 : 2.5);
                    JSONArray sets = e.optJSONArray("sets");
                    for (int s = 0; sets != null && s < sets.length(); s++) {
                        JSONObject r = sets.getJSONObject(s);
                        LocalStrength.Row row = new LocalStrength.Row();
                        row.reps = Math.max(1, r.optInt("r", 8));
                        row.weight = Math.max(0, r.optDouble("w", 0));
                        it.rows.add(row);
                    }
                    if (it.rows.isEmpty()) {
                        for (int s = 0; s < 3; s++) it.rows.add(new LocalStrength.Row());
                    }
                    d.items.add(it);
                }
                return d;
            }
        } catch (Exception ignored) {
            // a damaged list gives an empty session
        }
        return d;
    }

    static List<Routine> list(Context c) {
        List<Routine> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(p(c).getString("json", "[]"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                String id = o.optString("id", "");
                if (!id.isEmpty()) out.add(new Routine(id, o.optString("name", id), o.optString("sub", "")));
            }
        } catch (Exception ignored) {
            // a damaged list shows nothing; the next one from the phone replaces it
        }
        return out;
    }
}

