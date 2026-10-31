// Fictional demo programme so the app can be explored before importing real
// data. Product names are invented; nothing here comes from a real company.
import { eomonth, todayIso, edate } from "./engine.js";

const BRANDS = ["ALVORIN", "BEXTRAL", "CALDEXA", "DORIVEX", "ELNORA", "FENTARIS", "GLYVANE", "HALOMIR", "IRVESTA", "JUNOVEX", "KELTRIS", "LUMADOR", "MERIVAL", "NOVASTIN", "ORVELLA", "PRAXIDE", "QUENTARA", "RIVALON", "SOLMERA", "TAVINOR", "ULTRANE", "VELORIN", "WINTRAX", "XYLANOR", "YSOLDE", "ZEPHIRAL", "ARCOLIN", "BRIVANE", "CORTELLA", "DAXOLAN"];
const MOLECULES = ["Amlodipine", "Metformin", "Losartan", "Atorvastatin", "Omeprazole", "Cetirizine", "Levetiracetam", "Sertraline", "Paracetamol", "Clopidogrel", "Rosuvastatin", "Gabapentin", "Bisoprolol", "Esomeprazole", "Valsartan", "Montelukast", "Escitalopram", "Fluconazole", "Ibuprofen", "Pantoprazole"];
const FORMS = [
  ["Tablets", (s) => `${s} mg F/C Tablets (30 TAB)`, 0.72],
  ["Hard Capsule", (s) => `${s} mg Capsules (28 CAP)`, 0.12],
  ["Liquid/Syrup", (s) => `${s} mg/5 ml Oral Suspension (100 ml)`, 0.08],
  ["Semi Solid", (s) => `${s}% Cream (30 gm)`, 0.08],
];
const PEOPLE = ["A. Martin", "B. Haddad", "C. Laurent", "D. Benali", "E. Rossi", "F. Mansour", "G. Duval", "H. Kaci", "I. Moreau", "J. Saidi", "K. Lefevre", "L. Amrani"];

function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

export function demoState() {
  const r = rng(20260);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const today = todayIso();
  const startMonth = eomonth(today, -8);
  const plan = [];
  const tasks = [];
  let no = 1, wfNo = 1, qcNo = 1, apvNo = 1000;
  const used = new Set();
  const report = today;
  for (let mi = 0; mi < 10; mi++) {
    const periodEnd = eomonth(startMonth, mi);
    const reviewStart = eomonth(periodEnd, -11);
    const nProducts = 4 + Math.floor(r() * 4);
    for (let k = 0; k < nProducts; k++) {
      let name;
      const f = r();
      let acc = 0;
      const form = FORMS.find((x) => (acc += x[2]) >= f) || FORMS[0];
      do {
        const strength = pick(["5", "10", "20", "25", "40", "50", "100", "200", "500"]);
        name = `${pick(BRANDS)} (${pick(MOLECULES)}) ${form[1](form[0] === "Semi Solid" ? pick(["1", "2"]) : strength)}-DEMO SITE`;
      } while (used.has(name));
      used.add(name);
      plan.push({ id: `p${no}`, no: no++, product: name, process: form[0], execYear: +periodEnd.slice(0, 4), site: "DEMO SITE", reviewStart: `${reviewStart.slice(5, 7)}/${reviewStart.slice(0, 4)}`, reviewEnd: `${periodEnd.slice(5, 7)}/${periodEnd.slice(0, 4)}`, periodEnd, planStatus: "Approved" });

      // Products whose planned month has started get a workflow (with a few gaps).
      const plannedMonth = eomonth(periodEnd, 1);
      const plannedStart = plannedMonth.slice(0, 7) + "-01";
      if (plannedStart > report || (mi === 1 && k < 2)) continue;
      const ageDays = (Date.parse(report) - Date.parse(plannedStart)) / 86400000;
      const maturity = Math.min(1, Math.max(0, ageDays / 120 + (r() - 0.5) * 0.35));
      const created = `${plannedStart.slice(0, 8)}0${1 + Math.floor(r() * 8)}T09:${String(10 + Math.floor(r() * 49))}`;
      const due = edate(plannedStart, 3) + "T23:59";
      const wfRef = `APQR-DM-${wfNo++}`;
      const product = name;
      const base = { product, dosageForm: form[0], site: "DEMO SITE", criticality: "Low", createdBy: "System" };
      const wfClosed = maturity > 0.97 && r() > 0.3;
      tasks.push({ ...base, id: `t${tasks.length}`, ref: wfRef, department: "QA", stream: "APQR Workflow", taskClass: "Workflow", taskType: "APQR", title: `APQR , ${product}`, stage: wfClosed ? "Closed" : "Data Collection", status: wfClosed ? "Completed" : due.slice(0, 10) < report ? "Overdue" : "Open", assignee: pick(["Unassigned", PEOPLE[0], PEOPLE[0]]), created, start: created, closedOn: wfClosed ? edate(created.slice(0, 10), 4) : "", closure: wfClosed ? "Closed" : "Not Closed", taskEnd: due });
      const suffix = { Tablets: "Tablet", "Hard Capsule": "Capsule", "Liquid/Syrup": "Liquid", "Semi Solid": "Semi Solid" }[form[0]];
      const qcRef = `QCTAB-DM-${qcNo++}`;
      const annexes = [
        ["Compliance", "Compliance", "CM Data Collection", "QA Data Collection", wfRef],
        ["Production", "IPC", `IPC Data Collection - ${suffix}`, `IPC Data Collection - ${suffix}`, wfRef],
        ["Production", "Process", `Process Data Collection - ${suffix}`, `Process Data Collection - ${suffix}`, wfRef],
        ["QC", "QC", `QC Data Collection - ${suffix}`, `QC Data Collection - ${suffix}`, qcRef],
        ["QC", "QC", "QC OOS/OOT Data Collection", "QA Data Collection", qcRef],
        ["QA", "QA", "QA Data Collection", "QA Data Collection", wfRef],
        ["QA", "Supplier", "Supplier Data Collection", "QA Data Collection", wfRef],
        ["RA", "RA", "RA Data Collection", "RA Data Collection", wfRef],
        ["Validation", "Validation", "Validation Data Collection", "Validation Data Collection", wfRef],
        ["Validation", "Validation", "VL Process Data Collection", "QA Data Collection", wfRef],
      ];
      const deptSpeed = { Production: 0.25, QC: 0.12, Compliance: 0, QA: -0.05, Validation: -0.1, RA: -0.18 };
      for (const [dept, stream, title, type, ref] of annexes) {
        const p = maturity + deptSpeed[dept] + (r() - 0.5) * 0.4;
        const done = wfClosed || p > 0.75;
        const review = !done && p > 0.5;
        const closedOn = done ? edate(created.slice(0, 10), 1 + Math.floor(r() * Math.max(1, ageDays / 30))) : "";
        tasks.push({ ...base, id: `t${tasks.length}`, ref, department: dept, stream, taskClass: "Data Collection", taskType: type, title, stage: done ? "Completed" : review ? "Data Review" : "Collecting Data", status: done ? "Completed" : r() > 0.8 ? "Overdue" : "Open", assignee: r() > 0.22 ? pick(PEOPLE) : "Unassigned", created, start: created, closedOn: closedOn > report ? report : closedOn, closure: done ? "Closed" : "Not Closed", taskEnd: edate(created.slice(0, 10), 2) + "T09:00" });
        if (done && r() > 0.45) {
          const sign = closedOn > report ? report : closedOn;
          tasks.push({ ...base, id: `t${tasks.length}`, ref: `APV-DM-${apvNo++}`, department: "Approval", stream: "Approval", taskClass: "Approval", taskType: "Approval", title: "Approval", stage: r() > 0.985 ? "Rejected" : "Approved", status: "Completed", assignee: pick(PEOPLE), created: sign, start: sign, closedOn: sign, closure: "Closed", taskEnd: sign });
        }
      }
    }
  }
  const prevPct = {};
  return {
    meta: { programme: "Demo APQR Programme", organisation: "Demo Pharma (fictional data)", planRef: "PQRP-DEMO-1", source: "Built-in demo data", sourceDate: today, importedAt: new Date().toISOString(), user: "" },
    settings: { reportDate: today, useToday: true, overdueMonths: 3, dueSoonDays: 14, triggerWindowDays: 60 },
    baseline: null,
    plan, tasks, products: {}, excluded: [], audit: [],
    _prevPct: prevPct,
  };
}
