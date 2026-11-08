/** A functional illustration, without using clipboard records or private screenshots. */
export function ZhenxiaVisual({active}:{active:boolean}){
  return <div className="flex h-full w-full items-center justify-center p-10">
    <svg role="img" aria-label="截图、贴图和剪贴板功能示意" viewBox="0 0 360 260" className="h-full w-full text-white" fill="none">
      <g stroke="currentColor" strokeWidth="1.5" style={{transform:active?'translate(-6px,-4px)':'none',transition:'transform 700ms'}}>
        <path d="M92 48H64v28M64 180v28h28M240 208h28v-28M268 76V48h-28"/>
        <rect x="78" y="62" width="176" height="132" strokeOpacity=".28" strokeDasharray="4 5"/>
        <path d="m100 166 43-47 30 30 23-20 36 37" strokeOpacity=".85"/>
        <circle cx="202" cy="99" r="10"/>
      </g>
      <g style={{transform:active?'translate(9px,5px)':'none',transition:'transform 700ms'}}>
        <rect x="228" y="140" width="75" height="84" fill="#0a0a0a" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="248" y="134" width="35" height="12" fill="#0a0a0a" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M244 163h43M244 177h32M244 191h39M244 205h24" stroke="currentColor" strokeOpacity=".55"/>
      </g>
      <path d="m189 159 2 32 8-9 12 5 4-9-12-5 10-7z" fill="white" stroke="#0a0a0a" strokeWidth="2"/>
    </svg>
  </div>;
}
