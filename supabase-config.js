// Public browser configuration only. Safe to expose with correct RLS policies.
// NEVER put a Supabase secret/service_role key in frontend code.
export const SUPABASE_URL = "https://rdmgzkxroydsuantzbwn.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ";
export const APP_NAME = "VRCL Wholesale Rate Portal";

const page = location.pathname.toLowerCase();
const addStyle = (id, css) => {
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
};

function customerPolish() {
  if (!(page.endsWith('/') || page.endsWith('/index.html'))) return;

  addStyle('vrcl-exact-customer-fix', `
    .login{--mx:50%;--my:50%;overflow:hidden!important;perspective:1400px!important;
      background:radial-gradient(circle at var(--mx) var(--my),rgba(239,83,80,.20),transparent 23%),
      radial-gradient(circle at 15% 18%,rgba(50,125,255,.19),transparent 24%),
      radial-gradient(circle at 84% 82%,rgba(255,185,63,.13),transparent 25%),
      linear-gradient(135deg,#030912 0%,#07111f 40%,#10192a 68%,#060b13 100%)!important}
    .vrGrid{position:absolute;inset:-38%;pointer-events:none;
      background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);
      background-size:52px 52px;transform:rotateX(68deg) translateY(31%);transform-origin:center;
      animation:vrGridMove 15s linear infinite;mask-image:linear-gradient(to bottom,transparent 5%,#000 35%,#000 72%,transparent 97%)}
    .vrOrb{position:absolute;border-radius:50%;pointer-events:none;box-shadow:inset -18px -18px 36px rgba(0,0,0,.38),inset 12px 12px 24px rgba(255,255,255,.10),0 28px 65px rgba(0,0,0,.38);animation:vrOrbFloat 6.3s ease-in-out infinite}
    .vrOrb.o1{width:180px;height:180px;left:5%;top:9%;background:linear-gradient(145deg,#1c7dff99,#0b294c44)}
    .vrOrb.o2{width:115px;height:115px;right:9%;top:14%;background:linear-gradient(145deg,#ffbe3b99,#5f351b33);animation-delay:-2.2s}
    .vrOrb.o3{width:145px;height:145px;right:13%;bottom:8%;background:linear-gradient(145deg,#ef535088,#6c15152f);animation-delay:-4.1s}
    .vrRing{position:absolute;border:1px solid rgba(255,255,255,.13);border-radius:50%;pointer-events:none}
    .vrRing.r1{width:450px;height:450px;left:-120px;bottom:-180px;box-shadow:0 0 75px rgba(239,83,80,.08);animation:vrSpin 18s linear infinite}
    .vrRing.r2{width:300px;height:300px;right:-65px;top:-105px;border-style:dashed;animation:vrSpinBack 24s linear infinite}
    .vrParticles{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,#ffffff78 1px,transparent 1.5px),radial-gradient(circle,#ef53504d 1px,transparent 1.5px);background-size:95px 95px,143px 143px;background-position:0 0,35px 28px;opacity:.34;animation:vrParticles 18s linear infinite}
    .vrBeam{position:absolute;width:82vw;height:13vw;left:9vw;top:41%;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(239,83,80,.09),rgba(255,255,255,.06),transparent);filter:blur(18px);transform:rotate(-11deg);animation:vrBeamMove 5.8s ease-in-out infinite alternate}
    .loginBox{position:relative!important;z-index:5!important;background:linear-gradient(155deg,#132238 0%,#0d192a 50%,#091321 100%)!important;border:1px solid #2a3a50!important;
      backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:0 38px 88px rgba(0,0,0,.58),0 13px 0 #050a11!important;
      transform-style:preserve-3d;transition:transform .16s ease-out!important;animation:vrLoginFloat 4s ease-in-out infinite}
    .loginBox:before,.loginBox:after{display:none!important}
    .loginTitle{color:#fff!important;text-shadow:0 2px 10px rgba(0,0,0,.35)!important}
    .loginSub{color:#d6deea!important}
    .field label{color:#f3f6fb!important}
    .loginLogo{position:relative!important;z-index:2!important;filter:none!important;box-shadow:none!important;background:transparent!important}
    .vrLogoHalo{position:relative;width:112px;height:94px;margin:0 auto 6px;display:grid;place-items:center;isolation:isolate}
    .vrLogoHalo:before{content:"";position:absolute;inset:1px;border-radius:28px;background:conic-gradient(from 0deg,#ff3f59,#ffbd3b,#22d3a4,#3d8bff,#9b5cff,#ff3f59);animation:vrHalo 4.8s linear infinite;filter:drop-shadow(0 0 12px rgba(255,80,100,.25));z-index:-2}
    .vrLogoHalo:after{content:"";position:absolute;inset:5px;border-radius:24px;background:#0c1828;z-index:-1}
    .vrLogoHalo .loginLogo{width:92px!important;height:76px!important;object-fit:contain!important}
    .loginBtn{transition:transform .18s ease,filter .18s ease,box-shadow .18s ease!important;box-shadow:0 8px 0 #71000a,0 14px 24px rgba(183,28,28,.28)!important}
    .loginBtn:hover{transform:translateY(-3px) scale(1.02)!important;filter:brightness(1.14) saturate(1.08)!important;box-shadow:0 10px 0 #71000a,0 20px 34px rgba(239,83,80,.38)!important}
    .loginBtn:active{transform:translateY(4px) scale(.995)!important;box-shadow:0 3px 0 #71000a,0 7px 13px rgba(183,28,28,.22)!important}
    .mainLogo{filter:none!important;image-rendering:auto!important;backface-visibility:hidden!important}
    .power{width:34px!important;height:34px!important;border-radius:50%!important;border:2px solid #ff5267!important;background:radial-gradient(circle at 38% 30%,#ff7585,#f43f5e 55%,#c51e38 100%)!important;color:#fff!important;
      box-shadow:inset 0 2px 4px rgba(255,255,255,.45),inset 0 -4px 7px rgba(112,0,20,.28),0 5px 0 #9e1930,0 9px 14px rgba(110,0,20,.22)!important;font-size:18px!important;text-shadow:0 1px 2px rgba(0,0,0,.28)!important}
    .power:hover{filter:brightness(1.08)!important;transform:translateY(-1px)}
    .power:active{transform:translateY(4px)!important;box-shadow:inset 0 2px 5px rgba(70,0,10,.28),0 1px 0 #9e1930,0 4px 8px rgba(110,0,20,.20)!important}
    .sectionTitle{font-size:24px!important;font-weight:950!important}.rateName{font-size:19px!important;font-weight:950!important;line-height:1.08}.rateSub{font-size:9px!important;font-weight:900!important}
    .card th{font-size:11px!important;font-weight:950!important}.card td{font-size:12px!important;font-weight:950!important;padding:8px 9px!important}.card td:last-child{font-size:14px!important;font-weight:950!important}
    .card tbody tr{transition:filter .32s ease,opacity .32s ease,transform .24s ease,background .32s ease}.card tbody.vrPackingSeq tr:not(.vrPackFocus){filter:brightness(.83);opacity:.68}
    .card tbody.vrPackingSeq tr.vrPackFocus{filter:brightness(1.07);opacity:1;transform:scale(1.012)}.card tbody.vrPackingSeq tr.vrPackFocus td{background:#fff0a8!important;color:#101828!important;box-shadow:inset 0 1px 0 #ffe06b,inset 0 -1px 0 #f1cc40}
    .card tbody.vrPackingSeq tr.vrPackFocus td:last-child{color:#8e0000!important;font-size:15px!important}
    .hero{height:126px!important}.pCard{top:5px!important;width:194px!important;height:112px!important;overflow:visible!important}
    .pCard img{width:178px!important;height:98px!important;max-width:none!important;object-fit:contain!important;filter:drop-shadow(0 16px 11px rgba(0,0,0,.36))!important}
    .c{transform:translateX(-50%) scale(1.07)!important}.c img{width:182px!important;height:100px!important}
    .pCard img[alt="Mustard Oil"]{transform:translateX(-50%) scale(1.30)!important}
    .pCard img[alt*="Soya"]{transform:translateX(-50%) scale(1.02)!important}
    @keyframes vrGridMove{to{background-position:0 104px,104px 0}}@keyframes vrOrbFloat{0%,100%{transform:translate3d(0,0,0) rotate(0)}50%{transform:translate3d(14px,-18px,42px) rotate(8deg)}}@keyframes vrSpin{to{transform:rotate(360deg)}}@keyframes vrSpinBack{to{transform:rotate(-360deg)}}@keyframes vrParticles{to{background-position:95px 95px,-108px 171px}}@keyframes vrBeamMove{from{transform:translateX(-5%) rotate(-11deg)}to{transform:translateX(8%) rotate(-11deg)}}@keyframes vrLoginFloat{0%,100%{translate:0 0}50%{translate:0 -7px}}@keyframes vrHalo{to{transform:rotate(360deg)}}
    @media(max-width:570px){.rateName{font-size:18px!important}.card td:last-child{font-size:14px!important}.pCard img{width:130px!important;height:84px!important}.c img{width:134px!important;height:88px!important}.pCard img[alt="Mustard Oil"]{transform:translateX(-50%) scale(1.20)!important}}
  `);

  const login = document.getElementById('login');
  const box = login?.querySelector('.loginBox');
  if (login && box && !login.querySelector('.vrGrid')) {
    box.insertAdjacentHTML('beforebegin','<div class="vrGrid"></div><div class="vrOrb o1"></div><div class="vrOrb o2"></div><div class="vrOrb o3"></div><div class="vrRing r1"></div><div class="vrRing r2"></div><div class="vrParticles"></div><div class="vrBeam"></div>');
    login.addEventListener('pointermove', e => {
      if (login.classList.contains('hidden')) return;
      const r = box.getBoundingClientRect();
      const x=(e.clientX-(r.left+r.width/2))/r.width, y=(e.clientY-(r.top+r.height/2))/r.height;
      box.style.transform=`rotateX(${-y*7}deg) rotateY(${x*9}deg)`;
      login.style.setProperty('--mx',`${e.clientX/innerWidth*100}%`);
      login.style.setProperty('--my',`${e.clientY/innerHeight*100}%`);
    });
    login.addEventListener('pointerleave',()=>box.style.transform='');
  }

  const loginLogo = document.querySelector('.loginLogo');
  if (loginLogo && !loginLogo.closest('.vrLogoHalo')) {
    const halo=document.createElement('div'); halo.className='vrLogoHalo';
    loginLogo.parentNode.insertBefore(halo,loginLogo); halo.appendChild(loginLogo);
  }

  document.querySelectorAll('.mainLogo,.loginLogo').forEach(img => {
    img.src = new URL('./logo.png?v=20260827f', import.meta.url).href;
  });
  const soya=[...document.querySelectorAll('.pCard img')].find(i=>/soya/i.test(i.alt||''));
  if(soya) soya.src=new URL('./assets/header/soya-vrcl.webp?v=1',import.meta.url).href;

  let timer, row=0;
  const startPackingSequence=()=>{
    const bodies=[...document.querySelectorAll('#grid .card tbody')];
    if(!bodies.length)return;
    clearInterval(timer);
    bodies.forEach(b=>b.classList.add('vrPackingSeq'));
    const max=Math.max(...bodies.map(b=>b.rows.length),1);
    const focus=()=>{
      bodies.forEach(b=>[...b.rows].forEach((tr,i)=>tr.classList.toggle('vrPackFocus',i===row%b.rows.length)));
      row=(row+1)%max;
    };
    focus(); timer=setInterval(focus,2300);
  };
  const grid=document.getElementById('grid');
  if(grid){new MutationObserver(startPackingSequence).observe(grid,{childList:true});startPackingSequence();}
}

function adminPolish() {
  if (!page.endsWith('/admin.html')) return;
  addStyle('vrcl-admin-nav-exact', `
    .vrDashIcon{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;text-decoration:none;background:linear-gradient(145deg,#fff,#e9edf3);color:#101827;border:1px solid #ffffff55;box-shadow:0 5px 0 #aeb6c1,0 9px 16px #0003;padding:0!important}
    .vrDashIcon svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .vrRateCheckBtn{height:38px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border-radius:10px;text-decoration:none;background:linear-gradient(145deg,#0b927f,#087f70);color:#fff;font-size:10px;font-weight:950;letter-spacing:.4px;box-shadow:0 5px 0 #045d52,0 9px 15px #0002}
    .vrMasterLock{margin-top:8px;border:1px solid #d6b370;border-radius:9px;padding:8px 11px;font-size:10px;font-weight:950;cursor:pointer;box-shadow:0 4px 0 #c5a05a,0 7px 12px #77521820}.vrMasterLock.locked{background:#f7dfae;color:#754700}.vrMasterLock.unlocked{background:#ccefe3;color:#086852;border-color:#8fd3bd}
  `);
  const nav=document.querySelector('.topbar .flex');
  if(nav){
    const ds=[...nav.querySelectorAll('a[href*="dashboard.html"]')]; ds.slice(1).forEach(a=>a.remove());
    let d=ds[0]; if(!d){d=document.createElement('a');d.href='./dashboard.html';nav.insertBefore(d,document.getElementById('logout'));}
    d.className='vrDashIcon';d.title='Dashboard';d.innerHTML='<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';
    [...nav.querySelectorAll('a[href*="customer-check.html"]')].forEach(a=>a.remove());
    const r=document.createElement('a');r.href='./customer-check.html';r.className='vrRateCheckBtn';r.textContent='RATE CHECK';nav.insertBefore(r,document.getElementById('logout'));
  }
  const master=document.querySelector('.masterName')?.parentElement;
  if(master&&!document.getElementById('vrMasterLock')){
    const b=document.createElement('button');b.id='vrMasterLock';b.type='button';master.appendChild(b);
    let locked=localStorage.getItem('VRCL_MASTER_LOCK')!=='0';
    const apply=()=>{
      b.className='vrMasterLock '+(locked?'locked':'unlocked');b.textContent=locked?'🔒 MASTER LOCK':'🔓 EDITING UNLOCKED';
      ['looseRate','addPacking','saveAll','saveNote','narration','photoInput'].forEach(id=>{const e=document.getElementById(id);if(e)e.disabled=locked});
      document.querySelectorAll('#rateBody input,#rateBody button[data-del]').forEach(e=>e.disabled=locked);
    };
    b.onclick=()=>{locked=!locked;localStorage.setItem('VRCL_MASTER_LOCK',locked?'1':'0');apply()};
    const body=document.getElementById('rateBody');if(body)new MutationObserver(apply).observe(body,{childList:true,subtree:true});apply();
  }
}

queueMicrotask(()=>{customerPolish();adminPolish();});
