## Product Assets

All 9 toothpaste product photos are in `assets/products/`. **Black background (PNG) — original shoot files, no background removal.**

⛔ **PRODUCT IMAGE BACKGROUND — ABSOLUTE RULE — APPLIES TO EVERY SLIDE IN THE DECK:**
- Product images MUST ONLY appear on slides with a **dark background** (#1A1A1A or #000000)
- This rule applies to ALL slide types without exception: hero product slides, comparison slides, catalog slides, influencer slides, closing slides — every single one
- If your slide structure requires a product image AND a light background, you have two options:
  1. **Switch that slide to a dark background** (preferred)
  2. **Remove the product image** and use text/stat callout instead
- Never place a black-bg PNG product photo on a white, light gray, or any light-colored background — the black rectangle will be clearly visible and will look unprofessional
- ⚠️ **Known violation point:** comparison/product-card slides (e.g., two-column product layout like Slide 11 in Influencer decks) default to a light layout but often contain product images. **Always make these slides dark.**

| File | SKU | Product |
|---|---|---|
| `assets/products/DE201_schwarz.png` | DE201 | SCHWARZ — charcoal whitening |
| `assets/products/DE202_detox.png` | DE202 | DETOX — cinnamon/clove anti-inflammatory |
| `assets/products/DE203_ginger.png` | DE203 | GINGER FORCE — gum care |
| `assets/products/DE205_cococannabis.png` | DE205 | COCOCANNABIS — hemp + coconut regeneration |
| `assets/products/DE206_symbios.png` | DE206 | SYMBIOS — probiotic |
| `assets/products/DE209_thermo39.png` | DE209 | THERMO 39° — thermal enzyme |
| `assets/products/DE210_innoweiss.png` | DE210 | INNOWEISS — enzyme whitening |
| `assets/products/DE207_buddy.png` | DE207 | BUDDY MICROBIES — kids 0+ |
| `assets/products/DE208_evolution.png` | DE208 | EVOLUTION kids — kids 5+ |

| `assets/products/DE105_schwarz_brush.png` | DE105 | SCHWARZ brush — charcoal bristles |
| `assets/products/DE101_etalon.png` | DE101 | ETALON — 360° spiral bristles |
| `assets/products/DE106_sensitiv.png` | DE106 | SENSITIV — ultra-soft |
| `assets/products/DE107_mittel.png` | DE107 | MITTEL — medium stiffness |
| `assets/products/DE116_zero.png` | DE116 | ZERO — orthodontic compact |
| `assets/products/DE119_grosse.png` | DE119 | GROSSE — gold-ion wide-arc |
| `assets/products/DE120_nano_massage.png` | DE120 | NANO MASSAGE — silicone nano-silver |
| `assets/products/DE122_aktiv.png` | DE122 | AKTIV — ultra-soft orthodontic |
| `assets/products/DE130_intensiv.png` | DE130 | INTENSIV — 7× density micro-tapered |
| `assets/products/DE116_zero_floss.png` | DE116 | SCHWARZ floss — charcoal (blister) |
| `assets/products/DE112_expanding_floss.png` | DE112 | EXPANDING floss (blister) |
| `assets/products/DE111_waxed_floss.png` | DE111 | WAXED MINT floss (blister) |

### Product image code pattern

⛔ **PROPORTION LOCK — ABSOLUTE RULE**
- **NEVER set both `w` and `h` as independent fixed values** — this stretches the image to fill the box regardless of its real ratio.
- **ALWAYS derive one dimension from the other** using the image's actual pixel ratio via `image-size`.
- The only allowed operations: **uniform scale** (resize while keeping aspect ratio locked) and **repositioning**.
- If a layout requires a different size — change only one dimension and calculate the other. Never deform.
- ⛔ **Known violation point:** product card slides and hero slides — developers commonly hardcode both `w` and `h` to "fill the slot." This is forbidden. Always load real dimensions, always derive.

```javascript
const fs = require("fs");
const { sizeOf } = require("image-size"); // npm install image-size
const SKILL_PATH = "/mnt/skills/user/das-presenter/assets";

function getProductImage(sku) {
  const map = {
    "DE201": "DE201_schwarz", "DE202": "DE202_detox",
    "DE203": "DE203_ginger", "DE205": "DE205_cococannabis",
    "DE206": "DE206_symbios", "DE209": "DE209_thermo39",
    "DE210": "DE210_innoweiss", "DE207": "DE207_buddy",
    "DE208": "DE208_evolution"
  };
  const name = map[sku];
  if (!name) return null;
  const filePath = `${SKILL_PATH}/products/${name}.png`;
  const data = "image/png;base64," + fs.readFileSync(filePath).toString("base64");
  const dims = sizeOf(filePath);           // actual pixel dimensions
  const ratio = dims.width / dims.height;  // real aspect ratio — lock this
  return { data, ratio };
}

// Usage on slide — always derive one dimension from the ratio:
const img = getProductImage("DE206");
if (img) {
  const h = 4.0;                                      // set ONE dimension
  const w = parseFloat((h * img.ratio).toFixed(3));   // derive the other from real ratio
  slide.addImage({ data: img.data, x: 5.5, y: 0.8, w, h });
  // DO NOT pass a sizing block — w and h already reflect the true ratio.
  // Passing sizing: { type: "contain", w, h } with mismatched values is what causes distortion.
}
```

**Rule:** If the layout slot is taller than the image allows at the desired width — reduce `h` to fit, recalculate `w`. Never force both dimensions independently.


## Logo Usage (MANDATORY)

### ⛔ LOGO RULES — ABSOLUTE, NO EXCEPTIONS

**The Das Experten logo must NEVER be modified in any way.**
- Never stretch, squeeze, skew, or distort the logo in any direction
- Never crop the logo — wave symbol + "das experten" + "innovativ und praktisch" must always be fully visible
- Never apply transforms that alter the width-to-height ratio
- Both logos are **transparent-background files** — place them directly on any slide background without masking or modification
- The only allowed operations: **uniform scale** (resize while keeping aspect ratio locked) and **repositioning**
- If a layout requires a different size — scale uniformly, never deform

In pptxgenjs, always derive `w` from `h` using the ratio constant for each logo — never set both `w` and `h` independently.

Never use text as a logo substitute. Always embed the real logo files from `assets/`. These are the only two official Das Experten logos.

| File | Background | Format | Use on |
|---|---|---|---|
| `assets/logo_light.jpg` | White background | JPG | All **light** content slides |
| `assets/logo_dark.png` | Transparent (white waves + text) | PNG 944×264px | All **dark** slides — cover, stat slides, closing |

### Logo dimensions

**logo_light.jpg** — use ratio `3.003 : 1` (approximate — matches original proportions)
- Footer: `h = 0.36"` → `w = parseFloat((0.36 * 3.003).toFixed(3))` = `1.081"` · bottom-right, 0.25" from edges
- Cover / closing hero: `h = 0.56"` → `w = parseFloat((0.56 * 3.003).toFixed(3))` = `1.682"` · top-left `x=0.45, y=0.38`

**logo_dark.png** — 944 × 264 px → ratio `3.576 : 1`
- Footer: `h = 0.36"` → `w = parseFloat((0.36 * 3.576).toFixed(3))` = `1.287"` · bottom-right, 0.25" from edges
- Cover / closing hero: `h = 0.56"` → `w = parseFloat((0.56 * 3.576).toFixed(3))` = `2.003"` · top-left `x=0.45, y=0.38`

### Logo code pattern (pptxgenjs)

```javascript
const fs = require("fs");
const SKILL_PATH = "/mnt/skills/user/das-presenter/assets";

const logoLightB64 = "image/jpeg;base64," + fs.readFileSync(SKILL_PATH + "/logo_light.jpg").toString("base64");
const logoDarkB64  = "image/png;base64,"  + fs.readFileSync(SKILL_PATH + "/logo_dark.png").toString("base64");

const LOGO_LIGHT_RATIO = 3.003;
const LOGO_DARK_RATIO  = 944 / 264;   // 3.576

function addLogo(slide, dark) {
  const h = 0.36;
  const ratio = dark ? LOGO_DARK_RATIO : LOGO_LIGHT_RATIO;
  const w = parseFloat((h * ratio).toFixed(3));
  const data = dark ? logoDarkB64 : logoLightB64;
  slide.addImage({ data, x: parseFloat((9.75 - w).toFixed(3)), y: 5.18, w, h });
}

function addLogoCover(slide) {
  // Cover always dark bg — use dark logo
  const h = 0.56;
  const w = parseFloat((h * LOGO_DARK_RATIO).toFixed(3));
  slide.addImage({ data: logoDarkB64, x: 0.45, y: 0.38, w, h });
}
```

Call `addLogo(s, true)` on dark slides, `addLogo(s, false)` on light slides, `addLogoCover(s)` on cover and closing slide.

---

