/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['mongodb', 'pdfkit'],
    instrumentationHook: true,
  },
};

export default nextConfig;
