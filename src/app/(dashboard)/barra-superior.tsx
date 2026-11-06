"use client";

import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/shared/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { CONFIG, cabecalhoDaRota, corDoModulo, moduloAtivo, type NavModule } from "./nav";
import { cn } from "@/lib/utils";

/**
 * A BARRA SUPERIOR: trilha, titulo e descricao da tela à esquerda; sino e tema
 * à direita; separadores entre as areas. Conforme o Build.Connect (pedido do
 * dono, 06/11/2026).
 *
 * MORA NO LAYOUT, e nao na pagina, por um motivo pratico: 15 das 36 telas do
 * painel nunca tiveram cabecalho proprio. Com a barra na pagina, essas 15
 * ficariam sem barra — e sem o sino e o tema, que vivem nela — e o sistema
 * teria dois cabecalhos diferentes conforme a tela.
 *
 * O TEXTO SAI DO `NAV`, que ja e a unica fonte sobre o nome e o setor de cada
 * rota. A alternativa era cada pagina passar o proprio titulo, e foi o que
 * havia: renomear uma ferramenta no menu e esquecer a tela deixava as duas
 * discordando sem nada quebrar.
 *
 * `sticky top-0`: a barra diz ONDE a pessoa esta, e essa resposta nao pode
 * rolar para fora da tela junto com a tabela. Fica ABAIXO da barra lateral no
 * empilhamento (z-20 contra z-50) porque a gaveta do celular passa por cima de
 * tudo.
 */
export function BarraSuperior({
  modulos,
  podeConfigurar,
}: {
  modulos: NavModule[];
  podeConfigurar: boolean;
}) {
  const pathname = usePathname() ?? "";
  const doNav = cabecalhoDaRota(pathname, modulos);

  // Gestao nao esta no NAV (mora no rodape da barra lateral), mas as telas dela
  // tambem precisam de titulo.
  const naGestao = pathname === CONFIG.href || pathname.startsWith(`${CONFIG.href}/`);
  const cab =
    doNav ??
    (naGestao && podeConfigurar
      ? { trilha: null, titulo: CONFIG.label, descricao: "Usuários, lojas e as listas que o sistema usa." }
      : null);

  // A faixa da cor do setor ativo. `/gestao` nao esta no NAV, entao resolve
  // pela mesma regra do titulo acima.
  const faixa = corDoModulo(moduloAtivo(pathname, modulos) ?? (naGestao ? CONFIG.href : null)).faixa;

  return (
    <>
      {/* FAIXA DA COR DO SETOR, atravessando a JANELA INTEIRA (pedido do dono,
          06/11/2026, "como inicialmente fazia"). `fixed` e nao um elemento no
          fluxo: assim ela cobre tambem a largura da barra lateral sem empurrar
          nada 4px para baixo — o que obrigaria a recalcular o `lg:h-screen` da
          barra e criaria uma rolagem de 4px na pagina inteira.
          z-[60] fica acima da barra lateral (z-50) porque ela passa por cima
          da coluna; sao 4px no topo, nao cobrem conteudo. */}
      <div className={cn("fixed inset-x-0 top-0 z-[60] h-1 transition-colors", faixa)} aria-hidden />

      <div className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {cab ? (
          <>
            <div className="min-w-0 shrink-0">
              {cab.trilha && (
                <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">
                  {cab.trilha}
                </p>
              )}
              <h1 className="truncate text-base font-bold leading-tight">{cab.titulo}</h1>
            </div>
            {cab.descricao && (
              <>
                {/* Separador entre o titulo e a descricao, como na referencia.
                    `hidden sm:block`: numa coluna estreita a regua vertical
                    ficaria colada no texto e a descricao nao caberia mesmo. */}
                <div className="hidden h-8 w-px shrink-0 bg-border sm:block" aria-hidden />
                <p className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block">
                  {cab.descricao}
                </p>
              </>
            )}
          </>
        ) : (
          /* Rota fora do NAV (a inicial, por exemplo): a barra continua, com o
             sino e o tema. Sem titulo inventado. */
          <span className="sr-only">Build.Flow</span>
        )}
      </div>

      <div className={cn("flex shrink-0 items-center gap-1 pl-3", cab && "border-l border-border")}>
        <NotificationBell />
        <ThemeToggle />
      </div>
      </div>
    </>
  );
}
