import { Lock, RotateCcw, Trophy, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import CandidateMedia from '../components/CandidateMedia';
import Modal from '../components/Modal';
import { useSite } from '../context/AppContext';
import { api } from '../lib/api';
import { onceThisSession, savedGame, savedResult, visitorId } from '../lib/local';
import { availableRounds, currentPair, matchNumber, pick, progress, roundLabel, startGame, undo } from '../lib/tournament';
import type { GameState, Worldcup } from '../lib/types';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function RoundTransition({ size, initial }: { size: number; initial: boolean }) {
  const final = size === 2;
  return (
    <div className={'round-transition' + (final ? ' is-final' : '')} role="status" aria-live="assertive">
      <div className="round-streak streak-a" />
      <div className="round-streak streak-b" />
      <div className="round-announcement">
        {final ? <Trophy className="round-trophy" size={66} /> : <span className="round-spark">✦</span>}
        <span className="round-overline">{final ? 'THE FINAL' : initial ? 'READY TO PICK' : 'NEXT ROUND'}</span>
        <strong>{final ? '결승전' : `${size}강`}</strong>
        <p>{final ? '단 한 번의 선택, 당신의 최애는?' : initial ? '당신의 최애를 골라보세요!' : `${size}개의 후보만 남았습니다`}</p>
      </div>
    </div>
  );
}

function canResume(saved: GameState | null, cup: Worldcup): saved is GameState {
  if (!saved || saved.done || saved.cupId !== cup.id) return false;
  const ids = new Set(cup.candidates.map((c) => c.id));
  return [...saved.round, ...saved.next, ...saved.matches.flatMap((m) => [m.a, m.b])].every((id) => ids.has(id));
}

export default function Play() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { findBySlug, loading, refresh } = useSite();
  const cup = findBySlug(slug);
  const [game, setGame] = useState<GameState | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [transition, setTransition] = useState<{ size: number; initial: boolean } | null>(null);
  const [quitOpen, setQuitOpen] = useState(false);
  const [error, setError] = useState('');
  const [choosingSize, setChoosingSize] = useState(false);
  const [startSize, setStartSize] = useState(4);
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!cup) return;
    if (onceThisSession('view:' + cup.id)) void api.recordView(cup.id, visitorId()).catch(() => {});
    const fresh = (location.state as { fresh?: boolean } | null)?.fresh;
    const saved = savedGame.get();
    try {
      const size = (location.state as { size?: number } | null)?.size;
      if ((fresh || !canResume(saved, cup)) && !size) {
        setStartSize(availableRounds(cup.candidates.length).at(-1) ?? 4);
        setChoosingSize(true);
        return;
      }
      const g =
        !fresh && canResume(saved, cup)
          ? saved
          : startGame(
              cup.id,
              cup.candidates.map((c) => c.id),
              undefined,
              size,
            );
      setGame(g);
      savedGame.set(g);
      setTransition({ size: g.round.length, initial: g.matches.length === 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    if (fresh) navigate(location.pathname, { replace: true, state: {} });
  }, [cup?.id]);

  useEffect(() => {
    if (!transition) return;
    const t = window.setTimeout(() => setTransition(null), reducedMotion() ? 350 : transition.size === 2 ? 1350 : 950);
    return () => window.clearTimeout(t);
  }, [transition]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!cup) {
    return (
      <main className="wrap play-missing">
        <div className="empty">
          <h2>{loading ? '랭킹을 불러오는 중…' : '랭킹을 찾을 수 없어요.'}</h2>
          {!loading && (
            <Link className="secondary" to="/">
              다른 랭킹 둘러보기
            </Link>
          )}
        </div>
      </main>
    );
  }

  if (choosingSize)
    return (
      <main className="wrap loginpage">
        <section className="logincard">
          <h1>{cup.title}</h1>
          <label>
            몇 강부터 시작할까요?
            <select value={startSize} onChange={(e) => setStartSize(Number(e.target.value))}>
              {availableRounds(cup.candidates.length).map((n) => (
                <option key={n} value={n}>
                  {n}강
                </option>
              ))}
            </select>
          </label>
          <p>
            전체 {cup.candidates.length}명 중 {startSize}명이 무작위로 참여해요.
          </p>
          <button
            className="primary full"
            onClick={() => {
              const g = startGame(
                cup.id,
                cup.candidates.map((c) => c.id),
                undefined,
                startSize,
              );
              setGame(g);
              savedGame.set(g);
              setChoosingSize(false);
              setTransition({ size: startSize, initial: true });
              navigate(location.pathname, { replace: true, state: {} });
            }}
          >
            랭킹 시작하기
          </button>
          <Link to="/">돌아가기</Link>
        </section>
      </main>
    );
  if (error || !game) {
    return (
      <main className="wrap play-missing">
        <div className="empty">
          <h2>{error || '준비 중…'}</h2>
          <Link className="secondary" to="/">
            홈으로
          </Link>
        </div>
      </main>
    );
  }

  const choose = (id: string) => {
    if (busy.current || picked || transition) return;
    busy.current = true;
    setPicked(id);
    timer.current = window.setTimeout(
      () => {
        const next = pick(game, id);
        setPicked(null);
        busy.current = false;
        if (next.done && next.champion && next.runner) {
          savedResult.set({
            cupId: cup.id,
            matches: next.matches,
            champion: next.champion,
            runner: next.runner,
            finishedAt: new Date().toISOString(),
          });
          savedGame.set(null);
          void api
            .recordCompletion(cup.id, visitorId(), next.champion, next.runner)
            .then(() => refresh())
            .catch(() => {});
          navigate(`/r/${cup.slug}/result`, { replace: true });
          return;
        }
        setGame(next);
        savedGame.set(next);
        if (next.round.length !== game.round.length) setTransition({ size: next.round.length, initial: false });
      },
      reducedMotion() ? 80 : 320,
    );
  };

  const [a, b] = currentPair(game);
  const final = game.round.length === 2;
  const { current, total } = matchNumber(game);
  const pct = progress(game, !!picked);
  const byId = (id: string) => cup.candidates.find((c) => c.id === id);

  return (
    <>
      <main className={'play wrap' + (final ? ' final-round' : '')}>
        <div className="playtop">
          <button className="textbtn" disabled={!!picked} onClick={() => setQuitOpen(true)}>
            <X size={18} /> 그만하기
          </button>
          <span>나의 취향 찾기</span>
          <button
            className="textbtn"
            disabled={!game.history.length || !!picked || !!transition}
            onClick={() => {
              const g = undo(game);
              setGame(g);
              savedGame.set(g);
            }}
          >
            <RotateCcw size={17} /> 되돌리기
          </button>
        </div>
        <h1>{cup.title}</h1>
        <div className="roundtitle">
          <span>{roundLabel(game.round.length)}</span>{' '}
          <b>
            {current} <small>/ {total}</small>
          </b>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label={`${roundLabel(game.round.length)} 진행도`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div style={{ width: pct + '%' }} />
        </div>
        <p className="choosehint">더 마음이 가는 하나를 선택하세요.</p>
        <div className="arena" inert={transition ? true : undefined}>
          {[a, b].map((id, i) => (
            <Fragment key={id + '-' + game.matches.length}>
              {i === 1 && <b className="arena-vs">VS</b>}
              <button
                className={'fighter side' + i + (picked ? (picked === id ? ' picked' : ' faded') : '')}
                onClick={() => choose(id)}
                disabled={!!picked || !!transition}
                aria-label={`${byId(id)?.name ?? ''} 선택`}
              >
                <span className="fighterlabel">{i === 0 ? 'A' : 'B'}</span>
                <CandidateMedia candidate={byId(id)} />
              </button>
            </Fragment>
          ))}
        </div>
        <p className="playfoot">
          <Lock size={13} /> 로그인 없이 끝까지 즐길 수 있어요.
        </p>
      </main>

      {quitOpen && (
        <Modal onClose={() => setQuitOpen(false)} labelledBy="modal-title">
          <h2 id="modal-title">잠깐 쉬어갈까요?</h2>
          <p>
            진행 상황은 이 기기에 저장돼요.
            <br />
            홈에서 이어서 플레이할 수 있어요.
          </p>
          <button className="primary full" onClick={() => navigate('/')}>
            저장하고 나가기
          </button>
          <button className="textbtn full" onClick={() => setQuitOpen(false)}>
            계속 고르기
          </button>
        </Modal>
      )}

      {transition && <RoundTransition size={transition.size} initial={transition.initial} />}
    </>
  );
}
