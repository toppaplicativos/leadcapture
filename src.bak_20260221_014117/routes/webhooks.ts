/**
 * ROTAS DE WEBHOOKS - Recebimento de Eventos do WhatsApp
 */

import { Router, Request, Response } from 'express';
import { logger } from '../core/logger';

const router = Router();

/**
 * POST /api/webhooks/whatsapp
 * Recebe eventos do WhatsApp (mensagens, status, etc)
 */
router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    const { event, data } = req.body;

    logger.info(`Webhook recebido: ${event}`, data);

    // Emitir evento via Socket.io se disponível
    const io = (req as any).io;
    if (io && data.userId) {
      if (event === 'message:received') {
        io.to(`user:${data.userId}`).emit('message:new', {
          conversationId: data.conversationId,
          message: data.message,
        });
      } else if (event === 'instance:status') {
        io.to(`user:${data.userId}`).emit('instance:status', {
          instanceId: data.instanceId,
          status: data.status,
        });
      } else if (event === 'qrcode:generated') {
        io.to(`user:${data.userId}`).emit('instance:qrcode', {
          instanceId: data.instanceId,
          qrCode: data.qrCode,
        });
      }
    }

    res.json({ success: true, message: 'Webhook processado' });
  } catch (error) {
    logger.error('Erro ao processar webhook:', error);
    res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

/**
 * GET /api/webhooks/health
 * Verifica saúde do webhook
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
