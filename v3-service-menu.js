(function(root,factory){const value=factory();if(typeof module==="object"&&module.exports)module.exports=value;else root.VF_SERVICE_MENU=value;})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const ALL_SUBJECTS="Tous sujets";
  const businessNames=Object.freeze([
    "Massage Zébré","Massage Ayurvédique Abhyanga","Massage Balinais","Massage Thaï traditionnel",
    "Massage Femme enceinte","Massage Enfant","Réflexologie plantaire thaïlandaise",
    "Massage japonais du visage","Massage lymphatique expert","Soin énergétique","Reiki",
    "Luminothérapie PSIO®","Biorésonance quantique","Soin minceur","Offre Sylver","Offre Gold",
    "Massage dos/zone","Prestations en entreprise",
  ]);
  const options=Object.freeze([
    Object.freeze({value:ALL_SUBJECTS,label:"Tous sujets (pas de prestation en particulier)",kind:"generic"}),
    ...businessNames.map(value=>Object.freeze({value,label:value,kind:"service"})),
  ]);
  return Object.freeze({ALL_SUBJECTS,businessNames,options});
});
