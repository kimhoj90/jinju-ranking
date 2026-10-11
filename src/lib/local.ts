// 브라우저 저장소 래퍼. 개인정보 보호 모드 등에서 저장소가 막혀도 사이트가 동작해야 한다.
import type { FinishedResult, GameState } from './types';

const PREFIX = 'jr:';

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 저장 실패는 무시한다 */
  }
}

export function visitorId(): string {
  let id = readJson<string>('visitor', '');
  if (!id) {
    id = crypto.randomUUID();
    writeJson('visitor', id);
  }
  return id;
}

/** 진행 중인 게임(하나만 보관) */
export const savedGame = {
  get: () => readJson<GameState | null>('game', null),
  set: (game: GameState | null) => writeJson('game', game),
};

/** 랭킹별 마지막 완주 결과 */
export const savedResult = {
  get: (cupId: string) => readJson<FinishedResult | null>('result:' + cupId, null),
  set: (result: FinishedResult) => writeJson('result:' + result.cupId, result),
};

/** 같은 결과로 반영 여부를 두 번 묻지 않도록 처리한 결과를 기억한다 */
export const handledResult = {
  get: (cupId: string) => readJson<{ finishedAt: string; outcome: string } | null>('handled:' + cupId, null),
  set: (cupId: string, finishedAt: string, outcome: string) => writeJson('handled:' + cupId, { finishedAt, outcome }),
};

export function onceThisSession(key: string): boolean {
  try {
    if (sessionStorage.getItem(PREFIX + key)) return false;
    sessionStorage.setItem(PREFIX + key, '1');
    return true;
  } catch {
    return true;
  }
}
