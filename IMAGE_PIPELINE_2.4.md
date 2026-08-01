# Pipeline image 2.4 — scène IA, identité exacte côté serveur

## Décision de production

Le modèle `gpt-image-2` fabrique uniquement la scène photographique. Il ne reçoit pas le logo SDZ
et il lui est interdit de dessiner un logo ou du texte. Le prompt lui demande en revanche de garder
une zone éditoriale calme, cohérente avec `zoneTexte`, afin que la marque s'intègre à la composition.

La Background Function Netlify transmet ensuite l'image brute à un compositeur Sharp/SVG. Celui-ci :

1. charge le fichier logo officiel depuis Netlify Blobs ;
2. l'incruste comme image, sans le redessiner ;
3. rend exactement « LA SANTÉ DES ZÈBRES » et « RAISMES » ;
4. rend l'accroche exacte pour Instagram, Facebook et Story ;
5. ajoute une hiérarchie serif, un voile progressif, des filets or et un cadre éditorial discret.

Cette étape se déroule avant que le résultat soit enregistré. Si le logo manque ou si le
compositeur échoue, le job est déclaré en échec et l'image brute ne peut pas être publiée.

## Pourquoi le logo n'est plus généré par l'API

Une référence haute fidélité améliore la cohérence d'une génération, mais ne garantit pas une copie
pixel-identique ni une orthographe parfaite. Un actif de marque officiel ne doit donc jamais être
redessiné par un modèle génératif. L'API décide de la scène et de l'espace disponible ; le serveur
rend les éléments exacts.

## Références et prestations

Les quatre emplacements de références restent disponibles pour les produits et la scène. PSiO®
conserve ses trois vues officielles et peut recevoir une référence supplémentaire. Les prestations
corporelles conservent le geste, la matière, le matériel et les deux rôles lorsque le soin l'exige.
L'ancien remplacement par une silhouette seule devant un paysage est désactivé.

## Contrôle final

Après composition, le contrôle vision/OCR vérifie le logo, la signature, l'accroche, le produit,
la palette et l'absence de texte parasite. Une non-conformité reste mise en quarantaine.

## Vérification locale

```bash
npm install
npm test
```

Les tests couvrent le modèle, les quatre références, la désactivation du paysage générique, le
contrat de marque, les ratios et un rendu Sharp réel en 1088 × 1920.
