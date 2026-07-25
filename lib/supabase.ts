import { createClient } from "@supabase/supabase-js";

export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  anonKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
};

export const supabaseReady = Boolean(supabaseConfig.url && supabaseConfig.anonKey);

const authStorageKey = "forenx-auth";
const maxCookieChunkSize = 2000;

function cookieValue(name: string) {
  if (typeof document === "undefined") return null;
  const encodedName = `${encodeURIComponent(name)}=`;
  const match = document.cookie.split("; ").find((item) => item.startsWith(encodedName));
  return match ? decodeURIComponent(match.slice(encodedName.length)) : null;
}

function cookieAttributes(maxAge: number) {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  return `Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

const cookieStorage = {
  getItem(key: string) {
    const chunkCount = Number(cookieValue(`${key}.count`) ?? "0");
    if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 20) return cookieValue(key);
    const chunks = Array.from({ length: chunkCount }, (_, index) => cookieValue(`${key}.${index}`));
    return chunks.every((chunk): chunk is string => typeof chunk === "string") ? chunks.join("") : null;
  },
  setItem(key: string, value: string) {
    if (typeof document === "undefined") return;
    const previousCount = Number(cookieValue(`${key}.count`) ?? "0");
    const chunks = Array.from({ length: Math.ceil(value.length / maxCookieChunkSize) }, (_, index) =>
      value.slice(index * maxCookieChunkSize, (index + 1) * maxCookieChunkSize)
    );
    document.cookie = `${encodeURIComponent(`${key}.count`)}=${chunks.length}; ${cookieAttributes(60 * 60 * 24 * 7)}`;
    for (const [index, chunk] of chunks.entries()) {
      document.cookie = `${encodeURIComponent(`${key}.${index}`)}=${encodeURIComponent(chunk)}; ${cookieAttributes(60 * 60 * 24 * 7)}`;
    }
    for (let index = chunks.length; index < previousCount; index += 1) {
      document.cookie = `${encodeURIComponent(`${key}.${index}`)}=; ${cookieAttributes(0)}`;
    }
  },
  removeItem(key: string) {
    if (typeof document === "undefined") return;
    const chunkCount = Number(cookieValue(`${key}.count`) ?? "0");
    for (let index = 0; index < Math.max(chunkCount, 1); index += 1) {
      document.cookie = `${encodeURIComponent(`${key}.${index}`)}=; ${cookieAttributes(0)}`;
    }
    document.cookie = `${encodeURIComponent(`${key}.count`)}=; ${cookieAttributes(0)}`;
    document.cookie = `${encodeURIComponent(key)}=; ${cookieAttributes(0)}`;
  }
};

export const supabase = supabaseReady
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: cookieStorage,
        storageKey: authStorageKey
      }
    })
  : null;
