// Units for quote item rows (and so the PO / invoice lines copied from them).
// The value is what's stored and printed on documents. Services always use "Service".
export const UNITS = ["Nos", "Pcs", "Mtr", "Licence", "Year"] as const;

export const DEFAULT_UNIT = "Nos";
