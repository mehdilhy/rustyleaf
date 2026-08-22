// Throwaway verification spec — deleted after run
import { test, expect } from '@playwright/test';

test('blocker fixes: marker click, geojson layer events, once(), flyTo signature', async ({ page }) => {
  await page.goto('/e2e/fixtures/_smoke.html');
  await page.waitForFunction(() => (window as any).__rustyleafReady === true, { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const out: any = {};
    const w: any = window;
    const map = w.__map;
    const R = w.R;

    const clickAt = async (xy: number[]) => {
      const canvas = document.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = rect.left + xy[0] / scaleX;
      const cy = rect.top + xy[1] / scaleY;
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: cx, clientY: cy, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: cx, clientY: cy, bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));
    };

    // --- once() ---
    let onceCount = 0;
    (map as any).once('move', () => onceCount++);
    (map as any).panBy([10, 0]);
    (map as any).panBy([10, 0]);
    await new Promise((r) => setTimeout(r, 80));
    out.onceFiredExactlyOnce = onceCount === 1;

    // --- off(type) removes all ---
    let moveCount = 0;
    const h1 = () => moveCount++;
    const h2 = () => moveCount++;
    (map as any).on('move', h1);
    (map as any).on('move', h2);
    (map as any).off('move');
    (map as any).panBy([5, 5]);
    await new Promise((r) => setTimeout(r, 80));
    out.offRemovesAll = moveCount === 0;

    // --- context arg ---
    let ctxOk = false;
    const obj: any = {
      flag: false,
      handler() { ctxOk = this === obj; }
    };
    (map as any).on('move', obj.handler, obj);
    (map as any).panBy([3, 3]);
    await new Promise((r) => setTimeout(r, 80));
    (map as any).off('move', obj.handler);
    out.contextThisWorks = ctxOk;

    // --- marker click fires + popup auto-opens + tooltip opens ---
    const center = (map as any).getCenter();
    const m = new R.Marker(center).addTo(map);
    let markerClicked = false;
    let mouseover = false;
    m.on('click', () => { markerClicked = true; });
    m.on('mouseover', () => { mouseover = true; });
    m.bindPopup('<b>hello</b>');
    m.bindTooltip('tip text');
    const xy = (map as any).project(center);
    await clickAt(xy);
    out.markerClickFired = markerClicked;
    out.popupAutoOpened = !!document.querySelector('.rustyleaf-popup');

    m.openTooltip();
    await new Promise((r) => setTimeout(r, 50));
    out.tooltipOpensForReal = !!document.querySelector('.rustyleaf-tooltip');

    // --- flyTo(latlng, zoom) Leaflet numeric signature ---
    (map as any).flyTo([48.0, 2.0], 10);
    await new Promise((r) => setTimeout(r, 700));
    out.flyToNumericZoom = Math.abs((map as any).getZoom() - 10) < 1.6;
    (map as any).setView(center, 12);

    // --- geojson layer-level click ---
    const gj = new R.GeoJSONLayer({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [center[1], center[0]] },
      properties: { name: 'p1' }
    }).addTo(map);
    let gjClicked = false;
    let gjPayload: any = null;
    gj.on('click', (e: any) => { gjClicked = true; gjPayload = e; });
    await new Promise((r) => setTimeout(r, 150));
    await clickAt((map as any).project(center));
    out.geojsonLayerClickFired = gjClicked;
    out.geojsonPayloadHasType = !!gjPayload && gjPayload.type === 'click';

    return out;
  });

  console.log('SMOKE RESULTS:', JSON.stringify(result, null, 2));
  expect(result.onceFiredExactlyOnce).toBe(true);
  expect(result.offRemovesAll).toBe(true);
  expect(result.contextThisWorks).toBe(true);
  expect(result.markerClickFired).toBe(true);
  expect(result.popupAutoOpened).toBe(true);
  expect(result.tooltipOpensForReal).toBe(true);
  expect(result.flyToNumericZoom).toBe(true);
  expect(result.geojsonLayerClickFired).toBe(true);
  expect(result.geojsonPayloadHasType).toBe(true);
});

test('round-2 fixes: polygon interior click, marker drag, streaming chunk boundaries', async ({ page }) => {
  await page.goto('/e2e/fixtures/_smoke.html');
  await page.waitForFunction(() => (window as any).__rustyleafReady === true, { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const out: any = {};
    const w: any = window;
    const map = w.__map;
    const R = w.R;

    // --- polygon INTERIOR click (point-in-polygon hit-testing) ---
    // Big triangle-ish polygon around the map center; click dead-center,
    // far from any edge/vertex.
    const c = map.getCenter();
    const gj = new R.GeoJSONLayer({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [c[1] - 0.01, c[0] - 0.01], [c[1] + 0.01, c[0] - 0.005],
          [c[1] + 0.005, c[0] + 0.01], [c[1] - 0.01, c[0] + 0.005],
          [c[1] - 0.01, c[0] - 0.01]
        ]]
      },
      properties: { name: 'interior-test' }
    }).addTo(map);
    let interiorHit = false;
    gj.on('click', (e: any) => {
      if (e.feature && e.feature.properties && e.feature.properties.name === 'interior-test') interiorHit = true;
    });
    await new Promise((r) => setTimeout(r, 150));
    const xy = map.project(c);
    const canvas = document.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const cx = rect.left + xy[0] / sx, cy = rect.top + xy[1] / sy;
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: cx, clientY: cy, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: cx, clientY: cy, bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    out.polygonInteriorClickFires = interiorHit;

    // --- marker dragging ---
    const m = new R.Marker(c, { draggable: true }).addTo(map);
    const events: string[] = [];
    let dragLatlng = null;
    m.on('dragstart', () => events.push('start'));
    m.on('drag', (e: any) => { events.push('drag'); dragLatlng = e.latlng; });
    m.on('dragend', () => events.push('end'));
    const startXY = map.project(c);
    const px = rect.left + startXY[0] / sx, py = rect.top + startXY[1] / sy;
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: px, clientY: py, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: px - 60, clientY: py - 40, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: px - 60, clientY: py - 40, bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    out.dragSequence = events.join(',');
    out.dragMovedLatLng = !!(dragLatlng && (Math.abs(dragLatlng[0] - c[0]) > 1e-5));

    // --- streaming GeoJSON across chunk boundaries ---
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [2.30, 48.80] }, properties: { id: 'a' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [2.31, 48.81] }, properties: { id: 'b' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [2.32, 48.82] }, properties: { id: 'c', note: 'brace } in string' } }
      ]
    };
    const text = JSON.stringify(fc);
    // split mid-feature AND inside a string value containing a brace
    const cut1 = Math.floor(text.length * 0.4);
    const cut2 = text.length - Math.floor(text.length * 0.15);
    const streamed = new R.GeoJSONLayer(null, {}).addTo(map);
    await streamed.processChunk(text.slice(0, cut1), false);
    await streamed.processChunk(text.slice(cut1, cut2), false);
    await streamed.processChunk(text.slice(cut2), true);
    await new Promise((r) => setTimeout(r, 150));
    out.streamedFeatureCount = map.wasmMap.get_geojson_feature_count(streamed.layerIndex);

    // --- getFeaturesInBounds real filtering ---
    out.inBounds = streamed.getFeaturesInBounds([[48.795, 2.29], [48.825, 2.33]]).length;

    return out;
  });

  console.log('ROUND2 RESULTS:', JSON.stringify(result, null, 2));
  expect(result.polygonInteriorClickFires).toBe(true);
  expect(result.dragSequence).toBe('start,drag,end');
  expect(result.dragMovedLatLng).toBe(true);
  expect(result.streamedFeatureCount).toBe(3);
  expect(result.inBounds).toBeGreaterThanOrEqual(1);
});
