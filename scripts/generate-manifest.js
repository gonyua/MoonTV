#!/usr/bin/env node
/* eslint-disable */
// 根据 SITE_NAME 动态生成 manifest.json

const fs = require('fs');
const path = require('path');

// 获取项目根目录
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const manifestPath = path.join(publicDir, 'manifest.json');
const navsManifestPath = path.join(publicDir, 'manifest-navs.json');
const moviesquareManifestPath = path.join(
  publicDir,
  'manifest-moviesquare.json'
);

// 从环境变量获取站点名称
const siteName = process.env.SITE_NAME || 'MoonTV';
const writeManifest = (filePath, manifest) => {
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
};

// manifest.json 模板
const createManifest = (startUrl) => ({
  name: siteName,
  short_name: siteName,
  description: '影视聚合',
  start_url: startUrl,
  id: startUrl,
  scope: '/',
  display: 'standalone',
  background_color: '#000000',
  'apple-mobile-web-app-capable': 'yes',
  'apple-mobile-web-app-status-bar-style': 'black',
  icons: [
    {
      src: '/icons/icon-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: '/icons/icon-256x256.png',
      sizes: '256x256',
      type: 'image/png',
    },
    {
      src: '/icons/icon-384x384.png',
      sizes: '384x384',
      type: 'image/png',
    },
    {
      src: '/icons/icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
  ],
});

const navsManifest = {
  ...createManifest('/navs'),
  name: 'navs',
  short_name: 'navs',
  description: '导航聚合',
  scope: '/navs',
};

const moviesquareManifest = {
  name: 'moviesquare',
  short_name: 'moviesquare',
  description: '电影票房榜',
  start_url: '/moviesquare',
  id: '/moviesquare',
  scope: '/moviesquare',
  display: 'standalone',
  background_color: '#fff3dc',
  'apple-mobile-web-app-capable': 'yes',
  'apple-mobile-web-app-status-bar-style': 'black',
  icons: [
    {
      src: '/icons/moviesquare-icon-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: '/icons/moviesquare-icon-256x256.png',
      sizes: '256x256',
      type: 'image/png',
    },
    {
      src: '/icons/moviesquare-icon-384x384.png',
      sizes: '384x384',
      type: 'image/png',
    },
    {
      src: '/icons/moviesquare-icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
  ],
};

try {
  // 确保 public 目录存在
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 写入 manifest.json
  writeManifest(manifestPath, createManifest('/'));
  writeManifest(navsManifestPath, navsManifest);
  writeManifest(moviesquareManifestPath, moviesquareManifest);
  console.log(`✅ Generated manifest.json with site name: ${siteName}`);
} catch (error) {
  console.error('❌ Error generating manifest.json:', error);
  process.exit(1);
}
