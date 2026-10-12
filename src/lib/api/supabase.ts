import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AdBanner,
  AdminComment,
  AdminStats,
  Ballot,
  CommentItem,
  FeedbackItem,
  Proposal,
  PublicStats,
  RankingResult,
  SubmitStatus,
  Survey,
  SurveyRequest,
  Worldcup,
} from '../types';
import type { Api } from './types';

function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

function sortCandidates(cup: Worldcup): Worldcup {
  return {
    ...cup,
    candidates: [...(cup.candidates ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  };
}

export function createSupabaseApi(url: string, key: string): Api {
  const sb: SupabaseClient = createClient(url, key, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const requireUser = async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new Error('login_required');
    return data.session.user;
  };

  const api: Api = {
    mode: 'supabase',
    async getSeasonRanks(id) {
      return check(await sb.rpc('get_season_ranks', { p_id: id }));
    },
    async getDuelComments(id) {
      return check(await sb.rpc('get_duel_comments', { p_id: id }));
    },
    async addDuelComment(id, body) {
      check(await sb.rpc('add_duel_comment', { p_id: id, p_body: body }));
    },
    async listRecords() {
      return check(await sb.from('records').select('*').order('created_at', { ascending: false })) ?? [];
    },
    async adminAddRecord(title, imageUrl) {
      check(await sb.from('records').insert({ title: title.trim(), image_url: imageUrl }));
    },
    async adminDeleteRecord(id) {
      check(await sb.from('records').delete().eq('id', id));
    },
    async getProfile() {
      return check(await sb.rpc('my_profile'));
    },
    async saveNickname(nickname) {
      check(await sb.rpc('save_nickname', { p_nickname: nickname }));
    },
    async setCommentLike(id, liked) {
      check(await sb.rpc('set_comment_like', { p_comment_id: id, p_liked: liked }));
    },
    async myProposals() {
      const u = await requireUser();
      return (
        check(
          await sb
            .from('proposals')
            .select('id,title,description,keywords,thumbnail_path,candidates,status,worldcup_id,created_at,review_note')
            .eq('user_id', u.id)
            .order('created_at', { ascending: false }),
        ) ?? []
      );
    },
    async cancelProposal(id) {
      check(await sb.rpc('cancel_proposal', { p_id: id }));
    },
    async listDuels() {
      return check(await sb.from('duels').select('*').order('created_at', { ascending: false })) ?? [];
    },
    async duelResult(id) {
      return check(await sb.rpc('duel_result', { p_id: id }));
    },
    async voteDuel(id, choice) {
      return check(await sb.rpc('vote_duel', { p_id: id, p_choice: choice }));
    },
    async adminSaveDuel(draft) {
      const { id, ...fields } = draft;
      check(id ? await sb.from('duels').update(fields).eq('id', id) : await sb.from('duels').insert(fields));
    },
    async tvPage(page) {
      return check(await sb.rpc('tv_page', { p_page: page ?? null }));
    },
    async tvEligibility() {
      return check(await sb.rpc('tv_eligibility'));
    },
    async recommendVideo(url) {
      check(await sb.rpc('recommend_video', { p_url: url }));
    },
    async reportVideo(id) {
      check(await sb.rpc('report_video', { p_id: id }));
    },
    async adminTv() {
      return check(await sb.rpc('admin_tv'));
    },
    async adminModerateVideo(id, action) {
      check(await sb.rpc('admin_moderate_video', { p_id: id, p_action: action }));
    },
    async adminAccounts() {
      return check(await sb.rpc('admin_accounts'));
    },
    async adminBlockAccount(id, blocked) {
      check(
        await sb.rpc('admin_block_account', {
          p_user_id: id,
          p_blocked: blocked,
        }),
      );
    },
    async adminCommunitySettings() {
      return check(await sb.from('community_settings').select('banned_words,nickname_days,report_threshold').eq('id', 1).single())!;
    },
    async adminSaveCommunitySettings(settings) {
      check(await sb.from('community_settings').update(settings).eq('id', 1));
    },

    async getUser() {
      const { data } = await sb.auth.getSession();
      return data.session ? { id: data.session.user.id } : null;
    },

    onAuthChange(callback) {
      // 이 콜백 안에서 바로 다른 Supabase 요청을 하면 멈출 수 있어 한 박자 늦춰 실행한다
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => callback(session ? { id: session.user.id } : null), 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(provider, next) {
      if (provider !== 'kakao' && provider !== 'google') throw new Error('지원하지 않는 로그인 방식이에요.');
      const redirectTo = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async isAdmin() {
      const { data, error } = await sb.rpc('is_admin');
      if (error) return false;
      return data === true;
    },

    async listWorldcups() {
      const rows = check(
        await sb
          .from('worldcups')
          .select('*, candidates(*)')
          .eq('status', 'published')
          .eq('candidates.active', true)
          .order('created_at', { ascending: false }),
      ) as Worldcup[];
      return rows.map(sortCandidates);
    },

    async publicStats() {
      const rows = check(await sb.rpc('public_worldcup_stats')) as {
        worldcup_id: string;
        completions: number;
        top_ids: string[];
      }[];
      const out: Record<string, PublicStats> = {};
      for (const r of rows ?? [])
        out[r.worldcup_id] = {
          completions: r.completions,
          top_ids: r.top_ids ?? [],
        };
      return out;
    },

    async getSiteConfig() {
      const [ads, settings] = await Promise.all([
        sb.from('ad_banners').select('*').order('slot'),
        sb.from('site_settings').select('contact_email').eq('id', 1).maybeSingle(),
      ]);
      return {
        ads: (check(ads) as AdBanner[]) ?? [],
        settings: {
          contact_email: (check(settings) as { contact_email: string } | null)?.contact_email ?? '',
        },
      };
    },

    async recordView(worldcupId, visitor) {
      await sb.rpc('record_view', {
        p_worldcup_id: worldcupId,
        p_visitor: visitor,
      });
    },

    async recordCompletion(worldcupId, visitor, champion, runner) {
      await sb.rpc('record_completion', {
        p_worldcup_id: worldcupId,
        p_visitor: visitor,
        p_champion: champion,
        p_runner: runner,
      });
    },

    async getMyBallot(worldcupId) {
      const user = await requireUser();
      const row = check(
        await sb
          .from('ballots')
          .select('worldcup_id, champion_id, runner_up_id, updated_at')
          .eq('worldcup_id', worldcupId)
          .eq('user_id', user.id)
          .maybeSingle(),
      );
      return (row as Ballot | null) ?? null;
    },

    async submitBallot(worldcupId, matches, replace) {
      const data = check(
        await sb.rpc('submit_ballot', {
          p_worldcup_id: worldcupId,
          p_matches: matches,
          p_replace: replace,
        }),
      ) as { status: SubmitStatus };
      return data.status;
    },

    async getRanking(worldcupId) {
      return check(await sb.rpc('get_ranking', { p_worldcup_id: worldcupId })) as RankingResult;
    },

    async listComments(worldcupId) {
      return (check(await sb.rpc('get_comments', { p_worldcup_id: worldcupId })) as CommentItem[]) ?? [];
    },

    async addComment(worldcupId, body) {
      check(await sb.from('comments').insert({ worldcup_id: worldcupId, body: body.trim() }));
    },

    async deleteComment(id) {
      check(await sb.from('comments').delete().eq('id', id));
    },

    async sendFeedback({ worldcupId, type, body, candidateId, commentId }) {
      check(
        await sb.from('feedback').insert({
          worldcup_id: worldcupId,
          type,
          body: body.trim(),
          candidate_id: candidateId || null,
          comment_id: commentId || null,
        }),
      );
    },

    async uploadProposalImage(blob) {
      const user = await requireUser();
      const path = `${user.id}/${crypto.randomUUID()}.webp`;
      check(await sb.storage.from('proposal-media').upload(path, blob, { contentType: 'image/webp' }));
      return { path, url: await api.proposalImageUrl(path) };
    },

    async proposalImageUrl(path) {
      const data = check(await sb.storage.from('proposal-media').createSignedUrl(path, 60 * 60));
      return data?.signedUrl ?? '';
    },

    async submitProposal(input) {
      check(await sb.from('proposals').insert(input));
    },

    async listSurveys() {
      return (check(await sb.rpc('list_surveys')) as Survey[]) ?? [];
    },

    async createSurvey(input) {
      check(await sb.from('surveys').insert({ ...input, consent_at: new Date().toISOString() }));
    },

    async requestSurveyChange({ surveyId, kind, reason, payload }) {
      check(
        await sb.from('survey_requests').insert({
          survey_id: surveyId,
          kind,
          reason,
          payload: payload ?? null,
        }),
      );
    },

    async adminListWorldcups() {
      const rows = check(
        await sb.from('worldcups').select('*, candidates(*)').eq('candidates.active', true).order('created_at', { ascending: false }),
      ) as Worldcup[];
      return rows.map(sortCandidates);
    },

    async adminStats() {
      return (check(await sb.rpc('admin_worldcup_stats')) as AdminStats[]) ?? [];
    },

    async adminSaveWorldcup(draft, proposalId) {
      const p = {
        id: draft.id ?? null,
        source_season_id: draft.source_season_id ?? null,
        title: draft.title.trim(),
        description: draft.description.trim(),
        keywords: draft.keywords.trim(),
        status: draft.status,
        featured: draft.featured,
        sort_order: draft.sort_order,
        thumbnail_url: draft.thumbnail_url,
        candidates: draft.candidates.map((c) => ({
          id: c.id ?? null,
          source_candidate_id: c.source_candidate_id ?? null,
          name: c.name.trim(),
          sub: c.sub.trim(),
          image_url: c.image_url,
        })),
      };
      return check(
        await sb.rpc('admin_save_worldcup', {
          p,
          p_proposal_id: proposalId ?? null,
        }),
      ) as string;
    },

    async uploadMedia(blob, folder) {
      const path = `${folder}/${crypto.randomUUID()}.webp`;
      check(
        await sb.storage.from('media').upload(path, blob, {
          contentType: 'image/webp',
          cacheControl: '31536000',
        }),
      );
      return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    },

    async adminCopyProposalImage(path) {
      const blob = check(await sb.storage.from('proposal-media').download(path)) as Blob;
      return api.uploadMedia(blob, 'candidates');
    },

    async adminListProposals() {
      return (check(await sb.from('proposals').select('*').order('created_at', { ascending: false }).limit(200)) as Proposal[]) ?? [];
    },

    async adminRejectProposal(id, note = '') {
      check(await sb.rpc('reject_proposal', { p_id: id, p_note: note }));
    },

    async adminListFeedback() {
      return (
        (check(
          await sb.from('feedback').select('*, comment:comments(body, hidden)').order('created_at', { ascending: false }).limit(500),
        ) as FeedbackItem[]) ?? []
      );
    },

    async adminSetFeedbackStatus(id, status) {
      check(await sb.from('feedback').update({ status }).eq('id', id));
    },

    async adminListComments() {
      return (
        (check(
          await sb.from('comments').select('id, worldcup_id, body, hidden, created_at').order('created_at', { ascending: false }).limit(1000),
        ) as AdminComment[]) ?? []
      );
    },

    async adminSetCommentHidden(id, hidden) {
      check(await sb.from('comments').update({ hidden }).eq('id', id));
    },

    async adminDeleteComment(id) {
      check(await sb.from('comments').delete().eq('id', id));
    },

    async adminSaveSiteConfig(ads, settings) {
      for (const ad of ads) {
        check(
          await sb
            .from('ad_banners')
            .update({
              title: ad.title.trim(),
              image_url: ad.image_url,
              link_url: ad.link_url.trim(),
              active: ad.active,
            })
            .eq('slot', ad.slot),
        );
      }
      check(await sb.from('site_settings').update({ contact_email: settings.contact_email.trim() }).eq('id', 1));
    },

    async adminListSurveyRequests() {
      const rows = check(
        await sb
          .from('survey_requests')
          .select('*, survey:surveys(title, body, url, publish_on, expires_on)')
          .eq('status', 'pending')
          .order('created_at'),
      );
      return (rows as SurveyRequest[]) ?? [];
    },

    async adminReviewSurveyRequest(id, action) {
      check(
        await sb.rpc('admin_review_survey_request', {
          p_id: id,
          p_action: action,
        }),
      );
    },
  };

  return api;
}
