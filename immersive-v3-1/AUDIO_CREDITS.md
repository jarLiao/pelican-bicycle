# 音频素材与许可

本文件与 HTML 的「设置 → 偏好 → 音乐文件与素材来源」共同提供署名。发布网页或重新打包时，请保留署名和对应许可证链接。

## 已内嵌的真实环境录音

素材通过 Blanket 项目的声音素材版本获得，只提取并使用独立声音素材，不使用 Blanket 程序代码。
素材版本：`rafaelmardojai/blanket@9d229d2be7cb6619135d55ff9e49926e40298686`
素材目录：https://github.com/rafaelmardojai/blanket/tree/9d229d2be7cb6619135d55ff9e49926e40298686/data/resources/sounds
许可清单：https://github.com/rafaelmardojai/blanket/blob/9d229d2be7cb6619135d55ff9e49926e40298686/SOUNDS_LICENSING.md

| 内嵌标识 | 原作品与作者 | 许可 | 原作品来源 |
| --- | --- | --- | --- |
| waves | oceanwavescrushing.wav — Luftrum | CC BY 4.0 | https://freesound.org/people/Luftrum/sounds/48412/ |
| rain | rain ambience — alex36917 | CC BY 4.0 | https://freesound.org/people/alex36917/sounds/524605/ |
| stream | stream2.wav — gluckose | CC0 1.0 | https://freesound.org/people/gluckose/sounds/333987/ |
| wind | Wind blowing in a field in Texas, USA — felix.blume | CC0 1.0 | https://freesound.org/people/felix.blume/sounds/217506/ |
| city | NYC_street leve02l.wav — gezortenplotz | CC BY 3.0 | https://freesound.org/people/gezortenplotz/sounds/44796/ |

上述海浪、雨、风与城市素材的先前循环编辑者：Porrumentzio。
此版本修改：截取（部分录音）、静态电平调整、适度高低通滤波、转码为 160 kbps 立体声 MP3、播放端循环交叉淡化与场景混音。
雨声使用上述 Blanket 版本第 5 秒起的 85 秒，不使用录音末尾部分。未进行试听，不能据此保证原录音中的所有细节声音都已排除。

这些素材是氛围配音，不是中国目的地的现场录音。海浪源录于丹麦；城市源录于纽约；风源录于美国得克萨斯；溪流源录于法国。洱海与三亚的水岸声使用同一份海岸录音的不同强度混音，洱海另叠加很低音量的风。不要宣传为「六地原声」「洱海实地采集」或各地独立录音。

许可原文：
- CC BY 4.0：https://creativecommons.org/licenses/by/4.0/
- CC BY 3.0：https://creativecommons.org/licenses/by/3.0/
- CC0 1.0：https://creativecommons.org/publicdomain/zero/1.0/

原作者和 Blanket 项目不代表认可或参与本网页。素材许可不等于商标或背书授权。

## 可选成品配乐：联网加载，未内嵌

'Reverie' by Scott Buckley — released under CC-BY 4.0. www.scottbuckley.com.au
作品页面：https://www.scottbuckley.com.au/library/reverie/
许可证：https://creativecommons.org/licenses/by/4.0/
作者官网提供的 MP3：https://www.scottbuckley.com.au/library/wp-content/uploads/2020/03/sb_reverie.mp3

轻配乐播放的是完整作品，不是实时算法合成音。应用只调整播放音量、启停和循环，不重编作品。本交付包没有这份 MP3 的离线字节；浏览器首次播放需要访问作者官网，网络失败时不会改用简易合成配乐。

## 用户导入的音乐

导入文件只在设备中读取，浏览器支持时存储在 IndexedDB。不上传，也不会自动打包进站点 ZIP。发布用户自己选择的音乐前，需要自行确认文件的使用与分发授权；本项目的默认素材许可不涵盖用户导入的其他作品。

## 可选生成声音

白／粉红／棕噪声仍为本地算法生成，它们是明确命名的基础噪声选项，不冒充自然录音。到时提示为低音量单提示音，非乐器录音。
