"use client";

import React, { useMemo, useState } from "react";
import {
  AllocationPlan,
  AllocationRule,
  DestinationBucket,
  RuleSplitInput,
  StaxClientConfig,
  staxFetch,
} from "@/lib/stax-api";
import {
  bpsToPercent,
  computeBucketSavings,
  formatNaira,
  resolveAndFormatCurrency,
} from "@/lib/kobo";

interface PhaseBucketsRulesSectionProps {
  clientConfig: StaxClientConfig;
  buckets: DestinationBucket[];
  setBuckets: (buckets: DestinationBucket[]) => void;
  activeRule: AllocationRule | null;
  setActiveRule: (rule: AllocationRule | null) => void;
  allocationHistory?: AllocationPlan[];
  notify: (type: "success" | "error" | "info", message: string) => void;
}

const STANDARD_BUCKETS = [
  { name: "Emergency Vault", targetNaira: 1000000 },
  { name: "Investments", targetNaira: 500000 },
  { name: "Bills & Utilities", targetNaira: 200000 },
];

function buildRecommendedSplits(
  bucketList: DestinationBucket[],
): RuleSplitInput[] {
  if (bucketList.length === 0) return [];
  if (bucketList.length === 1) {
    return [
      { bucketId: bucketList[0].id, percentageBasisPoints: 10000, priority: 1 },
    ];
  }
  if (bucketList.length === 2) {
    return [
      { bucketId: bucketList[0].id, percentageBasisPoints: 6000, priority: 1 },
      { bucketId: bucketList[1].id, percentageBasisPoints: 4000, priority: 2 },
    ];
  }
  return bucketList.slice(0, 3).map((b, idx) => ({
    bucketId: b.id,
    percentageBasisPoints: idx === 0 ? 4000 : idx === 1 ? 4000 : 2000,
    priority: idx + 1,
  }));
}

export default function PhaseBucketsRulesSection({
  clientConfig,
  buckets,
  setBuckets,
  activeRule,
  setActiveRule,
  allocationHistory = [],
  notify,
}: PhaseBucketsRulesSectionProps) {
  // Bucket creation state
  const [bucketName, setBucketName] = useState("Emergency Vault");
  const [targetNaira, setTargetNaira] = useState<number>(1000000);
  const [loadingCreateBucket, setLoadingCreateBucket] = useState(false);
  const [loadingSeedBuckets, setLoadingSeedBuckets] = useState(false);
  const [loadingListBuckets, setLoadingListBuckets] = useState(false);

  // Rule creation state
  const [minSalaryNaira, setMinSalaryNaira] = useState<number>(50000);
  const [allocationRateBasisPoints, setAllocationRateBasisPoints] =
    useState<number>(3000);
  const [customSplits, setCustomSplits] = useState<RuleSplitInput[] | null>(
    null,
  );
  const [previewSalaryNaira, setPreviewSalaryNaira] = useState<number>(250000);
  const [loadingSubmitRule, setLoadingSubmitRule] = useState(false);
  const [loadingActiveRule, setLoadingActiveRule] = useState(false);

  const splits = useMemo(() => {
    if (customSplits !== null) {
      const validCustom = customSplits.filter((s) =>
        buckets.some((b) => b.id === s.bucketId),
      );
      if (validCustom.length > 0 || buckets.length === 0) {
        return validCustom;
      }
    }
    return buildRecommendedSplits(buckets);
  }, [customSplits, buckets]);

  const setSplits = (
    updater: RuleSplitInput[] | ((prev: RuleSplitInput[]) => RuleSplitInput[]),
  ) => {
    if (typeof updater === "function") {
      setCustomSplits(updater(splits));
    } else {
      setCustomSplits(updater);
    }
  };

  async function handleFetchBuckets(silent = false) {
    setLoadingListBuckets(true);
    try {
      const res = await staxFetch<
        | DestinationBucket[]
        | { buckets?: DestinationBucket[]; data?: DestinationBucket[] }
      >(clientConfig, "GET", "/buckets");
      const list = Array.isArray(res) ? res : res?.buckets || res?.data || [];
      setBuckets(list);
      if (!silent) {
        notify("success", `Loaded ${list.length} destination bucket(s).`);
      }
      return list;
    } catch (err: unknown) {
      if (!silent) {
        notify(
          "error",
          err instanceof Error ? err.message : "Failed to fetch buckets",
        );
      }
      return [];
    } finally {
      setLoadingListBuckets(false);
    }
  }

  async function handleCreateBucket(e: React.FormEvent) {
    e.preventDefault();
    if (!bucketName.trim() || !targetNaira || targetNaira <= 0) {
      notify("error", "Enter a valid bucket name and target amount in Naira.");
      return;
    }
    setLoadingCreateBucket(true);
    try {
      await staxFetch(clientConfig, "POST", "/buckets", {
        name: bucketName.trim(),
        targetNaira: Number(targetNaira),
      });
      notify(
        "success",
        `Created bucket "${bucketName.trim()}" with target ${formatNaira(targetNaira)}!`,
      );
      await handleFetchBuckets(true);
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Failed to create bucket",
      );
    } finally {
      setLoadingCreateBucket(false);
    }
  }

  async function handleSeedRecommendedBuckets() {
    setLoadingSeedBuckets(true);
    try {
      for (const item of STANDARD_BUCKETS) {
        const alreadyExists = buckets.some(
          (b) => b.name.toLowerCase() === item.name.toLowerCase(),
        );
        if (!alreadyExists) {
          await staxFetch(clientConfig, "POST", "/buckets", item);
        }
      }
      const updated = await handleFetchBuckets(true);
      setSplits(buildRecommendedSplits(updated));
      notify(
        "success",
        "Created all 3 recommended buckets (Emergency Vault, Investments, Bills & Utilities) and pre-filled 40/40/20 rule splits!",
      );
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error
          ? err.message
          : "Failed creating recommended buckets",
      );
    } finally {
      setLoadingSeedBuckets(false);
    }
  }

  async function handleFetchActiveRule(silent = false) {
    setLoadingActiveRule(true);
    try {
      const res = await staxFetch<
        AllocationRule | { rule?: AllocationRule; data?: AllocationRule }
      >(clientConfig, "GET", "/rules/active");
      const unwrapped =
        (res as { rule?: AllocationRule })?.rule ||
        (res as { data?: AllocationRule })?.data ||
        (res as AllocationRule);
      if (unwrapped && typeof unwrapped === "object") {
        setActiveRule(unwrapped);
      }
      if (!silent) {
        notify("success", "Fetched currently active allocation rule.");
      }
    } catch (err: unknown) {
      if (!silent) {
        notify(
          "error",
          err instanceof Error ? err.message : "Could not fetch active rule",
        );
      }
    } finally {
      setLoadingActiveRule(false);
    }
  }

  const totalSplitBps = splits.reduce(
    (sum, s) => sum + Number(s.percentageBasisPoints || 0),
    0,
  );

  async function handleSubmitRule(e: React.FormEvent) {
    e.preventDefault();
    if (splits.length === 0) {
      notify("error", "Add at least one destination bucket split first.");
      return;
    }
    if (totalSplitBps !== 10000) {
      notify(
        "error",
        `Bucket split basis points must total exactly 10000 (100% of pool). Current total: ${totalSplitBps} bps.`,
      );
      return;
    }
    setLoadingSubmitRule(true);
    try {
      const payload = {
        minSalaryNaira: Number(minSalaryNaira),
        allocationRateBasisPoints: Number(allocationRateBasisPoints),
        splits: splits.map((s, idx) => ({
          bucketId: s.bucketId,
          percentageBasisPoints: Number(s.percentageBasisPoints),
          priority: Number(s.priority || idx + 1),
        })),
      };
      const res = await staxFetch<AllocationRule>(
        clientConfig,
        "POST",
        "/rules",
        payload,
      );
      if (res && typeof res === "object") {
        setActiveRule(res);
      }
      notify(
        "success",
        "New versioned allocation rule activated! Prior rule versions automatically deactivated.",
      );
      await handleFetchActiveRule(true);
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Failed to submit allocation rule",
      );
    } finally {
      setLoadingSubmitRule(false);
    }
  }

  function updateSplit(index: number, patch: Partial<RuleSplitInput>) {
    setSplits((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  }

  function addBucketToSplits(bucketId: string) {
    if (splits.some((s) => s.bucketId === bucketId)) return;
    const remaining = Math.max(0, 10000 - totalSplitBps);
    setSplits((prev) => [
      ...prev,
      {
        bucketId,
        percentageBasisPoints: remaining,
        priority: prev.length + 1,
      },
    ]);
  }

  function removeSplit(index: number) {
    setSplits((prev) =>
      prev
        .filter((_, idx) => idx !== index)
        .map((s, idx) => ({ ...s, priority: idx + 1 })),
    );
  }

  // Live Salary Split Preview Math
  const poolNaira =
    (Number(previewSalaryNaira || 0) * Number(allocationRateBasisPoints || 0)) /
    10000;
  const retainedNaira = Math.max(
    0,
    Number(previewSalaryNaira || 0) - poolNaira,
  );
  const qualifiesForAllocation =
    Number(previewSalaryNaira || 0) >= Number(minSalaryNaira || 0);

  return (
    <div className="space-y-6">
      {/* Phase Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-400 border border-purple-500/20">
              Phase 4 • Destination Buckets & Versioned Allocation Rules
            </span>
            <h2 className="mt-2 text-xl font-bold text-white">
              Savings Vaults & Basis-Point Salary Split Engine
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Create destination buckets and configure versioned allocation
              rules (<code className="text-purple-300 font-mono">v1 → v2</code>)
              where bucket weights total{" "}
              <code className="text-emerald-300 font-mono">10000</code> basis
              points (100% of the allocation pool).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSeedRecommendedBuckets}
              disabled={loadingSeedBuckets}
              className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {loadingSeedBuckets
                ? "Creating 3 Buckets..."
                : "⚡ 1-Click Create 3 Standard Buckets"}
            </button>
            <button
              type="button"
              onClick={() => {
                handleFetchBuckets(false);
                handleFetchActiveRule(true);
              }}
              disabled={loadingListBuckets}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
            >
              Refresh Buckets & Active Rule
            </button>
          </div>
        </div>
      </div>

      {/* Step 1 & 2: Create Bucket + List Buckets */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Create Bucket Form (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Step 1 • New Destination
              </span>
              <h3 className="text-base font-bold text-white">
                Create Destination Bucket
              </h3>
            </div>
            <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
              POST /v1/buckets
            </code>
          </div>

          <div className="mb-3">
            <span className="block text-xs text-slate-400 mb-1.5">
              Quick Presets from <code className="font-mono">frontend.md</code>:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {STANDARD_BUCKETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setBucketName(preset.name);
                    setTargetNaira(preset.targetNaira);
                  }}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:border-emerald-500/40 hover:text-white transition"
                >
                  {preset.name} ({formatNaira(preset.targetNaira)})
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCreateBucket} noValidate className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Bucket Name (<code className="font-mono">name</code>)
              </label>
              <input
                type="text"
                required
                value={bucketName}
                onChange={(e) => setBucketName(e.target.value)}
                placeholder="Emergency Vault"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">
                  Target Amount in Naira (
                  <code className="font-mono text-emerald-300">
                    targetNaira
                  </code>
                  )
                </label>
                <span className="text-xs font-mono text-slate-400">
                  = {(Number(targetNaira || 0) * 100).toLocaleString()} Kobo
                </span>
              </div>
              <input
                type="number"
                required
                min={1}
                step="any"
                value={targetNaira}
                onChange={(e) => setTargetNaira(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loadingCreateBucket}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {loadingCreateBucket
                ? "Creating Bucket..."
                : "Create Destination Bucket (/v1/buckets)"}
            </button>
          </form>
        </div>

        {/* List Buckets (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                Step 2 • Bucket Directory
              </span>
              <h3 className="text-base font-bold text-white">
                Your Destination Buckets ({buckets.length})
              </h3>
            </div>
            <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
              GET /v1/buckets
            </code>
          </div>

          {buckets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-8 text-center">
              <p className="text-sm text-slate-400">
                No destination buckets found yet. Click{" "}
                <strong className="text-emerald-400">
                  &ldquo;⚡ 1-Click Create 3 Standard Buckets&rdquo;
                </strong>{" "}
                above or create one on the left.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {buckets.map((b, i) => {
                const inSplits = splits.some((s) => s.bucketId === b.id);
                const metrics = computeBucketSavings(b, allocationHistory);
                const remainingNaira = Math.max(
                  0,
                  metrics.targetNaira - metrics.savedNaira,
                );
                return (
                  <div
                    key={b.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                            {i + 1}
                          </span>
                          <h4 className="font-bold text-white text-sm">
                            {b.name}
                          </h4>
                          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            {metrics.progressPercent}% of Goal
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] font-mono text-slate-500">
                          UUID: <span className="text-slate-400">{b.id}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="block text-[10px] uppercase text-slate-500">
                            Saved Balance / Target Goal
                          </span>
                          <div className="text-sm">
                            <span className="font-extrabold text-emerald-400">
                              {formatNaira(metrics.savedNaira)}
                            </span>
                            <span className="text-slate-500 mx-1">/</span>
                            <span className="font-semibold text-slate-300">
                              {resolveAndFormatCurrency(
                                b.targetKobo,
                                b.targetNaira,
                              )}
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {Number(metrics.savedKobo).toLocaleString()} Kobo
                            saved • {metrics.settledTransferCount} transfer(s)
                            {metrics.pendingNaira > 0 && (
                              <span className="ml-1 text-amber-400">
                                (+{formatNaira(metrics.pendingNaira)} pending)
                              </span>
                            )}
                          </div>
                        </div>
                        {!inSplits && (
                          <button
                            type="button"
                            onClick={() => addBucketToSplits(b.id)}
                            className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/20 transition"
                          >
                            + Add to Rule
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                          style={{
                            width: `${Math.max(
                              metrics.savedNaira > 0 ? 2 : 0,
                              metrics.progressPercent,
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                        <span>
                          Saved:{" "}
                          <strong className="text-emerald-400">
                            {formatNaira(metrics.savedNaira)}
                          </strong>
                        </span>
                        <span>
                          Remaining to Goal:{" "}
                          <strong className="text-slate-300">
                            {formatNaira(remainingNaira)}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Step 3 & 4: Submit Versioned Allocation Rule + Salary Split Preview + Active Rule */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Rule Builder (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                Step 3 • Versioned Allocation Rule Builder
              </span>
              <h3 className="text-base font-bold text-white">
                Configure Salary Threshold, Pool Rate & Bucket Splits
              </h3>
            </div>
            <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
              POST /v1/rules
            </code>
          </div>

          <form onSubmit={handleSubmitRule} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Min Salary Threshold (
                    <code className="font-mono text-purple-300">
                      minSalaryNaira
                    </code>
                    )
                  </label>
                  <span className="text-xs text-slate-400">
                    {formatNaira(minSalaryNaira)}
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min={0}
                  step="any"
                  value={minSalaryNaira}
                  onChange={(e) => setMinSalaryNaira(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Allocation Rate (
                    <code className="font-mono text-purple-300">
                      allocationRateBasisPoints
                    </code>
                    )
                  </label>
                  <span className="text-xs font-bold text-emerald-400">
                    {bpsToPercent(allocationRateBasisPoints)}% (
                    {allocationRateBasisPoints} bps)
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min={1}
                  max={10000}
                  step={1}
                  value={allocationRateBasisPoints}
                  onChange={(e) =>
                    setAllocationRateBasisPoints(Number(e.target.value))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
                />
                <input
                  type="range"
                  min={100}
                  max={10000}
                  step={100}
                  value={allocationRateBasisPoints}
                  onChange={(e) =>
                    setAllocationRateBasisPoints(Number(e.target.value))
                  }
                  className="mt-2 w-full accent-purple-500"
                />
              </div>
            </div>

            {/* Splits Section */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <span className="text-xs font-semibold text-white">
                    Bucket Splits (must total 10,000 bps = 100% of Pool)
                  </span>
                  <div className="text-[11px] text-slate-400">
                    Current sum:{" "}
                    <span
                      className={`font-mono font-bold ${
                        totalSplitBps === 10000
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {totalSplitBps} / 10000 bps ({bpsToPercent(totalSplitBps)}
                      %)
                    </span>
                  </div>
                </div>
                {buckets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSplits(buildRecommendedSplits(buckets))}
                    className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-300 hover:bg-purple-500/20 transition"
                  >
                    Auto-Fill 40/40/20 Split
                  </button>
                )}
              </div>

              {splits.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  Create destination buckets first to configure rule splits.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {splits.map((split, idx) => {
                    const bucket = buckets.find((b) => b.id === split.bucketId);
                    return (
                      <div
                        key={`${split.bucketId}-${idx}`}
                        className="grid gap-2 sm:grid-cols-12 items-center rounded-lg border border-slate-800 bg-slate-900 p-2.5"
                      >
                        <div className="sm:col-span-5">
                          <label className="block text-[10px] uppercase text-slate-500">
                            Destination Bucket
                          </label>
                          <select
                            value={split.bucketId}
                            onChange={(e) =>
                              updateSplit(idx, { bucketId: e.target.value })
                            }
                            className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-white"
                          >
                            {buckets.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} ({b.id.slice(0, 8)}...)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[10px] uppercase text-slate-500">
                            Basis Points (
                            {bpsToPercent(split.percentageBasisPoints)}% of
                            pool)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            step={1}
                            value={split.percentageBasisPoints}
                            onChange={(e) =>
                              updateSplit(idx, {
                                percentageBasisPoints: Number(e.target.value),
                              })
                            }
                            className="w-full rounded bg-slate-950 border border-slate-700 px-2.5 py-1.5 font-mono text-xs text-white"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[10px] uppercase text-slate-500">
                            Priority
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={split.priority}
                            onChange={(e) =>
                              updateSplit(idx, {
                                priority: Number(e.target.value),
                              })
                            }
                            className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1.5 font-mono text-xs text-white"
                          />
                        </div>

                        <div className="sm:col-span-1 flex justify-end pt-3">
                          <button
                            type="button"
                            onClick={() => removeSplit(idx)}
                            title={`Remove ${bucket?.name || "split"}`}
                            className="rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/20"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loadingSubmitRule || totalSplitBps !== 10000}
              className="w-full rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40 transition"
            >
              {loadingSubmitRule
                ? "Submitting Versioned Rule..."
                : "Submit & Activate Allocation Rule (/v1/rules)"}
            </button>
          </form>
        </div>

        {/* Right: Interactive Salary Split Calculator & Active Rule Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Interactive Salary Split Preview */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Interactive Kobo/Naira Preview
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">
              Salary Allocation Math Simulator
            </h3>

            <div className="mt-3">
              <label className="block text-xs text-slate-400 mb-1">
                Sample Incoming Salary Credit (Naira)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={previewSalaryNaira}
                onChange={(e) => setPreviewSalaryNaira(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white font-mono"
              />
            </div>

            {!qualifiesForAllocation ? (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                Salary ({formatNaira(previewSalaryNaira)}) is below{" "}
                <code className="font-mono">minSalaryNaira</code> (
                {formatNaira(minSalaryNaira)}) — automated allocation will not
                trigger.
              </div>
            ) : (
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-3 border border-slate-800">
                  <div>
                    <span className="block text-[10px] uppercase text-slate-500">
                      Allocation Pool ({bpsToPercent(allocationRateBasisPoints)}
                      %)
                    </span>
                    <span className="text-sm font-bold text-emerald-400">
                      {formatNaira(poolNaira)}
                    </span>
                    <span className="block font-mono text-[10px] text-slate-500">
                      {Math.round(poolNaira * 100).toLocaleString()} Kobo
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-slate-500">
                      Stays in Source Account
                    </span>
                    <span className="text-sm font-bold text-slate-200">
                      {formatNaira(retainedNaira)}
                    </span>
                    <span className="block font-mono text-[10px] text-slate-500">
                      {Math.round(retainedNaira * 100).toLocaleString()} Kobo
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {splits.map((s, idx) => {
                    const bName =
                      buckets.find((b) => b.id === s.bucketId)?.name ||
                      `Bucket #${idx + 1}`;
                    const splitAmount =
                      (poolNaira * Number(s.percentageBasisPoints || 0)) /
                      10000;
                    return (
                      <div
                        key={`${s.bucketId}-${idx}`}
                        className="flex items-center justify-between rounded-lg bg-slate-950/70 px-3 py-2 border border-slate-800/80"
                      >
                        <div>
                          <span className="font-medium text-slate-200">
                            {bName}
                          </span>
                          <span className="ml-2 text-[11px] text-slate-500">
                            ({bpsToPercent(s.percentageBasisPoints)}% of pool •
                            P{s.priority})
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-emerald-300">
                          {formatNaira(splitAmount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Step 4: Active Rule Inspector */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                  Step 4 • Active Rule
                </span>
                <h3 className="text-base font-bold text-white">
                  Currently Active Rule
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleFetchActiveRule(false)}
                disabled={loadingActiveRule}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-mono text-slate-300 hover:bg-slate-700"
              >
                {loadingActiveRule ? "..." : "GET /v1/rules/active"}
              </button>
            </div>

            {!activeRule ? (
              <p className="text-xs text-slate-400">
                No active rule loaded yet. Submit a rule on the left or click{" "}
                <code className="font-mono text-slate-300">
                  GET /v1/rules/active
                </code>
                .
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between rounded-xl bg-slate-950 p-3 border border-slate-800">
                  <div>
                    <span className="text-slate-400">Rule Version:</span>{" "}
                    <span className="ml-1 rounded bg-purple-500/20 px-2 py-0.5 font-mono font-bold text-purple-300">
                      v{activeRule.version ?? 1}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Pool Rate:</span>{" "}
                    <span className="font-bold text-emerald-400">
                      {bpsToPercent(activeRule.allocationRateBasisPoints)}% (
                      {activeRule.allocationRateBasisPoints} bps)
                    </span>
                  </div>
                </div>
                <pre className="max-h-48 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-slate-300">
                  {JSON.stringify(activeRule, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
