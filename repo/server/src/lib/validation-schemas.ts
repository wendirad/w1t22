import { z } from 'zod';

// Auth
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['buyer', 'dealership_staff', 'finance_reviewer', 'admin']).optional(),
  dealershipId: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
});

// Vehicles
export const createVehicleSchema = z.object({
  vin: z.string().min(1),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  trim: z.string().optional(),
  mileage: z.number().min(0),
  price: z.number().min(0),
  region: z.string().optional(),
  registrationDate: z.string().optional(),
  supplierId: z.string().optional(),
  warehouseId: z.string().optional(),
  estimatedTurnaround: z.number().optional(),
  images: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const updateVehicleSchema = createVehicleSchema.extend({
  status: z.enum(['available', 'reserved', 'sold']).optional(),
}).partial();

// Cart
export const addToCartSchema = z.object({
  vehicleId: z.string().min(1),
  addOnServices: z.array(z.object({
    serviceCode: z.string(),
  })).optional(),
  dealershipId: z.string().optional(),
});

// Orders
export const createOrderSchema = z.object({
  idempotencyKey: z.string().optional(),
  dealershipId: z.string().optional(),
});

export const transitionOrderSchema = z.object({
  event: z.enum(['RESERVE', 'INVOICE', 'SETTLE', 'FULFILL', 'CANCEL']),
  reason: z.string().optional(),
});

export const mergeOrdersSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(2),
});

// Documents
export const uploadDocumentBodySchema = z.object({
  type: z.enum(['title', 'buyers_order', 'inspection', 'other']).optional(),
  orderId: z.string().optional(),
  vehicleId: z.string().optional(),
  sensitiveFlag: z.string().optional(),
  dealershipId: z.string().optional(),
});

export const documentActionSchema = z.object({
  targetUserId: z.string().optional(),
  actions: z.array(z.string()).optional(),
  comment: z.string().optional(),
});

// Finance
export const processPaymentSchema = z.object({
  orderId: z.string().min(1),
  invoiceId: z.string().min(1),
  dealershipId: z.string().optional(),
  method: z.enum(['cash', 'cashier_check', 'in_house_financing', 'credit_card', 'bank_transfer']),
  amount: z.number().positive(),
  idempotencyKey: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Admin - Synonyms
export const createSynonymSchema = z.object({
  canonical: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
  field: z.string().optional(),
});

export const updateSynonymSchema = createSynonymSchema.partial();

// Admin - Tax Rates
export const createTaxRateSchema = z.object({
  state: z.string().min(1),
  county: z.string().optional(),
  rate: z.number().min(0).max(1),
  effectiveDate: z.string(),
  expiresAt: z.string().nullable().optional(),
});

export const updateTaxRateSchema = createTaxRateSchema.partial();

// Admin - User Role
export const updateUserRoleSchema = z.object({
  role: z.enum(['buyer', 'dealership_staff', 'finance_reviewer', 'admin']),
  dealershipId: z.string().nullable().optional(),
});

// Admin - Dealership
export const createDealershipSchema = z.object({
  name: z.string().min(1),
  region: z.string().min(1),
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    county: z.string().optional(),
    zip: z.string().min(1),
  }),
  enabledPaymentMethods: z.array(z.string()).optional(),
});

// Admin - Experiments
export const createExperimentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  feature: z.string().min(1),
  variants: z.array(z.object({
    key: z.string().min(1),
    weight: z.number().min(0).max(1),
    config: z.record(z.any()).optional(),
  })).min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const updateExperimentSchema = z.object({
  action: z.enum(['activate', 'rollback']),
});

// Admin - Filter Presets
export const saveFilterPresetSchema = z.object({
  name: z.string().min(1),
  filters: z.record(z.any()),
});

// Admin - Permission Overrides
export const createPermissionOverrideSchema = z.object({
  dealershipId: z.string().min(1),
  resource: z.string().min(1),
  resourceId: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  actions: z.array(z.string().min(1)).min(1),
  effect: z.enum(['allow', 'deny']),
  reason: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
});

export const updatePermissionOverrideSchema = createPermissionOverrideSchema.partial();

// Privacy
export const recordConsentSchema = z.object({
  consentType: z.string().min(1),
  granted: z.boolean(),
  version: z.string().min(1),
});

// Mongo ObjectId param
export const mongoIdParam = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format'),
});

export const vehicleIdParam = z.object({
  vehicleId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid vehicle ID format'),
});

export const orderIdParam = z.object({
  orderId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid order ID format'),
});
