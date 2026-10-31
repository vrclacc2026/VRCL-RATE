// Original artwork stays immutable. Only the table, date and corrected terms are drawn in code.
export function renderPoster(canvas,art,model,date=new Date()) {
  const rowHeight=46, tableBottom=298+Math.max(10,model.rows.length)*rowHeight;
  const offset=tableBottom-758, height=1024+offset, scale=2;
  canvas.width=1536*scale;canvas.height=height*scale;
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
  ctx.drawImage(art,0,0,1536,758,0,0,1536,758);
  ctx.drawImage(art,0,758,1536,266,0,tableBottom,1536,266);
  if(offset>0){ctx.fillStyle='#fffef4';ctx.fillRect(0,758,1536,offset);}
  // Replace the old date inside the original gold badge, preserving its border.
  const badge=ctx.createLinearGradient(0,27,0,71);badge.addColorStop(0,'#fffef0');badge.addColorStop(1,'#fff1b7');
  ctx.fillStyle=badge;ctx.fillRect(1332,30,160,39);
  const dateText=date.toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata'});
  text(dateText,1412,51,167,30,'#002b27','bold Georgia');
  const left=19,right=1517,top=221,productWidth=model.columns.length?296:right-left,cellWidth=model.columns.length?(right-left-productWidth)/model.columns.length:0;
  ctx.save();ctx.beginPath();ctx.roundRect(left,top,right-left,tableBottom-top,15);ctx.clip();
  const header=ctx.createLinearGradient(0,top,0,298);header.addColorStop(0,'#00613c');header.addColorStop(1,'#003d27');
  ctx.fillStyle=header;ctx.fillRect(left,top,right-left,77);
  text('PRODUCT',left+productWidth/2,260,productWidth-20,27,'white','bold Arial');
  model.columns.forEach((c,i)=>{
    const parts=c.match(/^(\d+\s+\w+)\s+(.*)$/),x=left+productWidth+(i+.5)*cellWidth;
    text(parts?.[1]||c,x,248,cellWidth-10,22,'white','bold Arial');
    text(parts?.[2]||'',x,276,cellWidth-10,21,'white','bold Arial');
  });
  for(let i=0;i<Math.max(10,model.rows.length);i++){
    const y=298+i*rowHeight, row=model.rows[i];
    ctx.fillStyle=i%2?'#e9f2d4':'#fffef4';ctx.fillRect(left,y,right-left,rowHeight);
    if(row){text(row.name,left+15,y+rowHeight/2,productWidth-28,23,'#002d2b','bold Arial','left');
      row.values.forEach((v,j)=>text(v,left+productWidth+(j+.5)*cellWidth,y+rowHeight/2,cellWidth-10,24,'#061e50','Arial'));}
    ctx.strokeStyle='#e4d293';ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
  }
  ctx.strokeStyle='#daa520';ctx.lineWidth=1;
  for(let i=0;i<=model.columns.length;i++) {const x=left+productWidth+i*cellWidth;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,tableBottom);ctx.stroke();}
  ctx.restore();ctx.strokeStyle='#e7ad00';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(left,top,right-left,tableBottom-top,15);ctx.stroke();
  // Same original footer panel; four terms now run in the requested sequence.
  ctx.fillStyle='#fffef4';ctx.fillRect(586,802+offset,890,171);
  const terms=['GST extra','Ex our plant','Up to 15 day delivery condition','Instant payment discount ₹15 / TIN and PACKING ₹0.75 / LTR'];
  terms.forEach((line,i)=>{
    const y=821+offset+i*43;
    ctx.fillStyle='#004c2f';ctx.strokeStyle='#d9a300';ctx.lineWidth=2;ctx.beginPath();ctx.arc(623,y,19,0,Math.PI*2);ctx.fill();ctx.stroke();
    text(String(i+1),623,y,30,29,'white','bold Georgia');text(line,674,y,785,27,'#061e50','Georgia','left');
    if(i<3){ctx.strokeStyle='#d9a300';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(591,y+21);ctx.lineTo(1467,y+21);ctx.stroke();}
  });
  return dateText;
  function text(value,x,y,maxWidth,size,color,font,align='center'){
    ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';
    const family=font.replace(/^bold /,''),weight=font.startsWith('bold ')?'bold ':'';
    ctx.font=weight+size+'px '+family;
    while(ctx.measureText(value).width>maxWidth&&size>14){size-=.5;ctx.font=weight+size+'px '+family;}
    ctx.fillText(value,x,y,maxWidth);
  }
}
