import type {
  AdBanner,
  AdminComment,
  AdminStats,
  Ballot,
  CommentItem,
  FeedbackItem,
  FeedbackStatus,
  FeedbackType,
  Match,
  Proposal,
  ProposalCandidate,
  PublicStats,
  RankingResult,
  SessionUser,
  SiteSettings,
  SubmitStatus,
  Survey,
  SurveyInput,
  SurveyRequest,
  Worldcup,
  WorldcupDraft,
} from '../types';

export type LoginProvider = 'kakao' | 'google' | 'demo-user' | 'demo-admin';
export type MediaFolder = 'thumbnails' | 'candidates' | 'banners';

/**
 * 화면은 이 인터페이스만 사용한다.
 * Supabase 키가 있으면 supabase.ts, 없으면 브라우저에만 저장하는 demo.ts 가 쓰인다.
 */
export interface Api {
  mode: 'supabase' | 'demo';

  // 로그인
  getUser(): Promise<SessionUser | null>;
  onAuthChange(callback: (user: SessionUser | null) => void): () => void;
  signIn(provider: LoginProvider, next: string): Promise<void>;
  signOut(): Promise<void>;
  isAdmin(): Promise<boolean>;

  // 공개 콘텐츠
  listWorldcups(): Promise<Worldcup[]>;
  publicStats(): Promise<Record<string, PublicStats>>;
  getSiteConfig(): Promise<{ ads: AdBanner[]; settings: SiteSettings }>;
  recordView(worldcupId: string, visitor: string): Promise<void>;
  recordCompletion(worldcupId: string, visitor: string, champion: string, runner: string): Promise<void>;

  // 투표와 순위
  getMyBallot(worldcupId: string): Promise<Ballot | null>;
  submitBallot(worldcupId: string, matches: Match[], replace: boolean): Promise<SubmitStatus>;
  getRanking(worldcupId: string): Promise<RankingResult>;

  // 댓글과 의견
  listComments(worldcupId: string): Promise<CommentItem[]>;
  addComment(worldcupId: string, body: string): Promise<void>;
  deleteComment(id: string): Promise<void>;
  sendFeedback(input: {
    worldcupId: string;
    type: FeedbackType;
    body: string;
    candidateId?: string | null;
    commentId?: string | null;
  }): Promise<void>;

  // 랭킹 제안
  uploadProposalImage(blob: Blob): Promise<{ path: string; url: string }>;
  proposalImageUrl(path: string): Promise<string>;
  submitProposal(input: {
    title: string;
    description: string;
    keywords: string;
    thumbnail_path: string;
    candidates: ProposalCandidate[];
  }): Promise<void>;

  // 설문조사
  listSurveys(): Promise<Survey[]>;
  createSurvey(input: SurveyInput): Promise<void>;
  requestSurveyChange(input: { surveyId: string; kind: 'edit' | 'delete'; reason: string; payload?: SurveyInput }): Promise<void>;

  // 운영자
  adminListWorldcups(): Promise<Worldcup[]>;
  adminStats(): Promise<AdminStats[]>;
  adminSaveWorldcup(draft: WorldcupDraft, proposalId?: string): Promise<string>;
  uploadMedia(blob: Blob, folder: MediaFolder): Promise<string>;
  adminCopyProposalImage(path: string): Promise<string>;
  adminListProposals(): Promise<Proposal[]>;
  adminRejectProposal(id: string): Promise<void>;
  adminListFeedback(): Promise<FeedbackItem[]>;
  adminSetFeedbackStatus(id: string, status: FeedbackStatus): Promise<void>;
  adminListComments(): Promise<AdminComment[]>;
  adminSetCommentHidden(id: string, hidden: boolean): Promise<void>;
  adminDeleteComment(id: string): Promise<void>;
  adminSaveSiteConfig(ads: AdBanner[], settings: SiteSettings): Promise<void>;
  adminListSurveyRequests(): Promise<SurveyRequest[]>;
  adminReviewSurveyRequest(id: string, action: 'approve' | 'reject'): Promise<void>;
}
