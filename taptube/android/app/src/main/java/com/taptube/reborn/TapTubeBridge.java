package com.taptube.reborn;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * JavaScript bridge exposed as `window.TapTubeNative`.
 *
 * Search is key-free: it talks to YouTube's public InnerTube web endpoint
 * (`youtubei/v1/search`, WEB client) the same way the mobile web player does.
 * An optional YouTube Data API v3 key can be supplied from Settings for the
 * most reliable results.
 */
public class TapTubeBridge {

    private static final String INNERTUBE_SEARCH =
            "https://www.youtube.com/youtubei/v1/search?prettyPrint=false";
    private static final String INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    private static final String CLIENT_VERSION = "2.20240726.00.00";

    private final MainActivity activity;
    private final WebView webView;

    TapTubeBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public boolean isAndroidApp() {
        return true;
    }

    @JavascriptInterface
    public String getSharedYoutubeUrl() {
        String v = activity.consumeSharedUrl();
        return v == null ? "" : v;
    }

    @JavascriptInterface
    public void setOrientation(String mode) {
        activity.applyOrientation(mode);
        activity.applyImmersive("landscape".equals(mode));
    }

    @JavascriptInterface
    public void setImmersive(boolean enabled) {
        activity.applyImmersive(enabled);
    }

    @JavascriptInterface
    public void vibrate(int durationMs) {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            int ms = Math.max(1, Math.min(120, durationMs));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(ms);
            }
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void shareText(String title, String text) {
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.putExtra(Intent.EXTRA_TEXT, text);
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(chooser);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public boolean isOnline() {
        try {
            ConnectivityManager cm =
                    (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            NetworkInfo info = cm.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Exception e) {
            return true;
        }
    }

    /** oEmbed metadata (title / author / thumbnail) — key-free. */
    @JavascriptInterface
    public String fetchOEmbed(String urlOrId) {
        JSONObject out = new JSONObject();
        try {
            String watchUrl = "https://www.youtube.com/watch?v=" + urlOrId;
            String endpoint = "https://www.youtube.com/oembed?format=json&url="
                    + URLEncoder.encode(watchUrl, "UTF-8");
            String body = httpGet(endpoint);
            if (body != null && body.trim().startsWith("{")) {
                JSONObject json = new JSONObject(body);
                out.put("videoId", urlOrId);
                out.put("title", json.optString("title"));
                out.put("channelTitle", json.optString("author_name"));
                out.put("thumbnail", "https://i.ytimg.com/vi/" + urlOrId + "/hqdefault.jpg");
                out.put("durationSec", 210);
            }
        } catch (Exception e) {
            try {
                out.put("error", String.valueOf(e.getMessage()));
            } catch (JSONException ignored) {
            }
        }
        return out.toString();
    }

    /**
     * Returns JSON: {"source":"innertube"|"datav3","items":[{videoId,title,channelTitle,durationSec,thumbnail,viewCount}]}
     */
    @JavascriptInterface
    public String searchYouTube(String query, String category, String regionCode, String apiKey) {
        JSONObject out = new JSONObject();
        try {
            if (apiKey != null && apiKey.trim().length() > 20) {
                String data = searchWithDataApi(query, category, regionCode, apiKey.trim());
                if (data != null) {
                    JSONObject parsed = new JSONObject(data);
                    parsed.put("source", "datav3");
                    return parsed.toString();
                }
            }
            String inner = searchWithInnerTube(query, category, regionCode);
            if (inner != null) {
                JSONObject parsed = new JSONObject(inner);
                parsed.put("source", "innertube");
                return parsed.toString();
            }
            out.put("source", "none");
            out.put("items", new JSONArray());
        } catch (Exception e) {
            try {
                out.put("source", "error");
                out.put("error", String.valueOf(e.getMessage()));
                out.put("items", new JSONArray());
            } catch (JSONException ignored) {
            }
        }
        return out.toString();
    }

    private String searchWithDataApi(String query, String category, String regionCode, String apiKey)
            throws Exception {
        String catParam = "music".equals(category) ? "&videoCategoryId=10" : "";
        String url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video"
                + "&videoEmbeddable=true&maxResults=24&regionCode="
                + URLEncoder.encode(regionCode == null || regionCode.isEmpty() ? "TH" : regionCode, "UTF-8")
                + catParam
                + "&q=" + URLEncoder.encode(query, "UTF-8")
                + "&key=" + URLEncoder.encode(apiKey, "UTF-8");
        String body = httpGet(url);
        if (body == null) return null;
        JSONObject json = new JSONObject(body);
        JSONArray items = json.optJSONArray("items");
        if (items == null) return null;

        StringBuilder ids = new StringBuilder();
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            JSONObject id = it.optJSONObject("id");
            if (id == null) continue;
            String vid = id.optString("videoId", "");
            if (vid.isEmpty()) continue;
            if (ids.length() > 0) ids.append(",");
            ids.append(vid);
        }
        JSONArray result = new JSONArray();
        if (ids.length() == 0) {
            JSONObject wrap = new JSONObject();
            wrap.put("items", result);
            return wrap.toString();
        }

        String detailUrl = "https://www.googleapis.com/youtube/v3/videos"
                + "?part=snippet,contentDetails,statistics"
                + "&id=" + ids
                + "&key=" + URLEncoder.encode(apiKey, "UTF-8");
        String detailBody = httpGet(detailUrl);
        if (detailBody != null) {
            JSONObject detail = new JSONObject(detailBody);
            JSONArray dItems = detail.optJSONArray("items");
            if (dItems != null) {
                for (int i = 0; i < dItems.length(); i++) {
                    JSONObject v = dItems.optJSONObject(i);
                    if (v == null) continue;
                    JSONObject sn = v.optJSONObject("snippet");
                    JSONObject cd = v.optJSONObject("contentDetails");
                    JSONObject st = v.optJSONObject("statistics");
                    String vid = v.optString("id");
                    JSONObject row = new JSONObject();
                    row.put("videoId", vid);
                    row.put("title", sn != null ? sn.optString("title") : "YouTube");
                    row.put("channelTitle", sn != null ? sn.optString("channelTitle") : "YouTube");
                    row.put("durationSec", parseIsoDuration(cd != null ? cd.optString("duration") : "PT3M30S"));
                    row.put("thumbnail", "https://i.ytimg.com/vi/" + vid + "/hqdefault.jpg");
                    try {
                        row.put("viewCount", Long.parseLong(st != null ? st.optString("viewCount", "0") : "0"));
                    } catch (Exception e) {
                        row.put("viewCount", 0);
                    }
                    result.put(row);
                }
            }
        }
        JSONObject wrap = new JSONObject();
        wrap.put("items", result);
        return wrap.toString();
    }

    private String searchWithInnerTube(String query, String category, String regionCode)
            throws Exception {
        JSONObject ctx = new JSONObject();
        JSONObject client = new JSONObject();
        client.put("clientName", "WEB");
        client.put("clientVersion", CLIENT_VERSION);
        client.put("hl", "th");
        client.put("gl", regionCode == null || regionCode.isEmpty() ? "TH" : regionCode);
        ctx.put("client", client);

        JSONObject payload = new JSONObject();
        payload.put("context", ctx);
        payload.put("query", "music".equals(category) ? query + " audio" : query);
        payload.put("params", "EgIQAQ%3D%3D"); // filter: videos only

        String body = httpPost(INNERTUBE_SEARCH + "&key=" + INNERTUBE_KEY,
                payload.toString());
        if (body == null) return null;

        JSONObject root = new JSONObject(body);
        JSONArray result = new JSONArray();
        collectVideoRenderers(root, result, 24);
        if (result.length() == 0) {
            return null;
        }
        JSONObject wrap = new JSONObject();
        wrap.put("items", result);
        return wrap.toString();
    }

    private void collectVideoRenderers(Object node, JSONArray out, int limit) {
        if (node == null || out.length() >= limit) return;
        if (node instanceof JSONObject) {
            JSONObject obj = (JSONObject) node;
            JSONObject vr = obj.optJSONObject("videoRenderer");
            if (vr != null) {
                try {
                    String vid = vr.optString("videoId", "");
                    if (!vid.isEmpty()) {
                        JSONObject row = new JSONObject();
                        row.put("videoId", vid);
                        row.put("title", extractText(vr.optJSONObject("title")));
                        row.put("channelTitle", extractText(vr.optJSONObject("ownerText")));
                        row.put("durationSec", extractDuration(vr.optJSONObject("lengthText")));
                        row.put("thumbnail", "https://i.ytimg.com/vi/" + vid + "/hqdefault.jpg");
                        row.put("viewCount", extractViews(vr.optJSONObject("viewCountText")));
                        out.put(row);
                    }
                } catch (JSONException ignored) {
                }
            }
            java.util.Iterator<String> keys = obj.keys();
            while (keys.hasNext() && out.length() < limit) {
                collectVideoRenderers(obj.opt(keys.next()), out, limit);
            }
        } else if (node instanceof JSONArray) {
            JSONArray arr = (JSONArray) node;
            for (int i = 0; i < arr.length() && out.length() < limit; i++) {
                collectVideoRenderers(arr.opt(i), out, limit);
            }
        }
    }

    private String extractText(JSONObject richText) {
        if (richText == null) return "";
        JSONArray runs = richText.optJSONArray("runs");
        if (runs != null) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < runs.length(); i++) {
                JSONObject r = runs.optJSONObject(i);
                if (r != null) sb.append(r.optString("text", ""));
            }
            return sb.toString();
        }
        return richText.optString("simpleText", "");
    }

    private int extractDuration(JSONObject lengthText) {
        String s = extractText(lengthText);
        String[] parts = s.split(":");
        try {
            if (parts.length == 3) {
                return Integer.parseInt(parts[0].trim()) * 3600
                        + Integer.parseInt(parts[1].trim()) * 60
                        + Integer.parseInt(parts[2].trim());
            } else if (parts.length == 2) {
                return Integer.parseInt(parts[0].trim()) * 60
                        + Integer.parseInt(parts[1].trim());
            }
        } catch (Exception ignored) {
        }
        return 210;
    }

    private long extractViews(JSONObject viewText) {
        String s = extractText(viewText);
        if (s.isEmpty()) return 0;
        Matcher m = Pattern.compile("([\\d.,]+)\\s*([KMB])?", Pattern.CASE_INSENSITIVE).matcher(s);
        if (m.find()) {
            try {
                String num = m.group(1).replace(",", "");
                double val = Double.parseDouble(num);
                String unit = m.group(2);
                if (unit != null) {
                    if (unit.equalsIgnoreCase("K")) val *= 1_000;
                    else if (unit.equalsIgnoreCase("M")) val *= 1_000_000;
                    else if (unit.equalsIgnoreCase("B")) val *= 1_000_000_000;
                }
                return (long) val;
            } catch (Exception ignored) {
            }
        }
        return 0;
    }

    private static int parseIsoDuration(String iso) {
        Matcher m = Pattern.compile("PT(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+)S)?").matcher(iso == null ? "" : iso);
        if (m.find()) {
            int h = m.group(1) != null ? Integer.parseInt(m.group(1)) : 0;
            int mi = m.group(2) != null ? Integer.parseInt(m.group(2)) : 0;
            int se = m.group(3) != null ? Integer.parseInt(m.group(3)) : 0;
            return h * 3600 + mi * 60 + se;
        }
        return 210;
    }

    private String httpGet(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(9000);
            conn.setReadTimeout(12000);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13) TapTubeReborn/1.6.5");
            conn.setRequestProperty("Accept-Language", "th,en;q=0.8");
            int code = conn.getResponseCode();
            InputStream is = code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
            if (is == null) return null;
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private String httpPost(String urlStr, String jsonBody) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(9000);
            conn.setReadTimeout(12000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("User-Agent",
                    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36");
            conn.setRequestProperty("Origin", "https://www.youtube.com");
            conn.setRequestProperty("Accept-Language", "th,en;q=0.8");
            byte[] payload = jsonBody.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(payload.length);
            OutputStream os = conn.getOutputStream();
            os.write(payload);
            os.flush();
            os.close();
            int code = conn.getResponseCode();
            InputStream is = code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
            if (is == null) return null;
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    @SuppressWarnings("unused")
    private void loadInWebView(String url) {
        webView.post(() -> webView.loadUrl(url));
    }
}
