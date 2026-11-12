package com.kyfitness.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import androidx.wear.remote.interactions.RemoteActivityHelper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.wearable.CapabilityClient;
import com.google.android.gms.wearable.CapabilityInfo;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Bridges the Wear OS Data Layer to the web app, in both directions.
 *
 * Watch to phone:
 *   /ky/hr           payload "72"            -> "heartRate"   {bpm, ts}
 *   /ky/kcal         payload "123.4"         -> "calories"    {kcal, ts}   (measured by the watch)
 *   /ky/workout/cmd  payload {"cmd":"stop"}  -> "watchCommand" {cmd, type?}
 * Phone to watch:
 *   /ky/workout/state  JSON describing the live workout (timer base, distance, pace, ...)
 *   /ky/hr/start, /ky/hr/stop  heart-rate-only streaming
 */
@CapacitorPlugin(name = "WatchHeartRate")
public class WatchHeartRatePlugin extends Plugin implements MessageClient.OnMessageReceivedListener {

    private static final String TAG = "KyWatch";

    /** Declared by the watch app (res/values/wear.xml) so the phone can tell the app is installed. */
    static final String CAPABILITY = "ky_fitness_watch";
    static final String PATH_HR = "/ky/hr";
    static final String PATH_KCAL = "/ky/kcal";
    static final String PATH_CMD = "/ky/workout/cmd";
    static final String PATH_START = "/ky/hr/start";
    static final String PATH_STOP = "/ky/hr/stop";
    static final String PATH_STATE = "/ky/workout/state";
    /** Opens the watch app (see the intent filter in the wear manifest). */
    static final String WATCH_LAUNCH_URI = "kyfit://workout";

    private boolean listening = false;

    @Override
    public void load() {
        if (!playServicesAvailable()) return;
        Wearable.getMessageClient(getContext()).addListener(this);
        listening = true;
    }

    @Override
    protected void handleOnDestroy() {
        if (listening) {
            Wearable.getMessageClient(getContext()).removeListener(this);
            listening = false;
        }
    }

    @Override
    public void onMessageReceived(MessageEvent event) {
        String path = event.getPath();
        String text = new String(event.getData(), StandardCharsets.UTF_8).trim();
        try {
            if (PATH_HR.equals(path)) {
                int bpm = Integer.parseInt(text);
                if (bpm <= 0 || bpm > 300) return;
                SampleBuffer.addHeartRate(System.currentTimeMillis(), bpm);
                JSObject sample = new JSObject();
                sample.put("bpm", bpm);
                sample.put("ts", System.currentTimeMillis());
                notifyListeners("heartRate", sample);
            } else if (PATH_KCAL.equals(path)) {
                double kcal = Double.parseDouble(text);
                if (kcal < 0 || kcal > 20000) return;
                JSObject sample = new JSObject();
                sample.put("kcal", kcal);
                sample.put("ts", System.currentTimeMillis());
                notifyListeners("calories", sample);
            } else if (PATH_CMD.equals(path)) {
                JSONObject cmd = new JSONObject(text);
                JSObject out = new JSObject();
                out.put("cmd", cmd.optString("cmd"));
                if (cmd.has("type")) out.put("type", cmd.optString("type"));
                if (cmd.has("goalType")) out.put("goalType", cmd.optString("goalType"));
                if (cmd.has("goalValue")) out.put("goalValue", cmd.optDouble("goalValue", 0));
                // The strength screen on the watch: a routine picked at the start, and the buttons pressed during the session.
                if (cmd.has("routine")) out.put("routine", cmd.optString("routine"));
                if (cmd.has("gear")) out.put("gear", cmd.optString("gear"));
                if (cmd.has("action")) out.put("action", cmd.optString("action"));
                if (cmd.has("delta")) out.put("delta", cmd.optDouble("delta", 0));
                if (cmd.has("index")) out.put("index", cmd.optInt("index", 0));
                if (cmd.has("at")) out.put("at", cmd.optLong("at", 0));
                // A stop from the watch ends the recording now, even if the app's screen is asleep and cannot act on it until it is opened:
                // nothing after that moment belongs to the workout, and GPS should not keep running (or draw the drive home).
                String name = cmd.optString("cmd");
                long pressedAt = cmd.optLong("at", 0);
                if (("stop".equals(name) || "discard".equals(name)) && pressedAt > 0 && SampleBuffer.isRecording() && pressedAt > SampleBuffer.beganAt()) {
                    SampleBuffer.endAt(pressedAt);
                    getContext().stopService(new android.content.Intent(getContext(), GpsTrackerService.class));
                }
                notifyListeners("watchCommand", out);
            }
        } catch (NumberFormatException | JSONException e) {
            // Malformed payload: drop it rather than showing a wrong number.
            Log.w(TAG, "Ignoring bad message on " + path);
        }
    }

    @PluginMethod
    public void getStatus(final PluginCall call) {
        final JSObject result = new JSObject();
        if (!playServicesAvailable()) {
            result.put("available", false);
            result.put("connected", false);
            result.put("nodeName", "");
            result.put("watchAppInstalled", false);
            call.resolve(result);
            return;
        }
        result.put("available", true);
        final Context ctx = getContext();
        Wearable.getNodeClient(ctx)
            .getConnectedNodes()
            .addOnFailureListener(e -> call.reject("Could not query connected watches: " + e.getMessage()))
            .addOnSuccessListener(nodes -> {
                String name = nodes.isEmpty() ? "" : nodes.get(0).getDisplayName();
                result.put("connected", !nodes.isEmpty());
                result.put("nodeName", name);
                if (nodes.isEmpty()) {
                    result.put("watchAppInstalled", false);
                    call.resolve(result);
                    return;
                }
                Wearable.getCapabilityClient(ctx)
                    .getCapability(CAPABILITY, CapabilityClient.FILTER_REACHABLE)
                    .addOnFailureListener(e -> {
                        result.put("watchAppInstalled", false);
                        call.resolve(result);
                    })
                    .addOnSuccessListener(info -> {
                        Set<Node> withApp = info.getNodes();
                        result.put("watchAppInstalled", !withApp.isEmpty());
                        if (!withApp.isEmpty()) {
                            result.put("nodeName", withApp.iterator().next().getDisplayName());
                        }
                        call.resolve(result);
                    });
            });
    }

    @PluginMethod
    public void start(PluginCall call) {
        sendCommand(PATH_START, new byte[0], false, call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        sendCommand(PATH_STOP, new byte[0], false, call);
    }

    /** Pushes the live workout state to the watch; with launch=true also opens the watch app. */
    @PluginMethod
    public void sendWorkoutState(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        boolean launch = Boolean.TRUE.equals(call.getBoolean("launch", false));
        sendCommand(PATH_STATE, json.getBytes(StandardCharsets.UTF_8), launch, call);
    }

    private void sendCommand(final String path, final byte[] payload, final boolean launch, final PluginCall call) {
        if (!playServicesAvailable()) {
            call.reject("Google Play services Wearable API is not available on this phone.");
            return;
        }
        final Context ctx = getContext();
        Wearable.getCapabilityClient(ctx)
            .getCapability(CAPABILITY, CapabilityClient.FILTER_REACHABLE)
            .addOnFailureListener(e -> call.reject("Could not find the watch: " + e.getMessage()))
            .addOnSuccessListener((CapabilityInfo info) -> {
                Set<Node> nodes = info.getNodes();
                if (nodes.isEmpty()) {
                    call.reject("No watch with the Ky Fitness app is reachable.");
                    return;
                }
                MessageClient messages = Wearable.getMessageClient(ctx);
                for (Node node : nodes) {
                    messages.sendMessage(node.getId(), path, payload);
                }
                if (launch) openWatchApp(ctx, nodes);
                call.resolve();
            });
    }

    /** Brings the watch app to the foreground so it may start its sensor service. */
    private void openWatchApp(Context ctx, Set<Node> nodes) {
        Intent intent = new Intent(Intent.ACTION_VIEW)
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .setData(Uri.parse(WATCH_LAUNCH_URI));
        RemoteActivityHelper helper = new RemoteActivityHelper(ctx, Executors.newSingleThreadExecutor());
        for (Node node : nodes) {
            try {
                helper.startRemoteActivity(intent, node.getId());
            } catch (RuntimeException e) {
                Log.w(TAG, "Could not open the watch app: " + e.getMessage());
            }
        }
    }

    private boolean playServicesAvailable() {
        try {
            return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext()) == ConnectionResult.SUCCESS;
        } catch (Exception e) {
            return false;
        }
    }
}

