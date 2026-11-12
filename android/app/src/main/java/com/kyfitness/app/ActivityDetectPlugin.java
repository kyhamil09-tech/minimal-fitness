package com.kyfitness.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Switches the "looks like you started a workout" suggestions, and the noticing of drives, on or off (see ActivityDetect.java). */
@CapacitorPlugin(name = "ActivityDetect")
public class ActivityDetectPlugin extends Plugin {

    @PluginMethod
    public void configure(PluginCall call) {
        ActivityDetect.configure(getContext(), Boolean.TRUE.equals(call.getBoolean("enabled", false)), Boolean.TRUE.equals(call.getBoolean("walks", false)));
        call.resolve();
    }

    /** Switches the noticing of drives on or off (see DriveLog.java). */
    @PluginMethod
    public void configureDrive(PluginCall call) {
        ActivityDetect.configureDrive(getContext(), Boolean.TRUE.equals(call.getBoolean("on", false)));
        call.resolve();
    }

    /** The drives noticed so far, [[start, end], ...] in epoch ms, and when one still going began (0 when none is). */
    @PluginMethod
    public void drives(PluginCall call) {
        JSObject o = new JSObject();
        o.put("drives", DriveLog.list(getContext()));
        o.put("on", ActivityDetect.prefs(getContext()).getBoolean("drive", false));
        o.put("open", DriveLog.open(getContext()));
        call.resolve(o);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        o.put("enabled", ActivityDetect.prefs(getContext()).getBoolean("enabled", false));
        o.put("lastNotifyMs", ActivityDetect.prefs(getContext()).getLong("lastNotifyMs", 0));
        call.resolve(o);
    }
}
