package com.kyfitness.app;

import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

/**
 * Records a workout's raw samples natively so nothing is lost while the screen is off.
 * start({gps}) begins a session (and the location service when gps is true), getSamples returns
 * everything recorded since the given indices, and stop() ends the session (samples stay readable
 * until the next start).
 */
@CapacitorPlugin(name = "GpsTracker")
public class GpsTrackerPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        boolean gps = Boolean.TRUE.equals(call.getBoolean("gps", true));
        SampleBuffer.begin();
        // Spoken updates each kilometre or mile (optional)
        boolean miles = "mi".equals(call.getString("unit", "km"));
        double everyKm = call.getDouble("everyKm", miles ? 1.609344 : 1.0);
        RunCoach.begin(getContext(), Boolean.TRUE.equals(call.getBoolean("cues", false)),
            miles, Boolean.TRUE.equals(call.getBoolean("cueHr", true)),
            everyKm, call.getInt("everyMin", 0),
            Boolean.TRUE.equals(call.getBoolean("sayDistance", false)),
            Boolean.TRUE.equals(call.getBoolean("sayTime", true)),
            Boolean.TRUE.equals(call.getBoolean("sayPace", true)));
        if (gps) {
            try {
                getContext().startForegroundService(new Intent(getContext(), GpsTrackerService.class)
                    .putExtra("saver", Boolean.TRUE.equals(call.getBoolean("saver", false))));
            } catch (RuntimeException e) {
                call.reject("Could not start location tracking: " + e.getMessage());
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getSamples(PluginCall call) {
        try {
            readSamples(call);
        } catch (org.json.JSONException e) {
            call.reject("Could not read samples: " + e.getMessage());
        }
    }

    private void readSamples(PluginCall call) throws org.json.JSONException {
        int fixFrom = call.getInt("fixFrom", 0);
        int hrFrom = call.getInt("hrFrom", 0);
        JSArray fixes = new JSArray();
        List<double[]> f = SampleBuffer.fixesFrom(fixFrom);
        for (double[] r : f) {
            JSArray row = new JSArray();
            row.put((long) r[0]);
            row.put(r[1]);
            row.put(r[2]);
            row.put(Double.isNaN(r[3]) ? JSONObjectNull.VALUE : r[3]);
            row.put(Double.isNaN(r[4]) ? JSONObjectNull.VALUE : r[4]);
            fixes.put(row);
        }
        JSArray hr = new JSArray();
        for (long[] r : SampleBuffer.heartRateFrom(hrFrom)) {
            JSArray row = new JSArray();
            row.put(r[0]);
            row.put(r[1]);
            hr.put(row);
        }
        JSObject out = new JSObject();
        out.put("fixes", fixes);
        out.put("fixTotal", fixFrom + f.size());
        out.put("hr", hr);
        out.put("hrTotal", SampleBuffer.heartRateCount());
        // True once any altitude in this workout came from the phone's barometer.
        out.put("baro", SampleBuffer.usedBarometer());
        call.resolve(out);
    }

    /** Lets the spoken cues skip time the workout was paused. */
    @PluginMethod
    public void setPaused(PluginCall call) {
        RunCoach.setPaused(Boolean.TRUE.equals(call.getBoolean("paused", false)));
        LiveShare.setPaused(Boolean.TRUE.equals(call.getBoolean("paused", false)));
        call.resolve();
    }

    /** Speaks a one-off message (e.g. a lap time) if spoken cues are on. */
    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text != null) RunCoach.say(text);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), GpsTrackerService.class));
        RunCoach.end();
        SampleBuffer.end();
        call.resolve();
    }

    /** org.json's null marker, so missing altitude/accuracy become JSON null. */
    private static final class JSONObjectNull {
        static final Object VALUE = org.json.JSONObject.NULL;
    }
}