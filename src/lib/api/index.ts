import { createDemoApi } from './demo';
import { createSupabaseApi } from './supabase';
import type { Api } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/** Supabase 주소와 공개 키가 있으면 실제 DB, 없으면 데모 모드 */
export const api: Api = url && key ? createSupabaseApi(url, key) : createDemoApi();
export const isDemo = api.mode === 'demo';
export const googleEnabled = import.meta.env.VITE_ENABLE_GOOGLE === 'true';

export type { Api, LoginProvider, MediaFolder } from './types';
