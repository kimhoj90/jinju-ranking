import { DuelCards } from './Duel';
import { ArrowRight, ArrowUpRight, Lock, RotateCcw, Search, Share2, Trophy, Play, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Modal from '../components/Modal';
import RankingThumb from '../components/RankingThumb';
import { useAuth, useSite, useUi } from '../context/AppContext';
import { api } from '../lib/api';
import { loginPath } from '../components/LoginPrompt';
import { onceThisSession, savedGame, savedResult, visitorId } from '../lib/local';
import { rankingUrl, shareLink } from '../lib/share';
import { availableRounds, estimateMinutes, roundLabel } from '../lib/tournament';
import type { PublicStats, Worldcup } from '../lib/types';

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');

export function useShare() {
  const { toast } = useUi();
  return async (cup: Pick<Worldcup, 'title' | 'slug'>) => {
    const result = await shareLink(cup.title, rankingUrl(cup.slug));
    if (result === 'copied') toast('링크를 복사했어요.');
    if (result === 'failed') toast('링크: ' + rankingUrl(cup.slug));
  };
}

function StartModal({ cup, stats, onClose }: { cup: Worldcup; stats?: PublicStats; onClose: () => void }) {
  const navigate = useNavigate();
  const [size, setSize] = useState(availableRounds(cup.candidates.length).at(-1) ?? 4);
  const game = savedGame.get();
  const inProgress = game && !game.done && game.cupId === cup.id && game.matches.length > 0;
  const finished = savedResult.get(cup.id);

  useEffect(() => {
    if (onceThisSession('view:' + cup.id)) void api.recordView(cup.id, visitorId()).catch(() => {});
  }, [cup.id]);

  const play = (fresh: boolean) => navigate(`/r/${cup.slug}/play`, { state: { fresh, size } });

  return (
    <Modal onClose={onClose} labelledBy="modal-title">
      <div className="start-thumbnail">
        <RankingThumb cup={cup} stats={stats} eager />
      </div>
      <span className="eyebrow">LET'S PICK</span>
      <h2 id="modal-title">{cup.title}</h2>
      {cup.description && <p>{cup.description}</p>}
      <label className="round-select">
        시작 라운드
        <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {availableRounds(cup.candidates.length).map((n) => (
            <option key={n} value={n}>
              {n}강
            </option>
          ))}
        </select>
        <small>
          후보 {cup.candidates.length}명 중 무작위 {size}명
        </small>
      </label>
      <div className="startinfo">
        <span>
          <Trophy size={19} /> {roundLabel(size)}
        </span>
        <span>약 {estimateMinutes(size)}분</span>
        <span>로그인 없이 참여</span>
      </div>
      {inProgress ? (
        <>
          <button className="primary full" onClick={() => play(false)}>
            이어서 플레이하기 <ArrowRight size={18} />
          </button>
          <button className="secondary full" onClick={() => play(true)}>
            처음부터 다시 하기
          </button>
        </>
      ) : (
        <button className="primary full" onClick={() => play(true)}>
          랭킹 시작하기 <ArrowRight size={18} />
        </button>
      )}
      {finished && !inProgress && (
        <button className="secondary full" onClick={() => navigate(`/r/${cup.slug}/result`)}>
          지난 내 결과 보기
        </button>
      )}
      <button className="textbtn full" onClick={() => navigate(`/r/${cup.slug}/ranking`)}>
        전체 순위 보기 <Lock size={14} />
      </button>
    </Modal>
  );
}

export default function Home() {
  const { user, ready } = useAuth();
  const { slug } = useParams();
  const navigate = useNavigate();
  const { worldcups, stats, loading, error, refresh, findBySlug } = useSite();
  const { openModal, toast } = useUi();
  const share = useShare();
  const [query, setQuery] = useState('');
  const [duelCount, setDuelCount] = useState(0);
  const [sort, setSort] = useState<'new' | 'popular'>('new');
  const game = savedGame.get();
  const resumeCup = game && !game.done && game.matches.length > 0 ? worldcups.find((w) => w.id === game.cupId) : undefined;
  const startCup = slug ? findBySlug(slug) : undefined;

  useEffect(() => {
    if (slug && !loading && !startCup) {
      toast('랭킹을 찾을 수 없어요. 공개가 끝났을 수 있어요.');
      navigate('/', { replace: true });
    }
  }, [slug, loading, startCup, navigate, toast]);

  const list = useMemo(() => {
    const q = normalize(query.trim());
    const filtered = worldcups.filter((w) => {
      if (!q) return true;
      const haystack = normalize([w.title, w.description, w.keywords, ...w.candidates.map((c) => c.name)].join(' '));
      return haystack.includes(q);
    });
    return filtered.sort((a, b) => {
      if (sort === 'popular') {
        const diff = (stats[b.id]?.completions ?? 0) - (stats[a.id]?.completions ?? 0);
        if (diff) return diff;
      } else {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      }
      return (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);
    });
  }, [worldcups, stats, query, sort]);

  return (
    <main className="wrap home">
      <label className="search homesearch">
        <Search size={21} />
        <input aria-label="랭킹 검색" placeholder="궁금한 랭킹 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button aria-label="검색 지우기" onClick={() => setQuery('')}>
            <X size={18} />
          </button>
        )}
      </label>

      {resumeCup && (
        <button className="resume" onClick={() => navigate(`/r/${resumeCup.slug}/play`, { state: { fresh: false } })}>
          <RotateCcw size={17} /> 아직 고르지 못한 취향이 있네요. 이어서 플레이하기 <ArrowRight size={17} />
        </button>
      )}

      {error && (
        <p className="error" role="alert">
          {error}{' '}
          <button className="textbtn" onClick={() => void refresh()}>
            다시 시도
          </button>
        </p>
      )}

      <section className="explore">
        <div className="rankingtoolbar">
          <div className="count">
            총 <strong>{loading && !worldcups.length ? '…' : list.length}</strong>
            개의 랭킹
          </div>
          <div className="sortoptions" role="group" aria-label="랭킹 정렬">
            <button className={sort === 'new' ? 'active' : ''} aria-pressed={sort === 'new'} onClick={() => setSort('new')}>
              최신순
            </button>
            <button className={sort === 'popular' ? 'active' : ''} aria-pressed={sort === 'popular'} onClick={() => setSort('popular')}>
              인기순
            </button>
          </div>
        </div>

        <div className="grid">
          {!query && (
            <article className="card proposal-card">
              <button className="cardmain" onClick={() => openModal({ type: 'contribute' })}>
                <div className="thumbnail proposal-thumbnail">
                  <span className="proposal-plus">+</span>
                  <span>YOUR IDEA, NEXT RANKING</span>
                </div>
                <div className="cardcopy">
                  <h3>랭킹 제안 · 설문조사 의뢰</h3>
                  <p>여러분의 궁금한 진주를 들려주세요.</p>
                </div>
              </button>
              <div className="cardbottom">
                <span>새로운 이야기를 기다려요</span>
                <button aria-label="제안 및 의뢰 열기" onClick={() => openModal({ type: 'contribute' })}>
                  <ArrowUpRight size={18} />
                </button>
              </div>
            </article>
          )}

          {loading &&
            !worldcups.length &&
            Array.from({ length: 3 }, (_, i) => (
              <article className="card skeleton" key={'s' + i} aria-hidden="true">
                <div className="thumbnail" />
                <div className="cardcopy">
                  <h3>&nbsp;</h3>
                  <p>&nbsp;</p>
                </div>
              </article>
            ))}

          <DuelCards query={query} onCount={setDuelCount} />
          {list.map((cup, i) => {
            return (
              <article className="card" key={cup.id}>
                <Link className="cardmain" to={`/r/${cup.slug}`}>
                  <div className="thumbnail">
                    <RankingThumb cup={cup} stats={stats[cup.id]} eager={i < 4} />
                    {cup.featured && <span className="recommendbadge">추천</span>}
                    <span className="roundbadge">최대 {roundLabel(availableRounds(cup.candidates.length).at(-1) ?? 4)}</span>
                    <span className="hoverplay">
                      플레이하기 <ArrowUpRight size={20} />
                    </span>
                  </div>
                  <div className="cardcopy">
                    <h3>{cup.title}</h3>
                    <p>{cup.description}</p>
                  </div>
                </Link>
                <div className="cardbottom ranking-card-actions">
                  <Link to={`/r/${cup.slug}`} aria-label={cup.title + ' 시작'}><Play size={14} />시작</Link>
                  <button disabled={!ready} aria-label={cup.title + ' 순위'} onClick={() => {
                    const next = `/r/${cup.slug}/ranking`;
                    navigate(user ? next : loginPath(next));
                  }}><Trophy size={14} />순위</button>
                  <button aria-label={cup.title + ' 공유'} onClick={() => void share(cup)}><Share2 size={14} />공유</button>
                </div>
              </article>
            );
          })}
        </div>

        {!loading && !list.length && !duelCount && (
          <div className="empty">
            <Search size={30} />
            <h3>{query ? '찾는 랭킹이 아직 없어요.' : '공개된 랭킹이 아직 없어요.'}</h3>
            <p>{query ? '다른 검색어로 찾아보세요.' : '곧 새로운 랭킹이 올라와요.'}</p>
            {query && (
              <button className="secondary" onClick={() => setQuery('')}>
                전체 랭킹 보기
              </button>
            )}
          </div>
        )}
      </section>

      {startCup && <StartModal cup={startCup} stats={stats[startCup.id]} onClose={() => navigate('/')} />}
    </main>
  );
}
