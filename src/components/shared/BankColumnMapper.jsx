import React, { useState } from "react";
import { X } from "lucide-react";
import { shellColors } from "../../constants/theme";
import { guessBankMapping } from "../../utils/fileUtils";
import useViewport from "../../hooks/useViewport";

function BankColumnMapper({ fields, fileName, initialMapping, onConfirm, onCancel }) {
  const { isMobile } = useViewport();
  const [mapping, setMapping] = useState(() => initialMapping || guessBankMapping(fields));
  const selectStyle = { border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, width: "100%" };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" };
  const blocked = !mapping.dateCol || (mapping.mode === "single" ? !mapping.amountCol : !mapping.debitCol || !mapping.creditCol);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.4)", zIndex: 90, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMobile ? "16px 10px" : "40px 16px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${shellColors.line}`, padding: isMobile ? 16 : 22, maxWidth: 560, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Map your bank statement columns</div>
          <button onClick={onCancel} style={{ border: "none", background: "none", cursor: "pointer", color: shellColors.inkFaint }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: shellColors.inkMuted, marginBottom: 16 }}>
          {fileName ? `Loaded ${fileName}. ` : ""}Used only by Bank Reconciliation. Any column layout is fine.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Date column</label>
            <select value={mapping.dateCol} onChange={(e) => setMapping((m) => ({ ...m, dateCol: e.target.value }))} style={selectStyle}>
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Description column</label>
            <select value={mapping.descCol} onChange={(e) => setMapping((m) => ({ ...m, descCol: e.target.value }))} style={selectStyle}>
              <option value="">— none —</option>
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, marginBottom: 14 }}>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="radio" checked={mapping.mode === "single"} onChange={() => setMapping((m) => ({ ...m, mode: "single" }))} />
            Single amount column
          </label>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="radio" checked={mapping.mode === "split"} onChange={() => setMapping((m) => ({ ...m, mode: "split" }))} />
            Separate debit / credit columns
          </label>
        </div>

        {mapping.mode === "single" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Amount column</label>
              <select value={mapping.amountCol} onChange={(e) => setMapping((m) => ({ ...m, amountCol: e.target.value }))} style={selectStyle}>
                <option value="">— select —</option>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={mapping.flipSign} onChange={(e) => setMapping((m) => ({ ...m, flipSign: e.target.checked }))} />
                Flip sign (spend shown as positive)
              </label>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Debit column (money out)</label>
              <select value={mapping.debitCol} onChange={(e) => setMapping((m) => ({ ...m, debitCol: e.target.value }))} style={selectStyle}>
                <option value="">— select —</option>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Credit column (money in)</label>
              <select value={mapping.creditCol} onChange={(e) => setMapping((m) => ({ ...m, creditCol: e.target.value }))} style={selectStyle}>
                <option value="">— select —</option>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
        )}

        {blocked && (
          <div style={{ color: shellColors.danger, fontSize: 12.5, marginBottom: 12 }}>
            Please choose a date column and {mapping.mode === "single" ? "an amount column" : "both a debit and credit column"}.
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={blocked} onClick={() => onConfirm(mapping)} style={{ fontSize: 13.5, fontWeight: 700, padding: "9px 18px", borderRadius: 8, cursor: "pointer", border: "none", background: shellColors.accent, color: "#fff", opacity: blocked ? 0.5 : 1 }}>
            Save mapping
          </button>
          <button onClick={onCancel} style={{ fontSize: 12.5, fontWeight: 700, padding: "8px 14px", borderRadius: 8, cursor: "pointer", border: `1px solid ${shellColors.line}`, background: "#fff", color: shellColors.inkMuted }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
export default BankColumnMapper;
