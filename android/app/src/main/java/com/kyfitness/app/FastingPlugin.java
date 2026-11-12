package com.kyfitness.app;

import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Hands the running fast (and the settings for its notification) to Android, which keeps the notification and widget current. */
@CapacitorPlugin(name = "Fasting")
public class FastingPlugin extends Plugin {
    /**
     * Saves the state and redraws. Called whenever a fast starts, changes or ends, or the settings change.
     * Arguments: active, startMs, goalHours, protocol, live, stages, lastHours, lastProtocol.
     */
    @PluginMethod
    public void sync(PluginCall call) {
        SharedPreferences p = FastingNotifier.prefs(getContext());
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        long start = (long) call.getData().optDouble("startMs", 0);
        float goal = call.getFloat("goalHours", 16f);
        boolean sameFast = p.getBoolean("active", false) && p.getLong("startMs", 0) == start;
        SharedPreferences.Editor e = p.edit();
        e.putBoolean("active", active && start > 0);
        e.putLong("startMs", start);
        e.putFloat("goalHours", goal);
        e.putString("protocol", call.getString("protocol", "Fast"));
        e.putBoolean("live", !Boolean.FALSE.equals(call.getBoolean("live", true)));
        e.putBoolean("stages", !Boolean.FALSE.equals(call.getBoolean("stages", true)));
        e.putBoolean("glow", !Boolean.FALSE.equals(call.getBoolean("glow", true)));
        // The app's accent color for the current color scheme, so the notification matches it.
        try {
            e.putInt("accent", android.graphics.Color.parseColor(call.getString("accent", "#FF5500")));
        } catch (IllegalArgumentException ignored) {
            // keep the color it had
        }
        e.putFloat("lastHours", call.getFloat("lastHours", 16f));
        e.putString("lastProtocol", call.getString("lastProtocol", "16:8 Standard"));
        // A new fast starts at its own stage without an alert; the same fast keeps the stage it already announced.
        if (!sameFast) {
            double hours = Math.max(0, (System.currentTimeMillis() - start) / 3_600_000.0);
            e.putInt("lastStage", FastingNotifier.stageIndex(hours));
        }
        e.apply();
        FastingNotifier.refresh(getContext(), false);
        call.resolve();
    }
}
