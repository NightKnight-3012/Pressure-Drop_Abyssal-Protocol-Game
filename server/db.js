// Server-only persistence. No client can submit a result row or choose its identity ID.
import {DatabaseSync} from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
const count=value=>Number.isFinite(value)?Math.max(0,Math.min(1e9,Math.floor(value))):0;
export function weekStart(now=Date.now()){
  const date=new Date(now),day=(date.getUTCDay()+6)%7;
  return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-day);
}
export function createRepository(filename=':memory:'){
  if(filename!==':memory:')fs.mkdirSync(path.dirname(path.resolve(filename)),{recursive:true});
  const db=new DatabaseSync(filename,{timeout:1000});
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS identities(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,name TEXT NOT NULL,created_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,finished_ms INTEGER NOT NULL,seconds INTEGER NOT NULL,crew_size INTEGER NOT NULL,difficulty TEXT NOT NULL,mission TEXT NOT NULL,result TEXT NOT NULL,public_room INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS player_results(match_id TEXT NOT NULL REFERENCES matches(id),identity_id TEXT NOT NULL REFERENCES identities(id),name TEXT NOT NULL,escaped INTEGER NOT NULL,tasks INTEGER NOT NULL,downs INTEGER NOT NULL,revives INTEGER NOT NULL,survived INTEGER NOT NULL,PRIMARY KEY(match_id,identity_id));
    CREATE INDEX IF NOT EXISTS result_identity ON player_results(identity_id);
    CREATE INDEX IF NOT EXISTS match_crew_time ON matches(crew_size,finished_ms);
    CREATE TABLE IF NOT EXISTS reports(scope TEXT NOT NULL,reporter TEXT NOT NULL REFERENCES identities(id),target TEXT NOT NULL REFERENCES identities(id),reason TEXT NOT NULL,excerpt TEXT NOT NULL,created_ms INTEGER NOT NULL,PRIMARY KEY(scope,reporter,target));
    CREATE TABLE IF NOT EXISTS bans(identity_id TEXT PRIMARY KEY REFERENCES identities(id),reason TEXT NOT NULL,created_ms INTEGER NOT NULL);
    PRAGMA user_version=1;`);
  const findIdentity=db.prepare('SELECT id,name FROM identities WHERE token_hash=?');
  const addIdentity=db.prepare('INSERT INTO identities VALUES (?,?,?,?)');
  const setName=db.prepare('UPDATE identities SET name=? WHERE id=?');
  const addMatch=db.prepare('INSERT OR IGNORE INTO matches VALUES (?,?,?,?,?,?,?,?)');
  const addResult=db.prepare('INSERT OR IGNORE INTO player_results VALUES (?,?,?,?,?,?,?,?)');
  const personal=db.prepare(`SELECT COUNT(*) AS matches,COALESCE(SUM(escaped),0) AS escaped,COALESCE(SUM(tasks),0) AS tasks,COALESCE(SUM(downs),0) AS downs,COALESCE(SUM(revives),0) AS revives,COALESCE(SUM(survived),0) AS survived FROM player_results WHERE identity_id=?`);
  const addReport=db.prepare('INSERT OR IGNORE INTO reports VALUES (?,?,?,?,?,?)');
  const banned=db.prepare('SELECT reason FROM bans WHERE identity_id=?');
  return {
    identity(token){
      if(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)){const found=findIdentity.get(hash(token));if(found)return {...found,token};}
      const id=crypto.randomUUID(),secret=crypto.randomBytes(32).toString('hex');addIdentity.run(id,hash(secret),'Crew',Date.now());return {id,token:secret,name:'Crew'};
    },
    setName(id,name){if(typeof name==='string'&&name.length>=1&&name.length<=16)setName.run(name,id);},
    record({id,summary,difficulty='normal',players,publicRoom=false},now=Date.now()){
      if(summary.practice||summary.aborted)return false;
      if(typeof id!=='string'||!id.length||!Number.isInteger(summary.startCount)||summary.startCount<1||summary.startCount>8||!['win','lose'].includes(summary.result))throw Error('Invalid authoritative result');
      db.exec('BEGIN IMMEDIATE');
      try{
        const added=addMatch.run(id,now,count(summary.seconds),summary.startCount,difficulty,summary.mission||'blackout',summary.result,Number(publicRoom===true)).changes;
        if(added)for(const crew of summary.crew){const player=players.find(p=>p.id===crew.id);if(!player?.profileId)throw Error('Missing authoritative player identity');
          const escaped=typeof crew.escaped==='boolean'?crew.escaped:crew.fate==='pod escaped'||crew.fate==='capsule escaped';
          addResult.run(id,player.profileId,String(crew.name).slice(0,16),Number(escaped),count(crew.tasks),count(crew.downs),count(crew.revives),count(crew.survived??summary.seconds));
        }
        db.exec('COMMIT');return !!added;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    stats(id){return {id,...personal.get(id)};},
    leaderboard({period='all',kind='escapes',crewSize=0}={},now=Date.now()){
      const sort={escapes:'escapes DESC, revives DESC, tasks DESC',revives:'revives DESC, escapes DESC, tasks DESC',fastest:'fastest ASC, escapes DESC'};
      if(!['all','weekly'].includes(period)||typeof kind!=='string'||!Object.hasOwn(sort,kind)||!Number.isInteger(crewSize)||crewSize<0||crewSize>8||kind==='fastest'&&crewSize===0)throw Error('Choose a valid board, period and crew size; fastest needs a specific crew size.');
      const cutoff=period==='weekly'?weekStart(now):0;
      const query=db.prepare(`SELECT i.id,i.name,COUNT(*) AS matches,SUM(p.escaped) AS escapes,SUM(p.revives) AS revives,SUM(p.tasks) AS tasks,MIN(CASE WHEN p.escaped=1 THEN m.seconds END) AS fastest
        FROM player_results p JOIN matches m ON m.id=p.match_id JOIN identities i ON i.id=p.identity_id
        WHERE m.public_room=1 AND m.finished_ms>=? AND (?=0 OR m.crew_size=?) AND NOT EXISTS(SELECT 1 FROM bans b WHERE b.identity_id=i.id)
        GROUP BY i.id ${kind==='fastest'?'HAVING SUM(p.escaped)>0':''} ORDER BY ${sort[kind]},i.id LIMIT 50`);
      return query.all(cutoff,crewSize,crewSize).map(row=>({...row}));
    },
    report({scope,reporter,target,reason,excerpt=''},now=Date.now()){
      if(typeof scope!=='string'||scope.length>100||typeof reason!=='string'||!reason.trim()||reason.length>240||reporter===target)throw Error('Invalid report');
      return !!addReport.run(scope,reporter,target,reason.trim(),String(excerpt).slice(0,120),now).changes;
    },
    reports(){return db.prepare('SELECT * FROM reports ORDER BY created_ms DESC LIMIT 100').all().map(row=>({...row}));},
    isBanned(id){return !!banned.get(id);},
    bannedIds(){return db.prepare('SELECT identity_id FROM bans').all().map(row=>row.identity_id);},
    ban(id,reason='Operator ban'){
      if(!db.prepare('SELECT 1 FROM identities WHERE id=?').get(id))return false;
      db.prepare('INSERT INTO bans VALUES (?,?,?) ON CONFLICT(identity_id) DO UPDATE SET reason=excluded.reason,created_ms=excluded.created_ms').run(id,String(reason).slice(0,160),Date.now());return true;
    },
    unban(id){return !!db.prepare('DELETE FROM bans WHERE identity_id=?').run(id).changes;},
    close(){db.close();}
  };
}
