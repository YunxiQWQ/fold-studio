import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rgbToCmyk,cmykToRgb,formatCmyk,proofColor,proofImageData,initializeColorManagement,configureColorManagement,colorStatus,capturePrintTransform} from '../src/color.js';
import {validateIcc,printSettings,encodeIcc,decodeIcc,DEFAULT_PRINT_SETTINGS} from '../src/color-settings.js';
import {encodeCmykTiff} from '../src/export-cmyk.js';
import {validateProject,newProject} from '../src/project.js';
const profile=readFileSync(new URL('../src/color-profiles/FOGRA39L_coated.icc',import.meta.url));
await initializeColorManagement(readFileSync(new URL('../node_modules/lcms-wasm/dist/lcms.wasm',import.meta.url)),profile);
// Independent native LittleCMS 2.19 / Pillow ImageCms reference, relative+BPC.
const reference=[
 ['ffffff',[0,0,0,0],'ffffff'],['000000',[218,202,137,250],'1d1c1c'],
 ['00ff00',[165,0,246,0],'6ab43f'],['0000ff',[237,216,0,0],'3c4492'],
 ['39563c',[198,107,197,112],'3e5943'],['f3f0df',[15,13,39,0],'f3efdf'],
 ['ff0000',[0,247,251,0],'e52926'],['808080',[129,105,104,43],'828282'],
 ['00ffff',[101,0,43,0],'a7d8db'],['ff00ff',[85,177,0,0],'b66aa7'],
];
describe('ICC color management and real CMYK output',()=>{
  it('matches independently generated four-channel and proof reference values',()=>{
    const transform=capturePrintTransform();
    try{for(const [source,ink,proof]of reference){
      assert.deepEqual([...transform.convert(Uint8Array.from(Buffer.from(source,'hex')))],ink);
      assert.equal(proofColor('#'+source,'cmyk'),'#'+proof);
      const values=rgbToCmyk('#'+source);assert.deepEqual(Object.values(values),ink.map(x=>Math.round(x/255*1000)/10));
    }}finally{transform.dispose();}
    assert.equal(cmykToRgb(0,0,0,0),'#ffffff');assert.notEqual(cmykToRgb(0,0,0,100),'#000000');
    assert.equal(formatCmyk('#39563c'),'C:77.6 M:42 Y:77.3 K:43.9');
  });
  it('proofs complete pixel buffers without modifying alpha or RGB originals',()=>{
    const data=new Uint8ClampedArray([0,255,0,128,0,0,255,255]);
    proofImageData({data});assert.deepEqual([...data],[106,180,63,128,60,68,146,255]);
    assert.equal(proofColor('#00ff00','rgb'),'#00ff00');assert.equal(proofColor('transparent','cmyk'),'transparent');
    assert.equal(proofColor('#0f0','cmyk'),'#6ab43f');assert.equal(proofColor('#00ff0080','cmyk'),'#6ab43f80');
    assert.equal(rgbToCmyk('invalid'),null);assert.throws(()=>cmykToRgb(101,0,0,0));
  });
  it('rejects corrupt, RGB and out-of-bounds profiles before opening them',()=>{
    assert.deepEqual(decodeIcc(encodeIcc(profile)),new Uint8Array(profile));
    for(const edit of [b=>b.write('RGB ',16),b=>b.writeUInt32BE(b.length+1,0),b=>b.writeUInt32BE(999999,136),b=>b.write('link',12),b=>b.write('nope',36)]){
      const bad=Buffer.from(profile);edit(bad);assert.throws(()=>validateIcc(bad));
    }
    assert.throws(()=>decodeIcc('%%'));assert.throws(()=>validateIcc(new Uint8Array(4*1024*1024+1)));
    assert.deepEqual(printSettings(),DEFAULT_PRINT_SETTINGS);
    const old=colorStatus().revision;
    assert.throws(()=>configureColorManagement({profile:'custom',icc:'bad',name:'bad.icc',intent:1,blackPointCompensation:true}));
    assert.equal(colorStatus().revision,old);assert.equal(proofColor('#00ff00','cmyk'),'#6ab43f');
    const missingTables=Buffer.from(profile);
    for(let i=0;i<missingTables.readUInt32BE(128);i++){const p=132+i*12;if(/^[AB]2[AB][012]$/.test(missingTables.toString('ascii',p,p+4)))missingTables.write('xxxx',p);}
    assert.doesNotThrow(()=>validateIcc(missingTables));
    assert.throws(()=>configureColorManagement({profile:'custom',icc:encodeIcc(missingTables),name:'missing.icc',intent:1,blackPointCompensation:true}),/无法读取|转换表/);
    assert.equal(colorStatus().revision,old);assert.equal(proofColor('#00ff00','cmyk'),'#6ab43f');
  });
  it('keeps each export transform independent from later settings',()=>{
    const captured=capturePrintTransform(),input=Uint8Array.from([57,86,60]),expected=[...captured.convert(input)];
    try{configureColorManagement({...DEFAULT_PRINT_SETTINGS,intent:0});assert.deepEqual([...captured.convert(input)],expected);}
    finally{captured.dispose();configureColorManagement();}
  });
  it('saves custom ICC settings in projects and accepts old projects unchanged',()=>{
    const project=newProject();assert.doesNotThrow(()=>validateProject(project));
    project.printSettings={profile:'custom',name:'press.icc',icc:encodeIcc(profile),intent:0,blackPointCompensation:false};
    assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))).printSettings,project.printSettings);
    for(const change of [{intent:9},{blackPointCompensation:'true'},{icc:'x'},{profile:'unknown'}]){
      assert.throws(()=>validateProject({...project,printSettings:{...project.printSettings,...change}}));
    }
  });
  it('writes separated CMYK TIFF tags, physical DPI and the unchanged ICC',()=>{
    const pixels=Uint8Array.from([0,0,0,0,218,202,137,250]),tiff=encodeCmykTiff({width:2,height:1,pixels,profile,dpi:300});
    const v=new DataView(tiff.buffer);assert.equal(v.getUint16(0,true),0x4949);assert.equal(v.getUint16(2,true),42);
    const count=v.getUint16(8,true),tags=new Map();assert.equal(count,17);
    for(let i=0;i<count;i++){const p=10+i*12;tags.set(v.getUint16(p,true),{type:v.getUint16(p+2,true),count:v.getUint32(p+4,true),value:v.getUint32(p+8,true)});}
    assert.equal(tags.get(262).value,5);assert.equal(tags.get(277).value,4);assert.equal(tags.get(332).value,1);assert.equal(tags.get(334).value,4);
    const icc=tags.get(34675);assert.deepEqual(tiff.slice(icc.value,icc.value+icc.count),new Uint8Array(profile));
    assert.equal(v.getUint32(tags.get(282).value,true)/v.getUint32(tags.get(282).value+4,true),300);
    assert.deepEqual([...tiff.slice(tags.get(273).value)],[...pixels]);
    assert.throws(()=>encodeCmykTiff({width:3,height:1,pixels,profile}));
  });
  it('project validation enforces safe barcode format and layer bgColor', () => {
    const proj = newProject('carton');
    proj.layers.push({
      id: crypto.randomUUID(),
      type: 'barcode',
      name: '测试条码',
      panel: 'front',
      side: 'outside',
      x: 0.5,
      y: 0.5,
      w: 0.4,
      h: 0.2,
      rotation: 0,
      opacity: 1,
      visible: true,
      color: '#000000',
      code: '6901234567890',
      format: 'ean13',
      bgColor: '#ffffff',
    });
    // Valid barcode layer should pass
    assert.doesNotThrow(() => validateProject(proj));

    // Invalid format should be rejected
    const badFormatProj = structuredClone(proj);
    badFormatProj.layers.at(-1).format = 'invalid-code';
    assert.throws(() => validateProject(badFormatProj), /工程条码格式无效/);

    // Invalid bgColor should be rejected
    const badBgProj = structuredClone(proj);
    badBgProj.layers.at(-1).bgColor = 'not-a-color';
    assert.throws(() => validateProject(badBgProj), /工程条码背景色无效/);

    // Transparent bgColor is permitted
    const transProj = structuredClone(proj);
    transProj.layers.at(-1).bgColor = 'transparent';
    assert.doesNotThrow(() => validateProject(transProj));
  });
});
