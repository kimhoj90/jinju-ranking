import { RecordsAdmin } from '../Records';
import { AccountsAdmin, DuelsAdmin, TvAdmin } from './CommunityAdmin';
import { ArrowLeft, Check, ClipboardList, Eye, EyeOff, ImagePlus, Lock, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import LoginPrompt from '../../components/LoginPrompt';
import RankingEditor from '../../components/RankingEditor';
import RankingThumb from '../../components/RankingThumb';
import { useAuth, useSite, useUi } from '../../context/AppContext';
import { api } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { formatDate, formatDateTime, num } from '../../lib/format';
import { compressImage, IMAGE_PRESETS } from '../../lib/image';
import type {
  AdBanner,
  AdminComment,
  AdminStats,
  FeedbackItem,
  FeedbackStatus,
  Proposal,
  SiteSettings,
  SurveyRequest,
  WorldcupDraft,
} from '../../lib/types';
import { adminUpload, emptyDraft, proposalToDraft, publishProposalImages, seasonDraft, worldcupToDraft } from './drafts';

const TABS = [
  ['rankings', '랭킹 관리'],
  ['duels', '양자택일'],
  ['tv', '유튜브 TV'],
  ['proposals', '제안 및 의견함'],
  ['surveys', '설문 승인함'],
  ['comments', '댓글 관리'],
  ['ads', '광고·문의 설정'],
  ['accounts', '계정·이용 규칙'],
  ['records', '진주기록'],
] as const;
type Tab = (typeof TABS)[number][0];

const STATUS_LABEL = {
  draft: '초안',
  published: '공개',
  archived: '보관',
} as const;
const FEEDBACK_LABEL = {
  suggest: '후보 추천',
  objection: '이의 제기',
  report: '댓글 신고',
} as const;

function useAsync<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      setData(await load());
      setError('');
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload, setData };
}

// ---------------------------------------------------------------------------
// 랭킹 관리
// ---------------------------------------------------------------------------
function RankingsTab() {
  const navigate = useNavigate();
  const { data, error } = useAsync(async () => {
    const [cups, stats] = await Promise.all([api.adminListWorldcups(), api.adminStats()]);
    return {
      cups,
      stats: Object.fromEntries(stats.map((s) => [s.worldcup_id, s])) as Record<string, AdminStats>,
    };
  });

  return (
    <>
      <div className="manageactions">
        <button className="primary" onClick={() => navigate('/admin/rankings/new')}>
          <Plus size={16} /> 새 랭킹
        </button>
      </div>
      <p className="muted stats-note">
        조회수는 브라우저별 하루 1회, 참여자 수는 끝까지 플레이한 브라우저 수, 순위 반영은 로그인해서 반영한 표(계정당 1개) 수예요.
      </p>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">불러오는 중…</p>}
      {data?.cups.length === 0 && (
        <div className="empty">
          <ClipboardList size={36} />
          <h3>아직 랭킹이 없어요.</h3>
          <p>「새 랭킹」으로 첫 랭킹을 만들어보세요.</p>
        </div>
      )}
      <div className="adminlist ranking-management-list">
        {data?.cups.map((cup) => {
          const s = data.stats[cup.id];
          return (
            <div key={cup.id}>
              <Link className="admin-thumbnail" to={`/admin/rankings/${cup.id}`}><RankingThumb cup={cup} /></Link>
              <Link className="admin-detail-link" to={`/admin/rankings/${cup.id}`}>
                <h3>{cup.title}</h3>
                <p>
                  <span className={'statuschip ' + cup.status}>{STATUS_LABEL[cup.status]}</span> · {cup.candidates.length}개 후보

                </p>
                <dl className="ranking-stats">
                  <div>
                    <dt>업로드 날짜</dt>
                    <dd>{formatDate(cup.published_at ?? cup.created_at)}</dd>
                  </div>
                  <div>
                    <dt>조회수</dt>
                    <dd>{num(s?.views ?? 0)}회</dd>
                  </div>
                  <div>
                    <dt>참여자 수</dt>
                    <dd>{num(s?.completions ?? 0)}명</dd>
                  </div>
                  <div>
                    <dt>순위 반영</dt>
                    <dd>{num(s?.participants ?? 0)}표</dd>
                  </div>
                  <div>
                    <dt>댓글 수</dt>
                    <dd>{num(s?.comments ?? 0)}개</dd>
                  </div>
                </dl>
              </Link>
              <div className="rowactions">
                {cup.status === 'published' && (
                  <Link className="textbtn" to={`/r/${cup.slug}/ranking`}>
                    순위
                  </Link>
                )}
                <button className="textbtn" onClick={() => navigate(`/admin/rankings/${cup.id}/season`)}>
                  새 시즌
                </button>
                <button className="secondary" onClick={() => navigate(`/admin/rankings/${cup.id}`)}>
                  편집
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function EditRanking({ season }: { season?: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useSite();
  const { toast } = useUi();
  const [state, setState] = useState<{
    draft: WorldcupDraft;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setState({ draft: emptyDraft() });
      return;
    }
    api
      .adminListWorldcups()
      .then((cups) => {
        const cup = cups.find((c) => c.id === id);
        if (!cup) throw new Error('랭킹을 찾을 수 없어요.');
        setState(season ? { draft: seasonDraft(cup) } : { draft: worldcupToDraft(cup) });
      })
      .catch((e) => setError(friendlyError(e)));
  }, [id, season]);

  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">불러오는 중…</p>;
  return (
    <RankingEditor
      initial={state.draft}
      mode="admin"
      heading={!id ? '새 랭킹' : season ? '새 시즌 만들기' : '랭킹 편집'}
      uploadImage={adminUpload}
      onCancel={() => navigate('/admin')}
      onSubmit={async (draft) => {
        try {
          await api.adminSaveWorldcup(draft);
        } catch (e) {
          throw new Error(friendlyError(e));
        }
        await refresh();
        toast(draft.status === 'published' ? '저장했어요. 홈에 공개됐어요.' : '저장했어요.');
        navigate('/admin');
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 제안함
// ---------------------------------------------------------------------------
function ProposalsTab() {
  const navigate = useNavigate();
  const { toast } = useUi();
  const { data, error, reload } = useAsync(() => api.adminListProposals());
  const pending = data?.filter((p) => p.status === 'pending') ?? [];
  const done = data?.filter((p) => p.status !== 'pending') ?? [];

  const reject = async (p: Proposal) => {
    if (!confirm(`「${p.title}」 제안을 반려할까요? 홈에는 공개되지 않아요.`)) return;
    try {
      await api.adminRejectProposal(p.id, prompt('반려 사유 (선택)') ?? '');
      toast('반려했어요.');
      await reload();
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  return (
    <>
      <p className="muted">승인 대기 제안은 이 관리 페이지에서만 볼 수 있어요.</p>
      {error && <p className="error">{error}</p>}
      {data && !pending.length && (
        <div className="empty">
          <ClipboardList size={36} />
          <h3>승인을 기다리는 제안이 없어요.</h3>
          <p>홈의 첫 번째 카드에서 제안을 보내면 여기에 도착해요.</p>
        </div>
      )}
      <div className="adminlist">
        {pending.map((p) => (
          <div key={p.id}>
            <span className="pendingbadge">승인 대기</span>
            <div>
              <h3>{p.title}</h3>
              <p>
                {p.candidates.length}개 후보 · {formatDate(p.created_at)}
              </p>
            </div>
            <div className="rowactions">
              <button className="textbtn" onClick={() => void reject(p)}>
                반려
              </button>
              <button className="primary" onClick={() => navigate(`/admin/proposals/${p.id}`)}>
                검토·승인
              </button>
            </div>
          </div>
        ))}
      </div>
      {done.length > 0 && (
        <details className="processed">
          <summary>처리한 제안 {done.length}개</summary>
          <ul>
            {done.map((p) => (
              <li key={p.id}>
                {p.status === 'approved' ? '승인' : p.status === 'cancelled' ? '취소' : '반려'} · {p.title} · {formatDate(p.created_at)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function ReviewProposal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useSite();
  const { toast } = useUi();
  const [draft, setDraft] = useState<WorldcupDraft | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .adminListProposals()
      .then(async (list) => {
        const p = list.find((x) => x.id === id);
        if (!p) throw new Error('제안을 찾을 수 없어요.');
        if (p.status !== 'pending') throw new Error('이미 처리한 제안이에요.');
        setDraft(await proposalToDraft(p));
      })
      .catch((e) => setError(friendlyError(e)));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!draft || !id) return <p className="muted">불러오는 중…</p>;
  return (
    <RankingEditor
      initial={draft}
      mode="review"
      uploadImage={adminUpload}
      onCancel={() => navigate('/admin?tab=proposals')}
      onReject={async () => {
        if (!confirm('이 제안을 반려할까요?')) return;
        await api.adminRejectProposal(id, prompt('반려 사유 (선택)') ?? '');
        toast('반려했어요.');
        navigate('/admin?tab=proposals');
      }}
      onSubmit={async (d) => {
        try {
          const published = await publishProposalImages({
            ...d,
            status: 'published',
          });
          await api.adminSaveWorldcup(published, id);
        } catch (e) {
          throw new Error(friendlyError(e));
        }
        await refresh();
        toast('승인했어요. 홈에 공개됐어요.');
        navigate('/admin?tab=proposals');
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 의견함 (후보 추천, 이의 제기, 댓글 신고)
// ---------------------------------------------------------------------------
function FeedbackTab() {
  const { toast } = useUi();
  const { data, error, reload, setData } = useAsync(async () => {
    const [items, cups] = await Promise.all([api.adminListFeedback(), api.adminListWorldcups()]);
    return { items, cups };
  });
  const [cupFilter, setCupFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('new');

  const cupOf = (id: string) => data?.cups.find((c) => c.id === id);
  const items = (data?.items ?? []).filter(
    (f) => (!cupFilter || f.worldcup_id === cupFilter) && (statusFilter === 'all' || f.status === statusFilter),
  );

  const setStatus = async (f: FeedbackItem, status: FeedbackStatus) => {
    try {
      await api.adminSetFeedbackStatus(f.id, status);
      setData(
        (d) =>
          d && {
            ...d,
            items: d.items.map((x) => (x.id === f.id ? { ...x, status } : x)),
          },
      );
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  const moderate = async (f: FeedbackItem, action: 'hide' | 'delete') => {
    if (!f.comment_id) return;
    if (action === 'delete' && !confirm('신고된 댓글을 삭제할까요? 작성자는 새로 쓸 수 있어요.')) return;
    try {
      if (action === 'hide') await api.adminSetCommentHidden(f.comment_id, true);
      else await api.adminDeleteComment(f.comment_id);
      await api.adminSetFeedbackStatus(f.id, 'done');
      toast(action === 'hide' ? '댓글을 숨겼어요.' : '댓글을 삭제했어요.');
      await reload();
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  return (
    <>
      <div className="filterbar">
        <select value={cupFilter} onChange={(e) => setCupFilter(e.target.value)} aria-label="랭킹 선택">
          <option value="">모든 랭킹</option>
          {data?.cups.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <div className="sortoptions">
          {(
            [
              ['new', '새 의견'],
              ['reviewed', '확인함'],
              ['done', '처리함'],
              ['all', '전체'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} className={statusFilter === key ? 'active' : ''} onClick={() => setStatusFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {data && !items.length && (
        <div className="empty">
          <Check size={32} />
          <h3>해당하는 의견이 없어요.</h3>
        </div>
      )}
      <div className="feedbacklist">
        {items.map((f) => {
          const cup = cupOf(f.worldcup_id);
          const candidate = cup?.candidates.find((c) => c.id === f.candidate_id);
          return (
            <article key={f.id} className={'feedbackcard ' + f.type}>
              <div className="feedbacktop">
                <span className={'typebadge ' + f.type}>{FEEDBACK_LABEL[f.type]}</span>
                <span className="muted">{cup?.title ?? '삭제된 랭킹'}</span>
                <time className="muted">{formatDateTime(f.created_at)}</time>
              </div>
              {candidate && <p className="muted">대상 후보 · {candidate.name}</p>}
              {f.body && <p className="feedbackbody">{f.body}</p>}
              {f.type === 'report' && (
                <div className="reported">
                  {f.comment ? (
                    <>
                      <p>
                        <b>신고된 댓글</b> {f.comment.hidden && <em>(숨김 처리됨)</em>}
                      </p>
                      <blockquote>{f.comment.body}</blockquote>
                      <div className="rowactions">
                        {!f.comment.hidden && (
                          <button className="secondary" onClick={() => void moderate(f, 'hide')}>
                            <EyeOff size={15} /> 숨기기
                          </button>
                        )}
                        <button className="textbtn danger" onClick={() => void moderate(f, 'delete')}>
                          <Trash2 size={15} /> 삭제
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="muted">신고된 댓글은 이미 삭제됐어요.</p>
                  )}
                </div>
              )}
              <label className="statusselect">
                상태
                <select value={f.status} onChange={(e) => void setStatus(f, e.target.value as FeedbackStatus)}>
                  <option value="new">새 의견</option>
                  <option value="reviewed">확인함</option>
                  <option value="done">처리함</option>
                </select>
              </label>
            </article>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 댓글 관리
// ---------------------------------------------------------------------------
function CommentsTab() {
  const { toast } = useUi();
  const { data, error, setData } = useAsync(async () => {
    const [comments, cups] = await Promise.all([api.adminListComments(), api.adminListWorldcups()]);
    return { comments, cups };
  });
  const [cupFilter, setCupFilter] = useState('');
  const list = (data?.comments ?? []).filter((c) => !cupFilter || c.worldcup_id === cupFilter);

  const toggle = async (c: AdminComment) => {
    try {
      await api.adminSetCommentHidden(c.id, !c.hidden);
      setData(
        (d) =>
          d && {
            ...d,
            comments: d.comments.map((x) => (x.id === c.id ? { ...x, hidden: !c.hidden } : x)),
          },
      );
    } catch (e) {
      toast(friendlyError(e));
    }
  };
  const remove = async (c: AdminComment) => {
    if (!confirm('이 댓글을 삭제할까요? 작성자는 새로 쓸 수 있어요.')) return;
    try {
      await api.adminDeleteComment(c.id);
      setData((d) => d && { ...d, comments: d.comments.filter((x) => x.id !== c.id) });
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  return (
    <>
      <div className="filterbar">
        <select value={cupFilter} onChange={(e) => setCupFilter(e.target.value)} aria-label="랭킹 선택">
          <option value="">모든 랭킹</option>
          {data?.cups.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <span className="muted">작성자는 익명이에요. 숨긴 댓글은 작성자에게만 보여요.</span>
      </div>
      {error && <p className="error">{error}</p>}
      {data && !list.length && (
        <div className="empty">
          <h3>댓글이 없어요.</h3>
        </div>
      )}
      <ul className="admincomments">
        {list.map((c) => (
          <li key={c.id} className={c.hidden ? 'hidden' : ''}>
            <div>
              <p>{c.body}</p>
              <small className="muted">
                {data?.cups.find((w) => w.id === c.worldcup_id)?.title ?? '삭제된 랭킹'} · {formatDateTime(c.created_at)}
                {c.hidden && ' · 숨김'}
              </small>
            </div>
            <div className="rowactions">
              <button className="secondary" onClick={() => void toggle(c)}>
                {c.hidden ? (
                  <>
                    <Eye size={15} /> 보이기
                  </>
                ) : (
                  <>
                    <EyeOff size={15} /> 숨기기
                  </>
                )}
              </button>
              <button className="textbtn danger" onClick={() => void remove(c)}>
                <Trash2 size={15} /> 삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// 광고·문의 설정
// ---------------------------------------------------------------------------
function AdsTab() {
  const { refresh } = useSite();
  const { toast } = useUi();
  const [config, setConfig] = useState<{
    ads: AdBanner[];
    settings: SiteSettings;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getSiteConfig()
      .then((c) => {
        const ads = [1, 2, 3, 4].map(
          (slot) =>
            c.ads.find((a) => a.slot === slot) ?? {
              slot,
              title: '',
              image_url: '',
              link_url: '',
              active: false,
            },
        );
        setConfig({ ads, settings: c.settings });
      })
      .catch((e) => setError(friendlyError(e)));
  }, []);

  if (!config) return error ? <p className="error">{error}</p> : <p className="muted">불러오는 중…</p>;

  const setAd = (slot: number, patch: Partial<AdBanner>) =>
    setConfig(
      (c) =>
        c && {
          ...c,
          ads: c.ads.map((a) => (a.slot === slot ? { ...a, ...patch } : a)),
        },
    );

  const upload = async (slot: number, file: File | undefined) => {
    if (!file) return;
    setUploading(slot);
    setError('');
    try {
      if (file.type === 'image/gif' && file.size > 2 * 1024 * 1024) throw Error('GIF는 2MB 이하로 올려주세요.');
      const blob = file.type === 'image/gif' ? file : await compressImage(file, IMAGE_PRESETS.banner);
      setAd(slot, { image_url: await api.uploadMedia(blob, 'banners') });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if(config.ads.some(a=>a.starts_on && a.ends_on && a.starts_on>a.ends_on)){setError('게시 종료일은 시작일 이후여야 해요.');return;}
    const bad = config.ads.find((a) => a.link_url.trim() && !/^https?:\/\//i.test(a.link_url.trim()));
    if (bad) {
      setError(`배너 ${bad.slot}의 주소는 https:// 로 시작해야 해요.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.adminSaveSiteConfig(config.ads, config.settings);
      await refresh();
      toast('광고와 문의 주소를 저장했어요.');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="adsettings editor">
      <h2>광고 배너</h2>
      <p className="muted">
        상단 왼쪽부터 1~4번 순서로 보여요. 이미지와 클릭할 주소를 등록하고 「노출」을 켜주세요. 권장 제작 크기는 640×200px (기본 320×100px)입니다. JPG·PNG·WebP·GIF를 지원하며 GIF는 2MB 이하로 올려주세요.
      </p>
      <div className="adeditgrid">
        {config.ads.map((ad) => (
          <div className="adedit" key={ad.slot}>
            <h3>배너 {ad.slot}</h3>
            <div className="adeditpreview">
              {uploading === ad.slot ? (
                <span>업로드 중…</span>
              ) : ad.image_url ? (
                <img src={ad.image_url} alt={`배너 ${ad.slot} 미리보기`} />
              ) : (
                <ImagePlus size={32} />
              )}
            </div>
            <label>
              이미지
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading !== null} onChange={(e) => void upload(ad.slot, e.target.files?.[0])} />
            </label>
            <label>
              광고주
              <input maxLength={60} value={ad.title} onChange={(e) => setAd(ad.slot, { title: e.target.value })} />
            </label>
            <label>연락처 (관리자만 표시)<input value={ad.contact ?? ''} maxLength={120} onChange={e=>setAd(ad.slot,{contact:e.target.value})}/></label>
            <div className="two"><label>게시 시작일<input type="date" value={ad.starts_on ?? ''} onChange={e=>setAd(ad.slot,{starts_on:e.target.value})}/></label><label>게시 종료일<input type="date" min={ad.starts_on} value={ad.ends_on ?? ''} onChange={e=>setAd(ad.slot,{ends_on:e.target.value})}/></label></div>
            <small>한국 시간 기준, 종료일까지 표시해요. 비워 두면 기간 제한이 없어요.</small>
            <label>
              클릭할 주소
              <input type="url" placeholder="https://" value={ad.link_url} onChange={(e) => setAd(ad.slot, { link_url: e.target.value })} />
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={ad.active} onChange={(e) => setAd(ad.slot, { active: e.target.checked })} /> 노출
            </label>
            <button
              className="textbtn"
              onClick={() =>
                setAd(ad.slot, {
                  title: '',
                  contact: '', starts_on: '', ends_on: '',
                  image_url: '',
                  link_url: '',
                  active: false,
                })
              }
            >
              배너 비우기
            </button>
          </div>
        ))}
      </div>
      <div className="emailsetting">
        <h2>문의 받을 메일 주소</h2>
        <p className="muted">광고문의와 설문조사 의뢰, 개인정보처리방침의 문의처에 함께 쓰이고 방문자에게 공개돼요.</p>
        <label>
          관리자 문의 이메일
          <input
            type="email"
            placeholder="문의 받을 이메일 주소"
            value={config.settings.contact_email}
            onChange={(e) =>
              setConfig({
                ...config,
                settings: { contact_email: e.target.value },
              })
            }
          />
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={saving || uploading !== null} onClick={() => void save()}>
        {saving ? '저장 중…' : '광고·문의 설정 저장'}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 설문 승인함
// ---------------------------------------------------------------------------
function SurveysTab() {
  const { toast } = useUi();
  const { data, error, reload } = useAsync(() => api.adminListSurveyRequests());
  const [busy, setBusy] = useState<string | null>(null);

  const review = async (r: SurveyRequest, action: 'approve' | 'reject') => {
    if (action === 'approve' && r.kind === 'delete' && !confirm('삭제를 승인하고 이 게시글을 목록에서 내릴까요?')) return;
    setBusy(r.id);
    try {
      await api.adminReviewSurveyRequest(r.id, action);
      toast(action === 'approve' ? '승인 내용을 게시글에 반영했어요.' : '요청을 반려했어요.');
      await reload();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="survey-requests">
      <h2>설문 게시글 수정·삭제 요청</h2>
      {error && <p className="error">{error}</p>}
      {data === null && !error && <p className="muted">요청을 불러오는 중…</p>}
      {data?.length === 0 && (
        <div className="empty">
          <Check size={32} />
          <h3>승인 대기 중인 요청이 없어요.</h3>
        </div>
      )}
      {data?.map((r) => (
        <article className="editor requestcard" key={r.id}>
          <span className="pendingbadge">{r.kind === 'edit' ? '수정 요청' : '삭제 요청'}</span>
          <h3>{r.survey?.title ?? '(삭제된 게시글)'}</h3>
          <p>
            <b>요청 사유</b> · {r.reason}
          </p>
          {r.kind === 'edit' && r.payload && r.survey && (
            <div className="requestcompare">
              <section>
                <h4>현재 게시글</h4>
                <b>{r.survey.title}</b>
                <p>{r.survey.body}</p>
                <p>{r.survey.url}</p>
                <small>
                  {r.survey.publish_on} ~ {r.survey.expires_on}
                </small>
              </section>
              <section>
                <h4>수정 요청 내용</h4>
                <b>{r.payload.title}</b>
                <p>{r.payload.body}</p>
                <p>{r.payload.url}</p>
                <small>
                  {r.payload.publish_on} ~ {r.payload.expires_on}
                </small>
              </section>
            </div>
          )}
          <div className="editoractions">
            <button className="secondary" disabled={!!busy} onClick={() => void review(r, 'reject')}>
              반려
            </button>
            <button className="primary" disabled={!!busy} onClick={() => void review(r, 'approve')}>
              {busy === r.id ? '처리 중…' : '승인'}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
function AdminHome() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') : 'rankings') as Tab;
  return (
    <>
      <div className="admintabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setParams(key === 'rankings' ? {} : { tab: key })}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'rankings' && <RankingsTab />}
      {tab === 'proposals' && (
        <>
          <h2>랭킹 제안</h2>
          <ProposalsTab />
          <h2 className="section-divider">의견함</h2>
          <FeedbackTab />
        </>
      )}
      {tab === 'comments' && <CommentsTab />}
      {tab === 'ads' && <AdsTab />}
      {tab === 'surveys' && <SurveysTab />}
      {tab === 'duels' && <DuelsAdmin />}
      {tab === 'tv' && <TvAdmin />}
      {tab === 'accounts' && <AccountsAdmin />}
      {tab === 'records' && <RecordsAdmin />}
    </>
  );
}

export default function Admin() {
  const { user, isAdmin, ready } = useAuth();
  return (
    <main className="wrap admin">
      <div className="sectionheading">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>진주랭킹 관리</h1>
        </div>
        <Link className="textbtn" to="/">
          <ArrowLeft size={16} /> 홈으로
        </Link>
      </div>
      {!ready ? (
        <p className="muted">관리 권한 확인 중…</p>
      ) : !user ? (
        <section className="community">
          <LoginPrompt message="운영자 계정으로 로그인해주세요." next="/admin" />
        </section>
      ) : !isAdmin ? (
        <div className="empty">
          <Lock size={30} />
          <h2>관리자 전용 페이지예요.</h2>
          <p>운영자로 등록된 계정만 들어올 수 있어요. 처음 한 번, Supabase SQL Editor에서 아래 문장을 실행하면 이 계정이 운영자가 돼요.</p>
          <pre className="sqlbox">insert into public.admins (user_id) values ('{user.id}');</pre>
          <button
            className="secondary"
            onClick={() => void navigator.clipboard?.writeText(`insert into public.admins (user_id) values ('${user.id}');`)}
          >
            SQL 복사
          </button>
        </div>
      ) : (
        <Routes>
          <Route index element={<AdminHome />} />
          <Route path="rankings/new" element={<EditRanking />} />
          <Route path="rankings/:id" element={<EditRanking />} />
          <Route path="rankings/:id/season" element={<EditRanking season />} />
          <Route path="proposals/:id" element={<ReviewProposal />} />
        </Routes>
      )}
    </main>
  );
}
