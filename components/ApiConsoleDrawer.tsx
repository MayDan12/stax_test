"use client";

import React, { useState } from "react";
import { ApiLogEntry } from "@/lib/stax-api";

interface ApiConsoleDrawerProps {
  logs: ApiLogEntry[];
  onClear: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function ApiConsoleDrawer({
  logs,
  onClear,
  isOpen,
  onToggle,
}: ApiConsoleDrawerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedLog = logs.find((l) => l.id === selectedId) || logs[0] || null;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-700 bg-slate-950/95 backdrop-blur-xl shadow-2xl">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Live Stax API Request & Response Inspector ({logs.length})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-400 hover:text-white"
            >
              Clear Logs
            </button>
            <button
              type="button"
              onClick={onToggle}
              className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              Minimize Console ✕
            </button>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No API requests sent yet. Interact with any phase above to inspect
            live HTTP payloads and Kobo BigInt responses.
          </div>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-12 h-64">
            {/* Request List */}
            <div className="lg:col-span-5 overflow-y-auto space-y-1.5 pr-1 border-r border-slate-800/80">
              {logs.map((item) => {
                const isSelected = selectedLog?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-mono transition ${
                      isSelected
                        ? "bg-slate-800 text-white border border-slate-700"
                        : "bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          item.method === "GET"
                            ? "bg-sky-500/20 text-sky-300"
                            : item.method === "POST"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-purple-500/20 text-purple-300"
                        }`}
                      >
                        {item.method}
                      </span>
                      <span className="truncate">{item.endpoint}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          item.ok
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-rose-500/20 text-rose-300"
                        }`}
                      >
                        {item.status || "ERR"}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {item.durationMs}ms
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Request / Response Details */}
            <div className="lg:col-span-7 overflow-y-auto grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="flex flex-col h-full">
                <div className="text-[11px] font-sans font-semibold text-slate-400 mb-1">
                  Request Payload ({selectedLog?.method} {selectedLog?.fullUrl})
                </div>
                <pre className="flex-1 overflow-auto rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-[11px] text-amber-200">
                  {selectedLog?.requestBody !== undefined
                    ? JSON.stringify(selectedLog.requestBody, null, 2)
                    : "// No request body"}
                </pre>
              </div>
              <div className="flex flex-col h-full">
                <div className="text-[11px] font-sans font-semibold text-slate-400 mb-1">
                  Response Body (Status {selectedLog?.status} •{" "}
                  {selectedLog?.timestamp})
                </div>
                <pre className="flex-1 overflow-auto rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-[11px] text-emerald-300">
                  {selectedLog?.responseBody !== undefined
                    ? JSON.stringify(selectedLog.responseBody, null, 2)
                    : "// Empty response"}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
