package com.kyfitness.app;

import android.app.PendingIntent;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Tasks;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Backs the app's data up to the person's own Google Drive, in the app's hidden folder (Drive's "appDataFolder"), which only this app can
 * see and which is not shown in the Drive app. Google only: the one permission asked for is that hidden folder, and the only address
 * contacted is www.googleapis.com (see DriveRest and src/lib/netHosts.ts). The access token Google gives stays in this class; the web page
 * never sees it. The backup text arrives already encrypted by the web page, so Google stores a file it cannot read.
 */
@CapacitorPlugin(name = "GoogleDrive")
public class GoogleDrivePlugin extends Plugin {
    private static final long MAX_DOWNLOAD_BYTES = 60L * 1024 * 1024;

    /** Google needs the person's permission (first use, or it was taken away). */
    private static final class NeedsSignIn extends Exception {
        NeedsSignIn() {
            super("Connect Google Drive again: Google needs your permission.");
        }
    }

    private static AuthorizationRequest request() {
        return AuthorizationRequest.builder().setRequestedScopes(Collections.singletonList(new Scope(DriveRest.SCOPE))).build();
    }

    private boolean playServices() {
        try {
            return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext()) == ConnectionResult.SUCCESS;
        } catch (Throwable t) {
            return false;
        }
    }

    /** A fresh access token for the hidden folder, without showing anything; throws {@link NeedsSignIn} when Google has to ask. */
    private String token() throws Exception {
        AuthorizationResult result = Tasks.await(Identity.getAuthorizationClient(getContext()).authorize(request()), 30, TimeUnit.SECONDS);
        String t = result.hasResolution() ? null : result.getAccessToken();
        if (t == null || t.isEmpty()) throw new NeedsSignIn();
        return t;
    }

    private static final class Reply {
        final int status;
        final String body;

        Reply(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }

    private Reply drive(String method, String url, String contentType, String body) throws Exception {
        if (!DriveRest.allowed(url)) throw new IllegalArgumentException("That address is not one this app is allowed to contact");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(20000);
        c.setReadTimeout(60000);
        c.setRequestProperty("Authorization", "Bearer " + token());
        c.setRequestProperty("Accept", "application/json");
        if (body != null) {
            c.setDoOutput(true);
            if (contentType != null) c.setRequestProperty("Content-Type", contentType);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int status = c.getResponseCode();
        if (status == 401) throw new NeedsSignIn();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (in != null) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > MAX_DOWNLOAD_BYTES) throw new IllegalStateException("That file is too large");
            }
            in.close();
        }
        String text = out.toString("UTF-8");
        if (status >= 400) throw new IllegalStateException("Google Drive said: " + DriveRest.errorMessage(text) + " (" + status + ")");
        return new Reply(status, text);
    }

    private static void fail(PluginCall call, Exception e) {
        call.reject(e instanceof NeedsSignIn ? e.getMessage() : "Google Drive backup failed: " + e.getMessage(), e instanceof NeedsSignIn ? "NEEDS_SIGN_IN" : null);
    }

    /** Whether Google Play services is here, and whether the person has already allowed the hidden folder. */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        boolean play = playServices();
        o.put("available", play);
        boolean connected = false;
        if (play) {
            try {
                token();
                connected = true;
            } catch (Exception e) {
                // not allowed yet, or Google could not be reached: shown as not connected
            }
        }
        o.put("connected", connected);
        call.resolve(o);
    }

    /** Asks Google for the one permission, showing Google's own screen when it is needed. */
    @PluginMethod
    public void connect(PluginCall call) {
        if (!playServices()) {
            call.reject("Google Play services is not on this phone, so Google Drive backup is not available.");
            return;
        }
        final AppCompatActivity activity = getActivity();
        activity.runOnUiThread(() ->
            Identity.getAuthorizationClient(activity).authorize(request())
                .addOnSuccessListener(result -> {
                    if (!result.hasResolution()) {
                        call.resolve(new JSObject().put("connected", true));
                        return;
                    }
                    launchConsent(activity, call, result.getPendingIntent());
                })
                .addOnFailureListener(e -> call.reject("Could not reach Google sign-in: " + e.getMessage())));
    }

    private void launchConsent(AppCompatActivity activity, PluginCall call, PendingIntent pending) {
        final AtomicReference<ActivityResultLauncher<IntentSenderRequest>> launcher = new AtomicReference<>();
        launcher.set(activity.getActivityResultRegistry().register(
            "ky-drive-consent-" + UUID.randomUUID(),
            new ActivityResultContracts.StartIntentSenderForResult(),
            result -> {
                ActivityResultLauncher<IntentSenderRequest> l = launcher.get();
                if (l != null) l.unregister();
                try {
                    Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(result.getData());
                    call.resolve(new JSObject().put("connected", true));
                } catch (ApiException e) {
                    call.reject("Google did not give permission (" + e.getStatusCode() + ").");
                }
            }));
        try {
            launcher.get().launch(new IntentSenderRequest.Builder(pending.getIntentSender()).build());
        } catch (Exception e) {
            call.reject("Could not open Google's permission screen: " + e.getMessage());
        }
    }

    /** Saves one backup file (already encrypted) in the hidden folder. */
    @PluginMethod
    public void upload(PluginCall call) {
        try {
            String name = call.getString("name", "");
            String data = call.getString("data", "");
            if (name.isEmpty() || data.isEmpty()) throw new IllegalArgumentException("Nothing to back up");
            String boundary = "ky" + UUID.randomUUID().toString().replace("-", "");
            Reply r = drive("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
                "multipart/related; boundary=" + boundary, DriveRest.multipartBody(boundary, name, "application/json", data));
            call.resolve(new JSObject(r.body));
        } catch (Exception e) {
            fail(call, e);
        }
    }

    private List<DriveRest.DriveFile> files() throws Exception {
        Reply r = drive("GET", "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&orderBy=createdTime%20desc&pageSize=50&fields="
            + URLEncoder.encode("files(id,name,createdTime,size)", "UTF-8"), null, null);
        return DriveRest.parseFiles(r.body);
    }

    /** The backups in the hidden folder, newest first. */
    @PluginMethod
    public void list(PluginCall call) {
        try {
            JSArray rows = new JSArray();
            for (DriveRest.DriveFile f : files()) {
                rows.put(new JSObject().put("id", f.id).put("name", f.name).put("createdTime", f.createdTime).put("size", f.size));
            }
            call.resolve(new JSObject().put("files", rows));
        } catch (Exception e) {
            fail(call, e);
        }
    }

    /** The text of one backup file. */
    @PluginMethod
    public void download(PluginCall call) {
        try {
            String id = call.getString("id", "");
            if (!DriveRest.validId(id)) throw new IllegalArgumentException("Not a valid file");
            Reply r = drive("GET", "https://www.googleapis.com/drive/v3/files/" + id + "?alt=media", null, null);
            call.resolve(new JSObject().put("data", r.body));
        } catch (Exception e) {
            fail(call, e);
        }
    }

    /** Keeps the newest {@code keep} backups and removes the older ones from the hidden folder. */
    @PluginMethod
    public void prune(PluginCall call) {
        try {
            int keep = Math.max(1, call.getInt("keep", 7));
            List<DriveRest.DriveFile> all = files();
            int removed = 0;
            for (int i = keep; i < all.size(); i++) {
                drive("DELETE", "https://www.googleapis.com/drive/v3/files/" + all.get(i).id, null, null);
                removed++;
            }
            call.resolve(new JSObject().put("removed", removed));
        } catch (Exception e) {
            fail(call, e);
        }
    }
}
