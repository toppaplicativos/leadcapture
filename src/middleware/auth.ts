/**
 * MIDDLEWARE DE AUTENTICAÇÃO - Validação de JWT
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const JWT_SECRET = config.jwtSecret;

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
}

/**
 * Middleware para autenticar requisições usando JWT
 * Valida o token no header Authorization: Bearer <token>
 */
export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    // Extrair token do header Authorization
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ error: 'Token não fornecido' });
      return;
    }

    // Verificar e decodificar token
    jwt.verify(token, JWT_SECRET as string, (err: any, decoded: any) => {
      if (err) {
        const expired = err.name === 'TokenExpiredError';
        res.status(401).json({
          error: expired ? 'Token expirado' : 'Token inválido',
          code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        });
        return;
      }

      // Adicionar userId ao request
      req.userId = decoded.userId || decoded.sub;
      req.user = decoded;
      next();
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao autenticar' });
  }
}

/**
 * Alias para authenticateToken (compatibilidade com código existente)
 */
export const authMiddleware = authenticateToken;

/**
 * Middleware para verificar role do usuário
 */
export function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role || 'user';
    
    if (!roles.includes(userRole)) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    
    next();
  };
}

/**
 * Verifica se um token é válido
 */
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET as string);
  } catch (error) {
    return null;
  }
}

/**
 * Super-admin guard. Must be chained AFTER authenticateToken.
 * Hits the DB once per request to verify is_super_admin flag — caches
 * the boolean on the request object.
 */
export async function requireSuperAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' })
      return
    }
    // Lazy import to avoid circular dep with services that load config
    const { masterService } = await import('../services/master')
    const ok = await masterService.isSuperAdmin(userId)
    if (!ok) {
      res.status(403).json({ error: 'Acesso restrito ao super admin' })
      return
    }
    next()
  } catch (err: any) {
    res.status(500).json({ error: 'Erro de autorização' })
  }
}
