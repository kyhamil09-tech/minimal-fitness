package com.kyfitness.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * A Quick Settings tile: one tap from the notification shade (even on the lock screen, once unlocked) opens the app and starts a run.
 * While a workout is recording it reads "Run in progress" and a tap just opens the app on the live screen. It needs the app for the
 * GPS permission and the countdown, so it launches the activity instead of recording in the background.
 */
public class RunTileService extends TileService {
    @Override
    public void onStartListening() {
        refresh();
    }

    @Override
    public void onClick() {
        boolean recording = SampleBuffer.isRecording();
        Intent i = new Intent(this, MainActivity.class)
            .setAction("ky.tile.run")
            .putExtra(LaunchBridge.EXTRA, recording ? "open:run" : "start:Running")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 20, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        } else {
            startActivityAndCollapse(i);
        }
    }

    private void refresh() {
        Tile t = getQsTile();
        if (t == null) return;
        boolean recording = SampleBuffer.isRecording();
        t.setLabel(recording ? "Run in progress" : "Start run");
        t.setState(recording ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        t.setIcon(Icon.createWithResource(this, R.drawable.ic_tile_run));
        if (Build.VERSION.SDK_INT >= 29) t.setSubtitle(recording ? "Tap to open" : "GPS run");
        t.updateTile();
    }
}
