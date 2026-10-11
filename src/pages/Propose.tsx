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
  const blob = await compressImage(file, kind === 'candidate' ? IMAGE_PRESETS.candidate : IMAGE_PRESETS.thumbnail);
  return api.uploadProposalImage(blob);
}

export default function Propose() {
  const { user, ready } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();

  return (
    <main className="wrap admin">
      {!ready ? null : !user ? (
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
                candidates: draft.candidates.map((c) => ({ name: c.name.trim(), sub: c.sub.trim(), image_path: c.image_path ?? '' })),
              });
            } catch (e) {
              throw new Error(friendlyError(e));
            }
            toast('제안이 전달됐어요. 관리자 승인 후 공개돼요.');
            navigate('/');
          }}
        />
      )}
    </main>
  );
}
