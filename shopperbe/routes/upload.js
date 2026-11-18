const router = require('express').Router();
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { uploadToS3, deleteFromS3, bucketName } = require('../utils/s3');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const ALLOWED_FOLDERS = new Set([
  'admin_uploads',
  'products',
  'categories',
  'banners',
  'vendors',
  'advertisements',
  'returns',
]);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/pdf',
]);

function checkUploadAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch {
      // Token expired or invalid, continue as unauthenticated image upload
    }
  }
  next();
}

function requireAdminOnly(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Only image uploads (JPEG, PNG, WebP, GIF, AVIF) are allowed'));
    }
    cb(null, true);
  },
});

// Single or multiple file upload to S3 (supports authenticated users & onboarding/returns)
router.post('/', checkUploadAuth, (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload error' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No image or file uploaded' });
    }

    const rawFolder = String(req.body.folder || 'admin_uploads').replace(/^\/+|\/+$/g, '');
    const folder = ALLOWED_FOLDERS.has(rawFolder) ? rawFolder : 'admin_uploads';

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

// Delete file from S3 (authenticated admin only)
router.delete('/', requireAdminOnly, async (req, res) => {
  try {
    const { url, key } = req.body;
    const target = key || url;
    if (!target || typeof target !== 'string') {
      return res.status(400).json({ error: 'No url or key provided' });
    }

    let resolvedKey = target.trim();
    if (resolvedKey.startsWith('http://') || resolvedKey.startsWith('https://')) {
      const parsed = new URL(resolvedKey);
      const customDomain = (process.env.AWS_S3_CUSTOM_DOMAIN || '').replace(/\/+$/, '');
      const isBucketHost = bucketName && parsed.hostname.startsWith(`${bucketName}.s3`);
      const isCustomHost = customDomain && parsed.hostname === customDomain;
      if (!isBucketHost && !isCustomHost) {
        return res.status(400).json({ error: 'URL does not belong to configured S3 bucket' });
      }
      resolvedKey = parsed.pathname.replace(/^\/+/, '');
    }

    const prefix = resolvedKey.split('/')[0];
    if (!ALLOWED_FOLDERS.has(prefix) || resolvedKey.includes('..')) {
      return res.status(400).json({ error: 'Invalid S3 object key' });
    }

    await deleteFromS3(resolvedKey);
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
