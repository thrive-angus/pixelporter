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

    const customNameHeader = req.headers['x-custom-name'];
    const customName = typeof customNameHeader === 'string'
      ? customNameHeader.trim()
      : '';

    // If SVG, convert to PNG so n8n OpenAI node can process it (SVG not supported by vision)
    let imageBuffer = req.file.buffer;
    let imageMime = req.file.mimetype || 'image/webp';
    if (imageMime === 'image/svg+xml') {
      imageBuffer = await sharp(req.file.buffer).png().toBuffer();
      imageMime = 'image/png';
    }

    const fileBase64 = imageBuffer.toString('base64');
    const originalName = req.file.originalname || 'image.webp';

    res.json({
      customName,
      fileBase64,
      mimeType: imageMime,
      originalName,
    });
  } catch (err) {
    console.error('Prepare file error:', err);
    res.status(500).json({ error: 'File preparation failed', message: err.message });
  }
});

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => console.log(`Sharp service running on port ${PORT}`));
