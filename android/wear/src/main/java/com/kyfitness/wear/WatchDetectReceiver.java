package com.kyfitness.wear;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import com.google.android.gms.location.ActivityTransitionEvent;
import com.google.android.gms.location.ActivityTransitionResult;

/** Receives start and stop of running, cycling and walking from Google Play services on the watch, and the check timer. */
public class WatchDetectReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (WatchDetect.ACTION_CHECK.equals(action)) {
            WatchDetect.onCheck(context.getApplicationContext());
            return;
        }
        if (WatchDetect.ACTION_DISMISS.equals(action)) {
            WatchDetect.onDismissed(context.getApplicationContext());
            return;
        }
        if (!ActivityTransitionResult.hasResult(intent)) return;
        ActivityTransitionResult result = ActivityTransitionResult.extractResult(intent);
        if (result == null) return;
        long nowMs = System.currentTimeMillis();
        long nowNs = SystemClock.elapsedRealtimeNanos();
        for (ActivityTransitionEvent e : result.getTransitionEvents()) {
            long when = nowMs - Math.max(0, (nowNs - e.getElapsedRealTimeNanos()) / 1_000_000L);
            WatchDetect.onTransition(context.getApplicationContext(), e.getActivityType(), e.getTransitionType() == 0, when);
        }
    }
}
