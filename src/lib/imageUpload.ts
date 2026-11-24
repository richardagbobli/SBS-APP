import { uploadRegistrationSchoolLogo, uploadSchoolImage } from './firestoreService';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_RAW_FILE_BYTES = 8 * 1024 * 1024; // 8 MB pre-resize limit

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read the selected image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The selected file is not a valid image.'));
    img.src = src;
  });
}

async function encodeImageFile(file: File, category: 'logo' | 'pupil'): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Please choose a PNG, JPG, or WebP image file.');
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('Image is too large. Please select an image under 8 MB.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadHtmlImage(rawDataUrl);

  const maxDim = category === 'logo' ? 420 : 480;
  let targetWidth = img.naturalWidth || img.width;
  let targetHeight = img.naturalHeight || img.height;

  if (targetWidth > maxDim || targetHeight > maxDim) {
    const scale = Math.min(maxDim / targetWidth, maxDim / targetHeight);
    targetWidth = Math.max(1, Math.round(targetWidth * scale));
    targetHeight = Math.max(1, Math.round(targetHeight * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser canvas is unavailable for image processing.');
  }

  // Keep transparent background for PNG logos; fill white for pupil JPEG portraits
  const outputMime =
    category === 'logo' && file.type === 'image/png' ? 'image/png' : 'image/jpeg';

  if (outputMime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return outputMime === 'image/png'
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', 0.86);
}

/**
 * Resizes and compresses a selected image in the browser before uploading to
 * the authenticated school upload endpoint. Preserves PNG transparency for
 * school logos and outputs crisp portrait JPEGs for pupil photographs.
 */
export async function prepareAndUploadImage(
  file: File,
  schoolId: string,
  category: 'logo' | 'pupil'
): Promise<string> {
  const encodedDataUrl = await encodeImageFile(file, category);
  return uploadSchoolImage(schoolId, encodedDataUrl, category);
}

/**
 * Resizes and uploads a school logo during School Admin school profile editing
 * (works even before the school record has been saved).
 */
export async function prepareAndUploadRegistrationLogo(file: File): Promise<string> {
  const encodedDataUrl = await encodeImageFile(file, 'logo');
  return uploadRegistrationSchoolLogo(encodedDataUrl);
}

/**
 * Uploads an extracted transparent PNG signature data URL to the server upload vault.
 * Falls back cleanly to the compact PNG data URL if the device is currently offline.
 */
export async function uploadExtractedSignature(
  schoolId: string,
  pngDataUrl: string
): Promise<string> {
  if (!schoolId || !pngDataUrl.startsWith('data:image/')) {
    return pngDataUrl;
  }
  try {
    return await uploadSchoolImage(schoolId, pngDataUrl, 'signature');
  } catch {
    // Compact extracted signatures (<30KB) work directly in HTML & jsPDF if upload fails offline
    return pngDataUrl;
  }
}
