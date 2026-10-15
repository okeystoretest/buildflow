"use client";

import { useEffect, useRef, useState } from "react";
import { submitWholesaleApplication } from "@/lib/actions/wholesale-apply";
import { shrinkImageToBase64 } from "@/lib/client-image";
import {
  FOUND_US,
  INVESTMENT_BANDS,
  SERVICE_MODELS,
  UF_LIST,
  type CampoEsperado,
} from "@/lib/wholesale-apply-validation";

/**
 * Formulário público de candidatura (18 campos, todos obrigatórios: decisão 20).
 *
 * Os textos de ERRO de campo vêm da Server Action e são exibidos como chegam:
 * uma segunda lista de mensagens aqui divergiria da do servidor. As únicas
 * mensagens daqui são as de falhas que acontecem no navegador (imagem ilegível,
 * foto pesada, rede).
 *
 * Forma visual: o requerimento de uma concessão. Cada grupo é uma placa com a
 * cabeça gravada pendurada no próprio filete — o <legend> nativo do <fieldset>
 * interrompe a borda por conta própria, que é exatamente a cabeça pendurada
 * deste mundo —, e cada campo é uma LINHA PARA ESCREVER e não uma caixa
 * arredondada (`.campo-regua` em atacado.css). As regras de estilo moram no
 * CSS escopado; aqui ficam só a estrutura e a semântica.
 */

// Mesmo teto por imagem da action (MAX_FOTO_MB). Conferido aqui para que a
// lojista saiba QUAL foto reduzir: duas fotos acima disso estouram o corpo de
// 12mb do Next ANTES da action rodar, e a falha chegaria como erro opaco de rede
// no fim de 18 campos.
const MAX_FOTO_BYTES = 4 * 1024 * 1024;

// Opções derivadas das tuplas do validador: valor novo no servidor sem rótulo
// aqui deixa de compilar (Record exige todas as chaves), e valor que o servidor
// não aceita não tem como ser enviado.
const ROTULOS_ATENDIMENTO: Record<(typeof SERVICE_MODELS)[number], string> = {
  LOJA_FISICA: "Loja física",
  LOJA_ONLINE: "Loja online",
  FISICA_E_ONLINE: "Loja física e online",
  OUTRO: "Outro",
};
const OPCOES_ATENDIMENTO = SERVICE_MODELS.map((v) => ({
  valor: v,
  rotulo: ROTULOS_ATENDIMENTO[v],
}));

const ROTULOS_ORIGEM: Record<(typeof FOUND_US)[number], string> = {
  INSTAGRAM: "Instagram",
  SITE: "Site",
  INDICACAO: "Indicação",
  OUTRO: "Outro",
};
const OPCOES_ORIGEM = FOUND_US.map((v) => ({ valor: v, rotulo: ROTULOS_ORIGEM[v] }));

const ROTULOS_INVESTIMENTO: Record<(typeof INVESTMENT_BANDS)[number], string> = {
  ATE_3K: "Até R$ 3 mil",
  DE_3_A_5K: "De R$ 3 a R$ 5 mil",
  DE_5_A_10K: "De R$ 5 a R$ 10 mil",
  ACIMA_10K: "Acima de R$ 10 mil",
};
const OPCOES_INVESTIMENTO = INVESTMENT_BANDS.map((v) => ({
  valor: v,
  rotulo: ROTULOS_INVESTIMENTO[v],
}));

// "sim"/"nao" explícitos: vazio é recusa no servidor, não "não" (decisão 20), e
// só um par de radios distingue "não quero visita" de "não respondi".
const OPCOES_VISITA = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
] as const;

// Tipado pela união que o validador exporta: chave com nome trocado ou faltando
// não compila (o envio não tem outra rede, nenhum script alcança este componente).
const CAMPOS_VAZIOS: Record<CampoEsperado, string> = {
  contactName: "",
  email: "",
  phone: "",
  story: "",
  state: "",
  city: "",
  serviceModel: "",
  serviceModelOther: "",
  instagram: "",
  marketTime: "",
  teamSize: "",
  brandsCarried: "",
  foundUs: "",
  foundUsOther: "",
  followTime: "",
  investmentBand: "",
  wantsVisit: "",
  cnpj: "",
};

/** Tamanho aproximado, em bytes, do binário dentro de um data-URL base64. */
function bytesDoDataUrl(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

// Data-URL já encolhida, ou nada escolhido.
type ImagemEstado = string | null;

export function ApplyForm({
  brandSlug,
  referralCode,
}: {
  brandSlug: string;
  referralCode: string | null;
}) {
  const [campos, setCampos] = useState<Record<CampoEsperado, string>>(CAMPOS_VAZIOS);
  const [instagramImage, setInstagramImage] = useState<ImagemEstado>(null);
  const [storeImage, setStoreImage] = useState<ImagemEstado>(null);
  const [erroInstagram, setErroInstagram] = useState<string | null>(null);
  const [erroLoja, setErroLoja] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  // Encolher foto grande no celular leva segundos: enviar nesse intervalo diria
  // "envie as imagens" com os dois arquivos já escolhidos.
  const [lendo, setLendo] = useState({ instagram: false, loja: false });

  // Fixado na montagem: o servidor recusa envio com menos de 5s de página
  // aberta (contenção contra robô). Uma pessoa real leva minutos.
  const openedAt = useRef(Date.now());

  // Guarda de envio por ref: `enviando` (estado) só muda na próxima renderização,
  // e dois toques antes dela passariam ambos. O custo seria cadastro duplicado
  // na fila da analista, idêntico ao sinal de tentativa repetida.
  const enviandoRef = useRef(false);

  // Número da seleção mais recente de cada upload: resultado de uma seleção que
  // já foi substituída (ou apagada) é descartado ao chegar.
  const selecao = useRef({ instagram: 0, loja: 0 });
  const inputLoja = useRef<HTMLInputElement>(null);
  const tituloSucesso = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!enviado) return;
    window.scrollTo({ top: 0 });
    // Foco no título: o formulário inteiro sumiu, e leitor de tela precisa ser
    // levado à confirmação (role="status" sozinho nem sempre anuncia conteúdo
    // que já nasce montado).
    tituloSucesso.current?.focus();
  }, [enviado]);

  function definir(campo: CampoEsperado, valor: string) {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
  }

  // O rótulo do segundo upload MUDA com a resposta da pergunta 7 (decisão 21).
  // Loja só online não tem espaço físico para fotografar; o campo continua
  // obrigatório, muda o que se pede.
  const pedeEspacoFisico = campos.serviceModel !== "LOJA_ONLINE";
  const rotuloLoja = pedeEspacoFisico
    ? "Compartilhe conosco uma foto do seu espaço físico:"
    : "Compartilhe conosco um print da sua loja online:";

  // Trocar a pergunta 7 entre "Loja online" e o resto muda O QUE o segundo
  // upload pede (decisão 21). Uma foto já escolhida passaria a ser gravada com a
  // rotulagem errada (foto de salão marcada como print de loja online), então é
  // descartada, e a lojista é avisada para não parecer defeito.
  function trocarAtendimento(valor: string) {
    const passaAPedirFisico = valor !== "LOJA_ONLINE";
    if (passaAPedirFisico !== pedeEspacoFisico && (storeImage || lendo.loja)) {
      selecao.current.loja++;
      setStoreImage(null);
      setLendo((l) => ({ ...l, loja: false }));
      if (inputLoja.current) inputLoja.current.value = "";
      setErroLoja(
        "Limpamos a imagem anterior porque a pergunta sobre como você atende mudou. " +
          "Envie novamente, conforme o que é pedido agora.",
      );
    }
    definir("serviceModel", valor);
  }

  async function escolherImagem(input: HTMLInputElement, qual: "instagram" | "loja") {
    const guardar = qual === "instagram" ? setInstagramImage : setStoreImage;
    const avisar = qual === "instagram" ? setErroInstagram : setErroLoja;
    const file = input.files?.[0];
    const id = ++selecao.current[qual];
    guardar(null);
    avisar(null);
    if (!file) {
      setLendo((l) => ({ ...l, [qual]: false }));
      return;
    }
    setLendo((l) => ({ ...l, [qual]: true }));

    const r = await shrinkImageToBase64(file, { maxDimension: 1600 });
    // Seleção substituída enquanto encolhia: quem manda é a mais nova.
    if (selecao.current[qual] !== id) return;
    setLendo((l) => ({ ...l, [qual]: false }));

    if (r.error !== undefined) {
      // Texto do próprio client-image (tipo não aceito, acima de 25MB, ilegível):
      // causas diferentes pedem ações diferentes, então não são fundidas.
      avisar(r.error);
      // Limpa o input: o `required` nativo volta a apontar o campo, em vez de
      // deixar um arquivo "escolhido" que não foi aceito.
      input.value = "";
      return;
    }
    if (bytesDoDataUrl(r.base64) > MAX_FOTO_BYTES) {
      // Review Focus 5: HEIC de iPhone. client-image tenta decodificar HEIC e só
      // devolve o original quando a decodificação falha; um HEIC que AINDA passa
      // do teto é esse caso. Abrir a foto, Editar e salvar faz o iOS regravá-la
      // como JPEG, por isso a instrução funciona. Sem isso, com TUDO obrigatório
      // (decisão 20), ela ficaria presa sem saída.
      const ehHeic = file.type === "image/heic" || file.type === "image/heif";
      avisar(
        ehHeic
          ? "Não conseguimos reduzir esta foto. Se ela veio do iPhone, abra a foto, " +
              "toque em Editar, salve e envie novamente — ou tire um print dela."
          : "Esta foto está pesada demais (máximo de 4MB). Escolha uma foto mais " +
              "leve ou tire um print dela.",
      );
      input.value = "";
      return;
    }
    guardar(r.base64);
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviandoRef.current) return;
    setErro(null);

    if (!instagramImage || !storeImage) {
      setErro("Envie as duas imagens pedidas antes de enviar o cadastro.");
      return;
    }
    // Conferência do PAR, depois de encolher e antes de enviar: é aqui, e não
    // dentro do Next, que a recusa pode dizer qual foto reduzir.
    const pesada =
      bytesDoDataUrl(instagramImage) > MAX_FOTO_BYTES
        ? "do perfil do Instagram"
        : bytesDoDataUrl(storeImage) > MAX_FOTO_BYTES
          ? pedeEspacoFisico
            ? "do espaço físico"
            : "da loja online"
          : null;
    if (pesada) {
      setErro(
        `A imagem ${pesada} está pesada demais (máximo de 4MB). Reduza essa foto e tente de novo.`,
      );
      return;
    }

    enviandoRef.current = true;
    setEnviando(true);
    try {
      const res = await submitWholesaleApplication({
        brandSlug,
        referralCode,
        campos,
        instagramImage,
        storeImage,
        honeypot,
        openedAt: openedAt.current,
      });
      if (res.ok) {
        setEnviado(true);
      } else {
        // Mensagem do servidor, como veio.
        setErro(res.error);
      }
    } catch {
      // Falha de transporte (rede caiu, corpo recusado antes da action). Os
      // campos continuam preenchidos: ela só precisa tentar de novo.
      setErro("Não foi possível enviar agora. Confira a conexão e tente novamente.");
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  // Sem prometer prazo nem canal de resposta: não há canal automático (decisão 7).
  if (enviado) {
    return (
      <section role="status" className="placa p-7 sm:p-9">
        <h2
          ref={tituloSucesso}
          tabIndex={-1}
          className="cabeca-secao cabeca-placa text-primary"
        >
          <span>Cadastro recebido</span>
        </h2>
        <p className="corpo mt-5">
          Obrigada por se candidatar. Recebemos as suas informações e a nossa equipe vai
          analisá-las.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} className="relative space-y-7">
      {/* Honeypot: invisível e fora do alcance de leitor de tela e de Tab. Robô
          preenche tudo o que encontra; pessoa nunca vê este campo. */}
      <input
        name="confirmacao"
        tabIndex={-1}
        aria-hidden
        autoComplete="off"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="absolute left-[-9999px]"
      />

      <fieldset className="artigo space-y-5">
        <legend>Boas-vindas e Identificação</legend>
        <Campo
          campo="contactName"
          rotulo="Como podemos te chamar?"
          valor={campos.contactName}
          onChange={definir}
          autoComplete="name"
        />
        <Campo
          campo="email"
          rotulo="Qual é o seu melhor e-mail para contato?"
          valor={campos.email}
          onChange={definir}
          type="email"
          autoComplete="email"
        />
        <Campo
          campo="phone"
          rotulo="Qual é o seu WhatsApp ou telefone para conversarmos?"
          valor={campos.phone}
          onChange={definir}
          type="tel"
          autoComplete="tel"
        />
        <Bloco campo="story" rotulo="Conte-nos um pouco sobre você e sua trajetória:">
          <textarea
            id="story"
            name="story"
            required
            rows={4}
            value={campos.story}
            onChange={(e) => definir("story", e.target.value)}
            className="campo-regua"
          />
        </Bloco>
      </fieldset>

      <fieldset className="artigo space-y-5">
        <legend>Sobre o Seu Negócio</legend>
        <Bloco campo="state" rotulo="Qual é o seu estado?">
          <select
            id="state"
            name="state"
            required
            autoComplete="address-level1"
            value={campos.state}
            onChange={(e) => definir("state", e.target.value)}
            className="campo-regua"
          >
            <option value="">Selecione</option>
            {UF_LIST.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </Bloco>
        <Campo
          campo="city"
          rotulo="Em qual cidade sua loja está localizada?"
          valor={campos.city}
          onChange={definir}
          autoComplete="address-level2"
        />

        <GrupoRadio
          nome="serviceModel"
          legenda="Como você atende suas clientes hoje?"
          opcoes={OPCOES_ATENDIMENTO}
          valor={campos.serviceModel}
          onChange={trocarAtendimento}
        />
        {/* "Outro" revela o texto e o torna obrigatório (decisão 22). */}
        {campos.serviceModel === "OUTRO" && (
          <Campo
            campo="serviceModelOther"
            rotulo="Descreva como você atende suas clientes hoje:"
            valor={campos.serviceModelOther}
            onChange={definir}
          />
        )}

        <Campo
          campo="instagram"
          rotulo="Qual é o Instagram da sua loja? (@)"
          valor={campos.instagram}
          onChange={definir}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <CampoImagem
          campo="instagramImage"
          rotulo="Envie uma imagem ou print do perfil do seu Instagram:"
          erro={erroInstagram}
          onEscolher={(input) => escolherImagem(input, "instagram")}
        />
        <CampoImagem
          campo="storeImage"
          rotulo={rotuloLoja}
          erro={erroLoja}
          onEscolher={(input) => escolherImagem(input, "loja")}
          inputRef={inputLoja}
        />

        <Campo
          campo="marketTime"
          rotulo="Há quanto tempo sua loja atua no mercado?"
          valor={campos.marketTime}
          onChange={definir}
        />
        <Campo
          campo="teamSize"
          rotulo="Quantas pessoas fazem parte da sua equipe atualmente?"
          valor={campos.teamSize}
          onChange={definir}
        />
      </fieldset>

      <fieldset className="artigo space-y-5">
        <legend>Conectividade e Parceria Comercial</legend>
        <Campo
          campo="brandsCarried"
          rotulo="Quais marcas já fazem parte do seu espaço?"
          valor={campos.brandsCarried}
          onChange={definir}
        />

        <GrupoRadio
          nome="foundUs"
          legenda="Como você nos encontrou?"
          opcoes={OPCOES_ORIGEM}
          valor={campos.foundUs}
          onChange={(v) => definir("foundUs", v)}
        />
        {campos.foundUs === "OUTRO" && (
          <Campo
            campo="foundUsOther"
            rotulo="Conte como você nos encontrou:"
            valor={campos.foundUsOther}
            onChange={definir}
          />
        )}

        <Campo
          campo="followTime"
          rotulo="Há quanto tempo você acompanha a nossa marca?"
          valor={campos.followTime}
          onChange={definir}
        />

        <GrupoRadio
          nome="investmentBand"
          legenda="Qual valor você planeja investir na sua próxima coleção conosco?"
          opcoes={OPCOES_INVESTIMENTO}
          valor={campos.investmentBand}
          onChange={(v) => definir("investmentBand", v)}
        />
        <GrupoRadio
          nome="wantsVisit"
          legenda="Gostaria de receber a visita de uma de nossas representantes em sua loja?"
          opcoes={OPCOES_VISITA}
          valor={campos.wantsVisit}
          onChange={(v) => definir("wantsVisit", v)}
        />
      </fieldset>

      <fieldset className="artigo space-y-5">
        <legend>Validação Cadastro</legend>
        <Campo
          campo="cnpj"
          rotulo="Para finalizarmos, informe o CNPJ da sua empresa (utilizado para confirmação do segmento):"
          valor={campos.cnpj}
          onChange={definir}
          inputMode="numeric"
          autoComplete="off"
        />
      </fieldset>

      {erro && (
        <p
          role="alert"
          className="border-2 border-destructive bg-card p-4 text-[0.9375rem] font-medium text-destructive"
        >
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando || lendo.instagram || lendo.loja}
        className="botao-placa"
      >
        {enviando
          ? "Enviando…"
          : lendo.instagram || lendo.loja
            ? "Preparando imagem…"
            : "Enviar cadastro"}
      </button>
    </form>
  );
}

/**
 * Rótulo visível mais o controle que ele nomeia.
 *
 * `campo` serve de `htmlFor` E de `id`/`name` do controle, numa variável só:
 * era aqui que a repetição de doze blocos podia soltar o rótulo do campo sem
 * que nada reclamasse. Usado direto quando o controle não é um <input> de
 * texto (o <textarea> da trajetória e o <select> de UF).
 */
function Bloco({
  campo,
  rotulo,
  children,
}: {
  campo: CampoEsperado | "instagramImage" | "storeImage";
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={campo} className="rotulo-campo">
        {rotulo}
      </label>
      {children}
    </div>
  );
}

/**
 * Par rótulo + <input> de texto — doze dos dezoito campos.
 *
 * `campo` é tipado pela união que o validador exporta: nome que o servidor não
 * espera não compila. `required` vem DEPOIS de `{...resto}` de propósito: todos
 * os campos são obrigatórios (decisão 20) e nenhuma chamada consegue desligar
 * isso por descuido.
 */
function Campo({
  campo,
  rotulo,
  valor,
  onChange,
  ...resto
}: {
  campo: CampoEsperado;
  rotulo: string;
  valor: string;
  onChange: (campo: CampoEsperado, valor: string) => void;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "id" | "name" | "value" | "onChange" | "className"
>) {
  return (
    <Bloco campo={campo} rotulo={rotulo}>
      <input
        {...resto}
        id={campo}
        name={campo}
        required
        value={valor}
        onChange={(e) => onChange(campo, e.target.value)}
        className="campo-regua"
      />
    </Bloco>
  );
}

/**
 * Campo de imagem, dono do id da sua própria mensagem de erro.
 *
 * O `aria-describedby` e o `id` do parágrafo de erro saem da MESMA variável:
 * nos dois blocos quase idênticos de antes, errar um dos dois ids deixava a
 * mensagem invisível para leitor de tela sem quebrar nada visível.
 *
 * `inputRef` é opcional porque só o segundo upload precisa de ref — a foto é
 * descartada quando a pergunta 7 muda (decisão 21) e o input nativo tem de ser
 * esvaziado junto. Fora disso os dois campos são iguais.
 */
function CampoImagem({
  campo,
  rotulo,
  erro,
  onEscolher,
  inputRef,
}: {
  campo: "instagramImage" | "storeImage";
  rotulo: string;
  erro: string | null;
  onEscolher: (input: HTMLInputElement) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const idErro = `erro-${campo}`;
  return (
    <Bloco campo={campo} rotulo={rotulo}>
      <input
        id={campo}
        name={campo}
        ref={inputRef}
        type="file"
        required
        accept="image/*,.heic,.heif"
        onChange={(e) => onEscolher(e.currentTarget)}
        aria-describedby={erro ? idErro : undefined}
        aria-invalid={erro ? true : undefined}
        className="campo-regua"
      />
      {erro && (
        <p id={idErro} role="alert" className="mt-2.5 text-sm font-medium text-destructive">
          {erro}
        </p>
      )}
    </Bloco>
  );
}

/**
 * Pergunta de alternativa como radios dentro de <fieldset>: no celular o radio
 * mostra as opções sem abrir painel, e o `<legend>` dá o nome do grupo ao leitor
 * de tela.
 *
 * As opções chegam prontas das tuplas que o validador exporta (SERVICE_MODELS,
 * FOUND_US, INVESTMENT_BANDS); este componente não conhece valor nenhum.
 * Cada opção é uma linha de largura inteira separada por filete, com a <label>
 * cobrindo a linha toda: alvo de toque grande sem nada desenhado a mais.
 */
function GrupoRadio({
  nome,
  legenda,
  opcoes,
  valor,
  onChange,
}: {
  nome: string;
  legenda: string;
  opcoes: readonly { valor: string; rotulo: string }[];
  valor: string;
  onChange: (valor: string) => void;
}) {
  return (
    <fieldset className="grupo-opcoes">
      <legend>{legenda}</legend>
      <div className="mt-2">
        {opcoes.map((o) => (
          <label key={o.valor} className="linha-opcao">
            <input
              type="radio"
              name={nome}
              value={o.valor}
              required
              checked={valor === o.valor}
              onChange={() => onChange(o.valor)}
            />
            <span className="text-[0.9375rem]">{o.rotulo}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
