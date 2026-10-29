"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, User } from "lucide-react";
import { Modal } from "@/components/shared/modal";
import { shortName } from "@/lib/utils";

/**
 * O NOME DA CLIENTE, CLICÁVEL: abre o cadastro dela.
 *
 * Um clique num nome mostra código, endereço e contato sem sair da tela. Antes,
 * responder "onde essa cliente fica?" no meio de uma conversa ao telefone
 * obrigava a abrir `/vendas/clientes`, procurar e perder o lugar na lista.
 *
 * CARREGA SÓ AO ABRIR. O cadastro NÃO viaja no HTML da lista: uma tabela de 50
 * linhas mandaria endereço e contato de 50 clientes para desenhar 50 nomes, em
 * telas que não mostram nada disso. Uma consulta por clique é mais barata que
 * isso em qualquer tela com mais de uma linha — e o dado chega sempre fresco.
 *
 * NÃO APARECE EM TODA TELA. `clicavel` existe porque o cadastro é de
 * VENDAS/GESTAO/FINANCEIRO (a mesma fronteira de `/vendas/clientes` e da rota
 * que isto consome), e componentes como a ficha do pedido e o quadro são os
 * MESMOS na Logística e na tela do Motorista. Nesses lugares o nome continua
 * texto. O padrão é `false`: um componente compartilhado que ganha um parente
 * novo não deve passar a expor cadastro por esquecimento.
 *
 * A autoridade é o servidor. Esconder o clique é o que faz a tela não oferecer
 * o que vai ser recusado; a recusa real está na rota.
 */

interface Cadastro {
  code: string;
  name: string;
  cep: string | null;
  street: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  contact: string | null;
}

/** Campo do cadastro. Só os PREENCHIDOS aparecem — ver `linhas`. */
function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="break-words text-sm">{valor}</p>
    </div>
  );
}

/**
 * Os campos a mostrar, na ordem de um endereço brasileiro.
 *
 * SÓ OS PREENCHIDOS. Quase tudo em `Customer` é opcional, e uma ficha com seis
 * traços seguidos não informa que o cadastro está incompleto — ela só parece
 * quebrada. A ausência fica dita de uma vez, embaixo.
 */
function linhas(c: Cadastro): { rotulo: string; valor: string }[] {
  const todos: { rotulo: string; valor: string | null }[] = [
    { rotulo: "Código", valor: c.code },
    { rotulo: "Nome", valor: c.name },
    { rotulo: "CEP", valor: c.cep },
    { rotulo: "Logradouro", valor: c.street },
    { rotulo: "Bairro", valor: c.district },
    { rotulo: "Cidade", valor: c.city },
    { rotulo: "UF", valor: c.state },
    { rotulo: "Contato", valor: c.contact },
  ];
  return todos.filter((l): l is { rotulo: string; valor: string } => Boolean(l.valor?.trim()));
}

export function NomeDoCliente({
  nome,
  codigo,
  clicavel = false,
  curto = true,
  className,
}: {
  nome: string;
  /** `Customer.code`. Sem ele não há o que buscar, e o nome fica texto. */
  codigo?: string | null;
  clicavel?: boolean;
  /** Primeiro + segundo nome. Desligue onde a tela mostra o registro inteiro. */
  curto?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const exibido = curto ? shortName(nome) : nome;

  const buscar = useCallback(async () => {
    if (!codigo) return;
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/customers/by-code?code=${encodeURIComponent(codigo)}`);
      if (!res.ok) {
        // A mensagem é do estado, não do corpo da resposta: 403 e 404 são
        // coisas diferentes para quem está olhando, e "Erro 404" não é.
        setErro(
          res.status === 404
            ? "Cadastro não encontrado. Pode ter sido apagado."
            : res.status === 403
              ? "Você não tem acesso ao cadastro de clientes."
              : "Não foi possível carregar o cadastro.",
        );
        return;
      }
      const dados = (await res.json()) as { customer: Cadastro };
      setCadastro(dados.customer);
    } catch {
      setErro("Não foi possível carregar o cadastro.");
    } finally {
      setCarregando(false);
    }
  }, [codigo]);

  // Busca ao ABRIR, e de novo a cada abertura: o cadastro pode ter sido
  // corrigido desde a última vez, e um modal que mostra o estado de dez minutos
  // atrás é pior que um que demora 200ms.
  useEffect(() => {
    if (aberto) void buscar();
  }, [aberto, buscar]);

  // Sem código não há busca possível (pedido antigo sem cliente, por exemplo):
  // o nome fica texto, em vez de um botão que sempre falharia.
  if (!clicavel || !codigo) {
    return (
      <span className={className} title={nome}>
        {exibido}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // A tela toda é feita de cards e linhas clicáveis. Sem isto, abrir o
          // cadastro abriria TAMBÉM o pedido por baixo dele.
          e.stopPropagation();
          setAberto(true);
        }}
        title={`${nome} — ver cadastro`}
        className={`cursor-pointer text-left underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${className ?? ""}`}
      >
        {exibido}
      </button>

      {aberto && (
        <Modal onClose={() => setAberto(false)} largura="max-w-lg">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <User className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="break-words text-lg font-bold">{cadastro?.name ?? nome}</h2>
                <p className="font-data text-sm text-muted-foreground">{codigo}</p>
              </div>
            </div>

            {carregando && <p className="text-sm text-muted-foreground">Carregando cadastro…</p>}

            {erro && <p className="text-sm text-destructive">{erro}</p>}

            {cadastro && !carregando && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {linhas(cadastro).map((l) => (
                    <Campo key={l.rotulo} rotulo={l.rotulo} valor={l.valor} />
                  ))}
                </div>
                {/* Cadastro sem endereço é comum (todos os campos de endereço
                    são opcionais), e é informação: é o que explica um pedido de
                    Excursão sem endereço pré-preenchido. */}
                {!cadastro.street && !cadastro.city && !cadastro.cep && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Este cadastro não tem endereço preenchido.
                  </p>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
