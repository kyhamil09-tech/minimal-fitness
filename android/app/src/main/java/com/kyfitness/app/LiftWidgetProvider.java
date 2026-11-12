package com.kyfitness.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

/** Home-screen Lift widget: this week's workouts, a button that starts an empty workout, and one for today's scheduled routine. */
public class LiftWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "ky_lift_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, LiftWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = build(context);
        for (int id : ids) manager.updateAppWidget(id, v);
    }

    private static RemoteViews build(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int week = p.getInt("week", 0);
        String todayId = p.getString("todayId", "");
        String todayName = p.getString("todayName", "");
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_lift);
        v.setTextViewText(R.id.lift_week, week + (week == 1 ? " workout" : " workouts") + " this week");
        v.setOnClickPendingIntent(R.id.lift_start, FastingNotifier.open(c, "lift:empty", 7431));
        v.setOnClickPendingIntent(R.id.lift_root, FastingNotifier.open(c, "open", 7433));
        v.setContentDescription(R.id.lift_start, "Start an empty workout");
        if (todayId != null && !todayId.isEmpty()) {
            v.setViewVisibility(R.id.lift_today, View.VISIBLE);
            v.setTextViewText(R.id.lift_today, "Today: " + todayName);
            v.setContentDescription(R.id.lift_today, "Start " + todayName + ", scheduled for today");
            v.setOnClickPendingIntent(R.id.lift_today, FastingNotifier.open(c, "lift:routine:" + todayId, 7432));
        } else {
            v.setViewVisibility(R.id.lift_today, View.GONE);
        }
        return v;
    }
}
