# P1–P5 / C1–C3 接入记录

日期：2026-10-21。编号以用户实际看到的聊天选型表为准，修正研究清单早期 P2/P3/P5 排序不一致的问题。

| 编号 | 用户选型 | 应用结构 ID | 实现与来源状态 |
|---|---|---|---|
| P1 | 锁盖卡牌盒 | card-deck-lock | 独立参数化几何；采用侧防尘翼、内托片、粘口独立锁片、可开合盖片的结构关系。PackBox 为参考，保留其 MIT 致谢 |
| P2 | 0421 翻盖展示盒 | display-hinged | 独立参数化几何；底盘、四壁、折返双层侧壁、长翻盖、两侧插翼、前锁舌。没有复制嵌入商业捕获样本的生成器，不声称厂商原刀版逐点一致 |
| P3 | 0206 全搭盖运输箱 | full-overlap-shipper | 独立参数化几何；上下两组长摇盖全搭接，短翼在内，不沿用对口箱的半深长摇盖 |
| P4 | K016A 类直顶提手盒 | gable-handle-carton | 独立参数化几何；坡顶、直提手、贯通镂空孔、两端山墙与角粘耳。保留外形/结构类型，不声称厂商 K016A 原件；H 为含顶/提手的成品总高 |
| P5 | 胶底插盖零售盒 | glued-base-carton | 独立参数化几何；RSC 式胶合底和上插舌，不命名为已验证的预糊自动底 |
| C1 | 空白圆形金属罐 | blank-metal-tin | 独立参数化重建，金属卷边与平盖。peeet/Can 原 .blend 下载要求登录，未获得或打包该文件；结构卡已明确“独立重建” |
| C2 | 食品罐头组合 | food-tin-tall / food-tin-low / salt-carton | 高/矮罐使用 Poly Haven CC0 原网格，按尺寸缩放；盐纸盒从参考包络尺寸独立生成可编辑刀版。原组合三件均有独立入口 |
| C3 | 旋盖金属罐 | screw-metal-tin | Poly Haven Cleaner Tin 01 CC0 原网格，保留罐肩、旋盖、底部和罐体轮廓；重新划分标签印刷区与 UV |

## 工程实现

- 结构库从 18 增至 28 款：用户选择 8 组，其中 C2 展开为 3 个模型，共新增 10 个入口。
- 新模块：src/selected-structures.js、src/selected-containers.js、src/source-containers.generated.js。
- C2/C3 从官方 API 获取 glTF 与二进制网格，bin 下载逐项核对 MD5；生成模块保留原包络和 glTF+bin 的 SHA-256、源 URL、CC0 标记。转换脚本为 scripts/prepare-source-containers.py，运行时无外网请求。
- 源罐体三角形在标签上下界、环绕接缝处分割；闭合时保留原网格坐标，展开时形成原尺寸标签片，UV 不随折叠改变。金属盖/肩/底与可编辑印刷表面分开，原始旧化标签纹理未打包。
- 纸盒刀版、纸厚表面、内外贴图、面板选择及 SVG/GLB 接入同一数据通路；提手孔同时从印刷联合遮罩中扣除。
- 接入时保留已有工作区改动；后续源码更新见 CHANGELOG.md。

## 验证

- 单元测试含尺寸极值、闭合尺寸、折叠图连通、压痕不作裁切线、提手孔二维/三维空洞与对齐、源网格闭合坐标、展开接缝、纸厚与 UV 不变。
- tests/selected-models-browser.mjs：28 张选型卡；10 款逐一四档折叠、内外面鼠标选中、添加/编辑文字、SVG 元数据往返；20 份闭合/展开 GLB 经 GLTFLoader 重新加载，核对总尺寸、平铺厚度与嵌入贴图；离线版零 HTTP 请求。
- 原有浏览器模型四象限检查扩至 1088 次。1.3 mm 折返桥像素过窄，仍核对 RGB 主通道顺序，容许抗锯齿混色降低饱和度。
- 截图/报告：artifacts/selected-models-overview.png、selected-gable-workspace.png、selected-tin-workspace.png、selected-models-verification.json。

这些是可编辑的结构与视觉预览，尚未实物打样或验证制造公差、承重及材料力学。


后续调整（2026-10-21）：按用户要求移除原有广口玻璃罐，结构库现为 27 款；本清单的 10 个新增模型全部保留。
