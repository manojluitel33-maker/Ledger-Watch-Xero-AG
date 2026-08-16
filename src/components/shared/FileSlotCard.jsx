import React, { useRef } from "react";
import { Upload, Settings, Trash2, Check, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { shellColors } from "../../constants/theme";

function FileSlotCard({ icon: Icon, title, description, file, mapped, onUpload, onRemove, onEditMapping, mappingLabel }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${shellColors.line}`, borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: shellColors.accentSoft, color: shellColors.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={16} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, color: shellColors.ink }}>{title}</div>
      </div>
      <div style={{ fontSize: 12.5, color: shellColors.inkMuted, marginBottom: 14 }}>{description}</div>

      {!file && (
        <label style={{ display: "block", border: "1.5px dashed #CBD5E1", borderRadius: 8, padding: 20, textAlign: "center", cursor: "pointer" }}>
          <Upload size={18} style={{ color: shellColors.accent, marginBottom: 6 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: shellColors.ink }}>Upload a file</div>
          <div style={{ fontSize: 11.5, color: shellColors.inkFaint, marginTop: 2 }}>.xlsx or .csv</div>
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} />
        </label>
      )}

      {file && (
        <div style={{ background: shellColors.accentSoft, borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <FileSpreadsheet size={15} style={{ color: shellColors.accent, marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: shellColors.ink, wordBreak: "break-word", flex: 1 }}>{file.fileName}</div>
            <button onClick={onRemove} title="Remove file" style={{ border: "none", background: "none", cursor: "pointer", color: shellColors.inkFaint, flexShrink: 0 }}>
              <Trash2 size={14} />
            </button>
          </div>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
            {mapped ? (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: shellColors.good, background: shellColors.emeraldSoft, padding: "3px 8px", borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Check size={10} /> {mappingLabel || "Columns mapped"}
              </span>
            ) : (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: shellColors.warn, background: shellColors.warnSoft, padding: "3px 8px", borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <AlertTriangle size={10} /> Mapping needed
              </span>
            )}
            <button onClick={onEditMapping} style={{ fontSize: 11.5, fontWeight: 700, color: shellColors.accent, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              {mapped ? "Edit mapping" : "Map columns now"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default FileSlotCard;
