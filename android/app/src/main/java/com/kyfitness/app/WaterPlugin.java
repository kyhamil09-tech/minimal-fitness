package com.kyfitness.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;

/**
 * Keeps the home-screen water widget and the watch's Fuel tile in step with the app's water log, and hands over the water added
 * from the widget or the watch while the app was closed.
 */
@CapacitorPlugin(name = "Water")
public class WaterPlugin extends Plugin {
    /** The app reports today's total (its own log), the goal, the units and the two amounts the buttons add. */
    @PluginMethod
    public void sync(PluginCall call) {
        WaterStore.setFromApp(
            getContext(),
            call.getInt("totalMl", 0),
            call.getInt("goalMl", 2500),
            Boolean.TRUE.equals(call.getBoolean("imperial", false)),
            call.getInt("step1Ml", 250),
            call.getInt("step2Ml", 500),
            call.getInt("lastMl", 0)
        );
        WaterWidgetProvider.refreshAll(getContext());
        WaterStore.pushToWatch(getContext());
        call.resolve();
    }

    /** Water added from the widget or the watch since the app last looked: [[epoch ms, ml], ...]. They are removed once handed over. */
    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject out = new JSObject();
        try {
            out.put("items", new JSArray(WaterStore.takePending(getContext())));
        } catch (JSONException e) {
            out.put("items", new JSArray());
        }
        call.resolve(out);
    }
}
