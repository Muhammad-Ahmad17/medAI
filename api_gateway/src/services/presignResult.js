import { env } from '../config/env.js'
import { getPresignedReadUrl } from '../infra/oci.js'
import { parseObjectKeyFromUrl , isAlreadyPresigned} from '../utils/objectStorageUrl.js'

/**
 * Returns a copy of job.result with imageUrls replaced by short-lived presigned GET URLs.
 * Keeps bucket private; browsers receive time-limited access without exposing credentials.
 */
export async function presignJobResult(result) {
  if (!result || !Array.isArray(result.imageUrls) || result.imageUrls.length === 0) {
    return result
  }

  const bucket = env.OCI_BUCKET
  const expiresIn = env.OCI_PRESIGN_EXPIRES_SECONDS

  const imageUrls = await Promise.all(
    result.imageUrls.map(async (url) => {
      if (typeof url !== 'string') return url
      if (isAlreadyPresigned(url)) return url

      const key = parseObjectKeyFromUrl(url, bucket)
      if (!key) {
        console.warn('[presign] skip URL (could not parse key):', url.slice(0, 120))
        return url
      }

      try {
        return await getPresignedReadUrl(key, expiresIn)
      } catch (err) {
        console.error('[presign] failed', key, err.message)
        return url
      }
    }),
  )

  return { ...result, imageUrls }
}
