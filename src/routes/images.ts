import { Router, Request, Response } from "express";
import { GeminiService } from "../services/gemini";
import { logger } from "../utils/logger";

const router = Router();
const geminiService = new GeminiService();

export interface UploadedImage {
  id: string;
  name: string;
  base64: string;
  mimeType: string;
  size: number;
}

export interface ImageAnalysisRequest {
  images: UploadedImage[];
  prompt: string;
  context?: string;
  detailedAnalysis?: boolean;
}

export interface ImageAnalysisResponse {
  success: boolean;
  result?: string;
  error?: string;
  imagesProcessed: number;
  analysisTime: number;
}

/**
 * POST /api/images/analyze
 * Analisa imagens usando Gemini e retorna resultado baseado no prompt
 */
router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { images, prompt, context, detailedAnalysis } = req.body as ImageAnalysisRequest;

    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nenhuma imagem fornecida"
      });
    }

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Prompt vazio"
      });
    }

    const startTime = Date.now();

    logger.info(`Analisando ${images.length} imagem(ns) com Gemini...`);

    try {
      const result = await geminiService.analyzeImages(
        images,
        prompt,
        context,
        detailedAnalysis
      );

      const analysisTime = Date.now() - startTime;

      res.json({
        success: true,
        result,
        imagesProcessed: images.length,
        analysisTime
      } as ImageAnalysisResponse);
    } catch (error: any) {
      logger.error(`Erro ao analisar imagens: ${error.message}`);

      res.status(500).json({
        success: false,
        error: error.message || "Erro ao analisar imagens",
        imagesProcessed: images.length,
        analysisTime: Date.now() - startTime
      });
    }
  } catch (error: any) {
    logger.error(`Erro na requisição de análise: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message || "Erro na requisição"
    });
  }
});

/**
 * POST /api/images/generate-description
 * Gera descrição automática para imagens
 */
router.post("/generate-description", async (req: Request, res: Response) => {
  try {
    const { images } = req.body as { images: UploadedImage[] };

    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nenhuma imagem fornecida"
      });
    }

    const prompt = `Analise estas imagens e gere uma descrição detalhada e profissional para cada uma.

INSTRUÇÕES:
- Seja conciso mas informativo
- Foque em elementos relevantes (objetos, cores, layout, texto visível)
- Se for um design/criativo, analise a composição e estilo
- Se for um produto, liste características visíveis
- Formato: Um parágrafo por imagem

Gere APENAS as descrições, uma por imagem, separadas por "---"`;

    try {
      const result = await geminiService.analyzeImages(images, prompt, undefined, true);

      res.json({
        success: true,
        result,
        imagesProcessed: images.length
      });
    } catch (error: any) {
      logger.error(`Erro ao gerar descrição: ${error.message}`);

      res.status(500).json({
        success: false,
        error: error.message || "Erro ao gerar descrição"
      });
    }
  } catch (error: any) {
    logger.error(`Erro na requisição: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message || "Erro na requisição"
    });
  }
});

/**
 * POST /api/images/generate-creative
 * Gera conteúdo criativo baseado em imagens (anúncios, captions, etc)
 */
router.post("/generate-creative", async (req: Request, res: Response) => {
  try {
    const { images, type = "caption" } = req.body as {
      images: UploadedImage[];
      type?: "caption" | "ad" | "description" | "hashtags";
    };

    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nenhuma imagem fornecida"
      });
    }

    let prompt = "";

    switch (type) {
      case "caption":
        prompt = `Gere uma caption criativa para Instagram/Facebook para esta(s) imagem(ns).

INSTRUÇÕES:
- Máximo 300 caracteres
- Tom engajante e amigável
- Use 3-5 emojis relevantes
- Inclua call-to-action sutil
- Português brasileiro`;
        break;

      case "ad":
        prompt = `Crie um texto publicitário profissional para estas imagens.

INSTRUÇÕES:
- Máximo 500 caracteres
- Destaque benefícios principais
- Inclua call-to-action claro
- Tom persuasivo mas confiável
- Português brasileiro`;
        break;

      case "hashtags":
        prompt = `Gere hashtags relevantes para estas imagens.

INSTRUÇÕES:
- Máximo 30 hashtags
- Misture hashtags populares com nichos
- Sem números ou caracteres especiais
- Separadas por espaço`;
        break;

      default:
        prompt = `Gere uma descrição completa baseada nesta(s) imagem(ns).`;
    }

    try {
      const result = await geminiService.analyzeImages(images, prompt);

      res.json({
        success: true,
        result,
        imagesProcessed: images.length,
        type
      });
    } catch (error: any) {
      logger.error(`Erro ao gerar conteúdo: ${error.message}`);

      res.status(500).json({
        success: false,
        error: error.message || "Erro ao gerar conteúdo"
      });
    }
  } catch (error: any) {
    logger.error(`Erro na requisição: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message || "Erro na requisição"
    });
  }
});

/**
 * POST /api/images/ocr
 * Extrai texto das imagens (OCR)
 */
router.post("/ocr", async (req: Request, res: Response) => {
  try {
    const { images } = req.body as { images: UploadedImage[] };

    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nenhuma imagem fornecida"
      });
    }

    const prompt = `Extraia TODO o texto visível nesta(s) imagem(ns).

INSTRUÇÕES:
- Preserve a estrutura e layout do texto original
- Inclua TODO texto, mesmo que em ordem estranha
- Se houver múltiplas imagens, separe por "--- IMAGEM X ---"
- Mantenha espaçamento e quebras de linha quando possível
- Se não há texto visível, indique "Nenhum texto detectado"`;

    try {
      const result = await geminiService.analyzeImages(images, prompt);

      res.json({
        success: true,
        result,
        imagesProcessed: images.length
      });
    } catch (error: any) {
      logger.error(`Erro ao extrair texto: ${error.message}`);

      res.status(500).json({
        success: false,
        error: error.message || "Erro ao extrair texto"
      });
    }
  } catch (error: any) {
    logger.error(`Erro na requisição: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message || "Erro na requisição"
    });
  }
});

/**
 * POST /api/images/batch-process
 * Processa múltiplas imagens com diferentes prompts
 */
router.post("/batch-process", async (req: Request, res: Response) => {
  try {
    const { images, prompts } = req.body as {
      images: UploadedImage[];
      prompts: string[];
    };

    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nenhuma imagem fornecida"
      });
    }

    if (!prompts || prompts.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nenhum prompt fornecido"
      });
    }

    const results: Array<{
      prompt: string;
      result: string;
    }> = [];

    for (const prompt of prompts) {
      try {
        const result = await geminiService.analyzeImages(images, prompt);
        results.push({ prompt, result });
      } catch (error: any) {
        logger.error(`Erro ao processar com prompt: ${error.message}`);
        results.push({
          prompt,
          result: `Erro: ${error.message}`
        });
      }
    }

    res.json({
      success: true,
      results,
      imagesProcessed: images.length,
      promptsProcessed: prompts.length
    });
  } catch (error: any) {
    logger.error(`Erro na requisição batch: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message || "Erro na requisição"
    });
  }
});

export default router;
