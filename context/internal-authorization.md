# Internal authorization

## M10 implemented source boundary (2026-10-27)

**M9: Complete. M10: Complete in source for the configured local V1 profile. Runtime/provider/manual acceptance: Pending.** M10 uses existing owned draft-project/job authorization, strict action/version checks, same-origin bounded POST and private service-only RPCs. Browser DTOs omit provider identities, private object keys and intermediate media. Final preview requires the same owner and an exact private object proof. No administrative/customer financial entitlement is added.

[Source, supported limits, setup and manual acceptance](final-video-generation.md#implemented-local-v1-source-and-profile). This entry supersedes implementation-status and task-permission statements in older dated planning below. No real providers, worker process, remote migration, spending or deployment ran.


## Deployed acceptance boundary and operator revocation

The initial deployed prerequisite contained an unused server helper; missing routes returning404 did not verify role decisions. The subsequently deployed `GET /api/internal/authorization` calls the central guard, returns only `{ authorized: true }` for support/admin, safe403 for ordinary/missing roles, and safe503 on lookup failure. Every response is private/no-store. No role/identity information, POST/mutation handler, role setter or payout capability is exposed. Its real admin/ordinary/missing-role, privacy and trusted live revocation/restoration checks now pass.

`npm run acceptance:authorization:deployed` checks the real deployed boundary with temporary real Clerk sessions, creator history/earnings action privacy, browser-loaded static chunks and protected financial/project record hashes. It prints only safe check results and saves private evidence in `%TEMP%/sceenyk-deployed-authorization-acceptance.json`. Missing endpoints/privacy leaks fail the gate; fixture results are not substituted. The harness does not deploy, write roles, submit payouts or change balances. Newly created explicit backend test sessions are revoked in finally. Its existing isolated Chrome helper also signs into a reserved Clerk test account for real action/browser checks.

After deploying this patch, run `npm run acceptance:authorization:deployed -- --wait-for-revocation`. Once it prints that the operator phase is ready, use the trusted SQL Editor to execute the assignment operation below with role `'user'` for the verified existing admin Clerk ID. The harness observes the committed change and checks that the next deployed request is403 using the same Clerk session. Then repeat the trusted assignment with `'admin'` to restore the original role; the next deployed request must return200. Keep the harness running during both operations. It waits up to four minutes per phase and does not restore roles automatically. Do not change a role before the initial real admin/ordinary boundary checks pass.

The application service role is intentionally unable to perform these operations. No database-administrator/management channel is configured in the current workspace; manual trusted SQL is required for live revocation evidence. Existing no-role ordinary accounts are used without assigning them new authority. All prerequisite gates passed before support implementation began.

Current evidence:18 hosted grant/mapping checks and22 real Vercel observations pass. Trusted SQL revocation yielded403 ACCESS_DENIED and restoration yielded200 in the same fresh Clerk session. The initial four-minute operator window expired; fresh real recovery sessions observed denial, then a bounded restoration watcher verified the same-session allow. Fresh proof lives in %TEMP%/sceenyk-deployed-role-revocation.json. The full deployed acceptance harness reran with --use-verified-revocation, which accepts only fresh matching actual evidence; this flag is test-only and grants no product authority. All created sessions were revoked. No role was written by application credentials and no financial/provider mutation occurred.

The prerequisite uses Clerk for authentication, existing `app_users` for application identity, and private `internal_user_roles` for server authority. `requireAdminOrSupport()` takes no identity/role input and returns a minimal verified internal actor. Every internal page read, API/action and reconciliation operation calls it independently. Keep it server-only, uncached and outside client DTOs. Missing row or `user` denies access; invalid/failed role lookup denies access with a safe unavailable error. Existing Clerk unauthenticated/framework control flow propagates. Future HTTP boundaries map `SUPPORT_ACCESS_DENIED` to403 (or page not-found) and `SUPPORT_AUTHORIZATION_UNAVAILABLE` to a safe503; never expose diagnostics.

## Schema and grants

Migration `20261015002500_internal_user_roles.sql` matches the schema SQL the user reports applied. Their separate first-admin assignment is verified through hosted role lookup and real Clerk request acceptance. The schema references existing `app_users(id)` and reuses `set_app_user_updated_at()`. Roles are constrained to `user`, `support`, `admin`. RLS is enabled without browser policies. Only trusted database administration can write; application `service_role` can only SELECT. Ordinary profile sync cannot change an internal role. No new environment configuration is required; existing server-only Clerk/Supabase configuration remains in use.

Do not reapply an already-applied migration. If it was applied manually outside migration tooling, record it as applied in the project's migration history through the established operator workflow rather than executing CREATE TABLE again. Full independent hosted catalog/DDL verification is distinct from REST permission acceptance.

## Trusted assignment and revocation

Sign into Sceenyk to create the account mapping. Independently verify the intended exact Clerk user ID in the trusted Clerk dashboard. Execute the following only in the trusted Supabase SQL Editor, replacing the placeholder. Do not assign by email or accept IDs/roles from a browser request. `INTO STRICT` refuses a missing mapping.

```sql
begin;
do $$
declare target_user uuid;
begin
  select id into strict target_user from public.app_users
  where clerk_user_id = 'REPLACE_WITH_VERIFIED_CLERK_USER_ID';
  insert into public.internal_user_roles (user_id, role)
  values (target_user, 'admin')
  on conflict (user_id) do update set role = excluded.role;
end;
$$;
commit;
```

Use `'support'` instead of `'admin'` for a support operator. To revoke either, repeat the trusted operation with `'user'`. Every subsequent helper invocation re-reads storage, including within the same request; SQL check-finalization also re-reads and locks the role; an actor revoked during provider GET receives403 and cannot commit a money transition. Work already committed before revocation is not undone. Role changes do not edit payouts, creator balances or AI credits. No role-management dashboard or server role setter is provided.

## Verification

`npm run test:authorization` passes48 checks against actual identity/role migration SQL in disposable PostgreSQL and the real helper/profile-sync code with explicit Clerk/request fixtures. This includes support/admin allow, ordinary/anonymous denial, role deletion/revocation on the next call, identity mismatch, malformed/outage fail-closed behavior, profile-sync preservation, browser/service write denial, FK/uniqueness/role constraints and timestamp maintenance.

`npm run acceptance:authorization` passes18 hosted checks: expected columns, existing admin and real Clerk mapping, actual helper against hosted admin/ordinary role sources (request identity is a fixture), browser read/write denial, service insert/upsert/update/delete denial, and unchanged assignments/timestamps. Denied mutations target fresh nonexistent UUIDs; no real role is assigned/revoked or payout touched.

The original local Next HTTP acceptance passed11 checks using hosted roles and temporary real Clerk sessions. Its historical status-only probe was removed; the permanent deployed status endpoint subsequently passed acceptance above. The normal-user payout-route check now verifies denial rather than requiring an absent route.

## Internal support rollout and permissions

The queue/detail/read/action boundary and [migration026](../supabase/migrations/20261015002600_payout_support.sql) are deployed and verified. The original rollout applied026 **before** the matching app because worker/webhook observations depend on its audit RPCs. Do not reapply025 or change roles; the verified account is restored admin. No new environment variable, provider registration or Inngest function is introduced.

Migration026 adds private append-only payout_support_events with no browser access and SELECT-only service grants. Service-only RPCs independently verify support/admin actors for queue/detail/manual begin/finish. Other private helpers have no client/service execute grant. Updates/deletes/truncation are denied by grants and immutable triggers. No search text, recipient, tokens or raw payload are stored. System worker/webhook audit uses explicit source, distinct from human support. A denied support role during finalization records safe denied/role_revoked evidence without a money effect.

Production pages independently authorize each data read; the layout alone is insufficient. The reconciliation POST requires real storage-backed authority, strict withdrawal-ID-only input, bounded body and browser same-origin protection. Denials log constant boundary labels only. API responses are private/no-store; server-rendered detail masks the destination. Only the small check button is a Client Component; roles, SQL projections and internal failure codes remain outside client JS. The expanded built-client secret/marker scan checks these boundaries.

Local SQL/service/API tests pass118 assertions, native independent-connection PostgreSQL122, and UI presentation48. Deployed support acceptance passes34 checks and standalone026 hosted acceptance14; all explicit test sessions are cleaned. The real Sandbox/hosted/deployed acceptance status is recorded in the progress tracker. Native tests prove independent local backend contention; they do not claim independent hosted submitted-payout contention, naturally aged production payouts, real failed/returned provider records or PayPal Live. No resend or financial override exists.

## Optional native PostgreSQL race reproduction

Run npm run test:payout-support:concurrency with the official [portable Windows PostgreSQL17 binaries](https://www.enterprisedb.com/download-postgresql-binaries) extracted as %TEMP%/sceenyk-payout-native-<suffix>/pgsql. The temporary file %TEMP%/sceenyk-payout-native-directory.txt points to that extraction root; the helper rejects other locations. It creates a separate fresh test cluster with a generated password, loopback-only ephemeral port and actual001–026 migrations, then stops it in finally. It never connects to Supabase or reads provider credentials. Fixture provider/auth/clock are explicit. SQL errors retain safe codes; pg_stat_activity proves lock waits in three financial races. The regular test:payout-support remains self-contained PGlite. No app environment variable or deployment is needed for this optional test.
