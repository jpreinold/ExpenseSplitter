import { useCallback, useRef, useState } from 'react'

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
      const tesseractModule: {
        default?: { recognize: typeof import('tesseract.js')['recognize'] }
        recognize?: typeof import('tesseract.js')['recognize']
      } = await import('tesseract.js')
      const recogniseFn =
        tesseractModule.recognize ?? tesseractModule.default?.recognize
      if (!recogniseFn) {
        throw new Error('Receipt scanning is unavailable in this browser.')
      }

      const result = await recogniseFn(file, 'eng', {
        logger: (message) => {
          if (message.status === 'recognizing text' && typeof message.progress === 'number') {
            setProgress(Math.round(message.progress * 100))
          }
        },
      })

      if (job.cancelled) {
        throw new Error('Receipt scan cancelled')
      }

      setStatus('success')
      setProgress(100)
      return result.data.text ?? ''
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


