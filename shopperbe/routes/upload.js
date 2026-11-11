const router = require('express').Router();
const multer = require('multer');
const { uploadToS3, deleteFromS3 } = require('../utils/s3');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// Single or multiple file upload to S3
router.post('/', upload.any(), async (req, res) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No image or file uploaded' });
    }

    const folder = req.body.folder || 'admin_uploads';

    if (files.length === 1) {
      const result = await uploadToS3(files[0], folder);
      return res.json({ url: result.url, key: result.key });
    }

    // Multiple files
    const results = await Promise.all(files.map(f => uploadToS3(f, folder)));
    return res.json({
      url: results[0].url,
      urls: results.map(r => r.url),
      keys: results.map(r => r.key),
    });
  } catch (error) {
    console.error('S3 upload error:', error);
    res.status(500).json({
      error: 'Failed to upload to AWS S3',
      message: error.message,
    });
  }
});

// Delete file from S3
router.delete('/', async (req, res) => {
  try {
    const { url, key } = req.body;
    if (!url && !key) {
      return res.status(400).json({ error: 'No url or key provided' });
    }
    await deleteFromS3(url || key);
    res.json({ success: true, message: 'File deleted from S3' });
  } catch (error) {
    console.error('S3 delete error:', error);
    res.status(500).json({
      error: 'Failed to delete file from S3',
      message: error.message,
    });
  }
});

module.exports = router;
