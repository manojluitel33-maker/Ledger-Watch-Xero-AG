import React, { useState, useMemo } from "react";
import { X } from "lucide-react";
import { shellColors } from "../../constants/theme";
import { UNIVERSAL_FIELDS } from "../../constants/tools";
import { guessHeaderRowUniversal } from "../../utils/fileUtils";
import useViewport from "../../hooks/useViewport";

function UniversalColumnMapper({ rows, fileName, initialMapping, onConfirm, onCancel }) {
  const { isMobile } = useViewport();
  const [headerRowIdx, setHeaderRowIdx] = useState(() => initialMapping?.headerRowIdx ?? guessHeaderRowUniversal(rows));
  const headerRow = rows[headerRowIdx] || [];
  const columns = useMemo(() => {
    const maxCols = Math.max(headerRow.length, ...rows.slice(0, 30).map((r) => (r ? r.length : 0)));
    const cols = [];
    for (let i = 0; i < maxCols; i++) {
      const label = typeof headerRow[i] === "string" && headerRow[i].trim() ? headerRow[i].trim() : `Column ${i + 1}`;
      cols.push({ index: i, label });
    }
    return cols;
  }, [rows, headerRowIdx]);

  const guessFor = (field) => {
    const c = columns.find((c) => field.match.test(c.label));
    return c ? c.index : -1;
  };
  const [mapping, setMapping] = useState(() => {
    if (initialMapping?.mapping) return initialMapping.mapping;
    const m = {};
    UNIVERSAL_FIELDS.forEach((f) => { m[f.key] = guessFor(f); });
    return m;
  });
  const [dateFormatPref, setDateFormatPref] = useState(initialMapping?.dateFormatPref || "dmy");
  const missingRequired = UNIVERSAL_FIELDS.filter((f) => f.required && (mapping[f.key] == null || mapping[f.key] < 0));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.4)", zIndex: 90, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMobile ? "16px 10px" : "40px 16px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${shellColors.line}`, padding: isMobile ? 16 : 22, maxWidth: 640, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Map your columns</div>
          <button onClick={onCancel} style={{ border: "none", background: "none", cursor: "pointer", color: shellColors.inkFaint }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: shellColors.inkMuted, marginBottom: 16 }}>
          {fileName ? `Loaded ${fileName}. ` : ""}Map every column any of the four tools might need — each tool will just use whichever of these it actually requires.
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
          {UNIVERSAL_FIELDS.map((f) => (
            <div key={f.key}>
              <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>
                {f.label}{f.required ? " *" : ""}
              </label>
              <select
                value={mapping[f.key]}
                onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                style={{ border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, width: "100%" }}
              >
                {!f.required && <option value={-1}>— None —</option>}
                {columns.map((c) => <option key={c.index} value={c.index}>{c.label}</option>)}
              </select>
              <div style={{ fontSize: 10.5, color: shellColors.inkFaint, marginTop: 3 }}>Used by: {f.usedBy}</div>
            </div>
          ))}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: shellColors.inkMuted, textTransform: "uppercase", marginBottom: 4, display: "block" }}>Ambiguous dates (e.g. 03/04)</label>
            <select value={dateFormatPref} onChange={(e) => setDateFormatPref(e.target.value)} style={{ border: `1px solid ${shellColors.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, width: "100%" }}>
              <option value="dmy">Day/Month/Year</option>
              <option value="mdy">Month/Day/Year</option>
            </select>
            <div style={{ fontSize: 10.5, color: shellColors.inkFaint, marginTop: 3 }}>Used by: Duplicate Audit, Vendor Review</div>
          </div>
        </div>

        {missingRequired.length > 0 && (
          <div style={{ color: shellColors.danger, fontSize: 12.5, marginBottom: 12 }}>
            Please choose a column for: {missingRequired.map((f) => f.label).join(", ")}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            disabled={missingRequired.length > 0}
            onClick={() => onConfirm({ mapping, headerRowIdx, dateFormatPref })}
            style={{ fontSize: 13.5, fontWeight: 700, padding: "9px 18px", borderRadius: 8, cursor: "pointer", border: "none", background: shellColors.accent, color: "#fff", opacity: missingRequired.length > 0 ? 0.5 : 1 }}
          >
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

export default UniversalColumnMapper;
