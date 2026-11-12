package com.kyfitness.app;

import android.content.ComponentName;
import android.content.Context;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * A Quick Settings tile that adds a glass of water in one tap, without opening the app. It shows today's total; the app picks the
 * water up the next time it runs (see WaterStore), and the watch and the widgets are updated at once.
 */
public class WaterTileService extends TileService {
    static void refresh(Context c) {
        try {
            TileService.requestListeningState(c, new ComponentName(c, WaterTileService.class));
        } catch (RuntimeException ignored) {
            // The tile is not added: nothing to redraw.
        }
    }

    @Override
    public void onStartListening() {
        Tile t = getQsTile();
        if (t == null) return;
        boolean imperial = WaterStore.imperial(this);
        int step = WaterStore.stepMl(this, 1);
        t.setIcon(Icon.createWithResource(this, R.drawable.ic_tile_water));
        t.setLabel("Water +" + WaterStore.format(step, imperial).replace(" fl oz", " oz"));
        t.setState(Tile.STATE_INACTIVE);
        if (Build.VERSION.SDK_INT >= 29) {
            t.setSubtitle(WaterStore.format(WaterStore.totalMl(this), imperial) + " of " + WaterStore.format(WaterStore.goalMl(this), imperial));
        }
        t.updateTile();
    }

    @Override
    public void onClick() {
        // On a locked phone the tap waits for the unlock first.
        unlockAndRun(() -> {
            WaterStore.add(this, WaterStore.stepMl(this, 1));
            WaterWidgetProvider.refreshAll(this);
            EatWidgetProvider.refreshAll(this);
            WaterStore.pushToWatch(this);
            onStartListening();
        });
    }
}
