import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BackButton } from "@/components/shared/back-button";
import { TasksBoard, type TaskCard } from "./tasks-board";

// Tarefas Diarias: Kanban pessoal da vendedora.
// - VENDAS: ve/gerencia apenas as proprias tarefas.
// - GESTAO: ve todas (com o nome da dona em cada card).
export default async function TarefasPage() {
  const session = await requireRole(["VENDAS", "GESTAO"]);
  const isGestao = session.role === "GESTAO";

  const tasks = await prisma.dailyTask.findMany({
    where: isGestao ? {} : { userId: session.userId },
    include: { user: { select: { name: true } } },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
  });

  const cards: TaskCard[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    startTime: t.startTime,
    endTime: t.endTime,
    category: t.category,
    notes: t.notes,
    status: t.status,
    ownerName: isGestao ? t.user.name : null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <BackButton href="/vendas" />
        <h1 className="text-2xl font-bold text-vendas">Tarefas Diárias</h1>
        <p className="text-sm text-muted-foreground">
          {isGestao
            ? "Quadro de tarefas de todas as vendedoras."
            : "Organize suas tarefas do dia: a fazer, fazendo e concluídas."}
        </p>
      </div>
      <TasksBoard cards={cards} canManage />
    </div>
  );
}
