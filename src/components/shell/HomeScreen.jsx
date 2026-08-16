import React from "react";
import { ArrowRight } from "lucide-react";
import { shellColors } from "../../constants/theme";
import { TOOLS } from "../../constants/tools";

function HomeScreen({ onOpen }) {
  return (
    <div style={{ padding: "32px 36px", maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", color: shellColors.ink }}>Ledger Watch</h1>
      <p style={{ color: shellColors.inkMuted, fontSize: 14, marginTop: 8, maxWidth: 560 }}>
        Four independent review tools for monthly close. Pick one to get started.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 28 }}>
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => onOpen(t.key)}
              style={{
                textAlign: "left", background: "#fff", border: `1px solid ${shellColors.line}`, borderRadius: 12,
                padding: 18, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10,
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: shellColors.accentSoft, color: shellColors.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={18} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: shellColors.ink }}>{t.name}</div>
              <div style={{ fontSize: 12.5, color: shellColors.inkMuted, lineHeight: 1.4 }}>{t.blurb}</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: shellColors.accent, display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                Open <ArrowRight size={13} />
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 32, fontSize: 11.5, color: shellColors.inkFaint, borderTop: `1px solid ${shellColors.line}`, paddingTop: 14, maxWidth: 620 }}>
        Head to "Shared Files" in the sidebar to upload your Account Transactions export and Chart of Accounts once — each tool below still has its own upload too, for now.
      </div>
    </div>
  );
}

export default HomeScreen;
