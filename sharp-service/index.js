const express = require('express');
const multer = require('multer');
const sharp = require('sharp');

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * ----------------------------------------
 * IMAGE CONVERT + RESIZE ENDPOINT
 * ----------------------------------------
 */
app.post('/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const quality = parseInt(req.body.quality) || 80;
    const width = parseInt(req.body.width) || null;
    const height = parseInt(req.body.height) || null;

    let pipeline = sharp(req.file.buffer);

    // Resize if provided
    if (width || height) {
      pipeline = pipeline.resize({
        width: width || undefined,
        height: height || undefined,
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    const webpBuffer = await pipeline
      .webp({ quality })
      .toBuffer();

    const originalName = req.file.originalname || 'image.png';
    const newName = originalName.replace(/\.(png|jpg|jpeg|webp)$/i, '') + '.webp';

    res.set({
      'Content-Type': 'image/webp',
      'Content-Disposition': `attachment; filename="${newName}"`,
      'X-Original-Name': newName,
    });

    res.send(webpBuffer);

  } catch (err) {
    console.error('Conversion error:', err);
    res.status(500).json({ error: 'Conversion failed', message: err.message });
  }
});


/**
 * ----------------------------------------
 * HEALTH CHECK
 * ----------------------------------------
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});


/**
 * ----------------------------------------
 * ALT TEXT GENERATION
 * ----------------------------------------
 */
app.post('/generate-alt-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const customName = req.headers['x-custom-name'];
    let altText;

    /**
     * ----------------------------------------
     * USE CUSTOM NAME IF PROVIDED
     * ----------------------------------------
     */
    if (customName && customName !== 'undefined' && customName.trim() !== '') {
      altText = customName
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } else {

      /**
       * ----------------------------------------
       * OPENAI ALT TEXT GENERATION
       * ----------------------------------------
       */
      const apiKey = req.headers['x-openai-key'] || process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({
          error: 'Missing OpenAI API key. Set OPENAI_API_KEY or pass x-openai-key header.'
        });
      }

      let imageBuffer = req.file.buffer;
      let imageMime = req.file.mimetype || 'image/webp';

      // Convert SVG → PNG (required for vision models)
      if (imageMime === 'image/svg+xml') {
        imageBuffer = await sharp(req.file.buffer).png().toBuffer();
        imageMime = 'image/png';
      }

      const base64 = imageBuffer.toString('base64');
      const dataUrl = `data:${imageMime};base64,${base64}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Write one concise SEO-friendly alt text under 20 words. Describe only what is visible. Do not include "image of". Return only the alt text.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: dataUrl,
                    detail: 'low'
                  }
                }
              ]
            }
          ],
          max_tokens: 40
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: 'OpenAI error',
          details: data
        });
      }

      altText = data.choices[0].message.content.trim().replace(/\.+$/, '');
    }

    /**
     * ----------------------------------------
     * GENERATE SEO FILENAME
     * ----------------------------------------
     */
    const originalName = req.file.originalname || 'image.webp';
    const ext = originalName.substring(originalName.lastIndexOf('.')) || '.webp';

    const slug = altText
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 80)
      .replace(/-$/, '');

    const seoFilename = slug + ext;

    /**
     * ----------------------------------------
     * RESPONSE
     * ----------------------------------------
     */
    res.json({
      altText,
      seoFilename,
      fileBase64: req.file.buffer.toString('base64'),
      mimeType: req.file.mimetype || 'image/webp'
    });

  } catch (err) {
    console.error('Alt text generation error:', err);
    res.status(500).json({
      error: 'Alt text generation failed',
      message: err.message
    });
  }
});


/**
 * ----------------------------------------
 * START SERVER
 * ----------------------------------------
 */
const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`Sharp service running on port ${PORT}`);
});