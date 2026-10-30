"use client";

import { useState } from "react";
import { CashAdjustment } from "@/components/cash-adjustment";
import { HistoryTable } from "@/components/history-table";

export default function LedgerPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-7">
      <HistoryTable type="ledger" refreshKey={refreshKey} />
      <CashAdjustment onPosted={() => setRefreshKey((key) => key + 1)} />
    </div>
  );
}
