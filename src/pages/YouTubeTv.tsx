import { useCallback, useEffect, useState, type FormEvent } from 'react';
import LoginPrompt from '../components/LoginPrompt';
import { useAuth } from '../context/AppContext';
import { api } from '../lib/api';
import { youtubeId } from '../lib/community';
import { friendlyError } from '../lib/errors';
import type { TvEligibility, TvItem, TvPage } from '../lib/types';
function Tv({ item, onReport }: { item?: TvItem; onReport: (id: number) => Promise<void> }) {
  const [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const off = !item || item.off || failed;
  return (
    <article className={'tv-set' + (off ? ' tv-off' : '')}>
      <div className="tv-screen">
        {off ? (
          <div className={item ? 'tv-static' : 'tv-blank'}>
            <span>{item ? '화면을 볼 수 없어요' : 'OFF AIR'}</span>
          </div>
        ) : (
          <a
            href={`https://www.youtube.com/watch?v=${item.video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${item.nickname}님 추천 영상, 유튜브 새 탭에서 열기`}
          >
            <img
              src={`https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`}
              alt={`${item.nickname}님의 추천 영상`}
              loading="lazy"
              onError={() => setFailed(true)}
              onLoad={(e) => {
                if (e.currentTarget.naturalWidth < 200) setFailed(true);
              }}
            />
          </a>
        )}
      </div>
      <div className="tv-controls">
        <span className="tv-nickname">{item && !off ? item.nickname : 'JINJU TV'}</span>
        <i aria-hidden="true" />
        {item && !off && (
          <button
            disabled={busy}
            aria-label="추천 영상 신고"
            onClick={async () => {
              if (!user) {
                await onReport(item.id);
                return;
              }
              if (!confirm('이 영상을 신고할까요?')) return;
              setBusy(true);
              try {
                await onReport(item.id);
              } finally {
                setBusy(false);
              }
            }}
          >
            신고
          </button>
        )}
      </div>
    </article>
  );
}
export default function YouTubeTv() {
  const { user, profile } = useAuth();
  const [page, setPage] = useState<TvPage | null>(null),
    [eligibility, setEligibility] = useState<TvEligibility | null>(null),
    [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const load = useCallback(async (n?: number) => {
    try {
      setPage(await api.tvPage(n));
      setError('');
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const refreshEligibility = useCallback(async () => {
    setEligibility(null);
    if (user)
      try {
        setEligibility(await api.tvEligibility());
      } catch (e) {
        setError(friendlyError(e));
      }
  }, [user]);
  useEffect(() => {
    void refreshEligibility();
  }, [refreshEligibility]);
  // 복귀하거나 갱신 시각에 도달하면 서버에서 자격을 다시 확인한다.
  useEffect(() => {
    const onFocus = () => void refreshEligibility();
    window.addEventListener('focus', onFocus);
    const delay = eligibility ? Math.max(1000, Date.parse(eligibility.next_reset) - Date.now() + 1000) : 0;
    const timer = delay ? window.setTimeout(onFocus, Math.min(delay, 2147483647)) : undefined;
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearTimeout(timer);
    };
  }, [eligibility, refreshEligibility]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      youtubeId(url);
      await api.recommendVideo(url);
      setUrl('');
      await load();
      await refreshEligibility();
      setNotice('추천 영상이 TV에 올라갔어요.');
    } catch (e) {
      setError(friendlyError(e));
      if (user)
        try {
          setEligibility(await api.tvEligibility());
        } catch {
          /* 원래 오류 유지 */
        }
    } finally {
      setBusy(false);
    }
  };
  const report = async (id: number) => {
    if (!user) {
      setError('신고하려면 먼저 로그인해주세요.');
      return;
    }
    try {
      await api.reportVideo(id);
      await load(page?.page);
      setNotice('신고를 접수했어요.');
    } catch (e) {
      setError(friendlyError(e));
    }
  };
  return (
    <main className="tv-page">
      <div className="wrap">
        <header className="tv-heading">
          <span>JINJU PEOPLE’S CHANNELS</span>
          <h1>요즘 유튜브 뭐봄</h1>
          <p>이번 주, 당신이 보고 있는 한 편.</p>
        </header>
        <section className="tv-submit">
          {!user ? (
            <LoginPrompt message="로그인하면 일주일에 영상 하나를 추천할 수 있어요." next="/tv" />
          ) : (
            <form onSubmit={submit}>
              <label htmlFor="youtube-url">추천할 유튜브 링크</label>
              <div>
                <input
                  id="youtube-url"
                  type="url"
                  placeholder="https://youtu.be/…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={!eligibility?.can_recommend || !!profile?.blocked || busy}
                  required
                />
                <button className="primary" disabled={!eligibility?.can_recommend || !!profile?.blocked || busy}>
                  {busy ? '추천 중…' : '추천'}
                </button>
              </div>
              {eligibility && !eligibility.can_recommend && (
                <p>
                  이번 주 추천을 마쳤어요. 다음 갱신:{' '}
                  {new Date(eligibility.next_reset).toLocaleString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                  })}{' '}
                  (한국 시간)
                </p>
              )}
            </form>
          )}
          <small>부적절한 영상은 운영자가 숨길 수 있어요.</small>
        </section>
        {error && (
          <p className="tv-message" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="tv-message" role="status">
            {notice}
          </p>
        )}
        <section className="tv-wall" aria-label="추천 영상 TV 12대">
          {Array.from({ length: 12 }, (_, i) => (
            <Tv key={page?.items[i]?.id ?? `empty-${page?.page}-${i}`} item={page?.items[i]} onReport={report} />
          ))}
        </section>
        {page && (
          <nav className="tv-pagination" aria-label="TV 페이지">
            <button disabled={page.page <= 1} onClick={() => void load(page.page - 1)}>
              이전
            </button>
            {Array.from({ length: page.pages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === page.pages || Math.abs(n - page.page) <= 2)
              .map((n, i, arr) => (
                <span key={n}>
                  {i > 0 && n - arr[i - 1] > 1 && <span>…</span>}
                  <button aria-current={n === page.page ? 'page' : undefined} onClick={() => void load(n)}>
                    {n}
                  </button>
                </span>
              ))}
            <button disabled={page.page >= page.pages} onClick={() => void load(page.page + 1)}>
              다음
            </button>
          </nav>
        )}
      </div>
    </main>
  );
}
