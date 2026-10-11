import Nickname from '../pages/Nickname';
import { ArrowRight, Settings } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useSite, useUi } from '../context/AppContext';
import { isDemo } from '../lib/api';
import { resetDemo } from '../lib/api/demo';
import type { AdBanner } from '../lib/types';
import { loginPath } from './LoginPrompt';

const WORDMARK = '/images/jinju-wordmark-v2.png';

function AdStrip({ ads }: { ads: AdBanner[] }) {
  const { openModal } = useUi();
  const slots = [1, 2, 3, 4].map((slot) => ads.find((a) => a.slot === slot));
  return (
    <section className="adstrip wrap" aria-label="지역 광고">
      <div className="adgrid">
        {slots.map((ad, i) =>
          ad?.active && ad.image_url ? (
            <div className="adslot filled" key={i}>
              {ad.link_url ? (
                <a href={ad.link_url} target="_blank" rel="noopener noreferrer sponsored" aria-label={`${ad.title || '광고'} 새 창으로 열기`}>
                  <img src={ad.image_url} alt={ad.title} />
                </a>
              ) : (
                <img src={ad.image_url} alt={ad.title} />
              )}
              <span>광고</span>
            </div>
          ) : (
            <div className="adslot vacant" key={i}>
              <span className="adslot-number">0{i + 1}</span>
              <span>
                진주의 새로운 소식이
                <br />
                머무를 자리
              </span>
              <small>LOCAL PARTNER</small>
            </div>
          ),
        )}
      </div>
      <div className="adinquiry">
        <button onClick={() => openModal({ type: 'inquiry', kind: 'advertising' })}>
          광고문의 <ArrowRight size={11} />
        </button>
      </div>
    </section>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, profile, ready, authError } = useAuth();
  const { ads } = useSite();
  const { openModal } = useUi();
  const path = location.pathname;
  const isHomeLike = path === '/' || /^\/r\/[^/]+$/.test(path) || path.startsWith('/surveys') || path === '/records';
  const isPlay = /^\/r\/[^/]+\/play$/.test(path);

  // 홈과 랭킹 시작 창 사이를 오갈 때는 스크롤을 유지하고, 다른 화면으로 가면 맨 위로
  const previousPath = useRef(path);
  useEffect(() => {
    const homeish = (p: string) => p === '/' || /^\/r\/[^/]+$/.test(p);
    if (!(homeish(previousPath.current) && homeish(path))) window.scrollTo(0, 0);
    previousPath.current = path;
  }, [path]);

  return (
    <>
      {isDemo && (
        <div className="demo-bar" role="note">
          <span>
            <b>데모 모드</b> · 이 기기에만 저장돼요
          </span>
          <button
            onClick={() => {
              if (confirm('데모 데이터를 처음 상태로 되돌릴까요?')) {
                resetDemo();
                location.pathname === '/' ? window.location.reload() : window.location.assign('/');
              }
            }}
          >
            초기화
          </button>
        </div>
      )}
      <div className="topnav-shell">
        <nav className="topnav wrap" aria-label="주 메뉴">
          <div className="topnav-left">
            <NavLink to="/" end className={() => (path === '/' || path.startsWith('/r/') ? 'active' : '')}>
              랭킹전
            </NavLink>
            <NavLink to="/surveys">설문조사</NavLink>
            <NavLink to="/records">진주기록</NavLink>
            <NavLink to="/tv">요즘 유튜브 뭐봄</NavLink>
          </div>
          {user ? (
            <button className="topnav-login" onClick={() => openModal({ type: 'account' })}>
              {profile?.nickname || '닉네임 설정'}
            </button>
          ) : (
            <Link className="topnav-login" to={loginPath(path + location.search)}>
              로그인
            </Link>
          )}
        </nav>
      </div>

      {!isPlay && (
        <header className={'header' + (isHomeLike ? ' home-header' : '')}>
          {isHomeLike && <AdStrip ads={ads} />}
          <div className="masthead wrap">
            <h1 className="site-heading">
              <Link className="site-title" to="/" aria-label="진주랭킹 홈">
                <img className="brand-wordmark" src={WORDMARK} alt="진주랭킹" width={1920} height={545} fetchPriority="high" />
              </Link>
            </h1>
            {isHomeLike && <p className="brand-subtitle">진주사람들의 취향, 데이터가 되다!</p>}
            {isAdmin && !path.startsWith('/admin') && (
              <div className="masthead-tools">
                <button className="textbtn" onClick={() => navigate('/admin')}>
                  <Settings size={17} /> 관리
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      {!ready ? (
        <main className="wrap">
          <p>로그인 확인 중…</p>
        </main>
      ) : user && (!profile || authError) && !['/privacy', '/terms', '/contact'].includes(path) ? (
        <Nickname />
      ) : (
        <Outlet />
      )}

      {!isPlay && (
        <footer className="wrap footer">
          <div>
            <Link className="brand" to="/" aria-label="진주랭킹 홈">
              <img className="brand-wordmark" src={WORDMARK} alt="진주랭킹" width={1920} height={545} loading="lazy" />
            </Link>
            <p>진주사람들의 취향, 데이터가 되다!</p>
            <small>© {new Date().getFullYear()} 진주랭킹. 순위는 참여자들의 선택이에요.</small>
          </div>
          <div className="footerlinks">
            <Link to="/privacy">개인정보처리방침</Link>
            <Link to="/terms">이용약관</Link>
            <Link to="/contact">문의</Link>
            {isAdmin && (
              <Link to="/admin">
                <Settings size={13} /> 관리자
              </Link>
            )}
          </div>
        </footer>
      )}
    </>
  );
}
