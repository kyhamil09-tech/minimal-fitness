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
import android.os.SystemClock;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.text.DateFormat;
import java.util.Date;

/**
 * The fasting notification and the widget's clock. While a fast runs, one quiet notification in the shade counts up on its own
 * (Android's chronometer, so nothing wakes the app every second) and shows the stage and the goal time. A short alarm chain redraws
 * the progress bar and the widget (every 15 seconds while the screen is on, every 2 minutes while it is off, and at each stage
 * change), and can post a short alert when a new stage starts.
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
    /** How often the notification is redrawn: often while the screen is on (so you can watch the bar fill), seldom while it is off. */
    private static final long SCREEN_ON_MS = 15 * 1000L;
    private static final long SCREEN_OFF_MS = 2 * 60 * 1000L;

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
        try {
            android.service.quicksettings.TileService.requestListeningState(app, new android.content.ComponentName(app, FastTileService.class));
        } catch (RuntimeException ignored) {
            // the tile is not added: nothing to refresh
        }
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

    private static String progressLine(float goal, double hours) {
        int pct = (int) Math.min(100, Math.round(hours / Math.max(0.5, goal) * 100));
        if (hours >= goal) return "Goal reached";
        long leftMin = Math.round((goal - hours) * 60);
        return pct + "% · " + (leftMin / 60) + "h " + (leftMin % 60) + "m to go";
    }

    /**
     * Android 16 and later draw this as a "live update" with a real progress track: one segment per fasting stage, a marker at your
     * goal, and a short chip in the status bar. Anything older, or any failure, falls back to the plain progress bar below.
     */
    private static Notification liveNotification(Context c, SharedPreferences p, long start, float goal, double hours, int stage) {
        // The glow card (the default) is drawn by the app in its own colors; the system live update is the other choice.
        if (p.getBoolean("glow", true)) {
            try {
                return liveGlow(c, p, start, goal, hours, stage);
            } catch (RuntimeException ignored) {
                // fall through to the standard notification
            }
        }
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                return liveStyled(c, p, start, goal, hours, stage);
            } catch (Throwable ignored) {
                // fall through to the standard notification
            }
        }
        return liveCompat(c, p, start, goal, hours, stage);
    }


    /** "6h 10m to go". */
    private static String timeLeft(float goal, double hours) {
        long m = Math.max(0, Math.round((goal - hours) * 60));
        return (m / 60) + "h " + String.format(java.util.Locale.US, "%02d", m % 60) + "m to go";
    }

    /** "Next: Fat burning in 1h 12m", or a line about the goal once the last stage is reached. */
    private static String nextLine(double hours, int stage) {
        if (stage >= BOUNDS.length) return "Deep ketosis. Break the fast if you feel unwell.";
        long mins = Math.max(1, Math.round((BOUNDS[stage] - hours) * 60));
        return "Next: " + STAGES[stage + 1] + " in " + (mins / 60) + "h " + String.format(java.util.Locale.US, "%02d", mins % 60) + "m";
    }

    /**
     * The glow card: a live clock that ticks by itself (Android's own chronometer, so nothing wakes the app each second), the stage
     * and the goal, a stage bar painted in the app's accent color that fills as the hours pass, and (opened out) a thin bar for the
     * current hour that moves where the big bar barely does. The app redraws it every 15 seconds while the screen is on.
     */
    private static Notification liveGlow(Context c, SharedPreferences p, long start, float goal, double hours, int stage) {
        final int accent = p.getInt("accent", 0xFFFF5500);
        final String protocol = p.getString("protocol", "Fast");
        final long base = SystemClock.elapsedRealtime() - Math.max(0, System.currentTimeMillis() - start);
        final int stageCol = FastBarRenderer.stageColor(stage, accent);
        final String stageText = STAGES[stage].toUpperCase(java.util.Locale.getDefault());
        final int pct = (int) Math.min(100, Math.round(hours / Math.max(0.5, goal) * 100));
        final String sub = hours >= goal ? "Goal reached" : progressLine(goal, hours);
        final String left = hours >= goal ? "Goal reached" : timeLeft(goal, hours);

        RemoteViews small = new RemoteViews(c.getPackageName(), R.layout.notif_fast_small);
        RemoteViews big = new RemoteViews(c.getPackageName(), R.layout.notif_fast_big);
        for (RemoteViews rv : new RemoteViews[] {small, big}) {
            boolean isBig = rv == big;
            rv.setChronometer(R.id.fast_clock, base, null, true);
            rv.setTextColor(R.id.fast_clock, 0xFFFFFFFF);
            rv.setTextViewText(R.id.fast_stage, stageText);
            rv.setTextColor(R.id.fast_stage, stageCol);
            rv.setTextViewText(R.id.fast_sub, isBig ? left : sub);
            rv.setImageViewBitmap(R.id.fast_glow, FastBarRenderer.glow(accent, isBig ? 220 : 150, isBig ? 96 : 64));
            rv.setImageViewBitmap(R.id.fast_bar, FastBarRenderer.bar(accent, hours, goal, 720, isBig ? 76 : 56));
            if (isBig) {
                rv.setTextViewText(R.id.fast_protocol, protocol.toUpperCase(java.util.Locale.getDefault()));
                rv.setTextColor(R.id.fast_protocol, accent);
                rv.setTextViewText(R.id.fast_pct, pct + "%");
                rv.setTextColor(R.id.fast_pct, accent);
                rv.setTextViewText(R.id.fast_next, nextLine(hours, stage));
                rv.setTextViewText(R.id.fast_goal, "Goal " + goalClock(start, goal));
                rv.setImageViewBitmap(R.id.fast_hour, FastBarRenderer.hourBar(accent, hours, 640, 56));
            }
        }
        return new NotificationCompat.Builder(c, CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_fast)
            .setContentTitle("Fasting · " + protocol)
            .setContentText(stageLine(start, goal, hours, stage))
            .setColor(accent)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .setShowWhen(false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(open(c, "open:fasting", 7401))
            .addAction(0, "End fast", open(c, "fast:end", 7402))
            .build();
    }

    @android.annotation.SuppressLint("NewApi")
    private static Notification liveStyled(Context c, SharedPreferences p, long start, float goal, double hours, int stage) {
        final int[] colors = {0xFF8AB4F8, 0xFF78D9EC, 0xFFCBFF00, 0xFFFCAD70, 0xFFC58AF9};
        java.util.List<Notification.ProgressStyle.Segment> segs = new java.util.ArrayList<>();
        double prev = 0;
        double[] ends = {BOUNDS[0], BOUNDS[1], BOUNDS[2], BOUNDS[3], Math.max(24, Math.ceil(goal) + 4)};
        for (int i = 0; i < ends.length; i++) {
            segs.add(new Notification.ProgressStyle.Segment((int) Math.round((ends[i] - prev) * 60)).setColor(colors[i]));
            prev = ends[i];
        }
        java.util.List<Notification.ProgressStyle.Point> points = new java.util.ArrayList<>();
        // A tick where each stage starts, in that stage's color, and a white one at your goal.
        for (int i = 0; i < BOUNDS.length; i++) {
            if (Math.abs(BOUNDS[i] - goal) < 0.01) continue;
            points.add(new Notification.ProgressStyle.Point((int) Math.round(BOUNDS[i] * 60)).setColor(colors[i + 1]));
        }
        points.add(new Notification.ProgressStyle.Point((int) Math.round(Math.min(goal, ends[4]) * 60)).setColor(0xFFFFFFFF));
        Notification.ProgressStyle style = new Notification.ProgressStyle()
            .setStyledByProgress(false)
            .setProgressSegments(segs)
            .setProgressPoints(points)
            .setProgress((int) Math.round(Math.min(hours, ends[4]) * 60))
            // A bolt rides the front of the fill, a ring marks the start and a flag the goal.
            .setProgressTrackerIcon(android.graphics.drawable.Icon.createWithResource(c, R.drawable.ic_fast_tracker))
            .setProgressStartIcon(android.graphics.drawable.Icon.createWithResource(c, R.drawable.ic_fast_start))
            .setProgressEndIcon(android.graphics.drawable.Icon.createWithResource(c, R.drawable.ic_fast_goal));
        long wholeHours = (long) hours;
        Notification.Builder b = new Notification.Builder(c, CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_fast)
            .setContentTitle("Fasting · " + p.getString("protocol", "Fast"))
            .setContentText(stageLine(start, goal, hours, stage))
            .setSubText(progressLine(goal, hours))
            .setWhen(start)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(p.getInt("accent", 0xFFFF5500))
            .setStyle(style)
            .setShortCriticalText(wholeHours + "h" + String.format(java.util.Locale.US, "%02d", Math.round((hours - wholeHours) * 60) % 60))
            .setContentIntent(open(c, "open:fasting", 7401))
            .addAction(new Notification.Action.Builder(null, "End fast", open(c, "fast:end", 7402)).build());
        b.getExtras().putBoolean("android.requestPromotedOngoing", true);
        return b.build();
    }

    private static Notification liveCompat(Context c, SharedPreferences p, long start, float goal, double hours, int stage) {
        int pct = (int) Math.min(1000, Math.round(hours / Math.max(0.5, goal) * 1000));
        String protocol = p.getString("protocol", "Fast");
        return new NotificationCompat.Builder(c, CH_LIVE)
            .setSubText(progressLine(goal, hours))
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
            .setColor(p.getInt("accent", 0xFFFF5500))
            .setProgress(1000, pct, false)
            .setContentIntent(open(c, "open:fasting", 7401))
            .addAction(0, "End fast", open(c, "fast:end", 7402))
            .build();
    }

    private static Notification stageAlert(Context c, double hours, int stage) {
        final int accent = prefs(c).getInt("accent", 0xFFFF5500);
        long whole = Math.round(hours);
        return new NotificationCompat.Builder(c, CH_STAGE)
            .setSmallIcon(R.drawable.ic_stat_fast)
            .setContentTitle(STAGES[stage] + " · " + whole + "h in")
            .setContentText(NOTES[stage])
            .setStyle(new NotificationCompat.BigTextStyle().bigText(NOTES[stage]))
            .setAutoCancel(true)
            .setColor(accent)
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

    /**
     * The next wake-up: soon while the screen is on, so the bar visibly fills, and later while it is off. It never passes the next
     * stage or the goal, so those show on time.
     */
    private static void scheduleNext(Context c, long start, float goal, double hours) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        double next = Double.MAX_VALUE;
        for (double b : BOUNDS) if (b > hours) next = Math.min(next, b);
        if (goal > hours) next = Math.min(next, goal);
        long now = System.currentTimeMillis();
        android.os.PowerManager pm = (android.os.PowerManager) c.getSystemService(Context.POWER_SERVICE);
        boolean screenOn = pm != null && pm.isInteractive();
        long at = now + (screenOn ? SCREEN_ON_MS : SCREEN_OFF_MS);
        if (next != Double.MAX_VALUE) at = Math.min(at, Math.max(now + 5_000L, start + (long) (next * 3_600_000L) + 2_000L));
        PendingIntent pi = alarmIntent(c);
        // An exact alarm keeps the 15 second rhythm even when the phone is resting; without that permission it is a little less exact.
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }
}
