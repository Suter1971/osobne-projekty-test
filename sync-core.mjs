/* Osobné projekty — pure, deterministic history merge, protocol v1.
   An edit is a NEW immutable revision, never an overwrite of another device's revision. */
export const KINDS = ['categories', 'projects', 'tasks'];
export const blankData = () => ({version:1, categories:[], projects:[], tasks:[]});
export const validData = x => x && x.version === 1 && KINDS.every(k => Array.isArray(x[k]));
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const slot = (kind,id) => `${kind}:${id}`;
export function validOp(x) {
  return x && typeof x.id === 'string' && x.id.length > 0 &&
    KINDS.includes(x.kind) && typeof x.entityId === 'string' && x.entityId.length > 0 &&
    Array.isArray(x.parents) && x.parents.every(p => typeof p === 'string') &&
    (x.record === null || (x.record && typeof x.record === 'object' && !Array.isArray(x.record) && x.record.id === x.entityId));
}
export function headsFor(ops,kind,entityId) {
  const all = Object.values(ops).filter(o=>validOp(o)&&o.kind===kind&&o.entityId===entityId);
  const superseded = new Set(all.flatMap(o=>o.parents));
  return all.filter(o=>!superseded.has(o.id)).sort((a,b)=>a.id.localeCompare(b.id));
}
export function projectHistory(ops, preferred = blankData()) {
  const data=blankData(), conflicts=[];
  for (const kind of KINDS) {
    const ids = new Set(Object.values(ops).filter(validOp).filter(o=>o.kind===kind).map(o=>o.entityId));
    const old = new Map((preferred[kind]||[]).map(r=>[r.id,r]));
    const rows=[];
    for (const entityId of ids) {
      const heads=headsFor(ops,kind,entityId);
      if (!heads.length) continue;
      let selected=heads[0];
      if (heads.length>1) {
        conflicts.push({kind,entityId,heads});
        const prior = old.get(entityId);
        if (prior) selected = heads.find(h=>same(h.record, prior)) || selected;
      }
      if (selected.record !== null) rows.push({record:selected.record, order:Number.isFinite(selected.order)?selected.order:0, id:entityId});
    }
    rows.sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id));
    data[kind]=rows.map(x=>x.record);
  }
  return {data, conflicts};
}
export function diffToOps(previous, next, ops, makeId, deviceId) {
  if (!validData(previous) || !validData(next)) throw Error('Neplatný formát databázy.');
  const out=[];
  for (const kind of KINDS) {
    const before=new Map(previous[kind].map(x=>[x.id,x]));
    const after=new Map(next[kind].map(x=>[x.id,x]));
    for (const entityId of new Set([...before.keys(),...after.keys()])) {
      const a=before.get(entityId), b=after.get(entityId);
      if (same(a,b)) continue;
      const heads=headsFor(ops,kind,entityId);
      if (heads.length>1) throw Error('Nezlučiteľné súbežné zmeny. Najprv vyrieš konflikt.');
      out.push({id:makeId(),kind,entityId,parents:heads.map(h=>h.id),record:b??null,
        order:b?next[kind].findIndex(x=>x.id===entityId):previous[kind].findIndex(x=>x.id===entityId),
        device:deviceId,at:new Date().toISOString(),protocol:1});
    }
  }
  return out;
}
