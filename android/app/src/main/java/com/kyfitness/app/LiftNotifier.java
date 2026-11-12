package com.kyfitness.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * The workout in the notification shade and on the lock screen: the exercise and set you are on, and while you rest a countdown that
 * ticks by itself (Android's own chronometer, so nothing wakes the app every second). An alarm rings at the end of the rest even if the
 * app was put away or killed. Nothing here keeps the app running or reads anything: it only shows what the page handed over.
 */
final class LiftNotifier {
    private static final String CH_LIVE = "ky_lift_live";
    private static final String CH_REST = "ky_lift_rest";
    private static final int ID_LIVE = 7401;
    private static final int ID_REST = 7402;
    private static final int REQ_ALARM = 7410;
    static final String ACTION_REST_OVER = "com.kyfitness.app.LIFT_REST_OVER";

    private LiftNotifier() {}

    private static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel live = new NotificationChannel(CH_LIVE, "Workout in progress", NotificationManager.IMPORTANCE_LOW);
        live.setDescription("The set you are on and the rest countdown, in the notification shade and on the lock screen");
        live.setShowBadge(false);
        live.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(live);
        // One channel per choice, because Android fixes a channel's sound and vibration once it exists.
        for (String mode : new String[] {"vibrate", "sound", "both", "silent"}) {
            boolean quiet = mode.equals("silent");
            NotificationChannel rest = new NotificationChannel(CH_REST + "_" + mode, "Rest is over (" + mode + ")", quiet ? NotificationManager.IMPORTANCE_LOW : NotificationManager.IMPORTANCE_HIGH);
            rest.setDescription("A short alert when it is time for the next set");
            boolean buzz = mode.equals("vibrate") || mode.equals("both");
            boolean ring = mode.equals("sound") || mode.equals("both");
            rest.enableVibration(buzz);
            if (buzz) rest.setVibrationPattern(new long[] {0, 200, 100, 200});
            if (!ring) rest.setSound(null, null);
            nm.createNotificationChannel(rest);
        }
    }

    private static PendingIntent open(Context c) {
        Intent i = new Intent(c, MainActivity.class)
            .setAction("ky.lift.open")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, ID_LIVE, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent alarmIntent(Context c) {
        Intent i = new Intent(c, LiftRestReceiver.class).setAction(ACTION_REST_OVER);
        return PendingIntent.getBroadcast(c, REQ_ALARM, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Shows (or updates) the ongoing notification and sets the alarm for the end of the rest. */
    static void show(Context c, String title, String detail, long startedAt, long restEndsAt, boolean paused, String alert) {
        Context app = c.getApplicationContext();
        app.getSharedPreferences("ky_lift", Context.MODE_PRIVATE).edit().putString("alert", alert == null ? "vibrate" : alert).apply();
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        cancelAlarm(app);
        long now = System.currentTimeMillis();
        boolean resting = restEndsAt > now;
        if (resting) scheduleAlarm(app, restEndsAt);
        if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) return;
        ensureChannels(app);
        nm.cancel(ID_REST);
        NotificationCompat.Builder b = new NotificationCompat.Builder(app, CH_LIVE)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentTitle(title)
            .setContentText(resting ? "Rest · " + detail : detail)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(!paused)
            .setUsesChronometer(!paused)
            .setContentIntent(open(app));
        if (paused) {
            b.setSubText("Paused");
        } else if (resting) {
            b.setWhen(restEndsAt);
            if (Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(true);
        } else {
            b.setWhen(startedAt > 0 ? startedAt : now);
        }
        nm.notify(ID_LIVE, b.build());
    }

    /** The alarm fired: the rest is over. */
    static void restOver(Context c) {
        Context app = c.getApplicationContext();
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        // The countdown notification would sit at 0:00; the page puts the plain one back when it next updates.
        nm.cancel(ID_LIVE);
        if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) return;
        ensureChannels(app);
        String mode = app.getSharedPreferences("ky_lift", Context.MODE_PRIVATE).getString("alert", "vibrate");
        if (!mode.equals("sound") && !mode.equals("both") && !mode.equals("silent")) mode = "vibrate";
        Notification n = new NotificationCompat.Builder(app, CH_REST + "_" + mode)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentTitle("Rest is over")
            .setContentText("Time for your next set")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setTimeoutAfter(60_000)
            .setContentIntent(open(app))
            .build();
        nm.notify(ID_REST, n);
    }

    static void clear(Context c) {
        Context app = c.getApplicationContext();
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(ID_LIVE);
        nm.cancel(ID_REST);
        cancelAlarm(app);
    }

    private static void scheduleAlarm(Context c, long atMs) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = alarmIntent(c);
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
            else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
        }
    }

    private static void cancelAlarm(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(c));
    }
}
