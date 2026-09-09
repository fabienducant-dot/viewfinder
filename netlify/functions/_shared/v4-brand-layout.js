"use strict";

const VERSION="4.0.0-matrix-safe-typography";
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
function resolveTypographyLayout({platform,title,subtitle,textMode,safeWidth,safeHeight,scale=1,measureTitle,measureSubtitle}){
  const policy=POLICIES[platform]||POLICIES["Instagram Portrait"],titleText=clean(title),subtitleText=textMode==="TEXT_MODE_MINIMAL"||textMode==="TEXT_MODE_NONE"?"":clean(subtitle);
  const xGuard=Math.max(14,Math.round(safeWidth*.035)),yGuard=Math.max(10,Math.round(safeHeight*.06)),innerWidth=Math.max(40,safeWidth-xGuard*2),innerHeight=Math.max(24,safeHeight-yGuard*2),effectiveScale=Math.max(.82,Math.min(1.35,Number(scale)||1));
  if(!titleText&&!subtitleText)return Object.freeze({story:platform==="Story",titleLines:[],subtitleLines:[],titleSize:0,subtitleSize:0,safeWidth:innerWidth,safeHeight:innerHeight,usedHeight:0,titleMaxLines:policy.titleMaxLines,subtitleMaxLines:policy.subtitleMaxLines,titleLineHeight:0,subtitleLineHeight:0,sectionGap:0,xGuard,yGuard,exact:true,fallbackLevel:0,policy});
  const titlePreferred=scaled(policy.titlePreferred,effectiveScale),subtitlePreferred=scaled(policy.subtitlePreferred,effectiveScale),titleHardMin=scaled(policy.titleHardMin,effectiveScale),subtitleHardMin=scaled(policy.subtitleHardMin,effectiveScale);
  const titleCandidates=titleText?Array.from({length:titlePreferred-titleHardMin+1},(_,i)=>titlePreferred-i):[0];
  const subtitleCandidates=subtitleText?Array.from({length:subtitlePreferred-subtitleHardMin+1},(_,i)=>subtitlePreferred-i):[0];
  for(const titleSize of titleCandidates){
    const titleLines=titleText?wrapMeasured(titleText,titleSize,innerWidth,policy.titleMaxLines,measureTitle):[];if(titleText&&!titleLines)continue;
    for(const subtitleSize of subtitleCandidates){
      const subtitleLines=subtitleText?wrapMeasured(subtitleText,subtitleSize,innerWidth,policy.subtitleMaxLines,measureSubtitle):[];if(subtitleText&&!subtitleLines)continue;
      const titleLineHeight=titleSize?Math.ceil(titleSize*1.18):0,subtitleLineHeight=subtitleSize?Math.ceil(subtitleSize*1.22):0,sectionGap=titleLines.length&&subtitleLines.length?Math.max(10,Math.round(Math.max(titleSize*.28,subtitleSize*.48))):0,titleHeight=titleLines.length*titleLineHeight,subtitleHeight=subtitleLines.length*subtitleLineHeight,usedHeight=titleHeight+sectionGap+subtitleHeight;
      if(usedHeight>innerHeight)continue;
      const isExact=exact(titleLines,titleText)&&exact(subtitleLines,subtitleText);if(!isExact)continue;
      return Object.freeze({story:platform==="Story",titleLines:Object.freeze(titleLines),subtitleLines:Object.freeze(subtitleLines),titleSize,subtitleSize,safeWidth:innerWidth,safeHeight:innerHeight,usedHeight,titleMaxLines:policy.titleMaxLines,subtitleMaxLines:policy.subtitleMaxLines,titleLineHeight,subtitleLineHeight,sectionGap,xGuard,yGuard,exact:true,fallbackLevel:(titlePreferred-titleSize)+(subtitlePreferred-subtitleSize),policy});
    }
  }
  throw new Error(`Texte impossible à composer sans débordement sur ${platform}: « ${titleText} » / « ${subtitleText} »`);
}
function computeTypographyGeometry({layout,typography,measureTitle,measureSubtitle}){
  const centerX=layout.x+layout.width/2,safeLeft=centerX-typography.safeWidth/2,safeRight=centerX+typography.safeWidth/2,safeTop=layout.textArea.top+typography.yGuard,safeBottom=layout.textArea.bottom-typography.yGuard;
  let cursor=safeTop;const titleBoxes=[],subtitleBoxes=[];
  for(const line of typography.titleLines){const width=measureTitle(line,typography.titleSize),top=cursor,bottom=top+typography.titleLineHeight;titleBoxes.push(Object.freeze({line,left:centerX-width/2,right:centerX+width/2,top,bottom,baseline:top+Math.round(typography.titleSize*.90),width}));cursor=bottom;}
  if(titleBoxes.length&&typography.subtitleLines.length)cursor+=typography.sectionGap;
  for(const line of typography.subtitleLines){const width=measureSubtitle(line,typography.subtitleSize),top=cursor,bottom=top+typography.subtitleLineHeight;subtitleBoxes.push(Object.freeze({line,left:centerX-width/2,right:centerX+width/2,top,bottom,baseline:top+Math.round(typography.subtitleSize*.90),width}));cursor=bottom;}
  const boxes=[...titleBoxes,...subtitleBoxes],bounds=boxes.length?Object.freeze({left:Math.min(...boxes.map(x=>x.left)),right:Math.max(...boxes.map(x=>x.right)),top:Math.min(...boxes.map(x=>x.top)),bottom:Math.max(...boxes.map(x=>x.bottom))}):Object.freeze({left:centerX,right:centerX,top:safeTop,bottom:safeTop});
  const withinSafeArea=bounds.left>=safeLeft-0.01&&bounds.right<=safeRight+0.01&&bounds.top>=safeTop-0.01&&bounds.bottom<=safeBottom+0.01;
  return Object.freeze({centerX,safeLeft,safeRight,safeTop,safeBottom,titleBoxes:Object.freeze(titleBoxes),subtitleBoxes:Object.freeze(subtitleBoxes),bounds,withinSafeArea});
}
module.exports={VERSION,POLICIES,wrapMeasured,resolveTypographyLayout,computeTypographyGeometry};
