const {createCanvas,loadImage}=require("@napi-rs/canvas");
function panel(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}}
async function makeWallet(m,user){
 const canvas=createCanvas(1200,470),c=canvas.getContext("2d");
 const bg=c.createLinearGradient(0,0,1200,470);bg.addColorStop(0,"#11151d");bg.addColorStop(.5,"#303642");bg.addColorStop(1,"#11151d");
 panel(c,0,0,1200,470,30,bg,"#aeb7c8");c.fillStyle="#d8b76d";c.fillRect(0,0,12,470);
 try{const a=await loadImage(user.displayAvatarURL({extension:"png",size:256}));c.save();c.beginPath();c.arc(145,145,90,0,Math.PI*2);c.clip();c.drawImage(a,55,55,180,180);c.restore();c.beginPath();c.arc(145,145,95,0,Math.PI*2);c.strokeStyle="#d8b76d";c.lineWidth=6;c.stroke();}catch{}
 c.fillStyle="#fff";c.font="bold 42px Arial";c.fillText(user.username.slice(0,22),280,100);
 c.fillStyle="#aeb8c8";c.font="23px Arial";c.fillText("COMMUNITY WALLET",282,139);
 const cards=[["TEXT LEVEL",String(Math.floor(Math.sqrt(m.text_xp/100))),m.text_xp.toLocaleString()+" XP","#83aaff"],["VOICE LEVEL",String(Math.floor(Math.sqrt(m.voice_xp/100))),m.voice_xp.toLocaleString()+" XP","#e6c17a"],["COINS",m.coins.toLocaleString(),"AVAILABLE BALANCE","#75d8b2"]];
 cards.forEach((b,i)=>{const px=280+i*290;panel(c,px,180,260,175,18,"#202631","#505b70");c.fillStyle=b[3];c.font="bold 19px Arial";c.fillText(b[0],px+18,216);c.fillStyle="#fff";c.font="bold 48px Arial";c.fillText(b[1],px+18,278);c.fillStyle="#c0c8d5";c.font="20px Arial";c.fillText(b[2],px+18,320);});
 c.fillStyle="#d4dae4";c.font="22px Arial";c.fillText("MESSAGES  "+m.messages.toLocaleString(),58,330);c.fillText("VOICE TIME  "+Math.floor(m.voice_seconds/3600)+"h "+Math.floor(m.voice_seconds%3600/60)+"m",58,372);c.fillText("TOTAL XP  "+m.total_xp.toLocaleString(),58,414);c.fillStyle="#d8b76d";c.font="bold 19px Arial";c.fillText("250 XP = 1 COIN",960,430);
 return canvas.toBuffer("image/png");
}
module.exports={makeWallet};
