#!/usr/bin/env bash
# Chạy lần lượt các file SQL (01 → 16...) lên một MySQL bất kỳ, dùng MySQL client trong Docker.
#
# Cách dùng (Git Bash):
#   DB_HOST=xxx DB_PORT=xxxxx DB_USER=xxx DB_NAME=xxx MYSQL_PWD='mật-khẩu' bash database/run-migrations.sh
# Tuỳ chọn: SKIP_DEMO=1 để bỏ qua 03_demo_data_extra.sql (dữ liệu demo).
#           FROM=04 để chạy tiếp từ file 04 (khi lần trước dừng giữa chừng).
set -euo pipefail

: "${DB_HOST:?Thiếu DB_HOST}" "${DB_PORT:?Thiếu DB_PORT}" "${DB_USER:?Thiếu DB_USER}" "${DB_NAME:?Thiếu DB_NAME}" "${MYSQL_PWD:?Thiếu MYSQL_PWD}"

# Một số MySQL cloud (vd. Aiven) bật sẵn chế độ ANSI: chuỗi trong "..." bị hiểu là tên cột.
# Ép sql_mode về mặc định của MySQL 8 để các file SQL chạy giống ở máy local.
SQL_MODE="ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION"

cd "$(dirname "$0")"
for file in [0-9][0-9]_*.sql; do
  if [[ "$file" < "${FROM:-00}" ]]; then
    continue
  fi
  if [[ "${SKIP_DEMO:-0}" == "1" && "$file" == 03_* ]]; then
    echo "== bỏ qua $file"
    continue
  fi
  echo "== $file"
  docker run --rm -i -e MYSQL_PWD mysql:8.0 \
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --ssl-mode=REQUIRED \
    --default-character-set=utf8mb4 \
    --init-command="SET SESSION sql_mode='$SQL_MODE'" "$DB_NAME" < "$file"
done
echo "Xong."
