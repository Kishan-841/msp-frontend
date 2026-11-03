export type UserRole = 'ADMIN' | 'MSP_TL' | 'SALES' | 'ACCOUNTS';

export type LeadStatus =
  | 'NEW' | 'CATEGORIZED' | 'ASSIGNED'
  | 'MEETING_SCHEDULED' | 'MEETING_DONE' | 'MOM_ADDED'
  | 'QUOTE_REQUESTED'
  | 'QUOTE_CREATED' | 'QUOTE_SUBMITTED' | 'QUOTE_APPROVED' | 'QUOTE_REJECTED'
  | 'QUOTE_SENT' | 'CUSTOMER_ACCEPTED'
  | 'PO_PENDING_ACCOUNTS' | 'PO_CONFIRMED' | 'PO_SENT'
  | 'INVOICED' | 'DEAL_REGISTERED';

export type LeadCategory = 'HARDWARE' | 'SOFTWARE';
export type LeadSource = 'MANUAL' | 'API';
export type QuoteStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SENT' | 'ACCEPTED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface Lead {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  source: LeadSource;
  category?: LeadCategory;
  subcategory?: string[];
  status: LeadStatus;
  orderNo?: number; // repeat orders: 1, 2, …
  // sent by another software (source = API)
  integrationClient?: { name: string } | null;
  submittedByName?: string | null;
  submittedByEmail?: string | null;
  sourceRequirement?: string | null;
  possibleDuplicateIds?: string[];
  orderStartedAt?: string | null;
  notes?: string;
  customerGstin?: string | null;
  customerState?: string | null; // GST state code
  billingAddress?: string | null;
  callbackAt?: string | null; // "Call later" — when to call back
  finalRequirement?: string | null;
  requirementItems?: RequirementItem[] | null;
  quoteRequestedAt?: string | null;
  quoteRequestedBy?: User | null;
  droppedAt?: string | null;
  dropReason?: string | null;
  createdBy?: User;
  assignedTo?: User;
  mspTl?: User;
  createdAt: string;
  updatedAt: string;
}

// Catalogue: category → product (lib/categories.ts) → item, e.g. Hardware → Firewall → Fortinet FortiGate 60F
export interface Material {
  id: string;
  category: LeadCategory;
  product: string;
  name: string;
  brand?: string | null;
  createdBy?: { id: string; name: string };
}

export interface RequirementMaterial {
  materialId: string;
  name: string;
  brand?: string | null;
  quantity: number;
}

// A product Sales picked when sending the lead for a quote
export interface RequirementItem {
  category: LeadCategory;
  name: string;
  details?: string;
  materials?: RequirementMaterial[];
}

export interface LeadListResponse {
  leads: Lead[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ActivityLog {
  id: string;
  action: string;
  details?: string;
  user?: User;
  createdAt: string;
}

export interface Meeting {
  id: string;
  leadId: string;
  meetingDate: string;
  location: string;
  attendees: string[];
  agenda?: string;
  momContent?: string;
  attachments: string[];
  conductedBy?: User;
  lead?: { id: string; companyName: string; status?: LeadStatus; quoteRequestedAt?: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface MeetingListResponse {
  meetings: Meeting[];
  total: number;
  page: number;
  totalPages: number;
}

// Quote = requirements (e.g. "Firewall"), each with items (products) and services.
// Prices are excl. GST; the backend computes the amount fields.
export interface QuoteItem {
  make: string;
  description?: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  gstPercent: number;
  taxableAmount: number;
  gstAmount: number;
  total: number;
}

export interface QuoteService {
  description: string;
  price: number;
  gstPercent: number;
  taxableAmount: number;
  gstAmount: number;
  total: number;
}

export interface QuoteRequirement {
  name: string;
  items: QuoteItem[];
  services: QuoteService[];
  subtotal: number;
  gstAmount: number;
  total: number;
}

export interface Quote {
  id: string;
  leadId: string;
  quoteNumber: string;
  orderNo?: number; // which order of the lead
  items: QuoteRequirement[];
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  status: QuoteStatus;
  notes?: string;
  rejectionReason?: string;
  createdBy?: User;
  approvedBy?: User;
  sentAt?: string | null;
  sentBy?: User | null;
  acceptedAt?: string | null;
  acceptedBy?: User | null;
  customerPoNumber?: string | null;
  customerPoDate?: string | null;
  acceptanceNote?: string | null;
  purchaseOrder?: { id: string; poNumber: string; status: PurchaseOrderStatus } | null;
  lead?: {
    id: string;
    companyName: string;
    status?: LeadStatus;
    contactPerson?: string;
    email?: string;
    category?: LeadCategory;
    subcategory?: string[];
    assignedToId?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address?: string | null;
  gstNumber?: string | null;
  state?: string | null; // GST state code
  products: string[];
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettings {
  id: number;
  name: string;
  gstin?: string | null;
  state?: string | null; // GST state code
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  pan?: string | null;
  cin?: string | null;
  tan?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankBranch?: string | null;
  logoDataUrl?: string | null;
  poTerms?: string | null;
  updatedAt: string;
}

export type PurchaseOrderStatus =
  | 'DRAFT' | 'PENDING_ACCOUNTS' | 'CONFIRMED' | 'REJECTED' | 'SENT_TO_VENDOR';
export type GstType = 'INTRA' | 'INTER'; // INTRA → CGST + SGST, INTER → IGST
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

// Quote line with the vendor's buying rate (computed by backend utils/poCalc.ts)
export interface PoLine {
  kind: 'ITEM' | 'SERVICE';
  requirement: string;
  description: string;
  hsnCode?: string;
  quantity: number;
  unit: string;
  rate: number; // buying rate — what we pay the vendor
  customerRate: number; // the customer's price (internal only, never on vendor documents)
  gstPercent: number;
  taxableAmount: number;
  gstAmount: number;
  total: number;
}

export interface PurchaseInvoice {
  id: string;
  purchaseOrderId: string;
  vendorId: string;
  billNumber: string; // ours: PINV/2026-27/0001
  vendorInvoiceNumber?: string | null; // the vendor's own invoice no.
  items?: InvoiceLine[]; // PO lines billed, at buying rates
  invoiceDate: string;
  dueDate?: string | null;
  taxableAmount: number;
  gstType: GstType;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  notes?: string | null;
  createdBy?: User;
  createdAt: string;
  outstanding?: number;
  adjustmentNotes?: AdjustmentNote[];
  allocations?: PaymentAllocation[];
  vendor?: { id: string; name: string };
  purchaseOrder?: { id: string; poNumber: string };
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  quoteId: string;
  leadId: string;
  vendorId: string;
  status: PurchaseOrderStatus;
  items: PoLine[];
  gstType: GstType;
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  deliveryAddress?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  submittedAt?: string | null;
  confirmedAt?: string | null;
  rejectionReason?: string | null;
  sentAt?: string | null;
  vendor: Vendor;
  quote?: { id: string; quoteNumber: string; totalAmount?: number; customerPoNumber?: string | null };
  lead?: { id: string; companyName: string; contactPerson?: string; status?: LeadStatus; assignedTo?: User | null };
  createdBy?: User;
  confirmedBy?: User | null;
  sentBy?: User | null;
  purchaseInvoices?: PurchaseInvoice[];
  createdAt: string;
  updatedAt: string;
}

// ---------- Phase 3: sales & money

// Customer invoice line — a quote line at the customer's price
export interface InvoiceLine {
  lineIndex: number;
  kind: 'ITEM' | 'SERVICE';
  requirement: string;
  description: string;
  hsnCode?: string;
  quantity: number;
  unit: string;
  rate: number;
  gstPercent: number;
  taxableAmount: number;
  gstAmount: number;
  total: number;
}


export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  quoteId: string;
  leadId: string;
  invoiceDate: string;
  dueDate?: string | null;
  items: InvoiceLine[];
  gstType: GstType;
  placeOfSupply: string;
  customerName: string;
  customerGstin?: string | null;
  customerAddress?: string | null;
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  notes?: string | null;
  outstanding: number;
  createdBy?: User;
  quote?: { id: string; quoteNumber: string; customerPoNumber?: string | null; customerPoDate?: string | null };
  adjustmentNotes?: AdjustmentNote[];
  allocations?: PaymentAllocation[];
  createdAt: string;
}


export type PaymentDirection = 'IN' | 'OUT';
export type PaymentMode = 'NEFT' | 'RTGS' | 'IMPS' | 'UPI' | 'CHEQUE' | 'CASH' | 'OTHER';

export interface PaymentAllocation {
  id: string;
  amount: number;
  salesInvoice?: { id: string; invoiceNumber: string } | null;
  purchaseInvoice?: { id: string; billNumber: string; vendorInvoiceNumber?: string | null; purchaseOrderId: string } | null;
  payment?: {
    id: string;
    number: string;
    paymentDate: string;
    mode: PaymentMode;
    reference?: string | null;
    amount: number;
    tdsAmount: number;
    ourBankName?: string | null;
    ourBankAccountNumber?: string | null;
    partyBankName?: string | null;
    partyBankAccountNumber?: string | null;
    partyBankIfsc?: string | null;
  };
}

export interface Payment {
  id: string;
  number: string;
  direction: PaymentDirection;
  leadId?: string | null;
  vendorId?: string | null;
  lead?: { id: string; companyName: string } | null;
  vendor?: { id: string; name: string } | null;
  paymentDate: string;
  mode: PaymentMode;
  reference?: string | null;
  amount: number;
  tdsPercent: number;
  tdsAmount: number;
  ourBankName?: string | null;
  ourBankAccountNumber?: string | null;
  ourBankIfsc?: string | null;
  partyBankName?: string | null;
  partyBankAccountName?: string | null;
  partyBankAccountNumber?: string | null;
  partyBankIfsc?: string | null;
  notes?: string | null;
  unallocated: number;
  allocations: PaymentAllocation[];
  createdBy?: { id: string; name: string };
}

export interface AdjustmentNote {
  id: string;
  kind: 'CREDIT' | 'DEBIT';
  side: 'SALES' | 'PURCHASE';
  number: string;
  noteDate: string;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  reason: string;
}

// A deal (accepted quote) that can still be invoiced — GET /invoices/ready
export interface ReadyToInvoice {
  id: string; // quote id
  quoteNumber: string;
  customerPoNumber?: string | null;
  lead: { id: string; companyName: string; customerGstin?: string | null; customerState?: string | null };
  purchaseOrder?: { id: string; poNumber: string } | null;
  lines: InvoiceLine[];
  billed: number[];
  remaining: number[];
  remainingValue: number;
  invoiceCount: number;
}

/** A PO sent to the vendor with lines not yet billed (GET /purchase-invoices/ready) */
export interface ReadyToBill {
  id: string; // PO id
  poNumber: string;
  sentAt?: string | null;
  gstType: GstType;
  vendor: { id: string; name: string; gstNumber?: string | null };
  lead: { id: string; companyName: string };
  lines: InvoiceLine[];
  billed: number[];
  remaining: number[];
  remainingValue: number;
  billCount: number;
}

export interface LedgerEntry {
  date: string;
  type: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'RECEIPT' | 'PAYMENT' | 'TDS';
  number: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  link?: string;
}

export type AttachmentEntityType = 'QUOTE_ACCEPTANCE' | 'PURCHASE_ORDER' | 'PURCHASE_INVOICE';

export interface Attachment {
  id: string;
  entityType: AttachmentEntityType;
  entityId: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy?: { id: string; name: string };
  createdAt: string;
}

export interface QuoteListResponse {
  quotes: Quote[];
  total: number;
  page: number;
  totalPages: number;
}

export interface LeadDetail extends Lead {
  meetings: Meeting[];
  quotes: Quote[];
  purchaseOrders?: (Pick<
    PurchaseOrder,
    'id' | 'poNumber' | 'status' | 'totalAmount' | 'rejectionReason' | 'quoteId'
  > & { vendor: { id: string; name: string } })[];
  salesInvoices?: Pick<SalesInvoice, 'id' | 'quoteId' | 'invoiceNumber' | 'totalAmount' | 'paymentStatus' | 'invoiceDate'>[];
  activityLogs: ActivityLog[];
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link?: string;
  /** false when the linked record was deleted or is no longer visible to this user */
  available?: boolean;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
