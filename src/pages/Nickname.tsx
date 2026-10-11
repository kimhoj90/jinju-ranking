import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AppContext';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { validNickname } from '../lib/community';
import { safeNext } from './Login';
export default function Nickname() {
  const { profile, refreshProfile, signOut, authError } = useAuth();
  const [name, setName] = useState(profile?.nickname ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validNickname(name.trim())) {
      setError('닉네임은 한글·영문·숫자로 1~10자 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      await api.saveNickname(name);
      await refreshProfile();
      const next = ['/login', '/auth/callback'].includes(location.pathname)
        ? safeNext(new URLSearchParams(location.search).get('next'))
        : location.pathname === '/nickname'
          ? '/'
          : location.pathname + location.search;
      navigate(next, { replace: true });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="wrap loginpage">
      <section className="logincard">
        <h1>{profile ? '닉네임 변경' : '닉네임을 정해주세요'}</h1>
        <p>
          진주랭킹에서만 쓰는 이름이에요.
          <br />
          댓글과 유튜브 TV에 표시돼요.
        </p>
        {authError ? (
          <>
            <p className="error">{authError}</p>
            <button className="primary" onClick={() => void refreshProfile()}>
              다시 확인
            </button>
          </>
        ) : (
          <form className="contactform" onSubmit={submit}>
            <label>
              닉네임
              <input
                autoFocus
                value={name}
                maxLength={10}
                onChange={(e) => setName(e.target.value)}
                placeholder="한글·영문·숫자, 10자 이내"
                autoComplete="off"
                required
              />
            </label>
            <small>중복 닉네임과 금칙어는 사용할 수 없어요. 변경은 기본 30일에 한 번 가능해요.</small>
            {profile && (
              <p>
                다음 변경 가능:{' '}
                {new Date(profile.next_change_at).toLocaleString('ko-KR', {
                  timeZone: 'Asia/Seoul',
                })}
              </p>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy || !!profile?.blocked}>
              {busy ? '저장 중…' : '닉네임 저장'}
            </button>
          </form>
        )}
        <div className="policybuttons">
          <Link to="/privacy">개인정보처리방침</Link>
          <button onClick={() => void signOut()}>로그아웃</button>
        </div>
      </section>
    </main>
  );
}
