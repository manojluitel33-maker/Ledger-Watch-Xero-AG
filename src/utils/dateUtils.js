export const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2025-07" -> "Jul 2025" / "July 2025" — used everywhere a real
// year+month key needs a human label, now that buckets carry a year.
export function monthKeyLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  if (!m || !y) return key;
  return `${MONTH_ABBR[m - 1]} ${y}`;
}

export function monthKeyLabelFull(key) {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  if (!m || !y) return key;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function parseSharedDate(v, pref) {
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400 * 1000));
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      if (a > 12 && b <= 12) return new Date(y, b - 1, a);
      if (b > 12 && a <= 12) return new Date(y, a - 1, b);
      return pref === "mdy" ? new Date(y, a - 1, b) : new Date(y, b - 1, a);
    }
    const t = Date.parse(s);
    if (!isNaN(t)) return new Date(t);
  }
  return null;
}

export default {
  MONTH_ABBR,
  MONTH_NAMES,
  monthKeyLabel,
  monthKeyLabelFull,
  parseSharedDate,
};
