import { ArrowLeft, Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { IMAGE_ACCEPT } from '../lib/image';
import { currentPair, pick, roundLabel, startGame, undo } from '../lib/tournament';
import type { DraftCandidate, GameState, WorldcupDraft } from '../lib/types';
import { NAME_MAX, SUB_MAX, candidateFieldIssue, candidateIssue, parseBulk, sizeHint } from '../lib/validate';
import CandidateMedia from './CandidateMedia';
import Modal from './Modal';
import RankingThumb from './RankingThumb';

export type EditorMode = 'admin' | 'proposal' | 'review';
export type UploadKind = 'candidate' | 'thumbnail';

interface Props {
  initial: WorldcupDraft;
  mode: EditorMode;
  onSubmit: (draft: WorldcupDraft) => Promise<void>;
  onCancel: () => void;
  onReject?: () => Promise<void>;
  uploadImage: (file: File, kind: UploadKind) => Promise<{ url: string; path?: string }>;
  heading?: string;
}

export const newCandidate = (): DraftCandidate => ({
  key: crypto.randomUUID(),
  name: '',
  sub: '',
  image_url: '',
});

const isBlank = (c: DraftCandidate) => !c.name.trim() && !c.sub.trim() && !c.image_url;

function CandidateRow({
  candidate,
  accept,
  index,
  uploading,
  onChange,
  onRemove,
  onUpload,
}: {
  candidate: DraftCandidate;
  accept: string;
  index: number;
  uploading: boolean;
  onChange: (field: 'name' | 'sub' | 'image_url', value: string) => void;
  onRemove: () => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="photo-candidate-row">
      <div className="candidate-order">
        <b>{index + 1}</b>
      </div>
      <div className="candidate-upload">
        <div className="candidate-mini-preview">
          <CandidateMedia candidate={{ ...candidate, name: candidate.name || '후보 이름' }} />
        </div>
        <label className="secondary upload-photo-button">
          {uploading ? '업로드 중…' : candidate.image_url ? '사진 변경' : '사진 업로드'}
          <input
            type="file"
            accept={accept}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = '';
            }}
          />
        </label>
        {candidate.image_url && (
          <button type="button" className="textbtn" disabled={uploading} onClick={() => onChange('image_url', '')}>
            사진 삭제
          </button>
        )}
      </div>
      <div className="candidate-fields">
        <label>
          후보 이름
          <input
            aria-label={`후보 ${index + 1} 이름`}
            maxLength={NAME_MAX}
            placeholder="후보 이름"
            value={candidate.name}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </label>
        <label>
          부연설명
          <input
            aria-label={`후보 ${index + 1} 설명`}
            maxLength={SUB_MAX}
            placeholder="부연설명 (선택) · 대결 화면에서 이름 아래 작게 보여요"
            value={candidate.sub}
            onChange={(e) => onChange('sub', e.target.value)}
          />
        </label>
      </div>
      {
        <button type="button" className="textbtn rowdelete" aria-label={`후보 ${index + 1} 삭제`} onClick={onRemove}>
          <Trash2 size={17} />
        </button>
      }
    </div>
  );
}

function PreviewModal({ draft, onClose }: { draft: WorldcupDraft; onClose: () => void }) {
  const [game, setGame] = useState<GameState>(() =>
    startGame(
      'preview',
      draft.candidates.map((c) => c.key),
    ),
  );
  const byKey = (key: string | undefined) => draft.candidates.find((c) => c.key === key);
  return (
    <Modal onClose={onClose} label="랭킹 미리보기" wide>
      <h2>{game.done ? '미리보기 우승' : roundLabel(game.round.length)}</h2>
      {game.done ? (
        <div className="preview-winner">
          <CandidateMedia candidate={byKey(game.champion)} />
        </div>
      ) : (
        <div className="photo-preview-arena">
          {currentPair(game).map((key) => (
            <button key={key + game.matches.length} className="photo-preview-choice" onClick={() => setGame(pick(game, key))}>
              <CandidateMedia candidate={byKey(key)} />
            </button>
          ))}
          <b className="preview-vs">VS</b>
        </div>
      )}
      <p className="muted">미리보기 결과는 순위와 통계에 반영되지 않아요.</p>
      <button className="textbtn" disabled={!game.history.length} onClick={() => setGame(undo(game))}>
        <RotateCcw size={15} /> 되돌리기
      </button>
      <button className="primary full" onClick={onClose}>
        편집 계속하기
      </button>
    </Modal>
  );
}

export default function RankingEditor({ initial, mode, onSubmit, onCancel, onReject, uploadImage, heading }: Props) {
  const [draft, setDraft] = useState<WorldcupDraft>(() => ({
    ...initial,
    candidates: initial.candidates.length ? initial.candidates : [newCandidate()],
  }));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [bulk, setBulk] = useState('');
  const [preview, setPreview] = useState<WorldcupDraft | null>(null);
  const lock = useRef(false);
  const set = <K extends keyof WorldcupDraft>(key: K, value: WorldcupDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const updateCandidate = (key: string, field: 'name' | 'sub' | 'image_url', value: string) =>
    setDraft((d) => ({
      ...d,
      candidates: d.candidates.map((c) =>
        c.key === key
          ? {
              ...c,
              [field]: value,
              ...(field === 'image_url' && !value ? { image_path: undefined } : {}),
            }
          : c,
      ),
    }));
  const upload = async (key: string | 'thumbnail', file: File) => {
    setUploading(key);
    setError('');
    try {
      const result = await uploadImage(file, key === 'thumbnail' ? 'thumbnail' : 'candidate');
      if (key === 'thumbnail') {
        setDraft((d) => ({
          ...d,
          thumbnail_url: result.url,
          thumbnail_path: result.path,
        }));
      } else {
        setDraft((d) => ({
          ...d,
          candidates: d.candidates.map((c) => (c.key === key ? { ...c, image_url: result.url, image_path: result.path } : c)),
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  };

  const addBulk = () => {
    const parsed = parseBulk(bulk);
    if (!parsed.length) return;
    const kept = draft.candidates.filter((c) => c.id || !isBlank(c));
    const added = parsed.slice(0, Math.max(0, 128 - kept.length)).map((p) => ({ ...newCandidate(), ...p }));
    setDraft((d) => ({ ...d, candidates: [...kept, ...added] }));
    setNotice(`${added.length}개를 추가했어요.` + (parsed.length > added.length ? ' 후보는 최대 128개까지예요.' : ''));
    setBulk('');
  };

  // 비어 있는 새 줄은 저장하지 않는다 (저장된 후보는 이름이 비면 검증에서 알려준다)
  const cleaned = (): WorldcupDraft => ({
    ...draft,
    candidates: draft.candidates.filter((c) => c.id || !isBlank(c)),
  });

  const submit = async () => {
    if (lock.current || uploading) return;
    setError('');
    setNotice('');
    const d = cleaned();
    if (!d.title.trim()) {
      setError('제목을 입력해주세요.');
      return;
    }
    const strict = mode !== 'admin' || d.status === 'published';
    const countIssue = d.candidates.length < 4 || d.candidates.length > 128 ? '후보는 4~128명으로 구성해주세요.' : '';
    const issue = mode === 'proposal' ? candidateIssue(d.candidates) : candidateFieldIssue(d.candidates) || (strict ? countIssue : '');
    if (issue) {
      setError(issue + (mode === 'admin' && d.status === 'published' ? ' 맞추기 전에는 「초안」으로 저장할 수 있어요.' : ''));
      return;
    }
    lock.current = true;
    setSaving(true);
    try {
      await onSubmit(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  const filled = draft.candidates.filter((c) => c.id || !isBlank(c));
  const sizeMessage =
    mode === 'proposal' ? sizeHint(filled.length) : filled.length < 4 || filled.length > 128 ? '후보는 4~128명으로 구성해주세요.' : '';
  const busy = saving || !!uploading;
  const titles = {
    admin: {
      eyebrow: 'RANKING EDITOR',
      heading: heading ?? '랭킹 편집',
      submit: '저장',
    },
    proposal: {
      eyebrow: 'YOUR IDEA',
      heading: '새로운 랭킹 제안',
      submit: '제안하기',
    },
    review: {
      eyebrow: 'PROPOSAL REVIEW',
      heading: '제안 검토',
      submit: '승인하고 공개',
    },
  }[mode];

  return (
    <section className="editor shared-editor">
      <div className="editor-title">
        <div>
          <span className="eyebrow">{titles.eyebrow}</span>
          <h2>{titles.heading}</h2>
        </div>
        <button type="button" className="textbtn" disabled={busy} onClick={onCancel}>
          <ArrowLeft size={16} /> 돌아가기
        </button>
      </div>
      {mode === 'proposal' && (
        <p className="editor-note">제안한 랭킹은 관리자에게만 전달돼요. 검토 후 승인되면 홈에 공개돼요. 이름·연락처 같은 개인정보는 적지 마세요.</p>
      )}
      {mode === 'review' && <p className="editor-note">제안 내용을 다듬은 뒤 「승인하고 공개」를 누르면 새 랭킹으로 홈에 공개돼요.</p>}

      <div className="editcols">
        <div>
          <label>
            제목
            <input maxLength={100} value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="어떤 진주를 골라볼까요?" />
          </label>
          <label>
            한 줄 설명
            <input
              maxLength={160}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="참여자에게 랭킹을 소개해주세요."
            />
          </label>
          <label>
            검색 키워드
            <input
              maxLength={1230}
              value={draft.keywords}
              onChange={(e) => set('keywords', e.target.value)}
              placeholder="예시) 진주맛집, 냉면, 점심"
            />
          </label>
          <small className="muted">쉼표(,)로 구분해주세요. 키워드는 검색에만 쓰이고 방문자 화면에는 보이지 않아요.</small>
          {mode === 'admin' && (
            <>
              <label>
                상태
                <select value={draft.status} onChange={(e) => set('status', e.target.value as WorldcupDraft['status'])}>
                  <option value="draft">초안 (나만 보기)</option>
                  <option value="published">공개</option>
                  <option value="archived">보관 (홈에서 내리기)</option>
                </select>
              </label>
              <div className="two">
                <label className="checkbox">
                  <input type="checkbox" checked={draft.featured} onChange={(e) => set('featured', e.target.checked)} /> 홈 추천 (맨 앞)
                </label>
                <label>
                  홈 노출 순서
                  <input
                    type="number"
                    min={-999}
                    max={999}
                    value={draft.sort_order}
                    onChange={(e) => set('sort_order', Number(e.target.value) || 0)}
                  />
                </label>
              </div>
              <small className="muted">노출 순서는 작은 숫자가 앞에 와요. 같으면 최신순이에요.</small>
            </>
          )}
        </div>
        <div>
          <label>
            대표 썸네일 <span className="muted">선택</span>
            <input
              type="file"
              accept={mode === 'proposal' ? 'image/jpeg,image/png,image/webp' : IMAGE_ACCEPT}
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload('thumbnail', file);
                e.target.value = '';
              }}
            />
          </label>
          <div className="editorimage">
            {uploading === 'thumbnail' ? (
              <span>업로드 중…</span>
            ) : (
              <RankingThumb
                cup={{
                  thumbnail_url: draft.thumbnail_url,
                  candidates: draft.candidates.map((c, i) => ({
                    id: c.key,
                    name: c.name,
                    sub: c.sub,
                    image_url: c.image_url,
                    sort_order: i,
                    active: true,
                  })),
                }}
                eager
              />
            )}
          </div>
          {draft.thumbnail_url && (
            <button
              type="button"
              className="textbtn"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  thumbnail_url: '',
                  thumbnail_path: undefined,
                }))
              }
            >
              직접 올린 썸네일 삭제 · 자동 생성 사용
            </button>
          )}
          {mode === 'proposal' && <small className="muted">제안 사진은 JPG, PNG, WebP 형식, 2MB 이하만 가능해요.</small>}
          <small className="muted">썸네일을 비우면 후보 사진 2장으로 자동 구성돼요. 결과가 쌓이면 우승 횟수 1·2위 사진이 표시돼요.</small>
        </div>
      </div>

      <div className="candidateheading">
        <h3>
          후보 <span>{filled.length}개</span>
        </h3>
        {
          <button
            type="button"
            className="secondary"
            disabled={draft.candidates.length >= 128 || busy}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                candidates: [...d.candidates, newCandidate()],
              }))
            }
          >
            <Plus size={15} /> 한 줄 추가
          </button>
        }
      </div>
      <p className={'sizestatus' + (sizeMessage ? '' : ' ok')}>
        {sizeMessage ? (
          sizeMessage
        ) : (
          <>
            <Check size={15} /> 후보 {filled.length}명으로 공개할 수 있어요.
          </>
        )}
      </p>
      <p className="muted">
        {mode === 'proposal' ? '제안 후보는 4·8·16·32·64·128명.' : '후보는 4~128명. 추가·제외해도 기존 참여 기록은 유지돼요.'} 사진은 각각 2MB 이하,
        4:3으로 채워져요. 대결 상대는 무작위로 정해져요.
      </p>

      <div className="photo-candidate-list">
        {draft.candidates.map((c, i) => (
          <CandidateRow
            accept={mode === 'proposal' ? 'image/jpeg,image/png,image/webp' : IMAGE_ACCEPT}
            key={c.key}
            candidate={c}
            index={i}
            uploading={uploading === c.key}
            onChange={(field, value) => updateCandidate(c.key, field, value)}
            onRemove={() =>
              setDraft((d) => ({
                ...d,
                candidates: d.candidates.filter((x) => x.key !== c.key),
              }))
            }
            onUpload={(file) => void upload(c.key, file)}
          />
        ))}
      </div>

      {
        <div className="bulkadd">
          <label>
            한꺼번에 추가
            <textarea
              className="bulk-candidates"
              rows={4}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={'예) 진주냉면 | 시원한 육수에 육전 한 점\n예) 진주비빔밥 | 색색의 나물을 한 그릇에\n예) 장어구이'}
            />
          </label>
          <div className="bulkactions">
            <small className="muted">한 줄에 하나씩 「이름 | 부연설명」으로 적어주세요. 부연설명은 빼도 돼요.</small>
            <button type="button" className="secondary" disabled={!bulk.trim()} onClick={addBulk}>
              <Plus size={15} /> 목록에 추가
            </button>
          </div>
        </div>
      }

      {notice && (
        <p className="success" role="status">
          <Check size={16} /> {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="editoractions">
        {onReject && (
          <button type="button" className="textbtn danger" disabled={busy} onClick={() => void onReject()}>
            반려
          </button>
        )}
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
          취소
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            const d = cleaned();
            const issue = candidateIssue(d.candidates);
            if (issue) {
              setError('미리보기: ' + issue);
              return;
            }
            setError('');
            setPreview(d);
          }}
        >
          플레이 미리보기
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => void submit()}>
          {saving ? '저장 중…' : titles.submit}
        </button>
      </div>

      {preview && <PreviewModal draft={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
