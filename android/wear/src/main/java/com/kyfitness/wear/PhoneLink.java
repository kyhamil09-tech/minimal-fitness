package com.kyfitness.wear;

import android.content.Context;
import com.google.android.gms.wearable.CapabilityClient;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Sends messages to the paired phone over the Wear OS Data Layer. */
final class PhoneLink {
    static final String PATH_HR = "/ky/hr";
    static final String PATH_KCAL = "/ky/kcal";
    static final String PATH_CMD = "/ky/workout/cmd";
    /** Announced by the phone app (res/values/wear.xml there). */
    private static final String PHONE_CAPABILITY = "ky_fitness_phone";

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
        // Stale or unknown: look up the phone first, then send. The phone app announces itself with a capability, so the message goes to it
        // and not to every device the watch is connected to; a phone running an older version that does not announce falls back to all.
        Wearable.getCapabilityClient(app)
            .getCapability(PHONE_CAPABILITY, CapabilityClient.FILTER_REACHABLE)
            .addOnSuccessListener(info -> {
                List<Node> phones = new ArrayList<>(info.getNodes());
                if (phones.isEmpty()) sendToConnected(app, path, payload);
                else remember(app, path, payload, phones);
            })
            .addOnFailureListener(e -> sendToConnected(app, path, payload));
    }

    private static void sendToConnected(Context app, String path, byte[] payload) {
        Wearable.getNodeClient(app).getConnectedNodes().addOnSuccessListener(list -> remember(app, path, payload, list));
    }

    private static void remember(Context app, String path, byte[] payload, List<Node> list) {
        nodes = list;
        refreshedAt = System.currentTimeMillis();
        deliver(app, path, payload, list);
    }

    static void sendCommand(Context ctx, String cmd, String type) {
        // "at" is when the button was pressed. The phone uses it to tell a press from a moment ago from one that was held up for a long time.
        String json = "{\"cmd\":\"" + cmd + "\"" + (type != null ? ",\"type\":\"" + type + "\"" : "") + ",\"at\":" + System.currentTimeMillis() + "}";
        send(ctx, PATH_CMD, json);
    }

    /** Tells the phone to start the same workout, including the goal chosen on the watch. */
    static void sendStart(Context ctx, String type, int goalType, double goalValue) {
        String gt = goalType == WorkoutState.GOAL_DISTANCE ? "distance" : goalType == WorkoutState.GOAL_TIME ? "time" : goalType == WorkoutState.GOAL_KCAL ? "calories" : "open";
        // Phone units: kilometers and minutes.
        double v = goalType == WorkoutState.GOAL_DISTANCE ? goalValue / 1000.0 : goalType == WorkoutState.GOAL_TIME ? goalValue / 60_000.0 : goalValue;
        String routine = WorkoutState.pendingRoutine == null ? "" : WorkoutState.pendingRoutine.replaceAll("[^A-Za-z0-9:_-]", "");
        String gear = WorkoutState.workoutGear == null ? "" : WorkoutState.workoutGear.replaceAll("[^A-Za-z0-9:_-]", "");
        String json = "{\"cmd\":\"start\",\"type\":\"" + type + "\",\"goalType\":\"" + gt + "\",\"goalValue\":" + v
            + (routine.isEmpty() ? "" : ",\"routine\":\"" + routine + "\"")
            + (gear.isEmpty() ? "" : ",\"gear\":\"" + gear + "\"") + ",\"at\":" + System.currentTimeMillis() + "}";
        WorkoutState.pendingRoutine = "";
        send(ctx, PATH_CMD, json);
    }

    /** A button on the strength screen: done, reps, weight, next exercise, rest... The phone applies it and sends the new state back. */
    static void sendSet(Context ctx, String action, int delta, int index) {
        String json = "{\"cmd\":\"set\",\"action\":\"" + action + "\",\"delta\":" + delta + ",\"index\":" + index + ",\"at\":" + System.currentTimeMillis() + "}";
        send(ctx, PATH_CMD, json);
    }

    private static void deliver(Context app, String path, byte[] payload, List<Node> targets) {
        for (Node node : targets) {
            Wearable.getMessageClient(app).sendMessage(node.getId(), path, payload);
        }
    }
}
