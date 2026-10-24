import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ===== حماية بكلمة مرور (HTTP Basic Auth) =====
// تحمي كل الصفحات والمسارات بكلمة مرور واحدة — لمنع أي أحد من استخدام
// الماسح أو استنزاف مفاتيح API المدفوعة عند الرفع على خادم عام.
//
// التفعيل: ضع APP_PASSWORD في بيئة الخادم (و APP_USER اختياري، الافتراضي zenith).
// بدون APP_PASSWORD تكون الحماية معطّلة (مناسب للتطوير المحلي).
//
// ملاحظة أمان: Basic Auth يرسل الاعتماد مع كل طلب (base64 غير مشفّر)،
// لذا استخدمه خلف HTTPS فقط في الإنتاج (nginx + شهادة SSL).

export function middleware(req: NextRequest) {
  const pass = process.env.APP_PASSWORD?.trim();
  if (!pass) return NextResponse.next(); // الحماية معطّلة

  const user = (process.env.APP_USER ?? "zenith").trim();
  const header = req.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6)); // "user:pass"
      const i = decoded.indexOf(":");
      const u = decoded.slice(0, i);
      const p = decoded.slice(i + 1);
      if (u === user && p === pass) return NextResponse.next();
    } catch {
      /* ترويسة غير صالحة */
    }
  }

  return new NextResponse("مطلوب تسجيل الدخول", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Zenith", charset="UTF-8"' },
  });
}

// يطبّق على كل المسارات عدا ملفات Next الثابتة
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
