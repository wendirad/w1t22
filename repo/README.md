# MotorLot DealerOps

A full-stack offline-first dealership management system for vehicle discovery, compliant data handling, and complete purchase-to-settlement workflows.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Tailwind CSS (Vite)
- **Backend**: Express.js + TypeScript
- **Database**: MongoDB 7
- **Cache**: Redis 7
- **Containerization**: Docker Compose

## Quick Start

```bash
docker compose up
```

All secrets and account credentials are configured via the `.env` file in the project root. A default `.env` is provided for development; copy `.env.example` and set your own values for production.

This single command starts all services:

| Service  | URL                           | Description          |
|----------|-------------------------------|----------------------|
| Frontend | http://localhost:3000          | React web app        |
| Backend  | http://localhost:5000/api/v1   | REST API             |
| MongoDB  | localhost:27017               | Database             |
| Redis    | localhost:6379                | Cache                |

## Configuration

All secrets and credentials are externalized to `.env`. See `.env.example` for the full list.

| Variable               | Description                                      |
|------------------------|--------------------------------------------------|
| `JWT_SECRET`           | Secret key for signing access tokens              |
| `JWT_REFRESH_SECRET`   | Secret key for signing refresh tokens             |
| `HMAC_SECRET`          | Shared secret for HMAC request signing            |
| `MASTER_ENCRYPTION_KEY`| 64-hex-char key for AES-256 encryption at rest    |
| `ADMIN_EMAIL`          | Email for the seeded admin account                |
| `ADMIN_PASSWORD`       | Password for the seeded admin account             |
| `STAFF_EMAIL`          | Email for the seeded dealership staff account     |
| `STAFF_PASSWORD`       | Password for the seeded dealership staff account  |
| `FINANCE_EMAIL`        | Email for the seeded finance reviewer account     |
| `FINANCE_PASSWORD`     | Password for the seeded finance reviewer account  |
| `BUYER_EMAIL`          | Email for the seeded buyer account                |
| `BUYER_PASSWORD`       | Password for the seeded buyer account             |

## Verification

1. Open **http://localhost:3000** in your browser
2. Log in with the credentials configured in your `.env` file (default accounts below):

| Role             | Email (default)        | Password (default)         |
|------------------|------------------------|----------------------------|
| Admin            | admin@motorlot.com     | MotorLot@Admin2024!        |
| Dealership Staff | staff@motorlot.com     | MotorLot@Staff2024!        |
| Finance Reviewer | finance@motorlot.com   | MotorLot@Finance2024!      |
| Buyer            | buyer@motorlot.com     | MotorLot@Buyer2024!        |

3. As a **Buyer**: Search vehicles, add to cart, checkout to create orders
4. As **Staff**: Transition orders (Reserve → Invoice → Settle → Fulfill), upload documents
5. As **Finance**: View invoice previews with tax breakdown, process payments
6. As **Admin**: Manage synonyms, tax rates, A/B tests, users

## Running Tests

```bash
./run_tests.sh
```

This executes:
- **Unit tests** (`unit_tests/`): State machine transitions, permission resolver, encryption round-trips, synonym expansion, tax calculation, wallet ledger
- **API tests** (`API_tests/`): Auth flows, vehicle CRUD, search, cart, order lifecycle, finance, privacy, permission enforcement

The script prints a clear PASS/FAIL summary at the end.

## Features

### Vehicle Discovery
- Multi-criteria filtering (make, model, price range, mileage, region, registration date)
- Fuzzy matching with synonym expansion (e.g., "Chevy" matches "Chevrolet")
- Admin-maintained synonym dictionary
- Trending searches (updated hourly)
- Cached search results (10-minute TTL)
- Sort-key-stable pagination
- Saved filter presets per user
- "No results" feedback with broadening suggestions

### Cart & Orders
- Shopping cart with add-on services (inspection package, extended warranty)
- Automatic order splitting by supplier, warehouse, and turnaround time
- Order state machine: Created → Reserved → Invoiced → Settled → Fulfilled → Cancelled
- Idempotent transitions with 5-second rollback on failure
- Full event history for each order

### Document Management
- Upload titles, buyer's orders, inspection PDFs (PDF/JPG/PNG, max 10MB)
- Magic-byte MIME validation + SHA-256 integrity hashing
- Quarantine on file type mismatch
- Role-based permissions with dealership inheritance and sensitive deal overrides

### Finance & Settlement
- Invoice previews with state/county tax rates (configured offline by admins)
- Internal wallet ledger with double-entry accounting
- Offline payment methods: cash, cashier's check, in-house financing
- Pluggable payment adapter (disabled by default)
- Nightly reconciliation matching orders, invoices, and settlements

### Privacy & Security
- AES-256-GCM encryption at rest with multi-generational key rotation
- HMAC request signing with 5-minute anti-replay timestamps
- Sensitive field masking by role (e.g., last 4 of driver's license)
- Consent history tracking
- Data export (JSON) and account deletion with 30-day retention hold

### A/B Testing
- Admin-controlled experiments on listing layouts and checkout steps
- Weighted variant assignment
- Rollback controls

### Audit
- Full audit logging of all state changes
- Queryable by dealership, user, resource type, and action

## API Endpoints

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me

GET    /api/v1/vehicles
GET    /api/v1/vehicles/:id
POST   /api/v1/vehicles

GET    /api/v1/search
GET    /api/v1/search/trending

GET    /api/v1/cart
POST   /api/v1/cart/items
DELETE /api/v1/cart/items/:vehicleId

POST   /api/v1/orders
GET    /api/v1/orders
GET    /api/v1/orders/:id
POST   /api/v1/orders/:id/transition

POST   /api/v1/documents/upload
GET    /api/v1/documents
GET    /api/v1/documents/:id/download

GET    /api/v1/finance/invoices/:orderId/preview
POST   /api/v1/finance/invoices/:orderId
POST   /api/v1/finance/payments
GET    /api/v1/finance/wallet/balance

POST   /api/v1/admin/synonyms
GET    /api/v1/admin/tax-rates
GET    /api/v1/admin/experiments

GET    /api/v1/privacy/consents
POST   /api/v1/privacy/export
POST   /api/v1/privacy/delete-account

GET    /api/v1/audit
```

## Project Structure

```
repo/
├── docker-compose.yml      # All services
├── README.md
├── run_tests.sh            # Test runner
├── unit_tests/             # Unit tests
├── API_tests/              # API integration tests
├── server/                 # Express.js backend
│   ├── src/
│   │   ├── config/         # Database, Redis, env config
│   │   ├── middleware/     # Auth, RBAC, HMAC, field masking
│   │   ├── models/         # 17 Mongoose schemas
│   │   ├── routes/         # REST route definitions
│   │   ├── controllers/    # Request handlers
│   │   ├── services/       # Business logic layer
│   │   ├── jobs/           # Scheduled tasks
│   │   ├── lib/            # State machine, crypto, pagination
│   │   └── seeds/          # Seed data
│   └── Dockerfile
└── client/                 # React frontend
    ├── src/
    │   ├── app/            # Router, providers
    │   ├── features/       # Auth, vehicles, cart, documents, finance, admin, privacy
    │   └── shared/         # UI components, hooks, API client
    └── Dockerfile
```
