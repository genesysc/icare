#!/usr/bin/env python3
"""Renaissance Care (Scotland) Ltd careers -> sponsored_jobs payloads.

Usage: curl -G https://www.renaissance-care.co.uk/Umbraco/Surface/Career/VacancySearch \
         --data-urlencode filters= --data-urlencode keyword= --data "pageNo=1&pageSize=100&sort=newest" -o vac.json
       python3 renaissance-care.py   # reads vac.json, writes jobs.json (array of upsert_sponsored_job payloads)
Then load each with: select * from upsert_sponsored_job('<json>'::jsonb);  (service role / MCP only)
Keeps health & care roles only (care assistants/team leaders, nurses, managers, wellbeing leads);
apply_url links out to the original posting. robots.txt allows this endpoint (checked 2026-10-19).
Town = the care home's town; NOT the register's town (Musselburgh) - see HANDOVER.md section 27.
"""
import json,re,html,subprocess,sys
from datetime import datetime
B='https://www.renaissance-care.co.uk'
d=json.load(open('vac.json'))['list']
KEEP=re.compile(r'care assistant|care team leader|nurse|home manager|deputy manager|wellbeing lead',re.I)
TOWNS={'meadowlark':'Forres','benvie':'Dundee','jesmond':'Aberdeen','glencairn':'Edinburgh','riverside':'Aberdeen','letham':'Edinburgh','malin':'Girvan','berelands':'Prestwick','beech':'Blairgowrie','kingsmills':'Inverness','kingmills':'Inverness','cranford':'Aberdeen','cowdray':'Aberdeen','rosepark':'Uddingston','whitecraigs':'Glasgow','persley':'Aberdeen','wyndwell':'Peterhead','croftbank':'Uddingston','mathieson':'Edinburgh'}
def town(j):
    h=(j['location']+' '+j['title']+' '+j['url']).lower()
    for k,v in TOWNS.items():
        if k in h: return v
    if 'blairgowrie' in h: return 'Blairgowrie'
    return None
def dt(s): return datetime.strptime(s,'%B %d, %Y').strftime('%Y-%m-%d')
out=[];skipped=[]
for j in d:
    if not KEEP.search(j['title']): skipped.append(j['title'].strip()); continue
    t=town(j)
    if not t: print('NO TOWN',j['title'],j['location'],file=sys.stderr); continue
    pg=subprocess.run(['curl','-sS','-L','-m','30','-A','Mozilla/5.0',B+j['url']],capture_output=True,text=True).stdout
    pg=re.sub(r'<(script|style)[\s\S]*?</\1>','',pg)
    m=re.search(r'<h1[\s\S]*?(?=At a glance)',pg) 
    body=pg[pg.find('Career Hub'):pg.find('At a glance')] if 'At a glance' in pg else ''
    tx=html.unescape(re.sub(r'<br\s*/?>|</p>|</li>','\n',body)); tx=re.sub(r'<[^>]+>','',tx)
    tx=re.sub(r'[ \t]+',' ',tx); tx=re.sub(r'\n\s*\n+','\n',tx).strip()
    lines=tx.split('\n'); 
    # drop breadcrumb/title lines up to the first sentence
    tx='\n'.join(lines[3:]).replace('Apply now','').strip() if len(lines)>3 else tx
    rate=j['rate'] or ''
    mr=re.search(r'£\s*([\d.]+)',rate)
    sal=float(mr.group(1)) if mr else None
    hrs=re.search(r'(\d+)\s*hours? per week',tx)
    ct=j['type'] or ('Bank' if 'bank' in j['title'].lower() else None)
    if ct=='Permanent' and 'bank' in j['title'].lower(): ct='Bank'
    out.append({'source_job_id':'renaissance-care:'+j['url'].strip('/').split('/',1)[1] if False else 'renaissance-care:'+j['url'].strip('/'),
      'title':re.sub(r'\s+',' ',j['title']).strip(),'employer_name':'Renaissance Care (Scotland) Ltd','town':t,'region':j['locationName'],
      'salary_min':sal,'salary_max':sal,'salary_period':'hour' if sal else 'year','sector':'Adult social care' if 'nurse' not in j['title'].lower() else 'Nursing',
      'contract_type':ct,'hours':(hrs.group(1)+' hours per week') if hrs else None,'apply_url':B+j['url'],
      'description':tx[:4000],'posted_at':dt(j['postedOn']),'expires_at':dt(j['closedOn'])+'T23:59:59+00'})
json.dump(out,open('jobs.json','w'),indent=1)
print(len(out),'kept;',len(skipped),'skipped')
print('skipped:',sorted(set(skipped)))
for o in out: print(o['title'],'|',o['town'],'|',o['salary_min'],'|',o['contract_type'],'|',o['hours'],'|',o['source_job_id'])
