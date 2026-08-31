import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getAuthSecret } from "@/lib/auth-secret";

// Mesmo segredo do resto do app, sem fallback inseguro (getAuthSecret valida
// e cacheia na 1ª chamada). Sem AUTH_SECRET em runtime, a verificação falha.

// /acompanhar e a area PUBLICA do cliente final (link enviado pela vendedora).
// Nao usa a sessao do sistema: a propria pagina exige o Codigo de Cliente e
// grava um cookie proprio (bf_track), restrito a este path.
const PUBLIC_PATHS = ["/login", "/api/health", "/acompanhar"];

// Arquivos publicos servidos de /public que NAO exigem sessao. Sem esta
// liberacao o middleware redirecionava manifest/icones/service worker para
// /login e o navegador recebia HTML no lugar do JSON — origem do erro
// "Manifest: Line 1, column 1, Syntax error" no console.
const PUBLIC_FILES = [
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
  "/favicon-32.png",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-icon.png",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Libera estáticos e rotas públicas. Nota: /uploads NÃO é mais liberado aqui;
  // agora é servido pela rota autenticada /api/uploads (ver route handler).
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    PUBLIC_FILES.includes(pathname) ||
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
    await jwtVerify(token, getAuthSecret());
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
