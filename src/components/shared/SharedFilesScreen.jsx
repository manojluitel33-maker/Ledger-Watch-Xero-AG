import React from "react";
import { FileSpreadsheet, Table2 } from "lucide-react";
import { shellColors } from "../../constants/theme";
import FileSlotCard from "./FileSlotCard";
import BankFilesCard from "./BankFilesCard";
import useViewport from "../../hooks/useViewport";

function SharedFilesScreen({
  sharedFile, sharedMapping, onUploadMain, onRemoveMain, onEditMainMapping, fileError,
  coaFile, coaMapping, onUploadCoa, onRemoveCoa, onEditCoaMapping, coaError,
  bankFiles, xeroAccountNames, onUploadBank, onRemoveBank, onEditBankMapping, onSetBankLabel, onSetBankMonth, bankError,
}) {
  const { isMobile } = useViewport();
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
