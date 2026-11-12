package com.kyfitness.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** Home-screen water widget: today's total against the goal, and two buttons that add water without opening the app. */
public class WaterWidgetProvider extends AppWidgetProvider {
    static final String ACTION_ADD = "com.kyfitness.app.WATER_ADD";
    private static final String EXTRA_ML = "ml";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && ACTION_ADD.equals(intent.getAction())) {
            WaterStore.add(context, intent.getIntExtra(EXTRA_ML, 0));
            refreshAll(context);
            // The watch's Fuel tile shows the new total too.
            WaterStore.pushToWatch(context);
            return;
        }
        super.onReceive(context, intent);
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, WaterWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = build(context);
        for (int id : ids) manager.updateAppWidget(id, v);
    }

    private static PendingIntent add(Context c, int ml, int code) {
        Intent i = new Intent(c, WaterWidgetProvider.class).setAction(ACTION_ADD).putExtra(EXTRA_ML, ml);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_water);
        boolean imperial = WaterStore.imperial(c);
        int total = WaterStore.totalMl(c);
        int goal = WaterStore.goalMl(c);
        int step1 = WaterStore.stepMl(c, 1);
        int step2 = WaterStore.stepMl(c, 2);
        v.setTextViewText(R.id.water_total, WaterStore.format(total, imperial));
        v.setTextViewText(R.id.water_sub, "of " + WaterStore.format(goal, imperial) + " today");
        v.setProgressBar(R.id.water_progress, 100, Math.min(100, Math.round(total * 100f / goal)), false);
        v.setTextViewText(R.id.water_add1, "+" + WaterStore.format(step1, imperial).replace(" fl oz", " oz"));
        v.setTextViewText(R.id.water_add2, "+" + WaterStore.format(step2, imperial).replace(" fl oz", " oz"));
        v.setContentDescription(R.id.water_add1, "Add " + WaterStore.format(step1, imperial) + " of water");
        v.setContentDescription(R.id.water_add2, "Add " + WaterStore.format(step2, imperial) + " of water");
        v.setContentDescription(R.id.water_root, "Water today, " + WaterStore.format(total, imperial) + " of " + WaterStore.format(goal, imperial) + ". Open the app.");
        v.setOnClickPendingIntent(R.id.water_add1, add(c, step1, 7421));
        v.setOnClickPendingIntent(R.id.water_add2, add(c, step2, 7422));
        v.setOnClickPendingIntent(R.id.water_root, FastingNotifier.open(c, "open:water", 7423));
        return v;
    }
}
