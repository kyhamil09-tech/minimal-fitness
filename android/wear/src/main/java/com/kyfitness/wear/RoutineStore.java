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
