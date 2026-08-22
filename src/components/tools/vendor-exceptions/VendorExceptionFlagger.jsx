import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Upload, ChevronDown, ChevronRight, Search, Settings, X, Check,
  AlertTriangle, Save, History, Trash2,
} from "lucide-react";
import useViewport from "../../../hooks/useViewport";


/* ============================================================
   SHARED FOUNDATION — same tokens/mapper pattern as the other
   three modules. Inlined here for a single testable file.
   ============================================================ */

const colors = {
  bg: "#F8FAFC", panel: "#FFFFFF", panel2: "#FAFBFC",
  line: "#E2E8F0", lineSoft: "#EDF1F5",
  ink: "#0F1B2D", inkMuted: "#64748B", inkFaint: "#94A3B8",
  accent: "#17375E", accentSoft: "#EAF0F7",
  emerald: "#22C55E", emeraldSoft: "#F0FDF4", good: "#16A34A",
  warn: "#B45309", warnSoft: "#FEF3C7",
  danger: "#DC2626", dangerSoft: "#FEF2F2",
};
const styles = {
  page: { fontFamily: "'Inter', system-ui, sans-serif", background: colors.bg, minHeight: "100vh", padding: "32px 24px", color: colors.ink },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.accent, marginBottom: 6 },
  h1: { fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" },
  subtitle: { color: colors.inkMuted, fontSize: 14, marginTop: 6, maxWidth: 620 },
  card: { background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 12, padding: 16 },
  select: { border: `1px solid ${colors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, background: "#fff" },
  primaryButton: { fontSize: 13.5, fontWeight: 700, padding: "9px 18px", borderRadius: 8, cursor: "pointer", border: "none", background: colors.accent, color: "#fff", display: "inline-flex", alignItems: "center", gap: 6 },
  ghostButton: { fontSize: 12.5, fontWeight: 700, padding: "7px 14px", borderRadius: 8, cursor: "pointer", border: `1px solid ${colors.line}`, background: "#fff", color: colors.inkMuted, display: "inline-flex", alignItems: "center", gap: 6 },
  label: { fontSize: 11, fontWeight: 700, color: colors.inkMuted, textTransform: "uppercase", marginBottom: 6, display: "block" },
  badgeErr: { fontSize: 11, fontWeight: 700, color: colors.danger, background: colors.dangerSoft, padding: "3px 9px", borderRadius: 12, display: "inline-flex", alignItems: "center", gap: 4 },
  badgeOk: { fontSize: 11, fontWeight: 700, color: colors.good, background: colors.emeraldSoft, padding: "3px 9px", borderRadius: 12, display: "inline-flex", alignItems: "center", gap: 4 },
  badgeNeutral: { fontSize: 11, fontWeight: 700, color: colors.inkMuted, background: colors.panel2, padding: "3px 9px", borderRadius: 12, display: "inline-flex", alignItems: "center", gap: 4 },
};

function esc(s) { return String(s == null ? "" : s); }
function fmtAmount(v) {
  if (v === "" || v == null) return "";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const MONTH_NAMES_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ---------- storage (window.storage with localStorage fallback) ---------- */
async function storageGet(key, shared) {
  try { if (window.storage) return await window.storage.get(key, !!shared); } catch (e) {}
  try { const raw = localStorage.getItem("vef:" + key); return raw !== null ? { key, value: raw, shared: !!shared } : null; } catch (e) { return null; }
}
async function storageSet(key, value, shared) {
  try { if (window.storage) return await window.storage.set(key, value, !!shared); } catch (e) {}
  try { localStorage.setItem("vef:" + key, value); return { key, value, shared: !!shared }; } catch (e) { return null; }
}
async function storageDelete(key, shared) {
  try { if (window.storage) return await window.storage.delete(key, !!shared); } catch (e) {}
  try { localStorage.removeItem("vef:" + key); return { key, deleted: true, shared: !!shared }; } catch (e) { return null; }
}

/* ============================================================
   CHART OF ACCOUNTS — role classification & auto-exclusion.
   coaAccounts itself is now built once in Shared Files and
   passed in as a prop; this tool only classifies + applies it.
   ============================================================ */

const ROLE_LABELS = { business: "Business", payment: "Payment", clearing: "Clearing", tax: "Tax", equity: "Equity", other: "Other" };
const IGNORED_ROLES = ["payment", "clearing", "tax", "equity"];

function autoRoleFromType(type, name) {
  const t = (type || "").toLowerCase().trim();
  const n = (name || "").toLowerCase().trim();
  if (/accounts?\s*receivable/.test(n) || /accounts?\s*receivable/.test(t)) return "clearing";
  if (/accounts?\s*payable/.test(n) || /accounts?\s*payable/.test(t)) return "clearing";
  if (/\bclearing\b|\bsuspense\b|undeposited/.test(n)) return "clearing";
  if (/\bbank\b/.test(t)) return "payment";
  if (/credit\s*card/.test(t) || /credit\s*card/.test(n)) return "payment";
  if (/\bgst\b|\bvat\b|sales\s*tax|tax\s*(payable|control|clearing)/.test(n) || /\bgst\b|\bvat\b/.test(t)) return "tax";
  if (/equity/.test(t)) return "equity";
  if (/expense|overhead|direct\s*cost|revenue|^sales$|other\s*income|fixed\s*asset/.test(t)) return "business";
  return "other";
}
function overrideKeyFor(entry) { return entry.code ? "code:" + entry.code : "name:" + entry.name.toLowerCase(); }

// Manual payroll/adjustment journals (e.g. "July 15 2026 Payroll
// Journal_Project Team & Admin") legitimately post to several accounts at
// once — there's no "usual category" for them, so they'd get flagged every
// time. Since the description embeds the date, a one-off manual exclude
// would only ever catch that single month's entry, not next month's. This
// pattern catches the whole class automatically instead.
function isLikelyJournalEntry(name) {
  return /payroll\s*journal|manual\s*journal|journal\s*entry|\bje\b|reclass(ification)?|adjustment\s*entry/i.test(name || "");
}

function findCoaEntry(categoryRaw, coaByCode, coaByName) {
  const raw = String(categoryRaw || "").trim();
  if (!raw) return null;
  const codeMatch = raw.match(/^(\d{3,7})\b/);
  if (codeMatch && coaByCode[codeMatch[1]]) return coaByCode[codeMatch[1]];
  const normalized = raw.toLowerCase();
  if (coaByName[normalized]) return coaByName[normalized];
  const stripped = raw.replace(/^\d{3,7}\s*[-\u2013\u2014]?\s*/, "").trim().toLowerCase();
  if (stripped && coaByName[stripped]) return coaByName[stripped];
  return null;
}

/* ============================================================
   CORE ANALYSIS
   ============================================================ */

function buildVendorData({ transactions, coaAccounts, coaOverrides, coaIncludeOverrides, excludedAccounts, excludedVendors, dualCategoryThresholdPct, materialityThreshold }) {
  const coaByCode = {}, coaByName = {};
  coaAccounts.forEach((e) => { if (e.code) coaByCode[e.code] = e; if (e.name) coaByName[e.name.trim().toLowerCase()] = e; });

  const effectiveRoleFor = (entry) => coaOverrides[overrideKeyFor(entry)] || autoRoleFromType(entry.type, entry.name);
  const isAccountIncluded = (entry) => {
    const key = overrideKeyFor(entry);
    if (key in coaIncludeOverrides) return coaIncludeOverrides[key];
    return !IGNORED_ROLES.includes(effectiveRoleFor(entry));
  };
  const getAccountIncludeForCategory = (categoryRaw) => {
    if (!coaAccounts.length) return null;
    const entry = findCoaEntry(categoryRaw, coaByCode, coaByName);
    return entry ? isAccountIncluded(entry) : null;
  };

  const vendorData = {};
  const monthPresence = {};
  let excludedCount = 0, excludedByAutoCount = 0, excludedByManualCount = 0;
  let rowIdCounter = 0;

  (transactions || []).forEach((t) => {
    const vendorRaw = String(t.vendor || t.description || "").trim();
    const categoryRaw = String(t.account || "").trim();
    if (!vendorRaw || !categoryRaw) return;
    if (isLikelyJournalEntry(vendorRaw)) { excludedByAutoCount++; excludedCount++; return; }
    const id = rowIdCounter++;

    const coaIncluded = getAccountIncludeForCategory(categoryRaw);
    if (coaIncluded === false) { excludedByAutoCount++; excludedCount++; return; }
    if (excludedAccounts.has(categoryRaw) || excludedVendors.has(vendorRaw)) { excludedByManualCount++; excludedCount++; return; }

    let monthKey = null, monthLabel = null, dateDisplay = "";
    if (t.date) {
      monthKey = t.date.getFullYear() + "-" + String(t.date.getMonth() + 1).padStart(2, "0");
      monthLabel = MONTH_NAMES_SHORT[t.date.getMonth()] + " " + t.date.getFullYear();
      dateDisplay = `${String(t.date.getMonth() + 1).padStart(2, "0")}/${String(t.date.getDate()).padStart(2, "0")}/${t.date.getFullYear()}`;
    } else {
      monthKey = "undated"; monthLabel = "Undated"; dateDisplay = "";
    }
    if (!monthPresence[monthKey]) monthPresence[monthKey] = { label: monthLabel, count: 0 };
    monthPresence[monthKey].count++;

    if (!vendorData[vendorRaw]) vendorData[vendorRaw] = { records: [], categoryCounts: {}, normalCategory: null };
    const entry = { id, vendor: vendorRaw, category: categoryRaw, date: dateDisplay, monthKey, monthLabel, amount: t.amount };
    vendorData[vendorRaw].records.push(entry);
    vendorData[vendorRaw].categoryCounts[categoryRaw] = (vendorData[vendorRaw].categoryCounts[categoryRaw] || 0) + 1;
  });

  Object.keys(vendorData).forEach((v) => {
    const vd = vendorData[v];
    const total = vd.records.length;
    // Every category that makes up a large-enough share of this vendor's
    // history counts as "normal" — not just the single most common one.
    // This keeps a vendor that legitimately splits spend across two real
    // accounts (e.g. a supplier billed to both Catering and Cleaning) from
    // being flagged forever on its second-most-common category.
    const sortedCats = Object.entries(vd.categoryCounts).sort((a, b) => b[1] - a[1]);
    const primary = sortedCats.length ? sortedCats[0][0] : null;
    const normalCategories = new Set(
      sortedCats.filter(([, count]) => total > 0 && count / total >= dualCategoryThresholdPct / 100).map(([cat]) => cat)
    );
    if (primary) normalCategories.add(primary); // always include the single most common, even if fragmented below the threshold
    vd.normalCategory = primary;
    vd.normalCategories = normalCategories;
    vd.records.forEach((r) => {
      const wouldFlag = total > 1 && !normalCategories.has(r.category);
      r.isFlag = wouldFlag && Math.abs(r.amount || 0) >= materialityThreshold;
    });
  });

  let monthOptions = Object.keys(monthPresence).filter((k) => k !== "undated").sort().map((k) => ({ key: k, label: monthPresence[k].label, count: monthPresence[k].count }));
  if (monthPresence.undated) monthOptions.push({ key: "undated", label: "Undated", count: monthPresence.undated.count });

  return { vendorData, monthOptions, excludedCount, excludedByAutoCount, excludedByManualCount };
}

/* ============================================================
   Searchable multi-select (used for manual vendor/account excludes)
   ============================================================ */

function MultiSelect({ options, selected, onToggle, placeholder }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);
  const filtered = Object.keys(options).filter((n) => n.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.localeCompare(b));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {[...selected].sort().map((name) => (
          <span key={name} style={{ ...styles.badgeNeutral, gap: 6 }}>
            {esc(name)}
            <X size={11} style={{ cursor: "pointer" }} onClick={() => onToggle(name)} />
          </span>
        ))}
      </div>
      <input
        value={search}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        placeholder={placeholder}
        style={{ ...styles.select, width: "100%" }}
      />
      {open && (
        <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, background: "#fff", border: `1px solid ${colors.line}`, borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: "auto", boxShadow: "0 4px 14px rgba(15,27,45,.08)" }}>
          {filtered.length === 0 && <div style={{ padding: 10, fontSize: 12.5, color: colors.inkFaint }}>No matches</div>}
          {filtered.map((name) => (
            <div
              key={name}
              onClick={() => onToggle(name)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", fontSize: 12.5, cursor: "pointer", background: selected.has(name) ? colors.accentSoft : "transparent" }}
            >
              <input type="checkbox" readOnly checked={selected.has(name)} />
              <span style={{ flex: 1 }}>{esc(name)}</span>
              <span style={{ color: colors.inkFaint }}>{options[name]}×</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

function formatCategories(vd) {
  if (!vd.normalCategories || vd.normalCategories.size <= 1) return vd.normalCategory;
  return [...vd.normalCategories].join(" / ");
}

function VendorExceptionFlagger({ transactions, coaAccounts }) {
  const { isMobile } = useViewport();
  const [coaOverrides, setCoaOverrides] = useState({});
  const [coaIncludeOverrides, setCoaIncludeOverrides] = useState({});
  const [materialityThreshold, setMaterialityThreshold] = useState(1000);
  const [dualCategoryThresholdPct, setDualCategoryThresholdPct] = useState(30);

  const [excludedVendors, setExcludedVendors] = useState(new Set());
  const [excludedAccounts, setExcludedAccounts] = useState(new Set());

  const [selectedMonthKey, setSelectedMonthKey] = useState("all");
  const [flagFilterMode, setFlagFilterMode] = useState("unreviewed");
  const [reviewed, setReviewed] = useState(new Set());
  const [expandedVendors, setExpandedVendors] = useState(new Set());
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [savedReviews, setSavedReviews] = useState([]);
  const [saving, setSaving] = useState(false);

  const showToast = (message, type) => {
    setToast({ message, type: type || "success" });
    setTimeout(() => setToast(null), 3200);
  };

  const refreshSavedReviewsList = useCallback(async () => {
    const res = await storageGet("reviews-index");
    let index = [];
    if (res) { try { index = JSON.parse(res.value) || []; } catch (e) {} }
    index.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    setSavedReviews(index);
  }, []);
  useEffect(() => { refreshSavedReviewsList(); }, [refreshSavedReviewsList]);

  // Smart default: pre-exclude obvious structural accounts the first time
  // transactions show up, unless the shared Chart of Accounts already
  // handles them.
  useEffect(() => {
    if (!transactions || !transactions.length) return;
    setExcludedAccounts((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set(prev);
      const structuralPattern = /accounts?\s*payable|accounts?\s*receivable|\bbank\b/i;
      const seen = new Set();
      transactions.forEach((t) => { if (t.account) seen.add(t.account); });
      seen.forEach((name) => { if (structuralPattern.test(name)) next.add(name); });
      return next;
    });
  }, [transactions]);

  const analysis = useMemo(() => {
    if (!transactions || !transactions.length) return null;
    return buildVendorData({
      transactions, coaAccounts: coaAccounts || [], coaOverrides, coaIncludeOverrides, excludedAccounts, excludedVendors,
      dualCategoryThresholdPct, materialityThreshold,
    });
  }, [transactions, coaAccounts, coaOverrides, coaIncludeOverrides, excludedAccounts, excludedVendors, dualCategoryThresholdPct, materialityThreshold]);

  const vendorData = analysis?.vendorData || {};
  const monthOptions = analysis?.monthOptions || [];

  const recordsInSelectedMonth = (records) => (selectedMonthKey === "all" ? records : records.filter((r) => r.monthKey === selectedMonthKey));

  const vendorsInView = useMemo(() => {
    if (!analysis) return [];
    return Object.keys(vendorData).filter((v) => recordsInSelectedMonth(vendorData[v].records).length > 0);
  }, [analysis, vendorData, selectedMonthKey]);

  const totals = useMemo(() => {
    let totalTx = 0, totalFlags = 0;
    vendorsInView.forEach((v) => {
      const inMonth = recordsInSelectedMonth(vendorData[v].records);
      totalTx += inMonth.length;
      totalFlags += inMonth.filter((r) => r.isFlag).length;
    });
    return { totalTx, totalFlags };
  }, [vendorsInView, vendorData, selectedMonthKey]);

  // Manual exclude option lists — CoA-aware: accounts already auto-ignored by
  // the imported Chart of Accounts are left out, since excluding them again
  // here would be redundant and confusing.
  const { accountOptionCounts, vendorOptionCounts } = useMemo(() => {
    const accountOptionCounts = {}, vendorOptionCounts = {};
    if (!transactions || !transactions.length) return { accountOptionCounts, vendorOptionCounts };
    const coaByCode = {}, coaByName = {};
    (coaAccounts || []).forEach((e) => { if (e.code) coaByCode[e.code] = e; if (e.name) coaByName[e.name.trim().toLowerCase()] = e; });
    const effectiveRoleFor = (entry) => coaOverrides[overrideKeyFor(entry)] || autoRoleFromType(entry.type, entry.name);
    const isAccountIncluded = (entry) => {
      const key = overrideKeyFor(entry);
      if (key in coaIncludeOverrides) return coaIncludeOverrides[key];
      return !IGNORED_ROLES.includes(effectiveRoleFor(entry));
    };
    transactions.forEach((t) => {
      const c = String(t.account || "").trim();
      const v = String(t.vendor || t.description || "").trim();
      if (c) {
        const entry = findCoaEntry(c, coaByCode, coaByName);
        const autoIgnored = entry ? !isAccountIncluded(entry) : false;
        if (!autoIgnored) accountOptionCounts[c] = (accountOptionCounts[c] || 0) + 1;
      }
      if (v && !isLikelyJournalEntry(v)) vendorOptionCounts[v] = (vendorOptionCounts[v] || 0) + 1;
    });
    return { accountOptionCounts, vendorOptionCounts };
  }, [transactions, coaAccounts, coaOverrides, coaIncludeOverrides]);

  const toggleExcludedAccount = (name) => setExcludedAccounts((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const toggleExcludedVendor = (name) => setExcludedVendors((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const flagListItems = useMemo(() => {
    if (!analysis) return [];
    let items = [];
    Object.keys(vendorData).forEach((v) => vendorData[v].records.forEach((r) => items.push(r)));
    items = recordsInSelectedMonth(items);
    if (flagFilterMode === "unreviewed") items = items.filter((r) => r.isFlag && !reviewed.has(r.vendor + "|" + r.id));
    else if (flagFilterMode === "consistent") items = items.filter((r) => !r.isFlag);
    items.sort((a, b) => (a.isFlag !== b.isFlag ? (a.isFlag ? -1 : 1) : a.vendor.localeCompare(b.vendor)));
    return items;
  }, [analysis, vendorData, selectedMonthKey, flagFilterMode, reviewed]);

  const toggleReviewed = (r) => setReviewed((prev) => { const n = new Set(prev); const key = r.vendor + "|" + r.id; n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleExpandedItem = (r) => setExpandedItems((prev) => { const n = new Set(prev); const key = r.vendor + "|" + r.id; n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleExpandedVendor = (v) => setExpandedVendors((prev) => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });

  const filteredVendorRows = useMemo(() => {
    const term = search.toLowerCase();
    return vendorsInView
      .filter((v) => v.toLowerCase().includes(term))
      .sort((a, b) => {
        const fa = recordsInSelectedMonth(vendorData[a].records).filter((r) => r.isFlag).length;
        const fb = recordsInSelectedMonth(vendorData[b].records).filter((r) => r.isFlag).length;
        return fb !== fa ? fb - fa : a.localeCompare(b);
      });
  }, [vendorsInView, vendorData, search, selectedMonthKey]);

  const vendorInitials = (name) => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  const flaggedVendorsThisMonth = useMemo(() => {
    return vendorsInView
      .map((v) => ({ name: v, count: recordsInSelectedMonth(vendorData[v].records).filter((r) => r.isFlag).length, normalCategory: formatCategories(vendorData[v]) }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [vendorsInView, vendorData, selectedMonthKey]);

  const monthLabel = (key) => (key === "all" ? "all periods" : monthOptions.find((m) => m.key === key)?.label || key);

  /* ---------- Save / load reviews ----------
     Only the override/settings state is saved now — the underlying
     file lives in Shared Files, so loading a review re-applies these
     choices on top of whatever shared file is currently loaded. */
  const saveCurrentReview = async () => {
    if (!transactions || !transactions.length) { showToast("Load a shared file before saving a review.", "error"); return; }
    setSaving(true);
    try {
      const now = new Date();
      const dateStr = `${MONTH_NAMES_SHORT[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
      const sameDayCount = savedReviews.filter((e) => e.dateStr === dateStr).length;
      const label = sameDayCount === 0 ? `Review on ${dateStr}` : `Review on ${dateStr} ${sameDayCount}`;
      const id = "rev_" + now.getTime() + "_" + Math.random().toString(36).slice(2, 7);

      const snapshot = {
        coaOverrides, coaIncludeOverrides,
        excludedAccounts: [...excludedAccounts], excludedVendors: [...excludedVendors],
        reviewed: [...reviewed], selectedMonthKey, savedAt: now.toISOString(),
      };
      const entry = { id, label, dateStr, savedAt: snapshot.savedAt, stats: { tx: totals.totalTx, vendors: vendorsInView.length, flags: totals.totalFlags } };

      const setResult = await storageSet("review-data:" + id, JSON.stringify(snapshot));
      if (!setResult) throw new Error("storage write failed");
      const nextIndex = [...savedReviews, entry];
      await storageSet("reviews-index", JSON.stringify(nextIndex));
      setSavedReviews(nextIndex);
      showToast(`Saved as "${label}"`, "success");
    } catch (err) {
      showToast("Could not save this review. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const loadReview = async (id, label) => {
    try {
      const res = await storageGet("review-data:" + id);
      if (!res) { showToast("Could not find that saved review.", "error"); return; }
      const saved = JSON.parse(res.value);
      setCoaOverrides(saved.coaOverrides || {});
      setCoaIncludeOverrides(saved.coaIncludeOverrides || {});
      setExcludedAccounts(new Set(saved.excludedAccounts || []));
      setExcludedVendors(new Set(saved.excludedVendors || []));
      setReviewed(new Set(saved.reviewed || []));
      setSelectedMonthKey(saved.selectedMonthKey || "all");
      setSettingsOpen(false);
      showToast("Review loaded.", "success");
    } catch (err) {
      showToast("Could not load that saved review.", "error");
    }
  };

  const deleteReview = async (id, label) => {
    try {
      await storageDelete("review-data:" + id);
      const nextIndex = savedReviews.filter((e) => e.id !== id);
      await storageSet("reviews-index", JSON.stringify(nextIndex));
      setSavedReviews(nextIndex);
      showToast("Deleted.", "success");
    } catch (err) {
      showToast("Could not delete that review.", "error");
    }
  };

  const toggleCoaInclude = (entry, value) => {
    setCoaIncludeOverrides((prev) => ({ ...prev, [overrideKeyFor(entry)]: value }));
  };

  return (
    <div style={{ ...styles.page, padding: isMobile ? "20px 12px" : styles.page.padding }}>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>
        <div style={{ marginBottom: 24, borderBottom: `1px solid ${colors.line}`, paddingBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={styles.eyebrow}>LEDGER WATCH</div>
            <h1 style={styles.h1}>Vendor Exception Review</h1>
            <p style={styles.subtitle}>Learns each vendor's usual account from history and flags anything posted somewhere else.</p>
          </div>
          {transactions && transactions.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveCurrentReview} disabled={saving} style={{ ...styles.ghostButton, opacity: saving ? 0.6 : 1 }}><Save size={13} /> {saving ? "Saving…" : "Save this review"}</button>
              <button onClick={() => setSettingsOpen(true)} style={styles.ghostButton}><Settings size={13} /> Settings</button>
            </div>
          )}
        </div>

        {toast && (
          <div style={{ position: "fixed", top: 20, right: 20, zIndex: 80, background: toast.type === "error" ? colors.dangerSoft : colors.emeraldSoft, color: toast.type === "error" ? colors.danger : colors.good, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 14px rgba(15,27,45,.12)" }}>
            {toast.message}
          </div>
        )}

        {(!transactions || !transactions.length) && (
          <div style={{ ...styles.card, textAlign: "center", padding: 40 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No shared file loaded yet</div>
            <div style={{ fontSize: 13, color: colors.inkMuted }}>Upload and map your Account Transactions export in <b>Shared Files</b> to run this review.</div>
          </div>
        )}

        {savedReviews.length > 0 && (!transactions || !transactions.length) && (
          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><History size={14} /> Saved reviews</div>
            {savedReviews.slice().sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)).map((entry) => (
              <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${colors.lineSoft}`, fontSize: 12.5 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{entry.label}</div>
                  <div style={{ color: colors.inkFaint, fontSize: 11.5 }}>{entry.stats?.tx || 0} tx · {entry.stats?.flags || 0} flagged</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => loadReview(entry.id, entry.label)} style={styles.ghostButton}>Load</button>
                  <button onClick={() => deleteReview(entry.id, entry.label)} style={{ ...styles.ghostButton, color: colors.danger }}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {transactions && transactions.length > 0 && analysis && (
          <>
            {settingsOpen && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.35)", zIndex: 45 }} onClick={() => setSettingsOpen(false)}>
                <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "92vw", background: "#fff", borderLeft: `1px solid ${colors.line}`, padding: 22, overflowY: "auto", zIndex: 50 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>Settings</div>
                    <button onClick={() => setSettingsOpen(false)} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={18} /></button>
                  </div>

                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Chart of Accounts</div>
                    <div style={{ fontSize: 11.5, color: colors.inkFaint, marginBottom: 10 }}>
                      Managed in <b>Shared Files</b>. When loaded, it automatically ignores bank, AP/AR, tax, and equity accounts — the double-entry lines that aren't real vendor spend.
                    </div>
                    {(!coaAccounts || coaAccounts.length === 0) && (
                      <div style={{ fontSize: 12.5, color: colors.inkFaint, fontStyle: "italic" }}>No Chart of Accounts loaded yet — head to Shared Files to add one (optional).</div>
                    )}
                    {coaAccounts && coaAccounts.length > 0 && (
                      <>
                        <div style={{ fontSize: 12, color: colors.good, marginBottom: 8 }}>{coaAccounts.length} accounts available from Shared Files</div>
                        <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${colors.line}`, borderRadius: 8 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: "left", padding: "6px 8px", background: colors.panel2, fontSize: 10, textTransform: "uppercase", color: colors.inkFaint }}>Account</th>
                                <th style={{ textAlign: "left", padding: "6px 8px", background: colors.panel2, fontSize: 10, textTransform: "uppercase", color: colors.inkFaint }}>Role</th>
                                <th style={{ textAlign: "center", padding: "6px 8px", background: colors.panel2, fontSize: 10, textTransform: "uppercase", color: colors.inkFaint }}>Include</th>
                              </tr>
                            </thead>
                            <tbody>
                              {coaAccounts.map((entry) => {
                                const role = coaOverrides[overrideKeyFor(entry)] || autoRoleFromType(entry.type, entry.name);
                                const key = overrideKeyFor(entry);
                                const included = key in coaIncludeOverrides ? coaIncludeOverrides[key] : !IGNORED_ROLES.includes(role);
                                return (
                                  <tr key={key} style={{ borderTop: `1px solid ${colors.lineSoft}` }}>
                                    <td style={{ padding: "6px 8px" }}>{entry.name}</td>
                                    <td style={{ padding: "6px 8px", color: colors.inkFaint }}>{ROLE_LABELS[role]}</td>
                                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                      <input type="checkbox" checked={included} onChange={(e) => toggleCoaInclude(entry, e.target.checked)} />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Detection tuning</div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={styles.label}>Materiality threshold — ${materialityThreshold.toLocaleString()}</label>
                      <input type="range" min={500} max={10000} step={250} value={materialityThreshold} onChange={(e) => setMaterialityThreshold(Number(e.target.value))} style={{ width: "100%" }} />
                      <div style={{ fontSize: 11.5, color: colors.inkFaint }}>Ignore exceptions where the transaction amount falls under this — keeps small miscodes from cluttering the review.</div>
                    </div>

                    <div>
                      <label style={styles.label}>Split-vendor tolerance — {dualCategoryThresholdPct}%</label>
                      <input type="range" min={15} max={45} step={5} value={dualCategoryThresholdPct} onChange={(e) => setDualCategoryThresholdPct(Number(e.target.value))} style={{ width: "100%" }} />
                      <div style={{ fontSize: 11.5, color: colors.inkFaint }}>If a second category makes up at least this share of a vendor's history, treat it as normal too — for vendors that legitimately split spend across two accounts.</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Manually ignored accounts</div>
                    <div style={{ fontSize: 11.5, color: colors.inkFaint, marginBottom: 8 }}>
                      {coaAccounts && coaAccounts.length > 0 ? "Accounts already auto-ignored by the Chart of Accounts aren't shown here." : "Ad hoc overrides — for anything the Chart of Accounts doesn't cover."}
                    </div>
                    <MultiSelect options={accountOptionCounts} selected={excludedAccounts} onToggle={toggleExcludedAccount} placeholder="Search accounts to ignore…" />
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Manually ignored vendors</div>
                    <MultiSelect options={vendorOptionCounts} selected={excludedVendors} onToggle={toggleExcludedVendor} placeholder="Search vendors to ignore…" />
                  </div>
                </div>
              </div>
            )}

            {monthOptions.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {[{ key: "all", label: "All", count: monthOptions.reduce((s, m) => s + m.count, 0) }, ...monthOptions].map((m) => (
                  <button key={m.key} onClick={() => setSelectedMonthKey(m.key)} style={{
                    fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 20, cursor: "pointer",
                    border: `1px solid ${selectedMonthKey === m.key ? colors.accent : colors.line}`,
                    background: selectedMonthKey === m.key ? colors.accent : "#fff",
                    color: selectedMonthKey === m.key ? "#fff" : colors.inkMuted,
                  }}>{m.label} <span style={{ opacity: 0.7 }}>{m.count}</span></button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: colors.inkFaint, marginTop: -10, marginBottom: 16 }}>
              {selectedMonthKey === "all"
                ? "Each vendor's \"usual category\" is calculated from its full history, regardless of period."
                : "Showing this period only — but each vendor's \"usual category\" still comes from its full history, so a one-off gets caught even with nothing else to compare against this month."}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 20 }}>
              {[
                { label: "Transactions in view", value: totals.totalTx, color: colors.accent },
                { label: "Vendors in view", value: vendorsInView.length, color: colors.accent },
                { label: "Exceptions flagged", value: totals.totalFlags, color: colors.danger },
                { label: "Excluded rows", value: analysis.excludedCount, color: colors.inkMuted, sub: `${analysis.excludedByAutoCount} auto (CoA) · ${analysis.excludedByManualCount} manual` },
              ].map((c) => (
                <div key={c.label} style={styles.card}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: 12.5, color: colors.inkMuted, marginTop: 4 }}>{c.label}</div>
                  {c.sub && <div style={{ fontSize: 10.5, color: colors.inkFaint, marginTop: 2 }}>{c.sub}</div>}
                </div>
              ))}
            </div>

            <div style={{ ...styles.card, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Summary — {monthLabel(selectedMonthKey)}</div>
              {flaggedVendorsThisMonth.length === 0 ? (
                <div style={{ fontSize: 13, color: colors.inkMuted }}>Nothing unusual — {vendorsInView.length} vendor{vendorsInView.length === 1 ? "" : "s"} reviewed, all posting to their usual account.</div>
              ) : (
                flaggedVendorsThisMonth.map((v) => (
                  <div key={v.name} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, padding: "6px 0", borderTop: `1px solid ${colors.lineSoft}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0, background: colors.danger }} />
                    <span><b>{esc(v.name)}</b> has {v.count} transaction{v.count === 1 ? "" : "s"} posted outside its usual account (<b>{esc(v.normalCategory)}</b>) this period.</span>
                  </div>
                ))
              )}
            </div>

            <div style={{ background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${colors.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>Vendors</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${colors.line}`, borderRadius: 8, padding: "6px 10px" }}>
                  <Search size={13} style={{ color: colors.inkFaint }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor…" style={{ border: "none", outline: "none", fontSize: 13, width: 160 }} />
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560, fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ width: 24, padding: "10px 12px", background: colors.panel2, borderBottom: `1px solid ${colors.line}` }} />
                    <th style={{ textAlign: "left", padding: "10px 12px", background: colors.panel2, borderBottom: `1px solid ${colors.line}`, fontSize: 11, textTransform: "uppercase", color: colors.inkFaint }}>Vendor</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", background: colors.panel2, borderBottom: `1px solid ${colors.line}`, fontSize: 11, textTransform: "uppercase", color: colors.inkFaint }}>Usual account</th>
                    <th style={{ textAlign: "right", padding: "10px 12px", background: colors.panel2, borderBottom: `1px solid ${colors.line}`, fontSize: 11, textTransform: "uppercase", color: colors.inkFaint }}>Tx</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", background: colors.panel2, borderBottom: `1px solid ${colors.line}`, fontSize: 11, textTransform: "uppercase", color: colors.inkFaint }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendorRows.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: colors.inkFaint, fontSize: 13 }}>No vendors with activity in this period.</td></tr>
                  )}
                  {filteredVendorRows.map((v) => {
                    const vd = vendorData[v];
                    const monthRecs = recordsInSelectedMonth(vd.records);
                    const flagCount = monthRecs.filter((r) => r.isFlag).length;
                    const catsUsed = Object.keys(vd.categoryCounts);
                    const isExpanded = expandedVendors.has(v);
                    return (
                      <React.Fragment key={v}>
                        <tr onClick={() => toggleExpandedVendor(v)} style={{ cursor: "pointer" }}>
                          <td style={{ padding: "9px 12px", borderBottom: `1px solid ${colors.lineSoft}` }}>
                            {isExpanded ? <ChevronDown size={12} color={colors.inkFaint} /> : <ChevronRight size={12} color={colors.inkFaint} />}
                          </td>
                          <td style={{ padding: "9px 12px", borderBottom: `1px solid ${colors.lineSoft}`, fontWeight: 600 }}>
                            <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: 11, background: colors.accentSoft, color: colors.accent, alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, marginRight: 8 }}>{vendorInitials(v)}</span>
                            {esc(v)}
                          </td>
                          <td style={{ padding: "9px 12px", borderBottom: `1px solid ${colors.lineSoft}` }}>
                            {esc(formatCategories(vd))}
                            {catsUsed.length > 1 && <div style={{ fontSize: 10.5, color: colors.inkFaint }}>{catsUsed.length} categories used across full history</div>}
                          </td>
                          <td style={{ padding: "9px 12px", borderBottom: `1px solid ${colors.lineSoft}`, textAlign: "right" }}>{monthRecs.length}</td>
                          <td style={{ padding: "9px 12px", borderBottom: `1px solid ${colors.lineSoft}` }}>
                            {flagCount > 0
                              ? <span style={styles.badgeErr}><AlertTriangle size={11} /> {flagCount} exception{flagCount === 1 ? "" : "s"}</span>
                              : <span style={styles.badgeOk}><Check size={11} /> Consistent</span>}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} style={{ background: colors.panel2, padding: "12px 16px 16px 44px", borderBottom: `1px solid ${colors.line}` }}>
                              {[...vd.records].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((r, k) => (
                                <div key={k} style={{ display: "grid", gridTemplateColumns: "100px 1fr 100px auto", gap: 10, fontSize: 12, padding: "4px 0", color: r.isFlag ? colors.danger : "#334155" }}>
                                  <span>{esc(r.date || "—")}</span>
                                  <span>{esc(r.category)}</span>
                                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtAmount(r.amount)}</span>
                                  <span>{r.isFlag ? <span style={styles.badgeErr}><AlertTriangle size={10} /> Flagged</span> : ""}</span>
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                </table>
              </div>
            </div>

            <div style={{ background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${colors.line}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { key: "unreviewed", label: "Unreviewed exceptions" },
                  { key: "all", label: "All" },
                  { key: "consistent", label: "Consistent" },
                ].map((f) => (
                  <button key={f.key} onClick={() => setFlagFilterMode(f.key)} style={{
                    fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 20, cursor: "pointer",
                    border: `1px solid ${flagFilterMode === f.key ? colors.accent : colors.line}`,
                    background: flagFilterMode === f.key ? colors.accent : "#fff",
                    color: flagFilterMode === f.key ? "#fff" : colors.inkMuted,
                  }}>{f.label}</button>
                ))}
              </div>
              <div style={{ padding: 16 }}>
                {flagListItems.length === 0 && (
                  <div style={{ textAlign: "center", padding: 24, color: colors.inkFaint, fontSize: 13 }}>
                    {flagFilterMode === "consistent" ? "No consistent transactions match this view." : "No exceptions to show. Nice and clean."}
                  </div>
                )}
                {flagListItems.map((r) => {
                  const vd = vendorData[r.vendor];
                  const key = r.vendor + "|" + r.id;
                  const isReviewed = reviewed.has(key);
                  const isDetailOpen = expandedItems.has(key);
                  return (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: `1px solid ${colors.lineSoft}`, opacity: isReviewed ? 0.6 : 1 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 13.5 }}>{esc(r.vendor)}</span>
                          {r.isFlag ? <span style={styles.badgeErr}><AlertTriangle size={11} /> Exception</span> : <span style={styles.badgeOk}><Check size={11} /> Consistent</span>}
                          {isReviewed && <span style={styles.badgeNeutral}><Check size={11} /> Reviewed</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: colors.inkFaint, marginTop: 3 }}>{esc(r.date || "no date")} · {fmtAmount(r.amount)}</div>
                        <div style={{ fontSize: 12.5, marginTop: 4 }}>
                          {r.isFlag
                            ? <>Posted to <b>{esc(r.category)}</b> — usually categorized as <b>{esc(formatCategories(vd))}</b>.</>
                            : <>Posted to <b>{esc(r.category)}</b> — matches this vendor's usual category.</>}
                        </div>
                        <button onClick={() => toggleExpandedItem(r)} style={{ marginTop: 6, background: "none", border: "none", color: colors.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
                          {isDetailOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {isDetailOpen ? "Hide details" : "View details"}
                        </button>
                        {isDetailOpen && (
                          <div style={{ marginTop: 8, background: colors.panel2, borderRadius: 8, padding: 10 }}>
                            {[...vd.records].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((rec, k) => (
                              <div key={k} style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px", gap: 8, fontSize: 11.5, padding: "3px 0", color: rec.isFlag ? colors.danger : "#334155" }}>
                                <span>{esc(rec.date || "—")}</span>
                                <span>{esc(rec.category)}</span>
                                <span style={{ textAlign: "right" }}>{fmtAmount(rec.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {r.isFlag && (
                        <button onClick={() => toggleReviewed(r)} style={{ ...styles.ghostButton, height: "fit-content", ...(isReviewed ? { background: colors.emeraldSoft, color: colors.good, borderColor: colors.emeraldSoft } : {}) }}>
                          <Check size={12} /> {isReviewed ? "Reviewed" : "Mark reviewed"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Dashboard support — same buildVendorData logic, with this tool's own
// shipped defaults and no manual exclusions (those are session-specific
// review choices, not part of the underlying detection).
function getObservations(transactions, coaAccounts, settingsOverride) {
  const s = { dualCategoryThresholdPct: 30, materialityThreshold: 1000, ...settingsOverride };
  const analysis = buildVendorData({
    transactions, coaAccounts: coaAccounts || [], coaOverrides: {}, coaIncludeOverrides: {},
    excludedAccounts: new Set(), excludedVendors: new Set(), dualCategoryThresholdPct: s.dualCategoryThresholdPct, materialityThreshold: s.materialityThreshold,
  });
  if (!analysis) return [];
  const obs = [];
  Object.keys(analysis.vendorData).forEach((v) => {
    const vd = analysis.vendorData[v];
    // One combined line per vendor PER MONTH — several flagged transactions
    // in the same month (even to different wrong categories) collapse into
    // a single sentence instead of repeating a line per transaction.
    // Different months are never merged together.
    const byMonth = new Map(); // monthKey -> { monthLabel, categories: Set }
    vd.records.forEach((r) => {
      if (!r.isFlag || r.monthKey === "undated") return;
      if (!byMonth.has(r.monthKey)) byMonth.set(r.monthKey, { monthLabel: r.monthLabel, categories: new Set() });
      byMonth.get(r.monthKey).categories.add(r.category);
    });
    byMonth.forEach(({ monthLabel, categories }, monthKey) => {
      const cats = [...categories];
      const catText = cats.length === 1 ? cats[0] : cats.slice(0, -1).join(", ") + " and " + cats[cats.length - 1];
      const normalCount = vd.categoryCounts[vd.normalCategory] || 0;
      const total = vd.records.length;
      obs.push({
        module: "vendor", monthKey, monthLabelStr: monthLabel,
        title: "Vendor Coding Exception",
        issue: `${v} was coded to ${catText} this month, instead of the usual ${formatCategories(vd)}.`,
        recommendation: "Worth confirming that's intentional.",
        detailedIssue: `${v} was coded to ${catText} this month — it's been coded to ${formatCategories(vd)} in ${normalCount} of its last ${total} transaction${total === 1 ? "" : "s"} on file.`,
        detailedRecommendation: total >= 6 ? "Worth confirming that's intentional, since it's a break from a pretty consistent pattern." : "Worth confirming that's intentional — there isn't much history on this vendor yet, so it's worth a closer look either way.",
      });
    });
  });
  return obs;
}

export { getObservations };
export const VendorExceptionFlaggerTool = { Component: VendorExceptionFlagger, getObservations };
export default VendorExceptionFlagger;
