# Viewfinder — reprise et audit du 15 septembre 2026

Ce document conserve l'état utile du travail et ses limites. Ce n'est pas une transcription intégrale des conversations, ni une preuve de qualité artistique des futures images.

## Objectif et autorisations

Fabien veut une application utilisable pour produire des posts et des campagnes SDZ complètes. Priorité à la fiabilité du parcours existant. Il a autorisé les corrections GitHub et le déploiement sur Netlify. Ne pas ajouter de fonctionnalités ou refondre l'architecture sans nécessité. Aucun appel OpenAI Images payant pendant cet audit ; ne pas lancer de Golden Test sans préparer et faire confirmer son coût.

## Référence technique

- Dépôt : `fabienducant-dot/viewfinder`.
- Branche utilisée pour les tests : `audit/finalize-viewfinder-v3`, PR #14.
- Preview : https://deploy-preview-14--fascinating-kashata-73134d.netlify.app
- Base de cet audit : `1ba9983fe69952a4f009dfc3f8bf3e4fbba8bb3a`, version `3.2.3-campaign-coherence`.
- Cette base avait 181 tests réussis, CI GitHub réussie, déploiement Netlify prêt, sept préparations serveur HTTP 200 avec un même univers. Cela n'avait pas testé toutes les interruptions du navigateur.
- Version de ce correctif : `3.2.4-campaign-resilience`.
- La production/main n'est pas fusionnée par cette intervention.

## Contraintes produit et artistiques

Logo officiel conservé sans redessin. Composition de marque exclusivement Sharp serveur pour V4, aucun secours Canvas. Signature La Santé des Zèbres / Raismes - Valenciennes. Noir détaillé et or noble, ivoire possible pour la lisibilité ; éviter le bleu dominant, l'horreur, le spa générique. Story immersive, logo à l'échelle premium, texte lisible, aucun clipping. Trois plans et un sujet lisible, transformation émotionnelle compréhensible. Les plans narratifs ne doivent pas imposer une séance de massage. Les démonstrations demandées et la fidélité aux appareils gardent leurs exigences métier. Références officielles PSiO nécessaires. Google sans accroche : son mode de crédibilité locale reste distinct des scènes narratives.

Une campagne partage son univers mais conserve un plan et un texte adaptés par format. Une photo maîtresse au maximum dans le parcours mutualisé ; adaptations Sharp sans appel Images. Les formats incompatibles peuvent être refusés sans génération supplémentaire automatique.

## Défauts reproduits et correctifs

1. `normalizeState` recréait les objets du calendrier : les tâches asynchrones pouvaient modifier un objet détaché après un rendu. La normalisation conserve désormais l'identité de chaque post.
2. L'identifiant de demande campagne était recréé après une réponse de création perdue. Il est désormais enregistré avant l'appel et conservé au rechargement. Un échec d'enregistrement local bloque une nouvelle création.
3. La reprise automatique et un clic pouvaient suivre/lancer simultanément le même item. Un travail actif par item est partagé dans la page.
4. Le choix du maître ignorait les jobs en attente et les demandes envoyées sans réponse. Ces travaux passent avant un nouveau maître.
5. Les campagnes ne transmettaient pas la confirmation supplémentaire de coût au-delà de 0,30 €. Une confirmation explicite est maintenant demandée et transmise ; le serveur reste l'autorité du plafond.
6. La récupération d'un job PSiO déjà payé dépendait encore des références locales et du logo disponible côté navigateur. La reprise utilise le job serveur, conserve la validation serveur et évite cette précondition de nouvelle génération.
7. Le mode Test/Production sélectionné après la préparation pouvait contredire le plan enregistré. La génération reprend le mode du plan. Le marqueur de moteur Sharp survit à la normalisation.
8. Une panne de composition après réception de la photo pouvait laisser un brut orphelin de ses métadonnées. Le worker enregistre immédiatement le lien vers le brut et le plan, conserve l'analyse fournie par l'erreur du compositeur et rend ces jobs échoués découvrables par la récupération gratuite. La preuve d'analyse est également conservée avant écriture du résultat final.

Tests : sept cas d'interruption échouent sur le HTML de la version de base, puis passent sur le correctif. Trois tests supplémentaires couvrent une panne de composition simulée après une réponse Images simulée, le refus de prétendre récupérer une image sans analyse, et le parcours navigateur complet depuis un statut échoué jusqu'à la recomposition gratuite. Le statut reste échoué tant qu'une véritable recomposition n'a pas abouti. Aucun appel réseau OpenAI dans ces tests.

## Limites et risques à ne pas masquer

- L'idempotence serveur utilise encore une lecture puis une écriture Blobs séparées. Le verrou de page ne constitue pas un verrou distribué : deux onglets/appareils lançant simultanément une même demande restent un risque à traiter avec une primitive atomique réellement supportée. Ne pas promettre une garantie absolue contre toute double facturation.
- Si l'analyse visuelle elle-même échoue, le brut et le plan sont préservés mais la récupération Sharp exige toujours une analyse. Le correctif ne fabrique pas un résultat de validation ; une reprise d'analyse distincte reste à traiter.
- Les anciens jobs déjà échoués avant ce correctif peuvent ne pas posséder ces métadonnées. Le correctif ne les reconstitue pas rétroactivement.
- Une indisponibilité durable de Blobs ou un stockage navigateur plein restent de vrais échecs possibles ; ils doivent être affichés. Le blocage avant création réduit le risque sans réparer le stockage.
- La suite déterministe et les contrôles de déploiement ne prouvent pas la qualité artistique d'une nouvelle image ni la publication réelle Make. Aucun envoi social n'a été effectué.
- Le JSON benchmark joint de juillet ne représente pas l'état du moteur de septembre. Les sorties fournies par Fabien, le code et les réponses de la preview sont les preuves pertinentes.

## Prochaine reprise

Vérifier le dernier commit effectif de la PR #14 et son déploiement avant toute nouvelle modification. Lire ce document et les tests d'interruption. Priorités restantes : concurrence entre pages/appareils, reprise d'analyse échouée, puis un seul Golden Test réel explicitement confirmé. Ne pas recommencer un audit général ni annoncer l'application sans bugs.

Référence JavaScript consultée pour la conservation de l'objet : https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign . Instructions Netlify Functions et Blobs consultées pour le stockage ; les handlers existants sont conservés pour éviter une migration d'architecture dans ce correctif.
