import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Papa from "papaparse";
import {
  Upload, ChevronRight, Search, X, Check, FileSpreadsheet,
  Download, RefreshCw, Landmark, ArrowRight,
} from "lucide-react";


// ---------- helpers ----------

const fmtMoney = (n) => {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (d) => {
  if (!d) return "—";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(key) {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

function filterByMonthWithBuffer(txArray, key, bufferDays) {
  if (!key) return txArray;
  const { start, end } = monthRange(key);
  const bufMs = bufferDays * 86400000;
  const lo = start.getTime() - bufMs;
  const hi = end.getTime() + bufMs;
  return txArray.filter((t) => t.date && t.date.getTime() >= lo && t.date.getTime() <= hi);
}

function excelSerialToDate(n) {
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

function toDate(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === "number") return excelSerialToDate(v);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    let d = new Date(s);
    if (!isNaN(d)) return d;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let [, mm, dd, yy] = m;
      if (yy.length === 2) yy = "20" + yy;
      return new Date(parseInt(yy), parseInt(mm) - 1, parseInt(dd));
    }
  }
  return null;
}

function toAmount(v) {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s) return 0;
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
  const n = parseFloat(s) || 0;
  return neg ? -n : n;
}

function buildBankTx(rows, mapping) {
  return rows
    .map((r, i) => {
      const date = toDate(r[mapping.dateCol]);
      const desc = mapping.descCol ? r[mapping.descCol] ?? "" : "";
      let amount;
      if (mapping.mode === "single") {
        amount = toAmount(r[mapping.amountCol]);
        if (mapping.flipSign) amount = -amount;
      } else {
        const debit = Math.abs(toAmount(r[mapping.debitCol]));
        const credit = Math.abs(toAmount(r[mapping.creditCol]));
        amount = credit - debit;
      }
      return { id: "b" + i, date, desc: String(desc), amount };
    })
    .filter((t) => t.date && !isNaN(t.amount) && !(t.amount === 0 && !t.desc));
}

// Tries every combination of 2..maxItems candidates for one whose amounts
// sum to `target` within EPS. Smallest combinations are tried first since
// a 2-line split is far more likely — and easier to eyeball as correct —
// than an 8-way one.
function findSubsetSum(items, target, eps, maxItems) {
  const n = items.length;
  const cap = Math.min(maxItems, n);
  for (let size = 2; size <= cap; size++) {
    const idx = Array.from({ length: size }, (_, i) => i);
    while (true) {
      let sum = 0;
      for (let i = 0; i < size; i++) sum += items[idx[i]].amount;
      if (Math.abs(sum - target) <= eps) return idx.map((i) => items[i]);
      let i = size - 1;
      while (i >= 0 && idx[i] === n - size + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  return null;
}

// Same-date consolidation: catches a single lump entry on one side that the
// other side records as several lines (e.g. one bank deposit = three
// invoice payments in Xero, or one Xero bill = a split bank charge).
// Uses the same match-tolerance window as regular matching — a consolidated
// deposit often posts a day or two off from the individual line dates.
function findConsolidatedMatches(xero, bank, EPS, toleranceDays, maxItems = 6) {
  const consolidated = [];
  const withinTolerance = (a, b) => Math.abs(a - b) / 86400000 <= toleranceDays;

  // One Xero line = sum of several bank lines within the match-tolerance window.
  for (const xt of xero) {
    if (xt.used) continue;
    const candidates = bank.filter((bt) => !bt.used && withinTolerance(bt.date, xt.date));
    if (candidates.length < 2) continue;
    const combo = findSubsetSum(candidates, xt.amount, EPS, maxItems);
    if (combo) {
      combo.forEach((bt) => { bt.used = true; });
      xt.used = true;
      consolidated.push({ date: xt.date, xeroItems: [xt], bankItems: combo, xeroTotal: xt.amount, bankTotal: combo.reduce((s, b) => s + b.amount, 0) });
    }
  }

  // One bank line = sum of several Xero lines within the match-tolerance window.
  for (const bt of bank) {
    if (bt.used) continue;
    const candidates = xero.filter((xt) => !xt.used && withinTolerance(xt.date, bt.date));
    if (candidates.length < 2) continue;
    const combo = findSubsetSum(candidates, bt.amount, EPS, maxItems);
    if (combo) {
      combo.forEach((xt) => { xt.used = true; });
      bt.used = true;
      consolidated.push({ date: bt.date, xeroItems: combo, bankItems: [bt], xeroTotal: combo.reduce((s, x) => s + x.amount, 0), bankTotal: bt.amount });
    }
  }

  consolidated.sort((a, b) => a.date - b.date);
  return consolidated;
}

function reconcile(xeroTxRaw, bankTxRaw, toleranceDays) {
  const xero = xeroTxRaw.map((t, i) => ({ ...t, id: "x" + i, used: false }));
  const bank = bankTxRaw.map((t) => ({ ...t, used: false }));
  const EPS = 0.005;
  const matched = [];

  const xSorted = [...xero].sort((a, b) => a.date - b.date);

  for (const xt of xSorted) {
    let best = null,
      bestDiff = Infinity;
    for (const bt of bank) {
      if (bt.used) continue;
      if (Math.abs(bt.amount - xt.amount) > EPS) continue;
      const diff = Math.abs(bt.date - xt.date) / 86400000;
      if (diff <= toleranceDays && diff < bestDiff) {
        best = bt;
        bestDiff = diff;
      }
    }
    if (best) {
      best.used = true;
      xt.used = true;
      matched.push({ xero: xt, bank: best, dayDiff: Math.round(bestDiff) });
    }
  }

  const consolidated = findConsolidatedMatches(xero, bank, EPS, toleranceDays);

  const possible = [];
  for (const xt of xSorted) {
    if (xt.used) continue;
    let best = null,
      bestDiff = Infinity;
    for (const bt of bank) {
      if (bt.used) continue;
      if (Math.abs(bt.amount - xt.amount) > EPS) continue;
      const diff = Math.abs(bt.date - xt.date) / 86400000;
      if (diff < bestDiff) {
        best = bt;
        bestDiff = diff;
      }
    }
    if (best) {
      best.used = true;
      xt.used = true;
      possible.push({ xero: xt, bank: best, dayDiff: Math.round(bestDiff) });
    }
  }

  const xeroOnly = xero.filter((t) => !t.used).sort((a, b) => a.date - b.date);
  const bankOnly = bank.filter((t) => !t.used).sort((a, b) => a.date - b.date);
  matched.sort((a, b) => a.xero.date - b.xero.date);
  possible.sort((a, b) => a.xero.date - b.xero.date);

  return { matched, possible, consolidated, xeroOnly, bankOnly };
}

function downloadCSV(filename, rows) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- stamp badge ----------

const STAMP_STYLES = {
  matched: { color: "var(--teal)", label: "MATCHED" },
  consolidated: { color: "var(--teal)", label: "CONSOLIDATED" },
  possible: { color: "var(--amber)", label: "REVIEW" },
  xeroOnly: { color: "var(--rose)", label: "MISSING\u00A0FROM\u00A0BANK" },
  bankOnly: { color: "var(--slate)", label: "NOT\u00A0IN\u00A0XERO" },
};

function Stamp({ kind, small }) {
  const s = STAMP_STYLES[kind];
  return (
    <span
      className="stamp"
      style={{
        color: s.color,
        borderColor: s.color,
        fontSize: small ? "9px" : "10px",
        padding: small ? "2px 6px" : "3px 8px",
      }}
    >
      {s.label}
    </span>
  );
}

// ---------- step indicator ----------

function StepDot({ n, label, active, done, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="step-dot"
      style={{
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <span
        className="step-num"
        style={{
          background: done ? "var(--teal)" : active ? "var(--accent)" : "transparent",
          color: done || active ? "#fff" : "var(--ink)",
          borderColor: done ? "var(--teal)" : active ? "var(--accent)" : "var(--line)",
        }}
      >
        {done ? <Check size={12} strokeWidth={3} /> : n}
      </span>
      <span className="step-label" style={{ fontWeight: active ? 700 : 500 }}>
        {label}
      </span>
    </button>
  );
}

// ---------- main app ----------

function RunReport({ results, account, monthLabelStr, onAdjust }) {
  const [activeTab, setActiveTab] = useState("matched");
  const [expandedConsolidated, setExpandedConsolidated] = useState(new Set());
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);

  const summary = useMemo(() => {
    if (!results) return null;
    const sum = (arr, get) => arr.reduce((s, x) => s + get(x), 0);
    return {
      matched: { count: results.matched.length, amount: sum(results.matched, (m) => m.xero.amount) },
      consolidated: { count: results.consolidated.length, amount: sum(results.consolidated, (m) => m.xeroTotal) },
      possible: { count: results.possible.length, amount: sum(results.possible, (m) => m.xero.amount) },
      xeroOnly: { count: results.xeroOnly.length, amount: sum(results.xeroOnly, (t) => t.amount) },
      bankOnly: { count: results.bankOnly.length, amount: sum(results.bankOnly, (t) => t.amount) },
    };
  }, [results]);

  const tabRows = useMemo(() => {
    if (!results) return [];
    let rows = [];
    if (activeTab === "matched")
      rows = results.matched.map((m) => ({
        kind: "matched",
        date: m.xero.date,
        contact: m.xero.contact,
        desc: m.bank.desc,
        xeroAmount: m.xero.amount,
        bankAmount: m.bank.amount,
        dayDiff: m.dayDiff,
      }));
    else if (activeTab === "possible")
      rows = results.possible.map((m) => ({
        kind: "possible",
        date: m.xero.date,
        contact: m.xero.contact,
        desc: m.bank.desc,
        xeroAmount: m.xero.amount,
        bankAmount: m.bank.amount,
        dayDiff: m.dayDiff,
      }));
    else if (activeTab === "consolidated")
      rows = results.consolidated.map((c, idx) => ({
        kind: "consolidated",
        date: c.date,
        contact: c.xeroItems.length > 1 ? `${c.xeroItems.length} Xero lines` : (c.xeroItems[0].contact || "—"),
        desc: c.bankItems.length > 1 ? `${c.bankItems.length} bank lines` : (c.bankItems[0].desc || "—"),
        xeroAmount: c.xeroTotal,
        bankAmount: c.bankTotal,
        dayDiff: 0,
        xeroItems: c.xeroItems,
        bankItems: c.bankItems,
        _key: "c" + idx,
      }));
    else if (activeTab === "xeroOnly")
      rows = results.xeroOnly.map((t) => ({
        kind: "xeroOnly",
        date: t.date,
        contact: t.contact,
        desc: "",
        xeroAmount: t.amount,
        bankAmount: null,
        dayDiff: null,
      }));
    else if (activeTab === "bankOnly")
      rows = results.bankOnly.map((t) => ({
        kind: "bankOnly",
        date: t.date,
        contact: "",
        desc: t.desc,
        xeroAmount: null,
        bankAmount: t.amount,
        dayDiff: null,
      }));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) => (r.contact || "").toLowerCase().includes(q) || (r.desc || "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [results, activeTab, search]);

  const exportAll = () => {
    if (!results) return;
    const rows = [];
    results.matched.forEach((m) =>
      rows.push({
        Status: "Matched",
        Date: fmtDate(m.xero.date),
        Contact: m.xero.contact,
        "Bank Description": m.bank.desc,
        "Xero Amount": m.xero.amount,
        "Bank Amount": m.bank.amount,
        "Day Difference": m.dayDiff,
      })
    );
    results.consolidated.forEach((c) => {
      c.xeroItems.forEach((x) =>
        rows.push({
          Status: `Consolidated match (${c.xeroItems.length} Xero \u2194 ${c.bankItems.length} bank)`,
          Date: fmtDate(x.date),
          Contact: x.contact,
          "Bank Description": "",
          "Xero Amount": x.amount,
          "Bank Amount": "",
          "Day Difference": 0,
        })
      );
      c.bankItems.forEach((b) =>
        rows.push({
          Status: `Consolidated match (${c.xeroItems.length} Xero \u2194 ${c.bankItems.length} bank)`,
          Date: fmtDate(b.date),
          Contact: "",
          "Bank Description": b.desc,
          "Xero Amount": "",
          "Bank Amount": b.amount,
          "Day Difference": 0,
        })
      );
    });
    results.possible.forEach((m) =>
      rows.push({
        Status: "Review — date mismatch",
        Date: fmtDate(m.xero.date),
        Contact: m.xero.contact,
        "Bank Description": m.bank.desc,
        "Xero Amount": m.xero.amount,
        "Bank Amount": m.bank.amount,
        "Day Difference": m.dayDiff,
      })
    );
    results.xeroOnly.forEach((t) =>
      rows.push({
        Status: "Missing from bank statement",
        Date: fmtDate(t.date),
        Contact: t.contact,
        "Bank Description": "",
        "Xero Amount": t.amount,
        "Bank Amount": "",
        "Day Difference": "",
      })
    );
    results.bankOnly.forEach((t) =>
      rows.push({
        Status: "Not recorded in Xero",
        Date: fmtDate(t.date),
        Contact: "",
        "Bank Description": t.desc,
        "Xero Amount": "",
        "Bank Amount": t.amount,
        "Day Difference": "",
      })
    );
    downloadCSV(
      `reconciliation-${account || "export"}-${monthLabelStr || ""}.csv`.replace(/\s+/g, "_"),
      rows
    );
  };

  if (!results || !summary) return null;

  return (
    <div>
      <div className="summary-grid">
        <div
          className="sum-card"
          style={{ background: "var(--tealbg)", borderColor: activeTab === "matched" ? "var(--teal)" : "transparent" }}
          onClick={() => { setActiveTab("matched"); setVisibleCount(50); }}
        >
          <Stamp kind="matched" small />
          <div className="count" style={{ color: "var(--teal)" }}>{summary.matched.count}</div>
          <div className="amt mono" style={{ color: "var(--teal)" }}>{fmtMoney(summary.matched.amount)}</div>
        </div>
        <div
          className="sum-card"
          style={{ background: "var(--tealbg)", borderColor: activeTab === "consolidated" ? "var(--teal)" : "transparent" }}
          onClick={() => { setActiveTab("consolidated"); setVisibleCount(50); }}
        >
          <Stamp kind="consolidated" small />
          <div className="count" style={{ color: "var(--teal)" }}>{summary.consolidated.count}</div>
          <div className="amt mono" style={{ color: "var(--teal)" }}>{fmtMoney(summary.consolidated.amount)}</div>
        </div>
        <div
          className="sum-card"
          style={{ background: "var(--amberbg)", borderColor: activeTab === "possible" ? "var(--amber)" : "transparent" }}
          onClick={() => { setActiveTab("possible"); setVisibleCount(50); }}
        >
          <Stamp kind="possible" small />
          <div className="count" style={{ color: "var(--amber)" }}>{summary.possible.count}</div>
          <div className="amt mono" style={{ color: "var(--amber)" }}>{fmtMoney(summary.possible.amount)}</div>
        </div>
        <div
          className="sum-card"
          style={{ background: "var(--rosebg)", borderColor: activeTab === "xeroOnly" ? "var(--rose)" : "transparent" }}
          onClick={() => { setActiveTab("xeroOnly"); setVisibleCount(50); }}
        >
          <Stamp kind="xeroOnly" small />
          <div className="count" style={{ color: "var(--rose)" }}>{summary.xeroOnly.count}</div>
          <div className="amt mono" style={{ color: "var(--rose)" }}>{fmtMoney(summary.xeroOnly.amount)}</div>
        </div>
        <div
          className="sum-card"
          style={{ background: "var(--slatebg)", borderColor: activeTab === "bankOnly" ? "var(--slate)" : "transparent" }}
          onClick={() => { setActiveTab("bankOnly"); setVisibleCount(50); }}
        >
          <Stamp kind="bankOnly" small />
          <div className="count" style={{ color: "var(--slate)" }}>{summary.bankOnly.count}</div>
          <div className="amt mono" style={{ color: "var(--slate)" }}>{fmtMoney(summary.bankOnly.amount)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
          Summary — {account} — {monthLabelStr}
        </div>
        {summary.possible.count === 0 && summary.xeroOnly.count === 0 && summary.bankOnly.count === 0 ? (
          <div style={{ fontSize: 13, color: "var(--sub)" }}>
            Fully reconciled — all {summary.matched.count + summary.consolidated.count} transaction{summary.matched.count + summary.consolidated.count === 1 ? "" : "s"} matched cleanly this period{summary.consolidated.count > 0 ? `, including ${summary.consolidated.count} consolidated (split-line) match${summary.consolidated.count === 1 ? "" : "es"}` : ""}.
          </div>
        ) : (
          <>
            {summary.consolidated.count > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0, background: "var(--teal)" }} />
                <span><b>{summary.consolidated.count}</b> match{summary.consolidated.count === 1 ? "" : "es"} found by combining split lines on one side within the match tolerance, worth {fmtMoney(summary.consolidated.amount)} — worth a quick sanity check.</span>
              </div>
            )}
            {summary.possible.count > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0, background: "var(--amber)" }} />
                <span><b>{summary.possible.count}</b> pair{summary.possible.count === 1 ? "" : "s"} matched on amount but not date, worth {fmtMoney(summary.possible.amount)} — worth a quick look.</span>
              </div>
            )}
            {summary.xeroOnly.count > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0, background: "var(--rose)" }} />
                <span><b>{summary.xeroOnly.count}</b> transaction{summary.xeroOnly.count === 1 ? "" : "s"} in Xero, worth {fmtMoney(summary.xeroOnly.amount)}, {summary.xeroOnly.count === 1 ? "hasn't" : "haven't"} shown up in the bank statement yet.</span>
              </div>
            )}
            {summary.bankOnly.count > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0, background: "var(--slate)" }} />
                <span><b>{summary.bankOnly.count}</b> transaction{summary.bankOnly.count === 1 ? "" : "s"} on the bank statement, worth {fmtMoney(summary.bankOnly.amount)}, {summary.bankOnly.count === 1 ? "hasn't" : "haven't"} been recorded in Xero.</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["matched", "consolidated", "possible", "xeroOnly", "bankOnly"].map((k) => (
              <button
                key={k}
                className={"tab-btn" + (activeTab === k ? " active" : "")}
                onClick={() => { setActiveTab(k); setVisibleCount(50); }}
              >
                {k === "matched" && "Matched"}
                {k === "consolidated" && "Consolidated"}
                {k === "possible" && "Needs review"}
                {k === "xeroOnly" && "Missing from bank"}
                {k === "bankOnly" && "Not in Xero"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="search-box">
              <Search size={13} style={{ opacity: 0.5 }} />
              <input type="text" placeholder="Search description…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {onAdjust && (
              <button className="btn-ghost btn" onClick={onAdjust}>
                <RefreshCw size={13} /> Adjust
              </button>
            )}
            <button className="btn" onClick={exportAll}>
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          {tabRows.length === 0 ? (
            <div className="empty-state">Nothing here — try a different tab or clear your search.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Contact / Payee</th>
                  <th>Bank description</th>
                  <th style={{ textAlign: "right" }}>Xero amount</th>
                  <th style={{ textAlign: "right" }}>Bank amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {tabRows.slice(0, visibleCount).map((r, i) => (
                  <React.Fragment key={r._key || i}>
                  <tr
                    onClick={r.kind === "consolidated" ? () => setExpandedConsolidated((s) => { const n = new Set(s); n.has(r._key) ? n.delete(r._key) : n.add(r._key); return n; }) : undefined}
                    style={r.kind === "consolidated" ? { cursor: "pointer" } : undefined}
                  >
                    <td><Stamp kind={r.kind} small /></td>
                    <td className="mono">{fmtDate(r.date)}</td>
                    <td>{r.contact || "—"}</td>
                    <td style={{ color: "var(--sub)" }}>{r.desc || "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{r.xeroAmount != null ? fmtMoney(r.xeroAmount) : "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{r.bankAmount != null ? fmtMoney(r.bankAmount) : "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--sub)" }}>
                      {r.kind === "consolidated"
                        ? (expandedConsolidated.has(r._key) ? "hide lines ▲" : "show lines ▼")
                        : r.dayDiff != null
                        ? r.dayDiff === 0 ? "same day" : `${r.dayDiff} day${r.dayDiff > 1 ? "s" : ""} apart`
                        : ""}
                    </td>
                  </tr>
                  {r.kind === "consolidated" && expandedConsolidated.has(r._key) && (
                    <tr>
                      <td colSpan={7} style={{ background: "var(--paper)", padding: "10px 16px 14px 40px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--sub)", marginBottom: 4 }}>XERO ({r.xeroItems.length})</div>
                            {r.xeroItems.map((x, k) => (
                              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}>
                                <span>{x.contact || "—"}</span>
                                <span className="mono">{fmtMoney(x.amount)}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--sub)", marginBottom: 4 }}>BANK ({r.bankItems.length})</div>
                            {r.bankItems.map((b, k) => (
                              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}>
                                <span>{b.desc || "—"}</span>
                                <span className="mono">{fmtMoney(b.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {tabRows.length > visibleCount && (
          <div style={{ padding: 14, textAlign: "center" }}>
            <button className="btn-ghost btn" onClick={() => setVisibleCount((v) => v + 50)}>
              Load {Math.min(50, tabRows.length - visibleCount)} more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BankReconciliation({ transactions, onResultsChange, bankFiles, onGoToSharedFiles, pendingRuns, onPendingRunsConsumed }) {
  const [step, setStep] = useState(1);

  const xeroAccounts = useMemo(() => {
    if (!transactions || !transactions.length) return null;
    const map = {};
    transactions.forEach((t) => {
      if (!t.account || !t.date) return;
      if (!map[t.account]) map[t.account] = [];
      map[t.account].push({ date: t.date, contact: t.vendor || t.description || "", amount: t.amount });
    });
    Object.keys(map).forEach((k) => { if (map[k].length === 0) delete map[k]; });
    return Object.keys(map).length ? map : null;
  }, [transactions]);

  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");

  useEffect(() => {
    if (xeroAccounts && !selectedAccount) {
      setSelectedAccount(Object.keys(xeroAccounts)[0] || "");
    }
  }, [xeroAccounts]);

  // Multiple bank statements can be uploaded now (one per account you
  // reconcile). If a statement is tagged with the currently selected
  // Xero account, prefer it automatically; otherwise fall back to
  // whatever's already picked, or the first file uploaded.
  const [selectedBankFileId, setSelectedBankFileId] = useState("");
  const safeBankFiles = bankFiles || [];

  useEffect(() => {
    const matchByAccount = safeBankFiles.find((f) => f.accountLabel && f.accountLabel === selectedAccount);
    if (matchByAccount) { setSelectedBankFileId(matchByAccount.id); return; }
    if (!selectedBankFileId || !safeBankFiles.some((f) => f.id === selectedBankFileId)) {
      setSelectedBankFileId(safeBankFiles[0]?.id || "");
    }
  }, [selectedAccount, safeBankFiles]);

  const activeBankFile = safeBankFiles.find((f) => f.id === selectedBankFileId) || null;
  const bankMapping = activeBankFile?.mapping || null;
  const bankRows = activeBankFile?.rows || [];
  const bankFileName = activeBankFile?.fileName || "";

  const [tolerance, setTolerance] = useState(3);

  // Reconciliation results — up to 3 runs can be shown side-by-side via
  // tabs (either built up manually one at a time, or all at once when
  // triggered in a batch from the Reports section).
  const [runs, setRuns] = useState([]); // [{ id, account, month, bankFileName, tolerance, results }]
  const [activeRunId, setActiveRunId] = useState(null);
  const activeRun = runs.find((r) => r.id === activeRunId) || null;

  useEffect(() => {
    if (onResultsChange) onResultsChange(runs.length ? runs : null);
  }, [runs]);
  const [loadingMsg, setLoadingMsg] = useState("");

  const computeReconciliation = (account, month, rows, mapping, tol) => {
    const allXeroTx = (xeroAccounts && xeroAccounts[account]) || [];
    const allBankTx = buildBankTx(rows, mapping || {});
    const xeroTx = filterByMonthWithBuffer(allXeroTx, month, tol);
    const bankTx = filterByMonthWithBuffer(allBankTx, month, tol);
    const r = reconcile(xeroTx, bankTx, tol);

    // The buffer above deliberately pulls in a few extra days on either side
    // of the month so a transaction dated just before/after the boundary can
    // still be matched (e.g. posted June 30 in Xero, cleared July 2 in the
    // bank). But once matching is done, any *unmatched* leftovers from that
    // buffer zone belong to a neighboring month, not this one — so they're
    // filtered back down to the true month range before being shown here.
    // Matched/possible pairs are left as-is since a cross-boundary match is
    // still a real, useful match to display under this month.
    if (month) {
      const { start, end } = monthRange(month);
      const inMonth = (tx) => tx.date && tx.date >= start && tx.date <= end;
      r.xeroOnly = r.xeroOnly.filter(inMonth);
      r.bankOnly = r.bankOnly.filter(inMonth);
    }
    return r;
  };

  const addRun = (newRun) => {
    setRuns((prev) => {
      const next = [...prev.filter((r) => r.id !== newRun.id), newRun];
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });
    setActiveRunId(newRun.id);
    setStep(4);
  };

  const removeRun = (id) => {
    setRuns((prev) => {
      const next = prev.filter((r) => r.id !== id);
      if (activeRunId === id) setActiveRunId(next[0]?.id || null);
      return next;
    });
  };

  const runReconciliation = useCallback(
    (tol) => {
      const t = tol ?? tolerance;
      const r = computeReconciliation(selectedAccount, selectedMonth, bankRows, bankMapping, t);
      addRun({
        id: "run_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        account: selectedAccount, month: selectedMonth, bankFileName, tolerance: t, results: r,
      });
    },
    [xeroAccounts, selectedAccount, selectedMonth, bankRows, bankMapping, tolerance, bankFileName]
  );

  // Batch trigger from the Reports section — computes up to 3 runs at
  // once from the specs it hands us, then jumps straight to the review.
  useEffect(() => {
    if (!pendingRuns || !pendingRuns.length) return;
    const newRuns = pendingRuns
      .slice(0, 3)
      .map((spec) => {
        const bf = safeBankFiles.find((f) => f.id === spec.bankFileId);
        if (!bf || !bf.mapping) return null;
        const r = computeReconciliation(spec.account, spec.month, bf.rows, bf.mapping, spec.tolerance);
        return {
          id: "run_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6) + "_" + spec.bankFileId,
          account: spec.account, month: spec.month, bankFileName: bf.fileName, tolerance: spec.tolerance, results: r,
        };
      })
      .filter(Boolean);
    if (newRuns.length) {
      setRuns(newRuns);
      setActiveRunId(newRuns[0].id);
      setStep(4);
    }
    if (onPendingRunsConsumed) onPendingRunsConsumed();
  }, [pendingRuns]);

  const availableMonths = useMemo(() => {
    if (!xeroAccounts || !selectedAccount) return [];
    const tx = xeroAccounts[selectedAccount] || [];
    const counts = {};
    for (const t of tx) {
      if (!t.date) continue;
      const k = monthKey(t.date);
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.keys(counts)
      .sort()
      .reverse()
      .map((k) => ({ key: k, count: counts[k] }));
  }, [xeroAccounts, selectedAccount]);

  useEffect(() => {
    if (availableMonths.length && !availableMonths.find((m) => m.key === selectedMonth)) {
      setSelectedMonth(availableMonths[0].key);
    }
  }, [availableMonths]);

  const monthLabel = (key) => {
    const [y, m] = key.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y} — ${String(m).padStart(2, "0")}/${y}`;
  };

  const mappingReady = !!(bankMapping && bankMapping.dateCol && (bankMapping.mode === "single" ? bankMapping.amountCol : bankMapping.debitCol && bankMapping.creditCol));

  const accountNames = xeroAccounts ? Object.keys(xeroAccounts) : [];

  return (
    <div className="wrap">
      <style>{`
        .wrap {
          --paper: #F8FAFC;
          --panel: #FFFFFF;
          --ink: #0F1B2D;
          --sub: #64748B;
          --line: #E2E8F0;
          --accent: #17375E;
          --accentbg: #EAF0F7;
          --teal: #16A34A;
          --tealbg: #F0FDF4;
          --amber: #B45309;
          --amberbg: #FEF3C7;
          --rose: #DC2626;
          --rosebg: #FEF2F2;
          --slate: #64748B;
          --slatebg: #FAFBFC;
          background: var(--paper);
          color: var(--ink);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          min-height: 100%;
          padding: 28px 20px 60px;
        }
        .mono { font-family: ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace; }
        .card {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 12px;
        }
        .header-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 4px;
        }
        .eyebrow {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--sub);
          font-weight: 600;
        }
        .h1 {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .steps-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          margin: 22px 0 26px;
        }
        .step-dot {
          display: flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          padding: 4px 6px;
        }
        .step-num {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          border: 1.5px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .step-label { font-size: 13px; }
        .step-sep { color: var(--line); margin: 0 2px; }
        .panel-inner { padding: 28px; }
        .dropzone {
          border: 1.5px dashed var(--line);
          border-radius: 10px;
          padding: 36px 24px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .dropzone:hover { border-color: var(--accent); background: var(--accentbg); }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 16px;
          border-radius: 8px;
          font-size: 13.5px;
          font-weight: 700;
          border: 1px solid var(--accent);
          background: var(--accent);
          color: #fff;
          cursor: pointer;
        }
        .btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .btn-ghost {
          background: transparent;
          color: var(--ink);
          border: 1px solid var(--line);
        }
        select, input[type=text], input[type=number] {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 7px 10px;
          font-size: 13.5px;
          background: #fff;
          color: var(--ink);
          font-family: inherit;
        }
        .field-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--sub);
          margin-bottom: 6px;
          display: block;
        }
        .stamp {
          display: inline-block;
          border: 1.5px solid;
          border-radius: 3px;
          font-weight: 800;
          letter-spacing: 0.06em;
          transform: rotate(-2deg);
          white-space: nowrap;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }
        @media (max-width: 760px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr); }
          .wrap { padding: 20px 12px 48px; }
          .search-box input { width: 110px; }
        }
        .sum-card {
          border-radius: 10px;
          padding: 16px 16px;
          cursor: pointer;
          border: 1.5px solid transparent;
        }
        .sum-card .count { font-size: 26px; font-weight: 800; line-height: 1; margin: 6px 0 4px; }
        .sum-card .amt { font-size: 13px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th {
          text-align: left;
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--sub);
          font-weight: 700;
          padding: 8px 10px;
          border-bottom: 1.5px solid var(--line);
          white-space: nowrap;
        }
        td {
          padding: 9px 10px;
          border-bottom: 1px solid var(--line);
          vertical-align: middle;
        }
        tr:hover td { background: var(--accentbg); }
        .tab-btn {
          padding: 8px 14px;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid var(--line);
          background: #fff;
          cursor: pointer;
          color: var(--sub);
        }
        .tab-btn.active {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
        }
        .search-box {
          display: flex;
          align-items: center;
          gap: 6px;
          border: 1px solid var(--line);
          border-radius: 7px;
          padding: 6px 10px;
          background: #fff;
        }
        .search-box input { border: none; padding: 0; font-size: 13px; outline: none; width: 180px; }
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--sub);
          font-size: 13.5px;
        }
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div className="header-row">
          <Landmark size={20} strokeWidth={2.2} />
          <span className="eyebrow">Xero × Bank Statement</span>
        </div>
        <div className="h1">Bank Reconciliation</div>

        {/* steps */}
        <div className="steps-bar">
          <StepDot n={1} label="Choose account" active={step === 1} done={step > 1} disabled={!xeroAccounts} onClick={() => xeroAccounts && setStep(1)} />
          <ChevronRight size={14} className="step-sep" />
          <StepDot
            n={2}
            label="Choose month"
            active={step === 2}
            done={step > 2}
            disabled={!selectedAccount}
            onClick={() => selectedAccount && setStep(2)}
          />
          <ChevronRight size={14} className="step-sep" />
          <StepDot
            n={3}
            label="Bank statement"
            active={step === 3}
            done={step > 3}
            disabled={!selectedMonth}
            onClick={() => selectedMonth && setStep(3)}
          />
          <ChevronRight size={14} className="step-sep" />
          <StepDot
            n={4}
            label="Review"
            active={step === 4}
            done={false}
            disabled={runs.length === 0}
            onClick={() => runs.length > 0 && setStep(4)}
          />
        </div>

        {loadingMsg && (
          <div style={{ fontSize: 13, color: "var(--sub)", marginBottom: 14 }}>{loadingMsg}</div>
        )}

        {!xeroAccounts && (
          <div className="card panel-inner" style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No shared file loaded yet</div>
            <div style={{ fontSize: 13, color: "var(--sub)" }}>Upload and map your Account Transactions export in <b>Shared Files</b> to reconcile against a bank statement.</div>
          </div>
        )}


        {/* STEP 1 — choose account */}
        {step === 1 && xeroAccounts && (
          <div className="card panel-inner">
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              Which account are you reconciling?
            </div>
            <div style={{ fontSize: 13, color: "var(--sub)", marginBottom: 18 }}>
              Found {accountNames.length} accounts in your shared Account Transactions file. Pick the bank or card you have a statement
              for.
            </div>
            <label className="field-label">Bank / card account</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              style={{ width: "100%", maxWidth: 420, marginBottom: 18 }}
            >
              {accountNames.map((n) => (
                <option key={n} value={n}>
                  {n} ({xeroAccounts[n].length} transactions)
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={() => setStep(2)} disabled={!selectedAccount}>
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 — choose month */}
        {step === 2 && (
          <div className="card panel-inner">
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Which month are you reconciling?</div>
            <div style={{ fontSize: 13, color: "var(--sub)", marginBottom: 18 }}>
              Only {selectedAccount} transactions from this month (plus a few days either side, based on your
              match tolerance) will be included.
            </div>
            <label className="field-label">Month</label>
            {availableMonths.length ? (
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ width: "100%", maxWidth: 320, marginBottom: 8 }}
              >
                {availableMonths.map((m) => (
                  <option key={m.key} value={m.key}>
                    {monthLabel(m.key)} — {m.count} transactions
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: 13, color: "var(--sub)" }}>No dated transactions found for this account.</div>
            )}
            {selectedMonth && (
              <div className="mono" style={{ fontSize: 12.5, color: "var(--sub)", marginBottom: 18 }}>
                {fmtDate(monthRange(selectedMonth).start)} – {fmtDate(monthRange(selectedMonth).end)}
              </div>
            )}
            <div>
              <button className="btn" onClick={() => setStep(3)} disabled={!selectedMonth}>
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — confirm bank data (upload/mapping now lives in Shared Files) */}
        {step === 3 && (
          <div className="card panel-inner">
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              Bank statement for {selectedAccount} — {selectedMonth ? monthLabel(selectedMonth) : ""}
            </div>

            {safeBankFiles.length === 0 ? (
              <>
                <div style={{ fontSize: 13, color: "var(--sub)", marginBottom: 18 }}>
                  No bank statements uploaded yet. Upload and map one in Shared Files, then come back here.
                </div>
                <button className="btn" onClick={() => onGoToSharedFiles && onGoToSharedFiles()}>
                  Go to Shared Files <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <>
                {safeBankFiles.length > 1 && (
                  <div style={{ marginBottom: 16 }}>
                    <label className="field-label">Which bank statement is this?</label>
                    <select
                      value={selectedBankFileId}
                      onChange={(e) => setSelectedBankFileId(e.target.value)}
                      style={{ width: "100%", maxWidth: 420 }}
                    >
                      {safeBankFiles.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.accountLabel ? `${f.accountLabel} — ${f.fileName}` : f.fileName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(!activeBankFile || !mappingReady) ? (
                  <>
                    <div style={{ fontSize: 13, color: "var(--sub)", marginBottom: 18 }}>
                      {!activeBankFile
                        ? "Select a bank statement above, or upload one in Shared Files."
                        : "This bank statement's columns aren't fully mapped yet. Finish mapping it in Shared Files."}
                    </div>
                    <button className="btn" onClick={() => onGoToSharedFiles && onGoToSharedFiles()}>
                      Go to Shared Files <ArrowRight size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        marginBottom: 18,
                        fontSize: 13,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <FileSpreadsheet size={15} /> {bankFileName} — {bankRows.length} rows, columns mapped
                      </span>
                      <button className="btn-ghost btn" onClick={() => onGoToSharedFiles && onGoToSharedFiles()}>
                        Change in Shared Files
                      </button>
                    </div>

                    <div>
                      <label className="field-label">Match tolerance</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={tolerance}
                          onChange={(e) => setTolerance(parseInt(e.target.value) || 0)}
                          style={{ width: 64 }}
                        />
                        <span style={{ fontSize: 13, color: "var(--sub)" }}>
                          days — same amount within this window counts as an automatic match
                        </span>
                      </div>
                    </div>

                    <button className="btn" disabled={!mappingReady} onClick={() => runReconciliation()}>
                      Run reconciliation <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* STEP 4 — review */}
        {step === 4 && runs.length > 0 && (
          <div>
            {runs.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {runs.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setActiveRunId(r.id)}
                    className="btn-ghost btn"
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: activeRunId === r.id ? "var(--accent)" : "#fff",
                      color: activeRunId === r.id ? "#fff" : "var(--ink)",
                    }}
                  >
                    {r.account} — {monthLabel(r.month)}
                    <span
                      onClick={(e) => { e.stopPropagation(); removeRun(r.id); }}
                      style={{ marginLeft: 2, display: "inline-flex", opacity: 0.75 }}
                      title="Remove this run"
                    >
                      <X size={12} />
                    </span>
                  </button>
                ))}
              </div>
            )}

            {activeRun && (
              <RunReport
                key={activeRun.id}
                results={activeRun.results}
                account={activeRun.account}
                monthLabelStr={activeRun.month ? monthLabel(activeRun.month) : ""}
                onAdjust={() => setStep(3)}
              />
            )}

            {runs.length < 3 && (
              <button className="btn-ghost btn" style={{ marginTop: 16 }} onClick={() => setStep(1)}>
                + Add another reconciliation ({runs.length}/3)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const BankReconciliationTool = { Component: BankReconciliation };
export { reconcile, buildBankTx, filterByMonthWithBuffer, monthRange };
export default BankReconciliation;
