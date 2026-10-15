# Internal authorization

The prerequisite uses Clerk for authentication, existing `app_users` for application identity, and private `internal_user_roles` for server authority. `requireAdminOrSupport()` takes no identity/role input and returns a minimal verified internal actor. Call it independently before every future internal page read, API/action and reconciliation operation. Keep it server-only, uncached and outside client DTOs. Missing row or `user` denies access; invalid/failed role lookup denies access with a safe unavailable error. Existing Clerk unauthenticated/framework control flow propagates. Future HTTP boundaries map `SUPPORT_ACCESS_DENIED` to403 (or page not-found) and `SUPPORT_AUTHORIZATION_UNAVAILABLE` to a safe503; never expose diagnostics.

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

Use `'support'` instead of `'admin'` for a support operator. To revoke either, repeat the trusted operation with `'user'`. Every subsequent helper invocation re-reads storage, including within the same request; revocation does not retroactively cancel work already authorized/in flight. Role changes do not edit payouts, creator balances or AI credits. No role-management dashboard or server role setter is provided.

## Verification

`npm run test:authorization` passes48 checks against actual identity/role migration SQL in disposable PostgreSQL and the real helper/profile-sync code with explicit Clerk/request fixtures. This includes support/admin allow, ordinary/anonymous denial, role deletion/revocation on the next call, identity mismatch, malformed/outage fail-closed behavior, profile-sync preservation, browser/service write denial, FK/uniqueness/role constraints and timestamp maintenance.

`npm run acceptance:authorization` passes18 hosted checks: expected columns, existing admin and real Clerk mapping, actual helper against hosted admin/ordinary role sources (request identity is a fixture), browser read/write denial, service insert/upsert/update/delete denial, and unchanged assignments/timestamps. Denied mutations target fresh nonexistent UUIDs; no real role is assigned/revoked or payout touched.

`npm run acceptance:authorization:http` passes11 local Next.js HTTP checks using hosted Supabase and real temporary Clerk development sessions for the assigned admin and an ordinary reserved test account. Admin GET/POST permits; anonymous, ordinary, forged token and forged role/identity POST deny. Prior admin requests never grant the next ordinary request access. Responses are private/no-store; `/admin/payouts` and `/api/admin/payouts` remain404. A temporary local status-only Route Handler calls the real guard, returns no identity/payout data, and is removed after testing. Only newly created test sessions are revoked. The script reuses the checkout's existing localhost:3000 development server when its lock exists; otherwise it owns a temporary server and stops that process only.

No support routes/actions, provider calls or audit table ship in this prerequisite. Deployed application authorization and actual hosted role revocation are not claimed; revocation/support-role/outage scenarios are isolated SQL/module acceptance. Full independent hosted catalog/DDL auditing remains separate. The existing creator `failureCode` cleanup remains next-unit work.
