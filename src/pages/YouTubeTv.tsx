import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ThumbsUp, ThumbsDown, Siren } from 'lucide-react';
import Modal from '../components/Modal';
import LoginPrompt from '../components/LoginPrompt';
import { useAuth } from '../context/AppContext';
import { api } from '../lib/api';
import { youtubeId } from '../lib/community';
import { friendlyError } from '../lib/errors';
import type { TvEligibility, TvItem, TvPage } from '../lib/types';
function Tv({ item, onReport, onReact }: { item?: TvItem; onReport: (id: number) => Promise<void>; onReact: (id:number,reaction:'like'|'dislike'|null)=>Promise<void> }) {
  const [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  const [title,setTitle] = useState('');
  const [titleRequested,setTitleRequested] = useState(false);
  const loadTitle = async () => {if(titleRequested || !item?.video_id)return;setTitleRequested(true);try{const response=await fetch(`/api/youtube-title?id=${encodeURIComponent(item.video_id)}`);if(response.ok){const data=await response.json();if(typeof data.title==='string')setTitle(data.title);}}catch{/* 링크는 계속 사용 가능 */}};
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
            title={title || '유튜브에서 영상 보기'}
            onMouseEnter={()=>void loadTitle()} onFocus={()=>void loadTitle()}
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
            {title && <span className="tv-video-title">{title}</span>}
          </a>
        )}
      </div>
      <div className="tv-controls">
        <i aria-hidden="true" />
        <span className="tv-nickname" title={item && !off ? item.nickname : 'JINJU TV'}>{item && !off ? item.nickname : 'JINJU TV'}</span>
        {item && !off && <div className="tv-reactions">
          {(['like','dislike'] as const).map(kind=><button key={kind} disabled={busy} aria-label={kind==='like'?'좋아요':'싫어요'} aria-pressed={item.reaction===kind} onClick={async()=>{setBusy(true);try{await onReact(item.id,item.reaction===kind?null:kind);}finally{setBusy(false);}}}>
            {kind==='like'?<ThumbsUp size={14}/>:<ThumbsDown size={14}/>}<span>{kind==='like'?(item.likes??0):(item.dislikes??0)}</span>
          </button>)}
        </div>}
        {item && !off && (
          <button
            disabled={busy}
            className="tv-report"
            aria-label="추천 영상 신고"
            title="신고"
            onClick={async () => {
              if (!user) {
                await onReport(item.id);
                return;
              }
              setBusy(true);
              try {
                await onReport(item.id);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Siren size={14} aria-hidden="true" /><span>신고</span>
          </button>
        )}
      </div>
    </article>
  );
}
export default function YouTubeTv() {
  const [reportComplete,setReportComplete] = useState(false);
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
  }, [load, user]);
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
  const react = async(id:number,reaction:'like'|'dislike'|null)=>{if(!user){setError('좋아요·싫어요는 로그인 후 사용할 수 있어요.');return;}try{await api.reactVideo(id,reaction);await load(page?.page);}catch(e){setError(friendlyError(e));}};
  const report = async (id: number) => {
    if (!user) {
      setError('신고하려면 먼저 로그인해주세요.');
      return;
    }
    try {
      await api.reportVideo(id);
      await load(page?.page);
      setReportComplete(true);
    } catch (e) {
      setError(friendlyError(e));
    }
  };
  return (
    <main className="tv-page">
      {reportComplete && <Modal onClose={()=>setReportComplete(false)} label="신고 접수 완료"><p>신고가 정상적으로 접수되었습니다. 검토 후 조치하겠습니다.</p><button className="primary full" onClick={()=>setReportComplete(false)}>확인</button></Modal>}
      <div className="wrap">
        <header className="tv-heading">
          <h1>요즘 유튭 뭐 봄?</h1>
          <p>이번 주 당신이 재밌게 본 한 편</p>
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
            <Tv key={page?.items[i]?.id ?? `empty-${page?.page}-${i}`} item={page?.items[i]} onReport={report} onReact={react} />
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
