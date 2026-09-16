# 鹈鹕的沿途电台

纯 SVG 绘制的鹈鹕骑自行车 2D 动画，搭配天气、风景、昼夜与本地合成音乐。

## 在线访问

- 沿途电台版：[https://jarliao.github.io/pelican-bicycle/](https://jarliao.github.io/pelican-bicycle/)
- 极简专注版：[https://jarliao.github.io/pelican-bicycle/minimal/](https://jarliao.github.io/pelican-bicycle/minimal/)
- 全屏沉浸 v3.1：[https://jarliao.github.io/pelican-bicycle/immersive-v3-1/](https://jarliao.github.io/pelican-bicycle/immersive-v3-1/)

## 本地打开

直接用浏览器打开根目录的 `index.html` 可查看沿途电台版，打开 `minimal/index.html` 可查看极简专注版，打开 `immersive-v3-1/index.html` 可查看全屏沉浸 v3.1。三个版本均为独立静态网页。

## GitHub Pages

站点从 `main` 分支根目录发布，仓库根目录保留 `index.html` 和 `.nojekyll`：

- Source: Deploy from a branch
- Branch: main
- Folder: / (root)

`minimal/` 和 `immersive-v3-1/` 子目录会由同一个 GitHub Pages 站点发布为独立 URL，不会覆盖仓库根目录首页。

## 说明

三个版本都是独立静态页面，无需服务端。发布到 GitHub Pages 后，页面和公开仓库内容可被其他人访问。

发布前已通过 Node.js 完成内联 JavaScript 语法检查，并使用 Chrome 152 完成页面加载与主视觉渲染检查。浏览器会要求用户先与页面交互，之后才能播放 Web Audio 合成音乐。
