package com.kyfitness.wear;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.ActivityRecognition;
import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionRequest;
import com.google.android.gms.location.DetectedActivity;
import java.util.ArrayList;
import java.util.List;

/**
 * The watch notices when you start a run, a ride or (if you allow it) a walk, and offers to record it. It uses Google Play services'
 * activity recognition on the watch, which needs no account or internet. After you have kept it up for a few minutes (a stroll to
 * the kitchen does not count) one notification on the wrist offers to record; tapping it opens that workout's setup page. It never
 * starts recording by itself. The phone runs the same detection, so each side tells the other when it has already asked: you get
 * one offer, not two.
 */
final class WatchDetect {
    static final String ACTION_CHECK = "com.kyfitness.wear.DETECT_CHECK";
    static final String ACTION_DISMISS = "com.kyfitness.wear.DETECT_DISMISS";
    /** Message to the phone saying this watch just offered, so the phone stays quiet. */
    static final String PATH_NOTIFIED = "/ky/detect/notified";
    private static final String PREFS = "ky_detect";
    private static final String TAG = "KyDetect";
    private static final String CHANNEL = "ky_detect";
    private static final int ID_NOTE = 7501;
    private static final int REQ_TRANSITION = 7502;
    private static final int REQ_CHECK = 7503;
    private static final int REQ_START = 7504;
    private static final int REQ_DISMISS = 7505;

    private static final int RUN_MIN = 3;
    private static final int RIDE_MIN = 4;
    private static final int WALK_MIN = 12;
    private static final long COOLDOWN_MS = 45 * 60_000L;
    private static final long DISMISSED_COOLDOWN_MS = 3 * 60 * 60_000L;

    private WatchDetect() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static PendingIntent transitionIntent(Context c) {
        return PendingIntent.getBroadcast(c, REQ_TRANSITION, new Intent(c, WatchDetectReceiver.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }

    private static PendingIntent checkIntent(Context c) {
        return PendingIntent.getBroadcast(c, REQ_CHECK, new Intent(c, WatchDetectReceiver.class).setAction(ACTION_CHECK),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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

    private static boolean wanted(Context c, int activity) {
        if (!WatchPrefs.detect(c)) return false;
        return activity != DetectedActivity.WALKING || WatchPrefs.detectWalks(c);
    }

    /** Matches the watch's detection to its settings. Safe to call whenever the app opens or a setting changes. */
    static void configure(Context c) {
        Context app = c.getApplicationContext();
        if (!WatchPrefs.detect(app)) {
            unregister(app);
            return;
        }
        if (app.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) return;
        boolean walks = WatchPrefs.detectWalks(app);
        List<ActivityTransition> list = new ArrayList<>();
        int[] types = walks
            ? new int[] {DetectedActivity.RUNNING, DetectedActivity.ON_BICYCLE, DetectedActivity.WALKING}
            : new int[] {DetectedActivity.RUNNING, DetectedActivity.ON_BICYCLE};
        for (int t : types) {
            list.add(new ActivityTransition.Builder().setActivityType(t).setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER).build());
            list.add(new ActivityTransition.Builder().setActivityType(t).setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT).build());
        }
        try {
            ActivityRecognition.getClient(app).requestActivityTransitionUpdates(new ActivityTransitionRequest(list), transitionIntent(app))
                .addOnFailureListener(e -> Log.w(TAG, "activity detection is not available on this watch: " + e));
        } catch (RuntimeException e) {
            Log.w(TAG, "activity detection skipped: " + e);
        }
    }

    private static void unregister(Context c) {
        try {
            ActivityRecognition.getClient(c).removeActivityTransitionUpdates(transitionIntent(c));
        } catch (RuntimeException ignored) {
            // not registered
        }
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(checkIntent(c));
        prefs(c).edit().remove("curType").remove("curEnterMs").apply();
    }

    static void onTransition(Context c, int activity, boolean enter, long enteredMs) {
        SharedPreferences p = prefs(c);
        if (sportFor(activity) == null) return;
        if (enter) {
            if (!wanted(c, activity)) return;
            p.edit().putInt("curType", activity).putLong("curEnterMs", enteredMs).apply();
            long when = Math.max(System.currentTimeMillis() + 15_000, enteredMs + minutesFor(activity) * 60_000L);
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, checkIntent(c));
        } else if (p.getInt("curType", -1) == activity) {
            p.edit().remove("curType").remove("curEnterMs").apply();
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(checkIntent(c));
        }
    }

    /** The phone offered (or you dismissed there): stay quiet for a while. */
    static void onPeerNotified(Context c) {
        prefs(c).edit().putLong("lastNotifyMs", System.currentTimeMillis()).putBoolean("lastDismissed", false).apply();
    }

    static void onCheck(Context c) {
        SharedPreferences p = prefs(c);
        int type = p.getInt("curType", -1);
        if (type == -1 || !wanted(c, type)) return;
        long now = System.currentTimeMillis();
        // A workout is already recording on the watch.
        if (WorkoutService.running) return;
        if (now - p.getLong("lastNotifyMs", 0) < (p.getBoolean("lastDismissed", false) ? DISMISSED_COOLDOWN_MS : COOLDOWN_MS)) return;
        long since = now - p.getLong("curEnterMs", now);
        if (since < minutesFor(type) * 60_000L - 30_000L) return;
        notifyStart(c, type, Math.max(1, since / 60_000L));
        p.edit().putLong("lastNotifyMs", now).putBoolean("lastDismissed", false).apply();
        PhoneLink.send(c, PATH_NOTIFIED, String.valueOf(now));
    }

    static void onDismissed(Context c) {
        prefs(c).edit().putBoolean("lastDismissed", true).putLong("lastNotifyMs", System.currentTimeMillis()).apply();
        PhoneLink.send(c, PATH_NOTIFIED, String.valueOf(System.currentTimeMillis()));
    }

    private static void notifyStart(Context c, int activity, long minutes) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Workout suggestions", NotificationManager.IMPORTANCE_DEFAULT));
        String sport = sportFor(activity);
        String doing = activity == DetectedActivity.RUNNING ? "running" : activity == DetectedActivity.ON_BICYCLE ? "cycling" : "walking";
        Intent open = new Intent(c, MainActivity.class)
            .setAction("ky.detect.start")
            .putExtra(MainActivity.EXTRA_START, sport)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent start = PendingIntent.getActivity(c, REQ_START, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent dismiss = PendingIntent.getBroadcast(c, REQ_DISMISS, new Intent(c, WatchDetectReceiver.class).setAction(ACTION_DISMISS),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_run)
            .setContentTitle("Looks like you're " + doing)
            .setContentText(minutes + " min so far. Tap to record.")
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setAutoCancel(true)
            .setTimeoutAfter(20 * 60_000L)
            .setContentIntent(start)
            .setDeleteIntent(dismiss)
            .addAction(0, "Record", start)
            .build();
        try {
            nm.notify(ID_NOTE, n);
        } catch (SecurityException ignored) {
            // notifications not allowed on the watch
        }
    }
}
