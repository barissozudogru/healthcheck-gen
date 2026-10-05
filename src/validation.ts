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
  return parseDockerDuration(value) !== null;
}

function parseDockerDuration(
  value: string
): { totalNumerator: bigint; totalDenominator: bigint } | null {
  const durationPart = /(\d+(?:\.\d+)?|\.\d+)(ns|us|µs|ms|s|m|h)/g;
  let totalNumerator = 0n;
  let totalDenominator = 1n;
  let position = 0;
  let match: RegExpExecArray | null;

  while ((match = durationPart.exec(value)) !== null) {
    if (match.index !== position) return null;

    const [number, unit] = match.slice(1);
    const [whole, fraction = ""] = number.split(".");
    const denominator = 10n ** BigInt(fraction.length);
    const numerator = BigInt(`${whole || "0"}${fraction}`) * DURATION_UNITS[unit];

    totalNumerator =
      totalNumerator * denominator + numerator * totalDenominator;
    totalDenominator *= denominator;
    position = durationPart.lastIndex;
  }

  if (
    position !== value.length ||
    position === 0 ||
    totalNumerator > MAX_DURATION_NANOSECONDS * totalDenominator
  ) {
    return null;
  }

  return { totalNumerator, totalDenominator };
}

export function isPositiveDockerDuration(value: string): boolean {
  const duration = parseDockerDuration(value);
  return duration !== null && duration.totalNumerator >= duration.totalDenominator;
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
    const mustBePositive = name === "interval" || name === "timeout";
    if (
      value !== undefined &&
      (!isDockerDuration(value) ||
        (mustBePositive && !isPositiveDockerDuration(value)))
    ) {
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
