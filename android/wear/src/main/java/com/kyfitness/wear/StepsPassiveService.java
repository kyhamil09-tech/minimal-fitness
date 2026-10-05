package com.kyfitness.wear;

import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.health.services.client.PassiveListenerService;
import androidx.health.services.client.data.DataPointContainer;
import androidx.health.services.client.data.DataType;
import androidx.health.services.client.data.IntervalDataPoint;
import androidx.health.services.client.data.SampleDataPoint;
import androidx.health.services.client.data.UserActivityInfo;
import androidx.health.services.client.data.UserActivityState;
import java.time.Instant;
import java.util.List;

/**
 * Receives what Health Services measures all day, even when the app is closed:
 * the daily step total (forwarded to the phone as before), heart rate, today's calories, distance and floors,
 * and when the watch thinks you fell asleep or woke up. Everything is kept in {@link VitalsStore} and handed to the
 * phone by {@link VitalsSync}.
 */
public class StepsPassiveService extends PassiveListenerService {
    @Override
    public void onNewDataPointsReceived(@NonNull DataPointContainer dataPoints) {
        long now = System.currentTimeMillis();

        List<IntervalDataPoint<Long>> steps = dataPoints.getData(DataType.STEPS_DAILY);
        if (!steps.isEmpty()) {
            long total = steps.get(steps.size() - 1).getValue();
            if (total >= 0) {
                WatchSteps.store(this, (int) total);
        GlanceComplicationService.request(this, StepsComplicationService.class);
                WatchSteps.sendToPhone(this, (int) total);
                VitalsStore.addSteps(this, now, total);
                VitalsStore.setDaily(this, "steps", total);
            }
        }

        if (WatchPrefs.allDay(this)) {
            Instant boot = Instant.ofEpochMilli(now - SystemClock.elapsedRealtime());
            for (SampleDataPoint<Double> point : dataPoints.getData(DataType.HEART_RATE_BPM)) {
                double bpm = point.getValue();
                if (bpm < 30 || bpm > 230) continue;
                VitalsStore.addHr(this, point.getTimeInstant(boot).toEpochMilli(), (int) Math.round(bpm));
            }
            storeLast(dataPoints.getData(DataType.CALORIES_DAILY), "kcal");
            storeLast(dataPoints.getData(DataType.DISTANCE_DAILY), "dist");
            storeLast(dataPoints.getData(DataType.FLOORS_DAILY), "floors");
        }
        VitalsSync.maybeSend(this, false);
    }

    private void storeLast(List<IntervalDataPoint<Double>> points, String field) {
        if (points.isEmpty()) return;
        double v = points.get(points.size() - 1).getValue();
        if (v >= 0) VitalsStore.setDaily(this, field, v);
    }

    @Override
    public void onUserActivityInfoReceived(@NonNull UserActivityInfo info) {
        if (!WatchPrefs.allDay(this)) return;
        UserActivityState state = info.getUserActivityState();
        // The app's own codes, so nothing depends on Health Services' internal numbering: 2 asleep, 3 awake, 1 exercise, 0 unknown.
        int code = state.equals(UserActivityState.USER_ACTIVITY_ASLEEP) ? 2
            : state.equals(UserActivityState.USER_ACTIVITY_PASSIVE) ? 3
            : state.equals(UserActivityState.USER_ACTIVITY_EXERCISE) ? 1 : 0;
        VitalsStore.addState(this, info.getStateChangeTime().toEpochMilli(), code);
        VitalsSync.maybeSend(this, true);
    }
}
