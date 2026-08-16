import React from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AppShell from "./components/shell/AppShell";
import LoginScreen from "./components/auth/LoginScreen";
import { Loader2, ShieldCheck } from "lucide-react";

function RootContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F1B2D",
          color: "#FFFFFF",
          fontFamily: "'Inter', system-ui, sans-serif",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "#17375E",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <ShieldCheck size={26} color="#38BDF8" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#94A3B8" }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
          <span>Verifying session...</span>
        </div>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <AppShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <RootContent />
    </AuthProvider>
  );
}
