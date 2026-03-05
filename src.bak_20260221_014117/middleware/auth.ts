/**
 * MIDDLEWARE DE AUTENTICAÇÃO - Validação de JWT
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
        res.status(403).json({ error: 'Token inválido ou expirado' });
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
