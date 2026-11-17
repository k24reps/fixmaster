---
version: 1
slug: "src-features-landing-landingpage-tsx"
primary_target: "src/features/landing/LandingPage.tsx"
related_targets: ["src/features/landing/DemoGate.tsx","src/features/landing/BenchScene.tsx","src/features/demo/DemoApp.tsx"]
---

# Landing page (`/`, signed-out)

**Mode:** Persuade. **Surface:** public landing, replaces LandingPageV2 (15 Nov 2026).

**Audience:** owners of phone counters and laptop repair shops first (owner decision, 17 Nov 2026); tablet, printer, TV, audio, console and household-electronics shops are served by the same product and addressed as a complement in the FAQ. Arriving from WhatsApp, Google and social ads; mobile-first first viewport.

**Job / action:** enter shop name + WhatsApp number (format check only, no OTP) to open the real demo under that shop name. Secondary: "Mulai gratis, 50 unit" signup. Returning visitor on the same device skips the form.

**Proof:** the live desk/phone scene with labeled sample data and the real demo. No testimonials, user counts or invented numbers. The founder story was removed by the owner (15 Nov 2026); its slot is the "Untuk siapa" growth section.

**Constraints:** the app is shown on a computer and a phone, never phone-centric (this is about the screens, not the repair segment), no offline claim, no vehicle-workshop wording, ID + EN copy, reduced-motion keeps the sync readable, both themes first class.

**Narrative (owner revision, 15 Nov 2026):** speak to shops that want to start working tidier and more orderly, relevant from the solo owner to shops with staff or branches. Headline "Toko servis yang rapi dan teratur, mulai hari ini." (owner pick); a conventional-vs-FixMaster board right after the hero so visitors recognise every messy-shop habit and its answer; a three-stage section (solo, staff, branches) replaces the founder section.

## Direction contract

THESIS: The technician records at the counter and the owner's phone moves with it. The page performs that sync live, refusing the copy-left / screenshot-right SaaS hero.

OWN-WORLD: The committed Precision Electronics Bench: graphite steel on the blueprint grid, safety amber only on the gate's submit (and the pricing signup once the gate is off screen), diagnostic cyan for the sync trace, LED + mono readouts, 3px spines, dotted seams. Desk window and owner phone are drawn from app surfaces; the pricing cost gauge is the page's one instrument well.

STORY: The visitor sees a mixed queue (laptop, printer, iPhone, TV), presses the desk's action, and watches the owner's phone update stock, margin, the ready shelf and cash. They believe one entry feeds the whole business, type their shop name and WhatsApp number, and the demo opens under that name.

FIRST VIEWPORT: Slim header. Row one: headline at left over 7/12 (display clamp to about 3.3rem) and the gate panel at right over 5/12 with the amber submit. Row two, full width: desk window (about 60%), a cyan sync trace, owner phone at right; typing the shop name relabels both. On phones (since critique run 2, 16 Nov 2026): headline, a 132×150 crop of the real phone screen (Service Detail, retitled "{shop} di FixMaster" once a name is typed) linking to the scene, gate, then the scene stacked: one scrolling row of menu keys above, the computer full width, the phone standing in front of its lower-right corner.

FORM: "Dua Adegan: Meja & Ponsel", dealt lead (index 4) of surface seed d5038be4, locked by the user in the shape round.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Review record

15 Nov 2026, code-led build (no image generation on this machine). Finish review ran in-thread from the degraded checklist (no shipped reviewer agent in this harness). Disposition **fix**: (1) sync trace below the 1440×900 fold, moved to `--sync-y: 132px` so it links the active ticket row to the phone notice; (2) "RIF" monogram set in mono as costume, now the display face. Verdict pass on recaptures: (1) resolved at 1440×900, at the fold edge on 1280×720; (2) resolved. Detector: advisories only (marketing `clamp()` display sizes, 40/31px phone-frame radii). DESIGN.md: extension, one line updated (instrument well locations).

Owner revision (15 Nov 2026, before release): founder section removed; hero copy rewritten to the tidier-work narrative across shop stages; "Untuk siapa" stage rail added in its place. Recaptured desktop and mobile; luberan-x 0 at every width.
Second owner revision (15 Nov 2026): headline set to the owner's pick; comparison board added after the hero (eight situations, two lanes, stacks under 720px). Recaptured; luberan-x 0.
Critique + audit (16 Nov 2026): 29/40 design, 15/20 technical (dual sub-agent run; snapshot in `.impeccable/critique/`). Fixed in seven commits: sync strip on phones and autoplay from 140px visible; stacked step text (CLS 0.25 → ≤0.007); lead names devices and price (no eyebrow, craft-floor ban); vs board to 4 rows plus a disclosure row, module grid and trails section removed, pricing above stages; WA note under the phone field (text unchanged); Harga link on tablet/phone, mobile bar to the nearest gate; document scroll-padding, focus after render, one subscribed visitor store for every gate; price ticks instead of LEDs, cyan gauge thumb; og-image re-rendered from the landing hero. Prerender deferred as an architecture decision. Measured: overflow 0 at 9 widths × 2 themes, contrast gate clean, detector advisories only.
Real screens (16 Nov 2026, owner request): the drawn desk/phone mockup was replaced by recordings of the real app from one /demo session (scripts/shoot-bench-scene.mjs): computer (Service Detail FM-0008), tablet (Services list), phone (owner Dashboard), four steps, both themes, highlight boxes and the shop-name header measured into benchShots.json; typed shop name is overlaid on the computer screen. Caption carries the multi-device + installable narrative. The THESIS holds (one entry at the counter moves every screen); the desk/phone drawing in OWN-WORLD and FIRST VIEWPORT now means real screens in bench bezels.
Menu sync (16 Nov 2026, owner revision of the above): two devices only (computer + phone), no step phases and no autoplay. Both open on the Service Detail of FM-0008; clicking a menu in the computer sidebar, the phone bottom nav, or the menu-key row under the bench moves BOTH screens to the same page (7 recorded pages: detail, dashboard, services, pos, customers, finance, reports), switching only once both images are loaded. Other sidebar menus are dimmed and offer the full demo. The phone sync strip above the gate was removed; on phones the hero is headline → gate → scene again. The live sync is now navigation, not data change.
No sync trace (16 Nov 2026, owner): the cyan trace and "sinkron" label between computer and phone were removed so the phone could grow (0.289 → 0.32 × computer width, slightly taller than the monitor).
Critique + audit run 2 (16 Nov 2026): 28/40 design, 15/20 technical. Owner picks: phone interaction first, keep navigation sync as the message, one small real phone screen above the gate, fix everything in stages. Fixed in three commits: hotspots exempt from the global 44px coarse-pointer rule (they had stacked over the phone bottom nav), stacked scene under 900px with menu keys on top, desk taps off under 440px (derived from row height), pointerdown prefetch, mobile bar yields while the scene is visible; one shared draft for hero and closing gates, shop name in 14px device labels and the phone crop, placeholder no longer rejected by 0104, softer fake-number copy, dismissible + announced demo offer, focus after "Ganti nama toko"; parts cabinet folded into the FAQ, profit-per-unit row promoted, single closing heading (gate labelled by the section title), stage meter LEDs cyan. Measured: overflow 0 at 320–1280, contrast and token gates clean, detector advisories only.
Segment focus + simpler pricing (17 Nov 2026, owner): message narrowed to phone counters and laptop repair, HP before laptop (market word order, higher-demand keyword). Headline "Toko servis HP & laptop yang rapi dan teratur, mulai hari ini." with "HP & laptop" held by no-break spaces; lead opens with "Aplikasi untuk konter HP dan servis laptop." Pricing copy: "Harga yang adil" lead plus three rules as bold head + muted note (cap Rp 100.000 per branch per month, 50 free units, unit balance never expires); refund window, floor and what-counts moved to a new FAQ, and a "different from a POS app" FAQ added (both FAQ edits mirrored in JSON-LD). og-image re-rendered from scripts/render-brand-assets.mjs with the new headline. Measured against the previous build: overflow 0 at 320–1440; desktop and tablet gate unchanged; on phones H1 +1 line (+36px), name field still in the first viewport at 390×844, at 360×740 it slips 24px under the fold; pricing section 40–100px shorter. Detector: advisories only, none on changed lines.
