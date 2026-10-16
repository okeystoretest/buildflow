import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUseWholesaleTool } from "@/lib/wholesale-permissions";

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

  // 1b) A pasta `atacado` guarda as DUAS FOTOGRAFIAS de cada candidata a
  // revenda: o espaço físico e o print da loja online, de alguém que não é
  // cliente e pode nunca ser. "Tem sessão?" era autorização errada para isso —
  // a fila de triagem é devidamente escopada (`canUseWholesaleTool`, WHERE em
  // `listLeadsFor`), então uma vendedora de VAREJO corretamente recusada na fila
  // não era recusada no ARQUIVO se obtivesse o caminho. O `randomUUID()` no nome
  // torna isso difícil, não impossível, e "difícil de adivinhar" não é controle
  // de acesso. Aqui a porta passa a fazer a mesma pergunta que a fila.
  //
  // Escopado só a esta pasta de propósito: comprovantes, notas fiscais e
  // comprovantes de entrega têm outras regras de quem pode ver, e alargar esta
  // checagem para eles trancaria gente que hoje precisa dos arquivos.
  const segments = params.path ?? [];
  if (segments[0] === "atacado") {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, salesModel: true, active: true },
    });
    if (
      !user ||
      !user.active ||
      !canUseWholesaleTool({ userId: session.userId, role: user.role, salesModel: user.salesModel })
    ) {
      // Mesma resposta de "não autorizado": quem não pode ver o lead também não
      // precisa descobrir que o arquivo existe.
      return new NextResponse("Não autorizado.", { status: 401 });
    }
  }

  // 2) Monta o caminho absoluto e CONFIRMA que fica dentro de ROOT.
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
