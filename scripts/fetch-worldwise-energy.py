#!/usr/bin/env python3
"""Build sixteen validated research topics. Requires pyarrow only for EIA Parquet.

python build_additions.py --countries path/to/world.json --output additions.json
    [--cache-dir source-cache] [--fetch]
Refresh dependency: pyarrow==26.0.0 (install in a temporary Python venv).
No website/runtime dependency. Fetch uses public sources, no key or account.
"""
import argparse, csv, datetime, hashlib, itertools, json, math, pathlib, subprocess
import pyarrow.parquet as pq

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--countries',type=pathlib.Path,required=True,help='JSON country array, or object with countries array')
parser.add_argument('--output',type=pathlib.Path,required=True)
parser.add_argument('--cache-dir',type=pathlib.Path,help='Raw-source cache; default: source-cache beside output')
parser.add_argument('--fetch',action='store_true',help='Download current public source files before building')
args=parser.parse_args()
HERE=args.cache_dir or args.output.parent/'source-cache'
HERE.mkdir(parents=True,exist_ok=True)
world=json.loads(args.countries.read_text())
countries=world if isinstance(world,list) else world['countries']; allowed={c['id'] for c in countries}
iso2={c['iso2']:c['id'] for c in countries}
urls={
 'ember.csv':'https://files.ember-energy.org/public-downloads/yearly_full_release_long_format.csv',
 'energy-new.csv':'https://catalog.ourworldindata.org/garden/energy/2026-09-10/owid_energy/owid_energy.csv',
 'eia.parquet':'https://catalog.ourworldindata.org/garden/eia/2026-05-05/international_energy/international_energy.parquet',
 'eia-meta.json':'https://catalog.ourworldindata.org/garden/eia/2026-05-05/international_energy/international_energy.meta.json',
 'temperature.csv':'https://ourworldindata.org/grapher/average-annual-surface-temperature.csv',
 'temperature-meta.json':'https://ourworldindata.org/grapher/average-annual-surface-temperature.metadata.json',
 'co2.csv':'https://ourworldindata.org/grapher/co-emissions-per-capita.csv',
 'co2-meta.json':'https://ourworldindata.org/grapher/co-emissions-per-capita.metadata.json',
 'methane.csv':'https://ourworldindata.org/grapher/per-capita-methane-emissions.csv',
 'methane-meta.json':'https://ourworldindata.org/grapher/per-capita-methane-emissions.metadata.json',
 'unesco-sites.json':'https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/exports/json?select=id_no,date_inscribed,category,iso_codes,states_names,transboundary&limit=-1',
 'unesco-meta.json':'https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001',
}
for code in ['ER.H2O.FWST.ZS','ER.MRN.PTMR.ZS']:
 urls[code+'.json']=f'https://api.worldbank.org/v2/country/all/indicator/{code}?source=2&date=2021:2025&format=json&per_page=20000'
 urls[code+'-meta.json']=f'https://api.worldbank.org/v2/indicator/{code}?format=json&per_page=100'
if args.fetch:
 for name,url in urls.items():
  subprocess.run(['curl','-fsSL','--retry','2','--max-time','120',url,'-o',str(HERE/name)],check=True)

metrics=[]
def collect(rows, code_key, year_key, value_key, factor=1, year=None):
 for y in [year] if year else range(2025,2020,-1):
  values={}
  for row in rows:
   if row[code_key] not in allowed or int(row[year_key])!=y:continue
   raw=row[value_key]
   if raw in ['',None]:continue
   value=float(raw)*factor
   if not math.isfinite(value):raise ValueError('Nonfinite value')
   if row[code_key] in values:raise ValueError('Duplicate country/year')
   values[row[code_key]]=value
  if len(values)>=90:return y,values
 raise ValueError(f'Insufficient coverage: {value_key}')

def add(metric):
 metric.setdefault('format','percent' if metric['unit']=='percent' else 'decimal')
 metric.setdefault('scale','linear')
 metric.setdefault('minCountries',90)
 metric['sourceConfig']={**metric.pop('importSpec'),'minCountries':metric['minCountries'],'minYear':2021,'maxYear':2025}
 if metric['sourceConfig']['kind']=='unesco-world-heritage':
  metric['sourceConfig'].pop('minYear');metric['sourceConfig'].pop('maxYear')
  metric['sourceConfig']['timeKind']='current-inventory'
  metric['sourceConfig']['unassignedSiteIds']=['148']
 values=list(metric['values'].values())
 assert len(values)>=metric['minCountries']
 assert all(math.isfinite(v) and (v>=0 or metric.get('allowNegative')) for v in values)
 pairs=0
 for a,b in itertools.combinations(values,2):
  gap=(abs(a-b)/min(a,b) if min(a,b)>0 else 0) if metric['gapKind']=='ratio' else abs(a-b)
  if 1.25*metric['minGap']<=gap<=3*metric['minGap']:
   # Match current decimal/compact display precision conservatively.
   if metric.get('format')!='compact' and round(a,metric.get('precision',1))==round(b,metric.get('precision',1)):continue
   pairs+=1
 assert pairs>=100,(metric['id'],pairs)
 metric['audit']={'countries':len(values),'eligiblePairs':pairs,'zeroValues':values.count(0),'min':min(values),'max':max(values)}
 metrics.append(metric)

# Ember: use publisher's original CC BY data, not the mixed-source OWID energy table.
ember=[r for r in csv.DictReader((HERE/'ember.csv').open()) if r['ISO 3 code'] in allowed]
def ember_metric(id,label,question,category,subcategory,variable,source_unit,unit,value_label,gap,kind,definition,factor=1,scale='linear',format='decimal',family=None):
 rows=[r for r in ember if (r['Category'],r['Subcategory'],r['Variable'],r['Unit'])==(category,subcategory,variable,source_unit)]
 year,values=collect(rows,'ISO 3 code','Year','Value',factor)
 add(dict(id=id,indicator='ember:'+variable+':'+source_unit,label=label,question=question,category='energy',unit=unit,valueLabel=value_label,minGap=gap,gapKind=kind,scale=scale,format=format,definition=definition,year=year,values=values,provider='Ember',sourceName='Ember — Yearly Electricity Data (2026)',sourceDefinition=definition,sourceUrl='https://ember-energy.org/data/yearly-electricity-data/',license='CC BY 4.0',licenseUrl='https://ember-energy.org/creative-commons/',family=family or id,importSpec={'kind':'ember','dataUrl':urls['ember.csv'],'category':category,'subcategory':subcategory,'variable':variable,'sourceUnit':source_unit,'factor':factor}))
ember_metric('electricityDemand','Electricity per person','Which country uses more electricity per person?','Electricity demand','Demand per capita','Demand per capita','MWh','electricity','kWh / person',.2,'ratio','Annual electricity demand per person, including homes, businesses, industry, and system losses. The country total accounts for electricity generated domestically plus net imports; this is not just household use.',1000,'log','compact')
ember_metric('electricityCarbon','Electricity emissions intensity','Which country’s electricity produces more greenhouse gases per unit?','Power sector emissions','CO2 intensity','CO2 intensity','gCO2/kWh','carbonIntensity','g CO₂e / kWh',.2,'ratio','Lifecycle greenhouse-gas emissions per kilowatt-hour of electricity generated, measured in grams of CO₂-equivalent. Accounts for the country’s generation mix; includes upstream and infrastructure emissions, not only emissions at power plants.',1,'log')
for fuel,gap in [('Solar',3),('Wind',4),('Hydro',6),('Coal',6),('Gas',6)]:
 phrase={'Solar':'solar power','Wind':'wind power','Hydro':'hydropower','Coal':'coal','Gas':'natural gas'}[fuel]
 ember_metric('electricity'+fuel,fuel+' electricity',f'Which country generates a larger share of its electricity from {phrase}?','Electricity generation','Fuel',fuel,'%','percent','of electricity generated',gap,'absolute',f'Electricity generated from {phrase} as a percentage of all electricity generated within the country. This measures domestic production, not the electricity mix used after imports and exports.',format='percent',family='electricityMix')

# EIA-only public-domain series: exact source-unit conversions, no fuel-energy-density estimates.
energy=list(csv.DictReader((HERE/'energy-new.csv').open()))
cross={}
for r in energy:
 if r['iso_code'] in allowed:
  assert r['country'] not in cross or cross[r['country']]==r['iso_code']
  cross[r['country']]=r['iso_code']
assert set(cross.values())==allowed
eia=pq.read_table(HERE/'eia.parquet').to_pylist()
eia=[dict(r,iso3=cross[r['country']]) for r in eia if r['country'] in cross]
eia_meta=json.loads((HERE/'eia-meta.json').read_text())
for id,column,label,question,factor,unit,value_label,definition in [
 ('oilProduction','crude_oil_production','Crude oil production','Which country produces more crude oil?',1000,'barrels','barrels / day','Annual average daily production of crude oil, including lease condensate. Excludes other petroleum liquids such as biofuels. The source reports thousands of barrels per day; these figures are converted to barrels per day.'),
 ('gasProduction','natural_gas_production','Natural gas production','Which country produces more natural gas?',1e9,'gasVolume','m³ / year','Annual production of dry natural gas, after removal of condensates, natural gas liquids, and non-hydrocarbon gases. The source reports billion cubic meters; these figures are converted to cubic meters.'),
 ('coalProduction','coal_production_mt','Coal production','Which country mines more coal?',1e6,'tonnes','metric tons / year','Annual coal production, measured by mass in metric tons. Includes the coal types covered by EIA, rather than comparing their differing energy content. The source reports million metric tons; these figures are converted to metric tons.'),
]:
 year,values=collect(eia,'iso3','year',column,factor)
 add(dict(id=id,indicator=column,label=label,question=question,category='energy',family='fuelProduction',unit=unit,valueLabel=value_label,format='compact',minGap=.4 if id=='coalProduction' else .3,gapKind='ratio',scale='log1p',definition=definition,year=year,values=values,provider='EIA',sourceName='U.S. Energy Information Administration (2026), processed by Our World in Data',sourceDefinition=eia_meta['fields'][column]['title'],sourceUrl='https://www.eia.gov/international/data/world',license='Public domain; OWID processing CC BY 4.0',licenseUrl='https://www.eia.gov/about/copyrights_reuse.php',importSpec={'kind':'owid-eia-parquet','dataUrl':urls['eia.parquet'],'metadataUrl':urls['eia-meta.json'],'column':column,'factor':factor,'countryCrosswalkUrl':urls['energy-new.csv']}))

# OWID grapher: read source metadata and retain exact original attribution.
for file,id,label,question,unit,value_label,gap,kind,scale,definition in [
 ('temperature','temperature','Average temperature','Which country has a warmer annual average temperature?','celsius','°C',2,'absolute','linear','Average air temperature two meters above the ground over the full year, averaged across the country’s land area. This is an area-weighted climate measure, not the temperature of its capital or a population-weighted average.'),
 ('co2','co2','CO₂ emissions per person','Which country emits more CO₂ per person?','emissions','tonnes CO₂ / person',.2,'ratio','log','Annual CO₂ emissions from fossil fuels and industry within the country, divided by population. Excludes land-use change and international aviation and shipping. Emissions embodied in imported goods are counted in the producing country.'),
 ('methane','methane','Methane emissions per person','Which country emits more methane per person?','emissions','tonnes CO₂e / person',.2,'ratio','log','Annual human-caused methane emissions, including agriculture and land use, divided by population. Expressed in CO₂-equivalents using a 100-year warming impact; these are not tonnes of methane itself.'),
]:
 rows=list(csv.DictReader((HERE/(file+'.csv')).open())); col=[k for k in rows[0] if k not in ['Entity','Code','Year']];assert len(col)==1;col=col[0]
 year,values=collect(rows,'Code','Year',col)
 meta=json.loads((HERE/(file+'-meta.json')).read_text())
 # Grapher's exported CSV label can differ from its sole metadata-series label.
 # Assert the one-series shape instead of guessing among multiple columns.
 assert len(meta['columns'])==1
 metadata_col=next(iter(meta['columns']))
 details=meta['columns'][metadata_col]
 metric=dict(id=id,indicator=details['shortName'],label=label,question=question,category='climate',family='greenhouseGases' if file!='temperature' else 'temperature',unit=unit,valueLabel=value_label,gapLabel='°C' if file=='temperature' else value_label,minGap=gap,gapKind=kind,scale=scale,definition=definition,year=year,values=values,provider='Our World in Data',sourceName=details.get('citationShort',meta['chart']['citation']),sourceDefinition=details.get('descriptionShort',definition),sourceUrl=meta['chart']['originalChartUrl'],license='Copernicus License; OWID processing CC BY 4.0' if file=='temperature' else 'CC BY 4.0',licenseUrl='https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels-monthly-means?tab=overview' if file=='temperature' else 'https://creativecommons.org/licenses/by/4.0/',importSpec={'kind':'owid-grapher','dataUrl':urls[file+'.csv'],'metadataUrl':urls[file+'-meta.json'],'column':col})
 metric['importSpec']['metadataColumn']=metadata_col
 if file=='temperature':metric['allowNegative']=True
 add(metric)

# Current complete UNESCO inventory: count each listed property once per member country.
sites=json.loads((HERE/'unesco-sites.json').read_text());um=json.loads((HERE/'unesco-meta.json').read_text())['metas']['default']
assert len(sites)==um['records_count']==len({s['id_no'] for s in sites})
values={id:0 for id in allowed}
for site in sites:
 if site['iso_codes'] is None:
  # UNESCO lists Jerusalem separately, without a country ISO allocation.
  # Do not arbitrarily assign it to Jordan, Israel, or Palestine.
  assert site['id_no']=='148' and site['states_names']==['Jerusalem (Site proposed by Jordan)']
  continue
 for code in set(site['iso_codes']):
  if code in iso2:values[iso2[code]]+=1
add(dict(id='heritage',indicator='whc001',label='World Heritage sites',question='Which country has more UNESCO World Heritage sites?',category='culture',family='heritage',unit='sites',valueLabel='World Heritage sites',gapLabel='sites',format='decimal',precision=0,minGap=2,gapKind='absolute',scale='linear',definition='Properties on UNESCO’s current World Heritage List, including cultural, natural, and mixed sites. A transboundary property counts once for each participating country; a property with multiple component locations still counts as one site.',year=int(um['modified'][:4]),asOf=um['modified'][:10],timeLabel=um['modified'][:4]+' list',values=values,provider='UNESCO',sourceName='UNESCO World Heritage Centre',sourceDefinition='Counts derived from UNESCO’s complete World Heritage List using site identifiers and ISO country-code lists.',sourceUrl='https://whc.unesco.org/en/list/',license='CC BY-SA 4.0',licenseUrl=um['license_url'],importSpec={'kind':'unesco-world-heritage','dataUrl':urls['unesco-sites.json'],'metadataUrl':urls['unesco-meta.json'],'countryField':'iso_codes','uniqueSiteField':'id_no'}))

for code,id,label,question,value_label,gap,kind,scale,definition in [
 ('ER.H2O.FWST.ZS','waterStress','Water stress','Which country uses a larger share of its available freshwater?','of available freshwater',.25,'ratio','log','Freshwater withdrawn by all major sectors as a percentage of renewable freshwater available after environmental water requirements are set aside. Values can exceed 100%, for example where withdrawals rely on nonrenewable groundwater. This is water stress, not household water use.'),
 ('ER.MRN.PTMR.ZS','marineProtected','Protected seas','Which country protects a larger share of its territorial waters?','of territorial waters',4,'absolute','linear','Marine protected areas as a percentage of the country’s territorial waters. Includes areas protected by law or other effective means. Landlocked countries without an applicable observation are omitted.'),
]:
 raw=json.loads((HERE/(code+'.json')).read_text());assert raw[0]['pages']==1
 rows=[dict(r,iso3=r['countryiso3code']) for r in raw[1]];year,values=collect(rows,'iso3','date','value')
 meta=json.loads((HERE/(code+'-meta.json')).read_text())[1][0]
 metric=dict(id=id,indicator=code,label=label,question=question,category='nature',family='water' if id=='waterStress' else 'protectedAreas',unit='percent',valueLabel=value_label,minGap=gap,gapKind=kind,scale=scale,definition=definition,year=year,values=values,provider='World Bank',sourceName=meta['sourceOrganization'],sourceDefinition=meta['sourceNote'],sourceUrl='https://data.worldbank.org/indicator/'+code,license='CC BY 4.0',licenseUrl='https://creativecommons.org/licenses/by/4.0/',importSpec={'kind':'worldbank','indicator':code})
 if id=='waterStress':metric['allowOver100']=True
 add(metric)

assert len(metrics)==16
result={'metrics':metrics,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).date().isoformat(),'files':{f:{'url':u,'sha256':hashlib.sha256((HERE/f).read_bytes()).hexdigest()} for f,u in urls.items()},'notes':['No unknown country name is guessed: EIA uses an exact one-to-one OWID-name to ISO3 crosswalk; all remaining sources supply ISO codes.','Blank source values are omitted. Explicit zeros are retained.','All annual topics choose one common year, latest in 2021–2025 with 90 countries. UNESCO is a current inventory.','Refresh environment requires pyarrow==26.0.0; this is not a website dependency.','Per-metric source licenses must be retained; UNESCO is CC BY-SA 4.0.']}
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
for m in metrics:print(m['id'],m['year'],m['audit'])
