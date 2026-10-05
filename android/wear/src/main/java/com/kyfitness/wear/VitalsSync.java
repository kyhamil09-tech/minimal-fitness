package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import com.google.android.gms.wearable.Asset;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;

/**
 * Hands the watch's stored readings to the phone through the Wear OS Data Layer. There is one data item per hour
 * ("/ky/vitals/&lt;hour&gt;") that is simply replaced as the hour fills up, so a phone that is out of reach for a day
 * finds at most 24 small items waiting, never an ever-growing pile. The phone drops readings it already has.
 */
final class VitalsSync {
    private static final String PREFS = "ky_vitals_sync";
    private static final long MIN_GAP_MS = 5 * 60_000;
    private static final long HOUR_MS = 3_600_000L;

    private VitalsSync() {}

    /** Sends the current hour (and the one before it just after the turn of the hour), at most every five minutes. */
    static void maybeSend(Context c, boolean force) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (!force && now - p.getLong("sentAt", 0) < MIN_GAP_MS) return;
        p.edit().putLong("sentAt", now).apply();
        long hour = now / HOUR_MS;
        send(c, hour, true);
        if (now % HOUR_MS < 15 * 60_000) send(c, hour - 1, false);
    }

    private static void send(Context c, long hour, boolean withDaily) {
        String json = VitalsStore.payload(c, hour * HOUR_MS, (hour + 1) * HOUR_MS, withDaily);
        if (json == null) return;
        PutDataMapRequest req = PutDataMapRequest.create("/ky/vitals/" + hour);
        req.getDataMap().putAsset("json", Asset.createFromBytes(json.getBytes(StandardCharsets.UTF_8)));
        // A changing value makes the phone notice an item whose readings were only extended.
        req.getDataMap().putLong("sentAt", System.currentTimeMillis());
        Wearable.getDataClient(c.getApplicationContext()).putDataItem(req.asPutDataRequest());
        Log.i("KyWatchVitals", "sent hour " + hour + " (" + json.length() + " bytes) to the phone");
    }
}
