// m28probe.mjs — verify the M28 Payments & Invoicing slice on REAL Postgres
// (PGlite, no Docker). Proves the DoD gates checkable without a live Stripe stack:
//   Gate-1 tenancy  — B's staff cannot reach A's invoices / invoice_payments /
//                     client_subscriptions / tax_rates / invoice_counters.
//   Gate-2 matrix   — staff+ create/edit, MANAGER+ delete AND void (D-073), tax_rates
//                     manager+, client write-ceiling.
//   D-071           — the BROWSER can never insert an invoice_payment; money moves
//                     only through the service-role record_invoice_payment RPC.
//   D-072 totals    — calc_invoice_totals is the server truth: a client-forged
//                     subtotal is overwritten from line_items to the cent.
//   Numbering       — next_invoice_number is gap-free (INV-0001, INV-0002).
//   estimate→invoice— accept_estimate converts in place, assigns the number, sends.
//   Payment         — record_invoice_payment accumulates (partial→paid), stamps
//                     paid_at, writes the M09 timeline, fires notify(), is idempotent
//                     on the Stripe payment-intent id (webhook redelivery safe).
//   D-074 overdue   — sweep_overdue_invoices flips past-due invoices; revenue_rollup
//                     returns collected/outstanding/overdue correctly + is member-gated.
//
//   node workers/verify/m28probe.mjs        (after `npm install`)
//
// Exit 0 = all assertions passed; 1 = a failure/leak was detected.
//
// Harness (identical spirit to m12probe): auth.users + auth.uid(), the
// authenticated/service_role roles, direct membership seeding. Loads the minimal
// dependency chain (tenancy + M05 for M09's retro-consent FK + M09 contacts/
// activity_log) and stubs public.notify() so the payment→notification path is
// exercised without pulling the whole M04 chain. emit_trigger (M13) is absent and
// tolerated (record_invoice_payment catches undefined_function). Depends on M09's 0013.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = "22222222-2222-2222-2222-222222222222";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const MANAGER_A = "99999999-9999-9999-9999-999999999999";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444"; // agency B staff (the attacker)

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONTACT_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const load = (n) => readFileSync(join(MIG, n), "utf8").split("\n")
  .filter((l) => !/^\s*create\s+extension/i.test(l))
  .filter((l) => !/gin_trgm_ops/i.test(l))
  .join("\n");

const count = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);
const one = async (pg, sql, params) => (await pg.query(sql, params)).rows[0];
async function denied(pg, sql, params) { try { await pg.query(sql, params); return false; } catch { return true; } }

async function main() {
  const pg = new PGlite();

  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    create role service_role nologin;
    grant usage on schema public to authenticated;
  `);

  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
                   "0010_m05_compliance.sql", "0013_m09_crm.sql"]) {
    await pg.exec(load(m));
  }

  // Stub public.notify() (the real one ships in 0011/M04) so record_invoice_payment's
  // notification path runs here. Records each call into probe_notify_log.
  await pg.exec(`
    create table public.probe_notify_log (id serial primary key, workspace_id uuid, target text, type text, title text);
    create or replace function public.notify(p_workspace uuid, p_targets text[], p_type text,
      p_title text, p_body text default null, p_data jsonb default '{}'::jsonb)
    returns integer language plpgsql security definer set search_path = public as $$
    declare t text; n int := 0;
    begin
      foreach t in array coalesce(p_targets,'{}') loop
        insert into public.probe_notify_log(workspace_id,target,type,title) values (p_workspace,t,p_type,p_title);
        n := n + 1;
      end loop;
      return n;
    end $$;
  `);

  await pg.exec(load("0018_m28_payments.sql"));

  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // ── Seed two agencies + members + a WSA contact ─────────────────────────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','owner.a@x.test'),('${ADMIN_A}','admin.a@x.test'),('${STAFF_A}','staff.a@x.test'),
      ('${MANAGER_A}','mgr.a@x.test'),('${CLIENT_A}','client.a@x.test'),
      ('${OWNER_B}','owner.b@x.test'),('${STAFF_B}','staff.b@x.test')
    on conflict (id) do nothing;
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','owner.a@x.test','Owner A'),('${ADMIN_A}','admin.a@x.test','Admin A'),
      ('${STAFF_A}','staff.a@x.test','Staff A'),('${MANAGER_A}','mgr.a@x.test','Manager A'),
      ('${CLIENT_A}','client.a@x.test','Client A'),
      ('${OWNER_B}','owner.b@x.test','Owner B'),('${STAFF_B}','staff.b@x.test','Staff B')
    on conflict (id) do nothing;
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme Agency','acme'),('${WSB}','${OWNER_B}','Beacon Media','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${ADMIN_A}','admin','active'),
      ('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${MANAGER_A}','manager','active'),
      ('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');
    insert into public.contacts (id,workspace_id,first_name,last_name,email,phone,source) values
      ('${CONTACT_A}','${WSA}','Aisha','Rahman','aisha@x.test','+14155550142','referral');
    -- A WSB invoice (a target for B's own positive control + A's leak attempts).
    insert into public.invoices (workspace_id,contact_id,kind,line_items) values
      ('${WSB}',null,'invoice','[{"description":"B item","qty":1,"unit_price":1000}]');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. Cross-tenant isolation — B's staff cannot reach A (Gate-1) ───────────
  console.log("\nM28 · cross-tenant isolation (agency B staff attacking agency A):");
  // First, as staff A, create an invoice to attack.
  await as(STAFF_A);
  const invA = (await one(pg,
    `insert into public.invoices (workspace_id,contact_id,kind,line_items,discount,tax_rate,due_date)
     values ($1,$2,'invoice','[{"description":"Website","qty":2,"unit_price":5000},{"description":"Setup","qty":1,"unit_price":2500}]',
             '{"type":"percent","value":10}', 8.5, current_date - 5) returning id,number,subtotal,discount_total,tax,total,public_token`,
    [WSA, CONTACT_A]));

  await reset(); await as(STAFF_B);
  for (const t of ["invoices", "invoice_payments", "client_subscriptions", "tax_rates", "invoice_counters"]) {
    assert(await count(pg, `select count(*)::int n from public.${t} where workspace_id=$1`, [WSA]) === 0,
      `B cannot SELECT A's ${t}`);
  }
  assert(await denied(pg, `insert into public.invoices (workspace_id,kind,line_items) values ($1,'invoice','[]')`, [WSA]),
    "B cannot INSERT an invoice into A");
  assert(await denied(pg, `insert into public.invoice_payments (workspace_id,invoice_id,amount) values ($1,$2,100)`, [WSA, invA.id]),
    "B cannot INSERT a payment into A");
  assert((await pg.query(`update public.invoices set status='void' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's invoice (0 rows)");
  assert((await pg.query(`delete from public.invoices where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot DELETE A's invoice (0 rows)");
  assert(await count(pg, `select count(*)::int n from public.invoices where workspace_id=$1`, [WSB]) === 1,
    "B CAN SELECT its own invoices (positive control)");

  // ── 2. D-072 — calc_invoice_totals is the server truth ──────────────────────
  console.log("\nM28 · totals are server-computed (D-072):");
  // subtotal = 2*5000 + 1*2500 = 12500; 10% discount = 1250; taxable 11250; 8.5% tax = 956; total 12206.
  assert(Number(invA.subtotal) === 12500, `subtotal computed from line_items (${invA.subtotal} = 12500)`);
  assert(Number(invA.discount_total) === 1250, `10% discount computed (${invA.discount_total} = 1250)`);
  assert(Number(invA.tax) === 956, `8.5% tax on discounted base (${invA.tax} = 956)`);
  assert(Number(invA.total) === 12206, `total = subtotal - discount + tax (${invA.total} = 12206)`);
  assert(/^INV-\d{4}$/.test(invA.number), `invoice got a formatted number (${invA.number})`);
  assert(!!invA.public_token, "invoice got a public pay token");
  // Client-forged subtotal is overwritten.
  await reset(); await as(STAFF_A);
  const forged = await one(pg,
    `insert into public.invoices (workspace_id,kind,line_items,subtotal,total)
     values ($1,'invoice','[{"description":"x","qty":1,"unit_price":300}]', 999999, 999999) returning subtotal,total`,
    [WSA]);
  assert(Number(forged.subtotal) === 300 && Number(forged.total) === 300,
    `a client-forged subtotal/total is overwritten from line_items (${forged.subtotal}/${forged.total} = 300)`);

  // ── 3. Numbering is gap-free ────────────────────────────────────────────────
  console.log("\nM28 · gap-free per-workspace numbering:");
  const nums = (await pg.query(`select number from public.invoices where workspace_id=$1 and kind='invoice' order by number`, [WSA])).rows.map((r) => r.number);
  assert(nums.includes("INV-0001") && nums.includes("INV-0002") && new Set(nums).size === nums.length,
    `sequential, unique numbers assigned so far (${nums.join(", ")})`);

  // ── 4. Gate-2 role matrix — staff+ create, manager+ delete/void, tax manager+ ─
  console.log("\nM28 · role matrix (staff+ create · manager+ delete/void · tax manager+ · client ceiling):");
  await reset(); await as(CLIENT_A);
  assert(await denied(pg, `insert into public.invoices (workspace_id,kind,line_items) values ($1,'invoice','[]')`, [WSA]),
    "client CANNOT create an invoice (write-ceiling: staff+)");
  await reset(); await as(STAFF_A);
  assert(await denied(pg, `update public.invoices set status='void' where id=$1`, [invA.id]),
    "staff CANNOT void an invoice (manager+ only — trigger guard)");
  assert((await pg.query(`delete from public.invoices where id=$1`, [invA.id])).affectedRows === 0,
    "staff CANNOT delete an invoice (manager+ only, 0 rows)");
  assert(await denied(pg, `insert into public.tax_rates (workspace_id,name,rate) values ($1,'GST',5)`, [WSA]),
    "staff CANNOT create a tax rate (manager+ only)");
  await reset(); await as(MANAGER_A);
  assert(!(await denied(pg, `update public.invoices set status='void' where id=$1`, [invA.id])),
    "manager CAN void an invoice");
  assert(!!(await one(pg, `insert into public.tax_rates (workspace_id,name,rate,is_default) values ($1,'Sales Tax',8.5,true) returning id`, [WSA])).id,
    "manager CAN create a tax rate");

  // ── 5. D-071 — invoice_payments is service-role only from the client ─────────
  console.log("\nM28 · payments ledger is service-role only (D-071):");
  await reset(); await as(MANAGER_A); // even a manager (highest below owner) cannot forge a payment row
  assert(await denied(pg, `insert into public.invoice_payments (workspace_id,invoice_id,amount) values ($1,$2,5000)`, [WSA, invA.id]),
    "no member (even manager) can INSERT an invoice_payment directly — money moves server-side only");

  // ── 6. record_invoice_payment — accumulate, flip, timeline, notify, idempotent ─
  console.log("\nM28 · record_invoice_payment (service role): partial → paid, idempotent, timeline, notify:");
  await reset(); // service-role / superuser context (auth.uid() null)
  // fresh invoice to pay: total 10000.
  const payInv = (await one(pg,
    `insert into public.invoices (workspace_id,contact_id,kind,line_items,status)
     values ($1,$2,'invoice','[{"description":"Retainer","qty":1,"unit_price":10000}]','sent') returning id,total`, [WSA, CONTACT_A]));
  await pg.query(`select public.record_invoice_payment($1,$2,$3,'card','pi_part_1')`, [WSA, payInv.id, 4000]);
  let cur = await one(pg, `select amount_paid,status,paid_at from public.invoices where id=$1`, [payInv.id]);
  assert(Number(cur.amount_paid) === 4000 && cur.status === "partial", `partial payment → amount_paid 4000, status partial (${cur.status})`);
  assert(cur.paid_at === null, "paid_at not set while partial");
  // idempotent redelivery of the same PI → no double credit.
  await pg.query(`select public.record_invoice_payment($1,$2,$3,'card','pi_part_1')`, [WSA, payInv.id, 4000]);
  cur = await one(pg, `select amount_paid from public.invoices where id=$1`, [payInv.id]);
  assert(Number(cur.amount_paid) === 4000, "re-delivered webhook (same PI) does NOT double-credit (idempotent)");
  assert(await count(pg, `select count(*)::int n from public.invoice_payments where invoice_id=$1`, [payInv.id]) === 1,
    "only one ledger row after the redelivery");
  // second payment settles it.
  await pg.query(`select public.record_invoice_payment($1,$2,$3,'card','pi_part_2')`, [WSA, payInv.id, 6000]);
  cur = await one(pg, `select amount_paid,status,paid_at from public.invoices where id=$1`, [payInv.id]);
  assert(Number(cur.amount_paid) === 10000 && cur.status === "paid", "second payment settles → status paid");
  assert(cur.paid_at !== null, "paid_at stamped when fully paid");
  assert(await count(pg, `select count(*)::int n from public.activity_log where workspace_id=$1 and contact_id=$2 and type='payment'`, [WSA, CONTACT_A]) >= 1,
    "payment wrote the M09 timeline (activity_log type='payment')");
  assert(await count(pg, `select count(*)::int n from public.probe_notify_log where type='payment_received'`, []) >= 1,
    "payment fired an M04 notification (notify type='payment_received')");

  // ── 7. estimate → invoice conversion ────────────────────────────────────────
  console.log("\nM28 · estimate → invoice (accept_estimate):");
  await reset(); await as(STAFF_A);
  const est = (await one(pg,
    `insert into public.invoices (workspace_id,contact_id,kind,line_items)
     values ($1,$2,'estimate','[{"description":"Quote","qty":1,"unit_price":8000}]') returning id,number,kind`, [WSA, CONTACT_A]));
  assert(est.kind === "estimate" && est.number === null, "estimate created with no number (numberless until accepted)");
  const accepted = await one(pg, `select kind,status,number from public.accept_estimate($1,$2)`, [WSA, est.id]);
  assert(accepted.kind === "invoice" && accepted.status === "sent" && /^INV-\d{4}$/.test(accepted.number),
    `accept_estimate → invoice, sent, numbered (${accepted.number})`);
  assert(await count(pg, `select count(*)::int n from public.activity_log where workspace_id=$1 and contact_id=$2 and type='estimate'`, [WSA, CONTACT_A]) >= 1,
    "acceptance wrote the M09 timeline (activity_log type='estimate')");

  // ── 8. D-074 overdue sweep + revenue_rollup ─────────────────────────────────
  console.log("\nM28 · overdue sweep + revenue rollup:");
  await reset();
  // invA (due 5 days ago, status now 'void' from the matrix test) → excluded. Seed
  // a fresh past-due 'sent' invoice + a not-due one.
  const overdueInv = (await one(pg,
    `insert into public.invoices (workspace_id,kind,line_items,status,due_date)
     values ($1,'invoice','[{"description":"Late","qty":1,"unit_price":20000}]','sent', current_date - 3) returning id`, [WSA]));
  const futureInv = (await one(pg,
    `insert into public.invoices (workspace_id,kind,line_items,status,due_date)
     values ($1,'invoice','[{"description":"Future","qty":1,"unit_price":5000}]','sent', current_date + 10) returning id`, [WSA]));
  const flipped = Number((await one(pg, `select public.sweep_overdue_invoices($1) n`, [WSA])).n);
  assert(flipped >= 1, `sweep flipped ${flipped} past-due invoice(s)`);
  assert((await one(pg, `select status from public.invoices where id=$1`, [overdueInv.id])).status === "overdue",
    "past-due 'sent' invoice flipped to overdue");
  assert((await one(pg, `select status from public.invoices where id=$1`, [futureInv.id])).status === "sent",
    "not-yet-due invoice stays 'sent' (not flipped)");

  await as(STAFF_A);
  const roll = await one(pg, `select public.revenue_rollup($1,null,null) r`, [WSA]);
  const r = roll.r;
  assert(Number(r.collected) === 10000, `rollup collected = sum(amount_paid) (${r.collected} = 10000)`);
  assert(Number(r.overdue) === 20000, `rollup overdue = past-due outstanding (${r.overdue} = 20000)`);
  assert(Number(r.outstanding) >= 25000, `rollup outstanding includes overdue + open (${r.outstanding} ≥ 25000)`);
  await reset(); await as(STAFF_B);
  assert(await denied(pg, `select public.revenue_rollup($1,null,null)`, [WSA]),
    "B cannot compute A's revenue rollup (member gate)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M28 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
