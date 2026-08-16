import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Upload, ChevronRight, Settings, X } from "lucide-react";


/* ============================================================
   SHARED FOUNDATION — same tokens/mapper pattern as
   ExpenseConsistencyAudit.jsx. Inlined here for a single
   testable file; imported from shared/ once merged.
   ============================================================ */

const colors = {
  bg: "#F8FAFC", panel: "#FFFFFF", panel2: "#FAFBFC",
  line: "#E2E8F0", lineSoft: "#EDF1F5",
  ink: "#0F1B2D", inkMuted: "#64748B", inkFaint: "#94A3B8",
  accent: "#17375E", accentSoft: "#EAF0F7",
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

function fmtAmt(n) {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) { return String(s == null ? "" : s); }

/* ============================================================
   MODULE-SPECIFIC LOGIC — Duplicate Transaction Audit
   Built on the shared normalized transactions instead of its
   own file upload/mapping.
   ============================================================ */

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function monthKey(dnum) { return Math.floor(dnum / 100); }
function monthLabel(mk) {
  const y = Math.floor(mk / 100), m = (mk % 100) - 1;
  return MONTH_NAMES[m] + " " + y;
}
function fmtDnum(dnum) {
  const s = String(dnum);
  return s.slice(4, 6) + "/" + s.slice(6, 8) + "/" + s.slice(0, 4);
}

// tx: [dnum, vendor, amount, accountKey]; accounts: {accountKey: [accountName, accountType]}
function buildDatasetFromTransactions(transactions) {
  const accounts = {};
  const tx = [];
  (transactions || []).forEach((t) => {
    if (!t.date || !t.account) return;
    const vendor = t.vendor || t.description || "(unspecified)";
    const accountKey = t.accountCode || t.account;
    if (!(accountKey in accounts)) accounts[accountKey] = [t.account, t.accountType || ""];
    const dnum = t.date.getFullYear() * 10000 + (t.date.getMonth() + 1) * 100 + t.date.getDate();
    tx.push([dnum, String(vendor), t.amount, accountKey]);
  });
  return { accounts, tx };
}

function getMonths(data) {
  const set = new Set();
  data.tx.forEach((t) => set.add(monthKey(t[0])));
  return Array.from(set).sort((a, b) => a - b);
}

// Flags a vendor/account when: it was mostly single-transaction in the
// months it does have activity in (any month, not just prior ones), AND
// the selected month shows 2+ transactions. Two guardrails keep this from
// over-flagging: a minimum number of other active months before a pattern
// counts as established, and a dollar floor so tiny amounts don't clutter
// the results.
function analyzeGroup(data, months, selectedMonth, thresholdPct, minHistoryMonths, materialityThreshold, keyFn, labelFn) {
  const groups = new Map();
  data.tx.forEach((t) => {
    const m = monthKey(t[0]);
    const k = keyFn(t);
    if (!groups.has(k)) groups.set(k, new Map());
    const gm = groups.get(k);
    if (!gm.has(m)) gm.set(m, []);
    gm.get(m).push(t);
  });

  const flagged = [];
  const noHistory = [];
  groups.forEach((monthMap, key) => {
    const otherActive = months.filter((m) => m !== selectedMonth && monthMap.has(m));
    const thisTx = monthMap.get(selectedMonth) || [];
    const thisCount = thisTx.length;
    if (otherActive.length < minHistoryMonths) {
      if (thisCount > 0) noHistory.push({ key, label: labelFn(key), thisCount });
      return;
    }
    const singleCount = otherActive.filter((m) => monthMap.get(m).length === 1).length;
    const freq = (singleCount / otherActive.length) * 100;
    const thisAmt = thisTx.reduce((s, t) => s + t[2], 0);
    if (freq >= thresholdPct && thisCount >= 2 && Math.abs(thisAmt) >= materialityThreshold) {
      flagged.push({ key, label: labelFn(key), thisCount, thisTx, freq, otherActive, monthMap, thisAmt });
    }
  });
  flagged.sort((a, b) => b.freq - a.freq || b.thisCount - a.thisCount);
  noHistory.sort((a, b) => a.label.localeCompare(b.label));
  return { flagged, noHistory };
}

function Ledger({ title, tag, results, noHistory, nounSingular, months, selectedMonth }) {
  const [openIdx, setOpenIdx] = useState(null);
  const [nhOpen, setNhOpen] = useState(false);
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `2px solid ${colors.ink}`, paddingBottom: 8, marginBottom: 4 }}>
        <div style={{ fontWeight: 800, fontSize: 16, display: "flex", gap: 8, alignItems: "baseline" }}>
          {title} <span style={{ fontWeight: 500, fontSize: 11.5, color: colors.inkFaint, textTransform: "uppercase" }}>{tag}</span>
        </div>
        <div style={{ fontSize: 12, color: colors.inkMuted }}>{results.length} flagged</div>
      </div>

      {results.length === 0 ? (
        <div style={{ padding: "24px 4px", fontSize: 13, color: colors.inkFaint }}>No groups meet the flag criteria for this month at the selected threshold.</div>
      ) : (
        <div style={{ border: `1px solid ${colors.line}`, borderRadius: 8, overflow: "hidden", marginTop: 8 }}>
          {results.map((res, i) => (
            <div key={res.key} style={{ borderBottom: i < results.length - 1 ? `1px solid ${colors.lineSoft}` : "none" }}>
              <div
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", cursor: "pointer", background: colors.panel }}
              >
                <ChevronRight size={13} style={{ transform: openIdx === i ? "rotate(90deg)" : "none", transition: "transform .12s", color: colors.inkFaint, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{esc(res.label)}</div>
                  <div style={{ fontSize: 11.5, color: colors.inkFaint }}>{res.otherActive.length} other active month{res.otherActive.length === 1 ? "" : "s"} on file · {Math.round(res.freq)}% single-tx</div>
                </div>
                <div style={{ fontSize: 12.5, color: colors.inkMuted }}><b style={{ color: colors.ink }}>{res.thisCount}</b> tx this month</div>
                <div style={{ fontSize: 12.5, color: colors.inkMuted }}>this month <b style={{ color: colors.ink }}>{fmtAmt(res.thisAmt)}</b></div>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.danger, background: colors.dangerSoft, padding: "3px 10px", borderRadius: 12 }}>Possible duplicate</span>
              </div>
              {openIdx === i && (
                <div style={{ padding: "0 14px 16px 41px", background: colors.panel2 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.inkMuted, margin: "10px 0 6px" }}>This month's transactions ({res.thisCount})</div>
                  <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%", maxWidth: 480 }}>
                    <tbody>
                      {res.thisTx.map((t, k) => (
                        <tr key={k}>
                          <td style={{ padding: "3px 10px 3px 0", color: colors.inkMuted }}>{fmtDnum(t[0])}</td>
                          <td style={{ padding: "3px 10px 3px 0" }}>{esc(t[1])}</td>
                          <td style={{ padding: "3px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtAmt(t[2])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.inkMuted, margin: "14px 0 6px" }}>
                    Monthly pattern — {res.otherActive.length} other active month{res.otherActive.length === 1 ? "" : "s"}, {Math.round(res.freq)}% single-transaction
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {months.filter((m) => m === selectedMonth || res.monthMap.has(m)).map((m) => {
                      const t = res.monthMap.get(m);
                      const count = t ? t.length : 0;
                      const isThis = m === selectedMonth;
                      const isMulti = t && t.length > 1;
                      return (
                        <span key={m} style={{
                          fontSize: 11, padding: "4px 9px", borderRadius: 12,
                          background: isThis ? colors.accent : isMulti ? colors.dangerSoft : colors.panel2,
                          color: isThis ? "#fff" : isMulti ? colors.danger : colors.inkMuted,
                          border: isThis ? "none" : `1px solid ${colors.line}`,
                        }}>
                          {monthLabel(m)} · {count}{isThis ? " (this month)" : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {noHistory.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div onClick={() => setNhOpen((v) => !v)} style={{ fontSize: 12, color: colors.inkFaint, cursor: "pointer" }}>
            + {noHistory.length} {nounSingular}{noHistory.length === 1 ? "" : "s"} with not enough other-month history this period (shown for reference, not flagged)
          </div>
          {nhOpen && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {noHistory.map((n) => (
                <span key={n.key} style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 12, background: colors.panel2, border: `1px solid ${colors.line}`, color: colors.inkMuted }}>
                  {esc(n.label)} · {n.thisCount} tx
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function duplicateSentence(res, kind) {
  const extra = res.thisTx.slice(0, 2).map((t) => fmtAmt(t[2])).join(" and ");
  return (
    <>
      <b>{esc(res.label)}</b> ({kind}) shows <b>{res.thisCount}</b> transactions this month ({extra}
      {res.thisCount > 2 ? `, +${res.thisCount - 2} more` : ""}, total {fmtAmt(res.thisAmt)}) — but posted only once in {Math.round(res.freq)}%
      of its {res.otherActive.length} other active month{res.otherActive.length === 1 ? "" : "s"}.
    </>
  );
}

function DuplicateTransactionAudit({ transactions }) {
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [threshold, setThreshold] = useState(80);
  const [minHistoryMonths, setMinHistoryMonths] = useState(3);
  const [materialityThreshold, setMaterialityThreshold] = useState(1000);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const dataset = useMemo(() => buildDatasetFromTransactions(transactions), [transactions]);
  const months = useMemo(() => (dataset.tx.length ? getMonths(dataset) : []), [dataset]);

  useEffect(() => {
    if (months.length && (selectedMonth == null || !months.includes(selectedMonth))) {
      setSelectedMonth(months[months.length - 1]);
    }
  }, [months]);

  const vendorRes = useMemo(() => {
    if (!dataset.tx.length || selectedMonth == null) return { flagged: [], noHistory: [] };
    return analyzeGroup(dataset, months, selectedMonth, threshold, minHistoryMonths, materialityThreshold, (t) => t[1], (k) => k);
  }, [dataset, months, selectedMonth, threshold, minHistoryMonths, materialityThreshold]);

  const accountRes = useMemo(() => {
    if (!dataset.tx.length || selectedMonth == null) return { flagged: [], noHistory: [] };
    return analyzeGroup(dataset, months, selectedMonth, threshold, minHistoryMonths, materialityThreshold, (t) => dataset.accounts[t[3]][0], (k) => k);
  }, [dataset, months, selectedMonth, threshold, minHistoryMonths, materialityThreshold]);

  const summary = useMemo(() => {
    if (!dataset.tx.length || selectedMonth == null) return null;
    const thisMonthTxCount = dataset.tx.filter((t) => monthKey(t[0]) === selectedMonth).length;
    const flaggedAmt = vendorRes.flagged.reduce((s, r) => s + Math.abs(r.thisAmt), 0) + accountRes.flagged.reduce((s, r) => s + Math.abs(r.thisAmt), 0);
    return { thisMonthTxCount, flaggedAmt };
  }, [dataset, selectedMonth, vendorRes, accountRes]);

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 24, borderBottom: `1px solid ${colors.line}`, paddingBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={styles.h1}>Duplicate Transaction Audit</h1>
            <p style={styles.subtitle}>Flags vendors and accounts that normally post once a month but show 2 or more transactions this month.</p>
          </div>
          {dataset.tx.length > 0 && (
            <button
              onClick={() => setSettingsOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${colors.line}`, borderRadius: 20, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}
            >
              <Settings size={14} /> Settings
            </button>
          )}
        </div>

        {(!transactions || !dataset.tx.length) && (
          <div style={{ ...styles.card, textAlign: "center", padding: 40 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No shared file loaded yet</div>
            <div style={{ fontSize: 13, color: colors.inkMuted }}>Upload and map your Account Transactions export in <b>Shared Files</b> to run this audit.</div>
          </div>
        )}

        {dataset.tx.length > 0 && summary && (
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
                    <label style={styles.label}>Consistency required across other active months</label>
                    <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ ...styles.select, width: "100%" }}>
                      <option value={100}>100% — single tx every other active month</option>
                      <option value={80}>80% or more of other active months</option>
                      <option value={60}>60% or more of other active months</option>
                      <option value={50}>50% or more of other active months</option>
                    </select>
                    <div style={{ fontSize: 11.5, color: colors.inkFaint, marginTop: 4 }}>
                      Checked against every other month with activity, not just prior ones — a vendor's whole history counts, whichever month you're reviewing.
                    </div>
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <label style={styles.label}>Minimum history required — {minHistoryMonths} month{minHistoryMonths === 1 ? "" : "s"}</label>
                    <input type="range" min={1} max={6} value={minHistoryMonths} onChange={(e) => setMinHistoryMonths(Number(e.target.value))} style={{ width: "100%" }} />
                    <div style={{ fontSize: 11.5, color: colors.inkFaint }}>Don't flag a vendor/account unless it has at least this many other active months on file — avoids treating one lucky month as proof of a pattern.</div>
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <label style={styles.label}>Materiality threshold — ${materialityThreshold.toLocaleString()}</label>
                    <input type="range" min={500} max={10000} step={250} value={materialityThreshold} onChange={(e) => setMaterialityThreshold(Number(e.target.value))} style={{ width: "100%" }} />
                    <div style={{ fontSize: 11.5, color: colors.inkFaint }}>Ignore flags where this month's total for that vendor/account falls under this amount.</div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", ...styles.card, marginBottom: 20 }}>
              <div>
                <div style={styles.label}>Month under review</div>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} style={styles.select}>
                  {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 11.5, color: colors.inkFaint, maxWidth: 320 }}>
                A vendor/account is flagged only when its other active months were mostly single-transaction <em>and</em> this month shows 2 or more.
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 8 }}>
              {[
                { label: "Transactions this month", value: summary.thisMonthTxCount, color: colors.accent },
                { label: "Vendors flagged", value: vendorRes.flagged.length, color: colors.danger },
                { label: "Accounts flagged", value: accountRes.flagged.length, color: colors.danger },
                { label: "Flagged value, this month", value: fmtAmt(summary.flaggedAmt), color: colors.danger },
              ].map((c) => (
                <div key={c.label} style={styles.card}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: 12.5, color: colors.inkMuted, marginTop: 4 }}>{c.label}</div>
                </div>
              ))}
            </div>

            <div style={{ ...styles.card, marginTop: 20, marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
                Summary — {monthLabel(selectedMonth)}
              </div>
              {vendorRes.flagged.length === 0 && accountRes.flagged.length === 0 ? (
                <div style={{ fontSize: 13, color: colors.inkMuted }}>
                  Nothing unusual in {monthLabel(selectedMonth)} — {summary.thisMonthTxCount} transaction{summary.thisMonthTxCount === 1 ? "" : "s"} reviewed, no vendor or account broke its usual once-a-month pattern.
                </div>
              ) : (
                <>
                  {vendorRes.flagged.map((res) => (
                    <div key={"v-" + res.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, padding: "6px 0", borderTop: `1px solid ${colors.lineSoft}` }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0, background: colors.danger }} />
                      <span>{duplicateSentence(res, "vendor")}</span>
                    </div>
                  ))}
                  {accountRes.flagged.map((res) => (
                    <div key={"a-" + res.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, padding: "6px 0", borderTop: `1px solid ${colors.lineSoft}` }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0, background: colors.danger }} />
                      <span>{duplicateSentence(res, "account")}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <Ledger title="Vendors" tag="grouped by contact / payee" results={vendorRes.flagged} noHistory={vendorRes.noHistory} nounSingular="vendor" months={months} selectedMonth={selectedMonth} />
            <Ledger title="Accounts" tag="grouped by ledger account" results={accountRes.flagged} noHistory={accountRes.noHistory} nounSingular="account" months={months} selectedMonth={selectedMonth} />

            <div style={{ marginTop: 30, fontSize: 11.5, color: colors.inkFaint, borderTop: `1px solid ${colors.line}`, paddingTop: 14 }}>
              Duplicate detection is a review aid, not an accounting determination — always confirm flagged pairs against source receipts.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Dashboard support — same analyzeGroup logic, evaluated across every
// month in the dataset using this tool's own shipped defaults (or the
// Reports page's overrides, if provided).
function getObservations(transactions, settingsOverride) {
  const dataset = buildDatasetFromTransactions(transactions);
  if (!dataset.tx.length) return [];
  const s = { thresholdPct: 80, minHistoryMonths: 3, materialityThreshold: 1000, ...settingsOverride };
  const months = getMonths(dataset);
  const obs = [];
  months.forEach((m) => {
    const vRes = analyzeGroup(dataset, months, m, s.thresholdPct, s.minHistoryMonths, s.materialityThreshold, (t) => t[1], (k) => k);
    vRes.flagged.forEach((r) => obs.push({ module: "duplicate", monthKey: m, monthLabelStr: monthLabel(m), text: `${r.label} — ${r.thisCount} transactions in ${monthLabel(m)} totaling ${fmtAmt(r.thisAmt)}, versus the usual one; confirm this isn't a duplicate payment.` }));
    const aRes = analyzeGroup(dataset, months, m, s.thresholdPct, s.minHistoryMonths, s.materialityThreshold, (t) => dataset.accounts[t[3]][0], (k) => k);
    aRes.flagged.forEach((r) => obs.push({ module: "duplicate", monthKey: m, monthLabelStr: monthLabel(m), text: `${r.label} (account) — ${r.thisCount} transactions in ${monthLabel(m)} totaling ${fmtAmt(r.thisAmt)}, versus the usual one; confirm this isn't a duplicate payment.` }));
  });
  return obs;
}

export { getObservations };
export const DuplicateTransactionAuditTool = { Component: DuplicateTransactionAudit, getObservations };
export default DuplicateTransactionAudit;
