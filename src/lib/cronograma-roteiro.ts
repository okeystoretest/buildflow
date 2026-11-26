import {
  rotuloDeFormato,
  rotuloDeFunil,
  rotuloDeMarca,
  rotuloDePlataforma,
  rotuloDeStatus,
} from "@/lib/cronograma";

/**
 * O QUE O MODELO RECEBE para escrever o roteiro de uma atividade. PURO: nada aqui
 * vai à rede, para poder ser conferido por script.
 *
 * MESMA ESTRUTURA DO BUILD.CONNECT (`lib/ai/script-prompt.ts`): uma linha por
 * campo, nos MESMOS RÓTULOS que a tela mostra. É o que faz a pessoa reconhecer
 * no roteiro o que ela preencheu no formulário — e os rótulos saem de
 * `lib/cronograma.ts`, que já é a tradução desta tela. Escrevê-los de novo
 * aqui criaria um segundo vocabulário para divergir do primeiro.
 *
 * CAMPO VAZIO NÃO VIRA LINHA. "Marca: não informada" só ensina o modelo a
 * comentar a ausência, e o roteiro volta falando do que não existe.
 *
 * O MODELO E A INSTRUÇÃO VÊM DE FORA (`lib/ia-settings.ts`), configurados
 * pela Gestão na aba Inteligência Artificial. Este arquivo não os lê do banco
 * nem do ambiente: recebe-os prontos. É o que mantém a montagem do prompt
 * conferível por script, sem Prisma atrás.
 */

export interface AssuntoDoRoteiro {
  title: string;
  /** ISO, como vem do banco. */
  scheduledAt: string;
  funnel: string;
  formats: string[];
  formatOther: string | null;
  status: string;
  brand: string | null;
  platforms: string[];
  notes: string | null;
  responsavel: string | null;
}

/** `25/11/2026 às 09:00`, em UTC — o mesmo fuso da grade. */
function quando(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const [data, hora] = d.toISOString().split("T");
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)} às ${hora.slice(0, 5)}`;
}

export function montarPrompt(atividade: AssuntoDoRoteiro): string {
  const linhas: string[] = [`Título: ${atividade.title}`];

  const data = quando(atividade.scheduledAt);
  if (data) linhas.push(`Data e horário: ${data}`);
  linhas.push(`Etapa do funil: ${rotuloDeFunil(atividade.funnel)}`);

  if (atividade.formats.length > 0) {
    // "Outro" vira a descrição que a pessoa digitou: mandar a palavra "Outro"
    // para o modelo não diz nada sobre o formato.
    const formatos = atividade.formats.map((f) =>
      f === "OUTRO" && atividade.formatOther ? atividade.formatOther : rotuloDeFormato(f),
    );
    linhas.push(`Formatos: ${formatos.join(", ")}`);
  }
  if (atividade.platforms.length > 0) {
    linhas.push(`Redes: ${atividade.platforms.map(rotuloDePlataforma).join(", ")}`);
  }
  if (atividade.brand) linhas.push(`Marca: ${rotuloDeMarca(atividade.brand)}`);
  linhas.push(`Status: ${rotuloDeStatus(atividade.status)}`);
  if (atividade.responsavel) linhas.push(`Responsável: ${atividade.responsavel}`);

  const notas = atividade.notes?.trim();
  if (notas) linhas.push(`Observações:\n${notas}`);

  return `Crie o roteiro para a atividade abaixo do cronograma de conteúdo.\n\n${linhas.join("\n")}`;
}

/* --------------------------------------------------------------- modelo */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 30_000;

export type RespostaDoModelo = { ok: true; texto: string } | { ok: false; motivo: string };

/**
 * A chamada ao modelo.
 *
 * GEMINI, e não outro, porque é o que o Build.Connect já usa: a chave já
 * existe, o roteiro sai com a mesma voz nas duas ferramentas, e não há
 * assinatura nova para contratar. Trocar de provedor é trocar esta função.
 *
 * O MODELO CHEGA VALIDADO (`configSchema`, em `ia-settings.ts`) — ele vira um
 * pedaço desta URL, e um nome com barra apontaria o pedido para outra rota.
 *
 * SEM BIBLIOTECA: é um POST com um JSON. Um SDK traria dezenas de arquivos
 * para montar o mesmo corpo.
 *
 * FALHA COM MOTIVO, nunca exceção: isto é rede, e rede cai. Uma tela de erro
 * no lugar do modal não diz à pessoa se o problema é a chave, a cota ou o
 * texto dela — e ela tenta de novo a tarde inteira.
 */
export async function gerarComModelo(
  prompt: string,
  modelo: string,
  instrucao: string,
): Promise<RespostaDoModelo> {
  // A CHAVE CONTINUA NO AMBIENTE, e só ela: a tela de Gestão configura o
  // modelo e a instrução, nunca o segredo (ver o schema de `AiSettings`).
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) {
    return {
      ok: false,
      motivo: "A geração por IA não está configurada neste sistema (falta GEMINI_API_KEY).",
    };
  }

  const controlador = new AbortController();
  const alarme = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/${modelo}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instrucao }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
      signal: controlador.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      // O corpo do erro do Google traz a chave em nenhum lugar, mas traz o
      // projeto: fica no log do servidor, não na tela.
      console.error(`[roteiro] modelo respondeu ${res.status}`);
      return {
        ok: false,
        motivo:
          res.status === 400 || res.status === 403
            ? "A credencial da IA foi recusada."
            : res.status === 404
              ? `O modelo "${modelo}" não existe neste provedor.`
              : res.status === 429
                ? "A cota da IA acabou por enquanto. Tente mais tarde."
                : "O serviço de IA não respondeu como esperado.",
      };
    }

    const dados = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    // Vem de fora: um formato inesperado não pode virar `.map of undefined` no
    // meio da action.
    const texto = (dados.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!texto) return { ok: false, motivo: "A IA devolveu uma resposta vazia." };

    return { ok: true, texto };
  } catch (err) {
    const abortou = err instanceof Error && err.name === "AbortError";
    console.error("[roteiro] falha ao chamar o modelo:", err);
    return {
      ok: false,
      motivo: abortou ? "A IA demorou demais para responder." : "Não foi possível falar com a IA.",
    };
  } finally {
    clearTimeout(alarme);
  }
}
