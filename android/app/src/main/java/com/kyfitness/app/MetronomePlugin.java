package com.kyfitness.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Cadence beat for pacing your steps (see {@link Metronome}). */
@CapacitorPlugin(name = "Metronome")
public class MetronomePlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        Metronome.start(getContext(), call.getInt("bpm", 170), Boolean.TRUE.equals(call.getBoolean("alternate", false)),
            (float) (call.getDouble("volume", 0.8) == null ? 0.8 : call.getDouble("volume", 0.8)), call.getInt("tone", 0));
        call.resolve();
    }

    @PluginMethod
    public void setBpm(PluginCall call) {
        Metronome.setBpm(call.getInt("bpm", 170));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Metronome.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        Metronome.stop();
        super.handleOnDestroy();
    }
}
