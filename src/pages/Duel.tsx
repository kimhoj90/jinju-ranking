import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import LoginPrompt from '../components/LoginPrompt';
import { useAuth } from '../context/AppContext';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import type { Duel as DuelType, DuelResult } from '../lib/types';
export default function Duel() {
  const { id } = useParams();
  const { user, profile } = useAuth();
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
  const vote = async (choice: 'A' | 'B') => {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      setResult(await api.voteDuel(id, choice));
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
              <button
                key={choice}
                className={'secondary ' + (result?.choice === choice ? 'chosen' : '')}
                disabled={!user || !!profile?.blocked || busy || !!result?.choice || duel.status !== 'published'}
                onClick={() => void vote(choice)}
              >
                <b>
                  {choice}. {choice === 'A' ? duel.option_a : duel.option_b}
                </b>
                <span>{choice === 'A' ? duel.description_a : duel.description_b}</span>
                {result?.choice === choice && <strong>✓ 내 선택</strong>}
              </button>
            ))}
          </div>
          <small>한 주제에 한 번만 투표할 수 있고, 선택은 바꿀 수 없어요.</small>
        </>
      )}
    </main>
  );
}
export function DuelCards({ query, onCount }: { query: string; onCount: (n: number) => void }) {
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
        <Link key={d.id} to={`/duels/${d.id}`} className="duel-card">
          <span className="eyebrow">양자택일 · {d.status === 'published' ? '진행 중' : '지난 주제'}</span>
          <h3>{d.question}</h3>
          <div>
            <span>{d.option_a}</span>
            <b>VS</b>
            <span>{d.option_b}</span>
          </div>
          <small>나의 선택 남기기 →</small>
        </Link>
      ))}
    </>
  );
}
