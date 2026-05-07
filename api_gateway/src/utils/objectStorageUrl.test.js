import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseObjectKeyFromUrl,
  isAlreadyPresigned,
} from './objectStorageUrl.js'

describe('parseObjectKeyFromUrl', () => {
  it('extracts key after bucket segment', () => {
    const url =
      'https://example.compat.objectstorage.region.oraclecloud.com/my-bucket/processed/j1/original-x.jpg'
    assert.equal(
      parseObjectKeyFromUrl(url, 'my-bucket'),
      'processed/j1/original-x.jpg',
    )
  })

  it('decodes encoded path segments', () => {
    const url =
      'https://host/bucket/folder/file%20name.jpg'
    assert.equal(parseObjectKeyFromUrl(url, 'bucket'), 'folder/file name.jpg')
  })

  it('returns null for wrong bucket', () => {
    assert.equal(
      parseObjectKeyFromUrl(
        'https://host/other/processed/x.jpg',
        'expected-bucket',
      ),
      null,
    )
  })

  it('returns null for invalid URL', () => {
    assert.equal(parseObjectKeyFromUrl('not-a-url', 'b'), null)
  })
})

describe('isAlreadyPresigned', () => {
  it('detects SigV4 query params', () => {
    assert.equal(
      isAlreadyPresigned(
        'https://host/bucket/key?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc',
      ),
      true,
    )
  })

  it('false for plain URLs', () => {
    assert.equal(
      isAlreadyPresigned(
        'https://host/bucket/processed/j1/x.jpg',
      ),
      false,
    )
  })
})
