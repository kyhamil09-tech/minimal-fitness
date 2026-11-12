package com.kyfitness.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** Home-screen Eat widget: today's calories left, and two buttons: add a glass of water without opening the app, or log food. */
public class EatWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, EatWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = build(context);
        for (int id : ids) manager.updateAppWidget(id, v);
    }

    /** The same broadcast the water widget uses, so the water is added, shown and sent to the watch in one place. */
    private static PendingIntent addWater(Context c, int ml) {
        Intent i = new Intent(c, WaterWidgetProvider.class).setAction(WaterWidgetProvider.ACTION_ADD).putExtra("ml", ml);
        return PendingIntent.getBroadcast(c, 7431, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_eat);
        boolean imperial = WaterStore.imperial(c);
        int ml = WaterStore.stepMl(c, 1);
        v.setTextViewText(R.id.eat_water, "+" + WaterStore.format(ml, imperial).replace(" fl oz", " oz") + " water");
        v.setContentDescription(R.id.eat_water, "Add " + WaterStore.format(ml, imperial) + " of water");
        v.setOnClickPendingIntent(R.id.eat_water, addWater(c, ml));
        v.setOnClickPendingIntent(R.id.eat_add, FastingNotifier.open(c, "eat:add", 7432));
        v.setOnClickPendingIntent(R.id.eat_root, FastingNotifier.open(c, "open:eat", 7433));
        if (!EatStore.known(c)) {
            v.setTextViewText(R.id.eat_left, "Open");
            v.setTextViewText(R.id.eat_sub, "Open the app once to set it up");
            v.setProgressBar(R.id.eat_progress, 100, 0, false);
            v.setTextViewText(R.id.eat_macro, "");
            v.setContentDescription(R.id.eat_root, "Eat. Open the app.");
            return v;
        }
        int left = EatStore.left(c);
        int goal = EatStore.goal(c);
        int eaten = EatStore.eaten(c);
        v.setTextViewText(R.id.eat_left, EatStore.number(Math.abs(left)));
        v.setTextViewText(R.id.eat_sub, left >= 0 ? "left to enjoy" : "past your plan, and that is okay");
        v.setProgressBar(R.id.eat_progress, 100, goal > 0 ? Math.min(100, Math.round(eaten * 100f / goal)) : 0, false);
        int pg = EatStore.proteinGoal(c);
        v.setTextViewText(R.id.eat_macro, EatStore.number(eaten) + " eaten" + (pg > 0 ? "  ·  protein " + EatStore.protein(c) + " of " + pg + " g" : ""));
        v.setContentDescription(R.id.eat_root, "Eat. " + EatStore.number(Math.abs(left)) + " calories " + (left >= 0 ? "left" : "past your plan") + " today. Open the app.");
        return v;
    }
}
