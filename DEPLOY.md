# رفع Zenith على خادم — دليل عملي

## ⚠️ أولاً: الاستضافة المشتركة لا تصلح لهذا المشروع

Zenith **ليس موقعاً ثابتاً** — هو تطبيق Next.js بخادم حيّ يحتاج:
- **عملية Node.js تعمل باستمرار** (المحرّك + الاستطلاع الدوري).
- **بثّ SSE طويل الأمد** (اتصال `/api/stream` يبقى مفتوحاً دقائق/ساعات).
- **اتصال WebSocket صادر** لـ Alpaca (السوق الأمريكي).
- **حالة في الذاكرة** (محرّك مفرد لكل سوق على `globalThis`).

استضافة هوستجر المشتركة (Premium/Business/Cloud، حتى مع ميزة Node.js) — حسب توثيق هوستجر الرسمي:
- **تقطع أي طلب بعد 120 ثانية** → يقتل بثّ SSE.
- **لا تدعم WebSocket**.
- **لا تسمح بعمليات خلفية دائمة** + تنصح بعدم تشغيل pm2.

**النتيجة: المشتركة ستكسر التطبيق.** الحل على هوستجر: **VPS**.

---

## ✅ الموصى: Hostinger VPS

VPS صغير (أرخص خطة KVM تكفي، ~1–2GB RAM) يشغّل المشروع تماماً.

### 1) تجهيز الخادم (SSH)
```bash
ssh root@<ip-الخادم>
apt update && apt upgrade -y
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git nginx
npm install -g pm2
```

### 2) جلب المشروع
```bash
cd /var/www
git clone https://github.com/farhanSahba/zenith-scanner.git zenith
cd zenith
npm install
```

### 3) ملف البيئة `.env.local` (أنشئه على الخادم — لا يُرفع على Git)
```bash
nano .env.local
```
انسخ من `.env.local.example` واملأ مفاتيحك، **وفعّل كلمة المرور**:
```
DATA_PROVIDER=alpaca
ALPACA_KEY_ID=...
ALPACA_SECRET_KEY=...
ALPACA_FEED=sip
ALPHAVANTAGE_API_KEY=...
ANTHROPIC_API_KEY=...
AI_MODEL=claude-haiku-5-5
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
SA_DATA_PROVIDER=sahmk
SAHMK_API_KEY=...
SA_INDEX=TASI
SAHMK_POLL_MS=4000
SA_FETCH_FLOAT=on
# الحماية — مهم جداً على خادم عام:
APP_USER=zenith
APP_PASSWORD=ضع-كلمة-مرور-قوية-هنا
```

### 4) البناء والتشغيل الدائم (pm2)
```bash
npm run build
pm2 start npm --name zenith -- start     # يشغّل next start على المنفذ 3000
pm2 save
pm2 startup        # نفّذ السطر الذي يطبعه (ليعمل تلقائياً بعد إعادة التشغيل)
```
للتحديث لاحقاً:
```bash
cd /var/www/zenith && git pull && npm install && npm run build && pm2 restart zenith
```

### 5) nginx كوسيط عكسي (منفذ 3000 → 80)
```bash
nano /etc/nginx/sites-available/zenith
```
```nginx
server {
    listen 80;
    server_name your-domain.com;   # أو IP الخادم

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache off;
        proxy_buffering off;          # مهم لبثّ SSE
        proxy_read_timeout 86400s;    # لا تقطع البثّ الطويل
    }
}
```
```bash
ln -s /etc/nginx/sites-available/zenith /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 6) HTTPS (ضروري — Basic Auth يرسل كلمة المرور مع كل طلب)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```
تحتاج **نطاقاً (domain)** موجّهاً لـ IP الخادم. تقدر تربط نطاقك من هوستجر (DNS → A record → IP الـ VPS).

بعدها افتح `https://your-domain.com` → يطلب كلمة المرور → الماسح. 🦅

---

## بديل (بدون VPS): منصّة Node مُدارة
لو ما تبي تدير خادماً، منصّات تشغّل Node دائم بضغطة (وتدعم SSE):
- **Railway** · **Render** · **Fly.io** — اربط مستودع GitHub، أضف متغيّرات البيئة (نفس القائمة أعلاه)، وهي تبني وتشغّل تلقائياً. فيها خطط مجانية/رخيصة.
- احذر: بعضها ينيم التطبيق عند الخمول (يقطع المحرّك) — اختر خطة لا تنيمه.

---

## أمان — مهم
- **لا ترفع `.env.local` على Git إطلاقاً** (مُتجاهَل أصلاً في `.gitignore`).
- فعّل `APP_PASSWORD` دائماً على أي خادم عام، واستخدم HTTPS.
- مفاتيحك مدفوعة (Alpaca/AV/SAHMK/Claude) — من يصل للرابط بلا حماية يقدر يستنزفها.
- استخدم كلمة مرور قوية وغيّرها لو تسرّبت.
