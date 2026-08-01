import { Router, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import { authMiddleware } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { requirePermission } from "../middleware/permissions";
import { accountingService } from "../services/accounting";
import { permissionsService } from "../services/permissions";
import { recordAdministrativeAudit } from "../services/administrative";

const router = Router();
router.use(authMiddleware, requireBrandContext);
const brand = (req: BrandRequest) => String(req.brandId || "");
const userId = (req: BrandRequest) => String(req.user?.userId || req.user?.sub || "");
const fail = (res: Response, e: any) => res.status(500).json({ error: e?.message || "Erro interno" });
const employeePhotoDir = path.join(__dirname, "../../uploads/employee-photos");
if (!fs.existsSync(employeePhotoDir)) fs.mkdirSync(employeePhotoDir, { recursive: true });
const employeePhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, employeePhotoDir),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase() || ".jpg"}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

router.get("/dashboard", requirePermission("finance:read"), async (req: BrandRequest, res) => {
  try {
    const dashboard = await accountingService.dashboard(brand(req), String(req.query.from || ""), String(req.query.to || ""));
    const sensitive = await permissionsService.hasPermission(userId(req), brand(req), "hr:sensitive");
    if (!sensitive) dashboard.employees = {
      total:dashboard.employees.total,
      active:dashboard.employees.active,
      payroll:undefined,
    } as any;
    res.json(dashboard);
  }
  catch (e) { fail(res, e); }
});
router.get("/transactions", requirePermission("finance:read"), async (req: BrandRequest, res) => {
  try { res.json({ transactions: await accountingService.listTransactions(brand(req), String(req.query.from || ""), String(req.query.to || "")) }); }
  catch (e) { fail(res, e); }
});
router.get("/recurring-expenses", requirePermission("finance:read"), async (req: BrandRequest, res) => {
  try { res.json({ recurring_expenses: await accountingService.listRecurringExpenses(brand(req)) }); }
  catch (e) { fail(res, e); }
});
router.post("/recurring-expenses/:id/pay", requirePermission("finance:write"), async (req: BrandRequest, res) => {
  try {
    const transaction = await accountingService.payRecurringExpense(brand(req), String(req.params.id), req.body || {}, userId(req));
    await recordAdministrativeAudit({ brandId:brand(req), actorUserId:userId(req), action:"finance.recurring.pay",
      resourceType:"transaction", resourceId:transaction?.id, summary:`Pagamento registrado: ${transaction?.description || ""}` });
    res.status(201).json({ transaction });
  } catch (e:any) { res.status(400).json({ error:e?.message || "Não foi possível registrar o pagamento." }); }
});
router.get("/categories", requirePermission("finance:read"), async (req: BrandRequest, res) => {
  try { res.json({ categories: await accountingService.listCategories(brand(req)) }); }
  catch (e) { fail(res, e); }
});
router.post("/categories", requirePermission("finance:write"), async (req: BrandRequest, res) => {
  try {
    const category = await accountingService.createCategory(brand(req), req.body || {});
    await recordAdministrativeAudit({ brandId:brand(req), actorUserId:userId(req), action:"finance.category.create",
      resourceType:"category", resourceId:category?.id, summary:`Categoria criada: ${category?.name || ""}` });
    res.status(201).json({ category });
  } catch (e:any) { res.status(400).json({ error:e?.message || "Categoria inválida." }); }
});
router.patch("/categories/:id", requirePermission("finance:write"), async (req: BrandRequest, res) => {
  try {
    const category = await accountingService.setCategoryActive(brand(req), String(req.params.id), req.body?.is_active !== false);
    if (!category) return res.status(404).json({ error:"Categoria não encontrada." });
    await recordAdministrativeAudit({ brandId:brand(req), actorUserId:userId(req), action:"finance.category.update",
      resourceType:"category", resourceId:category.id, summary:`Categoria ${category.is_active ? "ativada" : "arquivada"}: ${category.name}` });
    res.json({ category });
  } catch (e) { fail(res, e); }
});
router.post("/integrations/orders/sync", requirePermission("finance:write"), async (req: BrandRequest, res) => {
  try {
    const result = await accountingService.syncPaidOrders(brand(req), userId(req));
    await recordAdministrativeAudit({ brandId:brand(req), actorUserId:userId(req), action:"finance.sync.orders",
      resourceType:"integration", summary:`Pedidos sincronizados: ${result.imported} novo(s)`,
      metadata:result });
    res.json(result);
  } catch (e) { fail(res, e); }
});
router.post("/transactions", requirePermission("finance:write"), async (req: BrandRequest, res) => {
  try {
    const b = req.body || {};
    if (!["income","expense"].includes(b.kind) || !String(b.description || "").trim() || !(Number(b.amount) > 0) || !b.occurred_on)
      return res.status(400).json({ error: "Preencha tipo, descrição, valor e data." });
    const transaction = await accountingService.saveTransaction(brand(req), b, userId(req));
    await recordAdministrativeAudit({ brandId:brand(req), actorUserId:userId(req), action:"finance.create",
      resourceType:"transaction", resourceId:transaction?.id, summary:`Lançamento criado: ${b.description}`,
      metadata:{ kind:b.kind, amount:Number(b.amount) } });
    res.status(201).json({ transaction });
  } catch (e) { fail(res, e); }
});
router.put("/transactions/:id", requirePermission("finance:write"), async (req: BrandRequest, res) => {
  try {
    const transaction = await accountingService.saveTransaction(brand(req), req.body || {}, userId(req), String(req.params.id));
    await recordAdministrativeAudit({ brandId:brand(req), actorUserId:userId(req), action:"finance.update",
      resourceType:"transaction", resourceId:String(req.params.id), summary:`Lançamento atualizado: ${transaction?.description || ""}` });
    res.json({ transaction });
  } catch (e) { fail(res, e); }
});
router.delete("/transactions/:id", requirePermission("finance:write"), async (req: BrandRequest, res) => {
  try {
    await accountingService.deleteTransaction(brand(req), String(req.params.id));
    await recordAdministrativeAudit({ brandId:brand(req), actorUserId:userId(req), action:"finance.cancel",
      resourceType:"transaction", resourceId:String(req.params.id), summary:"Lançamento cancelado" });
    res.json({ success: true });
  } catch (e) { fail(res, e); }
});
router.get("/employees", requirePermission("hr:read"), async (req: BrandRequest, res) => {
  try {
    const employees = await accountingService.listEmployees(brand(req));
    const sensitive = await permissionsService.hasPermission(userId(req), brand(req), "hr:sensitive");
    res.json({ employees: sensitive ? employees : employees.map(({ salary, document_number, notes, profile_data, ...employee }) => employee), sensitive_access:sensitive });
  } catch (e) { fail(res, e); }
});
router.get("/employees/:id", requirePermission("hr:read"), async (req: BrandRequest, res) => {
  try {
    const detail = await accountingService.getEmployeeDetail(brand(req), String(req.params.id));
    if (!detail.employee) return res.status(404).json({ error: "Funcionário não encontrado." });
    const sensitive = await permissionsService.hasPermission(userId(req), brand(req), "hr:sensitive");
    if (!sensitive) {
      const { salary, document_number, notes, profile_data, ...employee } = detail.employee;
      return res.json({ employee, recurring_expense:null, sensitive_access:false });
    }
    res.json({ ...detail, sensitive_access:true });
  } catch (e) { fail(res, e); }
});
router.post("/employees", requirePermission("hr:write"), async (req: BrandRequest, res) => {
  try {
    if (!String(req.body?.name || "").trim()) return res.status(400).json({ error: "Nome é obrigatório." });
    const employee = await accountingService.saveEmployee(brand(req), req.body || {});
    await recordAdministrativeAudit({ brandId:brand(req), actorUserId:userId(req), action:"hr.create",
      resourceType:"employee", resourceId:employee?.id, summary:`Funcionário cadastrado: ${employee?.name || ""}` });
    res.status(201).json({ employee });
  } catch (e) { fail(res, e); }
});
router.post("/employees/photo", requirePermission("hr:write"), (req: BrandRequest, res) => {
  employeePhotoUpload.single("photo")(req as any, res as any, (error: any) => {
    if (error) return res.status(400).json({ error:error.code === "LIMIT_FILE_SIZE" ? "A foto deve ter no máximo 5 MB." : "Arquivo de foto inválido." });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error:"Envie uma imagem JPG, PNG ou WebP." });
    res.status(201).json({ photo_url:`/uploads/employee-photos/${file.filename}` });
  });
});
router.put("/employees/:id", requirePermission("hr:write"), async (req: BrandRequest, res) => {
  try {
    const employee = await accountingService.saveEmployee(brand(req), req.body || {}, String(req.params.id));
    await recordAdministrativeAudit({ brandId:brand(req), actorUserId:userId(req), action:"hr.update",
      resourceType:"employee", resourceId:String(req.params.id), summary:`Funcionário atualizado: ${employee?.name || ""}` });
    res.json({ employee });
  } catch (e) { fail(res, e); }
});
router.delete("/employees/:id", requirePermission("hr:write"), async (req: BrandRequest, res) => {
  try {
    await accountingService.deleteEmployee(brand(req), String(req.params.id));
    await recordAdministrativeAudit({ brandId:brand(req), actorUserId:userId(req), action:"hr.archive",
      resourceType:"employee", resourceId:String(req.params.id), summary:"Funcionário removido" });
    res.json({ success: true, archived: true });
  } catch (e) { fail(res, e); }
});
router.get("/export.xlsx", requirePermission("finance:export"), async (req: BrandRequest, res) => {
  try {
    const from = String(req.query.from || ""), to = String(req.query.to || "");
    const canSeeSensitive = await permissionsService.hasPermission(userId(req), brand(req), "hr:sensitive");
    const [transactions, employees, dashboard] = await Promise.all([
      accountingService.listTransactions(brand(req), from, to),
      accountingService.listEmployees(brand(req)),
      accountingService.dashboard(brand(req), from, to),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transactions.map(t => ({
      Data:t.occurred_on, Tipo:t.kind === "income" ? "Entrada" : "Saída", Descrição:t.description,
      Categoria:t.category, Valor:Number(t.amount), Status:t.status, Pagamento:t.payment_method || "",
      Documento:t.document_number || "", Observações:t.notes || "",
    }))), "Lançamentos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employees.map(e => ({
      Nome:e.name, Cargo:e.role_title || "", Departamento:e.department || "", Vínculo:e.employment_type,
      Admissão:e.admission_date || "", Salário:canSeeSensitive ? Number(e.salary || 0) : "", Status:e.status,
      Email:e.email || "", Telefone:e.phone || "", Documento:canSeeSensitive ? (e.document_number || "") : "",
    }))), "Funcionários");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      Entradas:dashboard.income, Saídas:dashboard.expense, Saldo:dashboard.balance,
      Pendente:dashboard.pending, "Funcionários ativos":dashboard.employees.active,
      "Folha mensal":canSeeSensitive ? dashboard.employees.payroll : "",
    }]), "Resumo");
    const file = XLSX.write(wb, { type:"buffer", bookType:"xlsx" });
    await recordAdministrativeAudit({ brandId:brand(req), actorUserId:userId(req), action:"finance.export",
      resourceType:"report", summary:`Planilha exportada (${from || "início"} a ${to || "hoje"})` });
    res.setHeader("Content-Disposition", `attachment; filename="financeiro-${from || "inicio"}-${to || "hoje"}.xlsx"`);
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(file);
  } catch (e) { fail(res, e); }
});

export default router;
