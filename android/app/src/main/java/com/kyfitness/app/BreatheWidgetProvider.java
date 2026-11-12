package com.kyfitness.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/** Home-screen Breathe widget: start your usual session, or the sleep wind-down, in one tap. */
public class BreatheWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    private static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_breathe);
        v.setContentDescription(R.id.breathe_start, "Start a breathing session");
        v.setContentDescription(R.id.breathe_sleep, "Start the sleep wind-down");
        v.setContentDescription(R.id.breathe_root, "Breathe. Open the app.");
        v.setOnClickPendingIntent(R.id.breathe_start, FastingNotifier.open(c, "breathe:start", 7431));
        v.setOnClickPendingIntent(R.id.breathe_sleep, FastingNotifier.open(c, "breathe:drift", 7432));
        v.setOnClickPendingIntent(R.id.breathe_root, FastingNotifier.open(c, "open:breathe", 7433));
        return v;
    }
}
