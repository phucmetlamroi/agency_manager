#!/usr/bin/env bash
#
# Gom TOÀN BỘ sự thật về cách VPS đang chạy — CHỈ ĐỌC, không sửa gì.
#
# Có file này vì đã đoán sai môi trường bốn lần: đường dẫn dự án (/srv/hustlytasker
# thay vì /root/agency_manager), user chạy app (hustly thay vì root), giả định máy
# có node/npm (không có, chạy Docker), và giả định nginx cấu hình ở sites-enabled
# (không thấy proxy_pass ở đó). Mỗi lần đoán sai là một vòng hỏi–đáp mất thời gian
# của chủ hệ thống. Thà chạy một lệnh lấy hết còn hơn.
#
# Chạy:  sudo bash docs/vps/collect-diagnostics.sh
# Kết quả vừa in ra màn hình vừa lưu ở /tmp/vps-diag.txt
#
# KHÔNG in bí mật: .env chỉ đếm dòng và liệt kê TÊN biến, không in giá trị.

APP_DIR="${HUSTLY_APP_DIR:-/root/agency_manager}"
OUT=/tmp/vps-diag.txt

{
echo "══════════ 1. MÁY ══════════"
uname -a
echo "--- bộ nhớ ---"; free -h
echo "--- đĩa ---";    df -h / | tail -1
echo "--- múi giờ / đồng hồ ---"; timedatectl 2>/dev/null | head -5

echo; echo "══════════ 2. AI ĐANG NGHE CỔNG NÀO ══════════"
ss -tlnp 2>/dev/null | grep -E ':(80|443|3000|5432)\b' || echo "(không thấy)"

echo; echo "══════════ 3. NGINX ══════════"
echo "--- đang chạy? ---"; systemctl is-active nginx 2>&1
echo "--- các file cấu hình đang được nạp ---"
nginx -T 2>/dev/null | grep -E '^# configuration file' || echo "(nginx -T thất bại)"
echo "--- dòng có ý nghĩa (bỏ chú thích) ---"
nginx -T 2>/dev/null | grep -vE '^\s*#' | grep -nE 'server_name|listen |proxy_pass|proxy_set_header|client_max_body_size|proxy_read_timeout|proxy_buffering|root |ssl_certificate ' | head -60

echo; echo "══════════ 4. DOCKERFILE ══════════"
cat "$APP_DIR/Dockerfile" 2>&1

echo; echo "══════════ 5. DOCKER-COMPOSE ══════════"
cat "$APP_DIR/docker-compose.yml" 2>&1

echo; echo "══════════ 6. CONTAINER ══════════"
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>&1
echo "--- chi tiết ---"
docker inspect -f 'restart={{.HostConfig.RestartPolicy.Name}}  network={{.HostConfig.NetworkMode}}  ip={{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' agency_manager_web 2>&1
echo "--- log gần nhất ---"
docker logs --tail 15 agency_manager_web 2>&1

echo; echo "══════════ 7. GIT TRÊN VPS ══════════"
cd "$APP_DIR" 2>/dev/null || echo "(không vào được $APP_DIR)"
echo "--- nhánh + commit ---"; git rev-parse --abbrev-ref HEAD 2>&1; git log --oneline -3 2>&1
echo "--- file đã sửa tại chỗ (chưa commit) ---"; git status --short 2>&1 | head -20
echo "--- file KHÔNG nằm trong git (chỉ có trên máy này) ---"
git status --short --untracked-files=all 2>/dev/null | grep '^??' | head -30

echo; echo "══════════ 8. .ENV (chỉ tên biến, KHÔNG in giá trị) ══════════"
if [ -f "$APP_DIR/.env" ]; then
    echo "số dòng: $(wc -l < "$APP_DIR/.env")"
    echo "kiểu tệp: $(file -b "$APP_DIR/.env")"   # phát hiện CRLF từ Windows
    echo "tên biến:"
    grep -oE '^[A-Z_][A-Z0-9_]*' "$APP_DIR/.env" | sort | tr '\n' ' '
    echo
else
    echo "KHÔNG THẤY $APP_DIR/.env"
fi
if [ -f "$APP_DIR/.env.local" ]; then
    echo "⚠️ CÓ .env.local — Next đọc file này ƯU TIÊN HƠN .env"
    grep -oE '^[A-Z_][A-Z0-9_]*' "$APP_DIR/.env.local" | sort | tr '\n' ' '
    echo
fi

echo; echo "══════════ 9. CRON ══════════"
echo "số job hustly-cron: $(crontab -l 2>/dev/null | grep -v '^#' | grep -c hustly-cron)"
echo "--- nhật ký gần nhất ---"; tail -8 /var/log/hustly-cron.log 2>&1

echo; echo "══════════ 10. TƯỜNG LỬA ══════════"
ufw status 2>&1 | head -10
} 2>&1 | tee "$OUT"

echo
echo "Đã lưu: $OUT"
