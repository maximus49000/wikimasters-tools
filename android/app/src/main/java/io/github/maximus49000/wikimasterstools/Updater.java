package io.github.maximus49000.wikimasterstools;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Mise à jour automatique : cherche la dernière release GitHub (canal de PRODUCTION uniquement : la pré-production,
// c'est-à-dire main, ne publie aucune release), télécharge l'APK puis propose de l'installer.
// Android interdit l'installation silencieuse hors Play Store : l'utilisateur confirme une fois.
final class Updater {
    private static final String LATEST_RELEASE =
            "https://api.github.com/repos/maximus49000/wikimasters-tools/releases/latest";
    private static final Pattern TAG = Pattern.compile("^android-(\\d+)$");
    private static final long CHECK_INTERVAL_MS = 24L * 60 * 60 * 1000;
    private static final long MAX_APK_BYTES = 100L * 1024 * 1024;
    private static final String PREFS = "updater";
    private static final String LAST_CHECK = "lastCheck";

    private final Activity activity;

    Updater(Activity activity) {
        this.activity = activity;
    }

    // Au plus une vérification par jour ; tout échec (réseau, JSON, paquet) est silencieux : on retentera plus tard.
    void checkInBackground() {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (System.currentTimeMillis() - prefs.getLong(LAST_CHECK, 0) < CHECK_INTERVAL_MS) return;
        new Thread(() -> {
            try {
                Release release = fetchLatest();
                prefs.edit().putLong(LAST_CHECK, System.currentTimeMillis()).apply();
                if (release == null || release.versionCode <= currentVersionCode()) return;
                File apk = download(release);
                if (apk == null) return;
                activity.runOnUiThread(() -> promptInstall(apk, release));
            } catch (Exception ignored) {
                // Hors ligne ou GitHub injoignable : rien à signaler.
            }
        }, "wmt-updater").start();
    }

    private long currentVersionCode() throws PackageManager.NameNotFoundException {
        return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).getLongVersionCode();
    }

    private static final class Release {
        long versionCode;
        String name;
        String apkUrl;
    }

    private Release fetchLatest() throws IOException, JSONException {
        HttpURLConnection connection = open(LATEST_RELEASE);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        JSONObject json;
        try {
            if (connection.getResponseCode() != 200) return null;
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                copy(in, out, 1024 * 1024);
                json = new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
            }
        } finally {
            connection.disconnect();
        }
        Matcher tag = TAG.matcher(json.optString("tag_name"));
        JSONArray assets = json.optJSONArray("assets");
        if (!tag.matches() || assets == null) return null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.getJSONObject(i);
            String url = asset.optString("browser_download_url");
            if (asset.optString("name").endsWith("-android.apk") && url.startsWith("https://")) {
                Release release = new Release();
                release.versionCode = Long.parseLong(tag.group(1));
                release.name = json.optString("name", tag.group(1));
                release.apkUrl = url;
                return release;
            }
        }
        return null;
    }

    private File download(Release release) throws IOException {
        File dir = new File(activity.getCacheDir(), "updates");
        if (!dir.isDirectory() && !dir.mkdirs()) return null;
        File apk = new File(dir, "update.apk");
        HttpURLConnection connection = open(release.apkUrl);
        try {
            if (connection.getResponseCode() != 200) return null;
            try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                copy(in, out, MAX_APK_BYTES);
            }
        } finally {
            connection.disconnect();
        }
        // Garde-fou avant d'afficher quoi que ce soit : bon paquet, bonne version (Android vérifie aussi la signature).
        PackageInfo info = activity.getPackageManager().getPackageArchiveInfo(apk.getPath(), 0);
        if (info == null || !activity.getPackageName().equals(info.packageName)
                || info.getLongVersionCode() != release.versionCode) {
            //noinspection ResultOfMethodCallIgnored
            apk.delete();
            return null;
        }
        return apk;
    }

    private void promptInstall(File apk, Release release) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        new AlertDialog.Builder(activity)
                .setTitle(R.string.update_title)
                .setMessage(activity.getString(R.string.update_message, release.name))
                .setPositiveButton(R.string.update_install, (dialog, which) -> install(apk))
                .setNegativeButton(R.string.update_later, null)
                .show();
    }

    private void install(File apk) {
        // Première fois : Android demande d'autoriser cette application à installer des paquets.
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName())));
            return;
        }
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", apk);
        activity.startActivity(new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        connection.setRequestProperty("User-Agent", "WikimastersTools-Android");
        return connection;
    }

    private static void copy(InputStream in, OutputStream out, long limit) throws IOException {
        byte[] buffer = new byte[16 * 1024];
        long total = 0;
        for (int read; (read = in.read(buffer)) != -1; ) {
            total += read;
            if (total > limit) throw new IOException("Réponse trop volumineuse");
            out.write(buffer, 0, read);
        }
    }
}
