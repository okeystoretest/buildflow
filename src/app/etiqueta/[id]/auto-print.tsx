"use client";

import { useEffect } from "react";

// Dispara a impressão automaticamente ao abrir a etiqueta em nova aba.
// Pequeno atraso garante que fontes/layout já estejam prontos antes do diálogo.
export function EtiquetaAutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, []);
  return null;
}
