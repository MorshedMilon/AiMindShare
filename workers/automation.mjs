// automation.mjs — M13 Automation execution engine (the node WALKER), isolated so
// it can run against the live service-role client in worker.mjs AND against a PGlite
// adapter in the acceptance probe. `db` is injected (a supabase-js-shaped client):
// createAutomationEngine(db) → { automationExecute(job), automationDateSweep(job) }.
//
// A workflow's graph is stored normalised as { nodes:[{id,type,config}],
// edges:[{source,target,sourceHandle}] } (the frontend translates Drawflow's native
// export to/from this shape). emit_trigger() enrolled an execution + an
// automation.execute job; here we load the VERSION-PINNED snapshot (so a live edit
// can't corrupt a running walk), resume from current_node_id, run each node through a
// typed handler, log one workflow_execution_steps row per node, and:
//   · WAIT   → status 'waiting', pin resume to the wait's successor, re-enqueue with
//              run_after = now + delay (jobs.run_after is the delay mechanism, AC ±1 min).
//   · IF/ELSE→ evaluate the operator, follow the 'true'/'false' edge.
//   · GOAL   → complete when its condition is met, else fall through.
// Sends (email/sms) are STUBBED — no provider wired yet — so they log a suppressed
// step and bill NOTHING (Gate-3). Test runs (is_test) suppress every side effect and
// collapse waits. Idempotent: a terminal execution short-circuits.

const STEP_BUDGET = 100; // cycle backstop: at most 100 node runs per resume

// Evaluate a single IF/ELSE / GOAL condition → boolean. Pure (no db) → unit-testable.
export function evalCondition(cfg, ctx) {
  const op = cfg?.operator || "is_set";
  const field = cfg?.field || "";
  const want = cfg?.value;
  if (op === "has_tag") return !!ctx.tags?.some((t) => String(t).toLowerCase() === String(want).toLowerCase());
  if (op === "not_has_tag") return !ctx.tags?.some((t) => String(t).toLowerCase() === String(want).toLowerCase());
  const have = field === "deal_value" ? ctx.deal_value
    : field === "lead_score" ? ctx.lead_score
    : field.startsWith("field.") ? ctx.fields?.[field.slice(6)]
    : ctx[field];
  switch (op) {
    case "equals":       return String(have ?? "") === String(want ?? "");
    case "not_equals":   return String(have ?? "") !== String(want ?? "");
    case "contains":     return String(have ?? "").toLowerCase().includes(String(want ?? "").toLowerCase());
    case "greater_than": return Number(have) > Number(want);
    case "less_than":    return Number(have) < Number(want);
    case "is_set":       return have != null && String(have) !== "";
    case "not_set":      return have == null || String(have) === "";
    default:             return false;
  }
}

export function createAutomationEngine(db) {
  // Resolve or create a tag by name within the workspace (add_tag/remove_tag).
  async function tagIdByName(ws, name) {
    const clean = String(name || "").trim();
    if (!clean) return null;
    const { data: found } = await db.from("tags").select("id").eq("workspace_id", ws).ilike("name", clean).limit(1).maybeSingle();
    if (found) return found.id;
    const { data: made, error } = await db.from("tags").insert({ workspace_id: ws, name: clean }).select("id").single();
    if (error) throw new Error(`tag create: ${error.message}`);
    return made.id;
  }

  // Build the contact context an IF/ELSE / GOAL condition reads.
  async function contactContext(ws, contactId, payload) {
    const ctx = { lead_score: 0, tags: [], deal_value: Number(payload?.deal_value ?? 0), fields: {} };
    if (!contactId) return ctx;
    const { data: c } = await db.from("contacts")
      .select("first_name,last_name,email,phone,source,lead_score").eq("id", contactId).maybeSingle();
    if (c) Object.assign(ctx, { ...c, lead_score: c.lead_score ?? 0 });
    const { data: tags } = await db.from("contact_tags").select("tag_id, tags(name)").eq("contact_id", contactId);
    ctx.tags = (tags || []).map((t) => t.tags?.name).filter(Boolean);
    ctx.tag_ids = (tags || []).map((t) => t.tag_id);
    return ctx;
  }

  // Typed action handlers. Each returns a result object logged on the step. Actions
  // operate on the execution's contact (+ deal in payload). suppress = test run.
  async function runAction(node, exec) {
    const ws = exec.workspace_id;
    const contactId = exec.contact_id;
    const cfg = node.config || {};
    const suppress = exec.is_test === true;
    const type = node.type;

    switch (type) {
      case "add_tag": {
        const tagId = await tagIdByName(ws, cfg.tag_name || cfg.tag);
        if (!tagId || !contactId) return { skipped: "no tag/contact" };
        await db.from("contact_tags").upsert({ workspace_id: ws, contact_id: contactId, tag_id: tagId }, { onConflict: "contact_id,tag_id" });
        return { tag_id: tagId, added: true };
      }
      case "remove_tag": {
        const tagId = cfg.tag_id || (await tagIdByName(ws, cfg.tag_name || cfg.tag));
        if (!tagId || !contactId) return { skipped: "no tag/contact" };
        await db.from("contact_tags").delete().eq("workspace_id", ws).eq("contact_id", contactId).eq("tag_id", tagId);
        return { tag_id: tagId, removed: true };
      }
      case "create_task": {
        if (!contactId) return { skipped: "no contact" };
        const due = cfg.due_in_days != null
          ? new Date(Date.now() + Number(cfg.due_in_days) * 864e5).toISOString().slice(0, 10) : null;
        const { data, error } = await db.from("contact_tasks")
          .insert({ workspace_id: ws, contact_id: contactId, title: cfg.title || "Follow up", due_date: due, assigned_to: cfg.assigned_to || null })
          .select("id").single();
        if (error) throw new Error(error.message);
        return { task_id: data.id };
      }
      case "create_deal": {
        const { data, error } = await db.from("deals").insert({
          workspace_id: ws, pipeline_id: cfg.pipeline_id || null, stage_id: cfg.stage_id || null,
          contact_id: contactId, title: cfg.title || "New deal", value: cfg.value != null ? Number(cfg.value) : null,
        }).select("id").single();
        if (error) throw new Error(error.message);
        return { deal_id: data.id };
      }
      case "move_deal_stage": {
        const dealId = cfg.deal_id || exec.trigger_payload?.deal_id;
        if (!dealId || !cfg.stage_id) return { skipped: "no deal/stage" };
        const { error } = await db.rpc("automation_apply_move_deal", { p_ws: ws, p_deal: dealId, p_stage: cfg.stage_id });
        if (error) throw new Error(error.message);
        return { deal_id: dealId, moved_to: cfg.stage_id };
      }
      case "update_field": {
        if (!contactId) return { skipped: "no contact" };
        const core = new Set(["first_name", "last_name", "email", "phone", "source", "lead_score"]);
        if (cfg.field && core.has(cfg.field)) {
          const patch = { [cfg.field]: cfg.field === "lead_score" ? Number(cfg.value) : cfg.value, updated_at: new Date().toISOString() };
          await db.from("contacts").update(patch).eq("id", contactId).eq("workspace_id", ws);
          return { field: cfg.field, set: true };
        }
        const { data: cf } = await db.from("custom_fields").select("id").eq("workspace_id", ws).eq("field_name", cfg.field_name || cfg.field).maybeSingle();
        if (!cf) return { skipped: "unknown field" };
        await db.from("contact_custom_values").upsert(
          { workspace_id: ws, contact_id: contactId, field_id: cf.id, value: String(cfg.value ?? "") }, { onConflict: "contact_id,field_id" });
        return { field_id: cf.id, set: true };
      }
      case "assign_owner": {
        if (!contactId || !cfg.user_id) return { skipped: "no contact/user" };
        const { data, error } = await db.from("deals").update({ assigned_to: cfg.user_id, updated_at: new Date().toISOString() })
          .eq("workspace_id", ws).eq("contact_id", contactId).eq("status", "open").select("id");
        if (error) throw new Error(error.message);
        return { assigned_to: cfg.user_id, deals: data?.length ?? 0 };
      }
      case "internal_notification": {
        const targets = Array.isArray(cfg.targets) && cfg.targets.length ? cfg.targets : ["all"];
        const { data, error } = await db.rpc("notify", {
          p_workspace: ws, p_targets: targets, p_type: "automation.alert",
          p_title: cfg.title || "Automation alert", p_body: cfg.body || null,
          p_data: { link: contactId ? `/crm/${contactId}` : "/automations" },
        });
        if (error) throw new Error(error.message);
        return { notified: data ?? 0 };
      }
      case "webhook_post": {
        if (!cfg.url) return { skipped: "no url" };
        if (suppress) return { suppressed: true, reason: "test_mode", url: cfg.url };
        const body = { ...(cfg.body || {}), contact_id: contactId, workspace_id: ws, payload: exec.trigger_payload };
        const res = await fetch(cfg.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return { url: cfg.url, status: res.status };
      }
      case "send_email":
      case "send_sms":
        // STUB: no email (D-011) / SMS (Twilio, M05) provider wired. NOT metered
        // (Gate-3: no successful provider call bills nothing).
        return { suppressed: true, reason: suppress ? "test_mode" : "provider_pending",
                 channel: type === "send_email" ? "email" : "sms" };
      case "add_to_campaign":
        return { suppressed: true, reason: "campaigns_pending_M16", campaign_id: cfg.campaign_id || null };
      default:
        return { skipped: `unknown action ${type}` };
    }
  }

  async function logStep(exec, node, status, result, error) {
    await db.from("workflow_execution_steps").insert({
      workspace_id: exec.workspace_id, execution_id: exec.id,
      node_id: node.id, node_type: node.type, status, result: result || {}, error: error || null,
    });
  }

  async function finishExec(exec, status, error) {
    await db.from("workflow_executions").update({
      status, error: error || null, completed_at: new Date().toISOString(),
    }).eq("id", exec.id);
    if (status === "completed") {
      await db.from("workflows").update({ stats: { last_run_at: new Date().toISOString() } })
        .eq("id", exec.workflow_id).then(() => {}, () => {});
    }
  }

  async function automationExecute(job) {
    const executionId = job.payload?.execution_id;
    if (!executionId) throw new Error("automation.execute: missing execution_id");

    const { data: exec, error: exErr } = await db.from("workflow_executions").select("*").eq("id", executionId).maybeSingle();
    if (exErr) throw new Error(`load execution: ${exErr.message}`);
    if (!exec) return { execution_id: executionId, skipped: "gone" };
    if (["completed", "failed", "cancelled"].includes(exec.status)) return { execution_id: executionId, idempotent: true };

    let graph = (await db.from("workflow_versions").select("nodes,edges")
      .eq("workflow_id", exec.workflow_id).eq("version", exec.workflow_version).maybeSingle()).data;
    if (!graph) graph = (await db.from("workflows").select("nodes,edges").eq("id", exec.workflow_id).maybeSingle()).data;
    if (!graph) { await finishExec(exec, "failed", "no graph"); return { execution_id: executionId, failed: "no graph" }; }

    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const nextOf = (id, handle) => edges
      .filter((e) => e.source === id && (handle == null || (e.sourceHandle ?? null) === handle || String(e.sourceHandle ?? "") === handle))
      .map((e) => e.target);

    let cur = exec.current_node_id;
    if (!cur) {
      const trig = nodes.find((n) => n.type === "trigger" || n.type === "trigger.entry");
      cur = trig ? (nextOf(trig.id)[0] || null) : (nodes[0] ? nextOf(nodes[0].id)[0] : null);
    }

    await db.from("workflow_executions").update({ status: "running" }).eq("id", exec.id);

    let steps = 0;
    while (cur && steps < STEP_BUDGET) {
      steps++;
      const node = byId.get(cur);
      if (!node) break;

      if (node.type === "wait") {
        const unit = node.config?.unit || "minutes";
        const amount = Number(node.config?.amount ?? 0);
        const mult = unit === "days" ? 864e5 : unit === "hours" ? 36e5 : 6e4;
        const resumeAt = new Date(Date.now() + amount * mult).toISOString();
        const resumeNode = nextOf(node.id)[0] || null;
        await logStep(exec, node, "success", { wait: `${amount} ${unit}`, resume_at: resumeAt });
        await db.from("workflow_executions").update({ status: "waiting", current_node_id: resumeNode }).eq("id", exec.id);
        await db.from("jobs").insert({
          workspace_id: exec.workspace_id, type: "automation.execute",
          payload: { execution_id: exec.id, workspace_id: exec.workspace_id },
          run_after: exec.is_test ? new Date().toISOString() : resumeAt,
          idempotency_key: `automation-resume-${exec.id}-${resumeNode || "end"}-${steps}`,
        });
        return { execution_id: executionId, paused_until: exec.is_test ? "now(test)" : resumeAt, node: node.id };
      }

      if (node.type === "if_else" || node.type === "condition") {
        const ctx = await contactContext(exec.workspace_id, exec.contact_id, exec.trigger_payload);
        const truthy = evalCondition(node.config, ctx);
        await logStep(exec, node, "success", { branch: truthy ? "true" : "false", operator: node.config?.operator });
        cur = nextOf(node.id, truthy ? "true" : "false")[0] || nextOf(node.id, truthy ? "0" : "1")[0] || null;
        continue;
      }

      if (node.type === "goal") {
        const ctx = await contactContext(exec.workspace_id, exec.contact_id, exec.trigger_payload);
        const met = evalCondition(node.config, ctx);
        await logStep(exec, node, met ? "success" : "skipped", { goal_met: met });
        if (met) { await finishExec(exec, "completed"); return { execution_id: executionId, completed: "goal_met" }; }
        cur = nextOf(node.id)[0] || null;
        continue;
      }

      if (node.type === "trigger" || node.type === "trigger.entry") { cur = nextOf(node.id)[0] || null; continue; }

      try {
        const result = await runAction(node, exec);
        await logStep(exec, node, "success", result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await logStep(exec, node, "failed", null, msg);
        await finishExec(exec, "failed", `node ${node.id} (${node.type}): ${msg}`);
        throw new Error(`automation node ${node.id} failed: ${msg}`); // jobs retry/backoff applies
      }
      cur = nextOf(node.id)[0] || null;
    }

    await finishExec(exec, "completed");
    return { execution_id: executionId, steps, status: "completed" };
  }

  // Daily hook (pg_cron enqueues one per workspace with an active date.scheduled
  // workflow). Full birthday/scheduled-date matching rides on M09's contact date
  // fields + rules engine (D-047); the schedule + hook ship now — honest deferral.
  async function automationDateSweep(job) {
    const ws = job.workspace_id;
    console.log(`automation.date_sweep ${ws}: date.scheduled matching deferred to M09 date fields (D-047); hook active`);
    return { workspace_id: ws, matched: 0, deferred: "date matching → M09 rules engine" };
  }

  return { automationExecute, automationDateSweep };
}
