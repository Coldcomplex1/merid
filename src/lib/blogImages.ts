// Uploading blog images from the browser.
//
// Without this the CMS would be only half a CMS: everything else is editable in
// a browser, but adding a picture would still mean committing a file and waiting
// for a deploy.
//
// Files go to Cloudinary, but this file cannot upload anything on its own: no
// credential for that account exists in the bundle. It asks
// /api/blog-upload-signature first, which checks admins/{uid} and returns a
// signature scoped to one path, then sends the bytes straight to Cloudinary.
// Two requests instead of one, in exchange for the account secret never being
// shipped to a browser.
//
// The bytes skip our own server on purpose - a serverless function has a body
// size limit that a photo can exceed, and proxying would spend bandwidth to
// achieve nothing that the signature does not already achieve.
//
// Images already committed under public/blog/screenshots stay valid: they are
// just paths, and the editor accepts a pasted path or URL as readily as an
// upload.
import { firebaseAuth } from './firebase'

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

/** Refused before upload; the downscale below should keep us far under. */
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

interface UploadGrant {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
  publicId: string
}

/**
 * Asks our own server to authorise one upload.
 *
 * Every refusal here is a different problem with a different fix, so each says
 * which one it is rather than collapsing into "upload failed".
 */
async function requestUploadGrant(filename: string): Promise<UploadGrant> {
  const user = firebaseAuth().currentUser
  if (!user) throw new ImageUploadError('You are signed out. Sign in again and retry.')

  const idToken = await user.getIdToken()

  const response = await fetch('/api/blog-upload-signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ filename }),
  })

  if (response.ok) return (await response.json()) as UploadGrant

  const detail = await response.json().catch(() => ({}) as { code?: string; missing?: string[] })

  if (detail.code === 'rules-not-deployed') {
    throw new ImageUploadError(
      'The server could not check your admin status because firestore.rules was never deployed. Run "firebase deploy --only firestore:rules". See BLOG_WORKFLOW.md section 1.4.',
    )
  }
  if (detail.code === 'not-admin') {
    throw new ImageUploadError(
      'This account is not on the blog admin list, so it cannot upload images. See BLOG_WORKFLOW.md section 1.2.',
    )
  }
  if (detail.code === 'server-misconfigured') {
    throw new ImageUploadError(
      `The server is missing ${(detail.missing || []).join(', ') || 'its Cloudinary configuration'}. Add it in the Vercel project's environment variables. See BLOG_WORKFLOW.md section 1.3.`,
    )
  }
  if (response.status === 401) {
    throw new ImageUploadError('Your session expired. Reload the page and sign in again.')
  }
  throw new ImageUploadError(`Could not authorise the upload (HTTP ${response.status}).`)
}

/**
 * Uploads an image and returns its public URL.
 *
 * The filename is derived from the original so uploads stay recognisable in the
 * Cloudinary console, with a short timestamp suffix so re-uploading a corrected
 * version never silently serves the old one from cache. The server picks the
 * final path; this only suggests a name.
 */
export async function uploadBlogImage(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageUploadError(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB, so export it smaller first.`,
    )
  }

  const blob = await downscale(file)
  const grant = await requestUploadGrant(file.name)

  // Exactly the parameters the server signed. Changing any of them here - the
  // folder above all - invalidates the signature and Cloudinary refuses the
  // upload, which is what keeps the destination the server's decision.
  const form = new FormData()
  form.append('file', blob)
  form.append('api_key', grant.apiKey)
  form.append('timestamp', String(grant.timestamp))
  form.append('signature', grant.signature)
  form.append('folder', grant.folder)
  form.append('public_id', grant.publicId)

  let response: Response
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${grant.cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    })
  } catch {
    throw new ImageUploadError('Could not reach Cloudinary. Check your connection and retry.')
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    throw new ImageUploadError(
      detail?.error?.message
        ? `Cloudinary refused the upload: ${detail.error.message}`
        : `Cloudinary refused the upload (HTTP ${response.status}).`,
    )
  }

  const result = (await response.json()) as { secure_url?: string }
  if (!result.secure_url) {
    throw new ImageUploadError('Cloudinary accepted the upload but returned no URL.')
  }
  return result.secure_url
}
