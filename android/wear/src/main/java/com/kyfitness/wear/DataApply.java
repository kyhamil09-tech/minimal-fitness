package com.kyfitness.wear;

import android.content.Context;
import android.util.Log;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.Wearable;

/**
 * Takes what the phone sent over the Data Layer (glance numbers, routines, the exercise library, gear, water, the look, the smart
 * alarm) and stores it. It is used when the phone sends something new (see {@link GlanceListenerService}) and also by {@link #pull},
 * which reads what the phone already left on the watch: the system only reports a data item when it changes, so a watch that was
 * just installed, or that was out of reach for a while, would otherwise wait for the next change.
 */
final class DataApply {
    private static final String TAG = "KyData";
    private static volatile long lastPull = 0;

    private DataApply() {}

    /** Stores one item. Returns true when it was the glance numbers, which the complications should redraw for. */
    static boolean apply(Context c, String path, DataMap m) {
        if (path == null) return false;
        switch (path) {
            case "/ky/alarm":
                SmartAlarm.configure(c, m.getBoolean("enabled", false), m.getInt("wakeMin", 7 * 60), m.getInt("windowMin", 30));
                return false;
            case "/ky/gear":
                GearStore.save(c, m.getString("json", "[]"));
                return false;
            case "/ky/routines":
                RoutineStore.save(c, m.getString("json", "[]"));
                return false;
            case "/ky/exercises":
                ExerciseLibStore.save(c, m.getString("json", "{}"));
                return false;
            case "/ky/look":
                // The phone's palette and background: stored so the app, tile and workout screens match it.
                if (LookStore.apply(c, m)) {
                    Log.i("KyLook", "look stored, version " + LookStore.version(c));
                    androidx.wear.tiles.TileService.getUpdater(c).requestUpdate(KyTileService.class);
                }
                return false;
            case "/ky/water":
                // Today's water from the phone: stored for the Fuel tile, which is asked to redraw.
                WaterStore.apply(c, m);
                androidx.wear.tiles.TileService.getUpdater(c).requestUpdate(KyFuelTileService.class);
                return false;
            case "/ky/glance":
                GlanceStore.apply(c, m);
                Log.i("KyGlance", "glance stored: readiness=" + GlanceStore.readiness(c) + " month=" + GlanceStore.monthPct(c) + " fast=" + GlanceStore.fastActive(c) + " sleep=" + GlanceStore.sleepMin(c));
                return true;
            default:
                return false;
        }
    }

    /** Reads what the phone has already left on the watch (at most every two minutes) and stores it. */
    static void pull(Context ctx) {
        final Context app = ctx.getApplicationContext();
        long now = System.currentTimeMillis();
        if (now - lastPull < 120_000) return;
        lastPull = now;
        try {
            Wearable.getDataClient(app).getDataItems().addOnSuccessListener(buffer -> {
                boolean glance = false;
                try {
                    for (DataItem item : buffer) {
                        String path = item.getUri().getPath();
                        if (path == null || !path.startsWith("/ky/")) continue;
                        // Only the phone's small settings items: not the workouts and readings this watch sent the other way.
                        if (path.startsWith("/ky/workout/") || path.startsWith("/ky/vitals/")) continue;
                        try {
                            glance |= apply(app, path, DataMapItem.fromDataItem(item).getDataMap());
                        } catch (RuntimeException e) {
                            Log.w(TAG, "Could not read " + path + ": " + e.getMessage());
                        }
                    }
                } finally {
                    buffer.release();
                }
                if (glance) GlanceComplicationService.requestAll(app);
            }).addOnFailureListener(e -> Log.w(TAG, "Could not read the phone's data: " + e.getMessage()));
        } catch (RuntimeException e) {
            Log.w(TAG, "Data Layer unavailable: " + e.getMessage());
        }
    }
}
