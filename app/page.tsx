"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AllocationPlan,
  AllocationRule,
  ApiLogEntry,
  BankConnection,
  DestinationBucket,
  KycStatusResponse,
  StaxClientConfig,
  UserProfile,
  staxFetch,
} from "@/lib/stax-api";
import {
  bpsToPercent,
  computeBucketSavings,
  formatNaira,
  resolveAndFormatCurrency,
} from "@/lib/kobo";
import PhaseAuthSection from "@/components/PhaseAuthSection";
import PhaseKycSection from "@/components/PhaseKycSection";
import PhaseBankSection from "@/components/PhaseBankSection";
import PhaseBucketsRulesSection from "@/components/PhaseBucketsRulesSection";
import PhaseWebhookAllocationsSection from "@/components/PhaseWebhookAllocationsSection";
import ApiConsoleDrawer from "@/components/ApiConsoleDrawer";

type ActiveTab = "phase1" | "phase2" | "phase3" | "phase4" | "phase5" | "all";

interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

const STORAGE_KEYS = {
  ACCESS_TOKEN: "stax_access_token",
  REFRESH_TOKEN: "stax_refresh_token",
  BASE_URL: "stax_base_url",
  USE_PROXY: "stax_use_proxy",
};

// ydxcytuvhuytygh

export default function StaxMiniAppPage() {
  // Connection & Session State
  const [baseUrl, setBaseUrl] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_KEYS.BASE_URL) ||
        "http://localhost:8000/v1"
      : "http://localhost:8000/v1",
  );
  const [useProxy, setUseProxy] = useState(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem(STORAGE_KEYS.USE_PROXY) ?? "true") === "true"
      : true,
  );
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
      : null,
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)
      : null,
  );
  const [showSettings, setShowSettings] = useState(false);

  // Navigation & Console State
  const [activeTab, setActiveTab] = useState<ActiveTab>("phase1");
  const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Domain Data State across Phases 1-5
  const [user, setUser] = useState<UserProfile | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatusResponse | null>(null);
  const [accounts, setAccounts] = useState<BankConnection[]>([]);
  const [buckets, setBuckets] = useState<DestinationBucket[]>([]);
  const [activeRule, setActiveRule] = useState<AllocationRule | null>(null);
  const [allocationHistory, setAllocationHistory] = useState<AllocationPlan[]>(
    [],
  );
  const [selectedProviderAccountId, setSelectedProviderAccountId] =
    useState("");

  const notify = useCallback(
    (type: "success" | "error" | "info", message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [{ id, type, message }, ...prev.slice(0, 3)]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5500);
    },
    [],
  );

  const handleLog = useCallback((entry: ApiLogEntry) => {
    setApiLogs((prev) => [entry, ...prev.slice(0, 49)]);
  }, []);

  const handleTokensReceived = useCallback(
    (newAccess: string, newRefresh?: string) => {
      setAccessToken(newAccess);
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, newAccess);
      if (newRefresh) {
        setRefreshToken(newRefresh);
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefresh);
      }
    },
    [],
  );

  const handleClearSession = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setKycStatus(null);
    setAccounts([]);
    setBuckets([]);
    setActiveRule(null);
    setAllocationHistory([]);
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    notify("info", "Session cleared and tokens removed.");
  }, [notify]);

  const clientConfig: StaxClientConfig = useMemo(
    () => ({
      baseUrl,
      useProxy,
      accessToken,
      refreshToken,
      onLog: handleLog,
      onTokensUpdated: handleTokensReceived,
    }),
    [
      baseUrl,
      useProxy,
      accessToken,
      refreshToken,
      handleLog,
      handleTokensReceived,
    ],
  );

  const syncAllAuthenticatedData = useCallback(async () => {
    if (!clientConfig.accessToken) return;
    await Promise.allSettled([
      staxFetch<UserProfile>(clientConfig, "GET", "/users/me").then((res) => {
        const unwrapped =
          (res as { user?: UserProfile })?.user ||
          (res as { data?: UserProfile })?.data ||
          res;
        if (unwrapped && typeof unwrapped === "object") setUser(unwrapped);
      }),
      staxFetch<KycStatusResponse>(clientConfig, "GET", "/kyc/status").then(
        (res) => {
          if (res && typeof res === "object") setKycStatus(res);
        },
      ),
      staxFetch<
        | BankConnection[]
        | { accounts?: BankConnection[]; data?: BankConnection[] }
      >(clientConfig, "GET", "/accounts").then((res) => {
        const list = Array.isArray(res)
          ? res
          : res?.accounts || res?.data || [];
        setAccounts(list);
      }),
      staxFetch<
        | DestinationBucket[]
        | { buckets?: DestinationBucket[]; data?: DestinationBucket[] }
      >(clientConfig, "GET", "/buckets").then((res) => {
        const list = Array.isArray(res) ? res : res?.buckets || res?.data || [];
        setBuckets(list);
      }),
      staxFetch<
        AllocationRule | { rule?: AllocationRule; data?: AllocationRule }
      >(clientConfig, "GET", "/rules/active").then((res) => {
        const unwrapped =
          (res as { rule?: AllocationRule })?.rule ||
          (res as { data?: AllocationRule })?.data ||
          (res as AllocationRule);
        if (unwrapped && typeof unwrapped === "object")
          setActiveRule(unwrapped);
      }),
      staxFetch<
        | AllocationPlan[]
        | {
            history?: AllocationPlan[];
            plans?: AllocationPlan[];
            data?: AllocationPlan[];
          }
      >(clientConfig, "GET", "/allocations/history").then((res) => {
        const list = Array.isArray(res)
          ? res
          : res?.history || res?.plans || res?.data || [];
        setAllocationHistory(list);
      }),
    ]);
  }, [clientConfig]);

  // Automatically sync user state when accessToken becomes available
  useEffect(() => {
    if (accessToken) {
      syncAllAuthenticatedData();
    }
  }, [accessToken, syncAllAuthenticatedData]);

  const phases = [
    {
      id: "phase1" as const,
      step: "1",
      title: "Auth & Profile",
      subtitle: "Signup, OTP & JWT",
      done: Boolean(accessToken),
    },
    {
      id: "phase2" as const,
      step: "2",
      title: "KYC Identity",
      subtitle: "BVN & NIN Status",
      done: Boolean(
        kycStatus && kycStatus.status && kycStatus.status !== "UNVERIFIED",
      ),
    },
    {
      id: "phase3" as const,
      step: "3",
      title: "Bank & Mandate",
      subtitle: "Link & Debit Limit",
      done: accounts.some((a) => a.mandateStatus === "ACTIVE"),
    },
    {
      id: "phase4" as const,
      step: "4",
      title: "Buckets & Rules",
      subtitle: "Vaults & Split bps",
      done: buckets.length > 0 && Boolean(activeRule),
    },
    {
      id: "phase5" as const,
      step: "5",
      title: "Salary Webhook",
      subtitle: "Simulate & History",
      done: allocationHistory.length > 0,
    },
  ];

  const activeMandateAccount = accounts.find(
    (a) => a.mandateStatus === "ACTIVE",
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 pb-20">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 font-black text-slate-950 text-lg shadow-lg shadow-emerald-500/20">
              S
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white">
                  STAX MONEY
                </h1>
                <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  Core v1 Client
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Automated Salary Split & Direct Debit Allocation Engine
              </p>
            </div>
          </div>

          {/* Right Controls: Session Status, Backend Settings, API Console */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Session Indicator */}
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs ${
                accessToken
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-800 bg-slate-900 text-slate-400"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  accessToken ? "bg-emerald-400" : "bg-slate-600"
                }`}
              />
              <span className="font-medium">
                {user?.nickname || user?.email
                  ? `${user.nickname || user.email} (${user.accountStatus || "AUTH"})`
                  : accessToken
                    ? "JWT Authenticated"
                    : "Not Authenticated"}
              </span>
            </div>

            {/* API Settings Button */}
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition"
            >
              ⚙️ Backend:{" "}
              <code className="font-mono text-emerald-300">{baseUrl}</code>
            </button>

            {/* Live API Console Toggle */}
            <button
              type="button"
              onClick={() => setIsConsoleOpen((v) => !v)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                isConsoleOpen
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
              }`}
            >
              📡 API Console ({apiLogs.length})
            </button>
          </div>
        </div>

        {/* Collapsible Backend Connection Settings */}
        {showSettings && (
          <div className="border-t border-slate-800 bg-slate-900/95 px-4 py-3">
            <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <label className="text-xs font-semibold text-slate-300">
                  Stax Backend Base URL:
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value);
                    localStorage.setItem(STORAGE_KEYS.BASE_URL, e.target.value);
                  }}
                  placeholder="http://localhost:8000/v1"
                  className="w-72 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setBaseUrl("http://localhost:8000/v1");
                    localStorage.setItem(
                      STORAGE_KEYS.BASE_URL,
                      "http://localhost:8000/v1",
                    );
                  }}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                >
                  Reset to :8000/v1
                </button>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useProxy}
                  onChange={(e) => {
                    setUseProxy(e.target.checked);
                    localStorage.setItem(
                      STORAGE_KEYS.USE_PROXY,
                      String(e.target.checked),
                    );
                  }}
                  className="rounded accent-emerald-500"
                />
                <span>
                  Route through Next.js API Proxy (prevents browser CORS errors)
                </span>
              </label>
            </div>
          </div>
        )}
      </header>

      {/* Floating Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed right-4 top-20 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start justify-between gap-3 rounded-xl border p-3.5 shadow-xl backdrop-blur-md text-xs font-medium ${
                t.type === "success"
                  ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
                  : t.type === "error"
                    ? "border-rose-500/40 bg-rose-950/90 text-rose-200"
                    : "border-sky-500/40 bg-sky-950/90 text-sky-200"
              }`}
            >
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() =>
                  setToasts((prev) => prev.filter((item) => item.id !== t.id))
                }
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 space-y-6">
        {/* Live State Summary Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 p-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              1. User Account
            </span>
            <div className="mt-1 text-sm font-bold text-white truncate">
              {user?.firstName
                ? `${user.firstName} ${user.lastName || ""}`
                : user?.nickname || user?.email || "Unregistered"}
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-emerald-400">
              Status:{" "}
              {user?.accountStatus || (accessToken ? "PENDING" : "GUEST")}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 p-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              2. KYC Identity
            </span>
            <div className="mt-1 text-sm font-bold text-white">
              {kycStatus?.tier || "TIER_0"}
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-sky-400">
              {kycStatus?.status || "UNVERIFIED"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 p-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              3. Direct Debit Mandate
            </span>
            <div className="mt-1 text-sm font-bold text-white">
              {activeMandateAccount
                ? resolveAndFormatCurrency(
                    activeMandateAccount.mandateLimitKobo,
                    activeMandateAccount.mandateLimitNaira,
                  )
                : accounts.length > 0
                  ? "Pending Mandate"
                  : "0 Linked Banks"}
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-amber-400">
              {accounts.length} Bank(s) •{" "}
              {activeMandateAccount ? "ACTIVE" : "PENDING"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 p-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              4. Buckets & Saved Total
            </span>
            <div className="mt-1 text-sm font-bold text-white">
              {formatNaira(
                buckets.reduce(
                  (sum, b) =>
                    sum + computeBucketSavings(b, allocationHistory).savedNaira,
                  0,
                ),
              )}{" "}
              <span className="text-xs font-normal text-slate-400">
                ({buckets.length} Vaults)
              </span>
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-purple-400">
              {activeRule
                ? `v${activeRule.version ?? 1} • ${bpsToPercent(
                    activeRule.allocationRateBasisPoints,
                  )}% Pool`
                : "No Active Rule"}
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-800/90 bg-slate-900/50 p-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              5. Executed Plans
            </span>
            <div className="mt-1 text-sm font-bold text-white">
              {allocationHistory.length} Plan(s)
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-rose-400">
              Latest: {allocationHistory[0]?.status || "None"}
            </div>
          </div>
        </div>

        {/* 5-Phase Interactive Stepper Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-2">
          <div className="flex flex-wrap items-center gap-1.5 flex-1">
            {phases.map((p) => {
              const isCurrent = activeTab === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveTab(p.id)}
                  className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-left transition flex-1 min-w-[145px] ${
                    isCurrent
                      ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10"
                      : "bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 hover:text-white"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isCurrent
                        ? "bg-slate-950 text-emerald-400"
                        : p.done
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {p.done ? "✓" : p.step}
                  </span>
                  <div className="truncate">
                    <div className="text-xs font-bold leading-tight">
                      {p.title}
                    </div>
                    <div
                      className={`text-[10px] truncate ${
                        isCurrent
                          ? "text-slate-800 font-medium"
                          : "text-slate-500"
                      }`}
                    >
                      {p.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() =>
              setActiveTab((prev) => (prev === "all" ? "phase1" : "all"))
            }
            className={`rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${
              activeTab === "all"
                ? "bg-indigo-600 text-white"
                : "border border-slate-700 bg-slate-950 text-slate-300 hover:text-white"
            }`}
          >
            {activeTab === "all" ? "Tabbed View" : "View All 5 Phases"}
          </button>
        </div>

        {/* Phase Sections */}
        {(activeTab === "phase1" || activeTab === "all") && (
          <PhaseAuthSection
            clientConfig={clientConfig}
            user={user}
            setUser={setUser}
            onTokensReceived={handleTokensReceived}
            onClearSession={handleClearSession}
            notify={notify}
            onRefreshAllData={syncAllAuthenticatedData}
          />
        )}

        {(activeTab === "phase2" || activeTab === "all") && (
          <PhaseKycSection
            clientConfig={clientConfig}
            kycStatus={kycStatus}
            setKycStatus={setKycStatus}
            notify={notify}
          />
        )}

        {(activeTab === "phase3" || activeTab === "all") && (
          <PhaseBankSection
            clientConfig={clientConfig}
            accounts={accounts}
            setAccounts={setAccounts}
            notify={notify}
            onSelectProviderAccountForWebhook={(providerAccountId) => {
              setSelectedProviderAccountId(providerAccountId);
              if (activeTab !== "all") {
                setActiveTab("phase5");
              }
              notify(
                "info",
                `Selected ${providerAccountId} for salary credit webhook simulation.`,
              );
            }}
          />
        )}

        {(activeTab === "phase4" || activeTab === "all") && (
          <PhaseBucketsRulesSection
            clientConfig={clientConfig}
            buckets={buckets}
            setBuckets={setBuckets}
            activeRule={activeRule}
            setActiveRule={setActiveRule}
            allocationHistory={allocationHistory}
            notify={notify}
          />
        )}

        {(activeTab === "phase5" || activeTab === "all") && (
          <PhaseWebhookAllocationsSection
            clientConfig={clientConfig}
            accounts={accounts}
            buckets={buckets}
            selectedProviderAccountId={selectedProviderAccountId}
            setSelectedProviderAccountId={setSelectedProviderAccountId}
            allocationHistory={allocationHistory}
            setAllocationHistory={setAllocationHistory}
            notify={notify}
          />
        )}
      </main>

      {/* Live API Request/Response Inspector Drawer */}
      <ApiConsoleDrawer
        logs={apiLogs}
        onClear={() => setApiLogs([])}
        isOpen={isConsoleOpen}
        onToggle={() => setIsConsoleOpen((v) => !v)}
      />
    </div>
  );
}
