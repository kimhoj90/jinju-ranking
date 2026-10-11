import { Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AppContext';
import { api, googleEnabled, isDemo, type LoginProvider } from '../lib/api';
import { friendlyError } from '../lib/errors';

/** 다른 사이트로 보내지 않도록 내부 경로만 허용한다 */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default function Login() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (ready && user) navigate(next, { replace: true });
  }, [ready, user, next, navigate]);

  const signIn = async (provider: LoginProvider) => {
    setBusy(true);
    setError('');
    try {
      await api.signIn(provider, next);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <main className="wrap loginpage">
      <section className="logincard">
        <div className="loginicon">
          <Lock size={26} />
        </div>
        <h1>내 선택이 진주의 랭킹으로</h1>
        <p>
          플레이는 로그인 없이도 할 수 있어요.
          <br />
          전체 순위 보기, 순위 반영, 댓글, 의견 보내기는 로그인 후 이용할 수 있어요.
        </p>

        {isDemo ? (
          <>
            <div className="connectionnotice">
              <b>데모 모드예요</b>
              <p>Supabase를 연결하면 이 자리에 카카오 로그인이 나와요. 지금은 아래 버튼으로 기능을 체험해보세요.</p>
            </div>
            <button className="kakaobutton" disabled={busy} onClick={() => void signIn('demo-user')}>
              데모 사용자로 로그인
            </button>
            <button className="secondary full" disabled={busy} onClick={() => void signIn('demo-admin')}>
              데모 운영자로 로그인
            </button>
          </>
        ) : (
          <>
            <button className="kakaobutton" disabled={busy} onClick={() => void signIn('kakao')}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 3C6.48 3 2 6.48 2 10.8c0 2.78 1.86 5.22 4.66 6.6l-.95 3.48c-.08.3.26.54.52.37l4.15-2.74c.53.06 1.07.09 1.62.09 5.52 0 10-3.48 10-7.8S17.52 3 12 3z"
                />
              </svg>
              카카오로 계속하기
            </button>
            {googleEnabled && (
              <button className="secondary full googlebutton" disabled={busy} onClick={() => void signIn('google')}>
                구글로 계속하기
              </button>
            )}
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <small>로그인은 만 14세 이상부터 이용할 수 있어요. 투표 기록에는 닉네임·이메일을 저장하지 않아요.</small>
        <div className="policybuttons">
          <Link to="/terms">이용약관</Link>
          <Link to="/privacy">개인정보처리방침</Link>
        </div>
      </section>
    </main>
  );
}
