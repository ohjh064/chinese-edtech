/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // 채점 엔진(src/grading)은 ESM 스타일 .js 확장자 import를 사용한다.
    // webpack이 .js 지정자를 .ts 소스로 해석하도록 매핑.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  // Turbopack(next dev --turbopack) 사용 시 동일 매핑
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
};

export default nextConfig;
