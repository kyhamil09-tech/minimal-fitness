package com.kyfitness.app;

import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * A Quick Settings tile for Eat. It shows the calories left today; a tap opens the app on the food finder, because logging a food
 * needs the app (search, amounts, the scanner).
 */
public class EatTileService extends TileService {
    static void refresh(Context c) {
        try {
            TileService.requestListeningState(c, new ComponentName(c, EatTileService.class));
        } catch (RuntimeException ignored) {
            // The tile is not added: nothing to redraw.
        }
    }

    @Override
    public void onStartListening() {
        Tile t = getQsTile();
        if (t == null) return;
        t.setIcon(Icon.createWithResource(this, R.drawable.ic_tile_eat));
        t.setLabel("Eat");
        t.setState(Tile.STATE_INACTIVE);
        if (Build.VERSION.SDK_INT >= 29) {
            if (EatStore.known(this)) {
                int left = EatStore.left(this);
                t.setSubtitle(left >= 0 ? EatStore.number(left) + " left" : EatStore.number(-left) + " past plan");
            } else {
                t.setSubtitle("Log food");
            }
        }
        t.updateTile();
    }

    @Override
    public void onClick() {
        Intent i = new Intent(this, MainActivity.class)
            .setAction("ky.tile.eat")
            .putExtra(LaunchBridge.EXTRA, "eat:add")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 31, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        } else {
            startActivityAndCollapse(i);
        }
    }
}
