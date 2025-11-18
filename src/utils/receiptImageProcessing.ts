type PreprocessedReceiptImages = {
  fullImage: Blob
  totalsImage: Blob
}

const MIN_TARGET_WIDTH = 1000
const MAX_TARGET_WIDTH = 1800
const TOTALS_SECTION_RATIO = 0.35

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = (event) => {
      URL.revokeObjectURL(objectUrl)
      reject(event)
    }
    image.src = objectUrl
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function enhanceImageData(imageData: ImageData) {
  const { data, width, height } = imageData
  const totalPixels = width * height
  let sum = 0

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const gray = 0.299 * r + 0.587 * g + 0.114 * b
    sum += gray
  }

  const average = sum / totalPixels
  const contrastFactor = 1.35
  const threshold = clamp(average * 0.95, 110, 170)

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const gray = 0.299 * r + 0.587 * g + 0.114 * b
    const contrasted = clamp((gray - 128) * contrastFactor + 128, 0, 255)
    const value = contrasted > threshold ? 255 : 0
    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
    data[index + 3] = 255
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to convert canvas to blob.'))
        return
      }
      resolve(blob)
    }, 'image/png', 1)
  })
}

export async function preprocessReceiptImage(file: File): Promise<PreprocessedReceiptImages> {
  const image = await loadImage(file)
  const desiredWidth = clamp(image.width, MIN_TARGET_WIDTH, MAX_TARGET_WIDTH)
  const scale = desiredWidth / image.width
  const width = Math.round(image.width * scale)
  const height = Math.round(image.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Unable to create drawing context.')
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const imageData = context.getImageData(0, 0, width, height)
  enhanceImageData(imageData)
  context.putImageData(imageData, 0, 0)

  const fullImage = await canvasToBlob(canvas)

  const totalsCanvas = document.createElement('canvas')
  const totalsHeight = Math.max(Math.round(height * TOTALS_SECTION_RATIO), 200)
  totalsCanvas.width = width
  totalsCanvas.height = totalsHeight
  const totalsContext = totalsCanvas.getContext('2d')
  if (!totalsContext) {
    throw new Error('Unable to create totals context.')
  }
  totalsContext.drawImage(
    canvas,
    0,
    height - totalsHeight,
    width,
    totalsHeight,
    0,
    0,
    width,
    totalsHeight,
  )

  const totalsImage = await canvasToBlob(totalsCanvas)

  return {
    fullImage,
    totalsImage,
  }
}


