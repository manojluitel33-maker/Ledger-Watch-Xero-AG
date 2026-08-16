import React, { useState } from "react";
import { Lock, Mail, Eye, EyeOff, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { shellColors } from "../../constants/theme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setErrorMsg("");
    setLoading(true);

    try {
      const { data, error } = await signIn(email, password);
      if (error) {
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          setErrorMsg("Invalid email or password. Please check your credentials.");
        } else if (error.message.toLowerCase().includes("banned") || error.message.toLowerCase().includes("disabled")) {
          setErrorMsg("This user account has been disabled. Please contact your workspace administrator.");
        } else {
          setErrorMsg(error.message || "Failed to sign in. Please try again.");
        }
      }
    } catch (err) {
      setErrorMsg("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0F1B2D 0%, #17375E 50%, #0F243E 100%)",
        padding: "24px 16px",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle Background Glows */}
      <div
        style={{
          position: "absolute",
          top: "-15%",
          right: "-10%",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, rgba(56, 189, 248, 0) 70%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-15%",
          left: "-10%",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0) 70%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />

      {/* Main Login Card */}
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "rgba(255, 255, 255, 0.98)",
          backdropFilter: "blur(12px)",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.1)",
          padding: "36px 32px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Header Branding */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "#17375E",
              color: "#FFFFFF",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
              boxShadow: "0 10px 15px -3px rgba(23, 55, 94, 0.3)",
            }}
          >
            <ShieldCheck size={28} />
          </div>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: "#F1F5F9", color: "#475569", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16A34A" }} />
            Private Access Portal
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: shellColors.ink, margin: "0 0 6px 0", letterSpacing: "-0.02em" }}>
            Ledger Watch for Xero
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: shellColors.inkMuted, lineHeight: 1.4 }}>
            Sign in to access your close audits and reconciliation tools.
          </p>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              background: "#FEF2F2",
              border: "1px solid #FCA5A5",
              color: "#991B1B",
              padding: "12px 14px",
              borderRadius: "8px",
              fontSize: 13,
              marginBottom: 20,
              lineHeight: 1.45,
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>{errorMsg}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          {/* Email field */}
          <div style={{ marginBottom: 18 }}>
            <label
              htmlFor="login-email"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 700,
                color: shellColors.ink,
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Email Address
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: shellColors.inkFaint,
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <Mail size={17} />
              </div>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                autoComplete="email"
                style={{
                  width: "100%",
                  padding: "11px 12px 11px 38px",
                  fontSize: 14,
                  border: `1px solid ${shellColors.line}`,
                  borderRadius: 8,
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#FFFFFF",
                  color: shellColors.ink,
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#17375E";
                  e.target.style.boxShadow = "0 0 0 3px rgba(23, 55, 94, 0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = shellColors.line;
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>
          </div>

          {/* Password field */}
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="login-password"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 700,
                color: shellColors.ink,
                marginBottom: 7,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: shellColors.inkFaint,
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <Lock size={17} />
              </div>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                style={{
                  width: "100%",
                  padding: "11px 40px 11px 38px",
                  fontSize: 14,
                  border: `1px solid ${shellColors.line}`,
                  borderRadius: 8,
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#FFFFFF",
                  color: shellColors.ink,
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#17375E";
                  e.target.style.boxShadow = "0 0 0 3px rgba(23, 55, 94, 0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = shellColors.line;
                  e.target.style.boxShadow = "none";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: shellColors.inkMuted,
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                }}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: loading ? "#64748B" : "#17375E",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              fontSize: 14.5,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "background 0.2s, transform 0.1s",
              boxShadow: "0 4px 6px -1px rgba(23, 55, 94, 0.2), 0 2px 4px -1px rgba(23, 55, 94, 0.1)",
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                <span>Verifying credentials...</span>
              </>
            ) : (
              <span>Sign In to Ledger Watch</span>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div
          style={{
            marginTop: 26,
            paddingTop: 18,
            borderTop: `1px solid ${shellColors.line}`,
            textAlign: "center",
            fontSize: 12,
            color: shellColors.inkMuted,
            lineHeight: 1.5,
          }}
        >
          <span>Restricted workspace. Accounts are provisioned by the administrator.</span>
        </div>
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
