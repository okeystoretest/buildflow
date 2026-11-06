import { AlertTriangle, CalendarDays } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { buscarCronograma } from "@/lib/integration/connect-cronograma";
import {
  agruparPorDia,
  corDoStatus,
  janela,
  rotuloDeFormato,
  rotuloDeFunil,
  rotuloDeMarca,
  rotuloDePlataforma,
  rotuloDeStatus,
} from "@/lib/cronograma";
import { cn } from "@/lib/utils";

/**
 * CRONOGRAMA DE CONTEÚDO — o calendário do Marketing, vindo do Build.Connect.
 *
 * SOMENTE LEITURA. Quem edita é o Marketing, no Connect; duas telas que editam
 * a mesma agenda discordariam na primeira edição simultânea, e aqui nem há como
 * saber quem é o autor (o Flow não recebe esse campo, de propósito).
 *
 * MOSTRA SÓ O QUE O MARKETING PUBLICOU PARA TODOS (`visibility: SHARED` lá). O
 * filtro mora no Connect, não aqui: regra de visibilidade aplicada no consumidor
 * é regra que o próximo consumidor esquece.
 */
export const dynamic = "force-dynamic";

/** Recorte pedido ao Connect: o mês que passou e o trimestre que vem. */
const DIAS_ATRAS = 30;
const DIAS_ADIANTE = 90;

const diaLongo = (chave: string) =>
  new Date(`${chave}T12:00:00.000Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });

export default async function CronogramaPage() {
  await requireRole(["VENDAS", "GESTAO", "FINANCEIRO"]);

  const { de, ate } = janela(new Date(), DIAS_ATRAS, DIAS_ADIANTE);
  const resposta = await buscarCronograma(de, ate);

  return (
    <div className="space-y-4">
      <div>
      </div>

      {!resposta.ok ? (
        /* O MOTIVO APARECE NA TELA, não só no log: sem ele a pessoa não sabe
           se esperar, se avisar alguém, ou se o problema é ela. */
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">O cronograma não pôde ser carregado.</p>
            <p className="text-sm text-muted-foreground">{resposta.motivo}</p>
            <p className="text-xs text-muted-foreground">
              O calendário é mantido no Build.Connect — esta tela só o exibe.
            </p>
          </div>
        </div>
      ) : resposta.posts.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">
            Nada publicado pelo Marketing neste período.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {resposta.truncado && (
            <p className="text-xs text-muted-foreground">
              Mostrando as primeiras peças do período — há mais no Build.Connect.
            </p>
          )}
          {agruparPorDia(resposta.posts).map((dia) => (
            <section key={dia.chave || "sem-data"} className="rounded-xl border border-border bg-card p-4">
              <h2 className="pb-2 text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">
                {dia.chave ? diaLongo(dia.chave) : "Sem data definida"}
              </h2>
              <ul className="space-y-2">
                {dia.posts.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-secondary/40 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" title={p.title}>
                      {p.title}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", corDoStatus(p.status))}>
                      {rotuloDeStatus(p.status)}
                    </span>
                    {p.brand && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                        {rotuloDeMarca(p.brand)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{rotuloDeFunil(p.funnel)}</span>
                    {p.formats.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {p.formats.map(rotuloDeFormato).join(" · ")}
                      </span>
                    )}
                    {p.platforms.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {p.platforms.map(rotuloDePlataforma).join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
