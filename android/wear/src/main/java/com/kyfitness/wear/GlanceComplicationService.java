package com.kyfitness.wear;

import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationText;
import androidx.wear.watchface.complications.data.ComplicationType;
import androidx.wear.watchface.complications.data.NoDataComplicationData;
import androidx.wear.watchface.complications.data.PlainComplicationText;
import androidx.wear.watchface.complications.data.RangedValueComplicationData;
import androidx.wear.watchface.complications.data.ShortTextComplicationData;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester;
import androidx.wear.watchface.complications.datasource.ComplicationRequest;

/**
 * Base for the ready-made complications (readiness, steps, month goal, fasting). Each one says what it shows for the short-text
 * and ranged-value shapes; the base class builds the data and the tap that opens the watch app.
 */
public abstract class GlanceComplicationService extends ComplicationDataSourceService {

    /** What one complication shows right now. {@code value} is out of {@code max}; a negative value means there is nothing to show yet. */
    protected static final class Reading {
        final float value;
        final float max;
        final String text;
        final String title;
        final String description;

        Reading(float value, float max, String text, String title, String description) {
            this.value = value;
            this.max = max;
            this.text = text;
            this.title = title;
            this.description = description;
        }
    }

    protected abstract Reading read(Context c, boolean preview);

    /** Asks the system to redraw every complication of this app that is on a watch face. */
    static void requestAll(Context ctx) {
        Class<?>[] all = {ReadinessComplicationService.class, StepsComplicationService.class, MonthGoalComplicationService.class, FastingComplicationService.class};
        for (Class<?> cls : all) request(ctx, cls);
    }

    static void request(Context ctx, Class<?> cls) {
        try {
            ComplicationDataSourceUpdateRequester.create(ctx.getApplicationContext(), new ComponentName(ctx, cls)).requestUpdateAll();
        } catch (RuntimeException ignored) {
            // Not placed on any face: nothing to redraw.
        }
    }

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

    protected PendingIntent tapAction() {
        return PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** The text a complication shows; fasting overrides this to count up on its own. */
    protected ComplicationText textFor(Reading r, boolean preview) {
        return new PlainComplicationText.Builder(r.text).build();
    }

    protected ComplicationData build(ComplicationType type, boolean preview) {
        Reading r = read(this, preview);
        PendingIntent tap = tapAction();
        ComplicationText description = new PlainComplicationText.Builder(r.description).build();
        ComplicationText text = textFor(r, preview);
        ComplicationText title = new PlainComplicationText.Builder(r.title).build();
        if (type == ComplicationType.RANGED_VALUE) {
            float max = r.max > 0 ? r.max : 100f;
            float value = Math.max(0f, Math.min(max, r.value));
            return new RangedValueComplicationData.Builder(value, 0f, max, description).setText(text).setTitle(title).setTapAction(tap).build();
        }
        if (type == ComplicationType.SHORT_TEXT) {
            return new ShortTextComplicationData.Builder(text, description).setTitle(title).setTapAction(tap).build();
        }
        return new NoDataComplicationData();
    }
}
