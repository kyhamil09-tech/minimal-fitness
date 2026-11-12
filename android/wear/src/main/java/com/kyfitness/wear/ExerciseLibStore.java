package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The phone's exercise library, kept on the watch so a strength session can add an exercise without the phone: its name, group,
 * how much one tap changes the weight, and the sets you last did.
 */
final class ExerciseLibStore {
    private static final String FILE = "ky_exlib";

    static final class Ex {
        /** Place in the phone's exercise list (what the phone is sent to add the exercise to a session it runs). */
        int index;
        String id = "";
        String name = "";
        String group = "";
        double step = 2.5;
        final List<double[]> sets = new ArrayList<>();
    }

    private ExerciseLibStore() {}

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static void save(Context c, String json) {
        p(c).edit().putString("json", json == null ? "{}" : json).apply();
    }

    private static JSONObject root(Context c) {
        try {
            return new JSONObject(p(c).getString("json", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** False until the phone has sent the library once. */
    static boolean available(Context c) {
        JSONArray ex = root(c).optJSONArray("ex");
        return ex != null && ex.length() > 0;
    }

    /** "kg" or "lb". */
    static String unit(Context c) {
        return root(c).optString("u", "kg");
    }

    /** The groups in the order the phone shows them, only those that have exercises. */
    static List<String> groups(Context c) {
        List<String> out = new ArrayList<>();
        JSONObject r = root(c);
        JSONArray g = r.optJSONArray("groups");
        JSONArray ex = r.optJSONArray("ex");
        if (g == null || ex == null) return out;
        for (int i = 0; i < g.length(); i++) {
            String name = g.optString(i, "");
            if (name.isEmpty()) continue;
            for (int k = 0; k < ex.length(); k++) {
                JSONObject e = ex.optJSONObject(k);
                if (e != null && name.equals(e.optString("g", ""))) {
                    out.add(name);
                    break;
                }
            }
        }
        return out;
    }

    static List<Ex> inGroup(Context c, String group) {
        List<Ex> out = new ArrayList<>();
        JSONArray ex = root(c).optJSONArray("ex");
        if (ex == null) return out;
        for (int k = 0; k < ex.length(); k++) {
            JSONObject e = ex.optJSONObject(k);
            if (e == null || !group.equals(e.optString("g", ""))) continue;
            Ex x = new Ex();
            x.index = e.optInt("i", -1);
            x.id = e.optString("id", "");
            x.name = e.optString("n", "");
            x.group = group;
            x.step = e.optDouble("step", 2.5);
            JSONArray sets = e.optJSONArray("sets");
            for (int s = 0; sets != null && s < sets.length(); s++) {
                JSONArray one = sets.optJSONArray(s);
                if (one != null && one.length() >= 2) x.sets.add(new double[] {one.optDouble(0, 8), one.optDouble(1, 0)});
            }
            out.add(x);
        }
        return out;
    }
}
