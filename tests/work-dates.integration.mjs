import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { supportModules, loadWorkModule } from "./helpers/work-support.mjs";
test("Phase 06 independent task dates, lifecycle, ownership, concurrency, DB constraints and date queries", { skip: process.env.RUN_WORK_MANAGEMENT_DB_TEST !== "1" }, async t => {
  assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE,"1"); assert.notEqual(process.env.NODE_ENV,"production");
  const url = new URL(process.env.DATABASE_URL); assert.equal(url.hostname,"work-db"); assert.equal(url.pathname,"/work_test");
  const { PrismaClient } = await import("../src/generated/prisma/index.js"), db = new PrismaClient();
  const modules = supportModules(db), api = modules.server, service = loadWorkModule("src/lib/work-management/date-server.ts",modules.supportingDeps);
  const ids = [], keys = [], prefix = `__phase06_${randomUUID()}`; let foreign;
  const original = await db.user.findUniqueOrThrow({ where: { id:1 },select:{totalXp:true,coins:true,updatedAt:true} });
  const command = row => { const requestKey = randomUUID(); keys.push(requestKey); return { requestKey,...(row ? {revision:row.revision}: {}) }; };
  const create = async (extra={}) => { const row = await api.createTodo({title:prefix,...extra},command()); ids.push(row.id); return row; };
  const fresh = row => api.getTodo(row.id), date = value => ({kind:"DATE",date:value});
  const act = async (row,body) => service.taskDateCommand(row.id,body,command(await fresh(row)));
  const patch = async (row,body) => api.patchTodo(row.id,body,command(await fresh(row)));
  const read = row => service.readTaskDates(row.id,new URLSearchParams());
  const reject = (action,status=409) => assert.rejects(action,error=>error instanceof modules.validation.WorkValidationError && error.status===status);
  const snapshot = async row => ({ task:await fresh(row), followUps:await db.workFollowUp.findMany({where:{todoId:row.id}}), keys:await db.workKeyDate.findMany({where:{todoId:row.id}}), log:await db.workActivity.findMany({where:{todoId:row.id}}), receipts:await db.workMutationReceipt.count(), balance:await db.user.findUnique({where:{id:1},select:{coins:true,totalXp:true}}) });
  try {
    await t.test("optional/date-only/exact/cleared deadlines preserve events, priorities and rewards",async()=>{
      const row = await create({priorityLevel:"URGENT"}); assert.equal(row.deadlineDate,null); assert.equal(row.deadlineState,null);
      const event = await db.event.create({data:{title:prefix,userId:1,linkedTodoId:row.id,date:new Date("2026-01-01T23:00Z"),endDate:new Date("2026-01-02T01:00Z")}});
      await act(row,{action:"deadline",date:date("2026-11-10")}); assert.equal((await fresh(row)).deadlineAt,null);
      await act(row,{action:"deadline",date:{kind:"TIME",local:"2026-11-01T01:30",timeZone:"America/Toronto",occurrence:"later"}});
      const timed = await fresh(row); assert.equal(new Date(timed.deadlineAt).toISOString(),"2026-11-01T06:30:00.000Z"); assert.equal(timed.deadlineTimeZone,"America/Toronto");
      await act(row,{action:"deadline",date:null}); const cleared = await fresh(row); assert.equal(cleared.deadlineDate,null); assert.equal(cleared.deadlineAt,null); assert.equal(cleared.deadlineState,null); assert.equal(cleared.priorityLevel,"URGENT");
      assert.deepEqual(await db.event.findUnique({where:{id:event.id}}),event); assert.equal(cleared.status,"NEW");
      const history = await db.workActivity.findMany({where:{todoId:row.id}}); for (const action of ["DEADLINE_SET","DEADLINE_CHANGED","DEADLINE_CLEARED"]) assert.ok(history.some(item=>item.action===action));
    });
    await t.test("invalid calendar times, DST and conflicting date alternatives reject with no partial records",async()=>{
      const row = await create(), before = await snapshot(row);
      for (const value of [date("2026-02-29"),{kind:"DATE",date:"2026-11-10",local:"2026-11-10T12:00"},{kind:"TIME",local:"2026-03-08T02:30",timeZone:"America/Toronto"},{kind:"TIME",local:"2026-11-01T01:30",timeZone:"America/Toronto"}]) await reject(act(row,{action:"deadline",date:value}),400);
      assert.deepEqual(await snapshot(row),before);
    });
    await t.test("follow-up completion and snooze retain history and never change the task outcome or deadline",async()=>{
      const row = await create(); await act(row,{action:"deadline",date:date("2027-02-20")}); await patch(row,{status:"WAITING",waitingReason:"Waiting on vendor"});
      await act(row,{action:"followup-create",date:date("2026-11-01"),reason:"Check delivery"}); const active = (await read(row)).activeFollowUp; assert.equal(active.state,"DUE");
      await act(row,{action:"followup-snooze",id:active.id,date:date("2026-11-12"),reason:"Vendor asked for two days"});
      let view = await read(row); assert.equal(view.followUps.length,2); assert.equal(view.activeFollowUp.previousId,active.id); assert.equal(view.followUps.find(item=>item.id===active.id).status,"SNOOZED");
      const completeKey = command(await fresh(row)), body = {action:"followup-complete",id:view.activeFollowUp.id,reason:"Called vendor"};
      const completed = await service.taskDateCommand(row.id,body,completeKey); assert.deepEqual(await service.taskDateCommand(row.id,body,completeKey),completed);
      view = await read(row); assert.equal(view.activeFollowUp,null); assert.equal(view.followUps[0].status,"COMPLETED"); assert.equal(view.followUps[0].outcome,"Called vendor"); assert.equal(view.followUps[0].date,"2026-11-12");
      const task = await fresh(row); assert.equal(task.status,"WAITING"); assert.equal(task.deadlineDate,"2027-02-20"); assert.equal(task.completedAt,null);
      await reject(act(row,body));
      await act(row,{action:"followup-create",date:date("2026-11-15")}); const current=(await read(row)).activeFollowUp;
      await act(row,{action:"followup-cancel",id:current.id}); assert.equal((await read(row)).activeFollowUp,null);
    });
    await t.test("one active follow-up is enforced concurrently, stale snoozes/replays cannot spawn two",async()=>{
      const row=await create(), body={action:"followup-create",date:date("2026-11-10")};
      const result=await Promise.allSettled([service.taskDateCommand(row.id,body,command(row)),service.taskDateCommand(row.id,body,command(row))]); assert.equal(result.filter(item=>item.status==="fulfilled").length,1);
      let current=await fresh(row), active=(await read(row)).activeFollowUp; await reject(service.taskDateCommand(row.id,body,command(current)));
      const snooze={action:"followup-snooze",id:active.id,date:date("2026-11-20")};
      const races=await Promise.allSettled([service.taskDateCommand(row.id,snooze,command(current)),service.taskDateCommand(row.id,snooze,command(current))]); assert.equal(races.filter(item=>item.status==="fulfilled").length,1);
      assert.equal(await db.workFollowUp.count({where:{todoId:row.id,status:"ACTIVE"}}),1); assert.equal(await db.workFollowUp.count({where:{todoId:row.id}}),2);
      await assert.rejects(db.workFollowUp.create({data:{todoId:row.id,date:"2026-11-25"}}));
      current=await fresh(row); active=(await read(row)).activeFollowUp;
      const mixed=await Promise.allSettled([service.taskDateCommand(row.id,{action:"followup-complete",id:active.id},command(current)),service.taskDateCommand(row.id,{action:"followup-snooze",id:active.id,date:date("2026-12-01")},command(current))]);
      assert.equal(mixed.filter(item=>item.status==="fulfilled").length,1); assert.ok(await db.workFollowUp.count({where:{todoId:row.id,status:"ACTIVE"}})<=1);
    });
    await t.test("closure retires active follow-ups without erasing history; reopen recomputes original deadline without reminders",async()=>{
      const row=await create({rewardXp:13,rewardCoins:2}); await act(row,{action:"deadline",date:date("2020-01-01")}); await act(row,{action:"followup-create",date:date("2020-01-02")});
      await act(row,{action:"key-create",date:date("2020-01-03"),label:"Expected delivery"}); assert.equal((await fresh(row)).deadlineState,"OVERDUE");
      await patch(row,{status:"DONE"}); const closed=await fresh(row); assert.equal(closed.deadlineState,null); assert.equal(closed.activeFollowUp,null);
      let view=await read(row); assert.equal(view.followUps[0].status,"CANCELLED"); assert.equal(view.followUps[0].outcome,"TASK_CLOSED"); assert.equal(view.keyDates.length,1);
      await reject(act(row,{action:"followup-create",date:date("2027-01-01")}));
      await patch(row,{status:"TODO"}); const reopened=await fresh(row); assert.equal(reopened.deadlineDate,"2020-01-01"); assert.equal(reopened.deadlineState,"OVERDUE"); assert.equal(reopened.activeFollowUp,null);
      await act(row,{action:"followup-create",date:date("2020-01-04")}); await patch(row,{status:"CANCELLED"}); assert.equal((await read(row)).activeFollowUp,null);
      await patch(row,{status:"TODO"}); assert.equal((await fresh(row)).activeFollowUp,null);
      await act(row,{action:"followup-create",date:date("2020-01-05")}); await patch(row,{archived:true}); view=await read(row); assert.equal(view.activeFollowUp.state,null); assert.equal(view.activeFollowUp.status,"ACTIVE");
      await patch(row,{archived:false}); assert.equal((await read(row)).activeFollowUp.state,"DUE");
    });
    await t.test("key dates are informational, editable, owner-scoped and retained after removal",async()=>{
      const row=await create(); await act(row,{action:"key-create",label:"Launch",date:date("2020-01-01")}); let view=await read(row), item=view.keyDates[0];
      assert.equal((await fresh(row)).deadlineState,null); assert.equal((await fresh(row)).status,"NEW");
      await act(row,{action:"key-edit",id:item.id,label:"Delivery",date:{kind:"TIME",local:"2027-01-01T12:00",timeZone:"UTC"}}); assert.equal((await read(row)).keyDates[0].label,"Delivery");
      foreign=await db.user.create({data:{email:`${prefix}@invalid.test`,name:prefix}}); const other=await db.todo.create({data:{userId:foreign.id,title:prefix}}); ids.push(other.id);
      await reject(service.readTaskDates(other.id,new URLSearchParams()),404); await reject(service.taskDateCommand(other.id,{action:"deadline",date:date("2026-11-10")},command(other)),404);
      await reject(act(row,{action:"key-edit",id:2147483647,label:"Foreign",date:date("2026-11-10")}),404);
      await act(row,{action:"key-remove",id:item.id}); assert.equal((await read(row)).keyDates.length,0); assert.ok((await db.workKeyDate.findUnique({where:{id:item.id}})).removedAt);
      await reject(api.deleteTodo(row.id,command(await fresh(row))));
    });
    await t.test("database constraints reject impossible/mixed dates and lifecycle inconsistencies",async()=>{
      const row=await create();
      await assert.rejects(db.todo.update({where:{id:row.id},data:{deadlineDate:"2026-02-30"}}));
      await assert.rejects(db.todo.update({where:{id:row.id},data:{deadlineAt:new Date(),deadlineTimeZone:null}}));
      await assert.rejects(db.todo.update({where:{id:row.id},data:{deadlineDate:"2026-11-10",deadlineAt:new Date(),deadlineTimeZone:"UTC"}}));
      await assert.rejects(db.todo.update({where:{id:row.id},data:{deadlineAt:new Date(),deadlineTimeZone:"Bad/Zone"}}));
      await assert.rejects(db.workFollowUp.create({data:{todoId:row.id,date:"2026-11-10",status:"COMPLETED"}}));
      await assert.rejects(db.workKeyDate.create({data:{todoId:row.id,label:"Invalid"}}));
    });
    await t.test("deadline and follow-up filtering/sorting handle mixed values and undated Urgent work",async()=>{
      const a=await create({priorityLevel:"URGENT"}), b=await create(), c=await create(), d=await create();
      await act(b,{action:"deadline",date:date("2020-01-01")}); await act(c,{action:"deadline",date:{kind:"TIME",local:"2020-01-01T12:00",timeZone:"America/Toronto"}}); await act(d,{action:"deadline",date:date("2030-01-01")});
      await act(d,{action:"followup-create",date:date("2020-01-01")});
      const search=async extra=>api.searchWork(new URLSearchParams({q:prefix,...extra}));
      const sorted=(await search({sort:"deadline"})).items.filter(row=>[a.id,b.id,c.id,d.id].includes(row.id)).map(row=>row.id); assert.deepEqual(sorted,[c.id,b.id,d.id,a.id]);
      assert.ok((await search({due:"none",priority:"URGENT"})).items.some(row=>row.id===a.id));
      assert.ok((await search({due:"overdue"})).items.some(row=>row.id===b.id)); assert.ok(!(await search({due:"overdue"})).items.some(row=>row.id===d.id));
      assert.ok((await search({followup:"due"})).items.some(row=>row.id===d.id));
      assert.ok((await search({deadlineFrom:"2020-01-01",deadlineTo:"2020-01-01"})).items.some(row=>row.id===c.id));
    });
    await t.test("long follow-up history and key-date lists remain fully retrievable through pages",async()=>{
      const row=await create();
      for(let index=0;index<21;index++){
        await act(row,{action:"followup-create",date:date("2026-11-10"),reason:`Check ${index}`});
        await act(row,{action:"followup-complete",id:(await read(row)).activeFollowUp.id});
        await act(row,{action:"key-create",label:`Delivery ${index}`,date:date("2027-01-01")});
      }
      const first=await read(row),last=await service.readTaskDates(row.id,new URLSearchParams({page:"2",keyPage:"2"}));
      assert.equal(first.total,21);assert.equal(first.keyTotal,21);assert.equal(first.followUps.length,20);assert.equal(first.keyDates.length,20);assert.equal(last.followUps.length,1);assert.equal(last.keyDates.length,1);
      assert.ok(!first.followUps.some(item=>item.id===last.followUps[0].id));assert.equal((await fresh(row)).status,"NEW");
    });
    await t.test("late audit failure rolls back deadline, follow-up replacement, retirement and rewards",async()=>{
      const row=await create({rewardXp:30}); await act(row,{action:"followup-create",date:date("2026-11-10")});
      const failDb={$transaction:(action,options)=>db.$transaction(tx=>action(new Proxy(tx,{get(target,prop){if(prop==="workActivity")return {...target.workActivity,create:async()=>{throw new Error("injected date audit failure");}};return Reflect.get(target,prop);}})),options)};
      const failure=supportModules(failDb), failService=loadWorkModule("src/lib/work-management/date-server.ts",failure.supportingDeps);
      for(const body of [{action:"deadline",date:date("2026-11-15")},{action:"followup-snooze",id:(await read(row)).activeFollowUp.id,date:date("2026-11-20")}]){
        const before=await snapshot(row); await assert.rejects(failService.taskDateCommand(row.id,body,command(await fresh(row))),/injected date audit failure/); assert.deepEqual(await snapshot(row),before);
      }
      // Allow retirement and reward writes, then fail the later completion audit.
      const closureDb={$transaction:(action,options)=>db.$transaction(tx=>action(new Proxy(tx,{get(target,prop){if(prop==="workActivity")return {...target.workActivity,create:async args=>{if(args.data.action==="COMPLETED")throw new Error("injected completion audit failure");return target.workActivity.create(args);}};return Reflect.get(target,prop);}})),options)};
      const before=await snapshot(row); await assert.rejects(supportModules(closureDb).server.patchTodo(row.id,{status:"DONE"},command(await fresh(row))),/injected completion audit failure/); assert.deepEqual(await snapshot(row),before);
    });
  } finally {
    await db.$transaction(async tx=>{
      await tx.workActivity.deleteMany({where:{todoId:{in:ids}}}); await tx.workFollowUp.updateMany({where:{todoId:{in:ids}},data:{previousId:null}}); await tx.workFollowUp.deleteMany({where:{todoId:{in:ids}}}); await tx.workKeyDate.deleteMany({where:{todoId:{in:ids}}});
      await tx.event.deleteMany({where:{title:prefix}}); await tx.todo.deleteMany({where:{id:{in:ids}}}); await tx.workMutationReceipt.deleteMany({where:{requestKey:{in:keys}}}); if(foreign)await tx.user.delete({where:{id:foreign.id}}); await tx.user.update({where:{id:1},data:original});
    }); await db.$disconnect();
  }
});
