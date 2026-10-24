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

### ⚡ أسرع طريقة: سكربت واحد
على الخادم (كـ root) نفّذ هذا السطر — يثبّت كل شي، يبني، يشغّل دائماً، ويضبط nginx + HTTPS تلقائياً (يطلب منك لصق مفاتيحك ونطاقك فقط):
```bash
apt-get update -y && apt-get install -y git && git clone https://github.com/farhanSahba/zenith-scanner.git /var/www/zenith && bash /var/www/zenith/scripts/deploy-vps.sh
```
أو الخطوات اليدوية أدناه للفهم/التحكّم.

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

## بديل (بدون VPS): منصّات Node مُدارة

هذه المنصّات تشغّل Node **دائماً** (ليست serverless مثل Vercel) وتدعم SSE — تبني من مستودع GitHub مباشرة.

### الحقيقة عن "المجاني" (مهم لماسح لحظي)
| المنصّة | التكلفة | ينام عند الخمول؟ | مناسب للتنبيهات وأنت بعيد؟ |
|---|---|---|---|
| **Render Free** | مجاني (750 ساعة/شهر) | **نعم، بعد 15د** (إعادة 30–60ث، الحالة تضيع) | ❌ فقط وأنت فاتح الشاشة |
| **Render Starter** | ~$7/شهر | لا | ✅ |
| **Railway** | تجربة $5 (30يوم) ثم ~$5/شهر | لا (Hobby دائم) | ✅ |
| **Hostinger VPS** | ~$5/شهر | لا | ✅ |

**الخلاصة:** التشغيل الدائم 24/5 (ليصلك تنبيه برقية وأنت مو فاتح الشاشة) يكلّف ~$5/شهر على أي خيار. المجاني الحقيقي (Render Free) ينام فيتوقّف المحرّك.

### أ) Render — الأسهل (فيه Blueprint جاهز)
1. تأكّد أن الكود على GitHub (موجود: `farhanSahba/zenith-scanner`).
2. [render.com](https://render.com) → سجّل بـ GitHub → **New +** → **Blueprint** → اختر المستودع (يقرأ `render.yaml` تلقائياً).
   - أو يدوياً: **New Web Service** → اربط المستودع → Build: `npm install && npm run build` · Start: `npm start`.
3. اختر الخطة: **Free** (ينام) أو **Starter** (دائم).
4. **Environment** → أضف كل المفاتيح (نفس قائمة `.env.local` أعلاه) **+ `APP_PASSWORD`**.
5. **Create** → ينتظر البناء (~2–4 دقائق) → يعطيك رابط `https://zenith-xxxx.onrender.com`.
6. افتح الرابط → يطلب كلمة المرور → الماسح. HTTPS مجاني تلقائياً ✅.

### ب) Railway — دائم التشغيل
1. [railway.com](https://railway.com) → سجّل بـ GitHub → **New Project** → **Deploy from GitHub repo** → اختر المستودع.
2. يكتشف Next.js تلقائياً (build/start). إن احتاج: Start Command = `npm start`.
3. **Variables** → أضف كل المفاتيح + `APP_PASSWORD`.
4. **Settings → Networking → Generate Domain** → رابط `https://zenith-xxxx.up.railway.app`.
5. التجربة $5 لـ30 يوم؛ للاستمرار فعّل خطة **Hobby**.

### ملاحظات للمنصّتين
- **إصدار Node:** أضف متغيّراً `NODE_VERSION=20` (Render) — Railway يختار حديثاً تلقائياً.
- **المنفذ:** `next start` يقرأ `PORT` الذي تضبطه المنصّة تلقائياً — لا تحتاج إعداداً.
- **`data/perf.json` يُصفّر** عند كل إعادة نشر/تشغيل (نظام ملفات مؤقت) — سجلّ الأداء يبدأ من جديد. (للاحتفاظ به: قرص دائم على الخطط المدفوعة.)
- **التحديث:** ادفع على GitHub (`git push`) → المنصّة تعيد البناء والنشر تلقائياً.

---

## أمان — مهم
- **لا ترفع `.env.local` على Git إطلاقاً** (مُتجاهَل أصلاً في `.gitignore`).
- فعّل `APP_PASSWORD` دائماً على أي خادم عام، واستخدم HTTPS.
- مفاتيحك مدفوعة (Alpaca/AV/SAHMK/Claude) — من يصل للرابط بلا حماية يقدر يستنزفها.
- استخدم كلمة مرور قوية وغيّرها لو تسرّبت.
