package io.github.maximus49000.wikimasterstools;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Iterator;

// Wikimasters en plein écran, avec la surcouche « Wikimasters Tools » injectée à chaque page.
public class MainActivity extends Activity {
    private static final String HOST = "www.wiki-masters.com";
    private static final String START_URL = "https://" + HOST + "/";
    private static final String OVERLAY_ASSET = "wikimasters-overlay.js";
    private static final String SPOTIFY_AUTH_PREFIX = "https://accounts.spotify.com/authorize?";
    private static final String TIDAL_AUTH_PREFIX = "https://login.tidal.com/authorize?";
    // Hôtes de jeux vidéo (Steam, Twitch, IGDB) sans CORS : requêtes faites ici, jamais d'autre adresse.
    private static final String[] HTTP_ALLOWED = {
        "https://store.steampowered.com/",
        "https://api.steampowered.com/",
        "https://id.twitch.tv/oauth2/token",
        "https://api.igdb.com/v4/"
    };
    private static final String SPOTIFY_REDIRECT_SCHEME = BuildConfig.REDIRECT_SCHEME;

    private WebView webView;
    // Vidéo en plein écran (bouton plein écran des lecteurs de la surcouche, ou celui de YouTube) : la WebView la confie à l'activité.
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private final Updater updater = new Updater(this);
    private String overlayScript;
    // Repli quand la WebView ne sait pas injecter au début du document : injection au démarrage de chaque page.
    private boolean injectOnPageStarted;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Inspection depuis chrome://inspect : seulement dans un build de debug.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        webView = new WebView(this);
        setContentView(webView);
        enterFullscreen();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new SpotifyBridge(), "WmtSpotify");
        webView.addJavascriptInterface(new HttpBridge(), "WmtHttp");

        overlayScript = readAsset(OVERLAY_ASSET);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, overlayScript, Collections.singleton("https://" + HOST));
        } else {
            injectOnPageStarted = true;
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) return false;
                // Wikipédia, tuiles, liens externes : le navigateur du téléphone, pas la WebView du jeu.
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (injectOnPageStarted && url != null && url.startsWith("https://" + HOST + "/")) {
                    view.evaluateJavascript(overlayScript, null);
                }
            }
        });

        // Sans WebChromeClient, la WebView refuse seule les boîtes natives du site (« Annuler et récupérer ma carte » demande confirmation).
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                ((FrameLayout) getWindow().getDecorView()).addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                webView.setVisibility(View.INVISIBLE);
            }

            @Override
            public void onHideCustomView() {
                exitCustomView();
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                        .setOnCancelListener(dialog -> result.confirm())
                        .show();
                return true;
            }
        });

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(START_URL);

        webView.addJavascriptInterface(new UpdateBridge(), "WmtUpdate");
    }

    // Pont HTTP : `WmtHttp.request(id, url, method, headersJson, body)` ; la réponse revient par window.__wmtHttpDone.
    private final class HttpBridge {
        @JavascriptInterface
        public void request(String id, String url, String method, String headersJson, String body) {
            boolean allowed = false;
            for (String prefix : HTTP_ALLOWED) if (url != null && url.startsWith(prefix)) allowed = true;
            final String callId = id == null ? "" : id.replaceAll("[^A-Za-z0-9-]", "");
            if (!allowed) {
                deliver(callId, 0, "", "");
                return;
            }
            new Thread(() -> {
                int status = 0;
                String retryAfter = "";
                String text = "";
                HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection) new URL(url).openConnection();
                    connection.setConnectTimeout(15000);
                    connection.setReadTimeout(15000);
                    // Une 3xx revient telle quelle au JS : pas de renvoi des en-têtes d'authentification vers un autre hôte.
                    connection.setInstanceFollowRedirects(false);
                    connection.setRequestMethod("POST".equals(method) ? "POST" : "GET");
                    JSONObject headers = new JSONObject(headersJson == null ? "{}" : headersJson);
                    for (Iterator<String> names = headers.keys(); names.hasNext(); ) {
                        String name = names.next();
                        connection.setRequestProperty(name, headers.getString(name));
                    }
                    if ("POST".equals(method)) {
                        connection.setDoOutput(true);
                        if (body != null && !body.isEmpty()) connection.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
                    }
                    status = connection.getResponseCode();
                    String after = connection.getHeaderField("Retry-After");
                    retryAfter = after == null ? "" : after;
                    InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                    if (stream != null) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        byte[] chunk = new byte[8192];
                        int read;
                        while ((read = stream.read(chunk)) != -1) out.write(chunk, 0, read);
                        text = out.toString("UTF-8");
                    }
                } catch (Exception | OutOfMemoryError error) {
                    // Jamais de journal ici (en-têtes et corps peuvent porter des secrets) ; deliver est toujours appelé.
                    status = 0;
                } finally {
                    if (connection != null) connection.disconnect();
                }
                deliver(callId, status, retryAfter, text);
            }).start();
        }

        private void deliver(String id, int status, String retryAfter, String text) {
            String script = "window.__wmtHttpDone && window.__wmtHttpDone(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(retryAfter) + "," + JSONObject.quote(text) + ")";
            runOnUiThread(() -> webView.evaluateJavascript(script, null));
        }
    }

    // Pont « Vérifier la mise à jour » du menu Plus de la surcouche.
    private final class UpdateBridge {
        @JavascriptInterface
        public void check() {
            runOnUiThread(updater::checkNow);
        }
    }

    // Vérification automatique à chaque ouverture ou reprise de l'application (au plus une par heure).
    @Override
    protected void onResume() {
        super.onResume();
        updater.checkInBackground();
    }

    // Pont vers la surcouche : ouvre l'autorisation Spotify ou Tidal dans le navigateur du téléphone (jamais dans la WebView).
    // Seules les adresses d'autorisation de Spotify et de Tidal sont acceptées.
    private final class SpotifyBridge {
        @JavascriptInterface
        public void openAuth(String url) {
            if (url == null || !(url.startsWith(SPOTIFY_AUTH_PREFIX) || url.startsWith(TIDAL_AUTH_PREFIX))) return;
            runOnUiThread(() -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
        }

        // Schéma de retour de ce canal : la surcouche en déduit l'adresse déclarée chez Spotify et Tidal.
        @JavascriptInterface
        public String scheme() {
            return SPOTIFY_REDIRECT_SCHEME;
        }

        @JavascriptInterface
        public void openApp() {
            runOnUiThread(MainActivity.this::launchSpotifyApp);
        }
    }

    // Ouvre l'application Spotify (lecture demandée alors qu'elle est fermée). Sans Spotify installé, rien ne se passe.
    private void launchSpotifyApp() {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("spotify:")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException ignored) {
            // Spotify n'est pas installé : la surcouche affiche son message habituel.
        }
    }

    // Retour de l'autorisation (wikimasterstools://spotify?code=… ou wikimasterstools://tidal?code=…) : transmis à la surcouche, qui termine la liaison.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri uri = intent.getData();
        if (uri == null || !SPOTIFY_REDIRECT_SCHEME.equals(uri.getScheme())) return;
        webView.evaluateJavascript(
                "window.__wmtSpotifyRedirect && window.__wmtSpotifyRedirect(" + JSONObject.quote(uri.toString()) + ")", null);
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16 * 1024];
            for (int read; (read = in.read(buffer)) != -1; ) out.write(buffer, 0, read);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            throw new IllegalStateException("Surcouche introuvable : " + name, e);
        }
    }

    private void enterFullscreen() {
        Window window = getWindow();
        window.setDecorFitsSystemWindows(false);
        WindowInsetsController controller = window.getInsetsController();
        if (controller != null) {
            controller.hide(WindowInsets.Type.systemBars());
            controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterFullscreen();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    // Sort du plein écran d'une vidéo : la page réapparaît, la WebView est prévenue.
    private void exitCustomView() {
        if (customView == null) return;
        ((FrameLayout) getWindow().getDecorView()).removeView(customView);
        customView = null;
        webView.setVisibility(View.VISIBLE);
        if (customViewCallback != null) customViewCallback.onCustomViewHidden();
        customViewCallback = null;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (customView != null) exitCustomView();
        else if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
