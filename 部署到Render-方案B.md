# 部署到点菜 H5 到 Render（方案 B · 长期固定地址）

目标：得到一个固定 `https://xxxx.onrender.com` 地址 + 二维码，老婆随时能扫，你关机也不影响。

> ⚠️ 前提：需要一个 GitHub 账号（没有就去 github.com 用邮箱注册，免费）。
> ⚠️ Render 免费版硬盘在「休眠后唤醒 / 重新部署」时可能清空点菜数据；两人同时在线使用时数据正常同步。要永久保存可后续接 Render 免费 Postgres（需要时叫我）。

---

## 第 1 步：把代码推到 GitHub

1. 打开 github.com → 右上角 **＋** → **New repository**
2. 仓库名填 `family-order-h5`，选 **Public**，其他默认 → **Create repository**
3. 在本机 `点菜H5` 目录执行（把下面 `你的用户名` 换成你 GitHub 用户名）：

```bash
cd 点菜H5
git init
git add .
git commit -m "家庭点菜 H5"
git branch -M main
git remote add origin https://github.com/你的用户名/family-order-h5.git
git push -u origin main
```

（没装 git 的话，也可以直接在 GitHub 网页把 5 个文件拖上去：server.js / package.json / Procfile / render.yaml / public 文件夹）

## 第 2 步：用 GitHub 登录 Render 并部署

1. 打开 render.com → **Sign Up** → 选 **GitHub** 登录并授权
2. 控制台点 **New** → **Web Service** → 选 `family-order-h5` 仓库
3. 配置基本已被 `render.yaml` 自动填好，确认：
   - Runtime: Node
   - Build Command: `echo skip-build`
   - Start Command: `node server.js`
   - Plan: **Free**
4. 点 **Create Web Service**
5. 等 1–2 分钟，顶部出现 `https://family-order-h5.onrender.com` 就是公网地址

> 免费实例「冷启动」首次打开可能慢几秒，正常现象。

## 第 3 步：生成二维码发给老婆

拿到地址后，在 `点菜H5` 目录运行（换成你真实的地址）：

```bash
node make_qr.js https://family-order-h5.onrender.com
```

会生成 `点菜二维码.png`，发微信给老婆，她长按扫码即可打开。

---

完成后日常使用方式和 README 一致：老公点菜、老婆查看并标记。
需要我加历史记录 / 多天菜单 / 到点提醒，随时说。
