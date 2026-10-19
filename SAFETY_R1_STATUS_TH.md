# OH Store Hub — Safety R1 Status (2026-10-19)

## Scope
Branch: work/incoming-safety-r1 (main untouched)
Source: index.html. Front-end only; no live Firebase data was modified by this work.

## Implemented
- Reject incoming receipt reads that fail instead of treating receipts as empty.
- Mark cached incoming documents stale; disable and guard receive/clear while stale.
- Recover selected day loading after switching day mid-request.
- Reserve an incoming document via Firebase REST ETag / if-match before stock receipt; reject concurrent or processing documents.
- Keep ambiguous processing reservations for manual reconciliation rather than unsafe automatic retry.
- Fail closed when latest central inventory cannot be read before Store -> Sheets export.
- Fail closed when latest per-product stock cannot be read before a transaction.
- Check HTTP response status for inventory PATCH writes.

## Known blocking gaps — NOT PRODUCTION READY
1. Inventory write and incoming receipt completion are still separate requests. Reservation reduces duplicate execution, but partial failure requires operator reconciliation.
2. Store inventory PATCH writes are not conditional compare-and-swap. Concurrent writes to same product can overwrite each other.
3. Multi-line transactions may partially write if one line fails; audit, expiry lot updates and undo are not atomic.
4. Receipts status='processing' after an uncertain failure requires a safe administrator recovery procedure. Do NOT manually delete without comparing transactions and inventory.
5. Firebase REST ETag/if-match must be tested against deployed Security Rules, CORS and actual database; unverified.
6. Apps Script code and deployment responses are not verified; 'Failed to fetch' root cause remains unconfirmed.
7. Browser QA, multiple-device concurrency tests, and regression tests have NOT been run.
8. Remaining modules (schedule, usage, expiry, memos, integration with OH STOCK) have not received end-to-end QA.

## Required next implementation
- Server-side idempotent receipt processing using a stable receipt-operation ID, transaction ledger and atomic inventory deltas or a transactional backend.
- Product-level concurrency protection, preferably Firebase SDK runTransaction with authorization rules and stable IDs.
- Recoverable workflow for processing receipts, with operator review of ledger.
- Backend access and staging database for real tests; verify no data loss before merge.

## Manual test cases
- Device A/B receive same document concurrently: exactly one reservation succeeds.
- Firebase receipt GET fails: actions remain disabled.
- Sheets succeeds but receipt status read fails: do not mark unreceived.
- Switching today/tomorrow during fetch: requested day eventually loads.
- Firebase inventory read fails before export: Sheets POST not sent.
- Firebase product read fails before transaction: transaction not executed.
- Simulate crash after stock write but before receipt finalization: processing lock remains; reconcile manually.
- Verify Security Rules allow expected ETag operations in staging, and reject unauthorized writes.

Status: PARTIAL FIX, BLOCKED for production promotion pending backend + QA.
