package com.kyfitness.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Lets Settings show and clear the on-device crash log. */
@CapacitorPlugin(name = "Diagnostics")
public class DiagnosticsPlugin extends Plugin {
    // The build this log came from, printed at the top of a shared log so a report can be matched to the build that made it.
    private static final String BUILD_REF = "b41180nzqd";

    @PluginMethod
    public void getCrashLog(PluginCall call) {
        File f = KyApp.crashFile(getContext());
        JSObject o = new JSObject();
        try {
            String text = f.exists() ? new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8) : "";
            o.put("log", text.isEmpty() ? text : "build " + BUILD_REF + "\n\n" + text);
        } catch (Exception e) {
            o.put("log", "");
        }
        call.resolve(o);
    }

    @PluginMethod
    public void clearCrashLog(PluginCall call) {
        File f = KyApp.crashFile(getContext());
        if (f.exists()) f.delete();
        call.resolve();
    }
}