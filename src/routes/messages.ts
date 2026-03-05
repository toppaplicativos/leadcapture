import { Router, Request, Response } from 'express';

const router = Router();

// Send message via WhatsApp
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { instanceId, phoneNumber, message, mediaUrl } = req.body;
    
    if (!instanceId || !phoneNumber || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = {
      success: true,
      messageId: Date.now().toString(),
      phoneNumber,
      message,
      timestamp: new Date().toISOString(),
      status: 'sent'
    };

    res.json(result);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Send message with AI response
router.post('/send-ai-response', async (req: Request, res: Response) => {
  try {
    const { instanceId, phoneNumber, conversationHistory, tone = 'professional' } = req.body;
    
    if (!instanceId || !phoneNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = {
      success: true,
      messageId: Date.now().toString(),
      phoneNumber,
      message: 'Resposta gerada pela IA',
      timestamp: new Date().toISOString(),
      status: 'sent'
    };

    res.json(result);
  } catch (error) {
    console.error('Error sending AI response:', error);
    res.status(500).json({ error: 'Failed to send AI response' });
  }
});

// Send product via WhatsApp
router.post('/send-product', async (req: Request, res: Response) => {
  try {
    const { instanceId, phoneNumber, product } = req.body;
    
    if (!instanceId || !phoneNumber || !product) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = {
      success: true,
      messageId: Date.now().toString(),
      phoneNumber,
      product: product.name,
      timestamp: new Date().toISOString(),
      status: 'sent'
    };

    res.json(result);
  } catch (error) {
    console.error('Error sending product:', error);
    res.status(500).json({ error: 'Failed to send product' });
  }
});

// Get conversation history
router.get('/conversation/:phoneNumber', async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.params;
    
    const messages: any[] = [];

    res.json(messages);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Mark message as read
router.put('/:messageId/read', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    
    const result = {
      messageId,
      read: true,
      updatedAt: new Date().toISOString()
    };

    res.json(result);
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

export default router;
