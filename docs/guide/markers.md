# Markers

Markers in Rustyleaf are rendered as **GPU sprites inside the Rust/WASM core**,
not DOM overlays — so they scale like the rest of the layers. They support
`Icon` / `DivIcon`, popups & tooltips, drag, opacity/z-index, and Leaflet-style
events.

## Basic marker

```js
import { Marker } from 'rustyleaf'

const marker = new Marker([48.8584, 2.2945])
marker.addTo(map)
```

## Icons

> ⚠️ **Bitmap icons (`iconUrl` etc.) are not rendered yet.** A plain `Icon`
> creates the standard round GPU sprite — `iconUrl`, `iconRetinaUrl`,
> `iconSize`, `iconAnchor`, `popupAnchor`, and `shadowUrl` are accepted but
> **do not affect rendering**. Only `DivIcon` currently renders custom icon
> content (as a DOM overlay). Bitmap-icon rendering is on the roadmap.

```js
import { Marker, DivIcon } from 'rustyleaf'

const marker = new Marker([48.8584, 2.2945], {
  icon: new DivIcon({
    html: '<div style="font-size:20px">📍</div>',
    className: 'my-div-icon',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  }),
  draggable: true,
  title: 'Eiffel Tower',
}).addTo(map)
```

`Icon` accepts `iconUrl`/`iconSize`/`iconAnchor`/`popupAnchor`/`className`
for Leaflet API compatibility, but they are **no-ops on the GPU sprite** until
bitmap-icon rendering ships. `DivIcon` options that do work:

| Option | Type | Description |
| --- | --- | --- |
| `html` | `string \| HTMLElement` | Content rendered inside the DOM overlay |
| `iconSize` | `[number, number]?` | `[w, h]` in px |
| `iconAnchor` | `[number, number]?` | Anchor point relative to top-left |
| `className` | `string?` | CSS class on the icon element |

## `DivIcon` (HTML markers)

```js
import { DivIcon } from 'rustyleaf'

const marker = new Marker([48.8566, 2.3522], {
  icon: new DivIcon({
    html: '<div style="font-size:20px">📍</div>',
    className: 'my-div-icon',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  }),
}).addTo(map)
```

## Popups & tooltips

```js
marker.bindPopup('<strong>Eiffel Tower</strong><br>since 1889').openPopup()
marker.bindTooltip('Eiffel Tower')
```

## Drag & events

```js
marker.setDraggable(true)

marker.on('dragstart', () => console.log('drag start'))
marker.on('drag', (e) => console.log('dragging', e))
marker.on('dragend', () => console.log('final', marker.getLatLng()))
marker.on('click', () => console.log('clicked'))
marker.on('mouseover', () => console.log('hover'))
marker.on('mouseout', () => console.log('out'))
```

## Other methods

| Method | Description |
| --- | --- |
| `setLatLng([lat, lng])` / `getLatLng()` | Position |
| `setIcon(icon)` / `getIcon()` | Swap icon |
| `setOpacity(n)` / `getOpacity()` | 0–1 opacity |
| `setZIndexOffset(n)` / `getZIndexOffset()` | Stacking offset |
| `setDraggable(bool)` / `isDraggable()` | Drag toggle |
| `openPopup()` / `closePopup()` / `isPopupOpen()` | Popup control |
| `openTooltip()` / `closeTooltip()` / `isTooltipOpen()` | Tooltip control |
| `remove()` | Detach from map |

> Calling map methods synchronously inside a raw wasm event callback
> (`move`, `zoom`, `click`, …) throws a re-entrancy error. Defer with
> `queueMicrotask` — the built-in layers already do this.
