# 课堂答题系统 - 腾讯云托管 Dockerfile
FROM node:18-alpine

WORKDIR /app

# 先装依赖（利用层缓存，package.json 不变时不用重装）
COPY package.json ./
RUN npm install --production

# 复制源码
COPY . .

# 云托管访问端口默认为 80，应用监听 process.env.PORT || 3000
EXPOSE 80

CMD ["node", "index.js"]
