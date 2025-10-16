/**
 * Safely format numbers with grouping separators while supporting
 * environments where Intl.NumberFormat is unavailable (e.g. Hermes
 * without the Intl bundle).
 */
export function formatNumber(value: number): string {
  try {
    return value.toLocaleString();
  } catch (error) {
    // Hermes throws a RangeError wrapping a ClassNotFoundException when the
    // Intl bundle is missing. Fall back to a lightweight formatter that
    // inserts grouping separators so the UI still looks reasonable.
    const [integerPart, fractionalPart] = value.toString().split('.');
    const withGroupSeparators = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    return fractionalPart ? `${withGroupSeparators}.${fractionalPart}` : withGroupSeparators;
  }
}
