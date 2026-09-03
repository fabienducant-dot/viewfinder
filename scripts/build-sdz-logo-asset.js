"use strict";

const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const sharp=require("sharp");

const root=path.resolve(__dirname,"..");
const inputPath=path.join(root,"icons/icon-512.png");
const outputPath=path.join(root,"assets/sdz-logo-compositor.png");
const previewPath=path.join(root,"artifacts/sdz-logo-compositor-checkerboard.png");

function idx(x,y,width){return y*width+x;}
function dilate(mask,width,height,radius=2){
 const out=new Uint8Array(mask.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let found=false;
  for(let dy=-radius;dy<=radius&&!found;dy++)for(let dx=-radius;dx<=radius;dx++){
   const xx=x+dx,yy=y+dy;
   if(xx>=0&&yy>=0&&xx<width&&yy<height&&mask[idx(xx,yy,width)]){found=true;break;}
  }
  if(found)out[idx(x,y,width)]=1;
 }
 return out;
}
function closeSmallGaps(mask,width,height){return dilate(mask,width,height,2);}
function borderReachable(openMask,width,height){
 const visited=new Uint8Array(openMask.length),queue=new Int32Array(openMask.length);let head=0,tail=0;
 const add=(x,y)=>{if(x<0||y<0||x>=width||y>=height)return;const i=idx(x,y,width);if(visited[i]||!openMask[i])return;visited[i]=1;queue[tail++]=i;};
 for(let x=0;x<width;x++){add(x,0);add(x,height-1);}for(let y=1;y<height-1;y++){add(0,y);add(width-1,y);}
 while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1);}
 return visited;
}
async function main(){
 fs.mkdirSync(path.dirname(outputPath),{recursive:true});fs.mkdirSync(path.dirname(previewPath),{recursive:true});
 const normalized=await sharp(inputPath,{failOn:"none"}).rotate().ensureAlpha().png().toBuffer();
 const {data,info}=await sharp(normalized).raw().toBuffer({resolveWithObject:true});
 const {width,height,channels}=info;if(channels<4)throw new Error("Source logo non RGBA");
 const n=width*height,visible=new Uint8Array(n);
 for(let i=0;i<n;i++){
  const o=i*channels,a=data[o+3],r=data[o],g=data[o+1],b=data[o+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
  const chroma=max-min;
  const goldLike=(r>105&&g>65&&r>b*1.18&&g>b*1.05)||(r>140&&g>115&&b<125);
  const nonDark=max>118||chroma>42;
  if(a>16&&(goldLike||nonDark))visible[i]=1;
 }
 const sealed=closeSmallGaps(visible,width,height);
 const outsideOpen=new Uint8Array(n);for(let i=0;i<n;i++)outsideOpen[i]=sealed[i]?0:1;
 const outside=borderReachable(outsideOpen,width,height);
 const foreground=new Uint8Array(n);
 for(let i=0;i<n;i++)foreground[i]=(visible[i]||(!outside[i]&&sealed[i]===0))?1:0;
 // Écarte les petites poussières isolées : elles ne peuvent pas définir la bounding box officielle.
 const componentVisited=new Uint8Array(n),components=[];
 for(let start=0;start<n;start++){
  if(!foreground[start]||componentVisited[start])continue;
  const q=[start],pixels=[];componentVisited[start]=1;
  while(q.length){const i=q.pop();pixels.push(i);const x=i%width,y=Math.floor(i/width);for(const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(xx<0||yy<0||xx>=width||yy>=height)continue;const j=idx(xx,yy,width);if(foreground[j]&&!componentVisited[j]){componentVisited[j]=1;q.push(j);}}}
  components.push(pixels);
 }
 components.sort((a,b)=>b.length-a.length);
 const minComponent=Math.max(12,Math.round((components[0]?.length||0)*.0008));
 foreground.fill(0);for(const pixels of components)if(pixels.length>=minComponent)for(const i of pixels)foreground[i]=1;
 let minX=width,minY=height,maxX=-1,maxY=-1,opaque=0,darkInterior=0;
 const out=Buffer.alloc(n*4);
 for(let i=0;i<n;i++){
  const o=i*channels,p=i*4,r=data[o],g=data[o+1],b=data[o+2];
  if(foreground[i]){
   out[p]=r;out[p+1]=g;out[p+2]=b;out[p+3]=255;opaque++;
   if(Math.max(r,g,b)<70)darkInterior++;
   const x=i%width,y=Math.floor(i/width);if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
  }else{out[p]=0;out[p+1]=0;out[p+2]=0;out[p+3]=0;}
 }
 if(maxX<minX||maxY<minY)throw new Error("Masque logo vide");
 const pad=4,left=Math.max(0,minX-pad),top=Math.max(0,minY-pad),right=Math.min(width-1,maxX+pad),bottom=Math.min(height-1,maxY+pad);
 const clean=await sharp(out,{raw:{width,height,channels:4}}).extract({left,top,width:right-left+1,height:bottom-top+1}).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
 await sharp(clean).toFile(outputPath);
 const meta=await sharp(clean).metadata();
 const {data:check,info:checkInfo}=await sharp(clean).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let semiDark=0,edgeOpaque=0,opaquePixels=0,darkPixels=0;
 for(let y=0;y<checkInfo.height;y++)for(let x=0;x<checkInfo.width;x++){
  const o=(y*checkInfo.width+x)*checkInfo.channels,a=check[o+3],max=Math.max(check[o],check[o+1],check[o+2]);
  if(a>0)opaquePixels++;if(a>0&&max<70)darkPixels++;if(a>0&&a<245&&max<90)semiDark++;
  if((x<2||y<2||x>=checkInfo.width-2||y>=checkInfo.height-2)&&a>16)edgeOpaque++;
 }
 const ratio=opaquePixels/(checkInfo.width*checkInfo.height),darkRatio=darkPixels/Math.max(1,opaquePixels);
 if(semiDark!==0)throw new Error(`Halo semi-transparent sombre détecté : ${semiDark}`);
 if(edgeOpaque>Math.round((checkInfo.width+checkInfo.height)*.08))throw new Error(`Trop de pixels opaques au bord : ${edgeOpaque}`);
 if(ratio<.08||ratio>.82)throw new Error(`Surface opaque anormale : ${ratio}`);
 if(darkRatio<.03)throw new Error(`Noir intérieur officiel insuffisant : ${darkRatio}`);
 const checker=await sharp({create:{width:checkInfo.width,height:checkInfo.height,channels:4,background:"#d0d0d0"}})
  .composite([{input:Buffer.from(`<svg width="${checkInfo.width}" height="${checkInfo.height}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#d8d8d8"/><rect width="16" height="16" fill="#8b8b8b"/><rect x="16" y="16" width="16" height="16" fill="#8b8b8b"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`)},{input:clean}]).png().toBuffer();
 fs.writeFileSync(previewPath,checker);
 const sha=crypto.createHash("sha256").update(clean).digest("hex");
 console.log(JSON.stringify({output:path.relative(root,outputPath),preview:path.relative(root,previewPath),width:meta.width,height:meta.height,bytes:clean.length,sha256:sha,opaqueRatio:ratio,darkInteriorRatio:darkRatio,semiDark,edgeOpaque},null,2));
}
main().catch(error=>{console.error(error);process.exit(1);});
