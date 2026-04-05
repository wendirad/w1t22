export enum Role {
  BUYER = 'buyer',
  DEALERSHIP_STAFF = 'dealership_staff',
  FINANCE_REVIEWER = 'finance_reviewer',
  ADMIN = 'admin',
}

export enum OrderStatus {
  CREATED = 'created',
  RESERVED = 'reserved',
  INVOICED = 'invoiced',
  SETTLED = 'settled',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
}

export enum OrderEvent {
  RESERVE = 'RESERVE',
  INVOICE = 'INVOICE',
  SETTLE = 'SETTLE',
  FULFILL = 'FULFILL',
  CANCEL = 'CANCEL',
}

export enum DocumentType {
  TITLE = 'title',
  BUYERS_ORDER = 'buyers_order',
  INSPECTION = 'inspection',
  OTHER = 'other',
}

export enum PaymentMethod {
  CASH = 'cash',
  CASHIER_CHECK = 'cashier_check',
  IN_HOUSE_FINANCING = 'in_house_financing',
  CREDIT_CARD = 'credit_card',
  BANK_TRANSFER = 'bank_transfer',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PAID = 'paid',
  VOIDED = 'voided',
}

export enum VehicleStatus {
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  SOLD = 'sold',
}

export enum ExperimentStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ROLLED_BACK = 'rolled_back',
  COMPLETED = 'completed',
}

export enum PermissionEffect {
  ALLOW = 'allow',
  DENY = 'deny',
}

export enum PermissionAction {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  DOWNLOAD = 'download',
  SHARE = 'share',
  SUBMIT = 'submit',
  APPROVE = 'approve',
}
