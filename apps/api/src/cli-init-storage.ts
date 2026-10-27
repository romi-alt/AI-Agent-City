import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { loadEnv } from './env.js';

/**
 * Local-development setup: create the private object-storage bucket if it does not exist yet.
 * Production buckets are provisioned outside the application, so this refuses to run there.
 */
const env = loadEnv();
if (env.NODE_ENV === 'production') throw new Error('storage:init is for local development only.');

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
});

try {
  await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  console.log(`bucket ${env.S3_BUCKET}: already exists`);
} catch (err) {
  if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw err;
  await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
  console.log(`bucket ${env.S3_BUCKET}: created`);
} finally {
  s3.destroy();
}
