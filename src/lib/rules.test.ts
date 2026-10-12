import { describe, expect, it } from 'vitest';
import { computeRanking, verifyMatches } from './ranking';
import { pick, playRandomBracket, progress, startGame, undo } from './tournament';
import { candidateIssue, parseBulk, sizeHint } from './validate';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i + 1}`);

function playToEnd(n: number, choose: (a: string, b: string) => string = (a) => a) {
  let g = startGame('cup', ids(n));
  while (!g.done) {
    const a = g.round[g.index];
    const b = g.round[g.index + 1];
    g = pick(g, choose(a, b));
  }
  return g;
}

describe('대결 진행', () => {
  it.each([4, 8, 16, 32, 64, 128])('%i강은 (후보 수 - 1)번 대결 후 우승자가 나온다', (n) => {
    const g = playToEnd(n);
    expect(g.matches).toHaveLength(n - 1);
    expect(g.done).toBe(true);
    expect(g.champion).toBe(g.matches[n - 2].winner);
    expect(progress(g)).toBe(100);
  });

  it('후보 수 안에서 시작 라운드를 선택한다', () => {
    expect(startGame('cup', ids(7)).round).toHaveLength(4);
    expect(startGame('cup', ids(17), undefined, 8).round).toHaveLength(8);
    expect(() => startGame('cup', ids(7), undefined, 8)).toThrow();
    expect(() => startGame('cup', ids(3))).toThrow();
  });
  it('작은 라운드도 전체 후보 중 중복 없이 뽑아 검증한다', () => {
    let g = startGame('cup', ids(17), undefined, 8);
    expect(new Set(g.round).size).toBe(8);
    while (!g.done) g = pick(g, g.round[g.index]);
    expect(verifyMatches(ids(17), g.matches).champion).toBe(g.champion);
    expect(() => verifyMatches(ids(4), g.matches)).toThrow();
  });

  it('되돌리기는 마지막 선택만 취소한다 (라운드를 넘어가도)', () => {
    let g = startGame('cup', ids(4));
    g = pick(g, g.round[0]);
    g = pick(g, g.round[2]);
    expect(g.round).toHaveLength(2);
    g = undo(g);
    expect(g.round).toHaveLength(4);
    expect(g.matches).toHaveLength(1);
    expect(g.index).toBe(2);
  });

  it('대결 상대가 아닌 후보는 고를 수 없다', () => {
    const g = startGame('cup', ids(4));
    expect(() => pick(g, 'nobody')).toThrow();
  });
});

describe('서버와 같은 검증 규칙 (데모 모드)', () => {
  it('정상 기록에서 우승자와 2위를 계산한다', () => {
    const g = playToEnd(8);
    expect(verifyMatches(ids(8), g.matches)).toEqual({ champion: g.champion, runner: g.runner });
  });

  it('진 후보가 다음 라운드에 나오면 거부한다', () => {
    const g = playToEnd(8);
    const bad = g.matches.map((m) => ({ ...m }));
    const loser = bad[0].winner === bad[0].a ? bad[0].b : bad[0].a;
    bad[4] = { ...bad[4], a: loser };
    expect(() => verifyMatches(ids(8), bad)).toThrow('invalid_matches');
  });

  it('무작위 기록도 항상 올바른 토너먼트다', () => {
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 50; i++) {
      expect(() => verifyMatches(ids(16), playRandomBracket(ids(16), rand))).not.toThrow();
    }
  });

  it('순위는 우승 → 결승 진출 → 승률 순으로 정렬한다', () => {
    const cands = ids(4).map((id, i) => ({ id, name: id, sub: '', image_url: '', sort_order: i, active: true }));
    const b1 = {
      champion_id: 'c1',
      runner_up_id: 'c2',
      matches: [
        { a: 'c1', b: 'c3', winner: 'c1' },
        { a: 'c2', b: 'c4', winner: 'c2' },
        { a: 'c1', b: 'c2', winner: 'c1' },
      ],
    };
    const b2 = {
      champion_id: 'c2',
      runner_up_id: 'c3',
      matches: [
        { a: 'c2', b: 'c1', winner: 'c2' },
        { a: 'c3', b: 'c4', winner: 'c3' },
        { a: 'c2', b: 'c3', winner: 'c2' },
      ],
    };
    const b3 = {
      champion_id: 'c1',
      runner_up_id: 'c4',
      matches: [
        { a: 'c1', b: 'c2', winner: 'c1' },
        { a: 'c4', b: 'c3', winner: 'c4' },
        { a: 'c1', b: 'c4', winner: 'c1' },
      ],
    };
    const r = computeRanking(cands, [b1, b2, b3]);
    expect(r.participants).toBe(3);
    // c3와 c4는 우승·결승·승률(25%)이 같아 이름순
    expect(r.rows.map((x) => x.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(r.rows[0]).toMatchObject({ wins: 2, finals: 2, match_wins: 4, match_count: 5 });
  });
});

describe('후보 입력', () => {
  it('후보 수가 맞지 않으면 몇 개를 더하거나 빼면 되는지 알려준다', () => {
    expect(sizeHint(7)).toBe('현재 7개예요. 1개를 더하면 8강, 3개를 빼면 4강이 돼요.');
    expect(sizeHint(3)).toBe('현재 3개예요. 1개를 더하면 4강이 돼요.');
    expect(sizeHint(8)).toBe('');
  });

  it('같은 이름, 빈 이름, 글자 수 초과를 막는다', () => {
    const ok = ids(4).map((name) => ({ name, sub: '' }));
    expect(candidateIssue(ok)).toBe('');
    expect(candidateIssue([...ok.slice(0, 3), { name: 'C1 ', sub: '' }])).toContain('같은 이름');
    expect(candidateIssue([...ok.slice(0, 3), { name: ' ', sub: '' }])).toContain('이름을 입력');
    expect(candidateIssue([...ok.slice(0, 3), { name: 'a'.repeat(31), sub: '' }])).toContain('30자');
  });

  it('한꺼번에 추가: 「이름 | 부연설명」 줄을 후보로 바꾼다', () => {
    expect(parseBulk('진주냉면 | 시원한 육수\n\n  육전  \n장어구이|노릇노릇|한 상')).toEqual([
      { name: '진주냉면', sub: '시원한 육수' },
      { name: '육전', sub: '' },
      { name: '장어구이', sub: '노릇노릇|한 상' },
    ]);
  });
});
