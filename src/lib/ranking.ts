// 데모 모드용 집계와 검증. Supabase에서는 같은 규칙을 DB 함수(submit_ballot, get_ranking)가 처리한다.
import type { Candidate, Match, RankingResult } from './types';

/** 대결 기록이 올바른 토너먼트인지 확인하고 우승자와 2위를 돌려준다 */
export function verifyMatches(candidateIds: string[], matches: Match[]): { champion: string; runner: string } {
  const n = candidateIds.length;
  if (matches.length !== n - 1) throw new Error('invalid_matches');
  const ids = new Set(candidateIds);
  const seen = new Set<string>();
  let next: string[] = [];
  let idx = 0;
  for (let k = 0; k < n / 2; k++) {
    const { a, b, winner } = matches[idx++];
    if (a === b || !ids.has(a) || !ids.has(b) || seen.has(a) || seen.has(b) || (winner !== a && winner !== b)) {
      throw new Error('invalid_matches');
    }
    seen.add(a).add(b);
    next.push(winner);
  }
  let last: Match = matches[idx - 1];
  while (next.length > 1) {
    const cur = next;
    next = [];
    for (let k = 0; k < cur.length / 2; k++) {
      const m = matches[idx++];
      if (m.a !== cur[2 * k] || m.b !== cur[2 * k + 1] || (m.winner !== m.a && m.winner !== m.b)) {
        throw new Error('invalid_matches');
      }
      next.push(m.winner);
      last = m;
    }
  }
  const champion = next[0];
  return { champion, runner: last.a === champion ? last.b : last.a };
}

export function computeRanking(
  candidates: Candidate[],
  ballots: { champion_id: string; runner_up_id: string; matches: Match[] }[],
): RankingResult {
  const rows = candidates
    .filter((c) => c.active)
    .map((c) => {
      let wins = 0;
      let finals = 0;
      let matchWins = 0;
      let matchCount = 0;
      for (const b of ballots) {
        if (b.champion_id === c.id) wins++;
        if (b.champion_id === c.id || b.runner_up_id === c.id) finals++;
        for (const m of b.matches) {
          if (m.a === c.id || m.b === c.id) {
            matchCount++;
            if (m.winner === c.id) matchWins++;
          }
        }
      }
      return {
        id: c.id,
        name: c.name,
        sub: c.sub,
        image_url: c.image_url,
        wins,
        finals,
        match_wins: matchWins,
        match_count: matchCount,
        win_rate: matchCount ? Math.round((matchWins / matchCount) * 10000) / 10000 : 0,
      };
    })
    .sort((x, y) => y.wins - x.wins || y.finals - x.finals || y.win_rate - x.win_rate || x.name.localeCompare(y.name, 'ko'));
  return { participants: ballots.length, rows };
}
