# ร้านไทยอบอุ่น — design system

All tokens live in `src/styles.css` and use `light-dark()`.

## Colour
| Token | Light | Use |
|---|---|---|
| `--bg` | `#FBF6EA` rice cream | page |
| `--leaf` / `--leaf-bg` | `#2E5E2B` banana leaf | primary buttons, header, prices |
| `--turmeric` | `#E3A019` | table badge, highlights. Text on it is always dark (`--on-turmeric`) |
| `--chili` / `--chili-bg` | `#B3261E` | sold out, late, cancel, errors |
| `--curry` | `#9A4310` | kitchen notes |
| `--wood` | `#3A2A1C` | kitchen board |

Every text pair must reach at least 4.5:1 contrast in both themes. Status is never shown by colour alone: always add a word, an icon, or both.

## Type
- Chonburi: shop name, table number, totals
- Mitr: headings, buttons
- Sarabun 17px: body text

## Shape and interaction
- Cards: radius 18. Buttons: pill-shaped. Primary buttons are 56px tall. Touch targets are at least 44–48px.
- Focus ring: 3px turmeric. Respect reduced motion.
- Icons are SVG strokes only, never emoji (`src/components/Art.jsx`).
- Menu images use a 16:10 frame, with drawn bowl, plate or glass art when there is no photo.
- Kitchen: cream paper tickets on a dark wood rail. Staff tables: tiles with a coloured status strip plus words.
