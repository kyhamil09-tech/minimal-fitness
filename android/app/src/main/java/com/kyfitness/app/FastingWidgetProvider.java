package com.kyfitness.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

/** Home-screen fasting widget: a clock that counts up by itself, the stage and goal time, a progress bar, and one-tap start or end. */
public class FastingWidgetProvider extends AppWidgetProvider {
    private static final int ACCENT = 0xFFCBFF00;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, FastingWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = build(context);
        for (int id : ids) manager.updateAppWidget(id, v);
    }

    private static RemoteViews build(Context c) {
        SharedPreferences p = FastingNotifier.prefs(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_fasting);
        boolean active = p.getBoolean("active", false) && p.getLong("startMs", 0) > 0;
        v.setOnClickPendingIntent(R.id.fast_root, FastingNotifier.open(c, "open:fasting", 7411));
        if (active) {
            long start = p.getLong("startMs", 0);
            float goal = p.getFloat("goalHours", 16f);
            long elapsed = Math.max(0, System.currentTimeMillis() - start);
            double hours = elapsed / 3_600_000.0;
            int stage = FastingNotifier.stageIndex(hours);
            v.setViewVisibility(R.id.fast_timer, View.VISIBLE);
            v.setViewVisibility(R.id.fast_idle, View.GONE);
            // The chronometer counts up by itself, so the widget does not need a refresh every second.
            v.setChronometer(R.id.fast_timer, SystemClock.elapsedRealtime() - elapsed, null, true);
            v.setTextColor(R.id.fast_timer, hours >= goal ? ACCENT : 0xFFFFFFFF);
            v.setTextViewText(R.id.fast_protocol, p.getString("protocol", "Fast"));
            v.setTextViewText(R.id.fast_stage, FastingNotifier.stageLine(start, goal, hours, stage));
            v.setViewVisibility(R.id.fast_progress, View.VISIBLE);
            v.setProgressBar(R.id.fast_progress, 100, (int) Math.min(100, Math.round(hours / Math.max(0.5, goal) * 100)), false);
            v.setTextViewText(R.id.fast_action, "END FAST");
            v.setInt(R.id.fast_action, "setBackgroundResource", R.drawable.widget_btn);
            v.setTextColor(R.id.fast_action, 0xFFFFFFFF);
            v.setOnClickPendingIntent(R.id.fast_action, FastingNotifier.open(c, "fast:end", 7412));
        } else {
            String protocol = p.getString("lastProtocol", "16:8 Standard");
            v.setViewVisibility(R.id.fast_timer, View.GONE);
            v.setViewVisibility(R.id.fast_idle, View.VISIBLE);
            v.setTextViewText(R.id.fast_protocol, protocol);
            v.setTextViewText(R.id.fast_stage, "Tap start when you finish your last meal");
            v.setViewVisibility(R.id.fast_progress, View.INVISIBLE);
            v.setTextViewText(R.id.fast_action, "START FAST");
            v.setInt(R.id.fast_action, "setBackgroundResource", R.drawable.widget_btn_primary);
            v.setTextColor(R.id.fast_action, 0xFF000000);
            v.setOnClickPendingIntent(R.id.fast_action, FastingNotifier.open(c, "fast:start", 7413));
        }
        return v;
    }
}
