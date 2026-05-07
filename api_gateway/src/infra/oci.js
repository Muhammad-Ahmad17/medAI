import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../config/env.js'

const s3 = new S3Client({
  endpoint: env.OCI_ENDPOINT,
  region: env.OCI_REGION,
  credentials: {
    accessKeyId: env.OCI_ACCESS_KEY,
    secretAccessKey: env.OCI_SECRET_KEY,
  },
  forcePathStyle: true,
})

export async function uploadToOCI(buffer, filename, mimetype) {
  const timestamp = Date.now()
  const objectKey = `uploads/${timestamp}-${filename}`

  try {
    const command = new PutObjectCommand({
      Bucket: env.OCI_BUCKET,
      Key: objectKey,
      Body: buffer,
      ContentType: mimetype
    })

    await s3.send(command)
    console.log(`✅ [OCI] Uploaded to ${objectKey}`)
    return objectKey
  } catch (err) {
    console.error('❌ [OCI] Upload failed:', err.message)
    throw err
  }
}

export async function downloadFromOCI(objectKey) {
  try {
    const command = new GetObjectCommand({
      Bucket: env.OCI_BUCKET,
      Key: objectKey,
    })

    const response = await s3.send(command)
    const buffer = await response.Body.transformToByteArray()
    return Buffer.from(buffer)
  } catch (err) {
    console.error('❌ [OCI] Download failed:', err.message)
    throw err
  }
}

export function getOCIUrl(objectKey) {
  return `${env.OCI_ENDPOINT}/${env.OCI_BUCKET}/${objectKey}`
}

/**
 * SigV4 pre-signed GET for private bucket objects (OCI S3-compatible API).
 */
export async function getPresignedReadUrl(objectKey, expiresInSeconds) {
  const command = new GetObjectCommand({
    Bucket: env.OCI_BUCKET,
    Key: objectKey,
  })
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds })
}
