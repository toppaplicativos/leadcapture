import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Importar rotas
import authRoutes from './routes/auth';
import inboxRoutes from './routes/inbox';
import instanceRoutes from './routes/instances';
import webhookRoutes from './routes/webhooks';
import aiRoutes from './routes/ai';
import messagesRoutes from './routes/messages';
import leadsRoutes from './routes/leads';
import productsRoutes from './routes/products';

// Carregar variáveis de ambiente
dotenv.config();

// ============================================
// INICIALIZAÇÃO
// ============================================

const app: Express = express();
const httpServer = createServer(app);

// Porta
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================
// MIDDLEWARE GLOBAL
// ============================================

// CORS
app.use(cors({
    origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// Logging de requisições
app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log();
    });
    
    next();
});

// ============================================
// ROTAS PÚBLICAS
// ============================================

// Health check
app.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: NODE_ENV,
    });
});

// ============================================
// REGISTRAR ROTAS
// ============================================

app.use('/api/auth', authRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/instances', instanceRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/products', productsRoutes);

// Rota raiz - servir index.html
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const server = httpServer.listen(parseInt(PORT as string), '0.0.0.0', () => {
    console.log();
    console.log();
    console.log();
});

// Tratamento de erros
server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
        console.error();
    } else {
        console.error('❌ Erro no servidor:', error);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📴 SIGTERM recebido, encerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor encerrado');
        process.exit(0);
    });
});

export default app;
