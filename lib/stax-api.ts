export type VerificationType = "EMAIL" | "PHONE";

export interface UserProfile {
  id?: string;
  email: string;
  nickname?: string | null;
  phoneNumber?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  accountStatus?: "PENDING" | "ACTIVE" | string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  createdAt?: string;
  [key: string]: unknown;
}

export interface AuthTokensResponse {
  accessToken?: string;
  refreshToken?: string;
  user?: UserProfile;
  message?: string;
  [key: string]: unknown;
}

export interface KycStatusResponse {
  tier: string;
  status: string;
  bvnVerified?: boolean;
  ninVerified?: boolean;
  bvnSubmitted?: boolean;
  ninSubmitted?: boolean;
  [key: string]: unknown;
}

export interface BankConnection {
  id: string;
  providerAccountId: string;
  bankName: string;
  accountNumberMasked: string;
  mandateStatus: "PENDING" | "ACTIVE" | string;
  mandateLimitKobo?: string | number;
  mandateLimitNaira?: number;
  mandateReference?: string | null;
  createdAt?: string;
  [key: string]: unknown;
}

export interface DestinationBucket {
  id: string;
  name: string;
  targetKobo?: string | number;
  targetNaira?: number;
  balanceKobo?: string | number;
  currentBalanceKobo?: string | number;
  createdAt?: string;
  [key: string]: unknown;
}

export interface RuleSplitInput {
  bucketId: string;
  percentageBasisPoints: number;
  priority: number;
}

export interface RuleSplit extends RuleSplitInput {
  id?: string;
  bucket?: DestinationBucket;
  bucketName?: string;
  [key: string]: unknown;
}

export interface AllocationRule {
  id?: string;
  version?: number;
  isActive?: boolean;
  minSalaryKobo?: string | number;
  minSalaryNaira?: number;
  allocationRateBasisPoints: number;
  splits: RuleSplit[];
  createdAt?: string;
  [key: string]: unknown;
}

export interface TransferInstruction {
  id?: string;
  planId?: string;
  bucketId: string;
  bucketName?: string;
  bucket?: DestinationBucket;
  amountKobo?: string | number;
  amountNaira?: number;
  status?: string;
  idempotencyKey?: string;
  providerReference?: string | null;
  priority?: number;
  percentageBasisPoints?: number;
  createdAt?: string;
  [key: string]: unknown;
}

export interface AllocationPlan {
  id: string;
  rawTransactionId?: string;
  ruleVersion?: number;
  status: "CREATED" | "COMPLETED" | "CANCELLED" | "PARTIALLY_FAILED" | string;
  sourceAmountKobo?: string | number;
  salaryAmountKobo?: string | number;
  amountKobo?: string | number;
  poolAmountKobo?: string | number;
  totalAllocatedKobo?: string | number;
  allocatedAmountKobo?: string | number;
  unallocatedAmountKobo?: string | number;
  narration?: string;
  counterparty?: string;
  createdAt?: string;
  transfers?: TransferInstruction[];
  transferInstructions?: TransferInstruction[];
  [key: string]: unknown;
}

export interface ApiLogEntry {
  id: string;
  timestamp: string;
  method: string;
  endpoint: string;
  fullUrl: string;
  requestBody?: unknown;
  status: number;
  ok: boolean;
  responseBody?: unknown;
  durationMs: number;
}

export interface StaxClientConfig {
  baseUrl: string;
  useProxy: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  onLog?: (entry: ApiLogEntry) => void;
  onTokensUpdated?: (accessToken: string, refreshToken?: string) => void;
}

export class StaxApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "StaxApiError";
    this.status = status;
    this.data = data;
  }
}

export async function staxFetch<T = unknown>(
  config: StaxClientConfig,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  endpoint: string,
  body?: unknown,
  options?: { skipAuth?: boolean },
): Promise<T> {
  const cleanEndpoint = endpoint.replace(/^\/+/, "");
  const cleanBase = config.baseUrl.replace(/\/+$/, "");
  const fullTargetUrl = `${cleanBase}/${cleanEndpoint}`;
  const fetchUrl = config.useProxy
    ? `/api/stax/${cleanEndpoint}`
    : fullTargetUrl;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.useProxy) {
    headers["x-stax-base-url"] = cleanBase;
  }

  if (!options?.skipAuth && config.accessToken) {
    headers["Authorization"] = `Bearer ${config.accessToken}`;
  }

  const startTime = performance.now();
  let status = 0;
  let ok = false;
  let responseData: unknown = null;

  try {
    const res = await fetch(fetchUrl, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    status = res.status;
    ok = res.ok;

    const text = await res.text();
    try {
      responseData = text ? JSON.parse(text) : null;
    } catch {
      responseData = text;
    }

    const durationMs = Math.round(performance.now() - startTime);
    config.onLog?.({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      method,
      endpoint: `/${cleanEndpoint}`,
      fullUrl: fullTargetUrl,
      requestBody: body,
      status,
      ok,
      responseBody: responseData,
      durationMs,
    });

    if (!res.ok) {
      const errMsg = extractErrorMessage(responseData, res.statusText, status);
      throw new StaxApiError(errMsg, status, responseData);
    }

    return responseData as T;
  } catch (err) {
    if (err instanceof StaxApiError) {
      throw err;
    }
    const durationMs = Math.round(performance.now() - startTime);
    const message =
      err instanceof Error ? err.message : "Network request failed";

    config.onLog?.({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      method,
      endpoint: `/${cleanEndpoint}`,
      fullUrl: fullTargetUrl,
      requestBody: body,
      status: 0,
      ok: false,
      responseBody: { error: message },
      durationMs,
    });

    throw new StaxApiError(message, 0, { error: message });
  }
}

function extractErrorMessage(
  data: unknown,
  fallbackText: string,
  status: number,
): string {
  if (typeof data === "object" && data !== null) {
    const rec = data as Record<string, unknown>;
    if (Array.isArray(rec.message)) {
      return rec.message.join(", ");
    }
    if (typeof rec.message === "string" && rec.message.trim()) {
      return rec.message;
    }
    if (typeof rec.error === "string" && rec.error.trim()) {
      return rec.error;
    }
  }
  if (typeof data === "string" && data.trim()) {
    return data;
  }
  return fallbackText || `Request failed with status ${status}`;
}
