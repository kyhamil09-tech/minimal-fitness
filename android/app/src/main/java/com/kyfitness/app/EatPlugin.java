package com.kyfitness.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;

/** Keeps the Eat widget and the Quick Settings tile in step with the app's food log. */
@CapacitorPlugin(name = "Eat")
public class EatPlugin extends Plugin {
    @PluginMethod
    public void sync(PluginCall call) {
        EatStore.set(
            getContext(),
            call.getInt("eaten", 0),
            call.getInt("goal", 0),
            call.getInt("left", 0),
            call.getInt("proteinG", 0),
            call.getInt("proteinGoal", 0)
        );
        EatWidgetProvider.refreshAll(getContext());
        EatTileService.refresh(getContext());
        call.resolve();
    }

    /** Meals said into the watch since the app last looked: a JSON list of {at, text}, handed over once. */
    @PluginMethod
    public void takeVoice(PluginCall call) {
        JSObject out = new JSObject();
        out.put("items", FoodInbox.take(getContext()));
        call.resolve(out);
    }

    /** A short note back to the watch about a meal it sent ("Logged Egg, Toast, 223 kcal"). */
    @PluginMethod
    public void sendResult(PluginCall call) {
        final byte[] bytes = call.getString("text", "").getBytes(StandardCharsets.UTF_8);
        try {
            Wearable.getNodeClient(getContext()).getConnectedNodes().addOnSuccessListener(nodes -> {
                for (com.google.android.gms.wearable.Node n : nodes) Wearable.getMessageClient(getContext()).sendMessage(n.getId(), "/ky/food/result", bytes);
            });
        } catch (RuntimeException ignored) {
            // no watch: nothing to tell
        }
        call.resolve();
    }
}
