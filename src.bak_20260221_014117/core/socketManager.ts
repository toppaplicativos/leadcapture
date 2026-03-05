/**
 * SOCKET MANAGER - Gerenciamento de WebSocket com Socket.io
 * 
 * Este arquivo contém toda a lógica para:
 * - Inicializar servidor Socket.io
 * - Gerenciar conexões de clientes
 * - Emitir eventos em tempo real
 * - Notificações de novas mensagens
 * - Atualização de status de instâncias
 * - Indicador de digitação
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from './logger';

// ============================================
// TIPOS
// ============================================

interface UserSocket {
  userId: string;
  socketId: string;
  connectedAt: Date;
}

interface RoomMessage {
  conversationId: string;
  message: {
    id: string;
    body: string;
    from_me: boolean;
    timestamp: Date;
  };
}

// ============================================
// SOCKET MANAGER
// ============================================

class SocketManager {
  private io: SocketIOServer | null = null;
  private userSockets: Map<string, UserSocket[]> = new Map();

  /**
   * Inicializa o servidor Socket.io
   * @param httpServer - Servidor HTTP Express
   */
  initialize(httpServer: HTTPServer): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Configurar eventos de conexão
    this.io.on('connection', (socket: Socket) => {
      logger.info(`[Socket] Nova conexão: ${socket.id}`);

      // Evento: Usuário conecta
      socket.on('user:connect', (data: { userId: string; token: string }) => {
        this.handleUserConnect(socket, data);
      });

      // Evento: Usuário desconecta
      socket.on('disconnect', () => {
        this.handleUserDisconnect(socket);
      });

      // Evento: Entrar em conversa
      socket.on('conversation:join', (data: { conversationId: string }) => {
        this.handleConversationJoin(socket, data);
      });

      // Evento: Sair de conversa
      socket.on('conversation:leave', (data: { conversationId: string }) => {
        this.handleConversationLeave(socket, data);
      });

      // Evento: Digitando
      socket.on('typing:start', (data: { conversationId: string }) => {
        this.handleTypingStart(socket, data);
      });

      // Evento: Parou de digitar
      socket.on('typing:stop', (data: { conversationId: string }) => {
        this.handleTypingStop(socket, data);
      });

      // Evento: Ping (keep-alive)
      socket.on('ping', () => {
        socket.emit('pong');
      });
    });

    logger.info('[Socket] Servidor Socket.io inicializado');
    return this.io;
  }

  /**
   * Manipula conexão de usuário
   * @param socket - Socket do cliente
   * @param data - Dados do usuário
   */
  private handleUserConnect(socket: Socket, data: { userId: string; token: string }): void {
    const { userId } = data;

    // Armazenar socket do usuário
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, []);
    }

    this.userSockets.get(userId)!.push({
      userId,
      socketId: socket.id,
      connectedAt: new Date(),
    });

    // Juntar o socket a uma sala com o ID do usuário
    socket.join(`user:${userId}`);

    logger.info(`[Socket] Usuário ${userId} conectado (socket: ${socket.id})`);
  }

  /**
   * Manipula desconexão de usuário
   * @param socket - Socket do cliente
   */
  private handleUserDisconnect(socket: Socket): void {
    // Encontrar e remover socket do usuário
    for (const [userId, sockets] of this.userSockets.entries()) {
      const index = sockets.findIndex(s => s.socketId === socket.id);
      if (index !== -1) {
        sockets.splice(index, 1);
        logger.info(`[Socket] Usuário ${userId} desconectado (socket: ${socket.id})`);

        // Se não há mais sockets para este usuário, remover entrada
        if (sockets.length === 0) {
          this.userSockets.delete(userId);
        }
        break;
      }
    }
  }

  /**
   * Manipula entrada em conversa
   * @param socket - Socket do cliente
   * @param data - ID da conversa
   */
  private handleConversationJoin(socket: Socket, data: { conversationId: string }): void {
    const { conversationId } = data;
    socket.join(`conversation:${conversationId}`);
    logger.info(`[Socket] Socket ${socket.id} entrou na conversa ${conversationId}`);
  }

  /**
   * Manipula saída de conversa
   * @param socket - Socket do cliente
   * @param data - ID da conversa
   */
  private handleConversationLeave(socket: Socket, data: { conversationId: string }): void {
    const { conversationId } = data;
    socket.leave(`conversation:${conversationId}`);
    logger.info(`[Socket] Socket ${socket.id} saiu da conversa ${conversationId}`);
  }

  /**
   * Manipula início de digitação
   * @param socket - Socket do cliente
   * @param data - ID da conversa
   */
  private handleTypingStart(socket: Socket, data: { conversationId: string }): void {
    const { conversationId } = data;
    // Emitir para todos na conversa (exceto o remetente)
    socket.to(`conversation:${conversationId}`).emit('typing:start', {
      conversationId,
      socketId: socket.id,
    });
  }

  /**
   * Manipula parada de digitação
   * @param socket - Socket do cliente
   * @param data - ID da conversa
   */
  private handleTypingStop(socket: Socket, data: { conversationId: string }): void {
    const { conversationId } = data;
    socket.to(`conversation:${conversationId}`).emit('typing:stop', {
      conversationId,
      socketId: socket.id,
    });
  }

  /**
   * Emite nova mensagem para todos na conversa
   * @param conversationId - ID da conversa
   * @param message - Dados da mensagem
   */
  emitNewMessage(conversationId: string, message: any): void {
    if (!this.io) return;

    this.io.to(`conversation:${conversationId}`).emit('message:new', {
      conversationId,
      message,
    });

    logger.info(`[Socket] Nova mensagem emitida para conversa ${conversationId}`);
  }

  /**
   * Emite atualização de conversa
   * @param conversationId - ID da conversa
   * @param conversation - Dados da conversa
   */
  emitConversationUpdate(conversationId: string, conversation: any): void {
    if (!this.io) return;

    this.io.to(`conversation:${conversationId}`).emit('conversation:update', {
      conversationId,
      conversation,
    });

    logger.info(`[Socket] Conversa ${conversationId} atualizada`);
  }

  /**
   * Emite notificação de nova conversa para usuário
   * @param userId - ID do usuário
   * @param conversation - Dados da conversa
   */
  emitNewConversation(userId: string, conversation: any): void {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit('conversation:new', {
      conversation,
    });

    logger.info(`[Socket] Nova conversa notificada para usuário ${userId}`);
  }

  /**
   * Emite atualização de status de instância
   * @param userId - ID do usuário
   * @param instanceId - ID da instância
   * @param status - Novo status
   */
  emitInstanceStatusUpdate(userId: string, instanceId: string, status: string): void {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit('instance:status', {
      instanceId,
      status,
    });

    logger.info(`[Socket] Status da instância ${instanceId} atualizado para ${status}`);
  }

  /**
   * Emite QR Code para usuário
   * @param userId - ID do usuário
   * @param instanceId - ID da instância
   * @param qrCode - Dados do QR Code
   */
  emitQRCode(userId: string, instanceId: string, qrCode: string): void {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit('instance:qrcode', {
      instanceId,
      qrCode,
    });

    logger.info(`[Socket] QR Code emitido para usuário ${userId}`);
  }

  /**
   * Emite erro para usuário
   * @param userId - ID do usuário
   * @param error - Mensagem de erro
   */
  emitError(userId: string, error: string): void {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit('error', {
      message: error,
    });

    logger.error(`[Socket] Erro emitido para usuário ${userId}: ${error}`);
  }

  /**
   * Obtém número de usuários conectados
   */
  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  /**
   * Obtém número de sockets conectados
   */
  getConnectedSocketsCount(): number {
    let count = 0;
    for (const sockets of this.userSockets.values()) {
      count += sockets.length;
    }
    return count;
  }

  /**
   * Obtém instância do Socket.io
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }
}

// Exportar singleton
export const socketManager = new SocketManager();
