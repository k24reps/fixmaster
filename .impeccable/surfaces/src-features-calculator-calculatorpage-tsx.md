---
version: 1
slug: "src-features-calculator-calculatorpage-tsx"
primary_target: "src/features/calculator/CalculatorPage.tsx"
related_targets: ["src/features/settings/QuoteRatesTab.tsx"]
---

MODE: operate

## Direction contract

THESIS: The quote is one number the counter says out loud, computed the same way by every staff member. Since 10 Nov 2026 (afternoon) the page is the owner's price-list sheet made into an instrument: five fields, one recommended price, the same formula as the sheet. The page refuses the generic SaaS form-then-summary-card: inputs and price are one instrument, and the price moves as each input changes.

OWN-WORLD: Precision Electronics Bench, unchanged. Flat card with dotted seams for the five fields; templates are memory-preset keys (`--bg-key`, LED, mono value) that light amber while their value is in the field. The single instrument well of this screen is the LCD "HARGA REKOMENDASI" (readout palette, scanline, mono, amber digits) on top of a receipt tape. Owner-only figures (profit estimasi, markup) sit below the tape as a muted mono readout, never in the well.

STORY: Staff type the part cost (modal), tap a preset key for shipping/waste, fitting fee, warranty cover % and target profit (or type them), and read the recommended price to the customer. Owners and admins also see estimated profit and markup on cost + shipping. Owners set the keys in Pengaturan › Tarif.

FIRST VIEWPORT: Desktop: two columns inside a container; left "Hitung harga" card with the five fields (keys beside the field from a 34rem field container); right sticky register: LCD price, tape lines, Mulai ulang, owner readout. Narrow container: single column, keys under each field, with the register stuck to the bottom of the screen as a button that jumps to the tape.

FORM: two-pane instrument (inputs | register), grounded list #1, chosen over the dealt hand because the world and the POS register precedent pin it; seed:439c1b3407576cb3

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
