# 页面取色与颜色入口

点击右侧 SVG 对象“填充颜色／描边颜色”旁的色块，或“条码颜色”旁的色块，可打开同一色盘。原有纸张和面板底色入口继续使用该色盘。

“页面取色”使用浏览器 EyeDropper API，需要支持该 API 的桌面浏览器及安全上下文；线上 HTTPS 可用，建议桌面 Chrome 或 Edge。取色是用户主动点击后启动的，应用只接收一个 sRGB HEX 色值，不获取或上传屏幕图像。CMYK 工程仍按既有色彩管理流程显示及导出。

1. 打开色盘，点击“页面取色”。
2. 色盘暂时隐藏，避免挡住需要拾取的区域；用浏览器吸管选取颜色。
3. 色盘重新显示并回填色值。SVG／条码点击“完成”后应用一次，可撤销；纸张色保留既有实时预览方式。

Esc 取消浏览器取色，保留色盘与原色；再按 Esc 关闭色盘。取消或仅打开后直接关闭不会把渐变、`none`、透明色改成纯色。原 SVG 字段仍可手动输入受支持的 CSS 颜色及本地渐变引用。

关闭色盘、切换工程或导致原字段移除时，会中止未完成的取色。旧取色结果不会应用到下一次选择。浏览器不支持／拒绝时保留明确提示，色值输入与色板仍可用。

## 验证

`npm run build:site` 后运行 `npm run test:color-picker`。`FOLD_TEST_OFFLINE=1` 使用离线 HTML，`FOLD_TEST_ARTIFACTS` 指定报告目录。

浏览器专项对原生 EyeDropper 回调使用可控测试桩，验证确认／取消、拒绝、缺失 API、过期结果与工程切换，并检查实际 SVG 属性、撤销和纸张／条码行为。它不声称自动化控制了操作系统的原生吸管窗口。离线测试断言没有 HTTP 请求。

参考：[MDN EyeDropper API](https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper_API)、[EyeDropper.open](https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper/open)。
