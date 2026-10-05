package com.kyfitness.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.LocalDate;

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
        return steps;
    }

    static synchronized int phoneToday(Context c) {
        SharedPreferences p = prefs(c);
        return today().equals(p.getString("day", "")) ? p.getInt("steps", 0) : 0;
    }

    static synchronized void setWatch(Context c, String day, int steps) {
        prefs(c).edit().putString("watchDay", day).putInt("watchSteps", steps).apply();
    }

    static synchronized int watchToday(Context c) {
        SharedPreferences p = prefs(c);
        return today().equals(p.getString("watchDay", "")) ? p.getInt("watchSteps", 0) : 0;
    }
}