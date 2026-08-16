export const shellColors = {
  bg: "#F8FAFC",
  panel: "#FFFFFF",
  line: "#E2E8F0",
  ink: "#0F1B2D",
  inkMuted: "#64748B",
  inkFaint: "#94A3B8",
  accent: "#17375E",
  accentSoft: "#EAF0F7",
  good: "#16A34A",
  emeraldSoft: "#F0FDF4",
  warn: "#B45309",
  warnSoft: "#FEF3C7",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
};

export const colors = {
  bg: "#F8FAFC",
  panel: "#FFFFFF",
  panel2: "#FAFBFC",
  line: "#E2E8F0",
  lineSoft: "#EDF1F5",
  ink: "#0F1B2D",
  inkMuted: "#64748B",
  inkFaint: "#94A3B8",
  accent: "#17375E",
  accentSoft: "#EAF0F7",
  emerald: "#22C55E",
  emeraldSoft: "#F0FDF4",
  warn: "#B45309",
  warnSoft: "#FEF3C7",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  good: "#16A34A",
};

export const styles = {
  page: { fontFamily: "'Inter', system-ui, sans-serif", background: colors.bg, minHeight: "100vh", padding: "32px 24px", color: colors.ink },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.accent, marginBottom: 6 },
  h1: { fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" },
  subtitle: { color: colors.inkMuted, fontSize: 14, marginTop: 6, maxWidth: 560 },
  card: { background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 12, padding: 16 },
  select: { border: `1px solid ${colors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, background: "#fff" },
  primaryButton: { fontSize: 13.5, fontWeight: 700, padding: "9px 18px", borderRadius: 8, cursor: "pointer", border: "none", background: colors.accent, color: "#fff" },
  label: { fontSize: 11, fontWeight: 700, color: colors.inkMuted, textTransform: "uppercase", marginBottom: 6, display: "block" },
};

export default { shellColors, colors, styles };
