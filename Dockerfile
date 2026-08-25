# Bản đang chạy thật trên VPS (đưa vào git 25/08/2026 — trước đó chỉ tồn tại
# trên máy chủ, máy hỏng là mất định nghĩa triển khai).
#
# 1. Base image
FROM node:22-bookworm-slim AS base
# Thêm build-essential và python3 để chặn triệt để lỗi biên dịch node-gyp (bcrypt...)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    chromium \
    fonts-liberation \
    ca-certificates \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 2. Cài đặt thư viện
FROM base AS deps
COPY package.json package-lock.json .npmrc* ./
COPY prisma ./prisma
# Copy thêm thư mục scripts để chạy postinstall không bị lỗi
COPY scripts ./scripts

# Tắt tải Chromium ngầm và chặn Husky chạy báo lỗi
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV HUSKY=0

# Dùng npm install để đồng bộ lockfile, bỏ qua xung đột phiên bản
RUN npm install --legacy-peer-deps

# 3. Build Next.js
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Copy .env vào để Next.js kết nối Database lúc pre-render trang tĩnh
COPY .env* ./
ENV NEXT_TELEMETRY_DISABLED=1
# ⚠️ ĐỪNG nâng số này lên quá RAM thật của máy.
# [25/08] Từng để 3072 trên VPS 2 GB: Node thấy trần 3 GB nên không dọn rác sớm,
# phình qua mức RAM rồi bị kernel giết — build chết với `exit code: 137` sau 10
# phút, trông như lỗi code nhưng thật ra là hết bộ nhớ. 2048 cho Node dọn rác đều
# và ít phải mượn swap (swap chậm hơn RAM hàng chục lần, trên 1 vCPU càng đau).
ENV NODE_OPTIONS="--max_old_space_size=2048"
RUN npx prisma generate
RUN npm run build

# 4. Image chạy Production (Nhẹ & Bảo mật)
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy thư mục build và mã nguồn cần thiết (KHÔNG copy file .env vào đây)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/messages ./messages

# Phân quyền User (Bảo mật container)
#
# ⚠️ GHI CHÚ QUAN TRỌNG: `useradd --system` KHÔNG tạo thư mục nhà, nên user
# `nextjs` chạy với $HOME không ghi được. Đó CHÍNH LÀ nguyên nhân lỗi xuất hoá
# đơn PDF trên VPS:
#     chrome_crashpad_handler: --database is required
# Crashpad chạy trước cả khi dựng trang và bắt buộc tạo được thư mục dữ liệu dưới
# $HOME. Trên Vercel không lộ vì lambda luôn có /tmp ghi được làm HOME.
# Đã chữa ở phía mã nguồn (src/lib/invoice-generator.ts, commit cfef579): tạo thư
# mục tạm rồi truyền HOME/XDG_* RIÊNG cho tiến trình Chrome con.
# ⇒ Đừng "sửa" bằng cách bỏ USER nextjs và chạy bằng root — chạy container bằng
#   root là đánh đổi bảo mật để né một lỗi đã có cách chữa đúng.
RUN groupadd --system nodejs && useradd --system --gid nodejs nextjs
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
ENV PORT=3000
CMD ["npm", "run", "start"]
