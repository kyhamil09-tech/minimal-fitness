package com.kyfitness.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import com.google.android.gms.location.SleepClassifyEvent;
import com.google.android.gms.location.SleepSegmentEvent;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Receives the sleep periods Google Play services detects on this phone and keeps them until the app reads them. */
public class SleepReceiver extends BroadcastReceiver {
    static final String PREFS = "ky_sleep";
    static final String KEY = "segments";
    /** The phone's own readings every ten minutes: [time, confidence you are asleep, motion, light], each 0 to 100. */
    static final String CLASSIFY_KEY = "classify";
    private static final int KEEP_CLASSIFY = 600;

    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (SleepClassifyEvent.hasEvents(intent)) storeClassify(p, SleepClassifyEvent.extractEvents(intent));
        if (!SleepSegmentEvent.hasEvents(intent)) return;
        List<SleepSegmentEvent> events = SleepSegmentEvent.extractEvents(intent);
        try {
            JSONArray all = new JSONArray(p.getString(KEY, "[]"));
            for (SleepSegmentEvent e : events) {
                JSONObject o = new JSONObject();
                o.put("start", e.getStartTimeMillis());
                o.put("end", e.getEndTimeMillis());
                o.put("status", e.getStatus());
                all.put(o);
            }
            // Keep the most recent 60 periods.
            while (all.length() > 60) all.remove(0);
            p.edit().putString(KEY, all.toString()).apply();
        } catch (JSONException ignored) {
            // a bad record is skipped; the next delivery starts clean
        }
    }

    private static void storeClassify(SharedPreferences p, List<SleepClassifyEvent> events) {
        try {
            JSONArray all = new JSONArray(p.getString(CLASSIFY_KEY, "[]"));
            for (SleepClassifyEvent e : events) {
                all.put(new JSONArray().put(e.getTimestampMillis()).put(e.getConfidence()).put(e.getMotion()).put(e.getLight()));
            }
            while (all.length() > KEEP_CLASSIFY) all.remove(0);
            p.edit().putString(CLASSIFY_KEY, all.toString()).apply();
        } catch (JSONException ignored) {
            // a bad record is skipped
        }
    }
}