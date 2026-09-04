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
  webpack: (config, { isServer, nextRuntime }) => {
    // A instrumentacao e compilada para TODOS os runtimes (nodejs, edge e
    // client). O import de `./instrumentation.node` esta atras de um guard de
    // runtime, mas o webpack percorre o grafo mesmo assim e tenta empacotar o
    // baileys — que puxa o binario nativo do sharp e quebra o build com
    // "Node.js binary module ... is not supported in the browser".
    //
    // serverComponentsExternalPackages nao cobre isso (vale so para a
    // compilacao do servidor) e `externals` tambem nao resolveu: o webpack
    // continua resolvendo o modulo antes de trata-lo como externo.
    //
    // alias = false faz o webpack resolver o pacote para um modulo vazio e
    // PARAR a travessia ali. E seguro porque o guard de runtime garante que
    // esse codigo so executa sob o runtime nodejs, onde o alias nao se aplica.
    if (nextRuntime !== 'nodejs') {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@whiskeysockets/baileys': false,
        sharp: false,
        pino: false,
      };
    }
    return config;
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
