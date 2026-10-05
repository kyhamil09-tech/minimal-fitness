package com.kyfitness.app;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.TrafficStats;
import android.os.Process;
import android.os.SystemClock;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Facts about this app taken from Android itself rather than from the app's own bookkeeping, so the Privacy screen can show
 * numbers the app cannot edit: the bytes Android has counted this app sending and receiving, the permissions it asks for,
 * and whether it allows Google cloud backup or plain-HTTP traffic.
 */
@CapacitorPlugin(name = "Privacy")
public class PrivacyPlugin extends Plugin {

    @PluginMethod
    public void info(PluginCall call) {
        Context c = getContext();
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), PackageManager.GET_PERMISSIONS);
            JSArray perms = new JSArray();
            if (pi.requestedPermissions != null) {
                for (int i = 0; i < pi.requestedPermissions.length; i++) {
                    boolean granted = pi.requestedPermissionsFlags != null && (pi.requestedPermissionsFlags[i] & PackageInfo.REQUESTED_PERMISSION_GRANTED) != 0;
                    JSObject p = new JSObject();
                    p.put("name", pi.requestedPermissions[i]);
                    p.put("granted", granted);
                    perms.put(p);
                }
            }
            ApplicationInfo ai = c.getApplicationInfo();
            int uid = Process.myUid();
            JSObject o = new JSObject();
            o.put("permissions", perms);
            o.put("backupAllowed", (ai.flags & ApplicationInfo.FLAG_ALLOW_BACKUP) != 0);
            o.put("cleartextAllowed", (ai.flags & ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC) != 0);
            o.put("debuggable", (ai.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
            // Counted by Android for this app's user id since the phone last started (-1 when the phone does not report it).
            o.put("txBytes", TrafficStats.getUidTxBytes(uid));
            o.put("rxBytes", TrafficStats.getUidRxBytes(uid));
            o.put("countedSince", System.currentTimeMillis() - SystemClock.elapsedRealtime());
            o.put("version", pi.versionName);
            call.resolve(o);
        } catch (Exception e) {
            call.reject("Could not read the app's details: " + e.getMessage());
        }
    }
}
