package com.kyfitness.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;

/**
 * Offline map packs: map files (PMTiles) you pick from your phone's storage are copied into the app's private folder, and the web
 * app reads tiles out of them a few kilobytes at a time. Nothing is downloaded: the file comes from you, and this app never asks a map
 * server for it. The files stay in the app's own storage and are removed with the app.
 */
@CapacitorPlugin(name = "MapPack")
public class MapPackPlugin extends Plugin {
    private static final int MAX_READ = 16 * 1024 * 1024;

    private File dir() {
        File d = new File(getContext().getFilesDir(), "mappacks");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String safeId(String id) {
        return id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", "");
    }

    /** Opens Android's file picker; the chosen map file is copied in on a background thread. */
    @PluginMethod
    public void importPack(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        final Uri uri = result.getData().getData();
        new Thread(() -> {
            String name = "map.pmtiles";
            long total = -1;
            try (android.database.Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    int s = c.getColumnIndex(OpenableColumns.SIZE);
                    if (n >= 0) name = c.getString(n);
                    if (s >= 0 && !c.isNull(s)) total = c.getLong(s);
                }
            } catch (RuntimeException ignored) {
                // the name and size are only for display
            }
            String id = "pack" + System.currentTimeMillis();
            File out = new File(dir(), id + ".pmtiles");
            try (InputStream in = getContext().getContentResolver().openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
                if (in == null) throw new IOException("Could not open the file");
                byte[] buf = new byte[256 * 1024];
                long copied = 0;
                long lastReport = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    os.write(buf, 0, n);
                    copied += n;
                    if (copied - lastReport > 8L * 1024 * 1024) {
                        lastReport = copied;
                        JSObject p = new JSObject();
                        p.put("copied", copied);
                        p.put("total", total);
                        notifyListeners("progress", p);
                    }
                }
                // A PMTiles file starts with the seven letters "PMTiles"; refuse anything else instead of keeping a useless copy.
                try (RandomAccessFile raf = new RandomAccessFile(out, "r")) {
                    byte[] head = new byte[7];
                    if (raf.length() < 127 || raf.read(head) != 7 || !"PMTiles".equals(new String(head, "US-ASCII"))) {
                        throw new IOException("That is not a PMTiles map file");
                    }
                }
                JSObject r = new JSObject();
                r.put("id", id);
                r.put("name", name);
                r.put("size", out.length());
                call.resolve(r);
            } catch (IOException | RuntimeException e) {
                //noinspection ResultOfMethodCallIgnored
                out.delete();
                call.reject(e.getMessage() == null ? "Could not copy the map file" : e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSArray items = new JSArray();
        File[] files = dir().listFiles();
        if (files != null) {
            for (File f : files) {
                if (!f.getName().endsWith(".pmtiles")) continue;
                JSObject o = new JSObject();
                o.put("id", f.getName().replace(".pmtiles", ""));
                o.put("size", f.length());
                items.put(o);
            }
        }
        JSObject r = new JSObject();
        r.put("packs", items);
        call.resolve(r);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        File f = new File(dir(), safeId(call.getString("id")) + ".pmtiles");
        //noinspection ResultOfMethodCallIgnored
        if (f.exists()) f.delete();
        call.resolve();
    }

    /** A byte range of a pack, as base64. The map reader asks for the pieces it needs, a tile at a time. */
    @PluginMethod
    public void read(PluginCall call) {
        File f = new File(dir(), safeId(call.getString("id")) + ".pmtiles");
        Double offset = call.getDouble("offset");
        Integer length = call.getInt("length");
        if (!f.exists() || offset == null || length == null || length < 0 || length > MAX_READ) {
            call.reject("bad range");
            return;
        }
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            long off = offset.longValue();
            int want = (int) Math.max(0, Math.min((long) length, raf.length() - off));
            byte[] buf = new byte[want];
            raf.seek(off);
            raf.readFully(buf);
            JSObject r = new JSObject();
            r.put("data", Base64.encodeToString(buf, Base64.NO_WRAP));
            call.resolve(r);
        } catch (IOException e) {
            call.reject("read failed");
        }
    }
}
