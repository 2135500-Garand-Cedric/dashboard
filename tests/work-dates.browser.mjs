import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
test("Phase 06 date controls in Tokyo browser / UTC server: deadline, DST, follow-up, key date and closure at four sizes", { skip: process.env.RUN_WORK_DATES_BROWSER_TEST !== "1" }, async () => {
  const require=createRequire(import.meta.url),{chromium}=require("playwright"),base="http://localhost:3002";
  const token=await encode({secret:"disposable-work-browser-test-secret-not-for-production",maxAge:2400,token:{githubId:"89470930",provider:"github",ownerAuthVersion:1}});
  const browser=await chromium.launch({headless:true}),context=await browser.newContext({colorScheme:"dark",hasTouch:true,timezoneId:"Asia/Tokyo"});
  const ids=[],errors=[]; let page;
  await context.addCookies([{name:"next-auth.session-token",value:token,url:base}]);
  await context.route(`${base}/api/youtube**`,route=>route.fulfill({json:{items:[]}}));await context.route("https://www.youtube.com/**",route=>route.abort());
  const read=async id=>(await context.request.get(`${base}/api/todos/${id}`)).json();
  try {
    page=await context.newPage();page.setDefaultTimeout(25000);page.on("pageerror",error=>errors.push(error.message));
    for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1440,height:900},{width:2560,height:1440}]){
      const activate=locator=>viewport.width<1024?locator.tap():locator.click();
      const response=await context.request.post(`${base}/api/todos`,{headers:{"Idempotency-Key":randomUUID()},data:{title:`Phase 06 browser ${viewport.width} ${randomUUID().slice(0,8)}`,priorityLevel:"URGENT"}});assert.equal(response.status(),201);const task=await response.json();ids.push(task.id);
      await page.setViewportSize(viewport);await page.goto(`${base}/todos/${task.id}`);
      const dates=page.getByRole("region",{name:"Task dates",exact:true});
      const save=async()=>{await activate(dates.getByRole("button",{name:"Save dates",exact:true}));await dates.getByRole("form",{name:"Task date editor",exact:true}).waitFor({state:"hidden"});await dates.getByRole("button",{name:"Edit deadline",exact:true}).waitFor();};
      await activate(dates.getByRole("button",{name:"Edit deadline",exact:true}));await dates.getByRole("combobox",{name:"Date type",exact:true}).selectOption("DATE");await dates.getByLabel("Calendar date",{exact:true}).fill("2020-01-01");
      assert.equal(await page.getByRole("button",{name:"Edit",exact:true}).isDisabled(),true);await save();await dates.getByText("Overdue",{exact:true}).waitFor();assert.equal((await read(task.id)).deadlineDate,"2020-01-01");
      await activate(dates.getByRole("button",{name:"Schedule follow-up",exact:true}));await dates.getByLabel("Calendar date",{exact:true}).fill("2020-01-02");await dates.getByRole("textbox",{name:"Follow-up reason",exact:true}).fill("Check the delivery");await save();await dates.getByText("Follow-up due",{exact:true}).waitFor();
      await activate(dates.getByRole("button",{name:"Snooze follow-up",exact:true}));await dates.getByLabel("Calendar date",{exact:true}).fill("2020-01-03");await save();
      await activate(dates.getByRole("button",{name:"Complete follow-up",exact:true}));await save();assert.equal((await read(task.id)).status,"NEW");assert.equal((await read(task.id)).deadlineDate,"2020-01-01");
      await activate(dates.getByRole("button",{name:"Schedule follow-up",exact:true}));await dates.getByLabel("Calendar date",{exact:true}).fill("2020-01-04");await save();
      await page.getByRole("combobox",{name:"Task status",exact:true}).selectOption("DONE");const dialog=page.getByRole("dialog",{name:"Complete task",exact:true});await activate(dialog.getByRole("button",{name:"Complete task",exact:true}));await dialog.waitFor({state:"hidden"});
      await dates.getByText("Historical dates · No outstanding-action indicators.",{exact:true}).waitFor();assert.equal(await dates.getByText("Overdue",{exact:true}).count(),0);assert.equal((await read(task.id)).activeFollowUp,null);
      await activate(page.getByRole("button",{name:"Reopen task",exact:true}));await dates.getByText("Overdue",{exact:true}).waitFor();assert.equal((await read(task.id)).activeFollowUp,null);
      await activate(dates.getByRole("button",{name:"Edit deadline",exact:true}));await dates.getByRole("combobox",{name:"Date type",exact:true}).selectOption("TIME");await dates.getByLabel("Local date and time",{exact:true}).fill("2026-03-08T02:30");
      await activate(dates.getByRole("button",{name:"Save dates",exact:true}));await dates.getByRole("alert").filter({hasText:"does not exist"}).waitFor();assert.equal(await dates.getByLabel("Local date and time",{exact:true}).inputValue(),"2026-03-08T02:30");
      await dates.getByLabel("Local date and time",{exact:true}).fill("2026-11-01T01:30");await activate(dates.getByRole("button",{name:"Save dates",exact:true}));await dates.getByRole("alert").filter({hasText:"occurs twice"}).waitFor();
      await dates.getByRole("combobox",{name:"Repeated time occurrence",exact:true}).selectOption("later");await save();assert.equal((await read(task.id)).deadlineAt,"2026-11-01T06:30:00.000Z");await dates.getByText(/2026-11-01 01:30:00.*America\/Toronto.*GMT-5/).waitFor();
      await activate(dates.getByRole("button",{name:"Add key date",exact:true}));await dates.getByLabel("Calendar date",{exact:true}).fill("2027-01-02");await dates.getByRole("textbox",{name:"Key date label",exact:true}).fill("Delivery");await save();await dates.getByText("Delivery",{exact:true}).waitFor();
      const key=(await (await context.request.get(`${base}/api/todos/${task.id}/dates`)).json()).keyDates[0];assert.equal(key.label,"Delivery");assert.equal((await read(task.id)).deadlineAt,"2026-11-01T06:30:00.000Z");
      await activate(dates.getByRole("button",{name:"Edit deadline",exact:true}));await dates.getByRole("combobox",{name:"Date type",exact:true}).selectOption("NONE");await save();assert.equal((await read(task.id)).deadlineState,null);
      await dates.locator("summary").filter({hasText:"Follow-up history"}).focus();await page.keyboard.press("Enter");await dates.getByText("Snoozed",{exact:true}).waitFor();await dates.getByText("Outcome: Task closed; follow-up retired",{exact:true}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"date inputs must fit viewport");
      if(viewport.width===1440)await page.screenshot({path:"/tmp/work-phase06-desktop.png",fullPage:true});
      await page.goto(`${base}/todos?q=${task.reference}`);await page.getByRole("combobox",{name:"Filter deadline",exact:true}).selectOption("none");await page.locator(`[data-open-task="${task.id}"]`).waitFor();await page.getByRole("combobox",{name:"Sort work",exact:true}).selectOption("deadline");await page.locator(`[data-open-task="${task.id}"]`).waitFor();
      console.log(`Verified distinct dates, DST errors, retained follow-ups, closure/reopen and undated Urgent filter at ${viewport.width}×${viewport.height}.`);
    }
    assert.deepEqual(errors,[]);
  } catch(error){if(page)await page.screenshot({path:"/tmp/work-phase06-failure.png",fullPage:true});console.log("Browser runtime errors",errors);throw error;}
  finally {
    if(page)await page.close();
    for(const id of ids){const row=await read(id);if(!row.archivedAt){const response=await context.request.patch(`${base}/api/todos/${id}`,{headers:{"Idempotency-Key":randomUUID(),"If-Match":`"${row.revision}"`},data:{archived:true}});assert.equal(response.status(),200);}}
    await browser.close();
  }
});
