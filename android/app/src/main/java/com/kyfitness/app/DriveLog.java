package com.kyfitness.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * Keeps the drives the phone noticed, as [start, end] in epoch milliseconds. Android's activity recognition (on this phone, no account,
 * no internet) says when you get into a vehicle and when you get out; the app uses the list to take the steps a car shakes into the
 * counter off the day. A reading of the step counter is taken at each end, so the steps in between are known exactly.
 */
final class DriveLog {
    private static final String KEY = "drives";
    private static final String OPEN = "driveStart";
    /** Shorter than this is too brief to have shaken many steps in, and is more likely a mistake in the detection. */
    private static final long MIN_MS = 90_000L;
    /** Stopping at a long light can end a drive and start another a moment later: those are one drive. */
    private static final long MERGE_GAP_MS = 5 * 60_000L;
    private static final long KEEP_MS = 30L * 24 * 3_600_000L;
    /** A drive that never reported its end is not trusted past this. */
    private static final long OPEN_TOO_LONG_MS = 8L * 3_600_000L;

    private DriveLog() {}

    private static SharedPreferences prefs(Context c) {
        return ActivityDetect.prefs(c);
    }

    private static JSONArray read(SharedPreferences p) {
        try {
            return new JSONArray(p.getString(KEY, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** You got into a vehicle. {@code ts} is when, in wall-clock time. */
    static synchronized void onEnter(Context c, long ts) {
        SharedPreferences p = prefs(c);
        long open = p.getLong(OPEN, 0);
        if (open > 0 && ts - open < OPEN_TOO_LONG_MS) return; // already on a drive
        long start = ts;
        JSONArray list = read(p);
        int n = list.length();
        if (n > 0) {
            JSONArray last = list.optJSONArray(n - 1);
            if (last != null && ts >= last.optLong(1) && ts - last.optLong(1) <= MERGE_GAP_MS) {
                start = last.optLong(0); // carry on the drive that just ended
                list.remove(n - 1);
            }
        }
        p.edit().putLong(OPEN, start).putString(KEY, list.toString()).apply();
        sampleSteps(c);
    }

    /** You got out. */
    static synchronized void onExit(Context c, long ts) {
        SharedPreferences p = prefs(c);
        long start = p.getLong(OPEN, 0);
        if (start <= 0) return;
        SharedPreferences.Editor e = p.edit().remove(OPEN);
        if (ts - start >= MIN_MS) {
            JSONArray list = read(p);
            JSONArray kept = new JSONArray();
            long cutoff = System.currentTimeMillis() - KEEP_MS;
            for (int i = 0; i < list.length(); i++) {
                JSONArray row = list.optJSONArray(i);
                if (row != null && row.optLong(1) >= cutoff) kept.put(row);
            }
            kept.put(new JSONArray().put(start).put(ts));
            e.putString(KEY, kept.toString());
            sampleSteps(c);
        }
        e.apply();
    }

    /** The finished drives, oldest first. */
    static synchronized JSONArray list(Context c) {
        return read(prefs(c));
    }

    /** When a drive still going began, or 0. */
    static synchronized long open(Context c) {
        long open = prefs(c).getLong(OPEN, 0);
        return open > 0 && System.currentTimeMillis() - open < OPEN_TOO_LONG_MS ? open : 0;
    }

    /** Reads the step counter now, so the steps at the start and end of the drive are on record. */
    private static void sampleSteps(Context c) {
        try {
            WorkManager.getInstance(c.getApplicationContext()).enqueue(new OneTimeWorkRequest.Builder(StepSampleWorker.class).build());
        } catch (RuntimeException ignored) {
            // work cannot be scheduled right now: the regular reading every fifteen minutes still happens
        }
    }
}
