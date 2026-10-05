package com.kyfitness.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.text.DateFormat;
import java.util.Date;

/**
 * The fasting notification and the widget's clock. While a fast runs, one quiet notification in the shade counts up on its own
 * (Android's chronometer, so nothing wakes the app every second) and shows the stage and the goal time. An alarm every half hour,
 * and at each stage change, refreshes it, the progress bar and the widget, and can post a short alert when a new stage starts.
 * Everything stays on the phone: this only reads the saved fast the web app handed over.
 */
final class FastingNotifier {
    static final String PREFS = "ky_fast";
    static final String ACTION_REFRESH = "com.kyfitness.app.FAST_REFRESH";
    private static final String CH_LIVE = "ky_fasting_live";
    private static final String CH_STAGE = "ky_fasting_stage";
    private static final int ID_LIVE = 7301;
    private static final int ID_STAGE = 7302;
    private static final int REQ_ALARM = 7310;
    private static final long HALF_HOUR_MS = 30 * 60 * 1000L;

    /** Hours at which the next stage starts (see FAST_STAGES in the web app). */
    static final double[] BOUNDS = {4, 12, 16, 20};
    static final String[] STAGES = {"Fed & anabolic", "Early fasting", "Fat burning", "Ketosis & cell repair", "Deep ketosis"};
    private static final String[] NOTES = {
        "Digesting your last meal.",
        "Insulin is dropping and stored glycogen is in use.",
        "Fat is now your main fuel.",
        "Ketones are rising and cell repair is starting.",
        "Deep ketosis. Listen to your body and break the fast if you feel unwell.",
    };

    private FastingNotifier() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static int stageIndex(double hours) {
        int i = 0;
        for (double b : BOUNDS) if (hours >= b) i++;
        return i;
    }

    static PendingIntent open(Context c, String action, int code) {
        Intent i = new Intent(c, MainActivity.class)
            .setAction("ky.fast." + code)
            .putExtra(LaunchBridge.EXTRA, action)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel live = new NotificationChannel(CH_LIVE, "Fasting timer", NotificationManager.IMPORTANCE_LOW);
        live.setDescription("A quiet timer in the notification shade while you fast");
        live.setShowBadge(false);
        nm.createNotificationChannel(live);
        NotificationChannel stage = new NotificationChannel(CH_STAGE, "Fasting stages", NotificationManager.IMPORTANCE_DEFAULT);
        stage.setDescription("A short alert when your fast reaches a new stage");
        nm.createNotificationChannel(stage);
    }

    /** Redraws the notification, widget and alarm from the saved fast. {@code fromAlarm} lets a new stage post its alert. */
    static void refresh(Context c, boolean fromAlarm) {
        Context app = c.getApplicationContext();
        SharedPreferences p = prefs(app);
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        boolean active = p.getBoolean("active", false) && p.getLong("startMs", 0) > 0;
        if (!active) {
            nm.cancel(ID_LIVE);
            cancelAlarm(app);
            FastingWidgetProvider.refreshAll(app);
            return;
        }
        long start = p.getLong("startMs", 0);
        float goal = p.getFloat("goalHours", 16f);
        double hours = Math.max(0, (System.currentTimeMillis() - start) / 3_600_000.0);
        int stage = stageIndex(hours);
        boolean allowed = NotificationManagerCompat.from(app).areNotificationsEnabled();

        if (allowed && p.getBoolean("live", true)) {
            ensureChannels(app);
            nm.notify(ID_LIVE, liveNotification(app, p, start, goal, hours, stage));
        } else {
            nm.cancel(ID_LIVE);
        }
        if (allowed && fromAlarm && p.getBoolean("stages", true) && stage > p.getInt("lastStage", 0)) {
            ensureChannels(app);
            nm.notify(ID_STAGE, stageAlert(app, hours, stage));
        }
        p.edit().putInt("lastStage", stage).apply();
        scheduleNext(app, start, goal, hours);
        FastingWidgetProvider.refreshAll(app);
    }

    private static String goalClock(long start, float goal) {
        return DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(start + (long) (goal * 3_600_000L)));
    }

    static String stageLine(long start, float goal, double hours, int stage) {
        if (hours >= goal) {
            long overMin = Math.round((hours - goal) * 60);
            return "Goal reached" + (overMin >= 1 ? " · +" + (overMin / 60) + "h " + (overMin % 60) + "m" : "") + " · " + STAGES[stage];
        }
        return STAGES[stage] + " · goal " + goalClock(start, goal);
    }

    private static Notification liveNotification(Context c, SharedPreferences p, long start, float goal, double hours, int stage) {
        int pct = (int) Math.min(100, Math.round(hours / Math.max(0.5, goal) * 100));
        String protocol = p.getString("protocol", "Fast");
        return new NotificationCompat.Builder(c, CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_fast)
            .setContentTitle("Fasting · " + protocol)
            .setContentText(stageLine(start, goal, hours, stage))
            .setWhen(start)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setColor(0xFFCBFF00)
            .setProgress(100, pct, false)
            .setContentIntent(open(c, "open:fasting", 7401))
            .addAction(0, "End fast", open(c, "fast:end", 7402))
            .build();
    }

    private static Notification stageAlert(Context c, double hours, int stage) {
        long whole = Math.round(hours);
        return new NotificationCompat.Builder(c, CH_STAGE)
            .setSmallIcon(R.drawable.ic_stat_fast)
            .setContentTitle(STAGES[stage] + " · " + whole + "h in")
            .setContentText(NOTES[stage])
            .setStyle(new NotificationCompat.BigTextStyle().bigText(NOTES[stage]))
            .setAutoCancel(true)
            .setColor(0xFFCBFF00)
            .setContentIntent(open(c, "open:fasting", 7403))
            .build();
    }

    private static PendingIntent alarmIntent(Context c) {
        Intent i = new Intent(c, FastingReceiver.class).setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(c, REQ_ALARM, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void cancelAlarm(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(c));
    }

    /** The next wake-up: the next stage or the goal, but never more than half an hour away so the progress stays fresh. */
    private static void scheduleNext(Context c, long start, float goal, double hours) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        double next = Double.MAX_VALUE;
        for (double b : BOUNDS) if (b > hours) next = Math.min(next, b);
        if (goal > hours) next = Math.min(next, goal);
        long now = System.currentTimeMillis();
        long at = now + HALF_HOUR_MS;
        if (next != Double.MAX_VALUE) at = Math.min(at, Math.max(now + 15_000L, start + (long) (next * 3_600_000L) + 5_000L));
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(c));
    }
}
