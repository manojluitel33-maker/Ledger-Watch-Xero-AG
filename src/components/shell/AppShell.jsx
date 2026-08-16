import React, { useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  Upload, Database, Table2, LayoutDashboard, Landmark, LayoutGrid,
} from "lucide-react";

import { shellColors } from "../../constants/theme";
import { TOOLS } from "../../constants/tools";
import {
  guessHeaderRowUniversal,
  guessCoaHeaderRow,
  guessBankMapping,
  buildSharedTransactions,
  buildCoaAccountsFromRows,
} from "../../utils/fileUtils";

import { ExpenseConsistencyAuditTool } from "../tools/expense-audit";
import { DuplicateTransactionAuditTool } from "../tools/duplicate-audit";
import { BankReconciliationTool } from "../tools/bank-reconciliation";
import { VendorExceptionFlaggerTool } from "../tools/vendor-exceptions";

import UniversalColumnMapper from "../shared/UniversalColumnMapper";
import CoaColumnMapper from "../shared/CoaColumnMapper";
import BankColumnMapper from "../shared/BankColumnMapper";
import SharedFilesScreen from "../shared/SharedFilesScreen";
import DashboardScreen from "../dashboard/DashboardScreen";
import HomeScreen from "./HomeScreen";

function AppShell() {
  const [active, setActive] = useState("home");

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

  const NavButton = ({ toolKey, label, Icon, indent }) => (
    <button
      onClick={() => setActive(toolKey)}
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
      {/* Sidebar */}
      <div style={{ width: 232, flexShrink: 0, borderRight: `1px solid ${shellColors.line}`, background: "#fff", padding: "20px 14px", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "0 8px 18px", borderBottom: `1px solid ${shellColors.line}`, marginBottom: 14 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: shellColors.ink, marginTop: 2 }}>Ledger Watch</div>
        </div>
        <NavButton toolKey="home" label="Home" Icon={LayoutGrid} />
        <NavButton toolKey="sharedfiles" label="Shared Files" Icon={Database} />
        <NavButton toolKey="dashboard" label="Reports" Icon={LayoutDashboard} />
        <div
          style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            color: shellColors.inkFaint, padding: "14px 14px 6px",
          }}
        >
          Tools
        </div>
        {TOOLS.map((t) => (
          <NavButton key={t.key} toolKey={t.key} label={t.name} Icon={t.icon} indent />
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {active === "home" && <HomeScreen onOpen={setActive} />}
        {active === "sharedfiles" && (
          <SharedFilesScreen
            sharedFile={sharedFile} sharedMapping={sharedMapping} fileError={fileError}
            onUploadMain={handleSharedUpload} onRemoveMain={handleRemoveSharedFile} onEditMainMapping={() => setMapperOpen(true)}
            coaFile={coaFile} coaMapping={coaMapping} coaError={coaError}
            onUploadCoa={handleCoaUpload} onRemoveCoa={handleRemoveCoaFile} onEditCoaMapping={() => setCoaMapperOpen(true)}
            bankFiles={bankFiles} xeroAccountNames={xeroAccountNames} bankError={bankError}
            onUploadBank={handleBankUpload} onRemoveBank={handleRemoveBankFile}
            onEditBankMapping={(id) => setBankMapperOpenId(id)} onSetBankLabel={handleSetBankLabel}
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
