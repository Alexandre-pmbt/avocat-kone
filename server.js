"use strict";
/*
 * Cabinet d'avocat – gestion des demandes, dossiers, devis et factures
 * Serveur Express + SQLite. Lancement : node server.js
 */
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const PORT = +process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
const SESSION_DAYS = +process.env.SESSION_DAYS || 30;
const COLLECTIONS = ["demandes", "clients", "dossiers", "devis", "factures", "documents"];

const FILES_DIR = path.join(DATA_DIR, "fichiers");
fs.mkdirSync(FILES_DIR, { recursive: true });

// ---------------------------------------------------------------- Base de données
const db = new Database(path.join(DATA_DIR, "cabinet.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'membre',
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS docs (
    collection TEXT NOT NULL, id TEXT NOT NULL, num TEXT, data TEXT NOT NULL,
    created_by TEXT, updated_by TEXT, updated_at TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  );
  CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS journal (at TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, detail TEXT);
  CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, name TEXT, mime TEXT NOT NULL, size INTEGER NOT NULL, created_by TEXT, created_at TEXT NOT NULL);
`);
const newId = () => crypto.randomBytes(12).toString("hex");
const now = () => new Date().toISOString();
const log = (user, action, detail) => db.prepare("INSERT INTO journal VALUES (?,?,?,?)").run(now(), user ? user.id : null, action, detail || null);

// ---------------------------------------------------------------- Application
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const m = raw.split(/;\s*/).find(c => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function setSession(res, token, maxAgeSec) {
  res.setHeader("Set-Cookie", `cab_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${COOKIE_SECURE ? "; Secure" : ""}`);
}
function auth(req, res, next) {
  const token = readCookie(req, "cab_session");
  if (token) {
    const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`).get(token, Date.now());
    if (row) { req.user = row; return next(); }
  }
  res.status(401).json({ error: "non_connecte" });
}
const adminOnly = (req, res, next) => req.user.role === "admin" ? next() : res.status(403).json({ error: "reserve_admin" });
const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: !!u.active });

const attempts = new Map();
function tooMany(key) {
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60 * 1000) { a.n = 0; a.t = Date.now(); }
  a.n++; attempts.set(key, a);
  return a.n > 10;
}

// ---------------------------------------------------------------- Authentification
app.post("/api/login", (req, res) => {
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  const password = String((req.body && req.body.password) || "");
  if (tooMany(req.ip + "|" + email)) return res.status(429).json({ error: "trop_de_tentatives" });
  const u = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(email);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error: "identifiants_invalides" });
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(token, u.id, Date.now() + SESSION_DAYS * 86400000);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  setSession(res, token, SESSION_DAYS * 86400);
  attempts.delete(req.ip + "|" + email);
  log(u, "connexion");
  res.json(publicUser(u));
});
app.post("/api/logout", (req, res) => {
  const token = readCookie(req, "cab_session");
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  setSession(res, "", 0);
  res.json({ ok: true });
});
app.get("/api/me", auth, (req, res) => res.json(publicUser(req.user)));
app.post("/api/me/password", auth, (req, res) => {
  const { current, next } = req.body || {};
  if (!bcrypt.compareSync(String(current || ""), req.user.password_hash)) return res.status(400).json({ error: "mot_de_passe_actuel_incorrect" });
  if (String(next || "").length < 8) return res.status(400).json({ error: "mot_de_passe_trop_court" });
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(String(next), 10), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- Données
function allData() {
  const out = { settings: null, users: {} };
  COLLECTIONS.forEach(c => out[c] = db.prepare("SELECT id, data FROM docs WHERE collection = ?").all(c).map(r => Object.assign(JSON.parse(r.data), { id: r.id })));
  const s = db.prepare("SELECT data FROM settings WHERE id = 1").get();
  out.settings = s ? JSON.parse(s.data) : null;
  db.prepare("SELECT id, name FROM users").all().forEach(u => out.users[u.id] = u.name);
  return out;
}
app.get("/api/data", auth, (req, res) => res.json(allData()));

// Numéro suivant. Devis / factures : PREFIXE-AAAA-NNN, sans trou. Dossiers : numérotation du cabinet (1, 2, … 49 Bis, …) → plus grand numéro + 1.
const PREFIX = { devis: "DEV", factures: "FAC" };
function nextNum(col) {
  if (col === "dossiers") {
    const max = db.prepare("SELECT num FROM docs WHERE collection = 'dossiers'").all().reduce((a, r) => { const n = /^\d+/.test(r.num || "") ? parseInt(r.num, 10) : 0; return Math.max(a, n); }, 0);
    return String(max + 1);
  }
  const st = db.prepare("SELECT data FROM settings WHERE id = 1").get(), s = st ? JSON.parse(st.data) : {};
  const year = new Date(Date.now() + 11 * 3600000).getUTCFullYear();
  // Factures : AAAA-NNNN (modèle du cabinet) ; devis : DEV-AAAA-NNN.
  const pre = col === "factures" ? year + "-" : ((s.prefixes || {})[col] || PREFIX[col]) + "-" + year + "-";
  const max = db.prepare("SELECT num FROM docs WHERE collection = ? AND num LIKE ?").all(col, pre + "%")
    .reduce((a, r) => Math.max(a, parseInt(r.num.slice(pre.length), 10) || 0), 0);
  return pre + String(max + 1).padStart(col === "factures" ? 4 : 3, "0");
}
// Devis : numérotés d'après le dossier → DEV-<n° dossier>-01, -02… (sans dossier : DEV-AAAA-NNN).
function devisNum(dossierId, sauf) {
  const dos = dossierId ? db.prepare("SELECT num FROM docs WHERE collection = 'dossiers' AND id = ?").get(dossierId) : null;
  if (!dos || !dos.num) return nextNum("devis");
  const pre = "DEV-" + String(dos.num).toUpperCase().replace(/\s+/g, "") + "-";
  const max = db.prepare("SELECT num FROM docs WHERE collection = 'devis' AND num LIKE ? AND id != ?").all(pre + "%", sauf || "")
    .reduce((a, r) => Math.max(a, parseInt(r.num.slice(pre.length), 10) || 0), 0);
  return pre + String(max + 1).padStart(2, "0");
}
const numTaken = (col, num, id) => !!db.prepare("SELECT 1 FROM docs WHERE collection = ? AND num = ? AND id != ?").get(col, num, id);

app.put("/api/docs/:col/:id", auth, (req, res) => {
  const { col, id } = req.params;
  if (!COLLECTIONS.includes(col) || !/^[\w-]{1,64}$/.test(id)) return res.status(400).json({ error: "requete_invalide" });
  const body = req.body || {};
  delete body.id;
  const existing = db.prepare("SELECT num, data, created_by FROM docs WHERE collection = ? AND id = ?").get(col, id);
  // Dossiers : le numéro peut être saisi ou corrigé (ex. « 49 Bis »), à condition d'être libre.
  const wanted = col === "dossiers" ? String(body.num || "").trim() : "";
  if (wanted && numTaken(col, wanted, id)) return res.status(409).json({ error: "numero_deja_utilise" });
  const tx = db.transaction(() => {
    if (existing) {
      const prev = JSON.parse(existing.data);
      body.num = existing.num || body.num || null;
      body.createdBy = prev.createdBy; body.createdAt = prev.createdAt;
      // Une facture émise garde son numéro ; la numérotation est attribuée au moment de l'émission.
      if (col === "factures" && !existing.num && body.statut === "emise") body.num = nextNum(col);
      // Devis rattaché à un autre dossier : il prend la numérotation de ce dossier.
      if (col === "devis" && body.dossierId && body.dossierId !== prev.dossierId) body.num = devisNum(body.dossierId, id);
    } else {
      body.createdBy = req.user.id; body.createdAt = now();
      body.num = null;
      if (col === "devis") body.num = devisNum(body.dossierId, id);
      else if (col === "dossiers" || (col === "factures" && body.statut === "emise")) body.num = nextNum(col);
    }
    if (wanted) body.num = wanted;
    body.updatedAt = now(); body.updatedBy = req.user.id;
    db.prepare(`INSERT INTO docs (collection, id, num, data, created_by, updated_by, updated_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(collection, id) DO UPDATE SET num = excluded.num, data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .run(col, id, body.num, JSON.stringify(body), body.createdBy, req.user.id, body.updatedAt);
  });
  tx();
  if (!existing) log(req.user, "creation_" + col, body.num || id);
  res.json(Object.assign(body, { id }));
});
app.delete("/api/docs/:col/:id", auth, (req, res) => {
  const { col, id } = req.params;
  if (!COLLECTIONS.includes(col)) return res.status(400).json({ error: "requete_invalide" });
  const row = db.prepare("SELECT num, data FROM docs WHERE collection = ? AND id = ?").get(col, id);
  if (!row) return res.json({ ok: true });
  // Une facture émise ne se supprime pas (obligation comptable) : on l'annule par un avoir.
  if (col === "factures" && JSON.parse(row.data).statut === "emise") return res.status(400).json({ error: "facture_emise" });
  // Copie archivée d'une facture émise : conservée (obligation comptable).
  if (col === "documents") {
    const doc = JSON.parse(row.data);
    if (doc.type === "facture" || doc.type === "avoir") return res.status(400).json({ error: "archive_facture" });
    if (doc.fileId) { db.prepare("DELETE FROM files WHERE id = ?").run(doc.fileId); fs.rmSync(path.join(FILES_DIR, doc.fileId), { force: true }); }
  }
  db.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").run(col, id);
  log(req.user, "suppression_" + col, row.num || id);
  res.json({ ok: true });
});
app.put("/api/settings", auth, adminOnly, (req, res) => {
  db.prepare("INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(JSON.stringify(req.body || {}));
  log(req.user, "parametres");
  res.json({ ok: true });
});

// ---------------------------------------------------------------- Fichiers (conventions, factures archivées, pièces déposées)
const FILE_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg", "image/webp"];
app.post("/api/files", auth, express.raw({ type: () => true, limit: "25mb" }), (req, res) => {
  const mime = String(req.headers["content-type"] || "").split(";")[0].trim();
  if (!FILE_TYPES.includes(mime) || !req.body || !req.body.length) return res.status(400).json({ error: "format_non_supporte" });
  const id = newId(), name = decodeURIComponent(String(req.headers["x-filename"] || "document")).slice(0, 200);
  fs.writeFileSync(path.join(FILES_DIR, id), req.body);
  db.prepare("INSERT INTO files VALUES (?,?,?,?,?,?)").run(id, name, mime, req.body.length, req.user.id, now());
  res.json({ id, name, mime, size: req.body.length });
});
app.get("/files/:id", auth, (req, res) => {
  const f = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id);
  if (!f || !fs.existsSync(path.join(FILES_DIR, f.id))) return res.status(404).json({ error: "introuvable" });
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Disposition", `${req.query.dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name || "document")}`);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.sendFile(path.join(FILES_DIR, f.id));
});

// ---------------------------------------------------------------- Équipe
app.get("/api/users", auth, (req, res) => res.json(db.prepare("SELECT * FROM users ORDER BY name").all().map(publicUser)));
app.post("/api/users", auth, adminOnly, (req, res) => {
  const { name, email, password, role } = req.body || {};
  const e = String(email || "").trim().toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(e) || String(password || "").length < 8) return res.status(400).json({ error: "champs_invalides" });
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(e)) return res.status(409).json({ error: "email_deja_utilise" });
  const id = newId();
  db.prepare("INSERT INTO users VALUES (?,?,?,?,?,1,?)").run(id, e, String(name).trim(), bcrypt.hashSync(String(password), 10), role === "admin" ? "admin" : "membre", now());
  log(req.user, "ajout_utilisateur", e);
  res.json({ id });
});
app.patch("/api/users/:id", auth, adminOnly, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!u) return res.status(404).json({ error: "introuvable" });
  const { name, role, active, password } = req.body || {};
  if (u.id === req.user.id && (active === false || role === "membre")) return res.status(400).json({ error: "impossible_sur_soi_meme" });
  if (password && String(password).length < 8) return res.status(400).json({ error: "mot_de_passe_trop_court" });
  if (name) db.prepare("UPDATE users SET name = ? WHERE id = ?").run(String(name).trim(), u.id);
  if (role) db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role === "admin" ? "admin" : "membre", u.id);
  if (typeof active === "boolean") { db.prepare("UPDATE users SET active = ? WHERE id = ?").run(active ? 1 : 0, u.id); if (!active) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id); }
  if (password) db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(String(password), 10), u.id);
  log(req.user, "modif_utilisateur", u.email);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- Export / import (administrateur)
app.get("/api/export", auth, adminOnly, (req, res) => {
  const d = allData(); delete d.users;
  res.setHeader("Content-Disposition", `attachment; filename="cabinet-export-${now().slice(0, 10)}.json"`);
  res.json(Object.assign({ format: "cabinet-avocat", version: 1, exportedAt: now() }, d));
});
app.post("/api/import", auth, adminOnly, (req, res) => {
  const d = req.body || {};
  if (d.format !== "cabinet-avocat") return res.status(400).json({ error: "format_inconnu" });
  let n = 0;
  db.transaction(() => {
    COLLECTIONS.forEach(c => (d[c] || []).forEach(x => {
      if (!x || !x.id) return;
      const id = String(x.id).replace(/[^\w-]/g, "").slice(0, 64), body = Object.assign({}, x); delete body.id;
      db.prepare(`INSERT INTO docs (collection, id, num, data, created_by, updated_by, updated_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(collection, id) DO UPDATE SET num = excluded.num, data = excluded.data, updated_at = excluded.updated_at`)
        .run(c, id, body.num ? String(body.num) : null, JSON.stringify(body), req.user.id, req.user.id, now());
      n++;
    }));
    if (d.settings) db.prepare("INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(JSON.stringify(d.settings));
  })();
  log(req.user, "import", n + " documents");
  res.json({ ok: true, documents: n });
});

// ---------------------------------------------------------------- Fichiers statiques
app.get("/vendor/docx-preview.js", (req, res) => res.sendFile(path.join(__dirname, "node_modules", "docx-preview", "dist", "docx-preview.min.js"), { maxAge: "7d" }));
app.get("/vendor/jszip.js", (req, res) => res.sendFile(path.join(__dirname, "node_modules", "jszip", "dist", "jszip.min.js"), { maxAge: "7d" }));
app.get("/vendor/docx.js", (req, res) => res.sendFile(path.join(__dirname, "node_modules", "docx", "build", "index.umd.js"), { maxAge: "7d" }));
app.get("/vendor/jspdf.js", (req, res) => res.sendFile(path.join(__dirname, "node_modules", "jspdf", "dist", "jspdf.umd.min.js"), { maxAge: "7d" }));
// Version du logiciel : change à chaque mise en ligne. Elle est ajoutée à l'adresse du script (le navigateur
// ne peut pas garder l'ancien) et consultée régulièrement par les pages ouvertes pour proposer de recharger.
const VERSION = String(process.env.RAILWAY_GIT_COMMIT_SHA || Date.now()).slice(0, 12);
const INDEX = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8")
  .replace('src="/app.js"', `src="/app.js?v=${VERSION}"`).replace("<head>", `<head>\n<meta name="app-version" content="${VERSION}">`);
const sendIndex = (req, res) => { res.setHeader("Cache-Control", "no-store"); res.type("html").send(INDEX); };
app.get("/api/version", (req, res) => { res.setHeader("Cache-Control", "no-store"); res.json({ version: VERSION }); });
app.get(["/", "/index.html"], sendIndex);
app.use(express.static(path.join(__dirname, "public"), { index: false, setHeaders(res) { res.setHeader("Cache-Control", "no-cache"); } }));

// ---------------------------------------------------------------- Premier administrateur sans terminal
// ADMIN_EMAIL + ADMIN_PASSWORD (+ ADMIN_NAME) créent le premier compte au démarrage.
// ADMIN_RESET=true réinitialise ce compte avec ce mot de passe (mot de passe oublié).
(function bootstrapAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase(), pass = String(process.env.ADMIN_PASSWORD || "");
  if (!email || !pass) return;
  if (pass.length < 8) { console.warn("ADMIN_PASSWORD trop court (8 caractères minimum) : compte non créé."); return; }
  const name = process.env.ADMIN_NAME || "Administrateur";
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const u = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (!count) {
    db.prepare("INSERT INTO users VALUES (?,?,?,?,'admin',1,?)").run(newId(), email, name, bcrypt.hashSync(pass, 10), now());
    console.log("Administrateur créé : " + email);
  } else if (process.env.ADMIN_RESET === "true") {
    if (u) db.prepare("UPDATE users SET password_hash = ?, role = 'admin', active = 1 WHERE id = ?").run(bcrypt.hashSync(pass, 10), u.id);
    else db.prepare("INSERT INTO users VALUES (?,?,?,?,'admin',1,?)").run(newId(), email, name, bcrypt.hashSync(pass, 10), now());
    db.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)").run(email);
    console.log("Compte administrateur réinitialisé : " + email + " – pensez à retirer ADMIN_RESET.");
  }
})();

// ---------------------------------------------------------------- Paramètres initiaux du cabinet
// parametres-initiaux.json : chargé une seule fois, au premier démarrage, si aucun paramètre n'existe.
(function parametresInitiaux() {
  const f = path.join(__dirname, "parametres-initiaux.json");
  if (!fs.existsSync(f) || db.prepare("SELECT 1 FROM settings WHERE id = 1").get()) return;
  try {
    const p = JSON.parse(fs.readFileSync(f, "utf8")); delete p._note;
    db.prepare("INSERT INTO settings (id, data) VALUES (1, ?)").run(JSON.stringify(p));
    console.log("Paramètres du cabinet initialisés : " + (p.cabinet || ""));
  } catch (e) { console.warn("parametres-initiaux.json illisible"); }
})();

// ---------------------------------------------------------------- Mise à jour ponctuelle des paramètres
// parametres-maj.json : champs fusionnés une seule fois dans les paramètres existants (lot identifié par « lot »).
(function parametresMaj() {
  const f = path.join(__dirname, "parametres-maj.json"); if (!fs.existsSync(f)) return;
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { console.warn("parametres-maj.json illisible"); return; }
  const lot = "parametres-maj:" + (d.lot || "1");
  if (db.prepare("SELECT 1 FROM journal WHERE action = 'reprise' AND detail = ?").get(lot)) return;
  const st = db.prepare("SELECT data FROM settings WHERE id = 1").get(), cur = st ? JSON.parse(st.data) : {};
  const p = Object.assign({}, d.parametres || {});
  Object.keys(p).forEach(k => {
    if (typeof p[k] === "string" && p[k][0] === "@") {
      const src = path.join(__dirname, p[k].slice(1));
      p[k] = fs.existsSync(src) ? "data:image/" + (/\.png$/i.test(src) ? "png" : "jpeg") + ";base64," + fs.readFileSync(src).toString("base64") : cur[k] || "";
    }
  });
  db.prepare("INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(JSON.stringify(Object.assign(cur, p)));
  db.prepare("INSERT INTO journal VALUES (?,?,?,?)").run(now(), null, "reprise", lot);
  console.log("Paramètres du cabinet mis à jour (" + d.lot + ")");
})();

// ---------------------------------------------------------------- Cabinet non assujetti à la TGC (une seule fois)
// TGC à 0 dans les paramètres, les devis et les factures en brouillon ; les factures émises ne sont pas modifiées.
(function sansTgc() {
  const lot = "sans-tgc-2026-11-19";
  if (db.prepare("SELECT 1 FROM journal WHERE action = 'reprise' AND detail = ?").get(lot)) return;
  let devis = 0, brouillons = 0, emises = [];
  db.transaction(() => {
    const st = db.prepare("SELECT data FROM settings WHERE id = 1").get();
    const cur = st ? JSON.parse(st.data) : {}; cur.tgc = 0;
    db.prepare("INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(JSON.stringify(cur));
    db.prepare("SELECT collection, id, num, data FROM docs WHERE collection IN ('devis', 'factures')").all().forEach(r => {
      const d = JSON.parse(r.data);
      if (!(Number(d.tgc) > 0)) return;
      if (r.collection === "factures" && d.statut === "emise") { emises.push(r.num); return; }
      d.tgc = 0; db.prepare("UPDATE docs SET data = ? WHERE collection = ? AND id = ?").run(JSON.stringify(d), r.collection, r.id);
      if (r.collection === "devis") devis++; else brouillons++;
    });
    db.prepare("INSERT INTO journal VALUES (?,?,?,?)").run(now(), null, "reprise", lot);
    db.prepare("INSERT INTO journal VALUES (?,?,?,?)").run(now(), null, "sans_tgc", `${devis} devis, ${brouillons} brouillon(s) de facture ; factures émises avec TGC : ${emises.join(", ") || "aucune"}`);
  })();
  console.log(`TGC retirée : ${devis} devis, ${brouillons} brouillon(s) ; factures émises avec TGC (non modifiées) : ${emises.join(", ") || "aucune"}`);
})();

// ---------------------------------------------------------------- Suppression ponctuelle : facture d'essai du client CHENU
// Dernière facture émise au nom de CHENU (essai), avec sa copie archivée et les avoirs liés ; devis et temps remis à « non facturé ».
(function supprimerFactureEssaiChenu() {
  const lot = "facture-essai-chenu-2026-11-26";
  if (db.prepare("SELECT 1 FROM journal WHERE action = 'reprise' AND detail = ?").get(lot)) return;
  const norm = v => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const clients = db.prepare("SELECT id, data FROM docs WHERE collection = 'clients'").all()
    .filter(r => { const c = JSON.parse(r.data); return c.type !== "societe" && norm(c.nom).includes("CHENU"); }).map(r => r.id);
  const all = col => db.prepare("SELECT id, num, data FROM docs WHERE collection = ?").all(col).map(r => Object.assign(JSON.parse(r.data), { id: r.id, num: r.num }));
  const f = all("factures").filter(x => clients.includes(x.clientId) && x.statut === "emise" && !x.avoir)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
  if (!f) { console.log("Facture d'essai CHENU : aucune facture émise trouvée (nouvel essai au prochain démarrage)"); return; }
  db.transaction(() => {
    const avoirs = all("factures").filter(x => x.avoirDe === f.id);
    const ids = [f.id].concat(avoirs.map(a => a.id));
    ids.forEach(id => db.prepare("DELETE FROM docs WHERE collection = 'factures' AND id = ?").run(id));
    all("documents").filter(d => ids.includes(d.refId)).forEach(d => {
      db.prepare("DELETE FROM docs WHERE collection = 'documents' AND id = ?").run(d.id);
      if (d.fileId) { db.prepare("DELETE FROM files WHERE id = ?").run(d.fileId); fs.rmSync(path.join(FILES_DIR, d.fileId), { force: true }); }
    });
    all("devis").filter(d => ids.includes(d.factureId)).forEach(d => {
      const b = Object.assign({}, d); delete b.id; b.factureId = "";
      db.prepare("UPDATE docs SET data = ? WHERE collection = 'devis' AND id = ?").run(JSON.stringify(b), d.id);
    });
    all("dossiers").filter(d => (d.temps || []).some(t => ids.includes(t.factureId))).forEach(d => {
      const b = Object.assign({}, d); delete b.id; b.temps.forEach(t => { if (ids.includes(t.factureId)) delete t.factureId; });
      db.prepare("UPDATE docs SET data = ? WHERE collection = 'dossiers' AND id = ?").run(JSON.stringify(b), d.id);
    });
    db.prepare("INSERT INTO journal VALUES (?,?,?,?)").run(now(), null, "reprise", lot);
    db.prepare("INSERT INTO journal VALUES (?,?,?,?)").run(now(), null, "suppression_facture_essai", (f.num || f.id) + (avoirs.length ? " + " + avoirs.length + " avoir(s)" : ""));
  })();
  console.log("Facture d'essai CHENU supprimée : " + f.num);
})();

// ---------------------------------------------------------------- Situation « Divorce JAP » renommée « Divorce » (une seule fois)
(function situationDivorce() {
  const lot = "situation-divorce-2026-11-26";
  if (db.prepare("SELECT 1 FROM journal WHERE action = 'reprise' AND detail = ?").get(lot)) return;
  let n = 0;
  db.transaction(() => {
    db.prepare("SELECT id, data FROM docs WHERE collection = 'dossiers'").all().forEach(r => {
      const d = JSON.parse(r.data); if (!/^divorce\s+jap$/i.test(String(d.etape || "").trim())) return;
      d.etape = "Divorce"; db.prepare("UPDATE docs SET data = ? WHERE collection = 'dossiers' AND id = ?").run(JSON.stringify(d), r.id); n++;
    });
    db.prepare("INSERT INTO journal VALUES (?,?,?,?)").run(now(), null, "reprise", lot);
  })();
  console.log("Situation « Divorce JAP » → « Divorce » : " + n + " dossier(s)");
})();

// ---------------------------------------------------------------- Renumérotation ponctuelle : dernier devis du client DINET
(function renumeroterDevisDinet() {
  const lot = "devis-dinet-2026-11-18";
  if (db.prepare("SELECT 1 FROM journal WHERE action = 'reprise' AND detail = ?").get(lot)) return;
  const norm = v => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const clients = db.prepare("SELECT id, data FROM docs WHERE collection = 'clients'").all()
    .filter(r => { const c = JSON.parse(r.data); return norm([c.nom, c.prenom, c.societe].join(" ")).includes("DINET"); }).map(r => r.id);
  const devis = db.prepare("SELECT id, num, data FROM docs WHERE collection = 'devis'").all().map(r => Object.assign(JSON.parse(r.data), { id: r.id, num: r.num }))
    .filter(d => clients.includes(d.clientId)).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const d = devis[0];
  if (!d) { console.log("Renumérotation DINET : aucun devis trouvé (sera retentée au prochain démarrage)"); return; }
  if (!d.dossierId) { console.log("Renumérotation DINET : le devis " + d.num + " n'est rattaché à aucun dossier"); return; }
  const ancien = d.num, nouveau = devisNum(d.dossierId, d.id);
  db.transaction(() => {
    const body = Object.assign({}, d, { num: nouveau, updatedAt: now() }); delete body.id;
    db.prepare("UPDATE docs SET num = ?, data = ?, updated_at = ? WHERE collection = 'devis' AND id = ?").run(nouveau, JSON.stringify(body), now(), d.id);
    // Factures établies depuis ce devis : référence mise à jour.
    db.prepare("SELECT id, data FROM docs WHERE collection = 'factures'").all().forEach(r => {
      const f = JSON.parse(r.data); if (f.devisId !== d.id) return;
      f.devisNum = nouveau; db.prepare("UPDATE docs SET data = ? WHERE collection = 'factures' AND id = ?").run(JSON.stringify(f), r.id);
    });
    db.prepare("INSERT INTO journal VALUES (?,?,?,?)").run(now(), null, "reprise", lot);
    db.prepare("INSERT INTO journal VALUES (?,?,?,?)").run(now(), null, "renumerotation_devis", ancien + " -> " + nouveau);
  })();
  console.log("Devis DINET renuméroté : " + ancien + " -> " + nouveau);
})();

// ---------------------------------------------------------------- Reprise de dossiers existants
// ajouts-dossiers.json : clients et dossiers repris d'un tableau, insérés une seule fois (lot identifié par « lot »).
// Un dossier dont le numéro existe déjà n'est pas remplacé ; un client de même nom est réutilisé.
(function ajoutsDossiers() {
  const f = path.join(__dirname, "ajouts-dossiers.json"); if (!fs.existsSync(f)) return;
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { console.warn("ajouts-dossiers.json illisible"); return; }
  const lot = "ajouts-dossiers:" + (d.lot || "1");
  if (db.prepare("SELECT 1 FROM journal WHERE action = 'reprise' AND detail = ?").get(lot)) return;
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1").get(), by = admin ? admin.id : null;
  const norm = v => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const ins = (col, id, num, body) => db.prepare("INSERT INTO docs (collection, id, num, data, created_by, updated_by, updated_at) VALUES (?,?,?,?,?,?,?)").run(col, id, num, JSON.stringify(Object.assign(body, { createdBy: by, createdAt: now(), updatedAt: now() })), by, by, now());
  let n = 0;
  db.transaction(() => {
    const clients = db.prepare("SELECT id, data FROM docs WHERE collection = 'clients'").all().map(r => Object.assign(JSON.parse(r.data), { id: r.id }));
    const key = c => norm(c.type === "societe" ? c.societe : (c.nom || "") + " " + (c.prenom || ""));
    (d.dossiers || []).forEach(x => {
      if (db.prepare("SELECT 1 FROM docs WHERE collection = 'dossiers' AND num = ?").get(String(x.num))) return;
      let c = clients.find(k => key(k) === key(x.client));
      if (!c) { c = Object.assign({ id: newId(), adresse: "", notes: "" }, x.client); const b = Object.assign({}, c); delete b.id; ins("clients", c.id, null, b); clients.push(c); }
      const body = Object.assign({}, x.dossier, { clientId: c.id });
      ins("dossiers", newId(), String(x.num), Object.assign(body, { num: String(x.num) }));
      n++;
    });
    db.prepare("INSERT INTO journal VALUES (?,?,?,?)").run(now(), by, "reprise", lot);
  })();
  console.log("Reprise de dossiers : " + n + " dossier(s) ajouté(s)");
})();

// ---------------------------------------------------------------- Sauvegarde quotidienne (30 jours)
function backupNow() {
  const day = new Date(Date.now() + 11 * 3600000).toISOString().slice(0, 10);
  const root = path.join(DATA_DIR, "sauvegardes");
  fs.mkdirSync(root, { recursive: true });
  return db.backup(path.join(root, "cabinet-" + day + ".db")).then(() => {
    const fdest = path.join(root, "fichiers"); fs.mkdirSync(fdest, { recursive: true });
    fs.readdirSync(FILES_DIR).forEach(f => { const t = path.join(fdest, f); if (!fs.existsSync(t)) fs.copyFileSync(path.join(FILES_DIR, f), t); });
    const all = fs.readdirSync(root).filter(f => /^cabinet-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    all.slice(0, Math.max(0, all.length - 30)).forEach(f => fs.rmSync(path.join(root, f), { force: true }));
    console.log("Sauvegarde quotidienne : " + day);
  });
}
if (process.env.SAUVEGARDE_QUOTIDIENNE !== "false") {
  let last = "";
  setInterval(() => {
    const t = new Date(Date.now() + 11 * 3600000), day = t.toISOString().slice(0, 10);
    if (t.getUTCHours() === 2 && day !== last) { last = day; backupNow().catch(e => console.error("Sauvegarde échouée :", e.message)); }
  }, 10 * 60 * 1000);
}

app.listen(PORT, () => console.log("Cabinet – gestion : http://localhost:" + PORT));
