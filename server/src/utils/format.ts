const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,23,456 (Indian digit grouping, whole rupees). */
export const formatINR = (n: number): string => `₹${inr.format(Math.round(n))}`;
/** ₹1,23,456.78 */
export const formatINR2 = (n: number): string => `₹${inr2.format(n)}`;
export const formatPct = (n: number): string => `${Number(n.toFixed(2))}%`;
export const formatTenure = (months: number): string => {
  if (months % 12 === 0 && months >= 12) {
    const y = months / 12;
    return `${months} months (${y} year${y > 1 ? 's' : ''})`;
  }
  return `${months} month${months > 1 ? 's' : ''}`;
};
