import { describe, expect, it } from 'vitest';
import worker from '../../relay/src/index';

describe('GET /dashboard', () => {
  it('sert la page HTML sans secret, avec une politique de contenu stricte', async () => {
    const response = await worker.fetch(new Request('https://relais.test/dashboard'), { STATS_TOKEN: 'secret-value' });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(html).not.toContain('secret-value');
    expect(html).toContain('/stats');
  });
  it('n’injecte jamais de données dans le HTML (textContent seulement)', async () => {
    const html = await (await worker.fetch(new Request('https://relais.test/dashboard'), {})).text();
    expect(html).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
  });
});
