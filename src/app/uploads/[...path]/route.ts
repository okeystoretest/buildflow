import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

// SO PARA DEV. Em producao o Nginx serve /uploads direto do disco (mais rapido).
// Ver bloco "location /uploads" no README.
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  try {
    const rel = params.path.join("/");
    // impede path traversal
    if (rel.includes("..")) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    const abs = path.join(UPLOAD_DIR, rel);
    const file = await readFile(abs);

    // O Content-Type depende da extensao. A Nota Fiscal pode ser PDF; se
    // devolvessemos "image/webp" para um PDF, o navegador nao abriria.
    const ext = path.extname(abs).toLowerCase();
    const contentType =
      ext === ".pdf" ? "application/pdf"
      : ext === ".png" ? "image/png"
      : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
      : "image/webp";

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
