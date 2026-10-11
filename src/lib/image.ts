// 올린 사진을 WebP로 줄여서 저장한다. 원본이 크더라도 화면에 필요한 크기만 남긴다.

const ACCEPT = /^image\/(png|jpeg|webp|gif)$/;
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const MB = 1024 * 1024;

export interface CompressOptions {
  /** 원본 파일 최대 크기 (MB) */
  maxInputMb: number;
  /** 긴 변 최대 픽셀 */
  maxSide: number;
  quality?: number;
}

export async function compressImage(file: File | undefined | null, opts: CompressOptions): Promise<Blob> {
  if (!file || !ACCEPT.test(file.type)) {
    throw new Error('PNG, JPG, WebP 또는 GIF 사진을 선택해주세요.');
  }
  if (file.size > opts.maxInputMb * MB) {
    throw new Error(`사진은 ${opts.maxInputMb}MB 이하로 올려주세요.`);
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, opts.maxSide / bitmap.width, opts.maxSide / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 사진을 처리할 수 없어요.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let blob = await toBlob(canvas, opts.quality ?? 0.85);
  if (blob.size > 2 * MB) blob = await toBlob(canvas, 0.6);
  if (blob.size > 2 * MB) throw new Error('사진 용량을 줄여 다시 올려주세요.');
  return blob;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('사진을 변환하지 못했어요.'))), 'image/webp', quality),
  );
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('사진을 읽지 못했어요.'));
    reader.readAsDataURL(blob);
  });
}

export const IMAGE_PRESETS = {
  candidate: { maxInputMb: 2, maxSide: 1400 },
  thumbnail: { maxInputMb: 8, maxSide: 1200 },
  banner: { maxInputMb: 8, maxSide: 1000 },
} satisfies Record<string, CompressOptions>;
