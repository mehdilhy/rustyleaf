import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Rustyleaf',
  description: 'A Leaflet-style map API backed by Rust, WebAssembly, and WebGL2.',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: '20 use cases', link: '/use-cases' },
      { text: 'API reference', link: '/api' },
      { text: 'Examples', link: '/examples' },
      { text: 'Performance', link: '/performance' },
      { text: 'GitHub', link: 'https://github.com/mehdilhy/rustyleaf' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Start here',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick start', link: '/guide/quick-start' },
          ],
        },
        {
          text: 'Build with Rustyleaf',
          items: [
            { text: 'Tile layers', link: '/guide/tile-layers' },
            { text: 'Data layers', link: '/guide/data-layers' },
            { text: 'GeoJSON', link: '/guide/geojson' },
            { text: 'Markers', link: '/guide/markers' },
            { text: 'Shapes', link: '/guide/shapes' },
            { text: 'Layer groups', link: '/guide/layer-groups' },
            { text: 'Popups & tooltips', link: '/guide/popups-and-tooltips' },
            { text: 'Controls', link: '/guide/controls' },
            { text: 'Overlays', link: '/guide/overlays' },
            { text: 'Navigation', link: '/guide/navigation' },
            { text: 'Events', link: '/guide/events' },
            { text: 'Plugins', link: '/guide/plugins' },
          ],
        },
      ],
      '/': [
        {
          text: 'Reference',
          items: [
            { text: '20 use cases', link: '/use-cases' },
            { text: 'API reference', link: '/api' },
            { text: 'Examples', link: '/examples' },
            { text: 'Performance', link: '/performance' },
            { text: 'FAQ & limitations', link: '/faq' },
            { text: 'Changelog', link: '/changelog' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mehdilhy/rustyleaf' },
    ],
    search: { provider: 'local' },
  },
})
