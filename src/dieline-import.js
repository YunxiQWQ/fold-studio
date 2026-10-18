/**
 * 刀版导入器 —— 预留接口，尚未实现。
 *
 * 设计见 DXF-IMPORT-PLAN.md。这里只固定对外契约，实现时不要改签名，
 * 也不要让调用方感知内部流水线（解析 → 离散 → 分面 → 建树 → 求折叠方向）。
 *
 * 实现完成前，index 里不要对外暴露按钮；调用方拿到抛错是预期行为。
 */

/**
 * 导入一份 DXF 或 SVG 刀版，返回与 makeDieline 输出完全同构的 dieline 对象。
 *
 * 同构是关键：返回值的 panels / rootId / width / minX / minY / maxX / maxY
 * 必须能直接喂给 preview3d、editor2d、artwork-space、export3d，那些模块不做任何改动。
 *
 * @param {string|ArrayBuffer|Uint8Array} input 文件内容
 * @param {object} options
 * @param {'dxf'|'svg'} options.format
 * @param {number} [options.unitScale=1]        单位换算到 mm 的系数
 * @param {Record<string,'cut'|'crease'|'ignore'>} [options.layerMap] 图层 → 类型；缺省时按名称/线型/颜色推断
 * @param {string} [options.rootPanelId]        指定哪个面板当根；缺省取面积最大者
 * @param {number} [options.defaultAngle=90]    折线默认角度（度）
 * @param {number} [options.axisTolerance=0.5]  斜折线容差（度），超限应抛错而不是硬折
 * @returns {{
 *   type:'imported',
 *   panels:Array<object>,
 *   rootId:string,
 *   width:number, height:number,
 *   minX:number, minY:number, maxX:number, maxY:number,
 *   rootRotationX:number,
 *   cylinder:null,
 *   source:{fileName?:string,format:string,unitScale:number,importedAt:string,panelCount:number}
 * }}
 * @throws {Error} 含斜折线、图层无法判定、轮廓自交、无法求得折叠方向时抛出，信息要能定位到坐标。
 */
export function importDieline(input, options = {}) {
  throw new Error('刀版导入尚未实现，见 DXF-IMPORT-PLAN.md');
}

/**
 * 只做解析与预览，不生成折叠树。给导入向导用：先让用户看清切线/折线分色对不对，
 * 再决定是否继续。返回的线段已离散化。
 *
 * @param {string|ArrayBuffer|Uint8Array} input
 * @param {object} options 同 importDieline
 * @returns {{
 *   bounds:{minX:number,minY:number,maxX:number,maxY:number},
 *   cut:Array<[[number,number],[number,number]]>,
 *   crease:Array<[[number,number],[number,number]]>,
 *   ignored:number,
 *   warnings:string[]
 * }}
 */
export function inspectDieline(input, options = {}) {
  throw new Error('刀版导入尚未实现，见 DXF-IMPORT-PLAN.md');
}
