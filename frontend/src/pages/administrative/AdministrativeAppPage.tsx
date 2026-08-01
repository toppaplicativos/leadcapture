import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowUpRight, Building2, Check, ChevronRight,
  ClipboardCheck, Download, FileClock, Landmark, LayoutDashboard, Loader2, LogOut, Menu, Plus,
  ReceiptText, RefreshCw, ShieldCheck, UserCog, UsersRound, WalletCards, X,
} from 'lucide-react'
import { AccountingView } from '@/pages/admin/accounting/AccountingView'
import { getHeaders, money, clearAdminAuth } from '@/lib/admin/helpers'
import { useConfirm } from '@/components/ConfirmModal'

type View = 'home'|'finance'|'people'|'approvals'|'structure'|'access'|'audit'
type Bootstrap = { brand?:{id:string;name:string;slug?:string;logo_url?:string}; permissions:string[]; pending_approvals:number; pending_amount:number; active_departments:number }
type Summary = { income:number;expense:number;balance:number;pending:number;transaction_count:number;employees:{total:number;active:number;payroll:number|null} }
type Approval = { id:string;title:string;description?:string;resource_type:string;amount?:number;status:string;requested_by_name?:string;created_at:string;decision_note?:string }
type Department = { id:string;name:string;code?:string;cost_center_code?:string;manager_name?:string;employee_count:number;is_active:boolean }
type Audit = { id:string;actor_name?:string;action:string;resource_type:string;summary:string;created_at:string }
type AccessUser = { user_id:string;user_name?:string;user_email?:string;role_name?:string;role_slug?:string;is_blocked:boolean }
type AccessRole = { id:string;name:string;slug:string;description?:string }

const previewBootstrap: Bootstrap = { brand:{id:'preview',name:'Alho Pronto',slug:'alhopronto'},permissions:['*'],pending_approvals:3,pending_amount:9780,active_departments:4 }
const previewSummary: Summary = { income:48750,expense:18340,balance:30410,pending:6250,transaction_count:18,employees:{total:6,active:5,payroll:14800} }
const previewApprovals: Approval[] = [
  {id:'a1',title:'Pagamento de fornecedor',description:'Matéria-prima · NF 1842',resource_type:'finance',amount:6320,status:'pending',requested_by_name:'Mariana Souza',created_at:new Date().toISOString()},
  {id:'a2',title:'Solicitação de férias',description:'Carlos Lima · 15 dias',resource_type:'hr',status:'pending',requested_by_name:'Carlos Lima',created_at:new Date().toISOString()},
]
const previewDepartments: Department[] = [
  {id:'d1',name:'Administrativo',code:'ADM',cost_center_code:'CC-100',manager_name:'Mariana Souza',employee_count:2,is_active:true},
  {id:'d2',name:'Produção',code:'PRD',cost_center_code:'CC-200',manager_name:'João Santos',employee_count:3,is_active:true},
]
const previewAudit: Audit[] = [
  {id:'l1',actor_name:'Mariana Souza',action:'finance.create',resource_type:'transaction',summary:'Lançamento criado: Vendas da loja',created_at:new Date().toISOString()},
  {id:'l2',actor_name:'Administrador',action:'hr.update',resource_type:'employee',summary:'Funcionário atualizado: Carlos Lima',created_at:new Date(Date.now()-3600000).toISOString()},
]

async function request(path:string, options?:RequestInit) {
  const response = await fetch(path,{...options,headers:{...getHeaders(),...(options?.headers||{})}})
  const data = await response.json().catch(()=>({}))
  if(!response.ok) {
    const error=new Error(data.error || `Erro ${response.status}`) as Error&{status?:number}
    error.status=response.status
    throw error
  }
  return data
}
const can = (permissions:string[], permission:string) => permissions.includes('*') || permissions.includes(permission)
const dt = (value:string) => new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))
const currentMonthRange=()=>{const now=new Date(),to=now.toISOString().slice(0,10);return {from:`${to.slice(0,8)}01`,to}}

export function AdministrativeAppPage({ previewMode=false, accessOnly=false }: {previewMode?:boolean;accessOnly?:boolean}) {
  const navigate=useNavigate(), [params]=useSearchParams()
  const {slug}=useParams<{slug?:string}>()
  const {confirm}=useConfirm()
  const persistenceKey=`lead-system:administrative:last-view:${slug||'default'}`
  const persistedView=typeof window!=='undefined'?localStorage.getItem(persistenceKey):null
  const view=(accessOnly ? 'access' : (params.get('view') || (params.get('source')==='pwa'&&persistedView) || 'home')) as View
  const [menu,setMenu]=useState(false),[loading,setLoading]=useState(true),[contentLoading,setContentLoading]=useState(false),[error,setError]=useState('')
  const [bootstrap,setBootstrap]=useState<Bootstrap|null>(null),[summary,setSummary]=useState<Summary|null>(null)
  const bootstrapRef=useRef<Bootstrap|null>(null)
  const [approvals,setApprovals]=useState<Approval[]>([]),[departments,setDepartments]=useState<Department[]>([]),[audit,setAudit]=useState<Audit[]>([])
  const [departmentDraft,setDepartmentDraft]=useState<Partial<Department>|null>(null),[saving,setSaving]=useState(false)
  const [accessUsers,setAccessUsers]=useState<AccessUser[]>([]),[accessRoles,setAccessRoles]=useState<AccessRole[]>([])
  const [accessDraft,setAccessDraft]=useState<{name:string;email:string;password:string;role_id:string}|null>(null)

  const load=useCallback(async()=>{
    if(previewMode){
      bootstrapRef.current=previewBootstrap;setBootstrap(previewBootstrap);setSummary(previewSummary);setApprovals(previewApprovals)
      setDepartments(previewDepartments);setAudit(previewAudit)
      setAccessRoles([{id:'r1',name:'Financeiro',slug:'financeiro'},{id:'r2',name:'Pessoas e RH',slug:'rh'},{id:'r3',name:'Gestor Administrativo',slug:'gestor_administrativo'},{id:'r4',name:'Auditor / Contador',slug:'auditor_contador'}])
      setAccessUsers([{user_id:'u1',user_name:'Mariana Souza',user_email:'mariana@empresa.com',role_name:'Gestor Administrativo',is_blocked:false}])
      setLoading(false);return
    }
    const token=localStorage.getItem('lead-system-token')
    if(!token){navigate(`/login?redirect=${encodeURIComponent(location.pathname+location.search)}`,{replace:true});return}
    if(bootstrapRef.current)setContentLoading(true)
    else setLoading(true)
    setError('')
    try{
      const brandRef=slug || (typeof window!=='undefined'?window.__STORE_SLUG__:'') || ''
      const context=await fetch(`/api/auth/administrative-brand${brandRef?`?ref=${encodeURIComponent(brandRef)}`:''}`,{
        cache:'no-store',
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      })
      const contextData=await context.json().catch(()=>({}))
      if(context.status===401){
        clearAdminAuth()
        navigate(`/login?redirect=${encodeURIComponent(location.pathname+location.search)}`,{replace:true})
        return
      }
      if(!context.ok)throw new Error(contextData.error||'Não foi possível identificar a organização.')
      if(!contextData.brand?.id)throw new Error('Sua conta não possui acesso a esta organização.')
      localStorage.setItem('lead-system:active-brand-id',String(contextData.brand.id))
      if(contextData.brand.name)localStorage.setItem('lead-system:active-brand-name',String(contextData.brand.name))
      if(contextData.brand.logo_url)localStorage.setItem('lead-system:active-brand-logo',String(contextData.brand.logo_url))
      const boot=bootstrapRef.current || await request('/api/administrative/bootstrap')
      bootstrapRef.current=boot; setBootstrap(boot)
      const p=boot.permissions || []
      const tasks:Promise<void>[]=[]
      if(view==='home'&&can(p,'finance:read')) {
        const range=currentMonthRange()
        tasks.push(request(`/api/accounting/dashboard?from=${range.from}&to=${range.to}`).then(setSummary))
      }
      if((view==='home'||view==='approvals')&&can(p,'approvals:read')) tasks.push(request('/api/administrative/approvals').then(d=>setApprovals(d.approvals||[])))
      if(view==='structure'&&(can(p,'hr:read')||can(p,'finance:read'))) tasks.push(request('/api/administrative/departments').then(d=>setDepartments(d.departments||[])))
      if(view==='audit'&&can(p,'audit:read')) tasks.push(request('/api/administrative/audit?limit=60').then(d=>setAudit(d.events||[])))
      if(view==='access'&&can(p,'users:read')) tasks.push(request('/api/administrative/access').then(d=>{setAccessUsers(d.users||[]);setAccessRoles(d.roles||[])}))
      await Promise.all(tasks)
    }catch(e:any){
      if(e?.status===401||/token expirado|não autorizado/i.test(String(e?.message||''))){
        clearAdminAuth()
        navigate(`/login?redirect=${encodeURIComponent(location.pathname+location.search)}`,{replace:true})
        return
      }
      setError(e.message||'Não foi possível abrir o Administrativo')
    }
    finally{setLoading(false);setContentLoading(false)}
  },[navigate,previewMode,slug,view])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{if(!accessOnly)localStorage.setItem(persistenceKey,view)},[accessOnly,persistenceKey,view])

  const permissions=bootstrap?.permissions || []
  const nav=useMemo(()=>[
    {key:'home' as View,label:'Início',icon:LayoutDashboard,show:true},
    {key:'finance' as View,label:'Financeiro',icon:WalletCards,show:can(permissions,'finance:read')},
    {key:'people' as View,label:'Pessoas e RH',icon:UsersRound,show:can(permissions,'hr:read')},
    {key:'approvals' as View,label:'Aprovações',icon:ClipboardCheck,show:can(permissions,'approvals:read'),badge:approvals.filter(a=>a.status==='pending').length},
    {key:'structure' as View,label:'Estrutura',icon:Building2,show:can(permissions,'hr:read')||can(permissions,'finance:read')},
    {key:'access' as View,label:'Acessos',icon:UserCog,show:can(permissions,'users:read')},
    {key:'audit' as View,label:'Auditoria',icon:ShieldCheck,show:can(permissions,'audit:read')},
  ].filter(item=>item.show),[permissions,approvals])
  const currentNav=nav.find(item=>item.key===view)
  function open(key:View, action?:string){
    setMenu(false)
    const next=new URLSearchParams()
    if(key!=='home')next.set('view',key)
    if(action)next.set('action',action)
    navigate({pathname:location.pathname,search:next.toString()?`?${next.toString()}`:''},{replace:true})
    window.scrollTo({top:0,behavior:'auto'})
  }
  async function decide(row:Approval,decision:'approved'|'rejected'){
    const ok=await confirm({title:decision==='approved'?'Aprovar solicitação?':'Rejeitar solicitação?',message:`${row.title}${row.amount?` · ${money(row.amount)}`:''}. A decisão ficará registrada na auditoria.`,confirmLabel:decision==='approved'?'Aprovar':'Rejeitar',variant:decision==='approved'?'default':'danger'})
    if(!ok)return
    if(previewMode){setApprovals(v=>v.map(a=>a.id===row.id?{...a,status:decision}:a));return}
    await request(`/api/administrative/approvals/${row.id}/decision`,{method:'POST',body:JSON.stringify({decision})});await load()
  }
  async function saveDepartment(){
    if(!departmentDraft?.name?.trim())return
    setSaving(true)
    try{
      if(previewMode){setDepartments(v=>departmentDraft.id?v.map(d=>d.id===departmentDraft.id?{...d,...departmentDraft} as Department:d):[...v,{...departmentDraft,id:`preview-${Date.now()}`,employee_count:0,is_active:true} as Department]);setDepartmentDraft(null);return}
      await request(`/api/administrative/departments${departmentDraft.id?`/${departmentDraft.id}`:''}`,{method:departmentDraft.id?'PUT':'POST',body:JSON.stringify(departmentDraft)});setDepartmentDraft(null);await load()
    }finally{setSaving(false)}
  }
  async function saveAccess(){
    if(!accessDraft)return
    setSaving(true)
    try{
      if(previewMode){setAccessUsers(v=>[...v,{user_id:`preview-${Date.now()}`,user_name:accessDraft.name,user_email:accessDraft.email,role_name:accessRoles.find(r=>r.id===accessDraft.role_id)?.name||'Financeiro',is_blocked:false}]);setAccessDraft(null);return}
      await request('/api/administrative/access',{method:'POST',body:JSON.stringify(accessDraft)});setAccessDraft(null);await load()
    }finally{setSaving(false)}
  }
  async function toggleAccess(row:AccessUser){
    const blocked=!row.is_blocked
    const ok=await confirm({title:blocked?'Bloquear acesso?':'Restaurar acesso?',message:`${row.user_name||row.user_email} ${blocked?'não poderá abrir o app até ser restaurado.':'voltará a acessar as áreas do seu perfil.'}`,confirmLabel:blocked?'Bloquear':'Restaurar',variant:blocked?'danger':'default'})
    if(!ok)return
    if(previewMode){setAccessUsers(v=>v.map(u=>u.user_id===row.user_id?{...u,is_blocked:blocked}:u));return}
    await request(`/api/administrative/access/${row.user_id}/block`,{method:'PATCH',body:JSON.stringify({blocked})});await load()
  }
  function logout(){clearAdminAuth();navigate('/login',{replace:true})}
  if(loading)return <div className="min-h-screen bg-[#f5f5f5] grid place-items-center"><Loader2 className="animate-spin text-gray-400"/></div>
  if(error)return <div className="min-h-screen bg-[#f5f5f5] grid place-items-center p-6"><div className="max-w-md bg-white border border-gray-200 rounded-[20px] p-7 text-center"><ShieldCheck className="mx-auto text-gray-400 mb-3"/><h1 className="font-bold text-lg">Acesso administrativo</h1><p className="text-sm text-gray-500 mt-2">{error}</p><button onClick={()=>void load()} className="h-11 px-4 mt-5 rounded-[16px] bg-gray-950 text-white text-sm font-semibold">Tentar novamente</button></div></div>
  if(accessOnly)return <div className="min-h-full bg-[#f5f5f5]">
    <AccessView users={accessUsers} roles={accessRoles} create={()=>setAccessDraft({name:'',email:'',password:'',role_id:accessRoles[0]?.id||''})} toggle={toggleAccess} canEdit={can(permissions,'users:write')}/>
    {accessDraft&&<AccessModal draft={accessDraft} setDraft={setAccessDraft} roles={accessRoles} save={saveAccess} saving={saving}/>}
  </div>

  return <div className="min-h-screen bg-[#f5f5f5] text-gray-950">
    <header className="h-[calc(3.5rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] sm:h-16 sm:pt-0 bg-white/95 backdrop-blur-xl border-b border-gray-200 fixed inset-x-0 top-0 z-40 flex items-center px-3 sm:px-4 lg:pl-[268px]">
      <button onClick={()=>setMenu(true)} className="size-11 grid place-items-center lg:hidden rounded-xl hover:bg-gray-100"><Menu size={20}/></button>
      <div className="flex items-center gap-3 min-w-0"><div className="hidden sm:grid size-9 rounded-xl bg-gray-950 text-white place-items-center"><Landmark size={17}/></div><div className="min-w-0"><p className="font-bold text-[15px] sm:text-[14px] truncate">{currentNav?.label||'Administrativo'}</p><p className="text-[10px] text-gray-500 truncate">{bootstrap?.brand?.name || 'Organização'}</p></div></div>
      <div className="ml-auto flex items-center gap-2"><button onClick={()=>void load()} title="Atualizar" className="size-11 rounded-xl grid place-items-center hover:bg-gray-100"><RefreshCw size={16}/></button><button onClick={()=>navigate('/admin')} className="hidden sm:flex h-11 px-3 rounded-xl items-center gap-2 text-[12px] font-semibold hover:bg-gray-100"><ArrowLeft size={15}/> Organização</button></div>
    </header>
    {menu&&<button aria-label="Fechar menu" className="fixed inset-0 bg-black/35 z-40 lg:hidden" onClick={()=>setMenu(false)}/>}
    <aside className={`fixed top-0 bottom-0 left-0 z-50 w-[276px] lg:w-[252px] bg-white border-r border-gray-200 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] lg:pt-4 flex flex-col transition-transform lg:translate-x-0 shadow-2xl lg:shadow-none ${menu?'translate-x-0':'-translate-x-full'}`}>
      <div className="h-12 flex items-center justify-between px-2"><div><p className="text-[15px] font-bold tracking-tight">Administrativo</p><p className="text-[10px] text-gray-500">Financeiro e Pessoas</p></div><button onClick={()=>setMenu(false)} className="size-10 grid place-items-center lg:hidden"><X size={18}/></button></div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:hidden">
        {can(permissions,'finance:write')&&<button onClick={()=>open('finance','new-transaction')} className="min-h-16 p-3 rounded-[16px] bg-gray-950 text-white text-left"><Plus size={16}/><span className="block text-[11px] font-semibold mt-2">Lançamento</span></button>}
        {can(permissions,'hr:write')&&<button onClick={()=>open('people','new-employee')} className="min-h-16 p-3 rounded-[16px] bg-gray-100 text-gray-800 text-left"><UsersRound size={16}/><span className="block text-[11px] font-semibold mt-2">Admitir pessoa</span></button>}
      </div>
      <p className="mt-5 px-3 text-[9px] font-bold uppercase tracking-[.12em] text-gray-400">Áreas administrativas</p>
      <nav className="mt-2 space-y-1">{nav.map(item=><button key={item.key} onClick={()=>open(item.key)} className={`w-full min-h-12 px-3 rounded-[14px] flex items-center gap-3 text-[12px] font-semibold ${view===item.key?'bg-gray-950 text-white':'text-gray-600 hover:bg-gray-100'}`}><item.icon size={18}/><span>{item.label}</span><ChevronRight size={14} className={`ml-auto ${view===item.key?'opacity-60':'text-gray-300'}`}/>{item.badge? <span className={`min-w-5 h-5 px-1 rounded-full grid place-items-center text-[10px] ${view===item.key?'bg-white text-gray-950':'bg-amber-100 text-amber-800'}`}>{item.badge}</span>:null}</button>)}</nav>
      <div className="mt-auto pt-4 border-t border-gray-100"><button onClick={()=>{setMenu(false);window.dispatchEvent(new Event('lc:open-pwa-install'))}} className="w-full h-11 px-3 rounded-[14px] flex items-center gap-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-100"><Download size={16}/> Instalar aplicativo</button><div className="px-3 py-2 my-1"><p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Ambiente protegido</p><p className="text-[11px] text-gray-500 mt-1">Ações e exportações são auditadas.</p></div><button onClick={logout} className="w-full h-11 px-3 rounded-[14px] flex items-center gap-3 text-[12px] font-semibold text-gray-600 hover:bg-red-50 hover:text-red-700"><LogOut size={16}/> Sair</button></div>
    </aside>
    {contentLoading&&<div className="fixed top-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:top-16 left-0 lg:left-[252px] right-0 h-0.5 z-30 overflow-hidden bg-gray-200"><div className="h-full w-1/3 bg-gray-950 animate-[admin-nav-progress_900ms_ease-in-out_infinite]"/></div>}
    <main className={`pt-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:pt-16 lg:pl-[252px] pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0 transition-opacity duration-150 ${contentLoading?'opacity-70 pointer-events-none':'opacity-100'}`} aria-busy={contentLoading}>
      <div key={view} className="animate-[admin-page-enter_180ms_cubic-bezier(0.16,1,0.3,1)]">
        {view==='home'&&<Home summary={summary} bootstrap={bootstrap} approvals={approvals} open={open}/>}
        {view==='finance'&&<AccountingView focus="finance" embedded previewMode={previewMode} initialAction={params.get('action')||undefined}/>}
        {view==='people'&&<AccountingView focus="hr" embedded previewMode={previewMode} initialAction={params.get('action')||undefined}/>}
        {view==='approvals'&&<Approvals rows={approvals} decide={decide} canDecide={can(permissions,'approvals:decide')}/>}
        {view==='structure'&&<Structure rows={departments} edit={setDepartmentDraft} canEdit={can(permissions,'hr:write')}/>}
        {view==='access'&&<AccessView users={accessUsers} roles={accessRoles} create={()=>setAccessDraft({name:'',email:'',password:'',role_id:accessRoles[0]?.id||''})} toggle={toggleAccess} canEdit={can(permissions,'users:write')}/>}
        {view==='audit'&&<AuditView rows={audit}/>}
      </div>
    </main>
    <nav className="fixed bottom-0 inset-x-0 h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-white/95 backdrop-blur-xl border-t border-gray-200 z-30 flex lg:hidden">{nav.slice(0,4).map(item=><button key={item.key} onClick={()=>open(item.key)} className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-[9px] font-semibold ${view===item.key?'text-gray-950':'text-gray-400'}`}>{view===item.key&&<span className="absolute top-1.5 w-5 h-0.5 rounded-full bg-gray-950"/>}<item.icon size={19}/><span className="truncate max-w-full px-1">{item.label==='Pessoas e RH'?'Pessoas':item.label}</span>{item.badge?<span className="absolute top-2 right-[25%] min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[8px] grid place-items-center">{item.badge}</span>:null}</button>)}<button onClick={()=>setMenu(true)} className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-[9px] font-semibold text-gray-400"><Menu size={19}/><span>Mais</span></button></nav>
    {departmentDraft&&<DepartmentModal draft={departmentDraft} setDraft={setDepartmentDraft} save={saveDepartment} saving={saving}/>}
    {accessDraft&&<AccessModal draft={accessDraft} setDraft={setAccessDraft} roles={accessRoles} save={saveAccess} saving={saving}/>}
  </div>
}

function Home({summary,bootstrap,approvals,open}:{summary:Summary|null;bootstrap:Bootstrap|null;approvals:Approval[];open:(v:View)=>void}){
  const pending=approvals.filter(a=>a.status==='pending')
  return <div className="max-w-[1380px] mx-auto p-3 sm:p-5 lg:p-6">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3"><Kpi label="Saldo do mês" value={money(summary?.balance||0)} icon={Landmark} onClick={()=>open('finance')}/><Kpi label="Entradas no mês" value={money(summary?.income||0)} icon={ArrowUpRight} tone="green" onClick={()=>open('finance')}/><Kpi label="Saídas no mês" value={money(summary?.expense||0)} icon={ArrowDownRight} tone="red" onClick={()=>open('finance')}/><Kpi label="Aguardando aprovação" value={String(bootstrap?.pending_approvals||0)} icon={ClipboardCheck} tone="amber" onClick={()=>open('approvals')}/></div>
    <div className="grid lg:grid-cols-[1.15fr_.85fr] gap-4 mt-4"><section className="bg-white border border-gray-200 rounded-[20px] p-5"><div className="flex items-center justify-between"><div><h2 className="font-bold text-[14px]">Decisões pendentes</h2><p className="text-[11px] text-gray-500">Itens que aguardam análise</p></div><button onClick={()=>open('approvals')} className="text-[11px] font-semibold flex items-center gap-1">Ver todas <ChevronRight size={14}/></button></div><div className="mt-4 space-y-2">{pending.length?pending.slice(0,4).map(a=><div key={a.id} className="p-3 rounded-[16px] bg-gray-50 flex items-center gap-3"><div className="size-9 rounded-xl bg-amber-50 text-amber-700 grid place-items-center"><FileClock size={16}/></div><div className="min-w-0"><p className="text-[12px] font-semibold truncate">{a.title}</p><p className="text-[10px] text-gray-500">{a.requested_by_name||'Equipe'}{a.amount?` · ${money(a.amount)}`:''}</p></div></div>):<Empty text="Nenhuma decisão pendente."/ >}</div></section>
      <section className="bg-white border border-gray-200 rounded-[20px] p-5"><h2 className="font-bold text-[14px]">Estrutura atual</h2><div className="mt-4 space-y-2"><Line label="Funcionários ativos" value={String(summary?.employees.active||0)}/><Line label="Departamentos" value={String(bootstrap?.active_departments||0)}/><Line label="Folha salarial base" value={summary?.employees.payroll==null?'Restrito':money(summary.employees.payroll)}/><Line label="Movimentações no período" value={String(summary?.transaction_count||0)}/></div><button onClick={()=>open('structure')} className="w-full h-11 mt-4 rounded-[16px] bg-gray-100 text-[12px] font-semibold">Ver estrutura</button></section></div>
  </div>
}
function Kpi({label,value,icon:Icon,tone='dark',onClick}:{label:string;value:string;icon:any;tone?:string;onClick?:()=>void}){const colors:any={dark:'bg-gray-950 text-white',green:'bg-emerald-50 text-emerald-700',red:'bg-rose-50 text-rose-700',amber:'bg-amber-50 text-amber-700'};const Tag=onClick?'button':'div';return <Tag onClick={onClick} className="text-left bg-white border border-gray-200 rounded-[20px] p-4 active:scale-[.99]"><div className={`size-9 rounded-xl grid place-items-center ${colors[tone]}`}><Icon size={17}/></div><p className="text-[10px] text-gray-500 mt-4">{label}</p><p className="text-[18px] sm:text-[21px] font-bold tabular-nums mt-1">{value}</p></Tag>}
function Line({label,value}:{label:string;value:string}){return <div className="flex justify-between py-2.5 border-b border-gray-100 last:border-0"><span className="text-[12px] text-gray-500">{label}</span><span className="text-[12px] font-bold tabular-nums">{value}</span></div>}
function Empty({text,icon:Icon=ReceiptText,action}:{text:string;icon?:any;action?:any}){return <div className="min-h-52 px-6 py-10 flex flex-col items-center justify-center text-center"><div className="size-12 rounded-[18px] bg-gray-100 text-gray-400 grid place-items-center"><Icon size={21}/></div><p className="mt-3 text-[13px] font-semibold text-gray-700">{text}</p>{action&&<div className="mt-4">{action}</div>}</div>}
function SurfaceBar({count,action}:{count:string;action?:any}){return <div className="min-h-12 mb-3 flex items-center justify-between gap-3"><p className="text-[11px] font-medium text-gray-500">{count}</p>{action}</div>}
function Approvals({rows,decide,canDecide}:{rows:Approval[];decide:(r:Approval,d:'approved'|'rejected')=>void;canDecide:boolean}){const pending=rows.filter(r=>r.status==='pending').length;return <div className="max-w-5xl mx-auto p-3 sm:p-5 lg:p-6"><SurfaceBar count={rows.length?`${pending} pendentes · ${rows.length} no histórico`:'Tudo em dia'}/><div className={rows.length?'space-y-2':'bg-white border border-gray-200 rounded-[20px]'}>{rows.length?rows.map(r=><article key={r.id} className="bg-white border border-gray-200 rounded-[18px] p-4"><div className="flex items-start gap-3"><div className={`size-10 rounded-[14px] grid place-items-center shrink-0 ${r.status==='pending'?'bg-amber-50 text-amber-700':r.status==='approved'?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>{r.status==='approved'?<Check size={18}/>:<FileClock size={18}/>}</div><div className="flex-1 min-w-0"><div className="flex flex-wrap gap-2 items-center"><h2 className="font-bold text-[13px]">{r.title}</h2><span className="px-2 py-0.5 rounded-full bg-gray-100 text-[9px] font-bold uppercase">{r.resource_type==='hr'?'RH':'Financeiro'}</span></div><p className="text-[11px] text-gray-500 mt-1">{r.description||'Sem descrição'} · {r.requested_by_name||'Equipe'}</p><p className="text-[10px] text-gray-400 mt-1">{dt(r.created_at)}</p>{r.amount!=null&&<p className="text-[15px] font-bold tabular-nums mt-2">{money(r.amount)}</p>}{r.status==='pending'&&canDecide&&<div className="grid grid-cols-2 gap-2 mt-3"><button onClick={()=>decide(r,'rejected')} className="h-11 rounded-[14px] bg-red-50 text-red-700 text-[11px] font-semibold">Rejeitar</button><button onClick={()=>decide(r,'approved')} className="h-11 rounded-[14px] bg-gray-950 text-white text-[11px] font-semibold">Aprovar</button></div>}</div></div></article>):<Empty text="Nenhuma decisão aguardando você" icon={ClipboardCheck}/>}</div></div>}
function Structure({rows,edit,canEdit}:{rows:Department[];edit:(d:Partial<Department>)=>void;canEdit:boolean}){const action=canEdit?<button onClick={()=>edit({is_active:true})} className="h-11 px-3.5 rounded-[14px] bg-gray-950 text-white text-[12px] font-semibold flex items-center gap-2"><Plus size={15}/> Adicionar</button>:null;return <div className="max-w-6xl mx-auto p-3 sm:p-5 lg:p-6"><SurfaceBar count={`${rows.length} departamentos`} action={action}/><div className={rows.length?'grid sm:grid-cols-2 xl:grid-cols-3 gap-3':'bg-white border border-gray-200 rounded-[20px]'}>{rows.length?rows.map(r=><button key={r.id} onClick={()=>canEdit&&edit(r)} className="text-left bg-white border border-gray-200 rounded-[18px] p-4 active:scale-[.99]"><div className="flex items-center justify-between"><div className="size-10 rounded-[14px] bg-gray-100 grid place-items-center"><Building2 size={18}/></div><span className={`text-[9px] font-bold uppercase ${r.is_active?'text-emerald-700':'text-gray-400'}`}>{r.is_active?'Ativo':'Inativo'}</span></div><h2 className="font-bold text-[14px] mt-3">{r.name}</h2><p className="text-[11px] text-gray-500 mt-1">{r.code||'Sem código'} · {r.cost_center_code||'Sem centro de custo'}</p><div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-[11px]"><span className="text-gray-500">{r.manager_name||'Sem gestor'}</span><strong>{r.employee_count||0} pessoas</strong></div></button>):<Empty text="Sua estrutura começa pelo primeiro departamento" icon={Building2} action={action}/>}</div></div>}
function AuditView({rows}:{rows:Audit[]}){return <div className="max-w-5xl mx-auto p-3 sm:p-5 lg:p-6"><SurfaceBar count={`${rows.length} eventos recentes`}/><div className="bg-white border border-gray-200 rounded-[20px] overflow-hidden">{rows.length?rows.map(r=><div key={r.id} className="p-4 border-b border-gray-100 last:border-0 flex gap-3"><div className="size-9 rounded-[13px] bg-gray-100 grid place-items-center shrink-0"><Activity size={15}/></div><div className="min-w-0"><p className="text-[12px] font-semibold">{r.summary}</p><p className="text-[10px] text-gray-500 mt-1">{r.actor_name||'Sistema'} · {dt(r.created_at)}</p><p className="text-[9px] text-gray-400 mt-1">{r.action}</p></div></div>):<Empty text="As próximas alterações aparecerão aqui" icon={ShieldCheck}/>}</div></div>}
function AccessView({users,roles,create,toggle,canEdit}:{users:AccessUser[];roles:AccessRole[];create:()=>void;toggle:(u:AccessUser)=>void;canEdit:boolean}){const action=canEdit?<button onClick={create} className="h-11 px-3.5 rounded-[14px] bg-gray-950 text-white text-[12px] font-semibold flex items-center gap-2"><Plus size={15}/> Adicionar</button>:null;return <div className="max-w-5xl mx-auto p-3 sm:p-5 lg:p-6"><SurfaceBar count={`${users.length} acessos`} action={action}/><div className="bg-white border border-gray-200 rounded-[20px] overflow-hidden">{users.length?users.map(u=><div key={u.user_id} className="p-4 border-b border-gray-100 last:border-0"><div className="flex items-center gap-3"><div className="size-10 rounded-full bg-gray-100 grid place-items-center font-bold text-[12px]">{(u.user_name||u.user_email||'U')[0]}</div><div className="flex-1 min-w-0"><p className="text-[12px] font-semibold truncate">{u.user_name||'Usuário'}</p><p className="text-[10px] text-gray-500 truncate">{u.user_email}</p></div><span className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase ${u.is_blocked?'bg-red-50 text-red-700':'bg-emerald-50 text-emerald-700'}`}>{u.is_blocked?'Bloqueado':'Ativo'}</span></div><div className="flex items-center justify-between mt-3 pl-[52px]"><span className="text-[10px] font-semibold text-gray-500">{u.role_name||u.role_slug||'Sem perfil'}</span>{canEdit&&<button onClick={()=>toggle(u)} className="h-9 px-3 rounded-[12px] bg-gray-100 text-[10px] font-semibold">{u.is_blocked?'Restaurar':'Bloquear'}</button>}</div></div>):<Empty text="Adicione quem poderá administrar a organização" icon={UserCog} action={action}/>}</div>{roles.length>0&&<div className="mt-3 px-1"><p className="text-[10px] font-semibold text-gray-400">PERFIS DISPONÍVEIS</p><div className="flex overflow-x-auto gap-2 mt-2 pb-1">{roles.map(r=><span key={r.id} className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-full text-[10px] font-semibold">{r.name}</span>)}</div></div>}</div>}
function DepartmentModal({draft,setDraft,save,saving}:{draft:Partial<Department>;setDraft:(v:Partial<Department>|null)=>void;save:()=>void;saving:boolean}){const field='w-full h-11 px-3 rounded-[15px] border border-gray-200 text-[13px] outline-none focus:border-gray-900';return <div className="fixed inset-0 z-[80] bg-black/35 flex items-end sm:items-center justify-center" onMouseDown={e=>e.target===e.currentTarget&&setDraft(null)}><div className="w-full sm:max-w-lg bg-white rounded-t-[24px] sm:rounded-[24px] p-5"><div className="flex items-center justify-between"><h2 className="font-bold">Departamento</h2><button onClick={()=>setDraft(null)} className="size-11 grid place-items-center"><X size={18}/></button></div><div className="grid sm:grid-cols-2 gap-3 mt-4"><label className="sm:col-span-2 text-[11px] font-semibold text-gray-600">Nome<input className={`${field} mt-1.5`} value={draft.name||''} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label className="text-[11px] font-semibold text-gray-600">Código<input className={`${field} mt-1.5`} value={draft.code||''} onChange={e=>setDraft({...draft,code:e.target.value})}/></label><label className="text-[11px] font-semibold text-gray-600">Centro de custo<input className={`${field} mt-1.5`} value={draft.cost_center_code||''} onChange={e=>setDraft({...draft,cost_center_code:e.target.value})}/></label></div><div className="flex justify-end gap-2 mt-5"><button onClick={()=>setDraft(null)} className="h-11 px-4 rounded-[15px] bg-gray-100 text-[12px] font-semibold">Cancelar</button><button onClick={save} disabled={saving} className="h-11 px-5 rounded-[15px] bg-gray-950 text-white text-[12px] font-semibold">{saving?'Salvando…':'Salvar'}</button></div></div></div>}
function AccessModal({draft,setDraft,roles,save,saving}:{draft:{name:string;email:string;password:string;role_id:string};setDraft:(v:any)=>void;roles:AccessRole[];save:()=>void;saving:boolean}){const field='w-full h-11 px-3 rounded-[15px] border border-gray-200 text-[13px] outline-none focus:border-gray-900';return <div className="fixed inset-0 z-[80] bg-black/35 flex items-end sm:items-center justify-center"><div className="w-full sm:max-w-lg bg-white rounded-t-[24px] sm:rounded-[24px] p-5"><div className="flex items-center justify-between"><div><h2 className="font-bold">Novo acesso</h2><p className="text-[11px] text-gray-500 mt-1">A senha poderá ser alterada depois.</p></div><button onClick={()=>setDraft(null)} className="size-11 grid place-items-center"><X size={18}/></button></div><div className="space-y-3 mt-4"><label className="block text-[11px] font-semibold text-gray-600">Nome<input className={`${field} mt-1.5`} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label className="block text-[11px] font-semibold text-gray-600">E-mail<input type="email" className={`${field} mt-1.5`} value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})}/></label><label className="block text-[11px] font-semibold text-gray-600">Senha inicial<input type="password" className={`${field} mt-1.5`} value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/></label><label className="block text-[11px] font-semibold text-gray-600">Perfil<select className={`${field} mt-1.5`} value={draft.role_id} onChange={e=>setDraft({...draft,role_id:e.target.value})}>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div><div className="flex justify-end gap-2 mt-5"><button onClick={()=>setDraft(null)} className="h-11 px-4 rounded-[15px] bg-gray-100 text-[12px] font-semibold">Cancelar</button><button onClick={save} disabled={saving} className="h-11 px-5 rounded-[15px] bg-gray-950 text-white text-[12px] font-semibold">{saving?'Criando…':'Criar acesso'}</button></div></div></div>}
