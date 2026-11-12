package com.kyfitness.wear;

import android.content.Context;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * A strength session the watch runs entirely on its own, for when the phone was left behind. It does what the phone's logger does for
 * the watch's set screen (done, reps, weight, add or remove a set, move between exercises, rest), keeps the sets, and hands them to
 * the phone with the finished workout so they land in your strength log. When the phone is there, the phone runs the session instead
 * and none of this is used.
 */
final class LocalStrength {
    static final class Row {
        int reps = 8;
        double weight = 0;
        boolean done = false;
    }

    static final class Item {
        String id = "";
        String name = "";
        double step = 2.5;
        final List<Row> rows = new ArrayList<>();
    }

    /** The session in progress, or null. */
    static volatile LocalStrength active = null;

    private final List<Item> items = new ArrayList<>();
    private int cursor = 0;
    private final String unit;
    private int restLen = 90;
    private long restEndsAt = 0;

    private LocalStrength(String unit) {
        this.unit = unit;
    }

    // ---- starting ----

    /** Starts a session from exercises already in hand (the logic tests use this; the watch uses {@link #maybeStart}). */
    static synchronized LocalStrength startWith(String unit, List<Item> items) {
        LocalStrength s = new LocalStrength(unit);
        s.items.addAll(items);
        if (s.items.isEmpty()) s.addBlankExercise();
        active = s;
        s.publish();
        return s;
    }

    /** Starts a session from the routine picked on the watch (or an empty one), when the phone has not taken over. */
    static synchronized void maybeStart(Context c, String routineId) {
        if (active != null || WorkoutState.linkedToPhone || WorkoutState.strength != null) return;
        if (!WorkoutState.active || !"Strength".equals(WorkoutState.type)) return;
        RoutineStore.Detail d = RoutineStore.detail(c, routineId);
        // The phone's unit for weights: from the exercise list when it has sent one, else from the routines.
        LocalStrength s = new LocalStrength(ExerciseLibStore.available(c) ? ExerciseLibStore.unit(c) : d.unit);
        s.items.addAll(d.items);
        if (s.items.isEmpty()) s.addBlankExercise();
        active = s;
        s.publish();
    }

    /**
     * Takes a session over from the phone when the phone has stopped answering the watch's buttons: the watch carries on with what it
     * was showing. The exercise on show keeps its sets exactly; the others come over with their set counts but not their numbers (the
     * phone has those), so nothing is invented for them.
     */
    static synchronized boolean adopt(Context c, WorkoutState.Strength s) {
        if (active != null || s == null || s.exNames.length == 0) return false;
        LocalStrength t = new LocalStrength(s.unit);
        t.restLen = s.restLen > 0 ? s.restLen : 90;
        t.restEndsAt = s.restEndsAt;
        for (int i = 0; i < s.exNames.length; i++) {
            Item it = new Item();
            it.name = s.exNames[i];
            it.step = s.step > 0 ? s.step : ("lb".equals(s.unit) ? 5 : 2.5);
            it.id = idForName(c, it.name);
            if (i == s.ex && s.setReps.length > 0) {
                for (int k = 0; k < s.setReps.length; k++) {
                    Row r = new Row();
                    r.reps = Math.max(1, s.setReps[k]);
                    r.weight = k < s.setWeight.length ? s.setWeight[k] : 0;
                    r.done = k < s.setDone.length && s.setDone[k];
                    it.rows.add(r);
                }
            } else {
                int n = Math.max(1, i < s.exTotal.length ? s.exTotal[i] : 3);
                for (int k = 0; k < n; k++) it.rows.add(new Row());
            }
            t.items.add(it);
        }
        t.cursor = Math.max(0, Math.min(t.items.size() - 1, s.ex));
        active = t;
        t.publish();
        return true;
    }

    private static String idForName(Context c, String name) {
        if (c == null || name == null || !ExerciseLibStore.available(c)) return "";
        for (String g : ExerciseLibStore.groups(c)) {
            for (ExerciseLibStore.Ex e : ExerciseLibStore.inGroup(c, g)) if (name.equals(e.name)) return e.id;
        }
        return "";
    }

    /** True when the exercise on show is the last one of the session. */
    static synchronized boolean onLastExercise() {
        LocalStrength s = active;
        return s != null && s.cursor >= s.items.size() - 1;
    }

    /** Adds an empty exercise at the end and goes to it. */
    static synchronized void addBlank() {
        LocalStrength s = active;
        if (s == null) return;
        s.addBlankExercise();
        s.cursor = s.items.size() - 1;
        s.publish();
    }

    /** Adds an exercise from the phone's library, with the sets you last did (or three sets of eight), and goes to it. */
    static synchronized void addExercise(String id, String name, double step, java.util.List<double[]> lastSets) {
        LocalStrength s = active;
        if (s == null) return;
        for (int i = 0; i < s.items.size(); i++) {
            if (!id.isEmpty() && id.equals(s.items.get(i).id)) {
                s.cursor = i;
                s.publish();
                return;
            }
        }
        Item it = new Item();
        it.id = id;
        it.name = name;
        it.step = step > 0 ? step : ("lb".equals(s.unit) ? 5 : 2.5);
        for (double[] one : lastSets) {
            Row r = new Row();
            r.reps = (int) Math.max(1, Math.round(one[0]));
            r.weight = Math.max(0, one[1]);
            it.rows.add(r);
        }
        if (it.rows.isEmpty()) for (int i = 0; i < 3; i++) it.rows.add(new Row());
        s.items.add(it);
        s.cursor = s.items.size() - 1;
        s.publish();
    }

    private void addBlankExercise() {
        Item it = new Item();
        it.name = "Exercise " + (items.size() + 1);
        it.step = "lb".equals(unit) ? 5 : 2.5;
        for (int i = 0; i < 3; i++) {
            Row r = new Row();
            r.reps = 10;
            it.rows.add(r);
        }
        items.add(it);
    }

    // ---- buttons ----

    private static int currentSet(Item it) {
        for (int i = 0; i < it.rows.size(); i++) if (!it.rows.get(i).done) return i;
        return Math.max(0, it.rows.size() - 1);
    }

    private int nextWithSets(int from) {
        for (int i = from + 1; i < items.size(); i++) if (hasOpenSet(items.get(i))) return i;
        for (int i = 0; i < from; i++) if (hasOpenSet(items.get(i))) return i;
        return from;
    }

    private static boolean hasOpenSet(Item it) {
        for (Row r : it.rows) if (!r.done) return true;
        return false;
    }

    /** Applies a button press from the set screen and updates what the screen shows. */
    static synchronized void apply(String action, int delta, int index) {
        LocalStrength s = active;
        if (s == null) return;
        s.applyInternal(action, delta, index);
        s.publish();
    }

    private void applyInternal(String action, int delta, int index) {
        if (items.isEmpty()) return;
        cursor = Math.max(0, Math.min(items.size() - 1, cursor));
        Item it = items.get(cursor);
        if (it.rows.isEmpty()) {
            it.rows.add(new Row());
        }
        int si = currentSet(it);
        Row row = it.rows.get(si);
        long now = System.currentTimeMillis();
        switch (action) {
            case "done": {
                row.done = !row.done;
                WorkoutState.restBuzzed = false;
                if (row.done) {
                    restEndsAt = now + restLen * 1000L;
                    if (!hasOpenSet(it)) cursor = nextWithSets(cursor);
                } else {
                    restEndsAt = 0;
                }
                break;
            }
            case "reps":
                row.reps = Math.max(1, Math.min(99, row.reps + delta));
                break;
            case "weight":
                row.weight = Math.max(0, Math.min(999, Math.round((row.weight + delta * it.step) * 100.0) / 100.0));
                break;
            case "addset": {
                Row last = it.rows.get(it.rows.size() - 1);
                Row r = new Row();
                r.reps = last.reps;
                r.weight = last.weight;
                it.rows.add(r);
                break;
            }
            case "delset": {
                if (it.rows.size() <= 1) break;
                int drop = it.rows.size() - 1;
                for (int i = it.rows.size() - 1; i >= 0; i--) {
                    if (!it.rows.get(i).done) {
                        drop = i;
                        break;
                    }
                }
                it.rows.remove(drop);
                break;
            }
            case "next":
                // On the last exercise, Next adds another one to fill in, so a session with no routine can keep going.
                // (Next on the last exercise is handled by the screen, which opens the exercise picker when it can.)
                if (cursor == items.size() - 1) addBlankExercise();
                cursor = Math.min(items.size() - 1, cursor + 1);
                break;
            case "prev":
                cursor = Math.max(0, cursor - 1);
                break;
            case "jump":
                cursor = Math.max(0, Math.min(items.size() - 1, index));
                break;
            case "skiprest":
                restEndsAt = 0;
                break;
            case "rest":
                if (restEndsAt > now) restEndsAt = Math.max(now, restEndsAt + delta * 1000L);
                break;
            default:
                break;
        }
    }

    // ---- what the screen shows ----

    private void publish() {
        cursor = Math.max(0, Math.min(items.size() - 1, cursor));
        Item it = items.get(cursor);
        int si = currentSet(it);
        Row row = it.rows.isEmpty() ? new Row() : it.rows.get(si);

        WorkoutState.Strength st = new WorkoutState.Strength();
        st.ex = cursor;
        st.exCount = items.size();
        st.name = it.name;
        st.setIdx = si;
        st.setCount = it.rows.size();
        st.reps = row.reps;
        st.weight = row.weight;
        st.unit = unit;
        st.step = it.step;
        st.done = row.done;
        st.restEndsAt = restEndsAt;
        st.restLen = restLen;
        int n = it.rows.size();
        st.setReps = new int[n];
        st.setWeight = new double[n];
        st.setDone = new boolean[n];
        for (int i = 0; i < n; i++) {
            st.setReps[i] = it.rows.get(i).reps;
            st.setWeight[i] = it.rows.get(i).weight;
            st.setDone[i] = it.rows.get(i).done;
        }
        int m = items.size();
        st.exNames = new String[m];
        st.exDone = new int[m];
        st.exTotal = new int[m];
        int doneSets = 0;
        double volume = 0;
        for (int i = 0; i < m; i++) {
            Item x = items.get(i);
            st.exNames[i] = x.name;
            st.exTotal[i] = x.rows.size();
            for (Row r : x.rows) {
                if (r.done) {
                    st.exDone[i]++;
                    doneSets++;
                    volume += r.reps * r.weight;
                }
            }
        }
        st.doneSets = doneSets;
        st.volume = volume > 0 ? String.format(Locale.getDefault(), "%,.0f %s", volume, unit) : "";
        int nx = nextWithSets(cursor);
        st.next = nx != cursor ? items.get(nx).name : (cursor + 1 < m ? items.get(cursor + 1).name : "");
        WorkoutState.strength = st;
    }

    // ---- handing the sets to the phone ----

    /** The exercises with at least one set done: [{id, n, sets: [[reps, weightKg]]}]. */
    static synchronized JSONArray exercisesJson() throws JSONException {
        JSONArray out = new JSONArray();
        LocalStrength s = active;
        if (s == null) return out;
        double toKg = "lb".equals(s.unit) ? 0.45359237 : 1.0;
        for (Item it : s.items) {
            JSONArray sets = new JSONArray();
            for (Row r : it.rows) {
                if (!r.done) continue;
                JSONArray one = new JSONArray();
                one.put(r.reps);
                one.put(Math.round(r.weight * toKg * 100.0) / 100.0);
                sets.put(one);
            }
            if (sets.length() == 0) continue;
            JSONObject o = new JSONObject();
            o.put("id", it.id);
            o.put("n", it.name);
            o.put("sets", sets);
            out.put(o);
        }
        return out;
    }

    static synchronized void clear() {
        active = null;
    }
}
