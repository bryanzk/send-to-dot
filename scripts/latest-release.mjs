// Resolve metadata only. Never downloads, installs, runs code or reads credentials.
import {pathToFileURL} from 'node:url';
const repo='https://github.com/bryanzk/send-to-dot';
export function selectRelease(releases,{includePreviews=false}={}){
 const published=releases.filter(r=>r.draft===false&&r.published_at&&(!r.prerelease||includePreviews)).sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at));
 if(!published.length)throw Error('No supported published release; previews require explicit inclusion');
 const r=published[0];if(!/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(r.tag_name)||!Number.isFinite(Date.parse(r.published_at)))throw Error('Invalid published release metadata');
 const version=r.tag_name.slice(1),base=repo+'/releases/download/'+r.tag_name+'/';
 const asset=name=>{const matches=r.assets?.filter(a=>a.name===name&&a.state==='uploaded')??[];if(matches.length!==1)throw Error('Latest release missing or duplicating required asset: '+name);const a=matches[0];if(a.browser_download_url!==base+name||!Number.isSafeInteger(a.size)||a.size<=0)throw Error('Unexpected release asset source or size');return {name,url:a.browser_download_url,size:a.size,digest:a.digest??null};};
 return {repository:repo,tag:r.tag_name,preview:r.prerelease===true,published_at:r.published_at,release_url:repo+'/releases/tag/'+r.tag_name,source:asset('send-to-dot-'+version+'-source.tar.gz'),shortcut:asset('Send-to-dot.shortcut'),checksums:asset('SHA256SUMS.txt')};
}
export async function latestRelease({includePreviews=false,fetcher=fetch}={}){
 const all=[];for(let page=1;page<=10;page++){const response=await fetcher('https://api.github.com/repos/bryanzk/send-to-dot/releases?per_page=100&page='+page,{headers:{Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('GitHub release metadata unavailable: '+response.status);const text=await response.text();if(text.length>8*1024*1024)throw Error('Release metadata too large');const rows=JSON.parse(text);if(!Array.isArray(rows))throw Error('Invalid release list');all.push(...rows);if(!response.headers.get('link')?.includes('rel="next"'))return selectRelease(all,{includePreviews});}throw Error('Release pagination limit reached; do not guess latest');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await latestRelease({includePreviews:process.argv.includes('--include-previews')}),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
