/* eslint-disable no-console */

import { NextResponse } from 'next/server';

export const runtime = 'edge';

interface BaiduRouteResult {
  status: number;
  message: string;
  result?: {
    routes: Array<{
      distance: number; // 米
      duration: number; // 秒
      toll: number; // 过路费
      traffic_condition: number; // 0无路况 1畅通 2缓行 3拥堵 4严重拥堵
    }>;
  };
}

interface BaiduWeatherResult {
  status: number;
  message: string;
  result?: {
    location: {
      country: string;
      province: string;
      city: string;
      name: string; // 区县名称
    };
    now: {
      temp: number; // 温度℃
      feels_like: number; // 体感温度℃
      rh: number; // 相对湿度%
      wind_class: string; // 风力等级
      wind_dir: string; // 风向
      text: string; // 天气现象
      aqi: number; // 空气质量指数
      pm25: number;
    };
    forecasts?: Array<{
      text_day?: string;
      text_night?: string;
      low?: string | number;
      high?: string | number;
      wc_day?: string;
      wc_night?: string;
      date?: string;
      week?: string;
    }>;
    alerts?: Array<{
      type: string;
      level: string;
      title: string;
      desc: string;
    }>;
  };
}

const TRAFFIC_STATUS: Record<number, string> = {
  0: '无路况',
  1: '畅通',
  2: '缓行',
  3: '拥堵',
  4: '严重拥堵',
};

async function fetchRouteInfo(): Promise<BaiduRouteResult> {
  const ak = process.env.BAIDU_MAP_AK;
  const origin = process.env.COMMUTE_ORIGIN;
  const destination = process.env.COMMUTE_DESTINATION;

  if (!ak || !origin || !destination) {
    throw new Error(
      '缺少必要的环境变量: BAIDU_MAP_AK, COMMUTE_ORIGIN, COMMUTE_DESTINATION'
    );
  }

  const url = `https://api.map.baidu.com/directionlite/v1/driving?origin=${origin}&destination=${destination}&ak=${ak}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`百度地图API请求失败: ${response.status}`);
  }

  return response.json();
}

async function fetchWeatherInfo(location: string): Promise<BaiduWeatherResult> {
  const ak = process.env.BAIDU_MAP_AK;

  if (!ak) {
    throw new Error('缺少环境变量: BAIDU_MAP_AK');
  }

  // 路线规划用的是 纬度,经度 格式，天气API需要 经度,纬度 格式，需要转换
  const [lat, lng] = location.split(',');
  const weatherLocation = `${lng},${lat}`;

  const url = `https://api.map.baidu.com/weather/v1/?location=${weatherLocation}&data_type=all&ak=${ak}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`百度天气API请求失败: ${response.status}`);
  }

  return response.json();
}

async function sendToWecom(message: string): Promise<void> {
  const webhookUrl = process.env.WECOM_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error('缺少环境变量: WECOM_WEBHOOK_URL');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: {
        content: message,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`企业微信发送失败: ${response.status}`);
  }

  const result = await response.json();
  if (result.errcode !== 0) {
    throw new Error(`企业微信返回错误: ${result.errmsg}`);
  }
}

function formatWeatherSection(
  weather: BaiduWeatherResult['result'],
  label: string
): string {
  if (!weather || !weather.now) {
    // return `**${label}**\n> ❌ 未获取到天气信息`;
    void label;
    return '未知';
  }

  const { now, location, alerts } = weather;
  const locationName = location?.name || location?.city || '未知';
  const aqi = now.aqi !== 999999 ? now.aqi : '暂无';
  const rh = now.rh !== 999999 ? `${now.rh}%` : '暂无';

  //   let section = `**${label}（${locationName}）**
  // > 🌡️ 温度：${now.temp}℃（体感 ${now.feels_like}℃）
  // > ☁️ 天气：${now.text}
  // > 💨 ${now.wind_dir} ${now.wind_class} | 💧 湿度 ${rh} | 🌬️ AQI ${aqi}`;
  //   if (alerts && alerts.length > 0) {
  //     const alertStr = alerts.map((a) => `⚠️ ${a.title}`).join('\n> ');
  //     section += `\n> ${alertStr}`;
  //   }

  // 简洁格式：只返回天气现象
  void locationName;
  void aqi;
  void rh;
  void alerts;
  return now.text;
}

function getBeijingTime() {
  const now = new Date();

  try {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === 'hour');
    const minutePart = parts.find((p) => p.type === 'minute');
    const hour = hourPart
      ? parseInt(hourPart.value, 10)
      : now.getUTCHours() + 8;
    const minute = minutePart
      ? parseInt(minutePart.value, 10)
      : now.getUTCMinutes();

    return {
      hour: ((hour % 24) + 24) % 24,
      minute,
    };
  } catch {
    return {
      hour: (((now.getUTCHours() + 8) % 24) + 24) % 24,
      minute: now.getUTCMinutes(),
    };
  }
}

function formatMessage(
  route: BaiduRouteResult['result'],
  originWeather: BaiduWeatherResult['result'],
  _destWeather: BaiduWeatherResult['result']
): string {
  const now = new Date();
  const timeStr = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  let routeSection = '';
  if (!route || !route.routes || route.routes.length === 0) {
    routeSection = `**🚗 通勤路况**\n> ❌ 未获取到路线信息`;
  } else {
    const r = route.routes[0];
    const distanceKm = (r.distance / 1000).toFixed(1);
    const durationMin = Math.round(r.duration / 60);
    const trafficStatus = TRAFFIC_STATUS[r.traffic_condition] || '未知';

    // 简洁格式：路况大于畅通时加红色感叹号
    void distanceKm;
    void durationMin;
    const warningPrefix =
      r.traffic_condition > 1
        ? '<font color="warning">‼️</font>'
        : '<font color="green">✅</font>';
    routeSection = `${warningPrefix}${trafficStatus}`;

    //     routeSection = `**🚗 通勤路况**
    // > 📍 距离：<font color="info">${distanceKm} 公里</font>
    // > ⏱️ 预计耗时：<font color="warning">${durationMin} 分钟</font>
    // > 🚦 路况：<font color="${r.traffic_condition <= 1 ? 'info' : 'warning'}">${trafficStatus}</font>
    // > 💰 过路费：${r.toll} 元`;
  }

  const durationMin = route?.routes?.[0]?.duration
    ? Math.round(route.routes[0].duration / 60)
    : 0;

  void timeStr;
  const originWeatherText = formatWeatherSection(originWeather, '');

  // 简洁格式：畅通，晴，11分钟
  return `${routeSection}，${originWeatherText}，${durationMin}分钟`;

  //   const originWeatherSection = formatWeatherSection(originWeather, '🌤️ 出发地天气');
  //   const destWeatherSection = formatWeatherSection(destWeather, '🌤️ 目的地天气');
  //   return `${routeSection}
  // ${originWeatherSection}
  // ${destWeatherSection}
  // > ⏰ 播报时间：${timeStr}`;
}

async function handleCommuteBroadcast() {
  try {
    console.log('通勤播报查询开始:', new Date().toISOString());

    const origin = process.env.COMMUTE_ORIGIN;
    const destination = process.env.COMMUTE_DESTINATION;

    if (!origin || !destination) {
      throw new Error('缺少环境变量: COMMUTE_ORIGIN, COMMUTE_DESTINATION');
    }

    const [routeResult, originWeatherResult, destWeatherResult] =
      await Promise.all([
        fetchRouteInfo(),
        fetchWeatherInfo(origin),
        fetchWeatherInfo(destination),
      ]);

    if (routeResult.status !== 0) {
      console.warn(`路线API返回错误: ${routeResult.message}`);
    }
    if (originWeatherResult.status !== 0) {
      console.warn(`出发地天气API返回错误: ${originWeatherResult.message}`);
    }
    if (destWeatherResult.status !== 0) {
      console.warn(`目的地天气API返回错误: ${destWeatherResult.message}`);
    }

    const message = formatMessage(
      routeResult.status === 0 ? routeResult.result : undefined,
      originWeatherResult.status === 0 ? originWeatherResult.result : undefined,
      destWeatherResult.status === 0 ? destWeatherResult.result : undefined
    );

    await sendToWecom(message);

    console.log('通勤播报发送成功');

    return NextResponse.json({
      success: true,
      message: '通勤播报已发送到企业微信',
      data: {
        route: {
          distance: routeResult.result?.routes[0]?.distance,
          duration: routeResult.result?.routes[0]?.duration,
          traffic_condition: routeResult.result?.routes[0]?.traffic_condition,
        },
        originWeather: originWeatherResult.result?.now,
        destWeather: destWeatherResult.result?.now,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('通勤播报查询失败:', error);

    return NextResponse.json(
      {
        success: false,
        message: '通勤播报查询失败',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

async function handleTomorrowWeatherBroadcast() {
  try {
    console.log('明日天气播报查询开始:', new Date().toISOString());

    const origin = process.env.COMMUTE_ORIGIN;

    if (!origin) {
      throw new Error('缺少环境变量: COMMUTE_ORIGIN');
    }

    const originWeatherResult = await fetchWeatherInfo(origin);

    if (originWeatherResult.status !== 0) {
      console.warn(
        `天气API返回错误: ${originWeatherResult.message || 'unknown error'}`
      );
    }

    const weather =
      originWeatherResult.status === 0 ? originWeatherResult.result : undefined;

    let message = '未获取到明日天气预报';

    const forecast = weather?.forecasts && weather.forecasts[0];
    if (forecast) {
      const textDay = forecast.text_day || '天气情况未知';
      const low = forecast.low ?? '';
      const high = forecast.high ?? '';
      const wcDay = forecast.wc_day || '';

      const lowStr = low === '' ? '' : String(low);
      const highStr = high === '' ? '' : String(high);
      const tempPart =
        lowStr && highStr ? `${lowStr}~${highStr}℃` : lowStr || highStr;

      if (tempPart && wcDay) {
        message = `明天${textDay}，${tempPart}，${wcDay}`;
      } else if (tempPart) {
        message = `明天${textDay}，${tempPart}`;
      } else {
        message = `明天${textDay}`;
      }
    }

    await sendToWecom(message);

    console.log('明日天气播报发送成功');

    return NextResponse.json({
      success: true,
      message: '明日天气播报已发送到企业微信',
      data: {
        originWeatherForecast: forecast ?? null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('明日天气播报查询失败:', error);

    return NextResponse.json(
      {
        success: false,
        message: '明日天气播报查询失败',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const { hour, minute } = getBeijingTime();
  const totalMinutes = hour * 60 + minute;

  console.log(
    '通勤接口触发，北京时间:',
    `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  );

  const morningStart = 8 * 60 + 10;
  const morningEnd = 8 * 60 + 30;
  const eveningStart = 20 * 60 - 10;
  const eveningEnd = 20 * 60 + 10;

  const inMorningWindow =
    totalMinutes >= morningStart && totalMinutes <= morningEnd;
  const inEveningWindow =
    totalMinutes >= eveningStart && totalMinutes <= eveningEnd;

  if (inMorningWindow) {
    return handleCommuteBroadcast();
  }

  if (inEveningWindow) {
    return handleTomorrowWeatherBroadcast();
  }

  return NextResponse.json({
    success: false,
    message:
      '当前时间不是配置的定时任务时间，仅支持北京时间早上8:20前后10分钟或晚上8:00前后10分钟触发',
    timestamp: new Date().toISOString(),
  });
}
