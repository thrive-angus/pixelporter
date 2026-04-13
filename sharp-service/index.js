const express = require('express');
const multer = require('multer');
const sharp = require('sharp');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const quality = parseInt(req.body.quality) || 80;

    const webpBuffer = await sharp(req.file.buffer)
      .webp({ quality })
      .toBuffer();

    const originalName = req.file.originalname || 'image.png';
    const hasExtension = /\.(png|jpg|jpeg)$/i.test(originalName);
    const newName = hasExtension
      ? originalName.replace(/\.(png|jpg|jpeg)$/i, '.webp')
      : originalName + '.webp';

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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/generate-alt-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const apiKey = req.headers['x-openai-key'] || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Missing OpenAI API key. Set OPENAI_API_KEY env var or pass x-openai-key header.' });
    }

    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/webp';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an SEO specialist. Generate a concise, descriptive alt text for the given image. The alt text should be under 125 characters, descriptive of the visual content, and optimized for SEO. Return ONLY the alt text, nothing else.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: dataUrl, detail: 'low' },
              },
            ],
          },
        ],
        max_tokens: 100,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'OpenAI error', details: data });
    }

    const altText = data.choices[0].message.content.trim();

    // Build SEO-friendly filename from alt text
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
    const fileBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/webp';

    res.json({ altText, seoFilename, fileBase64, mimeType });
  } catch (err) {
    console.error('Alt text generation error:', err);
    res.status(500).json({ error: 'Alt text generation failed', message: err.message });
  }
});

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => console.log(`Sharp service running on port ${PORT}`));
