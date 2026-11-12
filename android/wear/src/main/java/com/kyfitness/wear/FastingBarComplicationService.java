package com.kyfitness.wear;

import android.app.PendingIntent;
import android.content.Intent;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationType;
import androidx.wear.watchface.complications.data.NoDataComplicationData;
import androidx.wear.watchface.complications.data.PlainComplicationText;
import androidx.wear.watchface.complications.data.RangedValueComplicationData;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService;
import androidx.wear.watchface.complications.datasource.ComplicationRequest;
import java.util.Locale;

/**
 * Feeds the fasting stage bar on the Minimal Fitness digital watch face. A complication cannot send two separate numbers, and Android
 * rejects a value above its maximum, so the numbers ride in the range itself: the value is the hours fasted, the minimum is minus the
 * goal in hours, and the maximum is the length of the bar (24 hours, or the goal plus 4 when that is longer, as on the phone).
 * Other faces that show this would draw a meaningless ring; use "Fasting timer" there.
 */
public class FastingBarComplicationService extends ComplicationDataSourceService {

    @Override
    public void onComplicationRequest(@NonNull ComplicationRequest request, @NonNull ComplicationRequestListener listener) {
        try {
            listener.onComplicationData(build(request.getComplicationType(), false));
        } catch (android.os.RemoteException ignored) {
            // The system went away; it asks again.
        }
    }

    @Nullable
    @Override
    public ComplicationData getPreviewData(@NonNull ComplicationType type) {
        return build(type, true);
    }

    private ComplicationData build(ComplicationType type, boolean preview) {
        if (type != ComplicationType.RANGED_VALUE) return new NoDataComplicationData();
        float goal = 16f;
        float hours = 14.33f;
        if (!preview) {
            goal = Math.max(0.5f, GlanceStore.fastGoalHours(this));
            boolean on = WatchPrefs.fasting(this) && GlanceStore.fastActive(this);
            hours = on ? Math.max(0f, (System.currentTimeMillis() - GlanceStore.fastStartMs(this)) / 3_600_000f) : 0f;
        }
        float total = Math.max(24f, (float) Math.ceil(goal) + 4f);
        float value = Math.min(hours, total);
        long mins = Math.round(value * 60);
        String text = hours <= 0f ? "--" : String.format(Locale.getDefault(), "%d:%02d", mins / 60, mins % 60);
        PendingIntent tap = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new RangedValueComplicationData.Builder(value, -goal, total, new PlainComplicationText.Builder("Fasting for " + text + " of " + Math.round(goal) + " hours").build())
            .setText(new PlainComplicationText.Builder(text).build())
            .setTitle(new PlainComplicationText.Builder("Fast").build())
            .setTapAction(tap)
            .build();
    }
}
