import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const protectedRoles: Array<[string, string[]]> = [
  ["/admin", ["System Admin"]],
  ["/scan", ["Investigator"]],
  ["/capture", ["Investigator"]],
  ["/transfer", ["Investigator"]],
  ["/lab", ["Laboratory Analyst"]],
  ["/evidence", ["Investigator", "Laboratory Analyst"]]
];

function createContentSecurityPolicy(nonce: string) {
  const developmentEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    // Turbopack uses eval only for development diagnostics. Production stays strict.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentEval}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "media-src 'self' blob: https://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join("; ");
}

function readSessionToken(request: NextRequest) {
  const chunkCount = Number(request.cookies.get("forenx-auth.count")?.value ?? "0");
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 20) return null;

  const sessionValue = Array.from({ length: chunkCount }, (_, index) => request.cookies.get(`forenx-auth.${index}`)?.value).join("");
  try {
    const parsed = JSON.parse(sessionValue) as { access_token?: string };
    return typeof parsed.access_token === "string" ? parsed.access_token : null;
  } catch {
    return null;
  }
}

function securedResponse(response: NextResponse, contentSecurityPolicy: string) {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

function loginRedirect(request: NextRequest, contentSecurityPolicy: string) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete("forenx-auth.count");
  return securedResponse(response, contentSecurityPolicy);
}

export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const contentSecurityPolicy = createContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);

  // Next reads this nonce and attaches it to its framework scripts.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const pathname = request.nextUrl.pathname;
  const requiredRoles = protectedRoles.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1];
  const requiresAuthentication = pathname !== "/login" && !pathname.startsWith("/api/");

  if (requiresAuthentication) {
    const accessToken = readSessionToken(request);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!accessToken || !url || !anonKey) return loginRedirect(request, contentSecurityPolicy);

    // Verify the token remotely. Cookie contents alone never grant access.
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: userData } = await authClient.auth.getUser(accessToken);
    if (!userData.user) return loginRedirect(request, contentSecurityPolicy);

    const profileClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const { data: profile } = await profileClient
      .from("profiles")
      .select("role, account_status")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile || profile.account_status !== "Active") return loginRedirect(request, contentSecurityPolicy);
    if (requiredRoles && !requiredRoles.includes(profile.role)) {
      return securedResponse(NextResponse.redirect(new URL("/dashboard", request.url)), contentSecurityPolicy);
    }
  }

  return securedResponse(NextResponse.next({ request: { headers: requestHeaders } }), contentSecurityPolicy);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"]
};
