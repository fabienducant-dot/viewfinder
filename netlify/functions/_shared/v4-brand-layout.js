"use strict";

const VERSION="4.1.1-matrix-safe-typography";
const WEAK_WORDS=new Set(["DE","DU","DES","LE","LA","LES","UN","UNE","À","AU","AUX","ET","OU","POUR","DANS"]);
const POLICIES=Object.freeze({
  "Story":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:48,subtitlePreferred:30,titleHardMin:26,subtitleHardMin:18}),
  "Instagram Square":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:52,subtitlePreferred:29,titleHardMin:25,subtitleHardMin:18}),
  "Instagram Portrait":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:56,subtitlePreferred:31,titleHardMin:27,subtitleHardMin:18}),
  "Facebook":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:56,subtitlePreferred:31,titleHardMin:27,subtitleHardMin:18}),
  "Google Business":Object.freeze({titleMaxLines:2,subtitleMaxLines:1,titlePreferred:46,subtitlePreferred:25,titleHardMin:24,subtitleHardMin:16}),
  "Blog":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:48,subtitlePreferred:27,titleHardMin:23,subtitleHardMin:16}),
  "Bannière":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:38,subtitlePreferred:22,titleHardMin:20,subtitleHardMin:15}),
});
function clean(value){return String(value||"").trim().replace(/\s+/g," ");}
function stripPunctuation(value){return String(value||"").replace(/[.,;:!?…]+$/g,"");}
function wrapMeasured(text,fontSize,safeWidth,maxLines,measure){
  const words=clean(text).split(/\s+/).filter(Boolean);if(!words.length)return [];
  const lines=[];let line="";
  for(const word of words){
    if(measure(word,fontSize)>safeWidth)return null;
    const next=line?`${line} ${word}`:word;
    if(!line||measure(next,fontSize)<=safeWidth)line=next;
    else{lines.push(line);line=word;if(lines.length>=maxLines)return null;}
  }
  if(line)lines.push(line);if(lines.length>maxLines)return null;
  for(let i=0;i<lines.length-1;i++){
    const parts=lines[i].split(/\s+/),last=parts.at(-1),weak=WEAK_WORDS.has(stripPunctuation(last).toUpperCase());
    if(!weak||parts.length<2)continue;
    const current=parts.slice(0,-1).join(" "),next=`${last} ${lines[i+1]}`;
    if(measure(next,fontSize)<=safeWidth){lines[i]=current;lines[i+1]=next;}
  }
  return lines.every(line=>measure(line,fontSize)<=safeWidth)?lines:null;
}
function exact(lines,text){return clean(lines.join(" "))===clean(text);}
function scaled(base,scale){return Math.max(1,Math.round(base*scale));}
function renderedHeight(titleLines,subtitleLines,titleSize,subtitleSize){
  const titlePart=titleLines.length?(1+titleLines.length*1.05)*titleSize:0;
  const subtitlePart=subtitleLines.length?(.45+subtitleLines.length*1.10)*subtitleSize:0;
  return Math.ceil(titlePart+subtitlePart);
}
function resolveTypographyLayout({platform,title,subtitle,textMode,safeWidth,safeHeight,scale=1,measureTitle,measureSubtitle}){
  const policy=POLICIES[platform]||POLICIES["Instagram Portrait"],titleText=clean(title),subtitleText=textMode==="TEXT_MODE_MINIMAL"||textMode==="TEXT_MODE_NONE"?"":clean(subtitle),effectiveScale=Math.max(.82,Math.min(1.35,Number(scale)||1));
  const xGuard=Math.max(18,Math.round(safeWidth*.04)),verticalReserve=Math.max(14,Math.round(safeHeight*.12)),innerWidth=Math.max(40,safeWidth-xGuard*2),innerHeight=Math.max(24,safeHeight-verticalReserve);
  if(!titleText&&!subtitleText)return Object.freeze({story:platform==="Story",scale:effectiveScale,titleLines:[],subtitleLines:[],titleSize:0,subtitleSize:0,safeWidth:innerWidth,safeHeight:innerHeight,usedHeight:0,titleMaxLines:policy.titleMaxLines,subtitleMaxLines:policy.subtitleMaxLines,exact:true,fallbackLevel:0,policy});
  const titlePreferred=scaled(policy.titlePreferred,effectiveScale),subtitlePreferred=scaled(policy.subtitlePreferred,effectiveScale),titleHardMin=scaled(policy.titleHardMin,effectiveScale),subtitleHardMin=scaled(policy.subtitleHardMin,effectiveScale);
  const titleCandidates=titleText?Array.from({length:titlePreferred-titleHardMin+1},(_,i)=>titlePreferred-i):[0],subtitleCandidates=subtitleText?Array.from({length:subtitlePreferred-subtitleHardMin+1},(_,i)=>subtitlePreferred-i):[0];
  for(const titleSize of titleCandidates){
    const titleLines=titleText?wrapMeasured(titleText,titleSize,innerWidth,policy.titleMaxLines,measureTitle):[];if(titleText&&!titleLines)continue;
    for(const subtitleSize of subtitleCandidates){
      const subtitleLines=subtitleText?wrapMeasured(subtitleText,subtitleSize,innerWidth,policy.subtitleMaxLines,measureSubtitle):[];if(subtitleText&&!subtitleLines)continue;
      const usedHeight=renderedHeight(titleLines,subtitleLines,titleSize,subtitleSize);if(usedHeight>innerHeight)continue;
      if(!exact(titleLines,titleText)||!exact(subtitleLines,subtitleText))continue;
      return Object.freeze({story:platform==="Story",scale:effectiveScale,titleLines:Object.freeze(titleLines),subtitleLines:Object.freeze(subtitleLines),titleSize,subtitleSize,safeWidth:innerWidth,safeHeight:innerHeight,usedHeight,titleMaxLines:policy.titleMaxLines,subtitleMaxLines:policy.subtitleMaxLines,exact:true,fallbackLevel:(titlePreferred-titleSize)+(subtitlePreferred-subtitleSize),policy});
    }
  }
  throw new Error(`Texte impossible à composer sans débordement sur ${platform}: « ${titleText} » / « ${subtitleText} »`);
}
module.exports={VERSION,POLICIES,wrapMeasured,renderedHeight,resolveTypographyLayout};
