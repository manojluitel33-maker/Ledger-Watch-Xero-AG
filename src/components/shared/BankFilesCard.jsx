import React, { useRef } from "react";
import { Upload, Settings, Trash2, Landmark, ArrowRight, Check, FileSpreadsheet, AlertTriangle, Calendar } from "lucide-react";
import { shellColors } from "../../constants/theme";

function BankFilesCard({ bankFiles, xeroAccountNames, onUpload, onRemove, onEditMapping, onSetLabel, onSetMonth }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${shellColors.line}`, borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: shellColors.accentSoft, color: shellColors.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Landmark size={16} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, color: shellColors.ink }}>Bank Statements</div>
      </div>
      <div style={{ fontSize: 12.5, color: shellColors.inkMuted, marginBottom: 14 }}>
        Needed only by Bank Reconciliation. Upload one per account you reconcile — tag each with the matching Xero account so Reconciliation can find it automatically.
      </div>

      {bankFiles.length === 0 && (
        <label style={{ display: "block", border: "1.5px dashed #CBD5E1", borderRadius: 8, padding: 20, textAlign: "center", cursor: "pointer" }}>
          <Upload size={18} style={{ color: shellColors.accent, marginBottom: 6 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: shellColors.ink }}>Upload a bank statement</div>
          <div style={{ fontSize: 11.5, color: shellColors.inkFaint, marginTop: 2 }}>.xlsx or .csv</div>
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} />
        </label>
      )}

      {bankFiles.map((bf) => (
        <div key={bf.id} style={{ background: shellColors.accentSoft, borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <FileSpreadsheet size={15} style={{ color: shellColors.accent, marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: shellColors.ink, wordBreak: "break-word", flex: 1 }}>{bf.fileName}</div>
            <button onClick={() => onRemove(bf.id)} title="Remove file" style={{ border: "none", background: "none", cursor: "pointer", color: shellColors.inkFaint, flexShrink: 0 }}>
              <Trash2 size={14} />
            </button>
          </div>

          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase" }}>Which account is this?</label>
            <select
              value={bf.accountLabel || ""}
              onChange={(e) => onSetLabel(bf.id, e.target.value)}
              style={{ width: "100%", marginTop: 4, border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, background: "#fff" }}
            >
              <option value="">— not tagged —</option>
              {xeroAccountNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase" }}>Which month is this?</label>
            <select
              value={bf.monthLabel || ""}
              onChange={(e) => onSetMonth(bf.id, e.target.value)}
              style={{ width: "100%", marginTop: 4, border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, background: "#fff" }}
            >
              <option value="">— not tagged —</option>
              <option value="January">January</option>
              <option value="February">February</option>
              <option value="March">March</option>
              <option value="April">April</option>
              <option value="May">May</option>
              <option value="June">June</option>
              <option value="July">July</option>
              <option value="August">August</option>
              <option value="September">September</option>
              <option value="October">October</option>
              <option value="November">November</option>
              <option value="December">December</option>
            </select>
          </div>

          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
            {bf.mapping ? (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: shellColors.good, background: shellColors.emeraldSoft, padding: "3px 8px", borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Check size={10} /> {bf.rows.length} rows mapped
              </span>
            ) : (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: shellColors.warn, background: shellColors.warnSoft, padding: "3px 8px", borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <AlertTriangle size={10} /> Mapping needed
              </span>
            )}
            <button onClick={() => onEditMapping(bf.id)} style={{ fontSize: 11.5, fontWeight: 700, color: shellColors.accent, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              {bf.mapping ? "Edit mapping" : "Map columns now"}
            </button>
          </div>
        </div>
      ))}

      {bankFiles.length > 0 && (
        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "1.5px dashed #CBD5E1", borderRadius: 8, padding: 12, textAlign: "center", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: shellColors.accent }}>
          <Upload size={14} /> Add another bank statement
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} />
        </label>
      )}
    </div>
  );
}

export default BankFilesCard;
