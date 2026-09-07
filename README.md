# 鹈鹕的沿途电台

纯 SVG 绘制的鹈鹕骑自行车 2D 动画，搭配天气、风景、昼夜与本地合成音乐。

## 在线访问

[https://jarliao.github.io/pelican-bicycle/](https://jarliao.github.io/pelican-bicycle/)

## 本地打开

直接用浏览器打开 `index.html`。页面源文件沿用最新音乐版，没有修改动画代码。

## GitHub Pages

站点从 `main` 分支根目录发布，仓库根目录保留 `index.html` 和 `.nojekyll`：

- Source: Deploy from a branch
- Branch: main
- Folder: / (root)

## 说明

这是独立静态页面，无需服务端。发布到 GitHub Pages 后，页面和公开仓库内容可被其他人访问。

发布前已通过 Node.js 完成内联 JavaScript 语法检查，并使用 Chrome 152 完成页面加载与主视觉渲染检查。浏览器会要求用户先与页面交互，之后才能播放 Web Audio 合成音乐。
