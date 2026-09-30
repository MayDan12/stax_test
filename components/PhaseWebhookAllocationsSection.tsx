"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AllocationPlan,
  BankConnection,
  DestinationBucket,
  StaxClientConfig,
  TransferInstruction,
  staxFetch,
} from "@/lib/stax-api";
import {
  computeBucketSavings,
  formatNaira,
  resolveAndFormatCurrency,
} from "@/lib/kobo";

interface PhaseWebhookAllocationsSectionProps {
  clientConfig: StaxClientConfig;
  accounts: BankConnection[];
  buckets: DestinationBucket[];
  selectedProviderAccountId: string;
  setSelectedProviderAccountId: (id: string) => void;
  allocationHistory: AllocationPlan[];
  setAllocationHistory: (plans: AllocationPlan[]) => void;
  notify: (type: "success" | "error" | "info", message: string) => void;
}

const WEBHOOK_PRESETS = [
  {
    label: "Standard Salary (₦250,000)",
    amountNaira: 250000,
    narration: "MONTHLY SALARY PAYMENT FEB 2026",
    counterparty: "ACME CORP PAYROLL",
    badge: "30% Pool = ₦75k",
  },
  {
    label: "Bonus Payroll (₦600,000)",
    amountNaira: 600000,
    narration: "Q1 SALARY & PERFORMANCE PAYROLL",
    counterparty: "ACME CORP PAYROLL",
    badge: "30% Pool = ₦180k",
  },
  {
    label: "Exceeds ₦500k Mandate (₦2,000,000)",
    amountNaira: 2000000,
    narration: "EXECUTIVE SALARY PAYMENT",
    counterparty: "ACME CORP PAYROLL",
    badge: "Pool ₦600k → CANCELLED",
  },
  {
    label: "Below Min Salary (₦30,000)",
    amountNaira: 30000,
    narration: "MONTHLY SALARY STIPEND",
    counterparty: "ACME CORP PAYROLL",
    badge: "< ₦50k Threshold",
  },
  {
    label: "Non-Salary Credit (₦120,000)",
    amountNaira: 120000,
    narration: "REFUND FOR ORDER 99412",
    counterparty: "VENDOR MARKETPLACE",
    badge: "Ignored by IncomeService",
  },
];

export default function PhaseWebhookAllocationsSection({
  clientConfig,
  accounts,
  buckets,
  selectedProviderAccountId,
  setSelectedProviderAccountId,
  allocationHistory,
  setAllocationHistory,
  notify,
}: PhaseWebhookAllocationsSectionProps) {
  const [amountNaira, setAmountNaira] = useState<number>(250000);
  const [narration, setNarration] = useState("MONTHLY SALARY PAYMENT FEB 2026");
  const [counterparty, setCounterparty] = useState("ACME CORP PAYROLL");
  const [loadingWebhook, setLoadingWebhook] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingTrigger, setLoadingTrigger] = useState(false);
  const [lastWebhookResponse, setLastWebhookResponse] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveProviderAccountId =
    selectedProviderAccountId ||
    accounts[0]?.providerAccountId ||
    "acc_mock_xxxxxx";

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  async function handleFetchHistory(silent = false) {
    setLoadingHistory(true);
    try {
      const res = await staxFetch<
        | AllocationPlan[]
        | {
            history?: AllocationPlan[];
            plans?: AllocationPlan[];
            data?: AllocationPlan[];
          }
      >(clientConfig, "GET", "/allocations/history");

      const list = Array.isArray(res)
        ? res
        : res?.history || res?.plans || res?.data || [];

      setAllocationHistory(list);
      if (!silent) {
        notify(
          "success",
          `Loaded ${list.length} allocation plan(s) from history.`,
        );
      }
      return list;
    } catch (err: unknown) {
      if (!silent) {
        notify(
          "error",
          err instanceof Error
            ? err.message
            : "Failed to fetch allocation history",
        );
      }
      return [];
    } finally {
      setLoadingHistory(false);
    }
  }

  function startAutoPollingHistory() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }
    setIsPolling(true);
    let attempts = 0;
    pollTimerRef.current = setInterval(async () => {
      attempts += 1;
      await handleFetchHistory(true);
      if (attempts >= 5 && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        setIsPolling(false);
      }
    }, 2000);
  }

  async function handleSimulateWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveProviderAccountId.trim()) {
      notify("error", "Enter or select a providerAccountId.");
      return;
    }
    setLoadingWebhook(true);
    try {
      const payload = {
        providerAccountId: effectiveProviderAccountId.trim(),
        amountNaira: Number(amountNaira),
        narration: narration.trim(),
        counterparty: counterparty.trim(),
      };
      const res = await staxFetch<Record<string, unknown>>(
        clientConfig,
        "POST",
        "/webhooks/simulate-credit",
        payload,
      );
      setLastWebhookResponse(res);
      notify(
        "success",
        `Salary credit webhook queued (${formatNaira(amountNaira)})! Polling GET /v1/allocations/history for worker execution...`,
      );
      await handleFetchHistory(true);
      startAutoPollingHistory();
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error
          ? err.message
          : "Webhook simulation request failed",
      );
    } finally {
      setLoadingWebhook(false);
    }
  }

  const rawTxId =
    (lastWebhookResponse?.rawTransactionId as string) ||
    (lastWebhookResponse?.transactionId as string) ||
    ((lastWebhookResponse?.transaction as Record<string, unknown>)
      ?.id as string) ||
    (lastWebhookResponse?.id as string) ||
    "";

  async function handleDevSyncTrigger() {
    if (!rawTxId) {
      notify("error", "No rawTransactionId available from last webhook.");
      return;
    }
    setLoadingTrigger(true);
    try {
      await staxFetch(clientConfig, "POST", `/allocations/trigger/${rawTxId}`);
      notify(
        "success",
        `Triggered synchronous plan generation for transaction ${rawTxId}!`,
      );
      await handleFetchHistory(true);
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Sync trigger failed",
      );
    } finally {
      setLoadingTrigger(false);
    }
  }

  function resolveBucketName(transfer: TransferInstruction): string {
    if (transfer.bucketName) return transfer.bucketName;
    if (transfer.bucket?.name) return transfer.bucket.name;
    const found = buckets.find((b) => b.id === transfer.bucketId);
    return found ? found.name : `Bucket (${transfer.bucketId.slice(0, 8)}...)`;
  }

  function getStatusBadgeStyle(status?: string) {
    const s = (status || "").toUpperCase();
    if (s === "COMPLETED" || s === "SUCCESS" || s === "SETTLED") {
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    }
    if (s === "CANCELLED" || s === "FAILED") {
      return "bg-rose-500/20 text-rose-300 border-rose-500/30";
    }
    if (s === "PARTIALLY_FAILED") {
      return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    }
    return "bg-sky-500/20 text-sky-300 border-sky-500/30";
  }

  return (
    <div className="space-y-6">
      {/* Phase Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400 border border-rose-500/20">
              Phase 5 • Webhook Ingestion, Salary Classification & Allocation
              Engine
            </span>
            <h2 className="mt-2 text-xl font-bold text-white">
              Simulate Salary Credit Webhook & Inspect Execution Plans
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Dispatch a mock bank credit webhook. The async worker classifies
              salary income, calculates Kobo splits, checks your Direct Debit
              mandate ceiling, posts balanced ledger entries, and dispatches
              deterministic transfers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleFetchHistory(false)}
            disabled={loadingHistory}
            className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            {loadingHistory
              ? "Polling..."
              : isPolling
                ? "🔄 Auto-Polling History..."
                : "Refresh History (GET /v1/allocations/history)"}
          </button>
        </div>
      </div>

      {/* Step 1: Simulate Salary Credit Webhook */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Step 1 • Webhook Simulator
              </span>
              <h3 className="text-base font-bold text-white">
                Simulate Incoming Bank Credit Webhook
              </h3>
            </div>
            <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
              POST /v1/webhooks/simulate-credit
            </code>
          </div>

          {/* Scenario Presets */}
          <div className="mb-4">
            <span className="block text-xs text-slate-400 mb-1.5">
              Test Scenarios (Click to Pre-fill):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {WEBHOOK_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setAmountNaira(preset.amountNaira);
                    setNarration(preset.narration);
                    setCounterparty(preset.counterparty);
                  }}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-left text-xs text-slate-300 hover:border-emerald-500/40 hover:text-white transition"
                >
                  <span className="font-medium">{preset.label}</span>
                  <span className="ml-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-emerald-300">
                    {preset.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSimulateWebhook} noValidate className="space-y-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Provider Account ID (
                  <code className="font-mono text-amber-300">
                    providerAccountId
                  </code>
                  )
                </label>
                {accounts.length > 0 ? (
                  <div className="space-y-1.5">
                    <select
                      value={effectiveProviderAccountId}
                      onChange={(e) =>
                        setSelectedProviderAccountId(e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.providerAccountId}>
                          {acc.providerAccountId} ({acc.bankName})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input
                    type="text"
                    required
                    value={effectiveProviderAccountId}
                    onChange={(e) =>
                      setSelectedProviderAccountId(e.target.value)
                    }
                    placeholder="acc_mock_xxxxxx"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Credit Amount in Naira (
                    <code className="font-mono text-emerald-300">
                      amountNaira
                    </code>
                    )
                  </label>
                  <span className="text-xs font-mono text-slate-400">
                    {(Number(amountNaira || 0) * 100).toLocaleString()} Kobo
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min={100}
                  value={amountNaira}
                  onChange={(e) => setAmountNaira(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Transaction Narration (
                  <code className="font-mono">narration</code>)
                </label>
                <input
                  type="text"
                  required
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="MONTHLY SALARY PAYMENT FEB 2026"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Counterparty Name (
                  <code className="font-mono">counterparty</code>)
                </label>
                <input
                  type="text"
                  required
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  placeholder="ACME CORP PAYROLL"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingWebhook}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {loadingWebhook
                ? "Dispatching Credit Webhook..."
                : `🚀 Simulate ${formatNaira(amountNaira)} Credit Webhook (/v1/webhooks/simulate-credit)`}
            </button>
          </form>
        </div>

        {/* Right: Worker Pipeline & Queued Job Status (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Async Worker Pipeline
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">
              Queue Status & Ingestion Pipeline
            </h3>

            <ol className="mt-3 space-y-2 text-xs text-slate-400 list-decimal list-inside">
              <li>
                <strong className="text-slate-200">
                  RawTransaction Stored:
                </strong>{" "}
                Returns{" "}
                <code className="text-emerald-300 font-mono">
                  status: &quot;queued&quot;
                </code>
                , transaction ID, and Redis queue job ID.
              </li>
              <li>
                <strong className="text-slate-200">
                  IncomeService Classification:
                </strong>{" "}
                Checks <code className="font-mono">minSalaryNaira</code>{" "}
                threshold & salary/payroll narration or counterparty signals.
              </li>
              <li>
                <strong className="text-slate-200">
                  AllocationsService & Mandate Check:
                </strong>{" "}
                Computes Kobo splits and deterministic idempotency keys{" "}
                <code className="text-slate-300 font-mono">
                  stax_tx_&lt;planId&gt;_&lt;bucketId&gt;_v&lt;ruleVersion&gt;
                </code>
                . Marks{" "}
                <code className="text-rose-300 font-mono">CANCELLED</code> if
                mandate ceiling is exceeded.
              </li>
              <li>
                <strong className="text-slate-200">
                  Ledger & Payment Dispatch:
                </strong>{" "}
                Posts balanced ledger entries and calls payment provider to
                reach{" "}
                <code className="text-emerald-300 font-mono">COMPLETED</code>.
              </li>
            </ol>

            {lastWebhookResponse && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-slate-950 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-emerald-400">
                    Latest Webhook Queue Response
                  </span>
                  {rawTxId && (
                    <button
                      type="button"
                      onClick={handleDevSyncTrigger}
                      disabled={loadingTrigger}
                      title="Dev-only synchronous plan trigger (does not run worker ledger/payment steps)"
                      className="rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25"
                    >
                      {loadingTrigger
                        ? "Triggering..."
                        : "Dev Sync Trigger (/allocations/trigger/:id)"}
                    </button>
                  )}
                </div>
                <pre className="max-h-36 overflow-auto font-mono text-[11px] text-slate-300">
                  {JSON.stringify(lastWebhookResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-[11px] text-slate-400">
            💡 <strong className="text-slate-300">Tip:</strong> Ensure{" "}
            <code className="font-mono text-emerald-300">
              USE_MOCK_BANKING=true
            </code>{" "}
            and Redis are running so the background worker processes the queued
            job and settles each transfer.
          </div>
        </div>
      </div>

      {/* Live Bucket Savings Balances */}
      {buckets.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Vault Balances • Real-Time Savings Progress
              </span>
              <h3 className="text-base font-bold text-white">
                Current Amount Saved in Each Destination Bucket
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              Total Saved:{" "}
              <strong className="text-emerald-400 font-bold">
                {formatNaira(
                  buckets.reduce(
                    (sum, b) =>
                      sum +
                      computeBucketSavings(b, allocationHistory).savedNaira,
                    0,
                  ),
                )}
              </strong>
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {buckets.map((b) => {
              const m = computeBucketSavings(b, allocationHistory);
              return (
                <div
                  key={b.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/90 p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-white text-sm truncate">
                        {b.name}
                      </h4>
                      <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300 shrink-0">
                        {m.progressPercent}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-lg font-extrabold text-emerald-400">
                        {formatNaira(m.savedNaira)}
                      </span>
                      <span className="text-xs text-slate-400">
                        of{" "}
                        {resolveAndFormatCurrency(b.targetKobo, b.targetNaira)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] font-mono text-slate-500">
                      {Number(m.savedKobo).toLocaleString()} Kobo •{" "}
                      {m.settledTransferCount} settled transfer(s)
                      {m.pendingNaira > 0 && (
                        <span className="ml-1 text-amber-400">
                          (+{formatNaira(m.pendingNaira)} pending)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                        style={{
                          width: `${Math.max(
                            m.savedNaira > 0 ? 2 : 0,
                            m.progressPercent,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: Allocation Execution History */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
              Step 2 • Execution Ledger & Plan History
            </span>
            <h3 className="text-base font-bold text-white">
              Allocation Plans & Deterministic Transfer Instructions (
              {allocationHistory.length})
            </h3>
          </div>
          <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
            GET /v1/allocations/history
          </code>
        </div>

        {allocationHistory.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-8 text-center">
            <p className="text-sm text-slate-400">
              No allocation plans in history yet. Simulate a salary credit
              webhook above and poll history!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {allocationHistory.map((plan) => {
              const transfers =
                plan.transfers || plan.transferInstructions || [];
              const salaryKobo =
                plan.sourceAmountKobo ??
                plan.salaryAmountKobo ??
                plan.amountKobo;
              const poolKobo =
                plan.poolAmountKobo ??
                plan.totalAllocatedKobo ??
                plan.allocatedAmountKobo;

              return (
                <div
                  key={plan.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/90 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={`rounded-full border px-3 py-0.5 text-xs font-bold ${getStatusBadgeStyle(
                          plan.status,
                        )}`}
                      >
                        {plan.status}
                      </span>
                      <span className="font-mono text-xs text-slate-300">
                        Plan ID: {plan.id}
                      </span>
                      {plan.ruleVersion !== undefined && (
                        <span className="rounded bg-purple-500/20 px-2 py-0.5 font-mono text-xs font-semibold text-purple-300">
                          Rule v{plan.ruleVersion}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      {salaryKobo !== undefined && (
                        <div>
                          <span className="text-slate-500">
                            Source Salary:{" "}
                          </span>
                          <span className="font-bold text-white">
                            {resolveAndFormatCurrency(salaryKobo, undefined)}
                          </span>
                          <span className="ml-1 font-mono text-[10px] text-slate-500">
                            ({String(salaryKobo)} Kobo)
                          </span>
                        </div>
                      )}
                      {poolKobo !== undefined && (
                        <div>
                          <span className="text-slate-500">
                            Allocated Pool:{" "}
                          </span>
                          <span className="font-bold text-emerald-400">
                            {resolveAndFormatCurrency(poolKobo, undefined)}
                          </span>
                          <span className="ml-1 font-mono text-[10px] text-slate-500">
                            ({String(poolKobo)} Kobo)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Transfer Instructions Table */}
                  {transfers.length > 0 ? (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800/80 text-[11px] uppercase text-slate-500">
                            <th className="py-2 pr-3">Destination Bucket</th>
                            <th className="py-2 px-3">Amount (Naira)</th>
                            <th className="py-2 px-3">Raw Kobo (BigInt)</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 pl-3">
                              Deterministic Idempotency Key
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {transfers.map((tr, idx) => (
                            <tr key={tr.id || `${tr.bucketId}-${idx}`}>
                              <td className="py-2.5 pr-3 font-medium text-slate-200">
                                {resolveBucketName(tr)}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-emerald-400">
                                {resolveAndFormatCurrency(
                                  tr.amountKobo,
                                  tr.amountNaira,
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-400">
                                {String(tr.amountKobo ?? "—")}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${getStatusBadgeStyle(
                                    tr.status || plan.status,
                                  )}`}
                                >
                                  {tr.status || plan.status}
                                </span>
                              </td>
                              <td className="py-2.5 pl-3 font-mono text-[11px] text-slate-400">
                                {tr.idempotencyKey ||
                                  `stax_tx_${plan.id}_${tr.bucketId}_v${plan.ruleVersion ?? 1}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] text-slate-300">
                      {JSON.stringify(plan, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
