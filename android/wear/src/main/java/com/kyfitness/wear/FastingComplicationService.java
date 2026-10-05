package com.kyfitness.wear;

import android.content.Context;
import androidx.wear.watchface.complications.data.ComplicationText;
import androidx.wear.watchface.complications.data.CountUpTimeReference;
import androidx.wear.watchface.complications.data.TimeDifferenceComplicationText;
import androidx.wear.watchface.complications.data.TimeDifferenceStyle;
import java.time.Instant;

/** The running fast: a clock that counts up on its own, with the share of the goal as the ring. */
public class FastingComplicationService extends GlanceComplicationService {
    @Override
    protected Reading read(Context c, boolean preview) {
        if (preview) return new Reading(14, 16, "14:05", "Fast", "Fasting timer");
        if (!GlanceStore.fastActive(c)) return new Reading(0, 16, "--", "Fast", "Not fasting");
        float goal = Math.max(0.5f, GlanceStore.fastGoalHours(c));
        float hours = Math.max(0f, (System.currentTimeMillis() - GlanceStore.fastStartMs(c)) / 3_600_000f);
        // The ring only moves when the phone sends an update; the clock itself keeps counting.
        return new Reading(Math.min(hours, goal), goal, "", "Fast", "Fasting for " + Math.round(hours) + " of " + Math.round(goal) + " hours");
    }

    @Override
    protected ComplicationText textFor(Reading r, boolean preview) {
        if (preview || !GlanceStore.fastActive(this)) return super.textFor(r, preview);
        return new TimeDifferenceComplicationText.Builder(
            TimeDifferenceStyle.STOPWATCH, new CountUpTimeReference(Instant.ofEpochMilli(GlanceStore.fastStartMs(this)))).build();
    }
}
