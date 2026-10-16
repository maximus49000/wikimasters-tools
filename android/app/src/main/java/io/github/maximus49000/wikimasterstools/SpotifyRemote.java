package io.github.maximus49000.wikimasterstools;

import android.app.Activity;
import android.content.Intent;
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
import com.spotify.protocol.types.Repeat;
import com.spotify.protocol.types.Track;
import com.spotify.sdk.android.auth.AuthorizationClient;
import com.spotify.sdk.android.auth.AuthorizationRequest;
import com.spotify.sdk.android.auth.AuthorizationResponse;

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
    // Accord de l'utilisateur (écran de Spotify ouvert par Wikimasters) : code de retour de l'activité.
    static final int ACCORD_REQUEST = 0x5370;
    private static final String[] ACCORD_SCOPES = {"app-remote-control"};

    private final Activity activity;
    private final Sink sink;
    private SpotifyAppRemote remote;
    private Subscription<PlayerState> subscription;
    private String clientId;
    private String redirectUri;
    // Une connexion a réussi : reprise silencieuse au retour au premier plan.
    private boolean resumeOnStart;
    // Génération de la tentative de connexion en cours : les rappels d'une tentative périmée (annulée, remplacée) sont ignorés.
    private int attempt;
    // Activité terminée : plus rien n'est écrit à la WebView.
    private boolean released;
    // Une reconnexion silencieuse (onStart ou page) est en cours.
    private boolean silentPending;
    // Identifiant que la tentative en cours doit encore recevoir : remplacée ou annulée, elle répond `failed`.
    private String[] openPending = {null};
    // Accord en cours : la tentative qui l'a demandé et l'identifiant qui attend la réponse.
    private int accordAttempt = -1;
    private String[] accordPending;

    SpotifyRemote(Activity activity, Sink sink) {
        this.activity = activity;
        this.sink = sink;
    }

    // `silent` : sans écran d'accord (reconnexion au démarrage de la page) ; annulée par onStop comme celle d'onStart.
    void connect(String id, String clientId, String redirectUri, boolean silent) {
        if (remote != null && remote.isConnected() && clientId.equals(this.clientId)) {
            // Déjà relié (nouvelle page après une navigation) : la page n'a pas encore l'état du lecteur, on le lui renvoie.
            remote.getPlayerApi().getPlayerState().setResultCallback(state -> emit(stateJson(state)));
            answer(id, "");
            return;
        }
        drop();
        this.clientId = clientId;
        this.redirectUri = redirectUri;
        open(id, !silent, false);
    }

    // `id` null : reconnexion silencieuse d'onStart, personne n'attend la réponse.
    // `interactive` : une lecture demandée par l'utilisateur, qui peut ouvrir l'écran d'accord.
    // `accordDone` : l'accord vient d'être demandé pour cette lecture ; on ne le redemande pas (jamais de boucle).
    private void open(String id, boolean interactive, boolean accordDone) {
        final int mine = ++attempt;
        silentPending = !interactive;
        // Chaque id n'est répondu qu'une fois (un échec ultérieur, perte de connexion, ne le répète pas).
        final String[] pending = {id};
        openPending = pending;
        // Jamais `showAuthView(true)` : Spotify ouvrirait son écran d'accord depuis l'arrière-plan, Android 16 le bloque et le SDK
        // attendrait sans fin. Sans accord, le SDK répond aussitôt UserNotAuthorizedException et Wikimasters ouvre l'accord (askAccord).
        ConnectionParams params = new ConnectionParams.Builder(clientId).setRedirectUri(redirectUri).showAuthView(false).build();
        SpotifyAppRemote.connect(activity, params, new Connector.ConnectionListener() {
            @Override
            public void onConnected(SpotifyAppRemote connected) {
                if (mine != attempt) {
                    // Tentative périmée (délier, arrière-plan, nouvelle connexion, fin de l'activité) : on referme.
                    SpotifyAppRemote.disconnect(connected);
                    reply(pending, "failed");
                    return;
                }
                silentPending = false;
                remote = connected;
                resumeOnStart = true;
                subscription = connected.getPlayerApi().subscribeToPlayerState();
                subscription.setEventCallback(state -> emit(stateJson(state)));
                reply(pending, "");
            }

            @Override
            public void onFailure(Throwable error) {
                if (mine != attempt) {
                    reply(pending, "failed");
                    return;
                }
                // Échec de connexion, ou connexion perdue plus tard (Spotify arrêté).
                silentPending = false;
                remote = null;
                subscription = null;
                emit(DISCONNECTED);
                // Accord jamais donné : Spotify ne peut pas afficher son écran depuis l'arrière-plan (Android 16), Wikimasters l'ouvre.
                if (interactive && !accordDone && error instanceof UserNotAuthorizedException && pending[0] != null && askAccord(mine, pending)) return;
                reply(pending, codeOf(error));
            }
        });
    }

    // Ouvre l'écran d'accord de Spotify depuis notre activité (au premier plan, donc autorisée) ; la réponse arrive dans onActivityResult.
    private boolean askAccord(int mine, String[] pending) {
        try {
            AuthorizationRequest request = new AuthorizationRequest.Builder(clientId, AuthorizationResponse.Type.TOKEN, redirectUri)
                    .setScopes(ACCORD_SCOPES)
                    .build();
            accordAttempt = mine;
            accordPending = pending;
            AuthorizationClient.openLoginActivity(activity, ACCORD_REQUEST, request);
            return true;
        } catch (RuntimeException error) {
            accordPending = null;
            return false;
        }
    }

    // Retour de l'écran d'accord : accepté, on reconnecte (sans redemander l'accord) ; refusé par Spotify (clé, paquet, empreinte),
    // `not-authorized` ; annulé, `failed` (l'accord sera reproposé à une prochaine lecture).
    boolean onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != ACCORD_REQUEST) return false;
        String[] pending = accordPending;
        int mine = accordAttempt;
        accordPending = null;
        if (pending == null) return true;
        if (mine != attempt) {
            reply(pending, "failed");
            return true;
        }
        AuthorizationResponse response = AuthorizationClient.getResponse(resultCode, data);
        AuthorizationResponse.Type type = response.getType();
        if (type == AuthorizationResponse.Type.TOKEN || type == AuthorizationResponse.Type.CODE) {
            String id = pending[0];
            pending[0] = null;
            if (id != null) open(id, true, true);
            return true;
        }
        reply(pending, type == AuthorizationResponse.Type.ERROR ? "not-authorized" : "failed");
        return true;
    }

    private void reply(String[] pending, String code) {
        String id = pending[0];
        pending[0] = null;
        if (id != null) answer(id, code);
    }

    private void answer(String id, String error) {
        if (!released) sink.done(id, error);
    }

    private void emit(String json) {
        if (!released) sink.event(json);
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

    // Lecture lancée depuis une carte : la liste se lit dans l'ordre, ni au hasard ni un titre en boucle.
    // L'aléatoire est coupé d'abord ; la réponse suit la coupure de la répétition.
    void inOrder(String id) {
        if (!connected()) {
            run(id, null);
            return;
        }
        remote.getPlayerApi().setShuffle(false);
        run(id, remote.getPlayerApi().setRepeat(Repeat.OFF));
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
        emit(DISCONNECTED);
    }

    void onStart() {
        // Retour de l'écran d'accord : c'est sa réponse qui reconnecte, pas la reprise silencieuse.
        if (resumeOnStart && remote == null && clientId != null && accordPending == null) open(null, false, false);
    }

    void onStop() {
        if (remote == null) {
            // Une tentative interactive survit à onStop : l'écran d'autorisation de Spotify met notre activité en arrière-plan.
            // Seule une reconnexion silencieuse est annulée ; resumeOnStart la relancera au prochain onStart.
            if (silentPending) drop();
            return;
        }
        drop();
        emit(DISCONNECTED);
    }

    // Fin de l'activité : la WebView va disparaître, on ne lui écrit plus rien.
    void release() {
        released = true;
        drop();
    }

    // Entrée refusée par le pont : la page reçoit `failed` et se replie sur la Web API.
    void notify(String id) {
        answer(id, "failed");
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
            answer(id, "failed");
            return;
        }
        result.setResultCallback(empty -> answer(id, ""));
        result.setErrorCallback(error -> answer(id, codeOf(error)));
    }

    private void drop() {
        attempt++;
        silentPending = false;
        // La tentative en cours ne rappellera peut-être jamais : la page reçoit `failed` tout de suite.
        reply(openPending, "failed");
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
