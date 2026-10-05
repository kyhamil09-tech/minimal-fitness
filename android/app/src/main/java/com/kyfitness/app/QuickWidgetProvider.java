package com.kyfitness.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.NumberFormat;

/** Home-screen widget: today's steps, weekly workout progress, and one-tap Run / Walk. */
public class QuickWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "ky_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, QuickWidgetProvider.class));
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    private static PendingIntent launch(Context c, String action, int code) {
        Intent i = new Intent(c, MainActivity.class)
            .setAction("ky.widget." + code)
            .putExtra(LaunchBridge.EXTRA, action)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static RemoteViews build(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_quick);
        int steps = p.getInt("steps", 0);
        int goal = p.getInt("stepGoal", 10000);
        int week = p.getInt("week", 0);
        int weekGoal = p.getInt("weekGoal", 4);
        int streak = p.getInt("streak", 0);
        v.setTextViewText(R.id.widget_steps, NumberFormat.getIntegerInstance().format(steps));
        v.setTextViewText(R.id.widget_sub, "of " + NumberFormat.getIntegerInstance().format(goal) + " steps · " + week + "/" + weekGoal + " workouts this week");
        v.setTextViewText(R.id.widget_streak, streak > 0 ? "\uD83D\uDD25 " + streak : "");
        int readiness = p.getInt("readiness", -1);
        int monthPct = p.getInt("monthPct", -1);
        StringBuilder extra = new StringBuilder();
        if (readiness >= 0) extra.append("Readiness ").append(readiness).append(" ").append(p.getString("readinessLabel", ""));
        if (monthPct >= 0) {
            if (extra.length() > 0) extra.append("  \u00B7  ");
            extra.append(p.getString("monthLabel", "Month")).append(" ").append(monthPct).append("%");
        }
        v.setTextViewText(R.id.widget_extra, extra.toString().trim());
        v.setViewVisibility(R.id.widget_extra, extra.length() > 0 ? android.view.View.VISIBLE : android.view.View.GONE);
        v.setOnClickPendingIntent(R.id.widget_run, launch(c, "start:Running", 1));
        v.setOnClickPendingIntent(R.id.widget_walk, launch(c, "start:Walking", 2));
        v.setOnClickPendingIntent(R.id.widget_root, launch(c, "open", 3));
        return v;
    }
}