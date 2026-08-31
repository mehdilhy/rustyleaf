import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Rustyleaf',
  description:
    'A Leaflet-style map API with a Rust + WebAssembly + WebGL2 rendering core.',
  lang: 'en-US',
  cleanUrls: true,

  head: [
    ['link', { rel: 'icon', href: '/logo.png' }],
    ['meta', { name: 'theme-color', content: '#2a6fdb' }],
  ],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'API', link: '/api' },
      { text: 'Examples', link: '/examples' },
      { text: 'Performance', link: '/performance' },
      { text: 'Development', link: '/development' },
      { text: 'Changelog', link: '/changelog' },
      {
        text: 'GitHub',
        link: 'https://github.com/mehdilhy/rustyleaf',
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          collapsed: false,
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
          ],
        },
        {
          text: 'Layers',
          collapsed: false,
          items: [
            { text: 'Tile Layers', link: '/guide/tile-layers' },
            { text: 'Point / Line / Polygon', link: '/guide/data-layers' },
            { text: 'GeoJSON Layer', link: '/guide/geojson' },
            { text: 'Markers', link: '/guide/markers' },
            { text: 'Vector Shapes', link: '/guide/shapes' },
            { text: 'Popups & Tooltips', link: '/guide/popups-and-tooltips' },
            { text: 'Layer Groups', link: '/guide/layer-groups' },
          ],
        },
        {
          text: 'UI & Interaction',
          collapsed: false,
          items: [
            { text: 'Controls', link: '/guide/controls' },
            { text: 'Ground Overlays', link: '/guide/overlays' },
            { text: 'Events', link: '/guide/events' },
            { text: 'Map Navigation', link: '/guide/navigation' },
            { text: 'Plugins & Utilities', link: '/guide/plugins' },
          ],
        },
      ],
      '/': [
        {
          text: 'Rustyleaf',
          items: [
            { text: 'Home', link: '/' },
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'API Reference', link: '/api' },
            { text: 'Examples', link: '/examples' },
            { text: 'Performance', link: '/performance' },
            { text: 'Development', link: '/development' },
            { text: 'Changelog', link: '/changelog' },
            { text: 'FAQ & Limitations', link: '/faq' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/mehdilhy/rustyleaf' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Mehdi',
    },

    docFooter: {
      prev: true,
      next: true,
    },

    outline: {
      label: 'On this page',
      level: [2, 3],
    },

    lastUpdated: {
      text: 'Updated',
    },
  },
})
