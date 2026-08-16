import { parseSharedDate } from "./dateUtils";
import { parseSharedAmount } from "./amountUtils";

export function guessHeaderRowUniversal(rows) {
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i++) {
    const row = rows[i] || [];
    const textCount = row.filter((c) => typeof c === "string" && c.trim() !== "").length;
    if (textCount < 2) continue;
    const lookahead = rows.slice(i + 1, i + 12);
    const hasDateAhead = lookahead.some((r) => r && r.some((c) => c instanceof Date || typeof c === "number"));
    if (hasDateAhead) return i;
  }
  return 0;
}

export function guessCoaHeaderRow(rows) {
  const idx = rows.findIndex((row) => (row || []).filter((c) => typeof c === "string" && /code|account|name|type|status/i.test(c)).length >= 2);
  return idx === -1 ? 0 : idx;
}

export function guessBankMapping(fields) {
  const guess = (re) => fields.find((f) => re.test(f));
  const guessDate = guess(/date/i) || fields[0] || "";
  const guessDesc = guess(/desc|memo|payee|name|merchant/i) || fields[1] || "";
  const guessAmount = guess(/^amount$|^amt$/i) || guess(/amount/i);
  const guessDebit = guess(/debit/i);
  const guessCredit = guess(/credit/i);
  return {
    dateCol: guessDate,
    descCol: guessDesc,
    mode: guessAmount ? "single" : guessDebit && guessCredit ? "split" : "single",
    amountCol: guessAmount || "",
    flipSign: false,
    debitCol: guessDebit || "",
    creditCol: guessCredit || "",
  };
}

export function buildSharedTransactions(rows, headerRowIdx, mapping, dateFormatPref) {
  const get = (row, key) => (mapping[key] >= 0 ? row[mapping[key]] : null);
  const out = [];

  if (mapping.account >= 0) {
    // FLAT: every row already carries its own account name.
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.some((c) => c !== null && c !== undefined && c !== "")) continue;
      const account = String(get(row, "account") ?? "").trim();
      const amount = parseSharedAmount(get(row, "amount"));
      const date = parseSharedDate(get(row, "date"), dateFormatPref);
      if (!account || amount == null) continue;
      out.push({
        date,
        account,
        amount,
        vendor: get(row, "vendor") != null ? String(get(row, "vendor")).trim() : "",
        description: get(row, "description") != null ? String(get(row, "description")).trim() : "",
        accountCode: get(row, "accountCode") != null ? String(get(row, "accountCode")).trim() : "",
        accountType: get(row, "accountType") != null ? String(get(row, "accountType")).trim() : "",
      });
    }
    return out;
  }

  // GROUPED: account name comes from block-header rows, exactly the shape
  // Xero's own "Account Transactions" export uses.
  let currentAccount = null;
  const isBlankRow = (r) => !r || r.every((c) => c === null || c === "");
  const nonNullCount = (r) => r.slice(1).filter((c) => c !== null && c !== "").length;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlankRow(row)) continue;
    const a = row[0];

    if (typeof a === "string" && nonNullCount(row) === 0) {
      if (a === "Opening Balance" || a === "Closing Balance") continue;
      if (a.startsWith("Total ")) {
        currentAccount = null;
        continue;
      }
      const m = a.match(/^([\w.\-]+)\s+-\s+(.+)$/);
      currentAccount = m ? m[2] : a;
      continue;
    }

    const dateVal = get(row, "date");
    if (currentAccount && (dateVal instanceof Date || typeof dateVal === "number" || (typeof dateVal === "string" && dateVal.trim()))) {
      const date = parseSharedDate(dateVal, dateFormatPref);
      const amount = parseSharedAmount(get(row, "amount"));
      if (!date || amount == null) continue;
      out.push({
        date,
        account: currentAccount,
        amount,
        vendor: get(row, "vendor") != null ? String(get(row, "vendor")).trim() : "",
        description: get(row, "description") != null ? String(get(row, "description")).trim() : "",
        accountCode: get(row, "accountCode") != null ? String(get(row, "accountCode")).trim() : "",
        accountType: get(row, "accountType") != null ? String(get(row, "accountType")).trim() : "",
      });
    }
  }
  return out;
}

export function buildCoaAccountsFromRows(rows, headerRowIdx, mapping) {
  const headerRow = (rows[headerRowIdx] || []).map((h) => (h == null ? "" : String(h).trim()));
  const idxOf = (colName) => headerRow.indexOf(colName);
  const codeIdx = mapping.code ? idxOf(mapping.code) : -1;
  const nameIdx = idxOf(mapping.name);
  const typeIdx = idxOf(mapping.type);
  const statusIdx = mapping.status ? idxOf(mapping.status) : -1;

  const accounts = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r.some((c) => String(c ?? "").trim() !== "")) continue;
    const name = nameIdx >= 0 ? String(r[nameIdx] ?? "").trim() : "";
    if (!name) continue;
    accounts.push({
      code: codeIdx >= 0 ? String(r[codeIdx] ?? "").trim() : "",
      name,
      type: typeIdx >= 0 ? String(r[typeIdx] ?? "").trim() : "",
      status: statusIdx >= 0 ? String(r[statusIdx] ?? "").trim() : "",
    });
  }
  return accounts;
}

export default {
  guessHeaderRowUniversal,
  guessCoaHeaderRow,
  guessBankMapping,
  buildSharedTransactions,
  buildCoaAccountsFromRows,
};
