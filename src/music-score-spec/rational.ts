import type { Duration } from "./schema.js";

export interface Rational {
  numerator: bigint;
  denominator: bigint;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function rational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) throw new Error("Rational denominator cannot be zero.");
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: (numerator / divisor) * sign,
    denominator: (denominator / divisor) * sign
  };
}

export function addRational(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

export function compareRational(left: Rational, right: Rational): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function durationAsRational(duration: Duration): Rational {
  const baseDenominators: Record<Duration["value"], bigint> = {
    whole: 1n,
    half: 2n,
    quarter: 4n,
    eighth: 8n,
    "16th": 16n,
    "32nd": 32n
  };
  const dotMultipliers: Array<[bigint, bigint]> = [
    [1n, 1n],
    [3n, 2n],
    [7n, 4n]
  ];
  const [dotNumerator, dotDenominator] = dotMultipliers[duration.dots]!;
  const tupletNumerator = BigInt(duration.tuplet?.normal ?? 1);
  const tupletDenominator = BigInt(duration.tuplet?.actual ?? 1);
  return rational(
    dotNumerator * tupletNumerator,
    baseDenominators[duration.value] * dotDenominator * tupletDenominator
  );
}

export function rationalToString(value: Rational): string {
  return `${value.numerator}/${value.denominator}`;
}

