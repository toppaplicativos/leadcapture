/**
 * Lead Capture Mob — public routes (no auth): register, login, track, invite peek.
 */
import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { rateLimit } from "../middleware/rateLimit";
import { mobLogisticsService } from "../services/mobLogistics";
import { logger } from "../utils/logger";

const router = Router();

function signCourierToken(input: {
  userId: string;
  email: string;
  courierId: string;
}): string {
  return jwt.sign(
    {
      userId: input.userId,
      email: input.email,
      role: "courier",
      credential_type: "entregador",
      courier_id: input.courierId,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
}

router.post(
  "/register",
  rateLimit({ name: "mob-register", max: 10, windowMs: 60_000 }),
  async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "").trim();
      const fullName = String(req.body?.full_name || req.body?.name || "").trim();
      const phone = String(req.body?.phone || "").trim() || undefined;
      const whatsapp = String(req.body?.whatsapp || "").trim() || undefined;
      const cpf = String(req.body?.cpf || "").trim() || undefined;
      const inviteCode = String(req.body?.invite_code || req.body?.invite || "").trim() || undefined;

      if (!email || !password || !fullName) {
        return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres" });
      }

      const { courier, userId } = await mobLogisticsService.registerCourier({
        email,
        password,
        full_name: fullName,
        phone,
        whatsapp,
        cpf,
      });

      let membership = null;
      if (inviteCode) {
        try {
          membership = await mobLogisticsService.acceptInvite(courier.id, inviteCode);
        } catch (e: any) {
          logger.warn({ err: e?.message }, "Mob invite accept on register failed");
        }
      }

      const token = signCourierToken({
        userId,
        email,
        courierId: courier.id,
      });

      res.status(201).json({
        success: true,
        token,
        courier,
        membership,
        user: {
          id: userId,
          email,
          name: fullName,
          role: "courier",
          credential_type: "entregador",
        },
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Falha no cadastro" });
    }
  }
);

router.post(
  "/login",
  rateLimit({ name: "mob-login", max: 20, windowMs: 60_000 }),
  async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "").trim();
      if (!email || !password) {
        return res.status(400).json({ error: "E-mail e senha obrigatórios" });
      }

      const result = await mobLogisticsService.loginCourier(email, password);
      if (!result) return res.status(401).json({ error: "Credenciais inválidas" });

      const token = signCourierToken({
        userId: result.userId,
        email,
        courierId: result.courier.id,
      });

      res.json({
        success: true,
        token,
        courier: result.courier,
        user: {
          id: result.userId,
          email,
          name: result.courier.full_name,
          role: "courier",
          credential_type: "entregador",
        },
      });
    } catch (e: any) {
      res.status(403).json({ error: e.message || "Login negado" });
    }
  }
);

router.get("/invite/:code", async (req: Request, res: Response) => {
  try {
    const invite = await mobLogisticsService.getInviteByCode(String(req.params.code || ""));
    if (!invite || invite.status !== "active") {
      return res.status(404).json({ error: "Convite não encontrado" });
    }
    res.json({
      success: true,
      invite: {
        code: invite.invite_code,
        label: invite.label,
        brand_name: invite.brand_name,
        operation_name: invite.operation_name,
        logo_url: invite.logo_url,
        expires_at: invite.expires_at,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar convite" });
  }
});

router.get(
  "/track/:token",
  rateLimit({ name: "mob-track", max: 60, windowMs: 60_000 }),
  async (req: Request, res: Response) => {
    try {
      const data = await mobLogisticsService.getPublicTracking(String(req.params.token || ""));
      if (!data) return res.status(404).json({ error: "Rastreio não encontrado ou expirado" });
      res.json({ success: true, ...data });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Falha no rastreio" });
    }
  }
);

export default router;
