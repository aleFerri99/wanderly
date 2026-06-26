import path from 'path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@repo/shared'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
}

export default nextConfig
