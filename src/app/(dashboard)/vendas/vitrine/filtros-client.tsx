"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFilterQuery } from "@/hooks/use-filter-query";

/**
 * Busca e filtros da Vitrine — os mesmos controles do Connect: um campo de
 * texto pelo nome do conteúdo e os três seletores da coleção (Temporada,
 * Coleção, Ano).
 *
 * APLICAM SOZINHOS, sem botão "Filtrar": é o padrão transversal das listagens
 * desta aplicação (`useFilterQuery`), e é o que o Connect faz. O texto espera
 * a digitação parar; os seletores aplicam no clique.
 *
 * O filtro mora na URL e o SERVIDOR refaz o recorte. Filtrar no navegador
 * exigiria mandar o acervo inteiro para cá e tiraria o compartilhamento de
 * link — "me manda a busca que você fez" deixa de funcionar.
 *
 * SELETOR SEM OPÇÃO NÃO APARECE: a vitrine que ninguém preencheu com temporada
 * mostraria três listas com um item só ("todas"), prometendo um filtro que não
 * filtra.
 */
export function VitrineFiltros({
  placeholder,
  opcoes,
  atual,
}: {
  placeholder: string;
  opcoes: { temporada: string[]; colecao: string[]; ano: string[] };
  atual: { q: string; temporada: string; colecao: string; ano: string };
}) {
  const f = useFilterQuery(
    { q: atual.q },
    { instant: { temporada: atual.temporada, colecao: atual.colecao, ano: atual.ano } },
  );

  const campos = [
    { chave: "temporada" as const, label: "Temporada", opcoes: opcoes.temporada },
    { chave: "colecao" as const, label: "Coleção", opcoes: opcoes.colecao },
    { chave: "ano" as const, label: "Ano", opcoes: opcoes.ano },
  ].filter((c) => c.opcoes.length > 0);

  const algumFiltro = Boolean(f.instant.temporada || f.instant.colecao || f.instant.ano);

  return (
    /* `gap-2` e a busca com teto de largura: os dois numeros saem da barra do
       Connect (`collection-filter-bar.tsx` e `content-toolbar.tsx`), que e o
       padrao que esta tela segue. Sem o teto, a busca esticava ate o fim da
       linha e empurrava os seletores para a borda direita. */
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex-1 space-y-1 sm:max-w-xs" style={{ minWidth: 220 }}>
        <Label>{placeholder}</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 pr-9"
            placeholder={placeholder}
            value={f.text.q}
            onChange={(e) => f.setText("q", e.target.value)}
          />
          {f.text.q && (
            <button
              type="button"
              onClick={() => f.clear("q")}
              aria-label="Limpar busca"
              className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {campos.map((campo) => (
        <div key={campo.chave} className="space-y-1">
          <Label>{campo.label}</Label>
          <select
            className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
            aria-label={`Filtrar por ${campo.label}`}
            value={f.instant[campo.chave]}
            onChange={(e) => f.setInstant(campo.chave, e.target.value)}
          >
            <option value="">Todas</option>
            {campo.opcoes.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      ))}

      {algumFiltro && (
        /* Limpa SÓ os seletores, não a busca: quem digitou um nome e depois
           escolheu a temporada errada quer desfazer a escolha, não a digitação.
           Numa navegação só — duas empilhariam duas entradas no histórico. */
        <button
          type="button"
          onClick={() => f.setInstantMany({ temporada: "", colecao: "", ano: "" })}
          className="h-10 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
