/**
 * 高德地图 JSAPI 配置文件模板
 *
 * 使用方法：
 * 1. 复制本文件为 env.js:  cp env.example.js env.js
 * 2. 填入你的高德 Web 端 Key 和安全密钥
 * 3. env.js 已被 .gitignore 排除，不会提交到仓库
 *
 * 获取密钥：https://console.amap.com/dev/key/app
 */

// 安全密钥配置（开发环境明文设置，生产环境请使用代理转发）
window._AMapSecurityConfig = {
  securityJsCode: 'YOUR_SECURITY_JS_CODE',
};

// 高德地图 Web 端开发者 Key
window.AMAP_JSAPI_KEY = 'YOUR_AMAP_JSAPI_KEY';

// 高德 Web 服务型 Key（v1.5.0+ REST API 路线验证用）
// 注意：与 JSAPI Key 不同，需在控制台单独创建「Web 服务」型应用
window.AMAP_REST_KEY = 'YOUR_AMAP_REST_KEY';