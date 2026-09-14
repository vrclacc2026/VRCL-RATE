// Three.js 0.180.0. Decorative hero only; independent of authentication and rates.
const host=document.getElementById('oilScene');
const login=document.getElementById('login');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let started=false;
async function start(){
  if(started||!host||!login.classList.contains('hidden'))return;
  started=true;
  try{
    const THREE=await import('./vendor/three/three.module.min.js');
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(36,1,.1,40);camera.position.set(0,.4,7.6);
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x000000,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);host.classList.add('sceneReady');
    scene.add(new THREE.HemisphereLight(0xfff7dd,0x1c343d,3));
    for(const [color,intensity,x,y,z] of [[0xffe5a0,7,-3,4,5],[0xffffff,5,3,2,1],[0x77afbd,4,-2,-1,-3]]){
      const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);
    }
    const group=new THREE.Group();scene.add(group);
    const gold=new THREE.MeshStandardMaterial({color:0xd5a950,metalness:.72,roughness:.25});
    const softGold=new THREE.MeshStandardMaterial({color:0xf1d99b,metalness:.58,roughness:.3});
    // A tapered lathe profile gives an actual volumetric oil drop.
    const outline=[[0,-.86],[.23,-.83],[.46,-.67],[.59,-.4],[.6,-.12],[.53,.18],[.4,.45],[.26,.73],[.13,1],[0,1.32]];
    const curve=new THREE.SplineCurve(outline.map(([x,y])=>new THREE.Vector2(x,y)));
    const drop=new THREE.Mesh(new THREE.LatheGeometry(curve.getPoints(64).map(p=>new THREE.Vector2(Math.max(0,p.x),p.y)),64),gold);
    drop.rotation.z=-.2;group.add(drop);
    const rings=[];
    for(let i=0;i<3;i++){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1.2+i*.27,.012+i*.002,8,100),softGold);
      ring.rotation.set(1.12+i*.18,.3+i*.35,.1);ring.position.y=-.32;
      rings.push(ring);group.add(ring);
    }
    const satellite=new THREE.Mesh(new THREE.SphereGeometry(.11,20,16),softGold);satellite.position.set(1.45,.15,.3);group.add(satellite);
    let visible=true,frame=0,last=0,elapsed=0,targetX=0,targetY=0,disposed=false;
    function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();draw();}
    function draw(){if(!disposed)renderer.render(scene,camera);}
    function tick(now){frame=0;if(disposed||!visible||document.hidden||reduced.matches)return;if(now-last>=32){elapsed+=Math.min((now-last)/1000,.05);last=now;group.rotation.y+=(targetX-group.rotation.y)*.04;group.rotation.x+=(targetY-group.rotation.x)*.04;drop.position.y=Math.sin(elapsed*.65)*.07;rings[0].rotation.z=elapsed*.06;satellite.position.y=.15+Math.sin(elapsed*.7)*.16;draw()}frame=requestAnimationFrame(tick);}
    function update(){cancelAnimationFrame(frame);frame=0;if(!visible||document.hidden)return;if(reduced.matches){draw();return}last=performance.now();frame=requestAnimationFrame(tick);}
    const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
    const visibilityObserver=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update()});visibilityObserver.observe(host);
    function pointer(event){if(reduced.matches)return;const r=host.parentElement.getBoundingClientRect();targetX=((event.clientX-r.left)/r.width-.5)*.4;targetY=((event.clientY-r.top)/r.height-.5)*.12;}
    host.parentElement.addEventListener('pointermove',pointer);
    document.addEventListener('visibilitychange',update);reduced.addEventListener('change',update);
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(frame);host.classList.remove('sceneReady')});
    renderer.domElement.addEventListener('webglcontextrestored',()=>{host.classList.add('sceneReady');update()});
    window.addEventListener('pagehide',event=>{if(event.persisted){cancelAnimationFrame(frame);return}disposed=true;cancelAnimationFrame(frame);resizeObserver.disconnect();visibilityObserver.disconnect();document.removeEventListener('visibilitychange',update);reduced.removeEventListener('change',update);scene.traverse(object=>{object.geometry?.dispose()});gold.dispose();softGold.dispose();renderer.dispose()});
    window.addEventListener('pageshow',event=>{if(event.persisted)update()});
    resize();update();
  }catch(error){console.warn('Decorative 3D scene unavailable; keeping the static oil illustration.',error)}
}
if(host&&login){const observer=new MutationObserver(()=>{if(login.classList.contains('hidden')){observer.disconnect();start()}});observer.observe(login,{attributes:true,attributeFilter:['class']});start();}
