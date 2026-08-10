"use strict";

const LAYOUT_FAMILIES = ["Hero","Split","Minimal","Monumental","Editorial","Magazine","Storytelling","Immersif","Portrait","Paysage"];
const REQUIRED_FIELDS = ["type","people","uniqueIdentityCount","visibleRepresentationPolicy","requiredCompositeStages","primarySubject","secondarySubject","requiredAction","recognition","allowedEquipment","forbiddenEquipment","forbiddenAccessories","outfit","position","bodyZones","visualPlanes","story","emotion","detailLevel","recommendedLayout","compatibleLayouts","firstLook","secondLook","thirdLook","referencePolicy","blockingConditions"];

const definitions = [
  ["Massage Zébré","massage signature",2,"receveur sur table","praticien","enchaînement personnalisé fluide","alternance de gestes enveloppants et ciblés","table, drap noir","appareil médical, pierres","bougies, fleurs, bol spa","tenue noire professionnelle","allongé, praticien debout","dos, jambes, épaules"],
  ["Massage Ayurvédique Abhyanga","massage ayurvédique",2,"receveur sur table","praticien","long mouvement huilé synchronisé","huile et mouvements continus tête-pieds","table, huile","machine","pierres, bambous","tenue noire sobre","allongé","corps entier hors zones intimes"],
  ["Massage Balinais","massage balinais",2,"receveur","praticien","pression palmaire puis étirement","pressions profondes et étirements balinais","table","machine","pierres chaudes","tenue noire","allongé","dos, membres"],
  ["Massage Thaï traditionnel","massage thaï",2,"receveur sur futon","praticien","pression et étirement assisté","futon au sol, posture thaï habillée","futon","table électrique, huile","accessoires spa","vêtements souples","habillé au sol","membres, dos"],
  ["Massage Femme enceinte","massage prénatal",2,"femme enceinte","praticien","massage latéral doux","ventre visible, coussins de soutien","table, coussins","machine","huiles non identifiées","tenue confortable","décubitus latéral","dos, épaules, jambes"],
  ["Massage Enfant","massage enfant",3,"enfant accompagné","praticien et parent","geste doux avec parent présent","enfant, consentement et accompagnant visible","table, coussin","machine","accessoires spa","tenues pudiques","allongé ou assis","dos, mains, épaules"],
  ["Réflexologie plantaire thaïlandaise","réflexologie",2,"pieds du receveur","praticien","pression précise du pied","pied et points de pression clairement visibles","fauteuil, bâtonnet réflexologie","machine","pierres, fleurs","tenue noire","assis face aux pieds","pieds, chevilles"],
  ["Massage japonais du visage","massage visage",2,"visage du receveur","mains du praticien","lifting manuel symétrique","gestuelle faciale japonaise nette","table","rouleau électrique","masque, pierres","tenue noire","allongé","visage, cou"],
  ["Massage lymphatique expert","drainage manuel",2,"receveur","praticien","pompage lymphatique léger","mouvements directionnels doux","table","machine de pressothérapie","ventouses","tenue clinique noire","allongé","jambes, abdomen hors zones intimes"],
  ["Soin énergétique","soin énergétique",2,"receveur habillé","praticien","mains immobiles à distance du corps","travail sans contact reconnaissable","table","appareil","cristaux, pendule","tenue noire","allongé habillé","axe du corps"],
  ["Reiki","Reiki",2,"receveur habillé","praticien","imposition des mains sans contact","mains parallèles au-dessus du torse","table","appareil","cristaux, fumée","tenue noire","allongé habillé","tête, torse"],
  ["Luminothérapie PSIO®","PSiO",1,"personne portant les lunettes PSiO® officielles","lunettes PSiO®","séance immobile lunettes portées","lunettes officielles fidèles à la référence","lunettes PSiO® officielles","scanner, boîtier générique, câbles inventés","masque hybride, pierres","tenue noire confortable","semi-allongé","yeux, tête"],
  ["Biorésonance quantique","biorésonance",2,"client en bilan","praticien","lecture professionnelle du dispositif réel","séance de bilan clairement encadrée","matériel réel fourni en référence","scanner inventé, écran médical fictif","cristaux","tenue professionnelle","assis","mains, posture générale"],
  ["Soin minceur","massage minceur",2,"zone corporelle ciblée","praticien","palper-rouler manuel","geste raffermissant manuel visible","table","machine inventée","ventouses non prévues","tenue noire","allongé","jambes, abdomen hors zones intimes"],
  ["Offre Sylver","offre composite",2,"même receveur sur deux temps","praticien et PSiO®","Massage Abhyanga OU Zébré puis séance PSiO®","deux étapes continues, lunettes officielles au second plan","table, huile, lunettes PSiO® officielles","scanner, appareil hybride, câbles inventés","pierres, boîtier générique","tenue noire","allongé puis semi-allongé","dos, mains, yeux"],
  ["Offre Gold","offre composite",2,"même receveur sur trois temps","praticien et PSiO®","massage au premier plan, Reiki au plan secondaire, PSiO® à l'arrière-plan","trois étapes continues et toutes lisibles","table, lunettes PSiO® officielles","scanner, appareil médical inventé, boîtier générique, câbles inventés, pierre de soin fictive","pierres, dispositif fictif","tenue noire","allongé puis semi-allongé","dos, mains, torse, yeux"],
  ["Massage dos/zone","massage ciblé",2,"zone demandée","praticien","geste précis sur la zone","zone ciblée au centre de la narration","table","machine","pierres, fleurs","tenue noire","allongé ou assis","dos ou zone explicitement demandée"],
  ["Prestations en entreprise","bien-être en entreprise",2,"salarié habillé","praticien","massage assis ergonomique","chaise de massage et environnement de travail","chaise ergonomique","table spa, machine","bougies, fleurs","tenues professionnelles","assis","dos, nuque, épaules"],
];

function makeContract(d){
  const [name,type,people,primarySubject,secondarySubject,requiredAction,recognition,allowedEquipment,forbiddenEquipment,forbiddenAccessories,outfit,position,bodyZones]=d;
  const composite=type==="offre composite";
  const requiredCompositeStages=name==="Offre Gold"?["massage personnalisé","imposition des mains Reiki","séance avec lunettes PSiO® officielles"]:name==="Offre Sylver"?["Massage Abhyanga OU Massage Zébré","séance avec lunettes PSiO® officielles"]:[];
  return Object.freeze({ name,type,people,primarySubject,secondarySubject,requiredAction,recognition,allowedEquipment,forbiddenEquipment,forbiddenAccessories,outfit,position,bodyZones,
    uniqueIdentityCount:people, visibleRepresentationPolicy:composite?`exactement ${people} identités humaines cohérentes ; les mêmes identités peuvent être représentées aux ${requiredCompositeStages.length} moments successifs sans compter comme de nouvelles personnes ; aucune identité étrangère`:`chaque identité n'apparaît qu'une fois`,requiredCompositeStages,
    visualPlanes: composite ? "plans narratifs continus explicitement ordonnés" : "premier plan gestuel, sujet principal net, arrière-plan sobre",
    story: composite ? requiredAction : `une scène authentique où ${requiredAction}`,
    emotion:"confiance, apaisement premium", detailLevel:"élevé et anatomiquement cohérent",
    recommendedLayout: name==="Offre Gold"||name==="Offre Sylver" ? "Storytelling" : (name.includes("entreprise") ? "Editorial" : "Hero"),
    compatibleLayouts: composite ? ["Storytelling","Magazine","Split"] : ["Hero","Editorial","Portrait","Paysage","Minimal"],
    firstLook:primarySubject, secondLook:requiredAction, thirdLook:secondarySubject,
    referencePolicy: name.includes("PSIO")||composite ? "références PSiO® uniquement dans le plan réellement centré PSiO®, fidélité produit obligatoire" : "référence facultative, jamais copiée comme identité",
    blockingConditions:[composite?`nombre d'identités humaines uniques différent de ${people}, sans compter leurs répétitions narratives`:`nombre de personnes différent de ${people}`,"prestation non reconnaissable","geste obligatoire absent","matériel ou accessoire interdit","texte ou logo dans la photographie brute",...(composite?["une étape composite absente","continuité du bénéficiaire ou du praticien absente","identité étrangère présente"]:[])],
  });
}
const SERVICE_REGISTRY=Object.freeze(Object.fromEntries(definitions.map(d=>[d[0],makeContract(d)])));
function getServiceContract(name){ const c=SERVICE_REGISTRY[name]; if(!c) throw new Error(`Prestation V3 inconnue : ${name}`); return c; }
function validateRegistry(){ return Object.values(SERVICE_REGISTRY).every(c=>REQUIRED_FIELDS.every(k=>c[k]!==undefined)&&LAYOUT_FAMILIES.includes(c.recommendedLayout)&&c.compatibleLayouts.every(x=>LAYOUT_FAMILIES.includes(x))); }

module.exports={ SERVICE_REGISTRY, REQUIRED_FIELDS, LAYOUT_FAMILIES, getServiceContract, validateRegistry };
