export type WorldcupStatus = 'draft' | 'published' | 'archived';

export interface Candidate {
  lineage_id?: string;
  id: string;
  name: string;
  sub: string;
  image_url: string;
  sort_order: number;
  active: boolean;
}

export interface Worldcup {
  series_id?: string;
  id: string;
  slug: string;
  title: string;
  description: string;
  keywords: string;
  status: WorldcupStatus;
  candidate_count: number;
  thumbnail_url: string;
  featured: boolean;
  sort_order: number;
  created_at: string;
  published_at: string | null;
  candidates: Candidate[];
}

export interface PublicStats {
  completions: number;
  top_ids: string[];
}

export interface Match {
  a: string;
  b: string;
  winner: string;
}

export interface GameSnapshot {
  cupId: string;
  round: string[];
  next: string[];
  index: number;
  matches: Match[];
  done: boolean;
  champion?: string;
  runner?: string;
}

export interface GameState extends GameSnapshot {
  history: GameSnapshot[];
}

export interface FinishedResult {
  cupId: string;
  matches: Match[];
  champion: string;
  runner: string;
  finishedAt: string;
}

export interface RankingRow {
  id: string;
  name: string;
  sub: string;
  image_url: string;
  wins: number;
  finals: number;
  match_wins: number;
  match_count: number;
  win_rate: number;
}

export interface RankingResult {
  participants: number;
  rows: RankingRow[];
}

export interface Ballot {
  worldcup_id: string;
  champion_id: string;
  runner_up_id: string;
  updated_at: string;
}

export type SubmitStatus = 'created' | 'exists' | 'replaced';

export interface CommentItem {
  nickname: string;
  likes: number;
  liked: boolean;
  id: string;
  body: string;
  created_at: string;
  is_mine: boolean;
  hidden: boolean;
}

export type FeedbackType = 'suggest' | 'objection' | 'report';
export type FeedbackStatus = 'new' | 'reviewed' | 'done';

export interface FeedbackItem {
  id: string;
  worldcup_id: string;
  candidate_id: string | null;
  comment_id: string | null;
  type: FeedbackType;
  body: string;
  status: FeedbackStatus;
  created_at: string;
  comment: { body: string; hidden: boolean } | null;
}

export interface AdminComment {
  id: string;
  worldcup_id: string;
  body: string;
  hidden: boolean;
  created_at: string;
}

export interface AdBanner {
  slot: number;
  title: string;
  image_url: string;
  link_url: string;
  active: boolean;
}

export interface SiteSettings {
  contact_email: string;
}

export interface ProposalCandidate {
  name: string;
  sub: string;
  image_path: string;
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  keywords: string;
  thumbnail_path: string;
  candidates: ProposalCandidate[];
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  review_note?: string;
  worldcup_id: string | null;
  created_at: string;
}

export interface Survey {
  id: string;
  title: string;
  body: string;
  url: string;
  publish_on: string;
  expires_on: string;
  created_at: string;
  is_mine: boolean;
}

export interface SurveyInput {
  title: string;
  body: string;
  url: string;
  publish_on: string;
  expires_on: string;
}

export interface SurveyRequest {
  id: string;
  survey_id: string;
  kind: 'edit' | 'delete';
  reason: string;
  payload: SurveyInput | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  survey: SurveyInput | null;
}

export interface AdminStats {
  worldcup_id: string;
  views: number;
  completions: number;
  participants: number;
  comments: number;
}

export interface SessionUser {
  id: string;
}

/** 에디터에서 다루는 후보 한 줄. key는 화면용, id는 저장된 후보에만 있다. */
export interface DraftCandidate {
  source_candidate_id?: string;
  key: string;
  id?: string;
  name: string;
  sub: string;
  image_url: string;
  /** 제안 사진(비공개 저장소)의 경로 */
  image_path?: string;
}

export interface WorldcupDraft {
  source_season_id?: string;
  id?: string;
  title: string;
  description: string;
  keywords: string;
  status: WorldcupStatus;
  featured: boolean;
  sort_order: number;
  thumbnail_url: string;
  thumbnail_path?: string;
  candidates: DraftCandidate[];
}

export interface Profile {
  nickname: string;
  blocked: boolean;
  nickname_changed_at: string;
  next_change_at: string;
}
export interface AccountRow {
  user_id: string;
  nickname: string;
  blocked: boolean;
}
export interface CommunitySettings {
  banned_words: string[];
  nickname_days: number;
  report_threshold: number;
}
export interface Duel {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  description_a: string;
  description_b: string;
  status: 'published' | 'archived';
  created_at: string;
}
export type DuelDraft = Omit<Duel, 'id' | 'created_at'> & { id?: string };
export interface DuelResult {
  choice: 'A' | 'B' | null;
  a?: number;
  b?: number;
  total?: number;
}
export interface TvItem {
  id: number;
  video_id: string | null;
  nickname: string;
  off: boolean;
}
export interface TvPage {
  page: number;
  pages: number;
  items: TvItem[];
}
export interface TvEligibility {
  can_recommend: boolean;
  next_reset: string;
}
export interface AdminTv {
  id: number;
  video_id: string | null;
  user_id: string;
  nickname: string;
  reports: number;
  moderation: 'visible' | 'hidden' | 'restored' | 'deleted';
  created_at: string;
}

export interface SeasonRanks {
  season_count: number;
  ranks: { candidate_id: string; rank: number; wins: number }[];
}
export interface DuelComment {
  id: string;
  choice: 'A' | 'B';
  body: string;
  nickname: string;
  created_at: string;
  is_mine: boolean;
}
export interface RecordArticle {
  id: string;
  title: string;
  image_url: string;
  created_at: string;
}
