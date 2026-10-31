// Managed lists: every value a user can set in the app is picked from one of
// these lists, and each list can be edited (add, rename, delete) in the app.
// Renaming an entry updates every record that uses it; deleting one can
// replace it with another entry. Lists are seeded from the data.
import { STAGE_ORDER, DEPARTMENTS, SLOTS, SLOT_BY_KEY, groupName, ROLE_APQR_OWNER, ROLE_APPROVER, classifyTask, slotTitle, productKey } from "./engine.js";

export const LIST_DEFS = [
  { key: "people", label: "People, groups & roles", desc: "Assigned to, data collection owner, data reviewer, APQR owner, action owner and your name.", kind: "people" },
  { key: "stages", label: "Workflow stages", desc: "Stage of a task. Built-in stages drive the calculations and are locked; added stages count as open." },
  { key: "statuses", label: "Task statuses", desc: "Status shown next to the stage (Open, Overdue, Completed…)." },
  { key: "taskTitles", label: "Task titles", desc: "Titles offered when adding or editing a task, grouped by annexe. Renaming here doesn’t rename existing Scigeniq tasks.", kind: "titles" },
  { key: "actionTypes", label: "Follow-up action types", desc: "The kinds of follow-up action you can record against a review." },
  { key: "priorities", label: "Priorities", desc: "Priority of a product review." },
  { key: "criticality", label: "Criticality", desc: "Criticality of a task." },
  { key: "dosageForms", label: "Dosage forms / processes", desc: "Process of a planned product." },
  { key: "sites", label: "Sites", desc: "Manufacturing site of a planned product." },
  { key: "planStatuses", label: "Plan statuses", desc: "Status of a product in the approved plan." },
];
export const LIST_BY_KEY = Object.fromEntries(LIST_DEFS.map((d) => [d.key, d]));

const LOCKED = {
  stages: new Set(STAGE_ORDER),
  statuses: new Set(["Completed", "Not triggered"]),
};
/** Fully locked (can't rename or delete): stages and statuses the calculations use. */
export const isLocked = (key, name) => !!LOCKED[key]?.has(name);
/** System people entries: the department groups and the two acting roles. They can be renamed, not deleted. */
export const isSystemPerson = (item) => !!(item && (item.deptGroup || item.sysRole));
const SYS_DEFAULT_NAMES = new Set([...DEPARTMENTS.map(groupName), ROLE_APQR_OWNER, ROLE_APPROVER]);
const systemPeople = () => [
  ...DEPARTMENTS.map((d) => ({ name: groupName(d), type: "group", dept: d, deptGroup: d })),
  { name: ROLE_APQR_OWNER, type: "role", dept: "QA", sysRole: "apqrOwner" },
  { name: ROLE_APPROVER, type: "role", dept: "", sysRole: "approver" },
];
/** Tag the department groups / roles in older lists and make sure each one exists. */
function normalisePeople(list) {
  const out = list.map((x) => {
    if (x.deptGroup || x.sysRole) return x;
    const d = DEPARTMENTS.find((dd) => groupName(dd) === x.name);
    if (d && x.type === "group") return { ...x, deptGroup: d, dept: d };
    if (x.name === ROLE_APQR_OWNER) return { ...x, sysRole: "apqrOwner" };
    if (x.name === ROLE_APPROVER) return { ...x, sysRole: "approver" };
    return x;
  });
  for (const s of systemPeople()) {
    if (s.deptGroup && !out.some((x) => x.deptGroup === s.deptGroup)) out.push(s);
    if (s.sysRole && !out.some((x) => x.sysRole === s.sysRole)) out.push(s);
  }
  return out;
}

const DEFAULT_ACTIONS = [
  "Raise the Final QA Data Collection in Scigeniq",
  "Chase the data collection owner",
  "Chase the data reviewer",
  "Close the APQR workflow in Scigeniq",
  "Raise the missing annexe in Scigeniq",
  "Correct the data at source in Scigeniq",
  "Confirm closure with the QA head",
  "Escalate to department head",
  "Other",
];
const FORMS = ["Tablets", "Hard Capsule", "Liquid/Syrup", "Semi Solid"];
const blank = (v) => !v || /^unassigned$/i.test(String(v).trim()) || /^-+$/.test(String(v).trim()) || /^system$/i.test(String(v).trim()) || v === "—";
const uniq = (arr) => [...new Set(arr.filter((x) => x !== undefined && x !== null && String(x).trim() !== "").map((x) => String(x).trim()))];

/** Lists derived from the data, used to seed state.lists the first time. */
export function defaultLists(state) {
  const tasks = state.tasks || [];
  const prods = Object.values(state.products || {});
  const deptOf = new Map();
  for (const t of tasks) {
    if (blank(t.assignee)) continue;
    const c = classifyTask(t);
    if (c.role === "Departmental annexe") { const m = deptOf.get(t.assignee) || {}; m[c.dept] = (m[c.dept] || 0) + 1; deptOf.set(t.assignee, m); }
  }
  const topDept = (n) => Object.entries(deptOf.get(n) || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const users = uniq([...tasks.map((t) => t.assignee), ...tasks.map((t) => t.collector), ...tasks.map((t) => t.reviewer), ...prods.map((p) => p.owner), ...prods.flatMap((p) => (p.actions || []).map((a) => a.owner)), state.meta?.user]).filter((n) => !blank(n)).sort((a, b) => a.localeCompare(b));
  const people = [
    ...users.filter((n) => !SYS_DEFAULT_NAMES.has(n) && !(state.lists?.people || []).some((x) => (x.deptGroup || x.sysRole) && x.name === n)).map((name) => ({ name, type: "user", dept: topDept(name) })),
    ...systemPeople(),
  ];
  const titles = [];
  const seen = new Set();
  const addTitle = (name, slot) => { const k = `${slot}|${name}`; if (!name || seen.has(k) || /^duplicated$/i.test(name) || /^APQR\s*,/i.test(name) || /^approval$/i.test(name)) return; seen.add(k); titles.push({ name, slot }); };
  for (const s of SLOTS) for (const f of FORMS) addTitle(slotTitle(s.key, f), s.key);
  addTitle("Final QA Data Collection", "Final QA");
  for (const t of tasks) { const c = classifyTask(t); if (c.role === "Departmental annexe") addTitle(t.title, t.annexSlot || c.slot); else if (c.role === "Final QA compilation") addTitle(t.title, "Final QA"); }
  return {
    people,
    stages: uniq([...STAGE_ORDER, ...tasks.map((t) => t.stage)]).map((name) => ({ name })),
    statuses: uniq(["Open", "Overdue", "Completed", "Not triggered", ...tasks.map((t) => t.status)]).map((name) => ({ name })),
    taskTitles: titles,
    actionTypes: uniq([...DEFAULT_ACTIONS]).map((name) => ({ name })),
    priorities: ["High", "Medium", "Low"].map((name) => ({ name })),
    criticality: uniq(["Low", "Medium", "High", ...tasks.map((t) => t.criticality)]).map((name) => ({ name })),
    dosageForms: uniq([...FORMS, ...(state.plan || []).map((p) => p.process), ...tasks.map((t) => t.dosageForm)]).map((name) => ({ name })),
    sites: uniq([...(state.plan || []).map((p) => p.site), ...tasks.map((t) => t.site)]).filter((s) => !/^-+$/.test(s)).map((name) => ({ name })),
    planStatuses: uniq(["Approved", "Draft", "Cancelled", ...(state.plan || []).map((p) => p.planStatus)]).map((name) => ({ name })),
  };
}

/** The lists in force: stored lists, with any list not stored yet taken from the defaults. */
export function getLists(state) {
  const stored = state.lists || {};
  const need = LIST_DEFS.some((d) => !Array.isArray(stored[d.key]));
  const def = need ? defaultLists(state) : null;
  const out = Object.fromEntries(LIST_DEFS.map((d) => [d.key, Array.isArray(stored[d.key]) ? stored[d.key] : def[d.key]]));
  out.people = normalisePeople(out.people);
  return out;
}

/** Add values found in the data that aren't in the lists yet (after an import). Returns the number added. */
export function addMissingFromData(state) {
  const lists = getLists(state);
  const def = defaultLists(state);
  let added = 0;
  for (const d of LIST_DEFS) {
    const have = new Set(lists[d.key].map((x) => (d.kind === "titles" ? `${x.slot}|${x.name}` : x.name)));
    for (const item of def[d.key]) {
      if (d.kind === "people" && isSystemPerson(item)) continue; // system entries are already there (maybe renamed)
      const k = d.kind === "titles" ? `${item.slot}|${item.name}` : item.name;
      if (!have.has(k)) { lists[d.key].push(item); have.add(k); added++; }
    }
  }
  state.lists = lists;
  return added;
}

/* ------------------------------------------------------------ usage */

const PEOPLE_FIELDS = ["assignee", "collector", "reviewer"];
/** Where each list's values are used, as [{ count, apply(to) }] walkers. */
function walkers(state, key) {
  const tasks = state.tasks || [];
  const plan = state.plan || [];
  const prods = state.products || {};
  const W = [];
  const taskField = (f) => W.push({ each: (fn) => tasks.forEach((t) => fn(t[f], (v) => { if (v) t[f] = v; else if (f === "assignee") t[f] = "Unassigned"; else { delete t[f]; delete t[`${f}Type`]; } })) });
  const planField = (f) => W.push({ each: (fn) => plan.forEach((p) => fn(p[f], (v) => { p[f] = v; })) });
  switch (key) {
    case "people":
      PEOPLE_FIELDS.forEach(taskField);
      W.push({ each: (fn) => Object.values(prods).forEach((a) => fn(a.owner, (v) => { if (v) a.owner = v; else delete a.owner; })) });
      W.push({ each: (fn) => Object.values(prods).forEach((a) => (a.actions || []).forEach((x) => fn(x.owner, (v) => { x.owner = v || ""; }))) });
      W.push({ each: (fn) => fn(state.meta?.user, (v) => { state.meta.user = v || ""; }) });
      break;
    case "stages": taskField("stage"); break;
    case "statuses": taskField("status"); break;
    case "criticality": taskField("criticality"); break;
    case "dosageForms": planField("process"); taskField("dosageForm"); break;
    case "sites": planField("site"); taskField("site"); break;
    case "planStatuses": planField("planStatus"); break;
    case "priorities": W.push({ each: (fn) => Object.values(prods).forEach((a) => fn(a.priority, (v) => { if (v) a.priority = v; else delete a.priority; })) }); break;
    case "actionTypes": W.push({ each: (fn) => Object.values(prods).forEach((a) => (a.actions || []).forEach((x) => fn(x.type, (v) => { x.type = v || ""; }))) }); break;
    default: break;
  }
  return W;
}

export function usageCount(state, key, name) {
  let n = 0;
  for (const w of walkers(state, key)) w.each((v) => { if (v === name) n++; });
  if (key === "taskTitles") n = (state.tasks || []).filter((t) => t.title === name).length;
  return n;
}
export function usageCounts(state, key) {
  const m = new Map();
  if (key === "taskTitles") { for (const t of state.tasks || []) m.set(t.title, (m.get(t.title) || 0) + 1); return m; }
  for (const w of walkers(state, key)) w.each((v) => { if (v) m.set(v, (m.get(v) || 0) + 1); });
  return m;
}

/** Replace a value everywhere it is used (to = "" clears it). Returns the number of records changed. */
export function replaceEverywhere(state, key, from, to) {
  if (key === "taskTitles") return 0; // Scigeniq titles are not renamed in the records
  let n = 0;
  for (const w of walkers(state, key)) w.each((v, set) => { if (v === from) { set(to); n++; } });
  return n;
}

/* ------------------------------------------------------------ select helpers */

const escA = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const option = (value, label, selected) => `<option value="${escA(value)}"${selected ? " selected" : ""}>${escA(label)}</option>`;

/**
 * <select> for a simple list. The current value is kept as an option even when
 * it is no longer in the list, so a record never silently changes.
 */
export function listSelect(lists, key, value, { name = "", attrs = "", empty = "", cls = "" } = {}) {
  const items = lists[key] || [];
  const names = items.map((x) => x.name);
  let html = `<select ${name ? `name="${escA(name)}"` : ""} class="${cls}" ${attrs}>`;
  if (empty !== null && empty !== undefined && empty !== false) html += option("", empty || "—", !value);
  if (value && !names.includes(value)) html += option(value, `${value} (not in list)`, true);
  html += names.map((n) => option(n, n, n === value)).join("");
  return html + "</select>";
}

/** <select> of people, groups and roles, grouped. Value "" = none (Unassigned / not set). */
export function peopleSelect(lists, value, { name = "", attrs = "", empty = "— none —", cls = "", only = null, dept = "" } = {}) {
  const items = lists.people || [];
  const isNone = !value || /^unassigned$/i.test(value);
  let html = `<select ${name ? `name="${escA(name)}"` : ""} class="${cls}" ${attrs}>`;
  html += option("", empty, isNone);
  if (!isNone && !items.some((x) => x.name === value)) html += option(value, `${value} (not in list)`, true);
  const groups = [["user", "People"], ["group", "Groups"], ["role", "Roles"]].filter(([t]) => !only || only.includes(t));
  for (const [type, label] of groups) {
    let list = items.filter((x) => x.type === type);
    if (dept && type === "user") list = [...list.filter((x) => x.dept === dept), ...list.filter((x) => x.dept !== dept)];
    if (!list.length) continue;
    html += `<optgroup label="${label}">${list.map((x) => option(x.name, x.dept && type === "user" ? `${x.name} · ${x.dept}` : x.name, x.name === value)).join("")}</optgroup>`;
  }
  return html + "</select>";
}

/** Task titles for a slot (or Final QA), keeping the current title. */
export function titleSelect(lists, slot, value, { name = "title", attrs = "" } = {}) {
  const items = (lists.taskTitles || []).filter((x) => !slot || x.slot === slot);
  const names = [...new Set(items.map((x) => x.name))];
  let html = `<select name="${escA(name)}" ${attrs}>`;
  if (value && !names.includes(value)) html += option(value, `${value} (not in list)`, true);
  if (!value) html += option("", "Choose a title…", true);
  html += names.map((n) => option(n, n, n === value)).join("");
  return html + "</select>";
}

export const typeOf = (lists, name) => (lists.people || []).find((x) => x.name === name)?.type || "user";
export { SLOT_BY_KEY, productKey };
