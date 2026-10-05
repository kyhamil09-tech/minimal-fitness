package com.kyfitness.wear;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

/**
 * Health Services holds all-day readings in the watch's sensor hub and hands them over in batches. About every half hour
 * this asks it to deliver what it has, waits a few seconds for the readings to arrive, and sends them to the phone, so the
 * phone never falls hours behind. It is an inexact alarm that may be deferred while the watch rests; that only delays a batch.
 */
public class VitalsAlarmReceiver extends BroadcastReceiver {
    private static final long INTERVAL_MS = 30 * 60_000;
    private static final int REQUEST = 4110;

    private static PendingIntent pending(Context c) {
        Intent i = new Intent(c, VitalsAlarmReceiver.class);
        return PendingIntent.getBroadcast(c.getApplicationContext(), REQUEST, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        am.setAndAllowWhileIdle(AlarmManager.RTC, System.currentTimeMillis() + INTERVAL_MS, pending(c));
    }

    static void cancel(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(pending(c));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!WatchPrefs.allDay(context)) return;
        final Context app = context.getApplicationContext();
        final PendingResult result = goAsync();
        WatchSteps.flush(app);
        // The delivery to the passive service is asynchronous: give it a moment, then send what arrived.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            VitalsSync.maybeSend(app, true);
            schedule(app);
            result.finish();
        }, 8_000);
    }
}
