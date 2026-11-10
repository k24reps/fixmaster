---
version: 1
slug: "src-features-calculator-calculatorpage-tsx"
primary_target: "src/features/calculator/CalculatorPage.tsx"
related_targets: ["src/features/settings/QuoteRatesTab.tsx"]
---

MODE: operate

## Direction contract

THESIS: The quote is one number the counter says out loud, computed the same way by every staff member. The page refuses the generic SaaS form-then-summary-card: inputs and price are one instrument, and the price moves as each input changes.

OWN-WORLD: Precision Electronics Bench, unchanged. Flat cards with dotted seams for inputs; the single instrument well of this screen is the LCD total (readout palette, scanline, mono, amber digits) on top of a receipt tape of customer lines. LED + value for risk and DP. Owner-only figures sit below the tape as a muted mono readout, never in the well.

STORY: Staff pick device category and job tier, add parts (from stock or typed modal), tick extras, and read TOTAL and DP to the customer, copying the breakdown when needed. Owners also see modal, warranty cover, laba and % of modal before overhead.

FIRST VIEWPORT: Desktop: two columns inside a container; left "Pekerjaan" (category, tier with its note), "Sparepart", "Biaya tambahan"; right sticky quote panel: LCD TOTAL + DP row, risk banner, tape lines, Salin rincian. Narrow container: single column, panel after inputs, with a sticky bottom strip showing TOTAL and DP that jumps to the panel.

FORM: two-pane instrument (inputs | register), grounded list #1, chosen over the dealt hand because the world and the POS register precedent pin it; seed:439c1b3407576cb3

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
