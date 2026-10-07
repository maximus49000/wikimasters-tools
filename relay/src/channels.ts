// relay/src/channels.ts
export type ChannelDef = { id: string; name: string; language: string };

// Chaînes d'histoire et de service public dont on indexe les vidéos (identifiants vérifiés sur youtube.com le 2026-10-07).
export const CHANNELS: ChannelDef[] = [
  { id: 'UCHGMBrXUzClgjEzBMei-Jdw', name: 'ARTE', language: 'fr' },
  { id: 'UCNBD4uZG6nWH2MMdgGESisw', name: 'INA Officiel', language: 'fr' },
  { id: 'UCN4yRCI5-4gCJOiwdz96dFw', name: 'Nota Bene', language: 'fr' },
  { id: 'UCB9Ryofh48sG51db-Y7kY6g', name: 'Lumni', language: 'fr' },
  { id: 'UCojuxfxE_XvL1DgNdcHF7Jg', name: 'Hérodote', language: 'fr' },
];

// La liste de toutes les vidéos d'une chaîne : même identifiant, préfixe « UU » au lieu de « UC ».
export const uploadsPlaylist = (channelId: string): string => `UU${channelId.slice(2)}`;
