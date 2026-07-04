# Viewfinder — migration vers GitHub + Netlify Functions

## 1. Créer le dépôt GitHub
1. Va sur https://github.com/new
2. Nom du dépôt : `viewfinder` (public ou privé, peu importe)
3. Ne coche aucune case (pas de README auto, pas de .gitignore) → "Create repository"
4. Sur la page du dépôt vide, clique **"uploading an existing file"**
5. Glisse **tout le contenu de ce dossier** (pas le dossier lui-même, son contenu : `index.html`, `manifest.json`, `sw.js`, `netlify.toml`, le dossier `icons/`, le dossier `netlify/`)
6. "Commit changes"

## 2. Reconnecter Netlify à ce dépôt
1. Va sur ton site existant dans le tableau de bord Netlify (`fascinating-kashata-73134d`)
2. **Site configuration → Build & deploy → Link repository** (ou "Link site to Git" selon la version de l'interface)
3. Choisis GitHub, autorise l'accès, sélectionne le dépôt `viewfinder`
4. Paramètres de build : laisse "Build command" **vide**, "Publish directory" = `.` (racine)
5. Déploie

## 3. Ajouter les clés API (variables d'environnement)
1. **Site configuration → Environment variables → Add a variable**
2. Ajoute :
   - `OPENAI_API_KEY` = ta clé OpenAI (sk-...)
   - `ANTHROPIC_API_KEY` = ta clé Anthropic (si tu comptes l'utiliser)
   - `GEMINI_API_KEY` = ta clé Google AI Studio (si tu comptes l'utiliser)
3. Redéploie le site (Deploys → Trigger deploy) pour que les fonctions voient ces variables

## 4. Vérifier que ça marche
1. Ouvre ton site, va dans **Paramètres API**, ajoute "OpenAI" via le bouton rapide
2. Va dans **Créer un post**, génère un prompt texte, clique **"Générer via l'API"**
3. Si tout est configuré, le texte revient automatiquement — plus de copier/coller
4. Pour l'image, le bouton **"Générer l'image via l'API (OpenAI)"** apparaît sous le prompt image dès qu'un fournisseur OpenAI est configuré

## Notes
- Tes données (bibliothèque, connaissances, historique) restent dans le navigateur de ton téléphone — la migration ne les touche pas.
- Si un appel API échoue (clé manquante, quota dépassé...), le message d'erreur s'affiche et le mode manuel (copier/coller) reste toujours disponible juste en dessous.
- Pour ajouter un futur fournisseur d'image (Stability, Ideogram...), il suffit d'ajouter une fonction `netlify/functions/generate-image-XXX.js` sur le même modèle — aucune refonte nécessaire.
