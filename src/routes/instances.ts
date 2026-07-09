/**
 * ROTAS DE INSTÂNCIAS - Gerenciamento de Instâncias WhatsApp
 */

import { Router, Request, Response } from 'express';
import { logger } from '../core/logger';
import { AuthRequest } from '../middleware/auth';
import { attachBrandContext, BrandRequest } from '../middleware/brandContext';
import { getPool } from '../config/database';
import {
  buildInstanceAccessFilter,
  buildOwnerMetaForCreate,
  ensureWhatsAppInstanceOwnerSchema,
  instanceBelongsToScope,
  resolveInstanceAuthScope,
} from '../services/instanceOwnership';

const router = Router();

/* Brand context: instancias herdam o brand_id de quem cria.
   Igual campanhas — req.brandId vem do header x-brand-id que o frontend
   ja envia em toda chamada autenticada via adminApi.getAdminHeaders(). */
router.use(attachBrandContext);

function getInstanceManager(req: Request) {
  return req.app.get('instanceManager');
}

/**
 * GET /api/instances
 * Lista instâncias do usuário (banco de dados real)
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: 'Unauthorized' });
    await ensureWhatsAppInstanceOwnerSchema();

    const instanceManager = getInstanceManager(req);
    const brandId = (req as BrandRequest).brandId || scope.brandId || null;
    const accessFilter = buildInstanceAccessFilter(scope, brandId, 'wi');

    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      `SELECT id, name, phone, status, created_at, last_connected_at, owner_type, owner_actor_id
       FROM whatsapp_instances wi
       WHERE ${accessFilter.whereSql}
       ORDER BY created_at DESC`,
      accessFilter.params
    );

    // Enriquece com status em memória (mais atualizado)
    const instances = rows.map((row: any) => {
      const live = instanceManager?.instances?.get(row.id);
      return {
        id: row.id,
        name: row.name,
        phone: row.phone || live?.phone || null,
        status: live?.status || row.status || 'disconnected',
        hasQr: !!(live?.qrCode),
        createdAt: row.created_at,
        lastConnectedAt: row.last_connected_at,
      };
    });

    res.json(instances);
  } catch (error) {
    logger.error('Erro ao buscar instâncias:', error);
    res.status(500).json({ error: 'Erro ao buscar instâncias' });
  }
});

/**
 * POST /api/instances
 * Cria nova instância e retorna QR code
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: 'Unauthorized' });
    await ensureWhatsAppInstanceOwnerSchema();

    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome da instância é obrigatório' });

    const instanceManager = getInstanceManager(req);
    if (!instanceManager) return res.status(500).json({ error: 'InstanceManager não disponível' });

    const brandId = (req as BrandRequest).brandId || scope.brandId || null;
    const ownerMeta = buildOwnerMetaForCreate(scope);
    const instance = await instanceManager.createInstance(name, scope.ownerUserId, brandId, ownerMeta);
    const qrCode = await instanceManager.connectInstance(instance.id);

    res.status(201).json({
      id: instance.id,
      name: instance.name,
      status: instance.status,
      qr: qrCode,
      qrCode: qrCode,
      createdAt: instance.createdAt,
    });
  } catch (error) {
    logger.error('Erro ao criar instância:', error);
    res.status(500).json({ error: 'Erro ao criar instância' });
  }
});

/**
 * GET /api/instances/:id
 * Retorna detalhes de uma instância
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: 'Unauthorized' });
    const brandId = (req as BrandRequest).brandId || scope.brandId || null;
    const allowed = await instanceBelongsToScope(String(id), scope, brandId);
    if (!allowed) return res.status(404).json({ error: 'Instância não encontrada' });

    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      'SELECT * FROM whatsapp_instances WHERE id = ? LIMIT 1',
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Instância não encontrada' });

    const row = rows[0];
    const instanceManager = getInstanceManager(req);
    const live = instanceManager?.instances?.get(id);

    res.json({
      id: row.id,
      name: row.name,
      phone: row.phone || live?.phone || null,
      status: live?.status || row.status || 'disconnected',
      hasQr: !!(live?.qrCode),
      createdAt: row.created_at,
      lastConnectedAt: row.last_connected_at,
    });
  } catch (error) {
    logger.error('Erro ao buscar instância:', error);
    res.status(500).json({ error: 'Erro ao buscar instância' });
  }
});

/**
 * GET /api/instances/:id/qr
 * Retorna o QR code atual da instância (se disponível)
 */
router.get('/:id/qr', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: 'Unauthorized' });
    const brandId = (req as BrandRequest).brandId || scope.brandId || null;
    const allowed = await instanceBelongsToScope(String(id), scope, brandId);
    if (!allowed) return res.status(404).json({ error: 'Instância não encontrada' });

    const instanceManager = getInstanceManager(req);
    if (!instanceManager) return res.status(500).json({ error: 'InstanceManager não disponível' });

    const qr = instanceManager.getInstanceQR(id, scope.ownerUserId);

    if (!qr) {
      const live = instanceManager.instances?.get(id);
      return res.json({
        qr: null,
        status: live?.status || 'disconnected',
        message: 'QR code não disponível',
      });
    }

    res.json({ qr, status: 'qr_ready' });
  } catch (error) {
    logger.error('Erro ao buscar QR code:', error);
    res.status(500).json({ error: 'Erro ao buscar QR code' });
  }
});

/**
 * POST /api/instances/:id/reconnect
 * Força reconexão da instância e gera novo QR code
 */
router.post('/:id/reconnect', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: 'Unauthorized' });
    const brandId = (req as BrandRequest).brandId || scope.brandId || null;
    const allowed = await instanceBelongsToScope(String(id), scope, brandId);
    if (!allowed) return res.status(404).json({ error: 'Instância não encontrada' });

    const instanceManager = getInstanceManager(req);
    if (!instanceManager) return res.status(500).json({ error: 'InstanceManager não disponível' });

    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      'SELECT id, name FROM whatsapp_instances WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Instância não encontrada' });

    // Desconecta limpo antes de reconectar
    await instanceManager.disconnectInstance(id).catch(() => {});

    // Inicia nova conexão — retorna QR code
    const qrCode = await instanceManager.connectInstance(id);

    res.json({
      id,
      name: rows[0].name,
      status: 'connecting',
      qr: qrCode,
      qrCode: qrCode,
      message: qrCode ? 'QR code gerado. Escaneie para conectar.' : 'Reconectando com sessão salva...',
    });
  } catch (error) {
    logger.error('Erro ao reconectar instância:', error);
    res.status(500).json({ error: 'Erro ao reconectar instância' });
  }
});

/**
 * POST /api/instances/:id/pairing-code
 * Gera codigo de pareamento como alternativa ao QR code
 */
router.post('/:id/reset-pairing', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: 'Unauthorized' });
    const brandId = (req as BrandRequest).brandId || scope.brandId || null;
    const allowed = await instanceBelongsToScope(String(id), scope, brandId);
    if (!allowed) return res.status(404).json({ error: 'Instância não encontrada' });

    const instanceManager = getInstanceManager(req);
    if (!instanceManager) return res.status(500).json({ error: 'InstanceManager não disponível' });

    await instanceManager.resetSessionForPairing(id);
    res.json({ success: true, message: 'Sessao encerrada. Pode gerar um novo codigo.' });
  } catch (error: any) {
    logger.error('Erro ao resetar pairing:', error);
    res.status(500).json({ error: error.message || 'Erro ao resetar sessao' });
  }
});

router.post('/:id/pairing-code', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: 'Unauthorized' });
    const brandId = (req as BrandRequest).brandId || scope.brandId || null;
    const allowed = await instanceBelongsToScope(String(id), scope, brandId);
    if (!allowed) return res.status(404).json({ error: 'Instância não encontrada' });

    const { phoneNumber } = req.body;
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return res.status(400).json({ error: 'Numero de telefone obrigatorio' });
    }

    const instanceManager = getInstanceManager(req);
    if (!instanceManager) return res.status(500).json({ error: 'InstanceManager não disponível' });

    const cleanPhone = instanceManager.normalizePairingPhoneNumber(phoneNumber);
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return res.status(400).json({ error: 'Numero de telefone invalido' });
    }

    const pairing = await instanceManager.connectWithPairingCode(id, cleanPhone);

    res.json({
      success: true,
      code: pairing.code,
      phone: pairing.phone,
      message: 'Digite este codigo no WhatsApp para conectar.',
    });
  } catch (error: any) {
    logger.error('Erro ao gerar pairing code:', error);
    res.status(500).json({ error: error.message || 'Erro ao gerar codigo de pareamento' });
  }
});

/**
 * DELETE /api/instances/:id
 * Remove uma instância
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: 'Unauthorized' });
    const brandId = (req as BrandRequest).brandId || scope.brandId || null;
    const allowed = await instanceBelongsToScope(String(id), scope, brandId);
    if (!allowed) return res.status(404).json({ error: 'Instância não encontrada' });

    const instanceManager = getInstanceManager(req);
    if (instanceManager) {
      await instanceManager.deleteInstance(id).catch(() => {});
    } else {
      const pool = getPool();
      await pool.execute('DELETE FROM whatsapp_instances WHERE id = ?', [id]);
    }

    res.json({ message: 'Instância removida com sucesso' });
  } catch (error) {
    logger.error('Erro ao deletar instância:', error);
    res.status(500).json({ error: 'Erro ao deletar instância' });
  }
});

export default router;
