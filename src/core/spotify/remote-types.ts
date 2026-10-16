// Lecture par l'appli Spotify du téléphone (SDK Android App Remote) : ce que la surcouche en voit, quelle que soit la plateforme.
export type RemoteErrorCode = 'not-installed' | 'not-logged-in' | 'not-authorized' | 'unsupported' | 'failed';

export class RemoteError extends Error {
  constructor(readonly code: RemoteErrorCode) {
    super(`Spotify (appli) : ${code}`);
    this.name = 'RemoteError';
  }
}

export type RemoteTrack = { uri: string; title: string; artist: string; imageUrl: string | null; playing: boolean };
// `connected: false` : le SDK n'est plus relié (application en arrière-plan, Spotify arrêté) ; la Web API reprend la main.
export type RemoteEvent = { connected: false } | { connected: true; track: RemoteTrack | null };

export type SpotifyRemote = {
  // Ouvre au besoin l'écran d'accord de Spotify (la première fois) ; Spotify démarre en arrière-plan.
  // `silent` : reconnexion sans écran d'accord (au démarrage) ; elle échoue plutôt que de demander quoi que ce soit.
  connect(clientId: string, redirectUri: string, silent?: boolean): Promise<void>;
  play(uri: string): Promise<void>;
  skipToIndex(contextUri: string, index: number): Promise<void>;
  queue(uri: string): Promise<void>;
  // Ni aléatoire ni « répéter le titre » : la liste lancée depuis une carte se lit dans l'ordre.
  inOrder(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  disconnect(): void;
  onEvent(listener: (event: RemoteEvent) => void): () => void;
  // Nom du paquet de l'APK installé et empreinte SHA-1 de son certificat : à déclarer chez Spotify (Android packages).
  packageName(): string;
  fingerprint(): string;
};
