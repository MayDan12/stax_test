"use client";

import React, { useState } from "react";
import { BankConnection, StaxClientConfig, staxFetch } from "@/lib/stax-api";
import { formatNaira, resolveAndFormatCurrency } from "@/lib/kobo";

interface PhaseBankSectionProps {
  clientConfig: StaxClientConfig;
  accounts: BankConnection[];
  setAccounts: (accounts: BankConnection[]) => void;
  notify: (type: "success" | "error" | "info", message: string) => void;
  onSelectProviderAccountForWebhook: (providerAccountId: string) => void;
}

const MOCK_BANK_CODES = [
  { label: "GTBank Mock", code: "code_mock_gtbank_123" },
  { label: "Zenith Mock", code: "code_mock_zenith_456" },
  { label: "Access Mock", code: "code_mock_access_789" },
  { label: "Quick Mock", code: "mock_code" },
];

const MANDATE_PRESETS = [250000, 500000, 1000000, 2500000];

export default function PhaseBankSection({
  clientConfig,
  accounts,
  setAccounts,
  notify,
  onSelectProviderAccountForWebhook,
}: PhaseBankSectionProps) {
  const [authCode, setAuthCode] = useState("code_mock_gtbank_123");
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [mandateLimitNaira, setMandateLimitNaira] = useState<number>(500000);
  const [loadingLink, setLoadingLink] = useState(false);
  const [loadingMandate, setLoadingMandate] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  const effectiveConnectionId = selectedConnectionId || accounts[0]?.id || "";

  async function handleFetchAccounts(silent = false) {
    setLoadingList(true);
    try {
      const res = await staxFetch<
        | BankConnection[]
        | { accounts?: BankConnection[]; data?: BankConnection[] }
      >(clientConfig, "GET", "/accounts");
      const list = Array.isArray(res) ? res : res?.accounts || res?.data || [];
      setAccounts(list);
      if (list.length > 0 && !selectedConnectionId) {
        setSelectedConnectionId(list[0].id);
      }
      if (!silent) {
        notify("success", `Loaded ${list.length} connected bank account(s).`);
      }
    } catch (err: unknown) {
      if (!silent) {
        notify(
          "error",
          err instanceof Error ? err.message : "Failed to list bank accounts",
        );
      }
    } finally {
      setLoadingList(false);
    }
  }

  async function handleLinkAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!authCode.trim()) {
      notify("error", "Authorization code is required.");
      return;
    }
    setLoadingLink(true);
    try {
      const res = await staxFetch<{
        message?: string;
        bankConnection?: BankConnection;
        id?: string;
      }>(clientConfig, "POST", "/accounts/link", {
        code: authCode.trim(),
      });

      const conn =
        res?.bankConnection ||
        (res?.id ? (res as unknown as BankConnection) : undefined);

      if (conn) {
        setSelectedConnectionId(conn.id);
        const exists = accounts.some((a) => a.id === conn.id);
        if (!exists) {
          setAccounts([conn, ...accounts]);
        }
      }
      notify(
        "success",
        res?.message ||
          `Linked bank account (${conn?.bankName || authCode})! Now authorize a Direct Debit mandate ceiling.`,
      );
      await handleFetchAccounts(true);
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Failed to link bank account",
      );
    } finally {
      setLoadingLink(false);
    }
  }

  async function handleAuthorizeMandate(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveConnectionId.trim()) {
      notify("error", "Select or enter a Bank Connection ID first.");
      return;
    }
    if (!mandateLimitNaira || mandateLimitNaira <= 0) {
      notify("error", "Enter a positive Mandate Limit in Naira.");
      return;
    }
    setLoadingMandate(true);
    try {
      await staxFetch(
        clientConfig,
        "POST",
        `/accounts/${effectiveConnectionId.trim()}/mandate`,
        {
          mandateLimitNaira: Number(mandateLimitNaira),
        },
      );
      notify(
        "success",
        `Direct Debit Mandate ceiling set to ${formatNaira(mandateLimitNaira)} (${Number(mandateLimitNaira) * 100} Kobo) — status is now ACTIVE!`,
      );
      await handleFetchAccounts(true);
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Failed to authorize mandate",
      );
    } finally {
      setLoadingMandate(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Phase Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 border border-amber-500/20">
              Phase 3 • Bank Account Linking & Direct Debit Mandate
            </span>
            <h2 className="mt-2 text-xl font-bold text-white">
              Open Banking Connection & Direct Debit Ceiling
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Link a source salary bank account via authorization code and
              authorize a Direct Debit Mandate ceiling in Naira (stored in Kobo
              as a Prisma{" "}
              <code className="text-amber-300 font-mono">BigInt</code> string).
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleFetchAccounts(false)}
            disabled={loadingList}
            className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition"
          >
            {loadingList ? "Loading..." : "Refresh Accounts (GET /v1/accounts)"}
          </button>
        </div>
      </div>

      {/* Forms Grid: Link Account + Mandate Ceiling */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Step 1: Link Bank Account */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Step 1 • Connect Bank
              </span>
              <h3 className="text-base font-bold text-white">
                Link Bank Account
              </h3>
            </div>
            <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
              POST /v1/accounts/link
            </code>
          </div>

          <div className="mb-3">
            <span className="block text-xs text-slate-400 mb-1.5">
              Quick Mock Authorization Codes:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MOCK_BANK_CODES.map((preset) => (
                <button
                  key={preset.code}
                  type="button"
                  onClick={() => setAuthCode(preset.code)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-mono transition ${
                    authCode === preset.code
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                      : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                  }`}
                >
                  {preset.label}: {preset.code}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleLinkAccount} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Provider Authorization Code (
                <code className="font-mono">code</code>)
              </label>
              <input
                type="text"
                required
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="code_mock_gtbank_123"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loadingLink}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {loadingLink
                ? "Linking Bank Account..."
                : "Link Bank Account (/v1/accounts/link)"}
            </button>
          </form>
        </div>

        {/* Step 2: Authorize Direct Debit Mandate Ceiling */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                Step 2 • Direct Debit Mandate
              </span>
              <h3 className="text-base font-bold text-white">
                Authorize Mandate Ceiling
              </h3>
            </div>
            <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
              POST /v1/accounts/:id/mandate
            </code>
          </div>

          <form onSubmit={handleAuthorizeMandate} noValidate className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Target Bank Connection (<code className="font-mono">id</code>)
              </label>
              {accounts.length > 0 ? (
                <select
                  value={effectiveConnectionId}
                  onChange={(e) => setSelectedConnectionId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.bankName} ({acc.accountNumberMasked}) —{" "}
                      {acc.id.slice(0, 12)}...
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  required
                  value={selectedConnectionId}
                  onChange={(e) => setSelectedConnectionId(e.target.value)}
                  placeholder="conn_uuid_here (Link an account in Step 1 first)"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">
                  Mandate Ceiling in Naira (
                  <code className="font-mono text-amber-300">
                    mandateLimitNaira
                  </code>
                  )
                </label>
                <span className="text-xs font-mono text-slate-400">
                  = {(Number(mandateLimitNaira || 0) * 100).toLocaleString()}{" "}
                  Kobo
                </span>
              </div>
              <input
                type="number"
                required
                min={1}
                step="any"
                value={mandateLimitNaira}
                onChange={(e) => setMandateLimitNaira(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MANDATE_PRESETS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMandateLimitNaira(val)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      mandateLimitNaira === val
                        ? "border-amber-500 bg-amber-500/20 text-amber-300"
                        : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                    }`}
                  >
                    {formatNaira(val)}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingMandate}
              className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition"
            >
              {loadingMandate
                ? "Authorizing Mandate..."
                : `Authorize ${formatNaira(mandateLimitNaira)} Direct Debit Mandate`}
            </button>
          </form>
        </div>
      </div>

      {/* Step 3: Connected Bank Accounts List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
              Step 3 • Connected Bank Accounts
            </span>
            <h3 className="text-base font-bold text-white">
              Linked Accounts & Active Mandate Limits ({accounts.length})
            </h3>
          </div>
          <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
            GET /v1/accounts
          </code>
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-8 text-center">
            <p className="text-sm text-slate-400">
              No linked bank accounts loaded yet. Link a mock account in Step 1
              or click &ldquo;Refresh Accounts&rdquo;.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.map((acc) => {
              const isActive = acc.mandateStatus === "ACTIVE";
              return (
                <div
                  key={acc.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/90 p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white text-sm">
                          {acc.bankName || "Connected Bank"}
                        </h4>
                        <p className="text-xs font-mono text-slate-400 mt-0.5">
                          Account: {acc.accountNumberMasked || "******4321"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                          isActive
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        }`}
                      >
                        Mandate: {acc.mandateStatus || "PENDING"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-900/90 p-2.5 text-xs border border-slate-800/80">
                      <div>
                        <span className="block text-[10px] uppercase text-slate-500">
                          Mandate Limit (Naira)
                        </span>
                        <span className="font-bold text-emerald-400 text-sm">
                          {resolveAndFormatCurrency(
                            acc.mandateLimitKobo,
                            acc.mandateLimitNaira,
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase text-slate-500">
                          Raw Kobo BigInt
                        </span>
                        <span className="font-mono text-slate-300">
                          {String(acc.mandateLimitKobo ?? "0")} Kobo
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-[11px] font-mono text-slate-400">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Connection ID:</span>
                        <span className="text-slate-300">{acc.id}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">
                          providerAccountId:
                        </span>
                        <span className="text-amber-300">
                          {acc.providerAccountId}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedConnectionId(acc.id);
                        notify(
                          "info",
                          `Selected ${acc.bankName} (${acc.id}) for mandate update.`,
                        );
                      }}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
                    >
                      Select for Mandate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProviderAccountForWebhook(
                          acc.providerAccountId,
                        );
                      }}
                      className="rounded-lg bg-indigo-500/15 border border-indigo-500/30 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/25 transition"
                    >
                      Simulate Salary Credit →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
