import { VALID_SIZES, isValidSize } from './tournament';

export const NAME_MAX = 30;
export const SUB_MAX = 60;
export const COMMENT_MAX = 200;
export const FEEDBACK_MAX = 300;

/** 후보 수가 맞지 않을 때 얼마나 더하거나 빼면 되는지 알려준다 */
export function sizeHint(n: number): string {
  if (isValidSize(n)) return '';
  const up = VALID_SIZES.find((s) => s > n);
  const down = [...VALID_SIZES].reverse().find((s) => s < n);
  const parts: string[] = [];
  if (up) parts.push(`${up - n}개를 더하면 ${up}강`);
  if (down) parts.push(`${n - down}개를 빼면 ${down}강`);
  return `현재 ${n}개예요. ${parts.join(', ')}이 돼요.`;
}

export function candidateIssue(candidates: { name: string; sub: string }[]): string {
  const sizeMessage = sizeHint(candidates.length);
  if (sizeMessage) return sizeMessage + ' 후보는 4, 8, 16, 32, 64, 128개 중 하나여야 해요.';
  return candidateFieldIssue(candidates);
}

export function candidateFieldIssue(candidates: { name: string; sub: string }[]): string {
  const empty = candidates.findIndex((c) => !c.name.trim());
  if (empty >= 0) return `${empty + 1}번 후보의 이름을 입력해주세요.`;
  const long = candidates.findIndex((c) => c.name.trim().length > NAME_MAX);
  if (long >= 0) return `${long + 1}번 후보 이름이 ${NAME_MAX}자를 넘어요.`;
  const longSub = candidates.findIndex((c) => c.sub.trim().length > SUB_MAX);
  if (longSub >= 0) return `${longSub + 1}번 후보 설명이 ${SUB_MAX}자를 넘어요.`;
  const seen = new Map<string, number>();
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i].name.trim().toLowerCase();
    if (seen.has(key)) return `같은 이름의 후보가 있어요: ${candidates[i].name.trim()} (${seen.get(key)! + 1}번, ${i + 1}번)`;
    seen.set(key, i);
  }
  return '';
}

/** 한 줄에 「이름 | 부연설명」 형식의 여러 줄 입력을 후보 목록으로 바꾼다 */
export function parseBulk(text: string): { name: string; sub: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split('|');
      return { name: name.trim().slice(0, NAME_MAX), sub: rest.join('|').trim().slice(0, SUB_MAX) };
    })
    .filter((c) => c.name);
}
