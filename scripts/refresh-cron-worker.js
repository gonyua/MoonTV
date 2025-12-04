/* eslint-disable no-console */
/**
 * Cloudflare Worker - 剧集更新定时刷新
 *
 * 部署步骤：
 * 1. 在 Cloudflare Dashboard 创建一个新的 Worker
 * 2. 复制此代码到 Worker
 * 3. 设置环境变量 CRON_API_URL (你的网站地址 + /api/cron)
 * 4. 添加 Cron Trigger: 0 17 * * * (UTC 17:00 = 北京时间凌晨 1:00)
 *
 * 或者使用 wrangler 部署:
 * cd scripts && wrangler deploy -c refresh-cron-wrangler.toml
 */

const worker = {
  // 定时触发
  async scheduled(_event, env, _ctx) {
    const apiUrl = env.CRON_API_URL || 'https://your-domain.com/api/cron';

    console.log(`Refresh cron triggered at ${new Date().toISOString()}`);

    try {
      const response = await fetch(apiUrl);
      const result = await response.json();

      console.log('Cron API response:', JSON.stringify(result));

      if (!result.success) {
        console.error('Cron API failed:', result.error);
      }
    } catch (error) {
      console.error('Failed to call cron API:', error);
    }
  },

  // HTTP 请求（用于手动测试）
  async fetch(_request, env, _ctx) {
    const apiUrl = env.CRON_API_URL || 'https://your-domain.com/api/cron';

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
