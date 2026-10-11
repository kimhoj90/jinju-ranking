import { ArrowLeft, ArrowUpRight, Check, ClipboardList, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import LoginPrompt, { loginPath } from '../components/LoginPrompt';
import { useAuth } from '../context/AppContext';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { addDays, kstToday } from '../lib/format';
import type { Survey, SurveyInput } from '../lib/types';

const isExpired = (s: Pick<Survey, 'expires_on'>, today: string) => s.expires_on < today;
const isScheduled = (s: Pick<Survey, 'publish_on'>, today: string) => s.publish_on > today;

function useSurveys() {
  const [items, setItems] = useState<Survey[] | null>(null);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const load = async () => {
    try {
      setItems(await api.listSurveys());
      setError('');
    } catch (e) {
      setError(friendlyError(e));
    }
  };
  useEffect(() => {
    void load();
  }, [user]);
  return { items, error, reload: load };
}

function SurveyFields({ form, setForm, minPublish }: { form: SurveyInput; setForm: (f: SurveyInput) => void; minPublish?: string }) {
  const set = (key: keyof SurveyInput, value: string) => setForm({ ...form, [key]: value });
  return (
    <>
      <label>
        제목
        <input required maxLength={120} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="설문조사 제목을 입력해주세요." />
      </label>
      <label>
        내용
        <textarea
          required
          rows={8}
          maxLength={5000}
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          placeholder="조사 목적, 참여 대상, 참여 방법 등을 알려주세요."
        />
      </label>
      <label>
        설문 링크 <span className="muted">선택</span>
        <input type="url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://forms.gle/..." />
      </label>
      <div className="two">
        <label>
          게시일
          <input required type="date" min={minPublish} value={form.publish_on} onChange={(e) => set('publish_on', e.target.value)} />
        </label>
        <label>
          만료일
          <input required type="date" min={form.publish_on} value={form.expires_on} onChange={(e) => set('expires_on', e.target.value)} />
        </label>
      </div>
      <p className="muted">한국 시간 기준으로 만료일 당일까지 진행 중으로 표시돼요. 만료 후에도 게시글은 기록으로 남아요.</p>
    </>
  );
}

function SurveyHeading({ children }: { children?: ReactNode }) {
  return (
    <div className="sectionheading">
      <div>
        <span className="eyebrow">JINJU SURVEYS</span>
        <h1>설문조사</h1>
        <p>진주의 다양한 질문과 의견을 한곳에서 만나보세요.</p>
      </div>
      {children}
    </div>
  );
}

export function SurveyBoard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { items, error, reload } = useSurveys();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'expired' | 'mine'>('all');
  const today = kstToday();
  const notice = (location.state as { notice?: string } | null)?.notice;

  const list = (items ?? []).filter((s) => {
    const q = query.trim().toLowerCase();
    if (q && !(s.title + ' ' + s.body).toLowerCase().includes(q)) return false;
    if (filter === 'mine') return s.is_mine;
    if (filter === 'active') return !isExpired(s, today) && !isScheduled(s, today);
    if (filter === 'expired') return isExpired(s, today);
    return true;
  });

  return (
    <main className="wrap survey-page">
      <SurveyHeading>
        <button className="primary" onClick={() => navigate(user ? '/surveys/new' : loginPath('/surveys/new'))}>
          <Plus size={17} /> 설문 올리기
        </button>
      </SurveyHeading>
      {notice && (
        <p className="success" role="status">
          <Check size={16} /> {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}{' '}
          <button className="textbtn" onClick={() => void reload()}>
            다시 시도
          </button>
        </p>
      )}
      <div className="boardtools">
        <div className="sortoptions">
          {(
            [
              ['all', '전체'],
              ['active', '진행 중'],
              ['expired', '만료'],
              ...(user ? [['mine', '내 글']] : []),
            ] as [typeof filter, string][]
          ).map(([key, label]) => (
            <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} />
          <input aria-label="설문조사 검색" value={query} placeholder="제목·내용 검색" onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <div className="survey-board">
        <div className="boardhead">
          <span>제목</span>
          <span>게시일</span>
          <span>만료일</span>
        </div>
        {list.map((s) => (
          <Link className="boardrow" key={s.id} to={`/surveys/${s.id}`}>
            <span className="post-title">
              {isExpired(s, today) && <b className="expiredtag">[만료] </b>}
              {isScheduled(s, today) && <b className="scheduledtag">[게시 예정] </b>}
              {s.title}
              {s.is_mine && <small>내 글</small>}
            </span>
            <time>{s.publish_on}</time>
            <time>{s.expires_on}</time>
          </Link>
        ))}
        {!list.length && (
          <div className="empty">
            <ClipboardList size={37} />
            <h3>{items === null ? '설문조사를 불러오는 중…' : '등록된 설문조사가 없어요.'}</h3>
            <p>{items === null ? '잠시만 기다려주세요.' : '지역의 설문조사나 구글폼을 올려보세요.'}</p>
          </div>
        )}
      </div>
      <p className="muted board-footnote">만료된 게시글도 진주랭킹의 기록자료로 보관돼요.</p>
    </main>
  );
}

export function SurveyWrite() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<SurveyInput>({ title: '', body: '', url: '', publish_on: kstToday(), expires_on: addDays(kstToday(), 14) });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api.createSurvey({ ...form, title: form.title.trim(), body: form.body.trim(), url: form.url.trim() });
      navigate('/surveys', {
        replace: true,
        state: { notice: form.publish_on > kstToday() ? '등록했어요. 설정한 게시일부터 공개돼요.' : '설문조사 글을 게시했어요.' },
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="wrap survey-page">
      <SurveyHeading>
        <Link className="textbtn" to="/surveys">
          <ArrowLeft size={16} /> 목록으로
        </Link>
      </SurveyHeading>
      {!ready ? null : !user ? (
        <section className="community">
          <LoginPrompt message="설문조사를 올리려면 로그인해주세요." next="/surveys/new" />
        </section>
      ) : (
        <form className="editor survey-form" onSubmit={submit}>
          <h2>설문조사 올리기</h2>
          <SurveyFields form={form} setForm={setForm} minPublish={kstToday()} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="publish-actions">
            <label className="consentcheck">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>업로드한 게시글은 진주랭킹의 기록자료로 보관되며, 수정·삭제하려면 관리자의 승인이 필요해요. 개인정보는 적지 않을게요.</span>
            </label>
            <button type="submit" className="primary" disabled={busy || !consent}>
              {busy ? '처리 중…' : '게시'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

export function SurveyDetail() {
  const { id } = useParams();
  const { items, error } = useSurveys();
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [form, setForm] = useState<SurveyInput | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const today = kstToday();
  const survey = items?.find((s) => s.id === id);

  const open = (next: 'edit' | 'delete') => {
    if (!survey) return;
    setForm({ title: survey.title, body: survey.body, url: survey.url, publish_on: survey.publish_on, expires_on: survey.expires_on });
    setReason('');
    setFormError('');
    setMode(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!survey || mode === 'view') return;
    setBusy(true);
    setFormError('');
    try {
      await api.requestSurveyChange({ surveyId: survey.id, kind: mode, reason: reason.trim(), payload: mode === 'edit' && form ? form : undefined });
      setMessage('요청이 전달됐어요. 관리자 승인 전까지 기존 글이 유지돼요.');
      setMode('view');
    } catch (err) {
      setFormError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="wrap survey-page">
      <SurveyHeading>
        <Link className="textbtn" to="/surveys">
          <ArrowLeft size={16} /> 목록으로
        </Link>
      </SurveyHeading>
      {error && <p className="error">{error}</p>}
      {items === null ? (
        <p className="muted">불러오는 중…</p>
      ) : !survey ? (
        <div className="empty">
          <h3>게시글을 찾을 수 없어요.</h3>
        </div>
      ) : mode === 'view' ? (
        <article className="editor survey-detail">
          {message && (
            <p className="success" role="status">
              <Check size={16} /> {message}
            </p>
          )}
          <div className="detailtop">
            <span className="category">지역 설문조사</span>
            <h2>
              {isExpired(survey, today) && <span className="expiredtag">[만료] </span>}
              {isScheduled(survey, today) && <span className="scheduledtag">[게시 예정] </span>}
              {survey.title}
            </h2>
            <p className="muted">
              게시일 {survey.publish_on} · 만료일 {survey.expires_on} · {survey.is_mine ? '내 게시글' : '익명 작성자'}
            </p>
          </div>
          <div className="post-body">{survey.body}</div>
          {survey.url && /^https?:\/\//i.test(survey.url) && (
            <a className="primary survey-link" href={survey.url} target="_blank" rel="noopener noreferrer nofollow">
              {isExpired(survey, today) ? '설문 링크 확인' : '설문 참여하기'} <ArrowUpRight size={17} />
            </a>
          )}
          {isExpired(survey, today) && <p className="muted">만료된 설문이에요. 외부 설문 페이지의 실제 접수 여부는 해당 기관에서 확인해주세요.</p>}
          {survey.is_mine && (
            <div className="requestactions">
              <button className="secondary" onClick={() => open('edit')}>
                수정 요청
              </button>
              <button className="textbtn" onClick={() => open('delete')}>
                삭제 요청
              </button>
              <p className="muted">수정·삭제는 관리자 승인 후 반영돼요.</p>
            </div>
          )}
        </article>
      ) : (
        <form className="editor survey-form" onSubmit={submit}>
          <h2>{mode === 'edit' ? '게시글 수정 요청' : '게시글 삭제 요청'}</h2>
          {mode === 'edit' && form && <SurveyFields form={form} setForm={setForm} />}
          {mode === 'delete' && <p>‘{survey.title}’의 삭제를 요청해요. 관리자 승인 전에는 공개 상태가 유지돼요.</p>}
          <label>
            요청 사유
            <textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="수정 또는 삭제가 필요한 이유를 알려주세요." />
          </label>
          {formError && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <div className="publish-actions">
            <button type="button" className="textbtn" onClick={() => setMode('view')}>
              취소
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? '처리 중…' : mode === 'edit' ? '수정 승인 요청' : '삭제 승인 요청'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
