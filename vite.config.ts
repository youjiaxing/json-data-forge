
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 加载环境变量
  // 第三个参数为 '' 表示加载所有环境变量，不管是否有 VITE_ 前缀
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // 优先读取 API_KEY，如果没有则尝试读取 GEMINI_API_KEY
  const apiKey = env.API_KEY || env.GEMINI_API_KEY;

  console.log(`[Vite Config] Loading API Key... Found: ${apiKey ? 'Yes' : 'No'}`);

  return {
    // 关键修改：设置为相对路径，确保在 GitHub Pages 非根目录下也能找到资源
    base: './', 
    plugins: [react()],
    define: {
      // 将环境变量注入到前端代码的 process.env.API_KEY 中
      // 如果没有 key，这就变成 undefined，前端 App.tsx 会据此自动切换到本地模式
      'process.env.API_KEY': JSON.stringify(apiKey),
    },
    server: {
      host: true, // 允许 Docker 外部访问
      port: 5173
    }
  };
});
