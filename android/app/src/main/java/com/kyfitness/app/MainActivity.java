package com.kyfitness.app;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before super.onCreate builds the bridge.
        registerPlugin(WatchHeartRatePlugin.class);
        registerPlugin(BleHeartRatePlugin.class);
        registerPlugin(BleCyclingPlugin.class);
        registerPlugin(LiveSharePlugin.class);
        registerPlugin(ActivityDetectPlugin.class);
        registerPlugin(LookPlugin.class);
        registerPlugin(GpsTrackerPlugin.class);
        registerPlugin(HealthConnectPlugin.class);
        registerPlugin(StepsPlugin.class);
        registerPlugin(BackupPlugin.class);
        registerPlugin(DiagnosticsPlugin.class);
        registerPlugin(LaunchPlugin.class);
        registerPlugin(MetronomePlugin.class);
        registerPlugin(CadencePlugin.class);
        registerPlugin(NativeHttpPlugin.class);
        registerPlugin(SleepPlugin.class);
        registerPlugin(VitalsPlugin.class);
        registerPlugin(PrivacyPlugin.class);
        registerPlugin(FastingPlugin.class);
        registerPlugin(GlancePlugin.class);
        registerPlugin(MapPackPlugin.class);
        registerPlugin(AppLockPlugin.class);
        registerPlugin(VoiceLogPlugin.class);
        super.onCreate(savedInstanceState);
        LaunchBridge.capture(getIntent());
        if (Build.VERSION.SDK_INT >= 28) {
            // Draw behind the camera cutout so hiding the status bar leaves no black strip at the top.
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        hideStatusBar();
    }


    /** The clock and notification icons are hidden while the app is open; swipe down from the top to peek at them. */
    private void hideStatusBar() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.statusBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideStatusBar();
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        LaunchBridge.capture(intent);
    }
}
