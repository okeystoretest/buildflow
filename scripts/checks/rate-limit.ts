/**
 * Checagem do rate limit compartilhado (janela deslizante no Postgres).
 *
 * Fala com o BANCO de propósito: o que mudou foi justamente o store, e a
 * instrução SQL única é onde mora todo o risco — contagem, inserção
 * condicionada e limpeza da janela acontecem lá dentro. Conferir só aritmética
 * em memória testaria o fallback e deixaria passar o caminho real.
 *
 * Usa chaves próprias com prefixo `check:` e as apaga no fim, então não mexe em
 * contador de ninguém.
 *
 * Rode com: npx tsx scripts/checks/rate-limit.ts
 */
import { checkRate, clearLoginRate, expurgarTentativasVelhas } from "../../src/lib/rate-limit";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let falhas = 0;

function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

async function main() {
  const chave = `check:rate:${Date.now()}`;
  const janela = 60 * 60 * 1000;

  // O teto vale: a 3a tentativa de um teto de 3 passa, a 4a nao.
  const r1 = await checkRate(chave, { max: 3, windowMs: janela });
  const r2 = await checkRate(chave, { max: 3, windowMs: janela });
  const r3 = await checkRate(chave, { max: 3, windowMs: janela });
  const r4 = await checkRate(chave, { max: 3, windowMs: janela });
  check("1a tentativa passa", r1.allowed, true);
  check("2a tentativa passa", r2.allowed, true);
  check("3a tentativa passa (o teto e inclusivo)", r3.allowed, true);
  check("4a tentativa e barrada", r4.allowed, false);
  check("a barrada diz quanto esperar", r4.retryAfterSec > 0, true);
  check("a espera nao passa da janela", r4.retryAfterSec <= janela / 1000, true);

  // Quem e barrado NAO insere linha: tentar mil vezes nao gera mil linhas, que e
  // o que transformaria a contencao em vetor de crescimento da tabela.
  const antes = await prisma.rateLimitHit.count({ where: { key: chave } });
  await checkRate(chave, { max: 3, windowMs: janela });
  await checkRate(chave, { max: 3, windowMs: janela });
  const depois = await prisma.rateLimitHit.count({ where: { key: chave } });
  check("tentativa barrada nao grava linha", depois, antes);
  check("gravou exatamente o teto", depois, 3);

  // Chaves sao independentes: o balde de um IP nao conta contra o de outro.
  const outra = `${chave}:outra`;
  const o1 = await checkRate(outra, { max: 3, windowMs: janela });
  check("chave diferente comeca do zero", o1.allowed, true);

  // A janela DESLIZA: com as tentativas empurradas para tras da janela, a chave
  // volta a aceitar. E a diferenca entre deslizante e janela fixa, e e o que
  // nao podia ser perdido na troca de store.
  await prisma.$executeRaw`UPDATE "RateLimitHit" SET "at" = now() - interval '2 hours' WHERE "key" = ${chave}`;
  const depoisDaJanela = await checkRate(chave, { max: 3, windowMs: janela });
  check("fora da janela a chave aceita de novo", depoisDaJanela.allowed, true);
  // E as linhas velhas foram recolhidas pela propria checagem.
  const sobraram = await prisma.rateLimitHit.count({ where: { key: chave } });
  check("a checagem limpou as linhas fora da janela", sobraram, 1);

  // clearLoginRate zera a chave (o login chama isto depois de a senha bater).
  await clearLoginRate(chave);
  check("limpar a chave apaga as linhas", await prisma.rateLimitHit.count({ where: { key: chave } }), 0);

  // O expurgo diario leva linhas com mais de 24h de QUALQUER chave.
  await checkRate(chave, { max: 3, windowMs: janela });
  await prisma.$executeRaw`UPDATE "RateLimitHit" SET "at" = now() - interval '30 hours' WHERE "key" = ${chave}`;
  await expurgarTentativasVelhas();
  check(
    "o expurgo diario leva linha com mais de 24h",
    await prisma.rateLimitHit.count({ where: { key: chave } }),
    0,
  );

  // Limpeza do que este script criou.
  await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "check:rate:" } } });

  await prisma.$disconnect();
  if (falhas > 0) {
    console.log(`\n${falhas} checagem(ns) falharam.`);
    process.exit(1);
  }
  console.log("rate-limit: todas as checagens passaram.");
}

main().catch(async (e) => {
  console.log("ERRO: " + String(e?.message ?? e).split("\n").slice(0, 4).join(" | "));
  await prisma.$disconnect();
  process.exit(1);
});
