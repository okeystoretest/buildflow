"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface Opt { id: string; name: string; }

/**
 * Filtros do Relatório de Campanha. Aplicam imediatamente ao trocar o valor
 * (sem botões). O escopo por vendedora só aparece para GESTÃO.
 */
export function RelatorioCampanhaFiltros({
  campaigns,
  sellers,
  showSellerFilter,
  defaultCampaign,
  defaultSeller,
}: {
  campaigns: Opt[];
  sellers: Opt[];
  showSellerFilter: boolean;
  defaultCampaign: string;
  defaultSeller: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <div className="space-y-1.5" style={{ minWidth: 240 }}>
          <Label>Campanha</Label>
          <select
            className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
            value={defaultCampaign}
            onChange={(e) => apply("campanha", e.target.value)}
          >
            <option value="">Todas as campanhas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {showSellerFilter && (
          <div className="space-y-1.5" style={{ minWidth: 220 }}>
            <Label>Vendedora</Label>
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={defaultSeller}
              onChange={(e) => apply("vendedora", e.target.value)}
            >
              <option value="">Todas as vendedoras</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
