import { useCallback, useRef, useState } from 'react'
import { preprocessReceiptImage } from '../utils/receiptImageProcessing'

type ReceiptOcrStatus = 'idle' | 'processing' | 'error' | 'success'

type OcrJob = {
  cancelled: boolean
}

export function useReceiptOcr() {
  const [status, setStatus] = useState<ReceiptOcrStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const jobRef = useRef<OcrJob | null>(null)

  const recognise = useCallback(async (file: File): Promise<string> => {
    const job: OcrJob = { cancelled: false }
    jobRef.current = job
    setStatus('processing')
    setProgress(0)
    setError(null)

    try {
      const tesseractModule: typeof import('tesseract.js') = await import('tesseract.js')
      const { createWorker, PSM } = tesseractModule
      if (!createWorker) {
        throw new Error('Receipt scanning is unavailable in this browser.')
      }

      const { fullImage, totalsImage } = await preprocessReceiptImage(file)

      const worker = await createWorker(undefined, undefined, {
        logger: (message) => {
          if (message.status === 'recognizing text' && typeof message.progress === 'number') {
            const scaledProgress = Math.round(message.progress * 65)
            setProgress(clampProgress(scaledProgress))
          }
        },
      })
      const typedWorker = worker as typeof worker & {
        load: () => Promise<unknown>
        loadLanguage: (lang: string) => Promise<unknown>
        initialize: (lang: string) => Promise<unknown>
      }

      try {
        await typedWorker.load()
        await typedWorker.loadLanguage('eng')
        await typedWorker.initialize('eng')
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          preserve_interword_spaces: '1',
        })

        const fullResult = await worker.recognize(fullImage)

        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
          tessedit_char_whitelist: '0123456789$€£.,:-/% ',
        })

        setProgress(85)
        const totalsResult = await worker.recognize(totalsImage)

        if (job.cancelled) {
          throw new Error('Receipt scan cancelled')
        }

        setStatus('success')
        setProgress(100)
        const fullText = fullResult.data.text ?? ''
        const totalsText = totalsResult.data.text ?? ''
        return `${fullText}\n${totalsText}`.trim()
      } finally {
        await worker.terminate()
      }
    } catch (err) {
      if (!job.cancelled) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to scan receipt')
      }
      throw err instanceof Error ? err : new Error('Failed to scan receipt')
    }
  }, [])

  const reset = useCallback(() => {
    if (jobRef.current) {
      jobRef.current.cancelled = true
      jobRef.current = null
    }
    setStatus('idle')
    setProgress(0)
    setError(null)
  }, [])

  return {
    status,
    progress,
    error,
    recognise,
    reset,
  }
}

function clampProgress(value: number) {
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

