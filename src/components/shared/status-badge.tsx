import type { OrderStatus } from "@prisma/client";
import { STATUS_STYLE } from "@/lib/order-flow";
import { cn } from "@/lib/utils";

// Badge de status consistente em todo o sistema.
export function StatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        s.badge,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
