import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { authMiddleware } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { requireAnyPermission, requirePermission } from "../middleware/permissions";
import { administrativeService, recordAdministrativeAudit } from "../services/administrative";
import { permissionsService } from "../services/permissions";

const router = Router();
router.use(authMiddleware, requireBrandContext);
const bid = (req: BrandRequest) => String(req.brandId || "");
const uid = (req: BrandRequest) => String(req.user?.userId || req.user?.sub || "");
const fail = (res: Response, e: any) => res.status(500).json({ error: e?.message || "Erro interno" });

router.get("/bootstrap", requireAnyPermission(["finance:read","hr:read","approvals:read","audit:read"]), async (req: BrandRequest,res) => {
  try { res.json(await administrativeService.bootstrap(bid(req),uid(req))); } catch(e) { fail(res,e); }
});
router.get("/departments", requireAnyPermission(["hr:read","finance:read"]), async (req: BrandRequest,res) => {
  try { res.json({ departments: await administrativeService.listDepartments(bid(req)) }); } catch(e) { fail(res,e); }
});
router.post("/departments", requirePermission("hr:write"), async (req: BrandRequest,res) => {
  try {
    if (!String(req.body?.name || "").trim()) return res.status(400).json({error:"Nome é obrigatório"});
    const row = await administrativeService.saveDepartment(bid(req),req.body);
    await recordAdministrativeAudit({brandId:bid(req),actorUserId:uid(req),action:"department.create",resourceType:"department",resourceId:row.id,summary:`Departamento ${row.name} criado`});
    res.status(201).json({department:row});
  } catch(e) { fail(res,e); }
});
router.put("/departments/:id", requirePermission("hr:write"), async (req: BrandRequest,res) => {
  try {
    const row=await administrativeService.saveDepartment(bid(req),req.body,String(req.params.id));
    await recordAdministrativeAudit({brandId:bid(req),actorUserId:uid(req),action:"department.update",resourceType:"department",resourceId:row?.id,summary:`Departamento ${row?.name || ""} atualizado`});
    res.json({department:row});
  } catch(e) { fail(res,e); }
});
router.get("/approvals", requirePermission("approvals:read"), async (req: BrandRequest,res) => {
  try { res.json({approvals:await administrativeService.listApprovals(bid(req),String(req.query.status || ""))}); } catch(e) { fail(res,e); }
});
router.post("/approvals", requireAnyPermission(["finance:write","hr:write"]), async (req: BrandRequest,res) => {
  try {
    const b=req.body||{};
    if(!b.resource_type||!b.resource_id||!b.title) return res.status(400).json({error:"Recurso e título são obrigatórios"});
    const row=await administrativeService.requestApproval(bid(req),b,uid(req));
    await recordAdministrativeAudit({brandId:bid(req),actorUserId:uid(req),action:"approval.request",resourceType:b.resource_type,resourceId:b.resource_id,summary:`Aprovação solicitada: ${b.title}`});
    res.status(201).json({approval:row});
  } catch(e) { fail(res,e); }
});
router.post("/approvals/:id/decision", requirePermission("approvals:decide"), async (req: BrandRequest,res) => {
  try {
    const decision=req.body?.decision;
    if(!["approved","rejected"].includes(decision)) return res.status(400).json({error:"Decisão inválida"});
    const row=await administrativeService.decideApproval(bid(req),String(req.params.id),decision,String(req.body?.note||""),uid(req));
    await recordAdministrativeAudit({brandId:bid(req),actorUserId:uid(req),action:`approval.${decision}`,resourceType:row.resource_type,resourceId:row.resource_id,summary:`${row.title}: ${decision==="approved"?"aprovado":"rejeitado"}`});
    res.json({approval:row});
  } catch(e:any) { if(String(e?.message).includes("já foi")) return res.status(409).json({error:e.message}); fail(res,e); }
});
router.get("/audit", requirePermission("audit:read"), async (req: BrandRequest,res) => {
  try {
    res.json({events:await administrativeService.listAudit(
      bid(req), Number(req.query.limit||100),
      String(req.query.resource_type || ""), String(req.query.resource_id || "")
    )});
  } catch(e) { fail(res,e); }
});
router.get("/access", requirePermission("users:read"), async (req: BrandRequest,res) => {
  try {
    let roles=await permissionsService.listRoles(bid(req));
    if (!roles.length) {
      await permissionsService.seedDefaultRolesForBrand(bid(req));
      roles=await permissionsService.listRoles(bid(req));
    }
    const users=await permissionsService.listBrandUsers(bid(req));
    res.json({users,roles:roles.filter(r=>r.is_active)});
  } catch(e) { fail(res,e); }
});
router.post("/access", requirePermission("users:write"), async (req: BrandRequest,res) => {
  try {
    const email=String(req.body?.email||"").trim().toLowerCase();
    const name=String(req.body?.name||"").trim();
    const password=String(req.body?.password||"");
    const roleId=String(req.body?.role_id||"");
    if(!email||!name||password.length<8||!roleId) return res.status(400).json({error:"Nome, e-mail, perfil e senha de ao menos 8 caracteres são obrigatórios"});
    let user=await queryOne<any>("SELECT id,account_kind,role FROM users WHERE LOWER(email)=LOWER(?) LIMIT 1",[email]);
    if(user&&["org","platform"].includes(String(user.account_kind||""))) return res.status(409).json({error:"Este e-mail pertence a uma conta protegida"});
    if(!user){
      const id=randomUUID(),hash=await bcrypt.hash(password,10);
      await query(`INSERT INTO users (id,email,password_hash,name,role,account_kind,is_active)
        VALUES (?,?,?,?,'operator','staff',TRUE)`,[id,email,hash,name]);
      user={id};
    } else {
      const hash=await bcrypt.hash(password,10);
      await query("UPDATE users SET name=?,password_hash=?,is_active=TRUE,updated_at=CURRENT_TIMESTAMP WHERE id=?",[name,hash,user.id]);
    }
    const assignment=await permissionsService.assignUserRole(String(user.id),bid(req),roleId,uid(req));
    await recordAdministrativeAudit({brandId:bid(req),actorUserId:uid(req),action:"access.grant",resourceType:"user",resourceId:String(user.id),summary:`Acesso administrativo concedido a ${name}`});
    res.status(201).json({user:assignment});
  } catch(e) { fail(res,e); }
});
router.patch("/access/:userId/block", requirePermission("users:write"), async (req: BrandRequest,res) => {
  try {
    const blocked=req.body?.blocked!==false;
    const row=await permissionsService.setUserBlocked(String(req.params.userId),bid(req),blocked);
    await recordAdministrativeAudit({brandId:bid(req),actorUserId:uid(req),action:blocked?"access.block":"access.restore",resourceType:"user",resourceId:String(req.params.userId),summary:`Acesso ${blocked?"bloqueado":"restaurado"} para ${row.user_name||row.user_email||"usuário"}`});
    res.json({user:row});
  } catch(e) { fail(res,e); }
});
export default router;
