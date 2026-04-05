# Questions

## 1. Local Network Connectivity and Service Discovery
**Question:** The prompt specifies that the Express backend provides REST-style APIs to the React client over the local network but does not define how the client discovers or connects to the backend server in a dynamic dealership environment.
**Assumption:** The backend server uses a static local IP address or a consistent local hostname.
**Solution:** Configured the React application with a base API URL defined via a local environment variable that defaults to the expected local network address.

## 2. User Authentication and Multi-Dealership Support
**Question:** The prompt describes role-based permissions, dealership inheritance, and distinct user types (buyers, dealership staff, finance reviewers, admins) but does not specify how users authenticate or how multiple dealerships are managed within a single deployment.
**Assumption:** The system uses locally managed accounts with dealership-scoped data isolation.
**Solution:** Implemented local authentication with role assignment (buyer, dealership staff, finance reviewer, admin) and dealership-scoped data partitioning for permission inheritance.

## 3. Document Permission Inheritance, Overrides, and Sensitive Deal Criteria
**Question:** The prompt states that document permissions inherit by dealership with explicit overrides for sensitive deals but does not define the exact inheritance rules, conflict resolution, or what constitutes a sensitive deal.
**Assumption:** Permissions are inherited from the dealership level, with overrides taking precedence; a sensitive deal is any record explicitly flagged by an authorized manager.
**Solution:** Implemented a hierarchical permission resolver that checks dealership-level roles first, then applies any explicit document-level overrides or sensitive-deal ACLs.

## 4. Order Splitting and Merging Logic
**Question:** The prompt states that orders may split or merge based on supplier, warehouse location, or promised turnaround but does not define the precise business rules for when splitting or merging occurs.
**Assumption:** Orders split automatically when line items differ in supplier, warehouse, or delivery timeline; compatible items with identical parameters are merged.
**Solution:** Implemented automated cart-to-order logic that evaluates supplier, warehouse, and turnaround attributes to split or merge line items during checkout.


## 5. Sales Tax Rate Configuration and Maintenance
**Question:** The prompt requires invoice previews with sales tax rates by state/county configured offline but does not specify how tax rates are stored, updated, or kept current.
**Assumption:** Tax rates are maintained in an offline-editable configuration store by administrators.
**Solution:** Created a local tax configuration table (state/county) in MongoDB that admins can manage directly, used for all invoice preview and order calculations.

## 6 Internal Wallet Ledger Funding
**Question:** The prompt specifies fully offline payments and settlement using an internal wallet ledger but does not define how funds are deposited or credited to the ledger.
**Assumption:** Deposits are manually recorded by dealership staff after verifying physical offline payments.
**Solution:** Created a dedicated “Ledger Entry” role that allows authorized staff to record credits with double-entry accounting for reconciliation.

## 7. Nightly Reconciliation Scope and Timing
**Question:** The prompt requires nightly reconciliation to match orders, invoices, and settlements but does not define the processing window or handling of orders created during the reconciliation period.
**Assumption:** Reconciliation processes only orders that reached a terminal state before midnight of the previous day.
**Solution:** Implemented a scheduled reconciliation job with a strict date-cutoff filter to ensure consistent ledger matching without including in-flight transactions.

## 8. Search Performance, Caching, and Invalidation
**Question:** The prompt requires cached query results with a 10-minute TTL, an hourly-updated trending-keyword table, and pagination that returns consistent results per sort key but does not specify cache invalidation rules when inventory changes.
**Assumption:** Cache remains strictly time-based for performance; real-time verification occurs only on critical actions.
**Solution:** Implemented query caching with the specified TTL, hourly trending updates, sort-key-stable pagination, and a live status check on the vehicle detail page before allowing “Add to Cart”.

## 9. Synonym Expansion Maintenance
**Question:** The prompt includes synonym expansion maintained by admins for fuzzy matching but does not specify whether mappings are bi-directional or how they are stored and applied.
**Assumption:** Synonyms are bi-directional to maximize search recall and are stored in a configurable dictionary.
**Solution:** Implemented a many-to-many synonym mapping table in MongoDB that admins maintain, expanding search tokens before querying the primary index.

## 10. Sensitive Field Masking
**Question:** The prompt requires masking sensitive fields on screen but does not specify whether masking occurs at the API level or UI level.
**Assumption:** Masking is performed at the API level based on user role to prevent sensitive data from reaching the client unless authorized.
**Solution:** Added middleware in the Express backend that automatically scrubs sensitive fields unless the requesting user holds the required finance-approver role.

## 11. AES-256 Encryption Key Rotation
**Question:** The prompt requires encryption of sensitive values at rest using AES-256 with rotated keys but does not define the rotation frequency or handling of legacy encrypted data.
**Assumption:** Keys are rotated annually, and records are re-encrypted on the next write operation.
**Solution:** Implemented a multi-generational key store where each encrypted record includes a `keyVersion`; the system automatically decrypts with the correct key and upgrades to the current key during edits.

## 12. HMAC Anti-Replay Protection and Clock Drift
**Question:** The prompt requires signing API requests with HMAC plus 5-minute anti-replay timestamps but does not specify how clock drift between client and server is handled.
**Assumption:** All devices on the local network are synchronized to the server clock.
**Solution:** The backend rejects requests where the timestamp differs from server time by more than 300 seconds, returning a specific error that prompts client clock re-synchronization.

## 13. Uploaded File Quarantine Workflow
**Question:** The prompt requires validation of uploaded files with hashing and quarantine-on-mismatch but does not define the recovery or deletion process for quarantined files.
**Assumption:** Quarantined files are isolated and require manual administrative action.
**Solution:** Implemented a dedicated “Quarantine” collection in MongoDB that stores failed uploads; these files are inaccessible via the standard document viewer and trigger an admin alert.

## 14. User Data Export and Account Deletion
**Question:** The prompt allows users to export their data and request account deletion with a 30-day retention hold for financial records but does not specify the export format or exact deletion behavior for non-financial data.
**Assumption:** Export is provided as JSON; personal data is removed immediately while financial and audit records are retained for the required period.
**Solution:** Implemented JSON export functionality and a two-stage deletion process: immediate removal of PII with a `pending_purge` flag, followed by scheduled purge of transaction records after 30 days.