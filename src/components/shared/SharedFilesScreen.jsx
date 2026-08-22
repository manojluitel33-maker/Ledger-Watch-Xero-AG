import React from "react";
import { FileSpreadsheet, Table2, ArrowRight, CheckCircle2, AlertCircle, FileCheck, LayoutDashboard } from "lucide-react";
import { shellColors } from "../../constants/theme";
import FileSlotCard from "./FileSlotCard";
import BankFilesCard from "./BankFilesCard";
import useViewport from "../../hooks/useViewport";

function SharedFilesScreen({
  sharedFile, sharedMapping, onUploadMain, onRemoveMain, onEditMainMapping, fileError,
  coaFile, coaMapping, onUploadCoa, onRemoveCoa, onEditCoaMapping, coaError,
  bankFiles, xeroAccountNames, onUploadBank, onRemoveBank, onEditBankMapping, onSetBankLabel, onSetBankMonth, bankError,
  onRunReport,
}) {
  const { isMobile } = useViewport();
  const isMainReady = Boolean(sharedFile && sharedMapping);
  const isCoaReady = Boolean(coaFile && coaMapping);
  const readyBankCount = (bankFiles || []).filter((b) => b.mapping && b.accountLabel && b.monthLabel).length;

  return (
    <div style={{ padding: isMobile ? "20px 16px" : "32px 36px", maxWidth: 900 }}>
      <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", color: shellColors.ink }}>Shared Files</h1>
      <p style={{ color: shellColors.inkMuted, fontSize: 14, marginTop: 6, marginBottom: isMobile ? 18 : 26, maxWidth: 600 }}>
        Upload once here, map the columns once, and each tool will pull whatever it needs. One file per slot for Account Transactions and Chart of Accounts — remove before replacing. Bank statements support multiple files, one per account.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: isMobile ? 12 : 18 }}>
        <FileSlotCard
          icon={FileSpreadsheet}
          title="Account Transactions"
          description="The Xero export used by all four tools — Date, Account, Amount, Vendor, and so on."
          file={sharedFile}
          mapped={!!sharedMapping}
          onUpload={onUploadMain}
          onRemove={onRemoveMain}
          onEditMapping={onEditMainMapping}
        />
        <FileSlotCard
          icon={Table2}
          title="Chart of Accounts"
          description="Optional. Lets tools automatically ignore bank, AP/AR, tax, and equity accounts."
          file={coaFile}
          mapped={!!coaMapping}
          mappingLabel={coaFile ? `${coaFile.accountCount || 0} accounts mapped` : ""}
          onUpload={onUploadCoa}
          onRemove={onRemoveCoa}
          onEditMapping={onEditCoaMapping}
        />
        <BankFilesCard
          bankFiles={bankFiles}
          xeroAccountNames={xeroAccountNames}
          onUpload={onUploadBank}
          onRemove={onRemoveBank}
          onEditMapping={onEditBankMapping}
          onSetLabel={onSetBankLabel}
          onSetMonth={onSetBankMonth}
        />
      </div>

      {(fileError || coaError || bankError) && (
        <div style={{ marginTop: 16, fontSize: 12.5, color: shellColors.danger }}>{fileError || coaError || bankError}</div>
      )}

      {/* Bottom Run Report Section */}
      <div
        style={{
          marginTop: 28,
          background: isMainReady ? "#FFFFFF" : "rgba(241, 245, 249, 0.7)",
          border: `1px solid ${isMainReady ? "#CBD5E1" : shellColors.line}`,
          borderRadius: 12,
          padding: isMobile ? "18px 16px" : "22px 24px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 16,
          boxShadow: isMainReady ? "0 4px 14px rgba(15, 27, 45, 0.05)" : "none",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            {isMainReady ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: shellColors.good,
                  background: shellColors.emeraldSoft,
                  padding: "3px 8px",
                  borderRadius: 6,
                }}
              >
                <CheckCircle2 size={13} /> Files Ready
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: shellColors.inkMuted,
                  background: "#E2E8F0",
                  padding: "3px 8px",
                  borderRadius: 6,
                }}
              >
                <AlertCircle size={13} /> Account Transactions Required
              </span>
            )}
            <span style={{ fontSize: 15, fontWeight: 700, color: shellColors.ink }}>
              Audit & Monthly Close Report
            </span>
          </div>

          <p style={{ margin: "4px 0 0", fontSize: 13, color: shellColors.inkMuted, lineHeight: 1.4 }}>
            {isMainReady
              ? "All four audit modules and bank reconciliation are ready to analyze your data."
              : "Upload and map your Account Transactions file above to generate the full audit report."}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, fontSize: 12, color: shellColors.inkMuted }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: isMainReady ? shellColors.good : "#94A3B8",
                }}
              />
              Account Transactions: <strong style={{ color: shellColors.ink }}>{isMainReady ? "Mapped" : "Pending"}</strong>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: isCoaReady ? shellColors.good : "#94A3B8",
                }}
              />
              Chart of Accounts: <strong style={{ color: shellColors.ink }}>{isCoaReady ? `${coaFile.accountCount || 0} accounts` : "Optional"}</strong>
            </span>
            {bankFiles && bankFiles.length > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: readyBankCount > 0 ? shellColors.good : "#94A3B8",
                  }}
                />
                Bank Statements: <strong style={{ color: shellColors.ink }}>{readyBankCount}/{bankFiles.length} ready</strong>
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onRunReport}
          disabled={!isMainReady}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: isMobile ? "12px 18px" : "11px 22px",
            fontSize: 14,
            fontWeight: 700,
            color: "#FFFFFF",
            background: isMainReady ? shellColors.accent : "#94A3B8",
            border: "none",
            borderRadius: 8,
            cursor: isMainReady ? "pointer" : "not-allowed",
            boxShadow: isMainReady ? "0 2px 8px rgba(23, 55, 94, 0.25)" : "none",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          onMouseOver={(e) => {
            if (isMainReady) e.currentTarget.style.filter = "brightness(1.15)";
          }}
          onMouseOut={(e) => {
            if (isMainReady) e.currentTarget.style.filter = "none";
          }}
        >
          <LayoutDashboard size={16} />
          Run Report
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   SHARED PARSING — turns the mapped Shared Files data into the
   one normalized transaction list every tool consumes.

   Two source shapes are supported, auto-detected by whether an
   Account column was mapped:
   - FLAT: one row per transaction, with its own Account column.
   - GROUPED (the native Xero "Account Transactions" export):
     account name lines followed by that account's transactions,
     with Opening/Closing Balance and Total rows mixed in.
   ============================================================ */

export default SharedFilesScreen;
