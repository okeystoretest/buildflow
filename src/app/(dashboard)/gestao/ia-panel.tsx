"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { salvarConfigDeIa, testarIa } from "@/lib/actions/ia";
import { INSTRUCAO_PADRAO, MODELO_PADRAO, type ConfigDeIaLida } from "@/lib/ia-settings";

/** Os mesmos tetos do `configSchema`. O contador precisa dizer a verdade. */
const MAX_MODELO = 80;
const MAX_INSTRUCAO = 4_000;

/**
 * INTELIGÊNCIA ARTIFICIAL — a configuração do modelo que escreve os roteiros
 * das atividades do Cronograma.
 *
 * DOIS CAMPOS E UM TESTE, e nada além disso. O modelo decide o custo e a
 * qualidade; a instrução decide o tom. O resto do que o Build.Connect tem
 * nesta tela (instrução por marca, escopos) depende de conceitos que o Flow
 * não tem.
 *
 * A CHAVE NÃO ESTÁ AQUI, e a ausência é deliberada: ela mora no ambiente, e
 * esta tela só INFORMA se existe. Um campo de senha aqui gravaria o segredo
 * no banco, de onde ele sai em backup e em dump sem ninguém notar.
 *
 * O BOTÃO TESTAR existe porque, sem ele, o erro de configuração aparece tarde
 * e na pessoa errada: um modelo digitado errado aqui só dá as caras quando
 * alguém do Marketing clica "Gerar com IA" no meio do trabalho — e quem pode
 * consertar não é quem recebe o erro.
 */
export function IaPanel({ config }: { config: ConfigDeIaLida }) {
  const router = useRouter();
  const [model, setModel] = useState(config.model);
  const [instruction, setInstruction] = useState(config.instruction);
  const [ocupado, setOcupado] = useState<"salvando" | "testando" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  const mudou = model !== config.model || instruction !== config.instruction;

  async function salvar() {
    if (ocupado) return;
    setOcupado("salvando");
    setErro(null);
    setRecado(null);
    const r = await salvarConfigDeIa({ model, instruction });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setRecado("Configuração salva. A próxima geração já usa ela.");
    router.refresh();
  }

  async function testar() {
    if (ocupado) return;
    setOcupado("testando");
    setErro(null);
    setRecado(null);
    const r = await testarIa({ model, instruction });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setRecado(`Funcionou. O modelo respondeu: "${r.data.amostra}"`);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-marketing-text" aria-hidden />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Geração de roteiros</h3>
            <p className="text-sm text-muted-foreground">
              O modelo e a instrução usados pelo botão &ldquo;Gerar com IA&rdquo; das atividades
              do Cronograma de Conteúdo.
            </p>
          </div>
        </div>
      </div>

      {/* A CHAVE: estado, nunca valor. A tarja some quando está tudo certo —
          um aviso permanente de que está tudo bem vira ruído que ninguém lê. */}
      {!config.temChave && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">A chave da IA não está configurada.</p>
            <p className="text-sm text-muted-foreground">
              Ela fica na variável de ambiente <code>GEMINI_API_KEY</code> do servidor, e não
              nesta tela: segredo no banco vaza em backup. Sem ela, o botão de gerar recusa e
              explica o motivo.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="ia-modelo">Modelo</Label>
            {model !== MODELO_PADRAO && (
              <button
                type="button"
                onClick={() => setModel(MODELO_PADRAO)}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                voltar ao padrão
              </button>
            )}
          </div>
          <Input
            id="ia-modelo"
            value={model}
            maxLength={MAX_MODELO}
            placeholder={MODELO_PADRAO}
            onChange={(e) => setModel(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            O nome exato no provedor, como <code>{MODELO_PADRAO}</code>. É o mesmo provedor do
            Build.Connect.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="ia-instrucao">Instrução</Label>
            <span className="text-xs text-muted-foreground">
              {instruction.length}/{MAX_INSTRUCAO.toLocaleString("pt-BR")}
            </span>
          </div>
          <Textarea
            id="ia-instrucao"
            rows={5}
            value={instruction}
            maxLength={MAX_INSTRUCAO}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            O comportamento do roteirista: tom, idioma e formato. Os dados da atividade (título,
            data, funil, formatos) vão à parte, a cada geração.
          </p>
          {instruction !== INSTRUCAO_PADRAO && (
            <button
              type="button"
              onClick={() => setInstruction(INSTRUCAO_PADRAO)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              voltar à instrução padrão
            </button>
          )}
        </div>

        {erro && <p className="text-xs text-destructive">{erro}</p>}
        {recado && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
            {recado}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {config.updatedAt
              ? `Alterado por ${config.updatedPor ?? "alguém"} em ${new Date(
                  config.updatedAt,
                ).toLocaleDateString("pt-BR")}`
              : "Ainda nos valores padrão."}
          </p>
          <div className="flex gap-2">
            {/* TESTAR USA O QUE ESTÁ NA TELA, não o que está salvo: é para
                conferir ANTES de gravar um modelo que não existe. */}
            <Button variant="secondary" onClick={testar} disabled={!!ocupado || !model.trim()}>
              {ocupado === "testando" ? "Testando…" : "Testar"}
            </Button>
            <Button onClick={salvar} disabled={!!ocupado || !mudou || !model.trim()}>
              {ocupado === "salvando" ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
