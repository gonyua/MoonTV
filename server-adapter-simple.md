# AginMusic 服务端对接（极简版）

只写你现在要做的 2 个接口：`/rest/getOpenSubsonicExtensions`、`/rest/ping`。

统一约定：

- Base URL：`{BASE}/rest`
- App 可能会带 `c/v/f/t/s` 等参数；你的服务端 **可以全部忽略**。
- JSON 统一外层：
  - 成功：`{ "subsonic-response": { "status": "ok", ... } }`
  - 失败：`{ "subsonic-response": { "status": "failed", "error": { "code": 40, "message": "..." } } }`

---

## 1) 服务器探测

### URL

- `GET {BASE}/rest/getOpenSubsonicExtensions`

### 请求参数

- （可忽略）`c` `v` `f`

### 返回数据（固定返回即可）

```json
{
  "subsonic-response": {
    "status": "ok",
    "serverVersion": "0.0.0",
    "openSubsonicExtensions": []
  }
}
```

---

## 2) 登录校验

### URL

- `GET {BASE}/rest/ping`

### 请求参数（你真正需要的）

- `u`：用户名
- `p`：明文密码（当前 App 会在 `ping` 里携带）

### 返回数据

成功：

```json
{
  "subsonic-response": {
    "status": "ok",
    "version": "1.16.1",
    "type": "AginMusicAdapter",
    "serverVersion": "0.0.0"
  }
}
```

失败：

```json
{
  "subsonic-response": {
    "status": "failed",
    "error": { "code": 40, "message": "Invalid username or password" }
  }
}
```

---

## 3) 搜索（Search）

### URL

- `GET {BASE}/rest/search3`

### 请求参数（App 会传的核心参数）

- `query`：搜索关键字（可能为空字符串；长度为 1 时 App 不展示结果但仍可能请求）
- `albumCount`：专辑返回数量（App 固定传 `20`）
- `artistConut`：歌手返回数量（App 固定传 `20`，注意拼写就是 `artistConut`）
  - （可选兼容）你也可以同时支持标准拼写 `artistCount`
- `songCount`：歌曲返回数量（App 固定传 `20`）
- `albumOffset`：专辑偏移（number）
- `artistOffset`：歌手偏移（number）
- `songOffset`：歌曲偏移（number）

### 返回数据（最小字段）

```json
{
  "subsonic-response": {
    "status": "ok",
    "searchResult3": {
      "album": [
        {
          "id": "a1",
          "name": "Album",
          "artist": "Artist",
          "year": 2024,
          "coverArt": "cover-1"
        }
      ],
      "artist": [
        {
          "id": "ar1",
          "name": "Artist",
          "coverArt": "cover-2",
          "albumCount": 0
        }
      ],
      "song": [
        {
          "id": "s1",
          "isDir": false,
          "title": "Song",
          "artist": "Artist",
          "coverArt": "cover-3"
        }
      ]
    }
  }
}
```
