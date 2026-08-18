import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth";

// Este handler serve os arquivos de /uploads SOMENTE para usuários autenticados.
// Antes, o Nginx expunha /uploads publicamente — qualquer um com a URL de um
// comprovante/NF baixava o arquivo sem login. Agora o acesso passa pelo Node,
// que exige sessão válida.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";
// Raiz absoluta canônica, para barrar path traversal (../).
const ROOT = path.resolve(UPLOAD_DIR);

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  // 1) Exige sessão válida (inclui checagem de revogação em getSession).
  const session = await getSession();
  if (!session) {
    return new NextResponse("Não autorizado.", { status: 401 });
  }

  // 2) Monta o caminho absoluto e CONFIRMA que fica dentro de ROOT.
  const segments = params.path ?? [];
  const relative = segments.join("/");
  const absolute = path.resolve(ROOT, relative);
  if (absolute !== ROOT && !absolute.startsWith(ROOT + path.sep)) {
    // Tentativa de sair da pasta (../etc/passwd) — bloqueado.
    return new NextResponse("Caminho inválido.", { status: 400 });
  }

  // 3) Só serve extensões conhecidas de mídia/documento.
  const ext = path.extname(absolute).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return new NextResponse("Tipo de arquivo não permitido.", { status: 400 });
  }

  // 4) Lê e devolve o arquivo.
  try {
    const info = await stat(absolute);
    if (!info.isFile()) {
      return new NextResponse("Não encontrado.", { status: 404 });
    }
    const data = await readFile(absolute);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(info.size),
        // Cache privado: o navegador guarda, mas proxies compartilhados não.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Não encontrado.", { status: 404 });
  }
}
