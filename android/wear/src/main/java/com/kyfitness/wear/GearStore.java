package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** The shoes and bikes the phone offers (with their mileage), shown when you start a run or a ride on the watch. */
final class GearStore {
    private static final String FILE = "ky_gear";

    static final class Gear {
        final String id;
        final String name;
        /** "shoe" or "bike". */
        final String kind;
        /** Mileage against the limit, e.g. "412 / 800 km". */
        final String text;
        /** A short warning ("Time to replace these") or empty. */
        final String warn;
        /** The phone's current choice for this kind. */
        final boolean selected;

        Gear(String id, String name, String kind, String text, String warn, boolean selected) {
            this.id = id;
            this.name = name;
            this.kind = kind;
            this.text = text;
            this.warn = warn;
            this.selected = selected;
        }
    }

    private GearStore() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static void save(Context c, String json) {
        p(c).edit().putString("json", json == null ? "[]" : json).apply();
    }

    /** The gear of one kind ("shoe" or "bike"). */
    static List<Gear> list(Context c, String kind) {
        List<Gear> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(p(c).getString("json", "[]"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                if (!kind.equals(o.optString("kind", "shoe"))) continue;
                String id = o.optString("id", "");
                if (id.isEmpty()) continue;
                out.add(new Gear(id, o.optString("name", id), kind, o.optString("text", ""), o.optString("warn", ""), o.optBoolean("selected", false)));
            }
        } catch (Exception ignored) {
            // a damaged list shows nothing; the next one from the phone replaces it
        }
        return out;
    }
}
