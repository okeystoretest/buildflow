"use client";

import { useEffect, useState } from "react";

/**
 * Contador que anda de segundo em segundo.
 *
 * Veio de `acompanhamento/followups-client.tsx`, onde servia ao Plano de Ação,
 * porque o card do quadro de Acompanhamento passou a precisar do mesmo
 * contador (27/11/2026). Duas cópias divergiriam no primeiro ajuste de
 * formato, e o formato é o que faz os dois parecerem o mesmo relógio.
 *
 * `desde` é um INSTANTE (ms), não "HH:MM": quem chama resolve de onde ele vem.
 * O cronômetro do card vem de `FollowUp.timerStartedAt`, que é timestamp e
 * sobrevive ao F5; o do Plano de Ação vem de `DailyTask.startTime`, que é hora
 * sem data e só vale no dia corrente.
 *
 * `aria-live="off"` de propósito: um leitor de tela anunciando o segundo que
 * passa não deixaria ouvir mais nada da página.
 *
 * O PRIMEIRO DESENHO É SEMPRE 00:00:00, e isso conserta um erro de
 * hidratação: com `Date.now()` no inicializador, o servidor renderiza "14",
 * o cliente renderiza "15" um instante depois, e o React joga fora a árvore
 * inteira reclamando no console. Enquanto o cronômetro só existia dentro de um
 * modal — que nasce depois do clique, no cliente — ninguém via; ao entrar no
 * CARTÃO, que é renderizado no servidor, o erro passou a acontecer em todo
 * cartão contando. Partindo de `desde`, os dois lados concordam, e o `useEffect`
 * acerta o relógio no mesmo instante em que monta.
 */
export function Cronometro({ desde }: { desde: number }) {
  const [agora, setAgora] = useState(desde);
  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seg = Math.max(0, Math.floor((agora - desde) / 1000));
  const dd = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-data tabular-nums" aria-live="off">
      {dd(Math.floor(seg / 3600))}:{dd(Math.floor((seg % 3600) / 60))}:{dd(seg % 60)}
    </span>
  );
}
