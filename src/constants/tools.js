import { Receipt, Copy, Landmark, ScanEye } from "lucide-react";
import { shellColors } from "./theme";

export const TOOLS = [
  {
    key: "expense",
    name: "Expense Booking Checker",
    blurb: "Flags missing months, spikes, and off-pattern amounts in your expense accounts.",
    icon: Receipt,
  },
  {
    key: "duplicate",
    name: "Duplicate Transaction Audit",
    blurb: "Flags vendors and accounts that normally post once a month but show 2+ transactions this month.",
    icon: Copy,
  },
  {
    key: "reconciliation",
    name: "Bank Reconciliation",
    blurb: "Matches your Xero export against a bank statement and shows what's left unreconciled.",
    icon: Landmark,
  },
  {
    key: "vendor",
    name: "Vendor Exception Review",
    blurb: "Learns each vendor's usual account from history and flags anything posted somewhere else.",
    icon: ScanEye,
  },
];

export const DASHBOARD_MODULES = [
  { key: "expense", label: "Expense Checker", color: shellColors.warn },
  { key: "duplicate", label: "Duplicate Audit", color: shellColors.danger },
  { key: "reconciliation", label: "Bank Reconciliation", color: shellColors.accent },
  { key: "vendor", label: "Vendor Review", color: "#7C3AED" },
];

export const UNIVERSAL_FIELDS = [
  { key: "date", label: "Date", match: /date/i, required: true, usedBy: "all four tools" },
  { key: "account", label: "Account / category (leave as None for a grouped Xero export — one section per account)", match: /account\s*name|^account$|category/i, required: false, usedBy: "all four tools" },
  { key: "amount", label: "Amount", match: /gross|amount|debit|credit|^net$|^total$|value/i, required: true, usedBy: "all four tools" },
  { key: "vendor", label: "Vendor / contact", match: /vendor|contact|supplier|payee/i, required: false, usedBy: "Duplicate Audit, Vendor Review" },
  { key: "description", label: "Description", match: /description|memo|narrative/i, required: false, usedBy: "Duplicate Audit (fallback for vendor)" },
  { key: "accountCode", label: "Account code", match: /account\s*code|^code$/i, required: false, usedBy: "Duplicate Audit" },
  { key: "accountType", label: "Account type", match: /account\s*type|^type$/i, required: false, usedBy: "Expense Checker, Duplicate Audit" },
];

export const COA_FIELDS = [
  { key: "name", label: "Account Name", match: /name|account/i, required: true },
  { key: "type", label: "Account Type / Category", match: /type|class|category/i, required: true },
  { key: "code", label: "Account Code", match: /code|number|id/i, required: false },
];

export default { TOOLS, DASHBOARD_MODULES, UNIVERSAL_FIELDS, COA_FIELDS };
