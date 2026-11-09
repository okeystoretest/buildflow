import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import {
  buscarArquivoDaVitrine,
  type TipoDeArquivoDaVitrine,
} from "@/lib/integration/connect-vitrine";
import { PAPEIS_DA_VITRINE } from "@/lib/vitrine";

/**
 * GET /api/vendas/vitrine/arquivo?tipo=&id= — os bytes de um item
 * da vitrine, servidos a quem está logado AQUI.
 *
 * ESTE É O PORTÃO DE QUEM: sessão do Flow e os mesmos papéis que abrem a tela
 * (a lista mora em `lib/vitrine`, uma só, para não divergirem). Sem esta
 * conferência bastaria o link na mão para baixar o acervo sem login — nome de
 * arquivo aleatório não é controle de acesso, e link vaza por histórico,
 * Referer e encaminhamento.
 *
 * O PORTÃO DE QUÊ é do outro lado: a rota do Connect só resolve id de item de
 * subsetor VITRINE, e o caminho sai do banco de lá. Por isso aqui não há
 * caminho nenhum para validar — o que esta rota repassa é um id.
 *
 * POR QUE NÃO FICA EM `api/integracao/`, onde está o resto desta integração:
 * aquele prefixo é PÚBLICO no middleware (ver src/middleware.ts) porque as
 * rotas de lá são máquina-a-máquina e se autenticam por token de serviço, sem
 * cookie. Esta é chamada pelo NAVEGADOR de quem está logado — pendurá-la lá
 * tiraria a conferência de sessão do middleware e deixaria este arquivo como
 * única barreira, num prefixo onde o próximo leitor assume o contrário.
 *
 * É UM CANO, não um buffer: a resposta do Connect segue direto (`res.body`).
 * Materializar um vídeo de 300 MB em memória para reenviá-lo derrubaria o
 * processo em dois acessos simultâneos.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS: readonly string[] = ["foto", "video", "miniatura", "documento"];
/** cuid do Connect. Recusar o resto cedo evita assinar pedido sem sentido. */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Repassados como vieram, e cada um por um motivo: sem `content-range` o
 * `<video>` não faz seek; sem `content-disposition` o arquivo do Office abre
 * como lixo na aba em vez de baixar; sem `nosniff` o navegador adivinha tipo.
 */
const CABECALHOS_REPASSADOS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "content-disposition",
  "x-content-type-options",
];

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!PAPEIS_DA_VITRINE.includes(session.role)) {
    return NextResponse.json({ error: "Sem permissão para a Vitrine." }, { status: 403 });
  }

  const tipo = req.nextUrl.searchParams.get("tipo") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!TIPOS.includes(tipo) || !ID_VALIDO.test(id)) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  try {
    const res = await buscarArquivoDaVitrine(
      tipo as TipoDeArquivoDaVitrine,
      id,
      req.headers.get("range"),
    );
    if (!res) {
      return NextResponse.json(
        { error: "Integração com o Build.Connect não configurada." },
        { status: 503 },
      );
    }
    // 206 e 416 fazem parte do protocolo do Range e não são falha; 404 é "não
    // é item de vitrine" e tem de chegar como 404, senão a tela trata falta de
    // material como Connect fora do ar.
    if (res.status !== 200 && res.status !== 206 && res.status !== 416) {
      console.error(`[vitrine/arquivo] Connect respondeu ${res.status} para ${tipo}/${id}`);
      return NextResponse.json(
        { error: "Arquivo indisponível." },
        { status: res.status === 404 ? 404 : 502 },
      );
    }

    const headers = new Headers();
    for (const nome of CABECALHOS_REPASSADOS) {
      const valor = res.headers.get(nome);
      if (valor) headers.set(nome, valor);
    }
    // Curto e `private`: conteúdo de usuário autenticado, e o acesso pode ser
    // retirado — cache longo o deixaria reabrindo do disco do navegador depois
    // disso. Cinco minutos é o que o resto da integração usa.
    headers.set("Cache-Control", "private, max-age=300");

    return new Response(res.body, { status: res.status, headers });
  } catch (err) {
    console.error("[vitrine/arquivo] falha ao falar com o Connect:", err);
    return NextResponse.json(
      { error: "Não foi possível falar com o Build.Connect." },
      { status: 502 },
    );
  }
}
