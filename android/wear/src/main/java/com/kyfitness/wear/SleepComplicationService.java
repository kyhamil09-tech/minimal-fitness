package com.kyfitness.wear;

import android.content.Context;

/** Last night's sleep, with the ring showing how close it came to your goal. */
public class SleepComplicationService extends GlanceComplicationService {
    @Override
    protected Reading read(Context c, boolean preview) {
        if (preview) return new Reading(432, 480, "7h12", "Sleep", "Last night: 7 hours 12 minutes");
        int min = GlanceStore.sleepMin(c);
        if (min < 0) return new Reading(0, GlanceStore.sleepGoalMin(c), "--", "Sleep", "Sleep: no night yet");
        return new Reading(min, GlanceStore.sleepGoalMin(c), hm(min), "Sleep", "Last night: " + (min / 60) + " hours " + (min % 60) + " minutes");
    }

    /** 432 becomes "7h12": short enough for a watch face. */
    static String hm(int minutes) {
        return (minutes / 60) + "h" + String.format(java.util.Locale.US, "%02d", minutes % 60);
    }
}
