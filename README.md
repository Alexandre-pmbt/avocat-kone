# Cabinet RODRIGUEZ DANIEL – gestion (Koné)

Logiciel de gestion pour cabinet d'avocat : demandes clients (saisie du secrétariat), dossiers (échéances, audiences,
suivi, temps passé), clients, devis et factures (PDF, TGC, débours, avoirs) et suivi des règlements.

## Mise en ligne sur Railway

1. Créer un projet Railway depuis ce dépôt GitHub (le Dockerfile est détecté).
2. Ajouter un volume monté sur `/app/data` (base de données et sauvegardes : indispensable).
3. Variables : `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `COOKIE_SECURE=true`.
4. Générer un domaine public (Settings › Networking). Chaque envoi sur la branche `main` redéploie automatiquement.

Au premier lancement, l'avocat se connecte, remplit **Paramètres** (en-tête, RIDET, RIB, logo, TGC) puis crée le compte
du secrétariat dans **Équipe**.

## Test en local

```bash
npm install
ADMIN_EMAIL=avocat@test.nc ADMIN_PASSWORD=motdepasse node server.js   # http://localhost:3000
```

## Données

`data/cabinet.db` (SQLite) ; copie automatique chaque nuit vers `data/sauvegardes/` (30 jours). Une sauvegarde complète
peut aussi être téléchargée depuis Paramètres.
