package com.kyfitness.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reads the text on the clipboard, only when the person taps "Use what I copied" (the web view itself does not allow reading it).
 * Nothing is kept or sent anywhere: the text goes straight back to the screen that asked.
 */
@CapacitorPlugin(name = "ClipboardRead")
public class ClipboardReadPlugin extends Plugin {
    @PluginMethod
    public void read(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                String text = "";
                if (cm != null && cm.hasPrimaryClip()) {
                    ClipData clip = cm.getPrimaryClip();
                    if (clip != null && clip.getItemCount() > 0) {
                        CharSequence t = clip.getItemAt(0).coerceToText(getContext());
                        if (t != null) text = t.toString();
                    }
                }
                JSObject out = new JSObject();
                out.put("text", text.length() > 200_000 ? text.substring(0, 200_000) : text);
                call.resolve(out);
            } catch (RuntimeException e) {
                call.reject("Could not read the clipboard");
            }
        });
    }
}
