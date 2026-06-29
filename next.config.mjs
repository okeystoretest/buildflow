/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sharp roda no server; garantir que nao seja bundlado errado
  experimental: {
    serverComponentsExternalPackages: ["sharp", "@prisma/client", "bcryptjs"],
    // Uploads de imagem (comprovante/NF) trafegam pela Server Action em base64.
    // Fotos de celular passam de 1 MB; elevamos o limite com folga.
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
  // uploads sao servidos via Nginx em producao (alias /uploads),
  // mas em dev o Next serve pela rota /api/uploads (ver README)
  output: "standalone",
};
export default nextConfig;
