const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const crypto = require('crypto');

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
const bucketName = process.env.AWS_BUCKET_NAME || process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME;

const clientConfig = {
  region,
};

const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY;

if (accessKeyId && secretAccessKey) {
  clientConfig.credentials = {
    accessKeyId,
    secretAccessKey,
  };
}

if (process.env.AWS_ENDPOINT) {
  clientConfig.endpoint = process.env.AWS_ENDPOINT;
  clientConfig.forcePathStyle = true;
}

const s3Client = new S3Client(clientConfig);

/**
 * Upload a file to AWS S3
 * @param {Object} file - Multer file object (buffer, originalname, mimetype)
 * @param {string} folder - Target directory in S3 bucket (default: 'admin_uploads')
 * @returns {Promise<{url: string, key: string, bucket: string}>}
 */
async function uploadToS3(file, folder = 'admin_uploads') {
  if (!bucketName) {
    throw new Error('AWS_BUCKET_NAME is not configured in environment variables. Please set AWS_BUCKET_NAME in .env');
  }

  if (!file || !file.buffer) {
    throw new Error('No file buffer provided for upload');
  }

  const rawExt = path.extname(file.originalname || '').toLowerCase();
  const ext = rawExt || (file.mimetype ? `.${file.mimetype.split('/')[1]}` : '');
  const baseName = (file.originalname ? path.basename(file.originalname, rawExt) : 'file')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 50);

  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const cleanFolder = (folder || 'admin_uploads').replace(/^\/+|\/+$/g, '');
  const key = `${cleanFolder}/${timestamp}-${randomSuffix}-${baseName}${ext}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || 'application/octet-stream',
  });

  await s3Client.send(command);

  let url;
  if (process.env.AWS_S3_CUSTOM_DOMAIN) {
    const domain = process.env.AWS_S3_CUSTOM_DOMAIN.replace(/\/+$/, '');
    url = `https://${domain}/${key}`;
  } else if (region === 'us-east-1') {
    url = `https://${bucketName}.s3.amazonaws.com/${key}`;
  } else {
    url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
  }

  return { url, key, bucket: bucketName };
}

/**
 * Delete a file from AWS S3
 * @param {string} keyOrUrl - Key or public URL of the object
 */
async function deleteFromS3(keyOrUrl) {
  if (!bucketName || !keyOrUrl) return;

  let key = keyOrUrl;
  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    try {
      const parsed = new URL(keyOrUrl);
      key = parsed.pathname.replace(/^\/+/, '');
    } catch {
      key = keyOrUrl;
    }
  }

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return await s3Client.send(command);
}

module.exports = {
  s3Client,
  uploadToS3,
  deleteFromS3,
  bucketName,
  region,
};

