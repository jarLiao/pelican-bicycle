# v3.1 实现说明

以下“主修正”至“检查”为最初导入 v3.1 时的实现记录，不代表后续版本未修改界面或未做浏览器测试。
当前产品行为以 [EXPERIENCE.md](EXPERIENCE.md) 为准；最新视觉约束见 [CHARACTER_GUIDE.md](CHARACTER_GUIDE.md)。

## 2026-09-16 体验收敛

- 新增独立的首次提示已读键 `pelican-immersive-welcome-v1`，启动写入旅行记录前判断是否为新用户；不覆盖计时、收藏或声音偏好。
- 首次提示为可跳过的非模态区域，可从设置重开；正在进行的计时禁止通过提示切换模式。
- 计时状态文字仅在变化时更新；隐藏数字仍保留状态，不改变计时和旅行规则。
- `CalmAudio.statusInfo()` 区分等待、准备、播放、静音、零音量、恢复和配乐部分失败。提示可收起，恢复操作沿用用户点击，不绕过自动播放限制。
- 使用 Node 内置模块和独立 Chrome 配置进行回归，入口为仓库根目录的 `tests/immersive-experience.cjs`；测试注入仅发生在本地测试服务器响应中，不进入生产页面。

## 主修正

- FocusTimer.startNext 传递 advance:true 和上一轮 scene；初次开始仍使用默认 ensureForFocus。
- ensureForFocus 在事务中按 Date.now() 先 settle，再 advanceUnlocks，再选择活动旅行。
- 随机时排除上一轮场景，新地点建议只能从候选集合中选。
- 若目录或其他自然操作已准备另一处目的地，不再次抽取该目的地。
- 固定选择保持优先，不强制切回 random。
- 暂停和休息路径保持原样，不触发显式轮次换景。

## 未完成进度

日志新增 suspendedTrips，按目的地存一条记录：

```js
{
  id: 'original-trip-id',
  scene: 'guilin',
  variant: 0,
  remainingMs: 1200000,
  originStartedAt: 1234567890000
}
```

切景时，仅保存当前未完成旅行。createTrip 遇到该目的地的 suspendedTrip 时恢复原 id、variant 和 remainingMs，不重抽照片，不重置 15–35 分钟。
活动旅行的 startedAt 是本次继续的起点；originStartedAt 留下最初开始时间。
新的 endsAt = 当前时间 + 剩余时间。暂停队列不按挂钟时间推进。
状态更改、暂存与激活在同一事务完成；每个地点最多一条，容量由已制作场景数约束。

settledIds 和旅行 complete 标识防止重复结算。
cleanJournal 检查暂停记录的目的地、时间、照片编号、唯一 id，与活动旅行/已结算记录冲突时不加载。

## 存储和迁移

日志 key：travel-pelican-journal-v3。schema：3。
启动读取当前日志；不存在时读取 travel-pelican-journal-v2（schema 2），最后才读取 schema 1 旧版。
保留旧键，避免同时打开的旧页面擦掉新增字段。

备份 version 3，可导入外层 version 1/2/3、日志 schema 1/2/3。
照片次数与到访次数沿用保守 max 合并，不宣称是精确跨设备增量同步。
同 id 的暂停记录合并更小的剩余时间，不求和；不同 id 冲突保留本机记录。
不恢复备份中的活动旅行以免替换当前目的地，也不覆盖本机计时和声音设置。

仍是本地客户端体验。Web Locks 可用时跨标签写操作串行；不支持的环境仅尽力保持一致。
不包含服务端鉴权、云同步或反作弊系统。

## 界面

首页、全部 CSS、美术场景、SceneView、CalmAudio、CapsuleTimeOutline 均未改动。
仅设置内的文案区分“已固定”和“已启用随机”，说明每轮切景以及暂停恢复行为。
没有新增模式开关、按钮、奖励提示、进度条或截图式界面。

## 检查

仅静态 JavaScript 语法与保留模块对比；未执行应用、未快进模拟、未做浏览器/音频测试。
