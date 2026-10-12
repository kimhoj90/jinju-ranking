import { useMemo } from 'react';
import type { PublicStats, Worldcup } from '../lib/types';

/**
 * 랭킹 썸네일. 운영자가 올린 대표 썸네일이 있으면 그것을,
 * 없으면 후보 사진 2장(결과가 쌓이면 우승 횟수 1·2위)을 VS로 보여준다.
 */
export default function RankingThumb({
  cup,
  stats,
  eager,
}: {
  cup: Pick<Worldcup, 'thumbnail_url' | 'candidates'>;
  stats?: PublicStats;
  eager?: boolean;
}) {
  const randomCandidates = useMemo(() => {
    const candidates = cup.candidates.filter((c) => c.active !== false && c.image_url);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return candidates;
  }, [cup.candidates]);
  const loading = eager ? 'eager' : 'lazy';
  if (cup.thumbnail_url) {
    return <img className="ranking-thumb-image" src={cup.thumbnail_url} alt="" loading={loading} />;
  }
  const withPhoto = cup.candidates.filter((c) => c.active !== false && c.image_url);
  const byStats = (stats?.top_ids ?? []).map((id) => withPhoto.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  const pair = ((stats?.completions ?? 0) > 0 && byStats.length >= 2 ? byStats : randomCandidates).slice(0, 2);
  if (!pair.length) {
    return <span className="no-ranking-image">사진을 등록해주세요</span>;
  }
  return (
    <div className={'auto-thumbnail' + (pair.length === 1 ? ' single' : '')}>
      {pair.map((c) => (
        <div className="auto-candidate" key={c.id}>
          <img src={c.image_url} alt="" loading={loading} />
          <div className="auto-candidate-name">
            <span>{c.name}</span>
          </div>
        </div>
      ))}
      {pair.length === 2 && <b>VS</b>}
    </div>
  );
}
