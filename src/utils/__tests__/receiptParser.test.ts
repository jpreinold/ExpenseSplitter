import { describe, expect, test } from 'vitest'
import { parseReceiptText } from '../receiptParser'

describe('parseReceiptText', () => {
  test('extracts items and summary rows from OCR text', () => {
    const raw = `
      Pad Thai           12.50
      Spring Rolls        8.00
      Tax                 1.80
      Tip                 3.00
      Total              25.30
    `

    const parsed = parseReceiptText(raw)

    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]).toMatchObject({ description: 'Pad Thai', amount: 12.5 })
    expect(parsed.items[1]).toMatchObject({ description: 'Spring Rolls', amount: 8 })
    expect(parsed.tax).toBeCloseTo(1.8, 2)
    expect(parsed.tip).toBeCloseTo(3, 2)
    expect(parsed.total).toBeCloseTo(25.3, 2)
  })

  test('derives subtotal and total when not provided explicitly', () => {
    const raw = `
      Burger             11.00
      Fries               4.50
    `

    const parsed = parseReceiptText(raw)

    expect(parsed.items).toHaveLength(2)
    expect(parsed.subtotal).toBeCloseTo(15.5, 2)
    expect(parsed.total).toBeCloseTo(15.5, 2)
  })

  test('skips lines without numeric amounts', () => {
    const raw = `
      Table 12
      Coke x2            7.00
      Thank you!
    `

    const parsed = parseReceiptText(raw)
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0].description).toContain('Coke')
  })
})


