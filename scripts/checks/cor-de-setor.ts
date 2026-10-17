/**
 * Checagem de contraste das cores de setor.
 *
 * Lê os valores do PRÓPRIO globals.css e do tailwind.config.ts e recalcula o
 * contraste. Não há número copiado aqui: mexer na paleta e esquecer o contraste
 * deixa esta checagem vermelha, que é a única forma de a regra do PRODUCT.md
 * ("contraste WCAG AA") não virar intenção.
 *
 * O QUE DEU ERRADO ANTES: o hex de cada setor foi escolhido para FUNDO de botão
 * (com texto branco por cima) e passou a ser usado como COR DE TEXTO em 140
 * lugares. Nenhum dos seis passava no tema claro — distribuicao dava 2,11:1
 * onde o mínimo é 4,5:1. Ninguém percebeu porque a cor parece "a cor certa": o
 * defeito é de legibilidade, não de aparência.
 *
 * Rode com: npx tsx scripts/checks/cor-de-setor.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const canal = (v: number) => {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminancia = ([r, g, b]: number[]) =>
  0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

function hslParaRgb(H: number, S: number, L: number): number[] {
  S /= 100;
  L /= 100;
  const C = (1 - Math.abs(2 * L - 1)) * S;
  const X = C * (1 - Math.abs(((H / 60) % 2) - 1));
  const m = L - C / 2;
  const h = ((H % 360) + 360) % 360;
  const [r, g, b] =
    h < 60 ? [C, X, 0]
    : h < 120 ? [X, C, 0]
    : h < 180 ? [0, C, X]
    : h < 240 ? [0, X, C]
    : h < 300 ? [X, 0, C]
    : [C, 0, X];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const hexParaRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function razao(a: number[], b: number[]): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  const hi = Math.max(x, y);
  const lo = Math.min(x, y);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

const raiz = path.resolve(__dirname, "../..");
const css = readFileSync(path.join(raiz, "src/app/globals.css"), "utf8");
const conf = readFileSync(path.join(raiz, "tailwind.config.ts"), "utf8");

// O `.dark` começa onde a classe é declarada; antes dela é o :root (tema claro).
const inicioEscuro = css.indexOf(".dark {");
check("o bloco .dark existe no globals.css", inicioEscuro > 0, true);
const blocoClaro = css.slice(0, inicioEscuro);
const blocoEscuro = css.slice(inicioEscuro);

function hslDoCss(bloco: string, nome: string): number[] | null {
  const m = new RegExp(`--${nome}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`).exec(bloco);
  return m ? hslParaRgb(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

// A superfície MAIS DIFÍCIL de cada tema: no claro o fundo da página, que é
// mais escuro que o card; no escuro o card, que é mais claro que o fundo.
// Passar na mais difícil passa nas duas, e é por isso que a checagem usa uma só.
const fundoClaro = hslDoCss(blocoClaro, "background");
const cardEscuro = hslDoCss(blocoEscuro, "card");
check("leu o fundo do tema claro", fundoClaro !== null, true);
check("leu o card do tema escuro", cardEscuro !== null, true);

const SETORES = ["vendas", "financeiro", "distribuicao", "motorista", "brand", "servico"] as const;
const MINIMO = 4.5; // WCAG AA para texto abaixo de 18,66px negrito / 24px normal

// Nenhuma divida aqui: os quatro setores que reprovavam no botao (financeiro
// 3,62 / brand 3,15 / motorista e servico 2,87) foram escurecidos em
// 16/10/2026 e os seis passam. O mapa de divida que existia neste lugar saiu
// junto com a divida — a checagem do botao vale para todos agora.
const BOTAO_REPROVADO: Partial<Record<(typeof SETORES)[number], number>> = {};

for (const setor of SETORES) {
  const claro = hslDoCss(blocoClaro, `${setor}-text`);
  const escuro = hslDoCss(blocoEscuro, `${setor}-text`);
  check(`${setor}: tem token de texto no tema claro`, claro !== null, true);
  check(`${setor}: tem token de texto no tema escuro`, escuro !== null, true);
  if (!claro || !escuro || !fundoClaro || !cardEscuro) continue;

  const rClaro = razao(claro, fundoClaro);
  const rEscuro = razao(escuro, cardEscuro);
  check(`${setor}: texto no tema claro >= ${MINIMO} (${rClaro})`, rClaro >= MINIMO, true);
  check(`${setor}: texto no tema escuro >= ${MINIMO} (${rEscuro})`, rEscuro >= MINIMO, true);

  // O token SÓLIDO continua servindo de fundo de botão, com o `fg` por cima.
  // Este par não muda por tema (os dois são hex fixos), e é o que garante que o
  // passe de legibilidade do texto não estragou os botões.
  const bloco = new RegExp(
    `${setor}:\\s*\\{[^}]*DEFAULT:\\s*"(#[0-9a-fA-F]{6})"[^}]*fg:\\s*"(#[0-9a-fA-F]{6})"`,
    "s",
  ).exec(conf);
  check(`${setor}: tem DEFAULT e fg no tailwind.config`, bloco !== null, true);
  if (bloco) {
    const rBotao = razao(hexParaRgb(bloco[1]), hexParaRgb(bloco[2]));
    const conhecido = BOTAO_REPROVADO[setor];
    if (conhecido === undefined) {
      check(`${setor}: texto do botao sobre o fundo solido >= ${MINIMO} (${rBotao})`, rBotao >= MINIMO, true);
    } else {
      // Dívida registrada com o número, não com um `skip`: se alguém mexer na
      // cor, este valor muda e a linha fica vermelha — para cima ou para baixo.
      check(`${setor}: botao segue na divida conhecida de ${conhecido}:1`, rBotao, conhecido);
    }
  }
}

// Nenhum arquivo deve ter voltado a usar a cor sólida como cor de texto: é a
// regressão exata que este passe conserta, e ela é invisível na tela.
const { execSync } = require("node:child_process") as typeof import("node:child_process");
let puros = "";
try {
  puros = execSync(
    `node -e "const{readdirSync,readFileSync,statSync}=require('fs');const p=require('path');let n=0;const re=/text-(vendas|financeiro|distribuicao|motorista|brand|servico)(?![-\\\\w])/g;(function w(d){for(const e of readdirSync(d)){const f=p.join(d,e);if(statSync(f).isDirectory())w(f);else if(/\\.(tsx?|jsx?)$/.test(e)){const m=readFileSync(f,'utf8').match(re);if(m)n+=m.length}}})('src');console.log(n)"`,
    { cwd: raiz, encoding: "utf8" },
  ).trim();
} catch {
  puros = "erro";
}
check("nenhum uso da cor solida como cor de texto", puros, "0");

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("cor-de-setor: todas as checagens passaram.");
