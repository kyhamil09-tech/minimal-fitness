package com.kyfitness.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;

/**
 * Sends the look chosen on the phone (accent palette and background, as a handful of colours) to the watch over the Bluetooth link,
 * so the watch app, tile and workout screens use the same colours. One small item is kept up to date; the watch stores it and
 * redraws. With no watch paired nothing happens.
 */
@CapacitorPlugin(name = "Look")
public class LookPlugin extends Plugin {
    private static final String[] KEYS = {"bg", "card", "edge", "ink", "muted", "accent", "accent2", "blue", "green", "yellow", "orange", "red", "purple", "onAccent"};

    @PluginMethod
    public void send(PluginCall call) {
        try {
            PutDataMapRequest req = PutDataMapRequest.create("/ky/look");
            DataMap m = req.getDataMap();
            for (String k : KEYS) {
                String v = call.getString(k);
                if (v != null && v.matches("#[0-9A-Fa-f]{6}")) m.putString(k, v);
            }
            PutDataRequest put = req.asPutDataRequest();
            put.setUrgent();
            Wearable.getDataClient(getContext()).putDataItem(put);
            call.resolve();
        } catch (RuntimeException e) {
            // No watch or the Play services link is unavailable: the watch keeps the look it had.
            call.resolve();
        }
    }
}
