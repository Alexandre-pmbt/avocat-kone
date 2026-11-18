"use strict";
/* Cabinet – interface (demandes, dossiers, clients, devis, factures, paramètres, équipe) */

// ============================================================ Outils
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const daysTo = iso => Math.round((new Date(iso + "T12:00:00") - new Date(today() + "T12:00:00")) / 86400000);
const fdate = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "";
const grp = n => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const money = n => (n < 0 ? "-" : "") + grp(n || 0) + " F";
const num = v => { const x = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return isNaN(x) ? 0 : x; };
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const byDesc = k => (a, b) => String(b[k] || "").localeCompare(String(a[k] || ""));

let D = null, ME = null, USERS = [];
const S = () => Object.assign({
  cabinet: "", avocat: "", titre: "Avocat", adresse: "", ville: "98860 Koné", tel: "", email: "", ridet: "", rib: "",
  tgc: 11, delai: 30, validite: 30, mentions: "", logo: "",
  domaines: ["Droit de la famille", "Droit pénal", "Droit civil", "Droit du travail", "Droit des affaires / sociétés", "Droit immobilier / foncier", "Droit coutumier", "Droit administratif", "Recouvrement de créances", "Autre"]
}, D.settings || {});

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  if (r.status === 401 && url !== "/api/login") { ME = null; render(); throw new Error("non_connecte"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "erreur");
  return j;
}
async function save(col, obj) {
  const saved = await api("PUT", `/api/docs/${col}/${obj.id}`, obj);
  const list = D[col], i = list.findIndex(x => x.id === saved.id);
  if (i >= 0) list[i] = saved; else list.push(saved);
  return saved;
}
async function remove(col, id) {
  await api("DELETE", `/api/docs/${col}/${id}`);
  D[col] = D[col].filter(x => x.id !== id);
}
function toast(msg) {
  document.querySelectorAll(".toast:not(#maj)").forEach(x => x.remove());
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
const ERR = { facture_emise: "Une facture émise ne peut pas être supprimée : établissez un avoir.", reserve_admin: "Réservé à l'avocat (administrateur).", email_deja_utilise: "Cette adresse e-mail est déjà utilisée.", champs_invalides: "Vérifiez le nom, l'e-mail et le mot de passe (8 caractères minimum).", mot_de_passe_trop_court: "Mot de passe trop court (8 caractères minimum).", mot_de_passe_actuel_incorrect: "Mot de passe actuel incorrect.", format_inconnu: "Ce fichier n'est pas une sauvegarde du logiciel.", numero_deja_utilise: "Ce numéro de dossier est déjà utilisé.", archive_facture: "La copie archivée d'une facture émise est conservée et ne peut pas être supprimée.", format_non_supporte: "Format non pris en charge (PDF, Word, PNG ou JPEG)." };
const fail = e => { if (e.message !== "non_connecte") alert(ERR[e.message] || "Erreur : " + e.message); };

// ============================================================ Référentiels
const ST_DEM = { nouvelle: ["Nouvelle", "acc"], rappeler: ["À rappeler", "warn"], rdv: ["RDV fixé", "info"], convertie: ["Dossier ouvert", "ok"], sans_suite: ["Sans suite", ""] };
const ST_DOS = { ouvert: ["Ouvert", "info"], en_cours: ["En cours", "acc"], attente: ["En attente", "warn"], clos: ["Clos", ""] };
const ST_DEV = { brouillon: ["Brouillon", ""], envoye: ["Envoyé", "info"], accepte: ["Accepté", "ok"], refuse: ["Refusé", "bad"] };
const tag = (map, k) => { const m = map[k] || [k || "—", ""]; return `<span class="tag ${m[1]}">${esc(m[0])}</span>`; };
const opts = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${esc(Array.isArray(v) ? v[0] : v)}</option>`).join("");
const listOpts = (arr, cur, empty) => (empty != null ? `<option value="">${esc(empty)}</option>` : "") + arr.map(v => `<option ${v === cur ? "selected" : ""}>${esc(v)}</option>`).join("");
const JURIDICTIONS = ["Tribunal de première instance de Nouméa", "TPI – Section détachée de Koné", "Cour d'appel de Nouméa", "Tribunal du travail", "Tribunal mixte de commerce", "Tribunal administratif de Nouméa", "Juge aux affaires familiales", "Juge des enfants", "Tribunal correctionnel"];

const client = id => D.clients.find(c => c.id === id);
const dossier = id => D.dossiers.find(d => d.id === id);
const clientName = c => !c ? "—" : c.type === "societe" ? (c.societe || c.nom || "—") : [c.civilite, (c.nom || "").toUpperCase(), c.prenom].filter(Boolean).join(" ");
const dosLabel = d => d ? `${d.num || ""} – ${d.intitule || ""}` : "—";

// Totaux d'un devis / d'une facture : honoraires soumis à TGC, débours non soumis.
function totals(doc) {
  let hon = 0, deb = 0;
  (doc.lignes || []).forEach(l => { const m = num(l.qte) * num(l.pu); if (l.type === "deb") deb += m; else hon += m; });
  const taux = doc.tgc != null && doc.tgc !== "" ? num(doc.tgc) : num(S().tgc);
  const tgc = Math.round(hon * taux / 100);
  return { hon: Math.round(hon), deb: Math.round(deb), taux, tgc, ttc: Math.round(hon) + tgc + Math.round(deb) };
}
const paid = f => (f.paiements || []).reduce((a, p) => a + num(p.montant), 0);
function factState(f) {
  if (f.statut !== "emise") return ["Brouillon", ""];
  const t = totals(f).ttc, p = paid(f) + num(f.impute);
  if (f.avoir) return ["Avoir", "info"];
  if (p >= t && t > 0) return ["Payée", "ok"];
  if (f.echeance && daysTo(f.echeance) < 0) return [p > 0 ? "Partielle – en retard" : "En retard", "bad"];
  return [p > 0 ? "Partiellement payée" : "À régler", "warn"];
}
const reste = f => f.statut === "emise" && !f.avoir ? Math.max(0, totals(f).ttc - paid(f) - num(f.impute)) : 0;

// ============================================================ Fenêtre modale
function modal(html, mount) {
  const o = document.createElement("div"); o.className = "overlay";
  o.innerHTML = `<div class="modal">${html}</div>`;
  o.addEventListener("mousedown", e => { if (e.target === o) close(); });
  const close = () => { o.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  document.body.appendChild(o);
  if (mount) mount(o.firstChild, close);
  const first = $("input,select,textarea", o); if (first) first.focus();
  return close;
}
const readForm = el => { const o = {}; $$("[name]", el).forEach(i => o[i.name] = i.type === "checkbox" ? i.checked : i.value.trim()); return o; };

// ============================================================ Connexion
function renderLogin() {
  document.getElementById("root").innerHTML = `
  <div class="login"><form class="card" id="lf">
    <h1>Cabinet</h1><div class="muted">Gestion des dossiers et de la facturation</div>
    <div class="f"><label>E-mail</label><input name="email" type="email" autocomplete="username" required></div>
    <div class="f"><label>Mot de passe</label><input name="password" type="password" autocomplete="current-password" required></div>
    <div class="err" id="le"></div>
    <button class="btn pri" style="width:100%;margin-top:6px">Se connecter</button>
  </form></div>`;
  $("#lf").onsubmit = async e => {
    e.preventDefault();
    try { ME = await api("POST", "/api/login", readForm(e.target)); await boot(); }
    catch (err) { $("#le").textContent = err.message === "trop_de_tentatives" ? "Trop de tentatives, réessayez dans 15 minutes." : "Identifiants incorrects."; }
  };
}

// ============================================================ Cadre et navigation
const NAV = [
  ["tableau", "Tableau de bord"], ["demandes", "Demandes clients"], ["dossiers", "Dossiers"], ["clients", "Clients"],
  ["devis", "Devis"], ["factures", "Factures"], ["documents", "Documents"], ["parametres", "Paramètres"], ["equipe", "Équipe"]
];
function route() { const h = location.hash.replace(/^#\/?/, "").split("/"); return { page: h[0] || "tableau", id: h[1] || null }; }
function go(h) { location.hash = "#/" + h; }

function render() {
  if (!ME) return renderLogin();
  const r = route();
  const open = D.demandes.filter(d => ["nouvelle", "rappeler", "rdv"].includes(d.statut)).length;
  const navPage = { dossier: "dossiers", devisEdit: "devis", facture: "factures" }[r.page] || r.page;
  document.getElementById("root").innerHTML = `
  <div class="layout">
    <nav class="side">
      <div class="brand"><b>${esc(S().cabinet || "Cabinet")}</b><span>${esc(S().avocat || "Gestion du cabinet")}</span></div>
      ${NAV.filter(([k]) => ME.role === "admin" || k !== "equipe").map(([k, l]) => `<a href="#/${k}" class="${navPage === k ? "on" : ""}">${l}${k === "demandes" && open ? `<span class="pill">${open}</span>` : ""}</a>`).join("")}
      <div class="grow"></div>
      <div class="who">${esc(ME.name)}<br><button id="pw">Mot de passe</button><button id="lo">Déconnexion</button></div>
    </nav>
    <main id="main"></main>
  </div>`;
  $("#lo").onclick = async () => { await api("POST", "/api/logout"); ME = null; render(); };
  $("#pw").onclick = changePassword;
  const V = { tableau: vDashboard, demandes: vDemandes, dossiers: vDossiers, dossier: vDossier, clients: vClients, devis: r.id ? vDevisEdit : vDevis, factures: vFactures, facture: vFactureEdit, documents: vDocuments, parametres: vParametres, equipe: vEquipe };
  (V[r.page] || vDashboard)($("#main"), r.id);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => { if (ME) render(); });

// ============================================================ Tableau de bord
function vDashboard(el) {
  const dem = D.demandes.filter(d => ["nouvelle", "rappeler", "rdv"].includes(d.statut)).sort(byDesc("date"));
  const actifs = D.dossiers.filter(d => d.statut !== "clos");
  const ech = [];
  actifs.forEach(d => (d.echeances || []).filter(e => !e.fait && e.date).forEach(e => ech.push({ d, e })));
  ech.sort((a, b) => a.e.date.localeCompare(b.e.date));
  const imp = D.factures.filter(f => reste(f) > 0);
  const totImp = imp.reduce((a, f) => a + reste(f), 0), retard = imp.filter(f => f.echeance && daysTo(f.echeance) < 0);
  const y = today().slice(0, 4);
  const enc = D.factures.reduce((a, f) => a + (f.paiements || []).filter(p => (p.date || "").startsWith(y)).reduce((s, p) => s + num(p.montant), 0), 0)
    + D.dossiers.reduce((a, d) => a + (d.reglements || []).filter(r => (r.date || "").startsWith(y)).reduce((s, r) => s + num(r.montant), 0), 0);
  const soldes = actifs.filter(d => dosSolde(d) > 0), totSol = soldes.reduce((a, d) => a + dosSolde(d), 0);
  const devAtt = D.devis.filter(d => d.statut === "envoye");
  el.innerHTML = `
  <div class="head"><h1>Tableau de bord</h1><div class="sp"></div>
    <button class="btn" onclick="editDemande()">+ Demande client</button><button class="btn pri" onclick="go('facture/new')">+ Facture</button></div>
  <div class="grid kpis">
    <div class="card kpi"><div class="l">Demandes à traiter</div><div class="v">${dem.length}</div><div class="s">${dem.filter(d => d.urgence === "urgente").length} urgente(s)</div></div>
    <div class="card kpi"><div class="l">Dossiers en cours</div><div class="v">${actifs.length}</div><div class="s">${D.dossiers.length - actifs.length} clos</div></div>
    <div class="card kpi"><div class="l">Soldes d'honoraires dus</div><div class="v">${money(totSol)}</div><div class="s">${soldes.length} dossier(s) – conventions</div></div>
    <div class="card kpi"><div class="l">Factures à encaisser</div><div class="v">${money(totImp)}</div><div class="s">${retard.length} facture(s) en retard</div></div>
    <div class="card kpi"><div class="l">Encaissé en ${y}</div><div class="v">${money(enc)}</div><div class="s">Règlements datés</div></div>
    <div class="card kpi"><div class="l">Devis en attente</div><div class="v">${devAtt.length}</div><div class="s">${money(devAtt.reduce((a, d) => a + totals(d).ttc, 0))}</div></div>
  </div>
  <div class="grid two" style="margin-top:16px">
    <div class="card"><h2>Échéances à venir</h2>${ech.length ? `<table>${ech.slice(0, 10).map(({ d, e }) => {
      const n = daysTo(e.date);
      return `<tr class="click" onclick="go('dossier/${d.id}')"><td class="${n < 0 ? "late" : n <= 7 ? "soon" : ""}" style="white-space:nowrap">${fdate(e.date)}${e.heure ? " " + esc(e.heure) : ""}</td><td>${esc(e.libelle)}<div class="small muted">${esc(dosLabel(d))}</div></td></tr>`;
    }).join("")}</table>` : `<div class="empty">Aucune échéance</div>`}</div>
    <div class="card"><h2>Demandes clients non traitées</h2>${dem.length ? `<table>${dem.slice(0, 10).map(d => `
      <tr class="click" onclick="editDemande('${d.id}')"><td style="white-space:nowrap">${fdate(d.date)}</td><td><b>${esc((d.nom || "").toUpperCase())} ${esc(d.prenom)}</b> ${d.urgence === "urgente" ? '<span class="tag bad">Urgent</span>' : ""}<div class="small muted">${esc((d.objet || "").slice(0, 90))}</div></td><td>${tag(ST_DEM, d.statut)}</td></tr>`).join("")}</table>` : `<div class="empty">Tout est traité</div>`}</div>
    <div class="card"><h2>Factures à encaisser</h2>${imp.length ? `<table>${imp.sort((a, b) => (a.echeance || "").localeCompare(b.echeance || "")).slice(0, 10).map(f => `
      <tr class="click" onclick="go('facture/${f.id}')"><td>${esc(f.num)}</td><td>${esc(clientName(client(f.clientId)))}</td><td class="${f.echeance && daysTo(f.echeance) < 0 ? "late" : ""}">${fdate(f.echeance)}</td><td class="num">${money(reste(f))}</td></tr>`).join("")}</table>` : `<div class="empty">Aucune facture en attente</div>`}</div>
    <div class="card"><h2>Soldes d'honoraires à encaisser</h2>${soldes.length ? `<table>${soldes.sort((a, b) => dosSolde(b) - dosSolde(a)).slice(0, 10).map(d => `
      <tr class="click" onclick="go('dossier/${d.id}')"><td><b>${esc(d.num)}</b></td><td>${esc(d.intitule)}<div class="small muted">${esc(d.etape || "")}</div></td><td class="num late">${money(dosSolde(d))}</td></tr>`).join("")}</table>` : `<div class="empty">Aucun solde en attente</div>`}</div>
    <div class="card"><h2>Derniers dossiers</h2>${actifs.length ? `<table>${actifs.sort(byDesc("updatedAt")).slice(0, 8).map(d => `
      <tr class="click" onclick="go('dossier/${d.id}')"><td>${esc(d.num)}</td><td>${esc(d.intitule)}<div class="small muted">${esc(clientName(client(d.clientId)))}</div></td><td>${tag(ST_DOS, d.statut)}</td></tr>`).join("")}</table>` : `<div class="empty">Aucun dossier</div>`}</div>
  </div>`;
}

// ============================================================ Demandes clients (saisie secrétariat)
let demFilter = "atraiter", demQ = "";
function vDemandes(el) {
  const F = { atraiter: ["À traiter", d => ["nouvelle", "rappeler", "rdv"].includes(d.statut)], convertie: ["Dossier ouvert", d => d.statut === "convertie"], sans_suite: ["Sans suite", d => d.statut === "sans_suite"], toutes: ["Toutes", () => true] };
  const q = norm(demQ);
  const list = D.demandes.filter(F[demFilter][1]).filter(d => !q || norm([d.nom, d.prenom, d.tel, d.email, d.objet].join(" ")).includes(q)).sort(byDesc("date"));
  el.innerHTML = `
  <div class="head"><h1>Demandes clients</h1><div class="sp"></div><button class="btn pri" onclick="editDemande()">+ Nouvelle demande</button></div>
  <div class="filters"><div class="chips">${Object.entries(F).map(([k, v]) => `<button class="chip ${k === demFilter ? "on" : ""}" data-f="${k}">${v[0]} (${D.demandes.filter(v[1]).length})</button>`).join("")}</div>
    <input id="dq" placeholder="Rechercher un nom, un téléphone…" value="${esc(demQ)}"></div>
  <div class="card" style="padding:6px 8px">${list.length ? `<table>
    <tr><th>Reçue le</th><th>Contact</th><th>Coordonnées</th><th>L'affaire en un mot</th><th>Statut</th></tr>
    ${list.map(d => `<tr class="click" onclick="editDemande('${d.id}')">
      <td style="white-space:nowrap">${fdate(d.date)}<div class="small muted">${esc(d.canal || "")}</div></td>
      <td><b>${esc((d.nom || "").toUpperCase())}</b> ${esc(d.prenom)} ${d.urgence === "urgente" ? '<span class="tag bad">Urgent</span>' : ""}<div class="small muted">${esc(d.domaine || "")}</div></td>
      <td class="small">${esc(d.tel)}<br>${esc(d.email)}</td>
      <td>${esc((d.objet || "").slice(0, 140))}${d.rdv ? `<div class="small" style="margin-top:3px">RDV : ${fdate(d.rdv)} ${esc(d.rdvHeure || "")}</div>` : ""}</td>
      <td>${tag(ST_DEM, d.statut)}</td></tr>`).join("")}
  </table>` : `<div class="empty">Aucune demande</div>`}</div>`;
  $$(".chip", el).forEach(b => b.onclick = () => { demFilter = b.dataset.f; vDemandes(el); });
  const inp = $("#dq", el); inp.oninput = () => { demQ = inp.value; vDemandes(el); const n = $("#dq", el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
}

function editDemande(id) {
  const d = id ? Object.assign({}, D.demandes.find(x => x.id === id)) : { id: uid(), date: today(), statut: "nouvelle", urgence: "normale", canal: "Téléphone" };
  const s = S();
  modal(`
    <h2>${id ? "Demande de " + esc((d.nom || "").toUpperCase() + " " + (d.prenom || "")) : "Nouvelle demande client"}</h2>
    <div class="form">
      <div class="sec">Contact</div>
      <div class="f"><label>Nom *</label><input name="nom" value="${esc(d.nom)}" required></div>
      <div class="f"><label>Prénom</label><input name="prenom" value="${esc(d.prenom)}"></div>
      <div class="f"><label>Reçue le</label><input name="date" type="date" value="${esc(d.date)}"></div>
      <div class="f"><label>Téléphone</label><input name="tel" type="tel" value="${esc(d.tel)}"></div>
      <div class="f s4"><label>E-mail</label><input name="email" type="email" value="${esc(d.email)}"></div>
      <div class="sec">L'affaire</div>
      <div class="f s6"><label>Un mot sur l'affaire *</label><textarea name="objet" placeholder="Ex. : litige avec son employeur, licenciement le 3 novembre, souhaite contester…">${esc(d.objet)}</textarea></div>
      <div class="f"><label>Domaine</label><select name="domaine">${listOpts(s.domaines, d.domaine, "—")}</select></div>
      <div class="f"><label>Urgence</label><select name="urgence">${opts({ normale: "Normale", urgente: "Urgente" }, d.urgence)}</select></div>
      <div class="f"><label>Prise de contact</label><select name="canal">${listOpts(["Téléphone", "E-mail", "Passage au cabinet", "Recommandation", "Autre"], d.canal)}</select></div>
      <div class="sec">Suivi</div>
      <div class="f"><label>Statut</label><select name="statut">${opts(ST_DEM, d.statut)}</select></div>
      <div class="f"><label>Rendez-vous le</label><input name="rdv" type="date" value="${esc(d.rdv)}"></div>
      <div class="f"><label>Heure</label><input name="rdvHeure" type="time" value="${esc(d.rdvHeure)}"></div>
      <div class="f s6"><label>Notes de suivi</label><textarea name="notes" placeholder="Rappelé le…, attend des pièces…">${esc(d.notes)}</textarea></div>
    </div>
    ${id ? `<div class="small muted" style="margin-top:10px">Saisie par ${esc(D.users[d.createdBy] || "—")}${d.dossierId && dossier(d.dossierId) ? ` · <a href="#/dossier/${d.dossierId}">Dossier ${esc(dossier(d.dossierId).num)}</a>` : ""}</div>` : ""}
    <div class="actions">
      ${id ? `<button class="btn danger" id="del">Supprimer</button>` : ""}<div class="sp"></div>
      <button class="btn ghost" id="cancel">Annuler</button>
      ${!d.dossierId ? `<button class="btn" id="conv">Ouvrir un dossier</button>` : ""}
      <button class="btn pri" id="ok">Enregistrer</button>
    </div>`, (m, close) => {
    const collect = () => { const f = readForm(m); if (!f.nom) { alert("Le nom est obligatoire."); return null; } if (f.rdv && f.statut === "nouvelle") f.statut = "rdv"; return Object.assign(d, f); };
    $("#cancel", m).onclick = close;
    $("#ok", m).onclick = async () => { const o = collect(); if (!o) return; try { await save("demandes", o); close(); toast("Demande enregistrée"); render(); } catch (e) { fail(e); } };
    if ($("#del", m)) $("#del", m).onclick = async () => { if (!confirm("Supprimer cette demande ?")) return; try { await remove("demandes", d.id); close(); render(); } catch (e) { fail(e); } };
    if ($("#conv", m)) $("#conv", m).onclick = async () => { const o = collect(); if (!o) return; try { const dos = await convertDemande(o); close(); go("dossier/" + dos.id); toast("Dossier " + dos.num + " ouvert"); } catch (e) { fail(e); } };
  });
}

// Transforme une demande en client + dossier (réutilise un client existant de même nom et même téléphone / e-mail).
async function convertDemande(d) {
  let c = D.clients.find(c => norm(c.nom) === norm(d.nom) && norm(c.prenom) === norm(d.prenom) && ((d.tel && c.tel === d.tel) || (d.email && norm(c.email) === norm(d.email))));
  if (!c) c = await save("clients", { id: uid(), type: "particulier", civilite: "", nom: d.nom, prenom: d.prenom, tel: d.tel, email: d.email, adresse: "", notes: "" });
  const dos = await save("dossiers", {
    id: uid(), intitule: (d.domaine && d.domaine !== "Autre" ? d.domaine + " – " : "") + clientName(c), clientId: c.id, domaine: d.domaine || "", statut: "ouvert", premierContact: d.date || "",
    ouverture: today(), resume: d.objet || "", echeances: d.rdv ? [{ id: uid(), date: d.rdv, heure: d.rdvHeure || "", libelle: "Premier rendez-vous", fait: false }] : [],
    journal: [{ id: uid(), date: today(), texte: "Dossier ouvert depuis la demande du " + fdate(d.date) + (d.notes ? " – " + d.notes : "") }], temps: [], honoraires: "forfait", taux: ""
  });
  d.statut = "convertie"; d.dossierId = dos.id;
  await save("demandes", d);
  return dos;
}

// ============================================================ Clients
let cliQ = "";
function vClients(el) {
  const q = norm(cliQ);
  const list = D.clients.filter(c => !q || norm([clientName(c), c.tel, c.email, c.societe].join(" ")).includes(q)).sort((a, b) => clientName(a).localeCompare(clientName(b)));
  el.innerHTML = `
  <div class="head"><h1>Clients</h1><div class="sp"></div><button class="btn pri" onclick="editClient()">+ Nouveau client</button></div>
  <div class="filters"><input id="cq" placeholder="Rechercher…" value="${esc(cliQ)}"></div>
  <div class="card" style="padding:6px 8px">${list.length ? `<table>
    <tr><th>Client</th><th>Téléphone</th><th>E-mail</th><th class="num">Dossiers</th><th class="num">Reste dû</th></tr>
    ${list.map(c => { const due = D.factures.filter(f => f.clientId === c.id).reduce((a, f) => a + reste(f), 0) + D.dossiers.filter(d => d.clientId === c.id).reduce((a, d) => a + dosSolde(d), 0); return `<tr class="click" onclick="editClient('${c.id}')">
      <td><b>${esc(clientName(c))}</b>${c.type === "societe" && c.nom ? `<div class="small muted">Représentée par ${esc(c.prenom)} ${esc(c.nom)}</div>` : ""}</td><td>${esc(c.tel)}</td><td>${esc(c.email)}</td>
      <td class="num">${D.dossiers.filter(d => d.clientId === c.id).length}</td><td class="num ${due ? "late" : ""}">${due ? money(due) : "—"}</td></tr>`; }).join("")}
  </table>` : `<div class="empty">Aucun client</div>`}</div>`;
  const inp = $("#cq", el); inp.oninput = () => { cliQ = inp.value; vClients(el); const n = $("#cq", el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
}

function editClient(id, onSaved) {
  const c = id ? Object.assign({}, client(id)) : { id: uid(), type: "particulier" };
  const dossiers = id ? D.dossiers.filter(d => d.clientId === id) : [];
  modal(`
    <h2>${id ? esc(clientName(c)) : "Nouveau client"}</h2>
    <div class="form">
      <div class="f"><label>Type</label><select name="type">${opts({ particulier: "Particulier", societe: "Société / organisme" }, c.type)}</select></div>
      <div class="f s4 soc"><label>Raison sociale</label><input name="societe" value="${esc(c.societe)}"></div>
      <div class="f s1"><label>Civilité</label><select name="civilite">${listOpts(["", "M.", "Mme"], c.civilite)}</select></div>
      <div class="f"><label class="lbn">Nom *</label><input name="nom" value="${esc(c.nom)}"></div>
      <div class="f"><label>Prénom</label><input name="prenom" value="${esc(c.prenom)}"></div>
      <div class="f s1 soc"><label>RIDET</label><input name="ridet" value="${esc(c.ridet)}"></div>
      <div class="f"><label>Téléphone</label><input name="tel" value="${esc(c.tel)}"></div>
      <div class="f s4"><label>E-mail</label><input name="email" value="${esc(c.email)}"></div>
      <div class="f s6"><label>Adresse (apparaît sur les devis et factures)</label><textarea name="adresse" style="min-height:56px">${esc(c.adresse)}</textarea></div>
      <div class="f s6"><label>Notes</label><textarea name="notes">${esc(c.notes)}</textarea></div>
    </div>
    ${dossiers.length ? `<div style="margin-top:14px"><b class="small">Dossiers</b><table>${dossiers.map(d => `<tr><td><a href="#/dossier/${d.id}">${esc(d.num)}</a></td><td>${esc(d.intitule)}</td><td>${tag(ST_DOS, d.statut)}</td></tr>`).join("")}</table></div>` : ""}
    <div class="actions">${id ? `<button class="btn danger" id="del">Supprimer</button>` : ""}<div class="sp"></div>
      <button class="btn ghost" id="cancel">Annuler</button>${id ? `<button class="btn" id="nd">Nouveau dossier</button>` : ""}<button class="btn pri" id="ok">Enregistrer</button></div>`, (m, close) => {
    const sync = () => { const soc = $("[name=type]", m).value === "societe"; $$(".soc", m).forEach(x => x.style.display = soc ? "" : "none"); $(".lbn", m).textContent = soc ? "Nom du représentant" : "Nom *"; };
    $("[name=type]", m).onchange = sync; sync();
    $("#cancel", m).onclick = close;
    const doSave = async () => {
      const f = readForm(m); if (!(f.type === "societe" ? f.societe : f.nom)) { alert(f.type === "societe" ? "La raison sociale est obligatoire." : "Le nom est obligatoire."); return null; }
      try { const s = await save("clients", Object.assign(c, f)); return s; } catch (e) { fail(e); return null; }
    };
    $("#ok", m).onclick = async () => { const s = await doSave(); if (!s) return; close(); toast("Client enregistré"); if (onSaved) onSaved(s); else render(); };
    if ($("#nd", m)) $("#nd", m).onclick = async () => { const s = await doSave(); if (!s) return; close(); editDossier(null, s.id); };
    if ($("#del", m)) $("#del", m).onclick = async () => {
      if (dossiers.length || D.factures.some(f => f.clientId === id) || D.devis.some(f => f.clientId === id)) return alert("Ce client a des dossiers, devis ou factures : il ne peut pas être supprimé.");
      if (!confirm("Supprimer ce client ?")) return; try { await remove("clients", id); close(); render(); } catch (e) { fail(e); }
    };
  });
}
const clientOpts = cur => `<option value="">— Choisir un client —</option>` + D.clients.slice().sort((a, b) => clientName(a).localeCompare(clientName(b))).map(c => `<option value="${c.id}" ${c.id === cur ? "selected" : ""}>${esc(clientName(c))}</option>`).join("");

// ============================================================ Dossiers
let dosFilter = "actifs", dosQ = "";
function vDossiers(el) {
  const F = { actifs: ["En cours", d => d.statut !== "clos"], clos: ["Clos", d => d.statut === "clos"], tous: ["Tous", () => true] };
  const q = norm(dosQ);
  const list = D.dossiers.filter(F[dosFilter][1]).filter(d => !q || norm([d.num, d.intitule, clientName(client(d.clientId)), d.adverse, d.rg, d.domaine, d.etape].join(" ")).includes(q)).sort(numCmp);
  el.innerHTML = `
  <div class="head"><h1>Dossiers</h1><div class="sp"></div><button class="btn pri" onclick="editDossier()">+ Nouveau dossier</button></div>
  <div class="filters"><div class="chips">${Object.entries(F).map(([k, v]) => `<button class="chip ${k === dosFilter ? "on" : ""}" data-f="${k}">${v[0]} (${D.dossiers.filter(v[1]).length})</button>`).join("")}</div>
    <input id="oq" placeholder="N°, client, partie adverse, n° RG…" value="${esc(dosQ)}"></div>
  <div class="card" style="padding:6px 8px">${list.length ? `<table>
    <tr><th>N°</th><th>Dossier</th><th>Client</th><th>1er contact</th><th>Prochaine échéance</th><th class="num">Convention</th><th class="num">Payé à ce jour</th><th class="num">Solde</th><th>Statut</th></tr>
    ${list.map(d => { const e = nextEch(d), reg = dosRegle(d), sol = dosSolde(d); return `<tr class="click" onclick="go('dossier/${d.id}')">
      <td style="white-space:nowrap"><b>${esc(d.num)}</b></td><td><b>${esc(d.intitule)}</b><div class="small muted">${esc([d.etape, d.domaine, d.adverse ? "c/ " + d.adverse : ""].filter(Boolean).join(" · "))}</div></td>
      <td>${esc(clientName(client(d.clientId)))}</td>
      <td style="white-space:nowrap">${d.premierContact ? fdate(d.premierContact) : '<span class="muted">—</span>'}</td>
      <td>${e ? `<span class="${daysTo(e.date) < 0 ? "late" : daysTo(e.date) <= 7 ? "soon" : ""}">${fdate(e.date)}</span><div class="small muted">${esc(e.libelle)}</div>` : '<span class="muted">—</span>'}</td>
      <td class="num">${num(d.conventionMontant) ? money(num(d.conventionMontant)) : d.honoraires === "assurance" ? '<span class="small muted">Assurance</span>' : "—"}</td><td class="num">${reg ? `<b>${money(reg)}</b>${paysOf(d).map(p => `<div class="small muted">${p.date ? fdate(p.date) : "date ?"} : ${money(p.montant)}</div>`).join("")}` : "—"}</td><td class="num ${sol ? "late" : ""}">${sol ? money(sol) : "—"}</td><td>${tag(ST_DOS, d.statut)}</td></tr>`; }).join("")}
    <tr><td colspan="5" class="muted">Total</td><td class="num"><b>${money(list.reduce((a, d) => a + num(d.conventionMontant), 0))}</b></td><td class="num"><b>${money(list.reduce((a, d) => a + dosRegle(d), 0))}</b></td><td class="num"><b>${money(list.reduce((a, d) => a + dosSolde(d), 0))}</b></td><td></td></tr>
  </table>` : `<div class="empty">Aucun dossier</div>`}</div>`;
  $$(".chip", el).forEach(b => b.onclick = () => { dosFilter = b.dataset.f; vDossiers(el); });
  const inp = $("#oq", el); inp.oninput = () => { dosQ = inp.value; vDossiers(el); const n = $("#oq", el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
}
const HON = { forfait: "Forfait", horaire: "Au temps passé", resultat: "Forfait + honoraire de résultat", aj: "Aide juridictionnelle", assurance: "Protection juridique (assurance)" };
// Honoraires d'un dossier : convention, règlements reçus (acomptes hors facture + règlements de ses factures), solde.
const dosRegle = d => (d.reglements || []).reduce((a, r) => a + num(r.montant), 0) + D.factures.filter(f => f.dossierId === d.id && !f.avoir).reduce((a, f) => a + paid(f), 0);
const paysOf = d => (d.reglements || []).map(r => ({ date: r.date, montant: num(r.montant) }))
  .concat(D.factures.filter(f => f.dossierId === d.id && !f.avoir).flatMap(f => (f.paiements || []).map(p => ({ date: p.date, montant: num(p.montant) }))))
  .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
const acomptesDispo = (dosId, sauf) => { const d = dossier(dosId); if (!d) return 0; return Math.max(0, (d.reglements || []).reduce((a, r) => a + num(r.montant), 0) - D.factures.filter(f => f.dossierId === dosId && f.id !== sauf && !f.avoir).reduce((a, f) => a + num(f.impute), 0)); };
const dosSolde = d => num(d.conventionMontant) ? Math.max(0, num(d.conventionMontant) - dosRegle(d)) : 0;
const numCmp = (a, b) => ((parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0)) || String(a.num || "").localeCompare(String(b.num || ""));
const nextEch = d => (d.echeances || []).filter(e => !e.fait && e.date).sort((a, b) => a.date.localeCompare(b.date))[0];

function editDossier(id, clientId) {
  const d = id ? Object.assign({}, dossier(id)) : { id: uid(), statut: "ouvert", ouverture: today(), clientId: clientId || "", echeances: [], journal: [], temps: [], honoraires: "forfait" };
  const s = S();
  modal(`
    <h2>${id ? "Dossier " + esc(d.num) : "Nouveau dossier"}</h2>
    <div class="form">
      <div class="f s1"><label>N° dossier</label><input name="num" value="${esc(d.num)}" placeholder="${id ? "" : "Auto"}"></div>
      <div class="f s3"><label>Intitulé *</label><input name="intitule" value="${esc(d.intitule)}" placeholder="Ex. : Divorce DUPONT / MARTIN"></div>
      <div class="f"><label>Statut</label><select name="statut">${opts(ST_DOS, d.statut)}</select></div>
      <div class="f s6"><label>Situation du dossier</label><input name="etape" list="etl" value="${esc(d.etape)}" placeholder="Ex. : 1ère instance, Appel, Mise en état, Attente jugement…"><datalist id="etl">${["Consultation", "Convention", "En cours", "Mise en état", "1ère instance", "Jugé en première instance", "Appel", "Attente appel CA", "Liquidation", "Exécution", "Prise en charge par l'assurance"].map(x => `<option>${x}</option>`).join("")}</datalist></div>
      <div class="f s4"><label>Client *</label><select name="clientId">${clientOpts(d.clientId)}</select></div>
      <div class="f"><label>&nbsp;</label><button class="btn" type="button" id="nc">+ Nouveau client</button></div>
      <div class="f"><label>Domaine</label><select name="domaine">${listOpts(s.domaines, d.domaine, "—")}</select></div>
      <div class="f"><label>Partie adverse</label><input name="adverse" value="${esc(d.adverse)}"></div>
      <div class="f"><label>Avocat adverse</label><input name="avocatAdverse" value="${esc(d.avocatAdverse)}"></div>
      <div class="f s4"><label>Juridiction</label><input name="juridiction" list="jl" value="${esc(d.juridiction)}"><datalist id="jl">${JURIDICTIONS.map(j => `<option>${esc(j)}</option>`).join("")}</datalist></div>
      <div class="f"><label>N° RG / référence</label><input name="rg" value="${esc(d.rg)}"></div>
      <div class="f"><label>Date de premier contact</label><input name="premierContact" type="date" value="${esc(d.premierContact)}"></div>
      <div class="f"><label>Ouvert le</label><input name="ouverture" type="date" value="${esc(d.ouverture)}"></div>
      <div class="sec">Honoraires</div>
      <div class="f"><label>Mode</label><select name="honoraires">${opts(HON, d.honoraires)}</select></div>
      <div class="f"><label>Montant de la convention (F)</label><input name="conventionMontant" inputmode="numeric" value="${esc(d.conventionMontant)}"></div>
      <div class="f"><label>Convention signée le</label><input name="conventionDate" type="date" value="${esc(d.conventionDate)}"></div>
      <div class="f"><label>Aide juridictionnelle</label><select name="aj">${listOpts(["", "AJ", "AJMP", "AJP"], d.aj)}</select></div>
      <div class="f"><label>Taux horaire HT (F)</label><input name="taux" inputmode="numeric" value="${esc(d.taux || s.tauxHoraire || "")}"></div>
      <div class="f s6"><label>Résumé de l'affaire</label><textarea name="resume">${esc(d.resume)}</textarea></div>
    </div>
    <div class="actions">${id ? `<button class="btn danger" id="del">Supprimer</button>` : ""}<div class="sp"></div><button class="btn ghost" id="cancel">Annuler</button><button class="btn pri" id="ok">Enregistrer</button></div>`, (m, close) => {
    $("#cancel", m).onclick = close;
    $("#nc", m).onclick = () => editClient(null, c => { $("[name=clientId]", m).innerHTML = clientOpts(c.id); });
    $("#ok", m).onclick = async () => {
      const f = readForm(m); if (!f.intitule || !f.clientId) return alert("L'intitulé et le client sont obligatoires.");
      f.conventionMontant = f.conventionMontant ? num(f.conventionMontant) : "";
      try { const s = await save("dossiers", Object.assign(d, f)); close(); toast(id ? "Dossier enregistré" : "Dossier " + s.num + " ouvert"); id ? render() : go("dossier/" + s.id); } catch (e) { fail(e); }
    };
    if ($("#del", m)) $("#del", m).onclick = async () => {
      if (D.factures.some(f => f.dossierId === id) || D.devis.some(f => f.dossierId === id)) return alert("Ce dossier a des devis ou des factures : passez-le plutôt en « Clos ».");
      if (!confirm("Supprimer définitivement ce dossier ?")) return; try { await remove("dossiers", id); close(); go("dossiers"); } catch (e) { fail(e); }
    };
  });
}

function vDossier(el, id) {
  const d = dossier(id); if (!d) { el.innerHTML = `<div class="empty">Dossier introuvable</div>`; return; }
  const c = client(d.clientId);
  const devis = D.devis.filter(x => x.dossierId === id).sort(byDesc("date")), facts = D.factures.filter(x => x.dossierId === id).sort(byDesc("date"));
  const temps = (d.temps || []).slice().sort(byDesc("date")), nonFact = temps.filter(t => !t.factureId);
  const hNon = nonFact.reduce((a, t) => a + num(t.heures), 0), hTot = temps.reduce((a, t) => a + num(t.heures), 0);
  const ech = (d.echeances || []).slice().sort((a, b) => (a.fait - b.fait) || String(a.date).localeCompare(String(b.date)));
  const facTot = facts.filter(f => f.statut === "emise").reduce((a, f) => a + totals(f).ttc, 0), encTot = facts.reduce((a, f) => a + paid(f), 0);
  el.innerHTML = `
  <div class="head"><div><div class="small muted"><a href="#/dossiers">Dossiers</a> › ${esc(d.num)}</div><h1>${esc(d.intitule)}</h1></div><div class="sp"></div>
    ${tag(ST_DOS, d.statut)}<button class="btn" id="ed">Modifier</button><button class="btn" id="cv">Convention</button><button class="btn" id="nd">+ Devis</button><button class="btn pri" id="nf">+ Facture</button></div>
  <div class="grid two">
    <div class="card"><h2>Informations</h2><dl class="kv">
      <dt>Client</dt><dd><a href="javascript:editClient('${c ? c.id : ""}')">${esc(clientName(c))}</a>${c ? `<div class="small muted">${esc([c.tel, c.email].filter(Boolean).join(" · "))}</div>` : ""}</dd>
      ${d.domaine ? `<dt>Domaine</dt><dd>${esc(d.domaine)}</dd>` : ""}
      ${d.adverse ? `<dt>Partie adverse</dt><dd>${esc(d.adverse)}${d.avocatAdverse ? `<div class="small muted">Conseil : ${esc(d.avocatAdverse)}</div>` : ""}</dd>` : ""}
      ${d.juridiction ? `<dt>Juridiction</dt><dd>${esc(d.juridiction)}${d.rg ? ` – RG ${esc(d.rg)}` : ""}</dd>` : d.rg ? `<dt>Référence</dt><dd>${esc(d.rg)}</dd>` : ""}
      ${d.etape ? `<dt>Situation</dt><dd><b>${esc(d.etape)}</b></dd>` : ""}
      <dt>Premier contact</dt><dd>${d.premierContact ? fdate(d.premierContact) : '<span class="muted">—</span>'}</dd>
      ${d.ouverture ? `<dt>Ouvert le</dt><dd>${fdate(d.ouverture)}</dd>` : ""}
      ${facTot ? `<dt>Facturé / encaissé</dt><dd>${money(facTot)} / ${money(encTot)}</dd>` : ""}
    </dl>${d.resume ? `<p style="white-space:pre-wrap;margin:14px 0 0">${esc(d.resume)}</p>` : ""}</div>
    <div class="card"><div class="head" style="margin-bottom:8px"><h2 style="margin:0">Honoraires et règlements</h2><div class="sp"></div><button class="btn sm pri" id="ar">+ Règlement reçu</button></div>
      <dl class="kv">
        <dt>Mode</dt><dd>${esc(HON[d.honoraires] || "—")}${d.aj ? ` – ${esc(d.aj)}` : ""}${d.taux && d.honoraires === "horaire" ? ` – ${money(num(d.taux))} HT / h` : ""}</dd>
        <dt>Convention</dt><dd>${num(d.conventionMontant) ? money(num(d.conventionMontant)) : "—"}${d.conventionDate ? ` <span class="small muted">signée le ${fdate(d.conventionDate)}</span>` : d.conventionNote ? ` <span class="small muted">${esc(d.conventionNote)}</span>` : ""}</dd>
        <dt>Payé à ce jour</dt><dd><b>${money(dosRegle(d))}</b></dd>
        ${num(d.conventionMontant) ? `<dt>Solde dû</dt><dd class="${dosSolde(d) ? "late" : ""}"><b>${money(dosSolde(d))}</b>${dosSolde(d) ? "" : ' <span class="tag ok">Soldé</span>'}</dd>` : ""}
      </dl>
      ${(d.reglements || []).length ? `<table style="margin-top:10px">${d.reglements.map(r => `<tr><td style="white-space:nowrap">${r.date ? fdate(r.date) : '<span class="muted">date ?</span>'}</td><td>${esc([r.mode, r.ref].filter(Boolean).join(" – "))}</td><td class="num">${money(num(r.montant))}</td><td class="num"><button class="btn sm ghost" data-delreg="${r.id}">×</button></td></tr>`).join("")}</table>` : ""}
      ${facts.some(f => paid(f) > 0) ? `<div class="small muted" style="margin-top:6px">Inclut les règlements enregistrés sur les factures du dossier.</div>` : ""}</div>
    <div class="card"><div class="head" style="margin-bottom:8px"><h2 style="margin:0">Échéances et audiences</h2><div class="sp"></div><button class="btn sm" id="ae">+ Ajouter</button></div>
      ${ech.length ? `<table>${ech.map(e => { const n = daysTo(e.date); return `<tr><td style="width:26px"><input type="checkbox" data-ech="${e.id}" ${e.fait ? "checked" : ""} title="Fait"></td>
        <td style="white-space:nowrap" class="${e.fait ? "muted" : n < 0 ? "late" : n <= 7 ? "soon" : ""}">${fdate(e.date)} ${esc(e.heure || "")}</td><td class="${e.fait ? "muted" : ""}" style="${e.fait ? "text-decoration:line-through" : ""}">${esc(e.libelle)}</td>
        <td class="num"><button class="btn sm ghost" data-delech="${e.id}">×</button></td></tr>`; }).join("")}</table>` : `<div class="empty">Aucune échéance</div>`}</div>
    <div class="card"><div class="head" style="margin-bottom:8px"><h2 style="margin:0">Suivi du dossier</h2><div class="sp"></div></div>
      <div style="display:flex;gap:8px;margin-bottom:10px"><input id="jt" placeholder="Ajouter une note (appel, courrier, audience…)" style="flex:1;border:1px solid var(--line);border-radius:6px;padding:8px 10px"><button class="btn" id="aj">Ajouter</button></div>
      ${(d.journal || []).length ? `<ul class="timeline">${d.journal.slice().sort(byDesc("date")).map(j => `<li><span class="small muted">${fdate(j.date)}${j.by ? " · " + esc(D.users[j.by] || "") : ""}</span><div style="white-space:pre-wrap">${esc(j.texte)}</div></li>`).join("")}</ul>` : `<div class="empty">Aucune note</div>`}</div>
    <div class="card"><div class="head" style="margin-bottom:8px"><h2 style="margin:0">Temps passé</h2><div class="sp"></div>
      ${hNon ? `<button class="btn sm" id="ft">Facturer ${String(hNon).replace(".", ",")} h</button>` : ""}<button class="btn sm" id="at">+ Saisir</button></div>
      ${temps.length ? `<table>${temps.map(t => `<tr><td style="white-space:nowrap">${fdate(t.date)}</td><td>${esc(t.desc)}</td><td class="num">${String(num(t.heures)).replace(".", ",")} h</td><td>${t.factureId ? '<span class="tag ok">Facturé</span>' : `<button class="btn sm ghost" data-deltps="${t.id}">×</button>`}</td></tr>`).join("")}
        <tr><td></td><td class="muted">Total</td><td class="num"><b>${String(hTot).replace(".", ",")} h</b></td><td></td></tr></table>` : `<div class="empty">Aucun temps saisi</div>`}</div>
    <div class="card"><div class="head" style="margin-bottom:8px"><h2 style="margin:0">Documents du dossier</h2><div class="sp"></div><button class="btn sm" id="adddoc">+ Déposer un document</button></div>
      ${docsOf(id).length ? `<table>${docsOf(id).map(x => docRow(x)).join("")}</table>` : `<div class="empty">Aucun document – les conventions générées et les factures émises s'y classent automatiquement</div>`}</div>
    <div class="card"><h2>Devis</h2>${devis.length ? `<table>${devis.map(x => `<tr class="click" onclick="go('devis/${x.id}')"><td>${esc(x.num)}</td><td>${fdate(x.date)}</td><td class="num">${money(totals(x).ttc)}</td><td>${tag(ST_DEV, x.statut)}</td><td class="num"><button class="btn sm" onclick="event.stopPropagation();voirDevis('${x.id}')">Voir</button></td></tr>`).join("")}</table>` : `<div class="empty">Aucun devis</div>`}</div>
    <div class="card"><h2>Factures</h2>${facts.length ? `<table>${facts.map(f => { const st = factState(f); return `<tr class="click" onclick="go('facture/${f.id}')"><td>${esc(f.num || "Brouillon")}</td><td>${fdate(f.date)}</td><td class="num">${money(totals(f).ttc)}</td><td><span class="tag ${st[1]}">${st[0]}</span></td><td class="num"><button class="btn sm" onclick="event.stopPropagation();voirFacture('${f.id}')">Voir</button></td></tr>`; }).join("")}</table>` : `<div class="empty">Aucune facture</div>`}</div>
  </div>`;
  bindDocRows(el);
  $("#adddoc").onclick = () => deposerDocument(id);
  const upd = async (fn, msg) => { const o = JSON.parse(JSON.stringify(dossier(id))); fn(o); try { await save("dossiers", o); if (msg) toast(msg); render(); } catch (e) { fail(e); } };
  $("#ed").onclick = () => editDossier(id);
  $("#cv").onclick = () => conventionDialog(id);
  $("#nd").onclick = () => go(`devis/new?dossier=${id}`);
  $("#nf").onclick = () => go(`facture/new?dossier=${id}`);
  $("#aj").onclick = () => { const t = $("#jt").value.trim(); if (t) upd(o => (o.journal = o.journal || []).push({ id: uid(), date: today(), texte: t, by: ME.id })); };
  $("#jt").onkeydown = e => { if (e.key === "Enter") $("#aj").click(); };
  $$("[data-ech]").forEach(cb => cb.onchange = () => upd(o => { const e = o.echeances.find(x => x.id === cb.dataset.ech); e.fait = cb.checked; }));
  $$("[data-delech]").forEach(b => b.onclick = () => confirm("Supprimer cette échéance ?") && upd(o => o.echeances = o.echeances.filter(x => x.id !== b.dataset.delech)));
  $$("[data-delreg]").forEach(b => b.onclick = () => confirm("Supprimer ce règlement ?") && upd(o => o.reglements = o.reglements.filter(x => x.id !== b.dataset.delreg)));
  $("#ar").onclick = () => modal(`<h2>Règlement reçu – dossier ${esc(d.num)}</h2><div class="form">
      <div class="f"><label>Date</label><input name="date" type="date" value="${today()}"></div>
      <div class="f"><label>Montant (F) *</label><input name="montant" inputmode="numeric" value="${dosSolde(d) || ""}"></div>
      <div class="f"><label>Mode</label><select name="mode">${listOpts(["Virement", "Chèque", "Espèces", "Carte bancaire", "Aide juridictionnelle", "Assurance"], "Virement")}</select></div>
      <div class="f s6"><label>Libellé / référence</label><input name="ref" placeholder="Acompte, solde, n° de chèque…"></div></div>
      <div class="small muted" style="margin-top:8px">Pour un règlement lié à une facture émise, enregistrez-le plutôt sur la facture.</div>
      <div class="actions"><div class="sp"></div><button class="btn ghost" id="c">Annuler</button><button class="btn pri" id="o">Enregistrer</button></div>`, (m, close) => {
    $("#c", m).onclick = close;
    $("#o", m).onclick = () => { const f = readForm(m); f.montant = num(f.montant); if (!f.montant) return alert("Montant obligatoire."); close(); upd(o => (o.reglements = o.reglements || []).push(Object.assign({ id: uid() }, f)), "Règlement enregistré"); };
  });
  $$("[data-deltps]").forEach(b => b.onclick = () => confirm("Supprimer cette saisie ?") && upd(o => o.temps = o.temps.filter(x => x.id !== b.dataset.deltps)));
  $("#ae").onclick = () => modal(`<h2>Nouvelle échéance</h2><div class="form">
      <div class="f"><label>Date *</label><input name="date" type="date" value="${today()}"></div><div class="f"><label>Heure</label><input name="heure" type="time"></div>
      <div class="f s6"><label>Libellé *</label><input name="libelle" list="el" placeholder="Audience, dépôt de conclusions, délai d'appel…"><datalist id="el">${["Audience", "Audience de plaidoirie", "Audience de mise en état", "Dépôt des conclusions", "Délai d'appel", "Rendez-vous client", "Médiation / conciliation", "Expertise"].map(x => `<option>${x}</option>`).join("")}</datalist></div></div>
      <div class="actions"><div class="sp"></div><button class="btn ghost" id="c">Annuler</button><button class="btn pri" id="o">Ajouter</button></div>`, (m, close) => {
    $("#c", m).onclick = close;
    $("#o", m).onclick = () => { const f = readForm(m); if (!f.date || !f.libelle) return alert("Date et libellé obligatoires."); close(); upd(o => (o.echeances = o.echeances || []).push(Object.assign({ id: uid(), fait: false }, f)), "Échéance ajoutée"); };
  });
  $("#at").onclick = () => modal(`<h2>Saisir du temps</h2><div class="form">
      <div class="f"><label>Date</label><input name="date" type="date" value="${today()}"></div><div class="f"><label>Durée (heures) *</label><input name="heures" inputmode="decimal" placeholder="1,5"></div>
      <div class="f s6"><label>Diligence *</label><input name="desc" placeholder="Rédaction des conclusions, rendez-vous client…"></div></div>
      <div class="actions"><div class="sp"></div><button class="btn ghost" id="c">Annuler</button><button class="btn pri" id="o">Ajouter</button></div>`, (m, close) => {
    $("#c", m).onclick = close;
    $("#o", m).onclick = () => { const f = readForm(m); if (!num(f.heures) || !f.desc) return alert("Durée et diligence obligatoires."); f.heures = num(f.heures); close(); upd(o => (o.temps = o.temps || []).push(Object.assign({ id: uid(), by: ME.id }, f)), "Temps ajouté"); };
  });
  if ($("#ft")) $("#ft").onclick = async () => {
    const taux = num(d.taux || S().tauxHoraire);
    if (!taux) return alert("Renseignez d'abord le taux horaire du dossier (bouton « Modifier »).");
    const f = { id: uid(), statut: "brouillon", date: today(), echeance: addDays(today(), +S().delai || 30), clientId: d.clientId, dossierId: id, objet: d.intitule, tgc: S().tgc,
      lignes: nonFact.slice().sort((a, b) => a.date.localeCompare(b.date)).map(t => ({ type: "hon", desc: fdate(t.date) + " – " + t.desc, qte: num(t.heures), pu: taux })), paiements: [], tempsIds: nonFact.map(t => t.id) };
    try {
      const s = await save("factures", f);
      const o = JSON.parse(JSON.stringify(dossier(id))); o.temps.forEach(t => { if (f.tempsIds.includes(t.id)) t.factureId = s.id; }); await save("dossiers", o);
      go("facture/" + s.id); toast("Facture préparée à partir du temps passé");
    } catch (e) { fail(e); }
  };
}

// ============================================================ Devis et factures : listes
let factFilter = "toutes";
function vDevis(el) {
  const list = D.devis.slice().sort(byDesc("num"));
  el.innerHTML = `
  <div class="head"><h1>Devis</h1><div class="sp"></div><button class="btn pri" onclick="go('devis/new')">+ Nouveau devis</button></div>
  <div class="card" style="padding:6px 8px">${list.length ? `<table><tr><th>N°</th><th>Date</th><th>Client</th><th>Objet</th><th class="num">Total TTC</th><th>Statut</th></tr>
    ${list.map(x => `<tr class="click" onclick="go('devis/${x.id}')"><td>${esc(x.num)}</td><td>${fdate(x.date)}</td><td>${esc(clientName(client(x.clientId)))}</td><td>${esc(x.objet)}</td><td class="num">${money(totals(x).ttc)}</td><td>${tag(ST_DEV, x.statut)}${x.factureId ? ' <span class="tag ok">Facturé</span>' : ""}</td></tr>`).join("")}</table>` : `<div class="empty">Aucun devis</div>`}</div>`;
}
function vFactures(el) {
  const F = { toutes: ["Toutes", () => true], impayees: ["À encaisser", f => reste(f) > 0], retard: ["En retard", f => reste(f) > 0 && f.echeance && daysTo(f.echeance) < 0], payees: ["Payées", f => f.statut === "emise" && !f.avoir && reste(f) === 0], brouillons: ["Brouillons", f => f.statut !== "emise"] };
  const list = D.factures.filter(F[factFilter][1]).sort((a, b) => (b.num || "~").localeCompare(a.num || "~") || byDesc("date")(a, b));
  const sum = k => list.filter(f => f.statut === "emise").reduce((a, f) => a + k(f), 0);
  el.innerHTML = `
  <div class="head"><h1>Factures</h1><div class="sp"></div><button class="btn pri" onclick="go('facture/new')">+ Nouvelle facture</button></div>
  <div class="filters"><div class="chips">${Object.entries(F).map(([k, v]) => `<button class="chip ${k === factFilter ? "on" : ""}" data-f="${k}">${v[0]} (${D.factures.filter(v[1]).length})</button>`).join("")}</div></div>
  <div class="card" style="padding:6px 8px">${list.length ? `<table><tr><th>N°</th><th>Date</th><th>Client</th><th>Dossier</th><th class="num">Total TTC</th><th class="num">Reste dû</th><th>Échéance</th><th>État</th></tr>
    ${list.map(f => { const st = factState(f); return `<tr class="click" onclick="go('facture/${f.id}')"><td>${esc(f.num || "—")}</td><td>${fdate(f.date)}</td><td>${esc(clientName(client(f.clientId)))}</td><td class="small">${esc(dossier(f.dossierId) ? dossier(f.dossierId).num : "")}</td>
      <td class="num">${money(totals(f).ttc)}</td><td class="num">${reste(f) ? money(reste(f)) : "—"}</td><td>${fdate(f.echeance)}</td><td><span class="tag ${st[1]}">${st[0]}</span></td></tr>`; }).join("")}
    <tr><td colspan="4" class="muted">Total (factures émises)</td><td class="num"><b>${money(sum(f => totals(f).ttc))}</b></td><td class="num"><b>${money(sum(reste))}</b></td><td colspan="2"></td></tr></table>` : `<div class="empty">Aucune facture</div>`}</div>`;
  $$(".chip", el).forEach(b => b.onclick = () => { factFilter = b.dataset.f; vFactures(el); });
}

// ============================================================ Éditeur commun devis / facture
function linesEditor(doc, locked) {
  return `<table class="lines"><tr><th class="ty">Nature</th><th>Désignation</th><th class="q num">Qté / h</th><th class="pu num">P.U. HT (F)</th><th class="num">Montant HT</th><th></th></tr>
  ${(doc.lignes || []).map((l, i) => `<tr>
    <td><select data-l="${i}" data-k="type" ${locked ? "disabled" : ""}><option value="hon" ${l.type !== "deb" ? "selected" : ""}>Honoraires</option><option value="deb" ${l.type === "deb" ? "selected" : ""}>Débours / frais</option></select></td>
    <td><input data-l="${i}" data-k="desc" value="${esc(l.desc)}" ${locked ? "disabled" : ""}></td>
    <td><input data-l="${i}" data-k="qte" value="${esc(l.qte)}" style="text-align:right" ${locked ? "disabled" : ""}></td>
    <td><input data-l="${i}" data-k="pu" value="${esc(l.pu)}" style="text-align:right" ${locked ? "disabled" : ""}></td>
    <td class="num" data-m="${i}">${money(num(l.qte) * num(l.pu))}</td>
    <td>${locked ? "" : `<button class="btn sm ghost" data-rm="${i}">×</button>`}</td></tr>`).join("")}
  </table>${locked ? "" : `<button class="btn sm" id="addl" style="margin-top:6px">+ Ligne</button> <button class="btn sm" id="addd" style="margin-top:6px">+ Débours</button>`}
  <div class="totals" id="tot"></div>`;
}
function totalsHtml(doc) {
  const t = totals(doc), p = doc.paiements ? paid(doc) : 0, imp = num(doc.impute);
  return `<div><span>Honoraires HT</span><span>${money(t.hon)}</span></div><div><span>TGC ${String(t.taux).replace(".", ",")} %</span><span>${money(t.tgc)}</span></div>
    ${t.deb ? `<div><span>Débours (non soumis)</span><span>${money(t.deb)}</span></div>` : ""}<div class="big"><span>Total TTC</span><span>${money(t.ttc)}</span></div>
    ${doc.paiements && !doc.avoir && imp ? `<div><span>Moins acomptes versés</span><span>- ${money(imp)}</span></div>` : ""}
    ${doc.paiements && doc.statut === "emise" && !doc.avoir && p ? `<div><span>Règlements reçus</span><span>- ${money(p)}</span></div>` : ""}
    ${doc.paiements && !doc.avoir && (imp || (doc.statut === "emise" && p)) ? `<div class="big"><span>Solde net à payer</span><span>${money(Math.max(0, t.ttc - imp - (doc.statut === "emise" ? p : 0)))}</span></div>` : ""}`;
}
function bindLines(root, doc, locked, rerender) {
  const refresh = () => { $("#tot", root).innerHTML = totalsHtml(doc); (doc.lignes || []).forEach((l, i) => { const c = $(`[data-m="${i}"]`, root); if (c) c.textContent = money(num(l.qte) * num(l.pu)); }); };
  refresh();
  if (locked) return;
  $$("[data-l]", root).forEach(inp => inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => { doc.lignes[+inp.dataset.l][inp.dataset.k] = inp.value; refresh(); }));
  $$("[data-rm]", root).forEach(b => b.onclick = () => { doc.lignes.splice(+b.dataset.rm, 1); rerender(); });
  $("#addl", root).onclick = () => { doc.lignes.push({ type: "hon", desc: "", qte: 1, pu: "" }); rerender(); $$("[data-k=desc]", root).pop().focus(); };
  $("#addd", root).onclick = () => { doc.lignes.push({ type: "deb", desc: "Frais de greffe / signification", qte: 1, pu: "" }); rerender(); };
}
function qparam(k) { const m = location.hash.match(new RegExp("[?&]" + k + "=([^&]+)")); return m ? decodeURIComponent(m[1]) : ""; }

let curDoc = null;
function vDevisEdit(el, rawId) {
  const id = rawId.split("?")[0];
  if (!curDoc || curDoc._key !== "devis:" + id) {
    if (id === "new") {
      const dos = dossier(qparam("dossier"));
      curDoc = { id: uid(), _new: true, statut: "brouillon", date: today(), validite: addDays(today(), +S().validite || 30), clientId: dos ? dos.clientId : "", dossierId: dos ? dos.id : "", objet: dos ? dos.intitule : "", tgc: S().tgc, lignes: [{ type: "hon", desc: "", qte: 1, pu: "" }], conditions: "" };
    } else { const x = D.devis.find(x => x.id === id); if (!x) { el.innerHTML = `<div class="empty">Devis introuvable</div>`; return; } curDoc = JSON.parse(JSON.stringify(x)); }
    curDoc._key = "devis:" + id;
  }
  const doc = curDoc, locked = !!doc.factureId;
  const dosOpts = `<option value="">— Aucun —</option>` + D.dossiers.filter(d => !doc.clientId || d.clientId === doc.clientId).map(d => `<option value="${d.id}" ${d.id === doc.dossierId ? "selected" : ""}>${esc(dosLabel(d))}</option>`).join("");
  el.innerHTML = `
  <div class="head"><div><div class="small muted"><a href="#/devis">Devis</a> › ${esc(doc.num || "Nouveau")}</div><h1>${doc.num ? "Devis " + esc(doc.num) : "Nouveau devis"}</h1></div><div class="sp"></div>
    ${doc._new ? "" : `<button class="btn" id="pdf">Voir le devis</button>${doc.factureId ? `<button class="btn" onclick="go('facture/${doc.factureId}')">Voir la facture</button>` : `<button class="btn" id="tof">Transformer en facture</button>`}`}
    <button class="btn pri" id="sv">Enregistrer</button></div>
  <div class="card">
    <div class="form">
      <div class="f s3"><label>Client *</label><select name="clientId">${clientOpts(doc.clientId)}</select></div>
      <div class="f s3"><label>Dossier</label><select name="dossierId">${dosOpts}</select></div>
      <div class="f s4"><label>Objet</label><input name="objet" value="${esc(doc.objet)}"></div>
      <div class="f"><label>Statut</label><select name="statut">${opts(ST_DEV, doc.statut)}</select></div>
      <div class="f s1"><label>TGC %</label><input name="tgc" value="${esc(doc.tgc)}"></div>
      <div class="f"><label>Date</label><input name="date" type="date" value="${esc(doc.date)}"></div>
      <div class="f"><label>Valable jusqu'au</label><input name="validite" type="date" value="${esc(doc.validite)}"></div>
    </div>
    <div style="margin-top:18px">${linesEditor(doc, locked)}</div>
    <div class="form" style="margin-top:14px"><div class="f s6"><label>Conditions / modalités (provision, échéancier…)</label><textarea name="conditions">${esc(doc.conditions)}</textarea></div></div>
    <div class="actions">${doc._new ? "" : `<button class="btn danger" id="del">Supprimer</button>`}<div class="sp"></div></div>
  </div>`;
  const rer = () => vDevisEdit(el, rawId);
  $$(".form [name]", el).forEach(i => i.addEventListener("change", () => { doc[i.name] = i.value; if (i.name === "clientId") { doc.dossierId = ""; rer(); } if (i.name === "tgc") $("#tot", el).innerHTML = totalsHtml(doc); }));
  $("[name=tgc]", el).addEventListener("input", e => { doc.tgc = e.target.value; $("#tot", el).innerHTML = totalsHtml(doc); });
  bindLines(el, doc, locked, rer);
  const doSave = async () => { $$(".form [name]", el).forEach(i => doc[i.name] = i.value); if (!doc.clientId) { alert("Choisissez un client."); return null; } const o = Object.assign({}, doc); delete o._new; delete o._key; try { const s = await save("devis", o); curDoc = Object.assign(JSON.parse(JSON.stringify(s)), { _key: "devis:" + s.id }); return s; } catch (e) { fail(e); return null; } };
  $("#sv").onclick = async () => { const s = await doSave(); if (s) { toast("Devis " + s.num + " enregistré"); if (rawId.startsWith("new")) go("devis/" + s.id); else rer(); } };
  if ($("#pdf")) $("#pdf").onclick = async () => { const s = await doSave(); if (s) openViewer(Object.assign(pdfDoc(s, "devis"), { title: "Devis " + s.num })); };
  if ($("#tof")) $("#tof").onclick = async () => {
    const s = await doSave(); if (!s) return;
    const f = { id: uid(), statut: "brouillon", date: today(), echeance: addDays(today(), +S().delai || 30), clientId: s.clientId, dossierId: s.dossierId, objet: s.objet, tgc: s.tgc, lignes: JSON.parse(JSON.stringify(s.lignes)), paiements: [], devisId: s.id, devisNum: s.num };
    try { const fs = await save("factures", f); await save("devis", Object.assign({}, s, { statut: "accepte", factureId: fs.id })); curDoc = null; go("facture/" + fs.id); toast("Facture préparée depuis le devis"); } catch (e) { fail(e); }
  };
  if ($("#del")) $("#del").onclick = async () => { if (!confirm("Supprimer ce devis ?")) return; try { await remove("devis", doc.id); curDoc = null; go("devis"); } catch (e) { fail(e); } };
}

function vFactureEdit(el, rawId) {
  const id = rawId.split("?")[0];
  if (!curDoc || curDoc._key !== "facture:" + id) {
    if (id === "new") {
      const dos = dossier(qparam("dossier"));
      curDoc = { id: uid(), _new: true, statut: "brouillon", date: today(), echeance: addDays(today(), +S().delai || 30), clientId: dos ? dos.clientId : "", dossierId: dos ? dos.id : "", objet: dos ? dos.intitule : "", tgc: S().tgc, lignes: [{ type: "hon", desc: "", qte: 1, pu: "" }], paiements: [] };
    } else { const x = D.factures.find(x => x.id === id); if (!x) { el.innerHTML = `<div class="empty">Facture introuvable</div>`; return; } curDoc = JSON.parse(JSON.stringify(x)); }
    curDoc._key = "facture:" + id;
  }
  const doc = curDoc, locked = doc.statut === "emise";
  const st = factState(doc), t = totals(doc);
  const dosOpts = `<option value="">— Aucun —</option>` + D.dossiers.filter(d => !doc.clientId || d.clientId === doc.clientId).map(d => `<option value="${d.id}" ${d.id === doc.dossierId ? "selected" : ""}>${esc(dosLabel(d))}</option>`).join("");
  el.innerHTML = `
  <div class="head"><div><div class="small muted"><a href="#/factures">Factures</a> › ${esc(doc.num || "Brouillon")}</div><h1>${doc.avoir ? "Avoir" : "Facture"} ${esc(doc.num || "(brouillon)")}</h1></div><div class="sp"></div>
    <span class="tag ${st[1]}">${st[0]}</span>
    ${doc._new ? "" : `<button class="btn" id="pdf">${locked ? "Voir la facture" : "Aperçu"}</button>`}${D.documents.some(x => x.refId === doc.id) ? `<button class="btn" id="arch">Copie archivée</button>` : ""}
    ${locked ? (doc.avoir ? "" : `<button class="btn" id="av">Établir un avoir</button>`) : `<button class="btn" id="sv">Enregistrer le brouillon</button><button class="btn pri" id="em">Émettre la facture</button>`}</div>
  ${locked ? `<div class="small muted" style="margin:-10px 0 14px">Facture émise : son contenu et son numéro ne peuvent plus être modifiés. Pour la corriger, établissez un avoir.</div>` : ""}
  ${doc.devisNum ? `<div class="small muted" style="margin:-10px 0 14px">Établie depuis le devis ${esc(doc.devisNum)}</div>` : ""}
  <div class="card">
    <div class="form">
      <div class="f s3"><label>Client *</label><select name="clientId" ${locked ? "disabled" : ""}>${clientOpts(doc.clientId)}</select></div>
      <div class="f s3"><label>Dossier</label><select name="dossierId" ${locked ? "disabled" : ""}>${dosOpts}</select></div>
      <div class="f s4"><label>Objet</label><input name="objet" value="${esc(doc.objet)}" ${locked ? "disabled" : ""}></div>
      <div class="f s1"><label>TGC %</label><input name="tgc" value="${esc(doc.tgc)}" ${locked ? "disabled" : ""}></div>
      <div class="f s1"><label>Date</label><input name="date" type="date" value="${esc(doc.date)}" ${locked ? "disabled" : ""}></div>
      <div class="f"><label>Échéance de paiement</label><input name="echeance" type="date" value="${esc(doc.echeance)}"></div>
      ${doc.avoir ? "" : `<div class="f"><label>Acomptes déjà versés à déduire (F)</label><input name="impute" inputmode="numeric" value="${esc(doc.impute)}" ${locked ? "disabled" : ""}></div>
      <div class="f s3 small muted" style="justify-content:flex-end">${doc.dossierId && !locked ? `Acomptes versés sur le dossier et non encore déduits : <b>${money(acomptesDispo(doc.dossierId, doc.id))}</b> ${acomptesDispo(doc.dossierId, doc.id) ? `<a href="javascript:void(0)" id="useimp">Déduire</a>` : ""}` : ""}</div>`}
    </div>
    <div style="margin-top:18px">${linesEditor(doc, locked)}</div>
  </div>
  ${locked && !doc.avoir ? `<div class="card" style="margin-top:16px"><div class="head" style="margin-bottom:8px"><h2 style="margin:0">Règlements</h2><div class="sp"></div><button class="btn sm pri" id="ap">+ Enregistrer un règlement</button></div>
    ${(doc.paiements || []).length ? `<table><tr><th>Date</th><th>Mode</th><th>Référence</th><th class="num">Montant</th><th></th></tr>${doc.paiements.map((p, i) => `<tr><td>${fdate(p.date)}</td><td>${esc(p.mode)}</td><td>${esc(p.ref)}</td><td class="num">${money(num(p.montant))}</td><td class="num"><button class="btn sm ghost" data-rp="${i}">×</button></td></tr>`).join("")}</table>` : `<div class="empty">Aucun règlement enregistré</div>`}</div>` : ""}
  <div class="actions">${!locked && !doc._new ? `<button class="btn danger" id="del">Supprimer le brouillon</button>` : ""}<div class="sp"></div></div>`;
  const rer = () => vFactureEdit(el, rawId);
  $$(".form [name]", el).forEach(i => i.addEventListener("change", () => { doc[i.name] = i.value; if (i.name === "clientId") { doc.dossierId = ""; rer(); } if (i.name === "tgc") $("#tot", el).innerHTML = totalsHtml(doc); if (locked && i.name === "echeance") persist().then(s => s && toast("Échéance modifiée")); }));
  $("[name=tgc]", el).addEventListener("input", e => { doc.tgc = e.target.value; $("#tot", el).innerHTML = totalsHtml(doc); });
  if ($("[name=impute]", el)) $("[name=impute]", el).addEventListener("input", e => { doc.impute = e.target.value; $("#tot", el).innerHTML = totalsHtml(doc); });
  if ($("#useimp", el)) $("#useimp", el).onclick = () => { doc.impute = Math.min(acomptesDispo(doc.dossierId, doc.id), totals(doc).ttc); rer(); };
  bindLines(el, doc, locked, rer);
  const persist = async (extra) => {
    if (!locked) $$(".form [name]", el).forEach(i => doc[i.name] = i.value);
    if (!doc.clientId) { alert("Choisissez un client."); return null; }
    const o = Object.assign({}, doc, extra || {}); delete o._new; delete o._key;
    try { const s = await save("factures", o); curDoc = Object.assign(JSON.parse(JSON.stringify(s)), { _key: "facture:" + s.id }); return s; } catch (e) { fail(e); return null; }
  };
  if ($("#sv")) $("#sv").onclick = async () => { const s = await persist(); if (s) { toast("Brouillon enregistré"); if (rawId.startsWith("new")) go("facture/" + s.id); else rer(); } };
  if ($("#em")) $("#em").onclick = async () => {
    $$(".form [name]", el).forEach(i => doc[i.name] = i.value);
    if (!doc.lignes.length || !totals(doc).ttc) return alert("La facture est vide.");
    if (!confirm("Émettre la facture ? Elle recevra son numéro définitif et ne pourra plus être modifiée.")) return;
    const s = await persist({ statut: "emise" });
    if (s) {
      try { await archiveFile(pdfDoc(s, "facture"), { type: s.avoir ? "avoir" : "facture", titre: (s.avoir ? "Avoir " : "Facture ") + s.num + " – copie archivée à l'émission", refId: s.id, dossierId: s.dossierId, clientId: s.clientId, date: s.date }); } catch (e) { console.error(e); }
      toast("Facture " + s.num + " émise et archivée"); if (rawId.startsWith("new")) go("facture/" + s.id); else rer();
    }
  };
  if ($("#pdf")) $("#pdf").onclick = async () => { const s = locked ? doc : await persist(); if (s) openViewer(Object.assign(pdfDoc(s, "facture"), { title: (s.avoir ? "Avoir " : "Facture ") + (s.num || "(brouillon)") })); };
  if ($("#arch")) $("#arch").onclick = () => viewDocument(D.documents.find(x => x.refId === doc.id));
  if ($("#del")) $("#del").onclick = async () => {
    if (!confirm("Supprimer ce brouillon ?")) return;
    try {
      await remove("factures", doc.id);
      if (doc.devisId) { const dv = D.devis.find(x => x.id === doc.devisId); if (dv) await save("devis", Object.assign({}, dv, { factureId: "" })); }
      if (doc.dossierId && doc.tempsIds) { const o = JSON.parse(JSON.stringify(dossier(doc.dossierId))); o.temps.forEach(t => { if (t.factureId === doc.id) delete t.factureId; }); await save("dossiers", o); }
      curDoc = null; go("factures");
    } catch (e) { fail(e); }
  };
  if ($("#av")) $("#av").onclick = async () => {
    if (!confirm("Créer un avoir annulant cette facture ? Vous pourrez ajuster les montants avant de l'émettre.")) return;
    const a = { id: uid(), avoir: true, avoirDe: doc.id, avoirDeNum: doc.num, statut: "brouillon", date: today(), echeance: today(), clientId: doc.clientId, dossierId: doc.dossierId, objet: "Avoir sur facture " + doc.num, tgc: doc.tgc, lignes: doc.lignes.map(l => Object.assign({}, l, { pu: -num(l.pu) })), paiements: [] };
    try { const s = await save("factures", a); curDoc = null; go("facture/" + s.id); } catch (e) { fail(e); }
  };
  if ($("#ap")) $("#ap").onclick = () => modal(`<h2>Règlement – facture ${esc(doc.num)}</h2><div class="form">
      <div class="f"><label>Date</label><input name="date" type="date" value="${today()}"></div>
      <div class="f"><label>Montant (F) *</label><input name="montant" inputmode="numeric" value="${reste(doc)}"></div>
      <div class="f"><label>Mode</label><select name="mode">${listOpts(["Virement", "Chèque", "Espèces", "Carte bancaire", "Prélèvement CARPA", "Aide juridictionnelle"], "Virement")}</select></div>
      <div class="f s6"><label>Référence (n° de chèque, libellé du virement…)</label><input name="ref"></div></div>
      <div class="actions"><div class="sp"></div><button class="btn ghost" id="c">Annuler</button><button class="btn pri" id="o">Enregistrer</button></div>`, (m, close) => {
    $("#c", m).onclick = close;
    $("#o", m).onclick = async () => { const f = readForm(m); f.montant = num(f.montant); if (!f.montant) return alert("Montant obligatoire."); doc.paiements = (doc.paiements || []).concat([f]); close(); const s = await persist(); if (s) { toast("Règlement enregistré"); rer(); } };
  });
  $$("[data-rp]", el).forEach(b => b.onclick = async () => { if (!confirm("Supprimer ce règlement ?")) return; doc.paiements.splice(+b.dataset.rp, 1); const s = await persist(); if (s) rer(); });
}

// ============================================================ PDF devis / facture (modèle du cabinet, allégé)
// Montant en toutes lettres (francs CFP, nombres entiers).
function enLettres(n) {
  n = Math.round(Math.abs(n));
  if (n === 0) return "zéro";
  const U = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const T = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];
  const cent = x => { // 0..999
    let out = "", c = Math.floor(x / 100), r = x % 100;
    if (c) out = (c > 1 ? U[c] + " cent" + (r === 0 ? "s" : "") : "cent");
    if (r) {
      let t = Math.floor(r / 10), u = r % 10, w;
      if (r < 20) w = U[r];
      else if (t === 7 || t === 9) w = T[t] + (t === 7 && u === 1 ? " et " : "-") + U[10 + u];
      else w = T[t] + (u === 1 && t !== 8 ? " et un" : u ? "-" + U[u] : (t === 8 ? "s" : ""));
      out += (out ? " " : "") + w;
    }
    return out;
  };
  const parts = [], mi = Math.floor(n / 1e9), m = Math.floor(n / 1e6) % 1000, k = Math.floor(n / 1000) % 1000, r = n % 1000;
  if (mi) parts.push(cent(mi) + " milliard" + (mi > 1 ? "s" : ""));
  if (m) parts.push(cent(m) + " million" + (m > 1 ? "s" : ""));
  if (k) parts.push(k === 1 ? "mille" : cent(k).replace(/cents$/, "cent") + " mille");
  if (r) parts.push(cent(r));
  return parts.join(" ");
}
const LOGO_RED = [156, 21, 34], INK = [35, 32, 28], GOLD = [204, 169, 95], GREY = [105, 105, 112], SOFT = [244, 242, 238];

function pdfDoc(doc, kind) {
  const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: "mm", format: "a4" });
  const s = S(), c = client(doc.clientId) || {}, dos = dossier(doc.dossierId), t = totals(doc);
  const W = 210, M = 15, R = W - M, BOTTOM = 270;
  const F = n => (n < 0 ? "-" : "") + grp(n) + " XPF";
  const isFact = kind === "facture", title = !isFact ? "DEVIS D'HONORAIRES" : doc.avoir ? "AVOIR" : "FACTURE D'HONORAIRES";
  const txt = (str, x, yy, o) => pdf.text(Array.isArray(str) ? str : String(str == null ? "" : str), x, yy, o);
  const font = (st, size, col) => { pdf.setFont("helvetica", st); pdf.setFontSize(size); pdf.setTextColor(...(col || INK)); };
  let y = 14;
  const ensure = h => { if (y + h > BOTTOM) { pdf.addPage(); y = 18; return true; } return false; };

  // ---- En-tête : logo + coordonnées à gauche, titre et références à droite
  let ly = y;
  if (s.logo) { try { pdf.addImage(s.logo, M, y, 52, 25.8); ly = y + 28.5; } catch (e) { /* logo illisible */ } }
  if (ly === y) { font("bold", 15, INK); txt(s.cabinet || s.avocat, M, y + 6); ly = y + 10; }
  font("normal", 8, GREY);
  [[s.adresse, s.ville].filter(Boolean).join(" | "), [s.tel ? "Tél. : " + s.tel : "", s.email ? "Email : " + s.email : ""].filter(Boolean).join(" • "), s.ridet ? "N° RIDET : " + s.ridet : ""]
    .filter(Boolean).forEach(l => { pdf.splitTextToSize(l, 92).forEach(x => { txt(x, M, ly); ly += 3.6; }); });
  const rx = 112;
  font("bold", 15, LOGO_RED); txt(title, R, y + 6, { align: "right" });
  font("bold", 11, INK); txt(doc.num ? "N° " + doc.num : "(brouillon – non numérotée)", R, y + 12.5, { align: "right" });
  const refs = [["Date d'émission", fdate(doc.date)], isFact ? ["Date d'échéance", fdate(doc.echeance)] : ["Valable jusqu'au", fdate(doc.validite)],
    dos ? ["Référence dossier", "N° " + dos.num + " – " + dos.intitule] : null,
    dos && dos.conventionDate ? ["Convention", "Signée le " + fdate(dos.conventionDate)] : null,
    doc.devisNum ? ["Devis", doc.devisNum] : null, doc.avoirDeNum ? ["Sur facture", doc.avoirDeNum] : null].filter(Boolean);
  let ry = y + 18; pdf.setDrawColor(...GOLD); pdf.setLineWidth(0.4); pdf.line(rx, ry - 2, R, ry - 2);
  refs.forEach(([k, v]) => { font("normal", 8.5, GREY); txt(k + " :", rx, ry + 2); font("bold", 8.5, INK); const l = pdf.splitTextToSize(v, R - rx - 34); txt(l, rx + 33, ry + 2); ry += 4.6 * l.length; });
  pdf.line(rx, ry, R, ry);
  y = Math.max(ly, ry) + 5;

  // ---- Blocs dossier / client
  const bw = (R - M - 6) / 2, bx2 = M + bw + 6;
  const block = (x, label, rows) => {
    font("normal", 8.6, INK); let h = 7; const lines = rows.map(([k, v]) => { const l = pdf.splitTextToSize(String(v || "—"), bw - 36); h += Math.max(1, l.length) * 4.1 + 0.8; return [k, l]; });
    return { h: h + 2, draw: (top, H) => {
      pdf.setFillColor(...SOFT); pdf.rect(x, top, bw, H, "F"); pdf.setFillColor(...LOGO_RED); pdf.rect(x, top, 1.2, H, "F");
      font("bold", 8, LOGO_RED); txt(label, x + 4, top + 5);
      let yy = top + 10.5; lines.forEach(([k, l]) => { font("normal", 8.3, GREY); txt(k, x + 4, yy); font("normal", 8.6, INK); txt(l, x + 34, yy); yy += Math.max(1, l.length) * 4.1 + 0.8; });
    } };
  };
  const objet = doc.objet || (dos ? dos.intitule : "");
  const b1 = block(M, kind === "devis" ? "DOSSIER & MODE D'HONORAIRES" : "DOSSIER & MODE DE FACTURATION", [
    ["Objet / Affaire", objet + (dos && dos.adverse ? " c/ " + dos.adverse : "")],
    ["Juridiction / Domaine", dos ? [dos.juridiction, dos.rg ? "RG " + dos.rg : "", dos.domaine].filter(Boolean).join(" – ") || "Conseil" : "—"],
    ["Facturation", dos ? (HON[dos.honoraires] || "Forfait") + (dos.honoraires === "horaire" && num(dos.taux) ? " (" + grp(num(dos.taux)) + " XPF HT/h)" : "") + (dos.aj ? " – " + dos.aj : "") : "Forfait"]]);
  const b2 = block(bx2, isFact ? "FACTURÉ À (CLIENT)" : "DESTINATAIRE (CLIENT)", [
    ["Nom / Raison sociale", clientName(c) + (c.type === "societe" && c.nom ? "\nReprésentée par " + [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ") : "")],
    c.ridet ? ["N° RIDET", c.ridet] : null, ["Adresse", c.adresse], ["Téléphone", c.tel], ["Email", c.email]].filter(Boolean));
  const bh = Math.max(b1.h, b2.h); b1.draw(y, bh); b2.draw(y, bh); y += bh + 7;

  // ---- Prestations
  font("bold", 9.5, INK); txt("DÉSIGNATION DES PRESTATIONS" + (t.deb ? " ET DÉBOURS" : ""), M, y); y += 2.5;
  const cols = { d: M + 2, q: 128, pu: 155, m: R - 2 };
  const thead = () => { pdf.setFillColor(...INK); pdf.rect(M, y, R - M, 7.5, "F"); font("bold", 8.3, [255, 255, 255]);
    txt("Description des diligences et frais", cols.d, y + 5); txt("Qté / h", cols.q, y + 5, { align: "right" }); txt("P.U. HT", cols.pu, y + 5, { align: "right" }); txt("Montant HT", cols.m, y + 5, { align: "right" }); y += 7.5; };
  thead();
  const rows = (doc.lignes || []).filter(l => l.desc || num(l.pu));
  const section = (label, list) => {
    if (!list.length) return;
    if (ensure(14)) thead();
    font("bold", 7.8, LOGO_RED); txt(label.toUpperCase(), cols.d, y + 4.6); y += 6.5;
    list.forEach(l => {
      font("normal", 9, INK);
      const lines = pdf.splitTextToSize(l.desc || "", cols.q - cols.d - 16), h = Math.max(1, lines.length) * 4.2 + 2.8;
      if (ensure(h)) { thead(); font("normal", 9, INK); }
      txt(lines, cols.d, y + 4.2);
      txt(String(num(l.qte)).replace(".", ","), cols.q, y + 4.2, { align: "right" });
      txt((num(l.pu) < 0 ? "-" : "") + grp(num(l.pu)), cols.pu, y + 4.2, { align: "right" });
      txt(F(Math.round(num(l.qte) * num(l.pu))), cols.m, y + 4.2, { align: "right" });
      y += h; pdf.setDrawColor(226, 224, 218); pdf.setLineWidth(0.2); pdf.line(M, y, R, y);
    });
  };
  section("Honoraires", rows.filter(l => l.type !== "deb"));
  section("Frais externes et débours refacturés au réel (exonérés de TGC*)", rows.filter(l => l.type === "deb"));

  // ---- Récapitulatif
  y += 6; ensure(52);
  const verse = isFact && !doc.avoir ? num(doc.impute) + paid(doc) : 0, net = Math.max(0, t.ttc - verse);
  const kx = 118; let ky = y;
  const krow = (k, v, bold, col) => { font(bold ? "bold" : "normal", bold ? 9.5 : 8.8, col || (bold ? INK : GREY)); txt(k, kx, ky); font(bold ? "bold" : "normal", bold ? 9.5 : 8.8, col || INK); txt(v, R - 2, ky, { align: "right" }); ky += 5.4; };
  krow("Total honoraires HT", F(t.hon));
  krow("TGC " + String(t.taux).replace(".", ",") + " %", F(t.tgc));
  if (t.deb) krow("Débours (exonérés de TGC)", F(t.deb));
  pdf.setFillColor(...SOFT); pdf.rect(kx - 3, ky - 4.2, R - kx + 3, 7.2, "F"); krow(doc.avoir ? "TOTAL AVOIR TTC" : "TOTAL TTC", F(t.ttc), true);
  if (verse) {
    krow("Moins acomptes versés", "- " + F(verse));
    pdf.setFillColor(...LOGO_RED); pdf.rect(kx - 3, ky - 4.4, R - kx + 3, 7.6, "F"); krow("SOLDE NET À PAYER", F(net), true, [255, 255, 255]);
  }
  // Somme en lettres, à gauche
  const somme = (isFact ? (doc.avoir ? "Arrêté le présent avoir" : "Arrêtée la présente facture") : "Arrêté le présent devis") + " à la somme de : " + enLettres(t.ttc) + " francs CFP (XPF)" + (verse && net !== t.ttc ? ", soit un solde net à payer de " + enLettres(net) + " francs CFP." : ".");
  font("italic", 8.8, INK); const sl = pdf.splitTextToSize(somme, kx - M - 14);
  pdf.setDrawColor(...GOLD); pdf.setLineWidth(0.4); pdf.rect(M, y - 4.5, kx - M - 8, sl.length * 4.3 + 5);
  font("italic", 8.8, INK); txt(sl, M + 3, y);
  let ly2 = y + sl.length * 4.3 + 5;
  if (t.deb) { font("normal", 7.2, GREY); const n = pdf.splitTextToSize("* Débours exposés au nom et pour le compte du client, refacturés au franc le franc hors TGC sur présentation des justificatifs.", kx - M - 8); txt(n, M, ly2); ly2 += n.length * 3.2; }
  y = Math.max(ky, ly2) + 5;

  // ---- Versements reçus (facture)
  if (isFact && !doc.avoir && verse) {
    const ver = [].concat(num(doc.impute) ? [{ date: "", mode: "Acompte(s) versé(s) avant facturation", ref: "", montant: num(doc.impute) }] : [], doc.paiements || []);
    ensure(10 + ver.length * 5);
    font("bold", 8.5, INK); txt("Versements reçus imputés sur cette facture", M, y); y += 4.5;
    ver.forEach(p => { font("normal", 8.5, INK); txt(p.date ? fdate(p.date) : "—", M + 2, y); txt([p.mode, p.ref].filter(Boolean).join(" – "), M + 26, y); txt(F(num(p.montant)), R - 2, y, { align: "right" }); y += 4.6; });
    y += 3;
  }

  // ---- Paiement / signature
  ensure(40);
  pdf.setDrawColor(...GOLD); pdf.setLineWidth(0.4); pdf.line(M, y, R, y); y += 5;
  const sx = 140; let py = y;
  if (isFact && !doc.avoir) {
    font("bold", 8.3, LOGO_RED); txt("MOYENS DE PAIEMENT", M, py); py += 4.8;
    const vir = [s.banque ? "Banque : " + s.banque : "", "Titulaire : " + (s.titulaire || s.cabinet), s.rib ? "RIB / IBAN : " + s.rib : "RIB / IBAN : (à compléter dans Paramètres)", s.bic ? "Code BIC : " + s.bic : ""].filter(Boolean);
    font("bold", 8.2, INK); txt("Par virement :", M, py); font("normal", 8.2, INK); vir.forEach((v, i) => txt(v, M + 22, py + i * 3.9)); py += vir.length * 3.9 + 0.6;
    font("italic", 7.6, GREY); txt("Merci d'indiquer la référence Facture N° " + (doc.num || "…") + " en libellé du virement.", M + 22, py); py += 4.6;
    font("bold", 8.2, INK); txt("Par chèque :", M, py); font("normal", 8.2, INK); txt("à l'ordre de « " + (s.ordreCheque || s.avocat) + " ».", M + 22, py); py += 4.4;
    font("bold", 8.2, INK); txt("En espèces :", M, py); font("normal", 8.2, INK); txt("au secrétariat du Cabinet, contre remise d'un reçu.", M + 22, py); py += 4.4;
  } else if (!isFact) {
    font("bold", 8.3, LOGO_RED); txt("BON POUR ACCORD – LE CLIENT", M, py); py += 4.8;
    font("normal", 8.2, GREY); txt("Date, signature précédée de la mention « Bon pour accord » :", M, py); py += 22;
    if (doc.conditions) { font("normal", 8.2, INK); const l = pdf.splitTextToSize(doc.conditions, sx - M - 8); txt(l, M, y + 34); py = Math.max(py, y + 34 + l.length * 4); }
  }
  font("bold", 8.3, LOGO_RED); txt("POUR LE CABINET", sx, y);
  font("bold", 9, INK); txt(s.avocat || "", sx, y + 5.5);
  font("italic", 7.8, GREY); txt("(Cachet et signature)", sx, y + 10);
  font("normal", 8.2, INK); txt("Fait à Koné, le " + fdate(doc.date || today()), sx, y + 26);
  y = Math.max(py, y + 30) + 3;

  // ---- Pied de page : conditions + pagination
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i); font("normal", 6.6, GREY); /* police fixée avant découpage */
    const foot = pdf.splitTextToSize([isFact ? s.conditions : "", s.mentions].filter(Boolean).join("\n"), R - M);
    txt(foot, M, 290 - foot.length * 2.8);
    if (n > 1) txt(i + " / " + n, R, 293, { align: "right" });
  }
  return { blob: pdf.output("blob"), mime: "application/pdf", name: (isFact ? (doc.avoir ? "Avoir" : "Facture") : "Devis") + "-" + (doc.num || "brouillon") + "-" + clientName(c).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".pdf" };
}

// ============================================================ Convention d'honoraires (Word), générée depuis le dossier
function conventionDialog(dosId) {
  const d = dossier(dosId), c = client(d.clientId) || {}, s = S();
  const soc = c.type === "societe";
  const missionDefaut = [
    d.juridiction || d.adverse ? `Contentieux : représentation et assistance du Client${d.juridiction ? " devant " + d.juridiction : " devant les juridictions compétentes"}${d.adverse ? " dans le litige l'opposant à " + d.adverse : ""} (hors cassation) : étude du dossier, rédaction des actes et conclusions, préparation des plaidoiries, audiences.` : "",
    "Conseil et assistance : analyses juridiques, rédaction de notes et assistance liées à ce dossier."
  ].filter(Boolean).join("\n");
  modal(`
    <h2>Convention – dossier ${esc(d.num)}</h2>
    <div class="form">
      <div class="f s4"><label>Titre</label><select name="titre">${listOpts(["Convention d'assistance juridique et de représentation en justice", "Convention d'honoraires"], "Convention d'assistance juridique et de représentation en justice")}</select></div>
      <div class="f"><label>Date de signature</label><input name="date" type="date" value="${today()}"></div>
      <div class="f s6"><label>Client</label><input value="${esc(clientName(c))}${c.adresse ? " – " + esc(c.adresse.replace(/\n/g, ", ")) : " – adresse à compléter dans la fiche client"}" disabled></div>
      ${soc ? `<div class="f s6"><label>Représenté(e) par</label><input name="representant" value="${esc([c.civilite, c.prenom, c.nom].filter(Boolean).join(" "))}" placeholder="Ex. : son gérant, M. …"></div>` : ""}
      <div class="sec">Article 1 – Objet de la mission (une ligne par point)</div>
      <div class="f s6"><textarea name="mission" style="min-height:100px">${esc(missionDefaut)}</textarea></div>
      <div class="sec">Article 3 – Honoraires</div>
      <div class="f"><label>Mode</label><select name="mode">${opts(HON, d.honoraires || "forfait")}</select></div>
      <div class="f"><label>Montant du forfait (F)</label><input name="montant" inputmode="numeric" value="${esc(d.conventionMontant)}"></div>
      <div class="f"><label>Montant exprimé</label><select name="base"><option value="HT">HT – TGC en sus</option><option value="TTC">TTC – taxes comprises</option></select></div>
      <div class="f"><label>Taux horaire HT (F)</label><input name="taux" inputmode="numeric" value="${esc(d.taux || s.tauxHoraire || 25000)}"></div>
      <div class="f"><label>Plafond des honoraires (F, facultatif)</label><input name="plafond" inputmode="numeric"></div>
      <div class="f"><label>Honoraire de résultat (%)</label><input name="resultat" inputmode="decimal"></div>
      <div class="f"><label>Provision à la signature (F)</label><input name="provision" inputmode="numeric"></div>
      <div class="f s4"><label>Échéancier (facultatif)</label><input name="echeancier" placeholder="Ex. : le solde en 3 mensualités de 50 000 F à compter de janvier 2027"></div>
      <div class="sec">Autres clauses</div>
      <div class="f s3"><label><input type="checkbox" name="delais" checked style="width:auto"> Article « Réactivité et engagements » (délais de réponse)</label></div>
      <div class="f s3"><label><input type="checkbox" name="carpa" checked style="width:auto"> Autorisation de prélèvement sur le compte CARPANC</label></div>
      <div class="f"><label>Durée</label><select name="duree"><option value="mission">Jusqu'au terme de la mission</option><option value="periode">Période déterminée</option></select></div>
      <div class="f per"><label>Du</label><input name="du" type="date" value="${today()}"></div>
      <div class="f per"><label>Au</label><input name="au" type="date" value="${addDays(addDays(today(), 365), -1)}"></div>
      <div class="f s6"><label><input type="checkbox" name="maj" checked style="width:auto"> Reporter le mode et le montant dans le dossier (la date de signature s'enregistre dans « Modifier » une fois la convention signée)</label></div>
    </div>
    <div class="actions"><div class="sp"></div><button class="btn ghost" id="c">Annuler</button><button class="btn pri" id="o">Générer la convention (Word)</button></div>`, (m, close) => {
    const sync = () => {
      const mode = $("[name=mode]", m).value, per = $("[name=duree]", m).value === "periode";
      $$(".per", m).forEach(x => x.style.display = per ? "" : "none");
      const show = (n, on) => { $(`[name=${n}]`, m).closest(".f").style.display = on ? "" : "none"; };
      show("montant", ["forfait", "resultat"].includes(mode)); show("base", ["forfait", "resultat"].includes(mode));
      show("taux", mode === "horaire"); show("plafond", mode === "horaire"); show("resultat", mode === "resultat");
    };
    $("[name=mode]", m).onchange = sync; $("[name=duree]", m).onchange = sync; sync();
    $("#c", m).onclick = close;
    $("#o", m).onclick = async () => {
      const f = readForm(m);
      let file, saved;
      try { file = await conventionDocx(d, c, f); saved = await archiveFile(file, { type: "convention", titre: f.titre + (f.mode ? " – " + (HON[f.mode] || f.mode) : ""), dossierId: d.id, clientId: d.clientId, date: today() }); }
      catch (e) { console.error(e); return alert("Impossible de générer la convention : " + e.message); }
      if (f.maj) {
        const o = JSON.parse(JSON.stringify(d)); o.honoraires = f.mode;
        if (["forfait", "resultat"].includes(f.mode) && num(f.montant)) o.conventionMontant = num(f.montant);
        if (f.mode === "horaire" && num(f.taux)) o.taux = num(f.taux);
        (o.journal = o.journal || []).push({ id: uid(), date: today(), texte: "Convention d'honoraires générée (" + (HON[f.mode] || f.mode) + (num(f.montant) && f.mode !== "horaire" ? ", " + money(num(f.montant)) + " " + f.base : "") + ").", by: ME.id });
        try { await save("dossiers", o); } catch (e) { fail(e); }
      }
      close(); render(); toast("Convention générée et classée dans le dossier"); viewDocument(saved);
    };
  });
}

async function conventionDocx(d, c, f) {
  const X = window.docx; if (!X) throw new Error("module Word indisponible");
  const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Footer, PageNumber, TabStopType } = X;
  const s = S(), soc = c.type === "societe";
  const RED = "9C1522", INKC = "23201C", GREYC = "6B6B70", GOLDC = "CCA95F", FONT = "Aptos";
  const run = (t, o) => new TextRun(Object.assign({ text: t, font: FONT, size: 22, color: INKC }, o || {}));
  const para = (children, o) => new Paragraph(Object.assign({ children: Array.isArray(children) ? children : [run(children)], spacing: { after: 100, line: 276 } }, o || {}));
  const just = (t, o) => para([run(t)], Object.assign({ alignment: AlignmentType.JUSTIFIED }, o || {}));
  const bullet = t => new Paragraph({ children: [run(t)], bullet: { level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 276 } });
  const article = (n, t) => para([run(`Article ${n} : ${t}`, { bold: true, color: RED, size: 23 })], { spacing: { before: 260, after: 100 }, keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLDC, space: 2 } } });
  const fmtF = v => grp(num(v)) + " F CFP";
  const longDate = iso => { if (!iso) return "____________"; const M = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]; const [y, m, j] = iso.split("-"); return (+j === 1 ? "1er" : +j) + " " + M[+m - 1] + " " + y; };
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const children = [];

  // En-tête : logo + coordonnées
  const head = [];
  if (s.logo) {
    const b64 = s.logo.split(",")[1], bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    head.push(new Paragraph({ children: [new ImageRun({ data: bytes, transformation: { width: 190, height: 94 } })] }));
  } else head.push(para([run(s.cabinet, { bold: true, size: 28 })]));
  const coord = [s.adresse, s.ville, s.tel ? "Tél. : " + s.tel : "", s.email, s.ridet ? "RIDET : " + s.ridet : ""].filter(Boolean)
    .map(l => new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 20 }, children: [run(l, { size: 16, color: GREYC })] }));
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [
    new TableCell({ width: { size: 45, type: WidthType.PERCENTAGE }, borders: noBorders, children: head }),
    new TableCell({ width: { size: 55, type: WidthType.PERCENTAGE }, borders: noBorders, verticalAlign: "center", children: coord })] })] }));
  children.push(new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GOLDC, space: 1 } }, children: [] }));

  // Titre
  const titre = f.titre.toUpperCase().replace("JURIDIQUE ET DE", "JURIDIQUE\nET DE").split("\n");
  titre.forEach((t, i) => children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: i === titre.length - 1 ? 60 : 0 }, children: [run(t, { bold: true, size: 30, color: RED })] })));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [run(`Dossier n° ${d.num} – ${d.intitule}`, { size: 19, color: GREYC, italics: true })] }));

  // Parties
  children.push(para([run("ENTRE LES SOUSSIGNÉS", { bold: true })], { spacing: { after: 160 } }));
  const cname = clientName(c);
  children.push(para([run(cname, { bold: true })], { spacing: { after: 40 } }));
  if (soc && f.representant) children.push(para("Représentée par " + f.representant, { spacing: { after: 40 } }));
  if (c.ridet) children.push(para("RIDET : " + c.ridet, { spacing: { after: 40 } }));
  children.push(para((soc ? "Dont le siège est situé " : "Demeurant ") + (c.adresse ? (soc ? "" : "") + c.adresse.replace(/\n/g, ", ") : "____________________________________"), { spacing: { after: 40 } }));
  children.push(para([run("Ci-après « le Client », d'une part,", { italics: true })], { spacing: { after: 200 } }));
  children.push(para([run("ET", { bold: true })], { spacing: { after: 200 } }));
  children.push(para([run((s.cabinet || "Le Cabinet").replace(/^Cabinet/, "Le Cabinet"), { bold: true })], { spacing: { after: 40 } }));
  if (s.qualite || s.titre) children.push(para(s.qualite || s.titre, { spacing: { after: 40 } }));
  children.push(para("Domicilié " + [s.adresse].filter(Boolean).join(""), { spacing: { after: 40 } }));
  children.push(para("Agissant aux présentes par " + (s.avocat || "").replace(/^Maître\s+/, ""), { spacing: { after: 40 } }));
  children.push(para([run("Ci-après « l'Avocat », d'autre part.", { italics: true })], { spacing: { after: 260 } }));
  children.push(para([run("IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :", { bold: true })], { spacing: { after: 120 } }));

  // Articles
  let n = 1;
  children.push(article(n++, "Objet"));
  children.push(just("La présente convention régit la fixation des honoraires d'assistance et de conseil juridique, de rédaction d'actes, de représentation en justice et de plaidoirie pour la mission que le Client confie au Cabinet, telle que décrite ci-après :"));
  f.mission.split("\n").map(x => x.trim()).filter(Boolean).forEach(x => children.push(bullet(x.replace(/^[-–•]\s*/, ""))));

  if (f.delais) {
    children.push(article(n++, "Réactivité et engagements"));
    children.push(just("Le Cabinet s'engage à respecter les délais de réponse suivants :"));
    ["Accusé de réception des demandes : sous 4 heures.", "Conseils simples : sous 24 à 48 heures maximum.", "Consultations complexes : sous 7 à 10 jours, sauf urgence signalée par le Client."].forEach(x => children.push(bullet(x)));
  }

  children.push(article(n++, "Honoraires et frais"));
  const tgc = String(num(s.tgc)).replace(".", ",");
  if (f.mode === "horaire") {
    children.push(just(`Les prestations sont facturées sur la base d'un taux horaire de ${fmtF(f.taux)} hors taxes, augmenté des taxes en vigueur (TGC ${tgc} %).`));
    if (num(f.plafond)) children.push(bullet(`Le montant total des honoraires ne pourra excéder ${fmtF(f.plafond)} hors taxes.`));
  } else if (f.mode === "aj") {
    children.push(just(`La mission est réalisée au titre de l'aide juridictionnelle${d.aj ? " (" + d.aj + ")" : ""}. Si celle-ci n'est que partielle ou venait à être retirée, les honoraires restant à la charge du Client seront fixés d'un commun accord par avenant à la présente convention.`));
  } else if (f.mode === "assurance") {
    children.push(just("Les honoraires sont pris en charge par l'assureur de protection juridique du Client, dans la limite des plafonds prévus à son contrat. Les honoraires excédant cette prise en charge restent dus par le Client, sur la base d'un taux horaire de " + fmtF(f.taux) + " hors taxes, augmenté des taxes en vigueur (TGC " + tgc + " %)."));
  } else {
    const mt = num(f.montant);
    children.push(just(mt ? (f.base === "TTC" ? `Les honoraires sont fixés forfaitairement à la somme de ${fmtF(mt)} toutes taxes comprises.` : `Les honoraires sont fixés forfaitairement à la somme de ${fmtF(mt)} hors taxes, augmentée de la TGC au taux en vigueur (${tgc} %), soit ${fmtF(Math.round(mt * (1 + num(s.tgc) / 100)))} TTC.`) : "Les honoraires sont fixés forfaitairement à la somme de ____________ F CFP hors taxes, augmentée des taxes en vigueur."));
    if (f.mode === "resultat") children.push(just(`Il s'y ajoute un honoraire complémentaire de résultat égal à ${String(num(f.resultat) || "___").replace(".", ",")} % hors taxes des sommes obtenues ou économisées par le Client, exigible à l'issue définitive de la procédure.`));
  }
  if (num(f.provision)) children.push(just(`Une provision de ${fmtF(f.provision)} est versée à la signature de la présente convention ; elle s'impute sur les honoraires dus.`));
  children.push(just("Les frais de déplacement, timbres de plaidoirie et débours divers (courriers recommandés, copies, frais d'huissier, droits de greffe, etc.) sont facturés en sus, sur présentation de justificatifs."));
  children.push(just("Un devis pourra être établi à la demande du Client pour toute mission complémentaire déterminée."));

  children.push(article(n++, "Modalités de règlement"));
  children.push(just("Les honoraires et remboursements de frais sont réglés à réception de facture." + (f.echeancier ? " Par dérogation, les parties conviennent de l'échéancier suivant : " + f.echeancier.replace(/\.?$/, ".") : "")));
  if (f.carpa) children.push(just("Le Client autorise le Cabinet à prélever les montants dus sur les fonds transitant par le compte ouvert auprès de la Caisse des Règlements Pécuniaires des Avocats (CARPANC)."));

  children.push(article(n++, "Durée"));
  if (f.duree === "periode") { children.push(just(`La présente convention est conclue pour une durée déterminée, du ${longDate(f.du)} au ${longDate(f.au)}.`)); children.push(just("Elle n'est pas reconductible tacitement.")); }
  else children.push(just("La présente convention prend effet à la date de sa signature et vaut pour toute la durée de la mission décrite à l'article 1, jusqu'à son terme. Toute mission nouvelle fera l'objet d'un avenant ou d'une nouvelle convention."));

  children.push(article(n++, "Protection des données à caractère personnel"));
  children.push(just("Le Cabinet met en œuvre des traitements de données pour la gestion des dossiers, la facturation et le respect de ses obligations légales (notamment la lutte contre le blanchiment)."));
  children.push(just("Les données sont conservées pendant la durée de la relation contractuelle, augmentée des délais de prescription légaux."));
  children.push(just(`Les personnes concernées disposent des droits d'accès, de rectification, d'opposition, d'effacement et de portabilité, qu'elles peuvent exercer auprès du Cabinet à l'adresse suivante : ${[s.adresse, s.ville].filter(Boolean).join(" – ")}${s.email ? " ou par courriel à " + s.email : ""}. Elles peuvent également saisir l'autorité de contrôle compétente.`));

  children.push(para(`Fait à Koné, le ${longDate(f.date)}, en deux exemplaires originaux.`, { spacing: { before: 320, after: 280 } }));

  // Signatures
  const sigCell = lines => new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders, children: lines.map((l, i) => new Paragraph({ spacing: { after: 40 }, children: [run(l, i === 0 ? { bold: true } : { size: 20, color: i === lines.length - 1 ? GREYC : INKC, italics: i === lines.length - 1 })] })) });
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [
    sigCell(soc ? ["Pour " + cname, f.representant || "Son représentant légal", "", "", "« Lu et approuvé », signature"] : ["Le Client", cname, "", "", "« Lu et approuvé », signature"]),
    sigCell(["Pour le Cabinet", s.avocat || "", "", "", "Signature et cachet"])] })] }));

  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
    run(`${s.cabinet} – ${f.titre} – Dossier n° ${d.num} – Page `, { size: 15, color: GREYC }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 15, color: GREYC }),
    run(" / ", { size: 15, color: GREYC }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 15, color: GREYC })] })] });
  const docx = new Document({ creator: s.cabinet, title: f.titre, styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, right: 1417, bottom: 1134, left: 1417 } } }, footers: { default: footer }, children }] });
  const blob = await Packer.toBlob(docx);
  return { blob, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", name: `Convention-${d.num}-${cname.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-")}.docx` };
}

// ============================================================ Documents : archivage et visionneuse intégrée
const DOC_TYPES = { convention: ["Convention", "acc"], convention_signee: ["Convention signée", "ok"], facture: ["Facture (archive)", "info"], avoir: ["Avoir (archive)", "info"], piece: ["Pièce", ""], courrier: ["Courrier", ""], autre: ["Autre", ""] };
const MIME_LABEL = m => /pdf/.test(m) ? "PDF" : /word/.test(m) ? "Word" : /image/.test(m) ? "Image" : "";
async function uploadFile(file) {
  const r = await fetch("/api/files", { method: "POST", headers: { "Content-Type": file.mime || file.blob.type, "X-Filename": encodeURIComponent(file.name) }, body: file.blob, credentials: "same-origin" });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "envoi_impossible"); return j;
}
async function archiveFile(file, meta) {
  const up = await uploadFile(file);
  return save("documents", Object.assign({ id: uid(), fileId: up.id, fichier: up.name, mime: up.mime, taille: up.size }, meta));
}
const docsOf = dosId => D.documents.filter(x => x.dossierId === dosId).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
const docRow = x => `<tr><td style="white-space:nowrap">${fdate(x.date)}</td><td>${tag(DOC_TYPES, x.type)}</td><td>${esc(x.titre || x.fichier)}<div class="small muted">${esc(MIME_LABEL(x.mime))}${x.taille ? " · " + Math.max(1, Math.round(x.taille / 1024)) + " Ko" : ""}</div></td>
  <td class="num" style="white-space:nowrap"><button class="btn sm" data-voirdoc="${x.id}">Voir</button>${["facture", "avoir"].includes(x.type) ? "" : ` <button class="btn sm ghost" data-deldoc="${x.id}" title="Supprimer">×</button>`}</td></tr>`;
function bindDocRows(root) {
  $$("[data-voirdoc]", root).forEach(b => b.onclick = e => { e.stopPropagation(); viewDocument(D.documents.find(x => x.id === b.dataset.voirdoc)); });
  $$("[data-deldoc]", root).forEach(b => b.onclick = async e => { e.stopPropagation(); if (!confirm("Supprimer définitivement ce document ?")) return; try { await remove("documents", b.dataset.deldoc); render(); } catch (err) { fail(err); } });
}
function voirFacture(id) { const f = D.factures.find(x => x.id === id); if (f) openViewer(Object.assign(pdfDoc(f, "facture"), { title: (f.avoir ? "Avoir " : "Facture ") + (f.num || "(brouillon)") })); }
function voirDevis(id) { const d = D.devis.find(x => x.id === id); if (d) openViewer(Object.assign(pdfDoc(d, "devis"), { title: "Devis " + d.num })); }
async function viewDocument(x) {
  if (!x) return;
  try { const r = await fetch("/files/" + x.fileId, { credentials: "same-origin" }); if (!r.ok) throw new Error("fichier introuvable"); openViewer({ blob: await r.blob(), mime: x.mime, name: x.fichier, title: x.titre || x.fichier }); }
  catch (e) { alert("Impossible d'ouvrir le document : " + e.message); }
}
// Le module d'affichage Word porte le même nom global que le module de génération : on le charge à la demande en préservant ce dernier.
let previewLib = null;
function loadPreview() {
  if (previewLib) return previewLib;
  const add = src => new Promise((ok, ko) => { const t = document.createElement("script"); t.src = src; t.onload = ok; t.onerror = () => ko(new Error("chargement impossible")); document.head.appendChild(t); });
  previewLib = (async () => { const gen = window.docx; if (!window.JSZip) await add("/vendor/jszip.js"); await add("/vendor/docx-preview.js"); const lib = window.docx; window.docx = gen; return lib; })();
  return previewLib;
}
function openViewer(file) {
  const url = URL.createObjectURL(file.blob), isPdf = /pdf/.test(file.mime), isWord = /word/.test(file.mime), isImg = /image/.test(file.mime);
  const close = modal(`<div style="display:flex;align-items:center;gap:8px;margin:-6px 0 12px;flex-wrap:wrap"><h2 style="margin:0;flex:1;font-size:19px">${esc(file.title || file.name)}</h2>
      ${isPdf ? `<button class="btn" id="vprint">Imprimer</button>` : ""}<a class="btn" id="vdl" href="${url}" download="${esc(file.name)}">Télécharger</a><button class="btn pri" id="vclose">Fermer</button></div>
    <div id="vbody" style="height:78vh;border:1px solid var(--line);border-radius:6px;overflow:auto;background:#eceae5">
      ${isPdf ? `<iframe src="${url}" style="width:100%;height:100%;border:0;background:#fff" title="Document"></iframe>` : isImg ? `<div style="padding:12px;text-align:center"><img src="${url}" style="max-width:100%"></div>` : isWord ? `<div class="empty">Ouverture du document…</div>` : `<div class="empty">Aperçu indisponible pour ce format : utilisez « Télécharger ».</div>`}
    </div>`, (m, cl) => {
    m.parentNode.querySelector(".modal").style.maxWidth = "1040px";
    $("#vclose", m).onclick = cl;
    if ($("#vprint", m)) $("#vprint", m).onclick = () => { try { $("iframe", m).contentWindow.print(); } catch (e) { window.open(url); } };
    if (isWord) loadPreview().then(lib => { const box = $("#vbody", m); box.innerHTML = ""; return lib.renderAsync(file.blob, box, null, { inWrapper: true, ignoreLastRenderedPageBreak: true }); })
      .catch(e => { $("#vbody", m).innerHTML = `<div class="empty">Aperçu impossible (${esc(e.message)}) : utilisez « Télécharger ».</div>`; });
  });
  return close;
}
function deposerDocument(dosId) {
  const d = dossier(dosId);
  modal(`<h2>Déposer un document – dossier ${esc(d.num)}</h2><div class="form">
      <div class="f s6"><label>Fichier (PDF, Word, photo – 25 Mo maximum)</label><input type="file" name="fichier" accept=".pdf,.docx,image/png,image/jpeg,image/webp"></div>
      <div class="f"><label>Type</label><select name="type">${Object.entries(DOC_TYPES).filter(([k]) => !["facture", "avoir"].includes(k)).map(([k, v]) => `<option value="${k}" ${k === "convention_signee" && !(d.conventionDate) ? "selected" : ""}>${v[0]}</option>`).join("")}</select></div>
      <div class="f"><label>Date du document</label><input type="date" name="date" value="${today()}"></div>
      <div class="f"><label>&nbsp;</label><span class="small muted" id="hint"></span></div>
      <div class="f s6"><label>Intitulé</label><input name="titre" placeholder="Ex. : Convention signée, jugement du TPI, courrier adverse…"></div></div>
      <div class="actions"><div class="sp"></div><button class="btn ghost" id="c">Annuler</button><button class="btn pri" id="o">Déposer</button></div>`, (m, close) => {
    const sync = () => { $("#hint", m).textContent = $("[name=type]", m).value === "convention_signee" ? "La date de signature sera reportée dans le dossier." : ""; };
    $("[name=type]", m).onchange = sync; sync();
    $("#c", m).onclick = close;
    $("#o", m).onclick = async () => {
      const inp = $("[name=fichier]", m), file = inp.files[0], f = readForm(m);
      if (!file) return alert("Choisissez un fichier.");
      if (file.size > 25e6) return alert("Fichier trop lourd (25 Mo maximum).");
      const mime = file.type || (/\.docx$/i.test(file.name) ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : /\.pdf$/i.test(file.name) ? "application/pdf" : "");
      $("#o", m).disabled = true; $("#o", m).textContent = "Envoi…";
      try {
        await archiveFile({ blob: file, mime, name: file.name }, { type: f.type, titre: f.titre || (DOC_TYPES[f.type] || ["Document"])[0], dossierId: dosId, clientId: d.clientId, date: f.date });
        if (f.type === "convention_signee") { const o = JSON.parse(JSON.stringify(dossier(dosId))); o.conventionDate = f.date; (o.journal = o.journal || []).push({ id: uid(), date: today(), texte: "Convention signée déposée (signée le " + fdate(f.date) + ").", by: ME.id }); await save("dossiers", o); }
        close(); toast("Document déposé"); render();
      } catch (e) { $("#o", m).disabled = false; $("#o", m).textContent = "Déposer"; fail(e); }
    };
  });
}

let docFilter = "tous", docQ = "";
function vDocuments(el) {
  // Liste unique : devis et factures (toujours visibles à jour) + documents archivés ou déposés.
  const items = [].concat(
    D.factures.map(f => ({ kind: "facture", id: f.id, date: f.date, type: f.avoir ? "avoir_live" : "facture_live", titre: (f.avoir ? "Avoir " : "Facture ") + (f.num || "(brouillon)"), clientId: f.clientId, dossierId: f.dossierId, extra: money(totals(f).ttc) + " · " + factState(f)[0] })),
    D.devis.map(x => ({ kind: "devis", id: x.id, date: x.date, type: "devis", titre: "Devis " + x.num, clientId: x.clientId, dossierId: x.dossierId, extra: money(totals(x).ttc) + " · " + (ST_DEV[x.statut] || [""])[0] })),
    D.documents.filter(x => !["facture", "avoir"].includes(x.type)).map(x => ({ kind: "doc", id: x.id, date: x.date, type: x.type, titre: x.titre || x.fichier, clientId: x.clientId, dossierId: x.dossierId, extra: MIME_LABEL(x.mime) })));
  const F = { tous: ["Tous", () => true], conventions: ["Conventions", i => /^convention/.test(i.type)], factures: ["Factures", i => i.kind === "facture"], devis: ["Devis", i => i.kind === "devis"], pieces: ["Pièces et courriers", i => ["piece", "courrier", "autre"].includes(i.type)] };
  const LBL = Object.assign({ facture_live: ["Facture", "info"], avoir_live: ["Avoir", "info"], devis: ["Devis", ""] }, DOC_TYPES);
  const q = norm(docQ);
  const list = items.filter(F[docFilter][1]).filter(i => !q || norm([i.titre, clientName(client(i.clientId)), dossier(i.dossierId) ? dossier(i.dossierId).num + " " + dossier(i.dossierId).intitule : ""].join(" ")).includes(q))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  el.innerHTML = `
  <div class="head"><h1>Documents</h1></div>
  <div class="filters"><div class="chips">${Object.entries(F).map(([k, v]) => `<button class="chip ${k === docFilter ? "on" : ""}" data-f="${k}">${v[0]} (${items.filter(v[1]).length})</button>`).join("")}</div>
    <input id="dcq" placeholder="Client, dossier, n°…" value="${esc(docQ)}"></div>
  <div class="card" style="padding:6px 8px">${list.length ? `<table><tr><th>Date</th><th>Type</th><th>Document</th><th>Client</th><th>Dossier</th><th></th></tr>
    ${list.map(i => `<tr><td style="white-space:nowrap">${fdate(i.date)}</td><td>${tag(LBL, i.type)}</td><td>${esc(i.titre)}<div class="small muted">${esc(i.extra || "")}</div></td>
      <td>${esc(clientName(client(i.clientId)))}</td><td>${dossier(i.dossierId) ? `<a href="#/dossier/${i.dossierId}">${esc(dossier(i.dossierId).num)}</a>` : "—"}</td>
      <td class="num"><button class="btn sm pri" data-v="${i.kind}:${i.id}">Voir</button></td></tr>`).join("")}</table>` : `<div class="empty">Aucun document</div>`}</div>`;
  $$(".chip", el).forEach(b => b.onclick = () => { docFilter = b.dataset.f; vDocuments(el); });
  const inp = $("#dcq", el); inp.oninput = () => { docQ = inp.value; vDocuments(el); const n = $("#dcq", el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  $$("[data-v]", el).forEach(b => b.onclick = () => { const [k, id] = b.dataset.v.split(":"); if (k === "facture") voirFacture(id); else if (k === "devis") voirDevis(id); else viewDocument(D.documents.find(x => x.id === id)); });
}

// ============================================================ Paramètres
function vParametres(el) {
  const s = S(), admin = ME.role === "admin";
  el.innerHTML = `
  <div class="head"><h1>Paramètres</h1></div>
  <div class="card">
    <div class="form">
      <div class="sec">Cabinet (en-tête des devis et factures)</div>
      <div class="f s3"><label>Nom du cabinet</label><input name="cabinet" value="${esc(s.cabinet)}" placeholder="Cabinet Maître …"></div>
      <div class="f s3"><label>Avocat</label><input name="avocat" value="${esc(s.avocat)}" placeholder="Maître Prénom NOM"></div>
      <div class="f s3"><label>Titre</label><input name="titre" value="${esc(s.titre)}" placeholder="Avocat"></div>
      <div class="f s3"><label>Qualité (conventions)</label><input name="qualite" value="${esc(s.qualite)}" placeholder="Avocat au Barreau de …"></div>
      <div class="f s3"><label>RIDET</label><input name="ridet" value="${esc(s.ridet)}"></div>
      <div class="f s3"><label>Adresse</label><input name="adresse" value="${esc(s.adresse)}"></div>
      <div class="f s3"><label>Boîte postale / ville</label><input name="ville" value="${esc(s.ville)}"></div>
      <div class="f s3"><label>Téléphone</label><input name="tel" value="${esc(s.tel)}"></div>
      <div class="f s3"><label>E-mail</label><input name="email" value="${esc(s.email)}"></div>
      <div class="sec">Paiement (bas des factures)</div>
      <div class="f s3"><label>Banque</label><input name="banque" value="${esc(s.banque)}"></div>
      <div class="f s3"><label>Titulaire du compte</label><input name="titulaire" value="${esc(s.titulaire)}"></div>
      <div class="f s4"><label>RIB / IBAN</label><input name="rib" value="${esc(s.rib)}"></div>
      <div class="f"><label>Code BIC</label><input name="bic" value="${esc(s.bic)}"></div>
      <div class="f s3"><label>Chèques à l'ordre de</label><input name="ordreCheque" value="${esc(s.ordreCheque)}"></div>
      <div class="f s6"><label>Conditions de règlement et pénalités (pied des factures)</label><textarea name="conditions" style="min-height:90px">${esc(s.conditions)}</textarea></div>
      <div class="f s6"><label>Mentions en bas de page</label><textarea name="mentions" placeholder="Membre d'une association agréée… / Assurance RCP…">${esc(s.mentions)}</textarea></div>
      <div class="f s3"><label>Logo</label><input type="file" id="logo" accept="image/png,image/jpeg"></div>
      <div class="f s3"><label>&nbsp;</label><div>${s.logo ? `<img src="${s.logo}" style="max-height:48px;vertical-align:middle"> <button class="btn sm ghost" id="rmlogo">Retirer</button>` : '<span class="muted small">Aucun logo</span>'}</div></div>
      <div class="sec">Facturation</div>
      <div class="f s1"><label>TGC (%)</label><input name="tgc" value="${esc(s.tgc)}"></div>
      <div class="f"><label>Taux horaire HT par défaut (F)</label><input name="tauxHoraire" value="${esc(s.tauxHoraire)}"></div>
      <div class="f"><label>Délai de paiement (jours)</label><input name="delai" value="${esc(s.delai)}"></div>
      <div class="f s1"><label>Validité devis (j)</label><input name="validite" value="${esc(s.validite)}"></div>
      <div class="f s6"><label>Domaines d'intervention (un par ligne)</label><textarea name="domaines" style="min-height:140px">${esc(s.domaines.join("\n"))}</textarea></div>
    </div>
    ${admin ? `<div class="actions"><div class="sp"></div><button class="btn pri" id="ss">Enregistrer</button></div>` : `<div class="small muted" style="margin-top:12px">Seul l'avocat (administrateur) peut modifier ces paramètres.</div>`}
  </div>
  ${admin ? `<div class="card" style="margin-top:16px"><h2>Sauvegarde</h2><p class="small muted" style="margin-top:0">Le serveur fait une copie automatique chaque nuit (30 jours conservés). Vous pouvez aussi télécharger une copie complète.</p>
    <a class="btn" href="/api/export">Télécharger une sauvegarde</a> <label class="btn">Restaurer une sauvegarde<input type="file" id="imp" accept=".json" hidden></label></div>` : ""}`;
  if (!admin) { $$("input,textarea", el).forEach(i => i.disabled = true); return; }
  let logo = s.logo;
  const collect = () => { const f = readForm($(".form", el)); f.domaines = f.domaines.split("\n").map(x => x.trim()).filter(Boolean); f.logo = logo; return Object.assign({}, D.settings || {}, f); };
  $("#logo", el).onchange = e => { const file = e.target.files[0]; if (!file) return; if (file.size > 1.5e6) return alert("Logo trop lourd (1,5 Mo maximum)."); const r = new FileReader(); r.onload = () => { logo = r.result; D.settings = collect(); vParametres(el); toast("Logo chargé – pensez à enregistrer"); }; r.readAsDataURL(file); };
  if ($("#rmlogo", el)) $("#rmlogo", el).onclick = () => { logo = ""; D.settings = collect(); vParametres(el); };
  $("#ss", el).onclick = async () => { const n = collect(); try { await api("PUT", "/api/settings", n); D.settings = n; toast("Paramètres enregistrés"); render(); } catch (e) { fail(e); } };
  $("#imp", el).onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm("Restaurer cette sauvegarde ? Les éléments de même identifiant seront remplacés.")) return;
    try { const r = await api("POST", "/api/import", JSON.parse(await file.text())); D = await api("GET", "/api/data"); toast(r.documents + " éléments restaurés"); render(); } catch (err) { fail(err); }
  };
}

// ============================================================ Équipe
async function vEquipe(el) {
  if (ME.role !== "admin") { el.innerHTML = `<div class="empty">Réservé à l'avocat.</div>`; return; }
  USERS = await api("GET", "/api/users");
  el.innerHTML = `
  <div class="head"><h1>Équipe</h1><div class="sp"></div><button class="btn pri" id="au">+ Ajouter une personne</button></div>
  <div class="card" style="padding:6px 8px"><table><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Accès</th><th></th></tr>
  ${USERS.map(u => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${u.role === "admin" ? "Avocat / administrateur" : "Secrétariat / collaborateur"}</td>
    <td>${u.active ? '<span class="tag ok">Actif</span>' : '<span class="tag">Désactivé</span>'}</td>
    <td class="num">${u.id === ME.id ? "" : `<button class="btn sm" data-pw="${u.id}">Nouveau mot de passe</button> <button class="btn sm" data-act="${u.id}">${u.active ? "Désactiver" : "Réactiver"}</button>`}</td></tr>`).join("")}
  </table></div>
  <p class="small muted">Le secrétariat a accès à tout le logiciel (demandes, dossiers, devis, factures) sauf aux paramètres du cabinet et à la gestion de l'équipe.</p>`;
  $("#au", el).onclick = () => modal(`<h2>Ajouter une personne</h2><div class="form">
      <div class="f s3"><label>Nom et prénom</label><input name="name"></div><div class="f s3"><label>E-mail (identifiant)</label><input name="email" type="email"></div>
      <div class="f s3"><label>Mot de passe provisoire (8 caractères min.)</label><input name="password"></div>
      <div class="f s3"><label>Rôle</label><select name="role"><option value="membre">Secrétariat / collaborateur</option><option value="admin">Avocat / administrateur</option></select></div></div>
      <div class="actions"><div class="sp"></div><button class="btn ghost" id="c">Annuler</button><button class="btn pri" id="o">Créer le compte</button></div>`, (m, close) => {
    $("#c", m).onclick = close;
    $("#o", m).onclick = async () => { try { await api("POST", "/api/users", readForm(m)); close(); toast("Compte créé"); D = await api("GET", "/api/data"); vEquipe(el); } catch (e) { fail(e); } };
  });
  $$("[data-act]", el).forEach(b => b.onclick = async () => { const u = USERS.find(x => x.id === b.dataset.act); try { await api("PATCH", "/api/users/" + u.id, { active: !u.active }); vEquipe(el); } catch (e) { fail(e); } });
  $$("[data-pw]", el).forEach(b => b.onclick = async () => { const p = prompt("Nouveau mot de passe (8 caractères minimum) :"); if (!p) return; try { await api("PATCH", "/api/users/" + b.dataset.pw, { password: p }); toast("Mot de passe modifié"); } catch (e) { fail(e); } });
}

function changePassword() {
  modal(`<h2>Changer mon mot de passe</h2><div class="form">
    <div class="f s6"><label>Mot de passe actuel</label><input name="current" type="password"></div>
    <div class="f s6"><label>Nouveau mot de passe (8 caractères minimum)</label><input name="next" type="password"></div></div>
    <div class="actions"><div class="sp"></div><button class="btn ghost" id="c">Annuler</button><button class="btn pri" id="o">Valider</button></div>`, (m, close) => {
    $("#c", m).onclick = close;
    $("#o", m).onclick = async () => { try { await api("POST", "/api/me/password", readForm(m)); close(); toast("Mot de passe modifié"); } catch (e) { fail(e); } };
  });
}

// ============================================================ Démarrage
async function boot() {
  try { ME = ME || await api("GET", "/api/me"); D = await api("GET", "/api/data"); } catch (e) { ME = null; }
  render();
}
boot();

// Pas de suggestions du navigateur (anciennes saisies) dans les champs du logiciel, sauf à la connexion.
(function sansSuggestions() {
  const off = root => $$("input:not([type=password]):not([type=file]):not([type=checkbox]), textarea", root).forEach(i => {
    if (i.closest("#lf")) return;
    i.setAttribute("autocomplete", "off"); if (i.list === null) i.setAttribute("autocomplete", "off");
  });
  off(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) off(n.parentNode || n); }))).observe(document.body, { childList: true, subtree: true });
})();

// Mise à jour : si une nouvelle version est mise en ligne pendant que la page est ouverte, on propose de recharger.
(function watchVersion() {
  const mine = (document.querySelector('meta[name="app-version"]') || {}).content;
  if (!mine) return;
  const check = async () => {
    try {
      const v = (await (await fetch("/api/version", { cache: "no-store" })).json()).version;
      if (v && v !== mine && !document.getElementById("maj")) {
        const b = document.createElement("div"); b.id = "maj"; b.className = "toast"; b.style.cursor = "pointer";
        b.innerHTML = "Une nouvelle version du logiciel est disponible – <u>cliquer pour l'afficher</u>";
        b.onclick = () => location.reload(); document.body.appendChild(b);
      }
    } catch (e) { /* hors ligne : on réessaiera */ }
  };
  setInterval(check, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
})();
