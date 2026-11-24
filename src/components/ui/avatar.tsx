import { cn, iniciais } from "@/lib/utils";

/**
 * O disco de quem toca uma tarefa.
 *
 * SO INICIAIS. O `User` do buildflow nao tem campo de foto — o Build.Connect
 * tem, e la o cartao mostra o rosto. Criar avatar aqui seria uma frente nova
 * no sistema inteiro (campo, upload, armazenamento, tela para enviar) para um
 * disco de 36px num quadro. As iniciais sao o mesmo recurso a que a
 * ferramenta de la ja recorre quando a pessoa nao enviou foto.
 *
 * SEM RESPONSAVEL o circulo fica TRACEJADO, nunca ausente: um cartao sem dono
 * e uma pergunta aberta na reuniao de sexta, e um espaco vazio nao pergunta
 * nada.
 *
 * `aria-hidden` quando ha nome: ele esta sempre escrito ao lado ou no
 * `title` de quem chama, e um leitor que anuncia "KL, Karen Lima" atrapalha
 * mais do que ajuda.
 */
export function Avatar({
  name,
  size = "h-9 w-9",
  textSize = "text-xs",
  tone = "soft",
  className,
}: {
  /** Nome completo. Ausente desenha o circulo tracejado de "sem responsavel". */
  name?: string;
  /** Classes de tamanho, sempre em par (ex.: "h-9 w-9"). */
  size?: string;
  /** Tamanho das iniciais, que nao acompanha o diametro sozinho. */
  textSize?: string;
  /**
   * "soft" e o disco esmaecido das listas, onde varios juntos em cor cheia
   * viram um vitral; "solid" e o disco cheio de quando ha um so.
   */
  tone?: "soft" | "solid";
  className?: string;
}) {
  if (!name) {
    return (
      <span
        aria-label="Sem responsável"
        title="Sem responsável"
        className={cn(
          size,
          "shrink-0 rounded-full border border-dashed border-muted-foreground/50",
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      title={name}
      className={cn(
        size,
        textSize,
        tone === "solid" ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary",
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        className,
      )}
    >
      {iniciais(name)}
    </span>
  );
}
