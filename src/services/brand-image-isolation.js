import sharp from 'sharp';
// Conservative local preparation. Only border-connected near-white background or
// existing transparent padding is removed. Original files are never overwritten.
export async function isolateBrandImage(input,{logo=false}={}){
 const {data,info}=await sharp(input,{limitInputPixels:40e6}).rotate().toColourspace('srgb').resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h,channels:c}=info,n=w*h,alpha=i=>data[i*c+3],white=i=>Math.min(data[i*c],data[i*c+1],data[i*c+2])>=240&&Math.max(data[i*c],data[i*c+1],data[i*c+2])-Math.min(data[i*c],data[i*c+1],data[i*c+2])<=15;
 let transparent=false;for(let i=0;i<n;i++)if(alpha(i)<250){transparent=true;break;}
 const border=[];for(let x=0;x<w;x++){border.push(x,(h-1)*w+x);}for(let y=1;y<h-1;y++)border.push(y*w,y*w+w-1);
 const whiteBorder=border.filter(white).length/border.length,removeWhite=!transparent&&whiteBorder>=.9;
 let removed=0;
 if(removeWhite){const seen=new Uint8Array(n),queue=new Uint32Array(n);let head=0,tail=0;const add=i=>{if(!seen[i]&&white(i)){seen[i]=1;queue[tail++]=i;}};for(const i of border)add(i);
  while(head<tail){const i=queue[head++],x=i%w;data[i*c+3]=0;removed++;if(x)add(i-1);if(x<w-1)add(i+1);if(i>=w)add(i-w);if(i<n-w)add(i+w);}
 }
 if(logo&&(transparent||removeWhite)){
  const seen=new Uint8Array(n),queue=new Uint32Array(n);
  for(let start=0;start<n;start++){
   if(seen[start]||alpha(start)<=8||!white(start))continue;
   let head=0,tail=0,enclosed=true;seen[start]=1;queue[tail++]=start;
   while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);
    if(x===0||x===w-1||y===0||y===h-1)enclosed=false;
    for(const neighbor of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1]){
     if(neighbor<0)continue;
     if(alpha(neighbor)<=8){enclosed=false;continue;}
     if(white(neighbor)&&!seen[neighbor]){seen[neighbor]=1;queue[tail++]=neighbor;}
    }
   }
   if(enclosed)for(let k=0;k<tail;k++){data[queue[k]*c+3]=0;removed++;}
  }
 }
 let left=w,top=h,right=-1,bottom=-1;for(let i=0;i<n;i++)if(alpha(i)>8){const x=i%w,y=Math.floor(i/w);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)return {buffer:await sharp(input).rotate().png().toBuffer(),status:'needs_review',message:'No distinct foreground was found. Upload a transparent PNG; the original is retained.'};
 const cropped=left>0||top>0||right<w-1||bottom<h-1;
 return {buffer:await sharp(data,{raw:{width:w,height:h,channels:c}}).extract({left,top,width:right-left+1,height:bottom-top+1}).png().toBuffer(),status:transparent||removeWhite?'prepared':'needs_review',message:removeWhite?'White background removed and empty margins trimmed automatically. Review fine edges and white product details.':transparent?'Transparent margins trimmed automatically.':'Complex background: original appearance retained. Review the cutout or upload a transparent PNG.',removed_background:removed>0,trimmed:cropped,width:right-left+1,height:bottom-top+1};
}
