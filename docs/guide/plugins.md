# Plugins & Utilities

Rustyleaf exposes a small plugin surface so you can extend the map without
forking the core: a `Handler` base class for input behaviors and a `Util`
helper bag.

## `Handler`

A `Handler` wraps an input behavior (keyboard, touch, double-click, …) that can
be enabled/disabled on a map. Register it with `map.addHandler(name, Class)`.

```js
import { Handler, Util } from 'rustyleaf'

class DoubleClickZoom extends Handler {
  addHooks() {
    this._map.on('dblclick', this._onDblClick)
  }
  removeHooks() {
    this._map.off('dblclick', this._onDblClick)
  }
  _onDblClick = (e) => {
    this._map.zoomIn()
  }
}

map.addHandler('doubleClickZoom', DoubleClickZoom)
// Enabled via map.doubleClickZoom.enable() (mirrors Leaflet's pattern)
```

`Handler` API:

| Method | Description |
| --- | --- |
| `constructor(map)` | Bind to a map |
| `enable()` / `disable()` | Toggle the behavior |
| `enabled()` | Current state |
| `addHooks()` | Called on enable — attach listeners |
| `removeHooks()` | Called on disable — detach listeners |

## `Util`

Static helpers, mirroring Leaflet's `L.Util`.

```js
import { Util } from 'rustyleaf'

Util.stamp(obj)              // stable numeric id for any object
Util.template('{z}/{x}/{y}', { z: 3, x: 1, y: 2 }) // "3/1/2"
Util.throttle(fn, 200, ctx) // rate-limit a callback
Util.wrapNum(370, [0, 360]) // wraps into range -> 10
Util.extend(dest, src)      // shallow-merge objects
Util.falseFn()              // () => false
Util.formatNum(3.14159, 2)  // 3.14
Util.setOptions(obj, opts)  // merge opts into obj.options
```

## Extending by composition

Because markers, layers, controls, and shapes all expose `addTo(map)` /
`remove()`, you can build reusable map "widgets" as plain functions or classes
that compose the public API — no core changes required.

```js
function addMiniMap(map, overviewUrl) {
  const mini = new Map('mini', { zoomControl: false })
  new TileLayer(overviewUrl).addTo(mini)
  return mini
}
```

> A Leaflet-plugin-compatible plugin interface is on the
> [roadmap](/development#roadmap) — see the roadmap for what's planned.
