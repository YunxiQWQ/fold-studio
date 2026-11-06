# SVG 导入与编辑支持

v0.15.0 以 [SVG-edit / SVGCanvas](https://github.com/SVG-Edit/svgedit) 7.4.2（MIT）替换原来的主交互画布、图层树和属性区。SVG 是主画布的图文源；修改直接联动三维及输出。

## 如何编辑与保存

1. 点击“图片 / SVG”或把文件拖到画布上，整份原稿作为一个组合放到当前印刷面，可整体移动和缩放。
2. 在左侧图层树选择原有组、对象、隐藏内容和定义，使用箭头展开。分组与名称保留。选中路径后，在“平面画布”标题旁的“···”菜单中选择“编辑节点”。
3. “图形”菜单包含绘制工具。“···”菜单提供组合、排列、变换及 SVG 源码。右侧属性区可以修改文字和原生属性。
4. 图片属性提供裁剪/替换，条码与二维码的原始生成参数保存在工程中。内外面各有独立的 SVG 场景。
5. 在“导出”中选择“当前面图文 SVG”保存图文源，或选择“平面刀版 SVG”同时保存结构线和工程元数据。“保存工程”下载版本 3 的 .fold。旧版折间会拒绝版本 3，防止误当成空白旧工程。

在画布上拖动选中对象可移动，拖动选框的角和边可拉伸；文字、图片、图形按住 Shift 等比缩放。Esc 取消本次拖动或缩放。组合、嵌套 SVG 和已有变换保留，每次完成的操作可分别撤销与重做。

选中导入组合，使用图层面板底部或“···”菜单的“解组”（Ctrl / Command + Shift + G），一次取出原稿内容。置入用的 SVG 画板和单个文档包装同时移除，文字和图形可直接选取、排序或重新组合；原稿中并列的子组继续保留，可再解组。旧版已导入的文件也适用。解组会保留实际坐标、继承字体、颜色和渐变。

若原画板正在裁切超出部分，裁切会随相应图文保留。整体透明度、蒙版、滤镜或混合效果依赖组合计算时，效果组会保留，可展开编辑内部对象；直接拆除效果组会被拒绝并说明原因，避免外观改变。

图层面板按上层覆盖下层排列。可以拖动排序，拖到组合行中间放入组合，拖到行上缘或下缘改变叠放位置。Shift 连选同组相邻项，Ctrl / Command 切换多选。双击名称或按 F2 改名，也可搜索名称、文字和原 ID。

筛选时 Shift 只连选当前可见结果。父组的隐藏或锁定会在子项上标明来源，可先在父组解除。文字分段和路径文字行可以拖动，排序及跨组移动作用于整段文字，不拆散字行；内容和属性仍可单独编辑。重命名草稿受关闭提醒保护，Enter 确认、Escape 取消，保存工程时也会确认当前名称。

原 SVG 层级和 ID 保留，自动编号以对象类型显示，定义集中在“SVG 资源”中。跨组移动保留位置、尺寸和继承绘制属性，移入后采用目标组合的蒙版、透明度和滤镜效果。锁定组合会保护其子对象。

属性、导入、源码及工程中的 SVG 数据均验证后使用。自动备份仍仅保存在本机，尚未下载工程时保留关闭提醒。调整盒型尺寸时，SVG 图文保留其毫米坐标。

静态 CSS 按选择器优先级转换为属性/样式；名称以 data-name 和组 title 保存。Inkscape/Illustrator 私有编辑器元数据与注释不保证原样保留。SVG 的原生分组以及定位容器可以在图层树中查看。

## 可导入的常见内容

| 内容 | 支持范围 |
| --- | --- |
| 基本图形与路径 | rect、circle、ellipse、line、polygon、polyline、path，包含贝塞尔曲线和圆弧 |
| 外观与变换 | 填色、描边、虚线、透明度、旋转/缩放/倾斜、组透明度、currentColor |
| 渐变 | 线性/径向渐变、文件内渐变继承、用户坐标与对象边界坐标 |
| 裁切与蒙版 | clipPath，亮度蒙版和 alpha 蒙版，maskUnits、maskContentUnits |
| 重复与复用 | pattern 图案填充，symbol/use，文件内 href 和 xlink:href，渐变与 pattern 继承 |
| 标记 | marker-start、marker-mid、marker-end，箭头和 context-fill/context-stroke |
| 滤镜 | feGaussianBlur、feDropShadow、feOffset、feFlood、feComposite、feBlend、feColorMatrix、feMerge/feMergeNode |
| 滤镜组合 | feComponentTransfer 和 feFuncR/G/B/A、feMorphology、feTurbulence、feDisplacementMap、feTile |
| CSS 滤镜函数 | blur、drop-shadow、brightness、contrast、grayscale、hue-rotate、invert、opacity、saturate、sepia |
| 文字 | text、tspan、textPath、字号/字重/装饰，逐字定位/旋转、定长文字和竖排的原生 SVG 内容 |
| 静态样式 | 类名、ID、层级等静态选择器，内联样式、!important、CSS 变换和混合模式 |
| 画布 | 嵌套 svg/viewBox、preserveAspectRatio、百分比，px/mm/cm/in/pt/pc/q 画布尺寸 |
| 图片 | 文件内嵌入的 PNG/JPEG/WebP/GIF/AVIF，保持宽高比和裁切 |

蒙版、滤镜、混合、复用等内容与原来的分组关系一起保留，不将文字拆成包装文字层。原生 `text/tspan/textPath`、路径及效果定义均能在原稿树中选择；复杂效果目前以属性及源码编辑，没有专用可视化滤镜/渐变面板。照片保持图片数据，浏览器负责渲染滤镜。

“图片 / SVG”读取文件中的图文内容。“打开工程”遇到折间导出的 SVG 时会恢复文件内嵌的工程数据。源 SVG 在外部软件修改后的图文可通过“图片 / SVG”重新置入包装。

## 限制与暂不支持

| 内容 | 当前处理 |
| --- | --- |
| 文字字体 | 使用本机字体，缺失时浏览器替代。转曲文字保留为路径 |
| 竖排/逐字定位文字 | 保留排版数据。浏览器嵌套 SVG 的字体基线可能与原预览有偏移，精确交付可先转曲 |
| 混合样式文字 | 整段原位编辑按首个文字分段的样式重排。需要保留逐字样式或特殊位置时，在图层树中编辑单个 tspan |
| 固定描边 non-scaling-stroke | 等比变换可按导入时外观转换为普通描边，之后随图层缩放 |
| 非等比/斜切或复用定义中的固定描边 | 暂不支持，请先在原软件扩展描边 |
| 外部资源 | 外部图片、字体、CSS、外部 SVG 引用暂不支持。请先嵌入图片、安装字体或转曲 |
| SVG 图片嵌套 | image 引用 data:image/svg+xml 暂不支持，请展开为 SVG 元素 |
| 动态与交互 | 脚本、事件、SMIL/CSS 动画、交互链接、音视频暂不支持 |
| HTML | foreignObject/HTML 暂不支持 |
| 其他滤镜 | feImage、feConvolveMatrix 卷积、feDiffuseLighting/feSpecularLighting 光照及其光源元素暂不支持 |
| 其他 SVG 功能 | SVG 字体、网格渐变及未列入支持范围的元素/属性会报错 |
| 特殊 CSS | @ 规则、变量/转义、交互状态/伪元素、多重 CSS 蒙版及未知样式属性会报错 |
| 越界效果 | 以原 SVG 画布视口为边界裁切，重要阴影等效果请在源文件中留足画布空间 |
| 跨软件表现 | 字体排版和滤镜由接收软件实现，可能与浏览器有差异 |
| 文件与图层 | 导入上限 8 MB，每面最多 6000 个源 SVG 元素；兼容旧工程仍检查旧图层上限 |
| 复杂度 | 最多 6000 个源元素、500 条样式规则，单滤镜最多 64 个直接子节点，湍流最多 8 层细节 |
| 引用 | 缺失或循环引用、过深结构、展开结果过大都会报错 |

填色、描边、文字与效果定义直接在主画布属性区编辑。图片和其他对象默认自由缩放，按 Shift 等比；内部图片裁切结构及原始数据保留。

## 验证

运行 `npm run test:import-svg` 验证直接替换后的主画布、旧工程编辑、路径拖动、全局撤销、添加图文、条码修改、图片裁剪、内外面隔离、工程恢复与原生 SVG 输出。`npm run test:import-svg:offline` 检查最终离线单文件，`npm run test:svg-common` 检查常见效果与非法输入。

相关格式定义见 [SVG 2](https://www.w3.org/TR/SVG2/)、[CSS Masking](https://www.w3.org/TR/css-masking-1/) 和 [Filter Effects](https://www.w3.org/TR/filter-effects-1/)。
