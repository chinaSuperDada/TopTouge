# TopTouge 后端容器镜像
#
# 用于微信云托管部署。本地开发不需要 —— 直接 npm run dev。

FROM node:20-alpine

WORKDIR /app

# 先只拷依赖清单，让 npm install 这层能被缓存住。
# 改业务代码不会让这层失效，构建快很多。
COPY package*.json ./
RUN npm ci --omit=dev

# 再拷源码
COPY src ./src
COPY sql ./sql

# 云托管默认从环境变量读端口，不设就用 80
ENV PORT=80
EXPOSE 80

# 容器内以非 root 运行，降低被攻破后的影响面
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

# 存活探针指到 /api/health/ready，它在 MySQL 模式下会真的探一次数据库
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||80)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/index.js"]
