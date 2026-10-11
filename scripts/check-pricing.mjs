// Isolated authored SQL + actual pricing/actions/admission services. Arbitrary
// test units, fixture auth/dispatch/storage receipts; no hosted writes/purchases.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

const pg = new PGlite(), require = createRequire(import.meta.url), checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const rows = async (sql, args = []) => (await pg.query(sql, args)).rows;
const one = async (sql, args = []) => (await rows(sql, args))[0];
const value = async (sql, args = []) => (await one(sql, args)).value;
let active, signedIn = true, dispatches = 0, loseConfirmation = false;
const env = {}, logs = [], modules = new Map();
class AuthRedirect extends Error {}
let tail = Promise.resolve();
const database = {
  async rpc(name, args) {
    const run = tail.then(async () => {
      await pg.exec("set role service_role");
      try {
        const keys = Object.keys(args);
        const data = await value(`select public.${name}(${keys.map((key, i) => `${key}=>$${i+1}`).join(",")}) as value`, Object.values(args));
        if (loseConfirmation && name === "confirm_generation_quote") { loseConfirmation = false; return { data: null, error: { code: "LOST_RESPONSE" } }; }
        return { data, error: null };
      } catch (error) { return { data: null, error: { code: error.code } }; }
      finally { await pg.exec("reset role"); }
    });
    tail = run.catch(() => {});
    return run;
  },
  from(table) {
    assert.equal(table, "generation_jobs");
    const filters = {};
    return { select() { return this; }, eq(k, v) { filters[k] = v; return this; }, async maybeSingle() {
      assert.equal(filters.owner_user_id, active.owner);
      return { data: await one("select * from generation_jobs where id=$1 and owner_user_id=$2", [filters.id, filters.owner_user_id]), error: null };
    } };
  },
};
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const loadedModule = { exports: {} }; modules.set(file, loadedModule);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, process: { env }, console: { error: (...args) => logs.push(args) }, require(name) {
    if (name === "server-only") return {};
    if (name === "@/lib/auth/ensure-app-user") return { ensureAppUser: async () => { if (!signedIn) throw new AuthRedirect(); return { id: active.owner }; } };
    if (name === "@/lib/db/server") return { createDatabaseClient: () => database };
    if (name === "./dispatch") return { attemptGenerationDispatch: async () => { dispatches++; } };
    if (name === "next/navigation") return { unstable_rethrow(error) { if (error instanceof AuthRedirect) throw error; } };
    if (name.startsWith("@/")) return load(name.slice(2)+".ts");
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name+".ts"));
    return require(name);
  } });
  return loadedModule.exports;
}
const snapshot = { version: 1, category: "cinematic", prompt: "Isolated retail pricing fixture", settings: { duration: "10", aspectRatio: "16:9", visualStyle: "Original", tone: "Storytelling" }, assetIds: [] };
async function fixture() {
  const owner = await value("insert into app_users(clerk_user_id) values($1) returning id as value", [randomUUID()]);
  const project = await value("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Pricing fixture','cinematic','16:9','10','Original','Storytelling') returning id as value", [owner]);
  return { owner, project };
}
const account = (f) => one("select * from generation_accounts where owner_user_id=$1", [f.owner]);
const storedQuote = (id) => one("select * from generation_quotes where id=$1", [id]);
const reservation = (id) => one("select * from generation_reservations where job_id=$1", [id]);
const workload = (duration, category="cinematic") => ({ category, duration, operation: category === "transformation" ? "transformation" : "new_generation", modelTier: "unassigned", quality: "workspace-default", features: [] });
const config = { version: "isolated-fixture", rules: [{ workload: workload("10"), credits: 7 }, { workload: workload("15"), credits: 11 }, { workload: workload("30", "transformation"), credits: 23 }] };
async function denied(name, sql, args=[], role="service_role") {
  await pg.exec("set role " + role);
  let error;
  try { await pg.query(sql,args); } catch (e) { error=e; } finally { await pg.exec("reset role"); }
  check(name, !!error);
}
async function complete(id) {
  assert.equal(await value("select claim_generation_job($1,'fixture-run') as value", [id]), "claimed");
  await pg.query("update generation_jobs set current_stage='rendering' where id=$1", [id]);
  const j = await one("select * from generation_jobs where id=$1", [id]);
  return value("select complete_generation_with_result($1,'fixture-run',$2,'video/mp4',100,'fixture-etag') as value", [id, `users/${j.owner_user_id}/generations/${id}/result.mp4`]);
}
try {
  await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  const migrations = fs.readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort();
  for (const file of migrations.slice(0,6)) await pg.exec(fs.readFileSync("supabase/migrations/"+file,"utf8"));
  const previous = await fixture();
  const oldJob = await value("select admit_generation($1,$2,$3,$4,null) as value", [previous.owner,previous.project,randomUUID(),snapshot]);
  await pg.exec(fs.readFileSync("supabase/migrations/"+migrations[6],"utf8"));
  check("007 preserves an active 006 job and original reservation", (await reservation(oldJob.job_id)).state === "reserved");
  check("006 in-flight job still consumes after migration without invented pricing history", await complete(oldJob.job_id) && await value("select count(*)::int as value from generation_pricing_records where job_id=$1",[oldJob.job_id])===0);
  const pricing = load("lib/pricing/config.ts"), actions = load("app/actions/pricing.ts"), generation = load("app/actions/generation.ts");
  const a = await fixture(), b = await fixture(); active=a;
  const quote = async (input=snapshot, extra={}) => actions.quoteGenerationAction({ projectId: active.project, requestId: randomUUID(), inputs: { prompt: input.prompt, category: input.category, settings: input.settings, assetIds: input.assetIds }, ...extra });
  const confirm = (q, extra={}) => generation.createGenerationAction({ quoteId: q.id, ...extra });
  let result = await quote(); assert.ok(result.ok); const free = result.value;
  check("new user receives authoritative free 10-second quote", free.eligibleFreeGeneration && free.requiredCredits===0 && free.freeGenerationsRemaining===2 && free.status==="ready");
  check("quote alone never reserves or dispatches", (await account(a)).free_reserved===0 && dispatches===0);
  check("quote DTO omits owner, raw snapshot, provider data and rules", !["owner_user_id","input_snapshot","rules","providerCost"].some(k=>k in free));
  for (const extra of [{requiredCredits:0},{creditCost:0},{free:true},{eligibleFreeGeneration:true},{pricingVersion:"fake"},{pricingTier:"cheap"},{owner_user_id:b.owner}]) {
    const q = await quote(snapshot,extra), c = await confirm(free,extra);
    check("browser pricing claim rejected at quote and confirmation: "+Object.keys(extra)[0], !q.ok && q.code==="INVALID_INPUT" && !c.ok && c.code==="INVALID_INPUT");
  }
  const first = await confirm(free); assert.ok(first.ok);
  check("confirmed free quote reserves exactly one entitlement", (await reservation(first.value.id)).kind==="free" && (await account(a)).free_reserved===1);
  check("quote provenance joins exact job/reservation", await value("select count(*)::int as value from generation_pricing_records where job_id=$1 and quote_id=$2 and owner_user_id=$3",[first.value.id,free.id,a.owner])===1);
  check("free confirmation duplicate returns same job without another hold", (await confirm(free)).value.id===first.value.id && (await account(a)).free_reserved===1);
  await complete(first.value.id);
  const last = (await quote()).value;
  check("free quote shows actual last lifetime allowance", last.freeGenerationsRemaining===1);
  const lastJob = await confirm(last); await complete(lastJob.value.id);
  result=await quote();
  check("free eligibility disappears after two usable results", result.ok && !result.value.eligibleFreeGeneration && result.value.requiredCredits===null && result.value.status==="pricing_unavailable");
  env.SCEENYK_TEST_PRICING_JSON=JSON.stringify(config);
  const paid = (await quote()).value;
  check("configured paid quote returns authoritative test units", paid.requiredCredits===7 && paid.pricingMode==="test" && !paid.eligibleFreeGeneration && paid.status==="insufficient_credits");
  const beforeDispatch=dispatches;
  check("insufficient balance blocks job and dispatch", (await confirm(paid)).code==="INSUFFICIENT_CREDITS" && dispatches===beforeDispatch && (await account(a)).credit_reserved===0);
  // Administrator-only isolated starting balance, not a purchase/grant API.
  await pg.query("update generation_accounts set credit_available=100 where owner_user_id=$1",[a.owner]);
  const affordable=(await quote()).value;
  check("funded paid quote reports exact available balance", affordable.availableCredits===100 && affordable.status==="ready");
  const paidJob=await confirm(affordable);assert.ok(paidJob.ok);
  check("reservation uses quoted server cost", (await reservation(paidJob.value.id)).amount===7 && (await account(a)).credit_available===93 && (await account(a)).credit_reserved===7);
  const duplicates=await Promise.all([confirm(affordable),confirm(affordable)]);
  check("duplicate paid confirmation never reserves twice", duplicates.every(r=>r.ok&&r.value.id===paidJob.value.id) && (await account(a)).credit_reserved===7);
  await value("select claim_generation_job($1,'fixture-failure') as value",[paidJob.value.id]);
  const failed=await value("select fail_generation_claim($1,'fixture-failure') as value",[paidJob.value.id]);
  check("provider/infrastructure failure restores exact paid cost once", failed && !(await value("select fail_generation_claim($1,'fixture-failure') as value",[paidJob.value.id])) && (await account(a)).credit_available===100 && (await account(a)).credit_reserved===0 && await value("select count(*)::int as value from credit_ledger where job_id=$1 and type='release'",[paidJob.value.id])===1);
  const fifteen={...snapshot,settings:{...snapshot.settings,duration:"15"}};
  check("duration-specific configured rate resolves centrally", (await quote(fifteen)).value.requiredCredits===11);
  const transform={...snapshot,category:"transformation",settings:{...snapshot.settings,duration:"30"}};
  check("transformation/type-specific rate resolves centrally", (await quote(transform)).value.requiredCredits===23);
  const unknown={...snapshot,settings:{...snapshot.settings,duration:"30"}};
  check("unconfigured workload fails closed without invented multiplier", (await quote(unknown)).value.requiredCredits===null);
  const stale=(await quote()).value, oldVersion=stale.pricingVersion;
  config.rules[0].credits=19;env.SCEENYK_TEST_PRICING_JSON=JSON.stringify(config);
  check("changing rate with reused human label changes content version", pricing.getPricingConfiguration().version!==oldVersion);
  check("unconfirmed old rate requires fresh review", (await confirm(stale)).code==="QUOTE_STALE" && (await account(a)).credit_available===100);
  const history=await storedQuote(affordable.id);
  check("pricing changes leave historical quotes and ledger amounts unchanged", history.required_credits===7 && history.pricing_version===affordable.pricingVersion && (await reservation(paidJob.value.id)).amount===7 && (await rows("select amount from credit_ledger where job_id=$1",[paidJob.value.id])).every(r=>r.amount===7));
  check("committed retry after config change recovers same failed job", (await confirm(affordable)).value.id===paidJob.value.id && (await account(a)).credit_available===100);
  const updated=(await quote()).value;
  check("new quotes use new rate only", updated.requiredCredits===19);
  const sameRequest=await storedQuote(updated.id);
  const replacement=(await quote(snapshot,{requestId:sameRequest.request_id})).value;
  const committed=await confirm(updated);assert.ok(committed.ok);
  check("another quote cannot replace committed request provenance", (await confirm(replacement)).code==="CONFLICT");
  await complete(committed.value.id);
  check("paid success consumes the original quote cost once", (await reservation(committed.value.id)).state==="consumed" && (await account(a)).credit_available===81 && (await account(a)).credit_reserved===0);
  const raceAccount=await fixture();active=raceAccount;
  await pg.query("update generation_accounts set credit_available=15 where owner_user_id=$1",[active.owner]);
  const raceOne=(await quote(fifteen)).value,raceTwo=(await quote(fifteen)).value;
  const paidRace=await Promise.all([confirm(raceOne),confirm(raceTwo)]);
  check("balance decrease after quotes blocks competing paid admission", paidRace.filter(r=>r.ok).length===1 && paidRace.some(r=>r.code==="INSUFFICIENT_CREDITS") && (await account(active)).credit_available===4 && (await account(active)).credit_reserved===11);
  const rollbackQuote=(await quote()).value;
  await pg.exec("create function fixture_reject_pricing() returns trigger language plpgsql as $$ begin raise exception 'isolated pricing history fault'; end $$; create trigger fixture_reject_pricing before insert on generation_pricing_records for each row execute function fixture_reject_pricing();");
  check("pricing history failure rejects admission", (await confirm(rollbackQuote)).code==="UNAVAILABLE");
  check("failed history insert rolls back job and entitlement together", (await account(active)).free_reserved===0 && await value("select count(*)::int as value from generation_jobs where request_id=(select request_id from generation_quotes where id=$1)",[rollbackQuote.id])===0);
  await pg.exec("drop trigger fixture_reject_pricing on generation_pricing_records; drop function fixture_reject_pricing();");
  check("same quote safely retries after transaction failure", (await confirm(rollbackQuote)).ok && (await account(active)).free_reserved===1);
  const assetId=randomUUID();
  await pg.query("insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'fixture.png','image/png',100,'image','uploaded','verified')",[assetId,active.owner,active.project,randomUUID(),`users/${active.owner}/projects/${active.project}/${assetId}/fixture`]);
  const mediaQuote=(await quote({...snapshot,assetIds:[assetId]})).value;
  await pg.query("update project_assets set upload_status='pending',verified_etag=null where id=$1",[assetId]);
  check("confirmation revalidates changed media before reservation", (await confirm(mediaQuote)).code==="INVALID_ASSETS" && (await account(active)).free_reserved===1);
  active=a;
  // Preserve immutable quote data: expiry is tested through DB issuance default,
  // then the local DB clock parameter via expired insert fixture under postgres.
  const expired=await value("insert into generation_quotes(owner_user_id,project_id,request_id,input_snapshot,eligible_free,required_credits,available_credits,free_remaining,pricing_version,pricing_mode,created_at,expires_at) values($1,$2,$3,$4,false,19,100,0,$5,'test',now()-interval '6 minutes',now()-interval '1 minute') returning id as value",[a.owner,a.project,randomUUID(),snapshot,updated.pricingVersion]);
  check("expired unconfirmed quote cannot reserve", (await confirm({id:expired})).code==="QUOTE_STALE");
  active=b;
  const balanceA=JSON.stringify(await account(a));
  check("B cannot confirm A quote", (await confirm(updated)).code==="NOT_FOUND");
  check("B cannot quote A project", (await quote(snapshot,{projectId:a.project})).code==="NOT_FOUND");
  check("B operations do not affect A accounting", JSON.stringify(await account(a))===balanceA);
  const racedFree=(await quote()).value;
  const secondFree=(await quote()).value;
  const racing=await Promise.all([confirm(racedFree),confirm(racedFree)]);
  check("free confirmation contention preserves one hold", racing.every(r=>r.ok)&&racing[0].value.id===racing[1].value.id&&(await account(b)).free_reserved===1);
  const lastFree=(await confirm(secondFree));assert.ok(lastFree.ok);
  const lostFree=(await quote()).value;
  check("two held allowances eliminate free eligibility", !lostFree.eligibleFreeGeneration);
  await value("select claim_generation_job($1,'release-free') as value",[lastFree.value.id]);
  await value("select fail_generation_claim($1,'release-free') as value",[lastFree.value.id]);
  check("paid quote becoming free requires fresh confirmation", (await confirm(lostFree)).code==="QUOTE_STALE");
  const contested=(await quote()).value;
  const other=(await quote()).value;await confirm(other);
  check("free quote losing allowance never silently debits credits", (await confirm(contested)).code==="QUOTE_STALE" && (await account(b)).credit_reserved===0);
  active=await fixture();
  const uncertain=(await quote()).value;loseConfirmation=true;
  check("lost confirmed response returns recoverable error", (await confirm(uncertain)).code==="UNAVAILABLE");
  const recovered=await confirm(uncertain);
  check("lost-response retry recovers one original reservation", recovered.ok && (await account(active)).free_reserved===1 && await value("select count(*)::int as value from generation_pricing_records where quote_id=$1",[uncertain.id])===1);
  signedIn=false;
  await assert.rejects(()=>quote(),AuthRedirect);await assert.rejects(()=>confirm(uncertain),AuthRedirect);
  check("signed-out quote and confirmation preserve auth denial",true);signedIn=true;
  for (const role of ["anon","authenticated"]) {
    await denied(role+" cannot read quotes","select * from generation_quotes",[],role);
    await denied(role+" cannot invoke quote RPC","select issue_generation_quote($1,$2,$3,$4,null,'x','unconfigured')",[active.owner,active.project,randomUUID(),snapshot],role);
    await denied(role+" cannot confirm quotes","select confirm_generation_quote($1,$2,'x')",[active.owner,uncertain.id],role);
  }
  await denied("service cannot bypass quote admission","select admit_generation($1,$2,$3,$4,null)",[active.owner,active.project,randomUUID(),snapshot]);
  await denied("even table owner cannot insert unquoted job","select admit_generation($1,$2,$3,$4,null)",[active.owner,active.project,randomUUID(),snapshot],"postgres");
  await denied("service cannot alter retail quote", "update generation_quotes set required_credits=0 where id=$1",[updated.id]);
  await denied("quotes immutable even for administrator","update generation_quotes set pricing_version='changed' where id=$1",[updated.id],"postgres");
  await denied("historical pricing association cannot be deleted","delete from generation_pricing_records where job_id=$1",[paidJob.value.id],"postgres");
  check("pricing tables retain RLS", (await rows("select relrowsecurity from pg_class where oid in ('generation_quotes'::regclass,'generation_pricing_records'::regclass)")).every(r=>r.relrowsecurity));
  env.SCEENYK_TEST_PRICING_JSON='{"version":"bad","rules":[{"credits":-1}]}';
  check("invalid pricing fails closed through safe action error", (await quote()).code==="UNAVAILABLE" && (await account(active)).free_reserved===1);
  env.SCEENYK_TEST_PRICING_JSON=JSON.stringify({...config,rules:[config.rules[0],config.rules[0]]});
  check("ambiguous duplicate rules rejected", (await quote()).code==="UNAVAILABLE");
  delete env.SCEENYK_TEST_PRICING_JSON;
  check("default never invents production pricing", pricing.quoteGenerationCost(snapshot).requiredCredits===null);
  check("safe errors never log pricing configuration or prompts", !JSON.stringify(logs).includes(snapshot.prompt) && !JSON.stringify(logs).includes("isolated-fixture"));
  console.log(JSON.stringify({passed:checks.length,scope:"isolated SQL/services; fixture authentication, dispatch and result proof; no hosted acceptance",checks},null,2));
} finally { await pg.close(); }
