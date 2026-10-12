import type { DuelComment, RecordArticle, AccountRow, AdminTv, CommunitySettings, Duel, DuelResult, Profile } from '../types';
import type { Api } from './types';
import { demoWeek, validNickname, youtubeId } from '../community';
const KEY = 'jr:demo-community-v1';
interface Data {
  profiles: Record<string, Profile>;
  duelComments?: (DuelComment & { user_id: string; duel_id: string })[];
  records?: RecordArticle[];
  likes: Record<string, string[]>;
  duels: Duel[];
  votes: Record<string, Record<string, 'A' | 'B'>>;
  videos: (AdminTv & { week: string; reporters: string[] })[];
  settings: CommunitySettings;
}
const initial = (): Data => ({
  profiles: {},
  likes: {},
  duels: [],
  votes: {},
  videos: [],
  settings: {
    banned_words: ['시발', '씨발', '병신', '개새끼', '운영자', '관리자'],
    nickname_days: 30,
    report_threshold: 3,
  },
});
export function communityData(): Data {
  return JSON.parse(localStorage.getItem(KEY) || 'null') || initial();
}
function save(d: Data) {
  localStorage.setItem(KEY, JSON.stringify(d));
}
export function demoMember(id: string) {
  const p = communityData().profiles[id];
  if (!p) throw Error('nickname_required');
  if (p.blocked) throw Error('account_blocked');
  return id;
}
export function demoComment(id: string, user: string, author: string) {
  const d = communityData();
  return {
    nickname: d.profiles[author]?.nickname || '닉네임 미설정',
    likes: d.likes[id]?.length || 0,
    liked: !!d.likes[id]?.includes(user),
  };
}
export function demoCommunity(user: () => string, admin: () => string) {
  const member = () => demoMember(user());
  const result = (id: string): DuelResult => {
    const u = member(),
      votes = communityData().votes[id] || {},
      choice = votes[u] || null;
    if (!choice) return { choice };
    const all = Object.values(votes);
    return {
      choice,
      a: all.filter((c) => c === 'A').length,
      b: all.filter((c) => c === 'B').length,
      total: all.length,
    };
  };
  return {
    async getDuelComments(id) {
      const u = member(),
        d = communityData();
      if (!d.votes[id]?.[u]) throw Error('vote_first');
      return (d.duelComments ?? [])
        .filter((c) => c.duel_id === id)
        .map((c) => ({
          id: c.id,
          choice: c.choice,
          body: c.body,
          created_at: c.created_at,
          is_mine: c.user_id === u,
          nickname: d.profiles[c.user_id]?.nickname ?? '닉네임 미설정',
        }));
    },
    async addDuelComment(id, body) {
      const u = member(),
        d = communityData(),
        choice = d.votes[id]?.[u];
      if (!choice) throw Error('vote_first');
      if (!d.duels.some((x) => x.id === id && x.status === 'published')) throw Error('voting_closed');
      if (!body.trim() || [...body.trim()].length > 150) throw Error('check constraint');
      d.duelComments ??= [];
      if (d.duelComments.some((c) => c.duel_id === id && c.user_id === u)) throw Error('duel_comment_exists');
      d.duelComments.push({
        id: crypto.randomUUID(),
        duel_id: id,
        user_id: u,
        body: body.trim(),
        choice,
        nickname: d.profiles[u].nickname,
        created_at: new Date().toISOString(),
        is_mine: true,
      });
      save(d);
    },
    async listRecords() {
      return communityData().records ?? [];
    },
    async adminAddRecord(title, imageUrl) {
      admin();
      const d = communityData();
      d.records ??= [];
      d.records.unshift({ id: crypto.randomUUID(), title, image_url: imageUrl, created_at: new Date().toISOString() });
      save(d);
    },
    async adminDeleteRecord(id) {
      admin();
      const d = communityData();
      d.records = (d.records ?? []).filter((r) => r.id !== id);
      save(d);
    },
    async getProfile() {
      return communityData().profiles[user()] || null;
    },
    async saveNickname(nickname) {
      const u = user(),
        d = communityData(),
        n = nickname.trim(),
        p = d.profiles[u];
      if (p?.blocked) throw Error('account_blocked');
      if (!validNickname(n)) throw Error('invalid_nickname');
      if (d.settings.banned_words.some((w) => w && n.toLowerCase().includes(w.toLowerCase()))) throw Error('banned_nickname');
      if (Object.entries(d.profiles).some(([id, p]) => id !== u && p.nickname.toLowerCase() === n.toLowerCase())) throw Error('nickname_taken');
      if (p?.nickname === n) return;
      if (p && Date.parse(p.next_change_at) > Date.now()) throw Error('nickname_cooldown');
      d.profiles[u] = {
        nickname: n,
        blocked: false,
        nickname_changed_at: new Date().toISOString(),
        next_change_at: new Date(Date.now() + d.settings.nickname_days * 86400000).toISOString(),
      };
      save(d);
    },
    async setCommentLike(id, liked) {
      const u = member(),
        d = communityData(),
        likes = d.likes[id] || [];
      d.likes[id] = liked ? [...new Set([...likes, u])] : likes.filter((x) => x !== u);
      save(d);
    },
    async listDuels() {
      return communityData().duels;
    },
    async duelResult(id) {
      return result(id);
    },
    async voteDuel(id, choice) {
      const u = member(),
        d = communityData();
      if (!d.duels.some((x) => x.id === id && x.status === 'published')) throw Error('voting_closed');
      d.votes[id] ??= {};
      if (d.votes[id][u]) throw Error('already_voted');
      d.votes[id][u] = choice;
      save(d);
      return result(id);
    },
    async adminSaveDuel(draft) {
      admin();
      const d = communityData(),
        old = d.duels.find((x) => x.id === draft.id);
      if (old) Object.assign(old, draft);
      else
        d.duels.unshift({
          ...draft,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        });
      save(d);
    },
    async tvPage(requested) {
      const d = communityData(),
        pages = Math.max(1, Math.ceil(d.videos.length / 12)),
        page = Math.max(1, Math.min(requested ?? pages, pages));
      return {
        page,
        pages,
        items: d.videos.slice((page - 1) * 12, page * 12).map((v) => {
          const off =
            ['hidden', 'deleted'].includes(v.moderation) || (v.moderation !== 'restored' && v.reporters.length >= d.settings.report_threshold);
          return {
            id: v.id,
            video_id: off ? null : v.video_id,
            nickname: off ? '' : d.profiles[v.user_id]?.nickname || '닉네임 미설정',
            off,
          };
        }),
      };
    },
    async tvEligibility() {
      const u = member(),
        week = demoWeek();
      return {
        can_recommend: !communityData().videos.some((v) => v.user_id === u && v.week === week),
        next_reset: new Date(Date.parse(week) + 7 * 86400000).toISOString(),
      };
    },
    async recommendVideo(url) {
      const u = member(),
        d = communityData(),
        id = youtubeId(url),
        week = demoWeek();
      if (d.videos.some((v) => v.user_id === u && v.week === week)) throw Error('weekly_limit');
      d.videos.push({
        id: (d.videos.at(-1)?.id || 0) + 1,
        user_id: u,
        video_id: id,
        nickname: d.profiles[u].nickname,
        reports: 0,
        reporters: [],
        week,
        moderation: 'visible',
        created_at: new Date().toISOString(),
      });
      save(d);
    },
    async reportVideo(id) {
      const u = member(),
        d = communityData(),
        v = d.videos.find((x) => x.id === id);
      if (!v) throw Error('not_found');
      if (v.reporters.includes(u)) throw Error('already_reported');
      v.reporters.push(u);
      v.reports = v.reporters.length;
      save(d);
    },
    async adminTv() {
      admin();
      return [...communityData().videos].reverse();
    },
    async adminModerateVideo(id, action) {
      admin();
      const d = communityData(),
        v = d.videos.find((x) => x.id === id);
      if (v?.moderation === 'deleted') throw Error('deleted_video');
      if (v) {
        v.moderation = action;
        if (action === 'deleted') v.video_id = null;
      }
      save(d);
    },
    async adminAccounts() {
      admin();
      return Object.entries(communityData().profiles).map(([user_id, p]): AccountRow => ({
        user_id,
        nickname: p.nickname,
        blocked: p.blocked,
      }));
    },
    async adminBlockAccount(id, blocked) {
      const u = admin();
      if (id === u) throw Error('본인 계정은 차단할 수 없어요.');
      const d = communityData();
      if (d.profiles[id]) d.profiles[id].blocked = blocked;
      save(d);
    },
    async adminCommunitySettings() {
      admin();
      return communityData().settings;
    },
    async adminSaveCommunitySettings(settings) {
      admin();
      const d = communityData();
      d.settings = settings;
      save(d);
    },
  } satisfies Pick<
    Api,
    | 'getDuelComments'
    | 'addDuelComment'
    | 'listRecords'
    | 'adminAddRecord'
    | 'adminDeleteRecord'
    | 'getProfile'
    | 'saveNickname'
    | 'setCommentLike'
    | 'listDuels'
    | 'duelResult'
    | 'voteDuel'
    | 'adminSaveDuel'
    | 'tvPage'
    | 'tvEligibility'
    | 'recommendVideo'
    | 'reportVideo'
    | 'adminTv'
    | 'adminModerateVideo'
    | 'adminAccounts'
    | 'adminBlockAccount'
    | 'adminCommunitySettings'
    | 'adminSaveCommunitySettings'
  >;
}
