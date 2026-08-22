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

```js
import { Marker, Icon } from 'rustyleaf'

const marker = new Marker([48.8584, 2.2945], {
  icon: new Icon({
    iconUrl: '/pin.png',
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -32],
  }),
  draggable: true,
  title: 'Eiffel Tower',
}).addTo(map)
```

`IconOptions`:

| Option | Type | Description |
| --- | --- | --- |
| `iconUrl` | `string` | Image URL (required) |
| `iconRetinaUrl` | `string?` | 2× image for retina displays |
| `iconSize` | `[number, number]?` | `[w, h]` in px |
| `iconAnchor` | `[number, number]?` | Anchor point relative to top-left |
| `popupAnchor` | `[number, number]?` | Where popups open |
| `shadowUrl` / `shadowSize` / `shadowAnchor` | `string?` / `[number,number]?` | Drop-shadow image |
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
