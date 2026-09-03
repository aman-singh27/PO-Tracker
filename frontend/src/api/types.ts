export type Role = "owner" | "staff" | "accounts" | "admin"

export interface User {
  id: number
  name: string
  email: string
  role?: Role
  force_password_change?: boolean
}

export interface LoginResponse {
  user: Omit<User, "role">
  role: Role
  force_password_change?: boolean
}

export type LifecycleStage = "draft" | "ordered" | "partially_built" | "partially_paid" | "closed"

export interface LineItem {
  id?: number
  line_no: number
  description: string
  item_type: "material" | "service"
  qty_ordered: string
  unit: string
  rate: string
  gst_rate: string
  amount?: string
  interim_status?: string
  derived_status?: { status: string; qty_delivered: string; qty_billed: string }
  needs_review?: boolean
  work_done_on?: string | null
  client_approved_on?: string | null
  short_closed_on?: string | null
}

export interface PurchaseOrder {
  id: number
  po_number: string
  po_date: string
  client_name: string
  site_name?: string
  status: string
  lifecycle_stage: LifecycleStage
  total_amount: string
  amount_billed?: string
  needs_review?: boolean
  lines?: LineItem[]
  line_items?: LineItem[]
  notes?: string
  updated_at?: string
  totals?: {
    amount_ordered: string
    amount_billed: string
    amount_paid: string
    outstanding_amount: string
  }
}

export interface ReviewItem {
  id: number
  severity: "error" | "warning"
  reason_code: string
  source_ref: string
  payload_json: Record<string, string>
  batch_id: number
}

export interface StuckItem {
  line_id: number
  po_id: number
  po_number: string
  client: string
  site: string
  description: string
  status: string
  amount: string
  days_waiting: number | null
}

export interface OverdueBill {
  bill_id: number
  bill_number: string
  client: string
  total_amount: string
  outstanding_amount: string
  age_days: number
}

export interface AribaBacklogItem {
  bill_id: number
  bill_number: string
  client: string
  outstanding_amount: string
  ariba_state: string
  ariba_uploaded_on: string | null
  age_days: number
}

export interface Dashboard {
  metrics: {
    pending_items: number
    outstanding_amount: string
    overdue_bill_count: number
    ariba_backlog_count: number
  }
  stuck_items: StuckItem[]
  overdue_bills: OverdueBill[]
  ariba_backlog: AribaBacklogItem[]
  gst: {
    basic_billed: string
    gst_billed: string
    gross_billed: string
  }
}

export interface Page<T> { count: number; results: T[] }

export interface ChallanAllocation {
  line_item: number
  qty: string
  line_item_description?: string
  po_number?: string
  po_id?: number
}

export interface Challan {
  id: number
  challan_number: string
  challan_date: string
  site?: number
  site_name?: string
  client_name?: string
  delivery_source?: string
  bill_to_name?: string
  ship_to_name?: string
  notes?: string
  source?: string
  needs_review?: boolean
  allocations?: ChallanAllocation[]
}

export type AribaState = "not_required" | "pending" | "uploaded" | "rejected" | "resubmitted"

export interface BillAllocation {
  line_item: number
  qty: string
  rate: string
  gst_rate: string
  amount?: string
  gst_amount?: string
  total_amount?: string
  line_item_description?: string
  po_number?: string
  po_id?: number
}

export interface Bill {
  id: number
  legal_entity?: number
  legal_entity_name?: string
  bill_number: string
  bill_date: string
  basic_amount: string
  gst_amount: string
  total_amount: string
  ariba_state: AribaState
  ariba_uploaded_on?: string | null
  ariba_reference?: string
  ariba_rejection_note?: string
  source?: string
  needs_review?: boolean
  allocations?: BillAllocation[]
  client_name?: string
  po_numbers?: string[]
  amount_paid?: string
  outstanding_amount?: string
}

export interface PaymentAllocation {
  bill: number
  amount: string
  kind: "payment" | "tds" | "retention" | "discount" | "write_off"
  note?: string
  bill_number?: string
}

export interface Payment {
  id: number
  client: number
  client_name?: string
  received_on: string
  amount: string
  mode?: string
  reference?: string
  is_advance?: boolean
  notes?: string
  allocations?: PaymentAllocation[]
}

export interface ClientRecord {
  id: number
  name: string
  code: string
  default_gst_rate: string
  payment_terms_days?: number | null
  is_active: boolean
}

export interface PendingLine {
  id: number
  po_id: number
  po_number: string
  client: string
  description: string
  status: string
  qty_ordered: string
  qty_delivered: string
  qty_billed: string
  is_over_billed: boolean
  is_over_delivered: boolean
}
