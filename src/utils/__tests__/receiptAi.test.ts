import { describe, expect, test } from 'vitest'
import { normalizeAiReceiptPayload } from '../receiptAi'

describe('normalizeAiReceiptPayload', () => {
  test('keeps valid items and coerces numeric values', () => {
    const payload = {
      items: [
        { description: 'Pad Thai', amount: '12.5' },
        { description: 'Noodles', amount: 9.0, source_line: 'Noodles .... 9.00' },
        { description: '', amount: 4 },
        { description: 'Water', amount: 'not-a-number' },
      ],
      subtotal: '21.50',
      tax: '1.80',
      tip: 3,
      total: '26.3',
    }

    const normalized = normalizeAiReceiptPayload(payload)

    expect(normalized.items).toHaveLength(2)
    expect(normalized.items[0]).toMatchObject({ description: 'Pad Thai', amount: 12.5 })
    expect(normalized.items[1]).toMatchObject({ description: 'Noodles', amount: 9 })
    expect(normalized.subtotal).toBeCloseTo(21.5, 2)
    expect(normalized.tax).toBeCloseTo(1.8, 2)
    expect(normalized.tip).toBeCloseTo(3, 2)
    expect(normalized.total).toBeCloseTo(26.3, 2)
  })

  test('returns empty items when payload is malformed', () => {
    const normalized = normalizeAiReceiptPayload(null)
    expect(normalized.items).toHaveLength(0)
    expect(normalized.total).toBeUndefined()
  })
})


