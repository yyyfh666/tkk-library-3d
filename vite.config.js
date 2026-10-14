import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages 部署用（形如 https://<user>.github.io/<repo>/）。
  // 取**相对** base 而不是 '/仓库名/'：换仓库名、换自定义域名都不用改这里，
  // 而且这个项目是单页应用（切场景走 URL 参数、没有前端路由），
  // 不会踩到"深层路由拿不到资源"那个坑。
  base: './',
  plugins: [react()],
})
