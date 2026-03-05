/**
 * EXEMPLO - Implementação de Push Notifications no Backend
 * 
 * Este arquivo mostra como implementar suporte a Web Push no backend Node.js
 * Install: npm install web-push
 */

import webpush from "web-push";
import { Router, Request, Response } from "express";

const router = Router();

// Configure suas chaves VAPID (gere com: npx web-push generate-vapid-keys)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:seu-email@example.com";

// Configure webpush
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Simule um banco de dados para inscrições push
const pushSubscriptions = new Map<string, PushSubscription>();

/**
 * POST /api/push/subscribe
 * Recebe e armazena uma inscrição push
 */
router.post("/subscribe", (req: Request, res: Response) => {
  try {
    const subscription = req.body as PushSubscription;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Subscription inválida" });
    }

    // Gere um ID único para a subscrição
    const subscriptionId = Buffer.from(subscription.endpoint).toString("base64");
    
    // Salve no "banco de dados" (em produção, use um banco real)
    pushSubscriptions.set(subscriptionId, subscription);

    console.log(`✅ Nova inscrição push registrada: ${subscriptionId}`);

    res.status(201).json({
      id: subscriptionId,
      message: "Inscrição registrada com sucesso"
    });
  } catch (error) {
    console.error("Erro ao registrar inscrição:", error);
    res.status(500).json({ error: "Erro ao registrar inscrição" });
  }
});

/**
 * POST /api/push/unsubscribe
 * Remove uma inscrição push
 */
router.post("/unsubscribe", (req: Request, res: Response) => {
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: "ID da inscrição necessário" });
    }

    pushSubscriptions.delete(subscriptionId);

    console.log(`❌ Inscrição removida: ${subscriptionId}`);

    res.status(200).json({ message: "Inscrição removida com sucesso" });
  } catch (error) {
    console.error("Erro ao remover inscrição:", error);
    res.status(500).json({ error: "Erro ao remover inscrição" });
  }
});

/**
 * POST /api/push/send
 * Envia uma notificação push para todos os clientes subscritos
 */
router.post("/send", async (req: Request, res: Response) => {
  try {
    const { title, message, tag, requireInteraction, data } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Título necessário" });
    }

    const payload = JSON.stringify({
      title,
      body: message || "",
      tag: tag || "lead-system",
      requireInteraction: requireInteraction || false,
      data: data || {}
    });

    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[]
    };

    // Envie para todas as inscrições registradas
    for (const [subscriptionId, subscription] of pushSubscriptions) {
      try {
        await webpush.sendNotification(subscription, payload);
        results.success++;
        console.log(`✅ Notificação enviada para: ${subscriptionId}`);
      } catch (error: any) {
        results.failed++;
        console.error(`❌ Erro ao enviar para ${subscriptionId}:`, error.message);

        // Se a inscrição expirou, remova-a
        if (error.statusCode === 410) {
          pushSubscriptions.delete(subscriptionId);
          console.log(`🗑️ Inscrição expirada removida: ${subscriptionId}`);
        }

        results.errors.push({
          subscriptionId,
          error: error.message,
          statusCode: error.statusCode
        });
      }
    }

    res.status(200).json({
      message: "Notificação enviada",
      results
    });
  } catch (error) {
    console.error("Erro ao enviar notificação:", error);
    res.status(500).json({ error: "Erro ao enviar notificação" });
  }
});

/**
 * POST /api/push/send/:userId
 * Envia notificação para um usuário específico
 */
router.post("/send/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { title, message, data } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Título necessário" });
    }

    // Aqui você buscaria a inscrição do usuário no banco de dados
    // Exemplo: const subscription = await getUserPushSubscription(userId);

    // Para este exemplo, usaremos a primeira inscrição disponível
    const subscription = Array.from(pushSubscriptions.values())[0];

    if (!subscription) {
      return res.status(404).json({ error: "Nenhuma inscrição encontrada" });
    }

    const payload = JSON.stringify({
      title,
      body: message || "",
      data: { ...data, userId }
    });

    await webpush.sendNotification(subscription, payload);

    res.status(200).json({ message: "Notificação enviada com sucesso" });
  } catch (error: any) {
    console.error("Erro ao enviar notificação:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/push/broadcast
 * Envia notificação em broadcast para casos especiais (importante!)
 */
router.post("/broadcast", async (req: Request, res: Response) => {
  try {
    const { title, message, requireInteraction = true, data } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Título necessário" });
    }

    const payload = JSON.stringify({
      title,
      body: message || "",
      requireInteraction,
      data: data || {},
      badge: "/icon-192x192-maskable.png",
      icon: "/icon-192x192.png"
    });

    const results = {
      total: pushSubscriptions.size,
      success: 0,
      failed: 0
    };

    for (const [subscriptionId, subscription] of pushSubscriptions) {
      try {
        await webpush.sendNotification(subscription, payload);
        results.success++;
      } catch (error: any) {
        results.failed++;
        if (error.statusCode === 410) {
          pushSubscriptions.delete(subscriptionId);
        }
      }
    }

    res.status(200).json({
      message: "Broadcast enviado",
      results
    });
  } catch (error) {
    console.error("Erro ao fazer broadcast:", error);
    res.status(500).json({ error: "Erro ao fazer broadcast" });
  }
});

/**
 * GET /api/push/status
 * Obtém informações sobre as inscrições push
 */
router.get("/status", (req: Request, res: Response) => {
  res.status(200).json({
    totalSubscriptions: pushSubscriptions.size,
    hasVapidKeys: !!VAPID_PUBLIC_KEY && !!VAPID_PRIVATE_KEY,
    subscriptions: Array.from(pushSubscriptions.keys())
  });
});

export default router;

/**
 * EXEMPLO DE USO NO FRONTEND:
 * 
 * 1. Inscrever para notificações:
 * ```typescript
 * import { subscribeToPushNotifications } from "@/utils/notifications";
 * 
 * const subscription = await subscribeToPushNotifications(VAPID_PUBLIC_KEY);
 * await fetch("/api/push/subscribe", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify(subscription)
 * });
 * ```
 * 
 * 2. Enviar notificação (do backend):
 * ```bash
 * curl -X POST http://localhost:3000/api/push/send \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "title": "Nova mensagem",
 *     "message": "Você recebeu uma mensagem",
 *     "data": {"url": "/mensagens"}
 *   }'
 * ```
 */
