package com.kyfitness.app;

import android.Manifest;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * Bridge for the safety live share (see LiveShare.java). Texts go out by SMS through the phone itself: this plugin never uses the
 * internet. Sending needs the SMS permission, which is asked for only when you switch the feature on.
 */
@CapacitorPlugin(
    name = "LiveShare",
    permissions = {@Permission(strings = {Manifest.permission.SEND_SMS}, alias = "sms")}
)
public class LiveSharePlugin extends Plugin {

    private boolean canText() {
        return getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY_MESSAGING);
    }

    private boolean granted() {
        return getPermissionState("sms") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("canText", canText());
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (!canText()) {
            call.reject("This phone cannot send text messages.");
            return;
        }
        if (granted()) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("sms", call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    private String[] numbersOf(PluginCall call) {
        try {
            JSONArray a = call.getArray("numbers");
            if (a == null) return new String[0];
            String[] out = new String[a.length()];
            for (int i = 0; i < a.length(); i++) out[i] = a.getString(i);
            return out;
        } catch (JSONException e) {
            return new String[0];
        }
    }

    @PluginMethod
    public void arm(PluginCall call) {
        if (!granted()) {
            call.reject("Text messages are not allowed for this app. Allow SMS in the Live share settings.");
            return;
        }
        String[] numbers = numbersOf(call);
        if (numbers.length == 0) {
            call.reject("No one to text. Add a contact in the Live share settings.");
            return;
        }
        LiveShare.arm(getContext(), numbers, call.getInt("everyMin", 10), call.getString("name", ""), call.getString("sport", "workout"),
            Boolean.TRUE.equals(call.getBoolean("miles", false)), !Boolean.FALSE.equals(call.getBoolean("stillAlert", true)));
        call.resolve();
    }

    @PluginMethod
    public void setPaused(PluginCall call) {
        LiveShare.setPaused(Boolean.TRUE.equals(call.getBoolean("paused", false)));
        call.resolve();
    }

    @PluginMethod
    public void disarm(PluginCall call) {
        LiveShare.disarm();
        call.resolve();
    }

    @PluginMethod
    public void sos(PluginCall call) {
        if (!granted()) {
            call.reject("Text messages are not allowed for this app.");
            return;
        }
        boolean ok = LiveShare.sos(getContext(), numbersOf(call), call.getString("name", ""));
        JSObject r = new JSObject();
        r.put("sent", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void test(PluginCall call) {
        if (!granted()) {
            call.reject("Text messages are not allowed for this app.");
            return;
        }
        boolean ok = LiveShare.test(getContext(), numbersOf(call), call.getString("name", ""));
        JSObject r = new JSObject();
        r.put("sent", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void log(PluginCall call) {
        JSObject r = new JSObject();
        try {
            r.put("entries", new JSONArray(LiveShare.readLog(getContext())));
        } catch (JSONException e) {
            r.put("entries", new JSONArray());
        }
        call.resolve(r);
    }

    @PluginMethod
    public void clearLog(PluginCall call) {
        LiveShare.clearLog(getContext());
        call.resolve();
    }
}
