/* eslint-disable no-console */
/**
 * Cloudflare Worker - 通勤路况定时触发
 *
 * 部署步骤：
 * 1. 在 Cloudflare Dashboard 创建一个新的 Worker
 * 2. 复制此代码到 Worker
 * 3. 设置环境变量 COMMUTE_API_URL (你的网站地址 + /api/commute)
 * 4. 添加 Cron Trigger: 20 0 * * 1-5 (UTC 0:20 = 北京时间 8:20，周一到周五)
 *
 * 或者使用 wrangler 部署:
 * wrangler deploy --name commute-cron
 */

const worker = {
  // 定时触发
  async scheduled(_event, env, _ctx) {
    const apiUrl = env.COMMUTE_API_URL || 'https://your-domain.com/api/commute';

    console.log(`Cron triggered at ${new Date().toISOString()}`);

    try {
      const response = await fetch(apiUrl);
      const result = await response.json();

      console.log('Commute API response:', JSON.stringify(result));

      if (!result.success) {
        console.error('Commute API failed:', result.error);
      }
    } catch (error) {
      console.error('Failed to call commute API:', error);
    }
  },

  // HTTP 请求（用于手动测试）
  async fetch(_request, env, _ctx) {
    const apiUrl = env.COMMUTE_API_URL || 'https://your-domain.com/api/commute';

    try {
      const response = await fetch(apiUrl);
      const result = await response.json();

      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};

export default worker;
