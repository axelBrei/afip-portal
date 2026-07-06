# CLAUDE.md — afip-portal

## Design System

All UI work must follow `DESIGN.md`. Read it before touching any component, page, or layout.

### Core constraints

- **Canvas**: `#010102` (near-black with faint blue tint) — the page background. Never use `#000000`.
- **Primary accent**: lavender-blue `#5e6ad2` — used only on brand mark, primary CTA, focus rings, and link emphasis. Nowhere else.
- **Surface ladder**: canvas → surface-1 → surface-2 → surface-3 → surface-4. Use it for hierarchy. Never skip levels or use lavender as a card fill.
- **Dark only**. No light mode.

### Typography

- Display sizes (≥28px): weight 600, negative letter-spacing (–0.6px to –3.0px). Never weight 700+ on display.
- Body: weight 400, –0.05px tracking.
- Font stack: `SF Pro Display, -apple-system, system-ui, Segoe UI, Roboto`. Inter or Geist Sans are acceptable open-source substitutes.
- Mono only inside code/product-screenshot contexts.

### Components

- **Buttons**: `border-radius: 8px` (`rounded.md`). Never pill CTAs.
- **Cards**: `border-radius: 12px` (`rounded.lg`), 1px hairline border, `surface-1` background, 24px padding.
- **Product screenshot panels**: `border-radius: 16px` (`rounded.xl`).
- **Inputs**: `surface-1` background, 8px/12px padding, `rounded.md`. Focus ring: 2px `#5e69d1` at 50% opacity.
- **No drop shadows on dark surfaces.** Depth comes from the surface ladder + hairline borders.

### Forbidden

- No second chromatic accent (no orange, pink, green, etc. on marketing surfaces).
- No atmospheric gradients or spotlight cards.
- No light-mode pages.
- No pill-rounded CTAs.
- No lavender as a section background or card fill.

### Spacing

Base unit 4px. Key tokens: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 96px. Card padding 24px; testimonial cards 32px; CTA banners 48px.

### Responsive

- Card grids: 3-up → 2-up at 1024px → 1-up below 768px.
- Nav collapses to hamburger below 768px.
- Touch targets: buttons ≥40px, inputs ≥44px.

---

## React / Next.js conventions

- All custom `components/ui/` input-like components **must use `React.forwardRef`** so react-hook-form and other ref-based libraries can attach to the DOM node.
- Forms use `react-hook-form` + `zodResolver`. Always provide `defaultValues` in `useForm` to avoid `invalid_type` errors from Zod on untouched fields.
- App Router (`app/`). Session management via `iron-session`.
