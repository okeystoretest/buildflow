"use client";

import { useEffect, useRef, useState } from "react";
import { submitWholesaleApplication } from "@/lib/actions/wholesale-apply";
import { shrinkImageToBase64 } from "@/lib/client-image";
import {
  EMAIL_RE,
  FOUND_US,
  GRAMATICA_INSTAGRAM,
  INVESTMENT_BANDS,
  SERVICE_MODELS,
  UF_LIST,
  normalizarInstagram,
  type CampoEsperado,
} from "@/lib/wholesale-apply-validation";
import { isValidPhone, normalizePhone } from "@/lib/phone";

/**
 * Formulário público de candidatura (18 campos, todos obrigatórios: decisão 20).
 *
 * EM QUATRO ETAPAS, uma por seção da planilha. O motivo é de conversão, não de
 * estética: dezoito campos obrigatórios numa rolagem só anunciam o tamanho do
 * compromisso antes de a lojista ter investido nada, e cada etapa é conferida
 * NO NAVEGADOR antes de avançar — assim ela nunca chega ao fim para descobrir
 * um erro do começo, num fluxo onde não existe canal de resposta (decisão 7).
 *
 * Só a etapa corrente é renderizada. Isso é deliberado: com as outras escondidas
 * por CSS, a validação nativa do navegador tentaria focar um campo invisível no
 * envio e falharia com "not focusable". As respostas já digitadas vivem em
 * `campos` (estado), então nada se perde ao ir e voltar.
 *
 * Os textos de ERRO de campo vêm da Server Action e são exibidos como chegam:
 * uma segunda lista de mensagens aqui divergiria da do servidor. As únicas
 * mensagens daqui são as de falhas que acontecem no navegador (imagem ilegível,
 * foto pesada, rede).
 */

// Mesmo teto por imagem da action (MAX_FOTO_MB). Conferido aqui para que a
// lojista saiba QUAL foto reduzir: duas fotos acima disso estouram o corpo de
// 12mb do Next ANTES da action rodar, e a falha chegaria como erro opaco de rede
// no fim de 18 campos.
const MAX_FOTO_BYTES = 4 * 1024 * 1024;

// Títulos das quatro seções, literais da planilha.
const ETAPAS = [
  "Boas-vindas e Identificação",
  "Sobre o Seu Negócio",
  "Conectividade e Parceria Comercial",
  "Validação Cadastro",
] as const;
const TOTAL_ETAPAS = ETAPAS.length;

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
  const [etapa, setEtapa] = useState(1);
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
  //
  // `performance.now()` e não `Date.now()`, e o que viaja é o TEMPO DECORRIDO e
  // não um instante. Antes o cliente mandava `Date.now()` e o servidor fazia
  // `Date.now() - openedAt` com o SEU relógio: um celular adiantado — comum, e
  // nada que a lojista saiba diagnosticar — produzia diferença negativa, que é
  // sempre menor que 5s, e ela **nunca conseguia enviar**, recebendo a recusa
  // genérica depois de preencher 18 campos. Medindo de um lado só, não existe
  // comparação entre relógios para errar. `performance.now()` é monotônico, então
  // também não sofre ajuste de fuso ou de NTP no meio do preenchimento.
  const abertoEm = useRef(
    typeof performance !== "undefined" ? performance.now() : Date.now(),
  );

  // Guarda de envio por ref: `enviando` (estado) só muda na próxima renderização,
  // e dois toques antes dela passariam ambos. O custo seria cadastro duplicado
  // na fila da analista, idêntico ao sinal de tentativa repetida.
  const enviandoRef = useRef(false);

  // Número da seleção mais recente de cada upload: resultado de uma seleção que
  // já foi substituída (ou apagada) é descartado ao chegar.
  const selecao = useRef({ instagram: 0, loja: 0 });
  const inputLoja = useRef<HTMLInputElement>(null);
  const tituloSucesso = useRef<HTMLHeadingElement>(null);
  const painelEtapa = useRef<HTMLFieldSetElement>(null);
  const tituloEtapa = useRef<HTMLParagraphElement>(null);
  // O efeito de foco abaixo roda TAMBÉM na montagem, e `etapa` nasce 1. Como o
  // alvo do foco fica na última seção antes do rodapé, `focus()` rolava a página
  // até lá: toda visitante que abrisse o link do WhatsApp caía direto nos 18
  // campos, sem ver o herói, as métricas, os motivos nem o FAQ — exatamente a
  // argumentação que o cadastro em etapas existe para que ela leia primeiro.
  const montou = useRef(false);

  useEffect(() => {
    if (!enviado) return;
    // Foco no título: o formulário inteiro sumiu, e leitor de tela precisa ser
    // levado à confirmação (role="status" sozinho nem sempre anuncia conteúdo
    // que já nasce montado). O próprio focus() traz o título para a tela, e o
    // scroll-margin-top de atacado.css lhe dá folga.
    tituloSucesso.current?.focus();
  }, [enviado]);

  function definir(campo: CampoEsperado, valor: string) {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
  }

  /**
   * As regras do SERVIDOR que a validação nativa não expressa, por campo.
   *
   * Mesmas funções puras que a action usa — importadas, não reescritas: duas
   * cópias da regra de telefone divergiriam, e aí a etapa aprovaria o que o
   * servidor recusa, que é o problema que isto existe para resolver.
   * `ok` só é consultado com valor não vazio; o vazio é trabalho do `required`.
   */
  const REGRAS_DA_ETAPA: Record<string, { ok: (v: string) => boolean; msg: string }> = {
    email: {
      ok: (v) => EMAIL_RE.test(v.trim()),
      msg: "E-mail inválido. Confira o endereço.",
    },
    phone: {
      ok: (v) => isValidPhone(normalizePhone(v)),
      msg: "WhatsApp inválido. Informe o número com DDD.",
    },
    instagram: {
      ok: (v) => GRAMATICA_INSTAGRAM.test(normalizarInstagram(v)),
      msg: "Instagram inválido. Informe só o @ da loja, sem link.",
    },
  };

  /**
   * Confere SÓ a etapa visível, usando a validação nativa do navegador.
   *
   * Pergunta a cada controle do painel se ele está válido e aponta o primeiro
   * que não está, com a mensagem e o balão do próprio navegador — que já vêm
   * traduzidos e já sabem rolar até o campo. Não há regra duplicada aqui: o
   * `required` está na marcação, e o veredito final continua sendo do servidor.
   */
  function etapaValida(): boolean {
    const painel = painelEtapa.current;
    if (!painel) return true;
    const controles = painel.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea");
    for (const controle of controles) {
      // As três regras que o `required`/`type=` NÃO cobrem, aplicadas na etapa
      // DONA do campo. Sem isto, elas só eram ditas pelo servidor: a lojista
      // chegava à etapa 4, olhando o CNPJ, e lia "WhatsApp inválido. Informe o
      // número com DDD." — sem saber a qual etapa voltar, num funil onde não
      // existe canal de resposta. `type="tel"` não valida nada e o
      // `type="email"` nativo aceita "ana@loja".
      //
      // Via `setCustomValidity`, e não um erro próprio: reusa o balão do
      // navegador, que já vem traduzido, já rola até o campo e já é o que as
      // outras recusas desta etapa usam. A mesma mensagem do servidor, para a
      // lojista não ler duas redações do mesmo problema.
      const regra = REGRAS_DA_ETAPA[controle.name];
      if (regra) {
        controle.setCustomValidity(
          controle.value.trim() === "" || regra.ok(controle.value) ? "" : regra.msg,
        );
      }
      if (!controle.checkValidity()) {
        controle.reportValidity();
        return false;
      }
    }
    return true;
  }

  function avancar() {
    if (!etapaValida()) return;
    setErro(null);
    setEtapa((e) => Math.min(TOTAL_ETAPAS, e + 1));
  }

  function voltar() {
    setErro(null);
    setEtapa((e) => Math.max(1, e - 1));
  }

  // Trocar de etapa leva o foco ao título dela: sem isso, quem usa teclado ou
  // leitor de tela continua com o foco num botão que acabou de mudar de função,
  // e nada anuncia que a etapa mudou.
  useEffect(() => {
    // Na primeira passada não há troca de etapa a anunciar: só a página abrindo.
    // Não usar `preventScroll` aqui — na troca de etapa o scroll é desejado.
    if (!montou.current) {
      montou.current = true;
      return;
    }
    if (enviado) return;
    tituloEtapa.current?.focus();
  }, [etapa, enviado]);

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
    if (!file) {
      // CANCELAR o seletor não pode apagar a foto já aceita. Vários navegadores
      // (e a WebView do Android em particular) disparam `change` com lista vazia
      // quando a pessoa fecha o seletor sem escolher nada: limpar o estado antes
      // desta checagem fazia a linha "Imagem pronta" desaparecer e o campo voltar
      // a `required`, sem mensagem nenhuma, depois de ela já ter enviado a foto
      // certa. O estado só é descartado quando há arquivo novo para substituí-lo.
      setLendo((l) => ({ ...l, [qual]: false }));
      return;
    }
    guardar(null);
    avisar(null);
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
    // Enter num campo de texto envia o formulário. Antes da última etapa isso
    // significa "avançar", não "enviar pela metade".
    if (etapa < TOTAL_ETAPAS) {
      avancar();
      return;
    }
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
        msPreenchendo: Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) -
            abertoEm.current,
        ),
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
      <div className="placa-form" role="status">
        <h3 ref={tituloSucesso} tabIndex={-1} className="titulo-bloco">
          Cadastro recebido
        </h3>
        <p className="corpo mt-4 text-[hsl(var(--muted-foreground))]">
          Obrigada por se candidatar. Recebemos as suas informações e a nossa equipe vai
          analisá-las.
        </p>
      </div>
    );
  }

  const preparandoImagem = lendo.instagram || lendo.loja;
  // `etapa - 1`: progresso é o que ela CONCLUIU, não a etapa em que está. Com
  // `etapa / TOTAL` a barra anunciava "25% concluído" antes de ela escrever uma
  // letra, e nunca chegava a 100% — na última etapa marcava 100% com o
  // formulário ainda por enviar. A fração agora vai de 0 a 1 de verdade, e
  // "Etapa 1 de 4" ao lado continua dizendo onde ela está.
  const pct = Math.round(((etapa - 1) / TOTAL_ETAPAS) * 100);

  return (
    <div className="placa-form">
      <div className="mb-9">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p ref={tituloEtapa} tabIndex={-1} id="etapa-titulo" className="rotulo-campo">
            Etapa {etapa} de {TOTAL_ETAPAS} · {ETAPAS[etapa - 1]}
          </p>
          <p className="rotulo-micro">{pct}% concluído</p>
        </div>
        <div className="trilha mt-3" data-completo={etapa === TOTAL_ETAPAS}>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      <form onSubmit={enviar} className="relative">
        {/* Honeypot: invisível e fora do alcance de leitor de tela e de Tab. Robô
            preenche tudo o que encontra; pessoa nunca vê este campo. Fica fora
            do painel da etapa de propósito, para sobreviver à troca de etapa. */}
        <input
          name="confirmacao"
          tabIndex={-1}
          aria-hidden
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          className="isca"
        />

        <fieldset ref={painelEtapa} className="etapa space-y-6" aria-labelledby="etapa-titulo">
          {etapa === 1 && (
            <>
              <Campo
                campo="contactName"
                rotulo="Como podemos te chamar?"
                valor={campos.contactName}
                onChange={definir}
                autoComplete="name"
                maxLength={120}
              />
              <Campo
                campo="email"
                rotulo="Qual é o seu melhor e-mail para contato?"
                valor={campos.email}
                onChange={definir}
                type="email"
                autoComplete="email"
                maxLength={160}
              />
              <Campo
                campo="phone"
                rotulo="Qual é o seu WhatsApp ou telefone para conversarmos?"
                valor={campos.phone}
                onChange={definir}
                type="tel"
                autoComplete="tel"
                maxLength={20}
              />
              <Bloco campo="story" rotulo="Conte-nos um pouco sobre você e sua trajetória:">
                {(nome) => (
                  <textarea
                    id={nome}
                    name={nome}
                    required
                    rows={4}
                    maxLength={2000}
                    value={campos.story}
                    onChange={(e) => definir(nome, e.target.value)}
                    className="campo-regua"
                  />
                )}
              </Bloco>
            </>
          )}

          {etapa === 2 && (
            <>
              <div className="grid gap-6 sm:grid-cols-2">
                <Bloco campo="state" rotulo="Qual é o seu estado?">
                  {(nome) => (
                    <select
                      id={nome}
                      name={nome}
                      required
                      autoComplete="address-level1"
                      value={campos.state}
                      onChange={(e) => definir(nome, e.target.value)}
                      className="campo-regua"
                    >
                      <option value="">Selecione</option>
                      {UF_LIST.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  )}
                </Bloco>
                <Campo
                  campo="city"
                  rotulo="Em qual cidade sua loja está localizada?"
                  valor={campos.city}
                  onChange={definir}
                  autoComplete="address-level2"
                  maxLength={120}
                />
              </div>

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
                  maxLength={200}
                />
              )}

              <Campo
                campo="instagram"
                rotulo="Qual é o Instagram da sua loja? (@)"
                valor={campos.instagram}
                onChange={definir}
                autoCapitalize="none"
                autoCorrect="off"
                maxLength={60}
              />

              <div className="grid gap-6 sm:grid-cols-2">
                <CampoImagem
                  campo="instagramImage"
                  rotulo="Envie uma imagem ou print do perfil do seu Instagram:"
                  erro={erroInstagram}
                  jaTem={instagramImage !== null}
                  lendo={lendo.instagram}
                  onEscolher={(input) => escolherImagem(input, "instagram")}
                />
                <CampoImagem
                  campo="storeImage"
                  rotulo={rotuloLoja}
                  erro={erroLoja}
                  jaTem={storeImage !== null}
                  lendo={lendo.loja}
                  onEscolher={(input) => escolherImagem(input, "loja")}
                  inputRef={inputLoja}
                />
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <Campo
                  campo="marketTime"
                  rotulo="Há quanto tempo sua loja atua no mercado?"
                  valor={campos.marketTime}
                  onChange={definir}
                  maxLength={200}
                />
                <Campo
                  campo="teamSize"
                  rotulo="Quantas pessoas fazem parte da sua equipe atualmente?"
                  valor={campos.teamSize}
                  onChange={definir}
                  maxLength={200}
                />
              </div>
            </>
          )}

          {etapa === 3 && (
            <>
              <Campo
                campo="brandsCarried"
                rotulo="Quais marcas já fazem parte do seu espaço?"
                valor={campos.brandsCarried}
                onChange={definir}
                maxLength={200}
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
                  maxLength={200}
                />
              )}

              <Campo
                campo="followTime"
                rotulo="Há quanto tempo você acompanha a nossa marca?"
                valor={campos.followTime}
                onChange={definir}
                maxLength={200}
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
            </>
          )}

          {etapa === 4 && (
            <>
              {/* Na planilha a explicação vem entre parênteses, dentro da própria
                  pergunta. Na tela ela é parágrafo à parte por ritmo visual — mas
                  sem `aria-describedby` quem usa leitor de tela ouvia só a pergunta.
                  O texto não pode entrar no `rotulo`: o rótulo é o nome do campo nas
                  recusas do servidor (`Preencha o campo "…"`). */}
              <Campo
                campo="cnpj"
                rotulo="Para finalizarmos, informe o CNPJ da sua empresa:"
                valor={campos.cnpj}
                onChange={definir}
                inputMode="numeric"
                autoComplete="off"
                maxLength={18}
                aria-describedby="ajuda-cnpj"
              />
              <p id="ajuda-cnpj" className="corpo-pequeno text-[hsl(var(--muted-foreground))]">
                O CNPJ é usado para confirmar o segmento da sua loja.
              </p>
            </>
          )}
        </fieldset>

        {erro && (
          <p role="alert" className="aviso-erro mt-7 border border-[hsl(var(--destructive))] p-4">
            {erro}
          </p>
        )}

        <div className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-7">
          {etapa > 1 ? (
            <button type="button" onClick={voltar} className="acao-vazia">
              Voltar
            </button>
          ) : (
            <span aria-hidden="true" />
          )}

          {etapa < TOTAL_ETAPAS ? (
            <button
              type="button"
              onClick={avancar}
              disabled={preparandoImagem}
              className="acao"
            >
              {preparandoImagem ? "Preparando imagem…" : "Próxima etapa"}
            </button>
          ) : (
            <button type="submit" disabled={enviando || preparandoImagem} className="acao">
              {enviando
                ? "Enviando…"
                : preparandoImagem
                  ? "Preparando imagem…"
                  : "Enviar cadastro"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Todo nome de campo do formulário: os 18 do validador mais os dois uploads. */
type NomeDeCampo = CampoEsperado | "instagramImage" | "storeImage";

/**
 * Rótulo visível mais o controle que ele nomeia.
 *
 * `campo` serve de `htmlFor` E de `id`/`name` do controle, numa variável só:
 * era aqui que a repetição de doze blocos podia soltar o rótulo do campo sem
 * que nada reclamasse. Usado direto quando o controle não é um <input> de
 * texto (o <textarea> da trajetória e o <select> de UF).
 *
 * `children` é FUNÇÃO e não nó: recebendo nó pronto, os dois pontos de uso
 * escreveriam `id="story" name="story"` por conta própria, independentes do
 * `campo` que virou o `htmlFor` — exatamente o defeito que este componente
 * existe para tornar impossível. Como função, o nome chega de um lugar só.
 * Genérico em T para que o ponto de uso receba o literal ("story") e não a
 * união inteira, e possa passá-lo a `definir`, que exige `CampoEsperado`.
 */
function Bloco<T extends NomeDeCampo>({
  campo,
  rotulo,
  children,
}: {
  campo: T;
  rotulo: string;
  children: (campo: T) => React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={campo} className="rotulo-campo mb-2 block">
        {rotulo}
      </label>
      {children(campo)}
    </div>
  );
}

/**
 * Par rótulo + <input> de texto — doze dos dezoito campos.
 *
 * `campo` é tipado pela união que o validador exporta: nome que o servidor não
 * espera não compila. `required` é obrigatoriedade de verdade por duas vias:
 * está FORA do que `resto` aceita (`Omit` inclui "required", então
 * `required={false}` não compila) e é escrito DEPOIS de `{...resto}` (então
 * nem por `as any` dá para desligar). Todos os 18 campos são obrigatórios
 * (decisão 20).
 *
 * `maxLength` vem de fora porque o teto é por campo e é o MESMO do servidor:
 * sem ele, ela escreve 300 caracteres onde cabem 200 e descobre no envio, com
 * uma mensagem que nomeia o campo pelo nome interno dele.
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
  "id" | "name" | "value" | "onChange" | "className" | "required"
>) {
  return (
    <Bloco campo={campo} rotulo={rotulo}>
      {(nome) => (
        <input
          {...resto}
          id={nome}
          name={nome}
          required
          value={valor}
          onChange={(e) => onChange(nome, e.target.value)}
          className="campo-regua"
        />
      )}
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
 * `required` é condicionado a `jaTem` — e isto é consequência direta das quatro
 * etapas. Ao voltar para a etapa 2, o <input type="file"> é remontado VAZIO,
 * porque seleção de arquivo vive no DOM e não em estado do React; a imagem em
 * si continua guardada (já encolhida) no estado do formulário. Mantê-lo
 * `required` aqui travaria a etapa pedindo de novo um arquivo que já temos. O
 * par continua obrigatório: `enviar` recusa sem as duas imagens.
 *
 * `inputRef` é opcional porque só o segundo upload precisa de ref — a foto é
 * descartada quando a pergunta 7 muda (decisão 21) e o input nativo tem de ser
 * esvaziado junto.
 */
function CampoImagem({
  campo,
  rotulo,
  erro,
  jaTem,
  lendo,
  onEscolher,
  inputRef,
}: {
  campo: "instagramImage" | "storeImage";
  rotulo: string;
  erro: string | null;
  jaTem: boolean;
  lendo: boolean;
  onEscolher: (input: HTMLInputElement) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const idErro = `erro-${campo}`;
  return (
    <Bloco campo={campo} rotulo={rotulo}>
      {(nome) => (
        <div className="area-anexo">
          <input
            id={nome}
            name={nome}
            ref={inputRef}
            type="file"
            required={!jaTem}
            accept="image/*,.heic,.heif"
            onChange={(e) => onEscolher(e.currentTarget)}
            aria-describedby={erro ? idErro : undefined}
            aria-invalid={erro ? true : undefined}
          />
          {lendo && (
            <p className="corpo-pequeno mt-2 text-[hsl(var(--muted-foreground))]">
              Preparando a imagem…
            </p>
          )}
          {!lendo && jaTem && !erro && (
            <p className="corpo-pequeno mt-2 text-[hsl(var(--muted-foreground))]">
              Imagem pronta. Escolha outro arquivo se quiser trocar.
            </p>
          )}
          {erro && (
            <p id={idErro} role="alert" className="aviso-erro mt-2 text-left">
              {erro}
            </p>
          )}
        </div>
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
 * FOUND_US, INVESTMENT_BANDS); este componente não conhece valor nenhum. Cada
 * opção é uma placa clicável de alvo generoso, com a borda inteira respondendo
 * ao toque — não só o círculo do radio.
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
      <legend className="rotulo-campo mb-2">{legenda}</legend>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {opcoes.map((o) => (
          <label key={o.valor} className="opcao">
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
