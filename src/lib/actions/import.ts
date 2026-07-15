"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction, hashPassword } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import type { Role, SalesModel } from "@prisma/client";

export interface ImportSummary {
  created: number;
  updated?: number; // atualizados por upsert (ex.: clientes corrigidos)
  skipped: number;
  errors: string[]; // mensagens linha a linha (limitado)
}

// ---------------------------------------------------------------------------
// Parser de CSV simples e robusto: aceita separador "," ou ";", campos entre
// aspas duplas e quebras de linha CRLF/LF. Sem dependencia externa.
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // detecta separador na primeira linha (fora de aspas)
  const sep = detectSep(text);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* ignora */ }
      else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function detectSep(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const semis = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semis > commas ? ";" : ",";
}

// Remove o cabecalho se a primeira celula bater com um rotulo conhecido.
function dropHeader(rows: string[][], headerHints: string[]): string[][] {
  if (rows.length === 0) return rows;
  const first = (rows[0][0] ?? "").trim().toLowerCase();
  if (headerHints.some((h) => first === h)) return rows.slice(1);
  return rows;
}

const ROLE_MAP: Record<string, Role> = {
  "gestao": "GESTAO", "gestão": "GESTAO",
  "vendas": "VENDAS", "venda": "VENDAS",
  "financeiro": "FINANCEIRO",
  "logistica": "LOGISTICA", "logística": "LOGISTICA",
  "motorista": "MOTORISTA",
};
const MODEL_MAP: Record<string, SalesModel> = {
  "varejo": "VAREJO", "atacado": "ATACADO",
};

// ---------------------------------------------------------------------------
// USUARIOS  — colunas: nome, usuario(email), senha, perfil, modelo(opcional)
// ---------------------------------------------------------------------------
export async function importUsersCsv(csv: string): Promise<ActionResult<ImportSummary>> {
  try {
    await requireRoleAction(["GESTAO"]);
    let rows = parseCsv(csv);
    rows = dropHeader(rows, ["nome", "name"]);
    if (rows.length === 0) return actionError("Arquivo vazio ou sem linhas válidas.");

    const summary: ImportSummary = { created: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const ln = i + 1;
      const name = (r[0] ?? "").trim();
      const email = (r[1] ?? "").trim();
      const password = (r[2] ?? "").trim();
      const roleRaw = (r[3] ?? "").trim().toLowerCase();
      const modelRaw = (r[4] ?? "").trim().toLowerCase();

      if (!name || !email || !password) {
        summary.skipped++; summary.errors.push(`Linha ${ln}: nome, usuário e senha são obrigatórios.`); continue;
      }
      if (password.length < 6) {
        summary.skipped++; summary.errors.push(`Linha ${ln}: senha com menos de 6 caracteres.`); continue;
      }
      const role = ROLE_MAP[roleRaw];
      if (!role) {
        summary.skipped++; summary.errors.push(`Linha ${ln}: perfil inválido ("${r[3] ?? ""}").`); continue;
      }
      let salesModel: SalesModel | null = null;
      if (role === "VENDAS") {
        salesModel = MODEL_MAP[modelRaw] ?? null;
        if (!salesModel) {
          summary.skipped++; summary.errors.push(`Linha ${ln}: vendedor exige modelo (Varejo/Atacado).`); continue;
        }
      }
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) { summary.skipped++; summary.errors.push(`Linha ${ln}: usuário "${email}" já existe.`); continue; }

      await prisma.user.create({
        data: { name, email, password: await hashPassword(password), role, salesModel },
      });
      summary.created++;
    }
    revalidatePath("/gestao");
    return actionOk(summary);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao importar usuários.");
  }
}

// ---------------------------------------------------------------------------
// OPERACOES — colunas: codigo, nome
// ---------------------------------------------------------------------------
export async function importOperationsCsv(csv: string): Promise<ActionResult<ImportSummary>> {
  try {
    await requireRoleAction(["GESTAO"]);
    let rows = parseCsv(csv);
    rows = dropHeader(rows, ["codigo", "código", "code"]);
    if (rows.length === 0) return actionError("Arquivo vazio ou sem linhas válidas.");

    const summary: ImportSummary = { created: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const ln = i + 1;
      const code = (r[0] ?? "").trim();
      const name = (r[1] ?? "").trim();
      if (!code || !name) {
        summary.skipped++; summary.errors.push(`Linha ${ln}: código e nome são obrigatórios.`); continue;
      }
      const dup = await prisma.operation.findFirst({ where: { code } });
      if (dup) { summary.skipped++; summary.errors.push(`Linha ${ln}: operação com código "${code}" já existe.`); continue; }
      await prisma.operation.create({ data: { code, name } });
      summary.created++;
    }
    revalidatePath("/gestao");
    return actionOk(summary);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao importar operações.");
  }
}

// ---------------------------------------------------------------------------
// CLIENTES — colunas: codigo, nome
// ---------------------------------------------------------------------------
export async function importCustomersCsv(csv: string): Promise<ActionResult<ImportSummary>> {
  try {
    await requireRoleAction(["GESTAO", "VENDAS"]);
    let rows = parseCsv(csv);
    rows = dropHeader(rows, ["codigo", "código", "code"]);
    if (rows.length === 0) return actionError("Arquivo vazio ou sem linhas válidas.");

    const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const ln = i + 1;
      const code = (r[0] ?? "").trim();
      const name = (r[1] ?? "").trim();
      if (!code) { summary.skipped++; summary.errors.push(`Linha ${ln}: código é obrigatório.`); continue; }
      if (!name) { summary.skipped++; summary.errors.push(`Linha ${ln}: nome é obrigatório.`); continue; }

      // UPSERT pelo "code" (unico): se o cliente ja existe, ATUALIZA o nome
      // (permite corrigir cadastros em lote sem apagar nada, preservando os
      // pedidos ja ligados). Se nao existe, cria.
      const existente = await prisma.customer.findUnique({ where: { code } });
      if (existente) {
        if (existente.name !== name) {
          await prisma.customer.update({ where: { code }, data: { name } });
          summary.updated = (summary.updated ?? 0) + 1;
        } else {
          summary.skipped++; // ja estava igual, nada a fazer
        }
      } else {
        await prisma.customer.create({ data: { code, name } });
        summary.created++;
      }
    }
    revalidatePath("/gestao");
    revalidatePath("/vendas/clientes");
    return actionOk(summary);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao importar clientes.");
  }
}
