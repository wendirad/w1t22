# Design

## 1. System Overview

MotorLot DealerOps is a complete offline purchase-to-settlement system for dealerships and local auto marketplaces. It provides fast vehicle discovery, compliant data handling, and a full workflow from browsing to settlement.

Primary roles:

* Buyer / Shopper
* Dealership Staff
* Finance Reviewer
* Administrator

Core capabilities:

* Multi-criteria vehicle inventory search with fuzzy matching and synonym expansion
* Shopping cart with add-on services and intelligent order splitting/merging
* Role-based document upload, permission management, and approval workflow
* Offline checkout with internal wallet ledger and state-machine order processing
* Invoice preview with offline-configured sales tax
* Admin A/B testing, nightly reconciliation, and privacy controls
* Full local-network operation via Express REST APIs and MongoDB persistence

The system is designed to run entirely offline on a local network while maintaining a clean path for future online deployment via a disabled pluggable adapter.

---

## 2. Design Goals

* Complete offline purchase-to-settlement workflow with zero external dependencies
* High-performance local-network search and browsing experience
* Strict compliance with role-based permissions, data privacy, and audit requirements
* Consistent order state machine with idempotent actions and automatic rollback
* Modular, testable architecture that separates UI, business logic, and persistence
* Clear separation between buyer-facing React interface and dealership backend operations
* Future-proof design that keeps the pluggable online adapter disabled by default

---

## 3. High-Level Architecture

The system follows a client-server architecture optimized for local-network deployment:

```text
React Web Interface (Buyer UI)
        ↓ (REST APIs over local network)
Express Backend (API Layer + Business Logic)
        ↓
MongoDB (Persistent Storage)
```

Supporting runtime components:

* Order State Machine
* Permission Resolution Service
* Search Cache & Trending Service
* Document Management Service
* Reconciliation Scheduler
* Privacy & Encryption Service

### Architecture Principles

* MongoDB is the single source of truth.
* All business rules and state transitions reside in the Express backend.
* The React frontend is presentation-only and never contains business logic.
* Every write operation is traceable via audit logs.
* Offline payments and settlement use an internal wallet ledger.

---

## 4. Backend Architecture

### 4.1 Framework

* Express.js with REST-style endpoints
* TypeScript for type safety
* MongoDB as the primary database

### 4.2 Major Backend Modules

* **InventoryService** – vehicle listing, search, caching, trending keywords
* **OrderService** – cart processing, splitting/merging, state machine, idempotent actions
* **PaymentService** – internal wallet ledger, offline settlement (cash/check/in-house financing)
* **DocumentService** – upload, permission enforcement, inheritance & overrides
* **FinanceService** – invoice generation with offline tax rates
* **AdminService** – A/B testing, synonym management, reconciliation, tax configuration
* **AuthService** – local authentication and role assignment
* **PrivacyService** – data masking, AES-256 encryption, HMAC signing, file validation/quarantine
* **ReconciliationService** – nightly ledger matching and discrepancy ticket creation

### 4.3 API Design

* RESTful endpoints under `/api/v1/`
* All requests signed with HMAC + 5-minute timestamp for anti-replay protection
* Role-based authorization enforced at middleware level
* Consistent error responses and audit logging on every mutation

---

## 5. Frontend Architecture

### 5.1 Framework

* React single-page application
* TypeScript
* Responsive design for desktop and tablet use in dealership environments

### 5.2 Route Areas

* `/inventory` – search, filters, trending, pagination
* `/cart` – vehicle and add-on management
* `/checkout` – order review and payment selection
* `/documents` – upload and approval workflow (staff view)
* `/invoices` – finance reviewer dashboard
* `/admin` – A/B tests, synonyms, tax config, reconciliation

### 5.3 UI Composition

* Role-aware navigation
* Reusable domain components (VehicleCard, FilterPanel, DocumentUploader, OrderStepper)
* Real-time feedback for search results and validation messages
* Saved filter presets and cart persistence

### 5.4 Major UI Components

* Advanced search bar with fuzzy matching and trending highlights
* Dynamic filter panel with multi-criteria controls
* Cart and checkout stepper with split/merge visualization
* Document upload interface with permission-aware controls
* Invoice preview with tax breakdown
* Admin A/B test management panel

---

## 6. Application Services Layer (Backend)

All core business logic is implemented in dedicated Express services.

### 6.1 InventoryService

Responsibilities:
* Multi-criteria search with fuzzy matching and synonym expansion
* Query caching (10-minute TTL)
* Hourly trending-keyword table maintenance
* Consistent pagination by sort key

### 6.2 OrderService

Responsibilities:
* Cart-to-order conversion with automatic split/merge logic
* Order state machine (Created → Reserved → Invoiced → Settled → Fulfilled → Cancelled)
* Idempotent actions and 5-second rollback on payment or reservation failure
* Inventory reservation and release

### 6.3 PaymentService

Responsibilities:
* Internal wallet ledger management
* Support for fully offline payment methods
* Settlement processing with double-entry records

### 6.4 DocumentService

Responsibilities:
* Document upload with type/size/hash validation
* Role-based permission resolution (dealership inheritance + explicit overrides)
* Sensitive-deal ACL handling

### 6.5 ReconciliationService

Responsibilities:
* Nightly matching of orders, invoices, and settlements
* Automatic creation of discrepancy tickets for manual review

---

## 7. Data Persistence Design

### 7.1 Primary Storage

MongoDB is the primary persistent store for all domain data.

### 7.2 Key Collections

* `listings` – vehicle inventory
* `orders` – cart and order records
* `orderEvents` – state transition audit trail
* `documents` – uploaded titles, buyer orders, inspection PDFs
* `permissions` – role and ACL definitions
* `walletLedger` – internal payment entries
* `taxRates` – offline state/county tax configuration
* `synonyms` – admin-maintained search synonym dictionary
* `abTests` – listing and checkout variant configurations
* `consentRecords` – privacy consent history
* `auditLogs` – immutable action trail
* `reconciliationLedgers` – nightly matching results
* `quarantine` – failed file uploads

### 7.3 Schema Versioning

MongoDB collections include explicit schema validation and version fields. Migrations are managed through controlled upgrade scripts.

---

## 8. Domain Model Overview

### 8.1 VehicleListing

Fields:
* id, make, model, price, mileage, region, registrationDate
* status, supplier, warehouse, turnaroundTime

### 8.2 Order

Fields:
* id, buyerId, status, items[], splitReason, mergedFrom[]
* state machine fields (Created, Reserved, Invoiced, Settled, Fulfilled, Cancelled)

### 8.3 Document

Fields:
* id, orderId, type, fileHash, uploadedBy, permissions, isSensitive

### 8.4 WalletEntry

Fields:
* id, orderId, amount, method, type (credit/debit), recordedBy

### 8.5 TaxRate

Fields:
* state, county, rate, effectiveFrom, effectiveTo

### 8.6 User

Fields:
* id, username, role, dealershipId, permissions

Statuses and roles are strictly enforced by the backend.

---

## 9. Authentication and Security Design

### 9.1 Authentication Model

* Local network authentication with predefined or admin-managed accounts
* Role assignment tied to dealership context
* No public self-registration

### 9.2 Permission Model

* Dealership-level role inheritance
* Explicit per-document and per-sensitive-deal overrides
* Hierarchical resolution (dealership → document → sensitive flag)

### 9.3 Data Protection

* On-screen masking of sensitive fields at API level
* AES-256 encryption at rest with annual key rotation and automatic re-encryption
* HMAC-signed requests with 5-minute anti-replay timestamps
* Strict file validation (PDF/JPG/PNG ≤ 10 MB) + SHA-256 hashing with quarantine on mismatch

### 9.4 Privacy Controls

* Immutable consent records
* User data export as JSON
* Account deletion with 30-day financial retention hold

---

## 10. Offline Operation and Reconciliation

* All payment and settlement logic uses the internal wallet ledger
* Pluggable online adapter interface exists but remains disabled
* Nightly reconciliation job processes only terminal-state orders with date-cutoff filtering
* Discrepancy tickets are created automatically for manual review

This design ensures the MotorLot DealerOps system is production-ready for local dealership deployment while preserving every requirement specified in the original prompt.
