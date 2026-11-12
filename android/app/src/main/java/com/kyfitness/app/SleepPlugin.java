package com.kyfitness.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.location.ActivityRecognition;
import com.google.android.gms.location.SleepSegmentRequest;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * Detects when you sleep using Google Play services' Sleep API on this phone (no Google health app needed).
 * It gives bedtime and wake time, not sleep stages. Needs the phone near you overnight and the
 * physical-activity permission.
 */
@CapacitorPlugin(name = "SleepDetect")
public class SleepPlugin extends Plugin {

    private PendingIntent pending() {
        Intent i = new Intent(getContext(), SleepReceiver.class);
        return PendingIntent.getBroadcast(getContext(), 7001, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            ActivityRecognition.getClient(getContext())
                .requestSleepSegmentUpdates(pending(), SleepSegmentRequest.getDefaultSleepSegmentRequest())
                .addOnSuccessListener(v -> {
                    JSObject o = new JSObject();
                    o.put("started", true);
                    call.resolve(o);
                })
                .addOnFailureListener(e -> call.reject("Sleep detection is not available: " + e.getMessage()));
        } catch (SecurityException e) {
            call.reject("Sleep detection needs the physical activity permission.");
        } catch (RuntimeException e) {
            call.reject("Sleep detection is not available: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            ActivityRecognition.getClient(getContext()).removeSleepSegmentUpdates(pending());
        } catch (RuntimeException ignored) {
            // not registered
        }
        call.resolve();
    }

    /** The phone's motion and light readings every ten minutes: [[time, confidence asleep, motion, light]], newest last. */
    @PluginMethod
    public void readClassify(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(SleepReceiver.PREFS, Context.MODE_PRIVATE);
        JSObject o = new JSObject();
        try {
            o.put("events", new JSArray(new JSONArray(p.getString(SleepReceiver.CLASSIFY_KEY, "[]")).toString()));
        } catch (JSONException e) {
            o.put("events", new JSArray());
        }
        call.resolve(o);
    }

    /** Sleep periods detected so far: [{start, end, status}], newest last. */
    @PluginMethod
    public void read(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(SleepReceiver.PREFS, Context.MODE_PRIVATE);
        JSObject o = new JSObject();
        try {
            o.put("segments", new JSArray(new JSONArray(p.getString(SleepReceiver.KEY, "[]")).toString()));
        } catch (JSONException e) {
            o.put("segments", new JSArray());
        }
        call.resolve(o);
    }
}