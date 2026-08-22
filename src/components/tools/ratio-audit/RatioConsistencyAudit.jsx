import React, { useState, useMemo } from "react";
import { Upload, ChevronDown, ChevronRight, Search, Settings, X, Check, AlertTriangle, FileText } from "lucide-react";

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

function monthKeyLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${y}`;
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
function fmtPct(n) {
  if (n == null || !isFinite(n)) return "—";
  return (n * 100).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%";
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
function accountsFromTransactions(transactions, coaAccounts) {
  const coaTypeByName = {};
  (coaAccounts || []).forEach((e) => { if (e.name) coaTypeByName[e.name.trim().toLowerCase()] = e.type; });
  const map = {};
  (transactions || []).forEach((t) => {
    if (!t.account || !t.date) return;
    if (!map[t.account]) {
      map[t.account] = { name: t.account, type: t.accountType || coaTypeByName[t.account.trim().toLowerCase()] || "", byMonth: {} };
    }
    const acc = map[t.account];
    const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
    acc.byMonth[key] = (acc.byMonth[key] || 0) + t.amount;
  });
  Object.values(map).forEach((a) => { if (!a.type) a.type = "Other"; });
  return Object.values(map);
}
function getGlobalMonthKeys(accounts) {
  const set = new Set();
  (accounts || []).forEach((a) => Object.keys(a.byMonth).forEach((k) => set.add(k)));
  return [...set].sort();
}

// Total sales for a given month = sum of every Revenue-classified
// account's activity that month. Absolute value, since revenue can be
// signed either way depending on the export's convention — what matters
// here is magnitude, not the sign.
function salesByMonth(accounts, monthKeys) {
  const sales = {};
  monthKeys.forEach((k) => { sales[k] = 0; });
  accounts.forEach((acc) => {
    if (classifyType(acc.type) !== "Revenue") return;
    monthKeys.forEach((k) => { sales[k] += Math.abs(acc.byMonth[k] || 0); });
  });
  return sales;
}

// For one expense account: ratio to sales per month, a "typical" ratio
// (median across months with real sales), and which months drift far
// enough from that typical ratio to flag — same low/high-band approach
// as the Expense Booking Checker, just applied to a ratio instead of a
// raw dollar amount.
function analyzeRatioAccount(acc, monthKeys, sales, settings) {
  const { lowPct, highPct, minHistoryMonths, materialityThreshold } = settings;
  const ratios = {};
  const dollars = {};
  monthKeys.forEach((k) => {
    dollars[k] = Math.abs(acc.byMonth[k] || 0);
    ratios[k] = sales[k] > 0.005 ? dollars[k] / sales[k] : null; // no sales that month = no ratio, not a flag
  });

  const validRatios = monthKeys.map((k) => ratios[k]).filter((r) => r != null && r > 0);
  const typicalDollar = median(monthKeys.map((k) => dollars[k]).filter((v) => v > 0.005));
  const flags = {};
  monthKeys.forEach((k) => { flags[k] = null; });
  let typicalRatio = 0;

  // Two gates before flagging anything: enough history to trust a
  // "typical" ratio, and the expense itself has to be material — a $40
  // line item swinging from 0.1% to 0.3% of sales isn't worth a flag.
  if (validRatios.length >= minHistoryMonths && typicalDollar >= materialityThreshold) {
    typicalRatio = median(validRatios);
    if (typicalRatio > 0) {
      monthKeys.forEach((k) => {
        const r = ratios[k];
        if (r == null) return;
        const rel = r / typicalRatio;
        if (r < 0.0005 && typicalRatio > 0.005) flags[k] = "missing"; // ratio collapsed to ~0 while sales existed
        else if (rel < lowPct / 100) flags[k] = "low";
        else if (rel > highPct / 100) flags[k] = "spike";
      });
    }
  }
  const flagCount = Object.values(flags).filter((f) => f).length;
  return { ratios, dollars, typicalRatio, typicalDollar, flags, flagCount };
}

const FLAG_STYLES = {
  missing: { label: "MISSING", bg: colors.dangerSoft, fg: colors.danger },
  spike: { label: "ABOVE USUAL", bg: colors.dangerSoft, fg: colors.danger },
  low: { label: "BELOW USUAL", bg: colors.warnSoft, fg: colors.warn },
};
const FLAG_ORDER = { missing: 0, spike: 1, low: 2 };

function RatioConsistencyAudit({ transactions, coaAccounts }) {
  const accounts = useMemo(() => accountsFromTransactions(transactions, coaAccounts), [transactions, coaAccounts]);
  const monthKeys = useMemo(() => getGlobalMonthKeys(accounts), [accounts]);
  const sales = useMemo(() => salesByMonth(accounts, monthKeys), [accounts, monthKeys]);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("flags");
  const [expandedAcc, setExpandedAcc] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({ lowPct: 10, highPct: 400, minHistoryMonths: 3, materialityThreshold: 5000 });

  const expenseAccounts = useMemo(
    () => accounts.filter((a) => classifyType(a.type) === "Expense" && (!search || a.name.toLowerCase().includes(search.toLowerCase()))),
    [accounts, search]
  );

  const analyzed = useMemo(() => {
    let result = expenseAccounts.map((a) => ({ acc: a, ...analyzeRatioAccount(a, monthKeys, sales, settings) }));
    if (sortMode === "flags") result.sort((a, b) => b.flagCount - a.flagCount || a.acc.name.localeCompare(b.acc.name));
    else if (sortMode === "name") result.sort((a, b) => a.acc.name.localeCompare(b.acc.name));
    else if (sortMode === "ratio") result.sort((a, b) => b.typicalRatio - a.typicalRatio);
    return result;
  }, [expenseAccounts, monthKeys, sales, settings, sortMode]);

  const summary = useMemo(() => {
    const totalFlagged = analyzed.filter((a) => a.flagCount > 0).length;
    const spikes = analyzed.reduce((s, a) => s + Object.values(a.flags).filter((f) => f === "spike").length, 0);
    const low = analyzed.reduce((s, a) => s + Object.values(a.flags).filter((f) => f === "low" || f === "missing").length, 0);
    const zeroSalesMonths = monthKeys.filter((k) => sales[k] <= 0.005).length;
    return { totalFlagged, spikes, low, zeroSalesMonths };
  }, [analyzed, monthKeys, sales]);

  const latestMonth = monthKeys[monthKeys.length - 1];

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={styles.eyebrow}>RATIO CONSISTENCY AUDIT</div>
          <h1 style={styles.h1}>Expense-to-Sales Ratio Audit</h1>
          <p style={styles.subtitle}>
            Each expense account's share of total sales, month over month — flags months where that share drifts far from what's typical, which a flat dollar check alone would miss.
          </p>
        </div>
        <button onClick={() => setSettingsOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${colors.line}`, borderRadius: 20, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
          <Settings size={14} /> Settings
        </button>
      </div>

      {!transactions || !transactions.length ? (
        <div style={{ ...styles.card, color: colors.inkMuted, fontSize: 13 }}>
          Upload and map your Account Transactions export in <b>Shared Files</b> to run this audit.
        </div>
      ) : monthKeys.length === 0 ? (
        <div style={{ ...styles.card, color: colors.inkMuted, fontSize: 13 }}>No dated transactions found.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
            <div style={styles.card}>
              <div style={{ fontSize: 24, fontWeight: 800, color: colors.danger }}>{summary.totalFlagged}</div>
              <div style={{ fontSize: 12.5, color: colors.inkMuted, marginTop: 4 }}>Accounts with a flagged month</div>
            </div>
            <div style={styles.card}>
              <div style={{ fontSize: 24, fontWeight: 800, color: colors.danger }}>{summary.spikes}</div>
              <div style={{ fontSize: 12.5, color: colors.inkMuted, marginTop: 4 }}>Months above usual share</div>
            </div>
            <div style={styles.card}>
              <div style={{ fontSize: 24, fontWeight: 800, color: colors.warn }}>{summary.low}</div>
              <div style={{ fontSize: 12.5, color: colors.inkMuted, marginTop: 4 }}>Months below/missing usual share</div>
            </div>
            {summary.zeroSalesMonths > 0 && (
              <div style={styles.card}>
                <div style={{ fontSize: 24, fontWeight: 800, color: colors.inkFaint }}>{summary.zeroSalesMonths}</div>
                <div style={{ fontSize: 12.5, color: colors.inkMuted, marginTop: 4 }}>Month{summary.zeroSalesMonths === 1 ? "" : "s"} with no recorded sales — skipped</div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: colors.inkFaint }} />
              <input
                type="text" placeholder="Search expense accounts…" value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%", padding: "8px 10px 8px 32px", border: `1px solid ${colors.line}`, borderRadius: 8, fontSize: 13.5 }}
              />
            </div>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} style={styles.select}>
              <option value="flags">Sort by flags</option>
              <option value="name">Sort by name</option>
              <option value="ratio">Sort by typical ratio</option>
            </select>
          </div>

          <div style={{ ...styles.card, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: colors.panel2 }}>
                  <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, textTransform: "uppercase", color: colors.inkFaint }}>Expense account</th>
                  <th style={{ textAlign: "right", padding: "10px 14px", fontSize: 11, textTransform: "uppercase", color: colors.inkFaint }}>Typical share of sales</th>
                  <th style={{ textAlign: "right", padding: "10px 14px", fontSize: 11, textTransform: "uppercase", color: colors.inkFaint }}>{latestMonth ? monthKeyLabel(latestMonth) : ""}</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, textTransform: "uppercase", color: colors.inkFaint }}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {analyzed.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: "24px 14px", color: colors.inkFaint, fontSize: 13 }}>No expense accounts match.</td></tr>
                )}
                {analyzed.map((a) => {
                  const latestFlag = latestMonth ? a.flags[latestMonth] : null;
                  const worstFlag = a.flagCount > 0
                    ? Object.values(a.flags).filter((f) => f).sort((x, y) => FLAG_ORDER[x] - FLAG_ORDER[y])[0]
                    : null;
                  return (
                    <React.Fragment key={a.acc.name}>
                      <tr
                        onClick={() => setExpandedAcc(expandedAcc === a.acc.name ? null : a.acc.name)}
                        style={{ cursor: "pointer", borderTop: `1px solid ${colors.lineSoft}` }}
                      >
                        <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                          {expandedAcc === a.acc.name ? <ChevronDown size={12} style={{ display: "inline", marginRight: 4 }} /> : <ChevronRight size={12} style={{ display: "inline", marginRight: 4 }} />}
                          {a.acc.name}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{a.typicalRatio > 0 ? fmtPct(a.typicalRatio) : "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: latestFlag ? FLAG_STYLES[latestFlag].fg : colors.ink }}>
                          {latestMonth && a.ratios[latestMonth] != null ? fmtPct(a.ratios[latestMonth]) : "—"}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {a.flagCount === 0 ? (
                            <span style={{ fontSize: 11.5, color: colors.inkFaint }}>—</span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 10, background: FLAG_STYLES[worstFlag].bg, color: FLAG_STYLES[worstFlag].fg }}>
                              {a.flagCount} month{a.flagCount === 1 ? "" : "s"} flagged
                            </span>
                          )}
                        </td>
                      </tr>
                      {expandedAcc === a.acc.name && (
                        <tr>
                          <td colSpan={4} style={{ padding: "10px 14px 16px 34px", background: colors.panel2 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                              {monthKeys.map((k) => {
                                const flag = a.flags[k];
                                const r = a.ratios[k];
                                return (
                                  <div key={k} style={{ background: "#fff", border: `1px solid ${colors.line}`, borderRadius: 8, padding: "8px 10px" }}>
                                    <div style={{ fontSize: 10.5, color: colors.inkFaint, fontWeight: 700 }}>{monthKeyLabel(k)}</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{r != null ? fmtPct(r) : "—"}</div>
                                    <div style={{ fontSize: 10.5, color: colors.inkMuted }}>{fmtCompact(a.dollars[k])} / {fmtCompact(sales[k])} sales</div>
                                    {flag && (
                                      <div style={{ fontSize: 9.5, fontWeight: 700, marginTop: 4, color: FLAG_STYLES[flag].fg }}>{FLAG_STYLES[flag].label}</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

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
              <label style={styles.label}>Low threshold — {settings.lowPct}%</label>
              <div style={{ fontSize: 11.5, color: colors.inkMuted, marginBottom: 6 }}>Flag if this month's ratio falls below this % of the account's typical ratio.</div>
              <input type="range" min={10} max={90} value={settings.lowPct} onChange={(e) => setSettings((s) => ({ ...s, lowPct: Number(e.target.value) }))} style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={styles.label}>High threshold — {settings.highPct}%</label>
              <div style={{ fontSize: 11.5, color: colors.inkMuted, marginBottom: 6 }}>Flag if this month's ratio rises above this % of the account's typical ratio.</div>
              <input type="range" min={110} max={400} value={settings.highPct} onChange={(e) => setSettings((s) => ({ ...s, highPct: Number(e.target.value) }))} style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={styles.label}>Minimum history — {settings.minHistoryMonths} months</label>
              <div style={{ fontSize: 11.5, color: colors.inkMuted, marginBottom: 6 }}>Months of ratio data needed before trusting a "typical" ratio.</div>
              <input type="range" min={1} max={6} value={settings.minHistoryMonths} onChange={(e) => setSettings((s) => ({ ...s, minHistoryMonths: Number(e.target.value) }))} style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: 4 }}>
              <label style={styles.label}>Materiality — ${settings.materialityThreshold.toLocaleString()}</label>
              <div style={{ fontSize: 11.5, color: colors.inkMuted, marginBottom: 6 }}>Accounts whose typical monthly amount is below this are skipped.</div>
              <input type="range" min={500} max={10000} step={250} value={settings.materialityThreshold} onChange={(e) => setSettings((s) => ({ ...s, materialityThreshold: Number(e.target.value) }))} style={{ width: "100%" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Dashboard support — same analysis, using this tool's own shipped
// defaults (or the Reports page's overrides, if provided).
function getObservations(transactions, coaAccounts, settingsOverride) {
  const accounts = accountsFromTransactions(transactions, coaAccounts);
  const monthKeys = getGlobalMonthKeys(accounts);
  const sales = salesByMonth(accounts, monthKeys);
  const defaultSettings = { lowPct: 10, highPct: 400, minHistoryMonths: 3, materialityThreshold: 5000 };
  const settings = { ...defaultSettings, ...settingsOverride };

  const byMonth = new Map(); // "YYYY-MM" -> { spike: [], low: [] }, items are {name, ratio, typicalRatio}
  accounts.forEach((acc) => {
    if (classifyType(acc.type) !== "Expense") return;
    const { flags, ratios, typicalRatio } = analyzeRatioAccount(acc, monthKeys, sales, settings);
    monthKeys.forEach((k) => {
      const f = flags[k];
      if (!f) return;
      if (!byMonth.has(k)) byMonth.set(k, { spike: [], low: [] });
      byMonth.get(k)[f === "spike" ? "spike" : "low"].push({ name: acc.name, ratio: ratios[k], typicalRatio });
    });
  });

  const obs = [];
  byMonth.forEach((groups, k) => {
    const monthName = monthKeyLabel(k);
    const joinNames = (items) => { const n = items.map((i) => i.name); return n.length === 1 ? n[0] : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; };
    const spikeParas = (items) => items.map((i) => `${i.name} was ${fmtPct(i.ratio)} of sales this month, well above its typical ${fmtPct(i.typicalRatio)}.`);
    const lowParas = (items) => items.map((i) => `${i.name} was ${fmtPct(i.ratio)} of sales this month, well below its typical ${fmtPct(i.typicalRatio)}.`);
    if (groups.spike.length) obs.push({ module: "ratio", monthKey: k, monthLabelStr: monthName, title: "Ratio Above Usual",
      issue: `${joinNames(groups.spike)} took a bigger bite out of sales than usual this month.`,
      recommendation: "Worth a closer look.",
      detailedIssue: spikeParas(groups.spike),
      detailedRecommendation: "Worth a closer look — check whether it grew in step with sales or on its own." });
    if (groups.low.length) obs.push({ module: "ratio", monthKey: k, monthLabelStr: monthName, title: "Ratio Below Usual",
      issue: `${joinNames(groups.low)} took a smaller share of sales than usual this month.`,
      recommendation: "Worth checking nothing was missed or miscoded.",
      detailedIssue: lowParas(groups.low),
      detailedRecommendation: "Worth checking nothing was missed or miscoded this month." });
  });
  return obs;
}

export { getObservations };
export const RatioConsistencyAuditTool = { Component: RatioConsistencyAudit, getObservations };
export default RatioConsistencyAudit;
