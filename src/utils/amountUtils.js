export function median(arr) {
  if (!arr || !arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function fmtCompact(n) {
  if (n == null) return "—";
  const v = Math.abs(n);
  if (v === 0) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function parseSharedAmount(v) {
  if (typeof v === "number") return v;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,]/g, "");
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

export default { median, fmtCompact, parseSharedAmount };
