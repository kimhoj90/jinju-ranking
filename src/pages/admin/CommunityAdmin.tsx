import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../lib/format';
import { compressImage } from '../../lib/image';
import { api } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import type { AccountRow, AdminTv, CommunitySettings, Duel, DuelDraft } from '../../lib/types';
const blank: DuelDraft = {
  thumbnail_url: '',
  question: '',
  option_a: '',
  option_b: '',
  description_a: '',
  description_b: '',
  status: 'published',
};
export function DuelsAdmin() {
  const [rows, setRows] = useState<Duel[]>([]),
    [draft, setDraft] = useState<DuelDraft | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api
        .listDuels()
        .then(setRows)
        .catch((e) => setError(friendlyError(e))),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      await api.adminSaveDuel(draft);
      setDraft(null);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      {error && <p className="error">{error}</p>}
      {!draft && <>
        <div className="manageactions">
          <button className="primary" onClick={() => setDraft({ ...blank })}><Plus size={16}/> 새 양자택일</button>
        </div>
        <p className="muted stats-note">썸네일이나 제목을 누르면 편집할 수 있어요. 공개된 양자택일은 홈에 표시되고, 보관하면 투표가 종료돼요.</p>
      </>}
      {draft && (
        <form className="contactform community-editor" onSubmit={save}>
          <h2>{draft.id ? '양자택일 편집' : '새 양자택일'}</h2>
          <label>썸네일 (선택)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setError('');try{const blob=await compressImage(file,{maxInputMb:2,maxSide:1200});const url=await api.uploadMedia(blob,'thumbnails');setDraft(d=>d&&({...d,thumbnail_url:url}));}catch(err){setError(friendlyError(err));}finally{setBusy(false);}}}/></label>
          {draft.thumbnail_url && <><img className="duel-editor-thumb" src={draft.thumbnail_url} alt="썸네일 미리보기"/><button type="button" onClick={()=>setDraft({...draft,thumbnail_url:''})}>썸네일 삭제</button></>}
          <label>
            주제
            <input required maxLength={100} value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
          </label>
          {(['a', 'b'] as const).map((k) => (
            <div key={k}>
              <label>
                선택지 {k.toUpperCase()}
                <input
                  required
                  maxLength={60}
                  value={draft[`option_${k}`]}
                  onChange={(e) => setDraft({ ...draft, [`option_${k}`]: e.target.value })}
                />
              </label>
              <label>
                부연설명 (선택)
                <input
                  maxLength={160}
                  value={draft[`description_${k}`]}
                  onChange={(e) => setDraft({ ...draft, [`description_${k}`]: e.target.value })}
                />
              </label>
            </div>
          ))}
          <label>
            상태
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  status: e.target.value as DuelDraft['status'],
                })
              }
            >
              <option value="published">공개</option>
              <option value="archived">보관</option>
            </select>
          </label>
          <div>
            <button className="primary" disabled={busy}>
              저장
            </button>
            <button type="button" className="secondary" onClick={() => setDraft(null)}>
              취소
            </button>
          </div>
        </form>
      )}
      {!draft && <div className="adminlist ranking-management-list">{rows.map(d=><div key={d.id}>
        <button className="admin-thumbnail" aria-label={d.question+' 편집'} onClick={()=>setDraft({...d})}>
          {d.thumbnail_url ? <img className="ranking-thumb-image" src={d.thumbnail_url} alt=""/> : <span className="admin-duel-preview"><span>{d.option_a}</span><b>VS</b><span>{d.option_b}</span></span>}
        </button>
        <div>
          <h3><button className="admin-title-link" onClick={()=>setDraft({...d})}>{d.question}</button></h3>
          <p><span className={'statuschip '+d.status}>{d.status==='published'?'공개':'보관'}</span> · 2개 선택지</p>
          <dl className="ranking-stats">
            <div><dt>업로드 날짜</dt><dd>{formatDate(d.created_at)}</dd></div>
            <div><dt>선택지 A</dt><dd>{d.option_a}</dd></div>
            <div><dt>선택지 B</dt><dd>{d.option_b}</dd></div>
          </dl>
        </div>
        <div className="rowactions">
          <Link className="textbtn" to={`/duels/${d.id}`}>결과</Link>
          <button className="secondary" onClick={()=>setDraft({...d})}>편집</button>
        </div>
      </div>)}</div>}

    </section>
  );
}
export function TvAdmin() {
  const [rows, setRows] = useState<AdminTv[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api
        .adminTv()
        .then(setRows)
        .catch((e) => setError(friendlyError(e))),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <p>최신 추천부터 표시해요. 삭제해도 TV 자리와 그 주 추천 횟수는 유지돼요.</p>
      {error && <p className="error">{error}</p>}
      <div className="tv-admin-grid">
        {rows.map((v) => (
          <article key={v.id}>
            {v.video_id ? (
              <a href={`https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noopener noreferrer">
                <img src={`https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`} alt={`${v.nickname}님의 추천`} loading="lazy" />
              </a>
            ) : (
              <p>삭제된 영상</p>
            )}
            <h3>{v.nickname}</h3>
            <p>
              {new Date(v.created_at).toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
              })}{' '}
              · 신고 {v.reports}건 ·{' '}
              {
                {
                  visible: '표시',
                  hidden: '숨김',
                  restored: '복구',
                  deleted: '삭제',
                }[v.moderation]
              }
            </p>
            <div className="rowactions">
              <button disabled={busy || v.moderation === 'deleted'} onClick={() => void act(() => api.adminModerateVideo(v.id, 'hidden'))}>
                숨김
              </button>
              <button disabled={busy || v.moderation === 'deleted'} onClick={() => void act(() => api.adminModerateVideo(v.id, 'restored'))}>
                복구
              </button>
              <button
                disabled={busy || v.moderation === 'deleted'}
                onClick={() => {
                  if (confirm('이 영상을 삭제할까요?')) void act(() => api.adminModerateVideo(v.id, 'deleted'));
                }}
              >
                삭제
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm(`${v.nickname} 계정을 차단할까요?`)) void act(() => api.adminBlockAccount(v.user_id, true));
                }}
              >
                계정 차단
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
export function AccountsAdmin() {
  const [rows, setRows] = useState<AccountRow[]>([]),
    [settings, setSettings] = useState<CommunitySettings | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [words, setWords] = useState('');
  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([api.adminAccounts(), api.adminCommunitySettings()]);
      setRows(r);
      setSettings(s);
      setWords(s.banned_words.join(', '));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      setNotice('저장했어요.');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      {error && <p className="error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {settings && (
        <form
          className="contactform community-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() =>
              api.adminSaveCommunitySettings({
                ...settings,
                banned_words: words
                  .split(',')
                  .map((w) => w.trim())
                  .filter(Boolean),
              }),
            );
          }}
        >
          <h2>닉네임·신고 설정</h2>
          <label>
            금칙어 (쉼표로 구분)
            <textarea value={words} onChange={(e) => setWords(e.target.value)} />
          </label>
          <label>
            닉네임 변경 간격 (일)
            <input
              type="number"
              min={1}
              required
              value={settings.nickname_days}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  nickname_days: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            영상 자동 숨김 신고 수
            <input
              type="number"
              min={1}
              required
              value={settings.report_threshold}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  report_threshold: Number(e.target.value),
                })
              }
            />
          </label>
          <button className="primary" disabled={busy}>
            설정 저장
          </button>
        </form>
      )}
      <h2>계정 관리</h2>
      <div className="adminlist">
        {rows.map((r) => (
          <article key={r.user_id}>
            <h3>{r.nickname}</h3>
            <span>{r.blocked ? '차단됨' : '이용 가능'}</span>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                if (confirm(`${r.nickname} 계정을 ${r.blocked ? '차단 해제' : '차단'}할까요?`))
                  void act(() => api.adminBlockAccount(r.user_id, !r.blocked));
              }}
            >
              {r.blocked ? '차단 해제' : '차단'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
