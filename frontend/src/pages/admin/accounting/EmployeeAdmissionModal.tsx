import { useRef, useState } from 'react'
import { BriefcaseBusiness, Camera, ChevronLeft, ChevronRight, FileText, UserRound, WalletCards, X } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'

type Profile = Record<string, any>
type Employee = { id?:string;name?:string;email?:string;phone?:string;document_number?:string;role_title?:string;department?:string;employment_type?:string;admission_date?:string;salary?:number;status?:'active'|'inactive'|'vacation';notes?:string;photo_url?:string;profile_data?:Profile }
const input='w-full h-11 px-3.5 rounded-[16px] border border-gray-200 bg-white text-[13px] outline-none focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5'
const tabs=[
  {id:'personal',label:'Pessoais',icon:UserRound},
  {id:'professional',label:'Profissional',icon:BriefcaseBusiness},
  {id:'financial',label:'Financeiro',icon:WalletCards},
  {id:'documents',label:'Documentos',icon:FileText},
] as const
type Tab=typeof tabs[number]['id']
function Field({label,children,wide=false}:{label:string;children:any;wide?:boolean}){return <label className={wide?'sm:col-span-2':''}><span className="block mb-1.5 text-[11px] font-semibold text-gray-600">{label}</span>{children}</label>}

export function EmployeeAdmissionModal({draft,setDraft,save,saving,notify}:{draft:Employee;setDraft:(v:Employee|null)=>void;save:()=>void;saving:boolean;notify:(message:string)=>void}) {
  const [tab,setTab]=useState<Tab>('personal')
  const [uploading,setUploading]=useState(false)
  const fileRef=useRef<HTMLInputElement>(null)
  const profile=draft.profile_data||{}
  const set=(key:keyof Employee,value:any)=>setDraft({...draft,[key]:value})
  const setProfile=(key:string,value:any)=>setDraft({...draft,profile_data:{...profile,[key]:value}})
  const index=tabs.findIndex(item=>item.id===tab)
  async function upload(file?:File){
    if(!file)return
    setUploading(true)
    try{
      const form=new FormData(); form.append('photo',file)
      const response=await fetch('/api/accounting/employees/photo',{method:'POST',headers:getHeaders(),body:form})
      const data=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(data.error||'Falha ao enviar foto')
      set('photo_url',data.photo_url); notify('Foto enviada')
    }catch(error:any){notify(`Erro: ${error.message}`)}finally{setUploading(false)}
  }
  return <div className="fixed inset-0 z-[100] bg-black/35 sm:p-4 flex sm:items-center justify-center">
    <div className="bg-white w-full sm:max-w-3xl h-full sm:h-auto sm:max-h-[94vh] flex flex-col sm:rounded-[24px] shadow-2xl">
      <header className="h-14 px-4 border-b border-gray-100 flex items-center justify-between shrink-0"><div><h2 className="text-[15px] font-bold">{draft.id?'Editar funcionário':'Admitir funcionário'}</h2><p className="text-[10px] text-gray-400">Etapa {index+1} de {tabs.length}</p></div><button onClick={()=>setDraft(null)} className="size-11 grid place-items-center rounded-full hover:bg-gray-100" aria-label="Fechar"><X size={18}/></button></header>
      <nav className="shrink-0 overflow-x-auto border-b border-gray-100"><div className="min-w-max px-3 flex">{tabs.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>setTab(item.id)} className={`h-14 px-3 flex items-center gap-2 border-b-2 text-[11px] font-semibold ${tab===item.id?'border-gray-950 text-gray-950':'border-transparent text-gray-400'}`}><Icon size={15}/>{item.label}</button>})}</div></nav>
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        {tab==='personal'&&<div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 flex items-center gap-4"><div className="size-24 rounded-[22px] bg-gray-100 overflow-hidden grid place-items-center">{draft.photo_url?<img src={draft.photo_url} className="size-full object-cover" alt="Foto do funcionário"/>:<UserRound size={32} className="text-gray-400"/>}</div><div><input ref={fileRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>upload(event.target.files?.[0])}/><button disabled={uploading} onClick={()=>fileRef.current?.click()} className="h-11 px-4 rounded-[15px] border border-gray-200 text-[12px] font-semibold flex items-center gap-2"><Camera size={15}/>{uploading?'Enviando…':draft.photo_url?'Trocar foto':'Enviar foto'}</button><p className="text-[10px] text-gray-400 mt-2">JPG, PNG ou WebP · até 5 MB</p></div></div>
          <Field label="Nome completo *"><input className={input} value={draft.name||''} onChange={e=>set('name',e.target.value)}/></Field><Field label="Nome social / preferido"><input className={input} value={profile.preferred_name||''} onChange={e=>setProfile('preferred_name',e.target.value)}/></Field>
          <Field label="CPF *"><input className={input} inputMode="numeric" value={draft.document_number||''} onChange={e=>set('document_number',e.target.value)}/></Field><Field label="Nascimento"><input className={input} type="date" value={profile.birth_date||''} onChange={e=>setProfile('birth_date',e.target.value)}/></Field>
          <Field label="Telefone"><input className={input} value={draft.phone||''} onChange={e=>set('phone',e.target.value)}/></Field><Field label="E-mail"><input className={input} type="email" value={draft.email||''} onChange={e=>set('email',e.target.value)}/></Field>
          <Field label="CEP"><input className={input} value={profile.postal_code||''} onChange={e=>setProfile('postal_code',e.target.value)}/></Field><Field label="Endereço"><input className={input} value={profile.address||''} onChange={e=>setProfile('address',e.target.value)}/></Field>
          <Field label="Cidade"><input className={input} value={profile.city||''} onChange={e=>setProfile('city',e.target.value)}/></Field><Field label="UF"><input className={input} maxLength={2} value={profile.state||''} onChange={e=>setProfile('state',e.target.value.toUpperCase())}/></Field>
          <Field label="Contato de emergência"><input className={input} value={profile.emergency_name||''} onChange={e=>setProfile('emergency_name',e.target.value)}/></Field><Field label="Telefone de emergência"><input className={input} value={profile.emergency_phone||''} onChange={e=>setProfile('emergency_phone',e.target.value)}/></Field>
        </div>}
        {tab==='professional'&&<div className="grid sm:grid-cols-2 gap-4">
          <Field label="Cargo *"><input className={input} value={draft.role_title||''} onChange={e=>set('role_title',e.target.value)}/></Field><Field label="Departamento *"><input className={input} value={draft.department||''} onChange={e=>set('department',e.target.value)}/></Field>
          <Field label="Vínculo"><select className={input} value={draft.employment_type||'clt'} onChange={e=>set('employment_type',e.target.value)}><option value="clt">CLT</option><option value="pj">PJ</option><option value="intern">Estágio</option><option value="temporary">Temporário</option></select></Field><Field label="Admissão"><input className={input} type="date" value={draft.admission_date||''} onChange={e=>set('admission_date',e.target.value)}/></Field>
          <Field label="Matrícula"><input className={input} value={profile.employee_number||''} onChange={e=>setProfile('employee_number',e.target.value)}/></Field><Field label="Categoria eSocial"><input className={input} value={profile.esocial_category||''} onChange={e=>setProfile('esocial_category',e.target.value)}/></Field>
          <Field label="Gestor responsável"><input className={input} value={profile.manager_name||''} onChange={e=>setProfile('manager_name',e.target.value)}/></Field><Field label="Centro de custo"><input className={input} value={profile.cost_center||''} onChange={e=>setProfile('cost_center',e.target.value)}/></Field>
          <Field label="Jornada semanal"><input className={input} type="number" value={profile.weekly_hours||''} onChange={e=>setProfile('weekly_hours',Number(e.target.value))}/></Field><Field label="Horário / escala"><input className={input} value={profile.work_schedule||''} onChange={e=>setProfile('work_schedule',e.target.value)}/></Field>
          <Field label="Competências e capacidades" wide><textarea className={`${input} h-24 py-3`} value={profile.skills||''} onChange={e=>setProfile('skills',e.target.value)} placeholder="Ex.: atendimento, preparo, gestão de estoque…"/></Field><Field label="Atribuições e responsabilidades" wide><textarea className={`${input} h-28 py-3`} value={profile.responsibilities||''} onChange={e=>setProfile('responsibilities',e.target.value)}/></Field>
        </div>}
        {tab==='financial'&&<div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 rounded-[18px] bg-amber-50 border border-amber-100 p-4"><p className="text-[12px] font-bold text-amber-900">Isso cria uma obrigação, não uma saída de caixa</p><p className="text-[11px] text-amber-800 mt-1 leading-5">Ao ativar o funcionário, o salário entra em Despesas recorrentes. A saída financeira só será registrada quando alguém confirmar o pagamento da competência.</p></div>
          <Field label="Salário base *"><input className={input} type="number" min="0" step=".01" value={draft.salary||''} onChange={e=>set('salary',Number(e.target.value))}/></Field><Field label="Periodicidade"><select className={input} value={profile.salary_frequency||'monthly'} onChange={e=>setProfile('salary_frequency',e.target.value)}><option value="monthly">Mensal</option><option value="weekly">Semanal</option><option value="daily">Diária</option><option value="hourly">Por hora</option></select></Field>
          <Field label="Dia previsto para pagamento"><input className={input} type="number" min="1" max="31" value={profile.salary_due_day||5} onChange={e=>setProfile('salary_due_day',Number(e.target.value))}/></Field><Field label="Forma preferencial"><select className={input} value={profile.preferred_payment_method||'Pix'} onChange={e=>setProfile('preferred_payment_method',e.target.value)}><option>Pix</option><option>Transferência</option><option>Dinheiro</option><option>Outro</option></select></Field>
          <Field label="Banco"><input className={input} value={profile.bank_name||''} onChange={e=>setProfile('bank_name',e.target.value)}/></Field><Field label="Agência"><input className={input} value={profile.bank_agency||''} onChange={e=>setProfile('bank_agency',e.target.value)}/></Field>
          <Field label="Conta"><input className={input} value={profile.bank_account||''} onChange={e=>setProfile('bank_account',e.target.value)}/></Field><Field label="Chave Pix"><input className={input} value={profile.pix_key||''} onChange={e=>setProfile('pix_key',e.target.value)}/></Field>
          <Field label="Status"><select className={input} value={draft.status||'active'} onChange={e=>set('status',e.target.value)}><option value="active">Ativo</option><option value="vacation">Afastado / férias</option><option value="inactive">Inativo</option></select></Field>
        </div>}
        {tab==='documents'&&<div className="grid sm:grid-cols-2 gap-4">
          <Field label="RG"><input className={input} value={profile.rg||''} onChange={e=>setProfile('rg',e.target.value)}/></Field><Field label="PIS/PASEP"><input className={input} value={profile.pis||''} onChange={e=>setProfile('pis',e.target.value)}/></Field>
          <Field label="CTPS"><input className={input} value={profile.ctps||''} onChange={e=>setProfile('ctps',e.target.value)}/></Field><Field label="Título de eleitor"><input className={input} value={profile.voter_id||''} onChange={e=>setProfile('voter_id',e.target.value)}/></Field>
          <Field label="CNH"><input className={input} value={profile.driver_license||''} onChange={e=>setProfile('driver_license',e.target.value)}/></Field><Field label="Validade da CNH"><input className={input} type="date" value={profile.driver_license_expiry||''} onChange={e=>setProfile('driver_license_expiry',e.target.value)}/></Field>
          <Field label="Observações internas" wide><textarea className={`${input} h-28 py-3`} value={draft.notes||''} onChange={e=>set('notes',e.target.value)}/></Field>
          <div className="sm:col-span-2 rounded-[18px] border border-dashed border-gray-300 p-5 text-center"><FileText className="mx-auto text-gray-400" size={24}/><p className="text-[12px] font-semibold mt-2">Arquivos comprobatórios</p><p className="text-[11px] text-gray-400 mt-1">Estrutura preparada para anexos individuais na ficha após a admissão.</p></div>
        </div>}
      </main>
      <footer className="shrink-0 p-3 border-t border-gray-100 bg-white grid grid-cols-2 gap-2 pb-[calc(.75rem+env(safe-area-inset-bottom))]">
        <button onClick={()=>index===0?setDraft(null):setTab(tabs[index-1].id)} className="h-12 rounded-[15px] bg-gray-100 text-[12px] font-semibold flex items-center justify-center gap-2"><ChevronLeft size={15}/>{index===0?'Cancelar':'Anterior'}</button>
        {index<tabs.length-1?<button onClick={()=>setTab(tabs[index+1].id)} className="h-12 rounded-[15px] bg-gray-950 text-white text-[12px] font-semibold flex items-center justify-center gap-2">Continuar<ChevronRight size={15}/></button>:<button onClick={save} disabled={saving||uploading} className="h-12 rounded-[15px] bg-gray-950 text-white text-[12px] font-semibold disabled:opacity-50">{saving?'Salvando…':draft.id?'Salvar ficha':'Concluir admissão'}</button>}
      </footer>
    </div>
  </div>
}
