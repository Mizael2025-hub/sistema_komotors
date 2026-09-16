import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@komotors/shared'],
  serverExternalPackages: ['pdfmake', 'exceljs'],
};

export default nextConfig;
