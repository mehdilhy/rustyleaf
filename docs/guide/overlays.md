# Ground Overlays

Pin an image, video, or SVG to a geographic bounding box. Overlays are
repositioned every frame so they track the map as you pan/zoom.

## `ImageOverlay`

```js
import { ImageOverlay } from 'rustyleaf'

const overlay = new ImageOverlay(
  '/historical-map.jpg',
  [
    [48.85, 2.35], // south-west
    [48.86, 2.36], // north-east
  ],
  { opacity: 0.7, alt: 'Historical map', interactive: true }
).addTo(map)

overlay.setUrl('/new-image.jpg')
overlay.setOpacity(0.5)
overlay.setBounds(newBounds)
overlay.bringToFront()
overlay.bringToBack()
```

`ImageOverlayOptions`:

| Option | Type | Description |
| --- | --- | --- |
| `opacity` | `number?` | 0–1 opacity |
| `alt` | `string?` | Alt text |
| `className` | `string?` | CSS class |
| `interactive` | `boolean?` | Emit pointer events |

## `VideoOverlay`

Extends `ImageOverlay` with video options.

```js
import { VideoOverlay } from 'rustyleaf'

new VideoOverlay(
  '/clip.mp4',
  [[48.85, 2.35], [48.86, 2.36]],
  { autoplay: true, loop: true, muted: true, opacity: 0.8 }
).addTo(map)
```

## `SVGOverlay`

Position an existing SVG element.

```js
import { SVGOverlay } from 'rustyleaf'

const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
// ... build your SVG ...
new SVGOverlay(svg, [[48.85, 2.35], [48.86, 2.36]]).addTo(map)
```

## Common methods

All three overlays share: `getBounds()`, `setBounds(bounds)`,
`setOpacity(n)`, `getElement()`, `addTo(map)`, `remove()`,
`bringToFront()`, `bringToBack()`.
