import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import type { AdBanner, Profile, PublicStats, SessionUser, SiteSettings, Worldcup } from '../lib/types';

// ---------------------------------------------------------------------------
// 로그인 상태
// ---------------------------------------------------------------------------
interface AuthState {
  user: SessionUser | null;
  isAdmin: boolean;
  ready: boolean;
  profile: Profile | null;
  authError: string;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authError, setAuthError] = useState('');
  const [ready, setReady] = useState(false);

  const revision = useRef(0);
  const apply = useCallback(async (u: SessionUser | null) => {
    const ticket = ++revision.current;
    setReady(false);
    try {
      const [admin, p] = u ? await Promise.all([api.isAdmin(), api.getProfile()]) : [false, null];
      if (ticket !== revision.current) return;
      setUser(u);
      setIsAdmin(admin);
      setProfile(p);
      setAuthError('');
    } catch (e) {
      if (ticket !== revision.current) return;
      setUser(u);
      setProfile(null);
      setIsAdmin(false);
      setAuthError(friendlyError(e));
    } finally {
      if (ticket === revision.current) setReady(true);
    }
  }, []);
  const refreshProfile = useCallback(async () => {
    await apply(await api.getUser());
  }, [apply]);
  useEffect(() => {
    void refreshProfile();
    const off = api.onAuthChange((u) => void apply(u));
    return () => {
      off();
      revision.current++;
    };
  }, [apply, refreshProfile]);

  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAdmin,
      ready,
      profile,
      authError,
      refreshProfile,
      signOut,
    }),
    [user, isAdmin, ready, profile, authError, refreshProfile, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider가 필요합니다.');
  return ctx;
}

// ---------------------------------------------------------------------------
// 사이트 공통 데이터 (공개 랭킹, 홈 통계, 광고, 문의 주소)
// ---------------------------------------------------------------------------
interface SiteState {
  worldcups: Worldcup[];
  stats: Record<string, PublicStats>;
  ads: AdBanner[];
  settings: SiteSettings;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  findBySlug: (slug: string | undefined) => Worldcup | undefined;
}

const SiteContext = createContext<SiteState | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const [worldcups, setWorldcups] = useState<Worldcup[]>([]);
  const [stats, setStats] = useState<Record<string, PublicStats>>({});
  const [ads, setAds] = useState<AdBanner[]>([]);
  const [settings, setSettings] = useState<SiteSettings>({ contact_email: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [cups, publicStats, config] = await Promise.all([api.listWorldcups(), api.publicStats(), api.getSiteConfig()]);
      setWorldcups(cups);
      setStats(publicStats);
      setAds(config.ads);
      setSettings(config.settings);
      setError('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const findBySlug = useCallback((slug: string | undefined) => worldcups.find((w) => w.slug === slug), [worldcups]);

  const value = useMemo(
    () => ({
      worldcups,
      stats,
      ads,
      settings,
      loading,
      error,
      refresh,
      findBySlug,
    }),
    [worldcups, stats, ads, settings, loading, error, refresh, findBySlug],
  );
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteState {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('SiteProvider가 필요합니다.');
  return ctx;
}

// ---------------------------------------------------------------------------
// 알림(토스트)과 공용 모달
// ---------------------------------------------------------------------------
export type GlobalModal = { type: 'inquiry'; kind: 'advertising' | 'survey' } | { type: 'contribute' } | { type: 'account' } | null;

interface UiState {
  toast: (message: string) => void;
  modal: GlobalModal;
  openModal: (modal: GlobalModal) => void;
}

const UiContext = createContext<UiState | null>(null);

export function UiProvider({
  children,
  render,
}: {
  children: ReactNode;
  render: (modal: GlobalModal, close: () => void, open: (m: GlobalModal) => void) => ReactNode;
}) {
  const [message, setMessage] = useState('');
  const [modal, setModal] = useState<GlobalModal>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), 3200);
  }, []);

  const value = useMemo(() => ({ toast, modal, openModal: setModal }), [toast, modal]);
  return (
    <UiContext.Provider value={value}>
      {children}
      {render(modal, () => setModal(null), setModal)}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </UiContext.Provider>
  );
}

export function useUi(): UiState {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('UiProvider가 필요합니다.');
  return ctx;
}
