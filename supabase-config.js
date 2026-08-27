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

function customerUiFixes() {
  if (!(page.endsWith('/') || page.endsWith('/index.html'))) return;

  addStyle('vrcl-customer-polish', `
    .login{--mx:50%;--my:50%;overflow:hidden!important;perspective:1400px!important;background:radial-gradient(circle at var(--mx) var(--my),rgba(239,83,80,.18),transparent 23%),radial-gradient(circle at 16% 17%,rgba(42,117,255,.18),transparent 24%),radial-gradient(circle at 84% 82%,rgba(255,184,63,.12),transparent 25%),linear-gradient(135deg,#030912 0%,#07111f 40%,#11192a 68%,#060b13 100%)!important}
    .vrGrid{position:absolute;inset:-38%;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:52px 52px;transform:rotateX(68deg) translateY(31%);transform-origin:center;animation:vrGridMove 15s linear infinite;mask-image:linear-gradient(to bottom,transparent 5%,#000 35%,#000 72%,transparent 97%)}
    .vrOrb{position:absolute;border-radius:50%;pointer-events:none;box-shadow:inset -18px -18px 36px rgba(0,0,0,.38),inset 12px 12px 24px rgba(255,255,255,.10),0 28px 65px rgba(0,0,0,.38);animation:vrOrbFloat 6.5s ease-in-out infinite}.vrOrb.o1{width:175px;height:175px;left:5%;top:10%;background:linear-gradient(145deg,#1c7dff99,#0b294c44)}.vrOrb.o2{width:110px;height:110px;right:9%;top:14%;background:linear-gradient(145deg,#ffbe3b99,#5f351b33);animation-delay:-2.2s}.vrOrb.o3{width:140px;height:140px;right:13%;bottom:9%;background:linear-gradient(145deg,#ef535088,#6c15152f);animation-delay:-4.2s}
    .vrRing{position:absolute;border:1px solid rgba(255,255,255,.13);border-radius:50%;pointer-events:none}.vrRing.r1{width:450px;height:450px;left:-120px;bottom:-180px;box-shadow:0 0 75px rgba(239,83,80,.08);animation:vrSpin 18s linear infinite}.vrRing.r2{width:300px;height:300px;right:-65px;top:-105px;border-style:dashed;animation:vrSpinBack 24s linear infinite}
    .vrParticles{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,#ffffff78 1px,transparent 1.5px),radial-gradient(circle,#ef53504d 1px,transparent 1.5px);background-size:95px 95px,143px 143px;background-position:0 0,35px 28px;opacity:.34;animation:vrParticles 18s linear infinite}.vrBeam{position:absolute;width:82vw;height:13vw;left:9vw;top:41%;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(239,83,80,.09),rgba(255,255,255,.05),transparent);filter:blur(18px);transform:rotate(-11deg);animation:vrBeamMove 6s ease-in-out infinite alternate}
    .loginBox{position:relative!important;z-index:5!important;background:linear-gradient(155deg,#132238 0%,#0d192a 50%,#091321 100%)!important;border:1px solid #2a3a50!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:0 38px 88px rgba(0,0,0,.58),0 13px 0 #050a11,0 0 0 1px rgba(255,255,255,.025) inset!important;transform-style:preserve-3d;transition:transform .16s ease-out,box-shadow .2s ease!important;animation:vrLoginFloat 4.2s ease-in-out infinite}.loginBox:before,.loginBox:after{display:none!important}.loginLogo,.loginTitle,.loginSub,.field,.loginBtn,.msg{transform:translateZ(22px)}.loginBtn{box-shadow:0 8px 0 #71000a,0 14px 24px rgba(183,28,28,.28)!important}.loginBtn:active{transform:translateY(4px) translateZ(22px)!important;box-shadow:0 3px 0 #71000a,0 7px 13px rgba(183,28,28,.22)!important}
    .mainLogo,.loginLogo{filter:none!important;image-rendering:auto!important;backface-visibility:hidden!important}.mainLogo{transform:none!important;filter:none!important}.clock,.profile{box-shadow:0 5px 0 #e5dbcf,0 10px 18px rgba(95,61,25,.10),inset 0 1px 0 #fff!important}.card{transform-style:preserve-3d;transition:transform .24s ease,box-shadow .24s ease,filter .35s ease,opacity .35s ease!important}.card:hover,.card.vrFocus{transform:perspective(900px) translateY(-5px) rotateX(1.5deg)!important;box-shadow:0 12px 0 rgba(225,216,205,.45),0 22px 35px rgba(89,53,19,.13)!important}.grid.vrSequence .card:not(.vrFocus){filter:brightness(.82) saturate(.83);opacity:.82}.grid.vrSequence .card.vrFocus{filter:brightness(1.08) saturate(1.08);opacity:1}
    .sectionTitle{font-size:23px!important;font-weight:950!important;letter-spacing:-.25px}.rateName{font-size:18px!important;font-weight:950!important;line-height:1.05}.rateSub{font-size:9px!important;font-weight:900!important}.card th{font-size:10px!important;font-weight:950!important}.card td{font-size:12px!important;font-weight:950!important;padding:7px 8px!important}.card td:last-child{font-size:13px!important;font-weight:950!important}
    .hero{height:124px!important}.pCard{top:6px!important;width:190px!important;height:108px!important}.pCard img{width:172px!important;height:94px!important;max-width:none!important;object-fit:contain!important;filter:drop-shadow(0 15px 11px rgba(0,0,0,.34))!important}.pLabel{font-size:9px!important;padding:4px 10px!important}.c{transform:translateX(-50%) scale(1.06)!important}.c img{width:176px!important;height:96px!important}.l1{transform:translateX(calc(-50% - 190px)) translateY(8px) scale(.90) rotateY(18deg)!important}.r1{transform:translateX(calc(-50% + 190px)) translateY(8px) scale(.90) rotateY(-18deg)!important}.l2{transform:translateX(calc(-50% - 350px)) translateY(13px) scale(.74) rotateY(24deg)!important}.r2{transform:translateX(calc(-50% + 350px)) translateY(13px) scale(.74) rotateY(-24deg)!important}.pCard img[alt="Mustard Oil"]{transform:translateX(-50%) scale(1.14)!important}
    @keyframes vrGridMove{to{background-position:0 104px,104px 0}}@keyframes vrOrbFloat{0%,100%{transform:translate3d(0,0,0) rotate(0)}50%{transform:translate3d(14px,-18px,42px) rotate(8deg)}}@keyframes vrSpin{to{transform:rotate(360deg)}}@keyframes vrSpinBack{to{transform:rotate(-360deg)}}@keyframes vrParticles{to{background-position:95px 95px,-108px 171px}}@keyframes vrBeamMove{from{transform:translateX(-5%) rotate(-11deg)}to{transform:translateX(8%) rotate(-11deg)}}@keyframes vrLoginFloat{0%,100%{translate:0 0}50%{translate:0 -8px}}
    @media(max-width:570px){.pCard img{width:126px!important;height:82px!important}.c img{width:132px!important;height:86px!important}.rateName{font-size:17px!important}.card td:last-child{font-size:13px!important}}
    @media(prefers-reduced-motion:reduce){.vrGrid,.vrOrb,.vrRing,.vrParticles,.vrBeam,.loginBox{animation:none!important}}
  `);

  const login = document.getElementById('login');
  const box = login?.querySelector('.loginBox');
  if (login && box && !login.querySelector('.vrGrid')) {
    box.insertAdjacentHTML('beforebegin','<div class="vrGrid"></div><div class="vrOrb o1"></div><div class="vrOrb o2"></div><div class="vrOrb o3"></div><div class="vrRing r1"></div><div class="vrRing r2"></div><div class="vrParticles"></div><div class="vrBeam"></div>');
    login.addEventListener('pointermove', e => {
      if (login.classList.contains('hidden')) return;
      const r = box.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width/2)) / r.width;
      const y = (e.clientY - (r.top + r.height/2)) / r.height;
      box.style.transform = `rotateX(${-y*7}deg) rotateY(${x*9}deg)`;
      login.style.setProperty('--mx', `${e.clientX/innerWidth*100}%`);
      login.style.setProperty('--my', `${e.clientY/innerHeight*100}%`);
    });
    login.addEventListener('pointerleave', () => { box.style.transform = ''; });
  }

  const logoUrl = new URL('./logo.png?v=20260827e', import.meta.url).href;
  document.querySelectorAll('.mainLogo,.loginLogo').forEach(img => { img.src = logoUrl; });

  const soya = [...document.querySelectorAll('.pCard img')].find(i => /soya/i.test(i.alt || ''));
  if (soya) soya.src = new URL('./assets/header/soya.webp?v=5', import.meta.url).href;

  let seqTimer = null, seqIndex = 0;
  const startSequence = () => {
    const grid = document.getElementById('grid');
    if (!grid) return;
    const cards = [...grid.querySelectorAll('.card')];
    if (!cards.length) return;
    clearInterval(seqTimer);
    grid.classList.add('vrSequence');
    const focus = () => {
      cards.forEach((c,i)=>c.classList.toggle('vrFocus', i === seqIndex % cards.length));
      seqIndex = (seqIndex + 1) % cards.length;
    };
    focus(); seqTimer = setInterval(focus, 2400);
  };
  const grid = document.getElementById('grid');
  if (grid) {
    new MutationObserver(startSequence).observe(grid,{childList:true});
    startSequence();
  }
}

function adminUiFixes() {
  if (!page.endsWith('/admin.html')) return;
  addStyle('vrcl-admin-polish', `
    .vrDashIcon{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;text-decoration:none;background:linear-gradient(145deg,#fff,#e9edf3);color:#101827;border:1px solid #ffffff55;box-shadow:0 5px 0 #aeb6c1,0 9px 16px #0003;transition:.12s;padding:0!important}.vrDashIcon:active{transform:translateY(3px);box-shadow:0 2px 0 #aeb6c1,0 4px 9px #0002}.vrDashIcon svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .vrRateCheckBtn{height:38px;display:inline-flex;align-items:center;justify-content:center;padding:0 13px;border-radius:10px;text-decoration:none;background:linear-gradient(145deg,#0b927f,#087f70);color:#fff;font-size:10px;font-weight:950;letter-spacing:.35px;box-shadow:0 5px 0 #045d52,0 9px 15px #0002}.vrRateCheckBtn:active{transform:translateY(3px);box-shadow:0 2px 0 #045d52,0 4px 8px #0002}
    .vrMasterLock{margin-top:8px;border:1px solid #d6b370;border-radius:9px;padding:8px 11px;font-size:10px;font-weight:950;cursor:pointer;box-shadow:0 4px 0 #c5a05a,0 7px 12px #77521820;transition:.12s}.vrMasterLock.locked{background:linear-gradient(145deg,#fff5da,#f1d49d);color:#7a4a00}.vrMasterLock.unlocked{background:linear-gradient(145deg,#e7f8f1,#bde9da);color:#086852;border-color:#8fd3bd;box-shadow:0 4px 0 #67b79f,0 7px 12px #08685220}.vrMasterLock:active{transform:translateY(3px)}
    #rateBody input:disabled,#looseRate:disabled,#narration:disabled{background:#f2f4f7!important;color:#667085!important;cursor:not-allowed}.vrLockedNote{display:inline-flex;margin-left:8px;padding:5px 8px;border-radius:999px;background:#fff4df;color:#8a5700;font-size:9px;font-weight:950;border:1px solid #ecd09b}
  `);

  const nav = document.querySelector('.topbar .flex');
  if (nav) {
    const dashLinks = [...nav.querySelectorAll('a[href*="dashboard.html"]')];
    dashLinks.slice(1).forEach(a=>a.remove());
    let dash = dashLinks[0];
    if (!dash) {
      dash = document.createElement('a');
      dash.href = './dashboard.html';
      nav.insertBefore(dash, document.getElementById('logout'));
    }
    dash.className = 'vrDashIcon';
    dash.title = 'Dashboard'; dash.setAttribute('aria-label','Dashboard');
    dash.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

    [...nav.querySelectorAll('a[href*="customer-check.html"]')].forEach(a=>a.remove());
    const rateCheck = document.createElement('a');
    rateCheck.href = './customer-check.html';
    rateCheck.className = 'vrRateCheckBtn';
    rateCheck.textContent = 'RATE CHECK';
    nav.insertBefore(rateCheck, document.getElementById('logout'));
  }

  const master = document.querySelector('.masterName')?.parentElement;
  if (master && !document.getElementById('vrMasterLock')) {
    const b = document.createElement('button');
    b.id = 'vrMasterLock'; b.type = 'button'; b.className = 'vrMasterLock locked';
    master.appendChild(b);
    const note = document.createElement('span'); note.id='vrLockNote'; note.className='vrLockedNote';
    master.appendChild(note);

    let locked = localStorage.getItem('VRCL_MASTER_LOCK') !== '0';
    const apply = () => {
      b.classList.toggle('locked',locked); b.classList.toggle('unlocked',!locked);
      b.textContent = locked ? '🔒 MASTER LOCK' : '🔓 EDITING UNLOCKED';
      note.textContent = locked ? 'RATE EDITING LOCKED' : 'EDITING ENABLED';
      ['looseRate','addPacking','saveAll','saveNote','narration','photoInput'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=locked;});
      document.querySelectorAll('#rateBody input,#rateBody button[data-del]').forEach(el=>el.disabled=locked);
    };
    b.onclick = () => { locked = !locked; localStorage.setItem('VRCL_MASTER_LOCK',locked?'1':'0'); apply(); };
    const body = document.getElementById('rateBody');
    if (body) new MutationObserver(apply).observe(body,{childList:true,subtree:true});
    apply();
  }
}

queueMicrotask(() => { customerUiFixes(); adminUiFixes(); });
