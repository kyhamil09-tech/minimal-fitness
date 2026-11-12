package com.kyfitness.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** A Quick Settings tile: one tap opens Breathe and starts your usual session (a favorite, or the one suited to the time of day). */
public class BreatheTileService extends TileService {
    @Override
    public void onStartListening() {
        Tile t = getQsTile();
        if (t == null) return;
        t.setLabel("Breathe");
        t.setState(Tile.STATE_INACTIVE);
        t.setIcon(Icon.createWithResource(this, R.drawable.ic_tile_breathe));
        if (Build.VERSION.SDK_INT >= 29) t.setSubtitle("Take two minutes");
        t.updateTile();
    }

    @Override
    public void onClick() {
        Intent i = new Intent(this, MainActivity.class)
            .setAction("ky.tile.breathe")
            .putExtra(LaunchBridge.EXTRA, "breathe:start")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 22, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        } else {
            startActivityAndCollapse(i);
        }
    }
}
