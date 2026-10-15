package io.github.maximus49000.wikimasterstools;

import android.app.Activity;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;

import com.spotify.android.appremote.api.ConnectionParams;
import com.spotify.android.appremote.api.Connector;
import com.spotify.android.appremote.api.SpotifyAppRemote;
import com.spotify.android.appremote.api.error.AuthenticationFailedException;
import com.spotify.android.appremote.api.error.CouldNotFindSpotifyApp;
import com.spotify.android.appremote.api.error.NotLoggedInException;
import com.spotify.android.appremote.api.error.UnsupportedFeatureVersionException;
import com.spotify.android.appremote.api.error.UserNotAuthorizedException;
import com.spotify.protocol.client.CallResult;
import com.spotify.protocol.client.Subscription;
import com.spotify.protocol.types.Artist;
import com.spotify.protocol.types.Empty;
import com.spotify.protocol.types.PlayerState;
import com.spotify.protocol.types.Track;

import org.json.JSONObject;

import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

// Lecture par l'appli Spotify du téléphone (SDK App Remote) : la surcouche pilote, Spotify joue, Wikimasters reste devant.
// Toutes les méthodes s'exécutent sur le fil UI (MainActivity y renvoie les appels du pont ; le SDK y rappelle aussi).
final class SpotifyRemote {
    interface Sink {
        // `error` vide : réussite.
        void done(String id, String error);
        void event(String json);
    }

    private static final String DISCONNECTED = "{\"connected\":false}";
    private static final String IMAGE_PREFIX = "spotify:image:";

    private final Activity activity;
    private final Sink sink;
    private SpotifyAppRemote remote;
    private Subscription<PlayerState> subscription;
    private String clientId;
    private String redirectUri;
    // Une connexion a réussi : reprise silencieuse au retour au premier plan.
    private boolean resumeOnStart;

    SpotifyRemote(Activity activity, Sink sink) {
        this.activity = activity;
        this.sink = sink;
    }

    void connect(String id, String clientId, String redirectUri) {
        if (remote != null && remote.isConnected() && clientId.equals(this.clientId)) {
            sink.done(id, "");
            return;
        }
        drop();
        this.clientId = clientId;
        this.redirectUri = redirectUri;
        open(id, true);
    }

    // `id` null : reconnexion silencieuse, personne n'attend la réponse.
    private void open(String id, boolean showAuthView) {
        ConnectionParams params = new ConnectionParams.Builder(clientId).setRedirectUri(redirectUri).showAuthView(showAuthView).build();
        SpotifyAppRemote.connect(activity, params, new Connector.ConnectionListener() {
            @Override
            public void onConnected(SpotifyAppRemote connected) {
                remote = connected;
                resumeOnStart = true;
                subscription = connected.getPlayerApi().subscribeToPlayerState();
                subscription.setEventCallback(state -> sink.event(stateJson(state)));
                if (id != null) sink.done(id, "");
            }

            @Override
            public void onFailure(Throwable error) {
                // Échec de connexion, ou connexion perdue plus tard (Spotify arrêté).
                remote = null;
                subscription = null;
                sink.event(DISCONNECTED);
                if (id != null) sink.done(id, codeOf(error));
            }
        });
    }

    void play(String id, String uri) {
        run(id, connected() ? remote.getPlayerApi().play(uri) : null);
    }

    void skipToIndex(String id, String contextUri, int index) {
        run(id, connected() ? remote.getPlayerApi().skipToIndex(contextUri, index) : null);
    }

    void queue(String id, String uri) {
        run(id, connected() ? remote.getPlayerApi().queue(uri) : null);
    }

    void pause(String id) {
        run(id, connected() ? remote.getPlayerApi().pause() : null);
    }

    void resume(String id) {
        run(id, connected() ? remote.getPlayerApi().resume() : null);
    }

    // Délier ou changer de clé : plus de reprise automatique.
    void disconnect() {
        resumeOnStart = false;
        drop();
        sink.event(DISCONNECTED);
    }

    void onStart() {
        if (resumeOnStart && remote == null && clientId != null) open(null, false);
    }

    void onStop() {
        if (remote == null) return;
        drop();
        sink.event(DISCONNECTED);
    }

    // Fin de l'activité : la WebView va disparaître, on ne lui écrit plus rien.
    void release() {
        drop();
    }

    // Entrée refusée par le pont : la page reçoit `failed` et se replie sur la Web API.
    void notify(String id) {
        sink.done(id, "failed");
    }

    String fingerprint() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
            Signature[] signers = info.signingInfo.getApkContentsSigners();
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(signers[0].toByteArray());
            StringBuilder out = new StringBuilder();
            for (byte part : digest) {
                if (out.length() > 0) out.append(':');
                out.append(String.format("%02X", part));
            }
            return out.toString();
        } catch (Exception error) {
            return "";
        }
    }

    private boolean connected() {
        return remote != null && remote.isConnected();
    }

    // Pas de connexion : `failed`, la page reconnecte puis se replie sur la Web API.
    private void run(String id, CallResult<Empty> result) {
        if (result == null) {
            sink.done(id, "failed");
            return;
        }
        result.setResultCallback(empty -> sink.done(id, ""));
        result.setErrorCallback(error -> sink.done(id, codeOf(error)));
    }

    private void drop() {
        if (subscription != null) subscription.cancel();
        subscription = null;
        if (remote != null) SpotifyAppRemote.disconnect(remote);
        remote = null;
    }

    static String codeOf(Throwable error) {
        if (error instanceof CouldNotFindSpotifyApp) return "not-installed";
        if (error instanceof NotLoggedInException) return "not-logged-in";
        if (error instanceof UserNotAuthorizedException || error instanceof AuthenticationFailedException) return "not-authorized";
        if (error instanceof UnsupportedFeatureVersionException) return "unsupported";
        return "failed";
    }

    private static String stateJson(PlayerState state) {
        try {
            JSONObject out = new JSONObject().put("connected", true);
            Track track = state == null ? null : state.track;
            if (track == null || track.uri == null) return out.put("track", JSONObject.NULL).toString();
            String raw = track.imageUri == null || track.imageUri.raw == null ? "" : track.imageUri.raw;
            String image = raw.startsWith(IMAGE_PREFIX) ? "https://i.scdn.co/image/" + raw.substring(IMAGE_PREFIX.length()) : "";
            // Mêmes artistes que la Web API (« A, B ») : la page reconnaît le titre en cours dans ses listes.
            List<String> names = new ArrayList<>();
            if (track.artists != null) for (Artist artist : track.artists) if (artist != null && artist.name != null) names.add(artist.name);
            if (names.isEmpty() && track.artist != null && track.artist.name != null) names.add(track.artist.name);
            JSONObject item = new JSONObject()
                    .put("uri", track.uri)
                    .put("title", track.name == null ? "" : track.name)
                    .put("artist", String.join(", ", names))
                    .put("imageUrl", image)
                    .put("playing", !state.isPaused);
            return out.put("track", item).toString();
        } catch (Exception error) {
            return "{\"connected\":true,\"track\":null}";
        }
    }
}
