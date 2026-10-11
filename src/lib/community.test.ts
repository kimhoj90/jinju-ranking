import { describe, it, expect } from 'vitest';
import { youtubeId, validNickname, demoWeek } from './community';
describe('YouTube link validation', () => {
  const id = 'dQw4w9WgXcQ';
  it.each([`https://youtu.be/${id}`, `https://youtube.com/watch?v=${id}&t=30`, `https://www.youtube.com/shorts/${id}?si=hello`])(
    'accepts %s',
    (url) => expect(youtubeId(url)).toBe(id),
  );
  it.each([
    'javascript:alert(1)',
    `https://youtube.com.evil.com/watch?v=${id}`,
    `https://evil.com/shorts/${id}`,
    `https://youtube.com/embed/${id}`,
    `https://user@youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}/extra`,
  ])('rejects %s', (url) => expect(() => youtubeId(url)).toThrow('invalid_youtube_url'));
});
it('nickname characters and length', () => {
  for (const n of ['진주사람', 'Jinju123', '1234567890']) expect(validNickname(n)).toBe(true);
  for (const n of ['', '닉 네임', '12345678901', '😃', 'admin!']) expect(validNickname(n)).toBe(false);
});
it('demo week follows Monday 9am Korea', () => {
  expect(demoWeek(Date.parse('2026-10-12T08:59:59+09:00'))).toBe('2026-10-05T00:00:00.000Z');
  expect(demoWeek(Date.parse('2026-10-12T09:00:00+09:00'))).toBe('2026-10-12T00:00:00.000Z');
});
