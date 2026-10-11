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
      <Link className="primary" to={loginPath(next ?? location.pathname + location.search)}>
        카카오로 로그인
      </Link>
    </div>
  );
}
