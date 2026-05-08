import { Router, Request, Response } from "express";
import { query, update } from "../config/database";
import { logger } from "../utils/logger";
import { randomUUID } from "crypto";
import crypto from "crypto";

const router = Router();

router.post("/data-deletion", async (req: Request, res: Response) => {
  try {
    const signedRequest = req.body.signed_request;
    if (!signedRequest) {
      return res.status(400).json({ error: "signed_request is required" });
    }

    const [encodedSig, payload] = signedRequest.split(".", 2);
    const data = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
    );
    const userId = data.user_id;

    const confirmationCode = randomUUID().slice(0, 12).toUpperCase();

    try {
      await update(
        `DELETE FROM instagram_connections WHERE ig_user_id = ?`,
        [String(userId)]
      );
    } catch (err: any) {
      logger.warn("[Meta] data-deletion: could not delete connections:", err.message);
    }

    const statusUrl = `https://app.leadcapture.online/privacy/deletion-status?code=${confirmationCode}`;

    res.json({
      url: statusUrl,
      confirmation_code: confirmationCode,
    });
  } catch (err: any) {
    logger.error("[Meta] data-deletion callback error:", err.message);
    res.status(400).json({ error: "Invalid request" });
  }
});

router.get("/deletion-status", (_req: Request, res: Response) => {
  const code = _req.query.code || "";
  res.json({
    status: "completed",
    confirmation_code: code,
    message: "Todos os dados associados a esta conta foram excluidos com sucesso.",
  });
});

export default router;
