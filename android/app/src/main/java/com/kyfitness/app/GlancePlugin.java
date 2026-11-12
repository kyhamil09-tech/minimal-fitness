package com.kyfitness.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;

/**
 * Sends the few numbers the watch's complications show (readiness, the month's goal, the running fast, the step goal) to the
 * watch over the Bluetooth link between the two. One small item is kept up to date; the watch stores it and redraws.
 */
@CapacitorPlugin(name = "Glance")
public class GlancePlugin extends Plugin {
    /** The smart alarm's settings for the watch: whether it is on, the latest wake time (minutes after midnight) and the window. */
    @PluginMethod
    public void sendAlarm(PluginCall call) {
        try {
            PutDataMapRequest req = PutDataMapRequest.create("/ky/alarm");
            DataMap m = req.getDataMap();
            m.putBoolean("enabled", Boolean.TRUE.equals(call.getBoolean("enabled", false)));
            m.putInt("wakeMin", call.getInt("wakeMin", 420));
            m.putInt("windowMin", call.getInt("windowMin", 30));
            PutDataRequest put = req.asPutDataRequest();
            put.setUrgent();
            Wearable.getDataClient(getContext()).putDataItem(put);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not reach the watch.");
        }
    }

    /** The strength sessions (today's plan day, your routines, starter templates) the watch offers when you start Strength there. */
    @PluginMethod
    public void sendRoutines(PluginCall call) {
        String json = call.getString("json", "[]");
        try {
            PutDataMapRequest req = PutDataMapRequest.create("/ky/routines");
            req.getDataMap().putString("json", json == null ? "[]" : json);
            PutDataRequest put = req.asPutDataRequest();
            put.setUrgent();
            Wearable.getDataClient(getContext()).putDataItem(put);
        } catch (RuntimeException e) {
            // No watch: it keeps the list it had.
        }
        call.resolve();
    }

    /** The exercise library the watch's picker offers when you add an exercise to a strength session there. */
    @PluginMethod
    public void sendExercises(PluginCall call) {
        String json = call.getString("json", "{}");
        try {
            PutDataMapRequest req = PutDataMapRequest.create("/ky/exercises");
            req.getDataMap().putString("json", json == null ? "{}" : json);
            PutDataRequest put = req.asPutDataRequest();
            Wearable.getDataClient(getContext()).putDataItem(put);
        } catch (RuntimeException e) {
            // No watch: it keeps the list it had.
        }
        call.resolve();
    }

    /** The shoes and bikes the watch offers when you start a run or a ride there. */
    @PluginMethod
    public void sendGear(PluginCall call) {
        String json = call.getString("json", "[]");
        try {
            PutDataMapRequest req = PutDataMapRequest.create("/ky/gear");
            req.getDataMap().putString("json", json == null ? "[]" : json);
            PutDataRequest put = req.asPutDataRequest();
            put.setUrgent();
            Wearable.getDataClient(getContext()).putDataItem(put);
        } catch (RuntimeException e) {
            // No watch: it keeps the list it had.
        }
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        try {
            PutDataMapRequest req = PutDataMapRequest.create("/ky/glance");
            DataMap m = req.getDataMap();
            m.putInt("readiness", call.getInt("readiness", -1));
            m.putString("readinessLabel", call.getString("readinessLabel", ""));
            m.putInt("stepGoal", call.getInt("stepGoal", 10000));
            m.putInt("monthPct", call.getInt("monthPct", -1));
            m.putString("monthText", call.getString("monthText", ""));
            m.putString("monthKind", call.getString("monthKind", ""));
            m.putBoolean("fastActive", Boolean.TRUE.equals(call.getBoolean("fastActive", false)));
            m.putLong("fastStartMs", (long) call.getData().optDouble("fastStartMs", 0));
            m.putFloat("fastGoalHours", call.getFloat("fastGoalHours", 16f));
            // The most the heart can reach, so the watch's zones are right when the phone is not there.
            m.putInt("maxHr", call.getInt("maxHr", 0));
            // Last night, for the watch's sleep screen and complication (sleepMin -1 = nothing yet).
            m.putInt("sleepMin", call.getInt("sleepMin", -1));
            m.putInt("sleepDeep", call.getInt("sleepDeep", 0));
            m.putInt("sleepRem", call.getInt("sleepRem", 0));
            m.putInt("sleepLight", call.getInt("sleepLight", 0));
            m.putInt("sleepAwake", call.getInt("sleepAwake", 0));
            m.putInt("sleepScore", call.getInt("sleepScore", -1));
            m.putInt("sleepGoalMin", call.getInt("sleepGoalMin", 480));
            m.putString("sleepBed", call.getString("sleepBed", ""));
            m.putString("sleepWake", call.getString("sleepWake", ""));
            m.putString("sleepDate", call.getString("sleepDate", ""));
            // Today's food, for the watch's Eat tile, complication and meal nudge.
            m.putInt("eatEaten", call.getInt("eatEaten", 0));
            m.putInt("eatGoal", call.getInt("eatGoal", 0));
            m.putInt("eatLeft", call.getInt("eatLeft", 0));
            m.putInt("eatP", call.getInt("eatP", 0));
            m.putInt("eatPGoal", call.getInt("eatPGoal", 0));
            m.putLong("eatLastMs", (long) call.getData().optDouble("eatLastMs", 0));
            // This week's sleep debt, for the watch's sleep screen and complication (-1 = no nights tracked).
            m.putInt("sleepDebtMin", call.getInt("sleepDebtMin", -1));
            m.putInt("sleepDebtNights", call.getInt("sleepDebtNights", 0));
            PutDataRequest put = req.asPutDataRequest();
            put.setUrgent();
            Wearable.getDataClient(getContext()).putDataItem(put);
            call.resolve();
        } catch (RuntimeException e) {
            // No watch or the Play services link is unavailable: the watch simply keeps what it had.
            call.resolve();
        }
    }
}
