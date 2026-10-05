package com.kyfitness.wear;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import java.util.Calendar;

/** The smart alarm's settings (sent from the phone) and its schedule: the watch starts listening at the window's start. */
final class SmartAlarm {
    static final String ACTION_START = "com.kyfitness.wear.SMART_ALARM_START";
    private static final String FILE = "ky_smart_alarm";
    private static final int REQ = 8801;

    private SmartAlarm() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static boolean enabled(Context c) { return p(c).getBoolean("enabled", false); }
    /** The latest time you want to be woken, in minutes after midnight. */
    static int wakeMin(Context c) { return p(c).getInt("wakeMin", 7 * 60); }
    /** How long before that the watch may wake you if it sees light sleep. */
    static int windowMin(Context c) { return p(c).getInt("windowMin", 30); }

    static void configure(Context c, boolean enabled, int wakeMin, int windowMin) {
        p(c).edit().putBoolean("enabled", enabled).putInt("wakeMin", wakeMin).putInt("windowMin", Math.max(10, Math.min(60, windowMin))).apply();
        schedule(c);
    }

    private static PendingIntent pending(Context c) {
        Intent i = new Intent(c, SmartAlarmReceiver.class).setAction(ACTION_START);
        return PendingIntent.getBroadcast(c, REQ, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Millis of the next window start after {@code now}. */
    static long nextWindowStart(long now, int wakeMin, int windowMin) {
        int startMin = ((wakeMin - windowMin) % 1440 + 1440) % 1440;
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now);
        cal.set(Calendar.HOUR_OF_DAY, startMin / 60);
        cal.set(Calendar.MINUTE, startMin % 60);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= now) cal.add(Calendar.DAY_OF_YEAR, 1);
        return cal.getTimeInMillis();
    }

    /** The millis of the wake time that belongs to a window starting at {@code windowStart}. */
    static long wakeTimeFor(long windowStart, int windowMin) {
        return windowStart + windowMin * 60_000L;
    }

    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.cancel(pending(c));
        if (!enabled(c)) return;
        long at = nextWindowStart(System.currentTimeMillis(), wakeMin(c), windowMin(c));
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(c));
        } catch (SecurityException e) {
            // Exact alarms not allowed: fall back to an inexact one that may start a little late.
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(c));
        }
    }
}
