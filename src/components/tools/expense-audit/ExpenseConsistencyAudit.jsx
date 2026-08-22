import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Upload, ChevronDown, ChevronRight, Search, Settings, X } from "lucide-react";
import useViewport from "../../../hooks/useViewport";

const colors = {
  bg: "#F8FAFC", panel: "#FFFFFF", panel2: "#FAFBFC",
  line: "#E2E8F0", lineSoft: "#EDF1F5",
  ink: "#0F1B2D", inkMuted: "#64748B", inkFaint: "#94A3B8",
  accent: "#17375E", accentSoft: "#EAF0F7",
  emerald: "#22C55E", emeraldSoft: "#F0FDF4",
  warn: "#B45309", warnSoft: "#FEF3C7",
  danger: "#DC2626", dangerSoft: "#FEF2F2", good: "#16A34A",
};
const styles = {
  page: { fontFamily: "'Inter', system-ui, sans-serif", background: colors.bg, minHeight: "100vh", padding: "32px 24px", color: colors.ink },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.accent, marginBottom: 6 },
  h1: { fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" },
  subtitle: { color: colors.inkMuted, fontSize: 14, marginTop: 6, maxWidth: 560 },
  card: { background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 12, padding: 16 },
  select: { border: `1px solid ${colors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, background: "#fff" },
  primaryButton: { fontSize: 13.5, fontWeight: 700, padding: "9px 18px", borderRadius: 8, cursor: "pointer", border: "none", background: colors.accent, color: "#fff" },
  label: { fontSize: 11, fontWeight: 700, color: colors.inkMuted, textTransform: "uppercase", marginBottom: 6, display: "block" },
};

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// "2025-07" -> "Jul 2025" / "July 2025" — used everywhere a real
// year+month key needs a human label, now that buckets carry a year.
function monthKeyLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${y}`;
}
function monthKeyLabelFull(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function fmtCompact(n) {
  const v = Math.abs(n);
  if (v === 0) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/* ============================================================
   MODULE-SPECIFIC LOGIC — Expense Consistency Audit
   Built on the shared normalized transactions (from Shared
   Files) instead of its own file upload/mapping.
   ============================================================ */

function accountsFromTransactions(transactions, coaAccounts) {
  const coaTypeByName = {};
  (coaAccounts || []).forEach((e) => { if (e.name) coaTypeByName[e.name.trim().toLowerCase()] = e.type; });

  const map = {};
  (transactions || []).forEach((t) => {
    if (!t.account || !t.date) return;
    if (!map[t.account]) {
      map[t.account] = { name: t.account, type: t.accountType || coaTypeByName[t.account.trim().toLowerCase()] || "", byMonth: {}, txnsByMonth: {} };
    }
    const acc = map[t.account];
    const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
    acc.byMonth[key] = (acc.byMonth[key] || 0) + t.amount;
    if (!acc.txnsByMonth[key]) acc.txnsByMonth[key] = [];
    acc.txnsByMonth[key].push({ date: t.date, contact: t.vendor || t.description || "—", amount: t.amount });
  });
  Object.values(map).forEach((a) => { if (!a.type) a.type = "Other"; });
  return Object.values(map);
}

// Union of every "YYYY-MM" key present across all accounts, sorted
// chronologically — the real timeline, spanning however many years the
// shared file actually covers.
function getGlobalMonthKeys(accounts) {
  const set = new Set();
  (accounts || []).forEach((a) => Object.keys(a.byMonth).forEach((k) => set.add(k)));
  return [...set].sort();
}

function classifyType(t) {
  if (!t) return "Other";
  const s = String(t).toLowerCase();
  if (s.includes("expense") || s.includes("direct cost") || s.includes("overhead") || s.includes("cost of goods")) return "Expense";
  if (s.includes("revenue") || s.includes("sales") || s.includes("income")) return "Revenue";
  if (s.includes("liab")) return "Liability";
  if (s.includes("equity")) return "Equity";
  if (s.includes("bank") || s.includes("asset") || s.includes("inventory") || s.includes("prepayment") || s.includes("depreciation")) return "Asset";
  return "Other";
}

function findRecurringAmount(nonZero, patternThresholdPct, patternTolerancePct) {
  if (nonZero.length < 3) return null;
  const tol = patternTolerancePct / 100;
  let best = null;
  for (let i = 0; i < nonZero.length; i++) {
    const center = nonZero[i];
    const cluster = nonZero.filter((v) => Math.abs(v - center) <= center * tol);
    if (!best || cluster.length > best.count) best = { value: median(cluster), count: cluster.length };
  }
  const coverage = best.count / nonZero.length;
  if (coverage >= patternThresholdPct / 100 && best.count < nonZero.length) return best;
  return null;
}

function analyzeAccount(acc, monthKeys, settings) {
  const { lowPct, highPct, patternEnabled, patternThresholdPct, patternTolerancePct, materialityThreshold } = settings;
  const abs = {};
  monthKeys.forEach((k) => { abs[k] = Math.abs(acc.byMonth[k] || 0); });
  const nonZero = monthKeys.map((k) => abs[k]).filter((v) => v > 0.005);
  const flags = {};
  monthKeys.forEach((k) => { flags[k] = null; });
  let typical = 0, pattern = null;

  if (nonZero.length >= 4) {
    typical = median(nonZero);
    // Materiality gate: an account whose typical monthly amount doesn't
    // even clear the threshold isn't worth flagging for missing/low/spike —
    // its fluctuations are negligible by definition. Pattern ("varies")
    // detection below is intentionally NOT gated by this.
    if (typical > 1 && typical >= materialityThreshold) {
      monthKeys.forEach((k) => {
        const v = abs[k];
        const ratio = typical > 0 ? v / typical : 0;
        if (v < 0.005) flags[k] = "missing";
        else if (ratio < lowPct / 100) flags[k] = "low";
        else if (ratio > highPct / 100) flags[k] = "spike";
      });
    }
  }
  if (patternEnabled) {
    pattern = findRecurringAmount(nonZero, patternThresholdPct, patternTolerancePct);
    if (pattern) {
      const tol = patternTolerancePct / 100;
      monthKeys.forEach((k) => {
        if (flags[k]) return;
        const v = abs[k];
        if (v < 0.005) return;
        if (Math.abs(v - pattern.value) > pattern.value * tol) flags[k] = "pattern";
      });
    }
  }
  return { typical, pattern, flags, flagCount: Object.values(flags).filter((f) => f).length };
}

const FLAG_STYLES = {
  missing: { label: "MISSING", bg: colors.dangerSoft, fg: colors.danger },
  spike: { label: "SPIKE", bg: colors.dangerSoft, fg: colors.danger },
  low: { label: "LOW", bg: colors.warnSoft, fg: colors.warn },
  pattern: { label: "VARIES", bg: colors.warnSoft, fg: colors.warn },
};
const FLAG_ORDER = { missing: 0, spike: 1, pattern: 2, low: 3 };

function ExpenseConsistencyAudit({ transactions, coaAccounts }) {
  const { isMobile } = useViewport();
  const accounts = useMemo(() => accountsFromTransactions(transactions, coaAccounts), [transactions, coaAccounts]);
  const allMonthKeys = useMemo(() => getGlobalMonthKeys(accounts), [accounts]);

  const [activeTypes, setActiveTypes] = useState(new Set(["Expense"]));
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("flags");
  const [expandedAcc, setExpandedAcc] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startMonth, setStartMonth] = useState(null); // "YYYY-MM"
  const [endMonth, setEndMonth] = useState(null); // "YYYY-MM"
  const [summaryMonth, setSummaryMonth] = useState(null); // "YYYY-MM"
  const [settings, setSettings] = useState({
    lowPct: 50, highPct: 150,
    patternEnabled: true, patternThresholdPct: 50, patternTolerancePct: 3,
    materialityThreshold: 1000,
  });

  // Default the report period to the file's full span, and the
  // month-wise summary to the most recent month, once real data shows up.
  useEffect(() => {
    if (allMonthKeys.length === 0) return;
    if (!startMonth || !allMonthKeys.includes(startMonth)) setStartMonth(allMonthKeys[0]);
    if (!endMonth || !allMonthKeys.includes(endMonth)) setEndMonth(allMonthKeys[allMonthKeys.length - 1]);
    if (!summaryMonth || !allMonthKeys.includes(summaryMonth)) setSummaryMonth(allMonthKeys[allMonthKeys.length - 1]);
  }, [allMonthKeys]);

  const months = useMemo(() => {
    if (!startMonth || !endMonth || allMonthKeys.length === 0) return [];
    const si = allMonthKeys.indexOf(startMonth), ei = allMonthKeys.indexOf(endMonth);
    if (si === -1 || ei === -1) return allMonthKeys;
    return allMonthKeys.slice(Math.min(si, ei), Math.max(si, ei) + 1);
  }, [allMonthKeys, startMonth, endMonth]);

  const types = useMemo(() => accounts ? [...new Set(accounts.map((a) => classifyType(a.type)))].sort() : [], [accounts]);

  // Safeguard: if the current type filter (e.g. the "Expense" default)
  // wouldn't match anything in this file, fall back to showing every type
  // rather than silently displaying an empty screen.
  useEffect(() => {
    if (types.length === 0) return;
    const hasOverlap = types.some((t) => activeTypes.has(t));
    if (!hasOverlap) setActiveTypes(new Set(types));
  }, [types]);

  const analyzed = useMemo(() => {
    if (!accounts) return [];
    let list = accounts.filter(
      (a) => activeTypes.has(classifyType(a.type)) && (!search || a.name.toLowerCase().includes(search.toLowerCase()))
    );
    let result = list.map((a) => ({ acc: a, ...analyzeAccount(a, months, settings) }));
    if (sortMode === "flags") result.sort((a, b) => b.flagCount - a.flagCount || a.acc.name.localeCompare(b.acc.name));
    else if (sortMode === "name") result.sort((a, b) => a.acc.name.localeCompare(b.acc.name));
    else if (sortMode === "total") result.sort((a, b) => months.reduce((s, k) => s + Math.abs(b.acc.byMonth[k] || 0), 0) - months.reduce((s, k) => s + Math.abs(a.acc.byMonth[k] || 0), 0));
    return result;
  }, [accounts, activeTypes, search, sortMode, settings, months]);

  const summary = useMemo(() => {
    const totalFlagged = analyzed.filter((a) => a.flagCount > 0).length;
    const missing = analyzed.reduce((s, a) => s + Object.values(a.flags).filter((f) => f === "missing").length, 0);
    const spikes = analyzed.reduce((s, a) => s + Object.values(a.flags).filter((f) => f === "spike" || f === "low").length, 0);
    const offPattern = analyzed.reduce((s, a) => s + Object.values(a.flags).filter((f) => f === "pattern").length, 0);
    return { totalFlagged, missing, spikes, offPattern };
  }, [analyzed]);

  const effectiveSummaryMonth = months.includes(summaryMonth) ? summaryMonth : months[months.length - 1];
  const flaggedThisMonth = useMemo(() => {
    return analyzed
      .filter((a) => a.flags[effectiveSummaryMonth])
      .sort((a, b) => FLAG_ORDER[a.flags[effectiveSummaryMonth]] - FLAG_ORDER[b.flags[effectiveSummaryMonth]]);
  }, [analyzed, effectiveSummaryMonth]);

  const toggleType = (t) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      if (next.size === 0) next.add(t);
      return next;
    });
  };

  const monthSentence = (row) => {
    const { acc, typical, pattern, flags } = row;
    const f = flags[effectiveSummaryMonth];
    const value = Math.abs(acc.byMonth[effectiveSummaryMonth] || 0);
    const monthName = effectiveSummaryMonth ? monthKeyLabelFull(effectiveSummaryMonth) : "";
    if (f === "missing") return <><b>{acc.name}</b> has not been booked in {monthName} — typical is ~{fmtCompact(typical)}.</>;
    if (f === "spike") return <><b>{acc.name}</b> spiked in {monthName} — {fmtCompact(value)} booked, well above the typical ~{fmtCompact(typical)}.</>;
    if (f === "pattern") return <><b>{acc.name}</b> varies from its usual pattern in {monthName} — {fmtCompact(value)} booked, but {fmtCompact(pattern.value)} repeats in most other months.</>;
    return <><b>{acc.name}</b> was booked low in {monthName} — only {fmtCompact(value)}, typical is ~{fmtCompact(typical)}.</>;
  };

  return (
    <div style={{ ...styles.page, padding: isMobile ? "20px 12px" : styles.page.padding }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 24, borderBottom: `1px solid ${colors.line}`, paddingBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={styles.h1}>Expense Booking Checker</h1>
            <p style={styles.subtitle}>Flags missing months, spikes, and off-pattern amounts in your expense accounts.</p>
          </div>
          {accounts.length > 0 && (
            <button
              onClick={() => setSettingsOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${colors.line}`, borderRadius: 20, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}
            >
              <Settings size={14} /> Settings
            </button>
          )}
        </div>

        {(!transactions || accounts.length === 0) && (
          <div style={{ ...styles.card, textAlign: "center", padding: 40 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No shared file loaded yet</div>
            <div style={{ fontSize: 13, color: colors.inkMuted }}>Upload and map your Account Transactions export in <b>Shared Files</b> to run this audit.</div>
          </div>
        )}

        {accounts.length > 0 && (
          <>
            {settingsOpen && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.35)", zIndex: 45 }} onClick={() => setSettingsOpen(false)}>
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 340, maxWidth: "88vw", background: "#fff", borderLeft: `1px solid ${colors.line}`, padding: 22, overflowY: "auto", zIndex: 50 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>Settings</div>
                    <button onClick={() => setSettingsOpen(false)} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={18} /></button>
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <label style={styles.label}>Report period</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <select value={startMonth || ""} onChange={(e) => { const v = e.target.value; setStartMonth(v); if (v > endMonth) setEndMonth(v); }} style={styles.select}>
                        {allMonthKeys.map((k) => <option key={k} value={k}>{monthKeyLabel(k)}</option>)}
                      </select>
                      <span style={{ color: colors.inkFaint, fontSize: 12 }}>to</span>
                      <select value={endMonth || ""} onChange={(e) => { const v = e.target.value; setEndMonth(v); if (v < startMonth) setStartMonth(v); }} style={styles.select}>
                        {allMonthKeys.map((k) => <option key={k} value={k}>{monthKeyLabel(k)}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <label style={styles.label}>Low threshold — {settings.lowPct}% of typical</label>
                    <input type="range" min={10} max={90} value={settings.lowPct} onChange={(e) => setSettings((s) => ({ ...s, lowPct: Number(e.target.value) }))} style={{ width: "100%" }} />
                    <div style={{ fontSize: 11.5, color: colors.inkFaint }}>Flag a month as "low" if it falls below this % of the typical amount.</div>
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <label style={styles.label}>High threshold — {settings.highPct}% of typical</label>
                    <input type="range" min={110} max={400} value={settings.highPct} onChange={(e) => setSettings((s) => ({ ...s, highPct: Number(e.target.value) }))} style={{ width: "100%" }} />
                    <div style={{ fontSize: 11.5, color: colors.inkFaint }}>Flag a month as a "spike" if it exceeds this % of the typical amount.</div>
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <label style={styles.label}>Materiality threshold — ${settings.materialityThreshold.toLocaleString()}</label>
                    <input type="range" min={500} max={10000} step={250} value={settings.materialityThreshold} onChange={(e) => setSettings((s) => ({ ...s, materialityThreshold: Number(e.target.value) }))} style={{ width: "100%" }} />
                    <div style={{ fontSize: 11.5, color: colors.inkFaint }}>Ignore missing / low / spike flags for accounts whose typical month doesn't reach this amount — keeps the summary from filling up with negligible accounts. Doesn't affect "varies" flags.</div>
                  </div>

                  <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={settings.patternEnabled} onChange={(e) => setSettings((s) => ({ ...s, patternEnabled: e.target.checked }))} />
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Detect recurring-amount patterns</label>
                  </div>
                  {settings.patternEnabled && (
                    <>
                      <div style={{ marginBottom: 18 }}>
                        <label style={styles.label}>Pattern coverage — {settings.patternThresholdPct}%</label>
                        <input type="range" min={30} max={90} value={settings.patternThresholdPct} onChange={(e) => setSettings((s) => ({ ...s, patternThresholdPct: Number(e.target.value) }))} style={{ width: "100%" }} />
                        <div style={{ fontSize: 11.5, color: colors.inkFaint }}>How many months must repeat the same amount before it counts as "the pattern."</div>
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <label style={styles.label}>Match tolerance — {settings.patternTolerancePct}%</label>
                        <input type="range" min={0} max={15} value={settings.patternTolerancePct} onChange={(e) => setSettings((s) => ({ ...s, patternTolerancePct: Number(e.target.value) }))} style={{ width: "100%" }} />
                        <div style={{ fontSize: 11.5, color: colors.inkFaint }}>Rounding wiggle room when comparing amounts.</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", ...styles.card, marginBottom: 20 }}>
              <div>
                <div style={styles.label}>Account type</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {types.map((t) => (
                    <button key={t} onClick={() => toggleType(t)} style={{
                      fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 20, cursor: "pointer",
                      border: `1px solid ${activeTypes.has(t) ? colors.accent : colors.line}`,
                      background: activeTypes.has(t) ? colors.accent : "#fff",
                      color: activeTypes.has(t) ? "#fff" : colors.inkMuted,
                    }}>{t}</button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={styles.label}>Search account</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${colors.line}`, borderRadius: 8, padding: "6px 10px" }}>
                  <Search size={13} style={{ color: colors.inkFaint }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Printing" style={{ border: "none", outline: "none", fontSize: 13.5, width: "100%" }} />
                </div>
              </div>
              <div>
                <div style={styles.label}>Sort by</div>
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} style={styles.select}>
                  <option value="flags">Most flags first</option>
                  <option value="name">Account name</option>
                  <option value="total">Total amount</option>
                </select>
              </div>
              <div style={{ fontSize: 12, color: colors.inkFaint }}>
                Period: {startMonth ? monthKeyLabel(startMonth) : ""}–{endMonth ? monthKeyLabel(endMonth) : ""}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 20 }}>
              {[
                { label: "Accounts in view", value: analyzed.length, color: colors.accent },
                { label: "Accounts with a flag", value: summary.totalFlagged, color: colors.warn },
                { label: "Likely missing months", value: summary.missing, color: colors.danger },
                { label: "Low / spike months", value: summary.spikes, color: colors.danger },
                { label: "Off-pattern amounts", value: summary.offPattern, color: colors.warn },
              ].map((c) => (
                <div key={c.label} style={styles.card}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: 12.5, color: colors.inkMuted, marginTop: 4 }}>{c.label}</div>
                </div>
              ))}
            </div>

            <div style={{ ...styles.card, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Month-wise summary</div>
                <select value={effectiveSummaryMonth || ""} onChange={(e) => setSummaryMonth(e.target.value)} style={styles.select}>
                  {months.map((k) => <option key={k} value={k}>{monthKeyLabelFull(k)}</option>)}
                </select>
              </div>
              {flaggedThisMonth.length === 0 ? (
                <div style={{ fontSize: 13, color: colors.inkMuted }}>
                  Nothing unusual in {effectiveSummaryMonth ? monthKeyLabelFull(effectiveSummaryMonth) : "this period"} — {analyzed.length} account{analyzed.length === 1 ? "" : "s"} reviewed, all looked normal.
                </div>
              ) : (
                flaggedThisMonth.map((row) => (
                  <div key={row.acc.name} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, padding: "6px 0", borderTop: `1px solid ${colors.lineSoft}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0, background: FLAG_STYLES[row.flags[effectiveSummaryMonth]].fg }} />
                    <span>{monthSentence(row)}</span>
                  </div>
                ))
              )}
            </div>

            <div style={{ background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${colors.line}`, fontWeight: 700, fontSize: 14.5 }}>
                Monthly totals by account
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "10px 12px", background: colors.panel2, borderBottom: `1px solid ${colors.line}`, fontSize: 11, textTransform: "uppercase", color: colors.inkFaint, position: "sticky", left: 0 }}>Account</th>
                      {months.map((k) => (
                        <th key={k} style={{ textAlign: "right", padding: "10px 10px", background: colors.panel2, borderBottom: `1px solid ${colors.line}`, fontSize: 11, textTransform: "uppercase", color: colors.inkFaint }}>{monthKeyLabel(k)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analyzed.map(({ acc, flags }) => (
                      <React.Fragment key={acc.name}>
                        <tr onClick={() => setExpandedAcc(expandedAcc === acc.name ? null : acc.name)} style={{ cursor: "pointer" }}>
                          <td style={{ padding: "9px 12px", borderBottom: `1px solid ${colors.lineSoft}`, fontWeight: 600, background: colors.panel, position: "sticky", left: 0 }}>
                            {expandedAcc === acc.name ? <ChevronDown size={12} style={{ display: "inline", marginRight: 4 }} /> : <ChevronRight size={12} style={{ display: "inline", marginRight: 4 }} />}
                            {acc.name}
                            <span style={{ fontSize: 10.5, color: colors.inkFaint, marginLeft: 6, fontWeight: 500 }}>{acc.type}</span>
                          </td>
                          {months.map((k) => {
                            const style = FLAG_STYLES[flags[k]];
                            return (
                              <td key={k} style={{
                                padding: "9px 10px", textAlign: "right", borderBottom: `1px solid ${colors.lineSoft}`,
                                fontVariantNumeric: "tabular-nums", fontWeight: 600,
                                background: style ? style.bg : "transparent", color: style ? style.fg : colors.ink,
                              }}>
                                {fmtCompact(acc.byMonth[k] || 0)}
                                {style && <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.03em" }}>{style.label}</div>}
                              </td>
                            );
                          })}
                        </tr>
                        {expandedAcc === acc.name && (
                          <tr>
                            <td colSpan={months.length + 1} style={{ background: colors.panel2, padding: 16, borderBottom: `1px solid ${colors.line}` }}>
                              {months.filter((k) => (acc.txnsByMonth[k] || []).length).length === 0 && (
                                <div style={{ fontSize: 12.5, color: colors.inkFaint }}>No transactions booked to this account in the selected period.</div>
                              )}
                              {months.filter((k) => (acc.txnsByMonth[k] || []).length).map((k) => (
                                <div key={k} style={{ marginBottom: 10 }}>
                                  <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.inkMuted, marginBottom: 4 }}>
                                    {monthKeyLabel(k)} — {acc.txnsByMonth[k].length} transaction{acc.txnsByMonth[k].length > 1 ? "s" : ""}, total {fmtCompact(acc.byMonth[k] || 0)}
                                  </div>
                                  {acc.txnsByMonth[k].slice(0, 8).map((t, idx) => (
                                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0", color: "#334155" }}>
                                      <span>{t.contact}</span>
                                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{t.date.toLocaleDateString()} · {fmtCompact(t.amount)}</span>
                                    </div>
                                  ))}
                                  {acc.txnsByMonth[k].length > 8 && <div style={{ fontSize: 11.5, color: colors.inkFaint }}>+ {acc.txnsByMonth[k].length - 8} more…</div>}
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Dashboard support — reuses the exact same detection functions and
// default settings the tool itself ships with, so the consolidated report
// never drifts from what this tool would show you directly. Buckets by
// real year+month now, so it merges cleanly into the Dashboard's shared
// timeline alongside Duplicate Audit and Vendor Review.
function getObservations(transactions, coaAccounts, settingsOverride) {
  const accounts = accountsFromTransactions(transactions, coaAccounts);
  const defaultSettings = { lowPct: 50, highPct: 150, patternEnabled: true, patternThresholdPct: 50, patternTolerancePct: 3, materialityThreshold: 1000 };
  const settings = { ...defaultSettings, ...settingsOverride };
  const monthKeys = getGlobalMonthKeys(accounts);

  // Every flagged account gets its own paragraph with its own numbers —
  // nothing gets folded into "plus N others."
  const byMonth = new Map(); // "YYYY-MM" -> { missing: [], low: [], spike: [], pattern: [] }, items are {name, actual, typical}
  accounts.forEach((acc) => {
    if (classifyType(acc.type) !== "Expense") return; // matches this tool's default type filter
    const { flags, typical } = analyzeAccount(acc, monthKeys, settings);
    monthKeys.forEach((k) => {
      const f = flags[k];
      if (!f) return;
      if (!byMonth.has(k)) byMonth.set(k, { missing: [], low: [], spike: [], pattern: [] });
      byMonth.get(k)[f].push({ name: acc.name, actual: Math.abs(acc.byMonth[k] || 0), typical });
    });
  });

  const obs = [];
  byMonth.forEach((groups, k) => {
    const monthName = monthKeyLabel(k);
    const joinNames = (items) => { const n = items.map((i) => i.name); return n.length === 1 ? n[0] : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; };
    const wasWere = (items) => items.length === 1 ? "was" : "were";
    const missingParas = (items) => items.map((i) => `${i.name} typically posts around $${fmtCompact(i.typical)} a month, but nothing came through in ${monthName}.`);
    const lowParas = (items) => items.map((i) => `${i.name} came in at $${fmtCompact(i.actual)} this month, well below its typical $${fmtCompact(i.typical)}.`);
    const spikeParas = (items) => items.map((i) => `${i.name} came in at $${fmtCompact(i.actual)} this month, well above its typical $${fmtCompact(i.typical)}.`);
    const patternParas = (items) => items.map((i) => `${i.name} posted $${fmtCompact(i.actual)} this month, breaking from its usual steady pattern.`);

    if (groups.missing.length) obs.push({ module: "expense", monthKey: k, monthLabelStr: monthName, title: "Missing Expense",
      issue: `${joinNames(groups.missing)} ${wasWere(groups.missing)} due this month but nothing came through.`,
      recommendation: "Worth confirming nothing was missed.",
      detailedIssue: missingParas(groups.missing),
      detailedRecommendation: "Worth confirming nothing was missed, or booked to a different account by mistake." });
    if (groups.low.length) obs.push({ module: "expense", monthKey: k, monthLabelStr: monthName, title: "Below Usual Spend",
      issue: `${joinNames(groups.low)} came in lighter than usual this month.`,
      recommendation: "Could just be timing — worth a glance.",
      detailedIssue: lowParas(groups.low),
      detailedRecommendation: "Could just be timing — worth a glance to confirm nothing's outstanding." });
    if (groups.spike.length) obs.push({ module: "expense", monthKey: k, monthLabelStr: monthName, title: "Spend Spike",
      issue: `${joinNames(groups.spike)} ran higher than usual this month.`,
      recommendation: "Worth a quick look at what drove it.",
      detailedIssue: spikeParas(groups.spike),
      detailedRecommendation: "Worth a quick look at what drove it — a one-off charge or a new rate would explain it." });
    if (groups.pattern.length) obs.push({ module: "expense", monthKey: k, monthLabelStr: monthName, title: "Off-Pattern Posting",
      issue: `${joinNames(groups.pattern)} broke from ${groups.pattern.length === 1 ? "its" : "their"} usual pattern this month.`,
      recommendation: "Worth checking the coding looks right.",
      detailedIssue: patternParas(groups.pattern),
      detailedRecommendation: "Worth checking the coding looks right, or confirming it's a one-off." });
  });
  return obs;
}

export { getObservations };
export const ExpenseConsistencyAuditTool = { Component: ExpenseConsistencyAudit, getObservations };
export default ExpenseConsistencyAudit;
