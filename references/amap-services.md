# 高德地图服务集成指南

本指南描述如何在行程规划和地图构建中使用高德 JSAPI v2.0 的各项服务。

## 前置条件

- 已配置 AMap API Key 和安全密钥（见 `assets/env.js`）
- 已加载 AMapLoader 并预加载对应插件

## Phase 1 服务

### 地理编码 (Geocoder)

地址转坐标，为所有地点生成精确坐标。

```javascript
AMapLoader.load({
  key: window.AMAP_JSAPI_KEY,
  version: '2.0',
  plugins: ['AMap.Geocoder']
}).then((AMap) => {
  const geocoder = new AMap.Geocoder({ city: '' });
  geocoder.getLocation(address, (status, result) => {
    if (status === 'complete' && result.geocodes.length) {
      const { lng, lat } = result.geocodes[0].location;
      // 写入 route-schema.json
    }
  });
});
```

### 路径规划

根据交通方式选择对应服务：

```javascript
plugins: ['AMap.Driving', 'AMap.Transfer', 'AMap.Walking']

// 自驾
const driving = new AMap.Driving({ policy: AMap.DrivingPolicy.LEAST_TIME });
driving.search([lng1, lat1], [lng2, lat2], (status, result) => {
  if (status === 'complete') {
    const time = result.routes[0].time;     // 秒
    const distance = result.routes[0].distance; // 米
  }
});

// 公共交通
const transfer = new AMap.Transfer({ city: '北京' });
transfer.search([lng1, lat1], [lng2, lat2], (status, result) => {
  if (status === 'complete') {
    const time = result.plans[0].time;
    const distance = result.plans[0].distance;
  }
});

// 步行
const walking = new AMap.Walking();
walking.search([lng1, lat1], [lng2, lat2], (status, result) => {
  if (status === 'complete') {
    const time = result.routes[0].time;
    const distance = result.routes[0].distance;
  }
});
```

### 行政区查询 (DistrictSearch)

```javascript
plugins: ['AMap.DistrictSearch']

const district = new AMap.DistrictSearch({
  level: 'district',
  subdistrict: 1
});
district.search('北京', (status, result) => {
  if (status === 'complete') {
    result.districtList[0].districtList.forEach(d => {
      // d.name, d.center, d.boundaries
    });
  }
});
```

## Phase 2 服务

### POI 搜索 (PlaceSearch)

按区域搜索餐厅/景点：

```javascript
plugins: ['AMap.PlaceSearch']

const placeSearch = new AMap.PlaceSearch({
  type: '餐饮服务',
  pageSize: 10,
  pageIndex: 1
});

// 周边搜索
placeSearch.searchNearBy('餐厅', [lng, lat], 3000, (status, result) => {
  if (status === 'complete') {
    result.poiList.pois.forEach(poi => {
      // poi.name, poi.location.lng, poi.location.lat
      // poi.address, poi.tel, poi.type
    });
  }
});
```

### 输入提示 (AutoComplete)

用户提到具体店名时补全地址：

```javascript
plugins: ['AMap.AutoComplete']

const autoComplete = new AMap.AutoComplete({ city: '北京' });
autoComplete.search(keyword, (status, result) => {
  if (status === 'complete') {
    result.tips.forEach(tip => {
      // tip.name, tip.district, tip.location
    });
  }
});
```

### 天气查询 (Weather)

```javascript
plugins: ['AMap.Weather']

const weather = new AMap.Weather();
// 实时天气
weather.getLive('北京', (err, data) => {
  // data.weather, data.temperature, data.windDirection
});
// 天气预报
weather.getForecast('北京', (err, data) => {
  // data.forecasts[] — 未来几天天气预报
});
```

## Phase 3 地图渲染

### 地图初始化

```javascript
AMapLoader.load({
  key: window.AMAP_JSAPI_KEY,
  version: '2.0',
  plugins: ['AMap.Scale', 'AMap.ToolBar', 'AMap.ControlBar']
}).then((AMap) => {
  AMap.getConfig().appname = 'travel-assistant';

  const map = new AMap.Map('container', {
    viewMode: '3D',
    zoom: 12,
    center: [116.397, 39.909],
    pitch: 45,
    mapStyle: 'amap://styles/normal'
  });

  map.addControl(new AMap.Scale());
  map.addControl(new AMap.ToolBar({ position: 'RT' }));
  map.addControl(new AMap.ControlBar({
    position: { right: '10px', top: '60px' }
  }));
});
```

### 覆盖物

```javascript
// 标记
const marker = new AMap.Marker({
  position: [lng, lat],
  title: '名称'
});
map.add(marker);

// 信息窗体
const infoWindow = new AMap.InfoWindow({
  content: '<div>内容</div>',
  offset: new AMap.Pixel(0, -30)
});
infoWindow.open(map, [lng, lat]);

// 路线连线
const polyline = new AMap.Polyline({
  path: [[lng1, lat1], [lng2, lat2]],
  strokeColor: '#0071e3',
  strokeWeight: 3,
  strokeOpacity: 0.6,
  strokeStyle: 'dashed'
});
map.add(polyline);
```

### 按天切换

```javascript
let currentMarkers = [];
let currentPolylines = [];

function clearMap() {
  currentMarkers.forEach(m => map.remove(m));
  currentPolylines.forEach(p => map.remove(p));
  currentMarkers = [];
  currentPolylines = [];
}

function showDay(dayIndex) {
  clearMap();
  const day = DAYS[dayIndex];
  const coords = [];
  day.locations.forEach(l => {
    const marker = new AMap.Marker({ position: [l.lng, l.lat] });
    map.add(marker);
    currentMarkers.push(marker);
    coords.push([l.lng, l.lat]);
  });
  if (coords.length > 1) {
    const polyline = new AMap.Polyline({
      path: coords,
      strokeColor: day.color,
      strokeWeight: 3
    });
    map.add(polyline);
    currentPolylines.push(polyline);
  }
  map.setFitView();
}
```

### 销毁

```javascript
map.destroy();
```

## 官方文档

- [JSAPI v2.0 文档](https://lbs.amap.com/api/jsapi-v2/summary/)
- [示例中心](https://lbs.amap.com/demo/list/jsapi-v2)
- [控制台](https://console.amap.com/)
