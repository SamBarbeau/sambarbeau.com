#!/usr/bin/env python3
"""Build a small, validated Worldwise food snapshot from official FAOSTAT bulk files.

Standard library + curl only. First run downloads the official catalog, UN M49
code table, and the two relevant FAOSTAT archives. --refresh updates that cache;
--offline reproduces from the cached source files without making requests.
"""
import argparse, collections, csv, datetime, io, json, math, pathlib, subprocess
from html.parser import HTMLParser
from zipfile import ZipFile

CATALOG_URL='https://bulks-faostat.fao.org/production/datasets_E.json'
M49_URL='https://unstats.un.org/unsd/methodology/m49/overview/'
LICENSE_URL='https://www.fao.org/contact-us/terms/db-terms-of-use/en/'

class TableParser(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='tr':self.row=[]
  if tag in ('td','th') and self.row is not None:self.cell=''
 def handle_data(self,data):
  if self.cell is not None:self.cell+=data
 def handle_endtag(self,tag):
  if tag in ('td','th') and self.cell is not None:self.row.append(self.cell.strip());self.cell=None
  if tag=='tr' and self.row:self.rows.append(self.row);self.row=None

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--countries',type=pathlib.Path,required=True,help='Existing world.json with the country allowlist')
 parser.add_argument('--definitions',type=pathlib.Path,required=True,help='Curated FAO definitions JSON')
 parser.add_argument('--cache-dir',type=pathlib.Path,required=True)
 parser.add_argument('--output',type=pathlib.Path,required=True)
 parser.add_argument('--refresh',action='store_true')
 parser.add_argument('--offline',action='store_true')
 args=parser.parse_args()
 if args.refresh and args.offline:parser.error('--refresh and --offline cannot be combined')
 args.cache_dir.mkdir(parents=True,exist_ok=True)
 def fetch(url,name):
  path=args.cache_dir/name
  if path.exists() and not args.refresh:return path
  if args.offline:raise RuntimeError(f'Missing offline source: {path}')
  temp=path.with_name(path.name+'.tmp')
  subprocess.run(['curl','-fsSL','--retry','2','--max-time','180','-D',str(path)+'.headers',url,'-o',str(temp)],check=True)
  temp.replace(path);return path
 catalog={d['DatasetCode']:d for d in json.loads(fetch(CATALOG_URL,'datasets_E.json').read_text())['Datasets']['Dataset']}
 table=TableParser();table.feed(fetch(M49_URL,'m49.html').read_text())
 m49={r[9]:r[11] for r in table.rows if len(r)==15 and r[9].isdigit() and len(r[9])==3 and len(r[11])==3}
 if len(m49)<200:raise RuntimeError('Incomplete UN M49 to ISO3 lookup')
 countries=json.loads(args.countries.read_text())['countries'];allowed={c['id'] for c in countries}
 if not allowed<=set(m49.values()):raise RuntimeError('Country allowlist is not fully mapped by UN M49')
 definitions=json.loads(args.definitions.read_text())
 ids=[d['id'] for d in definitions]
 if len(ids)!=len(set(ids)):raise RuntimeError('Duplicate topic ID')
 grouped=collections.defaultdict(list)
 for d in definitions:grouped[d['sourceConfig']['domain']].append(d)
 extracted={}
 now=datetime.datetime.now(datetime.timezone.utc);minimum_year=now.year-5;maximum_year=now.year-1
 for domain,defs in grouped.items():
  wanted={(d['sourceConfig']['itemCode'],d['sourceConfig']['elementCode']):d for d in defs}
  meta=catalog[domain]
  archive=fetch(meta['FileLocation'],domain+'.zip')
  with ZipFile(archive) as z:
   filename=next(n for n in z.namelist() if n.endswith('All_Data_(Normalized).csv'))
   reader=csv.DictReader(io.TextIOWrapper(z.open(filename),encoding='utf-8-sig'))
   for row in reader:
    key=(row['Item Code'],row['Element Code'])
    if key not in wanted:continue
    year=int(row['Year']);iso=m49.get(row['Area Code (M49)'].lstrip("'"))
    if not minimum_year<=year<=maximum_year or iso not in allowed:continue
    definition=wanted[key]
    if row['Unit']!=definition['sourceConfig']['unit']:raise RuntimeError(f'Unexpected source unit for {definition["id"]}')
    result=extracted.setdefault(definition['id'],{'item':row['Item'],'element':row['Element'],'years':{},'flags':{}})
    values=result['years'].setdefault(year,{})
    flags=result['flags'].setdefault(year,{})
    if iso in flags:raise RuntimeError(f'Duplicate source observation: {definition["id"]}/{iso}/{year}')
    flags[iso]=row['Flag']
    if row['Value']=='':continue
    value=float(row['Value'])
    if not math.isfinite(value) or value<0:raise RuntimeError('Invalid source observation')
    values[iso]=value
 metrics=[]
 for definition in definitions:
  source=definition['sourceConfig'];domain=source['domain'];meta=catalog[domain]
  result=extracted[definition['id']]
  year=next((y for y in sorted(result['years'],reverse=True) if len(result['years'][y])>=definition.get('minCountries',90)),None)
  if year is None:raise RuntimeError(f'Insufficient recent common-year coverage: {definition["id"]}')
  values=result['years'][year];vs=list(values.values());pairs=0
  for i,a in enumerate(vs):
   for b in vs[i+1:]:
    gap=abs(a-b)/min(a,b) if definition['gapKind']=='ratio' and min(a,b)>0 else abs(a-b) if definition['gapKind']=='absolute' else 0
    precision=definition.get('precision',1)
    if definition['minGap']*1.25<=gap<=definition['minGap']*3 and round(a,precision)!=round(b,precision):pairs+=1
  if pairs<100:raise RuntimeError(f'Too few valid matchups: {definition["id"]} ({pairs})')
  flags=collections.Counter(result['flags'][year][iso] for iso in values)
  metric={**definition,'year':year,'values':values,'provider':'FAO','sourceName':'Food and Agriculture Organization of the United Nations — FAOSTAT','sourceUrl':f'https://www.fao.org/faostat/en/#data/{domain}','sourceDefinition':meta['DatasetDescription'],'sourceItem':result['item'],'sourceElement':result['element'],'sourceDataUrl':meta['FileLocation'],'sourceUpdatedAt':meta['DateUpdate'],'sourceLicense':'CC BY 4.0','sourceLicenseUrl':LICENSE_URL,'countryCodeSourceUrl':M49_URL,'sourceFlags':dict(flags),'sourceCitation':f"FAO. {meta['DateUpdate'][:4]}. FAOSTAT: {meta['DatasetName']}. Accessed {now.strftime('%d %B %Y')}. https://www.fao.org/faostat/en/#data/{domain}. Licence: CC BY 4.0."}
  metrics.append(metric)
  print(f'{definition["id"]}: {year}, {len(values)} countries, {pairs} bounded pairs')
 args.output.parent.mkdir(parents=True,exist_ok=True)
 temp=args.output.with_name(args.output.name+'.tmp');temp.write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n');temp.replace(args.output)
 print(f'Saved {len(metrics)} topics to {args.output}')
if __name__=='__main__':main()
