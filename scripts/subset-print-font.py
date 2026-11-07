from fontTools import subset
from fontTools.ttLib import TTFont
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Create the OFL-licensed Fold Print Sans GB2312 subset from Noto Sans SC')
parser.add_argument('input');parser.add_argument('output')
args=parser.parse_args()
font=TTFont(args.input)
# GB2312 includes common simplified Chinese, punctuation and ASCII; add Latin.
characters=set(chr(i) for i in range(256))
for lead in range(0xa1,0xf8):
  for trail in range(0xa1,0xff):
    try:characters.update(bytes([lead,trail]).decode('gb2312'))
    except UnicodeDecodeError:pass
options=subset.Options();options.name_IDs=['*'];options.layout_features=['*'];options.recalc_timestamp=False
subsetter=subset.Subsetter(options=options);subsetter.populate(text=''.join(sorted(characters)));subsetter.subset(font)
for record in font['name'].names:
  if record.nameID in [1,2,3,4,6,16,17]:
    value='Regular' if record.nameID in [2,17] else 'FoldPrintSans-Regular' if record.nameID==6 else 'Fold Print Sans'
    record.string=value.encode(record.getEncoding(),errors='replace')
font.flavor='woff2';Path(args.output).parent.mkdir(parents=True,exist_ok=True);font.save(args.output)
print(Path(args.output).stat().st_size)
