package com.kyfitness.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Switches the "looks like you started a workout" suggestions on or off (see ActivityDetect.java). */
@CapacitorPlugin(name = "ActivityDetect")
public class ActivityDetectPlugin extends Plugin {

    @PluginMethod
    public void configure(PluginCall call) {
        ActivityDetect.configure(getContext(), Boolean.TRUE.equals(call.getBoolean("enabled", false)), Boolean.TRUE.equals(call.getBoolean("walks", false)));
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        o.put("enabled", ActivityDetect.prefs(getContext()).getBoolean("enabled", false));
        o.put("lastNotifyMs", ActivityDetect.prefs(getContext()).getLong("lastNotifyMs", 0));
        call.resolve(o);
    }
}
