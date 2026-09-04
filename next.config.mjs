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
    // baileys/pino/qrcode entram pelo mesmo motivo: o baileys carrega
    // protobuf e libsignal, que o empacotamento quebra.
    serverComponentsExternalPackages: ['sharp', '@whiskeysockets/baileys', 'pino', 'qrcode'],
    serverActions: {
      // Uploads de imagem passam por Server Action; video usa Route Handler.
      bodySizeLimit: '12mb',
    },
  },
  images: {
    // Arquivos sao servidos pela rota autenticada /api/uploads.
    unoptimized: true,
  },
  async rewrites() {
    // Caminhos LEGADOS gravados no banco como "/uploads/..." passam a ser
    // atendidos pela rota autenticada, sem precisar reescrever o banco.
    // Arquivos novos já nascem com base "/api/uploads" (NEXT_PUBLIC_UPLOAD_BASE_URL).
    return [
      { source: '/uploads/:path*', destination: '/api/uploads/:path*' },
    ];
  },
  async headers() {
    // Cabeçalhos de segurança básicos em todas as respostas.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ];
  },
};

export default nextConfig;
