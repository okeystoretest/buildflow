import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev_inseguro_troque",
);

const PUBLIC_PATHS = ["/login", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // libera estaticos e rotas publicas
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/uploads")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("bf_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
