/**
 * Parse object key from OCI S3-compatible path-style URLs:
 * https://{namespace}.compat.objectstorage.{region}.oraclecloud.com/{bucket}/{key...}
 */
export function parseObjectKeyFromUrl(urlString, bucket) {
  let pathname
  try {
    pathname = new URL(urlString).pathname
  } catch {
    return null
  }

  const trimmed = pathname.replace(/^\/+/, '')
  const segments = trimmed.split('/').filter(Boolean)
  if (segments.length < 2) return null
  if (segments[0] !== bucket) return null

  return segments
    .slice(1)
    .map((s) => decodeURIComponent(s))
    .join('/')
}

/** Detect URLs that already include SigV4 query auth */
export function isAlreadyPresigned(urlString) {
  return (
    typeof urlString === 'string' &&
    (urlString.includes('X-Amz-Algorithm=') ||
      urlString.includes('X-Amz-Signature='))
  )
}
