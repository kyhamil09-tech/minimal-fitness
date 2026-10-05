package com.kyfitness.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;

/** Hands the readings the watch collected on its own (all-day heart rate, steps, sleep state, daily totals) to the app. */
@CapacitorPlugin(name = "Vitals")
public class VitalsPlugin extends Plugin {

    /** Readings newer than {@code sinceMs} (default: the last three days). */
    @PluginMethod
    public void read(PluginCall call) {
        long since = call.getLong("sinceMs", System.currentTimeMillis() - 3L * 24 * 3600_000);
        try {
            call.resolve(new JSObject(WatchVitals.read(getContext(), since).toString()));
        } catch (JSONException e) {
            call.reject("Could not read the watch readings: " + e.getMessage());
        }
    }

    /** When the watch last delivered anything (0 if never). */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        o.put("lastSyncAt", WatchVitals.lastSyncAt(getContext()));
        call.resolve(o);
    }
}
