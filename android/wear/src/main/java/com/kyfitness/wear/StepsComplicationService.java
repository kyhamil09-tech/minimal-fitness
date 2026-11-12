package com.kyfitness.wear;

import android.content.Context;
import java.text.NumberFormat;

/** Steps today against the daily step goal set in the phone app. */
public class StepsComplicationService extends GlanceComplicationService {
    @Override
    protected int iconRes() {
        return R.drawable.ic_walk;
    }

    @Override
    protected Reading read(Context c, boolean preview) {
        if (preview) return new Reading(6400, 10000, "6.4k", "Steps", "Steps today");
        int steps = WatchSteps.today(c);
        int goal = GlanceStore.stepGoal(c);
        String text = steps >= 10000 ? String.format("%.1fk", steps / 1000f) : NumberFormat.getIntegerInstance().format(steps);
        return new Reading(steps, goal, text, "Steps", steps + " of " + goal + " steps today");
    }
}
