"use client";

import { useRef, useState } from "react";
import { submitWholesaleApplication } from "@/lib/actions/wholesale-apply";
import { shrinkImageToBase64 } from "@/lib/client-image";
import { UF_LIST, type CampoEsperado } from "@/lib/wholesale-apply-validation";

/**
 * Formulário público de candidatura (18 campos, todos obrigatórios: decisão 20).
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

const OPCOES_ATENDIMENTO = [
  { valor: "LOJA_FISICA", rotulo: "Loja física" },
  { valor: "LOJA_ONLINE", rotulo: "Loja online" },
  { valor: "FISICA_E_ONLINE", rotulo: "Loja física e online" },
  { valor: "OUTRO", rotulo: "Outro" },
] as const;

const OPCOES_ORIGEM = [
  { valor: "INSTAGRAM", rotulo: "Instagram" },
  { valor: "SITE", rotulo: "Site" },
  { valor: "INDICACAO", rotulo: "Indicação" },
  { valor: "OUTRO", rotulo: "Outro" },
] as const;

const OPCOES_INVESTIMENTO = [
  { valor: "ATE_3K", rotulo: "Até R$ 3 mil" },
  { valor: "DE_3_A_5K", rotulo: "De R$ 3 a R$ 5 mil" },
  { valor: "DE_5_A_10K", rotulo: "De R$ 5 a R$ 10 mil" },
  { valor: "ACIMA_10K", rotulo: "Acima de R$ 10 mil" },
] as const;

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

const CLASSE_CAMPO =
  "w-full rounded-md border bg-card px-3 py-2 text-base text-card-foreground";
const CLASSE_FIELDSET = "space-y-4 rounded-md border p-4";
const CLASSE_LEGEND = "px-1 text-lg font-semibold";

/** Tamanho aproximado, em bytes, do binário dentro de um data-URL base64. */
function bytesDoDataUrl(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

type ImagemEstado = { base64: string; nome: string } | null;

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

  // Fixado na montagem: o servidor recusa envio com menos de 5s de página
  // aberta (contenção contra robô). Uma pessoa real leva minutos.
  const openedAt = useRef(Date.now());

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

  async function escolherImagem(input: HTMLInputElement, qual: "instagram" | "loja") {
    const guardar = qual === "instagram" ? setInstagramImage : setStoreImage;
    const avisar = qual === "instagram" ? setErroInstagram : setErroLoja;
    const file = input.files?.[0];
    guardar(null);
    avisar(null);
    if (!file) return;

    // Review Focus 5: HEIC de iPhone.
    // client-image.ts aceita image/heic, mas nem todo navegador decodifica HEIC em
    // canvas — e aí a compressão falha. Com TUDO obrigatório (decisão 20), isso
    // trancaria a lojista no fim do formulário sem saída. Então a falha é tratada
    // e dita em voz alta, com o caminho de contorno.
    const r = await shrinkImageToBase64(file, { maxDimension: 1600 });
    if (r.error !== undefined) {
      avisar(
        "Não conseguimos ler esta imagem. Se ela veio do iPhone, abra a foto, " +
          "toque em Editar, salve e envie novamente — ou tire um print dela.",
      );
      // Limpa o input: o `required` nativo volta a apontar o campo, em vez de
      // deixar um arquivo "escolhido" que não foi aceito.
      input.value = "";
      return;
    }
    // HEIC não passa pelo canvas (client-image devolve o original), então pode
    // continuar pesado mesmo depois de "encolhido". Dito na hora, por foto.
    if (bytesDoDataUrl(r.base64) > MAX_FOTO_BYTES) {
      avisar(
        "Esta foto está pesada demais (máximo de 4MB). Escolha uma foto mais " +
          "leve ou tire um print dela.",
      );
      input.value = "";
      return;
    }
    guardar({ base64: r.base64, nome: file.name });
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);

    if (!instagramImage || !storeImage) {
      setErro("Envie as duas imagens pedidas antes de enviar o cadastro.");
      return;
    }
    // Conferência do PAR, depois de encolher e antes de enviar: é aqui, e não
    // dentro do Next, que a recusa pode dizer qual foto reduzir.
    const pesada =
      bytesDoDataUrl(instagramImage.base64) > MAX_FOTO_BYTES
        ? "do perfil do Instagram"
        : bytesDoDataUrl(storeImage.base64) > MAX_FOTO_BYTES
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

    setEnviando(true);
    try {
      const res = await submitWholesaleApplication({
        brandSlug,
        referralCode,
        campos,
        instagramImage: instagramImage.base64,
        storeImage: storeImage.base64,
        honeypot,
        openedAt: openedAt.current,
      });
      if (res.ok) {
        setEnviado(true);
        window.scrollTo({ top: 0 });
      } else {
        // Mensagem do servidor, como veio.
        setErro(res.error);
      }
    } catch {
      // Falha de transporte (rede caiu, corpo recusado antes da action). Os
      // campos continuam preenchidos: ela só precisa tentar de novo.
      setErro("Não foi possível enviar agora. Confira a conexão e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  // Sem prometer prazo nem canal de resposta: não há canal automático (decisão 7).
  if (enviado) {
    return (
      <section
        role="status"
        className="space-y-2 rounded-md border bg-card p-6 text-card-foreground"
      >
        <h2 className="text-2xl font-semibold">Cadastro recebido</h2>
        <p>
          Obrigada por se candidatar. Recebemos as suas informações e a nossa equipe vai
          analisá-las.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} className="relative space-y-6">
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

      <fieldset className={CLASSE_FIELDSET}>
        <legend className={CLASSE_LEGEND}>Boas-vindas e Identificação</legend>
        <div>
          <label htmlFor="contactName">Como podemos te chamar?</label>
          <input
            id="contactName"
            name="contactName"
            required
            autoComplete="name"
            value={campos.contactName}
            onChange={(e) => definir("contactName", e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>
        <div>
          <label htmlFor="email">Qual é o seu melhor e-mail para contato?</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={campos.email}
            onChange={(e) => definir("email", e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>
        <div>
          <label htmlFor="phone">Qual é o seu WhatsApp ou telefone para conversarmos?</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            value={campos.phone}
            onChange={(e) => definir("phone", e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>
        <div>
          <label htmlFor="story">Conte-nos um pouco sobre você e sua trajetória:</label>
          <textarea
            id="story"
            name="story"
            required
            rows={4}
            value={campos.story}
            onChange={(e) => definir("story", e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>
      </fieldset>

      <fieldset className={CLASSE_FIELDSET}>
        <legend className={CLASSE_LEGEND}>Sobre o Seu Negócio</legend>
        <div>
          <label htmlFor="state">Qual é o seu estado?</label>
          <select
            id="state"
            name="state"
            required
            autoComplete="address-level1"
            value={campos.state}
            onChange={(e) => definir("state", e.target.value)}
            className={CLASSE_CAMPO}
          >
            <option value="">Selecione</option>
            {UF_LIST.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="city">Em qual cidade sua loja está localizada?</label>
          <input
            id="city"
            name="city"
            required
            autoComplete="address-level2"
            value={campos.city}
            onChange={(e) => definir("city", e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>

        <GrupoRadio
          nome="serviceModel"
          legenda="Como você atende suas clientes hoje?"
          opcoes={OPCOES_ATENDIMENTO}
          valor={campos.serviceModel}
          onChange={(v) => definir("serviceModel", v)}
        />
        {/* "Outro" revela o texto e o torna obrigatório (decisão 22). */}
        {campos.serviceModel === "OUTRO" && (
          <div>
            <label htmlFor="serviceModelOther">
              Descreva como você atende suas clientes hoje:
            </label>
            <input
              id="serviceModelOther"
              name="serviceModelOther"
              required
              value={campos.serviceModelOther}
              onChange={(e) => definir("serviceModelOther", e.target.value)}
              className={CLASSE_CAMPO}
            />
          </div>
        )}

        <div>
          <label htmlFor="instagram">Qual é o Instagram da sua loja? (@)</label>
          <input
            id="instagram"
            name="instagram"
            required
            autoCapitalize="none"
            autoCorrect="off"
            value={campos.instagram}
            onChange={(e) => definir("instagram", e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>
        <div>
          <label htmlFor="instagramImage">
            Envie uma imagem ou print do perfil do seu Instagram:
          </label>
          <input
            id="instagramImage"
            name="instagramImage"
            type="file"
            required
            accept="image/*,.heic,.heif"
            onChange={(e) => escolherImagem(e.currentTarget, "instagram")}
            aria-describedby={erroInstagram ? "erro-instagramImage" : undefined}
            className={CLASSE_CAMPO}
          />
          {erroInstagram && (
            <p id="erro-instagramImage" role="alert">
              {erroInstagram}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="storeImage">{rotuloLoja}</label>
          <input
            id="storeImage"
            name="storeImage"
            type="file"
            required
            accept="image/*,.heic,.heif"
            onChange={(e) => escolherImagem(e.currentTarget, "loja")}
            aria-describedby={erroLoja ? "erro-storeImage" : undefined}
            className={CLASSE_CAMPO}
          />
          {erroLoja && (
            <p id="erro-storeImage" role="alert">
              {erroLoja}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="marketTime">Há quanto tempo sua loja atua no mercado?</label>
          <input
            id="marketTime"
            name="marketTime"
            required
            value={campos.marketTime}
            onChange={(e) => definir("marketTime", e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>
        <div>
          <label htmlFor="teamSize">Quantas pessoas fazem parte da sua equipe atualmente?</label>
          <input
            id="teamSize"
            name="teamSize"
            required
            value={campos.teamSize}
            onChange={(e) => definir("teamSize", e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>
      </fieldset>

      <fieldset className={CLASSE_FIELDSET}>
        <legend className={CLASSE_LEGEND}>Conectividade e Parceria Comercial</legend>
        <div>
          <label htmlFor="brandsCarried">Quais marcas já fazem parte do seu espaço?</label>
          <input
            id="brandsCarried"
            name="brandsCarried"
            required
            value={campos.brandsCarried}
            onChange={(e) => definir("brandsCarried", e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>

        <GrupoRadio
          nome="foundUs"
          legenda="Como você nos encontrou?"
          opcoes={OPCOES_ORIGEM}
          valor={campos.foundUs}
          onChange={(v) => definir("foundUs", v)}
        />
        {campos.foundUs === "OUTRO" && (
          <div>
            <label htmlFor="foundUsOther">Conte como você nos encontrou:</label>
            <input
              id="foundUsOther"
              name="foundUsOther"
              required
              value={campos.foundUsOther}
              onChange={(e) => definir("foundUsOther", e.target.value)}
              className={CLASSE_CAMPO}
            />
          </div>
        )}

        <div>
          <label htmlFor="followTime">Há quanto tempo você acompanha a nossa marca?</label>
          <input
            id="followTime"
            name="followTime"
            required
            value={campos.followTime}
            onChange={(e) => definir("followTime", e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>

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

      <fieldset className={CLASSE_FIELDSET}>
        <legend className={CLASSE_LEGEND}>Validação Cadastro</legend>
        <div>
          <label htmlFor="cnpj">
            Para finalizarmos, informe o CNPJ da sua empresa (utilizado para confirmação do
            segmento):
          </label>
          <input
            id="cnpj"
            name="cnpj"
            required
            inputMode="numeric"
            autoComplete="off"
            value={campos.cnpj}
            onChange={(e) => definir("cnpj", e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>
      </fieldset>

      {erro && <p role="alert">{erro}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-md bg-primary px-4 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60"
      >
        {enviando ? "Enviando…" : "Enviar cadastro"}
      </button>
    </form>
  );
}

/**
 * Pergunta de alternativa como radios dentro de <fieldset>: no celular o radio
 * mostra as opções sem abrir painel, e o `<legend>` dá o nome do grupo ao leitor
 * de tela.
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
    <fieldset className="space-y-2">
      <legend>{legenda}</legend>
      {opcoes.map((o) => (
        <label key={o.valor} className="flex items-center gap-2">
          <input
            type="radio"
            name={nome}
            value={o.valor}
            required
            checked={valor === o.valor}
            onChange={() => onChange(o.valor)}
          />
          {o.rotulo}
        </label>
      ))}
    </fieldset>
  );
}
