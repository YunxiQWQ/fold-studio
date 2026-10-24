# 包装结构来源核验

核验日期：2026-10-18。针对网页刀版、折叠拓扑与盒型选择预览，检查项目主页、许可证和相关源码。以下为候选评估，本版没有引入这些项目的结构代码。

## 补充：规模更大的现成库

用户希望获得更大的库，扩大检索后发现以下来源。数量为官方页面或公开目录标注，不是本地逐款验收结果；同一基础结构的变体也不能简单视为完全不同的结构。

| 来源 | 公开规模与功能 | 复用方式与限制 |
| --- | --- | --- |
| [EngView Web Services](https://www.engview.com/en/packaging/web-services) | 官方标注 2500+ 参数化包装与展示架，含 2D/3D、尺寸修改、贴图与折叠动画 | 明确提供商业 API 集成，是大规模结构引擎的强候选；许可、报价与可导出数据范围需按供应商方案确定 |
| [Pacdora 刀版库](https://www.pacdora.com/tools/dieline-generator) | 官方标注 3000+ 刀版模板，可修改尺寸、纸厚，输出 AI/PDF/DXF | 商业平台；[API 示例源码](https://github.com/Tototoyo/api-demo) 展示分类、模型列表、3D、改尺寸与编辑，需要申请 App ID/Key。示例代码公开不代表其模型库开源；5000+ 样机不应计为纸盒结构数 |
| [Packmage 公开盒型目录](https://fred.packmage.cn/Cad/Boxes) | 搜索收录的公开目录标注全部 1272 款、免费 20 款，含管式盒、礼盒、盘式盒、飞机盒、内衬与展示架；数量随版本与访问状态变化 | 官方另有 [CAD Editor API](https://www.packmage.com/Ass/OnlineApi)，明确可嵌入自有网站。现有目录权限不等同于 API 的全部授权范围。本次直接打开目录返回未登录占位页，数量采用搜索收录值，未登录逐款验收 |
| [AlphaCorr Dieline Genius](https://dieline-genius.com/) | 官网显示 629 模板、21 分类，支持输入尺寸并输出 CF2/DXF/DWG/PDF 等七种格式 | 商业参数化刀版库；本次未找到可直接嵌入的公开 SDK/API 文档，不把下载服务当成开源库 |
| [treeDiM PackLib](https://www.treedim.com/packlib/en/features) / [PLMPackLib 源码](https://github.com/minrogi/PLMPackLib) | FEFCO、ECMA、POS 多系列；参数化尺寸、纸厚、二维导出与三维动画。未核定可公开复用的具体模型总数 | 仓库 README 为 MIT，C#/.NET 4.0；源码中有 F421 示例及库加载器，完整系列通过另外的库包下载。引擎、第三方依赖和模型包许可应分别核对，不能宣称整套目录已经包含在 MIT 仓库里 |

PLMPackLib 本次通过 GitHub tree API 检查目录，并读取 `PicPlugins/f421.cs` 与 `Pic.DAL.LibrairyLoader/LibraryList.xml`。后者列出 FEFCO、ECMA、POS、Smart Assembly 等独立下载包。没有下载、执行其 DLL 或数据库，也没有迁移到折间。

补充结论：如果优先获取数百至数千款并嵌入网页，EngView/Packmage 的商业 API 更贴近这个目标；如果保持开源与离线，优先继续核验 PLMPackLib 的模型包和移植成本。下文六款 MIT 网页项目仍适合作为小规模适配参考，不再将它当作大规模库的主要答案。几何实验室网站虽然自称开源，其 GitHub 链接实际指向 PLMPackLib 的 fork；本次“共建”“箱型目录”链接返回 404，暂不作为另一套已核实的大库重复计数。

## 小规模开源候选

| 来源 | 已核实的结构与能力 | 许可证 / 环境 | 对折间的用途 |
| --- | --- | --- | --- |
| [NealZhouPanda/packaging-dieline-generator](https://github.com/NealZhouPanda/packaging-dieline-generator) | 中文 README 与源码包含六种：0201 对口箱、0421 展示盒、K016A 提手盒、E005C 飞机盒、C001GX 锁扣盒、0206 全搭盖箱；具有刀版生成器、折叠拓扑、SVG/PDF 导出及坐标校准资料 | [代码 MIT](https://github.com/NealZhouPanda/packaging-dieline-generator/blob/main/LICENSE)；原生 JavaScript / 浏览器。内嵌字体另为 OFL | **优先候选**。与本项目技术最接近，可先评估 0201 与飞机盒的几何和折叠数据适配 |
| [stoneproof-tech/PackagingWorkbench](https://github.com/stoneproof-tech/PackagingWorkbench) | FEFCO 0201、0301 盒盖托盘、0713 插舌盒；参数化模型、二维刀线与 DXF | [LGPL-2.1-or-later](https://github.com/stoneproof-tech/PackagingWorkbench/blob/main/LICENSE)，README 与 package.xml 声明；Python / FreeCAD | 适合作为尺寸和展开结构的交叉核对来源；需要 FreeCAD，不能直接作为网页组件导入 |
| [florianfesti/boxes](https://github.com/florianfesti/boxes) | 库中有 [PaperBox 纸盒生成器](https://github.com/florianfesti/boxes/blob/master/boxes/generators/paperbox.py)，可以输出刀版；项目大量其他生成器面向激光切割板材 | [GPL-3.0-or-later](https://github.com/florianfesti/boxes/blob/master/LICENSE.txt)；Python | 纸盒展开的补充参考；不是完整纸包装折叠拓扑库，直接采用代码需按其许可处理 |

英文 README 与中文 README 的箱型数量可能不同；第一项的“六种”以本次读取的中文 README、生成器和拓扑文件为准。

## 为什么优先评估第一项

已下载源码，在本地读取了 `generator*.js`、`topology0201.js`、`topology0206.js`、`topologyE005C.js` 和 `box-topology.js`，并检查 `reference/0206/packmage-samples.json`、`reference/k016a/packmage-samples.json` 等样本以及测试代码。它既提供展开坐标，也明确描述面板、折痕与分阶段折叠，适合继续写适配器。

这些数据与折间当前父子面板、轴方向和双面 UV 约定不同，不能只替换缩略图或直接粘贴一个 SVG 就完成接入。建议先用 0201 对口箱建立适配，核对多组尺寸的展开坐标、铰链方向、摇盖闭合与内外贴图，再处理 E005C 飞机盒。这里是基于源码结构的工程判断；本次没有运行候选仓库测试，也没有做实物打样，不能据此认定其全部盒型已验证。

## 行业结构目录

- [FEFCO 官方结构编码目录](https://www.fefco.org/technical-information/fefco-code)：适合核对瓦楞包装结构编号、展开形式与名称。官方提供第 12 版目录；它是行业参考资料，不能把公开下载等同于软件源码的开源许可。
- [ECMA 官方纸盒编码资料（2022 PDF）](https://ecma.org/uploads/Bestanden/ECMA%20Sales%20Toolkit/ECMA%20Support%20Tools/New%202022/ECMA%20Codes%20EN%202022.pdf)：卡纸折叠盒结构的补充参考。与 FEFCO 的适用对象不同，具体插舌、锁扣、纸厚补偿仍需逐型核对。

## 暂不直接采用的项目

- [GIGAJOHUB/OpenDieline](https://github.com/GIGAJOHUB/OpenDieline)：有 RTE 结构和折叠图数据，本次检查根目录与包元数据未找到明确代码许可证，暂不能作为许可清晰的可复制代码来源。
- [haku-d/pde](https://github.com/haku-d/pde)：README 将其描述为 AI 生成的概念验证；本次也未确认明确代码许可证，不能仅凭功能相似把它作为结构正确性的依据。

## 本版实际修正

用户明确指出问题在“预览选择界面”。v0.9.4 移除了手工绘制的通用 SVG 示意图，结构库、当前盒型与属性区统一显示对应真实模型生成的预览。12 张图由 `scripts/render-template-previews.mjs` 在构建阶段生成，与实际预览共用 `makeDieline`、`Preview3D` 和默认尺寸；保留源文件哈希、折叠状态与像素占用清单，模型来源改变时重新生成。运行时使用内嵌 PNG，不创建额外的 3D 渲染器。

本次修复保证选择卡片与当前应用模型来源一致；盒型结构内核保持原实现。上面的外部结构库仍是后续接入候选，不将缩略图一致性检查表述为生产结构认证。

## 2026-10-24 用户参考图新增结构

本轮经用户确认保留糖果扭结盒、三角切片盒两组图片参考对应的实现；花瓣顶四棱锥实验模型已移除。图片只用于推断结构外形和参数关系，没有复制品牌商标、印花或第三方源码。实现位于 `src/rigid-reference-cartons.js`，采用现有刚性面板、斜边铰链和折叠树重新参数化：

- 糖果盒以四面收脊端帽和前后双层燕尾近似参考外形；参考刀版中的菱形端片和真实扭转自锁没有作为可生产锁合实现。
- 切片盒以等腰三角底盖、三面矮壁和双插舌连接近似蛋糕切片盒；没有复刻参考图所有底部小插舌和卡口。

以上为视觉与结构草图模型。没有尺寸实测、纸厚补偿、锁合强度、刀模公差或实物打样验证，不能直接作为生产刀模。
