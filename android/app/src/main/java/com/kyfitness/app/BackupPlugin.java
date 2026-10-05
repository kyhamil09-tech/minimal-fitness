package com.kyfitness.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Writes backups into a folder the user picked once with Android's folder picker. Because the picker
 * can choose a Google Drive (or any cloud) folder, backups can live outside the phone and survive an
 * uninstall. Only the most recent backups are kept.
 */
@CapacitorPlugin(name = "FolderBackup")
public class BackupPlugin extends Plugin {
    private static final String PREFS = "ky_backup";
    private static final String PREFIX = "ky-fitness-backup-";
    private static final int KEEP = 7;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private DocumentFile folder() {
        String uri = prefs().getString("uri", null);
        if (uri == null) return null;
        DocumentFile dir = DocumentFile.fromTreeUri(getContext(), Uri.parse(uri));
        return dir != null && dir.exists() && dir.canWrite() ? dir : null;
    }

    private JSObject status() {
        JSObject o = new JSObject();
        DocumentFile dir = folder();
        o.put("folder", dir == null ? null : (dir.getName() == null ? "Chosen folder" : dir.getName()));
        o.put("lastBackupAt", prefs().getLong("last", 0));
        o.put("lastFile", prefs().getString("lastFile", ""));
        o.put("needsReselect", dir == null && prefs().getString("uri", null) != null);
        return o;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void chooseFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "folderResult");
    }

    @ActivityCallback
    private void folderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("No folder was chosen.");
            return;
        }
        Uri uri = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("Android would not keep access to that folder. Try a different one.");
            return;
        }
        prefs().edit().putString("uri", uri.toString()).apply();
        call.resolve(status());
    }

    @PluginMethod
    public void clearFolder(PluginCall call) {
        prefs().edit().clear().apply();
        call.resolve(status());
    }

    @PluginMethod
    public void write(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        DocumentFile dir = folder();
        if (name == null || data == null) {
            call.reject("name and data are required");
            return;
        }
        if (dir == null) {
            call.reject("No backup folder is set, or access to it was removed.");
            return;
        }
        try {
            DocumentFile existing = dir.findFile(name);
            if (existing != null) existing.delete();
            DocumentFile file = dir.createFile("application/json", name);
            if (file == null) {
                call.reject("Could not create the backup file.");
                return;
            }
            try (OutputStream out = getContext().getContentResolver().openOutputStream(file.getUri(), "wt")) {
                if (out == null) throw new java.io.IOException("Could not open the backup file.");
                out.write(data.getBytes(StandardCharsets.UTF_8));
            }
            prune(dir);
            prefs().edit().putLong("last", System.currentTimeMillis()).putString("lastFile", name).apply();
            call.resolve(status());
        } catch (Exception e) {
            call.reject("Backup failed: " + e.getMessage());
        }
    }

    private List<DocumentFile> backups(DocumentFile dir) {
        List<DocumentFile> list = new ArrayList<>();
        for (DocumentFile f : dir.listFiles()) {
            String n = f.getName();
            if (n != null && n.startsWith(PREFIX) && n.endsWith(".json")) list.add(f);
        }
        Collections.sort(list, new Comparator<DocumentFile>() {
            @Override
            public int compare(DocumentFile a, DocumentFile b) {
                return b.getName().compareTo(a.getName()); // newest first (dates sort alphabetically)
            }
        });
        return list;
    }

    private void prune(DocumentFile dir) {
        List<DocumentFile> list = backups(dir);
        for (int i = KEEP; i < list.size(); i++) list.get(i).delete();
    }

    /** The newest backup in the chosen folder, for restoring after a reinstall. */
    @PluginMethod
    public void readLatest(PluginCall call) {
        DocumentFile dir = folder();
        if (dir == null) {
            call.reject("No backup folder is set.");
            return;
        }
        List<DocumentFile> list = backups(dir);
        if (list.isEmpty()) {
            call.reject("That folder has no Minimal Fitness backups.");
            return;
        }
        try (InputStream in = getContext().getContentResolver().openInputStream(list.get(0).getUri())) {
            if (in == null) throw new java.io.IOException("Could not open the file.");
            java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            JSObject o = new JSObject();
            o.put("name", list.get(0).getName());
            o.put("data", new String(buf.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(o);
        } catch (Exception e) {
            call.reject("Could not read the backup: " + e.getMessage());
        }
    }
}