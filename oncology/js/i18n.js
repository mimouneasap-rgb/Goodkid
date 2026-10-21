// EN / FR strings. Most come from the workbook's own translation table (Lists → tTr);
// EXTRA holds the strings that only exist in the app.

const EXTRA = {
  nav_overview: ["Overview", "Vue d’ensemble"],
  nav_ops: ["Site & assets", "Site et actifs"],
  nav_qms: ["Quality system", "Système qualité"],
  nav_gov: ["Governance", "Gouvernance"],
  qr_title: ["Quality records", "Enregistrements qualité"],
  qr_sub: ["Every change control, CAPA and deviation from the Scigeniq exports · click a row for the full record", "Toutes les maîtrises des changements, CAPA et déviations des exports Scigeniq · cliquer une ligne pour le détail"],
  search: ["Search records, rooms, assets, risks, SOPs…", "Rechercher enregistrements, salles, actifs, risques, procédures…"],
  search_short: ["Search", "Rechercher"],
  no_results: ["No results", "Aucun résultat"],
  theme: ["Theme", "Thème"],
  light: ["Light", "Clair"],
  dark: ["Dark", "Sombre"],
  system: ["System", "Système"],
  update_data: ["Update data", "Mettre à jour"],
  print: ["Print", "Imprimer"],
  filter_all: ["(All)", "(Tous)"],
  reset: ["Reset", "Réinitialiser"],
  open_view: ["Open", "Ouvrir"],
  close: ["Close", "Fermer"],
  table_view: ["Table", "Tableau"],
  chart_view: ["Chart", "Graphique"],
  details: ["Details", "Détails"],
  timeline: ["Timeline", "Chronologie"],
  linked: ["Linked items", "Éléments liés"],
  priority_score: ["Priority score", "Score de priorité"],
  confirm_link: ["Confirm room / asset link", "Confirmer le lien salle / actif"],
  save: ["Save", "Enregistrer"],
  cancel: ["Cancel", "Annuler"],
  saved: ["Saved on this device", "Enregistré sur cet appareil"],
  approval: ["Approval", "Approbation"],
  record_action: ["Record approval action", "Enregistrer une action d’approbation"],
  your_name: ["Your name", "Votre nom"],
  role: ["Role", "Rôle"],
  comment: ["Comment", "Commentaire"],
  local_note: ["No sign-in: everything you add is stored only in this browser. Export to share.", "Sans connexion : vos saisies restent dans ce navigateur. Exportez pour partager."],
  export_csv: ["Export CSV", "Exporter CSV"],
  export_json: ["Export my entries", "Exporter mes saisies"],
  import_title: ["Update the data", "Mettre à jour les données"],
  import_body: ["Drop the master workbook (.xlsx) to reload everything, or a Scigeniq “allTasks_report” export for Change Control, CAPA or Quality Event to replace just that list. Files are read in your browser and never uploaded.", "Déposez le classeur maître (.xlsx) pour tout recharger, ou un export Scigeniq « allTasks_report » (Change Control, CAPA ou Quality Event) pour remplacer cette liste. Les fichiers sont lus dans le navigateur, jamais envoyés."],
  import_drop: ["Drop .xlsx files here or click to choose", "Déposez des fichiers .xlsx ici ou cliquez pour choisir"],
  import_reset: ["Restore bundled data", "Restaurer les données d’origine"],
  import_done: ["Data updated", "Données mises à jour"],
  import_fail: ["Could not read that file", "Impossible de lire ce fichier"],
  data_source: ["Data source", "Source des données"],
  bundled: ["Bundled workbook", "Classeur intégré"],
  imported: ["Imported", "Importé"],
  days: ["days", "jours"],
  d: ["d", "j"],
  all_types: ["All types", "Tous types"],
  open_records: ["open records", "enregistrements ouverts"],
  room_on_map: ["Show on map", "Voir sur le plan"],
  explore_room: ["Explore room", "Explorer la salle"],
  sev_occ: ["Severity × occurrence", "Gravité × occurrence"],
  residual: ["Residual", "Résiduel"],
  initial: ["Initial", "Initial"],
  effect: ["Effect", "Effet"],
  cause: ["Cause", "Cause"],
  controls: ["Current controls", "Maîtrises actuelles"],
  action: ["Action", "Action"],
  verification: ["Verification", "Vérification"],
  site_wide: ["Site-wide", "Tout le site"],
  schematic: ["Schematic", "Schéma"],
  drawing: ["Drawing", "Plan"],
  legend_low: ["Low", "Bas"],
  legend_high: ["High", "Élevé"],
  no_data: ["No data", "Aucune donnée"],
  kbd_hint: ["Press / to search", "Appuyez sur / pour rechercher"],
  rows: ["rows", "lignes"],
  status_mix: ["Status mix", "Répartition des statuts"],
  everything: ["Everything in one place", "Tout au même endroit"],
  modules: ["Modules", "Modules"],
  provisional: ["Provisional — QA to confirm", "Provisoire — à confirmer par l’AQ"],
  decision_add: ["Add decision", "Ajouter une décision"],
  phase1: ["First 12 months (phase I)", "12 premiers mois (phase I)"],
  last24: ["Last 24 months", "24 derniers mois"],
  pareto_note: ["Cumulative share shown at the end of each bar", "Part cumulée indiquée en bout de barre"],
  months_ahead: ["Next 12 months", "12 prochains mois"],
  stage: ["Stage", "Étape"],
  scope: ["Scope", "Périmètre"],
  source: ["Source", "Source"],
  product: ["Product", "Produit"],
  created_by: ["Created by", "Créé par"],
  folders: ["Folders", "Dossiers"],
  current_state: ["Current state", "État actuel"],
  proposed_state: ["Proposed state", "État proposé"],
  justification: ["Justification", "Justification"],
  root_cause: ["Root cause", "Cause racine"],
  eff_check: ["Effectiveness check", "Vérification d’efficacité"],
  capa_required: ["CAPA required", "CAPA requise"],
  parent: ["Parent", "Parent"],
  flags: ["Flags", "Alertes"],
  suggested: ["Suggested", "Suggéré"],
  confirmed: ["Confirmed", "Confirmé"],
  missing: ["Missing", "Manquant"],
  equipment_list: ["Equipment register", "Registre des équipements"],
  assets_issues: ["Assets", "Actifs"],
  model: ["Model", "Modèle"],
  serial: ["Serial", "N° de série"],
  manufacturer: ["Manufacturer", "Fabricant"],
  known_issues: ["Known issues", "Anomalies connues"],
  comments: ["Comments", "Commentaires"],
  ag1: ["EXPLORE – Every tile, bar, map room and heat-map cell is clickable: it opens the matching records, risks or room. Hover any chart for exact values.", "EXPLORER – Chaque tuile, barre, salle du plan et case de carte thermique est cliquable : elle ouvre les enregistrements, risques ou la salle correspondants. Survolez un graphique pour les valeurs exactes."],
  ag2: ["SEARCH – Press / (or Ctrl+K) anywhere to find a record, room, asset, FMEA risk, SOP or product.", "RECHERCHER – Appuyez sur / (ou Ctrl+K) pour trouver un enregistrement, une salle, un actif, un risque AMDEC, une procédure ou un produit."],
  ag3: ["REFRESH – Update data → drop the Scigeniq “allTasks_report” exports (Change Control, CAPA, Quality Event) or the whole master workbook. Every KPI recalculates in your browser; nothing is uploaded.", "ACTUALISER – Mettre à jour → déposez les exports Scigeniq « allTasks_report » (Change Control, CAPA, Quality Event) ou tout le classeur maître. Tous les indicateurs sont recalculés dans le navigateur ; rien n’est envoyé."],
  ag4: ["CONFIRM LINKS & APPROVALS – Open a record to confirm its room / asset link or log Submitted / Approved / Rejected. Entries stay on this device; use Export my entries to share them.", "LIENS ET APPROBATIONS – Ouvrez un enregistrement pour confirmer le lien salle / actif ou consigner Soumis / Approuvé / Rejeté. Les saisies restent sur cet appareil ; exportez-les pour les partager."],
  ag5: ["PRINT – Management review and every other page print on A4 landscape with the controlled-copy footer. Switch EN / FR and light / dark at the top right.", "IMPRIMER – La revue de direction et toutes les pages s’impriment en A4 paysage avec le pied de page de copie maîtrisée. Basculez EN / FR et clair / sombre en haut à droite."],
  welcome_lead: ["Load the QA master workbook to open the dashboards. Drop the .xlsx file here: every table, KPI, chart, map and risk is rebuilt from it.", "Chargez le classeur maître AQ pour ouvrir les tableaux de bord. Déposez le fichier .xlsx ici : tableaux, indicateurs, graphiques, plan et risques sont reconstruits à partir de lui."],
  welcome_privacy: ["The file is read in this browser only. Nothing is uploaded, no account is needed, and the data stays on this device until you clear it.", "Le fichier est lu dans ce navigateur uniquement. Rien n’est envoyé, aucun compte n’est nécessaire et les données restent sur cet appareil jusqu’à leur suppression."],
  need_master: ["Load the master workbook first; Scigeniq exports only replace its change-control, CAPA or deviation lists.", "Chargez d’abord le classeur maître ; les exports Scigeniq ne remplacent que ses listes de changements, CAPA ou déviations."],
  not_saved: ["This browser would not store the data, so it is kept for this visit only.", "Ce navigateur n’a pas pu enregistrer les données : elles ne sont conservées que pour cette visite."],
  clear_data: ["Remove data from this browser", "Supprimer les données de ce navigateur"],
  print_footer: ["Controlled copy only when printed from the approved master · ", "Copie maîtrisée uniquement si imprimée depuis le maître approuvé · "],
};

let lang = "EN";
let dict = new Map();

export function initI18n(trRows, initial) {
  dict = new Map(trRows.map(([k, en, fr]) => [k, [en, fr]]));
  for (const [k, v] of Object.entries(EXTRA)) dict.set(k, v);
  lang = initial === "FR" ? "FR" : "EN";
}
export const getLang = () => lang;
export const setLang = (l) => { lang = l === "FR" ? "FR" : "EN"; document.documentElement.lang = lang.toLowerCase(); };

/** Translate a key; `{1}`, `{2}`… are replaced with the extra arguments. */
export function t(key, ...args) {
  const e = dict.get(key);
  let s = e ? (lang === "FR" ? e[1] || e[0] : e[0]) : key;
  args.forEach((a, i) => { s = s.replaceAll(`{${i + 1}}`, a); });
  return s;
}

// Values (statuses, types, levels) shown in the data are translated where the workbook has a word for them.
const VALUE_KEYS = {
  Open: "s_open", Overdue: "s_overdue", Completed: "s_completed", Canceled: "s_canceled",
  "On target": "st_on", Watch: "st_watch", Action: "st_action",
  Idea: "im_idea", Assessed: "im_assessed", "In progress": "im_inprog", Done: "im_done",
};
const VALUE_FR = {
  "Change Control": "Maîtrise des changements", Deviation: "Déviation", Low: "Bas", Medium: "Moyen", High: "Élevé",
  Major: "Majeur", Minor: "Mineur", Critical: "Critique", "(Not classified)": "(Non classé)", "(Unassigned)": "(Non affecté)",
  "Missing date": "Date manquante", "No calibration data": "Pas de données d’étalonnage", "In date": "À jour",
  "Due ≤30 d": "Échéance ≤30 j", "Due 31–60 d": "Échéance 31–60 j", "Due 61–90 d": "Échéance 61–90 j",
  "No review date": "Sans date de revue", "Due ≤90 d": "Échéance ≤90 j", Suggested: "Suggéré", Confirmed: "Confirmé", Missing: "Manquant",
};
export function tv(value) {
  if (value == null) return "";
  if (VALUE_KEYS[value]) return t(VALUE_KEYS[value]);
  return lang === "FR" && VALUE_FR[value] ? VALUE_FR[value] : String(value);
}
