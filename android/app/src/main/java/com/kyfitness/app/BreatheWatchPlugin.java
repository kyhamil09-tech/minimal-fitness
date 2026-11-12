package com.kyfitness.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;

/** Hands the app the breathing sessions done on the watch while it was closed (see {@link BreatheInbox}). */
@CapacitorPlugin(name = "BreatheWatch")
public class BreatheWatchPlugin extends Plugin {
    /** {@code items: [[endMs, patternId, seconds, bpmStart, bpmEnd], ...]}; they are removed once handed over. */
    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject out = new JSObject();
        try {
            out.put("items", new JSArray(BreatheInbox.take(getContext())));
        } catch (JSONException e) {
            out.put("items", new JSArray());
        }
        call.resolve(out);
    }
}
