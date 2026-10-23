// Fictional demo library shown until a real library is imported.
// Generic GMP examples only; no company content.

const att = (code, title, type, fields = []) => {
  const m = code.match(/^([A-Z]{2}\d{4}[EF]?)(?:\/Onc)?\/([A-Z]{1,2})(\d{2})(?:\/(\d{2}))?$/);
  return { code, base: m[1], kind: m[2], num: Number(m[3]), version: m[4] || null, title, type, fields, own: true, defined: true };
};
const ref = (code, title) => {
  const m = code.match(/^([A-Z]{2}\d{4}[EF]?)(?:\/Onc)?\/([A-Z]{1,2})(\d{2})/);
  return { code, base: m[1], kind: m[2], num: Number(m[3]), version: null, title, type: "form", fields: [], own: false };
};

const sop = (o) => ({
  site: "Onc", status: "current", extraction: "docx", fileType: "docx", driveUrl: null,
  intro: "", hse: "", tools: [], materials: [], glossary: [], distribution: [], references: [],
  responsibilities: [], outline: [], related: [], history: [], attachments: [], sopRefs: [], text: "",
  ...o,
  file: `${o.code}-Demo-${o.version} ${o.title}.docx`,
  id: `demo-${o.code}`,
});

export const DEMO_LIBRARY = {
  schema: "sop-library/1",
  demo: true,
  generatedAt: "2026-10-01T09:00:00Z",
  source: { name: "Demo library (fictional sample data)" },
  sops: [
    sop({
      code: "SOPQA0001E", dept: "QA", num: "0001", lang: "E", version: "03",
      title: "Document Control System",
      purpose: "Define how controlled documents are created, reviewed, approved, distributed, revised and archived.",
      scope: "All GMP documents of the site: SOPs, forms, templates, logbooks and annexes.",
      responsibilities: ["QA Documentation issues reference numbers and maintains the master index.", "Document owners draft and periodically review their documents.", "The QA Manager approves every controlled document."],
      outline: ["Document numbering", "Drafting and review", "Approval and effective date", "Distribution of controlled copies", "Periodic review (every 3 years)", "Withdrawal and archiving"],
      glossary: [{ term: "Controlled copy", def: "A copy stamped and registered in the distribution list." }, { term: "Effective date", def: "Date from which a document must be applied." }],
      sopRefs: ["SOPQA0002", "SOPQA0004"],
      related: [{ code: "SOPQA0002E", title: "Logbook Management" }, { code: "SOPQA0004E", title: "Good Documentation Practices" }],
      attachments: [
        att("QA0001E/Onc/FE01/03", "Document Change Request", "form", ["Request No.", "Document code", "Current version", "Reason for change", "Proposed change", "Requested by", "Approved by (QA)", "Date"]),
        att("QA0001E/Onc/TE01/02", "Master Document Index", "template", ["Document code", "Title", "Version", "Effective date", "Review date", "Owner department", "Status"]),
        att("QA0001E/Onc/FE02/02", "Controlled Copy Distribution Logbook", "logbook", ["Date", "Document code", "Copy No.", "Issued to (department)", "Issued by", "Received by", "Withdrawn on"]),
      ],
      effectiveDate: "2024-03-12", reviewDate: "2027-03-12",
      history: [{ ver: "01", date: "2021-02-01", summary: "First issue." }, { ver: "02", date: "2022-09-15", summary: "Electronic master index introduced." }, { ver: "03", date: "2024-03-12", summary: "Periodic review; distribution logbook added." }],
    }),
    sop({
      code: "SOPQA0002F", dept: "QA", num: "0002", lang: "F", version: "02",
      title: "Gestion des Logbooks",
      purpose: "Définir les règles d'ouverture, d'utilisation, de clôture et d'archivage des logbooks.",
      scope: "Tous les logbooks GMP des départements du site.",
      outline: ["Ouverture d'un logbook", "Numérotation des logbooks", "Règles d'enregistrement", "Clôture et archivage"],
      sopRefs: ["SOPQA0001", "SOPQA0004"],
      attachments: [
        att("QA0002F/Onc/TF01/02", "Page de garde Logbook", "template", ["Désignation", "No. du logbook", "Code équipement", "Localisation", "Date d'ouverture / par", "Date de fermeture / par", "Nombre de pages"]),
        att("QA0002F/Onc/FF02/02", "Index des logbooks", "logbook", ["No. de logbook", "Titre / référence", "Salle", "Ouvert par / date", "Reçu par / date", "Clôturé par / date", "Commentaires"]),
      ],
      effectiveDate: "2023-11-20", reviewDate: "2026-11-20",
      history: [{ ver: "01", date: "2020-05-04", summary: "Première émission." }, { ver: "02", date: "2023-11-20", summary: "Index des logbooks par département." }],
    }),
    sop({
      code: "SOPQA0004E", dept: "QA", num: "0004", lang: "E", version: "02",
      title: "Good Documentation Practices",
      purpose: "Describe the ALCOA+ rules for recording GMP data on paper and electronic records.",
      scope: "Every person who records, checks or approves GMP data.",
      outline: ["ALCOA+ principles", "Corrections and strike-through", "Signatures and initials", "Late entries", "Electronic records"],
      sopRefs: ["SOPQA0001"],
      attachments: [att("QA0004E/Onc/AE01/01", "Examples of correct and incorrect entries", "annex")],
      effectiveDate: "2023-06-01", reviewDate: "2026-06-01",
      history: [{ ver: "01", date: "2020-01-10", summary: "First issue." }, { ver: "02", date: "2023-06-01", summary: "Electronic records chapter added." }],
    }),
    sop({
      code: "SOPQA0015E", dept: "QA", num: "0015", lang: "E", version: "04",
      title: "Handling of Deviations",
      purpose: "Describe how deviations are reported, classified, investigated and closed.",
      scope: "All unplanned departures from approved procedures, specifications or GMP requirements.",
      outline: ["Reporting within 24 hours", "Classification: minor, major, critical", "Investigation and root cause", "CAPA and effectiveness check", "Trending"],
      sopRefs: ["SOPQA0026", "SOPQA0001"],
      attachments: [
        att("QA0015E/Onc/FE01/04", "Deviation Report", "form", ["Deviation No.", "Date of occurrence", "Department", "Product / batch", "Description", "Immediate action", "Classification", "Root cause", "CAPA No.", "Reported by", "QA approval"]),
        att("QA0015E/Onc/FE02/02", "Deviation Logbook", "logbook", ["Deviation No.", "Date", "Department", "Short description", "Classification", "Due date", "Closure date"]),
      ],
      effectiveDate: "2023-04-02", reviewDate: "2026-04-02",
      history: [{ ver: "03", date: "2021-04-02", summary: "Risk-based classification." }, { ver: "04", date: "2023-04-02", summary: "24-hour reporting rule." }],
    }),
    sop({
      code: "SOPQA0026E", dept: "QA", num: "0026", lang: "E", version: "02",
      title: "Corrective and Preventive Actions (CAPA)",
      purpose: "Establish an effective CAPA system from initiation to effectiveness check.",
      scope: "CAPA arising from deviations, OOS, complaints, audits and management review.",
      outline: ["CAPA initiation", "Action plan and owners", "Extension requests", "Effectiveness check"],
      sopRefs: ["SOPQA0015", "SOPQC0018"],
      attachments: [att("QA0026E/Onc/FE01/02", "CAPA Form", "form", ["CAPA No.", "Source", "Problem statement", "Root cause", "Corrective action", "Preventive action", "Owner", "Due date", "Effectiveness check"])],
      effectiveDate: "2025-01-15", pendingRevision: "03",
      history: [{ ver: "01", date: "2022-01-15", summary: "First issue." }, { ver: "02", date: "2025-01-15", summary: "Effectiveness check made mandatory." }, { ver: "03", date: null, summary: "Alignment with the electronic QMS (in approval)." }],
    }),
    sop({
      code: "SOPQC0018E", dept: "QC", num: "0018", lang: "E", version: "03",
      title: "Handling of Out-of-Specification Results",
      purpose: "Describe the phased investigation of out-of-specification (OOS) laboratory results.",
      scope: "All OOS results for raw materials, intermediates, finished products and stability samples.",
      outline: ["Phase I: laboratory investigation", "Phase II: full-scale investigation", "Retest and resampling rules", "Reporting and trending"],
      sopRefs: ["SOPQA0015", "SOPQA0026"],
      attachments: [
        att("QC0018E/Onc/FE01/03", "OOS Logbook", "logbook", ["OOS No.", "Date", "Product / material", "Batch / lot", "Test", "Result", "Specification", "Analyst", "Phase", "Closure date"]),
        att("QC0018E/Onc/FE02/03", "OOS Investigation Phase I", "form", ["OOS No.", "Analyst", "Instrument ID", "Calculation check", "Standard / reagent check", "Assignable cause found", "Conclusion", "Reviewed by"]),
        ref("QA0015E/Onc/FE01/04", "Deviation Report"),
      ],
      effectiveDate: "2024-08-01", reviewDate: "2027-08-01",
      history: [{ ver: "02", date: "2021-08-01", summary: "Phase II responsibilities clarified." }, { ver: "03", date: "2024-08-01", summary: "Trending section added." }],
    }),
    sop({
      code: "SOPQC0025E", dept: "QC", num: "0025", lang: "E", version: "01",
      title: "Sample Reception and Handling in the QC Laboratory",
      purpose: "Describe how samples are received, registered, stored and dispatched for testing.",
      scope: "All samples submitted to the QC laboratory.",
      outline: ["Sample reception", "Registration and labelling", "Storage conditions", "Retention samples"],
      sopRefs: ["SOPQA0002"],
      attachments: [att("QC0025E/Onc/FE01/01", "Sample Reception Logbook", "logbook", ["Date / time", "Sample type", "Product / material", "Batch / lot", "Quantity", "Storage condition", "Submitted by", "Received by"])],
      effectiveDate: "2023-10-30", reviewDate: "2026-10-30",
      history: [{ ver: "01", date: "2023-10-30", summary: "First issue." }],
    }),
    sop({
      code: "SOPVL0010E", dept: "VL", num: "0010", lang: "E", version: "05",
      title: "Monitoring of Temperature and Relative Humidity",
      purpose: "Lay down instructions for monitoring temperature and relative humidity of controlled rooms and equipment.",
      scope: "Controlled rooms, warehouses, laboratories and temperature-controlled equipment.",
      outline: ["Acceptance criteria per area", "Reading frequency", "Out-of-range readings", "Data logger download"],
      sopRefs: ["SOPQA0015", "SOPVL0016"],
      attachments: [
        att("VL0010E/Onc/FE01/05", "Room Temperature and RH Monitoring Record", "form", ["Room ID", "Date", "Time", "Temperature (°C)", "RH (%)", "Compliance", "Recorded by", "Verified by"]),
        att("VL0010E/Onc/FE02/03", "Equipment Temperature Daily Log", "logbook", ["Date", "Time", "Equipment ID", "Temperature (°C)", "Limits", "Compliance", "Recorded by"]),
      ],
      effectiveDate: "2025-02-10", reviewDate: "2028-02-10",
      history: [{ ver: "04", date: "2022-02-10", summary: "Alert and action limits split." }, { ver: "05", date: "2025-02-10", summary: "Data logger download added." }],
    }),
    sop({
      code: "SOPVL0016F", dept: "VL", num: "0016", lang: "F", version: "02",
      title: "Vérification Journalière des Balances",
      purpose: "Définir la méthode de vérification journalière des balances avant leur utilisation.",
      scope: "Toutes les balances du site.",
      tools: ["Kit de masses étalons"],
      outline: ["Recommandations d'utilisation", "Vérification avec masses étalons", "Fréquence", "Déplacement des balances"],
      sopRefs: ["SOPQA0002", "SOPQA0015"],
      attachments: [
        att("VL0016F/Onc/FF01/02", "Constat de vérification journalière des balances", "logbook", ["Date / heure", "Cause de la vérification", "Contrôle du zéro", "Masse 1", "Masse 2", "Masse 3", "Conformité", "Fait par", "Vérifié par"]),
        att("VL0016F/Onc/FF02/01", "Demande de déplacement balance", "form", ["Demande No.", "Département émetteur", "Balance à déplacer (ID)", "Ancienne affectation", "Nouvelle affectation", "Raison", "Validation", "Assurance Qualité"]),
      ],
      effectiveDate: "2023-11-02", reviewDate: "2026-11-02",
      history: [{ ver: "01", date: "2020-11-02", summary: "Première émission." }, { ver: "02", date: "2023-11-02", summary: "Ajout de la demande de déplacement." }],
    }),
    sop({
      code: "SOPVL0042F", dept: "VL", num: "0042", lang: "F", version: "01",
      title: "Gestion des Résultats Métrologiques Hors Norme",
      purpose: "Définir la méthodologie à suivre en amont d'une décision métrologique.",
      scope: "Tout résultat d'étalonnage ou de vérification hors tolérance.",
      outline: ["Logigramme décisionnel", "Étalonnage hors norme", "Décision finale"],
      sopRefs: ["SOPQA0015", "SOPVL0016"],
      attachments: [att("VL0042F/Onc/FF01/01", "Fiche de gestion des résultats métrologiques hors norme", "form", ["Référence fiche", "Instrument (ID, modèle)", "Localisation", "Certificat d'étalonnage", "Description de l'anomalie", "Historique des interventions", "Décision finale", "Préparé par", "Vérifié par"])],
      effectiveDate: "2022-06-12", reviewDate: "2025-06-12",
      history: [{ ver: "01", date: "2022-06-12", summary: "Première émission." }],
    }),
  ],
};
