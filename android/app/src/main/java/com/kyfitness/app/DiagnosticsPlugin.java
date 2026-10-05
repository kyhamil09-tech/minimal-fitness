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
    @PluginMethod
    public void getCrashLog(PluginCall call) {
        File f = KyApp.crashFile(getContext());
        JSObject o = new JSObject();
        try {
            o.put("log", f.exists() ? new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8) : "");
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