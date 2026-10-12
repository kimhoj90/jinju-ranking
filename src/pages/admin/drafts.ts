import { newCandidate } from '../../components/RankingEditor';
import { api } from '../../lib/api';
import { compressImage, IMAGE_PRESETS } from '../../lib/image';
import type { Proposal, Worldcup, WorldcupDraft } from '../../lib/types';
import type { UploadKind } from '../../components/RankingEditor';

export function emptyDraft(): WorldcupDraft {
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    keywords: '',
    status: 'draft',
    featured: false,
    sort_order: 0,
    thumbnail_url: '',
    candidates: [newCandidate()],
  };
}

export function worldcupToDraft(cup: Worldcup): WorldcupDraft {
  return {
    id: cup.id,
    title: cup.title,
    description: cup.description,
    keywords: cup.keywords,
    status: cup.status,
    featured: cup.featured,
    sort_order: cup.sort_order,
    thumbnail_url: cup.thumbnail_url,
    candidates: cup.candidates.map((c) => ({ key: c.id, id: c.id, name: c.name, sub: c.sub, image_url: c.image_url })),
  };
}

/** 후보 구성을 바꾸고 싶을 때: 기존 랭킹을 복사해 새 시즌(초안)으로 */
export function seasonDraft(cup: Worldcup): WorldcupDraft {
  return {
    ...worldcupToDraft(cup),
    id: crypto.randomUUID(),
    title: `${cup.title} · 새 시즌`.slice(0, 100),
    source_season_id: cup.id,
    status: 'draft',
    featured: false,
    candidates: cup.candidates.map((c) => ({ ...newCandidate(), source_candidate_id: c.id, name: c.name, sub: c.sub, image_url: c.image_url })),
  };
}

export async function proposalToDraft(p: Proposal): Promise<WorldcupDraft> {
  const resolve = async (path: string) => (path ? await api.proposalImageUrl(path).catch(() => '') : '');
  return {
    id: crypto.randomUUID(),
    title: p.title,
    description: p.description,
    keywords: p.keywords,
    status: 'published',
    featured: false,
    sort_order: 0,
    thumbnail_url: await resolve(p.thumbnail_path),
    thumbnail_path: p.thumbnail_path || undefined,
    candidates: await Promise.all(
      p.candidates.map(async (c) => ({
        ...newCandidate(),
        name: c.name,
        sub: c.sub,
        image_url: await resolve(c.image_path),
        image_path: c.image_path || undefined,
      })),
    ),
  };
}

/** 운영자 업로드: 줄인 뒤 공개 저장소(media)에 올린다 */
export async function adminUpload(file: File, kind: UploadKind): Promise<{ url: string }> {
  const blob = await compressImage(file, kind === 'candidate' ? IMAGE_PRESETS.candidate : IMAGE_PRESETS.thumbnail);
  return { url: await api.uploadMedia(blob, kind === 'candidate' ? 'candidates' : 'thumbnails') };
}

/** 제안 승인 전: 비공개 저장소에 있는 제안 사진을 공개 저장소로 옮긴다 */
export async function publishProposalImages(draft: WorldcupDraft): Promise<WorldcupDraft> {
  const copy = async (path: string | undefined, url: string) => (path ? await api.adminCopyProposalImage(path) : url);
  return {
    ...draft,
    thumbnail_url: await copy(draft.thumbnail_path, draft.thumbnail_url),
    thumbnail_path: undefined,
    candidates: await Promise.all(
      draft.candidates.map(async (c) => ({ ...c, image_url: await copy(c.image_path, c.image_url), image_path: undefined })),
    ),
  };
}
