package com.kyfitness.wear;

import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.WearableListenerService;

/** Receives what the phone sends (glance numbers, routines, exercises, gear, water, look, alarm), stores it and redraws the complications. */
public class GlanceListenerService extends WearableListenerService {
    @Override
    public void onDataChanged(DataEventBuffer events) {
        boolean changed = false;
        for (DataEvent event : events) {
            if (event.getType() != DataEvent.TYPE_CHANGED) continue;
            String path = event.getDataItem().getUri().getPath();
            changed |= DataApply.apply(this, path, DataMapItem.fromDataItem(event.getDataItem()).getDataMap());
        }
        if (changed) GlanceComplicationService.requestAll(this);
    }
}
