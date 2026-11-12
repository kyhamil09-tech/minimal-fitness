package com.kyfitness.wear;

import android.content.Context;

/** Today's water against the daily goal, in the units chosen on the phone. */
public class WaterComplicationService extends GlanceComplicationService {
    @Override
    protected int iconRes() {
        return R.drawable.ic_drop;
    }

    @Override
    protected Reading read(Context c, boolean preview) {
        if (preview) return new Reading(1400, 2500, "1.4L", "Water", "1.4 liters of water today");
        boolean imperial = WaterStore.imperial(c);
        int total = WaterStore.totalMl(c);
        int goal = WaterStore.goalMl(c);
        String text = WaterStore.format(total, imperial).replace(" fl oz", "oz").replace(" ", "");
        return new Reading(total, goal, text, "Water", WaterStore.format(total, imperial) + " of " + WaterStore.format(goal, imperial) + " water today");
    }
}
