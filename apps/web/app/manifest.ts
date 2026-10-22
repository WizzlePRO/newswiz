import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NewsWiz',
    short_name: 'NewsWiz',
    description: 'Balanced news, free journalism first.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f6f3',
    theme_color: '#0f5f8c',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
