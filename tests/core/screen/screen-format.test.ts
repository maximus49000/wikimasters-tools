import { describe, expect, it } from 'vitest';
import { embedUrl, formatRating, formatVotes, posterUrl, thumbnailUrl, watchUrl } from '../../../src/core/screen/screen-format';

describe('screen-format', () => {
  it('construit les adresses YouTube sans cookies et la miniature', () => {
    expect(embedUrl('abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123?autoplay=1&rel=0');
    expect(thumbnailUrl('abc123')).toBe('https://img.youtube.com/vi/abc123/hqdefault.jpg');
    expect(watchUrl('abc123')).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it("n'accepte que des caractères de clé YouTube", () => {
    expect(embedUrl('a b/c')).toBeNull();
    expect(watchUrl('<x>')).toBeNull();
    expect(thumbnailUrl('../x')).toBeNull();
  });

  it('formate la note avec une virgule et les votes avec des espaces', () => {
    expect(formatRating(7.8)).toBe('7,8');
    expect(formatRating(8)).toBe('8,0');
    expect(formatVotes(12450)).toBe('12 450');
    expect(formatVotes(37)).toBe('37');
  });

  it("construit l'adresse d'une affiche", () => {
    expect(posterUrl('/d.jpg')).toBe('https://image.tmdb.org/t/p/w92/d.jpg');
    expect(posterUrl(undefined)).toBeNull();
  });
});
