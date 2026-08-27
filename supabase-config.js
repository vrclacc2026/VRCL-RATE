// Public browser configuration only. Safe to expose with correct RLS policies.
// NEVER put a Supabase secret/service_role key in frontend code.
export const SUPABASE_URL = "https://rdmgzkxroydsuantzbwn.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ";
export const APP_NAME = "VRCL Wholesale Rate Portal";

// Small presentation-only fixes. No auth, rate, RLS or business logic is changed here.
const page = location.pathname.toLowerCase();

function addStyle(id, css) {
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

function fixCustomerUi() {
  if (!(page.endsWith('/') || page.endsWith('/index.html'))) return;

  addStyle('vrcl-3d-fix', `
    .login{--mx:50%;--my:50%;overflow:hidden!important;perspective:1400px!important;background:radial-gradient(circle at var(--mx) var(--my),rgba(239,83,80,.16),transparent 23%),radial-gradient(circle at 17% 16%,rgba(43,119,255,.17),transparent 24%),radial-gradient(circle at 84% 82%,rgba(255,184,63,.11),transparent 25%),linear-gradient(135deg,#030912 0%,#07111f 40%,#11192a 68%,#060b13 100%)!important}
    .loginGrid{position:absolute;inset:-38%;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:52px 52px;transform:rotateX(68deg) translateY(31%);transform-origin:center;animation:vrGrid 16s linear infinite;mask-image:linear-gradient(to bottom,transparent 5%,#000 35%,#000 72%,transparent 97%);pointer-events:none}
    .loginOrb{position:absolute;border-radius:50%;pointer-events:none;box-shadow:inset -18px -18px 36px rgba(0,0,0,.38),inset 12px 12px 24px rgba(255,255,255,.10),0 28px 65px rgba(0,0,0,.38);animation:vrOrb 7s ease-in-out infinite}.loginOrb.o1{width:175px;height:175px;left:5%;top:10%;background:linear-gradient(145deg,#1c7dff99,#0b294c44)}.loginOrb.o2{width:110px;height:110px;right:9%;top:14%;background:linear-gradient(145deg,#ffbe3b99,#5f351b33);animation-delay:-2.5s}.loginOrb.o3{width:140px;height:140px;right:13%;bottom:9%;background:linear-gradient(145deg,#ef535088,#6c15152f);animation-delay:-4.5s}
    .loginRing{position:absolute;border:1px solid rgba(255,255,255,.13);border-radius:50%;pointer-events:none}.loginRing.r1{width:450px;height:450px;left:-120px;bottom:-180px;box-shadow:0 0 75px rgba(239,83,80,.08);animation:vrSpin 19s linear infinite}.loginRing.r2{width:300px;height:300px;right:-65px;top:-105px;border-style:dashed;animation:vrSpinBack 24s linear infinite}
    .loginParticles{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,#ffffff78 1px,transparent 1.5px),radial-gradient(circle,#ef53504d 1px,transparent 1.5px);background-size:95px 95px,143px 143px;background-position:0 0,35px 28px;opacity:.34;animation:vrParticles 20s linear infinite}
    .loginBox{position:relative!important;z-index:5!important;background:linear-gradient(155deg,#132238 0%,#0d192a 50%,#091321 100%)!important;border:1px solid #2a3a50!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:0 38px 88px rgba(0,0,0,.58),0 13px 0 #050a11,0 0 0 1px rgba(255,255,255,.025) inset!important;transform-style:preserve-3d;transition:transform .16s ease-out,box-shadow .2s ease!important}.loginBox:before,.loginBox:after{display:none!important}.loginLogo,.loginTitle,.loginSub,.field,.loginBtn,.msg{transform:translateZ(24px)}
    .loginBtn{box-shadow:0 8px 0 #71000a,0 14px 24px rgba(183,28,28,.28)!important}.loginBtn:active{transform:translateY(4px) translateZ(24px)!important;box-shadow:0 3px 0 #71000a,0 7px 13px rgba(183,28,28,.22)!important}
    .mainLogo{transform:perspective(900px) rotateY(-5deg);transform-style:preserve-3d;transition:transform .22s ease!important}.mainLogo:hover{transform:perspective(900px) rotateY(5deg) translateY(-2px)}
    .clock,.profile{transform-style:preserve-3d;box-shadow:0 5px 0 #e5dbcf,0 10px 18px rgba(95,61,25,.10),inset 0 1px 0 #fff!important}.card{transform-style:preserve-3d;transition:transform .22s ease,box-shadow .22s ease!important}.card:hover{transform:perspective(900px) translateY(-5px) rotateX(2deg) rotateY(-1deg)!important;box-shadow:0 12px 0 rgba(225,216,205,.50),0 22px 35px rgba(89,53,19,.13)!important}.cardHead,.ingredient,.rateName{transform:translateZ(10px)}
    @keyframes vrGrid{to{background-position:0 104px,104px 0}}@keyframes vrOrb{0%,100%{transform:translate3d(0,0,0) rotate(0)}50%{transform:translate3d(14px,-18px,42px) rotate(8deg)}}@keyframes vrSpin{to{transform:rotate(360deg)}}@keyframes vrSpinBack{to{transform:rotate(-360deg)}}@keyframes vrParticles{to{background-position:95px 95px,-108px 171px}}
    @media(prefers-reduced-motion:reduce){.loginGrid,.loginOrb,.loginRing,.loginParticles{animation:none!important}}
  `);

  const scene = document.getElementById('login');
  const box = scene?.querySelector('.loginBox');
  if (scene && box && !scene.querySelector('.loginGrid')) {
    const html = '<div class="loginGrid"></div><div class="loginOrb o1"></div><div class="loginOrb o2"></div><div class="loginOrb o3"></div><div class="loginRing r1"></div><div class="loginRing r2"></div><div class="loginParticles"></div>';
    box.insertAdjacentHTML('beforebegin', html);
    scene.addEventListener('pointermove', e => {
      if (scene.classList.contains('hidden')) return;
      const r = box.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / r.width;
      const y = (e.clientY - (r.top + r.height / 2)) / r.height;
      box.style.transform = `rotateX(${-y * 7}deg) rotateY(${x * 9}deg)`;
      scene.style.setProperty('--mx', `${e.clientX / innerWidth * 100}%`);
      scene.style.setProperty('--my', `${e.clientY / innerHeight * 100}%`);
    });
    scene.addEventListener('pointerleave', () => { box.style.transform = ''; });
  }

  const soya = [...document.querySelectorAll('.pCard img')].find(i => /soya/i.test(i.alt || ''));
  if (soya) soya.src = './assets/header/soya.webp';
}

function fixAdminNav() {
  if (!page.endsWith('/admin.html')) return;
  addStyle('vrcl-admin-nav-fix', `
    .vrNavIcon{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;text-decoration:none;background:linear-gradient(145deg,#fff,#e9edf3);color:#101827;border:1px solid #ffffff55;box-shadow:0 5px 0 #aeb6c1,0 9px 16px #0003;transition:.12s;padding:0!important}.vrNavIcon:active{transform:translateY(3px);box-shadow:0 2px 0 #aeb6c1,0 4px 9px #0002}.vrNavIcon svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.vrRateCheck{color:#087f70}
  `);
  const area = document.querySelector('.topbar .flex');
  if (!area) return;
  const dashboards = [...area.querySelectorAll('a[href*="dashboard.html"]')];
  dashboards.slice(1).forEach(a => a.remove());
  let dash = dashboards[0];
  if (!dash) {
    dash = document.createElement('a');
    dash.href = './dashboard.html';
    area.insertBefore(dash, document.getElementById('logout'));
  }
  dash.className = 'vrNavIcon';
  dash.title = 'Dashboard'; dash.setAttribute('aria-label','Dashboard');
  dash.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

  [...area.querySelectorAll('a[href*="customer-check.html"]')].forEach(a => a.remove());
  const check = document.createElement('a');
  check.href = './customer-check.html'; check.className = 'vrNavIcon vrRateCheck';
  check.title = 'Rate Check'; check.setAttribute('aria-label','Rate Check');
  check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h5"/><path d="m14 16 2 2 4-4"/></svg>';
  dash.insertAdjacentElement('afterend', check);
}

queueMicrotask(() => { fixCustomerUi(); fixAdminNav(); });
