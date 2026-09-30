"use client";

import React, { useState } from "react";
import { KycStatusResponse, StaxClientConfig, staxFetch } from "@/lib/stax-api";

interface PhaseKycSectionProps {
  clientConfig: StaxClientConfig;
  kycStatus: KycStatusResponse | null;
  setKycStatus: (status: KycStatusResponse | null) => void;
  notify: (type: "success" | "error" | "info", message: string) => void;
}

export default function PhaseKycSection({
  clientConfig,
  kycStatus,
  setKycStatus,
  notify,
}: PhaseKycSectionProps) {
  const [bvn, setBvn] = useState("22123456789");
  const [nin, setNin] = useState("22123456789");
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingBvn, setLoadingBvn] = useState(false);
  const [loadingNin, setLoadingNin] = useState(false);

  async function handleCheckStatus() {
    setLoadingStatus(true);
    try {
      const res = await staxFetch<KycStatusResponse>(
        clientConfig,
        "GET",
        "/kyc/status",
      );
      if (res && typeof res === "object") {
        setKycStatus(res);
      }
      notify(
        "success",
        `KYC Status fetched: Tier=${res?.tier || "TIER_0"}, Status=${res?.status || "UNVERIFIED"}`,
      );
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Failed to fetch KYC status",
      );
    } finally {
      setLoadingStatus(false);
    }
  }

  async function handleSubmitBvn(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{11}$/.test(bvn.trim())) {
      notify("error", "BVN must be an 11-digit numeric string.");
      return;
    }
    setLoadingBvn(true);
    try {
      const res = await staxFetch<Record<string, unknown>>(
        clientConfig,
        "POST",
        "/kyc/bvn",
        { bvn: bvn.trim() },
      );
      notify(
        "success",
        (res?.message as string) ||
          "BVN submitted! HMAC-SHA256 deduplication hash computed and status upgraded.",
      );
      await handleCheckStatus();
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Failed to submit BVN",
      );
    } finally {
      setLoadingBvn(false);
    }
  }

  async function handleSubmitNin(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{11}$/.test(nin.trim())) {
      notify("error", "NIN must be an 11-digit numeric string.");
      return;
    }
    setLoadingNin(true);
    try {
      const res = await staxFetch<Record<string, unknown>>(
        clientConfig,
        "POST",
        "/kyc/nin",
        { nin: nin.trim() },
      );
      notify(
        "success",
        (res?.message as string) || "NIN submitted for identity verification!",
      );
      await handleCheckStatus();
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Failed to submit NIN",
      );
    } finally {
      setLoadingNin(false);
    }
  }

  const tierBadgeColor =
    kycStatus?.status === "VERIFIED" || kycStatus?.status === "APPROVED"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
      : kycStatus?.status === "PENDING"
        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
        : "bg-slate-800 text-slate-300 border-slate-700";

  return (
    <div className="space-y-6">
      {/* Phase Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-400 border border-sky-500/20">
              Phase 2 • KYC Identity Verification
            </span>
            <h2 className="mt-2 text-xl font-bold text-white">
              BVN & NIN Regulatory Verification
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Submit 11-digit Bank Verification Number (BVN) and National
              Identification Number (NIN). The backend computes an HMAC-SHA256
              hash for deduplication and upgrades KYC status.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCheckStatus}
            disabled={loadingStatus}
            className="rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 transition"
          >
            {loadingStatus
              ? "Checking Status..."
              : "Refresh KYC Status (GET /v1/kyc/status)"}
          </button>
        </div>
      </div>

      {/* Live KYC Status Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 font-bold text-sm">
              KYC
            </div>
            <div>
              <div className="text-xs font-medium text-slate-400">
                Current Identity Tier & Verification State
              </div>
              <div className="mt-1 flex items-center gap-3">
                <span className="text-lg font-bold text-white">
                  {kycStatus?.tier || "TIER_0"}
                </span>
                <span
                  className={`rounded-full border px-3 py-0.5 text-xs font-bold ${tierBadgeColor}`}
                >
                  {kycStatus?.status || "UNVERIFIED"}
                </span>
              </div>
            </div>
          </div>
          <code className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-300 font-mono">
            GET /v1/kyc/status
          </code>
        </div>

        {kycStatus && (
          <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300 font-mono">
            {JSON.stringify(kycStatus, null, 2)}
          </pre>
        )}
      </div>

      {/* BVN & NIN Forms */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Submit BVN */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Step 2 • Bank Verification Number
              </span>
              <h3 className="text-base font-bold text-white">Submit BVN</h3>
            </div>
            <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
              POST /v1/kyc/bvn
            </code>
          </div>

          <p className="text-xs text-slate-400 mb-4">
            Computes HMAC-SHA256 hash for deduplication and upgrades KYC status
            to <code className="text-amber-300 font-mono">PENDING</code>{" "}
            verification.
          </p>

          <form onSubmit={handleSubmitBvn} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">
                  11-Digit BVN
                </label>
                <button
                  type="button"
                  onClick={() => setBvn("22123456789")}
                  className="text-[11px] text-emerald-400 hover:underline"
                >
                  Use Sample (22123456789)
                </button>
              </div>
              <input
                type="text"
                required
                maxLength={11}
                value={bvn}
                onChange={(e) => setBvn(e.target.value.replace(/\D/g, ""))}
                placeholder="22123456789"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm tracking-widest text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loadingBvn}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {loadingBvn ? "Submitting BVN..." : "Submit BVN (/v1/kyc/bvn)"}
            </button>
          </form>
        </div>

        {/* Submit NIN */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                Step 3 • National Identity Number
              </span>
              <h3 className="text-base font-bold text-white">Submit NIN</h3>
            </div>
            <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
              POST /v1/kyc/nin
            </code>
          </div>

          <p className="text-xs text-slate-400 mb-4">
            Submits the user&apos;s 11-digit National Identification Number
            (NIN) for NIMC identity verification.
          </p>

          <form onSubmit={handleSubmitNin} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">
                  11-Digit NIN
                </label>
                <button
                  type="button"
                  onClick={() => setNin("22123456789")}
                  className="text-[11px] text-indigo-400 hover:underline"
                >
                  Use Sample (22123456789)
                </button>
              </div>
              <input
                type="text"
                required
                maxLength={11}
                value={nin}
                onChange={(e) => setNin(e.target.value.replace(/\D/g, ""))}
                placeholder="22123456789"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm tracking-widest text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loadingNin}
              className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition"
            >
              {loadingNin ? "Submitting NIN..." : "Submit NIN (/v1/kyc/nin)"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
