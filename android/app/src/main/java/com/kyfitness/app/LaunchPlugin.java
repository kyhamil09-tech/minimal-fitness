package com.kyfitness.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Hands the web app the action from a widget tap, and keeps the widget's numbers current. */
@CapacitorPlugin(name = "Launch")
public class LaunchPlugin extends Plugin {
    /**
     * The bottom strip Android keeps for its swipe-home gesture (or the navigation bar), in CSS pixels. Taps there are claimed by the
     * system, so the web app keeps its tab buttons above it. The page's env(safe-area-inset-bottom) is not reliable across phones.
     */
    @PluginMethod
    public void getSystemInsets(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject o = new JSObject();
            float density = getContext().getResources().getDisplayMetrics().density;
            int px = 0;
            try {
                androidx.core.view.WindowInsetsCompat insets = androidx.core.view.ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
                if (insets != null) {
                    px = Math.max(
                        insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemGestures()).bottom,
                        insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.navigationBars()).bottom
                    );
                }
            } catch (RuntimeException ignored) {
                // no insets yet: the page keeps its default padding
            }
            o.put("bottom", Math.round(px / density));
            call.resolve(o);
        });
    }

    /**
     * Asks the launcher to pin a home-screen shortcut that opens the app, drawn from a picture the page made. This is how a custom
     * logo color reaches the home screen: Android only lets the real app icon be one of the ready-made colors, but a shortcut can
     * carry any picture. The launcher shows its own "add to home screen" confirmation.
     */
    @PluginMethod
    public void addHomeShortcut(PluginCall call) {
        String b64 = call.getString("png");
        String label = call.getString("label", "Minimal Fitness");
        if (b64 == null || b64.isEmpty()) {
            call.reject("No image");
            return;
        }
        try {
            byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bmp == null) {
                call.reject("Bad image");
                return;
            }
            Context ctx = getContext();
            JSObject o = new JSObject();
            if (!androidx.core.content.pm.ShortcutManagerCompat.isRequestPinShortcutSupported(ctx)) {
                o.put("supported", false);
                call.resolve(o);
                return;
            }
            android.content.Intent open = new android.content.Intent(ctx, MainActivity.class).setAction(android.content.Intent.ACTION_MAIN);
            androidx.core.content.pm.ShortcutInfoCompat info = new androidx.core.content.pm.ShortcutInfoCompat.Builder(ctx, "custom-logo-" + System.currentTimeMillis())
                .setShortLabel(label)
                .setIcon(androidx.core.graphics.drawable.IconCompat.createWithAdaptiveBitmap(bmp))
                .setIntent(open)
                .build();
            o.put("supported", true);
            o.put("requested", androidx.core.content.pm.ShortcutManagerCompat.requestPinShortcut(ctx, info, null));
            call.resolve(o);
        } catch (RuntimeException e) {
            call.reject("Could not add the shortcut");
        }
    }

    @PluginMethod
    public void getPendingAction(PluginCall call) {
        JSObject o = new JSObject();
        o.put("action", LaunchBridge.take());
        call.resolve(o);
    }

    /** Workouts the watch recorded on its own and sent over, waiting to be imported. */
    @PluginMethod
    public void getWatchWorkouts(PluginCall call) {
        com.getcapacitor.JSArray items = new com.getcapacitor.JSArray();
        java.io.File[] files = PhoneListenerService.importDir(getContext()).listFiles();
        if (files != null) {
            for (java.io.File f : files) {
                try {
                    items.put(new String(java.nio.file.Files.readAllBytes(f.toPath()), java.nio.charset.StandardCharsets.UTF_8));
                } catch (java.io.IOException ignored) {
                    // unreadable file: skipped, retried next time
                }
            }
        }
        JSObject o = new JSObject();
        o.put("items", items);
        call.resolve(o);
    }

    @PluginMethod
    public void ackWatchWorkouts(PluginCall call) {
        com.getcapacitor.JSArray ids = call.getArray("ids");
        try {
            for (int i = 0; ids != null && i < ids.length(); i++) {
                String id = ids.getString(i).replaceAll("[^A-Za-z0-9_-]", "");
                new java.io.File(PhoneListenerService.importDir(getContext()), id + ".json").delete();
            }
        } catch (org.json.JSONException ignored) {
            // nothing to delete
        }
        call.resolve();
    }

    /** True when Android lets the app run in the background without battery restrictions (keeps GPS alive on long runs). */
    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject o = new JSObject();
        o.put("ignoring", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(o);
    }

    /**
     * Opens Android's battery-optimisation list, where the person switches this app to "Unrestricted" or "Not optimized". It uses the
     * settings screen rather than the one-tap request, which needs a permission Google Play only allows for a few kinds of app.
     */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            android.content.Intent i = new android.content.Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not open the battery setting: " + e.getMessage());
        }
    }

    private static final String[] ICON_IDS = {"runclub", "forest", "charcoal", "cream", "terracotta", "lavender", "ocean", "rose", "lime"};

    private static String iconAlias(Context c, String id) {
        return c.getPackageName().equals("com.kyfitness.app") ? "com.kyfitness.app.Icon" + Character.toUpperCase(id.charAt(0)) + id.substring(1) : null;
    }

    /** Changes the home-screen icon color by switching which launcher entry is enabled. */
    @PluginMethod
    public void setLauncherIcon(PluginCall call) {
        String id = call.getString("id", "forest");
        boolean known = false;
        for (String k : ICON_IDS) if (k.equals(id)) known = true;
        if (!known) {
            call.reject("Unknown icon.");
            return;
        }
        android.content.pm.PackageManager pm = getContext().getPackageManager();
        try {
            // Turn the new one on first, so the app always has a launcher entry.
            pm.setComponentEnabledSetting(new android.content.ComponentName(getContext(), iconAlias(getContext(), id)),
                android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED, android.content.pm.PackageManager.DONT_KILL_APP);
            for (String other : ICON_IDS) {
                if (other.equals(id)) continue;
                pm.setComponentEnabledSetting(new android.content.ComponentName(getContext(), iconAlias(getContext(), other)),
                    android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED, android.content.pm.PackageManager.DONT_KILL_APP);
            }
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not change the icon: " + e.getMessage());
        }
    }

    /** Which icon color is on now. */
    @PluginMethod
    public void getLauncherIcon(PluginCall call) {
        android.content.pm.PackageManager pm = getContext().getPackageManager();
        String current = "forest";
        for (String id : ICON_IDS) {
            int s = pm.getComponentEnabledSetting(new android.content.ComponentName(getContext(), iconAlias(getContext(), id)));
            if (s == android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED) current = id;
        }
        JSObject o = new JSObject();
        o.put("id", current);
        call.resolve(o);
    }

    /** Keeps the screen on while a workout runs (cleared again when it ends). */
    @PluginMethod
    public void setKeepScreenOn(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        call.resolve();
    }

    @PluginMethod
    public void updateWidget(PluginCall call) {
        SharedPreferences.Editor e = getContext().getSharedPreferences(QuickWidgetProvider.PREFS, Context.MODE_PRIVATE).edit();
        e.putInt("steps", call.getInt("steps", 0));
        e.putInt("stepGoal", call.getInt("stepGoal", 10000));
        e.putInt("week", call.getInt("week", 0));
        e.putInt("weekGoal", call.getInt("weekGoal", 4));
        e.putInt("streak", call.getInt("streak", 0));
        e.putInt("readiness", call.getInt("readiness", -1));
        e.putString("readinessLabel", call.getString("readinessLabel", ""));
        e.putInt("monthPct", call.getInt("monthPct", -1));
        e.putString("monthLabel", call.getString("monthLabel", ""));
        e.apply();
        QuickWidgetProvider.refreshAll(getContext());
        call.resolve();
    }
}