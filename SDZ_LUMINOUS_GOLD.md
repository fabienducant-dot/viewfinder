# SDZ — lumière, fantastique, or et signature Raismes

Version applicative : 3.2.6-luminous-gold. Base : branche audit/finalize-viewfinder-v3 (récupération atomique des générations et campagnes).

## Changements

- SceneIntent V4 reste l’unique prompt envoyé au fournisseur. Lumière ample, ombres détaillées, or métallique en grandes surfaces et fantastique visible sont désormais communs aux sept plateformes et aux dix-huit prestations + Tous sujets.
- Les quatorze mondes existants conservent leur rotation et leur continuité de campagne. Leurs phénomènes fantastiques et leurs matières dorées sont renforcés, sans changer les produits officiels ni les règles métier.
- Google Business conserve ses règles éditoriales sans accroche par défaut et reçoit la même direction artistique. Le décor fantastique y est explicitement une métaphore publicitaire, pas une photographie du cabinet réel.
- Une demande explicite de photo documentaire ou sans fantastique conserve la priorité.
- Le contrôle visuel mesure la lisibilité de l’exposition et la présence réelle d’or. Une image trop sombre ou pauvre en or est signalée non conforme. Une ancienne analyse sans ces mesures reçoit un avertissement, jamais une fausse confirmation de conformité.
- Signature commune : logo officiel inchangé au-dessus du nom en serif dorée ; RAISMES en lettres espacées, ivoire, entre deux filets fins. Fin de RAISMES - VALENCIENNES. Rendu vectoriel puis suréchantillonnage existant conservé. Marge basse Story de 12 % respectée.
- Le changement concerne les nouvelles générations ; une recomposition peut modifier la signature d’un ancien brut, mais ne recrée pas son décor.

## Vérification

Tests de préparation de 133 couples sujet/format ; matrice de composition Sharp sur 133 couples ; vérification du JavaScript de démarrage ; tests de reprise des images payées, absence de double génération, interruption de campagne, fidélité produit et restitution du texte intégral.

La miniature `artifacts/luminous-gold/signature-raismes.png` est un rendu réel du compositeur sur fond de contrôle. Elle vérifie uniquement la signature, pas la direction artistique d’une scène générée.

Pas de génération payante OpenAI ni de déploiement de production effectués pour cette modification. La qualité artistique finale reste à vérifier sur une image réellement générée par l’application.

Références techniques consultées : https://sharp.pixelplumbing.com/api-composite/ et https://sharp.pixelplumbing.com/api-resize/ (16 septembre 2026).
