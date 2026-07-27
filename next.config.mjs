/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: false },
  experimental: {
    instrumentationHook: true,
    // sharp e binario nativo: nao deve ser empacotado pelo webpack, e sim
    // resolvido em runtime pelo Node.
    serverComponentsExternalPackages: ['sharp'],
    serverActions: {
      // Uploads de imagem passam por Server Action; video usa Route Handler.
      bodySizeLimit: '12mb',
    },
  },
  images: {
    // Arquivos sao servidos estaticamente pelo Nginx a partir de /uploads.
    unoptimized: true,
  },
};

export default nextConfig;
