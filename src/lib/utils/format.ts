const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Deterministic date formatter across Server (SSR) and Client (hydration).
 * Produces clean, consistent "DD MMM YYYY" output (e.g. "03 Oct 2026").
 * Prevents Next.js locale hydration mismatch errors.
 */
export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}
