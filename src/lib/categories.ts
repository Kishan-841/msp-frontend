import type { LeadCategory } from "@/types";

// Products offered under each category — single source for categorize, lead form and quote requests.
// Add new subcategories here.
export const SUBCATEGORIES: Record<LeadCategory, string[]> = {
  HARDWARE: ["Firewall", "Access Point", "Servers", "Switches", "Routers", "NAS"],
  SOFTWARE: ["Cloud"],
};

export const CATEGORY_LABEL: Record<LeadCategory, string> = {
  HARDWARE: "Hardware",
  SOFTWARE: "Software",
};
