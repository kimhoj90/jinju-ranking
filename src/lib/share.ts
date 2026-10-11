export function rankingUrl(slug: string): string {
  return `${location.origin}/r/${encodeURIComponent(slug)}`;
}

/** 공유 시트가 있으면 열고, 없으면 주소를 복사한다. 결과 문구를 돌려준다. */
export async function shareLink(title: string, url: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}
