package com.kyfitness.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.LocalDate;

/**
 * Today's calories as the Eat widget and the Quick Settings tile show them. The app's own log is the real record; this holds the
 * numbers it last reported. After midnight, until the app reports again, the day starts from nothing eaten.
 */
final class EatStore {
    private static final String PREFS = "ky_eat";

    private EatStore() {}

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void set(Context c, int eaten, int goal, int left, int proteinG, int proteinGoal) {
        p(c).edit()
            .putString("day", LocalDate.now().toString())
            .putInt("eaten", eaten)
            .putInt("goal", goal)
            .putInt("left", left)
            .putInt("p", proteinG)
            .putInt("pGoal", proteinGoal)
            .apply();
    }

    private static boolean fresh(SharedPreferences prefs) {
        return LocalDate.now().toString().equals(prefs.getString("day", ""));
    }

    static boolean known(Context c) {
        return p(c).contains("goal");
    }

    static int goal(Context c) {
        return Math.max(0, p(c).getInt("goal", 0));
    }

    static int eaten(Context c) {
        SharedPreferences prefs = p(c);
        return fresh(prefs) ? prefs.getInt("eaten", 0) : 0;
    }

    /** Calories left (negative when past the plan). */
    static int left(Context c) {
        SharedPreferences prefs = p(c);
        return fresh(prefs) ? prefs.getInt("left", prefs.getInt("goal", 0)) : prefs.getInt("goal", 0);
    }

    static int protein(Context c) {
        SharedPreferences prefs = p(c);
        return fresh(prefs) ? prefs.getInt("p", 0) : 0;
    }

    static int proteinGoal(Context c) {
        return Math.max(0, p(c).getInt("pGoal", 0));
    }

    static String number(int n) {
        return String.format(java.util.Locale.US, "%,d", n);
    }
}
