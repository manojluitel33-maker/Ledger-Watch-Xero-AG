import React, { useState, useMemo, useEffect } from "react";
import { Settings, X, ArrowRight, Landmark, FileText, Check, AlertTriangle } from "lucide-react";
import { shellColors } from "../../constants/theme";
import { DASHBOARD_MODULES } from "../../constants/tools";
import { ExpenseConsistencyAuditTool } from "../tools/expense-audit";
import { DuplicateTransactionAuditTool } from "../tools/duplicate-audit";
import { VendorExceptionFlaggerTool } from "../tools/vendor-exceptions";

function DashboardScreen({ transactions, coaAccounts, bankRecoSnapshot, bankFiles, onToggleBankReco, onRunReconciliation }) {
  const [activeModules, setActiveModules] = useState(new Set(DASHBOARD_MODULES.map((m) => m.key)));
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const MONTH_NAMES_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // One place to tune every module's thresholds for this report — separate
  // from each live tool's own settings, which are untouched by this.
  const [reportSettings, setReportSettings] = useState({
    expense: { lowPct: 50, highPct: 150, patternEnabled: true, patternThresholdPct: 50, patternTolerancePct: 3, materialityThreshold: 1000 },
    duplicate: { thresholdPct: 80, minHistoryMonths: 3, materialityThreshold: 1000 },
    vendor: { dualCategoryThresholdPct: 30, materialityThreshold: 1000 },
  });
  const updateSetting = (module, key, value) => {
    setReportSettings((prev) => ({ ...prev, [module]: { ...prev[module], [key]: value } }));
  };

  const toggleModule = (key) => {
    setActiveModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      if (next.size === 0) return new Set(DASHBOARD_MODULES.map((m) => m.key));
      return next;
    });
  };

  const expenseObs = useMemo(() => {
    if (!transactions || !transactions.length) return [];
    try { return ExpenseConsistencyAuditTool.getObservations(transactions, coaAccounts, reportSettings.expense); } catch (e) { return []; }
  }, [transactions, coaAccounts, reportSettings.expense]);

  const duplicateObs = useMemo(() => {
    if (!transactions || !transactions.length) return [];
    try { return DuplicateTransactionAuditTool.getObservations(transactions, reportSettings.duplicate); } catch (e) { return []; }
  }, [transactions, reportSettings.duplicate]);

  const vendorObs = useMemo(() => {
    if (!transactions || !transactions.length) return [];
    try { return VendorExceptionFlaggerTool.getObservations(transactions, coaAccounts, reportSettings.vendor); } catch (e) { return []; }
  }, [transactions, coaAccounts, reportSettings.vendor]);

  const reconciliationObs = useMemo(() => {
    if (!bankRecoSnapshot || !bankRecoSnapshot.length) return [];
    const obs = [];
    bankRecoSnapshot.forEach((run) => {
      const { results, account, month } = run;
      if (!results) return;
      const monthLbl = month ? `${MONTH_NAMES_FULL[Number(month.split("-")[1]) - 1]} ${month.split("-")[0]}` : "the reconciled period";
      if (results.possible?.length) obs.push({ module: "reconciliation", monthKey: month, monthLabelStr: monthLbl, text: `${account} — ${results.possible.length} item${results.possible.length === 1 ? "" : "s"} in ${monthLbl} matched on amount but not date; needs review.` });
      if (results.xeroOnly?.length) obs.push({ module: "reconciliation", monthKey: month, monthLabelStr: monthLbl, text: `${account} — ${results.xeroOnly.length} entr${results.xeroOnly.length === 1 ? "y" : "ies"} booked in Xero for ${monthLbl} not yet reflected in the bank.` });
      if (results.bankOnly?.length) obs.push({ module: "reconciliation", monthKey: month, monthLabelStr: monthLbl, text: `${account} — ${results.bankOnly.length} bank item${results.bankOnly.length === 1 ? "" : "s"} for ${monthLbl} not yet recorded in Xero.` });
    });
    return obs;
  }, [bankRecoSnapshot]);

  // Duplicate + Vendor + Reconciliation carry real YYYY-MM dates — group
  // them into one timeline, independent of which modules are toggled on,
  // so the month dropdown's option list doesn't shrink/reorder as you
  // toggle modules.
  const allTimelineGroups = useMemo(() => {
    const groups = new Map(); // key "YYYY-MM" -> { label, items: [] }
    const addAll = (list, moduleKey) => {
      list.forEach((o) => {
        let key, label;
        if (moduleKey === "duplicate") {
          const year = Math.floor(o.monthKey / 100), month = o.monthKey % 100;
          key = `${year}-${String(month).padStart(2, "0")}`;
          label = o.monthLabelStr;
        } else {
          key = o.monthKey;
          label = o.monthLabelStr;
        }
        if (!groups.has(key)) groups.set(key, { label, items: [] });
        groups.get(key).items.push(o);
      });
    };
    addAll(expenseObs, "expense");
    addAll(duplicateObs, "duplicate");
    addAll(vendorObs, "vendor");
    addAll(reconciliationObs, "reconciliation");
    return new Map([...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])));
  }, [expenseObs, duplicateObs, vendorObs, reconciliationObs]);

  const monthOptions = useMemo(() => [...allTimelineGroups.entries()].map(([key, g]) => ({ key, label: g.label })), [allTimelineGroups]);

  // Independent month list for the reconciliation launcher — based on the
  // Xero export itself, not on prior observations, since you need to pick
  // a month *before* anything has been reconciled.
  const xeroMonthOptions = useMemo(() => {
    if (!transactions || !transactions.length) return [];
    const counts = {};
    transactions.forEach((t) => {
      if (!t.date) return;
      const k = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.keys(counts).sort().reverse().map((k) => {
      const [y, m] = k.split("-").map(Number);
      return { key: k, label: `${MONTH_NAMES_FULL[m - 1]} ${y}` };
    });
  }, [transactions]);

  const [recoMonth, setRecoMonth] = useState("");
  const [recoTolerance, setRecoTolerance] = useState(3);
  useEffect(() => {
    if (!recoMonth && xeroMonthOptions.length) setRecoMonth(xeroMonthOptions[0].key);
  }, [xeroMonthOptions]);

  const reconcilableBankFiles = (bankFiles || []).filter((f) => f.mapping && f.accountLabel);
  const selectedBankFiles = reconcilableBankFiles.filter((f) => f.selectedForReco);

  const runReconciliationFromDashboard = () => {
    if (!recoMonth || selectedBankFiles.length === 0) return;
    const specs = selectedBankFiles.slice(0, 3).map((f) => ({
      account: f.accountLabel, bankFileId: f.id, month: recoMonth, tolerance: recoTolerance,
    }));
    onRunReconciliation && onRunReconciliation(specs);
  };

  // Default to the most recent month once real data shows up, instead of
  // dumping every month's worth of observations at once.
  useEffect(() => {
    if (selectedMonth === "all" && monthOptions.length > 0) setSelectedMonth(monthOptions[0].key);
  }, [monthOptions]);

  const timelineGroups = useMemo(() => {
    const filtered = selectedMonth === "all" ? allTimelineGroups : new Map([...allTimelineGroups.entries()].filter(([key]) => key === selectedMonth));
    return [...filtered.entries()]
      .map(([key, g]) => [key, { label: g.label, items: g.items.filter((o) => activeModules.has(o.module)) }])
      .filter(([, g]) => g.items.length > 0);
  }, [allTimelineGroups, selectedMonth, activeModules]);

  const totalCount = timelineGroups.reduce((s, [, g]) => s + g.items.length, 0);
  const moduleColor = (key) => DASHBOARD_MODULES.find((m) => m.key === key)?.color || shellColors.inkMuted;
  const moduleLabel = (key) => DASHBOARD_MODULES.find((m) => m.key === key)?.label || key;

  const escapeHtml = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Minimalist, narrative-style export — reads like a short memo of
  // observations, not a data table or dashboard. Builds a plain print
  // document and hands off to the browser's own print-to-PDF, so no
  // PDF library is needed at all.
  const exportPDF = () => {
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const periodStr = selectedMonth === "all" ? "all recorded months" : (monthOptions.find((m) => m.key === selectedMonth)?.label || "the selected period");
    const intro = totalCount === 0
      ? "Nothing stood out for this period across the tools reviewed."
      : `A short summary of what stood out this period — ${totalCount} observation${totalCount === 1 ? "" : "s"} worth a look, in plain terms.`;

    const sectionsHtml = timelineGroups.map(([key, group]) => `
      <div class="month">
        <div class="month-label">${escapeHtml(group.label)}</div>
        ${group.items.map((o) => `<div class="obs"><span class="mod">${escapeHtml(moduleLabel(o.module))}</span> — ${escapeHtml(o.text)}</div>`).join("")}
      </div>
    `).join("");

    const caveatHtml = (activeModules.has("reconciliation") && !bankRecoSnapshot)
      ? `<div class="caveat">Bank Reconciliation requires its own statement upload and isn't reflected above.</div>`
      : "";

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Ledger Review Notes</title>
<style>
  @page { margin: 0.85in; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #191919; margin: 0; padding: 48px 60px; }
  h1 { font-size: 21px; font-weight: 400; margin: 0 0 6px; letter-spacing: -0.01em; }
  .meta { font-size: 12px; color: #7a7a7a; margin-bottom: 18px; }
  hr { border: none; border-top: 1px solid #dcdcdc; margin: 0 0 22px; }
  .intro { font-style: italic; color: #565656; font-size: 13px; margin-bottom: 26px; max-width: 620px; line-height: 1.55; }
  .month { margin-bottom: 20px; }
  .month-label { font-weight: 700; font-size: 14.5px; margin-bottom: 8px; }
  .obs { font-size: 13px; line-height: 1.65; margin-bottom: 7px; padding-left: 14px; position: relative; }
  .obs::before { content: "\\2013"; position: absolute; left: 0; }
  .mod { font-weight: 600; }
  .caveat { font-style: italic; font-size: 11px; color: #9a9a9a; margin-top: 22px; }
  .empty { font-size: 13px; color: #7a7a7a; }
</style>
</head>
<body>
  <h1>Ledger Review Notes</h1>
  <div class="meta">Covering ${escapeHtml(periodStr)} &middot; Prepared ${escapeHtml(dateStr)}</div>
  <hr />
  <div class="intro">${escapeHtml(intro)}</div>
  ${sectionsHtml || '<div class="empty">No observations for the selected period.</div>'}
  ${caveatHtml}
</body>
</html>`;

    const printWin = window.open("", "_blank", "width=850,height=1100");
    if (!printWin) {
      alert("Your browser blocked the export window — please allow pop-ups for this site and try again.");
      return;
    }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 300);
  };

  return (
    <div style={{ padding: "32px 36px", maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", color: shellColors.ink }}>Reports</h1>
        </div>
        {transactions && transactions.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={exportPDF}
              style={{ display: "flex", alignItems: "center", gap: 6, background: shellColors.accent, border: `1px solid ${shellColors.accent}`, borderRadius: 20, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#fff" }}
            >
              <FileText size={14} /> Export PDF
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${shellColors.line}`, borderRadius: 20, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}
            >
              <Settings size={14} /> Settings
            </button>
          </div>
        )}
      </div>
      <p style={{ color: shellColors.inkMuted, fontSize: 14, marginTop: 6, marginBottom: 20, maxWidth: 620 }}>
        Every observation from all four tools, using each tool's own default settings — a quick read before diving into any one of them.
      </p>

      {settingsOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.35)", zIndex: 45 }} onClick={() => setSettingsOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 360, maxWidth: "88vw", background: "#fff", borderLeft: `1px solid ${shellColors.line}`, padding: 22, overflowY: "auto", zIndex: 50 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Report settings</div>
              <button onClick={() => setSettingsOpen(false)} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 11.5, color: shellColors.inkFaint, marginBottom: 20 }}>
              These only affect what shows up in Reports — each tool keeps its own independent settings when you open it directly.
            </div>

            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: moduleColor("expense") }}>Expense Checker</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>Low threshold — {reportSettings.expense.lowPct}%</label>
              <input type="range" min={10} max={90} value={reportSettings.expense.lowPct} onChange={(e) => updateSetting("expense", "lowPct", Number(e.target.value))} style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>High threshold — {reportSettings.expense.highPct}%</label>
              <input type="range" min={110} max={400} value={reportSettings.expense.highPct} onChange={(e) => updateSetting("expense", "highPct", Number(e.target.value))} style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>Materiality — ${reportSettings.expense.materialityThreshold.toLocaleString()}</label>
              <input type="range" min={500} max={10000} step={250} value={reportSettings.expense.materialityThreshold} onChange={(e) => updateSetting("expense", "materialityThreshold", Number(e.target.value))} style={{ width: "100%" }} />
            </div>

            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: moduleColor("duplicate") }}>Duplicate Audit</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>Consistency required — {reportSettings.duplicate.thresholdPct}%</label>
              <select value={reportSettings.duplicate.thresholdPct} onChange={(e) => updateSetting("duplicate", "thresholdPct", Number(e.target.value))} style={{ border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, width: "100%" }}>
                <option value={100}>100%</option>
                <option value={80}>80%</option>
                <option value={60}>60%</option>
                <option value={50}>50%</option>
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>Minimum history — {reportSettings.duplicate.minHistoryMonths} months</label>
              <input type="range" min={1} max={6} value={reportSettings.duplicate.minHistoryMonths} onChange={(e) => updateSetting("duplicate", "minHistoryMonths", Number(e.target.value))} style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>Materiality — ${reportSettings.duplicate.materialityThreshold.toLocaleString()}</label>
              <input type="range" min={500} max={10000} step={250} value={reportSettings.duplicate.materialityThreshold} onChange={(e) => updateSetting("duplicate", "materialityThreshold", Number(e.target.value))} style={{ width: "100%" }} />
            </div>

            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: moduleColor("vendor") }}>Vendor Review</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>Split-vendor tolerance — {reportSettings.vendor.dualCategoryThresholdPct}%</label>
              <input type="range" min={15} max={45} step={5} value={reportSettings.vendor.dualCategoryThresholdPct} onChange={(e) => updateSetting("vendor", "dualCategoryThresholdPct", Number(e.target.value))} style={{ width: "100%" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>Materiality — ${reportSettings.vendor.materialityThreshold.toLocaleString()}</label>
              <input type="range" min={500} max={10000} step={250} value={reportSettings.vendor.materialityThreshold} onChange={(e) => updateSetting("vendor", "materialityThreshold", Number(e.target.value))} style={{ width: "100%" }} />
            </div>

            {reconcilableBankFiles.length > 0 && (
              <>
                <div style={{ height: 1, background: shellColors.line, margin: "22px 0 18px" }} />
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6, color: moduleColor("reconciliation") }}>Bank Reconciliation</div>
                <div style={{ fontSize: 11.5, color: shellColors.inkFaint, marginBottom: 14 }}>
                  Pick up to 3 tagged bank statements from Shared Files, choose a month, and run them together. Results open in Bank Reconciliation.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {reconcilableBankFiles.map((f) => {
                    const disabled = !f.selectedForReco && selectedBankFiles.length >= 3;
                    return (
                      <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: disabled ? shellColors.inkFaint : shellColors.ink, cursor: disabled ? "not-allowed" : "pointer" }}>
                        <input
                          type="checkbox"
                          checked={!!f.selectedForReco}
                          disabled={disabled}
                          onChange={() => onToggleBankReco && onToggleBankReco(f.id)}
                        />
                        <span style={{ fontWeight: 600 }}>{f.accountLabel}</span>
                        <span style={{ color: shellColors.inkFaint }}>— {f.fileName}</span>
                      </label>
                    );
                  })}
                  {selectedBankFiles.length >= 3 && (
                    <div style={{ fontSize: 11.5, color: shellColors.inkFaint }}>Up to 3 banks at a time — uncheck one to swap.</div>
                  )}
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>Month</label>
                  <select value={recoMonth} onChange={(e) => setRecoMonth(e.target.value)} style={{ border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, width: "100%" }}>
                    {xeroMonthOptions.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>Tolerance (days)</label>
                  <input
                    type="number" min={0} max={30} value={recoTolerance}
                    onChange={(e) => setRecoTolerance(parseInt(e.target.value) || 0)}
                    style={{ width: 72, border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5 }}
                  />
                </div>

                <button
                  disabled={selectedBankFiles.length === 0 || !recoMonth}
                  onClick={() => { runReconciliationFromDashboard(); setSettingsOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 700, width: "100%",
                    padding: "9px 16px", borderRadius: 8, border: "none", cursor: selectedBankFiles.length === 0 ? "not-allowed" : "pointer",
                    background: shellColors.accent, color: "#fff", opacity: selectedBankFiles.length === 0 || !recoMonth ? 0.5 : 1,
                  }}
                >
                  Run Reconciliation{selectedBankFiles.length > 0 ? ` (${selectedBankFiles.length})` : ""}
                </button>
              </>
            )}
          </div>
        </div>
      )}


      {(!transactions || !transactions.length) ? (
        <div style={{ background: "#fff", border: `1px solid ${shellColors.line}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No shared file loaded yet</div>
          <div style={{ fontSize: 13, color: shellColors.inkMuted }}>Upload and map your Account Transactions export in <b>Shared Files</b> to populate the dashboard.</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 6 }}>Month</div>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, background: "#fff" }}
              >
                <option value="all">All months</option>
                {monthOptions.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DASHBOARD_MODULES.map((m) => (
                <button key={m.key} onClick={() => toggleModule(m.key)} style={{
                  fontSize: 12.5, fontWeight: 600, padding: "6px 14px", borderRadius: 20, cursor: "pointer",
                  border: `1px solid ${activeModules.has(m.key) ? m.color : shellColors.line}`,
                  background: activeModules.has(m.key) ? m.color : "#fff",
                  color: activeModules.has(m.key) ? "#fff" : shellColors.inkMuted,
                }}>{m.label}</button>
              ))}
            </div>
          </div>

          <div style={{ background: "#fff", border: `1px solid ${shellColors.line}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: shellColors.accent }}>{totalCount}</div>
            <div style={{ fontSize: 12.5, color: shellColors.inkMuted, marginTop: 4 }}>observations across the selected modules</div>
          </div>

          {totalCount === 0 && (
            <div style={{ background: "#fff", border: `1px solid ${shellColors.line}`, borderRadius: 12, padding: 32, textAlign: "center", color: shellColors.inkMuted, fontSize: 13 }}>
              Nothing to report for the selected modules.
            </div>
          )}

          {timelineGroups.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              {timelineGroups.map(([key, group]) => (
                <div key={key} style={{ background: "#fff", border: `1px solid ${shellColors.line}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 10 }}>{group.label}</div>
                  {group.items.map((o, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, padding: "6px 0", borderTop: i > 0 ? `1px solid ${shellColors.line}` : "none" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: moduleColor(o.module), background: shellColors.bg, border: `1px solid ${moduleColor(o.module)}`, borderRadius: 10, padding: "2px 7px", flexShrink: 0, marginTop: 1, whiteSpace: "nowrap" }}>
                        {moduleLabel(o.module)}
                      </span>
                      <span style={{ color: shellColors.ink }}>{o.text}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {activeModules.has("reconciliation") && !bankRecoSnapshot && (
            <div style={{ fontSize: 12, color: shellColors.inkFaint, marginTop: 12 }}>
              Bank Reconciliation needs its own bank statement upload, so it isn't included here yet — visit that tool and run a reconciliation to bring its findings into this dashboard.
            </div>
          )}
        </>
      )}
    </div>
  );
}
export default DashboardScreen;
