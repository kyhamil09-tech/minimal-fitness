package com.kyfitness.wear;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import java.util.Calendar;

/**
 * Wrist-side nudges, off until switched on in the watch's settings: a buzz and a line when water is well behind the day's pace, and
 * when a meal time has passed with nothing logged. About every half hour it looks at the numbers the phone last sent (see
 * {@link Nudges} for the rules) and posts at most one note. The phone's own reminders still reach the watch as usual; these work
 * when the phone is not near.
 */
public class NudgeReceiver extends BroadcastReceiver {
    private static final long INTERVAL_MS = 30 * 60_000L;
    private static final int REQUEST = 4120;
    private static final String CHANNEL = "ky_nudges";
    private static final String FILE = "ky_nudge_state";

    private static PendingIntent pending(Context c) {
        Intent i = new Intent(c, NudgeReceiver.class);
        return PendingIntent.getBroadcast(c.getApplicationContext(), REQUEST, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Starts the half-hourly check when a nudge is on, and stops it when both are off. */
    static void schedule(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        if (!WatchPrefs.nudgeWater(c) && !WatchPrefs.nudgeMeal(c)) {
            am.cancel(pending(c));
            return;
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC, System.currentTimeMillis() + INTERVAL_MS, pending(c));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        Context app = context.getApplicationContext();
        try {
            check(app);
        } finally {
            schedule(app);
        }
    }

    private static String dayKey(Calendar cal) {
        return cal.get(Calendar.YEAR) + "-" + cal.get(Calendar.DAY_OF_YEAR);
    }

    private static void check(Context c) {
        if (Build_SDK() >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        long now = System.currentTimeMillis();
        Calendar cal = Calendar.getInstance();
        int dayMin = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
        SharedPreferences st = c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
        String today = dayKey(cal);
        if (!today.equals(st.getString("day", ""))) st.edit().putString("day", today).putInt("mask", 0).apply();
        int mask = st.getInt("mask", 0);

        // One note per check: a meal first, because it is the rarer one.
        if (WatchPrefs.nudgeMeal(c) && GlanceStore.eatKnown(c)) {
            boolean[] done = {(mask & 1) != 0, (mask & 2) != 0, (mask & 4) != 0};
            int slot = Nudges.mealSlotToNudge(now, dayMin, GlanceStore.eatEaten(c), GlanceStore.eatLastMs(c), done);
            if (slot >= 0) {
                st.edit().putInt("mask", mask | (1 << slot)).apply();
                post(c, 4121, Nudges.mealTitle(slot), Nudges.mealBody(slot), R.drawable.ic_eat);
                return;
            }
        }
        if (WatchPrefs.nudgeWater(c)) {
            long last = st.getLong("waterAt", 0L);
            if (Nudges.shouldNudgeWater(now, dayMin, WaterStore.totalMl(c), WaterStore.goalMl(c), last)) {
                st.edit().putLong("waterAt", now).apply();
                int left = Math.max(0, WaterStore.goalMl(c) - WaterStore.totalMl(c));
                post(c, 4122, "A glass of water?", WaterStore.format(left, WaterStore.imperial(c)) + " to go today. Add it from the Fuel tile.", R.drawable.ic_drop);
            }
        }
    }

    private static int Build_SDK() {
        return android.os.Build.VERSION.SDK_INT;
    }

    private static void post(Context c, int id, String title, String body, int icon) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Nudges", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("Gentle reminders for water and meals");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] {0, 120, 90, 120});
        nm.createNotificationChannel(ch);
        PendingIntent open = PendingIntent.getActivity(c, id, new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(c, CHANNEL)
            .setSmallIcon(icon)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build();
        nm.notify(id, n);
    }
}
