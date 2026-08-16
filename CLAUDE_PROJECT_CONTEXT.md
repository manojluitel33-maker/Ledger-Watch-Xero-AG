# Ledger Watch for Xero — Full Project & Architecture Context for Claude

## 1. Project Overview
**Ledger Watch** is a specialized, web-based audit and financial close tool built for accountants and auditors working with **Xero** accounting data. It streamlines monthly/year-end closing procedures by automating variance analysis, duplicate detection, expense classification audits, and bank reconciliation.

- **Frontend Tech Stack**: React 18 (Vite SPA), Lucide React (Icons), PapaParse (CSV parsing), SheetJS / xlsx (Excel parsing), Vanilla CSS & inline design tokens.
- **Backend & Auth**: Supabase Authentication (User management, session handling, instant account disable/ban).
- **Deployment**: Vercel CI/CD (connected to GitHub `main` branch).
- **Live Demo**: `https://ledger-watch-xero-ag.vercel.app/`
- **GitHub Repository**: `https://github.com/manojluitel33-maker/Ledger-Watch-Xero-AG`

---

## 2. Directory Tree & Architecture

```text
LedgerWatch-Xero/
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
├── .gitignore
├── src/
│   ├── main.jsx                    # Vite entry point
│   ├── App.jsx                     # Root router & Auth gatekeeper
│   ├── lib/
│   │   └── supabaseClient.js       # Supabase client initializer
│   ├── context/
│   │   └── AuthContext.jsx         # Auth state provider (login, logout, session listener)
│   ├── constants/
│   │   ├── theme.js                # Design tokens & color system
│   │   └── tools.js                # Definitions & icons of close audit tools
│   ├── utils/
│   │   ├── amountUtils.js          # Currency formatting & numeric parsing helpers
│   │   ├── dateUtils.js            # Date parsing & normalization utilities
│   │   └── fileUtils.js            # Heuristic row/column mappers for Xero & Bank files
│   └── components/
│       ├── auth/
│       │   └── LoginScreen.jsx     # Branded login interface with error handling
│       ├── shell/
│       │   ├── AppShell.jsx        # Navigation sidebar, user status & tool switcher
│       │   └── HomeScreen.jsx      # Portal landing screen
│       ├── dashboard/
│       │   └── DashboardScreen.jsx # Executive close dashboard & summary KPIs
│       ├── shared/
│       │   ├── BankColumnMapper.jsx    # Column mapping modal for bank statements
│       │   ├── BankFilesCard.jsx       # Card displaying ingested bank statements
│       │   ├── CoaColumnMapper.jsx     # Column mapping modal for Chart of Accounts
│       │   ├── FileSlotCard.jsx        # Reusable dropzone card for uploaded files
│       │   ├── SharedFilesScreen.jsx   # Data ingestion hub for Xero files
│       │   └── UniversalColumnMapper.jsx # Smart auto-detecting Xero GL mapper
│       └── tools/
│           ├── expense-audit/          # Expense Consistency Audit Tool
│           ├── duplicate-audit/        # Duplicate Transaction Audit Tool
│           ├── bank-reconciliation/    # Multi-account Bank Reconciliation Tool
│           └── vendor-exceptions/      # Vendor & Anomaly Exception Flagger Tool
```

---

## 3. Core Capabilities & Workflows

### A. Authentication & Access Control (`src/context/AuthContext.jsx`, `src/components/auth/LoginScreen.jsx`)
- Restricted access portal powered by Supabase Auth.
- Unauthenticated visitors are routed to `LoginScreen`.
- Supports email/password credentials, error banners (banned user, invalid credentials), and active session persistence.
- Workspace admin can create, ban, or disable any user instantly in the Supabase Users dashboard.
- Authenticated user's email and a **Sign Out** button are rendered in the sidebar footer.

### B. Universal Ingestion & Flexible Mapping Engine (`src/utils/fileUtils.js`)
- Accepts `.xlsx`, `.xls`, and `.csv` files directly in the browser without server uploads.
- **Smart Header Detection**: Detects metadata header rows and extracts column headers automatically.
- **Xero General Ledger / Detailed Account Transactions**: Maps columns for Date, Account, Account Code, Description/Reference, Net/Gross Amount, Tax, and Contact/Vendor.
- **Chart of Accounts (COA)**: Maps Account Code, Account Name, Type, and Tax Rate.
- **Bank Statements**: Ingests multiple bank CSV/Excel statements, auto-detects date/amount/description columns, and maps them to Xero bank accounts.

### C. The 4 Financial Close Audit Tools
1. **Expense Consistency Audit (`src/components/tools/expense-audit/`)**:
   - Analyzes vendor categorization history.
   - Flags transactions where the same vendor or payee is coded to different expense accounts.
   - Computes consistency confidence scores.
2. **Duplicate Transaction Audit (`src/components/tools/duplicate-audit/`)**:
   - Identifies exact duplicate rows (same vendor, amount, reference, date).
   - Identifies fuzzy duplicates (matching amount and vendor within a ±3-5 day window or similar references).
3. **Bank Reconciliation (`src/components/tools/bank-reconciliation/`)**:
   - Reconciles bank statement transactions against Xero general ledger bank records.
   - Matches cleared items, highlights uncleared payments/deposits, and flags ledger-to-statement variances.
4. **Vendor Exception Flagger (`src/components/tools/vendor-exceptions/`)**:
   - Detects outliers, unusual round-sum payments, weekend transaction dates, duplicate invoice numbers, and missing tax details.

### D. Executive Close Reporting Dashboard (`src/components/dashboard/DashboardScreen.jsx`)
- Aggregates findings from all four audit tools.
- Displays high-level audit readiness scores, flagged risks, reconciliation status, and exportable findings.

---

## 4. Key Source Code References

### `src/context/AuthContext.jsx`
```javascript
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
      } finally {
        setLoading(false);
      }
    };
    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email: email.trim(), password });
  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

---

## 5. Summary for Claude Analysis
When analyzing or generating code for this application:
- All financial file parsing runs in-browser (client-side privacy-first).
- Colors and typography follow `src/constants/theme.js` (navy `#17375E`, slate `#F8FAFC`, dark text `#0F1B2D`).
- Responsive layout with sticky left sidebar navigation and tool modularity.
