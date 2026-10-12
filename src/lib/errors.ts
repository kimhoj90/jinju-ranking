// 서버 오류를 사용자에게 보여줄 쉬운 말로 바꾼다.
const MESSAGES: [RegExp, string][] = [
  [/duel_comment_exists/, '이 주제에는 이미 댓글을 남겼어요.'],
  [/vote_first/, '먼저 A 또는 B에 투표해주세요.'],
  [/nickname_required/, '먼저 사이트에서 사용할 닉네임을 설정해주세요.'],
  [/nickname_taken|profiles_nickname_unique/, '이미 사용 중인 닉네임이에요. 다른 이름을 골라주세요.'],
  [/invalid_nickname/, '한글·영문·숫자로 1~10자 입력해주세요.'],
  [/banned_nickname/, '사용할 수 없는 단어가 포함된 닉네임이에요.'],
  [/nickname_cooldown/, '아직 닉네임을 변경할 수 없어요. 다음 변경 가능일을 확인해주세요.'],
  [/account_blocked/, '운영자가 이용을 제한한 계정이에요. 문의를 통해 확인해주세요.'],
  [/weekly_limit/, '이번 주 추천을 이미 사용했어요. 다음 월요일 오전 9시에 다시 추천해주세요.'],
  [/invalid_youtube_url/, '유튜브 watch, youtu.be 또는 shorts 링크를 확인해주세요.'],
  [/already_voted/, '이미 투표했어요. 선택은 바꿀 수 없어요.'],
  [/already_reported/, '이미 신고한 영상이에요.'],
  [/voting_closed/, '종료된 투표예요.'],
  [/deleted_video/, '삭제된 영상은 복구할 수 없어요.'],
  [/not_pending/, '이미 처리되거나 취소된 제안이에요.'],
  [/login_required|JWT|not authenticated/i, '로그인이 필요해요. 다시 로그인해주세요.'],
  [/daily_limit/, '오늘 보낼 수 있는 횟수를 모두 사용했어요. 내일 다시 시도해주세요.'],
  [/comments_user_id_worldcup_id_key/, '이 랭킹에는 이미 댓글을 남겼어요. 지우면 다시 쓸 수 있어요.'],
  [/invalid_candidate_count/, '후보 수를 4, 8, 16, 32, 64, 128개 중 하나로 맞춰주세요.'],
  [/published_locked/, '공개된 랭킹은 후보를 추가하거나 뺄 수 없어요. 「새 시즌」으로 만들어주세요.'],
  [/duplicate_name|candidates_active_name_uniq/, '같은 이름의 후보가 있어요.'],
  [/admin_only/, '운영자만 할 수 있어요.'],
  [/invalid_matches|invalid_worldcup/, '후보 구성이 변경됐거나 대결 기록이 맞지 않아요. 새로 플레이해주세요.'],
  [/worldcup_not_found/, '랭킹을 찾을 수 없어요. 공개가 끝났을 수 있어요.'],
  [/invalid_candidates/, '후보 이름(30자)과 설명(60자)을 확인해주세요.'],
  [/check constraint|violates check/, '입력한 내용의 글자 수나 형식을 확인해주세요.'],
  [/row-level security|permission denied/, '권한이 없어요. 로그인 상태를 확인해주세요.'],
  [/Failed to fetch|NetworkError|network/i, '서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요.'],
  [/Payload too large|exceeded the maximum allowed size/i, '사진 용량이 너무 커요. 2MB 이하로 올려주세요.'],
];

export function friendlyError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
  for (const [pattern, text] of MESSAGES) {
    if (pattern.test(message)) return text;
  }
  return message || '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
}
