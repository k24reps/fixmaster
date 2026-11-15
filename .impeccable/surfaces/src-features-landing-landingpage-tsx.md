---
version: 1
slug: "src-features-landing-landingpage-tsx"
primary_target: "src/features/landing/LandingPage.tsx"
related_targets: ["src/features/landing/DemoGate.tsx","src/features/landing/BenchScene.tsx","src/features/demo/DemoApp.tsx"]
---

# Landing page (`/`, signed-out)

**Mode:** Persuade. **Surface:** public landing, replaces LandingPageV2 (15 Nov 2026).

**Audience:** owners of any electronics repair shop (HP, laptop/PC, tablet, printer, TV, audio, console, household electronics) arriving from WhatsApp, Google and social ads; mobile-first first viewport.

**Job / action:** enter shop name + WhatsApp number (format check only, no OTP) to open the real demo under that shop name. Secondary: "Mulai gratis, 50 unit" signup. Returning visitor on the same device skips the form.

**Proof:** the live desk/phone scene with labeled sample data and the real demo. No testimonials, user counts or invented numbers. The founder story was removed by the owner (15 Nov 2026); its slot is the "Untuk siapa" growth section.

**Constraints:** universal device mix (never phone-centric), no offline claim, no vehicle-workshop wording, ID + EN copy, reduced-motion keeps the sync readable, both themes first class.

**Narrative (owner revision, 15 Nov 2026):** speak to shops that want to start working tidier and more orderly, relevant from the solo owner to shops with staff or branches. Headline "Kerja lebih rapi, dari meja pertama sampai cabang kedua."; a three-stage section (solo, staff, branches) replaces the founder section.

## Direction contract

THESIS: The technician records at the counter and the owner's phone moves with it. The page performs that sync live, refusing the copy-left / screenshot-right SaaS hero.

OWN-WORLD: The committed Precision Electronics Bench: graphite steel on the blueprint grid, safety amber only on the gate's submit (and the pricing signup once the gate is off screen), diagnostic cyan for the sync trace, LED + mono readouts, 3px spines, dotted seams. Desk window and owner phone are drawn from app surfaces; the pricing cost gauge is the page's one instrument well.

STORY: The visitor sees a mixed queue (laptop, printer, iPhone, TV), presses the desk's action, and watches the owner's phone update stock, margin, the ready shelf and cash. They believe one entry feeds the whole business, type their shop name and WhatsApp number, and the demo opens under that name.

FIRST VIEWPORT: Slim header. Row one: headline at left over 7/12 (display clamp to about 3.3rem) and the gate panel at right over 5/12 with the amber submit. Row two, full width: desk window (about 60%), a cyan sync trace, owner phone at right; typing the shop name relabels both. On phones: headline, gate, then a one-row desk action above the phone.

FORM: "Dua Adegan: Meja & Ponsel", dealt lead (index 4) of surface seed d5038be4, locked by the user in the shape round.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Review record

15 Nov 2026, code-led build (no image generation on this machine). Finish review ran in-thread from the degraded checklist (no shipped reviewer agent in this harness). Disposition **fix**: (1) sync trace below the 1440×900 fold, moved to `--sync-y: 132px` so it links the active ticket row to the phone notice; (2) "RIF" monogram set in mono as costume, now the display face. Verdict pass on recaptures: (1) resolved at 1440×900, at the fold edge on 1280×720; (2) resolved. Detector: advisories only (marketing `clamp()` display sizes, 40/31px phone-frame radii). DESIGN.md: extension, one line updated (instrument well locations).

Owner revision (15 Nov 2026, before release): founder section removed; hero copy rewritten to the tidier-work narrative across shop stages; "Untuk siapa" stage rail added in its place. Recaptured desktop and mobile; luberan-x 0 at every width.
