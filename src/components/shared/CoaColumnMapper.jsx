import React, { useState } from "react";
import { X } from "lucide-react";
import { shellColors } from "../../constants/theme";
import { COA_FIELDS } from "../../constants/tools";
import { guessCoaHeaderRow } from "../../utils/fileUtils";
import useViewport from "../../hooks/useViewport";

function CoaColumnMapper({ rows, fileName, initialMapping, onConfirm, onCancel }) {
  const { isMobile } = useViewport();
  const [headerRowIdx, setHeaderRowIdx] = useState(() => initialMapping?.headerRowIdx ?? guessCoaHeaderRow(rows));
  const headerRow = (rows[headerRowIdx] || []).map((h) => (h == null ? "" : String(h).trim()));
  const cols = headerRow.filter(Boolean);
  const guess = (patterns) => cols.find((c) => patterns.some((p) => c.toLowerCase().includes(p))) || "";
  const [mapping, setMapping] = useState(() => initialMapping?.mapping || {
    code: guess(["account code", "code"]),
    name: guess(["account name", "name"]),
    type: guess(["type"]),
    status: guess(["status"]),
  });
  const blocked = !mapping.name || !mapping.type;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.4)", zIndex: 90, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMobile ? "16px 10px" : "40px 16px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${shellColors.line}`, padding: isMobile ? 16 : 22, maxWidth: 560, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Map your Chart of Accounts columns</div>
          <button onClick={onCancel} style={{ border: "none", background: "none", cursor: "pointer", color: shellColors.inkFaint }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: shellColors.inkMuted, marginBottom: 16 }}>
          {fileName ? `Loaded ${fileName}. ` : ""}Name and Type are required so tools can tell bank/AP/AR/tax/equity accounts apart from real expense accounts.
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>Header row</label>
          <select value={headerRowIdx} onChange={(e) => setHeaderRowIdx(Number(e.target.value))} style={{ border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, width: "100%" }}>
            {rows.slice(0, 15).map((r, i) => (
              <option key={i} value={i}>
                Row {i + 1}: {(r || []).filter((c) => c != null && c !== "").slice(0, 4).join(" | ") || "(blank)"}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
          {COA_FIELDS.map((f) => (
            <div key={f.key}>
              <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>{f.label}{f.required ? " *" : ""}</label>
              <select value={mapping[f.key]} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))} style={{ border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, width: "100%" }}>
                {!f.required && <option value="">— none —</option>}
                {cols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={blocked} onClick={() => onConfirm({ mapping, headerRowIdx })} style={{ fontSize: 13.5, fontWeight: 700, padding: "9px 18px", borderRadius: 8, cursor: "pointer", border: "none", background: shellColors.accent, color: "#fff", opacity: blocked ? 0.5 : 1 }}>
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

export default CoaColumnMapper;
