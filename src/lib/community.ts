/** 링크는 허용한 유튜브 주소만 정규화한다. 재생/제목 조회는 하지 않는다. */
export function youtubeId(input: string): string {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new Error('invalid_youtube_url');
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('invalid_youtube_url');
  let id: string | null = null;
  if (['youtu.be', 'www.youtu.be'].includes(u.hostname)) id = u.pathname.slice(1);
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname)) {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.slice(8);
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('invalid_youtube_url');
  return id;
}
export function validNickname(n: string) {
  return /^[가-힣A-Za-z0-9]{1,10}$/.test(n);
}
// 데모 전용. 운영의 주간 제한/시각은 Postgres tv_week()에서 결정한다.
export function demoWeek(now = Date.now()): string {
  const d = new Date(now);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
