import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL || '';

export const apiUrl = (p) => `${BASE}${p}`;

export async function authFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { ...(options.headers || {}) };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return fetch(apiUrl(path), { ...options, headers });
}
