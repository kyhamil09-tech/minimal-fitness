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
import androidx.wear.watchface.complications.data.CountUpTimeReference;
import androidx.wear.watchface.complications.data.NoDataComplicationData;
import androidx.wear.watchface.complications.data.PlainComplicationText;
import androidx.wear.watchface.complications.data.ShortTextComplicationData;
import androidx.wear.watchface.complications.data.TimeDifferenceComplicationText;
import androidx.wear.watchface.complications.data.TimeDifferenceStyle;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester;
import androidx.wear.watchface.complications.datasource.ComplicationRequest;
import java.time.Instant;

/**
 * "Minimal Fitness workout" complication for any watch face: shows a live stopwatch (and heart rate)
 * while a workout runs, and a tap-to-open "Start" shortcut otherwise.
 */
public class KyComplicationService extends ComplicationDataSourceService {

    /** Asks the system to redraw the complication; call when the workout state changes. */
    static void requestUpdate(Context ctx) {
        try {
            ComplicationDataSourceUpdateRequester.create(
                ctx.getApplicationContext(), new ComponentName(ctx, KyComplicationService.class))
                .requestUpdateAll();
        } catch (RuntimeException ignored) {
            // No complication is placed on a face: nothing to update.
        }
    }

    @Override
    public void onComplicationRequest(@NonNull ComplicationRequest request, @NonNull ComplicationRequestListener listener) {
        try {
            listener.onComplicationData(build(request.getComplicationType(), false));
        } catch (android.os.RemoteException ignored) {
            // System went away; it will ask again.
        }
    }

    @Nullable
    @Override
    public ComplicationData getPreviewData(@NonNull ComplicationType type) {
        return build(type, true);
    }

    private ComplicationData build(ComplicationType type, boolean preview) {
        if (type != ComplicationType.SHORT_TEXT) return new NoDataComplicationData();

        PendingIntent tap = PendingIntent.getActivity(
            this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        ComplicationText description = new PlainComplicationText.Builder("Minimal Fitness workout").build();

        ComplicationText text;
        ComplicationText title;
        if (preview) {
            text = new PlainComplicationText.Builder("12:34").build();
            title = new PlainComplicationText.Builder("142").build();
        } else if (WorkoutState.active) {
            long now = System.currentTimeMillis();
            if (WorkoutState.paused) {
                long secs = WorkoutState.elapsedMs(now) / 1000;
                String clock = secs >= 3600
                    ? String.format("%d:%02d:%02d", secs / 3600, (secs % 3600) / 60, secs % 60)
                    : String.format("%02d:%02d", secs / 60, secs % 60);
                text = new PlainComplicationText.Builder(clock).build();
                title = new PlainComplicationText.Builder("Paused").build();
            } else {
                // Counts up on its own, so no per-second updates are needed.
                Instant reference = Instant.ofEpochMilli(WorkoutState.startedAt + WorkoutState.pausedTotalMs);
                text = new TimeDifferenceComplicationText.Builder(
                    TimeDifferenceStyle.STOPWATCH, new CountUpTimeReference(reference)).build();
                title = new PlainComplicationText.Builder(WorkoutState.bpm > 0 ? String.valueOf(WorkoutState.bpm) : "Ky").build();
            }
        } else {
            text = new PlainComplicationText.Builder("Start").build();
            title = new PlainComplicationText.Builder("Ky Fit").build();
        }
        return new ShortTextComplicationData.Builder(text, description).setTitle(title).setTapAction(tap).build();
    }
}
