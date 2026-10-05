package com.kyfitness.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.UUID;
import org.json.JSONObject;

/**
 * Small native HTTP client for services whose servers do not allow browser (CORS) calls, such as Strava's
 * token and upload endpoints. Only https addresses are accepted.
 */
@CapacitorPlugin(name = "NativeHttp")
public class NativeHttpPlugin extends Plugin {
    /** The only host native code may contact. Anything else is refused here, whatever the web page asks for (see src/lib/netHosts.ts). */
    private static final Set<String> ALLOWED_HOSTS = new HashSet<>(Arrays.asList("www.strava.com"));

    private static String read(InputStream in) throws java.io.IOException {
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    private static HttpURLConnection open(String url, String method, JSONObject headers) throws Exception {
        if (url == null || !url.startsWith("https://")) throw new IllegalArgumentException("Only https addresses are allowed");
        URL parsed = new URL(url);
        if (!ALLOWED_HOSTS.contains(parsed.getHost().toLowerCase())) throw new IllegalArgumentException("That address is not one this app is allowed to contact");
        HttpURLConnection c = (HttpURLConnection) parsed.openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(20000);
        c.setReadTimeout(60000);
        c.setRequestProperty("Accept", "application/json");
        if (headers != null) {
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                c.setRequestProperty(k, headers.optString(k));
            }
        }
        return c;
    }

    private static void resolve(PluginCall call, HttpURLConnection c) throws Exception {
        int status = c.getResponseCode();
        String body = read(status >= 400 ? c.getErrorStream() : c.getInputStream());
        JSObject o = new JSObject();
        o.put("status", status);
        o.put("body", body);
        call.resolve(o);
    }

    /** GET, or POST with a form-encoded body (`form` key/value pairs). */
    @PluginMethod
    public void request(PluginCall call) {
        try {
            String method = call.getString("method", "GET");
            JSONObject form = call.getObject("form");
            HttpURLConnection c = open(call.getString("url"), method, call.getObject("headers"));
            if (form != null) {
                StringBuilder sb = new StringBuilder();
                Iterator<String> keys = form.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    if (sb.length() > 0) sb.append('&');
                    sb.append(URLEncoder.encode(k, "UTF-8")).append('=').append(URLEncoder.encode(form.optString(k), "UTF-8"));
                }
                byte[] bytes = sb.toString().getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                try (OutputStream os = c.getOutputStream()) {
                    os.write(bytes);
                }
            }
            resolve(call, c);
        } catch (Exception e) {
            call.reject("Network request failed: " + e.getMessage());
        }
    }

    /** POST multipart/form-data with text fields and one text file. */
    @PluginMethod
    public void upload(PluginCall call) {
        try {
            HttpURLConnection c = open(call.getString("url"), "POST", call.getObject("headers"));
            String boundary = "----ky" + UUID.randomUUID().toString().replace("-", "");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
            JSONObject fields = call.getObject("fields");
            try (OutputStream os = c.getOutputStream()) {
                if (fields != null) {
                    Iterator<String> keys = fields.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        String part = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + k + "\"\r\n\r\n" + fields.optString(k) + "\r\n";
                        os.write(part.getBytes(StandardCharsets.UTF_8));
                    }
                }
                String fileHeader = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + call.getString("fileField", "file")
                    + "\"; filename=\"" + call.getString("fileName", "file.gpx") + "\"\r\nContent-Type: " + call.getString("mime", "application/gpx+xml") + "\r\n\r\n";
                os.write(fileHeader.getBytes(StandardCharsets.UTF_8));
                os.write(call.getString("fileText", "").getBytes(StandardCharsets.UTF_8));
                os.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            }
            resolve(call, c);
        } catch (Exception e) {
            call.reject("Upload failed: " + e.getMessage());
        }
    }
}