package com.kyfitness.wear;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;

/** Registers the all-day tracking again after the watch restarts or this app is updated. */
public class VitalsBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context.checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED) {
            WatchSteps.register(context);
        }
        WatchDetect.configure(context);
        NudgeReceiver.schedule(context);
    }
}
