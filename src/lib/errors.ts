// 서버 오류를 사용자에게 보여줄 쉬운 말로 바꾼다.
const MESSAGES: [RegExp, string][] = [
  [/login_required|JWT|not authenticated/i, '로그인이 필요해요. 다시 로그인해주세요.'],
  [/daily_limit/, '오늘 보낼 수 있는 횟수를 모두 사용했어요. 내일 다시 시도해주세요.'],
  [/comments_user_id_worldcup_id_key/, '이 랭킹에는 이미 댓글을 남겼어요. 지우면 다시 쓸 수 있어요.'],
  [/invalid_candidate_count/, '후보 수를 4, 8, 16, 32, 64, 128개 중 하나로 맞춰주세요.'],
  [/published_locked/, '공개된 랭킹은 후보를 추가하거나 뺄 수 없어요. 「새 시즌」으로 만들어주세요.'],
  [/duplicate_name|candidates_active_name_uniq/, '같은 이름의 후보가 있어요.'],
  [/admin_only/, '운영자만 할 수 있어요.'],
  [/invalid_matches|invalid_worldcup/, '대결 기록이 올바르지 않아요. 다시 플레이해주세요.'],
  [/worldcup_not_found/, '랭킹을 찾을 수 없어요. 공개가 끝났을 수 있어요.'],
  [/invalid_candidates/, '후보 이름(30자)과 설명(60자)을 확인해주세요.'],
  [/check constraint|violates check/, '입력한 내용의 글자 수나 형식을 확인해주세요.'],
  [/row-level security|permission denied/, '권한이 없어요. 로그인 상태를 확인해주세요.'],
  [/Failed to fetch|NetworkError|network/i, '서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요.'],
  [/Payload too large|exceeded the maximum allowed size/i, '사진 용량이 너무 커요. 2MB 이하로 올려주세요.'],
];

export function friendlyError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  for (const [pattern, text] of MESSAGES) {
    if (pattern.test(message)) return text;
  }
  return message || '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
}
