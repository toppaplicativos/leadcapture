import { Router, Request, Response } from 'express';

const router = Router();

// Convert conversation to lead
router.post('/convert-from-conversation', async (req: Request, res: Response) => {
  try {
    const { conversationId, contactName, phoneNumber, conversationHistory } = req.body;
    
    if (!conversationId || !phoneNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const lead = {
      id: Date.now().toString(),
      name: contactName || 'Novo Lead',
      phone: phoneNumber,
      source: 'whatsapp',
      status: 'novo',
      score: 75,
      conversationId,
      createdAt: new Date().toISOString(),
      lastInteraction: new Date().toISOString()
    };

    res.json(lead);
  } catch (error) {
    console.error('Error converting conversation to lead:', error);
    res.status(500).json({ error: 'Failed to convert conversation' });
  }
});

// Analyze lead quality
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { leadId, conversationHistory, contactInfo } = req.body;
    
    if (!leadId) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }

    const analysis = {
      leadId,
      score: 85,
      grade: 'A',
      sentiment: 'positive',
      intent: 'purchase',
      recommendation: 'hot_lead',
      nextSteps: [
        'Send product catalog',
        'Schedule follow-up call',
        'Send special offer'
      ],
      reasoning: 'High engagement and purchase intent detected'
    };

    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing lead:', error);
    res.status(500).json({ error: 'Failed to analyze lead' });
  }
});

// Get lead details
router.get('/:leadId', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    
    const lead = {
      id: leadId,
      name: 'Lead Name',
      phone: '+55 11 99999-9999',
      email: 'lead@example.com',
      source: 'whatsapp',
      status: 'novo',
      score: 75,
      createdAt: new Date().toISOString(),
      conversationHistory: []
    };

    res.json(lead);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// Update lead status
router.put('/:leadId/status', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const lead = {
      id: leadId,
      status,
      updatedAt: new Date().toISOString()
    };

    res.json(lead);
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({ error: 'Failed to update lead status' });
  }
});

// List all leads
router.get('/', async (req: Request, res: Response) => {
  try {
    const leads: any[] = [];
    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

export default router;
