package com.kyfitness.app;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The parts of the Google Drive backup that need no phone: which addresses may be contacted, the request bodies, and reading the
 * answers. Google's Drive keeps the backup in the app's own hidden folder ("appDataFolder"), which only this app can see.
 */
final class DriveRest {
    /** The only host the Drive backup may contact (see src/lib/netHosts.ts). */
    static final String HOST = "www.googleapis.com";
    /** The one permission asked for: the app's own hidden folder in Drive, and nothing else in the account. */
    static final String SCOPE = "https://www.googleapis.com/auth/drive.appdata";

    private DriveRest() {}

    /** True only for https addresses on {@link #HOST}. */
    static boolean allowed(String url) {
        try {
            URI u = new URI(url);
            return "https".equalsIgnoreCase(u.getScheme()) && HOST.equalsIgnoreCase(u.getHost()) && u.getUserInfo() == null;
        } catch (Exception e) {
            return false;
        }
    }

    /** A Drive file id is letters, digits, dashes and underscores; anything else is refused before it reaches an address. */
    static boolean validId(String id) {
        return id != null && id.matches("[A-Za-z0-9_-]{5,100}");
    }

    static String metadataJson(String name) throws JSONException {
        return new JSONObject().put("name", name).put("parents", new JSONArray().put("appDataFolder")).toString();
    }

    /** A "multipart/related" upload body: the file's details, then its content. */
    static String multipartBody(String boundary, String name, String mime, String content) throws JSONException {
        return "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + metadataJson(name) + "\r\n"
            + "--" + boundary + "\r\nContent-Type: " + mime + "\r\n\r\n" + content + "\r\n"
            + "--" + boundary + "--";
    }

    /** One backup file in Drive. */
    static final class DriveFile {
        final String id;
        final String name;
        final String createdTime;
        final long size;

        DriveFile(String id, String name, String createdTime, long size) {
            this.id = id;
            this.name = name;
            this.createdTime = createdTime;
            this.size = size;
        }
    }

    /** Reads Drive's file list (newest first when it was asked for that way). Rows without an id are dropped. */
    static List<DriveFile> parseFiles(String json) throws JSONException {
        List<DriveFile> out = new ArrayList<>();
        JSONArray files = new JSONObject(json).optJSONArray("files");
        if (files == null) return out;
        for (int i = 0; i < files.length(); i++) {
            JSONObject f = files.optJSONObject(i);
            if (f == null || !validId(f.optString("id"))) continue;
            out.add(new DriveFile(f.getString("id"), f.optString("name"), f.optString("createdTime"), f.optLong("size", 0)));
        }
        return out;
    }

    /** The reason Google gave for an error, in plain words, or the raw text when it is not Google's usual shape. */
    static String errorMessage(String body) {
        try {
            JSONObject e = new JSONObject(body).optJSONObject("error");
            String m = e == null ? null : e.optString("message", null);
            if (m != null && !m.isEmpty()) return m;
        } catch (JSONException ignored) {
            // not JSON
        }
        return body == null || body.isEmpty() ? "no details" : body.substring(0, Math.min(200, body.length()));
    }
}
