import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DocumentaryPlayer } from '../../src/content/DocumentaryPlayer';
import { DocumentarySection } from '../../src/content/DocumentarySection';
import { setDocumentaryService } from '../../src/content/documentary-registry';
import type { DocCandidate } from '../../src/core/documentary/types';

const youtube: DocCandidate = { source: 'youtube', id: 'dQw4w9WgXcQ', title: 'Verdun', channel: 'ARTE', durationSec: 3120, language: 'fr', description: '', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };
const commons: DocCandidate = { source: 'commons', id: 'File:A.webm', title: 'A', channel: 'Auteur', durationSec: 100, language: null, description: '', url: 'https://commons.wikimedia.org/wiki/File%3AA.webm', mediaUrl: 'https://upload.wikimedia.org/A.webm', thumbUrl: 'https://thumb.test/a.jpg' };

describe('DocumentaryPlayer', () => {
  it('YouTube : miniature et bouton ▶, aucune iframe avant le clic', () => {
    const html = renderToString(<DocumentaryPlayer candidate={youtube} />);
    expect(html).toContain('Lire le documentaire');
    expect(html).toContain('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<video');
    expect(html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
  });
  it('Commons : aucune lecture avant le clic non plus', () => {
    const html = renderToString(<DocumentaryPlayer candidate={commons} />);
    expect(html).not.toContain('<video');
    expect(html).toContain('https://thumb.test/a.jpg');
  });
  it('une clé YouTube invalide ne donne rien', () => {
    expect(renderToString(<DocumentaryPlayer candidate={{ ...youtube, id: 'pas une clé !' }} />)).toBe('');
  });
});

describe('DocumentarySection', () => {
  it('ne montre rien tant que le service n’existe pas', () => {
    setDocumentaryService(null);
    expect(renderToString(<DocumentarySection slug="Bataille_de_Verdun" title="Bataille de Verdun" />)).toBe('');
  });
});
