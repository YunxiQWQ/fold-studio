import {readFileSync} from 'node:fs';
import {prepareZXingModule,readBarcodes} from 'zxing-wasm/reader';
// Tests use a local independent decoder; no CDN/network is needed.
prepareZXingModule({overrides:{wasmBinary:readFileSync(new URL(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm')))}});
export const scanBarcodes=(image,formats)=>readBarcodes(image,{formats,textMode:'Plain'});
