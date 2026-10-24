#!/usr/bin/env bash
# ===== نشر Zenith على VPS (Ubuntu) — تلقائي =====
# يثبّت Node + nginx + pm2 + certbot، يجلب المشروع، يبنيه، يشغّله دائماً،
# ويضبط nginx + HTTPS. الأسرار (مفاتيح API + كلمة المرور) تُدخلها أنت فقط.
#
# الاستخدام على الخادم (كـ root):  bash scripts/deploy-vps.sh
set -e

APP_DIR="/var/www/zenith"
REPO="https://github.com/farhanSahba/zenith-scanner.git"
say() { echo -e "\n\033[1;36m==> $1\033[0m"; }

if [ "$(id -u)" != "0" ]; then echo "شغّله كـ root."; exit 1; fi

say "1/8 تثبيت الأدوات (Node 20 · nginx · pm2 · git · certbot)"
apt-get update -y
apt-get install -y git nginx curl ufw
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//;s/\..*//')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
command -v pm2 >/dev/null 2>&1 || npm install -g pm2
apt-get install -y certbot python3-certbot-nginx

say "2/8 جدار الحماية (SSH + HTTP + HTTPS)"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

say "3/8 جلب المشروع"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull
else
  mkdir -p /var/www && git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

say "4/8 ملف الإعدادات .env.local (أسرارك)"
if [ ! -f "$APP_DIR/.env.local" ]; then
  cp "$APP_DIR/.env.local.example" "$APP_DIR/.env.local"
  echo "سيُفتح المحرّر: امسح المحتوى والصق محتوى .env.local من جهازك (فيه كل مفاتيحك)،"
  echo "وتأكّد أن DATA_PROVIDER=alpaca و SA_DATA_PROVIDER=sahmk و APP_PASSWORD=<كلمة مرور قوية>."
  read -p "اضغط Enter لفتح المحرّر (احفظ: Ctrl+O ثم Enter · اخرج: Ctrl+X)..." _ < /dev/tty
  nano "$APP_DIR/.env.local" < /dev/tty
else
  echo ".env.local موجود — تخطّي. (لتعديله: nano $APP_DIR/.env.local)"
fi

say "5/8 التثبيت والبناء (قد يأخذ 2–5 دقائق)"
npm install
npm run build

say "6/8 التشغيل الدائم (pm2)"
pm2 delete zenith >/dev/null 2>&1 || true
pm2 start npm --name zenith -- start
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

say "7/8 nginx (وسيط عكسي)"
read -p "اكتب نطاقك الموجّه لهذا الخادم (مثل zenith.example.com): " DOMAIN < /dev/tty
cat > /etc/nginx/sites-available/zenith <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache off;
        proxy_buffering off;        # ضروري لبثّ SSE
        proxy_read_timeout 86400s;  # لا تقطع البثّ الطويل
    }
}
NGINX
ln -sf /etc/nginx/sites-available/zenith /etc/nginx/sites-enabled/zenith
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

say "8/8 شهادة HTTPS (Let's Encrypt)"
echo "تأكّد أن سجل A للنطاق $DOMAIN يشير إلى IP الخادم وانتشر (تحقّق: ping $DOMAIN)."
certbot --nginx -d "$DOMAIN" < /dev/tty || \
  echo "تعذّر certbot (غالباً DNS لم ينتشر). أعِد لاحقاً: certbot --nginx -d $DOMAIN"

echo -e "\n\033[1;32m✓ تمّ! افتح: https://$DOMAIN  — سيطلب كلمة المرور.\033[0m"
echo "تحديث لاحقاً: cd $APP_DIR && git pull && npm install && npm run build && pm2 restart zenith"
echo "متابعة السجلّ: pm2 logs zenith   |   الحالة: pm2 status"
