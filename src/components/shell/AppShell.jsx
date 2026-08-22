import React, { useState, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  Upload, Database, Table2, LayoutDashboard, Landmark, LogOut, User,
  ChevronDown, ChevronRight, Menu,
} from "lucide-react";

import { shellColors } from "../../constants/theme";
import { TOOLS } from "../../constants/tools";
import { useAuth } from "../../context/AuthContext";
import useViewport from "../../hooks/useViewport";
import {
  guessHeaderRowUniversal,
  guessCoaHeaderRow,
  guessBankMapping,
  buildSharedTransactions,
  buildCoaAccountsFromRows,
} from "../../utils/fileUtils";

import { ExpenseConsistencyAuditTool } from "../tools/expense-audit";
import { DuplicateTransactionAuditTool } from "../tools/duplicate-audit";
import { BankReconciliationTool, reconcile, buildBankTx, filterByMonthWithBuffer, monthRange } from "../tools/bank-reconciliation";
import { VendorExceptionFlaggerTool } from "../tools/vendor-exceptions";
import { RatioConsistencyAuditTool } from "../tools/ratio-audit";

import UniversalColumnMapper from "../shared/UniversalColumnMapper";
import CoaColumnMapper from "../shared/CoaColumnMapper";
import BankColumnMapper from "../shared/BankColumnMapper";
import SharedFilesScreen from "../shared/SharedFilesScreen";
import DashboardScreen from "../dashboard/DashboardScreen";

function AppShell() {
  const { user, signOut } = useAuth();
  const { isMobile } = useViewport();
  const [active, setActive] = useState("sharedfiles");
  const [toolsOpen, setToolsOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const [sharedFile, setSharedFile] = useState(null); // { fileName, rawRows }
  const [sharedMapping, setSharedMapping] = useState(null); // { mapping, headerRowIdx, dateFormatPref }
  const [mapperOpen, setMapperOpen] = useState(false);
  const [fileError, setFileError] = useState("");

  const [coaFile, setCoaFile] = useState(null); // { fileName, rawRows, accountCount }
  const [coaMapping, setCoaMapping] = useState(null); // { mapping, headerRowIdx }
  const [coaMapperOpen, setCoaMapperOpen] = useState(false);
  const [bankRecoSnapshot, setBankRecoSnapshot] = useState(null);
  const [coaError, setCoaError] = useState("");

  const handleSharedUpload = useCallback((file) => {
    setFileError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const sheetName = wb.SheetNames.find((n) => /transaction/i.test(n)) || wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, raw: true });
        if (!rows.length) { setFileError("Could not find any rows in " + file.name + "."); return; }
        setSharedFile({ fileName: file.name, rawRows: rows });
        setSharedMapping(null);
        setMapperOpen(true);
      } catch (err) {
        setFileError("Could not read " + file.name + ": " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleRemoveSharedFile = () => {
    setSharedFile(null);
    setSharedMapping(null);
    setFileError("");
  };

  const handleCoaUpload = useCallback((file) => {
    setCoaError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = file.name.toLowerCase().endsWith(".csv")
          ? XLSX.read(e.target.result, { type: "binary" })
          : XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
        if (!rows.length) { setCoaError("Could not find any rows in " + file.name + "."); return; }
        setCoaFile({ fileName: file.name, rawRows: rows, accountCount: 0 });
        setCoaMapping(null);
        setCoaMapperOpen(true);
      } catch (err) {
        setCoaError("Could not read " + file.name + ": " + err.message);
      }
    };
    if (file.name.toLowerCase().endsWith(".csv")) reader.readAsBinaryString(file);
    else reader.readAsArrayBuffer(file);
  }, []);

  const handleRemoveCoaFile = () => {
    setCoaFile(null);
    setCoaMapping(null);
    setCoaError("");
  };

  const handleCoaMappingConfirm = (m) => {
    setCoaMapping(m);
    setCoaMapperOpen(false);
    const accounts = buildCoaAccountsFromRows(coaFile.rawRows, m.headerRowIdx, m.mapping);
    setCoaFile((f) => ({ ...f, accountCount: accounts.length }));
  };

  const [bankFiles, setBankFiles] = useState([]); // [{ id, fileName, rows, fields, mapping, accountLabel }]
  const [bankMapperOpenId, setBankMapperOpenId] = useState(null);
  const [bankError, setBankError] = useState("");

  const handleBankUpload = useCallback((file) => {
    setBankError("");
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let fields = [];
        let rows = [];
        if (isCsv) {
          const parsed = Papa.parse(ev.target.result, { header: true, skipEmptyLines: true });
          fields = parsed.meta.fields || [];
          rows = parsed.data;
        } else {
          const data = new Uint8Array(ev.target.result);
          const wb = XLSX.read(data, { type: "array", cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(ws, { defval: null });
          fields = rows.length ? Object.keys(rows[0]) : [];
        }
        if (!rows.length) { setBankError("Could not find any rows in " + file.name + "."); return; }
        const id = "bank_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        setBankFiles((prev) => [...prev, { id, fileName: file.name, rows, fields, mapping: null, accountLabel: "" }]);
        setBankMapperOpenId(id);
      } catch (err) {
        setBankError("Could not read " + file.name + ": " + err.message);
      }
    };
    if (isCsv) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }, []);

  const handleRemoveBankFile = (id) => {
    setBankFiles((prev) => prev.filter((f) => f.id !== id));
    setBankError("");
  };

  const handleBankMappingConfirm = (id, mapping) => {
    setBankFiles((prev) => prev.map((f) => (f.id === id ? { ...f, mapping } : f)));
    setBankMapperOpenId(null);
  };

  const handleSetBankLabel = (id, accountLabel) => {
    setBankFiles((prev) => prev.map((f) => (f.id === id ? { ...f, accountLabel } : f)));
  };

  const handleSetBankMonth = (id, monthLabel) => {
    setBankFiles((prev) => prev.map((f) => (f.id === id ? { ...f, monthLabel } : f)));
  };

  const handleToggleBankReco = (id) => {
    setBankFiles((prev) => {
      const selectedCount = prev.filter((f) => f.selectedForReco).length;
      return prev.map((f) => {
        if (f.id !== id) return f;
        if (!f.selectedForReco && selectedCount >= 3) return f; // cap at 3
        return { ...f, selectedForReco: !f.selectedForReco };
      });
    });
  };

  const [pendingRecoRuns, setPendingRecoRuns] = useState(null);
  const handleRunReconciliationFromDashboard = (specs) => {
    setPendingRecoRuns(specs);
    setActive("reconciliation");
  };

  const sharedTransactions = useMemo(() => {
    if (!sharedFile || !sharedMapping) return null;
    return buildSharedTransactions(sharedFile.rawRows, sharedMapping.headerRowIdx, sharedMapping.mapping, sharedMapping.dateFormatPref);
  }, [sharedFile, sharedMapping]);

  const xeroAccountNames = useMemo(() => {
    if (!sharedTransactions) return [];
    return [...new Set(sharedTransactions.map((t) => t.account).filter(Boolean))].sort();
  }, [sharedTransactions]);

  const sharedCoaAccounts = useMemo(() => {
    if (!coaFile || !coaMapping) return [];
    return buildCoaAccountsFromRows(coaFile.rawRows, coaMapping.headerRowIdx, coaMapping.mapping);
  }, [coaFile, coaMapping]);

  // ── Auto-reconciliation ──────────────────────────────────────────────
  // Whenever bank files are fully configured (mapped + account tagged +
  // month tagged) AND Xero transactions are available, automatically
  // compute reconciliation results and push them into bankRecoSnapshot
  // so the Reports page picks them up without any manual step.
  const MONTH_NAMES_LOOKUP = {
    January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
    July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
  };

  useEffect(() => {
    if (!sharedTransactions || !sharedTransactions.length) return;
    if (!bankFiles || !bankFiles.length) return;

    // Build the same per-account map the reconciliation tool uses.
    const xeroAccounts = {};
    sharedTransactions.forEach((t) => {
      if (!t.account || !t.date) return;
      if (!xeroAccounts[t.account]) xeroAccounts[t.account] = [];
      xeroAccounts[t.account].push({ date: t.date, contact: t.vendor || t.description || "", amount: t.amount });
    });

    const readyFiles = bankFiles.filter((f) => f.mapping && f.accountLabel && f.monthLabel);
    if (!readyFiles.length) return;

    const runs = readyFiles.map((bf) => {
      const accountTx = xeroAccounts[bf.accountLabel] || [];
      if (!accountTx.length) return null;

      // Resolve month name (e.g. "July") → YYYY-MM by finding the most
      // recent year in this account's Xero data that has that month.
      const targetMonth = MONTH_NAMES_LOOKUP[bf.monthLabel];
      if (!targetMonth) return null;

      const yearsWithMonth = [...new Set(
        accountTx
          .filter((t) => t.date && t.date.getMonth() + 1 === targetMonth)
          .map((t) => t.date.getFullYear())
      )].sort((a, b) => b - a);

      if (!yearsWithMonth.length) return null;
      const year = yearsWithMonth[0];
      const month = `${year}-${String(targetMonth).padStart(2, "0")}`;

      const tolerance = 3;
      const allBankTx = buildBankTx(bf.rows, bf.mapping);
      const xeroTx = filterByMonthWithBuffer(accountTx, month, tolerance);
      const bankTx = filterByMonthWithBuffer(allBankTx, month, tolerance);
      const results = reconcile(xeroTx, bankTx, tolerance);

      // Trim unmatched leftovers back to the true month range.
      const { start, end } = monthRange(month);
      const inMonth = (tx) => tx.date && tx.date >= start && tx.date <= end;
      results.xeroOnly = results.xeroOnly.filter(inMonth);
      results.bankOnly = results.bankOnly.filter(inMonth);

      return { account: bf.accountLabel, month, results };
    }).filter(Boolean);

    if (runs.length) {
      setBankRecoSnapshot(runs);
    }
  }, [bankFiles, sharedTransactions]);

  const NavButton = ({ toolKey, label, Icon, indent }) => (
    <button
      onClick={() => {
        setActive(toolKey);
        if (isMobile) setMenuOpen(false);
      }}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: indent ? "8px 14px 8px 26px" : "9px 14px", borderRadius: 8, border: "none", cursor: "pointer",
        background: active === toolKey ? shellColors.accent : "transparent",
        color: active === toolKey ? "#fff" : shellColors.inkMuted,
        fontSize: indent ? 12.5 : 13, fontWeight: active === toolKey ? 700 : 600,
        textAlign: "left", marginBottom: 4,
      }}
    >
      <Icon size={indent ? 13 : 15} /> {label}
    </button>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", background: shellColors.bg }}>
      {/* Mobile backdrop */}
      {isMobile && menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.4)", zIndex: 55 }}
        />
      )}

      {/* Sidebar */}
      <div
        style={{
          width: 232,
          flexShrink: 0,
          borderRight: `1px solid ${shellColors.line}`,
          background: "#fff",
          padding: "20px 14px 16px",
          ...(isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 60,
                transform: menuOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.2s ease",
                boxShadow: menuOpen ? "0 10px 30px rgba(15,27,45,.25)" : "none",
              }
            : { position: "sticky", top: 0 }),
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxSizing: "border-box",
        }}
      >
        <div>
          <div style={{ padding: "0 8px 18px", borderBottom: `1px solid ${shellColors.line}`, marginBottom: 14 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: shellColors.ink, marginTop: 2 }}>Ledger Watch</div>
            <div style={{ fontSize: 11, color: shellColors.inkMuted, marginTop: 2 }}>Monthly Close Audit</div>
          </div>
          <NavButton toolKey="sharedfiles" label="Shared Files" Icon={Database} />
          <NavButton toolKey="dashboard" label="Reports" Icon={LayoutDashboard} />
          <button
            onClick={() => setToolsOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: shellColors.inkFaint,
              padding: "14px 14px 6px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
            title={toolsOpen ? "Hide tools" : "Show tools"}
          >
            Tools
            {toolsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {toolsOpen && TOOLS.map((t) => (
            <NavButton key={t.key} toolKey={t.key} label={t.name} Icon={t.icon} indent />
          ))}
        </div>

        {/* User Profile & Sign Out at bottom of sidebar */}
        <div
          style={{
            borderTop: `1px solid ${shellColors.line}`,
            paddingTop: 12,
            marginTop: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 6,
              background: shellColors.bg,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: shellColors.accent,
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <User size={14} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: shellColors.ink,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={user?.email || "User"}
              >
                {user?.email || "User"}
              </div>
              <div style={{ fontSize: 10.5, color: shellColors.good, fontWeight: 600 }}>Active</div>
            </div>
          </div>

          <button
            onClick={() => signOut()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${shellColors.line}`,
              background: "#FFFFFF",
              color: shellColors.danger,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = shellColors.dangerSoft;
              e.currentTarget.style.borderColor = "#FCA5A5";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#FFFFFF";
              e.currentTarget.style.borderColor = shellColors.line;
            }}
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {isMobile && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${shellColors.line}`,
              background: "#fff",
              position: "sticky",
              top: 0,
              zIndex: 40,
            }}
          >
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid ${shellColors.line}`,
                background: "#fff",
                borderRadius: 8,
                padding: 7,
                cursor: "pointer",
                color: shellColors.ink,
              }}
            >
              <Menu size={16} />
            </button>
            <div style={{ fontWeight: 800, fontSize: 14, color: shellColors.ink }}>Ledger Watch</div>
          </div>
        )}
        <div style={{ flex: 1 }}>
        {active === "sharedfiles" && (
          <SharedFilesScreen
            sharedFile={sharedFile} sharedMapping={sharedMapping} fileError={fileError}
            onUploadMain={handleSharedUpload} onRemoveMain={handleRemoveSharedFile} onEditMainMapping={() => setMapperOpen(true)}
            coaFile={coaFile} coaMapping={coaMapping} coaError={coaError}
            onUploadCoa={handleCoaUpload} onRemoveCoa={handleRemoveCoaFile} onEditCoaMapping={() => setCoaMapperOpen(true)}
            bankFiles={bankFiles} xeroAccountNames={xeroAccountNames} bankError={bankError}
            onUploadBank={handleBankUpload} onRemoveBank={handleRemoveBankFile}
            onEditBankMapping={(id) => setBankMapperOpenId(id)} onSetBankLabel={handleSetBankLabel}
            onSetBankMonth={handleSetBankMonth}
          />
        )}
        {active === "dashboard" && (
          <DashboardScreen
            transactions={sharedTransactions} coaAccounts={sharedCoaAccounts}
            bankRecoSnapshot={bankRecoSnapshot}
            bankFiles={bankFiles}
            onToggleBankReco={handleToggleBankReco}
            onRunReconciliation={handleRunReconciliationFromDashboard}
          />
        )}
        {active === "expense" && <ExpenseConsistencyAuditTool.Component transactions={sharedTransactions} coaAccounts={sharedCoaAccounts} />}
        {active === "duplicate" && <DuplicateTransactionAuditTool.Component transactions={sharedTransactions} />}
        {active === "reconciliation" && (
          <BankReconciliationTool.Component
            transactions={sharedTransactions} onResultsChange={setBankRecoSnapshot}
            bankFiles={bankFiles}
            onGoToSharedFiles={() => setActive("sharedfiles")}
            pendingRuns={pendingRecoRuns}
            onPendingRunsConsumed={() => setPendingRecoRuns(null)}
          />
        )}
        {active === "vendor" && <VendorExceptionFlaggerTool.Component transactions={sharedTransactions} coaAccounts={sharedCoaAccounts} />}
        {active === "ratio" && <RatioConsistencyAuditTool.Component transactions={sharedTransactions} coaAccounts={sharedCoaAccounts} />}
        </div>
      </div>

      {mapperOpen && sharedFile && (
        <UniversalColumnMapper
          rows={sharedFile.rawRows}
          fileName={sharedFile.fileName}
          initialMapping={sharedMapping}
          onConfirm={(m) => { setSharedMapping(m); setMapperOpen(false); }}
          onCancel={() => setMapperOpen(false)}
        />
      )}
      {coaMapperOpen && coaFile && (
        <CoaColumnMapper
          rows={coaFile.rawRows}
          fileName={coaFile.fileName}
          initialMapping={coaMapping}
          onConfirm={handleCoaMappingConfirm}
          onCancel={() => setCoaMapperOpen(false)}
        />
      )}
      {bankMapperOpenId && (() => {
        const editingBankFile = bankFiles.find((f) => f.id === bankMapperOpenId);
        if (!editingBankFile) return null;
        return (
          <BankColumnMapper
            fields={editingBankFile.fields}
            fileName={editingBankFile.fileName}
            initialMapping={editingBankFile.mapping}
            onConfirm={(m) => handleBankMappingConfirm(bankMapperOpenId, m)}
            onCancel={() => setBankMapperOpenId(null)}
          />
        );
      })()}
    </div>
  );
}

export default AppShell;
