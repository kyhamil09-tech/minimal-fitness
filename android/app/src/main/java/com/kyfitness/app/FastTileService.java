package com.kyfitness.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * A Quick Settings tile for fasting. While a fast runs it shows the time so far and a tap opens the app to end it; with none running a
 * tap opens the app and starts your usual fast. It opens the app because the questions, the confirmation for long fasts and the
 * notification permission all belong there.
 */
public class FastTileService extends TileService {
    @Override
    public void onStartListening() {
        SharedPreferences p = getSharedPreferences(FastingNotifier.PREFS, Context.MODE_PRIVATE);
        boolean active = p.getBoolean("active", false) && p.getLong("startMs", 0) > 0;
        Tile t = getQsTile();
        if (t == null) return;
        t.setIcon(Icon.createWithResource(this, R.drawable.ic_stat_fast));
        t.setLabel(active ? "Fasting" : "Fast");
        t.setState(active ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        if (Build.VERSION.SDK_INT >= 29) {
            if (active) {
                long mins = Math.max(0, (System.currentTimeMillis() - p.getLong("startMs", 0)) / 60_000);
                t.setSubtitle((mins / 60) + "h " + String.format(java.util.Locale.US, "%02d", mins % 60) + "m");
            } else {
                t.setSubtitle("Start a fast");
            }
        }
        t.updateTile();
    }

    @Override
    public void onClick() {
        Intent i = new Intent(this, MainActivity.class)
            .setAction("ky.tile.fast")
            .putExtra(LaunchBridge.EXTRA, "fast:toggle")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 23, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        } else {
            startActivityAndCollapse(i);
        }
    }
}
