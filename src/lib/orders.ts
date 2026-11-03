import type { LeadDetail } from "@/types";

/**
 * Repeat orders: a lead can run the process several times (orderNo 1, 2, …). The workspace
 * works on the current order only — this trims the lead's quotes / POs / invoices / meetings /
 * calls to those of `lead.orderNo`. Earlier orders stay visible on the lead page.
 */
export function scopeToCurrentOrder(lead: LeadDetail): LeadDetail {
  const orderNo = lead.orderNo ?? 1;
  if (orderNo <= 1 || !lead.orderStartedAt) return lead;
  const since = new Date(lead.orderStartedAt).getTime();
  const quotes = (lead.quotes ?? []).filter((q) => (q.orderNo ?? 1) === orderNo);
  const quoteIds = new Set(quotes.map((q) => q.id));
  return {
    ...lead,
    quotes,
    purchaseOrders: (lead.purchaseOrders ?? []).filter((p) => quoteIds.has(p.quoteId)),
    salesInvoices: (lead.salesInvoices ?? []).filter((i) => i.quoteId && quoteIds.has(i.quoteId)),
    meetings: (lead.meetings ?? []).filter((m) => new Date(m.createdAt).getTime() >= since),
    activityLogs: (lead.activityLogs ?? []).filter((a) => new Date(a.createdAt).getTime() >= since),
  };
}
