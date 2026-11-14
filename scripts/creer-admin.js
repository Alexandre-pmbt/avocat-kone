"use strict";
// Crée (ou réinitialise) un compte administrateur.
// Usage : node scripts/creer-admin.js "Alexandre RODRIGUEZ" avocat@cabinet.nc "MotDePasseSolide"
require("dotenv").config();
const path = require("path"), crypto = require("crypto"), fs = require("fs");
const bcrypt = require("bcryptjs"), Database = require("better-sqlite3");
const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password || password.length < 8) {
  console.error('Usage : node scripts/creer-admin.js "Nom Prénom" email@cabinet.nc "mot de passe (8 caractères minimum)"');
  process.exit(1);
}
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const file = path.join(DATA_DIR, "cabinet.db");
if (!fs.existsSync(file)) { console.error("Base introuvable (" + file + "). Démarrez d'abord le serveur une fois."); process.exit(1); }
const db = new Database(file);
const e = email.trim().toLowerCase(), hash = bcrypt.hashSync(password, 10);
const u = db.prepare("SELECT id FROM users WHERE email = ?").get(e);
if (u) { db.prepare("UPDATE users SET name = ?, password_hash = ?, role = 'admin', active = 1 WHERE id = ?").run(name, hash, u.id); console.log("Compte existant mis à jour en administrateur : " + e); }
else { db.prepare("INSERT INTO users VALUES (?,?,?,?,'admin',1,?)").run(crypto.randomBytes(12).toString("hex"), e, name, hash, new Date().toISOString()); console.log("Administrateur créé : " + e); }
