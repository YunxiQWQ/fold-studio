export const DEFAULT_PRINT_SETTINGS=Object.freeze({profile:'fogra39l',intent:1,blackPointCompensation:true});
export const MAX_ICC_BYTES=4*1024*1024;
const ascii=(bytes,start,length)=>String.fromCharCode(...bytes.subarray(start,start+length));
const validatedData=new Set();
export function validateIcc(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<132||bytes.length>MAX_ICC_BYTES)throw Error('ICC 文件应为 132 字节至 4 MB');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),length=view.getUint32(0);
  if(length!==bytes.length||ascii(bytes,36,4)!=='acsp')throw Error('ICC 文件头或文件长度无效');
  if(ascii(bytes,12,4)!=='prtr'||ascii(bytes,16,4)!=='CMYK'||!['XYZ ','Lab '].includes(ascii(bytes,20,4)))throw Error('请选择 CMYK 输出设备 ICC 配置，不支持 RGB、显示器或 DeviceLink 配置');
  const count=view.getUint32(128);
  if(!count||count>4096||132+count*12>length)throw Error('ICC 标签表无效');
  for(let i=0;i<count;i++){const offset=view.getUint32(136+i*12),size=view.getUint32(140+i*12);if(offset<132+count*12||size<8||offset+size>length)throw Error('ICC 标签数据越界');}
  return bytes;
}
export function encodeIcc(bytes){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
export function decodeIcc(text){
  if(typeof text!=='string'||text.length>Math.ceil(MAX_ICC_BYTES/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(text)||text.length%4)throw Error('工程 ICC 数据无效');
  const bytes=validateIcc(Uint8Array.from(atob(text),c=>c.charCodeAt(0)));
  if(validatedData.size>=3)validatedData.clear();validatedData.add(text);return bytes;
}
export function printSettings(settings){
  if(settings===undefined)return {...DEFAULT_PRINT_SETTINGS};
  if(!settings||!['fogra39l','custom'].includes(settings.profile)||![0,1,2,3].includes(settings.intent)||typeof settings.blackPointCompensation!=='boolean')throw Error('工程印刷色彩设置无效');
  if(settings.profile==='custom'){if(typeof settings.name!=='string'||!settings.name.trim()||settings.name.length>160)throw Error('工程 ICC 名称无效');if(!validatedData.has(settings.icc))decodeIcc(settings.icc);}
  return {profile:settings.profile,intent:settings.intent,blackPointCompensation:settings.blackPointCompensation,...(settings.profile==='custom'?{name:settings.name,icc:settings.icc}:{})};
}
