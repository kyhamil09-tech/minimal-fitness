package com.kyfitness.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Live cadence from the phone's step sensor (see {@link CadenceSensor}). */
@CapacitorPlugin(name = "Cadence")
public class CadencePlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        JSObject o = new JSObject();
        o.put("available", CadenceSensor.start(getContext()));
        call.resolve(o);
    }

    @PluginMethod
    public void read(PluginCall call) {
        JSObject o = new JSObject();
        o.put("spm", CadenceSensor.spm());
        o.put("steps", CadenceSensor.totalSteps());
        call.resolve(o);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        CadenceSensor.stop();
        call.resolve();
    }

    /** Rowing: starts collecting raw movement for the stroke rate. */
    @PluginMethod
    public void startStroke(PluginCall call) {
        JSObject o = new JSObject();
        o.put("available", StrokeSensor.start(getContext()));
        call.resolve(o);
    }

    /** The last 24 seconds of movement on three axes at 25 readings a second. */
    @PluginMethod
    public void readStroke(PluginCall call) {
        float[][] w = StrokeSensor.window();
        com.getcapacitor.JSArray x = new com.getcapacitor.JSArray();
        com.getcapacitor.JSArray y = new com.getcapacitor.JSArray();
        com.getcapacitor.JSArray z = new com.getcapacitor.JSArray();
        try {
            for (int i = 0; i < w[0].length; i++) {
                x.put(Math.round(w[0][i] * 1000) / 1000.0);
                y.put(Math.round(w[1][i] * 1000) / 1000.0);
                z.put(Math.round(w[2][i] * 1000) / 1000.0);
            }
        } catch (org.json.JSONException e) {
            call.reject("Could not read the movement: " + e.getMessage());
            return;
        }
        JSObject o = new JSObject();
        o.put("x", x);
        o.put("y", y);
        o.put("z", z);
        o.put("fs", StrokeSensor.RATE_HZ);
        call.resolve(o);
    }

    @PluginMethod
    public void stopStroke(PluginCall call) {
        StrokeSensor.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        CadenceSensor.stop();
        StrokeSensor.stop();
        super.handleOnDestroy();
    }
}