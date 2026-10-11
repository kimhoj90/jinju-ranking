import { ArrowLeft, Check, Flag, MessageCircle, RotateCcw, Share2, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CandidateMedia from '../components/CandidateMedia';
import LoginPrompt, { loginPath } from '../components/LoginPrompt';
import Modal from '../components/Modal';
import TrophyJ from '../components/TrophyJ';
import { useAuth, useSite, useUi } from '../context/AppContext';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { timeAgo } from '../lib/format';
import { handledResult, savedResult } from '../lib/local';
import { COMMENT_MAX, FEEDBACK_MAX } from '../lib/validate';
import type { CommentItem, FinishedResult, Worldcup } from '../lib/types';
import { useShare } from './Home';

type BallotView =
  | { kind: 'guest' }
  | { kind: 'checking' }
  | { kind: 'ask' }
  | { kind: 'saving' }
  | { kind: 'done'; outcome: 'created' | 'replaced' | 'kept' }
  | { kind: 'error'; message: string };

/** 결과를 순위에 반영하는 부분: 처음이면 바로 반영, 이미 반영한 결과가 있으면 교체 여부를 묻는다 */
function BallotPanel({ cup, result }: { cup: Worldcup; result: FinishedResult }) {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<BallotView>({ kind: 'checking' });

  const submit = useCallback(
    async (replace: boolean) => {
      setView({ kind: 'saving' });
      try {
        const status = await api.submitBallot(cup.id, result.matches, replace);
        if (status === 'exists') {
          setView({ kind: 'ask' });
          return;
        }
        handledResult.set(cup.id, result.finishedAt, status);
        setView({ kind: 'done', outcome: status });
      } catch (e) {
        setView({ kind: 'error', message: friendlyError(e) });
      }
    },
    [cup.id, result],
  );

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setView({ kind: 'guest' });
      return;
    }
    const handled = handledResult.get(cup.id);
    if (handled?.finishedAt === result.finishedAt) {
      setView({ kind: 'done', outcome: handled.outcome as 'created' | 'replaced' | 'kept' });
      return;
    }
    let alive = true;
    setView({ kind: 'checking' });
    api
      .getMyBallot(cup.id)
      .then((ballot) => {
        if (!alive) return;
        if (ballot) setView({ kind: 'ask' });
        else void submit(false);
      })
      .catch((e) => alive && setView({ kind: 'error', message: friendlyError(e) }));
    return () => {
      alive = false;
    };
  }, [ready, user, cup.id, result.finishedAt, submit]);

  const rankingLink = `/r/${cup.slug}/ranking`;

  if (view.kind === 'guest') {
    return (
      <div className="ballotpanel">
        <p className="resultnote">나의 취향을 찾았네요! 로그인하면 이 결과가 전체 순위에 반영돼요.</p>
        <button className="primary" onClick={() => navigate(loginPath(`/r/${cup.slug}/result`))}>
          <Trophy size={18} /> 로그인하고 전체 순위 보기
        </button>
        <p className="muted">로그인해도 처음부터 다시 하지 않아요. 지금 결과가 그대로 반영돼요.</p>
      </div>
    );
  }
  if (view.kind === 'checking' || view.kind === 'saving') {
    return (
      <div className="ballotpanel">
        <p className="resultnote">{view.kind === 'saving' ? '순위에 반영하는 중…' : '반영 기록을 확인하는 중…'}</p>
      </div>
    );
  }
  if (view.kind === 'ask') {
    return (
      <div className="ballotpanel askbox">
        <b>이번 결과를 기록에 반영할까요?</b>
        <p className="muted">이 랭킹에 이미 반영한 결과가 있어요. 예를 고르면 이전 결과가 이번 결과로 바뀌고, 표는 계속 1개예요.</p>
        <div className="askactions">
          <button className="secondary" onClick={() => {
            handledResult.set(cup.id, result.finishedAt, 'kept');
            setView({ kind: 'done', outcome: 'kept' });
          }}>
            아니오
          </button>
          <button className="primary" onClick={() => void submit(true)}>
            예, 반영할게요
          </button>
        </div>
      </div>
    );
  }
  if (view.kind === 'error') {
    return (
      <div className="ballotpanel">
        <p className="error" role="alert">{view.message}</p>
        <button className="secondary" onClick={() => void submit(false)}>
          다시 시도
        </button>
      </div>
    );
  }
  const message =
    view.outcome === 'created'
      ? '순위에 반영됐어요!'
      : view.outcome === 'replaced'
        ? '이번 결과로 바꿔서 반영했어요.'
        : '이전에 반영한 결과를 그대로 유지했어요.';
  return (
    <div className="ballotpanel">
      <p className="success" role="status">
        <Check size={17} /> {message}
      </p>
      <Link className="primary" to={rankingLink}>
        <Trophy size={18} /> 전체 순위 보기
      </Link>
    </div>
  );
}

function FeedbackModal({ cup, onClose }: { cup: Worldcup; onClose: () => void }) {
  const { user } = useAuth();
  const [type, setType] = useState<'suggest' | 'objection'>('suggest');
  const [candidateId, setCandidateId] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) {
      setError('내용을 입력해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.sendFeedback({ worldcupId: cup.id, type, body, candidateId: type === 'objection' ? candidateId || null : null });
      setSent(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="modal-title">
      <span className="eyebrow">FEEDBACK</span>
      <h2 id="modal-title">의견 보내기</h2>
      {!user ? (
        <LoginPrompt message="의견 보내기는 로그인 후 이용할 수 있어요." />
      ) : sent ? (
        <>
          <div className="loginicon">
            <Check size={26} />
          </div>
          <p>의견이 전달됐어요. 소중한 의견 고마워요!</p>
          <button className="primary full" onClick={onClose}>
            닫기
          </button>
        </>
      ) : (
        <form className="contactform" onSubmit={send}>
          <div className="segmented" role="radiogroup" aria-label="의견 종류">
            <button type="button" role="radio" aria-checked={type === 'suggest'} className={type === 'suggest' ? 'active' : ''} onClick={() => setType('suggest')}>
              후보 추천
            </button>
            <button type="button" role="radio" aria-checked={type === 'objection'} className={type === 'objection' ? 'active' : ''} onClick={() => setType('objection')}>
              이의 제기
            </button>
          </div>
          {type === 'objection' && (
            <label>
              대상 후보 <span className="muted">선택</span>
              <select value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
                <option value="">후보를 고르지 않음</option>
                {cup.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            내용
            <textarea
              rows={5}
              maxLength={FEEDBACK_MAX}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={type === 'suggest' ? '새로 들어갔으면 하는 후보와 이유를 적어주세요.' : '후보 정보가 틀렸거나 잘못된 후보가 있다면 알려주세요.'}
            />
            <small className="counter">
              {body.length}/{FEEDBACK_MAX}
            </small>
          </label>
          <p className="notice">이름이나 연락처 같은 개인정보는 적지 마세요. 보낸 의견은 본인과 운영자만 볼 수 있어요.</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? '보내는 중…' : '보내기'}
          </button>
        </form>
      )}
    </Modal>
  );
}

function Comments({ cup, onFeedback }: { cup: Worldcup; onFeedback: () => void }) {
  const { user } = useAuth();
  const { toast } = useUi();
  const [items, setItems] = useState<CommentItem[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await api.listComments(cup.id));
      setError('');
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [cup.id]);

  useEffect(() => {
    if (user) void load();
    else setItems(null);
  }, [user, load]);

  const mine = items?.find((c) => c.is_mine);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.addComment(cup.id, body);
      setBody('');
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('내 댓글을 삭제할까요? 삭제하면 새로 쓸 수 있어요.')) return;
    setBusy(true);
    try {
      await api.deleteComment(id);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const report = async (id: string) => {
    if (!confirm('이 댓글을 운영자에게 신고할까요?')) return;
    try {
      await api.sendFeedback({ worldcupId: cup.id, type: 'report', body: '', commentId: id });
      toast('신고가 접수됐어요. 운영자가 확인할게요.');
    } catch (err) {
      toast(friendlyError(err));
    }
  };

  return (
    <section className="community result-comments">
      <div className="community-head">
        <h3>
          <MessageCircle size={20} /> 참여자들의 이야기 {items && items.length > 0 && <span>{items.length}</span>}
        </h3>
        <button className="textbtn" onClick={onFeedback}>
          <Flag size={15} /> 의견 보내기
        </button>
      </div>
      {!user ? (
        <LoginPrompt message="댓글과 의견 보내기는 로그인 후 이용할 수 있어요." />
      ) : (
        <div className="community-body">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {mine ? (
            <p className="muted mycomment-note">이 랭킹에는 댓글을 1개만 남길 수 있어요. 지우면 다시 쓸 수 있어요.</p>
          ) : (
            <form className="commentform" onSubmit={add}>
              <textarea
                rows={3}
                maxLength={COMMENT_MAX}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="이 랭킹에 대한 생각을 남겨주세요. 이름·연락처 같은 개인정보는 적지 마세요."
                aria-label="댓글 내용"
              />
              <div>
                <small className="counter">
                  {body.length}/{COMMENT_MAX}
                </small>
                <button className="primary" disabled={busy || !body.trim()}>
                  등록
                </button>
              </div>
            </form>
          )}
          {items === null ? (
            <p className="muted">댓글을 불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className="muted emptycomments">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>
          ) : (
            <ul className="commentlist">
              {items.map((c) => (
                <li key={c.id} className={c.is_mine ? 'mine' : ''}>
                  <p>{c.body}</p>
                  <div className="commentmeta">
                    <span>익명</span>
                    <time dateTime={c.created_at}>{timeAgo(c.created_at)}</time>
                    {c.is_mine && <b className="minetag">내 댓글</b>}
                    {c.hidden && <b className="hiddentag">운영자가 숨긴 댓글</b>}
                    {c.is_mine ? (
                      <button className="textbtn" disabled={busy} onClick={() => void remove(c.id)}>
                        삭제
                      </button>
                    ) : (
                      <button className="textbtn" onClick={() => void report(c.id)}>
                        신고
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default function Result() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { findBySlug, loading } = useSite();
  const share = useShare();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const cup = findBySlug(slug);
  // 매 렌더마다 새 객체가 되지 않도록 고정한다 (반영 요청이 반복되지 않게)
  const result = useMemo(() => (cup ? savedResult.get(cup.id) : null), [cup?.id]);

  if (!cup) {
    return (
      <main className="wrap result">
        <div className="empty">
          <h2>{loading ? '불러오는 중…' : '랭킹을 찾을 수 없어요.'}</h2>
          {!loading && (
            <Link className="secondary" to="/">
              다른 랭킹 둘러보기
            </Link>
          )}
        </div>
      </main>
    );
  }

  const champion = result && cup.candidates.find((c) => c.id === result.champion);
  const runner = result && cup.candidates.find((c) => c.id === result.runner);

  if (!result || !champion) {
    return (
      <main className="wrap result">
        <div className="empty">
          <h2>아직 이 랭킹을 끝까지 플레이하지 않았어요.</h2>
          <p>{cup.title}</p>
          <button className="primary" onClick={() => navigate(`/r/${cup.slug}/play`, { state: { fresh: true } })}>
            지금 플레이하기
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap result">
      <span className="eyebrow">YOUR NUMBER ONE</span>
      <div className="champion-icon">
        <TrophyJ size={74} />
      </div>
      <h1 className="result-title">
        <span>{cup.title}</span> 1위는!
      </h1>
      <div className="result-layout">
        <div className="result-winner">
          <div className="winnercard">
            <div className="winner-photo">
              <CandidateMedia candidate={champion} />
            </div>
            {runner && <div className="runnerup">2위 · {runner.name}</div>}
          </div>
          <BallotPanel cup={cup} result={result} />
          <div className="resultactions">
            <button className="secondary" onClick={() => navigate(`/r/${cup.slug}/play`, { state: { fresh: true } })}>
              <RotateCcw size={16} /> 다시 고르기
            </button>
            <button className="secondary" onClick={() => void share(cup)}>
              <Share2 size={16} /> 랭킹 공유
            </button>
          </div>
        </div>
        <Comments cup={cup} onFeedback={() => setFeedbackOpen(true)} />
      </div>
      <Link className="textbtn backlink" to="/">
        <ArrowLeft size={16} /> 다른 랭킹 둘러보기
      </Link>
      {feedbackOpen && <FeedbackModal cup={cup} onClose={() => setFeedbackOpen(false)} />}
    </main>
  );
}
