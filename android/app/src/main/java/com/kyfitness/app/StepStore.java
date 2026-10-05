package com.kyfitness.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.LocalDate;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * Daily step totals. The phone's step counter reports a running total since the phone booted, so the
 * total at the start of the day is remembered and today's steps are the difference. A reboot resets
 * the counter, which is detected (the value goes down) and carried over.
 */
final class StepStore {
    private static final String PREFS = "ky_steps";

    private StepStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String today() {
        return LocalDate.now().toString();
    }

    /** Records a step-counter reading and returns today's phone steps. */
    static synchronized int sample(Context c, float counter) {
        SharedPreferences p = prefs(c);
        String day = today();
        String storedDay = p.getString("day", "");
        float last = p.getFloat("last", -1f);
        float baseline = p.getFloat("baseline", 0f);
        float carry = p.getFloat("carry", 0f);

        if (!day.equals(storedDay)) {
            // First reading of a new day: anything counted up to the previous reading belongs to yesterday.
            baseline = (last >= 0 && counter >= last) ? last : 0f;
            carry = 0f;
        } else if (last >= 0 && counter < last) {
            // The phone rebooted: keep what was counted so far today and start from zero again.
            carry += Math.max(0f, last - baseline);
            baseline = 0f;
        }
        int steps = Math.max(0, Math.round(carry + (counter - baseline)));
        p.edit()
            .putString("day", day)
            .putFloat("last", counter)
            .putFloat("baseline", baseline)
            .putFloat("carry", carry)
            .putInt("steps", steps)
            .apply();
        appendLog(c, "log", steps);
        return steps;
    }

    /** Samples kept: about two weeks at one every 15 minutes, plus the extra ones taken whenever the app is opened. */
    private static final int MAX_LOG = 1600;

    /** Remembers "steps so far today" with the time, so steps in a period (a drive, say) can be taken out later. */
    private static void appendLog(Context c, String key, int steps) {
        try {
            SharedPreferences p = prefs(c);
            JSONArray log = new JSONArray(p.getString(key, "[]"));
            long now = System.currentTimeMillis();
            int n = log.length();
            if (n > 0) {
                JSONArray lastRow = log.getJSONArray(n - 1);
                // Same reading again within a minute: nothing new to keep.
                if (lastRow.getInt(1) == steps && now - lastRow.getLong(0) < 60_000L) return;
            }
            log.put(new JSONArray().put(now).put(steps));
            if (log.length() > MAX_LOG) {
                JSONArray trimmed = new JSONArray();
                for (int i = log.length() - MAX_LOG; i < log.length(); i++) trimmed.put(log.get(i));
                log = trimmed;
            }
            p.edit().putString(key, log.toString()).apply();
        } catch (JSONException ignored) {
            // a damaged log is simply started again by the next sample
            prefs(c).edit().remove(key).apply();
        }
    }

    /** The saved samples as [[epoch ms, steps so far that day], ...], oldest first. */
    static synchronized JSONArray log(Context c, String key) {
        try {
            return new JSONArray(prefs(c).getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static synchronized int phoneToday(Context c) {
        SharedPreferences p = prefs(c);
        return today().equals(p.getString("day", "")) ? p.getInt("steps", 0) : 0;
    }

    static synchronized void setWatch(Context c, String day, int steps) {
        prefs(c).edit().putString("watchDay", day).putInt("watchSteps", steps).apply();
        if (today().equals(day)) appendLog(c, "wlog", steps);
    }

    static synchronized int watchToday(Context c) {
        SharedPreferences p = prefs(c);
        return today().equals(p.getString("watchDay", "")) ? p.getInt("watchSteps", 0) : 0;
    }
}