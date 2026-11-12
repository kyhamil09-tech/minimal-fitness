package com.kyfitness.app;

import android.Manifest;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.TimeZone;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Puts planned workouts and meals into a calendar on this phone. It uses the phone's own calendar storage, so nothing goes over the
 * internet from this app: a Google account's calendar is synced by Google's Calendar app, as usual. Only calendars of a Google account
 * (or the phone itself) are offered, and only events this app added (marked in the description) can be removed by it.
 */
@CapacitorPlugin(
    name = "DeviceCalendar",
    permissions = {@Permission(strings = {Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR}, alias = "calendar")}
)
public class DeviceCalendarPlugin extends Plugin {
    private static final String MARK = "Added by Minimal Fitness";

    private boolean granted() {
        return getPermissionState("calendar") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (!granted()) {
            requestPermissionForAlias("calendar", call, "afterListPermission");
            return;
        }
        list(call);
    }

    @PermissionCallback
    private void afterListPermission(PluginCall call) {
        if (granted()) list(call);
        else call.reject("The calendar permission was not given.");
    }

    private void list(PluginCall call) {
        JSArray out = new JSArray();
        String[] cols = {
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.ACCOUNT_TYPE,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
        };
        try (Cursor c = getContext().getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, cols, CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + " >= ? AND " + CalendarContract.Calendars.VISIBLE + " = 1", new String[] {"500"}, null)) {
            while (c != null && c.moveToNext()) {
                String type = c.getString(3);
                boolean google = "com.google".equals(type);
                boolean local = CalendarContract.ACCOUNT_TYPE_LOCAL.equals(type);
                if (!google && !local) continue;
                JSObject o = new JSObject();
                o.put("id", String.valueOf(c.getLong(0)));
                o.put("name", c.getString(1));
                o.put("account", c.getString(2));
                o.put("google", google);
                out.put(o);
            }
        } catch (SecurityException e) {
            call.reject("The calendar permission was not given.");
            return;
        }
        JSObject res = new JSObject();
        res.put("calendars", out);
        call.resolve(res);
    }

    @PluginMethod
    public void addEvents(PluginCall call) {
        if (!granted()) {
            call.reject("The calendar permission was not given.");
            return;
        }
        long calendarId;
        try {
            calendarId = Long.parseLong(call.getString("calendarId", ""));
        } catch (NumberFormatException e) {
            call.reject("Pick a calendar first.");
            return;
        }
        JSArray events = call.getArray("events");
        JSArray done = new JSArray();
        try {
            for (int i = 0; events != null && i < events.length(); i++) {
                JSONObject e = events.getJSONObject(i);
                ContentValues v = new ContentValues();
                v.put(CalendarContract.Events.CALENDAR_ID, calendarId);
                v.put(CalendarContract.Events.TITLE, e.optString("title", ""));
                v.put(CalendarContract.Events.DESCRIPTION, e.optString("description", "") + (e.optString("description", "").isEmpty() ? "" : "\n\n") + MARK);
                v.put(CalendarContract.Events.DTSTART, (long) e.getDouble("startMs"));
                v.put(CalendarContract.Events.DTEND, (long) e.getDouble("endMs"));
                v.put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
                Uri uri = getContext().getContentResolver().insert(CalendarContract.Events.CONTENT_URI, v);
                if (uri == null) continue;
                JSObject r = new JSObject();
                r.put("key", e.optString("key", ""));
                r.put("id", ContentUris.parseId(uri));
                done.put(r);
            }
        } catch (JSONException | SecurityException e) {
            call.reject("Could not add the events.");
            return;
        }
        JSObject res = new JSObject();
        res.put("added", done);
        call.resolve(res);
    }

    @PluginMethod
    public void removeEvents(PluginCall call) {
        if (!granted()) {
            call.reject("The calendar permission was not given.");
            return;
        }
        JSArray ids = call.getArray("ids");
        int removed = 0;
        try {
            for (int i = 0; ids != null && i < ids.length(); i++) {
                long id = ids.getLong(i);
                Uri uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id);
                boolean ours = false;
                try (Cursor c = getContext().getContentResolver().query(uri, new String[] {CalendarContract.Events.DESCRIPTION}, null, null, null)) {
                    if (c != null && c.moveToFirst()) {
                        String d = c.getString(0);
                        ours = d != null && d.contains(MARK);
                    }
                }
                if (ours) removed += getContext().getContentResolver().delete(uri, null, null);
            }
        } catch (JSONException | SecurityException e) {
            call.reject("Could not remove the events.");
            return;
        }
        JSObject res = new JSObject();
        res.put("removed", removed);
        call.resolve(res);
    }
}
