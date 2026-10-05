package com.kyfitness.wear;

import android.content.Context;
import com.google.android.gms.wearable.Asset;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;

/**
 * Sends a workout recorded on the watch alone to the phone. The Data Layer keeps the item and delivers it
 * as soon as the phone is reachable, so a run recorded with the phone at home appears in the app later.
 */
final class WorkoutSync {
    private WorkoutSync() {}

    static void send(Context c, String id, String json) {
        PutDataMapRequest req = PutDataMapRequest.create("/ky/workout/saved/" + id);
        req.getDataMap().putAsset("json", Asset.createFromBytes(json.getBytes(StandardCharsets.UTF_8)));
        req.getDataMap().putLong("savedAt", System.currentTimeMillis());
        PutDataRequest put = req.asPutDataRequest().setUrgent();
        Wearable.getDataClient(c.getApplicationContext()).putDataItem(put);
    }
}