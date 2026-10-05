package com.kyfitness.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.BatteryManager;
import android.os.Build;
import android.telephony.SmsManager;
import java.util.ArrayList;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Safety live share: while a GPS workout runs, texts a link to where you are to the people you chose, by SMS. There is no server
 * and no internet use: the text goes out through the phone's own SMS (your carrier), and the link is a plain map address the
 * receiver's phone opens. It runs inside the location service, so it keeps going with the screen off.
 *
 * What it sends: a "started" text once there is a good fix, an update every few minutes (with time, distance and battery), one
 * "has not moved for 5 minutes" text if you stand still, a "finished" text when the workout ends, and the emergency text when
 * you press the button. Every text it sends is also written to a local log you can read in Settings.
 */
final class LiveShare {
    private static final double MAX_ACCURACY_M = 60;
    private static final long STILL_MS = 5 * 60_000L;
    private static final double STILL_RADIUS_M = 40;
    private static final String PREFS = "ky_live_share";
    private static final int LOG_KEEP = 60;

    private static Context app;
    private static boolean armed = false;
    private static String[] numbers = new String[0];
    private static String name = "Someone";
    private static String sport = "workout";
    private static boolean miles = false;
    private static boolean stillAlert = true;
    private static long everyMs = 10 * 60_000L;

    private static boolean startSent = false;
    private static long startedAt = 0;
    private static long lastSentMs = 0;
    private static long pausedSince = 0;
    private static long pausedAccum = 0;
    private static double lastLat = Double.NaN;
    private static double lastLng = Double.NaN;
    private static double distanceKm = 0;
    private static double stepLat = Double.NaN;
    private static double stepLng = Double.NaN;
    private static double anchorLat = Double.NaN;
    private static double anchorLng = Double.NaN;
    private static long anchorMs = 0;
    private static boolean stillSent = false;

    private LiveShare() {}

    static synchronized void arm(Context context, String[] to, int everyMin, String who, String what, boolean useMiles, boolean still) {
        app = context.getApplicationContext();
        numbers = to;
        everyMs = Math.max(2, everyMin) * 60_000L;
        name = who == null || who.trim().isEmpty() ? "Someone" : who.trim();
        sport = what == null || what.trim().isEmpty() ? "workout" : what.trim();
        miles = useMiles;
        stillAlert = still;
        armed = to.length > 0;
        startSent = false;
        startedAt = System.currentTimeMillis();
        lastSentMs = 0;
        pausedSince = 0;
        pausedAccum = 0;
        lastLat = Double.NaN;
        lastLng = Double.NaN;
        stepLat = Double.NaN;
        stepLng = Double.NaN;
        anchorLat = Double.NaN;
        anchorLng = Double.NaN;
        anchorMs = 0;
        stillSent = false;
        distanceKm = 0;
    }

    /** Ends sharing. Sends the "finished" text when sharing had started, so the people following are not left wondering. */
    static synchronized void disarm() {
        if (!armed) return;
        if (startSent && !Double.isNaN(lastLat)) {
            send("finish", name + " finished their " + sport + ". Last location: " + link(lastLat, lastLng));
        }
        armed = false;
        startSent = false;
    }

    static synchronized void setPaused(boolean paused) {
        if (!armed) return;
        long now = System.currentTimeMillis();
        if (paused && pausedSince == 0) {
            pausedSince = now;
        } else if (!paused && pausedSince != 0) {
            pausedAccum += now - pausedSince;
            pausedSince = 0;
            anchorMs = now; // standing still while paused is not "not moving"
        }
    }

    static synchronized void onFix(long ts, double lat, double lng, double accuracy) {
        if (!armed) return;
        if (!Double.isNaN(accuracy) && accuracy > MAX_ACCURACY_M) return;
        long now = System.currentTimeMillis();
        lastLat = lat;
        lastLng = lng;
        if (!Double.isNaN(stepLat)) {
            double step = haversineKm(stepLat, stepLng, lat, lng);
            if (step > 0.004 && step < 0.2 && pausedSince == 0) distanceKm += step;
        }
        stepLat = lat;
        stepLng = lng;

        if (!startSent) {
            startSent = true;
            lastSentMs = now;
            anchorLat = lat;
            anchorLng = lng;
            anchorMs = now;
            send("start", name + " started a " + sport + " and is sharing their location with you. Follow along: " + link(lat, lng));
            return;
        }
        if (pausedSince != 0) return;

        // Not moving for five minutes: say so once, until they move again.
        if (stillAlert) {
            double fromAnchor = Double.isNaN(anchorLat) ? 0 : haversineKm(anchorLat, anchorLng, lat, lng) * 1000;
            if (fromAnchor > STILL_RADIUS_M) {
                anchorLat = lat;
                anchorLng = lng;
                anchorMs = now;
                stillSent = false;
            } else if (!stillSent && now - anchorMs >= STILL_MS) {
                stillSent = true;
                send("still", name + " has not moved for 5 minutes. Last location: " + link(lat, lng) + " You may want to check on them.");
            }
        }

        if (now - lastSentMs >= everyMs) {
            lastSentMs = now;
            long mins = Math.max(1, (now - startedAt - pausedAccum) / 60_000L);
            double shown = distanceKm / (miles ? 1.609344 : 1.0);
            send("update", name + ": " + mins + " min, " + String.format(Locale.US, "%.1f", shown) + (miles ? " mi" : " km") + ", battery " + battery() + "%. Now: " + link(lat, lng));
        }
    }

    /** The emergency text: goes to everyone straight away with the last known location. Returns false when nothing could be sent. */
    static synchronized boolean sos(Context context, String[] to, String who) {
        if (app == null) app = context.getApplicationContext();
        String[] saved = numbers;
        String savedName = name;
        if (to != null && to.length > 0) numbers = to;
        if (who != null && !who.trim().isEmpty()) name = who.trim();
        boolean ok = false;
        try {
            String where = Double.isNaN(lastLat) ? "Location not known yet." : "Location: " + link(lastLat, lastLng);
            ok = send("sos", "HELP: " + name + " pressed the emergency button in Minimal Fitness. " + where + " Battery " + battery() + "%. Please call them.");
        } finally {
            numbers = saved;
            name = savedName;
        }
        return ok;
    }

    /** A harmless one-off text so you can check the contact is right before relying on it. */
    static synchronized boolean test(Context context, String[] to, String who) {
        if (app == null) app = context.getApplicationContext();
        String[] saved = numbers;
        if (to != null) numbers = to;
        try {
            return send("test", "Test from Minimal Fitness: " + (who == null || who.trim().isEmpty() ? "Someone" : who.trim()) + " added you to receive location texts during workouts. Nothing else is needed.");
        } finally {
            numbers = saved;
        }
    }

    private static String link(double lat, double lng) {
        return String.format(Locale.US, "https://maps.google.com/?q=%.5f,%.5f", lat, lng);
    }

    private static int battery() {
        try {
            BatteryManager bm = (BatteryManager) app.getSystemService(Context.BATTERY_SERVICE);
            return bm == null ? -1 : bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        } catch (RuntimeException e) {
            return -1;
        }
    }

    private static boolean send(String kind, String body) {
        if (app == null || numbers.length == 0) return false;
        boolean any = false;
        SmsManager sms;
        try {
            sms = Build.VERSION.SDK_INT >= 31 ? app.getSystemService(SmsManager.class) : SmsManager.getDefault();
        } catch (RuntimeException e) {
            sms = null;
        }
        for (String to : numbers) {
            boolean ok = false;
            String err = null;
            if (sms == null) {
                err = "no SMS service";
            } else {
                try {
                    ArrayList<String> parts = sms.divideMessage(body);
                    sms.sendMultipartTextMessage(to, null, parts, null, null);
                    ok = true;
                } catch (SecurityException e) {
                    err = "SMS permission missing";
                } catch (RuntimeException e) {
                    err = e.getMessage();
                }
            }
            any |= ok;
            log(kind, to, ok, err);
        }
        return any;
    }

    // ---- local log of every text sent ----

    private static void log(String kind, String to, boolean ok, String err) {
        try {
            SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray old = new JSONArray(p.getString("log", "[]"));
            JSONArray out = new JSONArray();
            int from = Math.max(0, old.length() - (LOG_KEEP - 1));
            for (int i = from; i < old.length(); i++) out.put(old.get(i));
            JSONObject e = new JSONObject();
            e.put("t", System.currentTimeMillis());
            e.put("kind", kind);
            e.put("to", to);
            e.put("ok", ok);
            if (err != null) e.put("err", err);
            out.put(e);
            p.edit().putString("log", out.toString()).apply();
        } catch (Exception ignored) {
            // the log is a convenience; a failure must not stop the text
        }
    }

    static String readLog(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("log", "[]");
    }

    static void clearLog(Context context) {
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("log").apply();
    }

    private static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
        double r = 6371;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
    }
}
