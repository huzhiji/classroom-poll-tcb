# 课堂答题系统 - 通用 Dockerfile（阿里云 ECS / 任意云服务器 / 本地均可用）
FROM node:18-alpine

WORKDIR /app

# 先装依赖（利用层缓存，package.json 不变时不用重装）
# 国内服务器直连 npm 官方源较慢/易超时，用 npmmirror（阿里）加速
COPY package.json ./
RUN npm install --production --registry=https://registry.npmmirror.com

# 复制源码
COPY . .

# 应用监听 process.env.PORT || 80（默认 80）。
# 在阿里云 ECS 上用 -p 80:80 映射即可，安全组需放行 80/443。
EXPOSE 80

CMD ["node", "index.js"]
