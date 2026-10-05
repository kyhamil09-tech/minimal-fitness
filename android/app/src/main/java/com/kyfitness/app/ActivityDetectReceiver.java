package com.kyfitness.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import com.google.android.gms.location.ActivityTransitionEvent;
import com.google.android.gms.location.ActivityTransitionResult;

/** Receives start and stop of running, cycling and walking from Google Play services, the check timer, and restarts. */
public class ActivityDetectReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (ActivityDetect.ACTION_CHECK.equals(action)) {
            ActivityDetect.onCheck(context);
            return;
        }
        if (ActivityDetect.ACTION_DISMISS.equals(action)) {
            ActivityDetect.onDismissed(context);
            return;
        }
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            if (ActivityDetect.prefs(context).getBoolean("enabled", false)) {
                ActivityDetect.register(context.getApplicationContext(), ActivityDetect.prefs(context).getBoolean("walks", false));
            }
            return;
        }
        if (!ActivityTransitionResult.hasResult(intent)) return;
        ActivityTransitionResult result = ActivityTransitionResult.extractResult(intent);
        if (result == null) return;
        long nowMs = System.currentTimeMillis();
        long nowElapsedNs = SystemClock.elapsedRealtimeNanos();
        for (ActivityTransitionEvent e : result.getTransitionEvents()) {
            // The event may be a little old: convert its time since boot into wall-clock time.
            long when = nowMs - Math.max(0, (nowElapsedNs - e.getElapsedRealTimeNanos()) / 1_000_000L);
            ActivityDetect.onTransition(context.getApplicationContext(), e.getActivityType(), e.getTransitionType() == 0, when);
        }
    }
}
