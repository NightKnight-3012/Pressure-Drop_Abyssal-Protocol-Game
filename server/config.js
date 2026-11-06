import path from 'node:path';
export function readConfig(env=process.env){
  const integer=(key,fallback,min,max)=>{if(env[key]===undefined||env[key]==='')return fallback;const value=Number(env[key]);if(!Number.isInteger(value)||value<min||value>max)throw Error(key+' must be an integer from '+min+' to '+max);return value;};
  const boolean=key=>{if(!env[key]||env[key]==='false')return false;if(env[key]==='true')return true;throw Error(key+' must be true or false');};
  const origins=(env.CORS_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
  for(const origin of origins)if(origin!=='*'){let url;try{url=new URL(origin);}catch{throw Error('CORS_ORIGIN must contain full HTTP origins');}if(!['http:','https:'].includes(url.protocol)||url.origin!==origin)throw Error('CORS_ORIGIN must contain full HTTP origins without paths');}
  const timeScale=Number(env.PD_TIME_SCALE||1);if(!Number.isFinite(timeScale)||timeScale<=0||timeScale>20||env.NODE_ENV==='production'&&timeScale!==1)throw Error('PD_TIME_SCALE must be 1 in production');
  return {port:integer('PORT',3000,0,65535),origins,timeScale,trustProxy:boolean('TRUST_PROXY'),dataFile:env.PD_DATA_FILE||path.resolve('server/data/pressure-drop.sqlite'),limits:{maxRooms:integer('MAX_ROOMS',20,1,1000),maxRoomsPerIp:integer('MAX_ROOMS_PER_IP',4,1,100),maxConnections:integer('MAX_CONNECTIONS',200,1,10000),maxConnectionsPerIp:integer('MAX_CONNECTIONS_PER_IP',40,1,1000)}};
}
