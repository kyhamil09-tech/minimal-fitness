package com.kyfitness.app;

import android.net.Uri;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens a web page in an in-app overlay (an Android Custom Tab), so a video search or a saved link can be looked at and closed with
 * one back press, right where you were. Only https addresses are opened. The page is the person's own browsing: nothing from this app
 * is sent to it.
 */
@CapacitorPlugin(name = "OpenUrl")
public class OpenUrlPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("Only https addresses are opened");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                CustomTabsIntent tab = new CustomTabsIntent.Builder().setShowTitle(true).build();
                // Pin the overlay to the browser that provides it: otherwise a YouTube link is handed to the YouTube app, which takes over the screen.
                String browser = CustomTabsClient.getPackageName(getActivity(), null);
                if (browser != null) tab.intent.setPackage(browser);
                tab.launchUrl(getActivity(), Uri.parse(url));
                call.resolve();
            } catch (RuntimeException e) {
                call.reject("Could not open the page: " + e.getMessage());
            }
        });
    }
}
