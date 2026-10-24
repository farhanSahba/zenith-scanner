/** @type {import('next').NextConfig} */
const nextConfig = {
  // الماسح يعتمد على singleton خادمي للحالة اللحظية؛ نعطّل StrictMode
  // في التطوير حتى لا تتضاعف اتصالات SSE أو يُعاد تهيئة المحرّك مرتين.
  reactStrictMode: false,
};

export default nextConfig;
