# Ledger Watch — Modular Architecture

Ledger Watch is a suite of four monthly close review and audit tools built for Xero data exports.

## Directory Structure

```
Ledgerwatch Xero/
├── package.json
├── README.md
├── LedgerWatchApp-Xero.jsx         # Backward-compatible entrypoint
└── src/
    ├── App.jsx                     # Root React Application component
    ├── index.js                    # Package entrypoint & re-exports
    │
    ├── constants/                  # Configuration and UI Design Tokens
    │   ├── theme.js                # Color palettes, design tokens, shared component styles
    │   └── tools.js                # Tool registry, dashboard modules, mapping column schemas
    │
    ├── utils/                      # Utility Functions
    │   ├── dateUtils.js            # Date formatting, month label helpers, timeline generators
    │   ├── amountUtils.js          # Number parsing, median calculation, compact formatting
    │   └── fileUtils.js            # Universal transaction builder, COA parser, bank guessing
    │
    └── components/                 # React UI Components
        │
        ├── shell/                  # Application Shell & Core Navigation
        │   ├── AppShell.jsx        # Top-level state, sidebar navigation, unified file loader
        │   └── HomeScreen.jsx      # Tool directory & landing cards
        │
        ├── dashboard/              # Combined Close Review
        │   └── DashboardScreen.jsx # Cross-tool monthly close audit & observation report
        │
        ├── shared/                 # Shared Data Management & Mapping Modals
        │   ├── SharedFilesScreen.jsx   # Global Xero file manager screen
        │   ├── FileSlotCard.jsx        # Drag-and-drop file slot card component
        │   ├── BankFilesCard.jsx       # Multi-statement upload card component
        │   ├── UniversalColumnMapper.jsx  # Universal 4-tool column mapper modal
        │   ├── CoaColumnMapper.jsx        # Chart of Accounts mapper modal
        │   └── BankColumnMapper.jsx       # Bank Statement mapper modal
        │
        └── tools/                  # The 4 Core Audit Tools
            ├── expense-audit/             # Tool 1: Expense Booking Checker
            │   ├── ExpenseConsistencyAudit.jsx
            │   └── index.js
            │
            ├── duplicate-audit/           # Tool 2: Duplicate Transaction Audit
            │   ├── DuplicateTransactionAudit.jsx
            │   └── index.js
            │
            ├── bank-reconciliation/       # Tool 3: Bank Reconciliation
            │   ├── BankReconciliation.jsx
            │   └── index.js
            │
            └── vendor-exceptions/         # Tool 4: Vendor Exception Review
                ├── VendorExceptionFlagger.jsx
                └── index.js
```

## The Four Tools

1. **Expense Booking Checker** (`src/components/tools/expense-audit/`)
   - Flags missing months, sudden spikes/drops, and off-pattern recurring amounts across expense accounts.

2. **Duplicate Transaction Audit** (`src/components/tools/duplicate-audit/`)
   - Identifies vendors and accounts that normally bill once per month but have 2+ transactions in a given month.

3. **Bank Reconciliation** (`src/components/tools/bank-reconciliation/`)
   - Matches Xero account transactions against bank statement exports, finding exact matches, amount-only matches, and unreconciled entries.

4. **Vendor Exception Review** (`src/components/tools/vendor-exceptions/`)
   - Analyzes historical categorization patterns per vendor and flags any transaction posted to an unusual account.

## Shared Foundation

- **Universal Column Mapping**: Upload your Xero *Account Transactions* export once, map columns across all tools, and let each tool automatically pull what it needs.
- **Chart of Accounts (COA)**: Optional second upload to classify account types (Expense, Asset, Liability, Revenue, Equity).
- **Combined Close Summary Dashboard**: Synthesizes findings and observations across all tools for the current month into a unified report.
