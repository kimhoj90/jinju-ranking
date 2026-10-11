import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AppContext';
import { safeNext } from './Login';

/** 카카오 로그인 후 돌아오는 곳. 로그인이 확인되면 원래 보던 화면으로 보낸다. */
export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const [slow, setSlow] = useState(false);
  const next = safeNext(params.get('next'));
  const error = params.get('error_description') || params.get('error');

  useEffect(() => {
    if (ready && user) navigate(next, { replace: true });
  }, [ready, user, next, navigate]);

  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main className="wrap loginpage">
      <section className="logincard">
        {error ? (
          <>
            <h1>로그인하지 못했어요</h1>
            <p className="error">{error}</p>
            <p className="muted">
              카카오 동의 화면에서 취소했거나, 카카오·Supabase 설정이 맞지 않을 수 있어요. (이메일 동의항목 오류 KOE205 등)
            </p>
            <Link className="primary" to={`/login?next=${encodeURIComponent(next)}`}>
              다시 시도
            </Link>
          </>
        ) : (
          <>
            <h1>로그인하는 중…</h1>
            {slow && (
              <p className="muted">
                시간이 오래 걸리고 있어요. <Link to={`/login?next=${encodeURIComponent(next)}`}>다시 시도</Link>
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
