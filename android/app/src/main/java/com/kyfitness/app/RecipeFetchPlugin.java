package com.kyfitness.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/**
 * Downloads one web page that the person typed or pasted into Add food > Recipe, so the recipe on it can be read.
 * Only https, only public addresses (never this phone or the home network), no cookies, no sign-in, a size limit, and
 * redirects are followed one at a time with the same checks. The page is handed to the app and nothing is kept or sent anywhere else.
 */
@CapacitorPlugin(name = "RecipeFetch")
public class RecipeFetchPlugin extends Plugin {
    private static final int MAX_BYTES = 2_500_000;
    private static final int MAX_REDIRECTS = 4;

    private static void check(URL u) throws Exception {
        if (!"https".equals(u.getProtocol())) throw new IllegalArgumentException("Only https addresses can be opened");
        String host = u.getHost();
        if (host == null || host.isEmpty() || !host.contains(".")) throw new IllegalArgumentException("That is not a website address");
        for (InetAddress a : InetAddress.getAllByName(host)) {
            if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress() || a.isMulticastAddress()) {
                throw new IllegalArgumentException("That address is on a private network, so it was not opened");
            }
            byte[] b = a.getAddress();
            // carrier-grade NAT 100.64.0.0/10 and unique-local IPv6 fc00::/7
            if (b.length == 4 && (b[0] & 0xff) == 100 && (b[1] & 0xc0) == 64) throw new IllegalArgumentException("That address is on a private network, so it was not opened");
            if (b.length == 16 && (b[0] & 0xfe) == 0xfc) throw new IllegalArgumentException("That address is on a private network, so it was not opened");
        }
    }

    @PluginMethod
    public void fetch(PluginCall call) {
        final String start = call.getString("url");
        getBridge().execute(() -> {
            try {
                URL u = new URL(start);
                for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
                    check(u);
                    HttpURLConnection c = (HttpURLConnection) u.openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(20000);
                    c.setUseCaches(false);
                    c.setRequestProperty("Accept", "text/html,application/xhtml+xml");
                    c.setRequestProperty("Accept-Language", "en");
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 MinimalFitness/1");
                    int status = c.getResponseCode();
                    if (status >= 300 && status < 400) {
                        String loc = c.getHeaderField("Location");
                        c.disconnect();
                        if (loc == null) throw new IllegalStateException("The site sent you somewhere without saying where");
                        u = new URL(u, loc);
                        continue;
                    }
                    if (status >= 400) {
                        c.disconnect();
                        throw new IllegalStateException("The site answered with an error (" + status + ")");
                    }
                    String type = c.getContentType();
                    Charset cs = StandardCharsets.UTF_8;
                    if (type != null) {
                        int i = type.toLowerCase().indexOf("charset=");
                        if (i >= 0) {
                            try {
                                cs = Charset.forName(type.substring(i + 8).replace("\"", "").trim());
                            } catch (Exception ignored) {
                                // keep UTF-8
                            }
                        }
                    }
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    try (InputStream in = c.getInputStream()) {
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            if (out.size() > MAX_BYTES) break;
                        }
                    } finally {
                        c.disconnect();
                    }
                    JSObject o = new JSObject();
                    o.put("html", out.toString(cs.name()));
                    o.put("url", u.toString());
                    call.resolve(o);
                    return;
                }
                throw new IllegalStateException("The site sent you around in circles");
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "The page could not be opened" : e.getMessage());
            }
        });
    }
}
