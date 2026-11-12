package com.kyfitness.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Rings when a rest between sets ends, even if the app is closed. */
public class LiftRestReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && LiftNotifier.ACTION_REST_OVER.equals(intent.getAction())) LiftNotifier.restOver(context);
    }
}
