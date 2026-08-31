# Layer Groups

Group layers together to add, remove, and iterate them in bulk, and to compute
union bounds.

## `LayerGroup`

Bulk add/remove of arbitrary layers.

```js
import { LayerGroup, PointLayer, TileLayer } from 'rustyleaf'

const group = new LayerGroup([
  pointsA,
  pointsB,
]).addTo(map)

group.addLayer(pointsC)
group.removeLayer(pointsA)
group.clearLayers()
group.eachLayer((layer) => console.log(layer))
console.log(group.hasLayer(pointsB))
```

| Method | Description |
| --- | --- |
| `addLayer(layer)` / `removeLayer(layer)` | Add / remove a member |
| `clearLayers()` | Remove all members |
| `eachLayer(fn, ctx?)` | Iterate members |
| `getLayers()` | Array of member layers |
| `hasLayer(layer)` | Membership check |
| `addTo(map)` / `remove()` | Add / remove the whole group |

## `FeatureGroup`

Extends `LayerGroup` with a **union `getBounds()`** and **event delegation** —
events fired on any child bubble up to the group.

```js
import { FeatureGroup, Circle, Rectangle } from 'rustyleaf'

const fg = new FeatureGroup([circle, rect]).addTo(map)

fg.getBounds() // union bounds of all children

fg.on('click', (e) => {
  console.log('a child was clicked', e)
})
```

> Event delegation means you can attach a single `click`/`hover` listener to the
> group instead of to every child.

## Map-level layer management

The map itself manages layers directly:

```js
map.addLayer(layer)
map.removeLayer(layer)
map.hasLayer(layer) // boolean
```
