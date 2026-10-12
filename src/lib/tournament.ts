import type { GameSnapshot, GameState, Match } from './types';

export const VALID_SIZES = [4, 8, 16, 32, 64, 128] as const;

export function availableRounds(count: number): number[] {
  return VALID_SIZES.filter((n) => n <= count);
}

export function isValidSize(n: number): boolean {
  return (VALID_SIZES as readonly number[]).includes(n);
}

export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function startGame(
  cupId: string,
  candidateIds: string[],
  rand?: () => number,
  size = availableRounds(candidateIds.length).at(-1) ?? 0,
): GameState {
  if (!isValidSize(size) || size > candidateIds.length) {
    throw new Error('후보 수를 확인해주세요.');
  }
  return { cupId, round: shuffle(candidateIds, rand).slice(0, size), next: [], index: 0, matches: [], done: false, history: [] };
}

export function currentPair(state: GameState): [string, string] {
  return [state.round[state.index], state.round[state.index + 1]];
}

export function pick(state: GameState, winner: string): GameState {
  const [a, b] = currentPair(state);
  if (state.done || (winner !== a && winner !== b)) {
    throw new Error('잘못된 선택입니다.');
  }
  const { history, ...snapshot } = state;
  const match: Match = { a, b, winner };
  const nextState: GameState = {
    ...snapshot,
    history: [...history, snapshot],
    matches: [...state.matches, match],
    next: [...state.next, winner],
    index: state.index + 2,
  };
  if (nextState.index >= state.round.length) {
    if (state.round.length === 2) {
      nextState.done = true;
      nextState.champion = winner;
      nextState.runner = winner === a ? b : a;
    } else {
      nextState.round = nextState.next;
      nextState.next = [];
      nextState.index = 0;
    }
  }
  return nextState;
}

export function undo(state: GameState): GameState {
  if (!state.history.length) return state;
  const previous: GameSnapshot = state.history[state.history.length - 1];
  return { ...previous, history: state.history.slice(0, -1) };
}

/** 전체 대결 중 몇 %를 마쳤는지 */
export function progress(state: GameState, pending = false): number {
  const total = state.matches.length + (state.round.length - state.index) / 2 + countLaterMatches(state.round.length);
  const done = state.matches.length + (pending ? 1 : 0);
  return Math.min(100, Math.round((done / Math.max(1, total)) * 100));
}

function countLaterMatches(roundSize: number): number {
  let n = 0;
  for (let size = roundSize / 2; size >= 2; size /= 2) n += size / 2;
  return n;
}

export function roundLabel(size: number): string {
  return size === 2 ? '결승' : `${size}강`;
}

export function matchNumber(state: GameState): { current: number; total: number } {
  return { current: state.index / 2 + 1, total: state.round.length / 2 };
}

export function estimateMinutes(size: number): string {
  if (size <= 8) return '1~2';
  if (size <= 16) return '2~3';
  if (size <= 32) return '4~6';
  return '10분 이상';
}

/** 가중치에 따라 무작위로 끝까지 진행한 대결 기록 (데모 데이터용) */
export function playRandomBracket(ids: string[], rand: () => number, weights?: Map<string, number>): Match[] {
  let round = shuffle(ids, rand);
  const matches: Match[] = [];
  while (round.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < round.length; i += 2) {
      const a = round[i];
      const b = round[i + 1];
      const wa = weights?.get(a) ?? 1;
      const wb = weights?.get(b) ?? 1;
      const winner = rand() * (wa + wb) < wa ? a : b;
      matches.push({ a, b, winner });
      next.push(winner);
    }
    round = next;
  }
  return matches;
}
