import type { ParsedReceiptData } from './receiptParser'

type JsonContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: string; text?: string }
    >

type RawAiPayload = {
  items?: Array<{
    description?: string
    amount?: number | string
    source_line?: string
    sourceLine?: string
  }>
  subtotal?: number | string
  tax?: number | string
  tip?: number | string
  total?: number | string
}

export type NormalizedAiReceipt = {
  items: Array<{
    description: string
    amount: number
    sourceLine?: string
  }>
  subtotal?: number
  tax?: number
  tip?: number
  total?: number
}

const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
          amount: { type: 'number' },
          source_line: { type: 'string' },
        },
        required: ['description', 'amount', 'source_line'],
      },
    },
    subtotal: { type: 'number' },
    tax: { type: 'number' },
    tip: { type: 'number' },
    total: { type: 'number' },
  },
  required: ['items', 'subtotal', 'tax', 'tip', 'total'],
} as const

function createLocalId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(2))
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return Number(parsed.toFixed(2))
    }
  }
  return undefined
}

export function normalizeAiReceiptPayload(payload: unknown): NormalizedAiReceipt {
  const record = (payload ?? {}) as RawAiPayload
  const items = Array.isArray(record.items) ? record.items : []

  const normalizedItems = items.reduce<NormalizedAiReceipt['items']>((accumulator, current) => {
    if (!current || typeof current !== 'object') {
      return accumulator
    }
    const description =
      typeof current.description === 'string' ? current.description.trim() : ''
    const amount = toNumber(current.amount)
    if (!description || amount === undefined || amount <= 0) {
      return accumulator
    }
    const sourceLine =
      typeof current.source_line === 'string'
        ? current.source_line
        : typeof current.sourceLine === 'string'
          ? current.sourceLine
          : description
    accumulator.push({
      description,
      amount,
      sourceLine,
    })
    return accumulator
  }, [])

  const subtotal = toNumber(record.subtotal)
  const tax = toNumber(record.tax)
  const tip = toNumber(record.tip)
  const total = toNumber(record.total)

  return {
    items: normalizedItems,
    subtotal: subtotal && subtotal > 0 ? subtotal : undefined,
    tax: tax && tax > 0 ? tax : undefined,
    tip: tip && tip > 0 ? tip : undefined,
    total: total && total > 0 ? total : undefined,
  }
}

function extractTextFromContent(content: JsonContent | undefined): string | null {
  if (!content) return null
  if (typeof content === 'string') {
    return content
  }
  const textBlock = content.find((block) => 'text' in block && typeof block.text === 'string')
  return textBlock?.text ?? null
}

function buildParsedDataFromAi(normalized: NormalizedAiReceipt, rawText: string): ParsedReceiptData {
  return {
    items: normalized.items.map((item) => ({
      id: createLocalId('receipt_ai'),
      description: item.description,
      amount: item.amount,
      confidence: 0.85,
      sourceLine: item.sourceLine ?? item.description,
    })),
    subtotal: normalized.subtotal,
    tax: normalized.tax,
    tip: normalized.tip,
    total: normalized.total,
    rawText,
  }
}

export async function extractReceiptItemsWithAI(rawText: string, apiKey: string): Promise<ParsedReceiptData> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
        model: 'gpt-4.1-mini',
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'receipt_items',
          schema: RECEIPT_SCHEMA,
          strict: true,
        },
      },
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that extracts restaurant receipt line items. Respond with strict JSON that matches the provided schema. If a subtotal, tax, tip, or total cannot be found, output 0 for that field. Do not include narration.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Receipt OCR text:\n${rawText}\n\nReturn only the JSON.`,
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: JsonContent } }>
  }
  const content = data.choices?.[0]?.message?.content
  const jsonText = extractTextFromContent(content)
  if (!jsonText) {
    throw new Error('OpenAI response did not contain JSON text.')
  }

  const parsed = JSON.parse(jsonText) as RawAiPayload
  const normalized = normalizeAiReceiptPayload(parsed)
  return buildParsedDataFromAi(normalized, rawText)
}


