import { ArrowLeft, ArrowRight, Share2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import LoginPrompt from '../components/LoginPrompt';
import { useAuth, useSite } from '../context/AppContext';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { num, percent } from '../lib/format';
import type { Ballot, RankingResult, SeasonRanks } from '../lib/types';
import { useShare } from './Home';

export default function Ranking() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const { findBySlug, loading } = useSite();
  const share = useShare();
  const cup = findBySlug(slug);
  const [data, setData] = useState<RankingResult | null>(null);
  const [mine, setMine] = useState<Ballot | null>(null);
  const [seasons, setSeasons] = useState<SeasonRanks | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cup || !user) return;
    let alive = true;
    Promise.all([api.getRanking(cup.id), api.getMyBallot(cup.id), api.getSeasonRanks(cup.id)])
      .then(([ranking, ballot, integrated]) => {
        if (!alive) return;
        setData(ranking);
        setSeasons(integrated);
        setMine(ballot);
      })
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [cup, user]);

  if (!cup) {
    return (
      <main className="wrap rankingpage">
        <div className="empty">
          <h2>{loading ? '불러오는 중…' : '랭킹을 찾을 수 없어요.'}</h2>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap rankingpage">
      <span className="eyebrow">PARTICIPANTS' CHOICE</span>
      <h1>{cup.title}</h1>
      <p className="muted">순위는 로그인한 참여자들이 반영한 결과예요. 진주시민 전체의 평가를 대표하지 않아요.</p>

      {!ready ? null : !user ? (
        <section className="community">
          <LoginPrompt message="전체 순위는 로그인 후 볼 수 있어요." next={`/r/${cup.slug}/ranking`} />
        </section>
      ) : error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p className="muted">순위를 불러오는 중…</p>
      ) : (
        <>
          <div className="rankingsummary">
            <span>
              <Users size={16} /> {num(data.participants)}명 참여
            </span>
            {mine ? (
              <span className="mypickinfo">내 1위가 반영되어 있어요</span>
            ) : (
              <span className="mypickinfo">아직 내 결과가 반영되지 않았어요</span>
            )}
          </div>
          {data.participants === 0 && (!seasons || seasons.season_count < 2) ? (
            <div className="empty">
              <h3>아직 반영된 결과가 없어요.</h3>
              <p>첫 번째로 플레이하고 순위에 반영해보세요.</p>
            </div>
          ) : (
            <ol className="ranklist">
              {data.rows.map((row, i) => (
                <li key={row.id} className={(i < 3 ? 'top top' + (i + 1) : '') + (mine?.champion_id === row.id ? ' mine' : '')}>
                  <span className="rank">{i + 1}</span>
                  <div className="rankthumb">
                    {row.image_url ? <img src={row.image_url} alt="" loading="lazy" /> : <span>{row.name.slice(0, 1)}</span>}
                  </div>
                  <div className="rankname">
                    <b>{row.name}</b>
                    {seasons &&
                      seasons.season_count > 1 &&
                      (() => {
                        const r = seasons.ranks.find((x) => x.candidate_id === row.id)?.rank;
                        return r ? (
                          <span className={'season-rank season-rank-' + r}>
                            {r <= 3 ? ['🥇', '🥈', '🥉'][r - 1] + ' ' : ''}시즌 통합 {r}위
                          </span>
                        ) : null;
                      })()}
                    {row.sub && <small>{row.sub}</small>}
                    {mine?.champion_id === row.id && <em className="mypick">내 1위</em>}
                  </div>
                  <dl className="rankstats">
                    <div>
                      <dt>우승</dt>
                      <dd>{num(row.wins)}</dd>
                    </div>
                    <div>
                      <dt>결승</dt>
                      <dd>{num(row.finals)}</dd>
                    </div>
                    <div>
                      <dt>승률</dt>
                      <dd>{percent(row.win_rate)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          )}
          <p className="muted rankingrule">정렬 기준: 우승 횟수 → 결승 진출 횟수 → 승률(대결에서 이긴 수 ÷ 대결 수)</p>
        </>
      )}

      <div className="resultactions">
        <button className="primary" onClick={() => navigate(`/r/${cup.slug}/play`, { state: { fresh: true } })}>
          플레이하기 <ArrowRight size={16} />
        </button>
        <button className="secondary" onClick={() => void share(cup)}>
          <Share2 size={16} /> 공유
        </button>
      </div>
      <Link className="textbtn backlink" to="/">
        <ArrowLeft size={16} /> 다른 랭킹 둘러보기
      </Link>
    </main>
  );
}
