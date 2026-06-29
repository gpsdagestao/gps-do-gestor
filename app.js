// GPS DA GESTAO v2.0 - by Grupo Vertriah

function san(str){if(str==null)return'';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');}
function toast(msg,type,ms){type=type||'info';ms=ms||3000;var c=document.getElementById('toast-container');if(!c)return;var t=document.createElement('div');t.className='toast '+type;t.textContent=msg;c.appendChild(t);setTimeout(function(){t.remove();},ms);}
function openModal(id){var el=document.getElementById(id);if(el)el.classList.add('open');}
function closeModal(id){var el=document.getElementById(id);if(el)el.classList.remove('open');}
function money(v){if(!v)return'R$ 0,00';return'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2});}
function moneyShort(v){if(!v)return'R$ 0';if(v>=1000000)return'R$ '+(v/1000000).toFixed(1).replace('.',',')+'M';if(v>=1000)return'R$ '+(v/1000).toFixed(0)+'k';return'R$ '+Number(v).toLocaleString('pt-BR');}

// Limpar undefined antes de salvar no Firestore (Firestore rejeita undefined)
function _cleanUndef(obj){
  if(obj===null||obj===undefined)return null;
  if(Array.isArray(obj))return obj.map(_cleanUndef);
  if(typeof obj==='object'){
    var clean={};
    Object.keys(obj).forEach(function(k){
      if(obj[k]!==undefined)clean[k]=_cleanUndef(obj[k]);
    });
    return clean;
  }
  return obj;
}

function dateStr(iso){if(!iso)return'';try{var d=new Date(iso.includes('T')?iso:iso+'T12:00');if(isNaN(d.getTime()))return'';return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});}catch(e){return'';}}
function diasSem(iso){if(!iso)return 0;return Math.floor((new Date()-new Date(iso))/86400000);}

var CU=null,clients=[],companies=[],users=[],licenses=[],STAGES=[],_filter='all',_compact=false,_dragId=null,_firestoreUnsub=null;
var LS={session:'gps_v2_session',compact:'gps_v2_compact',fabPos:'gps_v2_fab'};
var DEFAULT_STAGES=[
  {id:'prospecção',name:'Prospecção',color:'#7C3AED',bg:'#F5F3FF'},
  {id:'qualificacao',name:'Qualificacao',color:'#1B4F8A',bg:'#E8EFF8'},
  {id:'negociação',name:'Negociação',color:'#B07D1A',bg:'#FBF3E0'},
  {id:'negociacao',name:'Negociacao',color:'#B85515',bg:'#FDF0E6'},
  {id:'execução',name:'Execução',color:'#1A7A4A',bg:'#E6F5EE'},
  {id:'relacionamento',name:'Pos-venda',color:'#C0392B',bg:'#FDECEA'}
];

function getStages(){
  try{
    var saved=JSON.parse(localStorage.getItem('gps_v2_stages_'+(CU&&CU.companyId||''))||'null');
    return Array.isArray(saved)&&saved.length>0 ? saved : DEFAULT_STAGES.slice();
  }catch(e){return DEFAULT_STAGES.slice();}
}
function saveStages(stages){
  try{localStorage.setItem('gps_v2_stages_'+(CU&&CU.companyId||''),JSON.stringify(stages));}catch(e){}
}
function addPipelineCol(){
  var name=prompt('Nome da nova coluna:');
  if(!name||!name.trim()) return;
  var stages=getStages();
  var colors=['#0B7285','#5B21B6','#065F46','#7C2D12','#1E3A5F','#4A1942'];
  var bgs=['#E3F9F5','#F5F3FF','#D1FAE5','#FEF3C7','#EFF6FF','#FAF5FF'];
  var idx=stages.length%colors.length;
  stages.push({id:'col_'+Date.now(),name:name.trim(),color:colors[idx],bg:bgs[idx]});
  saveStages(stages);
  STAGES=stages;
  renderPipeline();
  toast('Coluna "'+name.trim()+'" adicionada','success');
}
function renamePipelineCol(id){
  var stages=getStages();
  var s=stages.find(function(x){return x.id===id;});
  if(!s) return;
  var name=prompt('Novo nome para "'+s.name+'":',s.name);
  if(!name||!name.trim()) return;
  s.name=name.trim();
  saveStages(stages);
  STAGES=stages;
  renderPipeline();
}
function deletePipelineCol(id){
  var stages=getStages();
  var s=stages.find(function(x){return x.id===id;});
  if(!s) return;
  if(!confirm('Excluir coluna "'+s.name+'"? Os stakeholders nela voltam para Prospecção.')) return;
  var remaining=stages.filter(function(x){return x.id!==id;});
  saveStages(remaining);
  STAGES=remaining;
  // Mover stakeholders da coluna excluída para a primeira coluna
  clients.forEach(function(c){
    if(c.stage===id){c.stage=remaining[0]&&remaining[0].id||'prospecção';saveClientToFirestore(c);}
  });
  renderPipeline();
  toast('Coluna removida','info');
}
var PRIO={alta:{label:'Alta',color:'var(--red)',bg:'var(--red-lt)',cls:'prio-alta'},media:{label:'Media',color:'var(--amber)',bg:'var(--amber-lt)',cls:'prio-media'},baixa:{label:'Baixa',color:'var(--green)',bg:'var(--green-lt)',cls:'prio-baixa'}};
var PERFIS={Comandante:{icon:'⚡',color:'#C0392B',bg:'#FDECEA'},Catalisador:{icon:'🔥',color:'#B07D1A',bg:'#FBF3E0'},Conector:{icon:'🤝',color:'#1A7A4A',bg:'#E6F5EE'},Artesao:{icon:'🎯',color:'#5B21B6',bg:'#F5F3FF'}};

// Firebase CDN loader
var CDN_SETS=[['https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js','https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js','https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'],['https://cdn.jsdelivr.net/npm/firebase@9.23.0/firebase-app-compat.min.js','https://cdn.jsdelivr.net/npm/firebase@9.23.0/firebase-auth-compat.min.js','https://cdn.jsdelivr.net/npm/firebase@9.23.0/firebase-firestore-compat.min.js']];
function loadScript(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
async function tryLoadFrom(sets,idx){if(idx>=sets.length){console.error('Firebase: todos CDNs falharam');return;}try{for(var s of sets[idx])await loadScript(s);initFirebase();}catch(e){console.warn('CDN',idx,'falhou');tryLoadFrom(sets,idx+1);}}

function initFirebase(){
  var _k='AIzaSyArZfnw0OwQbef3U2PjTpgK39NGmWZ8eV0';
  firebase.initializeApp({apiKey:_k,authDomain:'gps-do-gestor.firebaseapp.com',projectId:'gps-do-gestor',storageBucket:'gps-do-gestor.firebasestorage.app',messagingSenderId:'907587812966',appId:'1:907587812966:web:18da9e4d70d5b61960b7a7'});
  var auth=firebase.auth(),db=firebase.firestore();
  window._fb={auth:auth,db:db,
    collection:function(db,col){return db.collection(col);},
    doc:function(db,col,id){return db.collection(col).doc(id);},
    getDoc:function(ref){return ref.get();},
    getDocs:function(q){return q.get();},
    setDoc:function(ref,data,opts){return opts&&opts.merge?ref.set(data,{merge:true}):ref.set(data);},
    updateDoc:function(ref,data){return ref.update(data);},
    deleteDoc:function(ref){return ref.delete();},
    query:function(){var q=arguments[0];for(var i=1;i<arguments.length;i++){var c=arguments[i];if(c.type==='where')q=q.where(c.field,c.op,c.val);else if(c.type==='orderBy')q=q.orderBy(c.field,c.dir||'asc');else if(c.type==='limit')q=q.limit(c.n);}return q;},
    where:function(f,op,v){return{type:'where',field:f,op:op,val:v};},
    orderBy:function(f,dir){return{type:'orderBy',field:f,dir:dir};},
    limit:function(n){return{type:'limit',n:n};},
    onSnapshot:function(q,cb,err){return q.onSnapshot(cb,err);},
    serverTimestamp:function(){return firebase.firestore.FieldValue.serverTimestamp();}
  };
  // Edge/Safari: usar SESSION persistence para evitar bloqueio de IndexedDB
  var setPersistence = auth.setPersistence ?
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION) :
    Promise.resolve();
  setPersistence.catch(function(){}).finally(function(){
    auth.onAuthStateChanged(function(user){if(user)onAuthSuccess(user);else showPage('login');});
  });
}

tryLoadFrom(CDN_SETS,0);

function showPage(id){
  var pages=['page-login','page-license','page-app'];
  pages.forEach(function(p){
    var el=document.getElementById(p);if(!el)return;
    if(p==='page-app')el.style.display=p===('page-'+id)?'flex':'none';
    else el.style.display=p===('page-'+id)?'':'none';
  });
  if(id==='login'){setTimeout(function(){var e=document.getElementById('login-email');if(e)e.focus();},100);}
  if(id==='license'){setTimeout(renderLicensePage,50);}
}

async function loginUser(){
  var email=document.getElementById('login-email').value.trim();
  var pass=document.getElementById('login-password').value;
  var errEl=document.getElementById('login-error');
  errEl.style.display='none';
  if(!email||!pass){errEl.textContent='Preencha e-mail e senha.';errEl.style.display='block';return;}
  try{await window._fb.auth.signInWithEmailAndPassword(email,pass);}
  catch(e){
    var msgs={'auth/user-not-found':'E-mail nao encontrado.','auth/wrong-password':'Senha incorreta.','auth/invalid-email':'E-mail invalido.','auth/network-request-failed':'Erro de conexao. Verifique sua internet.','auth/too-many-requests':'Muitas tentativas. Aguarde.'};
    errEl.textContent=msgs[e.code]||'Erro: '+e.message;errEl.style.display='block';
  }
}
document.addEventListener('keydown',function(e){var pg=document.getElementById('page-login');if(e.key==='Enter'&&pg&&pg.style.display!=='none')loginUser();});

async function onAuthSuccess(firebaseUser){
  try{
    var fb=window._fb;
    var userDoc=await fb.getDoc(fb.doc(fb.db,'users',firebaseUser.uid));
    if(!userDoc.exists){showPage('license');return;}
    var uData=userDoc.data();
    CU={id:firebaseUser.uid,email:firebaseUser.email,name:uData.name||firebaseUser.email.split('@')[0],role:uData.role||'membro',companyId:uData.companyId||'',companyIds:uData.companyIds||[uData.companyId].filter(Boolean),plan:uData.plan||'trial',permissions:uData.permissions||null};
    if(uData.role!=='superadmin'){
      var blocked=uData.status==='pendente'||uData.status==='inativo'||uData.status==='rejeitado';
      var trialExp=uData.status==='trial'&&uData.trialExpires&&new Date(uData.trialExpires)<new Date();
      if(blocked||trialExp){
        if(trialExp&&uData.status==='trial'){
          try{await fb.updateDoc(fb.doc(fb.db,'users',firebaseUser.uid),{status:'expirado'});}catch(ex){}
        }
        showPage('license');return;
      }
      // Verificar licença da organização
      if(uData.companyId){
        try{
          var coDoc=await fb.getDoc(fb.doc(fb.db,'companies',uData.companyId));
          if(coDoc.exists){
            var coData=coDoc.data();
            var licExp=coData.licenseExpires&&new Date(coData.licenseExpires)<new Date();
            var licOk=coData.licenseStatus==='ativo'&&!licExp;
            // Trial de 7 dias sem licença ainda é permitido
            var inTrial=uData.status==='trial'&&uData.trialExpires&&new Date(uData.trialExpires)>new Date();
            if(!licOk&&!inTrial){showPage('license');return;}
          }
        }catch(ex){console.warn('licCheck:',ex.message);}
      }
    }
    try{localStorage.setItem(LS.session,JSON.stringify({id:CU.id,email:CU.email}));}catch(ex){}
    await initApp();
    if(CU.role==='superadmin')atualizarBadgePendentes();
    if(can('create_company')||can('manage_members'))loadUsers();
  }catch(e){console.error('Auth:',e);toast('Erro ao carregar: '+e.message,'error');}
}

async function initApp(){
  STAGES=getStages();
  _compact=localStorage.getItem(LS.compact)==='1';
  var loadU=CU.role==='superadmin'||can('view_members')?loadUsers():Promise.resolve();
  var loadL=CU.role==='superadmin'?loadLicenses():Promise.resolve();
  var loadR=CU.role==='superadmin'?loadCustomRoles():Promise.resolve();
  await Promise.all([loadClients(),loadCompanies(),loadU,loadL,loadR,loadCeoData()]);
  setupSidebar();showPage('app');
  setTimeout(atualizarBadgeRotina, 1000);
  setTimeout(verificarCheckinSemanal, 5000);
  // Restaurar última tela visitada
  var lastView=localStorage.getItem('gps_v2_last_view')||'home';
  var lastEl=document.querySelector('.nav-item[data-view="'+lastView+'"]');
  navTo(lastView, lastEl||document.querySelector('.nav-item[data-view="home"]'));
  updateCompactBtn();initFab();initMentorGPS();renderHelpPanel();
  startRealtimeSync();
  setTimeout(checkReturnLoop,1500);
  setTimeout(function(){if(!localStorage.getItem('gps_v2_tour_done_'+(CU&&CU.id||''))&&clients.length===0)startTour(false);},2000);
}

function logout(){
  if(_firestoreUnsub){_firestoreUnsub();_firestoreUnsub=null;}
  try{localStorage.removeItem(LS.session);}catch(e){}
  CU=null;clients=[];companies=[];users=[];licenses=[];
  if(window._fb)window._fb.auth.signOut();
  showPage('login');
}
function ativarLicenca(){
  window.open('https://hotmart.com','_blank');
}

function renderLicensePage(){
  var el=document.getElementById('license-content');
  if(!el)return;
  var expired=CU&&CU.status==='expirado'||(!CU);
  if(expired){
    el.innerHTML=
      '<div style="text-align:center;padding:40px 20px;max-width:420px;margin:0 auto">'+
        '<div style="font-size:56px;margin-bottom:16px">⏱️</div>'+
        '<h2 style="font-size:22px;font-weight:800;color:var(--navy);margin-bottom:8px">Seu período gratuito encerrou</h2>'+
        '<p style="font-size:14px;color:var(--muted);margin-bottom:28px;line-height:1.6">'+
          'Você utilizou os 7 dias gratuitos do GPS do Gestor.<br>Para continuar acessando, escolha um planejamento.'+
        '</p>'+
        '<a href="https://hotmart.com" target="_blank" class="btn btn-primary" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;border-radius:var(--r2);text-decoration:none;margin-bottom:16px">'+
          '🚀 Assinar agora'+
        '</a>'+
        '<div style="font-size:12px;color:var(--muted);margin-top:12px">'+
          'Já assinou? <a href="#" onclick="showPage(\'login\');return false" style="color:var(--blue)">Entrar novamente</a>'+
        '</div>'+
      '</div>';
  } else {
    el.innerHTML=
      '<div style="text-align:center;padding:40px 20px;max-width:420px;margin:0 auto">'+
        '<div style="font-size:56px;margin-bottom:16px">🔒</div>'+
        '<h2 style="font-size:22px;font-weight:800;color:var(--navy);margin-bottom:8px">Acesso não disponível</h2>'+
        '<p style="font-size:14px;color:var(--muted);margin-bottom:28px">Entre em contato com o suporte.</p>'+
        '<a href="mailto:contato@gpsdogestor.com" class="btn btn-primary" style="display:inline-block;padding:14px 32px;font-size:15px">Falar com suporte</a>'+
        '<div style="font-size:12px;color:var(--muted);margin-top:12px">'+
          '<a href="#" onclick="showPage(\'login\');return false" style="color:var(--blue)">Voltar ao login</a>'+
        '</div>'+
      '</div>';
  }
}

function navTo(view,el){
  closeSidebar();
  try{localStorage.setItem('gps_v2_last_view',view);}catch(e){}
  document.querySelectorAll('.nav-item').forEach(function(i){i.classList.remove('active');});
  if(el)el.classList.add('active');
  document.querySelectorAll('.bn-item').forEach(function(i){i.classList.remove('active');});
  var bnItem=document.querySelector('.bn-item[data-view="'+view+'"]');
  if(bnItem)bnItem.classList.add('active');
  document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active');});
  var viewEl=document.getElementById('view-'+view);
  if(viewEl)viewEl.classList.add('active');
  var titles={home:'Inicio',pipeline:'Painel de Iniciativas',clients:'Stakeholders',dashboard:'Dashboard',decifre:'Rota Executiva',ceo:'Agenda CEO',companies:'Organizaçãos',users:'Usuarios',licenses:'Licencas',pendentes:'Pendentes'};
  var mTitle=document.getElementById('mobile-title');if(mTitle)mTitle.textContent=titles[view]||'GPS';
  var renders={home:renderHome,pipeline:renderPipeline,clients:function(){var s=document.getElementById('clients-search');if(s)s.value='';if(clients&&clients.length>0){renderClients();}else{loadClients().then(renderClients);}},budget:renderBudget,dashboard:renderDashboard,decifre:renderDecifre,
    rotina:renderRotinaPrincipal,
    semana:renderSemana,planejamento:renderPlanejamento,
    ceo:renderPlanejamento,
    pendentes:function(){renderPendentes();atualizarBadgePendentes();},companies:renderCompanies,users:renderUsers,licenses:renderLicenses,'my-companies':renderMyCompanies,'my-members':renderMyMembers,roles:renderRoles};
  if(renders[view])renders[view]();
}

function openSidebar(){document.getElementById('sidebar').classList.add('open');document.getElementById('sidebar-overlay').classList.add('show');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-overlay').classList.remove('show');}
function toggleUserMenu(){var m=document.getElementById('user-menu');if(m)m.style.display=m.style.display==='block'?'none':'block';}

function setupSidebar(){
  var sbName=document.getElementById('sb-name'),sbRole=document.getElementById('sb-role'),sbAv=document.getElementById('sb-avatar');
  if(sbName)sbName.textContent=CU.name;
  var roleLabel={superadmin:'Super Admin',admin_organização:'Admin da Organização',membro:'Membro',visualizador:'Visualizador'};
  if(sbRole)sbRole.textContent=roleLabel[CU.role]||CU.role;
  if(sbAv)sbAv.textContent=(CU.name||'U')[0].toUpperCase();

  // Módulos — esconder por permissão
  var navDash=document.querySelector('[data-view="dashboard"]');
  var navDecifre=document.querySelector('[data-view="decifre"]');
  var navCeo=document.querySelector('[data-view="ceo"]');
  var navMentor=document.querySelector('[onclick*="toggleMentorGPS"]');
  if(navDash)navDash.style.display=can('access_dashboard')?'':'none';
  if(navDecifre)navDecifre.style.display=can('access_decifre')?'':'none';
  if(navCeo)navCeo.style.display=can('access_ceo')?'':'none';
  if(navMentor)navMentor.style.display=can('access_mentor')?'':'none';

  // SA Global — só superadmin
  var ss=document.getElementById('nav-sa-section');
  if(ss)ss.style.display=CU.role==='superadmin'?'block':'none';
  document.querySelectorAll('.sa-only').forEach(function(el){el.style.display=CU.role==='superadmin'?'block':'none';});

  // Admin de organização — mostrar mini-SA (organizaçãos e membros)
  var adminSection=document.getElementById('nav-admin-section');
  if(adminSection)adminSection.style.display=can('create_company')||can('manage_members')?'block':'none';
}
// Firebase CRUD
async function loadClients(){
  var fb=window._fb;if(!fb||!CU)return;
  try{
    var snaps=[];
    if(CU.role==='superadmin'){var s=await fb.getDocs(fb.collection(fb.db,'clients'));snaps=s.docs;}
    else{
      var coIds=CU.companyIds.length?CU.companyIds:[CU.companyId].filter(Boolean);
      for(var i=0;i<coIds.length;i+=10){
        var chunk=coIds.slice(i,i+10);
        var s1=await fb.getDocs(fb.query(fb.collection(fb.db,'clients'),fb.where('_ownerCompanyId','in',chunk)));
        var s2=await fb.getDocs(fb.query(fb.collection(fb.db,'clients'),fb.where('companyId','in',chunk)));
        snaps.push.apply(snaps,s1.docs);snaps.push.apply(snaps,s2.docs);
      }
      var own=await fb.getDocs(fb.query(fb.collection(fb.db,'clients'),fb.where('_ownerId','==',CU.id)));
      snaps.push.apply(snaps,own.docs);
    }
    var seen=new Set();
    clients=snaps.filter(function(d){if(seen.has(d.id))return false;seen.add(d.id);return true;})
      .map(function(d){return Object.assign({},d.data(),{id:d.id});})
      .filter(function(c){return!c._deleted;});
  }catch(e){console.warn('loadClients:',e.code||e.message);}
}

async function loadCompanies(){
  var fb=window._fb;if(!fb||!CU)return;
  try{
    if(CU.role==='superadmin'){
      var s=await fb.getDocs(fb.collection(fb.db,'companies'));
      companies=s.docs.map(function(d){return Object.assign({},d.data(),{id:d.id});});
    } else if(CU.role==='admin_organização'){
      // Admin vê organizaçãos que criou + organizaçãos vinculadas ao seu companyIds
      var owned=await fb.getDocs(fb.query(fb.collection(fb.db,'companies'),fb.where('ownerId','==',CU.id)));
      var seen=new Set();
      companies=owned.docs.map(function(d){seen.add(d.id);return Object.assign({},d.data(),{id:d.id});});
      var coIds=CU.companyIds.length?CU.companyIds:[CU.companyId].filter(Boolean);
      for(var cid of coIds){
        if(!seen.has(cid)){seen.add(cid);var d=await fb.getDoc(fb.doc(fb.db,'companies',cid));if(d.exists)companies.push(Object.assign({},d.data(),{id:d.id}));}
      }
    } else {
      var coIds=CU.companyIds.length?CU.companyIds:[CU.companyId].filter(Boolean);companies=[];
      for(var cid of coIds){var d=await fb.getDoc(fb.doc(fb.db,'companies',cid));if(d.exists)companies.push(Object.assign({},d.data(),{id:d.id}));}
    }
  }catch(e){console.warn('loadCompanies:',e.code||e.message);}
}

async function loadUsers(){
  var fb=window._fb;if(!fb||!CU)return;
  try{
    if(CU.role==='superadmin'){
      var s=await fb.getDocs(fb.collection(fb.db,'users'));
      users=s.docs.map(function(d){return Object.assign({},d.data(),{id:d.id});});
    } else if(can('view_members')){
      var coIds=CU.companyIds.length?CU.companyIds:[CU.companyId].filter(Boolean);
      var seen=new Set(); users=[];
      for(var cid of coIds){
        var s=await fb.getDocs(fb.query(fb.collection(fb.db,'users'),fb.where('companyIds','array-contains',cid)));
        s.docs.forEach(function(d){if(!seen.has(d.id)){seen.add(d.id);users.push(Object.assign({},d.data(),{id:d.id}));}});
      }
    }
  }catch(e){console.warn('loadUsers:',e.code);}
}
async function loadLicenses(){var fb=window._fb;if(!fb||!CU)return;try{var s=await fb.getDocs(fb.collection(fb.db,'licenses'));licenses=s.docs.map(function(d){return Object.assign({},d.data(),{id:d.id});});}catch(e){console.warn('loadLicenses:',e.code);}}

function startRealtimeSync(){
  var fb=window._fb;if(!fb||!CU)return;
  if(_firestoreUnsub){_firestoreUnsub();_firestoreUnsub=null;}
  try{
    var queries=[];
    if(CU.role==='superadmin'){queries.push(fb.collection(fb.db,'clients'));}
    else{
      var coIds=CU.companyIds.length?CU.companyIds:[CU.companyId].filter(Boolean);
      for(var i=0;i<coIds.length;i+=10){
        var chunk=coIds.slice(i,i+10);
        queries.push(fb.query(fb.collection(fb.db,'clients'),fb.where('_ownerCompanyId','in',chunk)));
        queries.push(fb.query(fb.collection(fb.db,'clients'),fb.where('companyId','in',chunk)));
      }
      queries.push(fb.query(fb.collection(fb.db,'clients'),fb.where('_ownerId','==',CU.id)));
    }
    var unsubs=queries.map(function(q){
      return fb.onSnapshot(q,function(snap){
        snap.docChanges().forEach(function(ch){
          var data=Object.assign({},ch.doc.data(),{id:ch.doc.id});
          if(ch.type==='removed'||data._deleted){clients=clients.filter(function(c){return c.id!==data.id;});}
          else{var idx=clients.findIndex(function(c){return c.id===data.id;});if(idx>=0)clients[idx]=data;else clients.push(data);}
        });
        var av=document.querySelector('.view.active');if(!av)return;
        var v=av.id.replace('view-','');
        if(v==='painel-de-iniciativas')renderPipeline();
        else if(v==='clients'){var s=document.getElementById('clients-search');if(s&&s.value==='')renderClients();}
        else if(v==='dashboard')renderDashboard();
        else if(v==='home'){STAGES=getStages();renderHome();}
      },function(e){console.warn('Realtime:',e.code);});
    });
    _firestoreUnsub=function(){unsubs.forEach(function(u){u();});if(_ceoUnsub){_ceoUnsub();_ceoUnsub=null;}};
  }catch(e){console.warn('startRealtimeSync:',e);}
  // Listener em tempo real para ceo_data (Agenda Executiva, Iniciativas, etc.)
  try{
    var coId=CU.companyId||CU.id;
    var _ceoUnsub=fb.onSnapshot(fb.doc(fb.db,'ceo_data',coId),function(snap){
      var d=snap.data();
      if(d){
        if(d.rotina!==undefined)_ceoCache.rotina=d.rotina||[];
        if(d.iniciativas!==undefined)_ceoCache.iniciativas=d.iniciativas||[];
        if(d.diag!==undefined)_ceoCache.diag=d.diag||null;
        if(d.matriz!==undefined)_ceoCache.matriz=d.matriz||[];
        if(d.sessoes!==undefined)_ceoCache.sessoes=d.sessoes||[];
        if(d.estrategia!==undefined)_ceoCache.estrategia=d.estrategia||null;
        if(d.budget!==undefined)_budgetCache=d.budget||[];
        // Re-renderizar tela ativa se for agenda-executiva
        var av=document.querySelector('.view.active');if(!av)return;
        var v=av.id.replace('view-','');
        if(v==='agenda-executiva')renderRotinaPrincipal();
        else if(v==='planejamento')renderPlanejamento();
      }
    },function(e){console.warn('CeoRealtime:',e.code);});
  }catch(e){console.warn('startCeoSync:',e);}
}

async function saveClientToFirestore(c){
  var fb=window._fb;if(!fb||!CU)return;
  var coId=c.companyId||CU.companyId||'';
  try{await fb.setDoc(fb.doc(fb.db,'clients',c.id),Object.assign({},c,{companyId:coId,_ownerCompanyId:coId,_ownerId:c.userId||CU.id,_updatedAt:fb.serverTimestamp()}));}
  catch(e){console.warn('saveClient:',e.code);}
}

async function deleteClientFromFirestore(id){
  var fb=window._fb;if(!fb)return;
  try{await fb.updateDoc(fb.doc(fb.db,'clients',id),{_deleted:true,_updatedAt:fb.serverTimestamp()});}
  catch(e){console.warn('deleteClient:',e.code);}
}

function myClients(){
  return clients.filter(function(c){
    if(c._deleted||c._archived)return false;
    if(CU.role==='superadmin')return true;
    var coIds=CU.companyIds.length?CU.companyIds:[CU.companyId].filter(Boolean);
    return coIds.includes(c.companyId)||c.userId===CU.id;
  });
}


// ══════════════════════════════════════════════════════
// SISTEMA DE PERMISSÕES
// ══════════════════════════════════════════════════════
var ALL_PERMISSIONS = [
  {id:'view_clients',      label:'Visualizar stakeholders da organização',       group:'Stakeholders'},
  {id:'create_client',     label:'Criar stakeholder',                        group:'Stakeholders'},
  {id:'edit_client',       label:'Editar stakeholder',                       group:'Stakeholders'},
  {id:'delete_client',     label:'Excluir stakeholder',                      group:'Stakeholders'},
  {id:'move_painel-de-iniciativas',     label:'Mover stakeholder no painel-de-iniciativas',            group:'Stakeholders'},
  {id:'view_all_clients',  label:'Ver stakeholders de todas as organizaçãos',    group:'Stakeholders'},
  {id:'view_company',      label:'Visualizar própria organização',           group:'Organizaçãos'},
  {id:'edit_company',      label:'Editar dados da organização',              group:'Organizaçãos'},
  {id:'create_company',    label:'Criar organização',                        group:'Organizaçãos'},
  {id:'delete_company',    label:'Excluir organização',                      group:'Organizaçãos'},
  {id:'manage_members',    label:'Atribuir membros à organização',           group:'Organizaçãos'},
  {id:'view_members',      label:'Visualizar membros da organização',        group:'Usuários'},
  {id:'add_member',        label:'Adicionar membro à organização',           group:'Usuários'},
  {id:'edit_member',       label:'Editar membro',                        group:'Usuários'},
  {id:'remove_member',     label:'Remover membro da organização',            group:'Usuários'},
  {id:'activate_user',     label:'Ativar/suspender usuário',             group:'Usuários'},
  {id:'create_role',       label:'Criar perfil customizado',             group:'Usuários'},
  {id:'access_dashboard',  label:'Acessar Dashboard',                    group:'Módulos'},
  {id:'access_decifre',    label:'Acessar Rota Executiva',                      group:'Módulos'},
  {id:'access_ceo',        label:'Acessar Agenda CEO',                   group:'Módulos'},
  {id:'access_mentor',     label:'Acessar Copiloto Executivo',                   group:'Módulos'},
  {id:'sa_licenses',       label:'Gerenciar licenças',                   group:'Super Admin'},
  {id:'sa_plans',          label:'Gerenciar planejamentos',                     group:'Super Admin'},
  {id:'sa_all_users',      label:'Ver todos os usuários da plataforma',  group:'Super Admin'},
  {id:'sa_all_companies',  label:'Ver todas as organizaçãos da plataforma',  group:'Super Admin'},
  {id:'sa_pending',        label:'Ativar/rejeitar cadastros pendentes',  group:'Super Admin'},
];

var DEFAULT_PERMISSIONS = {
  superadmin: ALL_PERMISSIONS.map(function(p){return p.id;}),
  admin_organização: [
    'view_clients','create_client','edit_client','delete_client','move_painel-de-iniciativas',
    'view_company','edit_company','create_company','delete_company','manage_members',
    'view_members','add_member','edit_member','remove_member',
    'access_dashboard','access_decifre','access_ceo','access_mentor'
  ],
  membro: [
    'view_clients','create_client','edit_client','move_painel-de-iniciativas',
    'view_company','view_members','access_dashboard'
  ],
  visualizador: [
    'view_clients','view_company','view_members','access_dashboard'
  ],
};

function can(permission){
  if(!CU)return false;
  if(CU.role==='superadmin')return true;
  // Permissões explícitas no usuário (perfil customizado salvo)
  if(CU.permissions&&Array.isArray(CU.permissions))return CU.permissions.includes(permission);
  // Role customizado via role = 'custom:id'
  if(CU.role&&CU.role.startsWith('custom:')){
    var crid=CU.role.replace('custom:','');
    var cr=_customRoles.find(function(r){return r.id===crid;});
    if(cr&&cr.permissions)return cr.permissions.includes(permission);
    return false;
  }
  // Perfil padrão
  var perms=DEFAULT_PERMISSIONS[CU.role]||DEFAULT_PERMISSIONS.membro;
  return perms.includes(permission);
}

// Painel de Iniciativas
function setFilter(el){
  document.querySelectorAll('.filter-chip').forEach(function(c){c.classList.remove('active');});
  el.classList.add('active');_filter=el.dataset.f;renderPipeline();
}
function toggleCompact(){
  _compact=!_compact;
  try{localStorage.setItem(LS.compact,_compact?'1':'0');}catch(e){}
  updateCompactBtn();renderPipeline();
}
function updateCompactBtn(){
  var btn=document.getElementById('compact-btn');if(!btn)return;
  btn.classList.toggle('active',_compact);
  var spans=btn.querySelectorAll('span');
  if(spans.length>0)spans[spans.length-1].textContent=_compact?'Detalhado':'Compacto';
}


var STATUS_ENTREGA=[
  {id:'iniciando',    label:'Iniciando',          color:'#1B4F8A', bg:'#EFF6FF'},
  {id:'em_execucao',  label:'Em execução',         color:'#1A7A4A', bg:'#E6F5EE'},
  {id:'aguardando',   label:'Aguardando stakeholder',  color:'#B07D1A', bg:'#FBF3E0'},
  {id:'revisao',      label:'Em revisão',          color:'#7C3AED', bg:'#F5F3FF'},
  {id:'concluido_ent',label:'Concluído',           color:'#047857', bg:'#D1FAE5'},
];

function getStatusExecuçãoLabel(id){
  var s=STATUS_ENTREGA.find(function(x){return x.id===id;});
  return s||STATUS_ENTREGA[0];
}

function salvarStatusExecução(clientId, statusId){
  var c=clients.find(function(x){return x.id===clientId;});
  if(!c)return;
  c.statusExecução=statusId;
  c.statusExecuçãoAt=new Date().toISOString();
  saveClientToFirestore(c);
  renderPipeline();
  // Alerta se aguardando stakeholder há mais de 3 dias
  if(statusId==='aguardando')toast('Status atualizado — lembre de fazer follow-up com o stakeholder','info',3000);
}

function renderPipeline(){
  var board=document.getElementById('board');if(!board)return;
  var myC=myClients();
  if(_filter!=='all')myC=myC.filter(function(c){return c.priority===_filter;});
  var total=myC.reduce(function(s,c){return s+(c.value||0);},0);
  var sub=document.getElementById('painel-de-iniciativas-subtitle');
  if(sub)sub.textContent='Total: '+money(total)+' · '+myC.length+' stakeholder'+(myC.length!==1?'s':'');
  board.innerHTML=STAGES.map(function(s){
    var colClients=myC.filter(function(c){return c.stage===s.id;});
    var colTotal=colClients.reduce(function(sum,c){return sum+(c.value||0);},0);
    var isDefaultCol=['prospecção','qualificacao','negociação','negociacao','execução','relacionamento'].indexOf(s.id)>=0;
    return '<div class="board-col">'+
      '<div class="col-header" style="background:'+s.bg+'" ondragover="_colDragId?colDragOver(event):void 0" ondrop="_colDragId?colDrop(event,\'pipe\',\''+s.id+'\'):void 0" ondragleave="colDragLeave(event)">'+
      '<div style="display:flex;align-items:center;gap:4px;width:100%;flex-wrap:nowrap;overflow:hidden">'+
      '<span style="cursor:grab;color:'+s.color+';opacity:.4;font-size:14px" draggable="true"'+
      ' ondragstart="colDragStart(event,\'pipe\',\''+s.id+'\')"'+
      ' title="Arrastar coluna">&#x22EE;</span>'+
      '<span style="font-size:12px;font-weight:800;color:'+s.color+';flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+san(s.label||s.name||s.id)+'</span>'+
      '<span class="col-count" style="background:'+s.color+'22;color:'+s.color+'">'+colClients.length+'</span>'+
      '<span style="font-size:11px;font-weight:600;color:'+s.color+';opacity:.8;margin-left:4px;white-space:nowrap">'+moneyShort(colTotal)+'</span>'+
      '<span style="flex:1"></span>'+
      '<button onclick="renamePipelineCol(\''+s.id+'\')" style="background:none;border:none;cursor:pointer;color:'+s.color+';opacity:.5;padding:1px 4px;font-size:10px">Editar</button>'+
      '<button onclick="deletePipelineCol(\''+s.id+'\')" style="background:none;border:none;cursor:pointer;color:var(--red);opacity:.5;padding:1px 4px;font-size:10px">✕</button>'+
      '</div></div>'+
      '<div class="col-body" id="col-'+s.id+'"'+
      ' ondragover="event.stopPropagation();event.preventDefault();this.classList.add(\'drag-over\')"'+
      ' ondragleave="this.classList.remove(\'drag-over\')"'+
      ' ondrop="dropCard(event,\''+s.id+'\')">' +
      colClients.map(function(c){return makeCard(c);}).join('')+
      (can('create_client')?'<button class="col-add" onclick="openClientModal(null,\''+s.id+'\')">\+ Adicionar</button>':'')+
      '</div></div>';
  }).join('')+
  '<div class="board-col" style="min-width:160px;max-width:160px;flex-shrink:0">'+
  '<button onclick="addPipelineCol()" style="width:100%;height:100%;min-height:120px;background:var(--bg);border:2px dashed var(--border);border-radius:var(--r2);color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:16px">'+
  '<span style="font-size:24px;opacity:.4">+</span><span>Nova coluna</span></button></div>';
  board.querySelectorAll('.kcard').forEach(function(card){
    var _wasDragged=false;
    card.addEventListener('dragstart',function(e){_dragId=card.dataset.id;_wasDragged=true;card.style.opacity='.35';e.dataTransfer.effectAllowed='move';});
    card.addEventListener('dragend',function(){card.style.opacity='';document.querySelectorAll('.col-body').forEach(function(c){c.classList.remove('drag-over');});setTimeout(function(){_wasDragged=false;},200);});
    card.addEventListener('dragover',function(e){e.stopPropagation();e.preventDefault();});
    card.addEventListener('drop',function(e){e.stopPropagation();var col=card.closest('.col-body');if(col){var stage=col.id.replace('col-','');dropCard(e,stage);}});
    card.addEventListener('click',function(e){if(_wasDragged)return;if(e.target.closest('.kcard-act-btn')||e.target.closest('[onclick*="abrirModalBudget"]'))return;openClientModal(card.dataset.id);});
  });
}

function makeCard(c){
  var p=PRIO[c.priority]||PRIO.baixa;
  var perf=PERFIS[c.perfil];
  var dias=diasSem(c.updatedAt||c.createdAt);
  var atrasado=dias>=7;
  var compact=_compact?' compact':'';
  return '<div class="kcard '+p.cls+compact+'" id="card-'+c.id+'" draggable="true" data-id="'+c.id+'">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:2px">'+
    '<div class="kcard-name">'+san(c.name)+'</div>'+
    '<span style="background:'+p.bg+';color:'+p.color+';font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;white-space:nowrap;flex-shrink:0">'+p.label+'</span>'+
    '</div>'+
    (c.company?'<div class="kcard-company">'+san(c.company)+'</div>':'')+
    '<div class="kcard-value">'+money(c.value)+'</div>'+
    // Badge de budget pendentes/atrasadas
    (function(){
      var fats=getBudget().filter(function(f){return f.stakeholderId===c.id&&f.status!=='cancelada';});
      if(fats.length===0)return'';
      var hoje=new Date();hoje.setHours(0,0,0,0);
      var atrasadas=fats.filter(function(f){return f.status!=='paga'&&f.vencimento&&new Date(f.vencimento+'T12:00')<hoje;});
      var pendentes=fats.filter(function(f){return f.status!=='paga'&&!atrasadas.includes(f);});
      var pagas=fats.filter(function(f){return f.status==='paga';});
      var badge='';
      if(atrasadas.length>0)badge='<span style="font-size:9px;font-weight:700;background:var(--red-lt);color:var(--red);border-radius:3px;padding:1px 6px;margin-bottom:4px;display:inline-block">⚠️ '+atrasadas.length+' budget'+(atrasadas.length>1?'s':'')+' atrasada'+(atrasadas.length>1?'s':'')+'</span><br>';
      else if(pendentes.length>0)badge='<span style="font-size:9px;font-weight:700;background:var(--blue-lt);color:var(--blue);border-radius:3px;padding:1px 6px;margin-bottom:4px;display:inline-block">💰 '+pendentes.length+' budget'+(pendentes.length>1?'s':'')+' pendente'+(pendentes.length>1?'s':'')+'</span><br>';
      else if(pagas.length>0&&pendentes.length===0&&atrasadas.length===0)badge='<span style="font-size:9px;font-weight:700;background:var(--green-lt);color:var(--green);border-radius:3px;padding:1px 6px;margin-bottom:4px;display:inline-block">✓ Pago</span><br>';
      return badge;
    })()+
    '<div class="kcard-meta">'+
    (perf?'<span onclick="event.stopPropagation();showPerfilStakeholderResultado(\''+c.perfil+'\',clients.find(function(x){return x.id===\''+c.id+'\';}))||true" title="'+({'Comandante':'Decide rápido, quer resultado. Vá direto ao ponto.','Catalisador':'🔥 Compra pelo entusiasmo. Mostre transformação antes do preço.','Conector':'🤝 Decide pela confiança. Invista na relação antes de vender.','Artesao':'Analítico, precisa de certeza. Dê dados e tempo para decidir.'}[c.perfil]||c.perfil)+'" style="background:'+perf.bg+';color:'+perf.color+';font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;cursor:pointer">'+perf.icon+' '+san(c.perfil)+'</span>':'')+
    '<span class="kcard-date" style="color:'+(atrasado?'var(--red)':'var(--muted2)')+'">'+dateStr(c.updatedAt||c.createdAt)+'</span>'+
    '</div>'+
    (atrasado&&!_compact?'<div style="font-size:10px;color:var(--amber);font-weight:600;margin-top:4px;background:var(--amber-lt);padding:4px 8px;border-radius:6px">'+dias+'d sem movimento</div>':'')+
    // Status de execução + marcos — só na coluna Execução
    (c.stage==='execução'&&!_compact?function(){
      var st=getStatusExecuçãoLabel(c.statusExecução||'iniciando');
      var diasAguard=c.statusExecução==='aguardando'&&c.statusExecuçãoAt?Math.floor((new Date()-new Date(c.statusExecuçãoAt))/86400000):0;
      var marcos=c.marcosExecução||[];
      var concluidos=marcos.filter(function(m){return m.concluido;}).length;
      var pct=marcos.length>0?Math.round(concluidos/marcos.length*100):0;

      return '<div style="margin-top:4px;border-top:1px solid var(--border);padding-top:4px">'+

        // Status pills
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">'+
        '<span style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Status:</span>'+
        STATUS_ENTREGA.map(function(s){
          var ativo=s.id===(c.statusExecução||'iniciando');
          return '<button onclick="event.stopPropagation();salvarStatusExecução(\''+c.id+'\',\''+s.id+'\')"'+
            ' title="'+san(s.label)+' aria-label="'+san(s.label)+'"'+
            ' style="padding:2px 6px;border-radius:10px;border:1.5px solid '+s.color+'44;background:'+(ativo?s.bg:'transparent')+';color:'+(ativo?s.color:'var(--muted2)')+';font-size:9px;font-weight:'+(ativo?'700':'400')+';cursor:pointer;font-family:var(--font);white-space:nowrap">'+san(s.label)+'</button>';
        }).join('')+
        '</div>'+

        // Marcos de execução
        (marcos.length>0?
          '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:4px 0 3px">Marcos '+concluidos+'/'+marcos.length+'</div>'+
          '<div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:6px">'+
            '<div style="width:'+pct+'%;height:100%;background:'+( pct===100?'var(--green)':'var(--blue)')+';border-radius:2px"></div>'+
          '</div>'+
          marcos.slice(0,3).map(function(m){
            return '<div onclick="event.stopPropagation();toggleMarcoExecução(\''+c.id+'\',\''+m.id+'\')"'+
              ' style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer">'+
              '<div style="width:14px;height:14px;border-radius:3px;border:1.5px solid '+(m.concluido?'var(--green)':'var(--border)')+';background:'+(m.concluido?'var(--green)':'transparent')+';flex-shrink:0;display:flex;align-items:center;justify-content:center">'+
              (m.concluido?'<svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>':'')+
              '</div>'+
              '<span style="font-size:11px;color:'+(m.concluido?'var(--muted)':'var(--text)')+';text-decoration:'+(m.concluido?'line-through':'none')+'">'+san(m.label.length>30?m.label.substring(0,28)+'...':m.label)+'</span>'+
            '</div>';
          }).join('')+
          (marcos.length>3?'<div style="font-size:10px;color:var(--muted);margin-top:2px">+'+(marcos.length-3)+' mais</div>':'')+
          '<button onclick="event.stopPropagation();abrirModalExecução(\''+c.id+'\')"'+
          ' aria-label="Editar marcos de execução" title="Editar marcos de execução"'+
          ' style="font-size:10px;color:var(--blue);background:none;border:none;cursor:pointer;padding:4px 0;font-family:var(--font)">Editar marcos →</button>'
        :
          '<button onclick="event.stopPropagation();abrirModalExecução(\''+c.id+'\')"'+
          ' aria-label="Definir marcos da execução" title="Definir marcos da execução"'+
          ' style="font-size:11px;color:var(--blue);background:var(--blue-lt);border:none;cursor:pointer;padding:4px 8px;border-radius:6px;font-family:var(--font);font-weight:600">+ Definir marcos da execução</button>'
        )+

        (diasAguard>=3?'<div style="font-size:10px;color:var(--amber);font-weight:600;margin-top:4px">Aguardando '+diasAguard+'d — hora do follow-up</div>':'')+
      '</div>';
    }():'')+
    '<div class="kcard-actions">'+
    '<button class="kcard-act-btn" onclick="event.stopPropagation();abrirModalBudget(\''+c.id+'\')" title="Gerar budget" style="color:var(--green);font-weight:700;font-size:10px">R$</button>'+
    '<button class="kcard-act-btn" onclick="event.stopPropagation();openClientModal(\''+c.id+'\')" title="Editar"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" stroke-width="1.2"/></svg></button>'+
    (c.company?'<button class="kcard-act-btn" onclick="event.stopPropagation();novoIniciativa(\''+c.id+'\')" title="Novo iniciativa" style="color:var(--blue);font-size:11px;font-weight:700">+</button>':'')+
    "<button class='kcard-act-btn' onclick='event.stopPropagation();openPerfilStakeholderModal(c.id)' title='Perfil'><svg width='12' height='12' viewBox='0 0 12 12' fill='none'><circle cx='6' cy='4' r='2' stroke='currentColor' stroke-width='1.2'/><path d='M2 10c0-2.2 1.8-4 4-4s4 1.8 4 4' stroke='currentColor' stroke-width='1.2' stroke-linecap='round'/></svg></button>"+
     (can('delete_client')?'<button class="kcard-act-btn" onclick="event.stopPropagation();confirmDeleteClient(\''+c.id+'\')" title="Excluir" style="color:var(--red)"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 3h9M4 3V2h4v1M2.5 3l.7 7.5h5.6L9.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>':'')+
    '</div>'+
    '<div style="display:flex;gap:6px;margin-top:6px">'+
    '<button class="kcard-move-mobile" style="flex:1" onclick="openMoveSheet(\''+c.id+'\')" >Mover etapa</button>'+
    '<button class="kcard-move-mobile" style="flex:1;color:var(--green);border-color:var(--green)" onclick="event.stopPropagation();abrirModalBudget(\''+c.id+'\')" >R$ Budget</button>'+
    '</div>'+
    '</div>';
}


var MARCOS_SUGERIDOS = [
  {id:'kickoff',    label:'Kickoff — alinhamento inicial',     icon:'1'},
  {id:'parcial',    label:'Execução parcial / meio do caminho', icon:'2'},
  {id:'revisao',    label:'Revisão com o stakeholder',             icon:'3'},
  {id:'final',      label:'Execução final / aprovação',         icon:'4'},
  {id:'pos',        label:'Pós-execução — feedback',            icon:'5'},
];

function abrirModalExecução(clientId){
  var c = clients.find(function(x){ return x.id === clientId; });
  if(!c) return;

  // Se já tem marcos definidos, não abre novamente automaticamente
  // (só abre ao clicar no botão "Ver marcos")
  var marcosExistentes = c.marcosExecução || [];

  var marcosHtml = MARCOS_SUGERIDOS.map(function(m){
    var checked = marcosExistentes.some(function(me){ return me.id === m.id; });
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:1.5px solid '+(checked?'var(--blue)':'var(--border)')+';background:'+(checked?'var(--blue-lt)':'var(--white)')+';cursor:pointer;margin-bottom:6px;transition:all .15s">'+
      '<input type="checkbox" value="'+m.id+'" '+(checked?'checked':'')+' style="width:16px;height:16px;accent-color:var(--blue);cursor:pointer">'+
      '<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--blue-lt);color:var(--blue);font-size:10px;font-weight:800;flex-shrink:0">'+m.icon+'</span>'+
      '<span style="font-size:13px;font-weight:500;color:var(--text)">'+san(m.label)+'</span>'+
    '</label>';
  }).join('');

  // Marcos customizados existentes
  var customMarcosHtml = marcosExistentes
    .filter(function(m){ return m.custom; })
    .map(function(m){
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
        '<input type="text" value="'+san(m.label)+'" class="input marco-custom-input" data-id="'+m.id+'" style="flex:1;font-size:13px">'+
        '<button onclick="this.parentNode.remove()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;padding:4px">✕</button>'+
      '</div>';
    }).join('');

  // Progresso atual se já tem marcos
  var concluidos = marcosExistentes.filter(function(m){ return m.concluido; }).length;
  var total = marcosExistentes.length;
  var pct = total > 0 ? Math.round(concluidos/total*100) : 0;

  var html = '<div class="overlay open" id="execução-modal">'+
    '<div class="modal" style="max-width:480px;display:flex;flex-direction:column;max-height:90vh">'+
      '<div class="modal-header" style="background:linear-gradient(135deg,#1A7A4A,#1B4F8A);padding:var(--sp4)">'+
        '<div>'+
          '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">Etapa de Execução</div>'+
          '<div style="font-size:16px;font-weight:800;color:#fff">'+san(c.name)+'</div>'+
          (c.company?'<div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:2px">'+san(c.company)+'</div>':'')+
        '</div>'+
        '<button onclick="document.getElementById(\'execução-modal\').remove()" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px">✕</button>'+
      '</div>'+

      // Progresso se já tem marcos
      (total > 0 ?
        '<div style="padding:12px 20px;background:var(--bg);border-bottom:1px solid var(--border)">'+
          '<div style="display:flex;justify-content:space-between;margin-bottom:6px">'+
            '<span style="font-size:12px;font-weight:600;color:var(--text)">Progresso da execução</span>'+
            '<span style="font-size:13px;font-weight:800;color:var(--green)">'+pct+'%</span>'+
          '</div>'+
          '<div style="height:6px;background:var(--border);border-radius:3px">'+
            '<div style="width:'+pct+'%;height:100%;background:var(--green);border-radius:3px;transition:width .4s"></div>'+
          '</div>'+
        '</div>' : '') +

      '<div style="flex:1;overflow-y:auto;padding:var(--sp4)">'+
        '<div style="font-size:12px;color:var(--muted);margin-bottom:var(--sp3);line-height:1.5">'+
          'Marque os marcos desta execução. Eles aparecem no card e no Dashboard.'+
        '</div>'+

        // Marcos sugeridos
        '<div id="marcos-sugeridos">'+marcosHtml+'</div>'+

        // Prazo
        '<div style="margin-top:var(--sp4)">'+
          '<label class="form-label">Prazo de execução</label>'+
          '<input type="date" class="input" id="execução-prazo" value="'+san(c.prazoExecução||'')+'">'+
        '</div>'+

        // Marcos customizados
        '<div style="margin-top:var(--sp4)">'+
          '<label class="form-label" style="margin-bottom:6px">Marcos personalizados</label>'+
          '<div id="marcos-custom-list">'+customMarcosHtml+'</div>'+
          '<button onclick="adicionarMarcoCustom()" class="btn btn-ghost btn-sm" style="margin-top:4px">+ Adicionar marco</button>'+
        '</div>'+

        // Nota
        '<div style="margin-top:var(--sp4)">'+
          '<label class="form-label">Nota interna</label>'+
          '<textarea class="input" id="execução-nota" placeholder="Contexto, combinados, riscos..." style="min-height:64px;resize:none">'+san(c.notaExecução||'')+'</textarea>'+
        '</div>'+
      '</div>'+

      '<div style="padding:var(--sp4);border-top:1px solid var(--border);display:flex;gap:var(--sp2)">'+
        '<button class="btn btn-ghost" onclick="document.getElementById(\'execução-modal\').remove()">Cancelar</button>'+
        '<button class="btn btn-primary" style="flex:1" data-cid="'+clientId+'" onclick="salvarMarcosExecução(this.dataset.cid)">Salvar marcos</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  var old = document.getElementById('execução-modal');
  if(old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function adicionarMarcoCustom(){
  var list = document.getElementById('marcos-custom-list');
  if(!list) return;
  var id = 'custom_' + Date.now();
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
  row.innerHTML =
    '<input type="text" class="input marco-custom-input" data-id="'+id+'" placeholder="Ex: Reunião de alinhamento, Teste..." style="flex:1;font-size:13px">'+
    '<button onclick="this.parentNode.remove()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;padding:4px">✕</button>';
  list.appendChild(row);
  row.querySelector('input').focus();
}

async function salvarMarcosExecução(clientId){
  var c = clients.find(function(x){ return x.id === clientId; });
  if(!c) return;

  // Ler checkboxes dos marcos sugeridos
  var marcosExistentes = c.marcosExecução || [];
  var checkboxes = document.querySelectorAll('#marcos-sugeridos input[type="checkbox"]');
  var marcos = [];

  checkboxes.forEach(function(cb){
    var sugerido = MARCOS_SUGERIDOS.find(function(m){ return m.id === cb.value; });
    if(cb.checked && sugerido){
      // Preservar estado concluído se já existia
      var existente = marcosExistentes.find(function(m){ return m.id === cb.value; });
      marcos.push({
        id: sugerido.id,
        label: sugerido.label,
        icon: sugerido.icon,
        concluido: existente ? existente.concluido : false,
        custom: false
      });
    }
  });

  // Ler marcos customizados
  var customInputs = document.querySelectorAll('.marco-custom-input');
  customInputs.forEach(function(inp){
    if(inp.value.trim()){
      var id = inp.dataset.id || ('custom_' + Date.now());
      var existente = marcosExistentes.find(function(m){ return m.id === id; });
      marcos.push({
        id: id,
        label: inp.value.trim(),
        icon: '',
        concluido: existente ? existente.concluido : false,
        custom: true
      });
    }
  });

  c.marcosExecução = marcos;
  c.prazoExecução = (document.getElementById('execução-prazo')||{}).value || '';
  c.notaExecução = (document.getElementById('execução-nota')||{}).value || '';
  c.updatedAt = new Date().toISOString();

  // Atualizar cache local
  var idx = clients.findIndex(function(x){ return x.id === clientId; });
  if(idx >= 0) clients[idx] = c;

  document.getElementById('execução-modal').remove();
  await saveClientToFirestore(c);
  renderPipeline();
  toast('Marcos salvos — '+ marcos.length + ' marco'+(marcos.length!==1?'s':'')+' definido'+(marcos.length!==1?'s':''), 'success');
}

function toggleMarcoExecução(clientId, marcoId){
  var c = clients.find(function(x){ return x.id === clientId; });
  if(!c || !c.marcosExecução) return;
  var marco = c.marcosExecução.find(function(m){ return m.id === marcoId; });
  if(!marco) return;
  marco.concluido = !marco.concluido;
  c.updatedAt = new Date().toISOString();
  // Atualizar cache local imediatamente
  var idx = clients.findIndex(function(x){ return x.id === clientId; });
  if(idx >= 0) clients[idx] = c;
  saveClientToFirestore(c);
  renderPipeline();
  // Calcular progresso
  var concluidos = c.marcosExecução.filter(function(m){ return m.concluido; }).length;
  var total = c.marcosExecução.length;
  if(concluidos === total && total > 0){
    toast('Execução concluída! Mova o stakeholder para Relacionamento.', 'success', 4000);
  }
}

async function dropCard(e,stageId){
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.col-body').forEach(function(c){c.classList.remove('drag-over');});
  if(!_dragId)return;
  var c=clients.find(function(x){return x.id===_dragId;});if(!c)return;
  var eraExecução = c.stage === 'execução';
  c.stage=stageId;c.updatedAt=new Date().toISOString();
  renderPipeline();await saveClientToFirestore(c);
  var cid = c.id; _dragId=null;
  // Abrir modal de marcos ao entrar na Execução pela primeira vez
  if(stageId==='execução' && !eraExecução){
    setTimeout(function(){ abrirModalExecução(cid); }, 400);
  }
}

function openMoveSheet(clientId){
  var c=clients.find(function(x){return x.id===clientId;});if(!c)return;
  var title=document.getElementById('move-sheet-title');if(title)title.textContent='Mover '+c.name+' para';
  var opts=document.getElementById('move-sheet-options');
  if(opts)opts.innerHTML=STAGES.map(function(s){
    return '<div class="move-sheet-option" onclick="moveClientTo(\''+clientId+'\',\''+s.id+'\')">'+
      '<div class="move-sheet-dot" style="background:'+s.color+'"></div>'+
      '<div style="font-size:13px;font-weight:600;color:var(--text)">'+san(s.name)+'</div>'+
      (c.stage===s.id?'<span style="margin-left:auto;font-size:11px;color:var(--muted)">Atual</span>':'')+
      '</div>';
  }).join('');
  document.getElementById('move-sheet').classList.add('open');
  document.getElementById('move-sheet-overlay').style.display='block';
}
async function moveClientTo(clientId,stageId){
  closeMoveSheet();
  var c=clients.find(function(x){return x.id===clientId;});if(!c)return;
  var eraExecução = c.stage === 'execução';
  c.stage=stageId;c.updatedAt=new Date().toISOString();
  renderPipeline();await saveClientToFirestore(c);
  if(stageId==='execução' && !eraExecução){
    setTimeout(function(){ abrirModalExecução(clientId); }, 400);
  }
}
function closeMoveSheet(){
  document.getElementById('move-sheet').classList.remove('open');
  document.getElementById('move-sheet-overlay').style.display='none';
}
async function confirmDeleteClient(id){
  if(!can('delete_client')){toast('Você não tem permissão para excluir stakeholders.','error');return;}
  var c=clients.find(function(x){return x.id===id;});
  if(!c||!confirm('Excluir '+c.name+'?'))return;
  clients=clients.filter(function(x){return x.id!==id;});
  renderPipeline();await deleteClientFromFirestore(id);
}

// Modal Stakeholder
var _editClientId=null;
function openClientModal(id,defaultStage){
  if(id&&!can('edit_client')){toast('Você não tem permissão para editar stakeholders.','error');return;}
  if(!id&&!can('create_client')){toast('Você não tem permissão para criar stakeholders.','error');return;}
  _editClientId=id||null;
  var c=id?clients.find(function(x){return x.id===id;}):null;
  var modal=document.getElementById('client-modal');if(!modal)return;
  var titleEl=modal.querySelector('.modal-title');if(titleEl)titleEl.textContent=c?'Editar stakeholder':'Novo stakeholder';
  var stageOpts=STAGES.map(function(s){return '<option value="'+s.id+'"'+((c?c.stage:(defaultStage||'prospecção'))===s.id?' selected':'')+'>'+s.name+'</option>';}).join('');
  var perfilOpts=[{v:'',l:'Selecionar perfil'},{v:'Comandante',l:'Comandante'},{v:'Catalisador',l:'Catalisador'},{v:'Conector',l:'Conector'},{v:'Artesao',l:'Artesao'}].map(function(p){return '<option value="'+p.v+'"'+(c&&c.perfil===p.v?' selected':'')+'>'+p.l+'</option>';}).join('');
  var prioOpts=[{v:'alta',l:'Alta'},{v:'media',l:'Media'},{v:'baixa',l:'Baixa'}].map(function(p){return '<option value="'+p.v+'"'+((c?c.priority:'media')===p.v?' selected':'')+'>'+p.l+'</option>';}).join('');
  var body=modal.querySelector('.modal-body');
  if(body)body.innerHTML=
    // Dica de múltiplos iniciativas (só ao editar stakeholder que tem organização)
    (c&&c.company?
      '<div style="background:var(--blue-lt);border-left:3px solid var(--blue);border-radius:var(--r1);padding:var(--sp2) var(--sp3);margin-bottom:var(--sp3);display:flex;align-items:center;justify-content:space-between;gap:var(--sp2)">'+
        '<span style="font-size:11px;color:var(--blue);font-weight:600">Novo iniciativa para '+san(c.company)+'?</span>'+
        '<button type="button" class="btn btn-ghost btn-sm" style="font-size:11px;white-space:nowrap" onclick="closeModal(\'client-modal\');novoIniciativa(\''+c.id+'\');">+ Novo iniciativa</button>'+
      '</div>':'')+
    '<div class="form-row"><div class="form-group"><label class="form-label">Nome do stakeholder ou contato *</label>'+
    '<input class="input" id="cm-name" value="'+san(c&&c.name||'')+'" placeholder="Ex: João Silva ou Clínica Odonto"></div>'+
    '<div class="form-group">'+
      '<label class="form-label" style="display:flex;align-items:center;gap:4px">Organização / organização'+
        '<span style="font-size:10px;color:var(--muted);font-weight:400"> — mesmo nome = mesmo stakeholder</span>'+
      '</label>'+
      '<input class="input" id="cm-company" value="'+san(c&&c.company||'')+'" placeholder="Ex: Grupo Vertriah">'+
      '<div style="font-size:10px;color:var(--muted2);margin-top:3px">Vários iniciativas na mesma organização? Use o mesmo nome aqui.</div>'+
    '</div></div>'+
    '<div class="form-row"><div class="form-group"><label class="form-label">Servico / iniciativa</label>'+
    '<input class="input" id="cm-service" value="'+san(c&&c.service||'')+'" placeholder="O que esta sendo oferecido"></div>'+
    '<div class="form-group"><label class="form-label">Valor (R$)</label>'+
    '<input class="input" id="cm-value" type="number" value="'+(c&&c.value||'')+'" placeholder="0"></div></div>'+
    '<div class="form-row"><div class="form-group"><label class="form-label">Etapa</label>'+
    '<select class="input" id="cm-stage" aria-label="Etapa do painel-de-iniciativas">'+stageOpts+'</select></div>'+
    '<div class="form-group"><label class="form-label">Prioridade</label>'+
    '<select class="input" id="cm-priority" aria-label="Prioridade">'+prioOpts+'</select></div></div>'+
    '<div class="form-group">'+
    '<label class="form-label">Perfil comportamental</label>'+
    '<div style="display:flex;gap:8px;align-items:center">'+
    '<select class="input" id="cm-perfil" aria-label="Perfil comportamental" style="flex:1">'+perfilOpts+'</select>'+
    '<button type="button" class="btn btn-ghost btn-sm" style="flex-shrink:0;white-space:nowrap" onclick="var id=_editClientId;if(id){closeModal(\'client-modal\');openPerfilStakeholderModal(id);}else{toast(\'Salve o stakeholder antes\',\'info\');}">'+(c&&c.perfil?'↺ Refazer':'Mapear')+'</button>'+
    '</div>'+
    (c&&c.perfil&&PERFIS_CLIENTE_INFO[c.perfil]?'<div style="margin-top:6px"><button type="button" class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--blue)" onclick="var id=_editClientId;closeModal(\'client-modal\');var cl=clients.find(function(x){return x.id===id;});if(cl)showPerfilStakeholderResultado(cl.perfil,cl);">Ver orientações de abordagem →</button></div>':'<div style="font-size:11px;color:var(--muted);margin-top:4px">Clique em Mapear para identificar o perfil comportamental</div>')+
    '</div>'+
    '<div class="form-group"><label class="form-label">Observacoes</label>'+
    '<textarea class="input" id="cm-notes" placeholder="Contexto, proximo passo...">'+san(c&&c.notes||'')+'</textarea></div>';
  openModal('client-modal');
  setTimeout(function(){
    var n=document.getElementById('cm-name');if(n)n.focus();
    var body=document.querySelector('#client-modal .modal-body');
    if(body)body.scrollTop=0;
  },100);
}

function novoIniciativa(stakeholderId){
  var c=clients.find(function(x){return x.id===stakeholderId;});
  if(!c)return;
  // Pré-preencher com dados do stakeholder original, limpando iniciativa específico
  _editClientId=null;
  var modal=document.getElementById('client-modal');if(!modal)return;
  var titleEl=modal.querySelector('.modal-title');
  if(titleEl)titleEl.textContent='Novo iniciativa — '+san(c.company||c.name);
  var stageOpts=STAGES.map(function(s){return'<option value="'+s.id+'"'+(s.id==='prospecção'?' selected':'')+'>'+s.name+'</option>';}).join('');
  var perfilOpts=[{v:'',l:'Selecionar perfil'},{v:'Comandante',l:'Comandante'},{v:'Catalisador',l:'Catalisador'},{v:'Conector',l:'Conector'},{v:'Artesao',l:'Artesao'}]
    .map(function(p){return'<option value="'+p.v+'"'+(c.perfil===p.v?' selected':'')+'>'+p.l+'</option>';}).join('');
  var prioOpts=[{v:'alta',l:'Alta'},{v:'media',l:'Media'},{v:'baixa',l:'Baixa'}]
    .map(function(p){return'<option value="'+p.v+'"'+(p.v==='media'?' selected':'')+'>'+p.l+'</option>';}).join('');
  var body=modal.querySelector('.modal-body');
  if(body)body.innerHTML=
    '<div style="background:var(--blue-lt);border-left:3px solid var(--blue);border-radius:var(--r1);padding:var(--sp2) var(--sp3);margin-bottom:var(--sp3)">'+
      '<div style="font-size:11px;color:var(--blue);font-weight:700">Novo iniciativa para '+san(c.company||c.name)+'</div>'+
      '<div style="font-size:10px;color:var(--muted);margin-top:2px">O stakeholder e organização já estão preenchidos. Preencha apenas o novo iniciativa.</div>'+
    '</div>'+
    '<div class="form-row"><div class="form-group"><label class="form-label">Nome do contato *</label>'+
    '<input class="input" id="cm-name" value="'+san(c.name)+'" placeholder="Nome completo"></div>'+
    '<div class="form-group"><label class="form-label">Organização</label>'+
    '<input class="input" id="cm-company" value="'+san(c.company||'')+'" readonly style="opacity:.7"></div></div>'+
    '<div class="form-row"><div class="form-group"><label class="form-label">Novo serviço / iniciativa *</label>'+
    '<input class="input" id="cm-service" placeholder="Ex: Consultoria financeira, Fase 2, Guarda-roupa"></div>'+
    '<div class="form-group"><label class="form-label">Valor (R$)</label>'+
    '<input class="input" id="cm-value" type="number" value="" placeholder="0"></div></div>'+
    '<div class="form-row"><div class="form-group"><label class="form-label">Etapa</label>'+
    '<select class="input" id="cm-stage" aria-label="Etapa do painel-de-iniciativas">'+stageOpts+'</select></div>'+
    '<div class="form-group"><label class="form-label">Prioridade</label>'+
    '<select class="input" id="cm-priority" aria-label="Prioridade">'+prioOpts+'</select></div></div>'+
    '<input type="hidden" id="cm-perfil" value="'+san(c.perfil||'')+'">'+
    '<div class="form-group"><label class="form-label">Observações</label>'+
    '<textarea class="input" id="cm-notes" placeholder="Contexto deste iniciativa..."></textarea></div>';
  openModal('client-modal');
  setTimeout(function(){var s=document.getElementById('cm-service');if(s)s.focus();},200);
}

async function saveClient(){
  var name=(document.getElementById('cm-name')&&document.getElementById('cm-name').value||'').trim();
  if(!name){toast('Informe o nome','error');return;}
  var id=_editClientId||('cl_'+Date.now());
  var existing=_editClientId?clients.find(function(x){return x.id===id;}):null;
  var coId=CU.companyId||'';
  var c={id:id,name:name,
    company:(document.getElementById('cm-company')&&document.getElementById('cm-company').value||'').trim(),
    service:(document.getElementById('cm-service')&&document.getElementById('cm-service').value||'').trim(),
    value:parseFloat(document.getElementById('cm-value')&&document.getElementById('cm-value').value)||0,
    stage:document.getElementById('cm-stage')&&document.getElementById('cm-stage').value||'prospecção',
    priority:document.getElementById('cm-priority')&&document.getElementById('cm-priority').value||'media',
    perfil:document.getElementById('cm-perfil')&&document.getElementById('cm-perfil').value||'',
    notes:(document.getElementById('cm-notes')&&document.getElementById('cm-notes').value||'').trim(),
    companyId:coId,userId:existing?existing.userId:CU.id,
    createdAt:existing?existing.createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()};
  if(_editClientId){var idx=clients.findIndex(function(x){return x.id===id;});if(idx>=0)clients[idx]=c;}
  else{clients.push(c);}
  closeModal('client-modal');renderPipeline();
  await saveClientToFirestore(c);
  toast(_editClientId?'Stakeholder atualizado':'Stakeholder adicionado','success');
}
// Stakeholders lista
function renderClients(){
  var tbody=document.getElementById('clients-tbody');if(!tbody)return;
  var q=(document.getElementById('clients-search')&&document.getElementById('clients-search').value||'').toLowerCase();
  var stageF=document.getElementById('clients-stage-filter')&&document.getElementById('clients-stage-filter').value||'';
  var perfilF=document.getElementById('clients-perfil-filter')&&document.getElementById('clients-perfil-filter').value||'';
  var stageFilter=document.getElementById('clients-stage-filter');
  if(stageFilter&&stageFilter.options.length===1){STAGES.forEach(function(s){var opt=document.createElement('option');opt.value=s.id;opt.textContent=s.name;stageFilter.appendChild(opt);});}
  var myC=myClients();
  if(q)myC=myC.filter(function(c){return(c.name||'').toLowerCase().includes(q)||(c.company||'').toLowerCase().includes(q)||(c.service||'').toLowerCase().includes(q);});
  if(stageF)myC=myC.filter(function(c){return c.stage===stageF;});
  if(perfilF)myC=myC.filter(function(c){return c.perfil===perfilF;});
  var totalStakeholders=myClients().length;
  var sub=document.getElementById('clients-subtitle');
  if(sub)sub.textContent=totalStakeholders+' stakeholder'+(totalStakeholders!==1?'s':'')+(myC.length!==totalStakeholders?' · '+myC.length+' filtrado'+(myC.length!==1?'s':''):'');

  // Resumo de perfis comportamentais no topo da tela Stakeholders
  var perfisCliEl=document.getElementById('clients-perfis-resumo');
  if(perfisCliEl){
    var pCounts={Comandante:0,Catalisador:0,Conector:0,Artesao:0};
    myClients().forEach(function(c){if(c.perfil&&pCounts[c.perfil]!==undefined)pCounts[c.perfil]++;});
    var PERFIL_TOOLTIP={
      Comandante:'Decide rápido, quer resultado e prazo. Vá direto ao ponto. Sinal de compra: pergunta preço e prazo.',
      Catalisador:'Compra pelo entusiasmo. Mostre a transformação antes do preço. Sinal: fala sobre implementação.',
      Conector:'Decide pela confiança. Invista na relação antes de vender. Sinal: conta histórias pessoais do área / organização.',
      Artesao:'Analítico, precisa de certeza. Dê dados e tempo. Sinal: pergunta sobre detalhes de implementação.'
    };
    var totalComPerfil=Object.values(pCounts).reduce(function(s,v){return s+v;},0);
    var semPerfil=myClients().filter(function(c){return!c.perfil;}).length;
    perfisCliEl.innerHTML=
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:var(--sp4)">'+
      Object.entries(pCounts).map(function(e){
        var p=PERFIS[e[0]];
        var pct=totalComPerfil>0?Math.round(e[1]/totalComPerfil*100):0;
        return '<div title="'+san(PERFIL_TOOLTIP[e[0]]||e[0])+'" style="background:var(--white);border:1px solid var(--border);border-radius:8px;padding:10px 8px;cursor:help;text-align:center;position:relative" class="perfil-resumo-card">'+
          '<div style="font-size:18px;font-weight:900;color:var(--navy)">'+e[1]+'</div>'+
          '<div style="font-size:10px;font-weight:700;color:var(--muted);margin-top:2px">'+(p&&p.icon||'')+' '+e[0]+'</div>'+
          (pct>0?'<div style="font-size:9px;color:var(--muted2)">'+pct+'%</div>':'')+
        '</div>';
      }).join('')+
      (semPerfil>0?
        '<div style="font-size:11px;color:var(--amber);font-weight:600;padding:8px;background:var(--amber-lt);border-radius:8px">'+semPerfil+' sem perfil mapeado</div>':'')+
      '</div>';
  }

  if(myC.length===0){tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">Nenhum stakeholder encontrado.</td></tr>';return;}
  tbody.innerHTML=myC.map(function(c){
    var s=STAGES.find(function(x){return x.id===c.stage;})||STAGES[0];
    var perf=PERFIS[c.perfil];
    var dias=diasSem(c.updatedAt||c.createdAt);
    return '<tr>'+
      '<td><div style="font-weight:700;color:var(--text)">'+san(c.name)+'</div><div style="font-size:11px;color:var(--muted)">'+san(c.company||'')+'</div></td>'+
      '<td><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:'+s.bg+';color:'+s.color+'">'+san(s.name)+'</span></td>'+
      '<td>'+(perf?'<span style="background:'+perf.bg+';color:'+perf.color+';font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px">'+perf.icon+' '+san(c.perfil)+'</span>':'<span style="color:var(--muted2);font-size:11px">Nao mapeado</span>')+'</td>'+
      '<td style="font-weight:700;color:var(--green)">'+money(c.value)+'</td>'+
      '<td style="color:'+(dias>=7?'var(--red)':'var(--muted)')+';font-size:11px">'+(dias===0?'Hoje':'Ha '+dias+'d')+'</td>'+
      '<td><div style="display:flex;gap:6px">'+
      '<button class="btn-icon btn-sm" onclick="openClientModal(\''+c.id+'\')" title="Editar"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" stroke-width="1.2"/></svg></button>'+
      '<button class="btn-icon btn-sm" onclick="openPerfilStakeholderModal(\''+c.id+'\')" title="Mapear perfil" style="color:var(--blue)"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="4" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M2 10c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>'+
      '<button class="btn-icon btn-sm" onclick="confirmDeleteClient(\''+c.id+'\')" title="Excluir" style="color:var(--red)"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 3h9M4 3V2h4v1M2.5 3l.7 7.5h5.6L9.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>'+
      '</div></td></tr>';
  }).join('');
}

// Home
function renderHome(){
  // Só redireciona se a view ativa for home — não interrompe outras telas
  var av=document.querySelector('.view.active');
  if(av&&av.id==='view-home'){navTo('dashboard');return;}
  if(!av||av.id!=='view-dashboard')return;
  var hora=new Date().getHours();
  var saudacao=hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
  var nome=((CU&&CU.name)||'').split(' ')[0];
  var g=document.getElementById('home-greeting'),n=document.getElementById('home-name'),d=document.getElementById('home-date');
  if(g)g.textContent=saudacao;
  if(n)n.textContent=nome+', seu negocio hoje';
  if(d)d.textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
  var myC=myClients();
  var parados=myC.filter(function(c){return diasSem(c.updatedAt||c.createdAt)>=7;});
  var altaPrio=myC.filter(function(c){return c.priority==='alta';});
  var emNegociação=myC.filter(function(c){return c.stage==='negociação';});
  var semPerfil=myC.filter(function(c){return!c.perfil;});
  var totalPipeline=myC.reduce(function(s,c){return s+(c.value||0);},0);

  // Dados financeiros de budget
  var todasFat=getBudget().filter(function(f){return f.companyId===(CU.companyId||'');});
  var hoje=new Date(); hoje.setHours(0,0,0,0);
  var mesAtual=hoje.getMonth(); var anoAtual=hoje.getFullYear();
  var fat30=todasFat.filter(function(f){
    if(f.status==='paga'||f.status==='cancelada')return false;
    if(!f.vencimento)return true;
    var v=new Date(f.vencimento+'T12:00');
    var diff=(v-hoje)/(1000*60*60*24);
    return diff<=30;
  });
  var fatAtrasadas=todasFat.filter(function(f){
    if(f.status==='paga'||f.status==='cancelada')return false;
    if(!f.vencimento)return false;
    return new Date(f.vencimento+'T12:00')<hoje;
  });
  var fatRecebidoMes=todasFat.filter(function(f){
    if(f.status!=='paga'||!f.pgtoEm)return false;
    var d=new Date(f.pgtoEm);
    return d.getMonth()===mesAtual&&d.getFullYear()===anoAtual;
  });
  var totalAReceber=fat30.reduce(function(s,f){return s+(f.valor||0);},0);
  var totalAtrasado=fatAtrasadas.reduce(function(s,f){return s+(f.valor||0);},0);
  var totalRecebidoMes=fatRecebidoMes.reduce(function(s,f){return s+(f.valor||0);},0);
  var fmtR=function(v){return'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});};
  var diag=getExecutivoDiag();
  var rotina=getRotina();
  var decisoes=rotina.filter(function(r){return r.col==='decidir';});
  var html='';

  // Bloco financeiro — aparece sempre
  html+='<div>'+
    '<div class="home-section-title">Visão financeira</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px">'+
      // A receber (próx 30 dias)
      '<div class="home-stat" onclick="navTo(\'budget\',null)" style="cursor:pointer;border-left:3px solid var(--blue)">'+
        '<div class="home-stat-label">A receber (30 dias)</div>'+
        '<div class="home-stat-value" style="font-size:18px;color:var(--blue)">'+fmtR(totalAReceber)+'</div>'+
        '<div class="home-stat-sub">'+fat30.length+' budget'+(fat30.length!==1?'s':'')+' pendente'+(fat30.length!==1?'s':'')+'</div>'+
      '</div>'+
      // Recebido este mês
      '<div class="home-stat" style="border-left:3px solid var(--green)">'+
        '<div class="home-stat-label">Recebido este mês</div>'+
        '<div class="home-stat-value" style="font-size:18px;color:var(--green)">'+fmtR(totalRecebidoMes)+'</div>'+
        '<div class="home-stat-sub">'+fatRecebidoMes.length+' pagamento'+(fatRecebidoMes.length!==1?'s':'')+'</div>'+
      '</div>'+
    '</div>'+
    // Atrasadas — só aparece se houver
    (fatAtrasadas.length>0?
      '<div style="background:var(--red-lt);border:1px solid var(--red);border-radius:var(--r2);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="navTo(\'budget\',null)">'+
        '<div>'+
          '<div style="font-size:12px;font-weight:700;color:var(--red)">⚠️ '+fatAtrasadas.length+' budget'+(fatAtrasadas.length!==1?'s':'')+' atrasada'+(fatAtrasadas.length!==1?'s':'')+'</div>'+
          '<div style="font-size:11px;color:var(--red);opacity:.8;margin-top:2px">'+fmtR(totalAtrasado)+' em aberto</div>'+
        '</div>'+
        '<div style="font-size:11px;font-weight:700;color:var(--red)">Ver →</div>'+
      '</div>'
    :
      (todasFat.length===0?
        '<div style="background:var(--bg2);border-radius:var(--r2);padding:12px 16px;text-align:center;cursor:pointer" onclick="navTo(\'clients\',document.querySelector(\'[data-view=painel-de-iniciativas]\'))">'+
          '<div style="font-size:12px;color:var(--muted)">Nenhuma budget gerada ainda.</div>'+
          '<div style="font-size:11px;color:var(--blue);margin-top:2px">Abra um stakeholder e gere sua primeira budget →</div>'+
        '</div>'
      :'')
    )+
  '</div>';

  var alerts=[];
  if(parados.length>0)alerts.push({icon:'⏸',bg:'var(--red-lt)',title:parados.length+' stakeholder'+(parados.length>1?'s':'')+' parado'+(parados.length>1?'s':'')+' ha mais de 7 dias',sub:parados.slice(0,2).map(function(c){return c.name;}).join(', ')+(parados.length>2?' e mais '+(parados.length-2):''),action:'painel-de-iniciativas'});
  if(altaPrio.length>0)alerts.push({icon:'⭐',bg:'var(--amber-lt)',title:altaPrio.length+' de alta prioridade',sub:altaPrio.slice(0,2).map(function(c){return c.name;}).join(', '),action:'painel-de-iniciativas'});
  if(decisoes.length>0)alerts.push({icon:'⟐',bg:'var(--ceo-lt)',title:decisoes.length+' decisao pendente'+(decisoes.length>1?'s':'')+' na Agenda CEO',sub:decisoes.slice(0,2).map(function(r){return r.titulo;}).join(', '),action:'ceo'});
  if(alerts.length>0){
    window._homeAlertActions=alerts.map(function(a){return a.action;});
    html+='<div><div class="home-section-title">Pede atencao agora</div><div class="home-alert">'+
    alerts.map(function(a,i){
      window['_ha'+i]=function(){var el=document.querySelector('.nav-item[data-view="'+(window._homeAlertActions[i]||'')+'"]');navTo(window._homeAlertActions[i]||'home',el);};
      return '<div class="home-alert-item" onclick="window._ha'+i+'&&window._ha'+i+'()">' +
        '<div class="home-alert-icon" style="background:'+a.bg+'">'+a.icon+'</div>'+
        '<div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--text)">'+a.title+'</div>'+
        '<div style="font-size:11px;color:var(--muted);margin-top:1px">'+san(a.sub)+'</div></div>'+
        '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round"/></svg></div>';
    }).join('')+
    '</div></div>';
  }
  html+='<div><div class="home-section-title">Visao geral</div><div class="home-stat-grid">'+
    '<div class="home-stat" onclick="navTo(\'painel-de-iniciativas\',document.querySelector(\'.nav-item[data-view=\\\"painel-de-iniciativas\\\"]\'))">'+
    '<div class="home-stat-label" style="color:var(--blue)">Painel de Iniciativas total</div>'+
    '<div class="home-stat-value">'+moneyShort(totalPipeline)+'</div>'+
    '<div class="home-stat-sub">'+myC.length+' stakeholders ativos</div></div>'+
    '<div class="home-stat" onclick="navTo(\'painel-de-iniciativas\',document.querySelector(\'.nav-item[data-view=\\\"painel-de-iniciativas\\\"]\'))" style="cursor:pointer">'+
    '<div class="home-stat-label" style="color:var(--amber)">Em negociação</div>'+
    '<div class="home-stat-value" style="color:var(--amber)">'+emNegociação.length+'</div>'+
    '<div class="home-stat-sub">aguardando decisao</div></div>'+
    '</div></div>';
  var passos=gerarPassos(myC,diag,rotina,semPerfil,emNegociação);window._homePassos=passos;
  if(passos.length>0){
    html+='<div><div class="home-section-title">Proximos passos</div>'+
    passos.slice(0,3).map(function(p,i){return'<div class="home-next-step" data-idx="'+i+'" onclick="homePassoClick(this)">'+
      '<div class="home-next-icon">'+p.icon+'</div>'+
      '<div style="flex:1"><div class="home-next-title">'+san(p.titulo)+'</div>'+
      '<div class="home-next-desc">'+san(p.desc)+'</div></div>'+
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="rgba(255,255,255,.5)" stroke-width="1.5" stroke-linecap="round"/></svg></div>';}).join('')+
    '</div>';
  }
  var diasDiag=diag?diasSem(diag.data):null;
  var _perfilIcon={Comandante:'⚡',Catalisador:'🔥',Conector:'🤝',Artesao:'🎯'};
  html+='<div><div class="home-section-title">Momento Estratégico</div>'+
    '<div style="background:var(--white);border:1.5px solid var(--ceo);border-radius:var(--r2);overflow:hidden">'+
    '<div style="background:var(--ceo-grad);padding:14px 16px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="navTo(\'ceo\',document.querySelector(\'.nav-item[data-view=\\\"ceo\\\"]\'));setTimeout(function(){switchCeoTab(\'momento\');},200)">'+
    '<div style="width:38px;height:38px;border-radius:8px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:20px">'+
    (diag?(_perfilIcon[diag.perfil]||'⟐'):'⟐')+'</div>'+
    '<div style="flex:1">'+
    '<div style="font-size:13px;font-weight:800;color:#fff">'+(diag?diag.perfil+' '+(diag.perfilSecundario?'· '+diag.perfilSecundario:''):'Momento Estratégico')+'</div>'+
    '<div style="font-size:10px;color:rgba(255,255,255,.7);margin-top:2px">'+(diag?'Perfil do Executivo mapeado':'Diagnostico nao feito ainda')+'</div></div>'+
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="rgba(255,255,255,.6)" stroke-width="1.5" stroke-linecap="round"/></svg></div>'+
    '<div style="padding:12px 16px">'+
    (diag?
      '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">'+(diasDiag>=30?'Ultima sessao ha '+diasDiag+' dias. Hora de uma nova reflexao.':'Proximo Momento Estratégico em '+(30-diasDiag)+' dias.')+'</div>'+
      '<div style="display:flex;gap:8px">'+
      '<button class="btn btn-ceo btn-sm" style="flex:1" onclick="openMomentoCEO()">⟐ Iniciar sessao</button>'+
      '<button class="btn btn-ghost btn-sm" onclick="openDiagExecutivo()">Rediagnosticar</button>'+
      '</div>'
    :
      '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">O diagnostico revela como voce decide, executa e reage sob pressao. Personaliza todas as recomendacoes.</div>'+
      '<button class="btn btn-ceo btn-sm" style="width:100%" onclick="openDiagExecutivo()">Fazer Diagnostico do Executivo</button>'
    )+
    '</div></div></div>';
  var hc=document.getElementById('home-content');if(hc)hc.innerHTML=html;
}

function homeAlertClick(el){
  var i = parseInt(el.getAttribute('data-i')||'0');
  var actions = window._homeAlertActions || [];
  var view = actions[i];
  if(!view) return;
  var navEl = document.querySelector('.nav-item[data-view="'+view+'"]');
  navTo(view, navEl);
}

function homePassoClick(el){
  var i = parseInt(el.getAttribute('data-idx')||'0');
  if(window._homePassos && window._homePassos[i] && window._homePassos[i].fn){
    window._homePassos[i].fn();
  }
}

function gerarPassos(myC,diag,rotina,semPerfil,emNegociação){
  var passos=[];
  var perfil=diag&&diag.perfil||'';

  // Sem stakeholders - igual para todos
  if(myC.length===0)passos.push({icon:'👤',titulo:'Cadastre seu primeiro stakeholder',desc:'Comece mapeando quem esta no seu painel-de-iniciativas agora',fn:function(){openClientModal();}});

  // Sem diagnostico - prioridade maxima
  if(!diag)passos.push({icon:'⟐',titulo:'Fazer o Diagnostico do Executivo',desc:'12 perguntas que personalizam todas as recomendacoes do GPS para o seu perfil de gestor',fn:function(){openDiagExecutivo();}});

  // Perfil de stakeholder sem mapeamento - texto varia por perfil do dono
  if(semPerfil&&semPerfil.length>0){
    var _id=semPerfil[0].id;
    var descPerfil=perfil==='Artesao'?'Voce tende a querer entender o stakeholder a fundo antes de propor. Comece pelo mapeamento.':
                   perfil==='Conector'?'Voce ja construiu relacao com '+semPerfil[0].name+'. Mapear o perfil vai fortalecer ainda mais a abordagem.':
                   perfil==='Catalisador'?'Antes de apresentar sua visao, entenda o perfil de '+semPerfil[0].name+'.':
                   'Mapear o perfil de '+semPerfil[0].name+' vai definir a abordagem mais direta.';
    passos.push({icon:'🎯',titulo:'Mapear perfil de '+semPerfil[0].name,desc:descPerfil,fn:function(){openPerfilStakeholderModal(_id);}});
  }

  // Follow-up em negociação - texto varia por perfil
  if(emNegociação&&emNegociação.length>0){
    var dias=diasSem(emNegociação[0].updatedAt||emNegociação[0].createdAt);
    if(dias>=3){
      var descFollowup=perfil==='Comandante'?'Negociação ha '+dias+' dias. Ligue, va direto ao ponto e proponha um proximo passo concreto.':
                       perfil==='Artesao'?'Negociação ha '+dias+' dias. Pergunte se surgiu alguma duvida tecnica. O Artesao precisa de certeza antes de decidir.':
                       perfil==='Conector'?'Negociação ha '+dias+' dias. Retome o contato perguntando como o stakeholder esta, nao sobre a negociação.':
                       'Negociação ha '+dias+' dias. Reacenda o entusiasmo com uma nova possibilidade ou resultado de outro stakeholder.';
      var _cli=emNegociação[0];
      passos.push({icon:'📞',titulo:'Follow-up com '+_cli.name,desc:descFollowup,fn:function(){navTo('painel-de-iniciativas',document.querySelector('.nav-item[data-view="painel-de-iniciativas"]'));}});
    }
  }

  // Decisoes pendentes na Agenda Executiva CEO
  var decisoes=agenda-executiva?rotina.filter(function(r){return r.col==='decidir';}):[];
  if(decisoes.length>0){
    var descDecisao=perfil==='Artesao'?'Decisao pendente. Voce pode estar esperando mais dados. Defina um prazo para decidir hoje.':
                    perfil==='Conector'?'Decisao pendente. Verifique se precisa ouvir alguem antes de decidir ou se ja tem o que precisa.':
                    'Decisao pendente na Agenda CEO: '+decisoes[0].titulo;
    passos.push({icon:'⚡',titulo:'Decidir: '+decisoes[0].titulo,desc:descDecisao,fn:function(){navTo('ceo',document.querySelector('.nav-item[data-view="ceo"]'));}});
  }

  return passos;
}

// Dashboard
function renderDashboard(){
  var myC=myClients();
  var total=myC.reduce(function(s,c){return s+(c.value||0);},0);
  var sub=document.getElementById('dash-subtitle');if(sub)sub.textContent=myC.length+' stakeholders · Gestao Rota Executiva';
  var statsEl=document.getElementById('dash-stats');
  if(statsEl)statsEl.innerHTML=
    '<div class="dash-stat"><div class="dash-stat-label">Painel de Iniciativas total</div><div class="dash-stat-value">'+moneyShort(total)+'</div><div class="dash-stat-delta">'+myC.length+' stakeholders ativos</div></div>'+
    '<div class="dash-stat"><div class="dash-stat-label">Em negociação</div><div class="dash-stat-value" style="color:var(--amber)">'+myC.filter(function(c){return c.stage==='negociação';}).length+'</div><div class="dash-stat-delta">aguardando decisao</div></div>'+
    '<div class="dash-stat"><div class="dash-stat-label">Parados +7d</div><div class="dash-stat-value" style="color:var(--red)">'+myC.filter(function(c){return diasSem(c.updatedAt||c.createdAt)>=7;}).length+'</div><div class="dash-stat-delta">precisam de atencao</div></div>';
  var funnelEl=document.getElementById('dash-funnel');
  if(funnelEl){
    var maxC=Math.max.apply(Math,[1].concat(STAGES.map(function(s){return myC.filter(function(c){return c.stage===s.id;}).length;})));
    funnelEl.innerHTML='<div class="dash-section-title">Funil por etapa</div>'+STAGES.map(function(s){
      var count=myC.filter(function(c){return c.stage===s.id;}).length;
      var val=myC.filter(function(c){return c.stage===s.id;}).reduce(function(sum,c){return sum+(c.value||0);},0);
      var pct=Math.round(count/maxC*100);
      return '<div class="funnel-row"><div class="funnel-label">'+san(s.name)+'</div>'+
        '<div class="funnel-bar-wrap"><div class="funnel-bar" style="width:'+pct+'%;background:'+s.color+'"></div></div>'+
        '<div class="funnel-count">'+count+'</div><div class="funnel-value">'+moneyShort(val)+'</div></div>';
    }).join('');
  }
  // Perfis removidos do Dashboard — estão na aba Stakeholders
  var perfisEl=document.getElementById('dash-perfis');
  if(perfisEl)perfisEl.innerHTML='';
  // Execuçãos em andamento
  var execuçãosEl=document.getElementById('dash-execuçãos');
  if(execuçãosEl){
    var emExecução=myC.filter(function(c){return c.stage==='execução';});
    if(emExecução.length>0){
      execuçãosEl.innerHTML=
        '<div class="dash-section-title">Execuçãos em andamento</div>'+
        '<div style="display:flex;flex-direction:column;gap:6px">'+
        emExecução.map(function(c){
          var st=getStatusExecuçãoLabel(c.statusExecução||'iniciando');
          var diasAguard=c.statusExecução==='aguardando'&&c.statusExecuçãoAt?Math.floor((new Date()-new Date(c.statusExecuçãoAt))/86400000):0;
          var alerta=c.statusExecução==='aguardando'&&diasAguard>=3;
          return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--white);border:1px solid var(--border);border-radius:8px;border-left:3px solid '+st.color+'"'+
            (alerta?' style="border-left-color:var(--amber)"':'')+'>'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+san(c.name)+'</div>'+
              (c.company?'<div style="font-size:10px;color:var(--muted)">'+san(c.company)+'</div>':'')+
            '</div>'+
            '<span style="font-size:10px;font-weight:700;color:'+st.color+';background:'+st.bg+';padding:2px 7px;border-radius:10px;white-space:nowrap;flex-shrink:0">'+san(st.label)+'</span>'+
            (alerta?'<span style="font-size:10px;color:var(--amber);font-weight:700;flex-shrink:0">'+diasAguard+'d</span>':'')+
          '</div>';
        }).join('')+
        '</div>';
    } else {
      execuçãosEl.innerHTML='';
    }
  }

  var recentEl=document.getElementById('dash-recent');
  if(recentEl){
    var sorted=[].concat(myC).sort(function(a,b){return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0);}).slice(0,8);
    recentEl.innerHTML='<div class="dash-section-title">Stakeholders recentes</div><div style="overflow-x:auto">'+
      '<table class="recent-table"><thead><tr><th>Stakeholder</th><th>Etapa</th><th>Valor</th><th>Atualizacao</th></tr></thead>'+
      '<tbody>'+sorted.map(function(c){
        var s=STAGES.find(function(x){return x.id===c.stage;})||STAGES[0];
        var dias=diasSem(c.updatedAt||c.createdAt);
        return '<tr>'+
          '<td><div style="font-weight:700">'+san(c.name)+'</div><div style="font-size:11px;color:var(--muted)">'+san(c.company||'')+'</div></td>'+
          '<td><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:'+s.bg+';color:'+s.color+'">'+san(s.name)+'</span></td>'+
          '<td style="font-weight:700;color:var(--green)">'+moneyShort(c.value)+'</td>'+
          '<td style="color:'+(dias>=7?'var(--red)':'var(--muted)')+'">'+(dias===0?'Hoje':'Ha '+dias+'d')+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }
  renderVisaoFinanceira();
}

// Rota Executiva
var DECIFRE_ETAPAS_V2=[
  {letra:'D',nome:'Despertar', cor:'#7C3AED',bg:'#F5F3FF'},
  {letra:'E',nome:'Estruturar',cor:'#1B4F8A',bg:'#E8EFF8'},
  {letra:'C',nome:'Conectar',  cor:'#1A7A4A',bg:'#E6F5EE'},
  {letra:'I',nome:'Integrar',  cor:'#B85515',bg:'#FDF0E6'},
  {letra:'F',nome:'Fortalecer',cor:'#C9952A',bg:'#FBF3E0'},
  {letra:'R',nome:'Reunir',    cor:'#C0392B',bg:'#FDECEA'},
  {letra:'E',nome:'Evoluir',   cor:'#0B7285',bg:'#E3F9F5'},
];
var INSIGHTS_V2=[
  {etapa:'D-espertar',texto:'O principal ponto cego do gestor nao e o que ele nao sabe. E o que ele acha que sabe e esta errado.'},
  {etapa:'E-struturar',texto:'Crescer sem estrutura e empurrar agua para cima. A velocidade aumenta, o desperdicio tambem.'},
  {etapa:'C-onectar',texto:'O stakeholder nao compra o que voce vende. Ele compra o que sente quando imagina ter o resultado.'},
  {etapa:'I-ntegrar',texto:'Um negocio bem integrado nao depende da memoria de ninguem. Ele tem processo.'},
  {etapa:'F-ortalecer',texto:'Fidelidade nao se compra com desconto. Se constroi com execução consistente.'},
  {etapa:'R-eunir',texto:'Dados sem decisao sao arquivamento. Decisao sem dados e aposta.'},
  {etapa:'E-voluir',texto:'O negocio que para de aprender comeca a morrer. As vezes devagar, as vezes rapido.'},
];

function getDiagResult(){try{return JSON.parse(localStorage.getItem('gps_v2_diag_'+(CU&&CU.id||''))||'null');}catch(e){return null;}}

function renderDecifre(){
  var myC=myClients();
  // KPIs movidos para Dashboard
  var etapasEl=document.getElementById('decifre-etapas');
  if(etapasEl){
    var diagResult=getDiagResult();
    var focoNome=diagResult&&diagResult.foco&&diagResult.foco.nome;
    etapasEl.innerHTML=DECIFRE_ETAPAS_V2.map(function(e){
      var isFoco=focoNome===e.nome;
      return '<div class="decifre-etapa'+(isFoco?' foco':'')+'" style="background:'+(isFoco?e.bg:'var(--white)')+'">' +
        '<div class="decifre-etapa-letra" style="color:'+e.cor+'">'+e.letra+'</div>'+
        '<div class="decifre-etapa-nome">'+e.nome+'</div>'+(isFoco?'<div style="font-size:9px;color:'+e.cor+';font-weight:700;margin-top:3px">Foco</div>':'')+
        '</div>';
    }).join('');
  }
  // Radar movido para Dashboard

  // Perfis movidos para Dashboard

  var insightEl=document.getElementById('decifre-insight');
  if(insightEl){
    var ins=INSIGHTS_V2[new Date().getDate()%INSIGHTS_V2.length];
    insightEl.innerHTML='<div class="insight-card"><div class="insight-label">'+ins.etapa+' · Metodo Rota Executiva</div><div class="insight-text">"'+ins.texto+'"</div><div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:var(--sp3);text-transform:uppercase;letter-spacing:.06em">GPS da Gestao · by Grupo Vertriah</div></div>';
  }
  var ceoEl=document.getElementById('decifre-momento-ceo');
  if(ceoEl){
    var diag=getExecutivoDiag();
    ceoEl.innerHTML='<div style="border:1.5px solid var(--ceo);border-radius:var(--r2);overflow:hidden">'+
      '<div style="background:var(--ceo-grad);padding:var(--sp4) var(--sp5);display:flex;align-items:center;gap:10px">'+
      '<div style="font-size:20px">⟐</div><div style="flex:1"><div style="font-size:12px;font-weight:800;color:#fff">Momento Estratégico · I-ntegrar</div>'+
      '<div style="font-size:10px;color:rgba(255,255,255,.6)">'+(diag?'Perfil '+diag.perfil:'Diagnostico nao feito')+'</div></div></div>'+
      '<div style="background:var(--white);padding:var(--sp4) var(--sp5);display:flex;gap:var(--sp2)">'+
      '<button class="btn btn-ceo btn-sm" onclick="'+(diag?'openMomentoCEO()':'openDiagExecutivo()')+'">'+(diag?'⟐ Iniciar sessao':'Fazer diagnostico')+'</button>'+
      (diag?'<button class="btn btn-ghost btn-sm" onclick="openDiagExecutivo()">Rediagnosticar</button>':'')+
      '</div></div>';
  }
}

// Diagnostico Rota Executiva (7 perguntas)
var DIAG_PERGUNTAS_V2=[
  {q:'Voce tem clareza sobre qual e o problema central que o seu negocio resolve hoje?',opts:[{t:'Sim, com clareza',v:3},{t:'Parcialmente',v:2},{t:'Nem sempre',v:1},{t:'Nao tenho clareza',v:0}],etapa:'D'},
  {q:'Seus processos comerciais estao documentados e sao seguidos pela equipe?',opts:[{t:'Sim, estruturados',v:3},{t:'Parcialmente',v:2},{t:'Estao na minha cabeca',v:1},{t:'Nao existem',v:0}],etapa:'E'},
  {q:'Voce mapeia o perfil comportamental dos seus stakeholders antes de fazer uma negociação?',opts:[{t:'Sempre',v:3},{t:'As vezes',v:2},{t:'Raramente',v:1},{t:'Nunca',v:0}],etapa:'C'},
  {q:'O processo de execução do seu servico esta integrado com a promessa da venda?',opts:[{t:'Totalmente integrado',v:3},{t:'Parcialmente',v:2},{t:'Ha gaps',v:1},{t:'Nao esta integrado',v:0}],etapa:'I'},
  {q:'Voce tem rituais ativos de relacionamento com stakeholders no relacionamento?',opts:[{t:'Sim, estruturados',v:3},{t:'As vezes',v:2},{t:'Raramente',v:1},{t:'Nao tenho',v:0}],etapa:'F'},
  {q:'Voce toma decisoes baseadas em dados semanais do seu negocio?',opts:[{t:'Sempre, tenho indicadores',v:3},{t:'As vezes',v:2},{t:'Raramente',v:1},{t:'Decido na intuicao',v:0}],etapa:'R'},
  {q:'O seu negocio tem um planejamento claro de evolucao para os proximos 12 meses?',opts:[{t:'Sim, claro e em execucao',v:3},{t:'Existe mas e vago',v:2},{t:'Estamos sobrevivendo',v:1},{t:'Nao temos',v:0}],etapa:'E2'},
];
var _diagStep=0,_diagRespostas={};

function initDiag(){_diagStep=0;_diagRespostas={};renderDiagStep();}
function renderDiagStep(){
  var total=DIAG_PERGUNTAS_V2.length;
  var pct=Math.round(_diagStep/total*100);
  var bar=document.getElementById('diag-prog-bar');if(bar)bar.style.width=pct+'%';
  var titleEl=document.getElementById('diag-modal-title');
  if(titleEl)titleEl.textContent='Diagnostico · '+(_diagStep<DECIFRE_ETAPAS_V2.length?DECIFRE_ETAPAS_V2[_diagStep].nome:'');
  var back=document.getElementById('diag-btn-back');if(back)back.style.display=_diagStep>0?'':'none';
  var next=document.getElementById('diag-btn-next');if(next)next.textContent=_diagStep===total-1?'Ver resultado →':'Proxima →';
  var q=DIAG_PERGUNTAS_V2[_diagStep];
  var body=document.getElementById('diag-modal-body');
  if(body)body.innerHTML=
    '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px">Pergunta '+(_diagStep+1)+' de '+total+'</div>'+
    '<div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.5;margin-bottom:20px">'+san(q.q)+'</div>'+
    '<div style="display:flex;flex-direction:column;gap:10px">'+
    q.opts.map(function(o,i){
      var sel=_diagRespostas[_diagStep]===i;
      return '<button onclick="selecionarDiag('+i+')" style="text-align:left;padding:12px 16px;border-radius:var(--r2);border:1.5px solid '+(sel?'var(--blue)':'var(--border)')+';background:'+(sel?'var(--blue-lt)':'var(--white)')+';cursor:pointer;font-family:var(--font);font-size:13px;color:var(--text);font-weight:'+(sel?'600':'400')+';transition:all .13s">'+
        '<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:'+(sel?'var(--blue)':'var(--border)')+';color:'+(sel?'#fff':'var(--muted)')+';font-size:11px;font-weight:700;margin-right:10px;flex-shrink:0">'+(sel?'✓':String.fromCharCode(65+i))+'</span>'+
        san(o.t)+'</button>';
    }).join('')+
    '<div class="ceo-col" style="min-width:160px;border:2px dashed var(--border);border-radius:var(--r2);display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent" onclick="addRotinaColExtra()">'+
      '<div style="text-align:center;color:var(--muted);font-size:13px">+ Nova coluna</div>'+
    '</div>'+
  '</div>';
}
function selecionarDiag(idx){_diagRespostas[_diagStep]=idx;renderDiagStep();}
function diagBack(){if(_diagStep>0){_diagStep--;renderDiagStep();}}
function diagNext(){
  if(_diagRespostas[_diagStep]===undefined){toast('Selecione uma opcao','error');return;}
  if(_diagStep<DIAG_PERGUNTAS_V2.length-1){_diagStep++;renderDiagStep();}
  else calcDiagResult();
}
function calcDiagResult(){
  var etapaMap={D:0,E:0,C:0,I:0,F:0,R:0};
  Object.keys(_diagRespostas).forEach(function(step){
    var q=DIAG_PERGUNTAS_V2[step];
    var val=q.opts[_diagRespostas[step]].v;
    var key=q.etapa==='E2'?'E':q.etapa;
    etapaMap[key]=(etapaMap[key]||0)+val;
  });
  var scored=Object.entries(etapaMap).map(function(e){return{k:e[0],v:e[1]};}).sort(function(a,b){return a.v-b.v;});
  var focoLetra=scored[0].k;
  var focoEtapa=DECIFRE_ETAPAS_V2.find(function(e){return e.letra===focoLetra;});
  var result={scores:etapaMap,foco:focoEtapa,data:new Date().toISOString()};
  localStorage.setItem('gps_v2_diag_'+(CU&&CU.id||''),JSON.stringify(result));
  closeModal('diag-modal');toast('Diagnostico concluido!','success');renderDecifre();
}
// Agenda CEO - dados
var CEO_ROT_KEY='gps_v2_rotina_',CEO_PROJ_KEY='gps_v2_projetos_',CEO_DIAG_KEY='gps_v2_dono_diag_',CEO_SESS_KEY='gps_v2_ceo_sess_';

// ── CEO Data: Firestore com fallback localStorage ──
var _ceoCache={rotina:null,iniciativas:null,diag:null,matriz:null,sessoes:null,estrategia:null};

async function loadCeoData(){
  if(!CU)return;
  var fb=window._fb;
  try{
    var docRef=fb.doc(fb.db,'ceo_data',CU.companyId||CU.id);
    var snap=await fb.getDoc(docRef);
    var d=snap.data();
    if(d){
      _ceoCache.rotina=d.rotina||[];
      _ceoCache.iniciativas=d.iniciativas||[];
      _ceoCache.diag=d.diag||null;
      _ceoCache.matriz=d.matriz||[];
      _ceoCache.sessoes=d.sessoes||[];
      _ceoCache.estrategia=d.estrategia||null;
      if(d.budget!==undefined){_budgetCache=d.budget||[];}
    }
  }catch(e){console.warn('loadCeoData:',e.message);}
}

function _saveCeoField(field,value){
  _ceoCache[field]=value;
  // Salvar localStorage como backup imediato
  try{localStorage.setItem('gps_v2_ceo_'+field+'_'+(CU&&CU.id||''),JSON.stringify(value));}catch(e){}
  // Salvar Firestore em background
  if(CU&&window._fb){
    var fb=window._fb;
    var update={};update[field]=_cleanUndef(value);update._updatedAt=new Date().toISOString();
    fb.setDoc(fb.doc(fb.db,'ceo_data',CU.companyId||CU.id),update,{merge:true}).catch(function(e){console.warn('saveCeo:',e.message);});
  }
}

function getRotina(){
  if(_ceoCache.rotina!==null)return _ceoCache.rotina;
  // cache ainda não carregou — dispara load em background
  if(CU&&window._fb)loadCeoData();
  return [];
}
function saveRotina(d){_saveCeoField('agenda-executiva',d);setTimeout(atualizarBadgeRotina,200);}
function getIniciativas(){
  if(_ceoCache.iniciativas!==null)return _ceoCache.iniciativas;
  return [];
}
function saveIniciativas(d){_saveCeoField('iniciativas',d);}
function getExecutivoDiag(){
  if(_ceoCache.diag!==null)return _ceoCache.diag;
  return null;
}
function saveExecutivoDiag(d){_saveCeoField('diag',d);}

var _ceoTab='matriz';

// ── Agenda CEO — sequências por estado mental ─────────
var CEO_TABS_CONFIG = {
  rotina:    {label:'Agenda Executiva',      id:'agenda-executiva'},
  iniciativas:  {label:'Iniciativas',    id:'iniciativas'},
  matriz:    {label:'Matriz',      id:'matriz'},
  estrategia:{label:'Estratégia',id:'estrategia'},
  momento:   {label:'Momento Estratégico', id:'momento'},
};

var CEO_SEQUENCIAS = {
  demanda:  {tabs:['agenda-executiva','matriz','iniciativas','estrategia','momento'], inicio:'agenda-executiva',
             msg:'Ótimo. Vamos começar pela Agenda Executiva — o que precisa acontecer agora.'},
  pensar:   {tabs:['momento','estrategia','iniciativas','matriz','agenda-executiva'], inicio:'momento',
             msg:'Perfeito. Vamos começar pelo Momento Estratégico — um espaço para você pensar com clareza.'},
  perdido:  {tabs:['momento','matriz','agenda-executiva','iniciativas','estrategia'], inicio:'momento',
             msg:'Sem problema. O Momento Estratégico vai te ajudar a encontrar o fio da meada.'},
  decisao:  {tabs:['matriz','momento','estrategia','iniciativas','agenda-executiva'], inicio:'matriz',
             msg:'Vamos lá. A Matriz de Prioridades é o lugar certo para clarear uma decisão.'},
};

var _ceoSequenciaAtual = null;

function getCeoSequencia(){
  try{
    var saved=localStorage.getItem('gps_v2_ceo_seq_'+(CU&&CU.id||''));
    if(saved)return JSON.parse(saved);
  }catch(e){}
  return null;
}

function saveCeoSequencia(seq){
  try{localStorage.setItem('gps_v2_ceo_seq_'+(CU&&CU.id||''),JSON.stringify(seq));}catch(e){}
  _ceoSequenciaAtual=seq;
}

function renderCeoTabs(seq){
  var tabsEl=document.querySelector('.ceo-tabs');
  if(!tabsEl)return;
  var tabs=seq?seq.tabs:['agenda-executiva','iniciativas','matriz','estrategia','momento'];
  // Botão "Início" primeiro, depois as abas da sequência
  tabsEl.innerHTML=
    '<button class="ceo-tab" id="ceo-tab-inicio" onclick="abrirModalEstadoCEO()" style="font-weight:700">Início</button>'+
    tabs.map(function(t){
    var cfg=CEO_TABS_CONFIG[t];
    return '<button class="ceo-tab" id="ceo-tab-'+t+'" onclick="switchCeoTab(\''+t+'\')">'+(cfg?cfg.label:t)+'</button>';
  }).join('');
}

function abrirModalEstadoCEO(){
  var html='<div class="overlay open" id="ceo-estado-modal">'+
    '<div class="modal" style="max-width:420px;max-height:90vh;overflow-y:auto">'+
      '<div class="modal-header modal-header-navy">'+
        '<div>'+
          '<div class="modal-title">Agenda CEO</div>'+
          '<div class="modal-subtitle">Como você está chegando aqui agora?</div>'+
        '</div>'+
        '<button onclick="document.getElementById(\'ceo-estado-modal\').remove();switchCeoTab(_ceoTab||(\'agenda-executiva\'))" '+
          'style="background:none;border:none;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;line-height:1;padding:4px">✕</button>'+
      '</div>'+
      '<div class="modal-body" style="display:flex;flex-direction:column;gap:var(--sp3)">'+

        '<button class="btn btn-ghost" style="text-align:left;padding:var(--sp4);border-radius:var(--r2);border:1.5px solid var(--border);display:flex;align-items:center;gap:var(--sp3)" onclick="escolherEstadoCEO(\'demanda\')">'+
          '<span style="color:var(--navy);flex-shrink:0"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></span>'+
          '<div>'+
            '<div style="font-size:13px;font-weight:700;color:var(--text)">Cheio de demanda</div>'+
            '<div style="font-size:11px;color:var(--muted)">Preciso organizar o que fazer primeiro</div>'+
          '</div>'+
        '</button>'+

        '<button class="btn btn-ghost" style="text-align:left;padding:var(--sp4);border-radius:var(--r2);border:1.5px solid var(--border);display:flex;align-items:center;gap:var(--sp3)" onclick="escolherEstadoCEO(\'pensar\')">'+
          '<span style="color:var(--navy);flex-shrink:0"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span>'+
          '<div>'+
            '<div style="font-size:13px;font-weight:700;color:var(--text)">Quero pensar no área / organização</div>'+
            '<div style="font-size:11px;color:var(--muted)">Tenho um momento para refletir e planejar</div>'+
          '</div>'+
        '</button>'+

        '<button class="btn btn-ghost" style="text-align:left;padding:var(--sp4);border-radius:var(--r2);border:1.5px solid var(--border);display:flex;align-items:center;gap:var(--sp3)" onclick="escolherEstadoCEO(\'perdido\')">'+
          '<span style="color:var(--navy);flex-shrink:0"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></span>'+
          '<div>'+
            '<div style="font-size:13px;font-weight:700;color:var(--text)">Estou perdido</div>'+
            '<div style="font-size:11px;color:var(--muted)">Não sei por onde começar</div>'+
          '</div>'+
        '</button>'+

        '<button class="btn btn-ghost" style="text-align:left;padding:var(--sp4);border-radius:var(--r2);border:1.5px solid var(--border);display:flex;align-items:center;gap:var(--sp3)" onclick="escolherEstadoCEO(\'decisao\')">'+
          '<span style="color:var(--navy);flex-shrink:0"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7 7-7-7"/><path d="M3 21l9-9 9 9"/></svg></span>'+
          '<div>'+
            '<div style="font-size:13px;font-weight:700;color:var(--text)">Tenho uma decisão para tomar</div>'+
            '<div style="font-size:11px;color:var(--muted)">Preciso de clareza rápida</div>'+
          '</div>'+
        '</button>'+

      '</div>'+
    '</div>'+
  '</div>';
  var old=document.getElementById('ceo-estado-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}

function escolherEstadoCEO(estado){
  var seq=CEO_SEQUENCIAS[estado];
  if(!seq)return;
  saveCeoSequencia(seq);
  var old=document.getElementById('ceo-estado-modal');if(old)old.remove();
  renderCeoTabs(seq);
  // Toast com a mensagem personalizada
  toast(seq.msg,'success',4000);
  // Ir para a aba sugerida
  setTimeout(function(){switchCeoTab(seq.inicio);},300);
}


function renderSemana(){
  navTo('agenda-executiva');
}



function switchSemanaTab(tab){
  var tabs=['inicio','agenda-executiva','stakeholders','matriz'];
  tabs.forEach(function(t){
    var btn=document.getElementById('semana-tab-'+t);
    if(btn)btn.classList.toggle('active',t===tab);
  });
  // Esconder todos os conteúdos
  ['semana-inicio-content','semana-agenda-executiva-board','semana-stakeholders-content','semana-matriz-content'].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.style.display='none';
  });
  // Mostrar o tab ativo
  var map={
    'inicio':'semana-inicio-content',
    'agenda-executiva':'semana-agenda-executiva-board',
    'stakeholders':'semana-stakeholders-content',
    'matriz':'semana-matriz-content',
  };
  var activeEl=document.getElementById(map[tab]);
  if(activeEl)activeEl.style.display='';

  if(tab==='agenda-executiva'){
    renderRotina();
  }
  if(tab==='matriz') renderMatriz();
  if(tab==='stakeholders') renderStakeholdersUrgentes();
  if(tab==='inicio') renderSemanaInicio();
}

function renderSemanaInicio(){
  var el=document.getElementById('semana-inicio-content');
  if(!el)return;
  var rotina=getRotina();
  var hoje=new Date().toISOString().split('T')[0];
  var urgentes=rotina.filter(function(c){return c.col==='fazer'||c.col==='decidir';});
  var d=_getEstrategiaData();
  var pctGeral=d.metas.length>0?Math.round(d.metas.reduce(function(s,m){return s+(parseFloat(m.progresso)||0);},0)/d.metas.length):0;

  // Stakeholders parados
  var stakeholdersParados=clients.filter(function(c){
    if(!c.updatedAt)return false;
    var dias=Math.floor((new Date()-new Date(c.updatedAt))/86400000);
    return dias>=7;
  }).slice(0,3);

  el.innerHTML=
    '<div style="padding:var(--sp4)">'+
    // Stats rápidos
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp2);margin-bottom:var(--sp4)">'+
      '<div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r2);padding:var(--sp3);text-align:center">'+
        '<div style="font-size:22px;font-weight:700;color:var(--navy)">'+urgentes.length+'</div>'+
        '<div style="font-size:10px;color:var(--muted)">ações esta semana</div>'+
      '</div>'+
      '<div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r2);padding:var(--sp3);text-align:center">'+
        '<div style="font-size:22px;font-weight:700;color:'+(pctGeral>=50?'var(--green)':'var(--amber)')+'">'+pctGeral+'%</div>'+
        '<div style="font-size:10px;color:var(--muted)">planejamento estratégico</div>'+
      '</div>'+
    '</div>'+
    // Stakeholders urgentes
    (stakeholdersParados.length>0?
      '<div style="background:var(--bg2);border-radius:var(--r2);padding:var(--sp3) var(--sp4);margin-bottom:var(--sp4);border-left:3px solid var(--amber)">'+
        '<div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:var(--sp2)">Stakeholders que precisam de atenção</div>'+
        stakeholdersParados.map(function(c){
          var dias=Math.floor((new Date()-new Date(c.updatedAt))/86400000);
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">'+
            '<div>'+
              '<div style="font-size:12px;font-weight:600;color:var(--text)">'+san(c.name)+'</div>'+
              '<div style="font-size:10px;color:var(--muted)">'+dias+' dias sem contato</div>'+
            '</div>'+
            '<button class="btn btn-ghost btn-sm" onclick="navTo(\'painel-de-iniciativas\')">Ver</button>'+
          '</div>';
        }).join('')+
      '</div>':'<div style="background:var(--bg2);border-radius:var(--r2);padding:var(--sp3) var(--sp4);margin-bottom:var(--sp4);text-align:center;font-size:12px;color:var(--muted)">Nenhum stakeholder urgente esta semana</div>')+
    // Ações prioritárias
    '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp2)">Ações desta semana</div>'+
    (urgentes.length>0?
      urgentes.slice(0,4).map(function(c){
        return '<div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r2);padding:var(--sp3) var(--sp4);margin-bottom:var(--sp2);display:flex;align-items:center;gap:var(--sp2)" onclick="openCeoCardModal(null,\''+c.id+'\')" style="cursor:pointer">'+
          '<div style="flex:1">'+
            '<div style="font-size:12px;font-weight:600;color:var(--text)">'+san(c.titulo)+'</div>'+
            '<div style="font-size:10px;color:var(--muted)">'+san(c.col)+'</div>'+
          '</div>'+
          '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();moverParaConcluido(this.dataset.id)" data-id="'+c.id+'" >Concluir</button>'+
        '</div>';
      }).join(''):
      '<div style="text-align:center;padding:var(--sp4);color:var(--muted);font-size:12px">Nenhuma ação pendente — bom trabalho!</div>')+
    // Botão ir para agenda-executiva
    '<button class="btn btn-primary" style="width:100%;margin-top:var(--sp3)" onclick="switchSemanaTab(\'agenda-executiva\')">Ver agenda-executiva completa</button>'+
    '</div>';
}

function moverParaConcluido(cardId){
  var cards=getRotina();
  var idx=cards.findIndex(function(c){return c.id===cardId;});
  if(idx>=0){
    cards[idx].col='concluido';
    cards[idx].concluidoEm=new Date().toISOString();
    saveRotina(cards);
    if(cards[idx]._bscMetaId||cards[idx]._bscAcaoMetaId) sincronizarProgressoBSC();
    renderSemanaInicio();
    toast('Ação concluída!','success');
  }
}

function renderStakeholdersUrgentes(){
  var el=document.getElementById('semana-stakeholders-content');
  if(!el)return;
  var urgentes=clients.filter(function(c){
    if(!c.updatedAt)return false;
    return Math.floor((new Date()-new Date(c.updatedAt))/86400000)>=7;
  });
  if(urgentes.length===0){
    el.innerHTML='<div style="text-align:center;padding:var(--sp6);color:var(--muted)">Nenhum stakeholder parado há mais de 7 dias</div>';
    return;
  }
  el.innerHTML='<div style="padding:var(--sp4)">'+
    '<div style="font-size:12px;color:var(--muted);margin-bottom:var(--sp3)">'+urgentes.length+' stakeholder'+(urgentes.length>1?'s':'')+' sem contato há mais de 7 dias</div>'+
    urgentes.map(function(c){
      var dias=Math.floor((new Date()-new Date(c.updatedAt))/86400000);
      var st=STAGES.find(function(s){return s.id===c.stage;})||{name:c.stage||'',color:'var(--muted)'};
      return '<div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r2);padding:var(--sp3) var(--sp4);margin-bottom:var(--sp2)">'+
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--sp2)">'+
          '<div>'+
            '<div style="font-size:13px;font-weight:700;color:var(--text)">'+san(c.name)+'</div>'+
            '<div style="font-size:11px;color:var(--muted)">'+san(c.company||'')+'</div>'+
            '<span style="font-size:10px;background:'+st.color+'22;color:'+st.color+';padding:2px 8px;border-radius:var(--r4);margin-top:4px;display:inline-block">'+san(st.name)+'</span>'+
          '</div>'+
          '<div style="text-align:right;flex-shrink:0">'+
            '<div style="font-size:13px;font-weight:700;color:var(--red)">'+dias+'d</div>'+
            '<div style="font-size:9px;color:var(--muted)">sem contato</div>'+
          '</div>'+
        '</div>'+
        '<div style="display:flex;gap:var(--sp2);margin-top:var(--sp2)">'+
          '<button class="btn btn-ghost btn-sm" style="flex:1" onclick="openClientModal(this.dataset.id)" data-id="'+c.id+'" >Ver stakeholder</button>'+
          '<button class="btn btn-primary btn-sm" style="flex:1" onclick="registrarContatoRapido(this.dataset.id)" data-id="'+c.id+'" >Registrar contato</button>'+
        '</div>'+
      '</div>';
    }).join('')+
  '</div>';
}

function registrarContatoRapido(clientId){
  var cl=clients.find(function(c){return c.id===clientId;});
  if(!cl)return;
  cl.updatedAt=new Date().toISOString();
  cl.lastContact=new Date().toISOString();
  saveClient(cl);
  toast('Contato registrado — '+san(cl.name),'success');
  renderStakeholdersUrgentes();
}


function setRotinaFiltro(valor, el){
  // Atualizar chips
  ['all','iniciativa','matriz','livre'].forEach(function(t){
    var btn=document.getElementById('agenda-executiva-chip-'+t);
    if(btn)btn.classList.remove('active');
  });
  if(el)el.classList.add('active');
  // Salvar valor no hidden input
  var hidden=document.getElementById('agenda-executiva-origem-filter');
  if(hidden)hidden.value=valor;
  renderRotina();
}

function renderRotinaPrincipal(){
  switchRotinaTab('board');
  atualizarBadgeRotina();
}

function switchRotinaTab(tab){
  ['board','stakeholders','matriz'].forEach(function(t){
    var btn=document.getElementById('agenda-executiva-tab-'+t);
    if(btn)btn.classList.toggle('active',t===tab);
  });
  var boardEl=document.getElementById('semana-agenda-executiva-board');
  var stakeholdersEl=document.getElementById('semana-stakeholders-content');
  var matrizEl=document.getElementById('semana-matriz-content');
  if(boardEl)boardEl.style.display=tab==='board'?'':'none';
  if(stakeholdersEl)stakeholdersEl.style.display=tab==='stakeholders'?'':'none';
  if(matrizEl)matrizEl.style.display=tab==='matriz'?'':'none';
  if(tab==='board') renderRotina();
  if(tab==='stakeholders') renderStakeholdersUrgentes();
  if(tab==='matriz') renderMatriz();
}

function atualizarBadgeRotina(){
  var rotina=getRotina();
  var urgentes=rotina.filter(function(c){return c.col==='decidir';}).length;
  var stakeholdersP=clients.filter(function(c){
    return c.updatedAt&&Math.floor((new Date()-new Date(c.updatedAt))/86400000)>=7;
  }).length;
  var total=urgentes+stakeholdersP;
  // Badge nav lateral
  var badge=document.getElementById('agenda-executiva-badge');
  if(badge){badge.textContent=total;badge.style.display=total>0?'':'none';}
  // Badge mobile
  var badgeMob=document.getElementById('agenda-executiva-badge-mobile');
  if(badgeMob){badgeMob.style.display=total>0?'':'none';}
}

function renderCEO(){ renderPlanejamento(); }

function renderPlanejamento(){
  var diag=getExecutivoDiag();
  var sub=document.getElementById('ceo-hero-perfil');
  if(sub)sub.textContent=diag?'Perfil '+diag.perfil+' · '+diag.perfilSecundario:'Faça o diagnóstico para personalizar';
  switchPlanejamentoTab('estrategia');
}

function switchPlanejamentoTab(tab){
  var tabs=['estrategia','iniciativas','momento'];
  tabs.forEach(function(t){
    var btn=document.getElementById('ceo-tab-'+t);
    if(btn)btn.classList.toggle('active',t===tab);
  });
  var contents={
    'estrategia':'ceo-estrategia-content',
    'iniciativas':'ceo-iniciativas-list',
    'momento':'ceo-momento-content',
  };
  Object.keys(contents).forEach(function(t){
    var el=document.getElementById(contents[t]);
    if(el)el.style.display=t===tab?'':'none';
  });
  if(tab==='estrategia') renderEstrategia();
  if(tab==='iniciativas') renderIniciativas();
  if(tab==='momento') renderMomentoTab();
}
// Compatibilidade — redireciona para nova arquitetura
function switchCeoTab(tab){
  var semanaT=['agenda-executiva','matriz','inicio','stakeholders'];
  var planejamentoT=['estrategia','iniciativas','momento'];
  if(semanaT.indexOf(tab)>=0){ switchSemanaTab(tab); return; }
  if(planejamentoT.indexOf(tab)>=0){ switchPlanejamentoTab(tab); return; }
  switchSemanaTab(tab);
}
function _switchCeoTabLegacy(tab){
  _ceoTab=tab;
  ['matriz','agenda-executiva','iniciativas','momento'].forEach(function(t){var btn=document.getElementById('ceo-tab-'+t);if(btn)btn.classList.toggle('active',t===tab);});
  var mzContent=document.getElementById('ceo-matriz-content');if(mzContent)mzContent.style.display=tab==='matriz'?'block':'none';
  var rBoard=document.getElementById('ceo-agenda-executiva-board');if(rBoard)rBoard.style.display=tab==='agenda-executiva'?'block':'none';
  var pList=document.getElementById('ceo-iniciativas-list');if(pList)pList.style.display=tab==='iniciativas'?'block':'none';
  var mContent=document.getElementById('ceo-momento-content');if(mContent)mContent.style.display=tab==='momento'?'block':'none';
  var eContent=document.getElementById('ceo-estrategia-content');if(eContent)eContent.style.display=tab==='estrategia'?'block':'none';
  ['matriz','agenda-executiva','iniciativas','momento','estrategia'].forEach(function(t){var btn=document.getElementById('ceo-tab-'+t);if(btn)btn.classList.toggle('active',t===tab);});
  if(tab==='matriz')renderMatriz();
  else if(tab==='agenda-executiva')renderRotina();
  else if(tab==='iniciativas')renderIniciativas();
  else if(tab==='momento')renderMomentoTab();
  else if(tab==='estrategia')renderEstrategia();
}


// ── Colunas extras da Agenda Executiva CEO ──────────────────────
var _ROTINA_COLS_KEY='gps_v2_agenda-executiva_cols_';

function getRotinaColsExtras(){
  try{
    var saved=localStorage.getItem(_ROTINA_COLS_KEY+(CU&&CU.id||''));
    return saved?JSON.parse(saved):[];
  }catch(e){return[];}
}

function saveRotinaColsExtras(cols){
  try{localStorage.setItem(_ROTINA_COLS_KEY+(CU&&CU.id||''),JSON.stringify(cols));}catch(e){}
}

function getRotinaColsAll(){
  return CEO_COLS_V2.concat(getRotinaColsExtras());
}

function addRotinaColExtra(){
  // Modal em vez de prompt() — funciona em todos os browsers incluindo mobile
  var html='<div class="overlay open" id="nova-col-modal" onclick="if(event.target===this)document.getElementById(\'nova-col-modal\').remove()">'+
    '<div class="modal" style="max-width:340px">'+
      '<div class="modal-header modal-header-navy">'+
        '<div class="modal-title">Nova coluna</div>'+
        '<button class="modal-close" onclick="document.getElementById(\'nova-col-modal\').remove()">✕</button>'+
      '</div>'+
      '<div class="modal-body">'+
        '<label class="form-label">Nome da coluna</label>'+
        '<input class="input" id="nova-col-nome" placeholder="Ex: Revisão, Aguardando, Pausa..." autofocus>'+
      '</div>'+
      '<div class="modal-footer">'+
        '<button class="btn btn-ghost" onclick="document.getElementById(\'nova-col-modal\').remove()">Cancelar</button>'+
        '<button class="btn btn-primary" onclick="salvarNovaRotinaCol()">Criar coluna</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var old=document.getElementById('nova-col-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  setTimeout(function(){var n=document.getElementById('nova-col-nome');if(n)n.focus();},100);
}

function salvarNovaRotinaCol(){
  var nome=(document.getElementById('nova-col-nome')||{}).value||'';
  if(!nome.trim()){toast('Digite um nome para a coluna','error');return;}
  var cols=getRotinaColsExtras();
  var id='col_extra_'+Date.now();
  cols.push({id:id,label:nome.trim(),color:'#5B21B6',bg:'#F5F3FF',desc:'Coluna personalizada',extra:true});
  saveRotinaColsExtras(cols);
  document.getElementById('nova-col-modal').remove();
  renderRotina();
  toast('Coluna "'+nome.trim()+'" criada','success');
}

function renameRotinaColExtra(colId){
  var cols=getRotinaColsExtras();
  var col=cols.find(function(c){return c.id===colId;});
  if(!col)return;
  var html='<div class="overlay open" id="rename-col-modal" onclick="if(event.target===this)document.getElementById(\'rename-col-modal\').remove()">'+
    '<div class="modal" style="max-width:340px">'+
      '<div class="modal-header modal-header-navy">'+
        '<div class="modal-title">Renomear coluna</div>'+
        '<button class="modal-close" onclick="document.getElementById(\'rename-col-modal\').remove()">✕</button>'+
      '</div>'+
      '<div class="modal-body">'+
        '<input class="input" id="rename-col-nome" value="'+san(col.label)+'" placeholder="Nome da coluna">'+
      '</div>'+
      '<div class="modal-footer">'+
        '<button class="btn btn-ghost" onclick="document.getElementById(\'rename-col-modal\').remove()">Cancelar</button>'+
        '<button class="btn btn-primary" data-cid="'+colId+'" onclick="salvarRenameRotinaCol(this.dataset.cid)">Salvar</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var old=document.getElementById('rename-col-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  setTimeout(function(){var n=document.getElementById('rename-col-nome');if(n){n.focus();n.select();}},100);
}

function salvarRenameRotinaCol(colId){
  var nome=(document.getElementById('rename-col-nome')||{}).value||'';
  if(!nome.trim())return;
  var cols=getRotinaColsExtras();
  var col=cols.find(function(c){return c.id===colId;});
  if(col){col.label=nome.trim();saveRotinaColsExtras(cols);}
  document.getElementById('rename-col-modal').remove();
  renderRotina();
  toast('Coluna renomeada','success');
}

function deleteRotinaColExtra(id){
  if(!confirm('Excluir esta coluna? Os cards serão movidos para Fazer.'))return;
  var cards=getRotina();
  cards=cards.map(function(c){return c.col===id?Object.assign({},c,{col:'fazer'}):c;});
  saveRotina(cards);
  var cols=getRotinaColsExtras().filter(function(c){return c.id!==id;});
  saveRotinaColsExtras(cols);
  renderRotina();
  toast('Coluna removida','info');
}

var CEO_COLS_V2=[
  {id:'decidir',label:'Decidir',color:'#C0392B',bg:'#FDECEA',desc:'Precisa de uma decisao'},
  {id:'fazer',  label:'Fazer',  color:'#1B4F8A',bg:'#E8EFF8',desc:'So voce executa'},
  {id:'andamento',label:'Em andamento',color:'#5B21B6',bg:'#F5F3FF',desc:'Ja comecou, ainda nao terminou'},
  {id:'concluido',label:'Concluido',color:'#1A7A4A',bg:'#E6F5EE',desc:'Feito esta semana'},
];
var CEO_AREAS_V2={
  comercial: {l:'Comercial', c:'#1B4F8A',bg:'#E8EFF8'},
  financeiro:{l:'Financeiro',c:'#B07D1A',bg:'#FBF3E0'},
  operacional:{l:'Operacional',c:'#5B21B6',bg:'#F5F3FF'},
  equipe:    {l:'Equipe',    c:'#1A7A4A',bg:'#E6F5EE'},
  pessoal:   {l:'Pessoal',  c:'#B85515',bg:'#FDF0E6'},
};

function renderRotina(){
  var board=document.getElementById('semana-agenda-executiva-board')||document.getElementById('ceo-agenda-executiva-board');if(!board)return;
  
  // Popular filtro de organizaçãos
  var filterEl=document.getElementById('agenda-executiva-organização-filter');
  if(filterEl){
    var myCoIds=CU&&CU.companyIds&&CU.companyIds.length?CU.companyIds:[CU&&CU.companyId].filter(Boolean);
    if(myCoIds.length>1){
      filterEl.style.display='';
      var currentVal=filterEl.value;
      filterEl.innerHTML='<option value="">Todas as organizaçãos</option>'+
        myCoIds.map(function(id){
          var co=companies.find(function(x){return x.id===id;})||{id:id,name:id};
          return '<option value="'+id+'"'+(currentVal===id?' selected':'')+'>'+san(co.name||id)+'</option>';
        }).join('');
    }else{
      filterEl.style.display='none';
    }
  }

  var organizaçãoFiltro=filterEl?filterEl.value:'';
  var origemFiltro=(document.getElementById('agenda-executiva-origem-filter')||{}).value||'';
  // Sincronizar chip ativo
  ['all','iniciativa','matriz','livre'].forEach(function(t){
    var btn=document.getElementById('agenda-executiva-chip-'+t);
    if(btn)btn.classList.toggle('active',(t==='all'&&!origemFiltro)||(t===origemFiltro));
  });
  var cards=getRotina();
  // Aplicar filtro de organização
  if(organizaçãoFiltro){
    cards=cards.filter(function(c){
      return (c._rotinaCompanyId===organizaçãoFiltro)||(c._rotinaCompanyId===undefined&&organizaçãoFiltro===CU.companyId);
    });
  }
  // Aplicar filtro de origem
  if(origemFiltro==='iniciativa'){
    cards=cards.filter(function(c){return !!c._projId;});
  }else if(origemFiltro==='matriz'){
    cards=cards.filter(function(c){return c._origem==='matriz'||!!c._matrizId;});
  }else if(origemFiltro==='livre'){
    cards=cards.filter(function(c){return !c._projId&&c._origem!=='matriz'&&!c._matrizId;});
  }
  var TODAS_COLS=getRotinaColsAll();
  board.style.overflowX='auto';
  board.style.webkitOverflowScrolling='touch';
  board.innerHTML='<div class="ceo-board" style="min-width:max-content">'+TODAS_COLS.map(function(col){
    var colCards=cards.filter(function(c){return c.col===col.id;});
    return '<div class="ceo-col">'+
      '<div class="ceo-col-header" style="background:'+col.bg+';display:flex;align-items:center;gap:4px">'+
      '<span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:'+col.color+';flex:1">'+col.label+'</span>'+
      '<span style="font-size:10px;font-weight:700;background:'+col.color+'22;color:'+col.color+';padding:1px 7px;border-radius:10px">'+colCards.length+'</span>'+
      (col.extra?
        '<button onclick="event.stopPropagation();renameRotinaColExtra(this.dataset.id)" data-id="'+col.id+'" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:10px;padding:2px 4px">Editar</button>'+
        '<button onclick="event.stopPropagation();deleteRotinaColExtra(this.dataset.id)" data-id="'+col.id+'" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:10px;padding:2px 4px">✕</button>':'')+
      '</div>'+
      '<div class="ceo-col-body" id="ceo-col-'+col.id+'"'+
      ' ondragover="event.preventDefault()"'+
      ' ondrop="dropCeoCard(event,\''+col.id+'\')">' +
      colCards.map(function(c){
        var a=CEO_AREAS_V2[c.area]||CEO_AREAS_V2.comercial;
        // Badge de meta BSC vinculada
        var bscMeta=null;
        if(c._bscMetaId||c._bscAcaoMetaId){
          var bscD=_getEstrategiaData();
          bscMeta=bscD.metas.find(function(m){return m.id===(c._bscMetaId||c._bscAcaoMetaId);});
        }
        var projVinc=c._projId?getIniciativas().find(function(p){return p.id===c._projId;}):null;
        return '<div class="ceo-card e-'+c.energia+'" data-id="'+c.id+'" draggable="true">'+
          // Badge de iniciativa
          (projVinc?'<div style="font-size:9px;font-weight:700;color:var(--navy);background:var(--blue-lt);border-radius:3px;padding:1px 6px;margin-bottom:4px;display:inline-block">📋 '+san(projVinc.nome)+'</div>':
           (c._origem==='matriz'||c._matrizId)?'<div style="font-size:9px;font-weight:700;color:var(--amber);background:var(--amber-lt,#FBF3E0);border-radius:3px;padding:1px 6px;margin-bottom:4px;display:inline-block">⚡ Matriz</div>':'')+
          // Título clicável abre edição
          '<div class="ceo-card-title" style="cursor:pointer" onclick="openCeoCardModal(null,\''+c.id+'\')" title="Clique para editar">'+san(c.titulo)+'</div>'+
          (bscMeta?'<div style="font-size:9px;color:var(--navy);background:var(--blue-lt);padding:2px 6px;border-radius:var(--r4);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Planejamento: '+san(bscMeta.descricao.substring(0,30))+(bscMeta.descricao.length>30?'...':'')+'</div>':'')+
          '<div class="ceo-card-meta" style="display:flex;align-items:center;gap:4px">'+
          '<span style="background:'+a.bg+';color:'+a.c+';font-size:9px;font-weight:700;padding:2px 6px;border-radius:var(--r1);text-transform:uppercase">'+a.l+'</span>'+
          (c.prazo?'<span style="font-size:10px;color:var(--muted2);margin-left:auto">'+dateStr(c.prazo)+'</span>':'')+
          '<div style="margin-left:auto;display:flex;gap:2px">'+
            '<button onclick="event.stopPropagation();openCeoCardModal(null,\''+c.id+'\')" title="Editar" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:11px;padding:2px 4px;font-family:var(--font)">Editar</button>'+
            '<button onclick="event.stopPropagation();excluirAcaoRotina(\''+c.id+'\')" title="Excluir" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:11px;padding:2px 4px;font-family:var(--font)">Excluir</button>'+
          '</div>'+
          '</div></div>';
      }).join('')+
      '<button class="ceo-add-btn" onclick="openCeoCardModal(\''+col.id+'\')">+ '+col.desc+'</button>'+
      '</div></div>';
  }).join('')+
    '<div onclick="addRotinaColExtra()" style="min-width:140px;border:2px dashed var(--border);border-radius:var(--r2);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:var(--sp4);flex-direction:column;gap:6px">'+
      '<span style="font-size:22px;color:var(--muted);line-height:1">+</span>'+
      '<span style="font-size:11px;color:var(--muted)">Nova coluna</span>'+
    '</div>'+
  '</div>';
  // Configurar drag em todos os cards (incluindo novo container)
  board.querySelectorAll('.ceo-card').forEach(function(card){
    card.addEventListener('dragstart',function(e){
      e.dataTransfer.setData('text',card.dataset.id);
      card.style.opacity='0.5';
    });
    card.addEventListener('dragend',function(){
      card.style.opacity='';
    });
  });
  // Configurar drop nas colunas
  board.querySelectorAll('.ceo-col-body').forEach(function(col){
    col.addEventListener('dragover',function(e){
      e.preventDefault();
      col.style.background='var(--blue-lt)';
    });
    col.addEventListener('dragleave',function(){
      col.style.background='';
    });
    col.addEventListener('drop',function(e){
      col.style.background='';
      var colId=col.id.replace('ceo-col-','');
      dropCeoCard(e,colId);
    });
  });
}
function dropCeoCard(e,colId){
  e.preventDefault();
  var id=e.dataTransfer.getData('text');
  var cards=getRotina();
  var idx=cards.findIndex(function(c){return c.id===id;});
  if(idx>=0){
    cards[idx].col=colId;
    if(colId==='concluido') cards[idx].concluidoEm=new Date().toISOString();
    saveRotina(cards);
    renderRotina();
    // Sincronizar progresso BSC se for ação estratégica
    if(cards[idx]._bscMetaId||cards[idx]._bscAcaoMetaId){
      sincronizarProgressoBSC();
    }
    // Atualizar dashboard se visível
    var dashEl=document.getElementById('dash-estrategia');
    if(dashEl) renderDashboard();
  }
}

var _ceoCardEditId=null;

function salvarAcaoRotina(){
  var titulo=(document.getElementById('cc-titulo')||{}).value||'';
  if(!titulo.trim()){toast('Informe a ação','error');return;}
  var area=(document.getElementById('cc-area')||{}).value||'operacional';
  var energia=(document.getElementById('cc-energia')||{}).value||'media';
  var col=(document.getElementById('cc-col')||{}).value||'decidir';
  var prazo=(document.getElementById('cc-prazo')||{}).value||'';
  var notas=(document.getElementById('cc-notas')||{}).value||'';
  var metaBscId=(document.getElementById('cc-meta-bsc')||{}).value||'';
  var rotinaCompanyId=(document.getElementById('cc-organização')||{}).value||CU.companyId||'';

  var cards=getRotina();
  var existing=_ceoCardEditId?cards.find(function(c){return c.id===_ceoCardEditId;}):null;
  var card={
    id:_ceoCardEditId||('rot_'+Date.now()),
    titulo:titulo.trim(),
    col:col,
    area:area,
    energia:energia,
    prazo:prazo,
    notas:notas,
    _bscMetaId:metaBscId||null,
    _rotinaCompanyId:rotinaCompanyId||CU.companyId||'',
    tipo:metaBscId?'estrategia':(existing&&existing.tipo)||null,
    updatedAt:new Date().toISOString(),
    createdAt:(existing&&existing.createdAt)||new Date().toISOString(),
  };
  // Preservar vínculos BSC existentes
  if(!metaBscId&&existing&&existing._bscAcaoMetaId) card._bscAcaoMetaId=existing._bscAcaoMetaId;
  if(!metaBscId&&existing&&existing._bscMetaId) card._bscMetaId=existing._bscMetaId;

  var idx=cards.findIndex(function(c){return c.id===_ceoCardEditId;});
  if(_ceoCardEditId&&idx>=0) cards[idx]=card; else cards.push(card);
  saveRotina(cards);
  closeModal('ceo-card-modal');
  renderRotina();
  if(card._bscMetaId||card._bscAcaoMetaId) sincronizarProgressoBSC();
  toast(_ceoCardEditId?'Ação atualizada':'Ação criada','success');
}

function openCeoCardModal(colDefault,editId){
  _ceoCardEditId=editId||null;
  var c=editId?getRotina().find(function(x){return x.id===editId;}):null;
  var titleEl=document.getElementById('ceo-card-modal-title');if(titleEl)titleEl.textContent=c?'Editar acao':'Nova acao';
  var areaOpts=Object.entries(CEO_AREAS_V2).map(function(e){return'<option value="'+e[0]+'"'+((c?c.area:'comercial')===e[0]?' selected':'')+'>'+e[1].l+'</option>';}).join('');
  var colOpts=getRotinaColsAll().map(function(col){return'<option value="'+col.id+'"'+((c?c.col:(colDefault||'decidir'))===col.id?' selected':'')+'>'+col.label+'</option>';}).join('');
  var body=document.getElementById('ceo-card-modal-body');
  // Opções de metas BSC para vincular
  var d=_getEstrategiaData();
  var metaOpts='<option value="">Nenhuma — ação livre</option>';
  if(d&&d.metas&&d.metas.length>0){
    var perspNomes={financeira:'Resultado Financeiro',stakeholders:'Stakeholders',processos:'Operação',conhecimento:'Equipe'};
    var grupos={};
    d.metas.forEach(function(m){
      var pg=perspNomes[m.perspectiva]||m.perspectiva;
      if(!grupos[pg])grupos[pg]=[];
      grupos[pg].push(m);
    });
    Object.keys(grupos).forEach(function(pg){
      metaOpts+='<optgroup label="'+pg+'">';
      grupos[pg].forEach(function(m){
        var sel=(c&&(c._bscMetaId===m.id||c._bscAcaoMetaId===m.id))?' selected':'';
        var desc=m.descricao.length>40?m.descricao.substring(0,38)+'...':m.descricao;
        metaOpts+='<option value="'+m.id+'"'+sel+'>'+san(desc)+'</option>';
      });
      metaOpts+='</optgroup>';
    });
  }

  if(body)body.innerHTML=
    '<div class="form-group"><label class="form-label">Acao</label>'+
    '<input class="input" id="cc-titulo" value="'+san(c&&c.titulo||'')+'" placeholder="O que precisa acontecer?"></div>'+
    '<div class="form-row"><div class="form-group"><label class="form-label">Area</label>'+
    '<select class="input" id="cc-area" aria-label="Área da ação">'+areaOpts+'</select></div>'+
    '<div class="form-group"><label class="form-label">Energia</label>'+
    '<select class="input" id="cc-energia" aria-label="Nível de energia">'+
    '<option value="alta"'+(!c||c.energia==='alta'?' selected':'')+'>Alta</option>'+
    '<option value="media"'+(c&&c.energia==='media'?' selected':'')+'>Media</option>'+
    '<option value="baixa"'+(c&&c.energia==='baixa'?' selected':'')+'>Baixa</option>'+
    '</select></div></div>'+
    '<div class="form-row"><div class="form-group"><label class="form-label">Coluna</label>'+
    '<select class="input" id="cc-col" aria-label="Coluna da agenda-executiva">'+colOpts+'</select></div>'+
    '<div class="form-group"><label class="form-label">Prazo</label>'+
    '<input class="input" type="date" id="cc-prazo" value="'+san(c&&c.prazo||'')+'"></div></div>'+
    // Campo de vínculo com meta BSC
    '<div class="form-group" style="background:var(--bg2);border-radius:var(--r1);padding:var(--sp3) var(--sp4);border-left:3px solid var(--navy)">'+
      '<label class="form-label" style="color:var(--navy);font-weight:700">Vinculada ao planejamento estratégico</label>'+
      '<select class="input" id="cc-meta-bsc" aria-label="Meta BSC" style="margin-top:6px">'+metaOpts+'</select>'+
      '<div style="font-size:10px;color:var(--muted);margin-top:4px">Quando concluir esta ação, o progresso da meta avança automaticamente</div>'+
    '</div>'+
    '<div class="form-group"><label class="form-label">Notas</label>'+
    '<textarea class="input" id="cc-notas" placeholder="Contexto, quem envolve...">'+san(c&&c.notas||'')+'</textarea></div>'+
    // Campo organização
    (function(){
      var myCoIds=CU.companyIds&&CU.companyIds.length?CU.companyIds:[CU.companyId].filter(Boolean);
      if(myCoIds.length<=1)return'';
      var coOpts=myCoIds.map(function(id){
        var co=companies.find(function(x){return x.id===id;})||{id:id,name:id};
        var sel=(c&&c._rotinaCompanyId===id)||(!c&&id===(CU.companyId||myCoIds[0]))?'selected':'';
        return'<option value="'+id+'" '+sel+'>'+san(co.name||id)+'</option>';
      }).join('');
      return'<div class="form-group"><label class="form-label">Organização</label>'+
        '<select class="input" id="cc-organização" aria-label="Organização desta ação">'+coOpts+'</select></div>';
    })()+
    (c?'<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)"><button onclick="excluirAcaoRotina(\''+c.id+'\')" style="background:none;border:none;color:var(--red);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font)">Excluir esta ação</button></div>':'');
  openModal('ceo-card-modal');
  setTimeout(function(){var t=document.getElementById('cc-titulo');if(t)t.focus();},200);
}



// Iniciativas
var _projStep=1,_projData={},_projEditId=null;
// ── PROJETOS CEO - Kanban com colunas configuráveis ──────────────

// ══════════════════════════════════════════════════════
// KANBAN CEO - réplica do pipeline, cards pessoais do dono
// ══════════════════════════════════════════════════════

var DEFAULT_PROJ_COLS=[
  {id:'ideias',     name:'Ideias',        color:'#7C3AED', bg:'#F5F3FF'},
  {id:'em-andamento',name:'Em andamento', color:'#1B4F8A', bg:'#EFF6FF'},
  {id:'aguardando', name:'Aguardando',    color:'#B07D1A', bg:'#FBF3E0'},
  {id:'concluido',  name:'Concluido',     color:'#1A7A4A', bg:'#E6F5EE'},
];

function getProjCols(){
  try{
    var s=JSON.parse(localStorage.getItem('gps_v2_projcols_'+(CU&&CU.id||''))||'null');
    return Array.isArray(s)&&s.length>0?s:DEFAULT_PROJ_COLS.slice();
  }catch(e){return DEFAULT_PROJ_COLS.slice();}
}
function saveProjCols(cols){
  try{localStorage.setItem('gps_v2_projcols_'+(CU&&CU.id||''),JSON.stringify(cols));}catch(e){}
}
// getIniciativas/saveIniciativas definidos acima (Firestore)

// ── Colunas: adicionar / renomear / excluir ───────────
function addProjCol(){
  var name=prompt('Nome da nova coluna:');
  if(!name||!name.trim())return;
  var cols=getProjCols();
  var palette=[
    {color:'#0B7285',bg:'#E3F9F5'},{color:'#C0392B',bg:'#FDECEA'},
    {color:'#065F46',bg:'#D1FAE5'},{color:'#7C2D12',bg:'#FEF3C7'},
  ];
  var p=palette[cols.length%palette.length];
  cols.push({id:'pc_'+Date.now(),name:name.trim(),color:p.color,bg:p.bg});
  saveProjCols(cols);
  renderIniciativas();
  toast('Coluna "'+name.trim()+'" criada','success');
}
function renameProjCol(id){
  var cols=getProjCols();
  var c=cols.find(function(x){return x.id===id;});
  if(!c)return;
  var n=prompt('Novo nome:',c.name);
  if(!n||!n.trim())return;
  c.name=n.trim();
  saveProjCols(cols);
  renderIniciativas();
}
function deleteProjCol(id){
  var cols=getProjCols();
  if(cols.length<=1){toast('Mantenha ao menos uma coluna','error');return;}
  var c=cols.find(function(x){return x.id===id;});
  if(!c)return;
  if(!confirm('Excluir "'+c.name+'"? Os cards voltam para a primeira coluna.'))return;
  var rem=cols.filter(function(x){return x.id!==id;});
  saveProjCols(rem);
  var projs=getIniciativas();
  projs.forEach(function(p){if(p.coluna===id)p.coluna=rem[0].id;});
  saveIniciativas(projs);
  renderIniciativas();
}

// ── Cards: criar / editar / excluir / mover ──────────
var _projDragId=null;

function openNovoIniciativa(editId, preColId){
  var cols=getProjCols();
  var projs=getIniciativas();
  var p=editId?projs.find(function(x){return x.id===editId;}):null;
  var defaultCol=preColId||(p&&p.coluna)||(cols[0]&&cols[0].id)||'';
  _ceoPrioAtual=p?p.priority||'media':'media';

  // Remover modal existente para garantir estado limpo
  var old=document.getElementById('ceo-card-modal');
  if(old)old.parentNode.removeChild(old);

  // Criar modal via DOM (evita problemas de escaping)
  var overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.id='ceo-card-modal';

  var modal=document.createElement('div');
  modal.className='modal';
  modal.style.maxWidth='480px';

  // Header
  var header=document.createElement('div');
  header.className='modal-header modal-header-navy';
  var headerLeft=document.createElement('div');
  var headerSub=document.createElement('div');
  headerSub.style.cssText='font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:3px';
  headerSub.textContent='Agenda CEO - Iniciativas';
  var headerTitle=document.createElement('div');
  headerTitle.className='modal-title';
  headerTitle.textContent=p?'Editar card':'Novo card';
  headerLeft.appendChild(headerSub);
  headerLeft.appendChild(headerTitle);
  var closeBtn=document.createElement('button');
  closeBtn.className='modal-close';
  closeBtn.textContent='✕';
  closeBtn.onclick=function(){closeModal('ceo-card-modal');};
  header.appendChild(headerLeft);
  header.appendChild(closeBtn);

  // Body
  var body=document.createElement('div');
  body.className='modal-body';
  // Montar HTML dos marcos existentes
  var marcosExist=p?[].concat(p.marcos||[]).reverse():[];
  var marcosHtmlStr=marcosExist.map(function(m,idx){
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px" id="marco-item-'+idx+'">'+
      '<input class="input" style="flex:1;padding:6px 10px" value="'+san(m.titulo)+'" placeholder="Título do marco" data-marco-idx="'+idx+'">'+
      '<input type="date" class="input" style="width:130px;padding:6px 8px" value="'+san(m.dataEstimada||'')+'" data-marco-prazo-idx="'+idx+'">'+
      '<button onclick="removerMarcoModal('+idx+')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;flex-shrink:0">✕</button>'+
    '</div>';
  }).join('');

  body.innerHTML=
    '<div class="form-group"><label class="form-label">Titulo *</label>'+
    '<input class="input" id="ceo-card-titulo" placeholder="O que precisa acontecer?" value="'+san(p?p.nome:'')+'"></div>'+
    '<div class="form-group"><label class="form-label">Descricao</label>'+
    '<textarea class="input" id="ceo-card-desc" placeholder="Contexto, objetivo, proximo passo..." style="min-height:72px;resize:none">'+san(p?p.destino||'':'')+'</textarea></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
      '<div class="form-group"><label class="form-label">Coluna</label>'+
      '<select class="input" id="ceo-card-col" aria-label="Coluna do iniciativa">'+
      cols.map(function(c){return'<option value="'+c.id+'"'+(c.id===defaultCol?' selected':'')+'>'+san(c.name)+'</option>';}).join('')+
      '</select></div>'+
      '<div class="form-group"><label class="form-label">Prazo</label>'+
      '<input class="input" type="date" id="ceo-card-prazo" value="'+san(p?p.prazo||'':'')+'"></div>'+
    '</div>'+
    '<div class="form-group"><label class="form-label">Prioridade</label>'+
    '<div style="display:flex;gap:8px" id="ceo-prio-container"></div></div>'+
    // Marcos do iniciativa
    '<div class="form-group">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
        '<label class="form-label" style="margin-bottom:0">Marcos do iniciativa</label>'+
        '<button onclick="adicionarMarcoModal()" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:var(--r1);background:var(--navy);color:#fff;border:none;cursor:pointer">+ Marco</button>'+
      '</div>'+
      '<div id="marcos-lista">'+marcosHtmlStr+'</div>'+
      '<div id="marcos-vazio" style="font-size:11px;color:var(--muted);font-style:italic;'+(marcosExist.length>0?'display:none':'')+'">Nenhum marco. Clique em + Marco para adicionar.</div>'+
    '</div>'+
    '<input type="hidden" id="ceo-card-edit-id" value="'+san(editId||'')+'">'+
    '<input type="hidden" id="ceo-card-precol" value="'+san(preColId||'')+'">'+
    // Vínculo com Meta BSC
    (function(){
      var d=_getEstrategiaData();
      if(!d||!d.metas||d.metas.length===0)return'';
      var perspNomes={financeira:'Resultado Financeiro',stakeholders:'Stakeholders',processos:'Operação',conhecimento:'Equipe'};
      var grupos={};
      d.metas.forEach(function(m){
        var pg=perspNomes[m.perspectiva]||m.perspectiva;
        if(!grupos[pg])grupos[pg]=[];
        grupos[pg].push(m);
      });
      var metaOpts='<option value="">Nenhuma — iniciativa livre</option>';
      Object.keys(grupos).forEach(function(pg){
        metaOpts+='<optgroup label="'+pg+'">';
        grupos[pg].forEach(function(m){
          var sel=(p&&p._bscMetaId===m.id)?' selected':'';
          var desc=m.descricao.length>45?m.descricao.substring(0,43)+'...':m.descricao;
          metaOpts+='<option value="'+m.id+'"'+sel+'>'+san(desc)+'</option>';
        });
        metaOpts+='</optgroup>';
      });
      return'<div class="form-group" style="background:var(--bg2);border-radius:var(--r1);padding:var(--sp3) var(--sp4);border-left:3px solid var(--navy)">'+
        '<label class="form-label" style="color:var(--navy);font-weight:700">Vinculado ao planejamento estratégico</label>'+
        '<select class="input" id="ceo-card-meta-bsc" style="margin-top:6px">'+metaOpts+'</select>'+
        '<div style="font-size:10px;color:var(--muted);margin-top:4px">Quando o iniciativa avançar, o progresso da meta avança automaticamente</div>'+
      '</div>';
    })();

  // Footer
  var footer=document.createElement('div');
  footer.className='modal-footer';
  var cancelBtn=document.createElement('button');
  cancelBtn.className='btn btn-ghost';
  cancelBtn.textContent='Cancelar';
  cancelBtn.onclick=function(){closeModal('ceo-card-modal');};
  var saveBtn=document.createElement('button');
  saveBtn.className='btn btn-ceo';
  saveBtn.id='ceo-card-save-btn';
  saveBtn.setAttribute('data-edit', editId||'');
  saveBtn.textContent='Salvar';
  saveBtn.onclick=salvarCeoCard;

  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Renderizar botões de prioridade
  var prioContainer=document.getElementById('ceo-prio-container');
  if(prioContainer){
    var pLabels={alta:'🔴 Alta',media:'🟡 Media',baixa:'🟢 Baixa'};
    ['alta','media','baixa'].forEach(function(pv){
      var btn=document.createElement('button');
      btn.type='button';
      btn.id='ceo-prio-'+pv;
      btn.dataset.pv=pv;
      btn.textContent=pLabels[pv];
      btn.style.cssText='flex:1;padding:8px 4px;border-radius:8px;border:1.5px solid;cursor:pointer;font-family:var(--font);font-size:12px;font-weight:600;transition:all .15s';
      btn.onclick=function(){setCeoPrio(this.dataset.pv);};
      prioContainer.appendChild(btn);
      setCeoPrioBtn(btn,pv===_ceoPrioAtual);
    });
  }

  openModal('ceo-card-modal');
  setTimeout(function(){
    var t=document.getElementById('ceo-card-titulo');
    if(t)t.focus();
  },200);
}

function setCeoPrioBtn(btn,active){
  btn.style.background=active?'var(--navy)':'var(--white)';
  btn.style.color=active?'#fff':'var(--text)';
  btn.style.borderColor=active?'var(--navy)':'var(--border)';
}


var _ceoPrioAtual='media';
function setCeoPrio(pv){
  _ceoPrioAtual=pv;
  ['alta','media','baixa'].forEach(function(v){
    var btn=document.getElementById('ceo-prio-'+v);
    if(btn)setCeoPrioBtn(btn,v===pv);
  });
}

function salvarCeoCard(){
  var titulo=(document.getElementById('ceo-card-titulo')||{}).value||'';
  if(!titulo.trim()){toast('Informe o titulo','error');return;}
  var desc=(document.getElementById('ceo-card-desc')||{}).value||'';
  var prazo=(document.getElementById('ceo-card-prazo')||{}).value||'';
  var col=(document.getElementById('ceo-card-col')||{}).value||getProjCols()[0].id;
  var saveBtn=document.getElementById('ceo-card-save-btn');
  var editId=saveBtn?saveBtn.getAttribute('data-edit'):'';

  var projs=getIniciativas();
  var existing=editId?projs.find(function(p){return p.id===editId;}):null;
  var metaBscId=(document.getElementById('ceo-card-meta-bsc')||{}).value||'';
  var novosMarcos=getMarcosDosModal();
  // Preservar status concluido dos marcos existentes
  if(existing&&existing.marcos&&existing.marcos.length>0){
    novosMarcos=novosMarcos.map(function(m){
      var ex=existing.marcos.find(function(e){return e.titulo===m.titulo;});
      return ex?Object.assign({},m,{concluido:ex.concluido,id:ex.id}):m;
    });
  }
  var card={
    id:editId||('pj_'+Date.now()),
    nome:titulo.trim(),
    destino:desc.trim(),
    prazo:prazo,
    coluna:col,
    priority:_ceoPrioAtual,
    marcos:novosMarcos,
    _bscMetaId:metaBscId||null,
    criadoEm:(existing&&existing.criadoEm)||new Date().toISOString(),
    updatedAt:new Date().toISOString(),
  };
  if(editId){
    var idx=projs.findIndex(function(p){return p.id===editId;});
    if(idx>=0)projs[idx]=card;
  }else{projs.push(card);}
  saveIniciativas(projs);
  closeModal('ceo-card-modal');
  renderIniciativas();
  toast(editId?'Card atualizado':'Card criado','success');
}


function excluirAcaoRotina(id){
  if(!confirm('Excluir esta ação?'))return;
  var cards=getRotina().filter(function(c){return c.id!==id;});
  saveRotina(cards);
  closeModal('ceo-card-modal');
  renderRotina();
  toast('Ação removida','info');
}

function excluirCeoCard(id){
  if(!confirm('Excluir este card?'))return;
  saveIniciativas(getIniciativas().filter(function(p){return p.id!==id;}));
  renderIniciativas();
  toast('Card removido','info');
}

function moverIniciativa(projId,colId){
  var projs=getIniciativas();
  var p=projs.find(function(x){return x.id===projId;});
  if(p){p.coluna=colId;p.updatedAt=new Date().toISOString();saveIniciativas(projs);renderIniciativas();}
}

// ── Drag & drop ──────────────────────────────────────
function projDragStart(id){_projDragId=id;}
function projDragOver(e,colId){
  e.preventDefault();
  document.querySelectorAll('.proj-col-body').forEach(function(el){el.classList.remove('drag-over');});
  var el=document.getElementById('proj-col-'+colId);
  if(el)el.classList.add('drag-over');
}
function projDrop(colId,e){
  if(e)e.stopPropagation();
  if(!_projDragId)return;
  moverIniciativa(_projDragId,colId);
  _projDragId=null;
  document.querySelectorAll('.proj-col-body').forEach(function(el){el.classList.remove('drag-over');});
}

// ── Render ────────────────────────────────────────────
function renderIniciativas(){
  var container=document.getElementById('ceo-iniciativas-list');if(!container)return;
  var projs=getIniciativas();
  var cols=getProjCols();
  var PRIO_COLOR={alta:'var(--red)',media:'var(--amber)',baixa:'var(--green)'};
  var PRIO_LABEL={alta:'Alta',media:'Media',baixa:'Baixa'};
  var DEFAULT_IDS=DEFAULT_PROJ_COLS.map(function(c){return c.id;});

  var html=
    '<div class="proj-kanban-wrap" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;align-items:flex-start;-webkit-overflow-scrolling:touch">';

  cols.forEach(function(col){
    var isDefault=DEFAULT_IDS.indexOf(col.id)>=0;
    var colProjs=projs.filter(function(p){
      if(p.coluna===col.id)return true;
      if(!p.coluna&&col.id===cols[0].id)return true;
      return false;
    });

    html+=
      '<div class="proj-kanban-col" style="min-width:240px;max-width:280px;flex-shrink:0">'+
      // Header coluna
      '<div style="display:flex;align-items:center;gap:4px;padding:8px 10px;background:'+col.bg+';border-radius:8px 8px 0 0;border:1.5px solid '+col.color+'33;border-bottom:none"'+
      ' ondragover="_colDragId?colDragOver(event):void 0" ondrop="_colDragId?colDrop(event,\'proj\',\''+col.id+'\'):void 0" ondragleave="colDragLeave(event)">'+
      '<span style="cursor:grab;color:'+col.color+';opacity:.4;font-size:14px" draggable="true"'+
      ' ondragstart="colDragStart(event,\'proj\',\''+col.id+'\')"'+
      ' title="Arrastar coluna">&#x22EE;</span>'+
        '<span style="font-size:12px;font-weight:800;color:'+col.color+';flex:1;cursor:pointer" onclick="renameProjCol(\''+col.id+'\')" title="Renomear">'+san(col.name)+'</span>'+
        '<span style="font-size:10px;background:'+col.color+'22;color:'+col.color+';padding:1px 6px;border-radius:10px;font-weight:700">'+colProjs.length+'</span>'+
        '<button onclick="openNovoIniciativa(null,\''+col.id+'\')" title="Novo card" style="background:'+col.color+';border:none;cursor:pointer;color:#fff;font-size:14px;font-weight:700;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">+</button>'+
        '<button onclick="renameProjCol(\''+col.id+'\')" title="Renomear" style="background:none;border:none;cursor:pointer;color:'+col.color+';opacity:.5;font-size:11px;padding:2px">Editar&#xFE0F;</button>'+
        '<button onclick="deleteProjCol(\''+col.id+'\')" title="Excluir" style="background:none;border:none;cursor:pointer;color:var(--red);opacity:.6;font-size:11px;padding:2px">&#x2715;</button>'+
      '</div>'+
      // Corpo drop zone
      '<div id="proj-col-'+col.id+'" class="proj-col-body"'+
        ' ondragover="event.stopPropagation();projDragOver(event,\''+col.id+'\')"'+
        ' ondrop="projDrop(\''+col.id+'\',event)"'+
        ' ondragleave="this.classList.remove(\'drag-over\')"'+
        ' style="background:var(--bg);border:1.5px solid '+col.color+'33;border-radius:0 0 8px 8px;border-top:none;min-height:80px;display:flex;flex-direction:column;gap:8px;padding:8px">';

    if(colProjs.length===0){
      html+='<div style="font-size:11px;color:var(--muted2);text-align:center;padding:20px 0;border:1.5px dashed var(--border);border-radius:6px">Sem cards</div>';
    }else{
      colProjs.forEach(function(p){
        var prazoFinal=p.prazo?new Date(p.prazo+'T12:00'):null;
        var diasRest=prazoFinal?Math.ceil((prazoFinal-new Date())/86400000):null;
        var atrasado=diasRest!==null&&diasRest<0;
        var prioColor=PRIO_COLOR[p.priority||'media'];

        html+=
          '<div draggable="true"'+
            ' ondragstart="projDragStart(\''+p.id+'\')"'+
            ' style="background:var(--white);border:1px solid var(--border);border-radius:8px;padding:12px;cursor:grab;border-left:3px solid '+prioColor+';transition:box-shadow .15s"'+
            ' onmouseenter="this.style.boxShadow=\'var(--sh-md)\'"'+
            ' onmouseleave="this.style.boxShadow=\'none\'"'+
          '>'+
          // Header do card
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">'+
            '<div style="font-size:13px;font-weight:700;color:var(--text);line-height:1.4;flex:1">'+san(p.nome)+'</div>'+
            '<div style="display:flex;gap:4px;flex-shrink:0">'+
              '<button onclick="event.stopPropagation();openNovoIniciativa(\''+p.id+'\')" title="Editar" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px;padding:2px">Editar&#xFE0F;</button>'+
              '<button onclick="event.stopPropagation();excluirCeoCard(\''+p.id+'\')" title="Excluir" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px;padding:2px">Excluir</button>'+
            '</div>'+
          '</div>'+
          // Descricao
          (p.destino?'<div style="font-size:11px;color:var(--muted);margin-bottom:8px;line-height:1.5">'+san(p.destino.substring(0,80))+(p.destino.length>80?'...':'')+'</div>':'')+
          // Footer: prioridade + prazo
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'+
            '<span style="font-size:10px;font-weight:700;color:'+prioColor+'">'+PRIO_LABEL[p.priority||'media']+'</span>'+
            (diasRest!==null?
              '<span style="font-size:10px;font-weight:700;color:'+(atrasado?'var(--red)':diasRest<7?'var(--amber)':'var(--muted)')+'">'+
              (atrasado?Math.abs(diasRest)+'d atrasado':diasRest+'d')+'</span>'
            :'')+
          '</div>'+
          // Mover para outra coluna
          '<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">'+
          cols.filter(function(c){return c.id!==col.id;}).map(function(c){
            return '<button onclick="moverIniciativa(\''+p.id+'\',\''+c.id+'\')" '+
              'style="font-size:10px;padding:3px 10px;border-radius:10px;border:1px solid '+c.color+'55;background:'+c.bg+';color:'+c.color+';cursor:pointer;font-weight:600;min-height:24px">'+
              '&#x2192; '+san(c.name)+'</button>';
          }).join('')+
          '</div>'+
          // Marcos do iniciativa
          (p.marcos&&p.marcos.length>0?
            '<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px">'+
            '<div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:6px">MARCOS</div>'+
            [].concat(p.marcos).reverse().map(function(m,idx){
              var jaNaRotina=!m.concluido&&getRotina().some(function(r){return r._projId===p.id&&r._marcoIdx===idx;});
              return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'+
                '<input type="checkbox" '+(m.concluido?'checked':'')+
                ' onclick="event.stopPropagation();toggleMarco(\''+p.id+'\','+idx+')"'+
                ' style="cursor:pointer;flex-shrink:0">'+
                '<span style="font-size:11px;color:var(--text);flex:1;'+(m.concluido?'text-decoration:line-through;color:var(--muted)':'')+'">'+san(m.titulo)+'</span>'+
                (!m.concluido?
                  (jaNaRotina?
                    '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--green);color:#fff;flex-shrink:0">✓ Agenda Executiva</span>':
                    '<button onclick="event.stopPropagation();adicionarMarcoARotina(\''+p.id+'\','+idx+')" title="Colocar na Agenda Executiva" style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--navy);color:#fff;border:none;cursor:pointer;flex-shrink:0">+Agenda Executiva</button>')
                :'')+
              '</div>';
            }).join('')+
            '</div>'
          :'')+
          '</div>';
      });
    }

    html+='</div></div>'; // fecha col-body e col
  });

  // Botao + Nova coluna
  html+=
    '<div class="proj-kanban-col" style="min-width:140px;flex-shrink:0;display:flex">'+
    '<button onclick="addProjCol()" style="width:100%;min-height:120px;background:var(--bg);border:2px dashed var(--border);border-radius:8px;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">'+
    '<span style="font-size:28px;opacity:.3">+</span><span>Nova coluna</span></button></div>';

  html+='</div>';
  container.innerHTML=html;
}


function toggleMarco(projId,idx){
  var projs=getIniciativas();
  var proj=projs.find(function(p){return p.id===projId;});if(!proj)return;
  var rev=[].concat(proj.marcos).reverse();
  var marco=rev[idx];if(!marco)return;
  marco.concluido=!marco.concluido;
  proj.marcos=rev.reverse();

  // 1. Conclui/desconclui ação correspondente na Agenda Executiva
  var cards=getRotina();
  var atualizado=false;
  cards=cards.map(function(c){
    if(c._projId===projId&&c._marcoIdx===idx){
      atualizado=true;
      return Object.assign({},c,{
        col:marco.concluido?'concluido':c.col==='concluido'?'fazer':c.col,
        updatedAt:new Date().toISOString()
      });
    }
    return c;
  });
  if(atualizado)saveRotina(cards);

  // 2. Calcular progresso do iniciativa e avançar meta BSC
  var totalMarcos=proj.marcos.length;
  var concluidos=proj.marcos.filter(function(m){return m.concluido;}).length;
  if(totalMarcos>0&&proj._bscMetaId){
    var progresso=Math.round((concluidos/totalMarcos)*100);
    // Atualizar progresso da meta BSC diretamente
    var estrategia=_getEstrategiaData();
    if(estrategia&&estrategia.metas){
      var meta=estrategia.metas.find(function(m){return m.id===proj._bscMetaId;});
      if(meta){
        meta.progressoAuto=progresso;
        meta.progresso=meta.progressoManual!=null?Math.round((progresso+meta.progressoManual)/2):progresso;
        saveEstrategia(estrategia);
      }
    }
    if(marco.concluido)toast('Marco concluído! Progresso da meta: '+progresso+'%','success');
  }else{
    if(marco.concluido)toast('Marco concluído!','success');
  }

  saveIniciativas(projs);
  renderIniciativas();
}
function concluirIniciativa(projId){if(!confirm('Marcar como concluido?'))return;var projs=getIniciativas();var idx=projs.findIndex(function(p){return p.id===projId;});if(idx>=0){projs[idx].concluido=true;saveIniciativas(projs);}closeModal('proj-det-modal');renderIniciativas();toast('Iniciativa concluido!','success');}
function excluirIniciativa(projId){if(!confirm('Excluir?'))return;saveIniciativas(getIniciativas().filter(function(p){return p.id!==projId;}));closeModal('proj-det-modal');renderIniciativas();}

// ══════════════════════════════════════════════════════
// CEO — PAINEL ESTRATÉGICO BSC
// ══════════════════════════════════════════════════════

var _bscPerspectivas = [
  {id:'financeira',  icon:'', label:'Resultado Financeiro', color:'#1A7A4A', bg:'#E8F3EE',
   passo:1,
   perguntaPrincipal:'Qual resultado financeiro você quer alcançar?',
   perguntaDetalhe:'Pense em quanto quer budgetr, qual margem de lucro, qual ticket médio. Coloque números reais.',
   placeholder:'Ex: Budgetr R$ 30.000 por mês com margem de 40%',
   prazoLabel:'Em quanto tempo?'},
  {id:'stakeholders',    icon:'', label:'Stakeholders', color:'#1B4F8A', bg:'#E6EDF7',
   passo:2,
   perguntaPrincipal:'O que precisa acontecer com seus stakeholders para isso se tornar realidade?',
   perguntaDetalhe:'Quantos stakeholders você precisa ter? O que precisa melhorar no relacionamento com eles?',
   placeholder:'Ex: Ter 20 stakeholders ativos, aumentar renovações de 50% para 80%',
   prazoLabel:'Quando isso precisa estar acontecendo?'},
  {id:'processos',   icon:'', label:'Operação do Área / Organização', color:'#B07D1A', bg:'#FEF3C7',
   passo:3,
   perguntaPrincipal:'O que precisa funcionar melhor no seu área / organização para atender bem esses stakeholders?',
   perguntaDetalhe:'Pense no atendimento, na execução, nos processos internos, nas ferramentas que usa.',
   placeholder:'Ex: Padronizar o atendimento, automatizar cobranças, melhorar a execução do serviço',
   prazoLabel:'Quando você quer isso funcionando?'},
  {id:'conhecimento',icon:'', label:'Você e sua Equipe', color:'#5B21B6', bg:'#EDE6F7',
   passo:4,
   perguntaPrincipal:'O que você e sua equipe precisam aprender ou desenvolver para tudo isso acontecer?',
   perguntaDetalhe:'Pense em habilidades, conhecimentos, contratações ou ferramentas que ainda faltam.',
   placeholder:'Ex: Aprender sobre gestão financeira, contratar um assistente, treinar a equipe em vendas',
   prazoLabel:'Quando você vai cuidar disso?'},
];

var _bscPeriodo='anual';

function getEstrategia(){
  if(_ceoCache.estrategia)return _ceoCache.estrategia;
  try{return JSON.parse(localStorage.getItem('gps_v2_ceo_estrategia_'+(CU&&CU.id||''))||'null');}catch(e){return null;}
}

function saveEstrategia(data){
  _ceoCache.estrategia=data;
  try{localStorage.setItem('gps_v2_ceo_estrategia_'+(CU&&CU.id||''),JSON.stringify(data));}catch(e){}
  if(CU&&window._fb){
    var fb=window._fb;
    fb.setDoc(fb.doc(fb.db,'ceo_data',CU.companyId||CU.id),{estrategia:_cleanUndef(data),_updatedAt:new Date().toISOString()},{merge:true})
      .catch(function(e){console.warn('saveEstrategia:',e.message);});
  }
}

function _getEstrategiaData(){
  var d=getEstrategia();
  if(!d)d={visao:'',periodo:'anual',metas:[]};
  if(!d.metas)d.metas=[];
  return d;
}


// ── Progresso BSC baseado em ações da Agenda Executiva ──────────
function calcularProgressoBSC(metaId){
  var rotina = getRotina();
  var acoesMeta = rotina.filter(function(r){
    return r._bscMetaId === metaId || r._bscAcaoMetaId === metaId;
  });
  if(acoesMeta.length === 0) return null;

  // Peso por coluna: fazer=0%, andamento=50%, concluido=100%
  // decidir e outras colunas = 10% (já foi reconhecida como necessária)
  var PESO = {
    'decidir':   10,
    'fazer':     0,
    'andamento': 50,
    'concluido': 100,
  };

  var totalPeso = acoesMeta.reduce(function(sum, r){
    return sum + (PESO[r.col] !== undefined ? PESO[r.col] : 10);
  }, 0);

  return Math.round(totalPeso / acoesMeta.length);
}

// Recalcular progresso de todas as metas após mudança na agenda-executiva
function sincronizarProgressoBSC(){
  var d = _getEstrategiaData();
  var mudou = false;
  d.metas.forEach(function(meta){
    var pct = calcularProgressoBSC(meta.id);
    if(pct !== null && pct !== meta.progressoAuto){
      meta.progressoAuto = pct;
      // Progresso final = media entre auto e manual (se tiver manual)
      meta.progresso = meta.progressoManual != null
        ? Math.round((pct + meta.progressoManual) / 2)
        : pct;
      // Histórico
      if(!meta.historico) meta.historico = [];
      meta.historico.push({data: new Date().toISOString().split('T')[0], valor: meta.progresso, fonte: 'agenda-executiva'});
      mudou = true;
      // Feedback visual ao avançar
      if(meta.progresso >= 100 && meta._celebrado !== true){
        meta._celebrado = true;
        setTimeout(function(){toast('Meta concluída: '+meta.descricao.substring(0,40)+(meta.descricao.length>40?'...':''),'success',4000);},500);
      } else if(meta.progresso >= 50 && meta.progresso < 100){
        setTimeout(function(){toast('Planejamento avançando — '+meta.descricao.substring(0,30)+'... está em '+meta.progresso+'%','info',2500);},300);
      }
    }
  });
  if(mudou){
    saveEstrategia(d);
    // Re-renderizar se estiver na aba estratégia
    var container = document.getElementById('ceo-estrategia-content');
    if(container && container.style.display !== 'none') renderEstrategia();
  }
}

// Check-in semanal — verificar se precisa perguntar
function verificarCheckinSemanal(){
  if(!CU) return;
  var key = 'gps_v2_bsc_checkin_' + (CU.id || '');
  var ultimoCheckin = localStorage.getItem(key);
  var hoje = new Date().toISOString().split('T')[0];
  // Verificar se passou 7 dias
  if(ultimoCheckin){
    var diasPassados = Math.floor((new Date(hoje) - new Date(ultimoCheckin)) / 86400000);
    if(diasPassados < 7) return;
  }
  var d = _getEstrategiaData();
  // Só mostrar se tiver pelo menos uma meta sem ações na agenda-executiva
  var metasSemAcao = d.metas.filter(function(m){
    var rotina = getRotina();
    var acoes = rotina.filter(function(r){ return r._bscMetaId === m.id || r._bscAcaoMetaId === m.id; });
    return acoes.length === 0 && m.progresso < 100;
  });
  if(metasSemAcao.length === 0) return;
  // Mostrar após 3 segundos de idle
  setTimeout(function(){ abrirCheckinBSC(metasSemAcao); }, 3000);
  localStorage.setItem(key, hoje);
}

var _bscMetasPendentes = [];

function abrirCheckinBSC(metas){
  if(!metas || metas.length === 0) return;
  _bscMetasPendentes = metas.slice(1);
  var meta = metas[0];
  var persp = _bscPerspectivas.find(function(p){ return p.id === meta.perspectiva; }) || _bscPerspectivas[0];
  var restantes = metas.length - 1;

  var html = '<div class="overlay open" id="bsc-checkin-modal">'+
    '<div class="modal" style="max-width:420px">'+
      '<div class="modal-header" style="background:var(--navy);padding:var(--sp4)">'+
        '<div>'+
          '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:4px">Revisão semanal</div>'+
          '<div style="font-size:15px;font-weight:700;color:#fff">Como está essa meta?</div>'+
        '</div>'+
        '<button onclick="document.getElementById(\'bsc-checkin-modal\').remove()" style="background:none;border:none;color:rgba(255,255,255,.6);font-size:18px;cursor:pointer">✕</button>'+
      '</div>'+
      '<div class="modal-body">'+
        '<div style="font-size:11px;font-weight:700;color:'+persp.color+';text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp2)">'+persp.label+'</div>'+
        '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:var(--sp4);padding:var(--sp3);background:var(--bg2);border-radius:var(--r1)">'+
          san(meta.descricao)+
        '</div>'+
        '<div style="display:flex;flex-direction:column;gap:var(--sp2)">'+
          '<button class="btn btn-ghost" style="text-align:left;padding:var(--sp3) var(--sp4);border-radius:var(--r2);border:1.5px solid var(--border)" '+
            'onclick="responderCheckinBSC(\''+meta.id+'\',\'avancou\')">'+
            '<div style="font-size:13px;font-weight:600;color:var(--text)">Avançou</div>'+
            '<div style="font-size:11px;color:var(--muted)">Tivemos progresso real nessa semana</div>'+
          '</button>'+
          '<button class="btn btn-ghost" style="text-align:left;padding:var(--sp3) var(--sp4);border-radius:var(--r2);border:1.5px solid var(--border)" '+
            'onclick="responderCheckinBSC(\''+meta.id+'\',\'parou\')">'+
            '<div style="font-size:13px;font-weight:600;color:var(--text)">Parou</div>'+
            '<div style="font-size:11px;color:var(--muted)">Ainda não conseguimos avançar</div>'+
          '</button>'+
          '<button class="btn btn-ghost" style="text-align:left;padding:var(--sp3) var(--sp4);border-radius:var(--r2);border:1.5px solid var(--border)" '+
            'onclick="responderCheckinBSC(\''+meta.id+'\',\'concluiu\')">'+
            '<div style="font-size:13px;font-weight:600;color:var(--green)">Concluiu</div>'+
            '<div style="font-size:11px;color:var(--muted)">Essa meta foi alcançada</div>'+
          '</button>'+
        '</div>'+
        (restantes > 0 ? '<div style="margin-top:var(--sp3);font-size:11px;color:var(--muted);text-align:center">'+restantes+' meta'+(restantes>1?'s':'')+' restante'+(restantes>1?'s':'')+' para revisar</div>' : '')+
      '</div>'+
    '</div>'+
  '</div>';

  var old = document.getElementById('bsc-checkin-modal'); if(old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function responderCheckinBSC(metaId, resposta){
  var d = _getEstrategiaData();
  var meta = d.metas.find(function(m){ return m.id === metaId; });
  if(!meta){ document.getElementById('bsc-checkin-modal').remove(); return; }

  if(!meta.historico) meta.historico = [];
  var hoje = new Date().toISOString().split('T')[0];

  if(resposta === 'avancou'){
    // Incrementar 10% por semana de avanço
    meta.progressoManual = Math.min(95, (meta.progressoManual || meta.progresso || 0) + 10);
    meta.progresso = meta.progressoAuto != null
      ? Math.round((meta.progressoAuto + meta.progressoManual) / 2)
      : meta.progressoManual;
    meta.historico.push({data: hoje, valor: meta.progresso, fonte: 'checkin', resposta:'avancou'});
    toast('Ótimo avanço! Progresso atualizado.','success');
  } else if(resposta === 'parou'){
    meta.historico.push({data: hoje, valor: meta.progresso, fonte: 'checkin', resposta:'parou'});
    toast('Registrado. Considere adicionar uma ação na Agenda Executiva CEO para essa meta.','info',4000);
  } else if(resposta === 'concluiu'){
    meta.progressoManual = 100;
    meta.progresso = 100;
    meta._celebrado = false; // vai triggerar celebração
    meta.historico.push({data: hoje, valor: 100, fonte: 'checkin', resposta:'concluiu'});
    toast('Meta concluída! Parabéns.','success', 4000);
  }

  meta.updatedAt = new Date().toISOString();
  saveEstrategia(d);
  document.getElementById('bsc-checkin-modal').remove();

  // Próximas metas pendentes
  if(_bscMetasPendentes && _bscMetasPendentes.length > 0){
    var proximas = _bscMetasPendentes.slice();
    setTimeout(function(){ abrirCheckinBSC(proximas); }, 500);
  } else {
    renderEstrategia();
  }
}


// ── Mapa Estratégico BSC ──────────────────────────────
function abrirMetaNoMapa(metaId){
  // Abrir wizard no passo correto para editar
  var d=_getEstrategiaData();
  var meta=d.metas.find(function(m){return m.id===metaId;});
  if(!meta)return;
  var idx=_bscPerspectivas.findIndex(function(p){return p.id===meta.perspectiva;});
  // Carregar respostas existentes
  _bscRespostas={};
  d.metas.forEach(function(m){
    _bscRespostas[m.perspectiva]={
      descricao:m.descricao||'',alvo:m.alvo||'',realizado:m.realizado||'',
      horizonte:m.horizonte||'medio',progresso:m.progresso||0,
      addRotina:m.addRotina!==false,correlacaoId:m.correlacaoId||'',id:m.id
    };
  });
  _bscPassoAtual=idx>=0?idx:0;
  _renderBscModal();
}

function adicionarAcaoNoMapa(metaId){
  adicionarAcaoBSC(
    _bscPerspectivas.find(function(p){
      var d=_getEstrategiaData();
      return d.metas.some(function(m){return m.id===metaId&&m.perspectiva===p.id;});
    })||_bscPerspectivas[0]
  ).id;
}

function renderMapaEstrategico(d){
  var perspCores={
    financeira: {bg:'#EFF6FF', border:'#1B4F8A', text:'#1B4F8A', block:'#1B4F8A'},
    stakeholders:   {bg:'#E6F5EE', border:'#1A7A4A', text:'#1A7A4A', block:'#1A7A4A'},
    processos:  {bg:'#FBF3E0', border:'#B07D1A', text:'#B07D1A', block:'#B07D1A'},
    conhecimento:{bg:'#E8EFF8',border:'#0B1F3A', text:'#0B1F3A', block:'#0B1F3A'},
  };

  // Gerar SVG do mapa
  var W=680, ROW=100, LABEL=110, PAD=8;
  var H=_bscPerspectivas.length*ROW+PAD*2;

  var svg='<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" '+
    'style="width:100%;min-width:320px;border-radius:var(--r2);overflow:visible;display:block" role="img">'+
    '<defs>'+
      '<marker id="ma" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">'+
        '<path d="M0,0 L0,7 L7,3.5 z" fill="#9CA3AF"/>'+
      '</marker>'+
    '</defs>';

  // Faixas horizontais
  _bscPerspectivas.forEach(function(persp, pi){
    var cor=perspCores[persp.id]||perspCores.financeira;
    var y=PAD+pi*ROW;
    svg+='<rect x="0" y="'+y+'" width="'+W+'" height="'+ROW+'" fill="'+cor.bg+'" rx="'+(pi===0?'8':'0')+'"/>';
    if(pi<_bscPerspectivas.length-1){
      svg+='<line x1="0" y1="'+(y+ROW)+'" x2="'+W+'" y2="'+(y+ROW)+'" stroke="#CBD5E1" stroke-width="0.75"/>';
    }
    // Label perspectiva
    svg+='<rect x="0" y="'+y+'" width="'+LABEL+'" height="'+ROW+'" fill="'+cor.bg+'" opacity="0.7"/>';
    svg+='<line x1="'+LABEL+'" y1="'+y+'" x2="'+LABEL+'" y2="'+(y+ROW)+'" stroke="#CBD5E1" stroke-width="0.75"/>';
    // Quebrar label em 2 linhas se necessário
    var lblWords=persp.label.split(' ');
    var lbl1=lblWords.slice(0,Math.ceil(lblWords.length/2)).join(' ');
    var lbl2=lblWords.slice(Math.ceil(lblWords.length/2)).join(' ');
    svg+='<text x="'+(LABEL/2)+'" y="'+(y+ROW/2-(lbl2?8:4))+'">'+
      '<tspan text-anchor="middle" font-size="10" font-weight="bold" fill="'+cor.text+'" font-family="Arial,sans-serif">'+san(lbl1)+'</tspan>'+
    '</text>';
    if(lbl2)svg+='<text x="'+(LABEL/2)+'" y="'+(y+ROW/2+6)+'">'+
      '<tspan text-anchor="middle" font-size="10" font-weight="bold" fill="'+cor.text+'" font-family="Arial,sans-serif">'+san(lbl2)+'</tspan>'+
    '</text>';
  });

  // Borda arredondada inferior
  svg+='<rect x="0" y="'+(H-8)+'" width="'+W+'" height="8" fill="'+perspCores.conhecimento.bg+'"/>';

  // Blocos de metas e setas
  var BLOCK_W=150, BLOCK_H=66, BLOCK_GAP=12;
  var posicoes={}; // id → {cx, cy}

  _bscPerspectivas.forEach(function(persp, pi){
    var cor=perspCores[persp.id]||perspCores.financeira;
    var metasPersp=d.metas.filter(function(m){return m.perspectiva===persp.id;});
    var y=PAD+pi*ROW;
    var startX=LABEL+BLOCK_GAP;
    var totalW=(W-LABEL-BLOCK_GAP);
    var maxBlocos=Math.floor(totalW/(BLOCK_W+BLOCK_GAP));
    var n=Math.min(metasPersp.length, maxBlocos||2);

    metasPersp.slice(0,n).forEach(function(meta, mi){
      var bx=startX+mi*(BLOCK_W+BLOCK_GAP);
      var by=y+(ROW-BLOCK_H)/2;
      var prog=Math.min(100,Math.max(0,parseFloat(meta.progresso)||0));
      var progW=Math.round((BLOCK_W-16)*prog/100);

      // Bloco da meta — clicável
      var desc=meta.descricao||'';
      var descTrunc=desc.length>26?desc.substring(0,24)+'...':desc;
      var progColor=prog>=100?'#4ADE80':prog>50?'#FCD34D':'#93C5FD';
      var progW2=Math.round((BLOCK_W-16)*prog/100);

      // Container clicável com onclick
      svg+='<g style="cursor:pointer" onclick="abrirMetaNoMapa(\''+meta.id+'\')">'+
        '<rect x="'+bx+'" y="'+by+'" width="'+BLOCK_W+'" height="'+BLOCK_H+'" rx="6" fill="'+cor.block+'" stroke="'+cor.border+'" stroke-width="1"/>'+

        // Texto principal
        '<text x="'+(bx+BLOCK_W/2)+'" y="'+(by+18)+'" text-anchor="middle" font-size="10" font-weight="bold" fill="#FFFFFF" font-family="Arial,sans-serif">'+san(descTrunc)+'</text>'+

        // Alvo
        (meta.alvo?'<text x="'+(bx+BLOCK_W/2)+'" y="'+(by+31)+'" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.65)" font-family="Arial,sans-serif">'+san(meta.alvo.length>22?meta.alvo.substring(0,20)+'...':meta.alvo)+'</text>':'')+''+

        // Barra de progresso
        '<rect x="'+(bx+8)+'" y="'+(by+BLOCK_H-18)+'" width="'+(BLOCK_W-16)+'" height="5" rx="2.5" fill="rgba(255,255,255,0.2)"/>'+
        (progW2>0?'<rect x="'+(bx+8)+'" y="'+(by+BLOCK_H-18)+'" width="'+progW2+'" height="5" rx="2.5" fill="'+progColor+'"/>'    :'')+
        '<text x="'+(bx+BLOCK_W-10)+'" y="'+(by+BLOCK_H-8)+'" text-anchor="end" font-size="8" fill="rgba(255,255,255,0.8)" font-family="Arial,sans-serif">'+Math.round(prog)+'%</text>'+

        // Ícone de edição discreto
        '<text x="'+(bx+10)+'" y="'+(by+BLOCK_H-8)+'" font-size="8" fill="rgba(255,255,255,0.4)" font-family="Arial,sans-serif">editar</text>'+
      '</g>';

      // Salvar posição central do bloco para setas
      posicoes[meta.id]={
        cx:bx+BLOCK_W/2,
        cy:by+BLOCK_H/2,
        top:by,
        bottom:by+BLOCK_H,
        left:bx,
        right:bx+BLOCK_W,
        perspIdx:pi
      };
    });
  });

  // Setas reais — conectar por metaId OU por perspectiva (retrocompat)
  d.metas.forEach(function(meta){
    if(!meta.correlacaoId) return;
    var posOrigem=posicoes[meta.id];
    if(!posOrigem) return;

    var correlacoes=Array.isArray(meta.correlacaoId)?meta.correlacaoId:[meta.correlacaoId];
    correlacoes.filter(Boolean).forEach(function(corrId){
      // Tentar por metaId direto primeiro, depois por perspectiva (retrocompat)
      var metaDestino=d.metas.find(function(m){return m.id===corrId&&posicoes[m.id];});
      if(!metaDestino){
        // fallback: corrId é uma perspectiva
        var metasPersp=d.metas.filter(function(m){return m.perspectiva===corrId&&posicoes[m.id];});
        metaDestino=metasPersp[0];
      }
      if(!metaDestino) return;
      var posDest=posicoes[metaDestino.id];

      var x1=posOrigem.cx;
      var y1=posOrigem.top-2;
      var x2=posDest.cx;
      var y2=posDest.bottom+2;

      svg+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#6B7280" stroke-width="1.5" stroke-dasharray="6,3" marker-end="url(#ma)"/>';
      var midX=(x1+x2)/2+8;
      var midY=(y1+y2)/2;
      svg+='<text x="'+midX+'" y="'+midY+'" font-size="8" fill="#9CA3AF" font-family="Arial,sans-serif">impacta</text>';
    });
  });

  svg+='</svg>';
  return svg;
}

function renderEstrategia(){
  var container=document.getElementById('ceo-estrategia-content');
  if(!container)return;
  var d=_getEstrategiaData();
  var totalMetas=d.metas.length;
  var pctGeral=totalMetas>0?Math.round(d.metas.reduce(function(s,m){return s+(parseFloat(m.progresso)||0);},0)/totalMetas):0;

  // Verificar se tem pelo menos uma meta por perspectiva
  var temPlanejamento=_bscPerspectivas.every(function(p){return d.metas.some(function(m){return m.perspectiva===p.id;});});

  var html=
    // Header
    '<div style="background:var(--navy);border-radius:var(--r2);padding:var(--sp5);margin-bottom:var(--sp4)">'+
      '<div style="display:flex;align-items:flex-start;gap:var(--sp3);flex-wrap:wrap">'+
        '<div style="flex:1;min-width:180px">'+
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.5);margin-bottom:4px">Meu planejamento estratégico</div>'+
          '<div style="font-size:15px;font-weight:700;color:#fff;line-height:1.4">'+san(d.visao||'Onde você quer chegar com seu área / organização?')+'</div>'+
        '</div>'+
        '<button class="btn btn-ghost btn-sm" style="color:rgba(255,255,255,.7);border-color:rgba(255,255,255,.2)" onclick="editarVisaoBSC()">✏️ Visão</button>'+
      '</div>'+
      (totalMetas>0?
        '<div style="margin-top:var(--sp4)">'+
          '<div style="display:flex;justify-content:space-between;margin-bottom:6px">'+
            '<span style="font-size:11px;color:rgba(255,255,255,.6)">Progresso geral</span>'+
            '<span style="font-size:14px;font-weight:900;color:#fff">'+pctGeral+'%</span>'+
          '</div>'+
          '<div style="height:8px;background:rgba(255,255,255,.15);border-radius:4px">'+
            '<div style="height:8px;background:linear-gradient(90deg,#4ade80,#22d3ee);border-radius:4px;width:'+pctGeral+'%"></div>'+
          '</div>'+
        '</div>':'')+
    '</div>'+

    // Botão construir ou refazer
    '<div style="text-align:center;margin-bottom:var(--sp4)">'+
      (temPlanejamento?
        '<button class="btn btn-ghost btn-sm" onclick="abrirPlanejamentoBSC()">🔄 Atualizar planejamento</button>':
        '<button class="btn btn-primary" style="padding:14px 32px;font-size:15px;font-weight:700" onclick="abrirPlanejamentoBSC()">Construir meu planejamento estratégico</button>')+
    '</div>';

  // Cards com respostas
  if(totalMetas>0){
    html+='<div style="margin-bottom:var(--sp5)">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp2);flex-wrap:wrap;gap:4px">'+
        '<div style="font-size:13px;font-weight:700;color:var(--navy)">Mapa Estratégico</div>'+
        '<div style="font-size:10px;color:var(--muted)">Progresso avança ao concluir ações na Agenda Executiva</div>'+
      '</div>'+
      '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:var(--r2)">'+
        renderMapaEstrategico(d)+
      '</div>'+
    '</div>';
    html+='<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp3)">Suas metas</div>';
    html+='<div style="display:flex;flex-direction:column;gap:0;align-items:stretch">';

    // Ordem invertida para mostrar de baixo pra cima visualmente
    var ordem=[0,1,2,3]; // financeira, stakeholders, processos, crescimento
    ordem.forEach(function(idx,i){
      var persp=_bscPerspectivas[idx];
      var metasPersp=d.metas.filter(function(m){return m.perspectiva===persp.id;});
      var pctPersp=metasPersp.length>0?Math.round(metasPersp.reduce(function(s,m){return s+(parseFloat(m.progresso)||0);},0)/metasPersp.length):0;
      var meta=metasPersp[0]; // principal

      var celebrar=pctPersp>=100&&metasPersp.length>0;
      html+='<div class="card" style="border-left:4px solid '+persp.color+';border-radius:var(--r2);padding:var(--sp4);'+(celebrar?'background:linear-gradient(135deg,'+persp.bg+',var(--white))':'')+'">'+
        // Header do card
        '<div style="display:flex;align-items:center;gap:var(--sp2);margin-bottom:var(--sp3)">'+
          '<div style="width:32px;height:32px;border-radius:50%;background:'+persp.color+';display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;font-weight:900;flex-shrink:0">'+(celebrar?'✓':(persp.passo||''))+'</div>'+
          '<span style="font-size:18px">'+persp.icon+'</span>'+
          '<div style="font-size:13px;font-weight:800;color:var(--navy);flex:1">'+persp.label+'</div>'+
          (celebrar?'<span style="font-size:11px;font-weight:700;color:var(--green);background:#E8F3EE;padding:2px 8px;border-radius:var(--r4)">Concluído</span>':
            '<span style="font-size:13px;font-weight:800;color:'+persp.color+'">'+pctPersp+'%</span>')+
        '</div>'+
        // Metas da perspectiva
        (metasPersp.length>0?
          '<div style="display:flex;flex-direction:column;gap:var(--sp2);margin-bottom:var(--sp3)">'+
          metasPersp.map(function(m){
            var mp=Math.min(100,Math.max(0,parseFloat(m.progresso)||0));
            var mc=mp>=100?'var(--green)':mp>50?persp.color:'var(--muted)';
            return '<div style="background:var(--bg2);border-radius:var(--r1);padding:var(--sp3)">'+
              '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">'+san(m.descricao||'')+'</div>'+
              (m.alvo?'<div style="font-size:11px;color:var(--muted);margin-bottom:8px">'+san(m.alvo||'')+(m.realizado?' · Hoje: <strong>'+san(m.realizado||'')+'</strong>':'')+'</div>':'')+
              (m.proximaAcao?'<div style="font-size:11px;color:var(--blue);margin-bottom:8px">Esta semana: '+san(m.proximaAcao||'')+'</div>':'')+
              // Slider arrastável
              '<div style="display:flex;align-items:center;gap:var(--sp2)">'+
                '<input type="range" min="0" max="100" value="'+mp+'" '+
                  'style="flex:1;accent-color:'+persp.color+';cursor:pointer;height:6px" '+
                  'data-mid="'+m.id+'" data-pid="'+persp.id+'" '+
                  'onchange="atualizarProgressoBSC(this)" '+
                  'oninput="this.nextElementSibling.textContent=this.value+\'%\'" '+
                '>'+
                '<span style="font-size:12px;font-weight:800;color:'+mc+';min-width:36px;text-align:right">'+Math.round(mp)+'%</span>'+
              '</div>'+
            '</div>';
          }).join('')+
          '</div>':
          '<div style="font-size:12px;color:var(--muted2);font-style:italic;margin-bottom:var(--sp3)">Não respondido ainda</div>')+
        // Botões
        '<div style="display:flex;gap:var(--sp2);flex-wrap:wrap">'+
          '<button class="btn btn-ghost btn-sm" onclick="abrirPlanejamentoBSC('+idx+')" title="Editar principal">Editar</button>'+
          '<button class="btn btn-ghost btn-sm" onclick="adicionarMetaBSC(this.dataset.p)" data-p="'+persp.id+'">+ Meta</button>'+
          '<button class="btn btn-ghost btn-sm" onclick="adicionarAcaoBSC(this.dataset.p)" data-p="'+persp.id+'">Ação da semana</button>'+
        '</div>'+
      '</div>';

      // Seta entre cards (exceto depois do último)
      if(i<3){
        html+='<div style="text-align:center;font-size:24px;color:var(--muted);line-height:1;padding:4px 0">↓</div>';
      }
    });

    html+='</div>';

    // Nota
    html+='<div style="margin-top:var(--sp4);padding:var(--sp3) var(--sp4);background:var(--bg2);border-radius:var(--r1);font-size:11px;color:var(--muted);text-align:center">'+
      'Cada nível alimenta o próximo — da base 🌱 até o resultado 💰'+
    '</div>';
  } else {
    html+='<div style="text-align:center;padding:var(--sp6);color:var(--muted)">'+
      '<div style="font-size:48px;margin-bottom:var(--sp3)">🎯</div>'+
      '<div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:8px">Seu planejamento estratégico está em branco</div>'+
      '<div style="font-size:13px;line-height:1.6;max-width:360px;margin:0 auto">'+
        'Responda 4 perguntas simples e o GPS monta seu planejamento — com metas, prazos e acompanhamento de progresso.'+
      '</div>'+
    '</div>';
  }

  container.innerHTML=html;
}


function editarVisaoBSC(){
  var d=_getEstrategiaData();
  var vAtual=d.visao||'';
  var html='<div class="overlay open" id="visao-modal" onclick="if(event.target===this)document.getElementById(\'visao-modal\').remove()">'+
    '<div class="modal" style="max-width:480px;max-height:90vh;display:flex;flex-direction:column">'+
      '<div class="modal-header modal-header-navy">'+
        '<div><div class="modal-title">🧭 Visão do área / organização</div>'+
        '<div class="modal-subtitle">3 perguntas para construir sua visão</div></div>'+
        '<button class="modal-close" onclick="document.getElementById(\'visao-modal\').remove()">✕</button>'+
      '</div>'+
      '<div class="modal-body" style="display:flex;flex-direction:column;gap:var(--sp4)">'+
        '<div style="background:var(--bg2);border-radius:var(--r1);padding:var(--sp3) var(--sp4);font-size:12px;color:var(--muted);line-height:1.5">'+
          'Responda as 3 perguntas abaixo e o GPS monta sua visão automaticamente.'+
        '</div>'+
        '<div><label class="form-label">O que você vende ou execução?</label>'+
        '<input class="input" id="v-oque" placeholder="Ex: consultoria de gestão, cursos, serviços de design"></div>'+
        '<div><label class="form-label">Para quem?</label>'+
        '<input class="input" id="v-pquem" placeholder="Ex: pequenos empresários, profissionais autônomos"></div>'+
        '<div><label class="form-label">Qual diferença isso faz na vida deles?</label>'+
        '<input class="input" id="v-diferenca" placeholder="Ex: saem do caos e passam a ter clareza e controle"></div>'+
        '<div style="border-top:1px solid var(--border);padding-top:var(--sp3)">'+
          '<label class="form-label">Ou escreva sua visão diretamente</label>'+
          '<textarea class="input" id="v-direta" rows="2" placeholder="Ex: Ser referência em gestão para pequenos empresários">'+san(vAtual)+'</textarea>'+
        '</div>'+
      '</div>'+
      '<div class="modal-footer">'+
        '<button class="btn btn-ghost" onclick="document.getElementById(\'visao-modal\').remove()">Cancelar</button>'+
        '<button class="btn btn-primary" onclick="salvarVisaoBSC()">Salvar visão</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var old=document.getElementById('visao-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  setTimeout(function(){document.getElementById('v-oque').focus();},100);
}

function salvarVisaoBSC(){
  var oque=(document.getElementById('v-oque')||{}).value||'';
  var pquem=(document.getElementById('v-pquem')||{}).value||'';
  var dif=(document.getElementById('v-diferenca')||{}).value||'';
  var direta=(document.getElementById('v-direta')||{}).value||'';
  var visao='';
  if(direta.trim()){visao=direta.trim();}
  else if(oque.trim()&&pquem.trim()){
    visao='Execuçãor '+oque.trim()+' para '+pquem.trim()+(dif.trim()?' — para que '+dif.trim():'')+'.'
  }
  if(!visao){toast('Preencha pelo menos o que vende e para quem','error');return;}
  var d=_getEstrategiaData();
  d.visao=visao;
  saveEstrategia(d);
  document.getElementById('visao-modal').remove();
  renderEstrategia();
  toast('Visão salva!','success');
}

// Modal guiado em 4 passos
var _bscPassoAtual=0;
var _bscRespostas={};

function abrirPlanejamentoBSC(passoInicial){
  _bscPassoAtual=passoInicial||0;
  // Carregar respostas existentes
  var d=_getEstrategiaData();
  _bscRespostas={};
  _bscPerspectivas.forEach(function(p){
    var meta=d.metas.find(function(m){return m.perspectiva===p.id;});
    if(meta)_bscRespostas[p.id]={
      descricao:meta.descricao||'',
      alvo:meta.alvo||'',
      realizado:meta.realizado||'',
      horizonte:meta.horizonte||'medio',
      progresso:meta.progresso||0,
      addRotina:meta.addRotina!==false,
      id:meta.id
    };
  });
  _renderBscModal();
}

function _renderBscModal(){
  var old=document.getElementById('bsc-wizard-modal');if(old)old.remove();

  var persp=_bscPerspectivas[_bscPassoAtual];
  var resp=_bscRespostas[persp.id]||{};
  var isUltimo=_bscPassoAtual===_bscPerspectivas.length-1;
  var isPrimeiro=_bscPassoAtual===0;

  var prazoOpts=[
    {id:'curto',l:'Próximo mês'},
    {id:'medio',l:'Em 6 meses'},
    {id:'longo',l:'Em 1 ano ou mais'},
  ].map(function(h){
    return '<option value="'+h.id+'"'+((resp.horizonte||'medio')===h.id?' selected':'')+'>'+h.l+'</option>';
  }).join('');

  var html='<div class="overlay open" id="bsc-wizard-modal">'+
    '<div class="modal" style="max-width:520px;display:flex;flex-direction:column;max-height:90vh;overflow:clip">'+

      // Header colorido com progresso
      '<div style="background:'+persp.color+';padding:var(--sp4);flex-shrink:0">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp3)">'+
          '<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7)">PASSO '+persp.passo+' DE 4</div>'+
          '<button onclick="document.getElementById(\'bsc-wizard-modal\').remove()" style="background:none;border:none;color:rgba(255,255,255,.7);font-size:18px;cursor:pointer;line-height:1">✕</button>'+
        '</div>'+
        // Barra de progresso do wizard
        '<div style="display:flex;gap:4px;margin-bottom:var(--sp3)">'+
        _bscPerspectivas.map(function(p,i){
          return '<div style="flex:1;height:4px;border-radius:2px;background:'+(i<=_bscPassoAtual?'rgba(255,255,255,.9)':'rgba(255,255,255,.25)')+'"></div>';
        }).join('')+
        '</div>'+
        '<div style="font-size:22px;margin-bottom:4px">'+persp.icon+'</div>'+
        '<div style="font-size:18px;font-weight:800;color:#fff;line-height:1.3">'+persp.perguntaPrincipal+'</div>'+
      '</div>'+

      // Body scrollável
      '<div style="flex:1;overflow-y:auto;padding:var(--sp4);display:flex;flex-direction:column;gap:var(--sp4)">'+

        '<div style="font-size:12px;color:var(--muted);background:var(--bg2);padding:var(--sp3);border-radius:var(--r1)">'+persp.perguntaDetalhe+'</div>'+

        '<div>'+
          '<label class="form-label">Sua resposta *</label>'+
          '<textarea class="input" id="bsc-w-desc" rows="3" placeholder="'+persp.placeholder+'" style="resize:none">'+san(resp.descricao||'')+'</textarea>'+
        '</div>'+

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp3)">'+
          '<div>'+
            '<label class="form-label">Número que quer atingir</label>'+
            '<input class="input" id="bsc-w-alvo" placeholder="Ex: R$ 30.000/mês" value="'+san(resp.alvo||'')+'">'+
          '</div>'+
          '<div>'+
            '<label class="form-label">Onde está hoje</label>'+
            '<input class="input" id="bsc-w-realizado" placeholder="Ex: R$ 12.000/mês" value="'+san(resp.realizado||'')+'">'+
          '</div>'+
        '</div>'+

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp3)">'+
          '<div>'+
            '<label class="form-label">'+persp.prazoLabel+'</label>'+
            '<select class="input" id="bsc-w-horizonte">'+prazoOpts+'</select>'+
          '</div>'+
          '<div>'+
            '<label class="form-label">Progresso atual (%)</label>'+
            '<input class="input" type="number" id="bsc-w-prog" min="0" max="100" value="'+san(String(resp.progresso||0))+'">'+
          '</div>'+
        '</div>'+

        // Pergunta de correlação — passos 2, 3 e 4
        (!isPrimeiro?
          '<div style="background:var(--bg2);border-left:3px solid '+persp.color+';border-radius:var(--r1);padding:var(--sp3) var(--sp4)">'+
            '<div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:6px">Esta ação impacta diretamente alguma das perspectivas acima?</div>'+
            '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">'+
              'Marque todas as perspectivas que esta ação impacta. O mapa vai desenhar as setas automaticamente.'+
            '</div>'+
            '<div style="display:flex;flex-direction:column;gap:6px">'+
              // Mostrar metas cadastradas das perspectivas anteriores (não as perspectivas em si)
              (function(){
                var d=_getEstrategiaData();
                var metasAnteriores=[];
                _bscPerspectivas.slice(0,_bscPassoAtual).forEach(function(p){
                  var metasPersp=d.metas.filter(function(m){return m.perspectiva===p.id&&m.descricao;});
                  metasPersp.forEach(function(m){
                    metasAnteriores.push({id:m.id,label:p.label,descricao:m.descricao,perspectiva:p.id,color:p.color});
                  });
                  // Se não tem meta ainda, usa a resposta do wizard em andamento
                  if(metasPersp.length===0&&_bscRespostas[_bscPerspectivas.indexOf(p)]){
                    var r2=_bscRespostas[p.id]||_bscRespostas[_bscPerspectivas.indexOf(p)];
                    if(r2&&r2.descricao){
                      metasAnteriores.push({id:r2.id||('meta_tmp_'+p.id),label:p.label,descricao:r2.descricao,perspectiva:p.id,color:p.color});
                    }
                  }
                });
                if(metasAnteriores.length===0){
                  return '<div style="font-size:11px;color:var(--muted2);font-style:italic">Preencha as perspectivas anteriores para criar vínculos</div>';
                }
                var correlacoes=Array.isArray(resp.correlacaoId)?resp.correlacaoId:(resp.correlacaoId?[resp.correlacaoId]:[]);
                return metasAnteriores.map(function(m){
                  var checked=correlacoes.indexOf(m.id)>=0;
                  return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;padding:8px 10px;border-radius:var(--r1);background:var(--white);border:1px solid var(--border)">'+
                    '<input type="checkbox" class="bsc-correlacao-cb" value="'+m.id+'" '+(checked?'checked':'')+'>'+
                    '<div style="flex:1">'+
                      '<div style="font-size:10px;font-weight:700;color:'+m.color+';text-transform:uppercase;letter-spacing:.06em">'+san(m.label)+'</div>'+
                      '<div style="font-size:12px;font-weight:600;color:var(--text)">'+san(m.descricao.length>50?m.descricao.substring(0,48)+'...':m.descricao)+'</div>'+
                    '</div>'+
                  '</label>';
                }).join('');
              })()+
              '<div style="font-size:10px;color:var(--muted2);margin-top:4px">Deixe em branco se for independente</div>'+
            '</div>'+
          '</div>':'')+''+

        // Pergunta da agenda-executiva só no último passo
        (isUltimo?
          '<div style="background:#FEF3C7;border-left:3px solid var(--amber);border-radius:var(--r1);padding:var(--sp3) var(--sp4)">'+
            '<div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:4px">Uma última coisa importante</div>'+
            '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">'+
              'Planejamentos que entram na agenda-executiva semanal têm muito mais chance de acontecer. '+
              'Quer que o GPS inclua as suas metas na Agenda Executiva CEO para você não perder de vista?'+
            '</div>'+
            '<div style="display:flex;gap:var(--sp3)">'+
              '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">'+
                '<input type="radio" name="bsc-w-agenda-executiva" value="sim" checked> Sim, incluir na agenda-executiva'+
              '</label>'+
              '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">'+
                '<input type="radio" name="bsc-w-agenda-executiva" value="nao"> Agora não'+
              '</label>'+
            '</div>'+
          '</div>':'')+''+

      '</div>'+

      // Footer com botões — sticky no mobile
      '<div style="padding:var(--sp4);border-top:1px solid var(--border);display:flex;gap:var(--sp2);flex-shrink:0;background:var(--white)">'+
        (!isPrimeiro?'<button class="btn btn-ghost" onclick="_bscVoltar()">← Voltar</button>':'')+
        // Botão excluir meta — só quando editando meta existente
        (resp&&resp.id?'<button class="btn btn-ghost" style="color:var(--red)" onclick="excluirMetaBSCWizard(this.dataset.id)" data-id="'+resp.id+'">Excluir</button>':'')+
        '<div style="flex:1"></div>'+
        (isUltimo?
          '<button class="btn btn-primary" onclick="_bscConcluir()">Concluir planejamento</button>':
          '<button class="btn btn-primary" onclick="_bscAvancar()">Próximo →</button>')+
      '</div>'+

    '</div>'+
  '</div>';

  document.body.insertAdjacentHTML('beforeend',html);
  setTimeout(function(){var n=document.getElementById('bsc-w-desc');if(n)n.focus();},100);
}

function _bscSalvarPassoAtual(){
  var persp=_bscPerspectivas[_bscPassoAtual];
  var desc=(document.getElementById('bsc-w-desc')||{}).value||'';
  var correlacaoCbs=Array.from(document.querySelectorAll('.bsc-correlacao-cb:checked'));
  var correlacaoId=correlacaoCbs.length>0?correlacaoCbs.map(function(cb){return cb.value;}):'';
  _bscRespostas[persp.id]={
    descricao:desc.trim(),
    alvo:(document.getElementById('bsc-w-alvo')||{}).value||'',
    realizado:(document.getElementById('bsc-w-realizado')||{}).value||'',
    horizonte:(document.getElementById('bsc-w-horizonte')||{}).value||'medio',
    progresso:parseFloat((document.getElementById('bsc-w-prog')||{}).value)||0,
    addRotina:true,
    correlacaoId:correlacaoId||null,
    id:(_bscRespostas[persp.id]&&_bscRespostas[persp.id].id)||('meta_'+Date.now()+'_'+persp.id)
  };
}

function _bscAvancar(){
  var desc=(document.getElementById('bsc-w-desc')||{}).value||'';
  if(!desc.trim()){toast('Escreva sua resposta antes de avançar','error');return;}
  _bscSalvarPassoAtual();
  _bscPassoAtual++;
  _renderBscModal();
}

function _bscVoltar(){
  _bscSalvarPassoAtual();
  _bscPassoAtual--;
  _renderBscModal();
}

function _bscConcluir(){
  var desc=(document.getElementById('bsc-w-desc')||{}).value||'';
  if(!desc.trim()){toast('Escreva sua resposta antes de concluir','error');return;}
  _bscSalvarPassoAtual();

  var rotinaRadio=document.querySelector('input[name="bsc-w-agenda-executiva"]:checked');
  var addRotina=rotinaRadio?rotinaRadio.value==='sim':true;

  var d=_getEstrategiaData();
  var rotina=getRotina();

  _bscPerspectivas.forEach(function(persp){
    var resp=_bscRespostas[persp.id];
    if(!resp||!resp.descricao)return;

    var metaId=resp.id||('meta_'+Date.now()+'_'+persp.id);
    var meta={
      id:metaId,
      perspectiva:persp.id,
      descricao:resp.descricao,
      alvo:resp.alvo||'',
      realizado:resp.realizado||'',
      horizonte:resp.horizonte||'medio',
      progresso:resp.progresso||0,
      status:resp.progresso>=100?'ok':resp.progresso>0?'atencao':'ok',
      addRotina:addRotina,
      correlacaoId:resp.correlacaoId||null,
      updatedAt:new Date().toISOString()
    };
    if(!meta.createdAt)meta.createdAt=new Date().toISOString();

    var idx=d.metas.findIndex(function(m){return m.id===metaId||m.perspectiva===persp.id;});
    if(idx>=0)d.metas[idx]=meta;
    else d.metas.push(meta);

    // Adicionar na agenda-executiva
    if(addRotina){
      var jaExiste=rotina.some(function(r){return r._bscMetaId===metaId;});
      if(!jaExiste){
        rotina.push({
          id:'rot_bsc_'+Date.now()+'_'+persp.id,
          titulo:persp.icon+' '+resp.descricao.substring(0,55)+(resp.descricao.length>55?'...':''),
          col:'fazer',
          area:'operacional',
          energia:'media',
          tipo:'estrategia',
          _bscMetaId:metaId,
          notas:'Meta estratégica — '+persp.label,
          createdAt:new Date().toISOString()
        });
      }
    }
  });

  saveEstrategia(d);
  if(addRotina)saveRotina(agenda-executiva);
  document.getElementById('bsc-wizard-modal').remove();
  renderEstrategia();
  toast('Planejamento estratégico salvo! ✓','success',4000);
}

function openMetaBSC(perspectiva,editId){
  // Abrir wizard no passo correto
  var idx=_bscPerspectivas.findIndex(function(p){return p.id===perspectiva;});
  abrirPlanejamentoBSC(idx>=0?idx:0);
}

function salvarMetaBSC(editId,perspectiva){
  // Compatibilidade — redireciona para o wizard
  abrirPlanejamentoBSC();
}



function atualizarProgressoBSC(el){
  var metaId=el.dataset.mid;
  var novoVal=parseFloat(el.value)||0;
  var d=_getEstrategiaData();
  var meta=d.metas.find(function(m){return m.id===metaId;});
  if(!meta)return;
  meta.progressoManual=novoVal;
  meta.progresso=meta.progressoAuto!=null?Math.round((meta.progressoAuto+novoVal)/2):novoVal;
  meta.updatedAt=new Date().toISOString();
  if(!meta.historico)meta.historico=[];
  meta.historico.push({data:new Date().toISOString().split('T')[0],valor:meta.progresso,fonte:'manual'});
  saveEstrategia(d);
  if(meta.progresso>=100&&!meta._celebrado){
    meta._celebrado=true;saveEstrategia(d);
    setTimeout(function(){toast('Meta concluída!','success',4000);renderEstrategia();},300);
  }
}

function adicionarMetaBSC(perspId){
  var persp=_bscPerspectivas.find(function(p){return p.id===perspId;})||_bscPerspectivas[0];
  var html='<div class="overlay open" id="bsc-add-modal" onclick="if(event.target===this)document.getElementById(\'bsc-add-modal\').remove()">'+
    '<div class="modal" style="max-width:460px;max-height:90vh;display:flex;flex-direction:column">'+
      '<div class="modal-header" style="background:'+persp.color+';padding:var(--sp4);flex-shrink:0">'+
        '<div style="font-size:15px;font-weight:800;color:#fff">'+persp.icon+' '+persp.label+' — Nova meta</div>'+
        '<button onclick="document.getElementById(\'bsc-add-modal\').remove()" style="background:none;border:none;color:rgba(255,255,255,.8);font-size:18px;cursor:pointer">✕</button>'+
      '</div>'+
      '<div class="modal-body" style="display:flex;flex-direction:column;gap:var(--sp3)">'+
        '<div style="font-size:12px;color:var(--muted);font-style:italic">'+persp.perguntaPrincipal+'</div>'+
        '<div>'+
          '<label class="form-label">Meta *</label>'+
          '<textarea class="input" id="bsc-add-desc" rows="2" placeholder="'+persp.placeholder+'"></textarea>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp3)">'+
          '<div><label class="form-label">Número alvo</label>'+
          '<input class="input" id="bsc-add-alvo" placeholder="Ex: R$ 50.000/mês"></div>'+
          '<div><label class="form-label">Hoje está em</label>'+
          '<input class="input" id="bsc-add-real" placeholder="Ex: R$ 20.000/mês"></div>'+
        '</div>'+
        '<div><label class="form-label">Prazo</label>'+
        '<select class="input" id="bsc-add-prazo">'+
          '<option value="curto">Próximo mês</option>'+
          '<option value="medio" selected>Em 6 meses</option>'+
          '<option value="longo">Em 1 ano ou mais</option>'+
        '</select></div>'+
      '</div>'+
      '<div class="modal-footer">'+
        '<button class="btn btn-ghost" onclick="document.getElementById(\'bsc-add-modal\').remove()">Cancelar</button>'+
        '<button class="btn btn-primary" data-pid="'+perspId+'" onclick="salvarNovaMetaBSC(this.dataset.pid)">Salvar meta</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var old=document.getElementById('bsc-add-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  setTimeout(function(){document.getElementById('bsc-add-desc').focus();},100);
}

function salvarNovaMetaBSC(perspId){
  var desc=(document.getElementById('bsc-add-desc')||{}).value||'';
  if(!desc.trim()){toast('Escreva a meta','error');return;}
  var d=_getEstrategiaData();
  var meta={
    id:'meta_'+Date.now(),
    perspectiva:perspId,
    descricao:desc.trim(),
    alvo:(document.getElementById('bsc-add-alvo')||{}).value||'',
    realizado:(document.getElementById('bsc-add-real')||{}).value||'',
    horizonte:(document.getElementById('bsc-add-prazo')||{}).value||'medio',
    progresso:0,status:'ok',
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
  d.metas.push(meta);
  saveEstrategia(d);
  document.getElementById('bsc-add-modal').remove();
  renderEstrategia();
  toast('Meta adicionada!','success');
}

function adicionarAcaoBSC(perspId){
  var persp=_bscPerspectivas.find(function(p){return p.id===perspId;})||_bscPerspectivas[0];
  var d=_getEstrategiaData();
  var meta=d.metas.find(function(m){return m.perspectiva===perspId;});
  if(!meta){toast('Adicione uma meta primeiro','error');return;}
  var html='<div class="overlay open" id="bsc-acao-modal" onclick="if(event.target===this)document.getElementById(\'bsc-acao-modal\').remove()">'+
    '<div class="modal" style="max-width:420px;max-height:90vh;display:flex;flex-direction:column">'+
      '<div class="modal-header" style="background:var(--amber);padding:var(--sp4);flex-shrink:0">'+
        '<div style="font-size:15px;font-weight:800;color:#fff">Ação desta semana</div>'+
        '<button onclick="document.getElementById(\'bsc-acao-modal\').remove()" style="background:none;border:none;color:rgba(255,255,255,.8);font-size:18px;cursor:pointer">✕</button>'+
      '</div>'+
      '<div class="modal-body">'+
        '<div style="font-size:12px;color:var(--muted);margin-bottom:var(--sp3)">'+
          'Uma ação pequena e concreta que você vai fazer <strong>essa semana</strong> para avançar em:<br>'+
          '<em>'+san(meta.descricao)+'</em>'+
        '</div>'+
        '<textarea class="input" id="bsc-acao-txt" rows="2" placeholder="Ex: Ligar para 5 stakeholders potenciais até sexta-feira">'+san(meta.proximaAcao||'')+'</textarea>'+
      '</div>'+
      '<div class="modal-footer">'+
        '<button class="btn btn-ghost" onclick="document.getElementById(\'bsc-acao-modal\').remove()">Cancelar</button>'+
        '<button class="btn btn-primary" data-mid="'+meta.id+'" onclick="salvarAcaoBSC(this.dataset.mid)">Salvar ação</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var old=document.getElementById('bsc-acao-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  setTimeout(function(){document.getElementById('bsc-acao-txt').focus();},100);
}

function salvarAcaoBSC(metaId){
  var txt=(document.getElementById('bsc-acao-txt')||{}).value||'';
  var d=_getEstrategiaData();
  var meta=d.metas.find(function(m){return m.id===metaId;});
  if(!meta)return;
  meta.proximaAcao=txt.trim();
  meta.updatedAt=new Date().toISOString();
  saveEstrategia(d);
  document.getElementById('bsc-acao-modal').remove();
  renderEstrategia();
  toast(txt?'Ação salva na sua meta!':'Ação removida','success');
  // Também adicionar na agenda-executiva
  if(txt.trim()){
    var rotina=getRotina();
    // Remover ação anterior desta meta se existir
    rotina=rotina.filter(function(r){return r._bscAcaoMetaId!==metaId;});
    // Adicionar no formato correto da Agenda Executiva CEO
    rotina.push({
      id:'rot_acao_'+Date.now(),
      titulo:''+txt.trim().substring(0,60),
      col:'fazer',
      area:'operacional',
      energia:'alta',
      tipo:'estrategia',
      _bscAcaoMetaId:metaId,
      notas:'Ação estratégica do Planejamento CEO',
      createdAt:new Date().toISOString()
    });
    saveRotina(agenda-executiva);
    toast('Ação salva e adicionada à Agenda Executiva CEO!','success',3000);
  }
}


function excluirMetaBSCWizard(metaId){
  if(!confirm('Excluir esta meta do planejamento?'))return;
  var d=_getEstrategiaData();
  d.metas=d.metas.filter(function(m){return m.id!==metaId;});
  saveEstrategia(d);
  document.getElementById('bsc-wizard-modal').remove();
  renderEstrategia();
  toast('Meta excluída','success');
}

function excluirMetaBSC(metaId){
  if(!confirm('Excluir esta meta?'))return;
  var d=_getEstrategiaData();
  d.metas=d.metas.filter(function(m){return m.id!==metaId;});
  saveEstrategia(d);
  renderEstrategia();
  toast('Meta excluída','success');
}

// Momento Estratégico tab
function renderMomentoTab(){
  var container=document.getElementById('ceo-momento-content');if(!container)return;
  // Renderizar próximos passos do Home dentro do Momento Estratégico
  var proxDiv=document.getElementById('dash-proximos-planejamento');
  if(proxDiv){
    var diag2=getExecutivoDiag();
    var proxHtml='<div style="margin-bottom:var(--sp4)">';
    if(!diag2){
      proxHtml+='<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp2)">Próximo passo</div>'+
        '<div style="background:var(--navy);border-radius:var(--r2);padding:var(--sp4);display:flex;align-items:center;gap:var(--sp3);cursor:pointer" onclick="openDiagExecutivo()">'+
          '<div style="flex:1">'+
            '<div style="font-size:13px;font-weight:700;color:#fff">Fazer o Diagnóstico do Executivo</div>'+
            '<div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:2px">12 perguntas que personalizam todas as recomendações do GPS para o seu perfil de gestor</div>'+
          '</div>'+
          '<span style="color:rgba(255,255,255,.4);font-size:18px">›</span>'+
        '</div>';
    }
    proxHtml+='</div>';
    proxDiv.innerHTML=proxHtml;
  }
  var diag=getExecutivoDiag();
  if(!diag){container.innerHTML='<div class="empty-state"><div class="empty-state-icon">⟐</div><div class="empty-state-title">Faca o Diagnostico do Executivo primeiro</div><div class="empty-state-desc">12 perguntas. O diagnostico personaliza a sessao para o seu perfil.</div><button class="btn btn-ceo" style="margin-top:20px" onclick="openDiagExecutivo()">Fazer diagnostico</button></div>';return;}
  var diasDiag=diasSem(diag.data);
  container.innerHTML=
    '<div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r2);padding:var(--sp4) var(--sp5);margin-bottom:var(--sp4)">'+
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:var(--sp4)">'+
    '<div style="width:40px;height:40px;border-radius:var(--r2);background:var(--ceo-lt);display:flex;align-items:center;justify-content:center;font-size:20px">⟐</div>'+
    '<div><div style="font-size:14px;font-weight:800;color:var(--text)">'+san(diag.perfil)+' · '+san(diag.perfilSecundario||'')+'</div>'+
    '<div style="font-size:11px;color:var(--muted)">Diagnostico '+(diasDiag===0?'feito hoje':'ha '+diasDiag+' dia'+(diasDiag>1?'s':''))+'</div></div>'+
    '<button onclick="openDiagExecutivo()" class="btn btn-ghost btn-sm" style="margin-left:auto">Rediagnosticar</button></div>'+
    (diasDiag>=90?'<div style="padding:10px 12px;background:var(--amber-lt);border-radius:var(--r1);font-size:12px;color:var(--amber);font-weight:600">Seu diagnostico tem '+diasDiag+' dias. Considere refaze-lo.</div>':'')+
    '</div>'+
    '<button class="btn btn-ceo" onclick="openMomentoCEO()">⟐ Iniciar sessao Momento Estratégico</button>';
}

// Diagnostico do Executivo (12 perguntas)
var DONO_PERGUNTAS_V2=[
  {bloco:'Como voce decide',pergunta:'Voce precisa contratar alguem para uma funcao importante. Tem dois candidatos, um com mais experiencia, outro com mais potencial. Os dados nao sao conclusivos. O que voce faz?',opcoes:[{texto:'Decide rapido pelo que parece mais promissor e ajusta se nao funcionar',perfil:'Comandante'},{texto:'Cria um processo de avaliacao mais detalhado antes de decidir',perfil:'Artesao'},{texto:'Conversa com pessoas de confianca para ouvir perspectivas diferentes',perfil:'Conector'},{texto:'Apresenta a visao do negocio para os dois e decide pelo que se conectou mais',perfil:'Catalisador'}]},
  {bloco:'Como voce decide',pergunta:'O negocio esta indo bem, mas voce sente que esta deixando uma oportunidade de crescimento passar. O risco e real, mas o potencial tambem. Como voce reage?',opcoes:[{texto:'Avanca. Oportunidade perdida doi mais do que risco calculado',perfil:'Comandante'},{texto:'Mapeia os cenarios possiveis antes de qualquer movimento',perfil:'Artesao'},{texto:'Busca parceiros ou aliados para dividir o risco e a execucao',perfil:'Conector'},{texto:'Se a ideia te entusiasma de verdade, vai. O entusiasmo e um sinal',perfil:'Catalisador'}]},
  {bloco:'Como voce decide',pergunta:'Voce tomou uma decisao importante e percebeu que foi um erro. Qual e sua reacao honesta?',opcoes:[{texto:'Assume, corrige o rumo e segue, sem gastar energia em culpa',perfil:'Comandante'},{texto:'Analisa o que levou ao erro para nao repetir o mesmo padrao',perfil:'Artesao'},{texto:'Conversa com alguem proximo. Processar junto ajuda mais do que processar sozinho',perfil:'Conector'},{texto:'Transforma o erro em aprendizado e ja esta pensando no proximo movimento',perfil:'Catalisador'}]},
  {bloco:'Como voce executa',pergunta:'Voce tem tres frentes abertas ao mesmo tempo e todas parecem urgentes. O que acontece?',opcoes:[{texto:'Prioriza a que tem maior impacto e empurra as outras para depois',perfil:'Comandante'},{texto:'Cria uma lista estruturada e resolve uma de cada vez, do inicio ao fim',perfil:'Artesao'},{texto:'Verifica quem pode ajudar em alguma das frentes antes de sair executando sozinho',perfil:'Conector'},{texto:'Trabalha em paralelo. A energia de uma frente alimenta a outra',perfil:'Catalisador'}]},
  {bloco:'Como voce executa',pergunta:'Voce delega uma tarefa importante para alguem da equipe. Como voce se comporta depois?',opcoes:[{texto:'Define o resultado esperado, da autonomia e so quer saber do resultado',perfil:'Comandante'},{texto:'Acompanha o processo, nao por falta de confianca, mas porque os detalhes importam',perfil:'Artesao'},{texto:'Mantem contato regular, mais para apoiar do que para controlar',perfil:'Conector'},{texto:'Delega com entusiasmo e ja esta pensando na proxima iniciativa enquanto isso',perfil:'Catalisador'}]},
  {bloco:'Como voce executa',pergunta:'Uma tarefa que voce faz bem poderia ser feita por outra pessoa. O que impede de delegar de vez?',opcoes:[{texto:'Na pratica, eu faco mais rapido do que explicar para alguem',perfil:'Comandante'},{texto:'Tenho dificuldade de aceitar que o resultado vai ser diferente do que eu faria',perfil:'Artesao'},{texto:'Me preocupo se a pessoa vai se sentir sobrecarregada ou insegura',perfil:'Conector'},{texto:'Depende. Se a tarefa nao me desafia mais, delego facil. Se ainda me interessa, fico',perfil:'Catalisador'}]},
  {bloco:'Como voce reage sob pressao',pergunta:'O negocio esta travado ha duas semanas. O que voce faz?',opcoes:[{texto:'Age. Faz algo concreto imediatamente para criar movimento',perfil:'Comandante'},{texto:'Para, analisa os dados e so age quando entende a causa real',perfil:'Artesao'},{texto:'Conversa com stakeholders e pessoas do negocio para entender o que esta acontecendo',perfil:'Conector'},{texto:'Busca uma nova abordagem. Se o que estava fazendo nao funciona, muda a estrategia',perfil:'Catalisador'}]},
  {bloco:'Como voce reage sob pressao',pergunta:'Alguem da equipe comete um erro que impacta um stakeholder importante. Como voce reage?',opcoes:[{texto:'Resolve o problema com o stakeholder primeiro, depois conversa com a equipe',perfil:'Comandante'},{texto:'Entende exatamente o que causou o erro antes de qualquer conversa ou decisao',perfil:'Artesao'},{texto:'Garante que a equipe nao esta se sentindo culpada antes de resolver o processo',perfil:'Conector'},{texto:'Usa o erro como oportunidade para mudar algo que ja nao funcionava bem mesmo',perfil:'Catalisador'}]},
  {bloco:'Como voce reage sob pressao',pergunta:'Voce esta sobrecarregado. O negocio pede mais do que voce consegue execuçãor. O que acontece?',opcoes:[{texto:'Aumenta o ritmo. Trabalha mais horas, assume mais controle',perfil:'Comandante'},{texto:'Tenta organizar melhor antes de pedir ajuda',perfil:'Artesao'},{texto:'Sente o peso de nao querer decepcionar quem depende de voce',perfil:'Conector'},{texto:'Fica disperso. Muita coisa interessante ao mesmo tempo e dificuldade de focar',perfil:'Catalisador'}]},
  {bloco:'Como voce cresce',pergunta:'Alguem de confianca te diz que voce esta errando em algo importante. Como voce recebe?',opcoes:[{texto:'Ouve, avalia rapido se faz sentido e age, ou descarta se nao convencer',perfil:'Comandante'},{texto:'Pede mais detalhes, quer entender o raciocinio antes de aceitar ou refutar',perfil:'Artesao'},{texto:'O impacto emocional vem primeiro. Precisa de tempo para processar',perfil:'Conector'},{texto:'Depende de como e dito. Critica dura trava, feedback positivo absorve bem',perfil:'Catalisador'}]},
  {bloco:'Como voce cresce',pergunta:'Voce descobre uma nova abordagem que pode melhorar algo que ja funciona razoavelmente bem. O que voce faz?',opcoes:[{texto:'Testa logo. Se nao funcionar, volta para o que funcionava',perfil:'Comandante'},{texto:'Pesquisa mais antes de mudar algo que ja esta estabelecido',perfil:'Artesao'},{texto:'Conversa com quem vai ser impactado pela mudanca antes de decidir',perfil:'Conector'},{texto:'Ja esta entusiasmado. A novidade em si ja e motivacao suficiente para tentar',perfil:'Catalisador'}]},
  {bloco:'Como voce cresce',pergunta:'Como voce sabe que esta crescendo como gestor?',opcoes:[{texto:'Quando o negocio cresce e os resultados comprovam que as decisoes foram certas',perfil:'Comandante'},{texto:'Quando entendo melhor os processos e consigo prever problemas antes que acontecam',perfil:'Artesao'},{texto:'Quando as pessoas ao meu redor estao mais confiantes e execuçãondo mais',perfil:'Conector'},{texto:'Quando estou empolgado com o que esta sendo construido e sinto que estou evoluindo',perfil:'Catalisador'}]},
];

var _donoDiagStep=0,_donoDiagResp={};
function openDiagExecutivo(){_donoDiagStep=0;_donoDiagResp={};renderExecutivoDiagStep();openModal('dono-diag-modal');}
function renderExecutivoDiagStep(){
  var total=DONO_PERGUNTAS_V2.length;
  var pct=Math.round(_donoDiagStep/total*100);
  var bar=document.getElementById('dono-diag-bar');if(bar)bar.style.width=pct+'%';
  var back=document.getElementById('dono-diag-back');if(back)back.style.display=_donoDiagStep>0?'':'none';
  var next=document.getElementById('dono-diag-next');if(next)next.textContent=_donoDiagStep===total-1?'Ver meu perfil →':'Proxima →';
  var q=DONO_PERGUNTAS_V2[_donoDiagStep];
  var body=document.getElementById('dono-diag-body');
  if(body)body.innerHTML=
    '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px">Pergunta '+(_donoDiagStep+1)+' de '+total+' · '+san(q.bloco)+'</div>'+
    '<div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.5;margin-bottom:20px">'+san(q.pergunta)+'</div>'+
    '<div style="display:flex;flex-direction:column;gap:10px">'+
    q.opcoes.map(function(o,i){var sel=_donoDiagResp[_donoDiagStep]===i;return'<button onclick="selecionarExecutivoDiag('+i+')" style="text-align:left;padding:12px 16px;border-radius:var(--r2);border:1.5px solid '+(sel?'var(--ceo)':'var(--border)')+';background:'+(sel?'var(--ceo-lt)':'var(--white)')+';cursor:pointer;font-family:var(--font);font-size:13px;color:var(--text);font-weight:'+(sel?'600':'400')+';transition:all .13s"><span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:'+(sel?'var(--ceo)':'var(--border)')+';color:'+(sel?'#fff':'var(--muted)')+';font-size:11px;font-weight:700;margin-right:10px;flex-shrink:0">'+(sel?'✓':String.fromCharCode(65+i))+'</span>'+san(o.texto)+'</button>';}).join('')+
    '</div>';
}
function selecionarExecutivoDiag(idx){_donoDiagResp[_donoDiagStep]=idx;renderExecutivoDiagStep();}
function donoDiagBack(){if(_donoDiagStep>0){_donoDiagStep--;renderExecutivoDiagStep();}}
function donoDiagNext(){if(_donoDiagResp[_donoDiagStep]===undefined){toast('Selecione uma opcao','error');return;}if(_donoDiagStep<DONO_PERGUNTAS_V2.length-1){_donoDiagStep++;renderExecutivoDiagStep();}else calcExecutivoDiagResultado();}

var DONO_PERFIS_TEXTOS_V2={
  Comandante:{icon:'⚡',cor:'#C0392B',potencialidades:'Voce toma decisoes sob pressao, define prioridades com clareza e nao se perde em detalhes que nao mudam o resultado. Em negocios que exigem velocidade e execucao, isso e vantagem real.',limitadores:'Tendencia a atropelar processos que precisam de tempo. Vale observar: onde a velocidade esta servindo ao negocio e onde esta servindo ao desconforto com a incerteza?',zona:'Sob pressao, esse perfil tende a aumentar o controle, fazer mais, delegar menos. As vezes o negocio nao precisa de mais velocidade. Precisa de mais escuta.'},
  Artesao: {icon:'🎯',cor:'#5B21B6',potencialidades:'Voce enxerga detalhes que passam despercebidos, cria processos que realmente funcionam e execução com uma qualidade que constroi reputacao no longo prazo.',limitadores:'A busca pela solucao perfeita pode adiar decisoes que ja tinham informacao suficiente. Vale observar: quantas vezes voce esperou ter mais dados antes de agir e o que custou essa espera?',zona:'Sob pressao, esse perfil volta para o que ja domina. Mais analise, mais refinamento. Reconhecer quando o negocio precisa de movimento, nao de perfeicao, e o principal desafio.'},
  Conector: {icon:'🤝',cor:'#1A7A4A',potencialidades:'Voce cria relacoes que duram, ouve com uma profundidade que a maioria nao tem e gera lealdade genuina nos stakeholders e na equipe.',limitadores:'Tendencia a adiar decisoes dificeis para preservar a harmonia. Quais conversas voce esta adiando que, se acontecessem, resolveriam algo que esta travado?',zona:'Sob pressao, esse perfil tende a absorver o peso dos outros antes de cuidar do proprio negocio. Reconhecer onde termina o cuidado e comeca a evitacao de conflito e central.'},
  Catalisador:{icon:'🔥',cor:'#B07D1A',potencialidades:'Voce gera energia, inspira movimento e consegue vender uma visao antes que ela exista de verdade. Em negocios que precisam de tracao inicial ou cultura forte, isso e vantagem real.',limitadores:'Tendencia a iniciar mais do que concluir. Vale observar: quantos iniciativas voce comecou nos ultimos 6 meses e quantos foram realmente concluidos?',zona:'Sob pressao, esse perfil busca uma nova ideia em vez de persistir no que ja estava funcionando. Reconhecer quando e hora de criar e quando e hora de executar e o maior desafio.'},
};

function calcExecutivoDiagResultado(){
  var scores={Comandante:0,Artesao:0,Conector:0,Catalisador:0};
  Object.keys(_donoDiagResp).forEach(function(step){var idx=_donoDiagResp[step];var perfil=DONO_PERGUNTAS_V2[step].opcoes[idx].perfil;scores[perfil]++;});
  var sorted=Object.entries(scores).sort(function(a,b){return b[1]-a[1];});
  var perfil=sorted[0][0],perfilSec=sorted[1][0];
  var diagData={perfil:perfil,perfilSecundario:perfilSec,scores:scores,data:new Date().toISOString()};
  saveExecutivoDiag(diagData);
  closeModal('dono-diag-modal');
  renderExecutivoDiagResultado(diagData);
  openModal('dono-result-modal');
}
function renderExecutivoDiagResultado(data){
  var p=DONO_PERFIS_TEXTOS_V2[data.perfil];var ps=DONO_PERFIS_TEXTOS_V2[data.perfilSecundario];if(!p)return;
  var titleEl=document.getElementById('dono-result-titulo');if(titleEl)titleEl.textContent=data.perfil+' '+p.icon;
  function secao(titulo,texto,cor){return'<div style="margin-bottom:16px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:'+cor+';margin-bottom:6px">'+titulo+'</div><div style="font-size:13px;color:var(--text);line-height:1.75;background:var(--bg);padding:12px 14px;border-radius:var(--r2);border-left:3px solid '+cor+'">'+san(texto)+'</div></div>';}
  var body=document.getElementById('dono-result-body');
  if(body)body.innerHTML=
    '<div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">'+
    '<div style="flex:1;min-width:120px;padding:14px;border-radius:var(--r2);background:var(--ceo-lt);border:1.5px solid var(--ceo)"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--ceo);margin-bottom:4px">Perfil dominante</div><div style="font-size:17px;font-weight:800">'+san(data.perfil)+' '+p.icon+'</div></div>'+
    '<div style="flex:1;min-width:120px;padding:14px;border-radius:var(--r2);background:var(--bg);border:1px solid var(--border)"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px">Perfil secundario</div><div style="font-size:17px;font-weight:800">'+san(data.perfilSecundario)+' '+(ps&&ps.icon||'')+'</div></div>'+
    '</div>'+
    secao('Suas potencialidades',p.potencialidades,'var(--ceo)')+
    secao('Seus limitadores provaveis',p.limitadores,'var(--red)')+
    secao('Sua zona de conforto',p.zona,'var(--amber)');
}

// Momento Estratégico (sessao)
var CEO_BLOCOS_V2=[
  {titulo:'Crescimento e Escalabilidade',sub:'O negocio esta pronto para crescer sem voce no centro?',perguntas:['O negocio esta pronto para crescer sem que voce trabalhe ainda mais?','Quais sao os gargalos que impedem o crescimento hoje?','O que precisa estar estruturado para esse negocio dobrar de tamanho?']},
  {titulo:'Lucratividade e Financas',sub:'Voce sabe exatamente o que entra, o que sai e o que sobra?',perguntas:['Voce sabe exatamente quanto lucrou nos ultimos 30 dias?','Quais sao os 3 maiores custos que poderiam ser otimizados agora?','Esta claro qual produto traz mais lucro e qual traz mais esforco sem retorno?']},
  {titulo:'Controles e Indicadores',sub:'Voce esta tomando decisoes baseadas em dados ou percepcao?',perguntas:['Voce tem indicadores acompanhados semanalmente?','A operacao e visivel em numeros claros?','Foram tomadas decisoes nos ultimos 15 dias baseadas em dados?']},
  {titulo:'Lideranca e Delegacao',sub:'O que so voce pode fazer, e o que esta retendo?',perguntas:['Ha atividades em que voce esta envolvido e que nao precisaria estar?']},
  {titulo:'Visao e Proposito',sub:'Por que esse negocio existe, de verdade?',perguntas:['Qual e a sua visao para este negocio nos proximos 3 anos?','Por que esse negocio existe, de verdade?']},
  {titulo:'Expansao',sub:'Qual transformacao voce quer gerar e para quem?',perguntas:['Qual transformacao voce quer gerar na vida do stakeholder?','Voce esta construindo algo para vender, para viver bem ou para deixar um legado?','Se alguem fosse investir hoje, o que voce diria que e o diferencial da sua organização?']},
];
var _ceoSessStep=0,_ceoSessRespostas=[],_ceoSessPerguntas=[],_ceoProvocacoes={};

function openMomentoCEO(){
  var diag=getExecutivoDiag();
  if(!diag){toast('Faca o Diagnostico do Executivo primeiro','error');setTimeout(openDiagExecutivo,500);return;}
  _ceoSessPerguntas=[];
  CEO_BLOCOS_V2.forEach(function(bloco,bi){bloco.perguntas.forEach(function(perg){_ceoSessPerguntas.push({bloco:bi,blocoTitulo:bloco.titulo,blocoSub:bloco.sub,pergunta:perg});});});
  _ceoSessStep=0;_ceoSessRespostas=new Array(_ceoSessPerguntas.length).fill('');_ceoProvocacoes={};
  renderCeoSessStep();openModal('momento-ceo-modal');
}
function renderCeoSessStep(){
  var total=_ceoSessPerguntas.length;
  var item=_ceoSessPerguntas[_ceoSessStep];
  var bloco=CEO_BLOCOS_V2[item.bloco];
  var pct=Math.round(_ceoSessStep/total*100);
  var bar=document.getElementById('ceo-sess-bar');if(bar)bar.style.width=pct+'%';
  var tituloEl=document.getElementById('ceo-sess-titulo');if(tituloEl)tituloEl.textContent=bloco.titulo;
  var subEl=document.getElementById('ceo-sess-sub');if(subEl)subEl.textContent=bloco.sub;
  var back=document.getElementById('ceo-sess-back');if(back)back.style.display=_ceoSessStep>0?'':'none';
  var next=document.getElementById('ceo-sess-next');if(next)next.textContent=_ceoSessStep===total-1?'Ver resultado →':'Proxima →';
  var body=document.getElementById('ceo-sess-body');
  if(body)body.innerHTML=
    '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px">Pergunta '+(_ceoSessStep+1)+' de '+total+'</div>'+
    '<div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.5;margin-bottom:16px">'+san(item.pergunta)+'</div>'+
    '<textarea id="ceo-sess-field" placeholder="Escreva o que esta pensando agora..." style="width:100%;min-height:100px;padding:12px;border:1.5px solid var(--border);border-radius:var(--r2);font-family:var(--font);font-size:13px;color:var(--text);resize:vertical;box-sizing:border-box;line-height:1.6;outline:none;transition:border .15s" onfocus="this.style.borderColor=\'var(--ceo)\'" onblur="this.style.borderColor=\'var(--border)\'">'+san(_ceoSessRespostas[_ceoSessStep]||'')+'</textarea>';
  setTimeout(function(){var f=document.getElementById('ceo-sess-field');if(f)f.focus();},150);
}
function salvarCeoSessResposta(){var f=document.getElementById('ceo-sess-field');if(f)_ceoSessRespostas[_ceoSessStep]=f.value;}
function ceoSessBack(){salvarCeoSessResposta();if(_ceoSessStep>0){_ceoSessStep--;renderCeoSessStep();}}
function ceoSessNext(){
  salvarCeoSessResposta();
  var resp=(_ceoSessRespostas[_ceoSessStep]||'').trim();
  if(!resp){toast('Escreva sua resposta antes de continuar','error');return;}
  chamarCeoCoach({pergunta:_ceoSessPerguntas[_ceoSessStep].pergunta,resposta:resp,bloco:_ceoSessPerguntas[_ceoSessStep].blocoTitulo,perfil:(getExecutivoDiag()&&getExecutivoDiag().perfil)||'Comandante',perfilSecundario:(getExecutivoDiag()&&getExecutivoDiag().perfilSecundario)||'',stepIdx:_ceoSessStep});
  if(_ceoSessStep<_ceoSessPerguntas.length-1){_ceoSessStep++;renderCeoSessStep();}else calcCeoSessResultado();
}
async function chamarCeoCoach(opts){try{var res=await fetch('/.netlify/functions/ceo-coach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(opts)});if(!res.ok)return;var data=await res.json();if(data.resposta)_ceoProvocacoes[opts.stepIdx]=data.resposta;}catch(e){console.warn('ceo-coach:',e.message);}}
function calcCeoSessResultado(){
  var diag=getExecutivoDiag();
  var sessao={data:new Date().toISOString(),perfil:(diag&&diag.perfil)||'Comandante',respostas:_ceoSessRespostas.map(function(r,i){return{pergunta:(_ceoSessPerguntas[i]&&_ceoSessPerguntas[i].pergunta)||'',bloco:(_ceoSessPerguntas[i]&&_ceoSessPerguntas[i].blocoTitulo)||'',resposta:r};})};
  var sessoes=_ceoCache.sessoes||[];
  try{if(!sessoes.length){sessoes=JSON.parse(localStorage.getItem(CEO_SESS_KEY+(CU&&CU.id||''))||'[]');}}catch(e){}
  sessoes.unshift(sessao);if(sessoes.length>12)sessoes=sessoes.slice(0,12);
  _saveCeoField('sessoes',sessoes);
  closeModal('momento-ceo-modal');renderCeoSessResultado(sessao);openModal('ceo-result-modal');
}
function renderCeoSessResultado(sessao){
  var PROV={Comandante:'Voce respondeu. A pergunta real e: qual dessas respostas voce esta usando como desculpa para nao agir? Escolha uma coisa desta sessao e execute ainda hoje.',Artesao:'Voce tem as respostas. A pergunta e quando vai parar de refinar e comecar a mover. Defina uma acao com prazo concreto.',Conector:'Voce sabe o que precisa acontecer. Qual conversa voce esta evitando que destravaria tudo? Agende essa conversa esta semana.',Catalisador:'Energia alta. Agora o desafio do seu perfil: nao comecar nada novo antes de concluir o que esta sessao revelou. Uma acao. So uma.'};
  var html='';var blocoAtual='';
  sessao.respostas.forEach(function(item,idx){
    if(item.bloco!==blocoAtual){blocoAtual=item.bloco;html+='<div style="font-size:10px;font-weight:700;color:var(--ceo);text-transform:uppercase;letter-spacing:.08em;margin:16px 0 8px">'+san(blocoAtual)+'</div>';}
    if(item.resposta&&item.resposta.trim()){
      var prov=_ceoProvocacoes[idx];
      html+='<div style="margin-bottom:10px;border-radius:var(--r2);overflow:hidden;border:1px solid var(--border)">'+
        '<div style="padding:10px 12px;background:var(--bg)"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">'+san(item.pergunta)+'</div>'+
        '<div style="font-size:13px;color:var(--text);line-height:1.6;font-style:italic">"'+san(item.resposta)+'"</div></div>'+
        (prov?'<div style="padding:10px 12px;background:var(--ceo-lt);border-top:1px solid rgba(184,85,21,.15)"><div style="font-size:9px;font-weight:700;color:var(--ceo);letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">Copiloto Executivo</div><div style="font-size:12px;color:var(--text);line-height:1.7">'+san(prov)+'</div></div>':'')+
        '</div>';
    }
  });
  html+='<div style="margin-top:20px;padding:16px;border-radius:var(--r2);background:var(--navy);color:#fff">'+
    '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:8px">Para voce, '+san(sessao.perfil)+'</div>'+
    '<div style="font-size:13px;line-height:1.75;color:rgba(255,255,255,.9)">'+san(PROV[sessao.perfil]||PROV.Comandante)+'</div></div>';
  var body=document.getElementById('ceo-result-body');if(body)body.innerHTML=html;
}

// Converter markdown simples para HTML no Copiloto Executivo
function mentorMd(texto){
  if(!texto)return'';
  var h=texto.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // negrito **texto**
  h=h.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  // itálico *texto*
  h=h.replace(/\*([^*]+)\*/g,'<em>$1</em>');
  // parágrafos
  var parts=h.split('\n\n');
  h=parts.map(function(p){return p.trim()?'<p style="margin:0 0 8px">'+p.replace(/\n/g,'<br>')+'</p>':'';}).join('');
  return h||'<p>'+texto+'</p>';
}

// Copiloto Executivo
var _mentorOpen=false,_mentorHistorico=[];
function toggleMentorGPS(){
  _mentorOpen=!_mentorOpen;
  var panel=document.getElementById('mentor-panel');if(panel)panel.classList.toggle('open',_mentorOpen);
  var um=document.getElementById('user-menu');if(um)um.style.display='none';
  if(_mentorOpen)setTimeout(function(){var inp=document.getElementById('mentor-input');if(inp)inp.focus();},350);
}
async function sendMentor(){
  var input=document.getElementById('mentor-input');if(!input)return;
  var pergunta=input.value.trim();if(!pergunta)return;
  input.value='';input.style.height='44px';
  addMentorMsg('user',pergunta);_mentorHistorico.push({role:'user',content:pergunta});
  var typingId='mt-'+Date.now();addMentorMsg('typing','',typingId);
  var myC=myClients();
  var diag=getExecutivoDiag();
  var diagDecifre=getDiagResult();
  var parados=myC.filter(function(c){return diasSem(c.updatedAt||c.createdAt)>=7;}).length;
  try{
    var res=await fetch('/.netlify/functions/gps-coach',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        pergunta:pergunta,
        perfilExecutivo:(diag&&diag.perfil)||'',
        etapaDecifre:(diagDecifre&&diagDecifre.foco&&diagDecifre.foco.nome)||'',
        totalStakeholders:myC.length,
        stakeholdersAltaPrioridade:myC.filter(function(c){return c.priority==='alta';}).length,
        stakeholdersNegociação:myC.filter(function(c){return c.stage==='negociação';}).length,
        stakeholdersParados:parados,
        semPerfil:myC.filter(function(c){return!c.perfil;}).length,
        totalPipeline:myC.reduce(function(s,c){return s+(c.value||0);},0),
        historico:_mentorHistorico.slice(-4)
      })
    });
    var te=document.getElementById(typingId);if(te)te.remove();
    if(!res.ok){addMentorMsg('ai','Erro de conexao. Tente novamente.');return;}
    var data=await res.json();
    var resposta=data.resposta||'Sem resposta.';
    addMentorMsg('ai',resposta);
    _mentorHistorico.push({role:'assistant',content:resposta});
    if(_mentorHistorico.length>20)_mentorHistorico=_mentorHistorico.slice(-20);
  }catch(e){
    var te2=document.getElementById(typingId);if(te2)te2.remove();
    addMentorMsg('ai','Erro de conexao. Verifique sua internet.');
  }
}
function addMentorMsg(role,texto,id){
  var container=document.getElementById('mentor-messages');if(!container)return;
  var div=document.createElement('div');if(id)div.id=id;
  if(role==='user'){div.className='mentor-msg-user';div.innerHTML='<div>'+san(texto)+'</div>';}
  else if(role==='typing'){div.innerHTML='<div style="display:flex;align-items:center;gap:5px;padding:8px 12px;background:var(--bg);border-radius:var(--r2);width:fit-content"><div style="width:5px;height:5px;border-radius:50%;background:var(--ceo);animation:mentorDot .8s infinite 0s"></div><div style="width:5px;height:5px;border-radius:50%;background:var(--ceo);animation:mentorDot .8s infinite .2s"></div><div style="width:5px;height:5px;border-radius:50%;background:var(--ceo);animation:mentorDot .8s infinite .4s"></div></div>';}
  else{div.className='mentor-msg-ai';div.innerHTML='<div class="mentor-msg-ai-label">Copiloto Executivo</div><div class="mentor-msg-ai-text" style="line-height:1.7">'+mentorMd(texto)+'</div>';}
  container.appendChild(div);container.scrollTop=container.scrollHeight;
}

// ── FAB Mobile (botão + flutuante) ────────────────────
function initFab(){
  var fab=document.getElementById('mobile-fab');
  if(!fab)return;

  // Restaurar posição salva
  try{
    var saved=JSON.parse(localStorage.getItem(LS.fabPos)||'null');
    if(saved){fab.style.bottom=saved.bottom;fab.style.right=saved.right;fab.style.top=saved.top||'';}
  }catch(e){}

  // Ação ao tocar (não arrastar)
  var _dragging=false,_startX=0,_startY=0,_moved=false;

  fab.addEventListener('touchstart',function(e){
    _dragging=true;_moved=false;
    var t=e.touches[0];
    _startX=t.clientX-fab.getBoundingClientRect().left;
    _startY=t.clientY-fab.getBoundingClientRect().top;
    fab.style.transition='none';
  },{passive:true});

  fab.addEventListener('touchmove',function(e){
    if(!_dragging)return;
    e.preventDefault();
    _moved=true;
    var t=e.touches[0];
    var x=t.clientX-_startX;
    var y=t.clientY-_startY;
    var maxX=window.innerWidth-fab.offsetWidth;
    var maxY=window.innerHeight-fab.offsetHeight;
    x=Math.max(0,Math.min(x,maxX));
    y=Math.max(0,Math.min(y,maxY));
    fab.style.left=x+'px';
    fab.style.top=y+'px';
    fab.style.right='auto';
    fab.style.bottom='auto';
  },{passive:false});

  fab.addEventListener('touchend',function(){
    _dragging=false;
    fab.style.transition='';
    try{localStorage.setItem(LS.fabPos,JSON.stringify({top:fab.style.top,bottom:fab.style.bottom,right:fab.style.right}));}catch(e){}
    if(!_moved)fabAction();
  });

  // Click no desktop
  fab.addEventListener('click',function(){fabAction();});
}

function fabAction(){
  // Ação contextual baseada na view atual
  var active=document.querySelector('.nav-item.active');
  var view=active&&active.dataset.view||'painel-de-iniciativas';
  if(view==='painel-de-iniciativas'||view==='clients'){
    openClientModal();
  } else if(view==='companies'){
    openCompanyModal();
  } else if(view==='users'){
    openUserModal();
  } else if(view==='my-companies'){
    openCompanyModal();
  } else if(view==='my-members'){
    openUserModal();
  } else {
    openClientModal();
  }
}

function initMentorGPS(){
  var style=document.createElement('style');
  style.textContent='@keyframes mentorDot{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}';
  document.head.appendChild(style);
}

// Help Panel
var _helpOpen=false;
function toggleHelp(){
  _helpOpen=!_helpOpen;
  var panel=document.getElementById('help-panel');if(panel)panel.classList.toggle('open',_helpOpen);
  var um=document.getElementById('user-menu');if(um)um.style.display='none';
}
var HELP_CONTENT_V2=[
  {
    id:'inicio',icon:'',color:'var(--navy)',bg:'var(--blue-lt)',title:'Início',
    items:[
      {dot:'var(--blue)',title:'Visão geral do área / organização',
       desc:'A tela Início mostra em segundos o que está acontecendo no seu área / organização agora: total em negociação, stakeholders ativos, stakeholders em negociação e parados há mais de 7 dias.'},
      {dot:'var(--red)',title:'Stakeholders que precisam de atenção',
       desc:'Stakeholders parados há mais de 7 dias aparecem em destaque. Clique para ir direto ao stakeholder no pipeline.'},
      {dot:'var(--green)',title:'Funil por etapa',
       desc:'Quantidade e valor em cada etapa do pipeline. Identifica onde os área / organizaçãos estão travando.'},
      {dot:'var(--amber)',title:'Perfis no painel-de-iniciativas',
       desc:'Distribuição dos perfis comportamentais dos seus stakeholders. Passe o mouse em cada perfil para ver dicas de abordagem.'},
    ]
  },
  {
    id:'painel-de-iniciativas',icon:'',color:'var(--blue)',bg:'var(--blue-lt)',title:'Painel de Iniciativas e Stakeholders',
    items:[
      {dot:'var(--blue)',title:'Kanban por etapas',
       desc:'Arraste os cards entre as colunas Prospecção, Avaliação, Negociação, Negociação, Relacionamento e Concluído. No mobile use o botão Mover em cada card.'},
      {dot:'var(--red)',title:'Prioridade visual nos cards',
       desc:'Borda vermelha é alta prioridade, amarela é média, verde é baixa. Identifica rapidamente o que pede atenção primeiro.'},
      {dot:'var(--green)',title:'Perfil comportamental do stakeholder',
       desc:'Clique em Mapear Perfil em qualquer stakeholder. Responda 5 perguntas para identificar o perfil: Comandante, Catalisador, Conector ou Artesão. O resultado mostra como abordar, o que evitar e o sinal de compra.'},
      {dot:'var(--amber)',title:'Colunas configuráveis',
       desc:'Clique no lápis para renomear qualquer coluna. Colunas criadas por você podem ser excluídas com o botão X. Clique em + Nova coluna para adicionar.'},
      {dot:'var(--navy)',title:'Tabela de Stakeholders',
       desc:'Visão em lista com busca por nome, filtros por etapa e perfil. Ações rápidas de editar, mapear perfil e excluir em cada linha.'},
    ]
  },
  {
    id:'semana',icon:'',color:'var(--navy)',bg:'var(--blue-lt)',title:'Agenda Executiva',
    items:[
      {dot:'var(--navy)',title:'O que é a Agenda Executiva',
       desc:'O espaço de execução da semana. Reúne tudo que precisa ser feito: ações da estratégia, iniciativas em andamento, stakeholders urgentes e tarefas da matriz de prioridades.'},
      {dot:'var(--ceo)',title:'Aba Início — estado mental',
       desc:'Aberta diretamente pelo menu principal. Reúne em um só lugar tudo que precisa acontecer na semana — ações da estratégia, stakeholders urgentes e prioridades da matriz.'},
      {dot:'var(--blue)',title:'Aba Agenda Executiva — as 4 colunas fixas',
       desc:'Decidir, Fazer, Em andamento e Concluído. Arraste os cards conforme o status avança. Ações da Estratégia entram sempre em Fazer automaticamente.'},
      {dot:'var(--purple)',title:'Novas colunas na Agenda Executiva',
       desc:'Além das 4 colunas fixas, você pode criar colunas personalizadas clicando em + Nova coluna no final do board. Colunas extras podem ser renomeadas ou excluídas.'},
      {dot:'var(--green)',title:'Ações vinculadas ao Planejamento Estratégico',
       desc:'Ao criar ou editar um card na Agenda Executiva, você pode vinculá-lo a uma meta do seu Planejamento. Quando o card vai para Concluído, o progresso da meta avança automaticamente no mapa estratégico.'},
      {dot:'var(--red)',title:'Aba Stakeholders — quem precisa de atenção',
       desc:'Lista automática dos stakeholders parados há mais de 7 dias no pipeline. Clique em Registrar contato para atualizar o stakeholder e tirá-lo da lista de urgentes.'},
      {dot:'var(--amber)',title:'Aba Matriz — priorização semanal',
       desc:'Classifique suas tarefas em 4 quadrantes: Urgente e Importante (faça agora), Importante mas não urgente (agende), Urgente mas não importante (delegue), Nem urgente nem importante (elimine). As tarefas podem ser transferidas para a Agenda Executiva com um clique.'},
    ]
  },
  {
    id:'planejamento',icon:'',color:'var(--ceo)',bg:'var(--ceo-lt)',title:'Planejamento',
    items:[
      {dot:'var(--ceo)',title:'O que é o Planejamento',
       desc:'O espaço estratégico do dono. Reúne o Mapa Estratégico, os Iniciativas em andamento e o Momento Estratégico — onde você pensa no área / organização, não só dentro dele.'},
      {dot:'var(--navy)',title:'Aba Estratégia — o mapa do seu planejamento',
       desc:'Mapa visual com as 4 perspectivas: Resultado Financeiro, Stakeholders, Operação e Equipe. O progresso de cada meta avança automaticamente quando você conclui ações vinculadas na Agenda Executiva. Clique em qualquer bloco do mapa para editar a meta.'},
      {dot:'var(--blue)',title:'Como construir o planejamento',
       desc:'Clique em Construir meu planejamento para responder 4 perguntas simples — uma por perspectiva. O GPS monta o mapa estratégico com as suas respostas. Ao final, você define quais metas entram na Agenda Executiva da semana.'},
      {dot:'var(--green)',title:'Setas de correlação no mapa',
       desc:'Durante o wizard, você pode dizer qual perspectiva acima cada meta impacta. O mapa desenha as setas de conexão automaticamente — mostrando como uma coisa leva à outra.'},
      {dot:'var(--amber)',title:'Aba Iniciativas — iniciativas do dono',
       desc:'Kanban para iniciativas e iniciativas pessoais. Crie cards com título, descrição, prazo e prioridade. Arraste entre colunas ou use os botões de mover. Adicione novas colunas com + Nova coluna.'},
      {dot:'var(--purple)',title:'Aba Momento Estratégico — reflexão estratégica',
       desc:'Sessão mensal com 6 blocos estratégicos: crescimento, finanças, controles, liderança, visão e expansão. Ao final, o GPS gera uma provocação baseada no seu perfil do Executivo. Faça o Diagnóstico do Executivo primeiro para personalizar a sessão.'},
      {dot:'var(--red)',title:'Diagnóstico do Executivo',
       desc:'12 perguntas sobre como você decide, executa, reage sob pressão e cresce. Resultado com perfil dominante e secundário. Recomendado refazer a cada 90 dias.'},
    ]
  },
  {
    id:'decifre',icon:'',color:'var(--navy)',bg:'var(--blue-lt)',title:'Rota Executiva',
    items:[
      {dot:'var(--navy)',title:'As 7 etapas da jornada',
       desc:'Cada letra representa uma etapa de desenvolvimento do área / organização. Clique em qualquer letra para acessar a ferramenta correspondente.'},
      {dot:'var(--purple)',title:'D: Diagnóstico do Perfil do Executivo',
       desc:'12 perguntas que revelam como você decide, executa, reage sob pressão e cresce. Resultado com perfil dominante, secundário, potencialidades e limitadores.'},
      {dot:'var(--blue)',title:'E: Raio-X da Estrutura',
       desc:'5 perguntas para avaliar o nível de organização do área / organização. Resultado com leitura e orientação de próximo passo.'},
      {dot:'var(--green)',title:'C: Negociação de Valor Real',
       desc:'Diagnóstico em 4 blocos: Dores, Desejos, Necessidades e Solução. Ao final gera a negociação de valor real do área / organização.'},
      {dot:'var(--ceo)',title:'I: Checklist Operacional',
       desc:'Monte um checklist simples para uma etapa crítica do área / organização. Reduz esquecimento e retrabalho.'},
      {dot:'var(--amber)',title:'F: Raio-X Financeiro',
       desc:'5 campos sobre o último mês: entradas, saídas, destino do dinheiro, sobra real e caixa atual. Inclui reflexões sobre sustentabilidade.'},
      {dot:'var(--red)',title:'R: Diagnóstico A.R.E.S.',
       desc:'Avaliação dos 4 pilares de saúde emocional do área / organização: Autonomia, Reconhecimento, Equilíbrio e Sentido. Identifica o pilar mais frágil e gera uma ação para a semana.'},
      {dot:'var(--teal)',title:'E: Momento Estratégico',
       desc:'Sessão mensal de reflexão estratégica. Acesse também pela aba Planejamento > Momento Estratégico.'},
    ]
  },
];
function renderHelpPanel(){
  var body=document.getElementById('help-body');if(!body)return;
  var html='';
  HELP_CONTENT_V2.forEach(function(section){
    html+='<div class="help-section" id="help-sec-'+section.id+'">'+
      '<div class="help-sec-title" id="help-stitle-'+section.id+'">'+
      '<div class="help-sec-icon" style="background:'+section.bg+';color:'+section.color+'">'+section.icon+'</div>'+
      '<span>'+section.title+'</span>'+
      '<span class="help-sec-chevron">›</span></div>'+
      '<div class="help-items" id="help-items-'+section.id+'">'+
      section.items.map(function(item,idx){
        return '<div class="help-item" id="help-item-'+section.id+'-'+idx+'">'+
          '<div class="help-item-dot" style="background:'+item.dot+'"></div>'+
          '<div style="flex:1"><div class="help-item-title-text">'+item.title+'</div>'+
          '<div class="help-item-desc">'+item.desc+'</div></div></div>';
      }).join('')+'</div></div>';
  });
  body.innerHTML=html;
  HELP_CONTENT_V2.forEach(function(section){
    var titleEl=document.getElementById('help-stitle-'+section.id);
    if(titleEl){titleEl.addEventListener('click',function(){
      var isOpen=document.getElementById('help-items-'+section.id)&&document.getElementById('help-items-'+section.id).classList.contains('open');
      document.querySelectorAll('.help-sec-title').forEach(function(t){t.classList.remove('active');});
      document.querySelectorAll('.help-items').forEach(function(i){i.classList.remove('open');});
      if(!isOpen){titleEl.classList.add('active');var items=document.getElementById('help-items-'+section.id);if(items)items.classList.add('open');}
    });}
    section.items.forEach(function(item,idx){
      var el=document.getElementById('help-item-'+section.id+'-'+idx);if(!el)return;
      el.addEventListener('click',function(){
        var isSelected=el.classList.contains('selected');
        document.querySelectorAll('.help-item').forEach(function(i){i.classList.remove('selected');var d=i.querySelector('.help-item-desc');if(d)d.style.display='none';});
        if(!isSelected){el.classList.add('selected');var desc=el.querySelector('.help-item-desc');if(desc)desc.style.display='block';}
      });
    });
  });
}

// Return Banner
var _returnBannerAction=null;
function showReturnBanner(texto,btnLabel,action){
  var t=document.getElementById('return-banner-text'),b=document.getElementById('return-banner-btn');
  if(t)t.textContent=texto;if(b)b.textContent=btnLabel;
  _returnBannerAction=action;
  var banner=document.getElementById('return-banner');if(banner)banner.classList.add('show');
}
function returnBannerAction(){if(_returnBannerAction)_returnBannerAction();closeReturnBanner();}
function closeReturnBanner(){var banner=document.getElementById('return-banner');if(banner)banner.classList.remove('show');_returnBannerAction=null;}
function checkReturnLoop(){
  var myC=myClients();
  var parados=myC.filter(function(c){return diasSem(c.updatedAt||c.createdAt)>=7;});
  var semPerfil=myC.filter(function(c){return!c.perfil;});
  var diag=getExecutivoDiag();
  if(parados.length>0){showReturnBanner('⏸ '+parados.length+' stakeholder'+(parados.length>1?'s':'')+' parado ha mais de 7 dias.','Ver painel-de-iniciativas',function(){navTo('painel-de-iniciativas',document.querySelector('.nav-item[data-view="painel-de-iniciativas"]'));});}
  else if(!diag&&myC.length>0){showReturnBanner('⟐ Faca o Diagnostico do Executivo para personalizar o GPS.','Fazer agora',openDiagExecutivo);}
  else if(semPerfil.length>0){showReturnBanner(''+semPerfil.length+' stakeholder'+(semPerfil.length>1?'s':'')+' sem perfil mapeado.','Mapear agora',function(){openClientModal(semPerfil[0].id);});}
}

// Tour
var TOUR_STEPS_V2=[
  {label:'1 de 5',title:'Bem-vindo ao GPS da Gestao',desc:'O CRM do Metodo Rota Executiva. Gerencie stakeholders, acompanhe o funil e use ferramentas praticas de gestao.'},
  {label:'2 de 5',title:'O Painel de Iniciativas',desc:'Stakeholders organizados por etapa. Arraste para mover, clique para editar. A borda colorida indica prioridade.'},
  {label:'3 de 5',title:'Rota Executiva',desc:'A jornada estrategica do negocio em 7 etapas. O GPS calcula automaticamente onde voce esta.'},
  {label:'4 de 5',title:'Agenda CEO',desc:'Espaco do proprio dono. Agenda Executiva semanal, iniciativas com planejamento reverso e sessoes Momento Estratégico.'},
  {label:'5 de 5',title:'Copiloto Executivo',desc:'Seu consultor integrado. Acesse pelo menu do seu nome. Pergunte o que esta travando o negocio hoje.'},
];
var _tourStep=0;
function startTour(force){
  var done=localStorage.getItem('gps_v2_tour_done_'+(CU&&CU.id||''));
  if(done&&!force)return;
  _tourStep=0;renderTourStep();
  var ov=document.getElementById('tour-overlay');if(ov)ov.classList.add('active');
}
function renderTourStep(){
  var s=TOUR_STEPS_V2[_tourStep];
  var lbl=document.getElementById('tour-step-label'),title=document.getElementById('tour-title'),desc=document.getElementById('tour-desc');
  var dots=document.getElementById('tour-dots'),next=document.getElementById('tour-next'),skip=document.getElementById('tour-skip');
  if(lbl)lbl.textContent=s.label;if(title)title.textContent=s.title;if(desc)desc.textContent=s.desc;
  if(dots)dots.innerHTML=TOUR_STEPS_V2.map(function(_,i){return'<div class="tour-dot'+(i===_tourStep?' active':'')+'"></div>';}).join('');
  if(next)next.textContent=_tourStep===TOUR_STEPS_V2.length-1?'Comecar':'Proximo';
  if(skip)skip.style.display=_tourStep===TOUR_STEPS_V2.length-1?'none':'';
}
function tourNext(){if(_tourStep<TOUR_STEPS_V2.length-1){_tourStep++;renderTourStep();}else endTour();}
function endTour(){var ov=document.getElementById('tour-overlay');if(ov)ov.classList.remove('active');localStorage.setItem('gps_v2_tour_done_'+(CU&&CU.id||''),'1');}


// ── Admin: Minhas Organizaçãos ─────────────────────────────
function renderMyCompanies(){
  var body=document.getElementById('my-companies-body');if(!body)return;
  var mycos=companies.filter(function(co){return co.ownerId===CU.id||CU.companyIds.includes(co.id);});
  if(mycos.length===0){
    body.innerHTML='<div class="empty-state"><div class="empty-state-icon">🏢</div><div class="empty-state-title">Nenhuma organização</div><div class="empty-state-sub">Crie sua primeira organização</div><button class="btn btn-primary" style="margin-top:20px" onclick="openCompanyModal()">+ Criar organização</button></div>';return;
  }
  body.innerHTML='<div style="display:flex;flex-direction:column;gap:var(--sp3)">'+
    mycos.map(function(co){
      var membros=users.filter(function(u){return u.companyIds&&u.companyIds.includes(co.id);});
      var isOwner=co.ownerId===CU.id;
      return '<div class="card" style="padding:var(--sp4)">'+
        '<div style="display:flex;align-items:flex-start;gap:var(--sp3);flex-wrap:wrap">'+
          '<div style="flex:1;min-width:160px">'+
            '<div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:2px">'+san(co.name)+'</div>'+
            '<div style="font-size:12px;color:var(--muted)">'+membros.length+' membro'+(membros.length!==1?'s':'')+(isOwner?' · Proprietário':'')+'</div>'+
          '</div>'+
          '<div style="display:flex;gap:var(--sp2)">'+
            (can('edit_company')?'<button class="btn btn-ghost btn-sm" onclick="openCompanyModal(this.dataset.id)" data-id="'+co.id+'">Editar</button>':'')+''+
            (can('manage_members')?'<button class="btn btn-ghost btn-sm" onclick="gerenciarMembros(this.dataset.id)" data-id="'+co.id+'">Membros</button>':'')+''+
            (can('delete_company')&&isOwner?'<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirCompany(this.dataset.id)" data-id="'+co.id+'">Excluir</button>':'')+''+
          '</div>'+
        '</div>'+
      '</div>';
    }).join('')+
  '</div>';
}

// ── Admin: Meus Membros ────────────────────────────────
function renderMyMembers(){
  var body=document.getElementById('my-members-body');if(!body)return;
  var mycos=companies.filter(function(co){return co.ownerId===CU.id||CU.companyIds.includes(co.id);});
  var coIds=mycos.map(function(co){return co.id;});
  var myUsers=users.filter(function(u){return u.companyIds&&u.companyIds.some(function(cid){return coIds.includes(cid);});});
  if(myUsers.length===0){
    body.innerHTML='<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-title">Nenhum membro</div><button class="btn btn-primary" style="margin-top:20px" onclick="openUserModal()">+ Adicionar membro</button></div>';return;
  }
  var ROLES={superadmin:{l:'Super Admin',c:'var(--red)',bg:'var(--red-lt)'},admin_organização:{l:'Admin',c:'var(--blue)',bg:'var(--blue-lt)'},membro:{l:'Membro',c:'var(--muted)',bg:'var(--bg2)'},visualizador:{l:'Visualizador',c:'var(--muted2)',bg:'var(--bg2)'}};
  var STATUS_COLOR={ativo:'green',trial:'blue',pendente:'amber',inativo:'red',expirado:'red'};
  var STATUS_LABEL={ativo:'Ativo',trial:'Trial',pendente:'Pendente',inativo:'Inativo',expirado:'Expirado'};
  body.innerHTML='<div style="display:flex;flex-direction:column;gap:var(--sp2)">'+
    myUsers.map(function(u){
      var r=ROLES[u.role]||ROLES.membro;
      var ativo=u.status==='ativo'||u.status==='trial';
      var co=mycos.find(function(c){return c.id===u.companyId;});
      return '<div class="card" style="padding:var(--sp3) var(--sp4);display:flex;align-items:flex-start;gap:var(--sp3);flex-wrap:wrap">'+
        '<div style="width:38px;height:38px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;flex-shrink:0;opacity:'+(ativo?1:.45)+';margin-top:2px">'+
          san((u.name||u.email||'U')[0].toUpperCase())+
        '</div>'+
        '<div style="flex:1;min-width:160px">'+
          '<div style="display:flex;align-items:center;gap:var(--sp2);flex-wrap:wrap;margin-bottom:3px">'+
            '<div style="font-size:13px;font-weight:700;color:'+(ativo?'var(--text)':'var(--muted)')+'">'+san(u.name||u.email)+'</div>'+
            '<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:var(--r4);background:'+r.bg+';color:'+r.c+'">'+r.l+'</span>'+
            '<span class="badge badge-'+(STATUS_COLOR[u.status||'']||'muted')+'">'+(STATUS_LABEL[u.status||'']||'Sem status')+'</span>'+
          '</div>'+
          '<div style="font-size:11px;color:var(--muted);margin-bottom:var(--sp2)">'+san(u.email)+(co?' · '+san(co.name):'')+
            (u.status==='trial'&&u.trialExpires?' · Trial até '+dateStr(u.trialExpires):'')+
          '</div>'+
          '<div style="display:flex;gap:var(--sp2);flex-wrap:wrap">'+
            (can('edit_member')?'<button class="btn btn-ghost btn-sm" onclick="openUserModal(this.dataset.id)" data-id="'+u.id+'">Editar</button>':'')+''+
            (can('edit_member')?'<button class="btn btn-ghost btn-sm" onclick="resetUserPassword(this.dataset.id,this.dataset.email)" data-id="'+u.id+'" data-email="'+u.email+'">Redefinir senha</button>':'')+''+
            (can('remove_member')?'<button class="btn btn-sm" style="background:'+(ativo?'var(--red)':'var(--green)')+';color:#fff;border:none" onclick="toggleUserStatus(this.dataset.id)" data-id="'+u.id+'">'+(ativo?'Suspender':'Ativar')+'</button>':'')+''+
            (can('remove_member')?'<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirUser(this.dataset.id)" data-id="'+u.id+'">Excluir</button>':'')+''+
          '</div>'+
        '</div>'+
      '</div>';
    }).join('')+
  '</div>';
}

async function gerenciarMembros(coId){
  navTo('my-members',document.querySelector('[data-view="my-members"]'));
}


// ══════════════════════════════════════════════════════
// SA — Perfis de Acesso
// ══════════════════════════════════════════════════════

var _customRoles = []; // cache local

async function loadCustomRoles(){
  var fb=window._fb;if(!fb)return;
  try{
    var s=await fb.getDocs(fb.collection(fb.db,'roles'));
    _customRoles=s.docs.map(function(d){return Object.assign({},d.data(),{id:d.id});});
  }catch(e){console.warn('loadRoles:',e);}
}

function renderRoles(){
  var body=document.getElementById('roles-body');if(!body)return;
  // Mostrar conteúdo imediatamente com o que já está em cache
  _renderRolesBody();
  // Recarregar do Firestore em background
  loadCustomRoles().then(function(){_renderRolesBody();}).catch(function(e){
    console.warn('loadCustomRoles error:',e);
    _renderRolesBody(); // mostrar mesmo assim com cache vazio
  });
}

function _renderRolesBody(){
  var body=document.getElementById('roles-body');if(!body)return;

  // Perfis padrão
  var defaultRoles=[
    {id:'superadmin',  name:'Super Admin',       desc:'Acesso total à plataforma',                    custom:false, locked:true},
    {id:'admin_organização',name:'Admin da Organização', desc:'Gerencia organizaçãos, membros e stakeholders',        custom:false, locked:false},
    {id:'membro',      name:'Membro',             desc:'Opera painel-de-iniciativas e visualiza stakeholders',          custom:false, locked:false},
    {id:'visualizador',name:'Visualizador',       desc:'Somente leitura em Painel de Iniciativas e Dashboard',     custom:false, locked:false},
  ];

  var allRoles=defaultRoles.concat(_customRoles.map(function(r){return Object.assign({},r,{custom:true,locked:false});}));

  // Agrupar ALL_PERMISSIONS por group
  var groups={};
  ALL_PERMISSIONS.forEach(function(p){
    if(!groups[p.group])groups[p.group]=[];
    groups[p.group].push(p);
  });

  body.innerHTML='<div style="display:flex;flex-direction:column;gap:var(--sp4)">'+
    allRoles.map(function(role){
      var perms=role.id==='superadmin'
        ? ALL_PERMISSIONS.map(function(p){return p.id;})
        : (role.permissions||DEFAULT_PERMISSIONS[role.id]||[]);

      var permCount=perms.length;
      var totalCount=ALL_PERMISSIONS.length;

      return '<div class="card" style="overflow:hidden">'+
        // Header
        '<div style="padding:var(--sp4);display:flex;align-items:flex-start;gap:var(--sp3);flex-wrap:wrap;border-bottom:1px solid var(--border)">'+
          '<div style="flex:1;min-width:200px">'+
            '<div style="display:flex;align-items:center;gap:var(--sp2);margin-bottom:4px">'+
              '<div style="font-size:15px;font-weight:700;color:var(--navy)">'+san(role.name)+'</div>'+
              (role.locked?'<span style="font-size:10px;background:var(--bg2);color:var(--muted);padding:1px 7px;border-radius:var(--r4);font-weight:600">SISTEMA</span>':'')+
              (role.custom?'<span style="font-size:10px;background:var(--blue-lt);color:var(--blue);padding:1px 7px;border-radius:var(--r4);font-weight:600">CUSTOMIZADO</span>':'')+
            '</div>'+
            '<div style="font-size:12px;color:var(--muted)">'+san(role.desc||'')+'</div>'+
            '<div style="font-size:11px;color:var(--blue);margin-top:4px">'+permCount+' de '+totalCount+' permissões ativas</div>'+
          '</div>'+
          '<div style="display:flex;gap:var(--sp2);align-items:center">'+
            (role.custom?'<button class="btn btn-ghost btn-sm" onclick="openRoleModal(this.dataset.id)" data-id="'+role.id+'">Editar</button>':'')+
            (role.custom?'<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteRole(this.dataset.id)" data-id="'+role.id+'">Excluir</button>':'')+
            (!role.custom&&!role.locked?'<button class="btn btn-ghost btn-sm" onclick="duplicarRole(this.dataset.id)" data-id="'+role.id+'">Duplicar</button>':'')+
          '</div>'+
        '</div>'+
        // Permissões por grupo
        '<div style="padding:var(--sp4);display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--sp3)">'+
          Object.keys(groups).map(function(grp){
            var gperms=groups[grp];
            var activeInGroup=gperms.filter(function(p){return perms.includes(p.id);}).length;
            return '<div>'+
              '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px">'+
                san(grp)+' <span style="font-weight:400">('+activeInGroup+'/'+gperms.length+')</span>'+
              '</div>'+
              gperms.map(function(p){
                var on=perms.includes(p.id);
                return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'+
                  '<div style="width:14px;height:14px;border-radius:3px;border:1.5px solid '+(on?'var(--blue)':'var(--border)')+';background:'+(on?'var(--blue)':'transparent')+';flex-shrink:0;display:flex;align-items:center;justify-content:center">'+
                    (on?'<svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')+
                  '</div>'+
                  '<span style="font-size:11px;color:'+(on?'var(--text)':'var(--muted)')+'">'+san(p.label)+'</span>'+
                '</div>';
              }).join('')+
            '</div>';
          }).join('')+
        '</div>'+
      '</div>';
    }).join('')+
  '</div>';
}

function openRoleModal(editId){
  try{
  var existing=editId?_customRoles.find(function(r){return r.id===editId;}):null;
  var perms=existing?existing.permissions:[];

  // Agrupar permissões
  var groups={};
  ALL_PERMISSIONS.forEach(function(p){
    if(!groups[p.group])groups[p.group]=[];
    groups[p.group].push(p);
  });

  var permHtml=Object.keys(groups).map(function(grp){
    return '<div style="margin-bottom:var(--sp4)">'+
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border)">'+grp+'</div>'+
      groups[grp].map(function(p){
        var checked=perms.includes(p.id);
        return '<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer">'+
          '<input type="checkbox" value="'+p.id+'" '+(checked?'checked':'')+' style="width:14px;height:14px;cursor:pointer">'+
          '<span style="font-size:13px;color:var(--text)">'+san(p.label)+'</span>'+
        '</label>';
      }).join('')+
    '</div>';
  }).join('');

  var modalHtml='<div class="overlay open" id="role-modal" onclick="if(event.target===this)closeModal(\'role-modal\')">'+
    '<div class="modal" style="max-width:560px;max-height:85vh;display:flex;flex-direction:column">'+
      '<div class="modal-header modal-header-navy">'+
        '<div><div class="modal-title">'+(existing?'Editar perfil':'Novo perfil customizado')+'</div>'+
        '<div class="modal-subtitle">Super Admin · Perfis</div></div>'+
        '<button class="modal-close" onclick="closeModal(\'role-modal\')">✕</button>'+
      '</div>'+
      '<div style="padding:var(--sp5);overflow-y:auto;flex:1">'+
        '<div style="margin-bottom:var(--sp4)">'+
          '<label class="form-label">Nome do perfil</label>'+
          '<input id="role-name" class="form-input" placeholder="Ex: Gestor Comercial" value="'+san(existing?existing.name:'')+'">'+
        '</div>'+
        '<div style="margin-bottom:var(--sp4)">'+
          '<label class="form-label">Descrição</label>'+
          '<input id="role-desc" class="form-input" placeholder="Descrição breve do perfil" value="'+san(existing?existing.desc||'':'')+'">'+
        '</div>'+
        '<div>'+
          '<label class="form-label" style="margin-bottom:var(--sp3)">Permissões</label>'+
          permHtml+
        '</div>'+
      '</div>'+
      '<div style="padding:var(--sp4);border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:var(--sp2)">'+
        '<button class="btn btn-ghost" onclick="closeModal(\'role-modal\')">Cancelar</button>'+
        '<button class="btn btn-primary" data-id="'+(editId||'')+'" onclick="saveRole(this.dataset.id)">Salvar perfil</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  // Remover modal anterior se existir
  var old=document.getElementById('role-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',modalHtml);
  setTimeout(function(){var n=document.getElementById('role-name');if(n)n.focus();},100);
  }catch(err){toast('Erro ao abrir modal: '+err.message,'error');console.error(err);}
}

async function saveRole(editId){
  var name=(document.getElementById('role-name')||{}).value||'';
  var desc=(document.getElementById('role-desc')||{}).value||'';
  if(!name.trim()){toast('Nome do perfil é obrigatório','error');return;}

  var checkboxes=document.querySelectorAll('#role-modal input[type="checkbox"]:checked');
  var permissions=Array.from(checkboxes).map(function(cb){return cb.value;});

  if(permissions.length===0){toast('Selecione ao menos uma permissão','error');return;}

  var fb=window._fb;
  var roleData={name:name.trim(),desc:desc.trim(),permissions:permissions,updatedAt:new Date().toISOString()};

  try{
    var isNew=!editId||editId===''||editId==='_temp';
    if(!isNew){
      await fb.updateDoc(fb.doc(fb.db,'roles',editId),roleData);
      var idx=_customRoles.findIndex(function(r){return r.id===editId;});
      if(idx>=0)_customRoles[idx]=Object.assign({},_customRoles[idx],roleData);
      toast('Perfil atualizado','success');
    } else {
      roleData.createdAt=new Date().toISOString();
      roleData.createdBy=CU.id;
      var newId='role_'+Date.now();
      await fb.setDoc(fb.doc(fb.db,'roles',newId),roleData);
      _customRoles.push(Object.assign({id:newId},roleData));
      toast('Perfil criado','success');
    }
    closeModal('role-modal');
    var old=document.getElementById('role-modal');if(old)old.remove();
    _renderRolesBody();
  }catch(e){toast('Erro ao salvar: '+e.message,'error');console.error(e);}
}

async function deleteRole(roleId){
  if(!confirm('Excluir este perfil? Usuários com este perfil ficarão como Membro.'))return;
  var fb=window._fb;
  try{
    await fb.deleteDoc(fb.doc(fb.db,'roles',roleId));
    _customRoles=_customRoles.filter(function(r){return r.id!==roleId;});
    toast('Perfil excluído','success');
    _renderRolesBody();
  }catch(e){toast('Erro ao excluir: '+e.message,'error');}
}

async function duplicarRole(baseRoleId){
  var basePerms=DEFAULT_PERMISSIONS[baseRoleId]||[];
  var baseName={admin_organização:'Admin da Organização',membro:'Membro',visualizador:'Visualizador'}[baseRoleId]||baseRoleId;
  _customRoles.push({id:'_temp',name:'Cópia de '+baseName,desc:'',permissions:basePerms});
  openRoleModal('_temp');
  _customRoles=_customRoles.filter(function(r){return r.id!=='_temp';});
}

// ══════════════════════════════════════════════════════
// SA FASE 1 - Gestão de Organizaçãos, Usuários e Licenças
// ══════════════════════════════════════════════════════

// ── Organizaçãos ──────────────────────────────────────────

function renderCompanies(){
  var body=document.getElementById('companies-body');if(!body)return;
  var PLAN_COLOR={pro:'var(--blue)',starter:'var(--green)',business:'var(--navy)',trial:'var(--amber)',inativo:'var(--muted)'};

  if(companies.length===0){
    body.innerHTML='<div class="empty-state"><div class="empty-state-icon">🏢</div>'+
      '<div class="empty-state-title">Nenhuma organização</div>'+
      '<button class="btn btn-primary" style="margin-top:20px" onclick="openCompanyModal()">+ Criar organização</button></div>';
    return;
  }

  body.innerHTML='<div style="display:flex;flex-direction:column;gap:var(--sp3)">'+
    companies.map(function(co){
      var cc=clients.filter(function(c){return(c.companyId===co.id||c._ownerCompanyId===co.id)&&!c._deleted;});
      var uu=users.filter(function(u){return u.companyId===co.id||(u.companyIds&&u.companyIds.includes(co.id));});
      var pc=PLAN_COLOR[co.plan||'trial']||'var(--muted)';
      var ativo=co.status!=='inativo';
      return '<div class="card" style="padding:var(--sp4)">'+
        '<div style="display:flex;align-items:flex-start;gap:var(--sp3)">'+
          '<div style="width:40px;height:40px;border-radius:var(--r2);background:var(--blue-lt);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;opacity:'+(ativo?1:.45)+'">'+san(co.emoji||'🏢')+'</div>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="display:flex;align-items:center;gap:var(--sp2);flex-wrap:wrap;margin-bottom:3px">'+
              '<div style="font-size:14px;font-weight:700;color:'+(ativo?'var(--text)':'var(--muted)')+'">'+san(co.name)+'</div>'+
              '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--r4);background:'+pc+'22;color:'+pc+'">'+san((co.plan||'trial').toUpperCase())+'</span>'+
              (!ativo?'<span class="badge badge-red">INATIVO</span>':'')+
            '</div>'+
            '<div style="font-size:11px;color:var(--muted);margin-bottom:var(--sp3)">'+
              uu.length+' usuário'+(uu.length!==1?'s':'')+' · '+cc.length+' stakeholder'+(cc.length!==1?'s':'')+
              (co.expiresAt?' · Expira: '+dateStr(co.expiresAt):'')+
            '</div>'+
            '<div style="display:flex;gap:var(--sp2);flex-wrap:wrap">'+
              '<button class="btn btn-ghost btn-sm" onclick="openCompanyModal(this.dataset.id)" data-id="'+co.id+'">Editar</button>'+
              '<button class="btn btn-ghost btn-sm" onclick="verUsuariosOrganização(this.dataset.id)" data-id="'+co.id+'">Usuários</button>'+
              '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirCompany(this.dataset.id)" data-id="'+co.id+'">Excluir</button>'+
              '<button class="btn btn-sm" style="background:'+(ativo?'var(--red)':'var(--green)')+';color:#fff;border:none" onclick="toggleCompanyStatus(this.dataset.id)" data-id="'+co.id+'">'+(ativo?'Suspender':'Ativar')+'</button>'+
            '</div>'+
          '</div>'+
        '</div>'+
      '</div>';
    }).join('')+
  '</div>';
}

function openCompanyModal(editId){
  try{
  var co=editId?companies.find(function(x){return x.id===editId;}):null;
  createSAModals();
  var modal=document.getElementById('sa-company-modal');
  if(!modal){toast('Erro: modal organização não encontrado.','error');return;}
  var titleEl=modal.querySelector('.modal-title');
  if(titleEl)titleEl.textContent=co?'Editar organização':'Nova organização';
  var body=modal.querySelector('.modal-body');
  if(body)body.innerHTML=
    '<div class="form-group"><label class="form-label">Nome da organização *</label>'+
    '<input class="input" id="co-name" value="'+san(co&&co.name||'')+'" placeholder="Nome da organização"></div>'+
    '<div class="form-row">'+
      '<div class="form-group"><label class="form-label">Planejamento</label>'+
      '<select class="input" id="co-plan">'+
        '<option value="trial"'+(!co||co.plan==='trial'?' selected':'')+'>Trial (7 dias)</option>'+
        '<option value="starter"'+(co&&co.plan==='starter'?' selected':'')+'>Starter: R$97/mês</option>'+
        '<option value="pro"'+(co&&co.plan==='pro'?' selected':'')+'>Pro: R$197/mês</option>'+
        '<option value="business"'+(co&&co.plan==='business'?' selected':'')+'>Business: R$397/mês</option>'+
      '</select></div>'+
      '<div class="form-group"><label class="form-label">Máx. usuários</label>'+
      '<input class="input" id="co-maxusers" type="number" value="'+(co&&co.maxUsers||5)+'" min="1" max="100"></div>'+
    '</div>'+
    '<div class="form-row">'+
      '<div class="form-group"><label class="form-label">Emoji</label>'+
      '<input class="input" id="co-emoji" value="'+san(co&&co.emoji||'🏢')+'" maxlength="2" style="font-size:20px;text-align:center"></div>'+
      '<div class="form-group"><label class="form-label">Validade</label>'+
      '<input class="input" type="date" id="co-expires" value="'+(co&&co.expiresAt||'')+'"></div>'+
    '</div>'+
    '<div class="form-group"><label class="form-label">Observações</label>'+
    '<textarea class="input" id="co-notes">'+san(co&&co.notes||'')+'</textarea></div>'+
    (co?'<div style="padding:8px 12px;background:var(--bg);border-radius:var(--r1);font-size:11px;color:var(--muted)">ID: <code>'+san(co.id)+'</code></div>':'');
  modal._editId=editId||null;
  openModal('sa-company-modal');
  setTimeout(function(){var n=document.getElementById('co-name');if(n)n.focus();},200);
  }catch(err){toast('Erro ao abrir modal: '+err.message,'error');console.error('openCompanyModal:',err);}
}


async function excluirCompany(coId){
  var co=companies.find(function(c){return c.id===coId;});
  if(!co)return;
  if(!confirm('Excluir a organização "'+( co.name)+'"?\nTodos os dados vinculados serão afetados.'))return;
  var fb=window._fb;
  try{
    await fb.deleteDoc(fb.doc(fb.db,'companies',coId));
    companies=companies.filter(function(c){return c.id!==coId;});
    if(typeof renderCompanies==='function')renderCompanies();
    if(typeof renderMyCompanies==='function')renderMyCompanies();
    toast('Organização excluída','success');
  }catch(e){toast('Erro ao excluir: '+e.message,'error');console.error(e);}
}

async function excluirLicense(licId){
  var l=licenses.find(function(x){return x.id===licId;});
  if(!l)return;
  if(!confirm('Excluir a licença '+( l.code||licId)+'?'))return;
  var fb=window._fb;
  try{
    await fb.deleteDoc(fb.doc(fb.db,'licenses',licId));
    licenses=licenses.filter(function(x){return x.id!==licId;});
    renderLicenses();
    toast('Licença excluída','success');
  }catch(e){toast('Erro ao excluir: '+e.message,'error');console.error(e);}
}

async function saveCompany(){
  var name=(document.getElementById('co-name')&&document.getElementById('co-name').value||'').trim();
  if(!name){toast('Informe o nome','error');return;}
  var modal=document.getElementById('sa-company-modal');
  var editId=modal&&modal._editId;
  var id=editId||('co_'+Date.now());
  var existingCo=editId?companies.find(function(c){return c.id===id;}):null;
  var data={
    id:id,name:name,
    plan:document.getElementById('co-plan')&&document.getElementById('co-plan').value||'trial',
    maxUsers:parseInt(document.getElementById('co-maxusers')&&document.getElementById('co-maxusers').value)||5,
    emoji:document.getElementById('co-emoji')&&document.getElementById('co-emoji').value||'🏢',
    expiresAt:document.getElementById('co-expires')&&document.getElementById('co-expires').value||'',
    notes:document.getElementById('co-notes')&&document.getElementById('co-notes').value||'',
    status:'ativo',updatedAt:new Date().toISOString(),
    ownerId:editId?(existingCo&&existingCo.ownerId||CU.id):CU.id,
    createdAt:editId?((existingCo||{}).createdAt||new Date().toISOString()):new Date().toISOString(),
  };
  if(editId){var idx=companies.findIndex(function(c){return c.id===id;});if(idx>=0)companies[idx]=data;else companies.push(data);}
  else{companies.push(data);}
  closeModal('sa-company-modal');renderCompanies();
  if(!window._previewMode){try{var fb=window._fb;await fb.setDoc(fb.doc(fb.db,'companies',id),data);}catch(e){console.warn('saveCompany:',e.code);}}
  toast(editId?'Organização atualizada':'Organização criada','success');
}

async function toggleCompanyStatus(coId){
  var co=companies.find(function(c){return c.id===coId;});if(!co)return;
  var ns=co.status==='inativo'?'ativo':'inativo';
  if(!confirm((ns==='inativo'?'Suspender':'Ativar')+' a organização '+co.name+'?'))return;
  co.status=ns;renderCompanies();
  if(!window._previewMode){try{var fb=window._fb;await fb.updateDoc(fb.doc(fb.db,'companies',coId),{status:ns});}catch(e){console.warn(e);}}
  toast('Organização '+(ns==='ativo'?'ativada':'suspensa'),'success');
}

function verUsuariosOrganização(coId){
  navTo('users',document.querySelector('.nav-item[data-view="users"]'));
  setTimeout(function(){_usersCoFilter=coId;renderUsers();},100);
}

// ── Usuários ──────────────────────────────────────────

var _usersCoFilter='';

function renderUsers(){
  var body=document.getElementById('users-body');if(!body)return;
  var ROLES={
    superadmin:{l:'Super Admin',c:'var(--red)',bg:'var(--red-lt)'},
    admin_organização:{l:'Admin',c:'var(--blue)',bg:'var(--blue-lt)'},
    membro:{l:'Membro',c:'var(--muted)',bg:'var(--bg2)'},
    visualizador:{l:'Visualizador',c:'var(--muted2)',bg:'var(--bg2)'},
  };
  var STATUS_COLOR={ativo:'green',trial:'blue',pendente:'amber',inativo:'red',expirado:'red',rejeitado:'red'};
  var STATUS_LABEL={ativo:'Ativo',trial:'Trial',pendente:'Pendente',inativo:'Inativo',expirado:'Expirado',rejeitado:'Rejeitado'};

  var toolbar='<div style="display:flex;gap:var(--sp3);margin-bottom:var(--sp4);align-items:center;flex-wrap:wrap">'+
    '<select class="input" id="users-co-filter" style="max-width:220px" onchange="_usersCoFilter=this.value;renderUsers()">'+
      '<option value="">Todas as organizaçãos</option>'+
      companies.map(function(co){return'<option value="'+co.id+'"'+(_usersCoFilter===co.id?' selected':'')+'>'+san(co.name)+'</option>';}).join('')+
    '</select>'+
    '<div style="flex:1"></div>'+
    '<button class="btn btn-primary btn-sm" onclick="openUserModal()">+ Novo usuário</button>'+
  '</div>';

  var myU=_usersCoFilter
    ?users.filter(function(u){return u.companyId===_usersCoFilter||(u.companyIds&&u.companyIds.includes(_usersCoFilter));})
    :users;

  var list=myU.length===0
    ?'<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-title">Nenhum usuário</div></div>'
    :'<div style="display:flex;flex-direction:column;gap:var(--sp2)">'+myU.map(function(u){
        var r=ROLES[u.role]||ROLES.membro;
        var co=companies.find(function(c){return c.id===u.companyId;});
        var ativo=u.status!=='inativo';
        return '<div class="card" style="padding:var(--sp3) var(--sp4);display:flex;align-items:flex-start;gap:var(--sp3);flex-wrap:wrap">'+
          '<div style="width:38px;height:38px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;flex-shrink:0;opacity:'+(ativo?1:.45)+';margin-top:2px">'+
            san((u.name||u.email||'U')[0].toUpperCase())+
          '</div>'+
          '<div style="flex:1;min-width:160px">'+
            '<div style="display:flex;align-items:center;gap:var(--sp2);flex-wrap:wrap;margin-bottom:3px">'+
              '<div style="font-size:13px;font-weight:700;color:'+(ativo?'var(--text)':'var(--muted)')+'">'+san(u.name||u.email)+'</div>'+
              '<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:var(--r4);background:'+r.bg+';color:'+r.c+'">'+r.l+'</span>'+
              (!ativo?'<span class="badge badge-red">INATIVO</span>':'')+
            '</div>'+
            '<div style="font-size:11px;color:var(--muted);margin-bottom:4px">'+san(u.email)+(co?' · '+san(co.name):'')+
              (u.lastLogin?' · Último acesso: '+dateStr(u.lastLogin):'')+
            '</div>'+
            '<div style="display:flex;align-items:center;gap:var(--sp2);margin-bottom:var(--sp2)">'+
              '<span class="badge badge-'+(STATUS_COLOR[u.status||'']||'muted')+'">'+(STATUS_LABEL[u.status||'']||'Sem status')+'</span>'+
              (u.status==='trial'&&u.trialExpires?'<span style="font-size:10px;color:var(--muted)">Trial até '+dateStr(u.trialExpires)+'</span>':'')+
              (u.status==='expirado'?'<span style="font-size:10px;color:var(--red)">Trial expirado</span>':'')+
            '</div>'+
            '<div style="display:flex;gap:var(--sp2);flex-wrap:wrap">'+
              '<button class="btn btn-ghost btn-sm" onclick="openUserModal(this.dataset.id)" data-id="'+u.id+'">Editar</button>'+
              '<button class="btn btn-ghost btn-sm" onclick="resetUserPassword(this.dataset.id,this.dataset.email)" data-id="'+u.id+'" data-email="'+u.email+'">Redefinir senha</button>'+
              '<button class="btn btn-sm" style="background:'+(ativo?'var(--red)':'var(--green)')+';color:#fff;border:none" onclick="toggleUserStatus(this.dataset.id)" data-id="'+u.id+'">'+(ativo?'Suspender':'Ativar')+'</button>'+
              '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirUser(this.dataset.id)" data-id="'+u.id+'">Excluir</button>'+
            '</div>'+
          '</div>'+
        '</div>';
      }).join('')+'</div>';

  body.innerHTML=toolbar+list;
}

function openUserModal(editId){
  try{
  var u=editId?users.find(function(x){return x.id===editId;}):null;
  createSAModals();
  var modal=document.getElementById('sa-user-modal');
  if(!modal){toast('Erro: modal não encontrado. Recarregue a página.','error');return;}
  var titleEl=modal.querySelector('.modal-title');
  if(titleEl)titleEl.textContent=u?'Editar usuário':'Novo usuário';
  // Organizaçãos vinculadas ao usuário (companyIds ou companyId)
  var userCoIds=(u&&u.companyIds&&u.companyIds.length>0)?u.companyIds:(u&&u.companyId?[u.companyId]:[]);

  // Checkboxes de organização
  var coChecks=companies.length===0
    ?'<div style="font-size:12px;color:var(--muted);font-style:italic">Nenhuma organização cadastrada</div>'
    :companies.map(function(co){
      var checked=userCoIds.includes(co.id);
      return '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;border-bottom:1px solid var(--border)">'+
        '<input type="checkbox" value="'+co.id+'" '+(checked?'checked':'')+' style="width:15px;height:15px;cursor:pointer" class="u-company-cb">'+
        '<span style="font-size:13px;color:var(--text)">'+san(co.emoji||'🏢')+' '+san(co.name)+'</span>'+
        '<span style="font-size:10px;font-weight:700;color:var(--muted);margin-left:auto">'+san((co.plan||'trial').toUpperCase())+'</span>'+
      '</label>';
    }).join('');

  var body=modal.querySelector('.modal-body');
  if(body)body.innerHTML=
    '<div class="form-row">'+
      '<div class="form-group"><label class="form-label">Nome completo *</label>'+
      '<input class="input" id="u-name" value="'+san(u&&u.name||'')+'" placeholder="Nome do usuário"></div>'+
      '<div class="form-group"><label class="form-label">E-mail *</label>'+
      '<input class="input" type="email" id="u-email" value="'+san(u&&u.email||'')+'" placeholder="email@organização.com"'+
        (u?' readonly style="opacity:.6"':'')+
      '></div>'+
    '</div>'+
    '<div class="form-row">'+
      '<div class="form-group"><label class="form-label">Organizaçãos vinculadas</label>'+
      '<div style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r1);padding:4px 12px">'+coChecks+'</div>'+
      '<div style="font-size:10px;color:var(--muted);margin-top:4px">Selecione uma ou mais organizaçãos</div></div>'+
      '<div class="form-group"><label class="form-label">Perfil de acesso</label>'+
      '<select class="input" id="u-role">'+
        '<option value="membro"'+(!u||u.role==='membro'?' selected':'')+'>Membro</option>'+
        '<option value="visualizador"'+(u&&u.role==='visualizador'?' selected':'')+'>Visualizador</option>'+
        '<option value="admin_organização"'+(u&&u.role==='admin_organização'?' selected':'')+'>Admin da Organização</option>'+
        '<option value="superadmin"'+(u&&u.role==='superadmin'?' selected':'')+'>Super Admin</option>'+
        (_customRoles.length>0?'<optgroup label="Perfis customizados">'+_customRoles.map(function(r){return '<option value="custom:'+r.id+'"'+(u&&u.role==='custom:'+r.id?' selected':'')+'>'+san(r.name)+'</option>';}).join('')+'</optgroup>':'')+
      '</select></div>'+
    '</div>'+
    (!u?
      '<div class="form-group"><label class="form-label">Senha inicial *</label>'+
      '<input class="input" type="password" id="u-password" placeholder="Mínimo 8 caracteres" autocomplete="new-password"></div>'+
      '<div style="padding:10px 12px;background:var(--amber-lt);border-radius:var(--r1);font-size:12px;color:var(--amber);font-weight:600;margin-bottom:var(--sp4)">'+
        'Use o botão Redefinir senha para enviar e-mail de redefinição após criar o usuário.</div>'
    :'<div style="padding:10px 12px;background:var(--bg);border-radius:var(--r1);font-size:11px;color:var(--muted)">'+
        'Para alterar a senha, use o botão Redefinir senha na lista.</div>')+
    '<div class="form-group" style="margin-top:var(--sp4)"><label class="form-label">Observações</label>'+
    '<textarea class="input" id="u-notes" placeholder="Notas internas...">'+san(u&&u.notes||'')+'</textarea></div>';
  modal._editId=editId||null;
  openModal('sa-user-modal');
  setTimeout(function(){var n=document.getElementById('u-name');if(n)n.focus();},200);
  }catch(err){toast('Erro ao abrir modal: '+err.message,'error');console.error('openUserModal:',err);}
}

async function saveUser(){
  var name=(document.getElementById('u-name')&&document.getElementById('u-name').value||'').trim();
  var email=(document.getElementById('u-email')&&document.getElementById('u-email').value||'').trim();
  var role=document.getElementById('u-role')&&document.getElementById('u-role').value||'membro';
  // Ler organizaçãos selecionadas pelos checkboxes
  var coChecked=Array.from(document.querySelectorAll('.u-company-cb:checked')).map(function(cb){return cb.value;});
  var coId=coChecked[0]||''; // organização principal = primeira selecionada
  var notes=document.getElementById('u-notes')&&document.getElementById('u-notes').value||'';
  var modal=document.getElementById('sa-user-modal');
  var editId=modal&&modal._editId;
  if(!name){toast('Informe o nome','error');return;}
  if(!editId&&!email){toast('Informe o e-mail','error');return;}
  if(!editId){
    var pass=document.getElementById('u-password')&&document.getElementById('u-password').value||'';
    if(pass.length<8){toast('Senha deve ter no mínimo 8 caracteres','error');return;}
  }
  closeModal('sa-user-modal');
  if(!editId){
    if(window._previewMode){
      var fu={id:'u_'+Date.now(),name:name,email:email,role:role,companyId:coId,companyIds:coChecked,status:'ativo',notes:notes,createdAt:new Date().toISOString()};
      users.push(fu);renderUsers();toast('Usuário criado (preview)','info');return;
    }
    try{
      var fb=window._fb;
      // Criar usuário via API serverless para não quebrar sessão do SA
      var saEmail=CU.email;
      var saToken=await fb.auth.currentUser.getIdToken();
      var pass=document.getElementById('u-password')&&document.getElementById('u-password').value||'';
      var tempPass=pass||('GPS@'+Date.now()+'!');

      // Tentar criar via endpoint serverless
      var created=false;
      try{
        var resp=await fetch('/.netlify/functions/create-user',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+saToken},
          body:JSON.stringify({email:email,password:tempPass,name:name})
        });
        if(resp.ok){
          var data=await resp.json();
          var uid=data.uid;
          var ud={id:uid,name:name,email:email,role:role,companyId:coId,companyIds:coChecked,status:'ativo',notes:notes,createdAt:new Date().toISOString()};
          await fb.setDoc(fb.doc(fb.db,'users',uid),ud);
          await fb.auth.sendPasswordResetEmail(email).catch(function(){});
          users.push(ud);renderUsers();
          toast('Usuário criado! E-mail de definição de senha enviado para '+email,'success',6000);
          created=true;
        }
      }catch(ex){console.warn('serverless create-user:',ex.message);}

      // Fallback: criar no client-side e re-autenticar SA
      if(!created){
        var saUser=fb.auth.currentUser;
        // Salvar credenciais do SA para re-auth (não é possível sem senha)
        // Alternativa: criar doc pendente e avisar o usuário para se cadastrar
        var uid='pending_'+Date.now();
        var ud={id:uid,name:name,email:email,role:role,companyId:coId,companyIds:coChecked,
          status:'pendente',notes:notes,createdAt:new Date().toISOString(),
          _needsAuth:true,_tempPass:tempPass};
        await fb.setDoc(fb.doc(fb.db,'users',uid),ud);
        users.push(ud);renderUsers();
        toast('Usuário cadastrado como pendente. Ele deve se registrar em app.gpsdogestor.com com o e-mail '+email,'info',8000);
      }
    }catch(e){toast('Erro ao criar usuário: '+e.message,'error');}
  } else {
    var idx=users.findIndex(function(u){return u.id===editId;});
    if(idx>=0){users[idx].name=name;users[idx].role=role;users[idx].companyId=coId;users[idx].companyIds=coId?[coId]:[];users[idx].notes=notes;}
    renderUsers();
    if(!window._previewMode){try{var fb2=window._fb;await fb2.updateDoc(fb2.doc(fb2.db,'users',editId),{name:name,role:role,companyId:coId,companyIds:coChecked,notes:notes});}catch(e){console.warn(e);}}
    toast('Usuário atualizado','success');
  }
}


async function excluirUser(userId){
  var u=users.find(function(x){return x.id===userId;});
  if(!u)return;
  if(u.id===CU.id){toast('Você não pode excluir sua própria conta.','error');return;}
  if(!confirm('Excluir permanentemente o usuário '+( u.name||u.email)+'?\nEsta ação não pode ser desfeita.'))return;
  var fb=window._fb;
  try{
    await fb.deleteDoc(fb.doc(fb.db,'users',userId));
    users=users.filter(function(x){return x.id!==userId;});
    renderUsers();
    if(typeof renderMyMembers==='function')renderMyMembers();
    toast('Usuário excluído','success');
  }catch(e){toast('Erro ao excluir: '+e.message,'error');console.error(e);}
}

async function toggleUserStatus(userId){
  var u=users.find(function(x){return x.id===userId;});if(!u)return;
  var ns=u.status==='inativo'?'ativo':'inativo';
  if(!confirm((ns==='inativo'?'Suspender':'Ativar')+' o acesso de '+u.name+'?'))return;
  u.status=ns;renderUsers();
  if(!window._previewMode){try{var fb=window._fb;await fb.updateDoc(fb.doc(fb.db,'users',userId),{status:ns});}catch(e){console.warn(e);}}
  toast('Acesso '+(ns==='ativo'?'ativado':'suspenso'),'success');
}

async function resetUserPassword(userId,email){
  if(!email){toast('E-mail não encontrado','error');return;}
  if(!confirm('Enviar e-mail de redefinição para '+email+'?'))return;
  if(window._previewMode){toast('[Preview] E-mail seria enviado para '+email,'info');return;}
  try{await window._fb.auth.sendPasswordResetEmail(email);toast('E-mail enviado para '+email,'success');}
  catch(e){toast('Erro: '+e.message,'error');}
}

// ── Licenças ──────────────────────────────────────────

function renderLicenses(){
  var body=document.getElementById('licenses-body');if(!body)return;
  var PLANOS=[
    {id:'trial',   l:'Trial',   price:'Grátis',    users:1},
    {id:'starter', l:'Starter', price:'R$97/mês',  users:1},
    {id:'pro',     l:'Pro',     price:'R$197/mês', users:5},
    {id:'business',l:'Business',price:'R$397/mês', users:15},
  ];

  var kpis='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp3);margin-bottom:var(--sp5)">'+
    PLANOS.map(function(p){
      var n=companies.filter(function(co){return co.plan===p.id&&co.status!=='inativo';}).length;
      return '<div class="card" style="padding:var(--sp4);text-align:center">'+
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px">'+p.l+'</div>'+
        '<div style="font-size:28px;font-weight:900;color:var(--navy);line-height:1;margin-bottom:4px">'+n+'</div>'+
        '<div style="font-size:11px;color:var(--muted)">organização'+(n!==1?'s':'')+' ativa'+(n!==1?'s':'')+'</div>'+
        '<div style="font-size:12px;font-weight:700;color:var(--blue);margin-top:6px">'+p.price+'</div>'+
      '</div>';
    }).join('')+
  '</div>';

  var toolbar='<div style="display:flex;justify-content:flex-end;margin-bottom:var(--sp4)">'+
    '<button class="btn btn-primary btn-sm" onclick="openLicenseModal()">+ Gerar licença</button></div>';

  var list=licenses.length===0
    ?'<div class="empty-state"><div class="empty-state-icon">🔐</div><div class="empty-state-title">Nenhuma licença</div></div>'
    :'<div style="display:flex;flex-direction:column;gap:var(--sp2)">'+
      licenses.map(function(l){
        var co=companies.find(function(c){return c.id===l.companyId;});
        var exp=l.expiresAt&&new Date(l.expiresAt)<new Date();
        var sc=l.status==='ativo'&&!exp?'var(--green)':exp?'var(--amber)':'var(--red)';
        var sl=l.status==='ativo'&&!exp?'Ativo':exp?'Expirado':'Inativo';
        // Usuários vinculados a essa organização
        var usersVinculados=users.filter(function(u){return l.companyId&&(u.companyId===l.companyId||(u.companyIds&&u.companyIds.includes(l.companyId)));});
        var adminOrganização=usersVinculados.find(function(u){return u.role==='admin_organização'||u.role==='superadmin';})||usersVinculados[0];
        var membrosExtra=usersVinculados.length>1?usersVinculados.length-1:0;

        return '<div class="card" style="padding:var(--sp3) var(--sp4)">'+
          '<div style="display:flex;align-items:flex-start;gap:var(--sp3);flex-wrap:wrap">'+
            '<div style="flex:1;min-width:160px">'+
              // Código e organização
              '<div style="display:flex;align-items:center;gap:var(--sp2);margin-bottom:4px;flex-wrap:wrap">'+
                '<div style="font-family:monospace;font-size:12px;font-weight:700;color:var(--navy);background:var(--bg2);padding:2px 8px;border-radius:var(--r4)">'+san(l.code||l.id)+'</div>'+
                '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--r4);background:var(--blue-lt);color:var(--blue)">'+san((l.plan||'trial').toUpperCase())+'</span>'+
                '<span style="font-size:11px;font-weight:700;color:'+sc+'">'+sl+'</span>'+
              '</div>'+
              // Organização
              '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:2px">'+san(co&&co.name||l.companyName||'Sem organização')+'</div>'+
              // Responsável (usuário vinculado)
              (adminOrganização?
                '<div style="font-size:12px;color:var(--text);margin-bottom:2px">'+
                  ''+san(adminOrganização.name||adminOrganização.email)+
                  '<span style="font-size:11px;color:var(--muted);margin-left:6px">'+san(adminOrganização.email)+'</span>'+
                  (membrosExtra>0?' <span style="font-size:10px;background:var(--bg2);color:var(--muted);padding:1px 6px;border-radius:var(--r4)">+'+membrosExtra+' membro'+(membrosExtra>1?'s':'')+'</span>':'')+
                '</div>':
                (l.email?'<div style="font-size:12px;color:var(--muted);margin-bottom:2px">'+san(l.companyName||l.email)+' · '+san(l.email)+'</div>':
                '<div style="font-size:12px;color:var(--muted2);margin-bottom:2px;font-style:italic">Sem usuário vinculado</div>')
              )+
              // Validade e limite
              '<div style="display:flex;align-items:center;gap:var(--sp2);flex-wrap:wrap;margin-top:4px">'+
                '<span style="font-size:11px;color:'+(exp?'var(--red)':'var(--muted)')+'">Válida até '+san(l.expiresAt?dateStr(l.expiresAt):'sem prazo')+'</span>'+
                '<span style="font-size:11px;color:var(--muted)">· '+l.maxUsers+' usuário'+(l.maxUsers!==1?'s':'')+'</span>'+
                '<span style="font-size:11px;color:var(--muted)">· '+usersVinculados.length+' ativo'+(usersVinculados.length!==1?'s':'')+'</span>'+
              '</div>'+
            '</div>'+
            '<div style="display:flex;gap:var(--sp1);flex-shrink:0;align-items:center">'+
              '<button class="btn btn-ghost btn-sm" onclick="copyCode(this.dataset.id)" data-id="'+String(l.code||l.id)+'">Copiar</button>'+
              '<button class="btn btn-ghost btn-sm" onclick="openLicenseModal(this.dataset.id)" data-id="'+l.id+'">Editar</button>'+
              '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirLicense(this.dataset.id)" data-id="'+l.id+'">Excluir</button>'+
            '</div>'+
          '</div>'+
        '</div>';
      }).join('')+
    '</div>';

  body.innerHTML=toolbar+kpis+list;
}

function generateLicense(){openLicenseModal();}

function openLicenseModal(editId){
  createSAModals();
  var modal=document.getElementById('sa-license-modal');
  modal._editId=editId||null;
  var existing=editId?licenses.find(function(l){return l.id===editId;}):null;
  var chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code='GPS-'+[0,1,2].map(function(){return [0,1,2,3].map(function(){return chars[Math.floor(Math.random()*chars.length)];}).join('');}).join('-');
  var coOpts=companies.map(function(co){return'<option value="'+co.id+'">'+san(co.name)+'</option>';}).join('');
  var exp30=new Date(Date.now()+30*86400000).toISOString().split('T')[0];
  // Preencher valores: existente ou padrão
  var selCo=existing?existing.companyId:'';
  var licCode=existing?existing.code:code;
  var licPlan=existing?existing.plan:'pro';
  var licExp=existing?existing.expiresAt.split('T')[0]:exp30;
  var licMax=existing?existing.maxUsers:5;
  var licName=existing?existing.companyName||'':'';
  var licEmail=existing?existing.email||'':'';
  var licStatus=existing?existing.status:'ativo';

  // Montar select de organização com organização vinculada selecionada
  var coOptsBuilt=companies.map(function(co){
    return '<option value="'+co.id+'"'+(selCo===co.id?' selected':'')+'>'+san(co.name)+'</option>';
  }).join('');

  // Montar select de planejamento
  var planejamentos=['trial','starter','pro','business'];
  var planLabels={trial:'Trial',starter:'Starter',pro:'Pro',business:'Business'};
  var planOptsBuilt=planejamentos.map(function(p){
    return '<option value="'+p+'"'+(licPlan===p?' selected':'')+'>'+planLabels[p]+'</option>';
  }).join('');

  var body=modal.querySelector('.modal-body');
  if(body)body.innerHTML=
    '<div class="form-group"><label class="form-label">Organização vinculada *</label>'+
    '<select class="input" id="lic-company"><option value="">— Selecione a organização —</option>'+coOptsBuilt+'</select></div>'+
    '<div class="form-group"><label class="form-label">Assinante (nome)</label>'+
    '<input class="input" id="lic-name" placeholder="Nome do responsável" value="'+san(licName)+'"></div>'+
    '<div class="form-group"><label class="form-label">E-mail do assinante</label>'+
    '<input class="input" id="lic-email" type="email" placeholder="email@organização.com" value="'+san(licEmail)+'"></div>'+
    '<div class="form-row">'+
      '<div class="form-group"><label class="form-label">Código</label>'+
      '<input class="input" id="lic-code" value="'+san(licCode)+'" style="font-family:monospace;font-weight:700;letter-spacing:.05em"></div>'+
      '<div class="form-group"><label class="form-label">Planejamento</label>'+
      '<select class="input" id="lic-plan">'+planOptsBuilt+'</select></div>'+
    '</div>'+
    '<div class="form-row">'+
      '<div class="form-group"><label class="form-label">Validade</label>'+
      '<input class="input" type="date" id="lic-expires" value="'+san(licExp)+'"></div>'+
      '<div class="form-group"><label class="form-label">Máx. usuários</label>'+
      '<input class="input" type="number" id="lic-maxusers" value="'+licMax+'" min="1"></div>'+
    '</div>'+
    '<div class="form-group"><label class="form-label">Status</label>'+
    '<select class="input" id="lic-status">'+
      '<option value="ativo"'+(licStatus==='ativo'?' selected':'')+'>Ativo</option>'+
      '<option value="inativo"'+(licStatus==='inativo'?' selected':'')+'>Inativo</option>'+
    '</select></div>';
  openModal('sa-license-modal');
}

async function saveLicense(){
  var modal=document.getElementById('sa-license-modal');
  var editId=modal&&modal._editId;
  var coId=(document.getElementById('lic-company')&&document.getElementById('lic-company').value)||'';
  var code=(document.getElementById('lic-code')&&document.getElementById('lic-code').value||'').trim().toUpperCase();
  var plan=(document.getElementById('lic-plan')&&document.getElementById('lic-plan').value)||'pro';
  var expiresAt=(document.getElementById('lic-expires')&&document.getElementById('lic-expires').value)||'';
  var maxUsers=parseInt(document.getElementById('lic-maxusers')&&document.getElementById('lic-maxusers').value)||5;
  var companyName=(document.getElementById('lic-name')&&document.getElementById('lic-name').value)||'';
  var email=(document.getElementById('lic-email')&&document.getElementById('lic-email').value)||'';
  var status=(document.getElementById('lic-status')&&document.getElementById('lic-status').value)||'ativo';

  if(!coId){toast('Selecione a organização vinculada','error');return;}
  if(!code){toast('Informe o código','error');return;}

  var co=companies.find(function(c){return c.id===coId;});
  var licId=editId||('lic_'+Date.now());

  var lic={
    id:licId,code:code,plan:plan,
    companyId:coId,
    companyName:companyName||( co&&co.name)||'',
    email:email,
    expiresAt:expiresAt,
    maxUsers:maxUsers,
    status:status,
    updatedAt:new Date().toISOString(),
    createdAt:editId?(licenses.find(function(l){return l.id===editId;})||{}).createdAt||new Date().toISOString():new Date().toISOString(),
  };

  // Atualizar cache local
  if(editId){
    var idx=licenses.findIndex(function(l){return l.id===editId;});
    if(idx>=0)licenses[idx]=lic;else licenses.push(lic);
  } else {
    licenses.push(lic);
  }

  // Sincronizar planejamento e status na organização vinculada
  if(co){
    co.plan=plan;
    co.licenseId=licId;
    co.licenseStatus=status;
    co.licenseExpires=expiresAt;
    co.maxUsers=maxUsers;
  }

  closeModal('sa-license-modal');renderLicenses();renderCompanies();

  var fb=window._fb;
  try{
    // Salvar licença
    await fb.setDoc(fb.doc(fb.db,'licenses',licId),lic);
    // Atualizar organização com dados da licença
    if(coId){
      await fb.updateDoc(fb.doc(fb.db,'companies',coId),{
        plan:plan,licenseId:licId,licenseStatus:status,
        licenseExpires:expiresAt,maxUsers:maxUsers,updatedAt:new Date().toISOString()
      });
    }
    toast((editId?'Licença atualizada':'Licença '+code+' gerada')+' e vinculada a '+(co&&co.name||companyName),'success',4000);
  }catch(e){toast('Erro: '+e.message,'error');console.warn(e);}
}

function copyCode(code){
  if(navigator.clipboard){navigator.clipboard.writeText(code).then(function(){toast('Copiado: '+code,'success',2000);});}
  else{toast(code,'info',4000);}
}

// ── Criação dos modais SA (lazy) ──────────────────────

function createSAModals(){
  if(document.getElementById('sa-company-modal'))return;
  function mkModal(id,title,sub,footer){
    return '<div class="overlay" id="'+id+'">'+
      '<div class="modal" style="max-width:500px">'+
        '<div class="modal-header modal-header-navy">'+
          '<div><div class="modal-title">'+title+'</div><div class="modal-subtitle">'+sub+'</div></div>'+
          '<button class="modal-close" onclick="closeModal(\''+id+'\')">✕</button>'+
        '</div>'+
        '<div class="modal-body"></div>'+
        '<div class="modal-footer">'+
          '<button class="btn btn-ghost" onclick="closeModal(\''+id+'\')">Cancelar</button>'+
          footer+
        '</div>'+
      '</div></div>';
  }
  var html=
    mkModal('sa-company-modal','Nova organização','Super Admin · Gestão','<button class="btn btn-primary" onclick="saveCompany()">Salvar</button>')+
    mkModal('sa-user-modal','Novo usuário','Super Admin · Acesso','<button class="btn btn-primary" onclick="saveUser()">Salvar</button>')+
    mkModal('sa-license-modal','Gerar licença','Super Admin · Assinaturas','<button class="btn btn-primary" onclick="saveLicense()">Gerar</button>');
  var div=document.createElement('div');
  div.innerHTML=html;
  while(div.firstChild)document.body.appendChild(div.firstChild);
}

// ── Fixes ──────────────────────────────────────────────

// Fix: Editar iniciativa - fechar detalhe antes de abrir editor
var _origOpenNovoIniciativa=openNovoIniciativa;
openNovoIniciativa=function(editId){
  var detModal=document.getElementById('proj-det-modal');
  if(editId&&detModal&&detModal.classList.contains('open')){
    closeModal('proj-det-modal');
    setTimeout(function(){_origOpenNovoIniciativa(editId);},150);
  }else{
    _origOpenNovoIniciativa(editId);
  }
};

// Funções de marco no modal do iniciativa
function adicionarMarcoModal(){
  var lista=document.getElementById('marcos-lista');
  var vazio=document.getElementById('marcos-vazio');
  if(!lista)return;
  var idx=lista.children.length;
  var div=document.createElement('div');
  div.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:6px';
  div.id='marco-item-'+idx;
  div.innerHTML=
    '<input class="input" style="flex:1;padding:6px 10px" placeholder="Título do marco" data-marco-idx="'+idx+'">'+
    '<input type="date" class="input" style="width:130px;padding:6px 8px" data-marco-prazo-idx="'+idx+'">'+
    '<button onclick="removerMarcoModal('+idx+')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;flex-shrink:0">✕</button>';
  lista.appendChild(div);
  if(vazio)vazio.style.display='none';
  div.querySelector('input').focus();
}

function removerMarcoModal(idx){
  var el=document.getElementById('marco-item-'+idx);
  if(el)el.remove();
  var lista=document.getElementById('marcos-lista');
  var vazio=document.getElementById('marcos-vazio');
  if(vazio&&lista&&lista.children.length===0)vazio.style.display='';
}

function getMarcosDosModal(){
  var lista=document.getElementById('marcos-lista');
  if(!lista)return[];
  var marcos=[];
  Array.from(lista.children).forEach(function(div){
    var tituloEl=div.querySelector('[data-marco-idx]');
    var prazoEl=div.querySelector('[data-marco-prazo-idx]');
    var titulo=tituloEl?tituloEl.value.trim():'';
    if(titulo){
      marcos.push({
        id:'marco_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
        titulo:titulo,
        dataEstimada:prazoEl?prazoEl.value:'',
        concluido:false,
      });
    }
  });
  return marcos.reverse(); // reverter para manter ordem original
}

// Adicionar marco de iniciativa à Agenda Executiva
function adicionarMarcoARotina(projId,marcoIdx){
  var proj=getIniciativas().find(function(p){return p.id===projId;});if(!proj)return;
  var marcosRev=[].concat(proj.marcos).reverse();
  var marco=marcosRev[marcoIdx];if(!marco)return;
  // Verificar se já existe na agenda-executiva
  var cards=getRotina();
  var jaExiste=cards.some(function(c){return c._projId===projId&&c._marcoIdx===marcoIdx;});
  if(jaExiste){toast('Marco já está na Agenda Executiva','info');return;}
  cards.push({
    id:'rot_'+Date.now(),
    titulo:marco.titulo,
    area:'operacional',
    energia:'alta',
    col:'fazer',
    prazo:marco.dataEstimada||'',
    notas:'Iniciativa: '+san(proj.nome),
    _projId:projId,
    _marcoIdx:marcoIdx,
    _bscMetaId:proj._bscMetaId||null,
    updatedAt:new Date().toISOString(),
    createdAt:new Date().toISOString(),
  });
  saveRotina(cards);
  toast('✓ Marco "'+marco.titulo+'" adicionado à Agenda Executiva','success');
  // Atualizar visual do botão para indicar que foi adicionado
  var btns=document.querySelectorAll('[onclick*="adicionarMarcoARotina(\''+projId+'\','+marcoIdx+')"]');
  btns.forEach(function(btn){
    btn.textContent='✓ Na Agenda Executiva';
    btn.style.background='var(--green)';
    btn.disabled=true;
  });
}



// ══════════════════════════════════════════════════════
// DIAGNÓSTICO DE PERFIL DO CLIENTE - 5 perguntas
// Rota Executiva · Perfil Comportamental
// ══════════════════════════════════════════════════════

var PERGUNTAS_PERFIL_CLI = [
  {
    pergunta: 'Quando esse stakeholder descreve um problema, como ele se comunica?',
    opcoes: [
      {texto: 'Vai direto ao ponto, quer solução rápida', perfil: 'Comandante'},
      {texto: 'Conta com entusiasmo, usa exemplos e histórias', perfil: 'Catalisador'},
      {texto: 'Explica o impacto nas pessoas, fala com cuidado', perfil: 'Conector'},
      {texto: 'Detalha o processo, quer entender a causa raiz', perfil: 'Artesao'},
    ]
  },
  {
    pergunta: 'Como esse stakeholder reage quando você apresenta uma negociação?',
    opcoes: [
      {texto: 'Vai direto para o preço e prazo, quer decidir logo', perfil: 'Comandante'},
      {texto: 'Fica animado com as possibilidades, faz perguntas sobre o futuro', perfil: 'Catalisador'},
      {texto: 'Pergunta sobre a relação, quer entender quem vai executar', perfil: 'Conector'},
      {texto: 'Pede mais dados, referências e detalhes antes de qualquer resposta', perfil: 'Artesao'},
    ]
  },
  {
    pergunta: 'O que parece incomodar mais esse stakeholder?',
    opcoes: [
      {texto: 'Perder tempo: reuniões longas, respostas vagas, processos lentos', perfil: 'Comandante'},
      {texto: 'Falta de visão: quando você foca no como antes do porquê', perfil: 'Catalisador'},
      {texto: 'Pressão e pressa: quando sente que está sendo empurrado para decidir', perfil: 'Conector'},
      {texto: 'Imprecisão: quando você não sabe responder uma dúvida técnica', perfil: 'Artesao'},
    ]
  },
  {
    pergunta: 'Como esse stakeholder se comunica no dia a dia?',
    opcoes: [
      {texto: 'Mensagens curtas e diretas, às vezes parece seco', perfil: 'Comandante'},
      {texto: 'Mensagens longas com várias ideias, muda de assunto facilmente', perfil: 'Catalisador'},
      {texto: 'Educado e cuidadoso, nunca é direto sobre problemas', perfil: 'Conector'},
      {texto: 'Muitas perguntas, questiona coisas que parecem óbvias, quer entender tudo', perfil: 'Artesao'},
    ]
  },
  {
    pergunta: 'Como esse stakeholder costuma tomar decisões de compra?',
    opcoes: [
      {texto: 'Rápido: se faz sentido para ele, fecha na hora', perfil: 'Comandante'},
      {texto: 'Pelo entusiasmo: se a ideia empolgou, vai em frente', perfil: 'Catalisador'},
      {texto: 'Devagar: precisa confiar antes de comprar', perfil: 'Conector'},
      {texto: 'Depois de pesquisar muito: compara, analisa e só decide quando tem certeza', perfil: 'Artesao'},
    ]
  },
];

var PERFIS_CLIENTE_INFO = {
  Comandante: {
    icon: '⚡', color: '#C0392B', bg: '#FDECEA',
    headline: 'Decide rápido. Quer resultado, prazo e próximo passo.',
    abordagem: [
      'Vá direto ao ponto: ROI, prazo e próximo passo na primeira fala.',
      'Nunca apresente problema sem já ter a solução na mão.',
      'Se parou de responder, envie uma negociação atualizada, não um follow-up genérico.',
      'Nunca crie urgência artificial. Ele percebe e desconfia.',
    ],
    cuidado: 'Não gaste tempo explicando metodologia. Ele compra resultado, não caminho.',
    sinal: 'Quando perguntar "quanto custa e quando começa?" sem ter visto tudo: é compra.',
  },
  Catalisador: {
    icon: '🔥', color: '#B07D1A', bg: '#FBF3E0',
    headline: 'Compra pelo entusiasmo. A visão precede o preço.',
    abordagem: [
      'Mostre a transformação antes de mostrar o serviço.',
      'Use linguagem de impacto: "imagina quando...", "o área / organização vai estar...".',
      'Mantenha a energia alta nos contatos. Se esfriou, perdeu o interesse.',
      'Nunca foque em detalhes operacionais na primeira conversa.',
    ],
    cuidado: 'Ele se empolga fácil e desiste fácil também. Crie marcos de comprometimento ao longo do processo.',
    sinal: 'Quando começar a falar sobre implementação espontaneamente: é compra.',
  },
  Conector: {
    icon: '🤝', color: '#1A7A4A', bg: '#E6F5EE',
    headline: 'Precisa de confiança antes de decidir. Relação primeiro, área / organização depois.',
    abordagem: [
      'Invista tempo antes de apresentar negociação. Ele está te avaliando.',
      'Pergunte sobre o área / organização e escute de verdade, não para vender.',
      'Nunca pressione. Silêncio significa dúvida não dita, não desinteresse.',
      'Pergunte: "tem algo que não ficou claro?": ele vai abrir.',
    ],
    cuidado: 'Ele não diz não diretamente. "Vou pensar" pode ser rejeição disfarçada. Abra espaço para o real.',
    sinal: 'Quando começar a contar situações pessoais do área / organização: é confiança, é compra.',
  },
  Artesao: {
    icon: '🎯', color: '#5B21B6', bg: '#F5F3FF',
    headline: 'Pesquisa tudo antes de decidir. Precisa de certeza, não de entusiasmo.',
    abordagem: [
      'Entregue metodologia, dados, cases e provas: ele vai checar.',
      'Responda perguntas técnicas com precisão. Imprecisão gera desconfiança.',
      'Não crie urgência artificial. Ele percebe e isso elimina a confiança.',
      'Dê tempo para processar. Follow-up depois de 5-7 dias, não em 24h.',
    ],
    cuidado: 'Pode entrar em paralisia por análise. Se passar de 3 semanas, ofereça uma conversa para tirar dúvidas específicas.',
    sinal: 'Quando começar a perguntar sobre detalhes de implementação: é compra.',
  },
};

var _perfilCliStep = 0;
var _perfilCliResp = {};
var _perfilCliId = null;

function openPerfilStakeholderModal(clientId) {
  var c = clientId ? clients.find(function(x){ return x.id === clientId; }) : null;
  _perfilCliId = clientId || null;

  if(c && c.perfil && PERFIS_CLIENTE_INFO[c.perfil]) {
    showPerfilStakeholderResultado(c.perfil, c);
    return;
  }

  _perfilCliStep = 0;
  _perfilCliResp = {};
  criarModalPerfilStakeholder();
  renderPerfilCliStep();
  openModal('perfil-cli-modal');
}

function criarModalPerfilStakeholder() {
  if(document.getElementById('perfil-cli-modal')) return;
  var div = document.createElement('div');
  div.innerHTML =
    '<div class="overlay" id="perfil-cli-modal">' +
      '<div class="modal" style="max-width:540px;padding:0;overflow:hidden">' +
        '<div style="background:linear-gradient(135deg,var(--navy),var(--blue));padding:20px 24px;color:#fff">' +
          '<div style="display:flex;align-items:flex-start;justify-content:space-between">' +
            '<div>' +
              '<div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.7;margin-bottom:4px">MÉTODO Rota Executiva · PERFIL COMPORTAMENTAL</div>' +
              '<div style="font-size:18px;font-weight:800" id="perfil-cli-titulo">Diagnóstico de Perfil</div>' +
            '</div>' +
            '<button onclick="closeModal(\'perfil-cli-modal\')" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:12px">✕</button>' +
          '</div>' +
          '<div style="font-size:12px;opacity:.8;margin-top:4px">5 perguntas rápidas sobre o comportamento do stakeholder</div>' +
          '<div style="margin-top:12px;height:3px;background:rgba(255,255,255,.2);border-radius:2px">' +
            '<div id="perfil-cli-bar" style="height:100%;border-radius:2px;background:#fff;transition:width .4s;width:0%"></div>' +
          '</div>' +
          '<div style="font-size:11px;opacity:.65;margin-top:5px" id="perfil-cli-step-label"></div>' +
        '</div>' +
        '<div style="padding:24px" id="perfil-cli-body"></div>' +
        '<div style="padding:0 24px 20px;display:flex;justify-content:space-between;align-items:center">' +
          '<button class="btn btn-ghost btn-sm" id="perfil-cli-back" onclick="perfilCliBack()" style="display:none">← Anterior</button>' +
          '<div></div>' +
          '<button class="btn btn-primary" id="perfil-cli-next" onclick="perfilCliNext()">Próxima →</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  while(div.firstChild) document.body.appendChild(div.firstChild);
}

function renderPerfilCliStep() {
  var total = PERGUNTAS_PERFIL_CLI.length;
  var q = PERGUNTAS_PERFIL_CLI[_perfilCliStep];
  var pct = Math.round(_perfilCliStep / total * 100);

  var bar = document.getElementById('perfil-cli-bar');
  if(bar) bar.style.width = pct + '%';
  var label = document.getElementById('perfil-cli-step-label');
  if(label) label.textContent = 'Pergunta ' + (_perfilCliStep + 1) + ' de ' + total;
  var back = document.getElementById('perfil-cli-back');
  if(back) back.style.display = _perfilCliStep > 0 ? '' : 'none';
  var next = document.getElementById('perfil-cli-next');
  if(next) next.textContent = _perfilCliStep === total - 1 ? 'Ver perfil →' : 'Próxima →';

  var c = _perfilCliId ? clients.find(function(x){ return x.id === _perfilCliId; }) : null;
  var titulo = document.getElementById('perfil-cli-titulo');
  if(titulo) titulo.textContent = c ? 'Diagnóstico de Perfil: ' + c.name : 'Diagnóstico de Perfil';

  var body = document.getElementById('perfil-cli-body');
  if(!body) return;

  var html = '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--blue);margin-bottom:12px">Pergunta ' + (_perfilCliStep + 1) + ' de ' + total + '</div>';
  html += '<div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.5;margin-bottom:18px">' + san(q.pergunta) + '</div>';
  html += '<div style="display:flex;flex-direction:column;gap:10px">';
  q.opcoes.forEach(function(o, i) {
    var sel = _perfilCliResp[_perfilCliStep] === i;
    html += '<button onclick="selecionarPerfilCli(' + i + ')" style="text-align:left;padding:12px 16px;border-radius:10px;border:1.5px solid ' + (sel ? 'var(--blue)' : 'var(--border)') + ';background:' + (sel ? 'var(--blue-lt)' : 'var(--white)') + ';cursor:pointer;font-family:var(--font);font-size:13px;color:var(--text);line-height:1.5;transition:all .15s;font-weight:' + (sel ? '600' : '400') + '">';
    html += '<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:' + (sel ? 'var(--blue)' : 'var(--border)') + ';color:' + (sel ? '#fff' : 'var(--muted)') + ';font-size:11px;font-weight:700;margin-right:10px;flex-shrink:0">' + (sel ? '✓' : String.fromCharCode(65 + i)) + '</span>';
    html += san(o.texto) + '</button>';
  });
  html += '</div>';
  body.innerHTML = html;
}

function selecionarPerfilCli(idx) {
  _perfilCliResp[_perfilCliStep] = idx;
  renderPerfilCliStep();
}

function perfilCliBack() {
  if(_perfilCliStep > 0) { _perfilCliStep--; renderPerfilCliStep(); }
}

function perfilCliNext() {
  if(_perfilCliResp[_perfilCliStep] === undefined) { toast('Selecione uma opção', 'error'); return; }
  if(_perfilCliStep < PERGUNTAS_PERFIL_CLI.length - 1) {
    _perfilCliStep++;
    renderPerfilCliStep();
  } else {
    calcPerfilCli();
  }
}

function calcPerfilCli() {
  var scores = {Comandante:0, Catalisador:0, Conector:0, Artesao:0};
  Object.keys(_perfilCliResp).forEach(function(step) {
    var idx = _perfilCliResp[step];
    var perfil = PERGUNTAS_PERFIL_CLI[step].opcoes[idx].perfil;
    scores[perfil]++;
  });
  var sorted = Object.entries(scores).sort(function(a,b){ return b[1]-a[1]; });
  var perfil = sorted[0][0];

  var c = _perfilCliId ? clients.find(function(x){ return x.id === _perfilCliId; }) : null;
  if(c) {
    c.perfil = perfil;
    c.updatedAt = new Date().toISOString();
    saveClientToFirestore(c);
    renderPipeline();
    if(typeof renderClients === 'function') renderClients();
  }

  closeModal('perfil-cli-modal');
  showPerfilStakeholderResultado(perfil, c);
  toast('Perfil mapeado: ' + perfil, 'success');
}

function showPerfilStakeholderResultado(perfil, c) {
  var p = PERFIS_CLIENTE_INFO[perfil];
  if(!p) return;
  _perfilCliId = c ? c.id : _perfilCliId;

  if(!document.getElementById('perfil-cli-resultado-modal')) {
    var div = document.createElement('div');
    div.innerHTML =
      '<div class="overlay" id="perfil-cli-resultado-modal">' +
        '<div class="modal" style="max-width:560px">' +
          '<div class="modal-header modal-header-navy">' +
            '<div>' +
              '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:3px">Perfil Comportamental · Rota Executiva</div>' +
              '<div class="modal-title" id="perfil-cli-r-titulo">Resultado</div>' +
            '</div>' +
            '<button class="modal-close" onclick="closeModal(\'perfil-cli-resultado-modal\')">✕</button>' +
          '</div>' +
          '<div class="modal-body" id="perfil-cli-r-body"></div>' +
          '<div class="modal-footer">' +
            '<button class="btn btn-ghost" onclick="closeModal(\'perfil-cli-resultado-modal\')">Fechar</button>' +
            '<button class="btn btn-primary" onclick="closeModal(\'perfil-cli-resultado-modal\');_perfilCliStep=0;_perfilCliResp={};criarModalPerfilStakeholder();renderPerfilCliStep();openModal(\'perfil-cli-modal\')">Refazer</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    while(div.firstChild) document.body.appendChild(div.firstChild);
  }

  var titulo = document.getElementById('perfil-cli-r-titulo');
  if(titulo) titulo.textContent = (c ? c.name + ' · ' : '') + perfil + ' ' + p.icon;

  var body = document.getElementById('perfil-cli-r-body');
  if(body) body.innerHTML =
    '<div style="display:flex;align-items:center;gap:16px;padding:16px;background:' + p.bg + ';border-radius:10px;margin-bottom:20px">' +
      '<div style="font-size:44px">' + p.icon + '</div>' +
      '<div>' +
        '<div style="font-size:17px;font-weight:800;color:' + p.color + '">' + san(perfil) + '</div>' +
        '<div style="font-size:13px;color:var(--text);margin-top:4px;line-height:1.5">' + san(p.headline) + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="margin-bottom:18px">' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--blue);margin-bottom:10px">Como abordar</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      p.abordagem.map(function(a,i) {
        return '<div style="display:flex;gap:12px;padding:10px 12px;background:var(--bg);border-radius:8px">' +
          '<div style="width:20px;height:20px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0">' + (i+1) + '</div>' +
          '<div style="font-size:13px;color:var(--text);line-height:1.5">' + san(a) + '</div>' +
        '</div>';
      }).join('') +
      '</div>' +
    '</div>' +
    '<div style="margin-bottom:12px;padding:12px 14px;background:var(--amber-lt);border-radius:8px;border-left:3px solid var(--amber)">' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--amber);margin-bottom:4px">Atenção</div>' +
      '<div style="font-size:13px;color:var(--text);line-height:1.5">' + san(p.cuidado) + '</div>' +
    '</div>' +
    '<div style="padding:12px 14px;background:var(--green-lt);border-radius:8px;border-left:3px solid var(--green)">' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--green);margin-bottom:4px">Sinal de compra</div>' +
      '<div style="font-size:13px;color:var(--text);line-height:1.5">' + san(p.sinal) + '</div>' +
    '</div>';

  openModal('perfil-cli-resultado-modal');
}

// ══════════════════════════════════════════════════════
// MATRIZ DE EISENHOWER - Agenda CEO
// ══════════════════════════════════════════════════════

var _matrizItens = [];

function getMatriz(){
  if(_ceoCache.matriz!==null)return _ceoCache.matriz;
  try{return JSON.parse(localStorage.getItem('gps_v2_ceo_matriz_'+(CU&&CU.id||''))||localStorage.getItem('gps_v2_matriz_'+(CU&&CU.id||''))||'[]');}catch(e){return[];}
}
function saveMatriz(itens){_saveCeoField('matriz',itens);}

var MATRIZ_QUADRANTES = [
  {id:'urgente-importante',   label:'Urgente + Importante',   sub:'Faça agora',    cor:'#C0392B', bg:'#FDECEA', destino:'agenda-executiva',  destinoLabel:'Agenda Executiva: Fazer'},
  {id:'nao-urgente-importante',label:'Não urgente + Importante',sub:'Agende e planeje',cor:'#1A4F8A',bg:'#EFF6FF',destino:'iniciativa',destinoLabel:'Iniciativas'},
  {id:'urgente-nao-importante',label:'Urgente + Não importante',sub:'Delegue',      cor:'#5B21B6', bg:'#F5F3FF', destino:'agenda-executiva',  destinoLabel:'Agenda Executiva: Em andamento'},
  {id:'nao-urgente-nao-importante',label:'Não urgente + Não importante',sub:'Elimine',cor:'#6B7A8D',bg:'#F4F6F9',destino:null,    destinoLabel:'Eliminar'},
];

function renderMatriz(){
  var container = document.getElementById('semana-matriz-content')||document.getElementById('ceo-matriz-content');
  if(!container) return;
  _matrizItens = getMatriz();

  var html =
    '<div style="padding:var(--sp5) var(--sp6)">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp5)">' +
        '<div>' +
          '<div style="font-size:16px;font-weight:800;color:var(--text)">Matriz de Eisenhower</div>' +
          '<div style="font-size:12px;color:var(--muted);margin-top:2px">Classifique suas tarefas antes de entrar na Agenda Executiva ou Iniciativas</div>' +
        '</div>' +
        '<button class="btn btn-primary btn-sm" onclick="openMatrizNovaItem()">+ Nova tarefa</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';

  MATRIZ_QUADRANTES.forEach(function(q){
    var itens = _matrizItens.filter(function(i){ return i.quadrante === q.id; });
    html +=
      '<div style="background:var(--white);border:1.5px solid ' + q.cor + '33;border-radius:var(--r2);overflow:hidden">' +
        '<div style="padding:12px 14px;background:' + q.bg + ';border-bottom:1px solid ' + q.cor + '22">' +
          '<div style="font-size:12px;font-weight:800;color:' + q.cor + '">' + san(q.label) + '</div>' +
          '<div style="font-size:10px;color:' + q.cor + ';opacity:.8;font-weight:600;margin-top:1px">' + san(q.sub) + '</div>' +
        '</div>' +
        '<div style="padding:10px;min-height:80px;display:flex;flex-direction:column;gap:6px">';

    if(itens.length === 0){
      html += '<div style="font-size:11px;color:var(--muted2);text-align:center;padding:16px 0">Nenhuma tarefa</div>';
    } else {
      itens.forEach(function(item){
        html +=
          '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg);border-radius:6px;border:1px solid var(--border)">' +
            '<div style="flex:1">' +
              '<div style="font-size:12px;font-weight:600;color:var(--text)">' + san(item.titulo) + '</div>' +
              (item.obs ? '<div style="font-size:11px;color:var(--muted);margin-top:1px">' + san(item.obs) + '</div>' : '') +
            '</div>' +
            (q.destino ?
              '<button onclick="confirmarTransferirMatriz(\'' + item.id + '\',\'' + q.id + '\')" style="flex-shrink:0;padding:3px 8px;border-radius:4px;border:1px solid ' + q.cor + ';background:transparent;color:' + q.cor + ';font-size:10px;font-weight:700;cursor:pointer" title="Transferir para ' + q.destinoLabel + '">→ ' + (q.destino === 'iniciativa' ? 'Iniciativa' : 'Agenda Executiva') + '</button>' : '') +
            '<button onclick="removerItemMatriz(\'' + item.id + '\')" style="flex-shrink:0;width:20px;height:20px;border-radius:50%;border:none;background:var(--border);color:var(--muted);font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>' +
          '</div>';
      });
    }

    html += '</div>' + // fim lista itens
      (q.destino ?
        '<div style="padding:6px 10px 10px">' +
          '<button onclick="confirmarTransferirTodos(\'' + q.id + '\',\'' + q.destino + '\')" style="width:100%;padding:6px;border-radius:6px;border:1px dashed ' + q.cor + '44;background:transparent;color:' + q.cor + ';font-size:11px;font-weight:600;cursor:pointer">Transferir todos → ' + san(q.destinoLabel) + '</button>' +
        '</div>' : '') +
      '</div>';
  });

  html += '</div></div>';
  container.innerHTML = html;
}

function openMatrizNovaItem(){
  if(!document.getElementById('matriz-nova-modal')){
    var div = document.createElement('div');
    div.innerHTML =
      '<div class="overlay" id="matriz-nova-modal">' +
        '<div class="modal" style="max-width:460px">' +
          '<div class="modal-header modal-header-navy">' +
            '<div class="modal-title">Nova tarefa na Matriz</div>' +
            '<button class="modal-close" onclick="closeModal(\'matriz-nova-modal\')">✕</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div class="form-group"><label class="form-label">Tarefa *</label>' +
            '<input class="input" id="mz-titulo" placeholder="O que precisa ser feito?"></div>' +
            '<div class="form-group"><label class="form-label">Observação</label>' +
            '<input class="input" id="mz-obs" placeholder="Contexto, detalhes..."></div>' +
            '<div class="form-group"><label class="form-label">Quadrante</label>' +
            '<select class="input" id="mz-quadrante">' +
            MATRIZ_QUADRANTES.map(function(q){ return '<option value="' + q.id + '">' + q.label + ': ' + q.sub + '</option>'; }).join('') +
            '</select></div>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button class="btn btn-ghost" onclick="closeModal(\'matriz-nova-modal\')">Cancelar</button>' +
            '<button class="btn btn-primary" onclick="salvarItemMatriz()">Adicionar</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    while(div.firstChild) document.body.appendChild(div.firstChild);
  }
  var t = document.getElementById('mz-titulo');
  var o = document.getElementById('mz-obs');
  var q = document.getElementById('mz-quadrante');
  if(t) t.value = '';
  if(o) o.value = '';
  if(q) q.selectedIndex = 0;
  openModal('matriz-nova-modal');
  setTimeout(function(){ if(t) t.focus(); }, 200);
}

function salvarItemMatriz(){
  var titulo = (document.getElementById('mz-titulo')||{}).value||'';
  if(!titulo.trim()){ toast('Informe a tarefa','error'); return; }
  var obs = (document.getElementById('mz-obs')||{}).value||'';
  var quadrante = (document.getElementById('mz-quadrante')||{}).value||'urgente-importante';
  _matrizItens = getMatriz();
  _matrizItens.push({id:'mz_'+Date.now(), titulo:titulo.trim(), obs:obs.trim(), quadrante:quadrante, criadoEm:new Date().toISOString()});
  saveMatriz(_matrizItens);
  closeModal('matriz-nova-modal');
  renderMatriz();
  toast('Tarefa adicionada','success');
}

function removerItemMatriz(id){
  _matrizItens = getMatriz().filter(function(i){ return i.id !== id; });
  saveMatriz(_matrizItens);
  renderMatriz();
}

function confirmarTransferirMatriz(itemId, quadranteId){
  var q = MATRIZ_QUADRANTES.find(function(x){ return x.id === quadranteId; });
  var item = getMatriz().find(function(i){ return i.id === itemId; });
  if(!q || !item) return;

  if(!document.getElementById('matriz-transferir-modal')){
    var div = document.createElement('div');
    div.innerHTML =
      '<div class="overlay" id="matriz-transferir-modal">' +
        '<div class="modal" style="max-width:420px">' +
          '<div class="modal-header modal-header-navy">' +
            '<div class="modal-title">Transferir tarefa</div>' +
            '<button class="modal-close" onclick="closeModal(\'matriz-transferir-modal\')">✕</button>' +
          '</div>' +
          '<div class="modal-body" id="matriz-transferir-body"></div>' +
          '<div class="modal-footer">' +
            '<button class="btn btn-ghost" onclick="closeModal(\'matriz-transferir-modal\')">Cancelar</button>' +
            '<button class="btn btn-primary" id="matriz-transferir-btn" onclick="">Confirmar</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    while(div.firstChild) document.body.appendChild(div.firstChild);
  }

  var destLabel = q.destino === 'iniciativa' ? 'Iniciativas' : 'Agenda Executiva (coluna Fazer)';
  var body = document.getElementById('matriz-transferir-body');
  if(body) body.innerHTML =
    '<div style="padding:4px 0">' +
      '<div style="font-size:13px;color:var(--text);line-height:1.6;margin-bottom:16px">' +
        'Transferir <strong>' + san(item.titulo) + '</strong> para <strong>' + destLabel + '</strong>?' +
      '</div>' +
      (q.destino === 'iniciativa' ?
        '<div style="background:var(--blue-lt);border-radius:8px;padding:12px;font-size:12px;color:var(--blue);line-height:1.5">' +
          'Vai abrir como um novo iniciativa. Você poderá definir o objetivo, prazo e marcos.' +
        '</div>' :
        '<div style="background:var(--green-lt);border-radius:8px;padding:12px;font-size:12px;color:var(--green);line-height:1.5">' +
          'Vai criar um card na coluna <strong>Fazer</strong> da sua Agenda Executiva.' +
        '</div>'
      ) +
    '</div>';

  var btn = document.getElementById('matriz-transferir-btn');
  if(btn) btn.onclick = function(){ executarTransferirMatriz(itemId, q.destino); };

  openModal('matriz-transferir-modal');
}

function confirmarTransferirTodos(quadranteId, destino){
  var itens = getMatriz().filter(function(i){ return i.quadrante === quadranteId; });
  if(itens.length === 0){ toast('Nenhuma tarefa neste quadrante','info'); return; }
  var q = MATRIZ_QUADRANTES.find(function(x){ return x.id === quadranteId; });
  var destLabel = destino === 'iniciativa' ? 'Iniciativas' : 'Agenda Executiva (coluna Fazer)';
  if(confirm('Transferir ' + itens.length + ' tarefa(s) de "' + q.label + '" para ' + destLabel + '?')){
    itens.forEach(function(item){ executarTransferirMatriz(item.id, destino, true); });
    renderMatriz();
    toast(itens.length + ' tarefa(s) transferida(s)','success');
  }
}

function executarTransferirMatriz(itemId, destino, silencioso){
  var todos = getMatriz();
  var item = todos.find(function(i){ return i.id === itemId; });
  if(!item) return;

  if(destino === 'agenda-executiva'){
    // Adicionar na Agenda Executiva coluna Fazer
    var rotina = getRotina();
    rotina.push({
      id:'rot_mz_'+Date.now(),
      titulo: item.titulo,
      col:'fazer',
      area:'operacional',
      obs: item.obs || 'Vindo da Matriz de Eisenhower',
      _origem:'matriz',
      _matrizId: item.id,
      updatedAt: new Date().toISOString(),
      criadoEm: new Date().toISOString()
    });
    saveRotina(agenda-executiva);
  } else if(destino === 'iniciativa'){
    // Criar iniciativa simples
    var iniciativas = getIniciativas();
    iniciativas.push({
      id:'proj_mz_'+Date.now(),
      nome: item.titulo,
      objetivo: item.obs || '',
      marcos:[],
      status:'ativo',
      criadoEm: new Date().toISOString()
    });
    saveIniciativas(iniciativas);
  }

  // Remover da matriz
  var restante = todos.filter(function(i){ return i.id !== itemId; });
  saveMatriz(restante);
  _matrizItens = restante;

  if(!silencioso){
    closeModal('matriz-transferir-modal');
    renderMatriz();
    toast('Tarefa transferida para ' + (destino === 'iniciativa' ? 'Iniciativas' : 'Agenda Executiva'),'success');
  }
}

// ══════════════════════════════════════════════════════
// FERRAMENTAS Rota Executiva - Uma por letra
// ══════════════════════════════════════════════════════

var DECIFRE_FERRAMENTAS = {
  D: {
    titulo: 'Diagnóstico do Perfil do Executivo',
    desc: 'Descubra como você decide e lidera, e como isso impacta o seu área / organização.',
    acao: 'openDiagExecutivo()',
    btnLabel: 'Fazer o diagnóstico',
    corBtn: 'btn-primary',
    icon: '🧭',
  },
  E1: {
    titulo: 'Raio-X da Estrutura',
    desc: '5 perguntas que revelam o nível real de organização do seu área / organização.',
    acao: 'openFerramentaRaioX()',
    btnLabel: 'Abrir Raio-X',
    corBtn: 'btn-primary',
    icon: '📋',
  },
  C: {
    titulo: 'Mapa de Aderência ao Mercado',
    desc: 'Três partes: quem você atende hoje, quem deveria atender, e o que muda.',
    acao: 'openFerramentaMapa()',
    btnLabel: 'Abrir Mapa',
    corBtn: 'btn-primary',
    icon: '🗺️',
  },
  I: {
    titulo: 'Checklist Operacional',
    desc: 'Escolha uma etapa crítica e crie um checklist simples que reduz caos.',
    acao: 'openFerramentaChecklist()',
    btnLabel: 'Criar checklist',
    corBtn: 'btn-primary',
    icon: '✅',
  },
  F: {
    titulo: 'Raio-X Financeiro',
    desc: '5 perguntas que revelam a saúde financeira real do seu área / organização agora.',
    acao: 'openFerramentaFinanceiro()',
    btnLabel: 'Abrir Raio-X Financeiro',
    corBtn: 'btn-primary',
    icon: '💰',
  },
  R: {
    titulo: 'Diagnóstico A.R.E.S.',
    desc: 'Avalie os 4 pilares de saúde emocional do área / organização: Autonomia, Reconhecimento, Equilíbrio e Sentido.',
    acao: 'openFerramentaAres()',
    btnLabel: 'Fazer diagnóstico A.R.E.S.',
    corBtn: 'btn-primary',
    icon: '⚖️',
  },
  E2: {
    titulo: 'Momento Estratégico',
    desc: 'Sessão mensal de reflexão estratégica. Revisão, decisões e próximo passo do área / organização.',
    acao: "navTo('ceo',document.querySelector('.nav-item[data-view=\"ceo\"]'));setTimeout(function(){switchCeoTab('momento');},200);",
    btnLabel: 'Ir para Momento Estratégico',
    corBtn: 'btn-ceo',
    icon: '⟐',
  },
};

// ── RENDERIZAR etapas com botão de ferramenta ──────────
var _decifreOpen = -1;

function toggleDecifreCard(idx){
  _decifreOpen = _decifreOpen === idx ? -1 : idx;
  renderDecifreEtapas();
}

function renderDecifreEtapas(){
  var etapasEl = document.getElementById('decifre-etapas');
  if(!etapasEl) return;
  var diagResult = getDiagResult();
  var focoNome = diagResult && diagResult.foco && diagResult.foco.nome;
  var ferramentaKeys = ['D','E1','C','I','F','R','E2'];

  etapasEl.innerHTML = DECIFRE_ETAPAS_V2.map(function(e, i){
    var isFoco = focoNome === e.nome;
    var isOpen = _decifreOpen === i;
    var fKey = ferramentaKeys[i];
    var f = DECIFRE_FERRAMENTAS[fKey];

    var card =
      '<div style="' +
        'border:1.5px solid ' + (isOpen ? e.cor : isFoco ? e.cor+'88' : 'var(--border)') + ';' +
        'border-radius:var(--r2);margin-bottom:8px;overflow:hidden;' +
        'background:' + (isOpen ? e.bg : 'var(--white)') + ';' +
        'transition:all .2s;' +
      '">' +
        // Header clicável
        '<div onclick="toggleDecifreCard(' + i + ')" style="' +
          'display:flex;align-items:center;gap:14px;padding:14px 18px;cursor:pointer;' +
          'user-select:none;' +
        '">' +
          // Letra grande
          '<div style="' +
            'width:44px;height:44px;border-radius:10px;flex-shrink:0;' +
            'background:' + (isOpen ? e.cor : e.bg) + ';' +
            'display:flex;align-items:center;justify-content:center;' +
            'transition:background .2s;' +
          '">' +
            '<span style="font-size:22px;font-weight:900;color:' + (isOpen ? '#fff' : e.cor) + '">' + e.letra + '</span>' +
          '</div>' +
          '<div style="flex:1">' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<div style="font-size:14px;font-weight:800;color:var(--text)">' + san(e.nome) + '</div>' +
              (isFoco ? '<span style="font-size:9px;font-weight:700;background:' + e.cor + ';color:#fff;padding:2px 7px;border-radius:20px">FOCO</span>' : '') +
            '</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + (f ? san(f.icon) + ' ' + san(f.btnLabel) : 'Clique para abrir') + '</div>' +
          '</div>' +
          // Chevron
          '<div style="color:var(--muted);font-size:12px;transition:transform .2s;transform:rotate(' + (isOpen ? '90' : '0') + 'deg)">›</div>' +
        '</div>';

    // Conteúdo expandido
    if(isOpen && f){
      card +=
        '<div style="padding:0 18px 18px;border-top:1px solid ' + e.cor + '22">' +
          '<div style="padding-top:14px;font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:14px">' + san(f.desc) + '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="btn ' + f.corBtn + ' btn-sm" onclick="' + f.acao + '">' + san(f.icon) + ' ' + san(f.btnLabel) + '</button>' +
            (fKey === 'D' ? '<button class="btn btn-ghost btn-sm" onclick="openDiagExecutivo()">Ver resultado</button>' : '') +
            (fKey === 'E2' ? '<button class="btn btn-ghost btn-sm" onclick="openMomentoCEO()">Iniciar sessão</button>' : '') +
          '</div>' +
        '</div>';
    }

    card += '</div>';
    return card;
  }).join('');
}

// Sobrescrever renderDecifre para usar a nova versão
var _renderDecifreOrig = renderDecifre;
renderDecifre = function(){
  var myC = myClients();
  renderDecifreEtapas();
  var insightEl = document.getElementById('decifre-insight');
  if(insightEl){
    var ins = INSIGHTS_V2[new Date().getDate() % INSIGHTS_V2.length];
    insightEl.innerHTML = '<div class="insight-card"><div class="insight-label">' + ins.etapa + ' · Rota Executiva</div><div class="insight-text">"' + ins.texto + '"</div><div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:var(--sp3);text-transform:uppercase;letter-spacing:.06em">GPS do Gestor · by Grupo Vertriah</div></div>';
  }
  var ceoEl = document.getElementById('decifre-momento-ceo');
  if(ceoEl){ ceoEl.innerHTML = ''; } // movido para o card E dentro das etapas
};

// ══════════════════════════════════════════════════════
// FERRAMENTA E - RAIO-X DA ESTRUTURA
// ══════════════════════════════════════════════════════

var RAIOX_PERGUNTAS = [
  'Hoje, eu sei explicar com clareza o que meu área / organização faz?',
  'Hoje, eu sei qual é a minha prioridade principal?',
  'Hoje, minha agenda-executiva combina com meus objetivos?',
  'Hoje, meu área / organização depende de critério ou de improviso?',
  'Hoje, eu consigo identificar o que sustenta resultado?',
];

var _raioxResps = {};

function openFerramentaRaioX(){
  _raioxResps = {};
  if(!document.getElementById('raiox-modal')){
    var div = document.createElement('div');
    div.innerHTML =
      '<div class="overlay" id="raiox-modal">' +
        '<div class="modal" style="max-width:540px">' +
          '<div class="modal-header modal-header-navy">' +
            '<div><div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:3px">E · Estruturar</div>' +
            '<div class="modal-title">Raio-X da Estrutura</div></div>' +
            '<button class="modal-close" onclick="closeModal(\'raiox-modal\')">✕</button>' +
          '</div>' +
          '<div class="modal-body" id="raiox-body"></div>' +
          '<div class="modal-footer">' +
            '<button class="btn btn-ghost" onclick="closeModal(\'raiox-modal\')">Fechar</button>' +
            '<button class="btn btn-primary" onclick="calcRaioX()">Ver resultado</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    while(div.firstChild) document.body.appendChild(div.firstChild);
  }
  renderRaioXBody();
  openModal('raiox-modal');
}

function renderRaioXBody(){
  var body = document.getElementById('raiox-body');
  if(!body) return;
  var html = '<div style="font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.6">Para cada pergunta, classifique de <strong>0 a 2</strong>: 0 = sem clareza · 1 = alguma clareza, mas instável · 2 = tenho e sustento na prática</div>';
  RAIOX_PERGUNTAS.forEach(function(q, i){
    html +=
      '<div style="margin-bottom:16px;padding:14px;background:var(--bg);border-radius:10px">' +
        '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px;line-height:1.5">' + (i+1) + '. ' + san(q) + '</div>' +
        '<div style="display:flex;gap:8px">' +
        [0,1,2].map(function(v){
          var sel = _raioxResps[i] === v;
          var labels = ['Sem clareza','Alguma clareza','Tenho e sustento'];
          return '<button onclick="selecionarRaioX(' + i + ',' + v + ')" style="flex:1;padding:8px 6px;border-radius:8px;border:1.5px solid ' + (sel ? 'var(--blue)' : 'var(--border)') + ';background:' + (sel ? 'var(--blue-lt)' : 'var(--white)') + ';cursor:pointer;font-family:var(--font);text-align:center">' +
            '<div style="font-size:16px;font-weight:800;color:' + (sel ? 'var(--blue)' : 'var(--muted)') + '">' + v + '</div>' +
            '<div style="font-size:10px;color:' + (sel ? 'var(--blue)' : 'var(--muted2)') + ';margin-top:2px">' + san(labels[v]) + '</div>' +
          '</button>';
        }).join('') +
        '</div>' +
      '</div>';
  });
  body.innerHTML = html;
}

function selecionarRaioX(idx, val){
  _raioxResps[idx] = val;
  renderRaioXBody();
}

function calcRaioX(){
  var total = 0;
  var respondidas = Object.keys(_raioxResps).length;
  if(respondidas < RAIOX_PERGUNTAS.length){ toast('Responda todas as perguntas','error'); return; }
  Object.values(_raioxResps).forEach(function(v){ total += v; });
  var leitura, cor;
  if(total <= 4){ leitura = 'Seu área / organização está operando com alto nível de dispersão. A prioridade é clareza antes de crescimento.'; cor = 'var(--red)'; }
  else if(total <= 7){ leitura = 'Há alguma estrutura, mas ela ainda não sustenta crescimento. Há espaço para fortalecer o que já existe.'; cor = 'var(--amber)'; }
  else{ leitura = 'Existe uma base sólida. O foco agora é fortalecer a consistência e preparar para crescimento sustentável.'; cor = 'var(--green)'; }

  var body = document.getElementById('raiox-body');
  if(body) body.innerHTML =
    '<div style="text-align:center;padding:20px 0 10px">' +
      '<div style="font-size:48px;font-weight:900;color:' + cor + '">' + total + '<span style="font-size:20px;color:var(--muted)">/10</span></div>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:.08em">Pontuação total</div>' +
    '</div>' +
    '<div style="padding:16px;background:' + (total<=4?'var(--red-lt)':total<=7?'var(--amber-lt)':'var(--green-lt)') + ';border-radius:10px;border-left:3px solid ' + cor + ';margin-bottom:16px">' +
      '<div style="font-size:13px;color:var(--text);line-height:1.6">' + san(leitura) + '</div>' +
    '</div>' +
    '<div style="font-size:12px;color:var(--muted);line-height:1.6"><strong>Próximo passo:</strong> identifique a pergunta onde você marcou 0 e aja nela antes de avançar para outra etapa do Rota Executiva.</div>';
}

// ══════════════════════════════════════════════════════
// FERRAMENTA C - MAPA DE ADERÊNCIA AO MERCADO
// ══════════════════════════════════════════════════════

function openFerramentaMapa(){
  if(!document.getElementById('mapa-modal')){
    var div = document.createElement('div');
    div.innerHTML =
      '<div class="overlay" id="mapa-modal">' +
        '<div class="modal" style="max-width:580px">' +
          '<div class="modal-header modal-header-navy">' +
            '<div>' +
              '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:3px">C · Conectar</div>' +
              '<div class="modal-title">Negociação de Valor Real</div>' +
            '</div>' +
            '<button class="modal-close" onclick="closeModal(\'mapa-modal\')">✕</button>' +
          '</div>' +
          '<div style="height:3px;background:rgba(255,255,255,.15)"><div id="mapa-bar" style="height:100%;background:#fff;transition:width .4s;width:0%"></div></div>' +
          '<div class="modal-body" id="mapa-body"></div>' +
          '<div class="modal-footer">' +
            '<button class="btn btn-ghost btn-sm" id="mapa-back" onclick="mapaBack()" style="display:none">← Anterior</button>' +
            '<div style="flex:1"></div>' +
            '<button class="btn btn-primary" id="mapa-next" onclick="mapaNext()">Próxima →</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    while(div.firstChild) document.body.appendChild(div.firstChild);
  }
  _mapaStep = 0;
  _mapaResps = {};
  renderMapaStep();
  openModal('mapa-modal');
}

var _mapaStep = 0;
var _mapaResps = {};

var MAPA_BLOCOS = [
  {
    bloco: 'DORES',
    cor: '#C0392B',
    bg: '#FDECEA',
    icon: '🔴',
    titulo: 'Quais são as dores do seu stakeholder?',
    desc: 'Dor é o que tira o sono, o que ele evita, o que causa frustração ou prejuízo no dia a dia.',
    perguntas: [
      {label: 'Qual é o maior problema que o seu stakeholder enfrenta hoje?', id: 'dor1', placeholder: 'Ex: perde tempo fazendo tudo manualmente, não sabe para onde o dinheiro vai...'},
      {label: 'O que ele já tentou resolver e não funcionou?', id: 'dor2', placeholder: 'Ex: já contratou outros profissionais, já tentou planilhas, cursos...'},
      {label: 'Qual é o custo real dessa dor para ele? (tempo, dinheiro, energia, relacionamento)', id: 'dor3', placeholder: 'Ex: perde R$ X por mês, trabalha X horas a mais por semana...'},
    ]
  },
  {
    bloco: 'DESEJOS',
    cor: '#1A7A4A',
    bg: '#E6F5EE',
    icon: '🟢',
    titulo: 'O que o seu stakeholder deseja de verdade?',
    desc: 'Desejo é o estado que ele quer alcançar: a vida, o área / organização, a sensação que ele busca.',
    perguntas: [
      {label: 'Como seria o área / organização dele se o problema estivesse resolvido?', id: 'des1', placeholder: 'Ex: teria mais tempo para a família, budgetria X, teria uma equipe funcionando sem ele...'},
      {label: 'Que conquista ou reconhecimento ele busca com isso?', id: 'des2', placeholder: 'Ex: ser visto como referência, ter liberdade financeira, crescer sem depender de tudo...'},
      {label: 'Qual é a transformação que ele compra, não o serviço?', id: 'des3', placeholder: 'Ex: não compra consultoria, compra clareza. Não compra gestão, compra paz de operar o área / organização.'},
    ]
  },
  {
    bloco: 'NECESSIDADES',
    cor: '#1B4F8A',
    bg: '#EFF6FF',
    icon: '🔵',
    titulo: 'O que ele realmente precisa (mesmo sem saber)?',
    desc: 'Necessidade é o que vai resolver o problema de raiz, nem sempre é o que ele pede.',
    perguntas: [
      {label: 'O que está faltando no área / organização dele que cria essa dor?', id: 'nec1', placeholder: 'Ex: falta processo, falta clareza de papel, falta indicador, falta posicionamento...'},
      {label: 'Que mudança de comportamento ou estrutura ele precisa fazer?', id: 'nec2', placeholder: 'Ex: parar de centralizar tudo, ter uma agenda-executiva de gestão, entender os números...'},
      {label: 'O que ele provavelmente resiste em aceitar que precisa?', id: 'nec3', placeholder: 'Ex: que o problema está nele e não na equipe, que precisa de processo antes de crescer...'},
    ]
  },
  {
    bloco: 'SOLUÇÃO',
    cor: '#B07D1A',
    bg: '#FBF3E0',
    icon: '⭐',
    titulo: 'Qual é a sua solução: como ela conecta com tudo isso?',
    desc: 'Aqui você constrói a negociação de valor real: o que você faz, para quem, e qual transformação execução.',
    perguntas: [
      {label: 'Como o que você oferece resolve a dor principal?', id: 'sol1', placeholder: 'Ex: com o GPS do Gestor o stakeholder estrutura a agenda-executiva em X semanas e para de operar no escuro...'},
      {label: 'Qual é a transformação concreta que você execução?', id: 'sol2', placeholder: 'Ex: de gestão por intuição para gestão por critério, com indicadores reais e decisões mais rápidas.'},
      {label: 'Em uma frase: o que você faz, para quem, e que resultado gera?', id: 'sol3', placeholder: 'Ex: ajudo donos de pequenos área / organizaçãos a estruturar a gestão para crescer sem depender de tudo.'},
    ]
  },
];

function renderMapaStep(){
  var total = MAPA_BLOCOS.length;
  var bloco = MAPA_BLOCOS[_mapaStep];
  var pct = Math.round(_mapaStep / total * 100);

  var bar = document.getElementById('mapa-bar');
  if(bar) bar.style.width = pct + '%';
  var back = document.getElementById('mapa-back');
  if(back) back.style.display = _mapaStep > 0 ? '' : 'none';
  var next = document.getElementById('mapa-next');
  if(next) next.textContent = _mapaStep === total - 1 ? 'Ver negociação de valor →' : 'Próximo bloco →';

  var body = document.getElementById('mapa-body');
  if(!body) return;

  // Carregar respostas salvas deste bloco
  var saved = _mapaResps[_mapaStep] || {};

  var html =
    '<div style="display:flex;align-items:center;gap:10px;padding:14px;background:' + bloco.bg + ';border-radius:10px;margin-bottom:20px;border-left:4px solid ' + bloco.cor + '">' +
      '<div style="font-size:28px">' + bloco.icon + '</div>' +
      '<div>' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:' + bloco.cor + '">' + bloco.bloco + '</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--text);margin-top:2px">' + san(bloco.titulo) + '</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-top:3px;line-height:1.5">' + san(bloco.desc) + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:14px">';

  bloco.perguntas.forEach(function(p) {
    html +=
      '<div class="form-group">' +
        '<label class="form-label">' + san(p.label) + '</label>' +
        '<textarea class="input" id="mapa-' + p.id + '" placeholder="' + san(p.placeholder) + '" style="min-height:64px;resize:none;line-height:1.6">' + san(saved[p.id] || '') + '</textarea>' +
      '</div>';
  });

  html += '</div>';

  // Progresso visual dos blocos
  html += '<div style="display:flex;gap:6px;margin-top:20px;justify-content:center">';
  MAPA_BLOCOS.forEach(function(b, i) {
    html += '<div style="width:' + (i === _mapaStep ? '24px' : '8px') + ';height:8px;border-radius:4px;background:' + (i <= _mapaStep ? b.cor : 'var(--border)') + ';transition:all .3s"></div>';
  });
  html += '</div>';

  body.innerHTML = html;
  // Foco no primeiro campo
  setTimeout(function(){
    var first = document.getElementById('mapa-' + bloco.perguntas[0].id);
    if(first) first.focus();
  }, 200);
}

function salvarMapaResps(){
  var bloco = MAPA_BLOCOS[_mapaStep];
  var resps = {};
  bloco.perguntas.forEach(function(p){
    var el = document.getElementById('mapa-' + p.id);
    if(el) resps[p.id] = el.value;
  });
  _mapaResps[_mapaStep] = resps;
}

function mapaBack(){
  salvarMapaResps();
  if(_mapaStep > 0){ _mapaStep--; renderMapaStep(); }
}

function mapaNext(){
  salvarMapaResps();
  if(_mapaStep < MAPA_BLOCOS.length - 1){
    _mapaStep++;
    renderMapaStep();
  } else {
    gerarNegociaçãoValor();
  }
}

function gerarNegociaçãoValor(){
  var body = document.getElementById('mapa-body');
  if(!body) return;

  // Pegar a frase da negociação de valor (último campo do bloco Solução)
  var negociação = (_mapaResps[3] && _mapaResps[3].sol3) || '';
  var dor = (_mapaResps[0] && _mapaResps[0].dor1) || '';
  var transformacao = (_mapaResps[3] && _mapaResps[3].sol2) || '';

  // Salvar no localStorage
  try{
    localStorage.setItem('gps_v2_negociação_valor_'+(CU&&CU.id||''), JSON.stringify({
      respostas: _mapaResps,
      negociação: negociação,
      savedAt: new Date().toISOString()
    }));
  }catch(e){}

  var next = document.getElementById('mapa-next');
  if(next) next.style.display = 'none';

  var bar = document.getElementById('mapa-bar');
  if(bar) bar.style.width = '100%';

  var html =
    '<div style="text-align:center;margin-bottom:20px">' +
      '<div style="font-size:32px;margin-bottom:8px">🎯</div>' +
      '<div style="font-size:16px;font-weight:800;color:var(--text)">Sua negociação de valor</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:4px">Com base no que você respondeu</div>' +
    '</div>';

  // Resumo dos 4 blocos
  MAPA_BLOCOS.forEach(function(bloco, i){
    var resps = _mapaResps[i] || {};
    var primResp = resps[bloco.perguntas[0].id];
    if(!primResp) return;
    html +=
      '<div style="margin-bottom:12px;padding:12px 14px;border-radius:8px;background:' + bloco.bg + ';border-left:3px solid ' + bloco.cor + '">' +
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:' + bloco.cor + ';margin-bottom:4px">' + bloco.icon + ' ' + bloco.bloco + '</div>' +
        '<div style="font-size:13px;color:var(--text);line-height:1.5">' + san(primResp) + '</div>' +
      '</div>';
  });

  // Negociação de valor final
  if(negociação){
    html +=
      '<div style="margin-top:16px;padding:16px;border-radius:10px;background:var(--navy);color:#fff">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.6;margin-bottom:8px">Sua negociação de valor</div>' +
        '<div style="font-size:15px;font-weight:700;line-height:1.6;opacity:.95">"' + san(negociação) + '"</div>' +
      '</div>';
  }

  body.innerHTML = html;

  // No último passo: trocar botão Próximo por Concluir no footer
  var nextBtn = document.getElementById('mapa-next');
  if(nextBtn){
    if(isLast){
      nextBtn.textContent = 'Concluir';
      nextBtn.onclick = function(){ salvarMapa(); };
      nextBtn.style.display = '';
    } else {
      nextBtn.textContent = _mapaStep === total - 1 ? 'Ver negociação de valor →' : 'Próximo bloco →';
      nextBtn.onclick = function(){ mapaNext(); };
    }
  }
}
function salvarMapa(){
  var data = {
    a: [0,1,2,3].map(function(i){ return (document.getElementById('mapa-a'+i)||{}).value||''; }),
    b: [0,1,2,3].map(function(i){ return (document.getElementById('mapa-b'+i)||{}).value||''; }),
    acao: (document.getElementById('mapa-acao')||{}).value||'',
    savedAt: new Date().toISOString(),
  };
  try{ localStorage.setItem('gps_v2_mapa_'+(CU&&CU.id||''), JSON.stringify(data)); }catch(e){}
  closeModal('mapa-modal');
  toast('Mapa salvo','success');
}

// ══════════════════════════════════════════════════════
// FERRAMENTA I - CHECKLIST OPERACIONAL
// ══════════════════════════════════════════════════════

var CHECKLIST_AREAS = ['Entrada de novo stakeholder','Fechamento de venda','Execução de serviço','Cobrança','Relacionamento','Organização financeira semanal','Outro'];

function openFerramentaChecklist(){
  if(!document.getElementById('checklist-modal')){
    var div = document.createElement('div');
    div.innerHTML =
      '<div class="overlay" id="checklist-modal">' +
        '<div class="modal" style="max-width:500px">' +
          '<div class="modal-header modal-header-navy">' +
            '<div><div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:3px">I · Integrar</div>' +
            '<div class="modal-title">Checklist Operacional</div></div>' +
            '<button class="modal-close" onclick="closeModal(\'checklist-modal\')">✕</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div class="form-group">' +
              '<label class="form-label">Etapa a organizar</label>' +
              '<select class="input" id="ck-area">' +
              CHECKLIST_AREAS.map(function(a){ return '<option>' + a + '</option>'; }).join('') +
              '</select>' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">Passos do checklist</label>' +
              '<div id="ck-itens" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>' +
              '<button class="btn btn-ghost btn-sm" onclick="addCkItem()">+ Adicionar passo</button>' +
            '</div>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button class="btn btn-ghost" onclick="closeModal(\'checklist-modal\')">Fechar</button>' +
            '<button class="btn btn-primary" onclick="salvarChecklist()">Salvar checklist</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    while(div.firstChild) document.body.appendChild(div.firstChild);
  }
  // Carregar dados salvos
  var saved = [];
  try{ saved = JSON.parse(localStorage.getItem('gps_v2_checklist_'+(CU&&CU.id||''))||'[]'); }catch(e){}
  var container = document.getElementById('ck-itens');
  if(container) container.innerHTML = '';
  if(saved.length === 0){ addCkItem(); addCkItem(); addCkItem(); }
  else { saved.forEach(function(t){ addCkItem(t); }); }
  openModal('checklist-modal');
}

var _ckCount = 0;
function addCkItem(valor){
  var container = document.getElementById('ck-itens');
  if(!container) return;
  var id = 'ck-item-' + (++_ckCount);
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;align-items:center';
  row.innerHTML =
    '<span style="color:var(--muted);font-size:11px;width:16px;text-align:right;flex-shrink:0">' + _ckCount + '</span>' +
    '<input class="input" id="' + id + '" style="flex:1" placeholder="Passo ' + _ckCount + '..." value="' + san(valor||'') + '">' +
    '<button onclick="this.parentNode.remove()" style="flex-shrink:0;background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:4px">✕</button>';
  container.appendChild(row);
}

function salvarChecklist(){
  var area = (document.getElementById('ck-area')||{}).value||'';
  var inputs = document.querySelectorAll('#ck-itens input');
  var itens = Array.from(inputs).map(function(el){ return el.value.trim(); }).filter(Boolean);
  if(itens.length === 0){ toast('Adicione pelo menos um passo','error'); return; }
  var data = { area: area, itens: itens, savedAt: new Date().toISOString() };
  try{ localStorage.setItem('gps_v2_checklist_'+(CU&&CU.id||''), JSON.stringify(itens)); }catch(e){}
  closeModal('checklist-modal');
  toast('Checklist de "' + area + '" salvo','success');
}

// ══════════════════════════════════════════════════════
// FERRAMENTA F - RAIO-X FINANCEIRO
// ══════════════════════════════════════════════════════

var FINANCEIRO_PERGUNTAS = [
  'Quanto entrou no último mês? (R$)',
  'Quanto saiu no total? (R$)',
  'Para onde foi esse dinheiro? (principais categorias)',
  'Quanto sobrou de verdade? (R$)',
  'Quanto você tem hoje em caixa? (R$)',
];

function openFerramentaFinanceiro(){
  if(!document.getElementById('financeiro-modal')){
    var div = document.createElement('div');
    div.innerHTML =
      '<div class="overlay" id="financeiro-modal">' +
        '<div class="modal" style="max-width:500px">' +
          '<div class="modal-header modal-header-navy">' +
            '<div><div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:3px">F · Fortalecer</div>' +
            '<div class="modal-title">Raio-X Financeiro</div></div>' +
            '<button class="modal-close" onclick="closeModal(\'financeiro-modal\')">✕</button>' +
          '</div>' +
          '<div class="modal-body" id="fin-body">' +
            '<div style="font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.5">Responda com os números reais do último mês. Sem estimativa, só o que você sabe.</div>' +
            FINANCEIRO_PERGUNTAS.map(function(p,i){
              return '<div class="form-group"><label class="form-label">' + (i+1) + '. ' + san(p) + '</label><input class="input" id="fin-' + i + '" placeholder="Sua resposta..."></div>';
            }).join('') +
            '<div style="margin-top:16px;padding:14px;background:var(--amber-lt);border-radius:10px;border-left:3px solid var(--amber)">' +
              '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--amber);margin-bottom:8px">Depois de responder, reflita:</div>' +
              '<div style="font-size:12px;color:var(--text);line-height:1.8">' +
                '• Esse resultado sustenta o área / organização?<br>' +
                '• Consigo manter esse nível pelos próximos meses?<br>' +
                '• Onde está o maior desperdício?<br>' +
                '• Onde está a maior oportunidade de melhoria?' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button class="btn btn-ghost" onclick="closeModal(\'financeiro-modal\')">Fechar</button>' +
            '<button class="btn btn-primary" onclick="salvarFinanceiro()">Salvar</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    while(div.firstChild) document.body.appendChild(div.firstChild);
  }
  // Carregar dados salvos
  try{
    var saved = JSON.parse(localStorage.getItem('gps_v2_financeiro_'+(CU&&CU.id||''))||'[]');
    saved.forEach(function(v,i){ var el=document.getElementById('fin-'+i);if(el)el.value=v; });
  }catch(e){}
  openModal('financeiro-modal');
}

function salvarFinanceiro(){
  var resps = FINANCEIRO_PERGUNTAS.map(function(p,i){ return (document.getElementById('fin-'+i)||{}).value||''; });
  try{ localStorage.setItem('gps_v2_financeiro_'+(CU&&CU.id||''), JSON.stringify(resps)); }catch(e){}
  closeModal('financeiro-modal');
  toast('Raio-X Financeiro salvo','success');
}

// ══════════════════════════════════════════════════════
// FERRAMENTA R - DIAGNÓSTICO A.R.E.S.
// ══════════════════════════════════════════════════════

var ARES_PILARES = [
  {key:'A', nome:'Autonomia',       cor:'#7C3AED', desc:'As pessoas sabem o que fazer e têm espaço para agir sem depender de mim para tudo?'},
  {key:'R', nome:'Reconhecimento',  cor:'#1A7A4A', desc:'O esforço e a evolução estão sendo reconhecidos de forma clara e justa?'},
  {key:'E', nome:'Equilíbrio',      cor:'#B07D1A', desc:'A carga de trabalho e o ritmo estão minimamente sustentáveis?'},
  {key:'S', nome:'Sentido',         cor:'#1B4F8A', desc:'As pessoas entendem por que o trabalho delas importa?'},
];

var _aresResps = {};

function openFerramentaAres(){
  _aresResps = {};
  if(!document.getElementById('ares-modal')){
    var div = document.createElement('div');
    div.innerHTML =
      '<div class="overlay" id="ares-modal">' +
        '<div class="modal" style="max-width:520px">' +
          '<div class="modal-header modal-header-navy">' +
            '<div><div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:3px">R · Reunir</div>' +
            '<div class="modal-title">Diagnóstico A.R.E.S.</div></div>' +
            '<button class="modal-close" onclick="closeModal(\'ares-modal\')">✕</button>' +
          '</div>' +
          '<div class="modal-body" id="ares-body"></div>' +
          '<div class="modal-footer">' +
            '<button class="btn btn-ghost" onclick="closeModal(\'ares-modal\')">Fechar</button>' +
            '<button class="btn btn-primary" onclick="calcAres()">Ver resultado</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    while(div.firstChild) document.body.appendChild(div.firstChild);
  }
  renderAresBody();
  openModal('ares-modal');
}

function renderAresBody(){
  var body = document.getElementById('ares-body');
  if(!body) return;
  var html = '<div style="font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.5">Leitura sincera da sua realidade atual. Dê uma nota de <strong>1 a 5</strong> para cada pilar.</div>';
  ARES_PILARES.forEach(function(p){
    html +=
      '<div style="margin-bottom:16px;padding:14px;background:var(--bg);border-radius:10px;border-left:3px solid ' + p.cor + '">' +
        '<div style="font-size:13px;font-weight:800;color:' + p.cor + ';margin-bottom:4px">' + p.key + ' : ' + san(p.nome) + '</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">' + san(p.desc) + '</div>' +
        '<div style="display:flex;gap:6px">' +
        [1,2,3,4,5].map(function(v){
          var sel = _aresResps[p.key] === v;
          return '<button onclick="selecionarAres(\'' + p.key + '\',' + v + ')" style="flex:1;padding:8px 4px;border-radius:8px;border:1.5px solid ' + (sel ? p.cor : 'var(--border)') + ';background:' + (sel ? p.cor : 'var(--white)') + ';cursor:pointer;font-family:var(--font)">' +
            '<div style="font-size:15px;font-weight:800;color:' + (sel ? '#fff' : 'var(--muted)') + '">' + v + '</div>' +
          '</button>';
        }).join('') +
        '</div>' +
      '</div>';
  });
  body.innerHTML = html;
}

function selecionarAres(key, val){
  _aresResps[key] = val;
  renderAresBody();
}

function calcAres(){
  var keys = ARES_PILARES.map(function(p){ return p.key; });
  var missing = keys.filter(function(k){ return _aresResps[k] === undefined; });
  if(missing.length > 0){ toast('Avalie todos os pilares','error'); return; }

  var scores = ARES_PILARES.map(function(p){ return {pilar: p, nota: _aresResps[p.key]}; });
  scores.sort(function(a,b){ return a.nota - b.nota; });
  var fragil = scores[0];
  var media = scores.reduce(function(s,x){ return s+x.nota; },0) / scores.length;

  var body = document.getElementById('ares-body');
  if(body) body.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">' +
    scores.map(function(s){
      var largura = (s.nota/5*100) + '%';
      return '<div style="padding:12px;background:var(--bg);border-radius:8px;border-left:3px solid ' + s.pilar.cor + '">' +
        '<div style="font-size:11px;font-weight:700;color:' + s.pilar.cor + ';margin-bottom:6px">' + s.pilar.key + ' : ' + san(s.pilar.nome) + '</div>' +
        '<div style="height:6px;background:var(--border);border-radius:3px;margin-bottom:4px"><div style="height:100%;width:' + largura + ';background:' + s.pilar.cor + ';border-radius:3px;transition:width .4s"></div></div>' +
        '<div style="font-size:18px;font-weight:900;color:' + s.pilar.cor + '">' + s.nota + '<span style="font-size:11px;color:var(--muted)">/5</span></div>' +
      '</div>';
    }).join('') +
    '</div>' +
    '<div style="padding:14px;background:var(--amber-lt);border-radius:10px;border-left:3px solid var(--amber);margin-bottom:12px">' +
      '<div style="font-size:11px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Pilar mais frágil</div>' +
      '<div style="font-size:14px;font-weight:800;color:var(--text)">' + fragil.pilar.key + ' : ' + san(fragil.pilar.nome) + ' (' + fragil.nota + '/5)</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:4px;line-height:1.5">' + san(fragil.pilar.desc) + '</div>' +
    '</div>' +
    '<div style="font-size:12px;color:var(--muted);line-height:1.6"><strong>Pergunta para esta semana:</strong> o que posso ajustar em <em>' + san(fragil.pilar.nome) + '</em> que o time sentiria imediatamente?</div>';
}

// ══════════════════════════════════════════════════════
// DRAG & DROP DE COLUNAS - Painel de Iniciativas e Iniciativas CEO
// ══════════════════════════════════════════════════════

var _colDragBoard=null, _colDragId=null;

function colDragStart(event, board, id){
  _colDragBoard=board;
  _colDragId=id;
  _dragId=null;
  _projDragId=null;
  event.stopPropagation();
  // Marcar visualmente a coluna sendo arrastada
  var el=event.currentTarget;
  setTimeout(function(){if(el)el.style.opacity='0.4';},0);
}

function colDragOver(event){
  // Só aceitar se for drag de coluna (não de card)
  if(!_colDragId) return;
  event.preventDefault();
  event.stopPropagation();
  var col=event.currentTarget;
  col.style.outline='2px solid var(--blue)';
  col.style.borderRadius='8px';
}

function colDragLeave(event){
  var col=event.currentTarget;
  col.style.outline='';
  col.style.borderRadius='';
}

function colDrop(event, board, targetId){
  event.preventDefault();
  event.stopPropagation();
  var col=event.currentTarget;
  col.style.outline='';
  col.style.borderRadius='';

  if(!_colDragId || _colDragId===targetId || _colDragBoard!==board){
    _colDragId=null; _colDragBoard=null;
    return;
  }

  if(board==='pipe'){
    var stages=getStages();
    var fromIdx=stages.findIndex(function(s){return s.id===_colDragId;});
    var toIdx=stages.findIndex(function(s){return s.id===targetId;});
    if(fromIdx>=0&&toIdx>=0){
      var moved=stages.splice(fromIdx,1)[0];
      stages.splice(toIdx,0,moved);
      saveStages(stages);
      STAGES=stages;
      renderPipeline();
      toast('Coluna movida','success');
    }
  } else if(board==='proj'){
    var cols=getProjCols();
    var fi=cols.findIndex(function(c){return c.id===_colDragId;});
    var ti=cols.findIndex(function(c){return c.id===targetId;});
    if(fi>=0&&ti>=0){
      var mc=cols.splice(fi,1)[0];
      cols.splice(ti,0,mc);
      saveProjCols(cols);
      renderIniciativas();
      toast('Coluna movida','success');
    }
  }

  _colDragId=null;
  _colDragBoard=null;
}

// Resetar opacity das colunas após drag
document.addEventListener('dragend',function(){
  document.querySelectorAll('.board-col,.proj-kanban-col').forEach(function(el){
    el.style.opacity='';
    el.style.outline='';
    el.style.borderRadius='';
  });
  _colDragId=null;
  _colDragBoard=null;
});

// ══════════════════════════════════════════════════════
// F · FORTALECER - VISAO FINANCEIRA (Dashboard)
// Projecao 60 dias, Margem estimada, Meta mensal
// Margem por stakeholder com barras
// ══════════════════════════════════════════════════════

var CUSTO_CFG_KEY = 'gps_v2_custo_cfg_';

function getCustoConfig(coId){
  try{ return JSON.parse(localStorage.getItem(CUSTO_CFG_KEY+(coId||''))||'{}'); }
  catch(e){ return {}; }
}
function saveCustoConfig(coId, cfg){
  try{ localStorage.setItem(CUSTO_CFG_KEY+(coId||''), JSON.stringify(cfg)); }
  catch(e){}
}

function calcMargemStakeholder(c, cfg){
  if(!c.value || c.value <= 0) return null;
  var custoEstimado = c.custoEstimado || 0;
  // Se tem custo estimado no stakeholder, usa ele
  // Senao, estima pelo custo/hora ou taxa de custo configurada
  var custo = custoEstimado;
  if(!custo && cfg.taxaCusto){
    custo = c.value * (cfg.taxaCusto / 100);
  }
  if(!custo && cfg.custoHora && cfg.horasEstimadas){
    custo = cfg.custoHora * cfg.horasEstimadas;
  }
  if(!custo && cfg.custoFixo){
    custo = cfg.custoFixo;
  }
  if(!custo) return null;
  var margem = c.value - custo;
  var pct = Math.round((margem / c.value) * 100);
  return { margem: margem, pct: pct, custo: custo };
}

function calcProjecao60(myC, cfg){
  // Taxa de conversao: stakeholders concluidos / total
  var concluidos = myC.filter(function(c){ return c.stage === 'relacionamento' || c.stage === 'execução'; }).length;
  var taxaConv = myC.length > 0 ? Math.round((concluidos / myC.length) * 100) : 30;
  var temHistorico = concluidos >= 3;
  if(!temHistorico) taxaConv = 30; // estimativa padrao

  var pipelineAtivo = myC.filter(function(c){
    return c.stage !== 'relacionamento' && c.value > 0;
  }).reduce(function(s,c){ return s + (c.value||0); }, 0);

  var proj60 = Math.round(pipelineAtivo * (taxaConv / 100));
  var ticketMedio = myC.filter(function(c){ return c.value > 0; }).length > 0
    ? Math.round(myC.reduce(function(s,c){ return s+(c.value||0); },0) / myC.filter(function(c){ return c.value>0; }).length)
    : 0;

  var metaMensal = cfg.metaMensal || 0;
  var gapMeta = metaMensal > 0 ? Math.max(0, metaMensal - proj60) : 0;
  var precisaPipeline = gapMeta > 0 && taxaConv > 0 ? Math.round(gapMeta / (taxaConv/100)) : 0;

  return { proj60:proj60, taxaConv:taxaConv, pipelineAtivo:pipelineAtivo, ticketMedio:ticketMedio,
           metaMensal:metaMensal, gapMeta:gapMeta, precisaPipeline:precisaPipeline, temHistorico:temHistorico };
}

function renderVisaoFinanceira(){
  var container = document.getElementById('dash-financeiro');
  if(!container) return;

  var myC = myClients();
  var coId = CU && CU.companyId || 'individual';
  var cfg = getCustoConfig(coId);
  var temConfig = !!(cfg.taxaCusto || cfg.custoHora || cfg.custoFixo);
  var proj = calcProjecao60(myC, cfg);

  // Concentração por organização
  var porOrganização={};
  myC.forEach(function(c){
    var key=c.company||c.name;
    if(!porOrganização[key])porOrganização[key]={nome:key,valor:0,count:0};
    porOrganização[key].valor+=(c.value||0);
    porOrganização[key].count++;
  });
  var totalGeral=myC.reduce(function(s,c){return s+(c.value||0);},0);
  var organizaçãosOrdenadas=Object.values(porOrganização).sort(function(a,b){return b.valor-a.valor;});
  var topOrganização=organizaçãosOrdenadas[0];
  var topPct=totalGeral>0&&topOrganização?Math.round((topOrganização.valor/totalGeral)*100):0;
  var riscoConc=topPct>=70?'critico':topPct>=40?'atencao':'ok';

  // Stakeholders com margem calculada
  var comMargem = myC.filter(function(c){ return calcMargemStakeholder(c, cfg) !== null; });
  var margemTotal = comMargem.reduce(function(s,c){
    var m = calcMargemStakeholder(c, cfg);
    return s + (m ? m.margem : 0);
  }, 0);
  var receitaTotal = comMargem.reduce(function(s,c){ return s + (c.value||0); }, 0);
  var margemPct = receitaTotal > 0 ? Math.round((margemTotal / receitaTotal) * 100) : 0;

  var html =
    // Header
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">' +
      '<div>' +
        '<div style="font-size:10px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.08em">F - Fortalecer</div>' +
        '<div style="font-size:14px;font-weight:800;color:var(--text)">Visao Financeira</div>' +
        '<div style="font-size:11px;color:var(--muted)">Margem real - Projecao - Precificacao</div>' +
      '</div>' +
      '<button class="btn btn-ghost btn-sm" onclick="openCustoModal()" style="display:flex;align-items:center;gap:6px">' +
        '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 4v3l2 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' +
        'GPS da Gestao custos' +
      '</button>' +
    '</div>' +

    // 3 KPIs
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">' +

    // Projecao 60 dias
    '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px">' +
      '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Projecao 60 dias</div>' +
      '<div style="font-size:22px;font-weight:900;color:var(--blue)">' + moneyShort(proj.proj60) + '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:3px">' +
        (proj.pipelineAtivo > 0
          ? 'Com ' + proj.taxaConv + '% de conv. em ' + moneyShort(proj.pipelineAtivo) + ' ativos'
          : 'Mova stakeholders para Negociação') +
      '</div>' +
      (!proj.temHistorico ? '<div style="font-size:10px;color:var(--amber);margin-top:6px;font-weight:600">Taxa padrao de 30% usada. Conclua 3+ negocios para sua taxa real.</div>' : '') +
    '</div>' +

    // Margem estimada
    '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer" onclick="openCustoModal()">' +
      '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Margem estimada</div>' +
      (temConfig && comMargem.length > 0
        ? '<div style="font-size:22px;font-weight:900;color:' + (margemPct>=40?'var(--green)':margemPct>=20?'var(--amber)':'var(--red)') + '">' + margemPct + '%</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + money(margemTotal) + ' em ' + comMargem.length + ' iniciativa' + (comMargem.length!==1?'s':'') + '</div>'
        : '<div style="font-size:13px;font-weight:600;color:var(--muted2);margin-top:4px">Configure custos</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:3px">para ver sua margem real</div>') +
    '</div>' +

    // Meta mensal ou ticket medio
    '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px">' +
      '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">' +
        (proj.metaMensal > 0 ? 'Meta mensal' : 'Ticket medio') +
      '</div>' +
      (proj.metaMensal > 0
        ? '<div style="font-size:22px;font-weight:900;color:' + (proj.gapMeta===0?'var(--green)':'var(--amber)') + '">' + moneyShort(proj.metaMensal) + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:3px">' +
            (proj.gapMeta > 0
              ? 'Faltam ' + moneyShort(proj.gapMeta) + ' - precisa de +' + moneyShort(proj.precisaPipeline) + ' em painel-de-iniciativas'
              : 'Projecao cobre a meta') +
          '</div>'
        : '<div style="font-size:22px;font-weight:900;color:var(--text)">' + moneyShort(proj.ticketMedio) + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:3px">por stakeholder - ' + myC.filter(function(c){ return c.value>0; }).length + ' com valor</div>') +
    '</div>' +

    '</div>'; // fecha grid KPIs

  // Bloco de risco de concentração
  if(totalGeral>0&&organizaçãosOrdenadas.length>0){
    var riscoColor=riscoConc==='critico'?'var(--red)':riscoConc==='atencao'?'var(--amber)':'var(--green)';
    var riscoLabel=riscoConc==='critico'?'Crítico':riscoConc==='atencao'?'Atenção':'Saudável';
    html+=
      '<div style="margin-bottom:14px">'+
        '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Risco de concentração</div>'+
        '<div style="background:var(--bg);border:1.5px solid '+riscoColor+'33;border-radius:12px;padding:12px 14px">'+
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'+
            '<div style="font-size:12px;font-weight:700;color:var(--text)">Receita por stakeholder/organização</div>'+
            '<span style="font-size:11px;font-weight:700;color:'+riscoColor+';background:'+riscoColor+'18;padding:2px 8px;border-radius:20px">'+riscoLabel+'</span>'+
          '</div>'+
          organizaçãosOrdenadas.slice(0,5).map(function(e){
            var pct=totalGeral>0?Math.round((e.valor/totalGeral)*100):0;
            var cor=pct>=70?'var(--red)':pct>=40?'var(--amber)':'var(--green)';
            return '<div style="margin-bottom:8px">'+
              '<div style="display:flex;justify-content:space-between;margin-bottom:3px">'+
                '<span style="font-size:12px;font-weight:600;color:var(--text)">'+san(e.nome)+'</span>'+
                '<div style="display:flex;gap:8px;align-items:center">'+
                  '<span style="font-size:11px;color:var(--muted)">'+moneyShort(e.valor)+'</span>'+
                  '<span style="font-size:12px;font-weight:800;color:'+cor+'">'+pct+'%</span>'+
                '</div>'+
              '</div>'+
              '<div style="height:6px;background:var(--border);border-radius:3px">'+
                '<div style="width:'+pct+'%;height:100%;background:'+cor+';border-radius:3px;transition:width .6s"></div>'+
              '</div>'+
            '</div>';
          }).join('')+
          (riscoConc!=='ok'?
            '<div style="margin-top:10px;padding:8px 10px;background:'+riscoColor+'12;border-radius:8px;font-size:11px;color:'+riscoColor+';font-weight:600;line-height:1.5">'+
              (riscoConc==='critico'?
                '⚠️ '+topPct+'% da receita vem de 1 stakeholder. Se sair, o caixa trava. Prioridade: abrir novos stakeholders.':
                '⚠️ '+topPct+'% da receita concentrada em '+san(topOrganização.nome)+'. Meta: nenhum stakeholder acima de 40%.')+
            '</div>':'')+''+
        '</div>'+
      '</div>';
  }

  // Margem por stakeholder
  if(temConfig && comMargem.length > 0){
    var sorted = myC.filter(function(c){ return c.value > 0; })
      .sort(function(a,b){ return (b.value||0)-(a.value||0); });

    html += '<div style="margin-top:4px">' +
      '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Margem por stakeholder</div>' +
      '<div style="display:flex;flex-direction:column;gap:5px;max-height:280px;overflow-y:auto;padding-right:4px">';

    sorted.forEach(function(c){
      var m = calcMargemStakeholder(c, cfg);
      var pct = m ? m.pct : null;
      var bar = pct !== null ? Math.max(0, Math.min(100, pct)) : 0;
      var cor = pct === null ? 'var(--border)' : pct >= 40 ? 'var(--green)' : pct >= 20 ? 'var(--amber)' : 'var(--red)';
      var pctStr = pct !== null ? pct + '%' : '-';

      html +=
        '<div style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px;background:var(--bg)">' +
          '<div style="font-size:12px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + san(c.name) + '</div>' +
          '<div style="width:80px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;flex-shrink:0">' +
            '<div style="width:' + bar + '%;height:100%;background:' + cor + ';border-radius:2px;transition:width .6s"></div>' +
          '</div>' +
          '<div style="font-size:11px;font-weight:700;color:' + cor + ';min-width:36px;text-align:right">' + pctStr + '</div>' +
          '<div style="font-size:11px;color:var(--muted);min-width:60px;text-align:right">' + moneyShort(c.value) + '</div>' +
        '</div>';
    });

    html += '</div></div>';
  } else if(!temConfig){
    html +=
      '<div style="padding:16px;border:1.5px dashed var(--border);border-radius:10px;text-align:center">' +
        '<div style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">Margem por stakeholder disponivel apos configurar custos</div>' +
        '<button class="btn btn-ghost btn-sm" onclick="openCustoModal()">Configurar agora</button>' +
      '</div>';
  }

  container.innerHTML = html;
}

// Modal configuracao de custos
function openCustoModal(){
  var coId = CU && CU.companyId || 'individual';
  var cfg = getCustoConfig(coId);

  if(!document.getElementById('custo-modal')){
    var div = document.createElement('div');
    div.innerHTML =
      '<div class="overlay" id="custo-modal">' +
        '<div class="modal" style="max-width:480px">' +
          '<div class="modal-header modal-header-navy">' +
            '<div>' +
              '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:3px">F - Fortalecer</div>' +
              '<div class="modal-title">GPS da Gestao - Custos</div>' +
            '</div>' +
            '<button class="modal-close" onclick="closeModal(\'custo-modal\')">&#x2715;</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div style="font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.6">Configure como o GPS vai calcular sua margem. Escolha o metodo que melhor representa seu negocio.</div>' +

            '<div class="form-group">' +
              '<label class="form-label">Taxa de custo (%)</label>' +
              '<input class="input" id="cfg-taxa" type="number" min="0" max="100" placeholder="Ex: 30" value="">' +
              '<div style="font-size:11px;color:var(--muted);margin-top:4px">% do valor do iniciativa que vai para custos. Ex: 30 significa que 70% e margem.</div>' +
            '</div>' +

            '<div style="text-align:center;font-size:11px;color:var(--muted2);margin:12px 0">- ou -</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
              '<div class="form-group">' +
                '<label class="form-label">Custo por hora (R$)</label>' +
                '<input class="input" id="cfg-hora" type="number" min="0" placeholder="Ex: 150" value="">' +
              '</div>' +
              '<div class="form-group">' +
                '<label class="form-label">Horas estimadas por iniciativa</label>' +
                '<input class="input" id="cfg-horas" type="number" min="0" placeholder="Ex: 20" value="">' +
              '</div>' +
            '</div>' +

            '<div class="form-group">' +
              '<label class="form-label">Custo fixo por iniciativa (R$)</label>' +
              '<input class="input" id="cfg-fixo" type="number" min="0" placeholder="Ex: 2000" value="">' +
              '<div style="font-size:11px;color:var(--muted);margin-top:4px">Custo medio fixo independente do valor cobrado.</div>' +
            '</div>' +

            '<div class="form-group">' +
              '<label class="form-label">Meta mensal de budgetmento (R$)</label>' +
              '<input class="input" id="cfg-meta" type="number" min="0" placeholder="Ex: 15000" value="">' +
              '<div style="font-size:11px;color:var(--muted);margin-top:4px">O GPS vai mostrar o gap entre a projecao e sua meta.</div>' +
            '</div>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button class="btn btn-ghost" onclick="closeModal(\'custo-modal\')">Cancelar</button>' +
            '<button class="btn btn-primary" onclick="salvarCustoConfig()">Salvar configuracao</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    while(div.firstChild) document.body.appendChild(div.firstChild);
  }

  // Preencher valores
  var taxa = document.getElementById('cfg-taxa');
  var hora = document.getElementById('cfg-hora');
  var horas = document.getElementById('cfg-horas');
  var fixo = document.getElementById('cfg-fixo');
  var meta = document.getElementById('cfg-meta');
  if(taxa) taxa.value = cfg.taxaCusto || '';
  if(hora) hora.value = cfg.custoHora || '';
  if(horas) horas.value = cfg.horasEstimadas || '';
  if(fixo) fixo.value = cfg.custoFixo || '';
  if(meta) meta.value = cfg.metaMensal || '';

  openModal('custo-modal');
}

function salvarCustoConfig(){
  var coId = CU && CU.companyId || 'individual';
  var cfg = {
    taxaCusto: parseFloat(document.getElementById('cfg-taxa').value) || 0,
    custoHora: parseFloat(document.getElementById('cfg-hora').value) || 0,
    horasEstimadas: parseFloat(document.getElementById('cfg-horas').value) || 0,
    custoFixo: parseFloat(document.getElementById('cfg-fixo').value) || 0,
    metaMensal: parseFloat(document.getElementById('cfg-meta').value) || 0,
    savedAt: new Date().toISOString(),
  };
  saveCustoConfig(coId, cfg);
  closeModal('custo-modal');
  toast('Configuracao salva', 'success');
  renderDashboard();
}

// ══════════════════════════════════════════════════════
// FLUXO DE CADASTRO PUBLICO
// ══════════════════════════════════════════════════════

function mostrarTela(id){
  ['tela-boas-vindas','tela-login','tela-cadastro','tela-espera'].forEach(function(t){
    var el=document.getElementById(t);
    if(el)el.style.display=t===id?'block':'none';
  });
  if(id==='tela-login'){
    setTimeout(function(){var e=document.getElementById('login-email');if(e)e.focus();},150);
  }
  if(id==='tela-cadastro'){
    setTimeout(function(){var e=document.getElementById('cad-nome');if(e)e.focus();},150);
  }
}

async function cadastrarUsuario(){
  var nome=(document.getElementById('cad-nome')||{}).value||'';
  var negocio=(document.getElementById('cad-negocio')||{}).value||'';
  var email=(document.getElementById('cad-email')||{}).value||'';
  var senha=(document.getElementById('cad-senha')||{}).value||'';
  var errEl=document.getElementById('cadastro-error');
  var loadEl=document.getElementById('cadastro-loading');
  var btnEl=document.getElementById('cad-btn');

  errEl.style.display='none';

  if(!nome.trim()){errEl.textContent='Informe seu nome.';errEl.style.display='block';return;}
  if(!email.trim()){errEl.textContent='Informe seu e-mail.';errEl.style.display='block';return;}
  if(!senha||senha.length<6){errEl.textContent='A senha precisa ter ao menos 6 caracteres.';errEl.style.display='block';return;}

  if(loadEl)loadEl.style.display='block';
  if(btnEl)btnEl.style.display='none';

  try{
    var fb=window._fb;
    // Criar usuario no Firebase Auth
    var cred=await fb.auth.createUserWithEmailAndPassword(email.trim(),senha);
    var uid=cred.user.uid;

    // Criar organização propria
    await fb.setDoc(fb.doc(fb.db,'companies',uid),{
      name:negocio.trim()||nome.trim(),
      ownerId:uid,
      createdAt:new Date().toISOString(),
    });

    // Criar documento do usuario com status trial (7 dias gratuitos)
    var trialExpires=new Date(Date.now()+7*24*60*60*1000).toISOString();
    await fb.setDoc(fb.doc(fb.db,'users',uid),{
      name:nome.trim(),
      email:email.trim(),
      negocio:negocio.trim(),
      role:'membro',
      status:'trial',
      companyId:uid,
      companyIds:[uid],
      plan:'trial',
      trialExpires:trialExpires,
      createdAt:new Date().toISOString(),
    });

    // Entrar direto — trial ativo
    // onAuthStateChanged vai chamar onAuthSuccess automaticamente

  }catch(e){
    if(loadEl)loadEl.style.display='none';
    if(btnEl)btnEl.style.display='block';
    var msgs={
      'auth/email-already-in-use':'Este e-mail ja possui uma conta. Tente entrar.',
      'auth/invalid-email':'E-mail invalido.',
      'auth/weak-password':'Senha muito fraca. Use ao menos 6 caracteres.',
      'auth/network-request-failed':'Erro de conexao. Verifique sua internet.',
    };
    errEl.textContent=msgs[e.code]||'Erro: '+e.message;
    errEl.style.display='block';
  }
}

// ══════════════════════════════════════════════════════
// SA - ABA PENDENTES
// ══════════════════════════════════════════════════════

async function renderPendentes(){
  var body=document.getElementById('pendentes-body');
  if(!body)return;
  body.innerHTML='<div style="padding:20px;text-align:center;color:var(--muted)">Carregando...</div>';

  try{
    var fb=window._fb;
    var snap=await fb.getDocs(fb.query(fb.collection(fb.db,'users'),fb.where('status','in',['pendente','expirado'])));
    var pendentes=snap.docs.map(function(d){return Object.assign({},d.data(),{id:d.id});});

    if(pendentes.length===0){
      body.innerHTML='<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">Nenhuma solicitacao pendente</div></div>';
      return;
    }

    body.innerHTML='<div style="display:flex;flex-direction:column;gap:8px">'+
      pendentes.map(function(u){
        return '<div class="card" style="padding:14px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">'+
          '<div style="width:38px;height:38px;border-radius:50%;background:var(--amber-lt);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:var(--amber);flex-shrink:0">'+
            (u.name||'?')[0].toUpperCase()+
          '</div>'+
          '<div style="flex:1;min-width:160px">'+
            '<div style="font-size:13px;font-weight:700;color:var(--text)">'+san(u.name||'')+'</div>'+
            '<div style="font-size:11px;color:var(--muted)">'+san(u.email||'')+'</div>'+
            (u.negocio?'<div style="font-size:11px;color:var(--muted2)">'+san(u.negocio)+'</div>':'')+
            '<div style="font-size:10px;color:var(--muted2);margin-top:2px">'+new Date(u.createdAt).toLocaleDateString('pt-BR')+'</div>'+
          '</div>'+
          '<div style="display:flex;gap:8px">'+
            '<button class="btn btn-primary btn-sm" onclick="ativarUsuario(\''+u.id+'\')">Ativar acesso</button>'+
            '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="rejeitarUsuario(\''+u.id+'\')">Rejeitar</button>'+
          '</div>'+
        '</div>';
      }).join('')+
    '</div>';
  }catch(e){
    body.innerHTML='<div style="padding:20px;color:var(--red)">Erro ao carregar: '+e.message+'</div>';
  }
}

async function ativarUsuario(uid){
  if(!confirm('Ativar acesso para este usuario?'))return;
  try{
    var fb=window._fb;
    await fb.updateDoc(fb.doc(fb.db,'users',uid),{
      status:'ativo',
      ativadoEm:new Date().toISOString(),
      ativadoPor:CU.id,
    });
    toast('Acesso ativado!','success');
    renderPendentes();
    // Atualizar badge
    atualizarBadgePendentes();
  }catch(e){toast('Erro: '+e.message,'error');}
}

async function rejeitarUsuario(uid){
  if(!confirm('Rejeitar esta solicitacao? O usuario nao tera acesso.'))return;
  try{
    var fb=window._fb;
    await fb.updateDoc(fb.doc(fb.db,'users',uid),{
      status:'rejeitado',
      rejeitadoEm:new Date().toISOString(),
    });
    toast('Solicitacao rejeitada','info');
    renderPendentes();
    atualizarBadgePendentes();
  }catch(e){toast('Erro: '+e.message,'error');}
}

async function atualizarBadgePendentes(){
  try{
    var fb=window._fb;
    var snap=await fb.getDocs(fb.query(fb.collection(fb.db,'users'),fb.where('status','in',['pendente','expirado'])));
    var count=snap.docs.length;
    var badge=document.getElementById('badge-pendentes');
    if(badge){
      badge.textContent=count;
      badge.style.display=count>0?'flex':'none';
    }
  }catch(e){}
}
// GPS da Gestao v2.0 - fim


// ══════════════════════════════════════════════════════
// SISTEMA DE FATURAS GPS
// Controle de budgetmento do gestor
// ══════════════════════════════════════════════════════

var _budgetCache = null;
var FATURAS_KEY = 'gps_v2_budget_';

function getBudget(){
  if(_budgetCache !== null) return _budgetCache;
  try{ return JSON.parse(localStorage.getItem(FATURAS_KEY+(CU&&CU.companyId||''))||'[]'); }catch(e){ return []; }
}

function saveBudget(lista){
  _budgetCache = lista;
  try{ localStorage.setItem(FATURAS_KEY+(CU&&CU.companyId||''), JSON.stringify(lista)); }catch(e){}
  if(CU && window._fb){
    var fb = window._fb;
    fb.setDoc(fb.doc(fb.db,'ceo_data',CU.companyId||CU.id),
      {budget: _cleanUndef(lista), _updatedAt: new Date().toISOString()},
      {merge:true}
    ).catch(function(e){ console.warn('saveBudget:', e.message); });
  }
}

function getStatusBudget(f){
  if(f.status === 'paga') return {label:'Paga', color:'var(--green)', bg:'var(--green-lt)'};
  if(f.status === 'cancelada') return {label:'Cancelada', color:'var(--muted)', bg:'var(--bg2)'};
  var hoje = new Date(); hoje.setHours(0,0,0,0);
  var venc = f.vencimento ? new Date(f.vencimento+'T12:00') : null;
  if(venc && venc < hoje) return {label:'Atrasada', color:'var(--red)', bg:'var(--red-lt)'};
  if(f.status === 'enviada') return {label:'Enviada', color:'var(--blue)', bg:'var(--blue-lt)'};
  return {label:'Pendente', color:'var(--amber)', bg:'var(--amber-lt,#FBF3E0)'};
}

function abrirModalBudget(clientId, budgetId){
  var c = clients.find(function(x){ return x.id === clientId; });
  if(!c) return;
  var budget = getBudget();
  var f = budgetId ? budget.find(function(x){ return x.id === budgetId; }) : null;

  var old = document.getElementById('budget-modal');
  if(old) old.parentNode.removeChild(old);

  var overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'budget-modal';

  var modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '480px';

  // Header
  var header = document.createElement('div');
  header.className = 'modal-header';
  header.style.cssText = 'background:linear-gradient(135deg,#1A7A4A 0%,#229A5A 100%);color:#fff;border-bottom:none;border-radius:var(--r3) var(--r3) 0 0';
  header.innerHTML =
    '<div>' +
      '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:3px">GPS DA GESTÃO · FATURA</div>' +
      '<div class="modal-title">' + (f ? 'Editar Budget' : 'Nova Budget') + '</div>' +
      '<div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:2px">' + san(c.name) + (c.company ? ' · ' + san(c.company) : '') + '</div>' +
    '</div>' +
    '<button class="modal-close" onclick="closeModal(\'budget-modal\')">✕</button>';

  // Body
  var body = document.createElement('div');
  body.className = 'modal-body';

  // Calcular próximo número de budget
  var todasBudget = getBudget();
  var proximoNum = todasBudget.length + 1;
  var numBudget = f ? f.numero : ('FAT-' + String(proximoNum).padStart(3,'0'));

  body.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="form-group">' +
        '<label class="form-label">Número da budget</label>' +
        '<input class="input" id="fat-numero" value="' + san(numBudget) + '">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Data de emissão</label>' +
        '<input class="input" type="date" id="fat-emissao" value="' + (f ? f.emissao : new Date().toISOString().split('T')[0]) + '">' +
      '</div>' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Descrição do serviço *</label>' +
      '<textarea class="input" id="fat-descricao" placeholder="Ex: Mentoria de gestão — Junho 2026" style="min-height:60px;resize:none">' + san(f ? f.descricao||'' : c.service||'') + '</textarea>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="form-group">' +
        '<label class="form-label">Valor (R$) *</label>' +
        '<input class="input" type="number" id="fat-valor" placeholder="0,00" value="' + (f ? f.valor||'' : c.value||'') + '" min="0" step="0.01">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Vencimento</label>' +
        '<input class="input" type="date" id="fat-vencimento" value="' + (f ? f.vencimento||'' : '') + '">' +
      '</div>' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Forma de pagamento</label>' +
      '<select class="input" id="fat-pagamento">' +
        '<option value="pix"' + (f&&f.pagamento==='pix'?' selected':'') + '>PIX</option>' +
        '<option value="transferencia"' + (f&&f.pagamento==='transferencia'?' selected':'') + '>Transferência bancária</option>' +
        '<option value="boleto"' + (f&&f.pagamento==='boleto'?' selected':'') + '>Boleto</option>' +
        '<option value="cartao"' + (f&&f.pagamento==='cartao'?' selected':'') + '>Cartão</option>' +
        '<option value="dinheiro"' + (f&&f.pagamento==='dinheiro'?' selected':'') + '>Dinheiro</option>' +
        '<option value="outro"' + (f&&f.pagamento==='outro'?' selected':'') + '>Outro</option>' +
      '</select>' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Observações</label>' +
      '<input class="input" id="fat-obs" placeholder="Chave PIX, dados bancários, instruções..." value="' + san(f ? f.obs||'' : '') + '">' +
    '</div>' +
    '<input type="hidden" id="fat-stakeholder-id" value="' + san(clientId) + '">' +
    '<input type="hidden" id="fat-id" value="' + san(budgetId||'') + '">';

  // Footer
  var footer = document.createElement('div');
  footer.className = 'modal-footer';
  footer.style.justifyContent = 'space-between';

  var leftBtns = document.createElement('div');
  leftBtns.style.display = 'flex';
  leftBtns.style.gap = '8px';

  if(f && f.status !== 'paga'){
    var btnPago = document.createElement('button');
    btnPago.className = 'btn';
    btnPago.style.cssText = 'background:var(--green);color:#fff';
    btnPago.textContent = '✓ Marcar como paga';
    btnPago.onclick = function(){ marcarBudgetPaga(f.id); };
    leftBtns.appendChild(btnPago);
  }
  if(f && f.status === 'paga'){
    var btnReverter = document.createElement('button');
    btnReverter.className = 'btn btn-ghost btn-sm';
    btnReverter.textContent = '↩ Desfazer pagamento';
    btnReverter.onclick = function(){ reverterBudgetPaga(f.id); };
    leftBtns.appendChild(btnReverter);
  }

  if(f){
    var btnLink = document.createElement('button');
    btnLink.className = 'btn btn-ghost btn-sm';
    btnLink.textContent = '🔗 Ver budget';
    btnLink.onclick = function(){ verBudget(f.id); };
    leftBtns.appendChild(btnLink);
  }

  var rightBtns = document.createElement('div');
  rightBtns.style.display = 'flex';
  rightBtns.style.gap = '8px';

  var btnCancelar = document.createElement('button');
  btnCancelar.className = 'btn btn-ghost';
  btnCancelar.textContent = 'Cancelar';
  btnCancelar.onclick = function(){ closeModal('budget-modal'); };

  var btnSalvar = document.createElement('button');
  btnSalvar.className = 'btn';
  btnSalvar.style.cssText = 'background:var(--green);color:#fff';
  btnSalvar.textContent = f ? 'Salvar' : 'Gerar Budget';
  btnSalvar.onclick = salvarBudget;

  rightBtns.appendChild(btnCancelar);
  rightBtns.appendChild(btnSalvar);
  footer.appendChild(leftBtns);
  footer.appendChild(rightBtns);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  setTimeout(function(){ overlay.classList.add('open'); document.getElementById('fat-descricao').focus(); }, 10);
}

function salvarBudget(){
  var descricao = (document.getElementById('fat-descricao')||{}).value||'';
  var valor = parseFloat((document.getElementById('fat-valor')||{}).value||'0');
  if(!descricao.trim()){ toast('Informe a descrição do serviço','error'); return; }
  if(!valor || valor <= 0){ toast('Informe o valor da budget','error'); return; }

  var budgetId = (document.getElementById('fat-id')||{}).value||'';
  var stakeholderId = (document.getElementById('fat-stakeholder-id')||{}).value||'';
  var numero = (document.getElementById('fat-numero')||{}).value||'';
  var emissao = (document.getElementById('fat-emissao')||{}).value||'';
  var vencimento = (document.getElementById('fat-vencimento')||{}).value||'';
  var pagamento = (document.getElementById('fat-pagamento')||{}).value||'pix';
  var obs = (document.getElementById('fat-obs')||{}).value||'';

  var budget = getBudget();
  var c = clients.find(function(x){ return x.id === stakeholderId; });

  if(budgetId){
    var idx = budget.findIndex(function(f){ return f.id === budgetId; });
    if(idx >= 0){
      budget[idx] = Object.assign(budget[idx], {
        descricao: descricao.trim(),
        valor: valor,
        numero: numero,
        emissao: emissao,
        vencimento: vencimento,
        pagamento: pagamento,
        obs: obs,
        updatedAt: new Date().toISOString(),
      });
    }
  } else {
    budget.push({
      id: 'fat_' + Date.now(),
      numero: numero,
      stakeholderId: stakeholderId,
      stakeholderNome: c ? c.name : '',
      stakeholderOrganização: c ? c.company||'' : '',
      descricao: descricao.trim(),
      valor: valor,
      emissao: emissao,
      vencimento: vencimento,
      pagamento: pagamento,
      obs: obs,
      status: 'pendente',
      companyId: CU.companyId||'',
      criadoEm: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  saveBudget(budget);
  closeModal('budget-modal');
  renderPipeline();
  toast('Budget ' + numero + ' gerada com sucesso! 🎉', 'success', 4000);
}

function marcarBudgetPaga(budgetId){
  if(!confirm('Confirmar recebimento desta budget?'))return;
  var budget = getBudget();
  var idx = budget.findIndex(function(f){ return f.id === budgetId; });
  if(idx < 0) return;
  budget[idx].status = 'paga';
  budget[idx].pgtoEm = new Date().toISOString();
  budget[idx].updatedAt = new Date().toISOString();
  saveBudget(budget);
  closeModal('budget-modal');
  if(typeof renderBudget==='function')renderBudget();
  toast('Pagamento registrado! 💰', 'success', 3000);
}

function reverterBudgetPaga(budgetId){
  if(!confirm('Desfazer pagamento e voltar para Pendente?'))return;
  var budget = getBudget();
  var idx = budget.findIndex(function(f){ return f.id === budgetId; });
  if(idx < 0) return;
  budget[idx].status = 'pendente';
  delete budget[idx].pgtoEm;
  budget[idx].updatedAt = new Date().toISOString();
  saveBudget(budget);
  closeModal('budget-modal');
  if(typeof renderBudget==='function')renderBudget();
  toast('Budget revertida para Pendente','info',3000);
}

function verBudget(budgetId){
  var budget = getBudget();
  var f = budget.find(function(x){ return x.id === budgetId; });
  if(!f) return;

  // Abrir página de budget em nova aba
  var html = gerarHTMLBudget(f);
  var blob = new Blob([html], {type:'text/html'});
  var url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

function gerarHTMLBudget(f){
  var st = getStatusBudget(f);
  var valorFmt = 'R$ ' + parseFloat(f.valor||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  var emissaoFmt = f.emissao ? new Date(f.emissao+'T12:00').toLocaleDateString('pt-BR') : '';
  var vencFmt = f.vencimento ? new Date(f.vencimento+'T12:00').toLocaleDateString('pt-BR') : '—';
  var pgtoLabel = {pix:'PIX', transferencia:'Transferência bancária', boleto:'Boleto', cartao:'Cartão', dinheiro:'Dinheiro', outro:'Outro'}[f.pagamento||'pix']||'PIX';

  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Budget '+san(f.numero)+'</title>' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#F4F6F9;color:#1A2332;padding:24px}' +
    '.budget{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(11,31,58,.12)}' +
    '.header{background:linear-gradient(135deg,#0B1F3A 0%,#1E3D6B 100%);padding:32px;color:#fff}' +
    '.logo{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:4px}' +
    '.titulo{font-size:24px;font-weight:900;letter-spacing:-.02em}' +
    '.num{font-size:13px;color:rgba(255,255,255,.6);margin-top:4px}' +
    '.status-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;margin-top:12px}' +
    '.body{padding:32px}' +
    '.section{margin-bottom:24px}' +
    '.section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6B7A8D;margin-bottom:12px}' +
    '.stakeholder-nome{font-size:18px;font-weight:800;color:#1A2332}' +
    '.stakeholder-organização{font-size:13px;color:#6B7A8D;margin-top:2px}' +
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;background:#F4F6F9;border-radius:8px;padding:16px}' +
    '.grid-item label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6B7A8D;display:block;margin-bottom:4px}' +
    '.grid-item span{font-size:13px;font-weight:600;color:#1A2332}' +
    '.servico{background:#F4F6F9;border-radius:8px;padding:16px;font-size:14px;line-height:1.6}' +
    '.valor-box{background:linear-gradient(135deg,#1A7A4A 0%,#229A5A 100%);border-radius:8px;padding:20px 24px;display:flex;align-items:center;justify-content:space-between}' +
    '.valor-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.7)}' +
    '.valor-num{font-size:28px;font-weight:900;color:#fff}' +
    '.obs{font-size:12px;color:#6B7A8D;background:#F4F6F9;border-radius:8px;padding:12px 16px;line-height:1.6}' +
    '.footer{padding:20px 32px;border-top:1px solid #E2E8F0;text-align:center;font-size:11px;color:#9BA8B5}' +
    '@media print{body{padding:0;background:#fff}.budget{box-shadow:none;border-radius:0}}' +
    '</style></head><body>' +
    '<div class="budget">' +
      '<div class="header">' +
        '<div class="logo">GPS do Gestor · Rota Executiva</div>' +
        '<div class="titulo">Budget</div>' +
        '<div class="num">' + san(f.numero) + ' · Emitida em ' + emissaoFmt + '</div>' +
        '<div class="status-badge" style="background:' + st.bg + ';color:' + st.color + '">' + st.label + '</div>' +
      '</div>' +
      '<div class="body">' +
        '<div class="section">' +
          '<div class="section-title">Para</div>' +
          '<div class="stakeholder-nome">' + san(f.stakeholderNome) + '</div>' +
          (f.stakeholderOrganização ? '<div class="stakeholder-organização">' + san(f.stakeholderOrganização) + '</div>' : '') +
        '</div>' +
        '<div class="section">' +
          '<div class="section-title">Detalhes</div>' +
          '<div class="grid">' +
            '<div class="grid-item"><label>Vencimento</label><span>' + vencFmt + '</span></div>' +
            '<div class="grid-item"><label>Pagamento</label><span>' + pgtoLabel + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="section">' +
          '<div class="section-title">Serviço</div>' +
          '<div class="servico">' + san(f.descricao) + '</div>' +
        '</div>' +
        '<div class="section">' +
          '<div class="valor-box">' +
            '<div><div class="valor-label">Total</div><div class="valor-num">' + valorFmt + '</div></div>' +
            (f.status==='paga'?'<div style="font-size:28px">✓</div>':'') +
          '</div>' +
        '</div>' +
        (f.obs ? '<div class="section"><div class="section-title">Instruções de pagamento</div><div class="obs">' + san(f.obs) + '</div></div>' : '') +
      '</div>' +
      '<div class="footer">Gerado pelo GPS do Gestor · Rota Executiva · by Grupo Vertriah</div>' +
    '</div>' +
    '<div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="padding:10px 24px;background:#0B1F3A;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimir / Salvar PDF</button></div>' +
    '</body></html>';
}

function renderBudget(){
  var el=document.getElementById('budget-content');if(!el)return;
  var budget=getBudget().filter(function(f){return f.companyId===(CU.companyId||'');});
  budget.sort(function(a,b){return(b.criadoEm||'').localeCompare(a.criadoEm||'');});

  var hoje=new Date();hoje.setHours(0,0,0,0);
  var mesAtual=hoje.getMonth();var anoAtual=hoje.getFullYear();
  var totalPendente=0,totalAtrasado=0,totalRecebido=0;
  budget.forEach(function(f){
    var st=getStatusBudget(f);
    if(st.label==='Paga')totalRecebido+=f.valor||0;
    else if(st.label==='Atrasada')totalAtrasado+=f.valor||0;
    else if(st.label!=='Cancelada')totalPendente+=f.valor||0;
  });
  var fmtR=function(v){return'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});};
  var sub=document.getElementById('budget-subtitle');
  if(sub)sub.textContent=budget.length+' budget'+(budget.length!==1?'s':'');

  var html=
    // Resumo financeiro
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">'+
      '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--r2);padding:16px;border-left:3px solid var(--amber)">'+
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Pendente</div>'+
        '<div style="font-size:20px;font-weight:900;color:var(--amber)">'+fmtR(totalPendente)+'</div>'+
      '</div>'+
      '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--r2);padding:16px;border-left:3px solid var(--red)">'+
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Atrasado</div>'+
        '<div style="font-size:20px;font-weight:900;color:var(--red)">'+fmtR(totalAtrasado)+'</div>'+
      '</div>'+
      '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--r2);padding:16px;border-left:3px solid var(--green)">'+
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Recebido</div>'+
        '<div style="font-size:20px;font-weight:900;color:var(--green)">'+fmtR(totalRecebido)+'</div>'+
      '</div>'+
    '</div>'+
    // Lista de budget
    (budget.length===0?
      '<div style="text-align:center;padding:40px;color:var(--muted)">'+
        '<div style="font-size:36px;margin-bottom:12px">📄</div>'+
        '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px">Nenhuma budget ainda</div>'+
        '<div style="font-size:13px">Abra um stakeholder no Painel de Iniciativas e clique em R$ para gerar a primeira budget</div>'+
      '</div>'
    :
      '<div style="display:flex;flex-direction:column;gap:8px">'+
      budget.map(function(f){
        var st=getStatusBudget(f);
        var vencFmt=f.vencimento?new Date(f.vencimento+'T12:00').toLocaleDateString('pt-BR'):'—';
        var valorFmt=fmtR(f.valor||0);
        return '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--r2);padding:16px;display:flex;align-items:center;gap:16px;cursor:pointer" onclick="abrirModalBudget(\''+f.stakeholderId+'\',\''+f.id+'\')">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
              '<span style="font-size:11px;font-weight:700;color:var(--muted)">'+san(f.numero)+'</span>'+
              '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+st.bg+';color:'+st.color+'">'+st.label+'</span>'+
            '</div>'+
            '<div style="font-size:14px;font-weight:700;color:var(--text)">'+san(f.stakeholderNome)+(f.stakeholderOrganização?' <span style="font-weight:400;color:var(--muted)">· '+san(f.stakeholderOrganização)+'</span>':'')+'</div>'+
            '<div style="font-size:12px;color:var(--muted);margin-top:2px">'+san(f.descricao)+'</div>'+
          '</div>'+
          '<div style="text-align:right;flex-shrink:0">'+
            '<div style="font-size:16px;font-weight:800;color:var(--text)">'+valorFmt+'</div>'+
            '<div style="font-size:11px;color:var(--muted);margin-top:2px">Vence '+vencFmt+'</div>'+
          '</div>'+
          '<div style="display:flex;flex-direction:column;gap:6px">'+
            '<button onclick="event.stopPropagation();verBudget(\''+f.id+'\')" style="font-size:11px;padding:4px 10px;border-radius:var(--r1);background:var(--navy);color:#fff;border:none;cursor:pointer;white-space:nowrap">🔗 Ver</button>'+
            (f.status!=='paga'&&f.status!=='cancelada'?'<button onclick="event.stopPropagation();marcarBudgetPaga(\''+f.id+'\');renderBudget();" style="font-size:11px;padding:4px 10px;border-radius:var(--r1);background:var(--green);color:#fff;border:none;cursor:pointer;white-space:nowrap">✓ Paga</button>':'')+'</div>'+
        '</div>';
      }).join('')+
      '</div>'
    );

  el.innerHTML=html;
}
