-- Build.Flow | Migration: Tarefas Diarias (Kanban da vendedora)
-- Cria o enum de status da tarefa e a tabela DailyTask.

-- 1) Enum de status do quadro de tarefas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskStatus') THEN
    CREATE TYPE "TaskStatus" AS ENUM ('A_FAZER', 'FAZENDO', 'CONCLUIDA');
  END IF;
END$$;

-- 2) Tabela de tarefas diarias.
CREATE TABLE IF NOT EXISTS "DailyTask" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "startTime" TEXT,
  "endTime"   TEXT,
  "category"  TEXT,
  "notes"     TEXT,
  "status"    "TaskStatus" NOT NULL DEFAULT 'A_FAZER',
  "position"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- 3) Chave estrangeira para o usuario (vendedora). Apaga tarefas se o user sair.
ALTER TABLE "DailyTask"
  ADD CONSTRAINT "DailyTask_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Indices de apoio (mesma intencao do @@index no schema).
CREATE INDEX IF NOT EXISTS "DailyTask_userId_status_idx" ON "DailyTask" ("userId", "status");
CREATE INDEX IF NOT EXISTS "DailyTask_createdAt_idx" ON "DailyTask" ("createdAt");
