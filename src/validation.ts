import type { HealthcheckOverrides } from "./index.js";

const MAX_DURATION_NANOSECONDS = 9223372036854775807n;
const DURATION_UNITS: Record<string, bigint> = {
  ns: 1n,
  us: 1000n,
  "µs": 1000n,
  ms: 1000000n,
  s: 1000000000n,
  m: 60000000000n,
  h: 3600000000000n,
};

export function isDockerDuration(value: string): boolean {
  const durationPart = /(\d+(?:\.\d+)?|\.\d+)(ns|us|µs|ms|s|m|h)/g;
  let totalNumerator = 0n;
  let totalDenominator = 1n;
  let position = 0;
  let match: RegExpExecArray | null;

  while ((match = durationPart.exec(value)) !== null) {
    if (match.index !== position) return false;

    const [number, unit] = match.slice(1);
    const [whole, fraction = ""] = number.split(".");
    const denominator = 10n ** BigInt(fraction.length);
    const numerator = BigInt(`${whole || "0"}${fraction}`) * DURATION_UNITS[unit];

    totalNumerator =
      totalNumerator * denominator + numerator * totalDenominator;
    totalDenominator *= denominator;
    position = durationPart.lastIndex;
  }

  return (
    position === value.length &&
    position > 0 &&
    totalNumerator <= MAX_DURATION_NANOSECONDS * totalDenominator
  );
}

export function validateHealthcheckOverrides(
  overrides: HealthcheckOverrides
): void {
  const durations: Array<[string, string | undefined]> = [
    ["interval", overrides.interval],
    ["timeout", overrides.timeout],
    ["start-period", overrides.startPeriod],
  ];

  for (const [name, value] of durations) {
    if (value !== undefined && !isDockerDuration(value)) {
      throw new Error(`${name} must be a valid Docker duration`);
    }
  }

  if (
    overrides.retries !== undefined &&
    (!Number.isSafeInteger(overrides.retries) || overrides.retries < 1)
  ) {
    throw new Error("retries must be a positive integer");
  }
}
