"use strict";

function normalizeImageModel(model){
  const normalized = typeof model === "string" ? model.trim() : "";
  return normalized || "gpt-image-2";
}

function applyImageEditOptions(form, { model, quality } = {}){
  const imageModel = normalizeImageModel(model);
  form.set("model", imageModel);

  // gpt-image-2 possède une fidélité d'entrée native et refuse explicitement
  // le paramètre input_fidelity. La suppression est volontairement forcée
  // avant chaque appel afin qu'aucun ancien chemin ne puisse le laisser passer.
  form.delete("input_fidelity");
  if(imageModel !== "gpt-image-2"){
    form.set("input_fidelity", "high");
  }

  if(quality){
    form.set("quality", String(quality));
  }else{
    form.delete("quality");
  }

  return imageModel;
}

module.exports = { applyImageEditOptions, normalizeImageModel };
