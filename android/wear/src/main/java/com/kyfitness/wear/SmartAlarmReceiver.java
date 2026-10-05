package com.kyfitness.wear;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Starts listening when the window opens, and sets the next day's alarm. Also re-arms the alarm after a restart or an update. */
public class SmartAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) return;
        if (SmartAlarm.ACTION_START.equals(action)) {
            try {
                context.startForegroundService(new Intent(context, SmartAlarmService.class));
            } catch (RuntimeException e) {
                Log.w("KySmartAlarm", "Could not start: " + e.getMessage());
            }
        }
        // Tomorrow's window (and after a restart, today's if it is still ahead).
        SmartAlarm.schedule(context);
    }
}
