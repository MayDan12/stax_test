/**
 * Kobo & Naira Currency Utilities
 *
 * Follows Stax Core Backend Currency Rules (`frontend.md` Section 1):
 * - Financial values are stored and calculated in integer Kobo (1 NGN = 100 Kobo).
 * - Prisma `BigInt` values are serialized as integer strings in JSON.
 * - Parse `amountKobo` without losing integer precision, then divide by 100 for Naira display.
 */

import type { AllocationPlan, DestinationBucket } from "./stax-api";

const ZERO_BIGINT = BigInt(0);
const HUNDRED_BIGINT = BigInt(100);

export function toKoboBigInt(
  koboInput?: string | number | bigint | null,
  nairaFallback?: number | string | null,
): bigint {
  if (koboInput !== undefined && koboInput !== null && koboInput !== "") {
    try {
      if (typeof koboInput === "bigint") return koboInput;
      if (typeof koboInput === "number" && Number.isFinite(koboInput)) {
        return BigInt(Math.round(koboInput));
      }
      const clean = String(koboInput).trim();
      if (/^-?\d+$/.test(clean)) {
        return BigInt(clean);
      }
      const num = Number(clean);
      if (Number.isFinite(num)) return BigInt(Math.round(num));
    } catch {
      // fall through
    }
  }

  if (
    nairaFallback !== undefined &&
    nairaFallback !== null &&
    nairaFallback !== ""
  ) {
    const num = Number(nairaFallback);
    if (Number.isFinite(num)) {
      return BigInt(Math.round(num * 100));
    }
  }

  return ZERO_BIGINT;
}

export function parseKoboToNaira(
  koboInput: string | number | bigint | null | undefined,
): number {
  if (koboInput === null || koboInput === undefined || koboInput === "") {
    return 0;
  }

  try {
    if (typeof koboInput === "bigint") {
      const wholeNaira = koboInput / HUNDRED_BIGINT;
      const remainderKobo = koboInput % HUNDRED_BIGINT;
      return Number(wholeNaira) + Number(remainderKobo) / 100;
    }

    if (typeof koboInput === "number") {
      if (!Number.isFinite(koboInput)) return 0;
      return koboInput / 100;
    }

    const clean = String(koboInput).trim();
    if (!clean) return 0;

    // Handle pure integer strings with BigInt so precision isn't lost prior to division
    if (/^-?\d+$/.test(clean)) {
      const bi = BigInt(clean);
      const wholeNaira = bi / HUNDRED_BIGINT;
      const remainderKobo = bi % HUNDRED_BIGINT;
      return Number(wholeNaira) + Number(remainderKobo) / 100;
    }

    const parsed = Number(clean);
    return Number.isFinite(parsed) ? parsed / 100 : 0;
  } catch {
    return 0;
  }
}

export function formatKoboAsNaira(
  koboInput: string | number | bigint | null | undefined,
  options?: { showDecimals?: boolean },
): string {
  const naira = parseKoboToNaira(koboInput);
  const hasKoboFraction = Math.abs(naira % 1) > 0.001;
  const showDecimals = options?.showDecimals ?? hasKoboFraction;

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(naira);
}

export function formatNaira(
  nairaInput: number | string | null | undefined,
  options?: { showDecimals?: boolean },
): string {
  if (nairaInput === null || nairaInput === undefined || nairaInput === "") {
    return "₦0";
  }
  const num =
    typeof nairaInput === "number" ? nairaInput : Number(String(nairaInput));
  if (!Number.isFinite(num)) return "₦0";

  const hasFraction = Math.abs(num % 1) > 0.001;
  const showDecimals = options?.showDecimals ?? hasFraction;

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Resolves either a Kobo field (`*Kobo`) or a Naira field (`*Naira`) from an API object
 * and returns a formatted Naira string.
 */
export function resolveAndFormatCurrency(
  koboValue?: string | number | bigint | null,
  nairaValue?: number | string | null,
): string {
  if (koboValue !== undefined && koboValue !== null && koboValue !== "") {
    return formatKoboAsNaira(koboValue);
  }
  if (nairaValue !== undefined && nairaValue !== null && nairaValue !== "") {
    return formatNaira(nairaValue);
  }
  return "₦0";
}

export function bpsToPercent(bps: number | string | null | undefined): number {
  const num = Number(bps ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Number((num / 100).toFixed(2));
}

export function percentToBps(percent: number | string): number {
  const num = Number(percent);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export interface BucketSavingsMetric {
  bucketId: string;
  bucketName: string;
  savedKobo: string;
  savedNaira: number;
  pendingKobo: string;
  pendingNaira: number;
  targetKobo: string;
  targetNaira: number;
  progressPercent: number;
  settledTransferCount: number;
  pendingTransferCount: number;
}

/**
 * Computes the saved balance and progress toward target for a DestinationBucket
 * by combining any direct balance fields returned by `GET /v1/buckets` with
 * the settled/pending `TransferInstruction` records in `GET /v1/allocations/history`.
 */
export function computeBucketSavings(
  bucket: DestinationBucket,
  allocationHistory: AllocationPlan[],
): BucketSavingsMetric {
  const directBalanceKobo = toKoboBigInt(
    bucket.balanceKobo ??
      bucket.currentBalanceKobo ??
      (bucket.savedKobo as string | number | undefined),
    bucket.balanceNaira as number | undefined,
  );

  const targetBigInt = toKoboBigInt(bucket.targetKobo, bucket.targetNaira);

  let historySettledKobo = ZERO_BIGINT;
  let historyPendingKobo = ZERO_BIGINT;
  let settledTransferCount = 0;
  let pendingTransferCount = 0;

  for (const plan of allocationHistory) {
    const planStatus = String(plan.status || "").toUpperCase();
    if (planStatus === "CANCELLED" || planStatus === "FAILED") {
      continue;
    }

    const transfers = plan.transfers || plan.transferInstructions || [];
    for (const tr of transfers) {
      const matchesId = tr.bucketId === bucket.id;
      const matchesName =
        !tr.bucketId &&
        (tr.bucketName || tr.bucket?.name || "").toLowerCase() ===
          bucket.name.toLowerCase();

      if (!matchesId && !matchesName) continue;

      const trKobo = toKoboBigInt(tr.amountKobo, tr.amountNaira);
      const trStatus = String(tr.status || planStatus).toUpperCase();

      if (
        trStatus === "COMPLETED" ||
        trStatus === "SUCCESS" ||
        trStatus === "SETTLED"
      ) {
        historySettledKobo += trKobo;
        settledTransferCount += 1;
      } else if (
        trStatus === "CREATED" ||
        trStatus === "PENDING" ||
        trStatus === "QUEUED" ||
        trStatus === "PROCESSING"
      ) {
        historyPendingKobo += trKobo;
        pendingTransferCount += 1;
      }
    }
  }

  // Use the larger of direct bucket balance (if backend stores it on Bucket) or settled transfers from history
  const effectiveSavedKobo =
    directBalanceKobo > historySettledKobo
      ? directBalanceKobo
      : historySettledKobo;

  const savedNaira = parseKoboToNaira(effectiveSavedKobo);
  const pendingNaira = parseKoboToNaira(historyPendingKobo);
  const targetNaira = parseKoboToNaira(targetBigInt);

  const progressPercent =
    targetNaira > 0
      ? Math.min(100, Number(((savedNaira / targetNaira) * 100).toFixed(2)))
      : 0;

  return {
    bucketId: bucket.id,
    bucketName: bucket.name,
    savedKobo: effectiveSavedKobo.toString(),
    savedNaira,
    pendingKobo: historyPendingKobo.toString(),
    pendingNaira,
    targetKobo: targetBigInt.toString(),
    targetNaira,
    progressPercent,
    settledTransferCount,
    pendingTransferCount,
  };
}
