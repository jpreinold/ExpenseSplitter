export interface ParsedReceiptItem {
  id: string
  description: string
  amount: number
  confidence: number
  sourceLine: string
}

export interface ParsedReceiptData {
  items: ParsedReceiptItem[]
  subtotal?: number
  tax?: number
  tip?: number
  total?: number
  rawText: string
}

const currencyPattern = /(-?\d+(?:[.,]\d{2})?)\s*$/

const keywordMatchers: Record<'subtotal' | 'tax' | 'tip' | 'total', RegExp> = {
  subtotal: /(sub\s*-?\s*total|subtotal)/i,
  tax: /(tax|hst|gst|vat)/i,
  tip: /(tip|gratuity|service charge)/i,
  total: /(total|balance due|amount due|grand total)/i,
}

const noiseLineMatcher = /(table|guest|order|invoice|server|cashier)/i

function parseCurrency(value: string): number {
  const normalised = value.replace(/,/g, '')
  const parsed = Number.parseFloat(normalised)
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0
}

function normaliseLine(line: string): string {
  return line
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

let idCounter = 0
function nextItemId() {
  idCounter += 1
  return `receipt_item_${idCounter}`
}

export function parseReceiptText(rawText: string): ParsedReceiptData {
  idCounter = 0
  const lines = rawText
    .split(/\r?\n/)
    .map(normaliseLine)
    .filter((line) => line.length > 0)

  const result: ParsedReceiptData = {
    items: [],
    rawText: rawText.trim(),
  }

  lines.forEach((line) => {
    const amountMatch = line.match(currencyPattern)
    if (!amountMatch || amountMatch.index === undefined) {
      return
    }

    const amount = parseCurrency(amountMatch[1])
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.01) {
      return
    }

    const descriptionPart = line.slice(0, amountMatch.index).trim()

    if (noiseLineMatcher.test(descriptionPart)) {
      return
    }

    if (keywordMatchers.subtotal.test(descriptionPart)) {
      result.subtotal = amount
      return
    }
    if (keywordMatchers.tax.test(descriptionPart)) {
      result.tax = (result.tax ?? 0) + amount
      return
    }
    if (keywordMatchers.tip.test(descriptionPart)) {
      result.tip = (result.tip ?? 0) + amount
      return
    }
    if (keywordMatchers.total.test(descriptionPart)) {
      result.total = amount
      return
    }

    const description = descriptionPart.replace(/[#\d]+x\s*/i, '').trim()
    result.items.push({
      id: nextItemId(),
      description: description || `Item ${result.items.length + 1}`,
      amount,
      confidence: 0.6,
      sourceLine: line,
    })
  })

  if (!result.total && result.items.length > 0) {
    const subtotal = result.items.reduce((sum, item) => sum + item.amount, 0)
    result.subtotal = Number(subtotal.toFixed(2))
    result.total = Number(
      (subtotal + (result.tax ?? 0) + (result.tip ?? 0)).toFixed(2),
    )
  }

  return result
}


