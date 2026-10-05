package com.kyfitness.app;

import android.util.Log;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.Asset;
import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Wearable;
import com.google.android.gms.wearable.WearableListenerService;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Runs even when the app is closed:
 * - /ky/steps messages carry the watch's daily step total ("yyyy-MM-dd:steps");
 * - /ky/workout/saved/* data items carry a workout recorded on the watch (with its route and heart rate) that
 *   the app imports the next time it opens;
 * - /ky/vitals/* data items carry what the watch measured on its own all day (heart rate, steps, sleep state, totals).
 */
public class PhoneListenerService extends WearableListenerService {
    static final String SAVED_PREFIX = "/ky/workout/saved/";
    static final String VITALS_PREFIX = "/ky/vitals/";

    static File importDir(android.content.Context c) {
        File dir = new File(c.getFilesDir(), "watch_imports");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    @Override
    public void onMessageReceived(MessageEvent event) {
        if ("/ky/detect/notified".equals(event.getPath())) {
            ActivityDetect.onPeerNotified(this);
            return;
        }
        if (!"/ky/steps".equals(event.getPath())) return;
        String text = new String(event.getData(), StandardCharsets.UTF_8).trim();
        int i = text.lastIndexOf(':');
        if (i <= 0) return;
        try {
            StepStore.setWatch(this, text.substring(0, i), Integer.parseInt(text.substring(i + 1)));
        } catch (NumberFormatException ignored) {
            // malformed message: ignore
        }
    }

    private void receiveVitals(DataEvent event) {
        try {
            Asset asset = DataMapItem.fromDataItem(event.getDataItem()).getDataMap().getAsset("json");
            if (asset == null) return;
            try (InputStream in = Tasks.await(Wearable.getDataClient(this).getFdForAsset(asset)).getInputStream()) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                int added = WatchVitals.merge(this, new String(buf.toByteArray(), StandardCharsets.UTF_8));
                Log.i("KyWatchVitals", "received a batch from the watch: " + added + " new heart-rate readings");
            }
            Wearable.getDataClient(this).deleteDataItems(event.getDataItem().getUri());
        } catch (Exception e) {
            Log.w("KyWatchVitals", "Could not receive the watch readings: " + e.getMessage());
        }
    }

    @Override
    public void onDataChanged(DataEventBuffer events) {
        for (DataEvent event : events) {
            if (event.getType() != DataEvent.TYPE_CHANGED) continue;
            String path = event.getDataItem().getUri().getPath();
            if (path != null && path.startsWith(VITALS_PREFIX)) {
                receiveVitals(event);
                continue;
            }
            if (path == null || !path.startsWith(SAVED_PREFIX)) continue;
            String id = path.substring(SAVED_PREFIX.length()).replaceAll("[^A-Za-z0-9_-]", "");
            if (id.isEmpty()) continue;
            try {
                Asset asset = DataMapItem.fromDataItem(event.getDataItem()).getDataMap().getAsset("json");
                if (asset == null) continue;
                try (InputStream in = Tasks.await(Wearable.getDataClient(this).getFdForAsset(asset)).getInputStream()) {
                    ByteArrayOutputStream buf = new ByteArrayOutputStream();
                    byte[] chunk = new byte[8192];
                    int n;
                    while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                    try (FileOutputStream out = new FileOutputStream(new File(importDir(this), id + ".json"))) {
                        out.write(buf.toByteArray());
                    }
                }
                Wearable.getDataClient(this).deleteDataItems(event.getDataItem().getUri());
            } catch (Exception e) {
                Log.w("KyWatchImport", "Could not receive workout " + id + ": " + e.getMessage());
            }
        }
    }
}