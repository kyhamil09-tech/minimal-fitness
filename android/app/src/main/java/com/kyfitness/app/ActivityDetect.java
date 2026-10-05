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
import com.google.android.gms.location.ActivityRecognition;
import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionRequest;
import com.google.android.gms.location.DetectedActivity;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.util.ArrayList;
import java.util.List;

/**
 * Notices when you start a run, a ride or a walk without opening the app. Google Play services' activity recognition (on this
 * phone, no account, no internet) reports when you start and stop moving in one of those ways. After you have kept it up for a
 * few minutes (so a stroll to the kitchen does not count), one notification offers to record it; tapping it opens the Start
 * screen for that activity. It never starts recording by itself, and it stays quiet while a workout is already recording.
 */
final class ActivityDetect {
    static final String PREFS = "ky_autodetect";
    static final String ACTION_CHECK = "com.kyfitness.app.AUTODETECT_CHECK";
    static final String ACTION_DISMISS = "com.kyfitness.app.AUTODETECT_DISMISS";
    private static final String CHANNEL = "ky_autodetect";
    private static final int ID_NOTE = 7401;
    private static final int REQ_TRANSITION = 7402;
    private static final int REQ_CHECK = 7403;
    private static final int REQ_START = 7404;
    private static final int REQ_DISMISS = 7405;

    /** Minutes you must keep going before it asks. */
    private static final int RUN_MIN = 3;
    private static final int RIDE_MIN = 4;
    private static final int WALK_MIN = 12;
    /** Quiet time after a notification, and after you dismissed one. */
    private static final long COOLDOWN_MS = 45 * 60_000L;
    private static final long DISMISSED_COOLDOWN_MS = 3 * 60 * 60_000L;

    private ActivityDetect() {}

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static PendingIntent transitionIntent(Context c) {
        Intent i = new Intent(c, ActivityDetectReceiver.class);
        return PendingIntent.getBroadcast(c, REQ_TRANSITION, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }

    private static PendingIntent checkIntent(Context c) {
        Intent i = new Intent(c, ActivityDetectReceiver.class).setAction(ACTION_CHECK);
        return PendingIntent.getBroadcast(c, REQ_CHECK, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static String sportFor(int activity) {
        if (activity == DetectedActivity.RUNNING) return "Running";
        if (activity == DetectedActivity.ON_BICYCLE) return "Cycling";
        if (activity == DetectedActivity.WALKING) return "Walking";
        return null;
    }

    private static int minutesFor(int activity) {
        return activity == DetectedActivity.RUNNING ? RUN_MIN : activity == DetectedActivity.ON_BICYCLE ? RIDE_MIN : WALK_MIN;
    }

    private static boolean wanted(SharedPreferences p, int activity) {
        if (!p.getBoolean("enabled", false)) return false;
        return activity != DetectedActivity.WALKING || p.getBoolean("walks", false);
    }

    /** Turns detection on or off to match the settings. Safe to call every time the app opens. */
    static void configure(Context c, boolean enabled, boolean walks) {
        Context app = c.getApplicationContext();
        prefs(app).edit().putBoolean("enabled", enabled).putBoolean("walks", walks).apply();
        if (enabled) register(app, walks);
        else unregister(app);
    }

    static void register(Context c, boolean walks) {
        List<ActivityTransition> list = new ArrayList<>();
        int[] types = walks
            ? new int[] {DetectedActivity.RUNNING, DetectedActivity.ON_BICYCLE, DetectedActivity.WALKING}
            : new int[] {DetectedActivity.RUNNING, DetectedActivity.ON_BICYCLE};
        for (int t : types) {
            list.add(new ActivityTransition.Builder().setActivityType(t).setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER).build());
            list.add(new ActivityTransition.Builder().setActivityType(t).setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT).build());
        }
        try {
            ActivityRecognition.getClient(c).requestActivityTransitionUpdates(new ActivityTransitionRequest(list), transitionIntent(c));
        } catch (RuntimeException ignored) {
            // permission missing or Play services unavailable: the next app start tries again
        }
    }

    static void unregister(Context c) {
        try {
            ActivityRecognition.getClient(c).removeActivityTransitionUpdates(transitionIntent(c));
        } catch (RuntimeException ignored) {
            // not registered
        }
        cancelCheck(c);
        prefs(c).edit().remove("curType").remove("curEnterMs").apply();
    }

    private static void cancelCheck(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(checkIntent(c));
    }

    /** You started (or stopped) moving in a way we watch for. {@code enteredMs} is when, in wall-clock time. */
    static void onTransition(Context c, int activity, boolean enter, long enteredMs) {
        SharedPreferences p = prefs(c);
        if (sportFor(activity) == null) return;
        if (enter) {
            if (!wanted(p, activity)) return;
            p.edit().putInt("curType", activity).putLong("curEnterMs", enteredMs).apply();
            long when = Math.max(System.currentTimeMillis() + 15_000, enteredMs + minutesFor(activity) * 60_000L);
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, checkIntent(c));
        } else if (p.getInt("curType", -1) == activity) {
            p.edit().remove("curType").remove("curEnterMs").apply();
            cancelCheck(c);
        }
    }

    /** The timer fired: ask, but only if you are still at it, nothing is recording, and it has been quiet for a while. */
    static void onCheck(Context c) {
        SharedPreferences p = prefs(c);
        int type = p.getInt("curType", -1);
        if (type == -1 || !wanted(p, type)) return;
        long now = System.currentTimeMillis();
        if (SampleBuffer.isRecording()) return;
        if (now - p.getLong("lastNotifyMs", 0) < (p.getBoolean("lastDismissed", false) ? DISMISSED_COOLDOWN_MS : COOLDOWN_MS)) return;
        long since = now - p.getLong("curEnterMs", now);
        if (since < minutesFor(type) * 60_000L - 30_000L) return;
        notifyStart(c, type, Math.max(1, since / 60_000L));
        p.edit().putLong("lastNotifyMs", now).putBoolean("lastDismissed", false).apply();
        tellWatch(c);
    }

    static void onDismissed(Context c) {
        prefs(c).edit().putBoolean("lastDismissed", true).putLong("lastNotifyMs", System.currentTimeMillis()).apply();
        tellWatch(c);
    }

    /** The watch already offered to record: stay quiet for a while so you get one offer, not two. */
    static void onPeerNotified(Context c) {
        prefs(c).edit().putLong("lastNotifyMs", System.currentTimeMillis()).putBoolean("lastDismissed", false).apply();
    }

    /** Tells the paired watch that this phone just offered (or you dismissed the offer). No watch means nothing happens. */
    private static void tellWatch(Context c) {
        try {
            final Context app = c.getApplicationContext();
            Wearable.getNodeClient(app).getConnectedNodes().addOnSuccessListener(nodes -> {
                for (Node n : nodes) Wearable.getMessageClient(app).sendMessage(n.getId(), "/ky/detect/notified", new byte[0]);
            });
        } catch (RuntimeException ignored) {
            // no watch or Play services link
        }
    }

    private static void notifyStart(Context c, int activity, long minutes) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Workout suggestions", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Offers to record a run, ride or walk when your phone notices you started one");
            nm.createNotificationChannel(ch);
        }
        String sport = sportFor(activity);
        String doing = activity == DetectedActivity.RUNNING ? "running" : activity == DetectedActivity.ON_BICYCLE ? "cycling" : "walking";
        Intent open = new Intent(c, MainActivity.class)
            .setAction("ky.autodetect.start")
            .putExtra(LaunchBridge.EXTRA, "start:" + sport)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent start = PendingIntent.getActivity(c, REQ_START, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent dismiss = PendingIntent.getBroadcast(c, REQ_DISMISS, new Intent(c, ActivityDetectReceiver.class).setAction(ACTION_DISMISS),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Looks like you're " + doing)
            .setContentText("About " + minutes + " min so far. Tap to record it with the map and heart rate.")
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setAutoCancel(true)
            .setTimeoutAfter(20 * 60_000L)
            .setContentIntent(start)
            .setDeleteIntent(dismiss)
            .addAction(0, "Start recording", start)
            .build();
        try {
            nm.notify(ID_NOTE, n);
        } catch (SecurityException ignored) {
            // notifications not allowed
        }
    }
}
