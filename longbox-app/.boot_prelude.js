/* fake DOM / storage harness -------------------------------------------- */
const H_alerts=[], H_toasts=[];
function H_el(id){
  const e={
    id, tagName:"DIV", dataset:{}, style:{}, children:[],
    innerHTML:"", outerHTML:"", textContent:"", value:"", className:"",
    hidden:false, disabled:false, checked:false, scrollTop:0, parentNode:null,
    classList:(()=>{const set=new Set();return{
      add(c){set.add(c)}, remove(c){set.delete(c)},
      toggle(c,on){ if(on===undefined){set.has(c)?set.delete(c):set.add(c);} else {on?set.add(c):set.delete(c);} return set.has(c); },
      contains(c){return set.has(c)} };})(),
    appendChild(c){c.parentNode=e;e.children.push(c);return c},
    removeChild(){}, remove(){}, click(){}, focus(){}, blur(){},
    setAttribute(k,v){e["attr_"+k]=v}, getAttribute(k){return e["attr_"+k]},
    removeAttribute(){}, addEventListener(){}, removeEventListener(){},
    querySelector(){return H_el("q")}, querySelectorAll(){return []},
    closest(){return null}, insertAdjacentHTML(){},
    getBoundingClientRect(){return{top:0,left:0,width:0,height:0}}
  };
  return e;
}
const H_els={};
global.document={
  getElementById(id){ return H_els[id]||(H_els[id]=H_el(id)); },
  querySelector(){ return H_el("qs"); },
  querySelectorAll(){ return []; },
  createElement(t){ return H_el(t); },
  createTextNode(t){ return {text:t}; },
  addEventListener(){}, removeEventListener(){},
  body: H_el("body"), documentElement: H_el("html"), head: H_el("head"),
  title:"", readyState:"complete", visibilityState:"visible"
};
global.window = global;
global.self = global;
global.navigator = { userAgent:"node-harness", serviceWorker:{ register(){return Promise.resolve({addEventListener(){},waiting:null,update(){}});}, addEventListener(){}, getRegistrations(){return Promise.resolve([])}, controller:null } };
global.location = { href:"https://kloisien.github.io/longbox-app/", origin:"https://kloisien.github.io", pathname:"/longbox-app/", protocol:"https:", reload(){}, hostname:"kloisien.github.io" };
global.alert = m => H_alerts.push(String(m));
global.confirm = () => false;
global.prompt = () => null;
global.matchMedia = () => ({matches:false, addListener(){}, addEventListener(){}});
global.requestAnimationFrame = f => setTimeout(f,0);
global.caches = { open(){ return Promise.resolve({ match(){return Promise.resolve(null)}, put(){return Promise.resolve()}, delete(){H_cacheDeletes++;return Promise.resolve(true)}, addAll(){return Promise.resolve()} }); }, keys(){return Promise.resolve([])}, match(){return Promise.resolve(null)}, delete(){return Promise.resolve(true)} };
let H_cacheDeletes=0;
global.fetch = () => Promise.reject(new Error("harness: no network"));
global.URL = global.URL;
const H_ls=new Map();
global.localStorage={ getItem:k=>H_ls.has(k)?H_ls.get(k):null, setItem:(k,v)=>{H_ls.set(k,String(v))}, removeItem:k=>{H_ls.delete(k)}, clear:()=>H_ls.clear(), key:i=>[...H_ls.keys()][i], get length(){return H_ls.size} };
global.sessionStorage=global.localStorage;
/* no indexedDB on purpose - exercises the storage fallback path */
/* Image: URLs on files1.comics.org load, everything else 403s */
const H_imgTried=[];
global.Image = class {
  constructor(){ this.naturalWidth=0; this.naturalHeight=0; this._src=""; }
  set src(v){
    this._src=v; H_imgTried.push(v);
    const good = /files1\.comics\.org/.test(v);
    setTimeout(()=>{ if(good){ this.naturalWidth=400; this.naturalHeight=600; if(this.onload) this.onload(); }
                     else if(this.onerror) this.onerror(); },0);
  }
  get src(){ return this._src; }
};
global.scrollY = 0;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.dispatchEvent = () => true;
global.scrollTo = () => {};
global.getComputedStyle = () => ({getPropertyValue(){return ""}});
