package com.kyfitness.app;

import android.content.Context;
import android.content.Intent;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

/** The lifting side's hooks into Android: the workout notification with its rest countdown, and the launcher's long-press shortcuts. */
@CapacitorPlugin(name = "LiftSession")
public class LiftSessionPlugin extends Plugin {
    /** Shows the workout notification, or removes it when {@code active} is false. */
    @PluginMethod
    public void sync(PluginCall call) {
        Context c = getContext();
        if (!Boolean.TRUE.equals(call.getBoolean("active", false))) {
            LiftNotifier.clear(c);
            call.resolve();
            return;
        }
        long startedAt = (long) call.getData().optDouble("startedAt", 0);
        long restEndsAt = (long) call.getData().optDouble("restEndsAt", 0);
        LiftNotifier.show(c, call.getString("title", "Workout"), call.getString("detail", ""), startedAt, restEndsAt, Boolean.TRUE.equals(call.getBoolean("paused", false)), call.getString("alert", "vibrate"));
        call.resolve();
    }

    /**
     * Sets the shortcuts that appear when the app icon is held down: an empty workout, then up to three routines.
     * {@code routines} is a list of {id, name}. The tap opens the app with an action the web page then carries out.
     */
    @PluginMethod
    public void setShortcuts(PluginCall call) {
        Context c = getContext();
        try {
            List<ShortcutInfoCompat> list = new ArrayList<>();
            list.add(shortcut(c, "lift-empty", call.getString("emptyLabel", "Start empty workout"), "lift:empty"));
            list.add(shortcut(c, "breathe-now", "Breathe", "breathe:start"));
            JSArray routines = call.getArray("routines");
            for (int i = 0; routines != null && i < routines.length() && list.size() < 4; i++) {
                JSONObject r = routines.getJSONObject(i);
                String id = r.optString("id", "");
                String name = r.optString("name", "");
                if (id.isEmpty() || name.isEmpty()) continue;
                list.add(shortcut(c, "lift-r-" + id, name, "lift:routine:" + id));
            }
            ShortcutManagerCompat.setDynamicShortcuts(c, list);
            call.resolve();
        } catch (JSONException | RuntimeException e) {
            call.reject("Could not set the shortcuts: " + e.getMessage());
        }
    }

    /** The numbers the Lift widget shows: workouts this week and today's scheduled routine (empty id when none). */
    @PluginMethod
    public void widget(PluginCall call) {
        android.content.SharedPreferences.Editor e = getContext().getSharedPreferences(LiftWidgetProvider.PREFS, Context.MODE_PRIVATE).edit();
        e.putInt("week", call.getInt("week", 0));
        e.putString("todayId", call.getString("todayId", ""));
        e.putString("todayName", call.getString("todayName", ""));
        e.apply();
        LiftWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    private static ShortcutInfoCompat shortcut(Context c, String id, String label, String action) {
        Intent i = new Intent(c, MainActivity.class)
            .setAction("ky.shortcut." + id)
            .putExtra(LaunchBridge.EXTRA, action)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String shortLabel = label.length() > 24 ? label.substring(0, 23) + "…" : label;
        return new ShortcutInfoCompat.Builder(c, id)
            .setShortLabel(shortLabel)
            .setLongLabel(label)
            .setIcon(IconCompat.createWithResource(c, R.mipmap.ic_launcher))
            .setIntent(i)
            .build();
    }
}
