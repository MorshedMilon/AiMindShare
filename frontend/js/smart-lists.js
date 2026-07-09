/* smart-lists.js — AiMindShare Module M09 · CRM.
   A browser mirror of the server-side smart-list AND/OR grammar evaluator
   (the DB RPC `smart_list_eval`). Used for instant live-preview counts in the
   smart-list builder over already-loaded contacts — the source of truth stays
   the DB function; this is a UI convenience only.

   Grammar:
     group = { match:"and"|"or", rules:[ rule | group, … ] }
     rule  = { field, op, value, field_id? }
     fields: first_name|last_name|email|phone|source (text)
           · lead_score (number) · created_at (date)
           · tag  (value = tag_id; reads contact.tags[] of ids)
           · custom (field_id + value; reads contact.custom[field_id])
     ops text:        eq neq contains is_set not_set
     ops number/date: eq neq gt gte lt lte
     ops tag:         has not_has
   An empty group (no rules) matches ALL contacts. Groups nest arbitrarily.

   Exposes: window.SmartLists = { evalSmartList }. No dependencies, no build step. */
(function (root) {
  "use strict";

  var TEXT_FIELDS = ["first_name", "last_name", "email", "phone", "source"];

  function norm(v) { return v == null ? "" : String(v).trim().toLowerCase(); }
  function asNum(v) { var n = Number(v); return isNaN(n) ? null : n; }
  function asTime(v) { var t = new Date(v).getTime(); return isNaN(t) ? null : t; }

  /* Resolve the raw value a rule points at, on a given contact. */
  function fieldValue(contact, rule) {
    var f = rule.field;
    if (f === "tag") return Array.isArray(contact.tags) ? contact.tags : [];
    if (f === "custom") {
      var cv = contact.custom || {};
      return cv[rule.field_id];
    }
    return contact[f];
  }

  function matchText(cur, op, value) {
    var a = norm(cur), b = norm(value);
    switch (op) {
      case "eq": return a === b;
      case "neq": return a !== b;
      case "contains": return b === "" ? true : a.indexOf(b) !== -1;
      case "is_set": return a !== "";
      case "not_set": return a === "";
      default: return false;
    }
  }

  function matchNumeric(curRaw, op, valRaw, coerce) {
    if (op === "is_set") return curRaw != null && curRaw !== "";
    if (op === "not_set") return curRaw == null || curRaw === "";
    var cur = coerce(curRaw), val = coerce(valRaw);
    if (cur == null || val == null) return false;
    switch (op) {
      case "eq": return cur === val;
      case "neq": return cur !== val;
      case "gt": return cur > val;
      case "gte": return cur >= val;
      case "lt": return cur < val;
      case "lte": return cur <= val;
      default: return false;
    }
  }

  function matchTag(curIds, op, value) {
    var ids = Array.isArray(curIds) ? curIds.map(String) : [];
    var target = String(value);
    var present = ids.indexOf(target) !== -1;
    if (op === "has") return present;
    if (op === "not_has") return !present;
    return false;
  }

  function evalRule(contact, rule) {
    if (!rule || !rule.field) return true;
    var cur = fieldValue(contact, rule);
    if (rule.field === "tag") return matchTag(cur, rule.op, rule.value);
    if (rule.field === "lead_score") return matchNumeric(cur, rule.op, rule.value, asNum);
    if (rule.field === "created_at") return matchNumeric(cur, rule.op, rule.value, asTime);
    if (rule.field === "custom") {
      // Custom values are treated as text unless the value/current parse as numbers.
      return matchText(cur, rule.op, rule.value);
    }
    if (TEXT_FIELDS.indexOf(rule.field) !== -1) return matchText(cur, rule.op, rule.value);
    return matchText(cur, rule.op, rule.value);
  }

  function isGroup(node) { return node && Array.isArray(node.rules); }

  function evalNode(contact, node) {
    if (isGroup(node)) return evalGroup(contact, node);
    return evalRule(contact, node);
  }

  function evalGroup(contact, group) {
    var rules = (group && group.rules) || [];
    if (!rules.length) return true; // empty group matches all
    var and = (group.match || "and").toLowerCase() !== "or";
    if (and) {
      for (var i = 0; i < rules.length; i++) if (!evalNode(contact, rules[i])) return false;
      return true;
    }
    for (var j = 0; j < rules.length; j++) if (evalNode(contact, rules[j])) return true;
    return false;
  }

  /* Public: return the subset of `contacts` matching `definition`. */
  function evalSmartList(contacts, definition) {
    var list = Array.isArray(contacts) ? contacts : [];
    if (!definition || (!definition.rules && !definition.match)) return list.slice();
    return list.filter(function (c) { return evalGroup(c, definition); });
  }

  root.SmartLists = { evalSmartList: evalSmartList };
})(typeof window !== "undefined" ? window : this);
