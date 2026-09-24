import 'server-only'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import type { DocTemplate, Field } from './templates'

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const NAVY = hex('#0D1F35')
const NAVY_LIGHT = hex('#24405F')
const AMBER = hex('#F59E0B')
const PAPER = hex('#FBFAF7')
const GRAY_LINE = hex('#D9D5CC')
const GRAY_TEXT = hex('#5B5750')
const INK = hex('#2B2820')
const WHITE = rgb(1, 1, 1)

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 44
const HEADER_H = 64
const FOOTER_H = 30
const CONTENT_W = PAGE_W - 2 * MARGIN
const CONTENT_TOP = PAGE_H - HEADER_H - 20
const CONTENT_BOTTOM = FOOTER_H + 16

const asset = (name: string) => fs.readFile(path.join(process.cwd(), 'src/lib/documents/assets', name))

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph) { lines.push(''); continue }
    let line = ''
    for (const word of paragraph.split(' ')) {
      const trial = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = trial
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

class Doc {
  pdf!: PDFDocument
  regular!: PDFFont
  bold!: PDFFont
  italic!: PDFFont
  logo!: { img: Awaited<ReturnType<PDFDocument['embedPng']>>; ratio: number }
  page!: PDFPage
  y = CONTENT_TOP
  pages: PDFPage[] = []
  eyebrow: string
  title: string

  constructor(eyebrow: string, title: string) {
    this.eyebrow = eyebrow
    this.title = title
  }

  static async create(brand: 'mui' | 'conversations', eyebrow: string, title: string) {
    const d = new Doc(eyebrow, title)
    d.pdf = await PDFDocument.create()
    d.pdf.setTitle(title)
    d.pdf.setAuthor("Mic'd Up Initiative")
    d.regular = await d.pdf.embedFont(StandardFonts.Helvetica)
    d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold)
    d.italic = await d.pdf.embedFont(StandardFonts.HelveticaOblique)
    const logoBytes = await asset(brand === 'conversations' ? 'conversation-wordmark-white.png' : 'mui-mark-gold.jpg')
    const img = brand === 'conversations' ? await d.pdf.embedPng(logoBytes) : await d.pdf.embedJpg(logoBytes)
    d.logo = { img, ratio: img.height / img.width }
    d.newPage()
    return d
  }

  private newPage() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H])
    this.pages.push(this.page)
    this.page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAPER })
    this.page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: NAVY })
    this.page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H - 3, width: PAGE_W, height: 3, color: AMBER })
    const logoW = this.logo.img.width > this.logo.img.height ? 110 : 40
    const logoH = logoW * this.logo.ratio
    this.page.drawImage(this.logo.img, { x: MARGIN, y: PAGE_H - HEADER_H / 2 - logoH / 2 + 3, width: logoW, height: logoH })
    const eb = this.eyebrow.toUpperCase()
    this.page.drawText(eb, { x: PAGE_W - MARGIN - this.bold.widthOfTextAtSize(eb, 9), y: PAGE_H - HEADER_H / 2 + 6, size: 9, font: this.bold, color: AMBER })
    this.page.drawText(this.title, { x: PAGE_W - MARGIN - this.bold.widthOfTextAtSize(this.title, 12), y: PAGE_H - HEADER_H / 2 - 9, size: 12, font: this.bold, color: WHITE })
    this.page.drawLine({ start: { x: MARGIN, y: FOOTER_H }, end: { x: PAGE_W - MARGIN, y: FOOTER_H }, thickness: 0.75, color: GRAY_LINE })
    this.page.drawText("Mic'd Up Initiative", { x: MARGIN, y: FOOTER_H - 12, size: 7.5, font: this.regular, color: GRAY_TEXT })
    this.y = CONTENT_TOP
  }

  /** Reserves `h` of vertical space, starting a fresh page first if it won't fit. */
  ensure(h: number) {
    if (this.y - h < CONTENT_BOTTOM) this.newPage()
  }

  sectionTitle(text: string) {
    this.ensure(28)
    this.page.drawRectangle({ x: MARGIN, y: this.y - 11, width: 4, height: 12, color: AMBER })
    this.page.drawText(text, { x: MARGIN + 10, y: this.y - 10, size: 11.5, font: this.bold, color: NAVY })
    this.y -= 26
  }

  paragraph(text: string, opts: { size?: number; font?: PDFFont; color?: RGB; indent?: number; leading?: number } = {}) {
    const size = opts.size ?? 10, font = opts.font ?? this.regular, color = opts.color ?? INK, indent = opts.indent ?? 0, leading = opts.leading ?? size * 1.35
    const lines = wrap(text, font, size, CONTENT_W - indent)
    this.ensure(lines.length * leading)
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font, color })
      this.y -= leading
    }
  }

  /** One field: its label, optional hint, and the answer in a light box — skipped entirely if left blank. */
  field(f: Field, value: string) {
    const v = value.trim()
    if (!v) return
    const labelSize = 8, valueSize = 10
    const lines = wrap(v, this.regular, valueSize, CONTENT_W - 16)
    const boxH = Math.max(20, lines.length * (valueSize * 1.35) + 12)
    this.ensure(labelSize + 4 + boxH + 10)
    this.page.drawText(f.label.toUpperCase(), { x: MARGIN, y: this.y - labelSize, size: labelSize, font: this.bold, color: NAVY_LIGHT })
    this.y -= labelSize + 5
    this.page.drawRectangle({ x: MARGIN, y: this.y - boxH, width: CONTENT_W, height: boxH, color: rgb(1, 1, 1), borderColor: GRAY_LINE, borderWidth: 0.75 })
    let ty = this.y - 8 - valueSize * 0.8
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN + 8, y: ty, size: valueSize, font: this.regular, color: INK })
      ty -= valueSize * 1.35
    }
    this.y -= boxH + 10
  }

  /** Several short fields side by side on one row (only the ones with a value; skipped if all blank).
   *  Each box grows to fit however many lines its own answer wraps to — nothing is ever cut off. */
  row(items: { field: Field; value: string }[]) {
    const filled = items.filter((i) => i.value.trim())
    if (filled.length === 0) return
    const gap = 12
    const w = (CONTENT_W - gap * (filled.length - 1)) / filled.length
    const labelSize = 8, valueSize = 10, leading = valueSize * 1.35
    const wrapped = filled.map((i) => wrap(i.value.trim(), this.regular, valueSize, w - 12))
    const boxH = Math.max(22, Math.max(...wrapped.map((l) => l.length)) * leading + 10)
    this.ensure(labelSize + 4 + boxH + 10)
    let x = MARGIN
    filled.forEach(({ field: f }, idx) => {
      this.page.drawText(f.label.toUpperCase(), { x, y: this.y - labelSize, size: labelSize, font: this.bold, color: NAVY_LIGHT })
      this.page.drawRectangle({ x, y: this.y - labelSize - 5 - boxH, width: w, height: boxH, color: rgb(1, 1, 1), borderColor: GRAY_LINE, borderWidth: 0.75 })
      let ty = this.y - labelSize - 5 - 8 - valueSize * 0.8
      for (const line of wrapped[idx]) {
        this.page.drawText(line, { x: x + 6, y: ty, size: valueSize, font: this.regular, color: INK })
        ty -= leading
      }
      x += w + gap
    })
    this.y -= labelSize + 5 + boxH + 10
  }

  async bytes() {
    const total = this.pages.length
    this.pages.forEach((p, i) => {
      const text = `Page ${i + 1} of ${total}`
      p.drawText(text, { x: PAGE_W - MARGIN - this.regular.widthOfTextAtSize(text, 7.5), y: FOOTER_H - 12, size: 7.5, font: this.regular, color: GRAY_TEXT })
    })
    return this.pdf.save()
  }
}

/** Renders a template's filled values into a branded PDF. Blank fields are simply left out. */
export async function renderTemplatePdf(template: DocTemplate, values: Record<string, string>): Promise<Uint8Array> {
  const eyebrow = template.brand === 'conversations' ? 'MUI Conversations' : "Mic'd Up Initiative"
  const doc = await Doc.create(template.brand, eyebrow, template.name.split('—').pop()?.trim() ?? template.name)

  doc.page.drawText(template.name, { x: MARGIN, y: doc.y - 4, size: 16, font: doc.bold, color: NAVY })
  doc.y -= 30

  // Short (~1-line) fields ride two-up in a row; long ones (textareas) get their own boxed block.
  let i = 0
  while (i < template.fields.length) {
    const f = template.fields[i]
    if (f.type === 'textarea') {
      doc.field(f, values[f.key] ?? '')
      i += 1
    } else {
      const pair = template.fields[i + 1]
      if (pair && pair.type !== 'textarea') {
        doc.row([{ field: f, value: values[f.key] ?? '' }, { field: pair, value: values[pair.key] ?? '' }])
        i += 2
      } else {
        doc.row([{ field: f, value: values[f.key] ?? '' }])
        i += 1
      }
    }
  }

  doc.y -= 6
  doc.paragraph(`Filled out with the MUI Team App · ${new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'long', year: 'numeric' })}`, { size: 8, font: doc.italic, color: GRAY_TEXT })

  return doc.bytes()
}
