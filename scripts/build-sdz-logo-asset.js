"use strict";

const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const sharp=require("sharp");

const root=path.resolve(__dirname,"..");
const inputPath=path.join(root,"assets/sdz-logo-master.jpg");
const outputPath=path.join(root,"assets/sdz-logo-compositor.png");
const previewPath=path.join(root,"artifacts/sdz-logo-compositor-checkerboard.png");

function pointInTriangle(px,py,a,b,c){
 const sign=(x,y,p1,p2)=>(x-p2[0])*(p1[1]-p2[1])-(p1[0]-p2[0])*(y-p2[1]);
 const d1=sign(px,py,a,b),d2=sign(px,py,b,c),d3=sign(px,py,c,a),hasNeg=d1<0||d2<0||d3<0,hasPos=d1>0||d2>0||d3>0;
 return !(hasNeg&&hasPos);
}
function dilate(mask,width,height,radius=2){
 const out=new Uint8Array(mask);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x]){
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<width&&yy<height)out[yy*width+xx]=1;
  }
 }
 return out;
}
async function main(){
 if(!fs.existsSync(inputPath))throw new Error("Master officiel SDZ absent : assets/sdz-logo-master.jpg");
 fs.mkdirSync(path.dirname(outputPath),{recursive:true});fs.mkdirSync(path.dirname(previewPath),{recursive:true});
 const source=sharp(inputPath,{failOn:"none"}).rotate(),{data,info}=await source.raw().toBuffer({resolveWithObject:true}),{width,height,channels}=info;
 if(width!==1024||height!==1536||channels<3)throw new Error(`Master officiel SDZ inattendu : ${width}x${height} (${channels} canaux).`);

 /* Le master officiel est un JPEG noir/or complet. La zone noire A L'INTERIEUR du médaillon fait
    partie du logo et doit rester opaque. L'ancien constructeur partait d'une icône PWA recadrée et
    supprimait ces noirs, ce qui cassait le cercle, le zèbre et le triangle sur les affiches.
    La géométrie ci-dessous protège le disque du médaillon + le triangle, tandis que les éléments or
    qui débordent (étoiles, ruban) sont conservés par un masque colorimétrique légèrement dilaté. */
 const gold=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,o=i*channels,r=data[o],g=data[o+1],b=data[o+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),chroma=mx-mn;
  if((r>95&&g>55&&r>b*1.12&&g>b*1.02)||(mx>120&&chroma>30))gold[i]=1;
 }
 const goldEnvelope=dilate(gold,width,height,2),rgba=Buffer.alloc(width*height*4);
 const cx=508,cy=742,radius=451,triangle=[[507,210],[670,415],[342,415]];
 let minX=width,minY=height,maxX=-1,maxY=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,o=i*channels,p=i*4,dx=x-cx,dy=y-cy;
  const keep=dx*dx+dy*dy<=radius*radius||pointInTriangle(x,y,triangle[0],triangle[1],triangle[2])||goldEnvelope[i];
  rgba[p]=data[o];rgba[p+1]=data[o+1];rgba[p+2]=data[o+2];rgba[p+3]=keep?255:0;
  if(keep){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
 }
 if(maxX<minX||maxY<minY)throw new Error("Masque du logo officiel vide.");
 const pad=16,left=Math.max(0,minX-pad),top=Math.max(0,minY-pad),right=Math.min(width-1,maxX+pad),bottom=Math.min(height-1,maxY+pad);
 const clean=await sharp(rgba,{raw:{width,height,channels:4}}).extract({left,top,width:right-left+1,height:bottom-top+1}).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
 await sharp(clean).toFile(outputPath);

 const {data:check,info:checkInfo}=await sharp(clean).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let transparent=0,opaque=0,dark=0,semi=0,edgeOpaque=0;
 for(let y=0;y<checkInfo.height;y++)for(let x=0;x<checkInfo.width;x++){
  const o=(y*checkInfo.width+x)*checkInfo.channels,a=check[o+3],mx=Math.max(check[o],check[o+1],check[o+2]);
  if(a<=8)transparent++;if(a>=245){opaque++;if(mx<75)dark++;}if(a>8&&a<245)semi++;
  if((x===0||y===0||x===checkInfo.width-1||y===checkInfo.height-1)&&a>8)edgeOpaque++;
 }
 const total=checkInfo.width*checkInfo.height,transparentRatio=transparent/total,opaqueRatio=opaque/total,darkInteriorRatio=dark/Math.max(1,opaque);
 if(checkInfo.width<850||checkInfo.height<950)throw new Error(`Logo officiel incomplet : ${checkInfo.width}x${checkInfo.height}.`);
 if(transparentRatio<.20)throw new Error(`Extérieur transparent insuffisant : ${transparentRatio}.`);
 if(darkInteriorRatio<.55)throw new Error(`Noir intérieur officiel insuffisant : ${darkInteriorRatio}.`);
 if(semi!==0||edgeOpaque!==0)throw new Error(`Alpha non déterministe : semi=${semi}, bord=${edgeOpaque}.`);
 const center=((Math.floor(checkInfo.height*.52)*checkInfo.width)+Math.floor(checkInfo.width*.50))*checkInfo.channels;
 if(check[center+3]<245)throw new Error("Le centre noir du médaillon a été rendu transparent.");

 const checker=await sharp({create:{width:checkInfo.width,height:checkInfo.height,channels:4,background:"#d0d0d0"}}).composite([{input:Buffer.from(`<svg width="${checkInfo.width}" height="${checkInfo.height}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#d8d8d8"/><rect width="16" height="16" fill="#8b8b8b"/><rect x="16" y="16" width="16" height="16" fill="#8b8b8b"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`)},{input:clean}]).png().toBuffer();
 fs.writeFileSync(previewPath,checker);
 const sha256=crypto.createHash("sha256").update(clean).digest("hex");
 console.log(JSON.stringify({source:path.relative(root,inputPath),output:path.relative(root,outputPath),preview:path.relative(root,previewPath),width:checkInfo.width,height:checkInfo.height,bytes:clean.length,sha256,opaqueRatio,transparentRatio,darkInteriorRatio,semi,edgeOpaque},null,2));
}
main().catch(error=>{console.error(error);process.exit(1);});
