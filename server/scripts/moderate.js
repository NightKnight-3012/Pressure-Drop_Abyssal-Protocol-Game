import {createRepository} from '../db.js';
import {readConfig} from '../config.js';
const [command,id,...reason]=process.argv.slice(2),repo=createRepository(readConfig().dataFile);
try{if(command==='reports')console.log(JSON.stringify(repo.reports(),null,2));else if(command==='ban'&&id){if(!repo.ban(id,reason.join(' ')||'Operator ban'))throw Error('Unknown anonymous profile');console.log('Banned '+id);}else if(command==='unban'&&id)console.log(repo.unban(id)?'Ban removed':'No ban found');else throw Error('Usage: npm run moderate -- reports | ban PROFILE_ID reason | unban PROFILE_ID');}catch(error){console.error(error.message);process.exitCode=1;}finally{repo.close();}
