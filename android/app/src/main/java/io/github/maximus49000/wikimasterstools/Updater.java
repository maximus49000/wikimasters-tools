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
import android.widget.Toast;

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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Mise à jour automatique : cherche la dernière release GitHub de son canal (production : release stable ; pré-production : pre-release
// publiée à chaque fusion dans main), télécharge l'APK puis propose de l'installer.
// Android interdit l'installation silencieuse hors Play Store : l'utilisateur confirme une fois.
final class Updater {
    private static final Pattern NUMBER = Pattern.compile("^\\d+$");
    private static final long CHECK_INTERVAL_MS = 60L * 60 * 1000;
    private static final long MAX_APK_BYTES = 100L * 1024 * 1024;
    private static final String PREFS = "updater";
    private static final String LAST_CHECK = "lastCheck";

    // Une version déjà refusée (« Plus tard ») n'est pas reproposée automatiquement avant le prochain lancement.
    private static long declinedVersion;

    private final Activity activity;
    private final AtomicBoolean busy = new AtomicBoolean();

    Updater(Activity activity) {
        this.activity = activity;
    }

    // Vérification automatique : au plus une par heure ; tout échec (réseau, JSON, paquet) est silencieux, on retentera.
    void checkInBackground() {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (System.currentTimeMillis() - prefs.getLong(LAST_CHECK, 0) < CHECK_INTERVAL_MS) return;
        start(false);
    }

    // Bouton « Vérifier la mise à jour » : toujours une fenêtre de réponse (à jour, nouvelle version, ou échec).
    void checkNow() {
        start(true);
    }

    private void start(boolean manual) {
        if (!busy.compareAndSet(false, true)) return;
        if (manual) Toast.makeText(activity, R.string.update_checking, Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try {
                Release release = fetchLatest();
                activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                        .putLong(LAST_CHECK, System.currentTimeMillis()).apply();
                PackageInfo current = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
                if (release == null || release.versionCode <= current.getLongVersionCode()) {
                    if (manual) {
                        activity.runOnUiThread(() -> showMessage(
                                activity.getString(R.string.update_current, current.versionName, current.getLongVersionCode())));
                    }
                    return;
                }
                if (!manual && release.versionCode == declinedVersion) return;
                File apk = download(release);
                if (apk == null) throw new IOException("Paquet invalide");
                activity.runOnUiThread(() -> promptInstall(apk, release));
            } catch (Exception e) {
                // Hors ligne ou GitHub injoignable : silencieux en automatique, signalé quand c'est l'utilisateur qui demande.
                if (manual) activity.runOnUiThread(() -> showMessage(activity.getString(R.string.update_failed)));
            } finally {
                busy.set(false);
            }
        }, "wmt-updater").start();
    }

    private void showMessage(String message) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        new AlertDialog.Builder(activity)
                .setTitle(R.string.update_title_check)
                .setMessage(message)
                .setPositiveButton(android.R.string.ok, null)
                .show();
    }

    private static final class Release {
        long versionCode;
        String name;
        String notes;
        String apkUrl;
    }

    // Production : /releases/latest (un objet). Pré-production : liste des releases (un tableau), la plus récente `preprod-N`.
    private Release fetchLatest() throws IOException, JSONException {
        HttpURLConnection connection = open(BuildConfig.UPDATE_URL);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        String body;
        try {
            int status = connection.getResponseCode();
            if (status == 404) return null; // aucune release publiée : rien à installer
            if (status != 200) throw new IOException("GitHub : HTTP " + status);
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                copy(in, out, 4 * 1024 * 1024);
                body = out.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            connection.disconnect();
        }
        Release best = null;
        if (body.trim().startsWith("[")) {
            JSONArray list = new JSONArray(body);
            for (int i = 0; i < list.length(); i++) {
                Release release = parse(list.getJSONObject(i));
                if (release != null && (best == null || release.versionCode > best.versionCode)) best = release;
            }
            return best;
        }
        return parse(new JSONObject(body));
    }

    private Release parse(JSONObject json) throws JSONException {
        if (json.optBoolean("draft")) return null;
        String tag = json.optString("tag_name");
        JSONArray assets = json.optJSONArray("assets");
        if (!tag.startsWith(BuildConfig.UPDATE_TAG_PREFIX) || assets == null) return null;
        Matcher number = NUMBER.matcher(tag.substring(BuildConfig.UPDATE_TAG_PREFIX.length()));
        if (!number.matches()) return null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.getJSONObject(i);
            String url = asset.optString("browser_download_url");
            if (asset.optString("name").endsWith("-android.apk") && url.startsWith("https://")) {
                Release release = new Release();
                release.versionCode = Long.parseLong(number.group());
                release.name = json.optString("name", tag);
                release.notes = json.optString("body", "").trim();
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
                .setMessage(release.notes.isEmpty()
                        ? activity.getString(R.string.update_message, release.name)
                        : activity.getString(R.string.update_message_notes, release.name, release.notes))
                .setPositiveButton(R.string.update_install, (dialog, which) -> install(apk))
                .setNegativeButton(R.string.update_later, (dialog, which) -> declinedVersion = release.versionCode)
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
