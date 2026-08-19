import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * standalone: сборка кладёт в .next/standalone минимальный сервер со
   * своими node_modules — в образ едет ~50 МБ вместо 387 МБ зависимостей.
   */
  output: "standalone",
};

export default nextConfig;
