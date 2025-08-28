import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Handle invite-only mode redirects
  const isInviteOnly = process.env.NEXT_PUBLIC_INVITE_ONLY_MODE === "true";
  const pathname = request.nextUrl.pathname;

  // Redirect /auth/sign-up to invite-only page if enabled
  if (isInviteOnly && pathname === "/auth/sign-up") {
    // Allow the page to render with invite-only content
    // The page itself will handle showing the appropriate message
  }

  // Tenant slug resolution
  const host = request.headers.get("host") || "";
  const hostParts = host.split(".");
  const subdomain = hostParts[0];
  
  // Skip subdomain processing for apex domains only
  // Allow test.localhost:3000, acme.localhost:3000, etc.
  const isApexDomain = hostParts.length === 1 || 
    host === "localhost" ||
    host.startsWith("localhost:") ||
    host === process.env.NEXT_PUBLIC_APP_BASE_DOMAIN;

  if (!isApexDomain && subdomain && subdomain !== "www") {
    // Set tenant slug header for subdomain routing (e.g., test.localhost:3000 -> "test")
    response.headers.set("x-tenant-slug", subdomain);
  } else {
    // For apex domain, try to extract tenant from path or other means
    response.headers.delete("x-tenant-slug");
  }

  // Auth protection
  const { data: { user } } = await supabase.auth.getUser();

  // Public paths that don't require authentication
  const publicPaths = [
    "/auth/",
    "/invite/accept",
    "/oauth/",
    "/api/",
    "/backoffice",
    "/error",
    "/not-found",
    "/_next/",
    "/favicon.ico",
    "/logo.png"
  ];

  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));

  // Protected routes require authentication
  if (!isPublicPath && !user) {
    const redirectUrl = new URL("/auth/login", request.url);
    
    // Preserve the intended destination
    if (pathname !== "/") {
      redirectUrl.searchParams.set("next", pathname);
    }
    
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from auth pages OR from root
  if (user && ((pathname.startsWith("/auth/") && pathname !== "/auth/confirm") || pathname === "/")) {
    // Check if user is platform admin using the same client
    try {
      const { data: platformAdmin } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (platformAdmin?.user_id) {
        console.log("🔐 [MIDDLEWARE] Platform admin detected, redirecting to /backoffice");
        return NextResponse.redirect(new URL("/backoffice", request.url));
      } else {
        console.log("🔐 [MIDDLEWARE] Regular user, redirecting to /dashboard");
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    } catch (error) {
      console.log("⚠️ [MIDDLEWARE] Platform admin check failed, defaulting to /dashboard:", error);
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};