import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getAuthSecret } from "@/lib/auth-secret";

// Mesmo segredo do resto do app, sem fallback inseguro (getAuthSecret valida
// e cacheia na 1ª chamada). Sem AUTH_SECRET em runtime, a verificação falha.

// /acompanhar e a area PUBLICA do cliente final (link enviado pela vendedora).
// Nao usa a sessao do sistema: a propria pagina exige o Codigo de Cliente e
// grava um cookie proprio (bf_track), restrito a este path.
// /api/integracao e maquina-a-maquina (Build.Connect): autentica por token de
// servico dentro de cada rota, nao por cookie de sessao.
// /api/cron e o mesmo caso: chamada por um agendador externo, que nao tem
// cookie nenhum. A rota confere o Bearer dela propria e, sem o segredo
// configurado, responde 401 a tudo — liberar aqui nao abre nada.
// /atacado e a LP PUBLICA de captacao de revendedor (link que a vendedora
// compartilha). Nao usa sessao: e pagina de marca, aberta por quem ainda nao
// e cliente. UM unico segmento serve as duas marcas (/atacado/okey e
// /atacado/lov-club) — por isso a marca nao fica no primeiro nivel: um so
// item aqui libera as duas, e uma marca nova nao exige mexer neste arquivo.
// /api/lp serve as IMAGENS dessa LP, e so elas: a lojista nao tem sessao, e
// /api/uploads exige uma de proposito, porque serve comprovante de pagamento,
// nota fiscal e comprovante de entrega. A rota propria confina a leitura a
// <UPLOAD_DIR>/atacado por canonicalizacao e aceita so .webp (ver
// src/lib/lp-assets.ts). Liberar aqui nao alcanca o resto do volume.
const PUBLIC_PATHS = [
  "/login",
  "/api/health",
  "/acompanhar",
  "/api/integracao",
  "/api/cron",
  "/atacado",
  "/api/lp",
];

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
  //
  // O casamento é pelo caminho EXATO ou por um segmento abaixo dele, nunca por
  // prefixo de texto: `startsWith("/api/cron")` sozinho liberaria também
  // /api/cronx e qualquer rota cujo nome só comece igual — uma rota futura
  // nasceria sem sessão sem ninguém ter decidido isso.
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
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
