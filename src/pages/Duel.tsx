import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Play, BarChart3, Share2 } from 'lucide-react';
import { visitorId } from '../lib/local';
import { shareLink } from '../lib/share';
import { useUi } from '../context/AppContext';
import LoginPrompt from '../components/LoginPrompt';
import { useAuth } from '../context/AppContext';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import type { Duel as DuelType, DuelResult, DuelComment } from '../lib/types';
export default function Duel() {
  const { id } = useParams();
  useEffect(()=>{if(id)void api.recordDuelView(id,visitorId()).catch(()=>{});},[id]);
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<DuelComment[]>([]),
    [body, setBody] = useState('');
  const [duel, setDuel] = useState<DuelType | null>(null),
    [result, setResult] = useState<DuelResult | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setDuel(null);
    setResult(null);
    setError('');
    api
      .listDuels()
      .then((rows) => {
        if (alive) {
          setDuel(rows.find((x) => x.id === id) ?? null);
          if (!rows.some((x) => x.id === id)) setError('주제를 찾을 수 없어요.');
        }
      })
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [id]);
  useEffect(() => {
    let alive = true;
    setResult(null);
    if (user && id)
      api
        .duelResult(id)
        .then((r) => alive && setResult(r))
        .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [user, id]);
  useEffect(() => {
    let alive = true;
    setComments([]);
    if (id && result?.choice)
      api
        .getDuelComments(id)
        .then((rows) => alive && setComments(rows))
        .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [id, result?.choice]);
  const addComment = async () => {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      await api.addDuelComment(id, body);
      setBody('');
      setComments(await api.getDuelComments(id));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const vote = async (choice: 'A' | 'B') => {
    if (!id) return;
    if (result?.choice && result.choice !== choice && !confirm('선택을 바꾸면 기존 댓글이 삭제됩니다. 바꿀까요?')) return;
    setBusy(true);
    setError('');
    try {
      setResult(await api.voteDuel(id, choice));
      setComments(await api.getDuelComments(id));
      setBody('');
    } catch (e) {
      setError(friendlyError(e));
      try {
        setResult(await api.duelResult(id));
      } catch {
        /* 첫 오류 유지 */
      }
    } finally {
      setBusy(false);
    }
  };
  const percent = result?.total ? Math.round(((result.a ?? 0) / result.total) * 100) : 0;
  return (
    <main className="wrap duel-page">
      <Link to="/">← 랭킹전</Link>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {duel && (
        <>
          <section className="duel-results" aria-label="의견이 어떻게 갈리는지" aria-live="polite">
            <h2>의견이 어떻게 갈리는지</h2>
            {result?.choice ? (
              <>
                <div className="duel-bar">
                  <span style={{ width: `${percent}%` }} />
                  <span style={{ width: `${100 - percent}%` }} />
                </div>
                <div className="duel-totals">
                  <span>
                    A · {percent}% · {result.a}표
                  </span>
                  <span>
                    B · {100 - percent}% · {result.b}표
                  </span>
                </div>
                <p>총 참여 인원 {result.total}명</p>
              </>
            ) : (
              <p className="locked-results">투표하면 결과를 볼 수 있어요</p>
            )}
          </section>
          <h1>{duel.question}</h1>
          {duel.status === 'archived' && <p>종료된 양자택일이에요.</p>}
          {!user && <LoginPrompt message="로그인하고 나의 선택을 남겨주세요." />}
          <div className="duel-options">
            {(['A', 'B'] as const).map((choice) => (
              <section className="duel-choice-column" key={choice}>
                <button
                  className={'secondary ' + (result?.choice === choice ? 'chosen' : '')}
                  disabled={!user || !!profile?.blocked || busy || result?.choice === choice || duel.status !== 'published'}
                  onClick={() => void vote(choice)}
                >
                  <b>
                    {choice}. {choice === 'A' ? duel.option_a : duel.option_b}
                  </b>
                  <span>{choice === 'A' ? duel.description_a : duel.description_b}</span>
                  {result?.choice === choice && <strong>✓ 내 선택</strong>}
                </button>
                <div className="duel-choice-comments">
                  <h3>{choice} 선택의 이유</h3>
                  {!result?.choice ? (
                    <p className="muted">투표하면 선택별 의견을 볼 수 있어요.</p>
                  ) : (
                    <>
                      <ul className="commentlist">
                        {comments
                          .filter((c) => c.choice === choice)
                          .map((c) => (
                            <li key={c.id}>
                              <p><strong>{c.nickname}</strong> {c.body}{c.is_mine && <small> · 내 댓글</small>}</p>
                            </li>
                          ))}
                      </ul>
                      {!comments.some((c) => c.choice === choice) && <p className="muted">아직 의견이 없어요.</p>}
                      {result.choice === choice && !comments.some((c) => c.is_mine) && duel.status === 'published' ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void addComment();
                          }}
                        >
                          <textarea
                            aria-label={`${choice} 선택 이유`}
                            maxLength={150}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="이쪽을 선택한 이유를 남겨주세요."
                          />
                          <small>{body.length}/150 · 계정당 한 번</small>
                          <button className="primary" disabled={busy || !body.trim() || !!profile?.blocked}>
                            댓글 등록
                          </button>
                        </form>
                      ) : (
                        <p className="muted">
                          {result.choice === choice
                            ? duel.status === 'published'
                              ? '이 주제에 남긴 내 의견이에요.'
                              : '종료된 주제예요.'
                            : '이쪽 의견은 읽기만 할 수 있어요.'}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </section>
            ))}
          </div>
          <small>선택은 바꿀 수 있어요. 선택을 바꾸면 기존 댓글은 삭제돼요.</small>
        </>
      )}
    </main>
  );
}
export function DuelCards({ query, onCount }: { query: string; onCount: (n: number) => void }) {
  const { toast } = useUi();
  const [rows, setRows] = useState<DuelType[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    api
      .listDuels()
      .then(setRows)
      .catch((e) => setError(friendlyError(e)));
  }, []);
  const list = rows
    .filter((d) => `${d.question} ${d.option_a} ${d.option_b}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived') || b.created_at.localeCompare(a.created_at));
  useEffect(() => {
    onCount(list.length);
  }, [list.length, onCount]);
  return (
    <>
      {error && <p className="error">{error}</p>}
      {list.map((d) => (
        <article className="card duel-home-card" key={d.id}>
          <Link to={`/duels/${d.id}`} className="cardmain">
            <div className="thumbnail duel-thumbnail">
              <span className="roundbadge">양자택일</span>
              {d.thumbnail_url ? <img className="ranking-thumb-image" src={d.thumbnail_url} alt="" /> : <div className="duel-card-options">
                <span>{d.option_a}</span>
                <b>VS</b>
                <span>{d.option_b}</span>
              </div>}
            </div>
            <div className="cardcopy">
              <h3>{d.question}</h3>
              <p>{d.status === 'published' ? '진행 중인 양자택일' : '지난 양자택일'}</p>
            </div>
          </Link>
          <div className="cardbottom ranking-card-actions">
            <Link to={`/duels/${d.id}`}><Play size={14}/>시작</Link>
            <Link to={`/duels/${d.id}`}><BarChart3 size={14}/>결과</Link>
            <button onClick={async()=>{const url=`${location.origin}/duels/${d.id}`;const r=await shareLink(d.question,url);if(r==='copied')toast('링크를 복사했어요.');if(r==='failed')toast(url);}}><Share2 size={14}/>공유</button>
          </div>
        </article>
      ))}
    </>
  );
}
