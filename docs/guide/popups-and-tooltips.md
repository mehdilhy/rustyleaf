# Popups & Tooltips

Popups are HTML overlays that anchor to a location or a layer; tooltips are
lightweight hover overlays. Both support auto-pan and close behavior.

## `Popup`

```js
import { Popup } from 'rustyleaf'

const popup = new Popup({
  maxWidth: 300,
  minWidth: 100,
  autoPan: true,        // pan the map so the popup stays in view
  autoPanPadding: [50, 50],
  closeButton: true,
  autoClose: true,
  className: 'my-popup',
})
  .setLatLng([48.8584, 2.2945])
  .setContent('<strong>Eiffel Tower</strong><br>since 1889')
  .openOn(map)

popup.close()
```

### Binding to layers

`Marker`, `GeoJSONFeatureHandle`, and most layers expose convenience methods:

```js
marker.bindPopup('<strong>Hi</strong>').openPopup()
marker.getPopupContent() // last-set content
marker.isPopupOpen()

// GeoJSON onEachFeature
handle.bindPopup(`<strong>${f.properties.name}</strong>`)
```

### Auto-pan note

Popup auto-pan measures the element **after** it's appended to the DOM, so it
works correctly even when the popup overflows the viewport. The autopan itself
uses `flyTo`, not `panTo`.

## `Tooltip`

Tooltips are lighter than popups and typically used for hover hints.

```js
import { Tooltip } from 'rustyleaf'

const tooltip = new Tooltip({
  content: 'Eiffel Tower',
  direction: 'top',
  opacity: 0.9,
  sticky: true,
  offset: [0, -10],
})
  .setLatLng([48.8584, 2.2945])
  .openOn(map)
```

### Binding to layers

```js
marker.bindTooltip('Eiffel Tower')
handle.bindTooltip(f.properties.name) // in GeoJSON onEachFeature
```

## Options

```ts
interface PopupOptions {
  maxWidth?: number
  minWidth?: number
  maxHeight?: number | null
  autoPan?: boolean
  autoPanPaddingTopLeft?: [number, number]
  autoPanPaddingBottomRight?: [number, number]
  autoPanPadding?: [number, number]
  keepInView?: boolean
  closeButton?: boolean
  autoClose?: boolean
  className?: string
}
```
