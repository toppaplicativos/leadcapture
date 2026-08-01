import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, Download, FileSpreadsheet,
  Landmark, Loader2, Pencil, Plus, ReceiptText, RefreshCw, Search, Tags, Trash2, UserRound, UsersRound, X,
} from 'lucide-react'
import { getHeaders, money } from '@/lib/admin/helpers'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmModal'
import { EmployeeDetail, EmployeeRows } from './EmployeeDetail'
import { TransactionRows } from './TransactionRows'
import { EmployeeAdmissionModal } from './EmployeeAdmissionModal'

type Tx = { id:string; kind:'income'|'expense'; description:string; category:string; category_id?:string; amount:number; occurred_on:string; status:'paid'|'pending'; payment_method?:string; document_number?:string; notes?:string; source_type?:string; source_label?:string }
type Category = { id:string; name:string; kind:'income'|'expense'; is_system:boolean; is_active:boolean }
type EmployeeProfile = { preferred_name?:string;birth_date?:string;nationality?:string;marital_status?:string;education?:string;postal_code?:string;address?:string;address_number?:string;city?:string;state?:string;emergency_name?:string;emergency_phone?:string;employee_number?:string;esocial_category?:string;weekly_hours?:number;work_schedule?:string;salary_frequency?:string;bank_name?:string;bank_agency?:string;bank_account?:string;pix_key?:string;manager_name?:string;cost_center?:string }
type Employee = { id:string; name:string; email?:string; phone?:string; document_number?:string; role_title?:string; department?:string; employment_type:string; admission_date?:string; salary?:number; status:'active'|'inactive'|'vacation'; notes?:string;photo_url?:string;profile_data?:EmployeeProfile }
type RecurringExpense = { id:string;description:string;amount:number;frequency:string;starts_on?:string;is_active:boolean }
type AuditEvent = { id:string;action:string;summary:string;actor_name?:string;actor_email?:string;created_at:string }
type Summary = { income:number; expense:number; balance:number; pending:number; transaction_count:number; employees:{total:number;active:number;payroll:number}; monthly:{month:string;income:number;expense:number}[] }
type RecurringRow = RecurringExpense & {category:string;source_type:string;source_id:string;employee_name?:string;employee_role?:string}
type Tab = 'overview'|'obligations'|'transactions'|'categories'|'employees'|'reports'

const today = new Date().toISOString().slice(0,10)
const firstDay = `${today.slice(0,8)}01`
const txEmpty: Partial<Tx> = { kind:'income', status:'paid', occurred_on:today }
const empEmpty: Partial<Employee> = { employment_type:'clt', status:'active', admission_date:today }
const input = 'w-full h-11 px-3.5 rounded-[16px] border border-gray-200 bg-white text-[13px] text-gray-900 outline-none focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5'
const label = 'block mb-1.5 text-[11px] font-semibold text-gray-600'

async function api(path:string, options?:RequestInit) {
  const response = await fetch(path, { ...options, headers: { ...getHeaders(), ...(options?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`)
  return data
}
function dateText(value?:string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${value.slice(0,10)}T12:00:00Z`))
}

const previewSummary: Summary = {
  income: 48750, expense: 18340, balance: 30410, pending: 6250, transaction_count: 18,
  employees: { total: 6, active: 5, payroll: 14800 },
  monthly: [
    { month:'2026-04', income:32500, expense:16200 },
    { month:'2026-05', income:41200, expense:19100 },
    { month:'2026-06', income:38900, expense:17500 },
    { month:'2026-07', income:48750, expense:18340 },
  ],
}
const previewTransactions: Tx[] = [
  { id:'preview-1', kind:'income', description:'Vendas da loja', category:'Vendas', amount:28450, occurred_on:'2026-07-28', status:'paid', payment_method:'Pix' },
  { id:'preview-2', kind:'expense', description:'Compra de matéria-prima', category:'Fornecedores', amount:6320, occurred_on:'2026-07-26', status:'paid', document_number:'NF 1842' },
  { id:'preview-3', kind:'expense', description:'Impostos do mês', category:'Impostos', amount:4180, occurred_on:'2026-07-31', status:'pending' },
]
const previewCategories: Category[] = [
  ...['Vendas','Serviços','Recebimentos','Rendimentos','Reembolsos recebidos','Outras entradas'].map((name,index)=>({id:`income-${index}`,name,kind:'income' as const,is_system:true,is_active:true})),
  ...['Fornecedores','Matéria-prima','Folha e salários','Encargos e benefícios','Impostos e taxas','Aluguel e estrutura','Marketing e vendas','Frete e logística','Tecnologia e assinaturas','Manutenção','Reembolsos','Outras saídas'].map((name,index)=>({id:`expense-${index}`,name,kind:'expense' as const,is_system:true,is_active:true})),
]
const previewEmployees: Employee[] = [
  { id:'employee-1', name:'Mariana Souza', role_title:'Analista financeiro', department:'Administrativo', employment_type:'clt', admission_date:'2025-03-10', salary:3800, status:'active', email:'mariana@empresa.com' },
  { id:'employee-2', name:'Carlos Lima', role_title:'Auxiliar administrativo', department:'Administrativo', employment_type:'clt', admission_date:'2025-08-04', salary:2450, status:'active', email:'carlos@empresa.com' },
]

export function AccountingView({ previewMode = false, focus = 'all', embedded = false, initialAction }: {
  previewMode?: boolean
  focus?: 'all' | 'finance' | 'hr'
  embedded?: boolean
  initialAction?: string
}) {
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const [tab,setTab] = useState<Tab>(focus === 'hr' ? 'employees' : focus === 'finance' ? 'transactions' : 'overview')
  const [from,setFrom] = useState(firstDay)
  const [to,setTo] = useState(today)
  const [summary,setSummary] = useState<Summary|null>(null)
  const [transactions,setTransactions] = useState<Tx[]>([])
  const [categories,setCategories] = useState<Category[]>([])
  const [employees,setEmployees] = useState<Employee[]>([])
  const [recurring,setRecurring] = useState<RecurringRow[]>([])
  const [loading,setLoading] = useState(true)
  const [search,setSearch] = useState('')
  const [txDraft,setTxDraft] = useState<Partial<Tx>|null>(null)
  const [empDraft,setEmpDraft] = useState<Partial<Employee>|null>(null)
  const [saving,setSaving] = useState(false)
  const [categoryDraft,setCategoryDraft] = useState<{name:string;kind:'income'|'expense'}|null>(null)
  const [syncing,setSyncing] = useState(false)
  const [selectedEmployee,setSelectedEmployee] = useState<Employee|null>(null)
  const [employeeExpense,setEmployeeExpense] = useState<RecurringExpense|null>(null)
  const [employeeHistory,setEmployeeHistory] = useState<AuditEvent[]>([])
  const [employeeDetailLoading,setEmployeeDetailLoading] = useState(false)
  const initialActionHandled=useRef(false)

  const load = useCallback(async () => {
    if (previewMode) {
      setSummary(previewSummary); setTransactions(previewTransactions); setEmployees(previewEmployees); setCategories(previewCategories); setLoading(false)
      return
    }
    setLoading(true)
    try {
      const q = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      if (focus === 'hr') {
        const e = await api('/api/accounting/employees')
        setEmployees(e.employees || [])
      } else if (focus === 'finance') {
        const [s,t,c,r] = await Promise.all([api(`/api/accounting/dashboard${q}`),api(`/api/accounting/transactions${q}`),api('/api/accounting/categories'),api('/api/accounting/recurring-expenses')])
        setSummary(s); setTransactions(t.transactions || []); setCategories(c.categories || []); setRecurring(r.recurring_expenses || [])
      } else {
        const [s,t,e,c,r] = await Promise.all([api(`/api/accounting/dashboard${q}`),api(`/api/accounting/transactions${q}`),api('/api/accounting/employees'),api('/api/accounting/categories'),api('/api/accounting/recurring-expenses')])
        setSummary(s); setTransactions(t.transactions || []); setEmployees(e.employees || []); setCategories(c.categories || []); setRecurring(r.recurring_expenses || [])
      }
    } catch (error:any) { showToast(`Erro: ${error.message}`) }
    finally { setLoading(false) }
  },[from,to,showToast,previewMode,focus])
  useEffect(() => { void load() },[load])
  useEffect(()=>{
    if(initialActionHandled.current||loading)return
    if(initialAction==='new-employee'){setTab('employees');setEmpDraft({...empEmpty});initialActionHandled.current=true}
    if(initialAction==='new-transaction'&&categories.length){setTab('transactions');setTxDraft({...txEmpty,category_id:categories.find(c=>c.kind==='expense'&&c.is_active)?.id});initialActionHandled.current=true}
  },[initialAction,loading,categories])

  const filteredTx = useMemo(() => transactions.filter(t => `${t.description} ${t.category} ${t.document_number || ''}`.toLowerCase().includes(search.toLowerCase())),[transactions,search])
  const filteredEmployees = useMemo(() => employees.filter(e => `${e.name} ${e.role_title || ''} ${e.department || ''}`.toLowerCase().includes(search.toLowerCase())),[employees,search])

  async function openEmployee(employee:Employee) {
    setSelectedEmployee(employee)
    setEmployeeDetailLoading(true)
    try {
      if (previewMode) {
        setEmployeeExpense(employee.salary ? {id:'preview',description:`Folha fixa · ${employee.name}`,amount:employee.salary,frequency:'monthly',starts_on:employee.admission_date,is_active:employee.status==='active'} : null)
        setEmployeeHistory([])
        return
      }
      const [detail,history] = await Promise.all([
        api(`/api/accounting/employees/${employee.id}`),
        api(`/api/administrative/audit?resource_type=employee&resource_id=${encodeURIComponent(employee.id)}&limit=100`).catch(() => ({events:[]})),
      ])
      setSelectedEmployee(detail.employee)
      setEmployeeExpense(detail.recurring_expense || null)
      setEmployeeHistory(history.events || [])
    } catch(e:any) { showToast(`Erro: ${e.message}`) }
    finally { setEmployeeDetailLoading(false) }
  }

  async function saveTx() {
    if (!txDraft?.description?.trim() || !txDraft.amount || !txDraft.occurred_on) return showToast('Erro: preencha descrição, valor e data')
    setSaving(true)
    try {
      await api(`/api/accounting/transactions${txDraft.id ? `/${txDraft.id}` : ''}`, { method:txDraft.id?'PUT':'POST', body:JSON.stringify(txDraft) })
      setTxDraft(null); showToast(txDraft.id ? 'Lançamento atualizado' : 'Lançamento registrado'); await load()
    } catch(e:any) { showToast(`Erro: ${e.message}`) } finally { setSaving(false) }
  }
  async function saveEmployee() {
    if (!empDraft?.name?.trim()) return showToast('Erro: informe o nome do funcionário')
    setSaving(true)
    try {
      const saved = await api(`/api/accounting/employees${empDraft.id ? `/${empDraft.id}` : ''}`, { method:empDraft.id?'PUT':'POST', body:JSON.stringify(empDraft) })
      setEmpDraft(null); showToast(empDraft.id ? 'Funcionário atualizado' : 'Funcionário registrado'); await load()
      if (saved.employee) await openEmployee(saved.employee)
    } catch(e:any) { showToast(`Erro: ${e.message}`) } finally { setSaving(false) }
  }
  async function saveCategory() {
    if (!categoryDraft?.name.trim()) return showToast('Erro: informe o nome da categoria')
    setSaving(true)
    try {
      await api('/api/accounting/categories',{method:'POST',body:JSON.stringify(categoryDraft)})
      setCategoryDraft(null); showToast('Categoria adicionada'); await load()
    } catch(e:any) { showToast(`Erro: ${e.message}`) } finally { setSaving(false) }
  }
  async function toggleCategory(category:Category) {
    try {
      await api(`/api/accounting/categories/${category.id}`,{method:'PATCH',body:JSON.stringify({is_active:!category.is_active})})
      showToast(category.is_active?'Categoria arquivada':'Categoria ativada'); await load()
    } catch(e:any) { showToast(`Erro: ${e.message}`) }
  }
  async function syncOrders() {
    setSyncing(true)
    try {
      const result = await api('/api/accounting/integrations/orders/sync',{method:'POST'})
      showToast(result.available === false ? 'Pedidos ainda não disponíveis' : `${result.imported} nova(s) venda(s) integrada(s)`)
      await load()
    } catch(e:any) { showToast(`Erro: ${e.message}`) } finally { setSyncing(false) }
  }
  async function payRecurring(row:RecurringRow) {
    const ok=await confirm({title:'Confirmar pagamento?',message:`Registrar ${money(row.amount)} como saída realizada de ${row.description} na competência atual?`,confirmLabel:'Registrar pagamento'})
    if(!ok)return
    try{
      await api(`/api/accounting/recurring-expenses/${row.id}/pay`,{method:'POST',body:JSON.stringify({competence:today.slice(0,7),paid_on:today})})
      showToast('Pagamento registrado no caixa'); await load()
    }catch(e:any){showToast(`Erro: ${e.message}`)}
  }
  async function remove(kind:'transactions'|'employees', row:Tx|Employee) {
    const isEmployee = kind === 'employees'
    const ok = await confirm({
      title:isEmployee?'Arquivar funcionário?':'Excluir lançamento?',
      message:isEmployee?'O vínculo ficará inativo, a despesa fixa será desativada e todo o histórico permanecerá disponível.':'Esse lançamento será removido do histórico financeiro.',
      confirmLabel:isEmployee?'Arquivar':'Excluir', variant:'danger'
    })
    if (!ok) return
    try {
      await api(`/api/accounting/${kind}/${row.id}`,{method:'DELETE'})
      showToast(isEmployee?'Funcionário arquivado':'Registro excluído')
      if (isEmployee) setSelectedEmployee(null)
      await load()
    }
    catch(e:any) { showToast(`Erro: ${e.message}`) }
  }
  async function exportSheet() {
    try {
      const response = await fetch(`/api/accounting/export.xlsx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{headers:getHeaders()})
      if (!response.ok) throw new Error('Não foi possível gerar a planilha')
      const blob = await response.blob(), url = URL.createObjectURL(blob), a = document.createElement('a')
      a.href=url; a.download=`contabilidade-${from}-${to}.xlsx`; a.click(); URL.revokeObjectURL(url)
      showToast('Planilha gerada')
    } catch(e:any) { showToast(`Erro: ${e.message}`) }
  }

  const maxChart = Math.max(1,...(summary?.monthly || []).flatMap(m => [Number(m.income),Number(m.expense)]))
  const allTabs:[Tab,string,typeof Landmark][] = [['overview','Visão geral',Landmark],['obligations','Despesas',CalendarDays],['transactions','Caixa',ReceiptText],['categories','Categorias',Tags],['employees','Funcionários',UsersRound],['reports','Relatórios',FileSpreadsheet]]
  const tabs = focus === 'finance'
    ? allTabs.filter(([key]) => key !== 'employees')
    : focus === 'hr'
      ? allTabs.filter(([key]) => key === 'employees')
      : allTabs
  return (
    <div className={`min-h-full ${embedded ? 'bg-transparent' : 'bg-[#f7f7f7]'}`}>
      <div className={`max-w-[1440px] mx-auto ${embedded?'p-3 sm:p-5 lg:p-6':'px-4 py-5 sm:px-6 sm:py-7'}`}>
        {!embedded&&<header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-5">
          <div><div className="flex items-center gap-2 text-[11px] font-semibold text-gray-500 mb-1"><Landmark size={14}/> APP ADMINISTRATIVO</div>
            <h1 className="text-[24px] font-bold tracking-[-0.03em] text-gray-950">{focus === 'hr' ? 'Pessoas e RH' : 'Financeiro'}</h1>
            <p className="text-[13px] text-gray-500 mt-1">{focus === 'hr' ? 'Cadastro, vínculos e estrutura da equipe.' : 'Fluxo de caixa, lançamentos e relatórios financeiros.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {focus !== 'hr' && <div className="flex items-center gap-2 h-11 px-3 rounded-[16px] border border-gray-200 bg-white"><CalendarDays size={15} className="text-gray-500"/><input aria-label="Data inicial" type="date" value={from} onChange={e=>setFrom(e.target.value)} className="text-[12px] outline-none bg-transparent"/><span className="text-gray-300">—</span><input aria-label="Data final" type="date" value={to} onChange={e=>setTo(e.target.value)} className="text-[12px] outline-none bg-transparent"/></div>}
            {focus !== 'hr' && <button onClick={syncOrders} disabled={syncing} className="h-11 px-4 rounded-[16px] border border-gray-200 bg-white text-[12px] font-semibold flex items-center gap-2 hover:bg-gray-50 disabled:opacity-60"><RefreshCw size={15} className={syncing?'animate-spin':''}/> Integrar pedidos</button>}
            {focus !== 'hr' && <button onClick={exportSheet} className="h-11 px-4 rounded-[16px] border border-gray-200 bg-white text-[12px] font-semibold flex items-center gap-2 hover:bg-gray-50"><Download size={15}/> Gerar planilha</button>}
            {(tab==='employees'||tab==='categories'||tab==='transactions')&&<button onClick={()=>tab==='employees'?setEmpDraft({...empEmpty}):tab==='categories'?setCategoryDraft({name:'',kind:'expense'}):setTxDraft({...txEmpty,category_id:categories.find(c=>c.kind==='income'&&c.is_active)?.id})} className="h-11 px-4 rounded-[16px] bg-gray-950 text-white text-[12px] font-semibold flex items-center gap-2 hover:bg-gray-800"><Plus size={16}/> {tab==='employees'?'Novo funcionário':tab==='categories'?'Nova categoria':'Novo lançamento'}</button>}
          </div>
        </header>}

        {tabs.length>1&&<nav className="flex gap-1 overflow-x-auto p-1 bg-white border border-gray-200 rounded-[18px] mb-5" aria-label="Áreas da contabilidade">
          {tabs.map(([key,text,Icon])=><button key={key} onClick={()=>{setTab(key);setSearch('')}} className={`min-h-11 whitespace-nowrap px-3.5 rounded-[14px] text-[12px] font-semibold flex items-center gap-2 ${tab===key?'bg-gray-950 text-white':'text-gray-600 hover:bg-gray-100'}`}><Icon size={15}/>{text}</button>)}
        </nav>}
        {embedded&&<div className="flex items-center justify-between gap-2 mb-4">
          <p className="text-[11px] text-gray-500">{tab==='employees'?`${employees.length} pessoas`:tab==='transactions'?`${transactions.length} lançamentos`:'Dados atualizados da organização'}</p>
          <div className="flex gap-2">
            {focus==='finance'&&<button onClick={exportSheet} aria-label="Gerar planilha" className="size-11 rounded-[14px] bg-white border border-gray-200 grid place-items-center"><Download size={15}/></button>}
            {(tab==='employees'||tab==='transactions'||tab==='categories')&&<button onClick={()=>tab==='employees'?setEmpDraft({...empEmpty}):tab==='categories'?setCategoryDraft({name:'',kind:'expense'}):setTxDraft({...txEmpty,category_id:categories.find(c=>c.kind==='income'&&c.is_active)?.id})} className="h-11 px-3.5 rounded-[14px] bg-gray-950 text-white text-[12px] font-semibold flex items-center gap-2"><Plus size={15}/>{tab==='employees'?'Adicionar':tab==='categories'?'Categoria':'Lançamento'}</button>}
          </div>
        </div>}
        {embedded&&focus==='finance'&&<div className="grid grid-cols-2 gap-2 mb-4">
          <label className="bg-white border border-gray-200 rounded-[14px] px-3 py-2"><span className="block text-[9px] font-semibold text-gray-400 mb-0.5">DE</span><input aria-label="Data inicial" type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-full text-[11px] font-semibold outline-none bg-transparent"/></label>
          <label className="bg-white border border-gray-200 rounded-[14px] px-3 py-2"><span className="block text-[9px] font-semibold text-gray-400 mb-0.5">ATÉ</span><input aria-label="Data final" type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-full text-[11px] font-semibold outline-none bg-transparent"/></label>
        </div>}

        {loading ? <div className="h-64 grid place-items-center text-gray-400"><Loader2 className="animate-spin"/></div> : <>
          {tab==='overview' && <div className="space-y-4">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <Metric title="Entradas" value={money(summary?.income || 0)} icon={ArrowUpRight} tone="green"/>
              <Metric title="Saídas" value={money(summary?.expense || 0)} icon={ArrowDownRight} tone="red"/>
              <Metric title="Saldo do período" value={money(summary?.balance || 0)} icon={Banknote} tone={(summary?.balance || 0)>=0?'dark':'red'}/>
              <Metric title="Valores pendentes" value={money(summary?.pending || 0)} icon={ReceiptText} tone="amber"/>
            </div>
            <div className={`grid gap-4 ${focus === 'finance' ? '' : 'lg:grid-cols-[1.5fr_1fr]'}`}>
              <section className="bg-white border border-gray-200 rounded-[20px] p-5"><h2 className="text-[14px] font-bold text-gray-900">Movimento mensal</h2><p className="text-[11px] text-gray-500 mt-0.5">Entradas e saídas no período selecionado</p>
                {(summary?.monthly || []).length===0?<Empty text="Registre o primeiro lançamento para visualizar o fluxo."/>:<div className="h-52 flex items-end gap-4 mt-5">{summary!.monthly.map(m=><div key={m.month} className="flex-1 min-w-10 h-full flex flex-col justify-end"><div className="flex items-end justify-center gap-1 h-[85%]"><div title={`Entradas ${money(m.income)}`} className="w-3 sm:w-5 rounded-t-md bg-emerald-500" style={{height:`${Math.max(4,Number(m.income)/maxChart*100)}%`}}/><div title={`Saídas ${money(m.expense)}`} className="w-3 sm:w-5 rounded-t-md bg-rose-400" style={{height:`${Math.max(4,Number(m.expense)/maxChart*100)}%`}}/></div><span className="mt-2 text-center text-[10px] text-gray-500">{m.month.slice(5)}/{m.month.slice(2,4)}</span></div>)}</div>}
              </section>
              {focus !== 'finance' && <section className="bg-white border border-gray-200 rounded-[20px] p-5"><h2 className="text-[14px] font-bold text-gray-900">Estrutura de pessoal</h2><p className="text-[11px] text-gray-500 mt-0.5">Compromissos mensais da equipe</p>
                <div className="mt-5 space-y-3"><InfoLine label="Funcionários ativos" value={String(summary?.employees.active || 0)}/><InfoLine label="Cadastros totais" value={String(summary?.employees.total || 0)}/><InfoLine label="Folha salarial base" value={money(summary?.employees.payroll || 0)} strong/></div>
                <button onClick={()=>setTab('employees')} className="w-full h-11 mt-5 rounded-[16px] bg-gray-100 text-[12px] font-semibold hover:bg-gray-200">Gerenciar funcionários</button>
              </section>}
            </div>
          </div>}

          {tab==='employees' && selectedEmployee && <EmployeeDetail
            employee={selectedEmployee}
            expense={employeeExpense}
            history={employeeHistory}
            loading={employeeDetailLoading}
            back={()=>setSelectedEmployee(null)}
            edit={()=>setEmpDraft(selectedEmployee)}
            archive={()=>remove('employees',selectedEmployee)}
          />}

          {tab==='obligations'&&<section className="bg-white border border-gray-200 rounded-[20px] overflow-hidden">
            <div className="p-4 border-b border-gray-100"><h2 className="text-[14px] font-bold">Despesas recorrentes</h2><p className="text-[11px] text-gray-500 mt-1">Compromissos previstos. Eles só afetam o saldo quando o pagamento é confirmado.</p></div>
            {recurring.length?<div className="divide-y divide-gray-100">{recurring.map(row=><div key={row.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3"><div className="size-10 rounded-full bg-gray-100 grid place-items-center shrink-0"><UserRound size={17}/></div><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><p className="text-[13px] font-semibold truncate">{row.employee_name||row.description}</p><span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${row.is_active?'bg-emerald-50 text-emerald-700':'bg-gray-100 text-gray-500'}`}>{row.is_active?'ATIVA':'INATIVA'}</span></div><p className="text-[11px] text-gray-500 mt-0.5">{row.employee_role||row.category} · Mensal</p></div><div className="flex items-center justify-between sm:justify-end gap-4"><p className="text-[15px] font-bold tabular-nums">{money(row.amount)}</p>{row.is_active&&<button onClick={()=>payRecurring(row)} className="h-11 px-4 rounded-[15px] bg-gray-950 text-white text-[11px] font-semibold">Registrar pagamento</button>}</div></div>)}</div>:<Empty text="Nenhuma despesa recorrente. Cadastre e ative um funcionário com salário para gerar a obrigação automaticamente."/>}
          </section>}
          {(tab==='transactions'||(tab==='employees'&&!selectedEmployee)) && <section className="bg-white border border-gray-200 rounded-[20px] overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-gray-100 flex items-center justify-between gap-3">{!embedded&&<div><h2 className="text-[14px] font-bold">{tab==='transactions'?'Lançamentos do período':'Cadastro de funcionários'}</h2><p className="text-[11px] text-gray-500">{tab==='transactions'?`${transactions.length} registros financeiros`:`${employees.length} pessoas registradas`}</p></div>}<div className={`relative ${embedded?'w-full':'sm:w-64'}`}><Search size={15} className="absolute left-3 top-3 text-gray-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={tab==='employees'?'Buscar funcionário':'Buscar...'} className={`${input} w-full pl-9`}/></div></div>
            <div className="overflow-x-auto">{tab==='transactions'?<TransactionRows rows={filteredTx} edit={row=>setTxDraft({...row,category_id:row.category_id||categories.find(c=>c.kind===row.kind&&c.name===row.category)?.id})} remove={r=>remove('transactions',r)}/>:<EmployeeRows rows={filteredEmployees} open={openEmployee} edit={setEmpDraft} remove={r=>remove('employees',r)}/>}</div>
          </section>}
          {tab==='categories' && <section className="bg-white border border-gray-200 rounded-[20px] overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3"><div><h2 className="text-[14px] font-bold">Plano de categorias</h2><p className="text-[11px] text-gray-500">Categorias padrão e personalizadas da organização.</p></div><button onClick={()=>setCategoryDraft({name:'',kind:'expense'})} className="h-10 px-3 rounded-[14px] bg-gray-950 text-white text-[12px] font-semibold flex items-center gap-2"><Plus size={15}/> Adicionar</button></div>
            <div className="grid sm:grid-cols-2 gap-3 p-4">{(['income','expense'] as const).map(kind=><div key={kind} className="rounded-[16px] border border-gray-100 p-3"><h3 className="text-[12px] font-bold mb-2">{kind==='income'?'Entradas':'Saídas'}</h3><div className="space-y-1">{categories.filter(c=>c.kind===kind).map(c=><div key={c.id} className="min-h-10 flex items-center justify-between gap-2 rounded-xl px-3 bg-gray-50"><div><span className={`text-[12px] font-medium ${c.is_active?'text-gray-800':'text-gray-400 line-through'}`}>{c.name}</span>{c.is_system&&<span className="ml-2 text-[9px] uppercase font-bold text-gray-400">Padrão</span>}</div><button onClick={()=>toggleCategory(c)} className="text-[10px] font-semibold text-gray-500 hover:text-gray-900">{c.is_active?'Arquivar':'Ativar'}</button></div>)}</div></div>)}</div>
          </section>}

          {tab==='reports' && <div className="grid md:grid-cols-2 gap-4"><section className="bg-white border border-gray-200 rounded-[20px] p-6"><FileSpreadsheet size={28} className="text-emerald-600 mb-4"/><h2 className="text-[16px] font-bold">Livro contábil em Excel</h2><p className="text-[12px] text-gray-500 mt-2 leading-5">Gere um arquivo .xlsx com três abas: resumo financeiro, lançamentos detalhados e quadro de funcionários. O período respeita o filtro no topo.</p><button onClick={exportSheet} className="h-11 px-4 mt-5 rounded-[16px] bg-gray-950 text-white text-[12px] font-semibold flex items-center gap-2"><Download size={15}/> Baixar planilha completa</button></section>
            <section className="bg-white border border-gray-200 rounded-[20px] p-6"><ReceiptText size={28} className="text-gray-700 mb-4"/><h2 className="text-[16px] font-bold">Resumo do período</h2><div className="mt-4 space-y-3"><InfoLine label="Movimentações" value={String(summary?.transaction_count || 0)}/><InfoLine label="Resultado" value={money(summary?.balance || 0)} strong/><InfoLine label="Folha base" value={money(summary?.employees.payroll || 0)}/></div></section></div>}
        </>}
      </div>
      {txDraft&&<TxModal draft={txDraft} setDraft={setTxDraft} save={saveTx} saving={saving} categories={categories} addCategory={()=>setCategoryDraft({name:'',kind:txDraft.kind||'expense'})}/>}
      {empDraft&&<EmployeeAdmissionModal draft={empDraft} setDraft={setEmpDraft} save={saveEmployee} saving={saving} notify={showToast}/>}
      {categoryDraft&&<Modal title="Nova categoria" close={()=>setCategoryDraft(null)} save={saveCategory} saving={saving}><div className="grid gap-4"><Field name="Tipo"><select className={input} value={categoryDraft.kind} onChange={e=>setCategoryDraft({...categoryDraft,kind:e.target.value as any})}><option value="income">Entrada</option><option value="expense">Saída</option></select></Field><Field name="Nome da categoria *"><input autoFocus className={input} value={categoryDraft.name} onChange={e=>setCategoryDraft({...categoryDraft,name:e.target.value})} placeholder="Ex.: Consultorias"/></Field></div></Modal>}
    </div>
  )
}

function Metric({title,value,icon:Icon,tone}:{title:string;value:string;icon:any;tone:string}) { const cls:any={green:'bg-emerald-50 text-emerald-700',red:'bg-rose-50 text-rose-700',amber:'bg-amber-50 text-amber-700',dark:'bg-gray-950 text-white'}; return <div className="bg-white border border-gray-200 rounded-[20px] p-4 sm:p-5"><div className={`size-9 rounded-xl grid place-items-center ${cls[tone]}`}><Icon size={17}/></div><p className="text-[11px] text-gray-500 mt-4">{title}</p><p className="text-[18px] sm:text-[21px] font-bold tabular-nums tracking-tight mt-0.5">{value}</p></div> }
function InfoLine({label,value,strong=false}:{label:string;value:string;strong?:boolean}) { return <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"><span className="text-[12px] text-gray-500">{label}</span><span className={`${strong?'font-bold text-gray-950':'font-semibold text-gray-700'} text-[13px] tabular-nums`}>{value}</span></div> }
function Empty({text}:{text:string}) { return <div className="h-44 grid place-items-center text-center text-[12px] text-gray-400 px-6">{text}</div> }
function Transactions({rows,edit,remove}:{rows:Tx[];edit:(v:Tx)=>void;remove:(v:Tx)=>void}) { if(!rows.length)return <Empty text="Nenhum lançamento encontrado neste período."/>; return <table className="w-full min-w-[760px]"><thead><tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">{['Data','Descrição','Categoria','Status','Valor','Ações'].map(x=><th key={x} className="text-left px-4 py-3">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-gray-100 text-[12px]"><td className="px-4 py-3 text-gray-500">{dateText(r.occurred_on)}</td><td className="px-4 py-3"><p className="font-semibold">{r.description}</p><p className="text-[10px] text-gray-400">{r.document_number||r.payment_method||'Sem documento'}</p></td><td className="px-4 py-3 text-gray-600">{r.category}</td><td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${r.status==='paid'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{r.status==='paid'?'Realizado':'Pendente'}</span></td><td className={`px-4 py-3 font-bold tabular-nums ${r.kind==='income'?'text-emerald-700':'text-rose-700'}`}>{r.kind==='income'?'+':'−'} {money(r.amount)}</td><td className="px-4 py-3"><button aria-label="Editar" onClick={()=>edit(r)} className="p-2"><Pencil size={14}/></button><button aria-label="Excluir" onClick={()=>remove(r)} className="p-2 text-rose-600"><Trash2 size={14}/></button></td></tr>)}</tbody></table> }
function Employees({rows,edit,remove}:{rows:Employee[];edit:(v:Employee)=>void;remove:(v:Employee)=>void}) { if(!rows.length)return <Empty text="Nenhum funcionário cadastrado."/>; return <table className="w-full min-w-[760px]"><thead><tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">{['Funcionário','Cargo e setor','Vínculo','Admissão','Salário base','Ações'].map(x=><th key={x} className="text-left px-4 py-3">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-gray-100 text-[12px]"><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="size-9 rounded-full bg-gray-100 grid place-items-center"><UserRound size={16}/></div><div><p className="font-semibold">{r.name}</p><p className="text-[10px] text-gray-400">{r.email||r.phone||'Sem contato'}</p></div></div></td><td className="px-4 py-3"><p>{r.role_title||'Não informado'}</p><p className="text-[10px] text-gray-400">{r.department||'Sem departamento'}</p></td><td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${r.status==='active'?'bg-emerald-50 text-emerald-700':'bg-gray-100 text-gray-600'}`}>{r.employment_type.toUpperCase()} · {r.status==='active'?'Ativo':'Inativo'}</span></td><td className="px-4 py-3 text-gray-500">{dateText(r.admission_date)}</td><td className="px-4 py-3 font-semibold tabular-nums">{money(r.salary||0)}</td><td className="px-4 py-3"><button aria-label="Editar" onClick={()=>edit(r)} className="p-2"><Pencil size={14}/></button><button aria-label="Excluir" onClick={()=>remove(r)} className="p-2 text-rose-600"><Trash2 size={14}/></button></td></tr>)}</tbody></table> }

function Modal({title,close,children,save,saving}:{title:string;close:()=>void;children:any;save:()=>void;saving:boolean}) { return <div className="fixed inset-0 z-[100] bg-black/35 backdrop-blur-[2px] flex sm:items-center justify-center sm:p-4" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="bg-white w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col sm:rounded-[24px] shadow-2xl"><div className="shrink-0 border-b border-gray-100 px-4 h-14 flex justify-between items-center"><h2 className="text-[16px] font-bold">{title}</h2><button onClick={close} aria-label="Fechar" className="size-11 rounded-full hover:bg-gray-100 grid place-items-center"><X size={18}/></button></div><div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div><div className="shrink-0 grid grid-cols-[.8fr_1.2fr] gap-2 p-3 sm:p-4 border-t border-gray-100 bg-white pb-[calc(.75rem+env(safe-area-inset-bottom))]"><button onClick={close} className="h-12 rounded-[15px] bg-gray-100 text-[12px] font-semibold">Cancelar</button><button onClick={save} disabled={saving} className="h-12 rounded-[15px] bg-gray-950 text-white text-[12px] font-semibold disabled:opacity-50">{saving?'Salvando…':'Salvar'}</button></div></div></div> }
function Field({name,children}:{name:string;children:any}) { return <label><span className={label}>{name}</span>{children}</label> }
function TxModal({draft,setDraft,save,saving,categories,addCategory}:{draft:Partial<Tx>;setDraft:(v:Partial<Tx>|null)=>void;save:()=>void;saving:boolean;categories:Category[];addCategory:()=>void}) { const set=(k:keyof Tx,v:any)=>setDraft({...draft,[k]:v}); const available=categories.filter(c=>c.kind===draft.kind&&c.is_active); return <Modal title={draft.id?'Editar lançamento':'Novo lançamento'} close={()=>setDraft(null)} save={save} saving={saving}><div className="grid sm:grid-cols-2 gap-4"><Field name="Tipo"><select className={input} value={draft.kind} onChange={e=>{const kind=e.target.value as Tx['kind'];setDraft({...draft,kind,category_id:categories.find(c=>c.kind===kind&&c.is_active)?.id})}}><option value="income">Entrada</option><option value="expense">Saída</option></select></Field><Field name="Status"><select className={input} value={draft.status} onChange={e=>set('status',e.target.value)}><option value="paid">Realizado</option><option value="pending">Pendente</option></select></Field><div className="sm:col-span-2"><Field name="Descrição *"><input className={input} value={draft.description||''} onChange={e=>set('description',e.target.value)} placeholder="Ex.: Venda do pedido 1420"/></Field></div><div><Field name="Categoria *"><select className={input} value={draft.category_id||''} onChange={e=>set('category_id',e.target.value)}><option value="">Selecione...</option>{available.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><button type="button" onClick={addCategory} className="mt-1.5 text-[11px] font-semibold text-gray-600 hover:text-gray-950">+ Criar categoria personalizada</button></div><Field name="Valor *"><input className={input} type="number" min="0" step="0.01" value={draft.amount||''} onChange={e=>set('amount',Number(e.target.value))}/></Field><Field name="Data *"><input className={input} type="date" value={draft.occurred_on||''} onChange={e=>set('occurred_on',e.target.value)}/></Field><Field name="Forma de pagamento"><input className={input} value={draft.payment_method||''} onChange={e=>set('payment_method',e.target.value)} placeholder="Pix, cartão, boleto..."/></Field><Field name="Documento"><input className={input} value={draft.document_number||''} onChange={e=>set('document_number',e.target.value)} placeholder="NF, recibo ou referência"/></Field><Field name="Observações"><input className={input} value={draft.notes||''} onChange={e=>set('notes',e.target.value)}/></Field></div></Modal> }
function EmployeeModal({draft,setDraft,save,saving}:{draft:Partial<Employee>;setDraft:(v:Partial<Employee>|null)=>void;save:()=>void;saving:boolean}) {
  const profile=draft.profile_data||{}
  const set=(k:keyof Employee,v:any)=>setDraft({...draft,[k]:v})
  const setProfile=(k:keyof EmployeeProfile,v:any)=>setDraft({...draft,profile_data:{...profile,[k]:v}})
  const photo=(file?:File)=>{
    if(!file)return
    if(file.size>2*1024*1024){alert('A foto deve ter no máximo 2 MB.');return}
    const reader=new FileReader()
    reader.onload=()=>set('photo_url',String(reader.result||''))
    reader.readAsDataURL(file)
  }
  const section='sm:col-span-2 pt-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-t border-gray-100'
  return <Modal title={draft.id?'Ficha do funcionário':'Admitir funcionário'} close={()=>setDraft(null)} save={save} saving={saving}>
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2 flex items-center gap-4">
        <div className="size-20 rounded-[20px] bg-gray-100 overflow-hidden grid place-items-center shrink-0">{draft.photo_url?<img src={draft.photo_url} alt="" className="size-full object-cover"/>:<UserRound size={28} className="text-gray-400"/>}</div>
        <Field name="Foto profissional (JPG/PNG, até 2 MB)"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>photo(e.target.files?.[0])} className="block text-[11px]"/></Field>
      </div>
      <p className={section}>Dados pessoais</p>
      <Field name="Nome completo *"><input className={input} value={draft.name||''} onChange={e=>set('name',e.target.value)}/></Field>
      <Field name="Nome social / preferido"><input className={input} value={profile.preferred_name||''} onChange={e=>setProfile('preferred_name',e.target.value)}/></Field>
      <Field name="CPF *"><input className={input} value={draft.document_number||''} onChange={e=>set('document_number',e.target.value)}/></Field>
      <Field name="Data de nascimento"><input className={input} type="date" value={profile.birth_date||''} onChange={e=>setProfile('birth_date',e.target.value)}/></Field>
      <Field name="Nacionalidade"><input className={input} value={profile.nationality||''} onChange={e=>setProfile('nationality',e.target.value)}/></Field>
      <Field name="Estado civil"><input className={input} value={profile.marital_status||''} onChange={e=>setProfile('marital_status',e.target.value)}/></Field>
      <Field name="Escolaridade"><input className={input} value={profile.education||''} onChange={e=>setProfile('education',e.target.value)}/></Field>
      <Field name="Telefone"><input className={input} value={draft.phone||''} onChange={e=>set('phone',e.target.value)}/></Field>
      <Field name="E-mail"><input className={input} type="email" value={draft.email||''} onChange={e=>set('email',e.target.value)}/></Field>
      <p className={section}>Endereço e emergência</p>
      <Field name="CEP"><input className={input} value={profile.postal_code||''} onChange={e=>setProfile('postal_code',e.target.value)}/></Field>
      <Field name="Endereço"><input className={input} value={profile.address||''} onChange={e=>setProfile('address',e.target.value)}/></Field>
      <Field name="Número / complemento"><input className={input} value={profile.address_number||''} onChange={e=>setProfile('address_number',e.target.value)}/></Field>
      <Field name="Cidade"><input className={input} value={profile.city||''} onChange={e=>setProfile('city',e.target.value)}/></Field>
      <Field name="UF"><input className={input} maxLength={2} value={profile.state||''} onChange={e=>setProfile('state',e.target.value.toUpperCase())}/></Field>
      <Field name="Contato de emergência"><input className={input} value={profile.emergency_name||''} onChange={e=>setProfile('emergency_name',e.target.value)}/></Field>
      <Field name="Telefone de emergência"><input className={input} value={profile.emergency_phone||''} onChange={e=>setProfile('emergency_phone',e.target.value)}/></Field>
      <p className={section}>Vínculo e eSocial</p>
      <Field name="Matrícula"><input className={input} value={profile.employee_number||''} onChange={e=>setProfile('employee_number',e.target.value)}/></Field>
      <Field name="Categoria eSocial"><input className={input} placeholder="Ex.: 101" value={profile.esocial_category||''} onChange={e=>setProfile('esocial_category',e.target.value)}/></Field>
      <Field name="Cargo"><input className={input} value={draft.role_title||''} onChange={e=>set('role_title',e.target.value)}/></Field>
      <Field name="Departamento"><input className={input} value={draft.department||''} onChange={e=>set('department',e.target.value)}/></Field>
      <Field name="Gestor responsável"><input className={input} value={profile.manager_name||''} onChange={e=>setProfile('manager_name',e.target.value)}/></Field>
      <Field name="Centro de custo"><input className={input} value={profile.cost_center||''} onChange={e=>setProfile('cost_center',e.target.value)}/></Field>
      <Field name="Vínculo"><select className={input} value={draft.employment_type} onChange={e=>set('employment_type',e.target.value)}><option value="clt">CLT</option><option value="pj">PJ</option><option value="intern">Estágio</option><option value="temporary">Temporário</option></select></Field>
      <Field name="Data de admissão"><input className={input} type="date" value={draft.admission_date||''} onChange={e=>set('admission_date',e.target.value)}/></Field>
      <Field name="Jornada semanal"><input className={input} type="number" min="0" max="60" value={profile.weekly_hours||''} onChange={e=>setProfile('weekly_hours',Number(e.target.value))}/></Field>
      <Field name="Horário / escala"><input className={input} placeholder="Ex.: seg–sex, 08h–17h" value={profile.work_schedule||''} onChange={e=>setProfile('work_schedule',e.target.value)}/></Field>
      <p className={section}>Remuneração e pagamento</p>
      <Field name="Salário base"><input className={input} type="number" min="0" step="0.01" value={draft.salary||''} onChange={e=>set('salary',Number(e.target.value))}/></Field>
      <Field name="Periodicidade"><select className={input} value={profile.salary_frequency||'monthly'} onChange={e=>setProfile('salary_frequency',e.target.value)}><option value="monthly">Mensal</option><option value="weekly">Semanal</option><option value="daily">Diária</option><option value="hourly">Por hora</option></select></Field>
      <Field name="Banco"><input className={input} value={profile.bank_name||''} onChange={e=>setProfile('bank_name',e.target.value)}/></Field>
      <Field name="Agência"><input className={input} value={profile.bank_agency||''} onChange={e=>setProfile('bank_agency',e.target.value)}/></Field>
      <Field name="Conta"><input className={input} value={profile.bank_account||''} onChange={e=>setProfile('bank_account',e.target.value)}/></Field>
      <Field name="Chave Pix"><input className={input} value={profile.pix_key||''} onChange={e=>setProfile('pix_key',e.target.value)}/></Field>
      <Field name="Status"><select className={input} value={draft.status} onChange={e=>set('status',e.target.value)}><option value="active">Ativo</option><option value="vacation">Férias / afastado</option><option value="inactive">Inativo</option></select></Field>
      <div className="sm:col-span-2"><Field name="Observações"><textarea className={`${input} min-h-24 py-3`} value={draft.notes||''} onChange={e=>set('notes',e.target.value)}/></Field></div>
      <p className="sm:col-span-2 text-[11px] text-gray-500 bg-gray-50 rounded-[16px] p-3">Ao ativar um funcionário com salário, o sistema mantém uma despesa fixa mensal vinculada à folha. Dados bancários e documentos exigem permissão sensível.</p>
    </div>
  </Modal>
}
