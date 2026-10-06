package com.kyfitness.wear;

import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.WearableListenerService;

/** Receives the phone's glance numbers, stores them and asks the system to redraw the watch's complications. */
public class GlanceListenerService extends WearableListenerService {
    @Override
    public void onDataChanged(DataEventBuffer events) {
        boolean changed = false;
        for (DataEvent event : events) {
            if (event.getType() != DataEvent.TYPE_CHANGED) continue;
            String path = event.getDataItem().getUri().getPath();
            if ("/ky/alarm".equals(path)) {
                com.google.android.gms.wearable.DataMap a = DataMapItem.fromDataItem(event.getDataItem()).getDataMap();
                SmartAlarm.configure(this, a.getBoolean("enabled", false), a.getInt("wakeMin", 7 * 60), a.getInt("windowMin", 30));
                continue;
            }
            if ("/ky/gear".equals(path)) {
                GearStore.save(this, DataMapItem.fromDataItem(event.getDataItem()).getDataMap().getString("json", "[]"));
                continue;
            }
            if ("/ky/routines".equals(path)) {
                RoutineStore.save(this, DataMapItem.fromDataItem(event.getDataItem()).getDataMap().getString("json", "[]"));
                continue;
            }
            if ("/ky/look".equals(path)) {
                // The phone's palette and background: stored so the app, tile and workout screens match it.
                if (LookStore.apply(this, DataMapItem.fromDataItem(event.getDataItem()).getDataMap())) {
                    android.util.Log.i("KyLook", "look stored, version " + LookStore.version(this));
                    androidx.wear.tiles.TileService.getUpdater(this).requestUpdate(KyTileService.class);
                }
                continue;
            }
            if ("/ky/water".equals(path)) {
                // Today's water from the phone: stored for the Fuel tile, which is asked to redraw.
                WaterStore.apply(this, DataMapItem.fromDataItem(event.getDataItem()).getDataMap());
                androidx.wear.tiles.TileService.getUpdater(this).requestUpdate(KyFuelTileService.class);
                continue;
            }
            if (!"/ky/glance".equals(path)) continue;
            GlanceStore.apply(this, DataMapItem.fromDataItem(event.getDataItem()).getDataMap());
            android.util.Log.i("KyGlance", "glance stored: readiness=" + GlanceStore.readiness(this) + " month=" + GlanceStore.monthPct(this) + " fast=" + GlanceStore.fastActive(this));
            changed = true;
        }
        if (changed) GlanceComplicationService.requestAll(this);
    }
}
