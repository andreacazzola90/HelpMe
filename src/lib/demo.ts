import { categories, colors, defaultRules, type Transaction } from "./finance";

export function demoData() {
  const transactions: Transaction[] = [];
  const templates = [
    ["Affitto Milano", -78000, "Casa"], ["Esselunga Milano", -8640, "Alimentari"], ["Trenitalia", -4200, "Trasporti"],
    ["Ristorante La Cucina", -6200, "Ristoranti"], ["Netflix", -1399, "Servizi"], ["Farmacia Centrale", -2450, "Salute"],
    ["Libreria indipendente", -3200, "Tempo libero"], ["Mercato di quartiere", -2860, "Alimentari"], ["Acquisto online", -8900, "Shopping"],
    ["Pagamento POS", -1800, null], ["Cena in contanti", -3000, "Ristoranti"],
  ] as const;
  for (let month = 5; month <= 10; month++) {
    transactions.push({ id: `salary-${month}`, account_key: "fineco-demo", date: `2026-${String(month).padStart(2, "0")}-01`, description: "Stipendio", amount_cents: 245000,
      currency: "EUR", kind: "income", category: "Stipendio", source: "api", reconciled_to: null, refund_of: null });
    templates.forEach(([description, amount, category], index) => {
      const day = month === 10 ? Math.min(index + 1, 10) : index * 2 + 2;
      transactions.push({ id: `expense-${month}-${index}`, account_key: index === 10 ? "cash" : "fineco-demo", date: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        description, amount_cents: amount - (index > 1 && index < 8 ? (month % 3) * 500 : 0), currency: "EUR", kind: "expense", category, source: index === 10 ? "manual" : "api", reconciled_to: null, refund_of: null });
    });
    transactions.push({ id: `withdraw-${month}`, account_key: "fineco-demo", date: `2026-${String(month).padStart(2, "0")}-05`, description: "Prelievo ATM", amount_cents: -10000,
      currency: "EUR", kind: "withdrawal", category: "Prelievi", source: "api", reconciled_to: null, refund_of: null });
  }
  transactions.push({ id: "refund-demo", account_key: "fineco-demo", date: "2026-10-09", description: "Rimborso acquisto online", amount_cents: 2000, currency: "EUR",
    kind: "refund", category: "Shopping", source: "api", reconciled_to: null, refund_of: "expense-10-8" });
  return { transactions, rules: defaultRules, categories: categories.map((name, index) => ({ name, color: colors[index % colors.length] })),
    bank: [{ account_key: "fineco-demo", valid_until: "2027-03-01T00:00:00Z", balance: { balances: [{ balance_amount: { amount: "8642.35", currency: "EUR" }, balance_type: "ITAV" }] }, synced_at: "2026-10-10T06:00:00Z", last_error: null }],
    coverage: [{ account_key: "fineco-demo", from_date: "2026-05-01", to_date: "2026-10-10", source: "demo", verified: false }] };
}