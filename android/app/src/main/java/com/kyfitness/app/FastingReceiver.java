package com.kyfitness.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Refreshes the fasting notification and widget: on the alarm, after a restart, and after the app is updated. */
public class FastingReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) return;
        FastingNotifier.refresh(context, FastingNotifier.ACTION_REFRESH.equals(action));
    }
}
