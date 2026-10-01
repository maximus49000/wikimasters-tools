import { ACCOUNTS_URL } from './config';
import { SpotifyError } from './errors';

export type CryptoLike = {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  subtle: { digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer> };
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function randomString(length: number, crypto: CryptoLike = globalThis.crypto): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function challengeOf(verifier: string, crypto: CryptoLike = globalThis.crypto): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function buildAuthUrl(args: { clientId: string; redirectUri: string; state: string; challenge: string; scopes: string[] }): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    response_type: 'code',
    redirect_uri: args.redirectUri,
    state: args.state,
    scope: args.scopes.join(' '),
    code_challenge_method: 'S256',
    code_challenge: args.challenge,
  });
  return `${ACCOUNTS_URL}/authorize?${params.toString()}`;
}

// Le code de l'URL de retour ; un refus, un état différent ou une URL illisible annulent la liaison.
export function parseRedirect(url: string, expectedState: string): string {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    throw new SpotifyError('auth-cancelled', 'URL de retour illisible');
  }
  const code = params.get('code');
  if (params.get('error') || params.get('state') !== expectedState || !code) {
    throw new SpotifyError('auth-cancelled', params.get('error') ?? 'retour invalide');
  }
  return code;
}
