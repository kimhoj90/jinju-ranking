import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Proposal } from '../lib/types';
import { useNavigate } from 'react-router-dom';
import LoginPrompt from '../components/LoginPrompt';
import RankingEditor, { type UploadKind } from '../components/RankingEditor';
import { useAuth, useUi } from '../context/AppContext';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { compressImage, IMAGE_PRESETS } from '../lib/image';
import { emptyDraft } from './admin/drafts';

/** 제안 사진은 비공개 저장소의 내 폴더에 올라가고, 운영자만 볼 수 있다 */
async function proposalUpload(file: File, kind: UploadKind) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024)
    throw new Error('JPG, PNG, WebP 사진을 2MB 이하로 올려주세요.');
  const blob = await compressImage(file, kind === 'candidate' ? IMAGE_PRESETS.candidate : IMAGE_PRESETS.thumbnail);
  return api.uploadProposalImage(blob);
}

export default function Propose() {
  const { user, ready } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mine = params.has('mine');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState('');
  const load = () =>
    api
      .myProposals()
      .then(setProposals)
      .catch((e) => setError(friendlyError(e)));
  useEffect(() => {
    if (user && mine) void load();
  }, [user, mine]);

  return (
    <main className="wrap admin">
      {user && (
        <div className="manageactions">
          <button className="secondary" onClick={() => setParams({})}>
            랭킹 제안하기
          </button>
          <button className="secondary" onClick={() => setParams({ mine: '1' })}>
            내 제안 목록
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {user && mine ? (
        <section className="adminlist">
          {proposals.length === 0 && <p>아직 제안한 랭킹이 없어요.</p>}
          {proposals.map((p) => (
            <article key={p.id}>
              <h3>{p.title}</h3>
              <span>
                {
                  {
                    pending: '승인 대기',
                    approved: '게시',
                    rejected: '반려',
                    cancelled: '취소',
                  }[p.status]
                }
              </span>
              {p.review_note && <p>{p.review_note}</p>}
              {p.status === 'pending' && (
                <button
                  className="textbtn"
                  onClick={async () => {
                    if (!confirm('제안을 취소할까요?')) return;
                    try {
                      await api.cancelProposal(p.id);
                      await load();
                    } catch (e) {
                      setError(friendlyError(e));
                    }
                  }}
                >
                  취소
                </button>
              )}
            </article>
          ))}
        </section>
      ) : !ready ? null : !user ? (
        <section className="community">
          <LoginPrompt message="제안을 안전하게 접수하기 위해 로그인이 필요해요." next="/propose" />
        </section>
      ) : (
        <RankingEditor
          initial={emptyDraft()}
          mode="proposal"
          uploadImage={proposalUpload}
          onCancel={() => navigate('/')}
          onSubmit={async (draft) => {
            try {
              await api.submitProposal({
                title: draft.title.trim(),
                description: draft.description.trim(),
                keywords: draft.keywords.trim(),
                thumbnail_path: draft.thumbnail_path ?? '',
                candidates: draft.candidates.map((c) => ({
                  name: c.name.trim(),
                  sub: c.sub.trim(),
                  image_path: c.image_path ?? '',
                })),
              });
            } catch (e) {
              throw new Error(friendlyError(e));
            }
            toast('제안이 전달됐어요. 관리자 승인 후 공개돼요.');
            setParams({ mine: '1' });
          }}
        />
      )}
    </main>
  );
}
