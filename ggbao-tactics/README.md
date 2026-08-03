# GGBAO 战队 · 教练战术板（共享版）

教练摆阵容（编辑），全队打开同一链接实时看到，5 秒自动同步。

## 本地运行（纯前端，无同步）
直接双击 `index.html` 即可在浏览器打开，数据存在本机浏览器。

## 本地运行（含云端同步，需 Node）
```
node server.js
```
打开 http://localhost:3000 —— 此时编辑会通过 /api/lineup 存到 lineup.json，多开几个标签页即可看到互相同步。

## 部署到 Render（让教练/队友联网访问）
1. 把本目录推到 GitHub 仓库 `family-cook` 的 `ggbao-tactics/` 子目录
2. render.com → New → Web Service → 选同一仓库
3. **Root Directory** 填 `ggbao-tactics`
4. Build Command：`echo "no build needed"`
5. Start Command：`node server.js`
6. Plan：Free
7. 部署完成后得到地址，用 `make_qr.js <地址>` 生成二维码发给教练

> 部署时若提示需要银行卡，按提示用国内双币信用卡做 $1 预授权（不扣款）。
> 微信里打开外部网页若提示「在浏览器打开」，点右上角 ⋯ → 在浏览器打开即可。
