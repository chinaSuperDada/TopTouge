# TopTouge 后端容器镜像
#
# 用于微信云托管部署。本地开发不需要 —— 直接 npm run dev。

FROM node:20-alpine

WORKDIR /app

# 先只拷依赖清单，让安装这层能被缓存住。
# 改业务代码不会让这层失效，构建快很多。
COPY package*.json ./

# 有 package-lock.json 就用 npm ci（严格按锁定版本装，可复现）；
# 没有则退回 npm install。用 [ -f ] 判断而不是直接 ci，
# 否则万一 lock 文件没提交进来，构建会以「npm ci 找不到 lock」失败，
# 报错信息还看不出真正原因。
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      echo "警告：没有 package-lock.json，退回 npm install（版本不可复现）"; \
      npm install --omit=dev; \
    fi

# 再拷源码
COPY src ./src
COPY sql ./sql

# 监听端口。
#
# 用 3000 而不是 80 —— Linux 上 1024 以下端口需要 root 权限，
# 而下面用 USER 切成了非 root，绑 80 会 EACCES 启动失败。
# 云托管支持自定义端口，在服务配置里填 3000 即可。
ENV PORT=3000
EXPOSE 3000

# 容器内以非 root 运行，降低被攻破后的影响面
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

# 存活探针指到 /api/health，它在 MySQL 模式下会真的探一次数据库
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/index.js"]
