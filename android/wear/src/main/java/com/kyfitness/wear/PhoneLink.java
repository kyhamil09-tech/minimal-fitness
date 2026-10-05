package com.kyfitness.wear;

import android.content.Context;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;

/** Sends messages to the paired phone over the Wear OS Data Layer. */
final class PhoneLink {
    static final String PATH_HR = "/ky/hr";
    static final String PATH_KCAL = "/ky/kcal";
    static final String PATH_CMD = "/ky/workout/cmd";

    private static volatile List<Node> nodes = Collections.emptyList();
    private static volatile long refreshedAt = 0;

    private PhoneLink() {}

    static void send(Context ctx, String path, String text) {
        final Context app = ctx.getApplicationContext();
        final byte[] payload = text.getBytes(StandardCharsets.UTF_8);
        long now = System.currentTimeMillis();
        if (!nodes.isEmpty() && now - refreshedAt < 10_000) {
            deliver(app, path, payload, nodes);
            return;
        }
        // Stale or unknown: look up the phone first, then send.
        Wearable.getNodeClient(app).getConnectedNodes().addOnSuccessListener(list -> {
            nodes = list;
            refreshedAt = System.currentTimeMillis();
            deliver(app, path, payload, list);
        });
    }

    static void sendCommand(Context ctx, String cmd, String type) {
        String json = "{\"cmd\":\"" + cmd + "\"" + (type != null ? ",\"type\":\"" + type + "\"" : "") + "}";
        send(ctx, PATH_CMD, json);
    }

    /** Tells the phone to start the same workout, including the goal chosen on the watch. */
    static void sendStart(Context ctx, String type, int goalType, double goalValue) {
        String gt = goalType == WorkoutState.GOAL_DISTANCE ? "distance" : goalType == WorkoutState.GOAL_TIME ? "time" : goalType == WorkoutState.GOAL_KCAL ? "calories" : "open";
        // Phone units: kilometres and minutes.
        double v = goalType == WorkoutState.GOAL_DISTANCE ? goalValue / 1000.0 : goalType == WorkoutState.GOAL_TIME ? goalValue / 60_000.0 : goalValue;
        String routine = WorkoutState.pendingRoutine == null ? "" : WorkoutState.pendingRoutine.replaceAll("[^A-Za-z0-9:_-]", "");
        String gear = WorkoutState.workoutGear == null ? "" : WorkoutState.workoutGear.replaceAll("[^A-Za-z0-9:_-]", "");
        String json = "{\"cmd\":\"start\",\"type\":\"" + type + "\",\"goalType\":\"" + gt + "\",\"goalValue\":" + v
            + (routine.isEmpty() ? "" : ",\"routine\":\"" + routine + "\"")
            + (gear.isEmpty() ? "" : ",\"gear\":\"" + gear + "\"") + "}";
        WorkoutState.pendingRoutine = "";
        send(ctx, PATH_CMD, json);
    }

    /** A button on the strength screen: done, reps, weight, next exercise, rest... The phone applies it and sends the new state back. */
    static void sendSet(Context ctx, String action, int delta, int index) {
        String json = "{\"cmd\":\"set\",\"action\":\"" + action + "\",\"delta\":" + delta + ",\"index\":" + index + "}";
        send(ctx, PATH_CMD, json);
    }

    private static void deliver(Context app, String path, byte[] payload, List<Node> targets) {
        for (Node node : targets) {
            Wearable.getMessageClient(app).sendMessage(node.getId(), path, payload);
        }
    }
}
