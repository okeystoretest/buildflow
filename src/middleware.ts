import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { AUTH_SECRET_KEY } from "@/lib/auth-secret";

// Mesmo segredo do resto do app, sem fallback inseguro. Se AUTH_SECRET faltar,
// o import falha e o app não sobe — comportamento desejado.
const secret = AUTH_SECRET_KEY;

const PUBLIC_PATHS = ["/login", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Libera estáticos e rotas públicas. Nota: /uploads NÃO é mais liberado aqui;
  // agora é servido pela rota autenticada /api/uploads (ver route handler).
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("bf_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  try {
    // Checagem barata só de assinatura/validade (Edge não acessa o banco).
    // A revogação por tokenVersion é conferida no getSession (runtime Node),
    // usado por páginas e Server Actions — a camada autoritativa.
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
