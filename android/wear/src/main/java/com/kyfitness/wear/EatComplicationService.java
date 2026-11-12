package com.kyfitness.wear;

import android.content.Context;
import java.util.Locale;

/** Calories left today (or how far past the plan), with a ring of calories eaten against the day's goal. */
public class EatComplicationService extends GlanceComplicationService {
    @Override
    protected int iconRes() {
        return R.drawable.ic_eat;
    }

    private static String number(int n) {
        return String.format(Locale.US, "%,d", n);
    }

    @Override
    protected Reading read(Context c, boolean preview) {
        if (preview) return new Reading(1460, 2200, "740", "Eat", "740 calories left today");
        if (!GlanceStore.eatKnown(c)) return new Reading(0, 100, "Open", "Eat", "Open the app on your phone to see calories left");
        int left = GlanceStore.eatLeft(c);
        int goal = GlanceStore.eatGoal(c);
        String text = left >= 0 ? number(left) : "+" + number(-left);
        String description = left >= 0 ? number(left) + " calories left today" : number(-left) + " calories past your plan today";
        return new Reading(GlanceStore.eatEaten(c), Math.max(1, goal), text, "Eat", description);
    }
}
