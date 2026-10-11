import { Lock } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function loginPath(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

/** 로그인이 필요한 영역에 보여주는 안내 */
export default function LoginPrompt({ message, next }: { message: string; next?: string }) {
  const location = useLocation();
  return (
    <div className="locked">
      <Lock size={23} />
      <p>{message}</p>
      <p className="login-privacy-copy">
        진주랭킹은 민감한 개인정보를 수집하지 않습니다.
        <br />
        로그인은 중복 참여를 막고, 더 정확한 진주랭킹을 만드는데 활용됩니다.
      </p>
      <Link to="/privacy">개인정보처리방침</Link>
      <Link className="primary" to={loginPath(next ?? location.pathname + location.search)}>
        카카오로 로그인
      </Link>
    </div>
  );
}
