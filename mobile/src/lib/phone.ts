/** Accepts 07XXXXXXXX, 7XXXXXXXX, 2567XXXXXXXX or +2567XXXXXXXX; returns +2567XXXXXXXX or null. */
export function toE164Uganda(input: string): string | null {
  const d = input.replace(/[\s()-]/g, "");
  const m = d.match(/^(?:\+?256|0)?(7\d{8})$/);
  return m ? `+256${m[1]}` : null;
}
