// 데모 모드: Supabase 키가 없을 때 이 브라우저의 저장소만으로 모든 기능을 흉내 낸다.
// 실제 서비스에서는 쓰이지 않는다. 데이터는 이 기기에만 남는다.
import { blobToDataUrl } from '../image';
import { kstToday } from '../format';
import { computeRanking, verifyMatches } from '../ranking';
import { playRandomBracket } from '../tournament';
import type {
  AdBanner,
  AdminComment,
  Ballot,
  Candidate,
  FeedbackItem,
  FeedbackStatus,
  FeedbackType,
  Match,
  Proposal,
  SiteSettings,
  Survey,
  SurveyInput,
  SurveyRequest,
  Worldcup,
} from '../types';
import { seedWorldcups, seededRandom } from './demoSeed';
import type { Api } from './types';

const KEY = 'jr:demo-db-v1';
const USER_KEY = 'jr:demo-user';
export const DEMO_USER = '00000000-0000-4000-8000-0000000000d1';
export const DEMO_ADMIN = '00000000-0000-4000-8000-0000000000d0';

interface DemoBallot {
  user_id: string;
  worldcup_id: string;
  champion_id: string;
  runner_up_id: string;
  matches: Match[];
  created_at: string;
  updated_at: string;
}

interface DemoDb {
  worldcups: Worldcup[];
  ballots: DemoBallot[];
  comments: (AdminComment & { user_id: string })[];
  feedback: (Omit<FeedbackItem, 'comment'> & { user_id: string })[];
  proposals: (Proposal & { user_id: string })[];
  surveys: (Omit<Survey, 'is_mine'> & { user_id: string; deleted: boolean })[];
  surveyRequests: (Omit<SurveyRequest, 'survey'> & { user_id: string })[];
  ads: AdBanner[];
  settings: SiteSettings;
  views: string[];
  completions: Record<string, { champion: string; runner: string }>;
  proposalImages: Record<string, string>;
}

function freshDb(): DemoDb {
  const worldcups = seedWorldcups();
  const ballots: DemoBallot[] = [];
  const completions: DemoDb['completions'] = {};
  // 순위 화면이 비어 보이지 않도록 가상의 참여 기록을 만든다
  worldcups.forEach((cup, ci) => {
    const rand = seededRandom(ci + 7);
    const ids = cup.candidates.map((c) => c.id);
    const weights = new Map(ids.map((id) => [id, 0.2 + rand()]));
    const voters = 14 + Math.floor(rand() * 30);
    for (let v = 0; v < voters; v++) {
      const matches = playRandomBracket(ids, rand, weights);
      const { champion, runner } = verifyMatches(ids, matches);
      const at = new Date(Date.parse(cup.created_at) + v * 3600_000).toISOString();
      if (v % 3 === 0) {
        ballots.push({ user_id: `seed-${ci}-${v}`, worldcup_id: cup.id, champion_id: champion, runner_up_id: runner, matches, created_at: at, updated_at: at });
      }
      completions[`${cup.id}|seed-${v}`] = { champion, runner };
    }
  });
  return {
    worldcups,
    ballots,
    comments: [
      { id: crypto.randomUUID(), user_id: 'seed-a', worldcup_id: 'food', body: '진주에 왔으면 냉면은 꼭 먹어야죠!', hidden: false, created_at: '2026-10-10T12:30:00+09:00' },
      { id: crypto.randomUUID(), user_id: 'seed-b', worldcup_id: 'food', body: '육전 단독 메뉴로 나와서 반가워요 ㅎㅎ', hidden: false, created_at: '2026-10-10T18:10:00+09:00' },
    ],
    feedback: [],
    proposals: [],
    surveys: [
      {
        id: crypto.randomUUID(),
        user_id: 'seed-a',
        title: '진주 시내버스 이용 경험 설문 (예시)',
        body: '데모용 예시 글입니다.\n\n버스를 타면서 불편했던 점을 알려주세요.',
        url: 'https://forms.gle/example',
        publish_on: kstToday(),
        expires_on: kstToday(new Date(Date.now() + 14 * 86400_000)),
        created_at: new Date().toISOString(),
        deleted: false,
      },
    ],
    surveyRequests: [],
    ads: [1, 2, 3, 4].map((slot) => ({ slot, title: '', image_url: '', link_url: '', active: false })),
    settings: { contact_email: '' },
    views: [],
    completions,
    proposalImages: {},
  };
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoDb;
  } catch {
    /* 새로 만든다 */
  }
  const db = freshDb();
  save(db);
  return db;
}

function save(db: DemoDb) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    throw new Error('브라우저 저장 공간이 가득 찼어요. 데모 데이터를 초기화하거나 사진을 줄여주세요.');
  }
}

function currentUser(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

function requireUser(): string {
  const u = currentUser();
  if (!u) throw new Error('login_required');
  return u;
}

function requireAdmin(): string {
  const u = requireUser();
  if (u !== DEMO_ADMIN) throw new Error('admin_only');
  return u;
}

const delay = <T,>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), 120));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const since = () => new Date(kstToday() + 'T00:00:00+09:00').getTime();

export function resetDemo() {
  localStorage.removeItem(KEY);
}

export function createDemoApi(): Api {
  const listeners = new Set<(u: { id: string } | null) => void>();
  const emit = () => {
    const u = currentUser();
    listeners.forEach((l) => l(u ? { id: u } : null));
  };

  const api: Api = {
    mode: 'demo',

    async getUser() {
      const u = currentUser();
      return u ? { id: u } : null;
    },

    onAuthChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    async signIn(provider, next) {
      if (provider !== 'demo-user' && provider !== 'demo-admin') {
        throw new Error('데모 모드에서는 카카오 로그인을 쓸 수 없어요. 아래 데모 로그인을 눌러주세요.');
      }
      localStorage.setItem(USER_KEY, provider === 'demo-admin' ? DEMO_ADMIN : DEMO_USER);
      emit();
      location.assign(`/auth/callback?next=${encodeURIComponent(next)}`);
    },

    async signOut() {
      localStorage.removeItem(USER_KEY);
      emit();
    },

    async isAdmin() {
      return currentUser() === DEMO_ADMIN;
    },

    async listWorldcups() {
      const db = load();
      return delay(
        clone(db.worldcups.filter((w) => w.status === 'published'))
          .map((w) => ({ ...w, candidates: w.candidates.filter((c) => c.active) }))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
    },

    async publicStats() {
      const db = load();
      const out: Record<string, { completions: number; top_ids: string[] }> = {};
      for (const w of db.worldcups.filter((x) => x.status === 'published')) {
        const entries = Object.entries(db.completions).filter(([k]) => k.startsWith(w.id + '|')).map(([, v]) => v);
        const score = (id: string) => entries.filter((e) => e.champion === id).length * 1000 + entries.filter((e) => e.runner === id).length;
        const top = w.candidates
          .filter((c) => c.active && c.image_url)
          .sort((a, b) => score(b.id) - score(a.id) || a.sort_order - b.sort_order)
          .slice(0, 2)
          .map((c) => c.id);
        out[w.id] = { completions: entries.length, top_ids: top };
      }
      return delay(out);
    },

    async getSiteConfig() {
      const db = load();
      return delay({ ads: clone(db.ads), settings: clone(db.settings) });
    },

    async recordView(worldcupId, visitor) {
      const db = load();
      const key = `${worldcupId}|${visitor}|${kstToday()}`;
      if (!db.views.includes(key)) {
        db.views.push(key);
        save(db);
      }
    },

    async recordCompletion(worldcupId, visitor, champion, runner) {
      const db = load();
      db.completions[`${worldcupId}|${visitor}`] = { champion, runner };
      save(db);
    },

    async getMyBallot(worldcupId) {
      const user = requireUser();
      const b = load().ballots.find((x) => x.user_id === user && x.worldcup_id === worldcupId);
      return delay(b ? ({ worldcup_id: b.worldcup_id, champion_id: b.champion_id, runner_up_id: b.runner_up_id, updated_at: b.updated_at } satisfies Ballot) : null);
    },

    async submitBallot(worldcupId, matches, replace) {
      const user = requireUser();
      const db = load();
      const cup = db.worldcups.find((w) => w.id === worldcupId && w.status === 'published');
      if (!cup) throw new Error('worldcup_not_found');
      const ids = cup.candidates.filter((c) => c.active).map((c) => c.id);
      const { champion, runner } = verifyMatches(ids, matches);
      const now = new Date().toISOString();
      const existing = db.ballots.find((b) => b.user_id === user && b.worldcup_id === worldcupId);
      if (existing) {
        if (!replace) return delay('exists' as const);
        Object.assign(existing, { champion_id: champion, runner_up_id: runner, matches, updated_at: now });
        save(db);
        return delay('replaced' as const);
      }
      db.ballots.push({ user_id: user, worldcup_id: worldcupId, champion_id: champion, runner_up_id: runner, matches, created_at: now, updated_at: now });
      save(db);
      return delay('created' as const);
    },

    async getRanking(worldcupId) {
      requireUser();
      const db = load();
      const cup = db.worldcups.find((w) => w.id === worldcupId);
      if (!cup) throw new Error('worldcup_not_found');
      return delay(computeRanking(cup.candidates, db.ballots.filter((b) => b.worldcup_id === worldcupId)));
    },

    async listComments(worldcupId) {
      const user = requireUser();
      return delay(
        load()
          .comments.filter((c) => c.worldcup_id === worldcupId && (!c.hidden || c.user_id === user))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((c) => ({ id: c.id, body: c.body, created_at: c.created_at, is_mine: c.user_id === user, hidden: c.hidden })),
      );
    },

    async addComment(worldcupId, body) {
      const user = requireUser();
      const db = load();
      const text = body.trim();
      if (!text || text.length > 200) throw new Error('check constraint');
      if (db.comments.some((c) => c.user_id === user && c.worldcup_id === worldcupId)) {
        throw new Error('comments_user_id_worldcup_id_key');
      }
      db.comments.push({ id: crypto.randomUUID(), user_id: user, worldcup_id: worldcupId, body: text, hidden: false, created_at: new Date().toISOString() });
      save(db);
    },

    async deleteComment(id) {
      const user = requireUser();
      const db = load();
      db.comments = db.comments.filter((c) => !(c.id === id && (c.user_id === user || user === DEMO_ADMIN)));
      save(db);
    },

    async sendFeedback({ worldcupId, type, body, candidateId, commentId }) {
      const user = requireUser();
      const db = load();
      const today = db.feedback.filter((f) => f.user_id === user && f.worldcup_id === worldcupId && Date.parse(f.created_at) >= since());
      if (today.length >= 5 && user !== DEMO_ADMIN) throw new Error('daily_limit');
      if (body.length > 300) throw new Error('check constraint');
      db.feedback.push({
        id: crypto.randomUUID(),
        user_id: user,
        worldcup_id: worldcupId,
        type: type as FeedbackType,
        body: body.trim(),
        candidate_id: candidateId ?? null,
        comment_id: commentId ?? null,
        status: 'new',
        created_at: new Date().toISOString(),
      });
      save(db);
    },

    async uploadProposalImage(blob) {
      const user = requireUser();
      const db = load();
      const path = `${user}/${crypto.randomUUID()}.webp`;
      db.proposalImages[path] = await blobToDataUrl(blob);
      save(db);
      return { path, url: db.proposalImages[path] };
    },

    async proposalImageUrl(path) {
      return load().proposalImages[path] ?? '';
    },

    async submitProposal(input) {
      const user = requireUser();
      const db = load();
      const today = db.proposals.filter((p) => p.user_id === user && Date.parse(p.created_at) >= since());
      if (today.length >= 3 && user !== DEMO_ADMIN) throw new Error('daily_limit');
      db.proposals.push({ ...input, id: crypto.randomUUID(), user_id: user, status: 'pending', worldcup_id: null, created_at: new Date().toISOString() });
      save(db);
    },

    async listSurveys() {
      const user = currentUser();
      const today = kstToday();
      return delay(
        load()
          .surveys.filter((s) => !s.deleted && (s.publish_on <= today || s.user_id === user || user === DEMO_ADMIN))
          .sort((a, b) => b.publish_on.localeCompare(a.publish_on) || b.created_at.localeCompare(a.created_at))
          .map(({ user_id, deleted: _deleted, ...s }) => ({ ...s, is_mine: !!user && user_id === user })),
      );
    },

    async createSurvey(input: SurveyInput) {
      const user = requireUser();
      const db = load();
      if (input.publish_on < kstToday(new Date(Date.now() - 86400_000))) throw new Error('row-level security');
      const today = db.surveys.filter((s) => s.user_id === user && Date.parse(s.created_at) >= since());
      if (today.length >= 3 && user !== DEMO_ADMIN) throw new Error('daily_limit');
      db.surveys.push({ ...input, id: crypto.randomUUID(), user_id: user, deleted: false, created_at: new Date().toISOString() });
      save(db);
    },

    async requestSurveyChange({ surveyId, kind, reason, payload }) {
      const user = requireUser();
      const db = load();
      if (!db.surveys.some((s) => s.id === surveyId && s.user_id === user)) throw new Error('row-level security');
      db.surveyRequests.push({ id: crypto.randomUUID(), user_id: user, survey_id: surveyId, kind, reason, payload: payload ?? null, status: 'pending', created_at: new Date().toISOString() });
      save(db);
    },

    async adminListWorldcups() {
      requireAdmin();
      const db = load();
      return delay(
        clone(db.worldcups)
          .map((w) => ({ ...w, candidates: w.candidates.filter((c) => c.active) }))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
    },

    async adminStats() {
      requireAdmin();
      const db = load();
      return delay(
        db.worldcups.map((w) => ({
          worldcup_id: w.id,
          views: db.views.filter((v) => v.startsWith(w.id + '|')).length,
          completions: Object.keys(db.completions).filter((k) => k.startsWith(w.id + '|')).length,
          participants: db.ballots.filter((b) => b.worldcup_id === w.id).length,
          comments: db.comments.filter((c) => c.worldcup_id === w.id).length,
        })),
      );
    },

    async adminSaveWorldcup(draft, proposalId) {
      requireAdmin();
      const db = load();
      const now = new Date().toISOString();
      let cup = draft.id ? db.worldcups.find((w) => w.id === draft.id) : undefined;
      const wasPublished = !!cup?.published_at;
      const keep = new Set(draft.candidates.map((c) => c.id).filter(Boolean));
      if (cup && wasPublished && cup.candidates.some((c) => c.active && !keep.has(c.id))) throw new Error('published_locked');
      if (wasPublished && draft.candidates.some((c) => !c.id || !cup!.candidates.some((x) => x.id === c.id))) throw new Error('published_locked');
      const names = draft.candidates.map((c) => c.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) throw new Error('duplicate_name');
      const n = draft.candidates.length;
      if (draft.status === 'published' && ![4, 8, 16, 32, 64, 128].includes(n)) throw new Error('invalid_candidate_count');

      if (!cup) {
        cup = {
          id: draft.id ?? crypto.randomUUID(),
          slug: Math.random().toString(36).slice(2, 12),
          created_at: now,
          published_at: null,
        } as Worldcup;
        cup.candidates = [];
        db.worldcups.push(cup);
      }
      const previous: Candidate[] = cup.candidates.map((c) => ({ ...c, active: false }));
      const next: Candidate[] = draft.candidates.map((c, i) => ({
        id: c.id ?? crypto.randomUUID(),
        name: c.name.trim(),
        sub: c.sub.trim(),
        image_url: c.image_url,
        sort_order: i,
        active: true,
      }));
      const nextIds = new Set(next.map((c) => c.id));
      Object.assign(cup, {
        title: draft.title.trim(),
        description: draft.description.trim(),
        keywords: draft.keywords.trim(),
        status: draft.status,
        featured: draft.featured,
        sort_order: draft.sort_order,
        thumbnail_url: draft.thumbnail_url,
        candidate_count: n,
        published_at: draft.status === 'published' ? cup.published_at ?? now : cup.published_at,
        candidates: [...previous.filter((c) => !nextIds.has(c.id)), ...next],
      });
      if (proposalId) {
        const p = db.proposals.find((x) => x.id === proposalId);
        if (p) Object.assign(p, { status: 'approved', worldcup_id: cup.id });
      }
      save(db);
      return cup.id;
    },

    async uploadMedia(blob) {
      requireAdmin();
      return blobToDataUrl(blob);
    },

    async adminCopyProposalImage(path) {
      requireAdmin();
      return load().proposalImages[path] ?? '';
    },

    async adminListProposals() {
      requireAdmin();
      return delay(clone(load().proposals).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },

    async adminRejectProposal(id) {
      requireAdmin();
      const db = load();
      const p = db.proposals.find((x) => x.id === id);
      if (p) p.status = 'rejected';
      save(db);
    },

    async adminListFeedback() {
      requireAdmin();
      const db = load();
      return delay(
        db.feedback
          .map((f) => {
            const c = db.comments.find((x) => x.id === f.comment_id);
            return { ...f, comment: c ? { body: c.body, hidden: c.hidden } : null };
          })
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
    },

    async adminSetFeedbackStatus(id, status: FeedbackStatus) {
      requireAdmin();
      const db = load();
      const f = db.feedback.find((x) => x.id === id);
      if (f) f.status = status;
      save(db);
    },

    async adminListComments() {
      requireAdmin();
      return delay(
        load()
          .comments.map(({ user_id: _u, ...c }) => c)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
    },

    async adminSetCommentHidden(id, hidden) {
      requireAdmin();
      const db = load();
      const c = db.comments.find((x) => x.id === id);
      if (c) c.hidden = hidden;
      save(db);
    },

    async adminDeleteComment(id) {
      requireAdmin();
      const db = load();
      db.comments = db.comments.filter((c) => c.id !== id);
      save(db);
    },

    async adminSaveSiteConfig(ads, settings) {
      requireAdmin();
      const db = load();
      db.ads = clone(ads);
      db.settings = clone(settings);
      save(db);
    },

    async adminListSurveyRequests() {
      requireAdmin();
      const db = load();
      return delay(
        db.surveyRequests
          .filter((r) => r.status === 'pending')
          .map(({ user_id: _u, ...r }) => {
            const s = db.surveys.find((x) => x.id === r.survey_id);
            return { ...r, survey: s ? { title: s.title, body: s.body, url: s.url, publish_on: s.publish_on, expires_on: s.expires_on } : null };
          }),
      );
    },

    async adminReviewSurveyRequest(id, action) {
      requireAdmin();
      const db = load();
      const r = db.surveyRequests.find((x) => x.id === id && x.status === 'pending');
      if (!r) throw new Error('요청을 찾을 수 없어요.');
      const s = db.surveys.find((x) => x.id === r.survey_id);
      if (action === 'approve' && s) {
        if (r.kind === 'delete') s.deleted = true;
        else if (r.payload) Object.assign(s, r.payload);
      }
      r.status = action === 'approve' ? 'approved' : 'rejected';
      save(db);
    },
  };
  return api;
}
