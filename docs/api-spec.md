# MotorLot DealerOps API Contract

## Runtime Reality (Important)

- This repository has a real Express HTTP API mounted at `/api/v1`.
- The API behavior in this document reflects the current runtime implementation under `repo/server/src/**`.
- This contract documents enforced middleware behavior (auth, HMAC, RBAC, dealership scoping, validation) and controller/service outputs.

## Source of Truth Used

- Routes: `repo/server/src/routes/*.ts`
- Controllers: `repo/server/src/controllers/*.ts`
- Validation schemas: `repo/server/src/lib/validation-schemas.ts`
- Middleware: auth/HMAC/RBAC/scope/error handling in `repo/server/src/middleware/*.ts`
- Core services for business contracts:
	- order lifecycle and rollback: `repo/server/src/services/order/order.service.ts`
	- payments and ledger: `repo/server/src/services/finance/*.ts`
	- document workflow and storage: `repo/server/src/services/document/document.service.ts`
	- search behavior: `repo/server/src/services/search/search.service.ts`

## Base URL

- Base path: `/api/v1`
- JSON APIs unless explicitly multipart upload.

## Security and Scope Model

### Authentication

- Bearer JWT in `Authorization: Bearer <accessToken>` for protected routes.
- `optionalAuth` routes may run as public if token is absent.

### HMAC Request Signing

- For authenticated requests on signed routes, both are required:
	- `X-Timestamp: <ISO timestamp>`
	- `X-Hmac-Signature: <hex sha256 hmac>`
- Canonical payload format:

```text
METHOD\nPATH_WITH_QUERY\nBODY\nTIMESTAMP
```

- Signature algorithm: HMAC-SHA256 hex digest.
- Replay protection: same signature cannot be reused within the anti-replay window.
- Timestamp validity window: 5 minutes.
- Multipart upload signing uses empty body string on both client and server.

### Per-session Signing Key

- Signing key is issued on auth success (`register`, `login`, `refresh`) as `signingKey`.
- Client stores this as session state and uses it to sign authenticated requests.
- Server validates by resolving per-user key from Redis.

### Dealership Scoping

- Non-admin users are scoped to `req.user.dealershipId`.
- Admin users can set dealership scope via `X-Dealership-Id`.
- Controllers for scoped resources enforce tenant boundaries from auth context (not client query/body).

### Roles

- `buyer`
- `dealership_staff`
- `finance_reviewer`
- `admin`

## Global Response Conventions

### Error Shape

```json
{
	"code": 400,
	"msg": "Bad request"
}
```

Common status codes:

- `400` bad request / invalid transition / business rule
- `401` unauthorized / invalid token / invalid HMAC / replay
- `403` forbidden
- `404` not found
- `409` conflict / duplicate
- `413` payload too large
- `422` schema validation error
- `500` internal server error

### Pagination Shape

Many listing endpoints return:

```json
{
	"data": [],
	"pagination": {
		"page": 1,
		"limit": 20,
		"total": 0,
		"totalPages": 0,
		"hasNext": false,
		"hasPrev": false
	}
}
```

Defaults and bounds:

- `page` default `1`, minimum `1`
- `limit` default `20`, min `1`, max `100`
- `sortBy` default `createdAt`
- `sortOrder` default `desc` (`asc` allowed)

## Domain Enums Used by APIs

- Order status: `created | reserved | invoiced | settled | fulfilled | cancelled`
- Order transition events: `RESERVE | INVOICE | SETTLE | FULFILL | CANCEL`
- Document type: `title | buyers_order | inspection | other`
- Vehicle status: `available | reserved | sold`
- Payment methods:
	- offline: `cash | cashier_check | in_house_financing`
	- online (feature-flagged): `credit_card | bank_transfer`
- Payment status: `pending | completed | failed | refunded`
- Invoice status: `draft | issued | paid | voided`
- Permission effect: `allow | deny`

## Endpoint Catalog

### Public and Shared Endpoints

#### GET `/health`

- Auth: none
- HMAC: no
- Response:

```json
{ "status": "ok", "timestamp": "2026-04-06T00:00:00.000Z" }
```

#### GET `/dealerships`

- Auth: none
- HMAC: no
- Response: active dealerships with selected fields (`name`, `region`).

#### GET `/experiments/assignment`

- Auth: optional
- HMAC: required only when authenticated
- Query params:
	- `feature` optional
- Behavior:
	- Missing feature: returns default control assignment.
	- No active experiment: returns default control assignment.
	- Active experiment: returns persisted or newly assigned variant for user/IP.
- Response:

```json
{
	"variant": "control",
	"config": {},
	"isDefault": true,
	"experimentId": "..."
}
```

### Auth

#### POST `/auth/register`

- Auth: none
- HMAC: no
- Body (validated):

```json
{
	"email": "user@example.com",
	"password": "min-8-chars",
	"firstName": "First",
	"lastName": "Last",
	"dealershipId": "optional"
}
```

- Notes:
	- Public registration always creates `buyer` role.
	- `dealershipId` is optional for buyer association.
- Response `201`:

```json
{
	"user": { "_id": "...", "email": "...", "role": "buyer", "dealershipId": "..." },
	"accessToken": "...",
	"refreshToken": "...",
	"signingKey": "hex"
}
```

#### POST `/auth/login`

- Auth: none
- HMAC: no
- Body:

```json
{ "email": "user@example.com", "password": "..." }
```

- Response `200`: same structure as register (includes `signingKey`).

#### POST `/auth/refresh`

- Auth: none
- HMAC: no
- Body:

```json
{ "refreshToken": "..." }
```

- Response `200`:

```json
{ "accessToken": "...", "refreshToken": "...", "signingKey": "hex" }
```

#### POST `/auth/logout`

- Auth: required
- HMAC: no
- Response:

```json
{ "msg": "Logged out successfully" }
```

#### GET `/auth/me`

- Auth: required
- HMAC: no
- Response: user profile (sensitive fields are masked/decrypted per service and middleware behavior).

#### PATCH `/auth/me`

- Auth: required
- HMAC: no
- Body (all optional):

```json
{
	"firstName": "...",
	"lastName": "...",
	"phone": "..."
}
```

- Response: updated user profile.

### Vehicles

#### GET `/vehicles`

- Auth: optional
- HMAC: required only when authenticated
- Scope behavior:
	- Authenticated non-admin users are dealership-scoped from auth context.
	- Admin/public can use broader access.
- Query params:
	- `page`, `limit`, `sortBy`, `sortOrder`
	- `dealershipId`, `make`, `model`, `year`, `minPrice`, `maxPrice`, `minMileage`, `maxMileage`, `region`, `status`
- Response: paginated vehicle list.

#### GET `/vehicles/:id`

- Auth: optional
- HMAC: required only when authenticated
- Params:
	- `id` (Mongo ObjectId)
- Response: one vehicle.

#### POST `/vehicles`

- Auth: required
- HMAC: required
- Roles: `admin`, `dealership_staff`
- Body (validated):

```json
{
	"vin": "...",
	"make": "...",
	"model": "...",
	"year": 2024,
	"trim": "optional",
	"mileage": 100,
	"price": 1000000,
	"region": "optional",
	"registrationDate": "optional-string",
	"supplierId": "optional",
	"warehouseId": "optional",
	"estimatedTurnaround": 1,
	"images": ["..."],
	"description": "optional"
}
```

- Notes:
	- Non-admin dealership scope is derived from auth context.

#### PATCH `/vehicles/:id`

- Auth: required
- HMAC: required
- Roles: `admin`, `dealership_staff`
- Params:
	- `id` ObjectId
- Body: partial create schema + optional `status`.
- Notes:
	- Non-admin updates are object-scoped to tenant ownership.
	- Non-admin cannot reassign `dealershipId`.

### Search

#### GET `/search`

- Auth: optional
- HMAC: required only when authenticated
- Query params:
	- `q`, `make`, `model`, `year`, `minPrice`, `maxPrice`, `minMileage`, `maxMileage`, `region`
	- `minRegistrationDate`, `maxRegistrationDate`
	- `dealershipId` (ignored for authenticated non-admin; scoped from auth)
	- pagination params (`page`, `limit`, `sortBy`, `sortOrder`)
- Response:

```json
{
	"data": [],
	"pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0, "hasNext": false, "hasPrev": false },
	"trending": ["..."],
	"expandedTerms": ["..."]
}
```

#### GET `/search/trending`

- Auth: none
- HMAC: no
- Response:

```json
{ "trending": ["..."] }
```

### Cart

All cart routes:

- Auth: required
- HMAC: required
- Dealership scope: required via user context (admin must pass `X-Dealership-Id`).

#### GET `/cart`

- Response: current scoped cart.

#### POST `/cart/items`

- Body:

```json
{
	"vehicleId": "ObjectId",
	"addOnServices": [
		{ "serviceCode": "inspection" }
	]
}
```

- Response: updated cart.

#### DELETE `/cart/items/:vehicleId`

- Params:
	- `vehicleId` ObjectId
- Response: updated cart.

#### GET `/cart/addons`

- Response:

```json
{ "addOns": [ { "serviceCode": "...", "name": "...", "price": 0 } ] }
```

### Orders

All order routes:

- Auth: required
- HMAC: required
- Dealership scope: enforced.

#### POST `/orders`

- Body:

```json
{ "idempotencyKey": "required" }
```

- Response `201`:
	- Single order object or array of split orders.

#### GET `/orders`

- Query params:
	- `status`
	- admin optional: `buyerId`, `dealershipId`
	- pagination params
- Behavior:
	- buyer: own orders only
	- staff/finance: own dealership only
	- admin: broad with optional filters

#### GET `/orders/:id`

- Params: `id` ObjectId
- Response: one order.

#### POST `/orders/:id/transition`

- Params: `id` ObjectId
- Body:

```json
{
	"event": "RESERVE|INVOICE|SETTLE|FULFILL|CANCEL",
	"reason": "optional",
	"idempotencyKey": "required"
}
```

- Role behavior:
	- buyers cannot execute `INVOICE`, `SETTLE`, `FULFILL`
- Response: updated order.

#### GET `/orders/:id/events`

- Params: `id` ObjectId
- Response: order event list.

#### POST `/orders/merge`

- Body:

```json
{ "orderIds": ["id1", "id2"] }
```

- Validation: min 2, max 20 IDs.
- Response: merged order.

### Documents

All document routes:

- Auth: required
- HMAC: required
- Dealership scope: enforced
- Upload constraints:
	- MIME allowed: PDF/JPEG/PNG
	- Max size: 10 MB
	- Hash verified on download
	- Quarantine on validation/hash mismatch

#### POST `/documents/upload`

- Content type: `multipart/form-data`
- File field: `file`
- Body fields:
	- `type` optional (`title|buyers_order|inspection|other`)
	- `orderId` optional
	- `vehicleId` optional
	- `sensitiveFlag` optional string (`"true"` interpreted as sensitive)
- Response `201`: created document.

#### GET `/documents`

- Query params:
	- `orderId`, `uploadedBy`, `type`, pagination params
	- admin only optional scope: `dealershipId`
- Notes:
	- listing excludes quarantined docs
	- for non-admin/non-finance, sensitive docs are excluded from general listing
- Response: paginated document list.

#### GET `/documents/:id`

- Params: `id` ObjectId
- Permission: `read`
- Response: document metadata.

#### GET `/documents/:id/download`

- Params: `id` ObjectId
- Permission: `download`
- Response: binary file stream with content headers.

#### DELETE `/documents/:id`

- Params: `id` ObjectId
- Permission: `delete`
- Response:

```json
{ "msg": "Document deleted" }
```

#### PATCH `/documents/:id`

- Params: `id` ObjectId
- Permission: `write`
- Body (controller-level accepted fields):

```json
{
	"type": "optional",
	"orderId": "optional",
	"vehicleId": "optional",
	"sensitiveFlag": true
}
```

- Response: updated document.

#### POST `/documents/:id/share`

- Params: `id` ObjectId
- Permission: `share`
- Body (validated):

```json
{
	"targetUserId": "optional-in-schema-but-required-by-controller-logic",
	"actions": ["read", "download"],
	"comment": "optional"
}
```

- Notes:
	- target user must belong to same dealership unless target is admin
	- non-admin sharers can delegate only safe actions (`read`, `download`)
- Response: updated document.

#### POST `/documents/:id/submit`

- Params: `id` ObjectId
- Permission: `submit`
- Response: document with status transitioned to submitted.

#### POST `/documents/:id/approve`

- Params: `id` ObjectId
- Permission: `approve`
- Response: document with status transitioned to approved.

### Finance

All finance routes:

- Auth: required
- HMAC: required
- Dealership scope: enforced

#### GET `/finance/invoices/:orderId/preview`

- Params: `orderId` ObjectId
- Response:

```json
{
	"orderId": "...",
	"orderNumber": "...",
	"lineItems": [
		{
			"description": "...",
			"quantity": 1,
			"unitPrice": 100,
			"taxRate": 0.05,
			"taxAmount": 5,
			"total": 105
		}
	],
	"subtotal": 100,
	"taxBreakdown": [
		{ "jurisdiction": "County, ST", "rate": 0.05, "amount": 5 }
	],
	"total": 105,
	"isPreview": true
}
```

#### POST `/finance/invoices/:orderId`

- Params: `orderId` ObjectId
- Behavior: creates or returns existing non-preview invoice.
- Response `201`: invoice.

#### GET `/finance/invoices/detail/:id`

- Params: `id` ObjectId
- Response: invoice by ID.

#### POST `/finance/payments`

- Body (validated):

```json
{
	"orderId": "ObjectId",
	"invoiceId": "ObjectId",
	"method": "cash|cashier_check|in_house_financing|credit_card|bank_transfer",
	"amount": 1000,
	"idempotencyKey": "required",
	"metadata": {}
}
```

- Runtime rules:
	- payment method resolved through adapter (online methods blocked unless feature flag enabled)
	- validates order/invoice/dealership relationship
	- amount must equal invoice total
	- writes payment + ledger + invoice status in a DB transaction
- Response `201`: payment record.

#### GET `/finance/payments/:orderId`

- Params: `orderId` ObjectId
- Response: payments for order.

#### GET `/finance/wallet/balance`

- Response:

```json
{ "accountId": "...", "balance": 0, "currency": "USD" }
```

#### GET `/finance/wallet/history`

- Query params:
	- `limit` optional (default 50)
- Response:

```json
{ "accountId": "...", "transactions": [] }
```

#### POST `/finance/reconciliation`

- Roles: `admin`
- Response:

```json
{ "results": [] }
```

#### GET `/finance/discrepancies`

- Roles: `admin`, `finance_reviewer`
- Query params:
	- `status`, `type`, `assignedTo`, `dealershipId` (admin only), pagination params
- Response: paginated discrepancy tickets.

#### GET `/finance/discrepancies/:id`

- Roles: `admin`, `finance_reviewer`
- Params: `id` ObjectId
- Response: discrepancy ticket.

#### PATCH `/finance/discrepancies/:id`

- Roles: `admin`, `finance_reviewer`
- Params: `id` ObjectId
- Body (controller-level accepted fields):

```json
{
	"status": "optional",
	"assignedTo": "optional-or-null",
	"resolution": "optional"
}
```

- Response: updated discrepancy ticket.

### Admin

All admin routes:

- Auth: required
- HMAC: required

#### Synonyms

- GET `/admin/synonyms` (admin)
- POST `/admin/synonyms` (admin) body:

```json
{ "canonical": "chevrolet", "aliases": ["chevy"], "field": "make" }
```

- PUT `/admin/synonyms/:id` (admin) body is partial create schema
- DELETE `/admin/synonyms/:id` (admin)

#### Tax Rates

- GET `/admin/tax-rates` (admin)
- POST `/admin/tax-rates` (admin) body:

```json
{
	"state": "CA",
	"county": "Orange",
	"rate": 0.0825,
	"effectiveDate": "2026-01-01T00:00:00.000Z",
	"expiresAt": null
}
```

- PUT `/admin/tax-rates/:id` (admin) partial
- DELETE `/admin/tax-rates/:id` (admin)

#### Users

- GET `/admin/users` (admin)
	- query: `dealershipId`, `role`
- PATCH `/admin/users/:id/role` (admin) body:

```json
{
	"role": "buyer|dealership_staff|finance_reviewer|admin",
	"dealershipId": "optional-or-null"
}
```

#### Dealerships

- GET `/admin/dealerships` (admin)
- POST `/admin/dealerships` (admin) body:

```json
{
	"name": "...",
	"region": "...",
	"address": {
		"street": "...",
		"city": "...",
		"state": "...",
		"county": "optional",
		"zip": "..."
	},
	"enabledPaymentMethods": ["cash"]
}
```

#### Experiments

- GET `/admin/experiments` (admin)
- GET `/admin/experiments/:id` (admin)
- POST `/admin/experiments` (admin) body:

```json
{
	"name": "...",
	"description": "optional",
	"feature": "...",
	"variants": [
		{ "key": "control", "weight": 0.5, "config": {} },
		{ "key": "treatment", "weight": 0.5, "config": {} }
	],
	"startDate": "optional",
	"endDate": "optional"
}
```

- PATCH `/admin/experiments/:id` (admin) body:

```json
{ "action": "activate|rollback" }
```

#### Filter Presets

- GET `/admin/filter-presets` (any authenticated admin router user)
- POST `/admin/filter-presets` body:

```json
{ "name": "my filter", "filters": {} }
```

- DELETE `/admin/filter-presets/:id`

#### Permission Overrides

- GET `/admin/permission-overrides` (admin)
	- query: `dealershipId`, `resource`, `userId`, `role`, pagination params
- GET `/admin/permission-overrides/:id` (admin)
- POST `/admin/permission-overrides` (admin) body:

```json
{
	"dealershipId": "ObjectId",
	"resource": "document",
	"resourceId": "optional-or-null",
	"role": "optional-or-null",
	"userId": "optional-or-null",
	"actions": ["read"],
	"effect": "allow|deny",
	"reason": "optional",
	"expiresAt": null
}
```

- PATCH `/admin/permission-overrides/:id` (admin) partial
- DELETE `/admin/permission-overrides/:id` (admin)

#### Encryption

- POST `/admin/encryption/rotate` (admin)
- Response:

```json
{ "msg": "Encryption key rotated", "keyId": "..." }
```

### Privacy

All privacy routes:

- Auth: required
- HMAC: required

#### GET `/privacy/consents`

- Response: consent history for authenticated user.

#### POST `/privacy/consents`

- Body:

```json
{ "consentType": "...", "granted": true, "version": "v1" }
```

- Response `201`: created consent record.

#### POST `/privacy/export`

- Response: user data export object (profile, orders, documents, payments, consents, audit logs as provided by service).

#### POST `/privacy/delete-account`

- Response:

```json
{
	"status": "deletion_requested",
	"retentionUntil": "date",
	"financialRecordsRetainedUntil": "date"
}
```

- Current policy in implementation: 30-day account purge window and 30-day financial retention window.

### Audit

All audit routes:

- Auth: required
- HMAC: required
- Roles: `admin`, `finance_reviewer`
- Dealership scope enforced for non-admin.

#### GET `/audit`

- Query params:
	- `dealershipId` (admin only effective)
	- `userId`
	- `resourceType`
	- `resourceId`
	- `action`
	- pagination params
- Response: paginated audit logs.

## Validation and Parameter Notes

- Path ObjectId validators are enforced where specified in routes.
- Body validation is enforced via Zod middleware where attached in routes.
- A few controller-accepted fields currently rely on controller/service handling rather than dedicated schema (for example some PATCH operations); route-level behavior above reflects current runtime implementation.

## Middleware Execution Summary

- Request pipeline baseline:
	- `helmet`
	- `cors`
	- request id injection
	- JSON and URL-encoded parsing
	- rate limiting
	- field masking wrapper
	- `/api/v1` routes
	- centralized error handler

## Notes on Consistency with Runtime

- This file documents implemented behavior, not aspirational behavior.
- If route/controller/schema changes occur, this document should be updated from those files as the authoritative source.
