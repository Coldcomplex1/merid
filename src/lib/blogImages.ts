// Uploading blog images from the browser.
//
// Without this the CMS would be only half a CMS: everything else is editable in
// a browser, but adding a picture would still mean committing a file and waiting
// for a deploy.
//
// Files go to Firebase Storage under blog/<year>/, which the same admins/{uid}
// document gates (storage.rules). Images already committed under
// public/blog/screenshots stay valid: they are just paths, and the editor
// accepts a pasted path or URL as readily as an upload.
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { firebaseStorage } from './firebase'
import { slugify } from '../../api/_lib/slug.js'

/**
 * Widest image worth serving. Article images render at roughly 720 CSS pixels,
 * so this still covers a 2x display with room to spare.
 *
 * Downscaling matters more than it looks: a 4 MB Canva export dropped in as a
 * cover image is the single easiest way to make a fast blog feel slow, and it
 * happens by accident every time.
 */
const MAX_WIDTH = 1600
const JPEG_QUALITY = 0.85

/** Storage rejects anything larger; the downscale below should keep us far under. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export class ImageUploadError extends Error {}

/**
 * Redraws an oversized image onto a canvas at MAX_WIDTH.
 *
 * PNG screenshots are re-encoded as JPEG only when they are photographic in
 * size; anything already small enough is uploaded untouched so a crisp UI
 * screenshot does not pick up compression artefacts for no reason.
 */
async function downscale(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new ImageUploadError('That file is not an image.')
  }

  // SVGs have no meaningful pixel width and must not go through a canvas.
  if (file.type === 'image/svg+xml') return file

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file

  if (bitmap.width <= MAX_WIDTH && file.size <= 600 * 1024) {
    bitmap.close()
    return file
  }

  const scale = Math.min(1, MAX_WIDTH / bitmap.width)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }

  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  })

  // If the re-encode came out bigger (common for flat-colour screenshots),
  // keep the original.
  if (!blob || blob.size >= file.size) return file
  return blob
}

/**
 * Uploads an image and returns its public URL.
 *
 * The filename is derived from the original so uploads stay recognisable in the
 * Storage console, with a short timestamp suffix so re-uploading a corrected
 * version never silently serves the old one from cache.
 */
export async function uploadBlogImage(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageUploadError(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB, so export it smaller first.`,
    )
  }

  const blob = await downscale(file)

  const dot = file.name.lastIndexOf('.')
  const stem = dot > 0 ? file.name.slice(0, dot) : file.name
  const isJpeg = blob.type === 'image/jpeg' && blob !== file
  const extension = isJpeg ? 'jpg' : dot > 0 ? file.name.slice(dot + 1).toLowerCase() : 'png'
  const name = `${slugify(stem) || 'image'}-${Date.now().toString(36)}.${extension}`

  const path = `blog/${new Date().getUTCFullYear()}/${name}`

  try {
    const storageRef = ref(firebaseStorage(), path)
    await uploadBytes(storageRef, blob, {
      contentType: blob.type || file.type,
      // A year, because the timestamped filename means a given URL's bytes
      // never change.
      cacheControl: 'public, max-age=31536000, immutable',
    })
    return await getDownloadURL(storageRef)
  } catch (error) {
    const code = (error as { code?: string })?.code ?? ''
    if (code === 'storage/unauthorized') {
      throw new ImageUploadError(
        'Storage refused the upload. Check that your admins/<uid> document exists and that storage.rules has been deployed. See BLOG_WORKFLOW.md.',
      )
    }
    if (code === 'storage/unknown' || code.includes('bucket')) {
      throw new ImageUploadError(
        'Could not reach the storage bucket. Confirm the bucket name in the Firebase console matches storageBucket in src/lib/firebase.ts. See BLOG_WORKFLOW.md.',
      )
    }
    throw new ImageUploadError(
      error instanceof Error ? error.message : 'Upload failed for an unknown reason.',
    )
  }
}
