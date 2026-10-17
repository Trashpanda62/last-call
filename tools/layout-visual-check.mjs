import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const root=process.env.LC_URL||'http://127.0.0.1:8301/';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1800,height:1550},ignoreHTTPSErrors:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(root+'design/casino-layout.html');await page.locator('#plan svg').waitFor();
 assert.equal(await page.locator('[data-name="Trashcan"]').count(),10);
 assert.equal(await page.locator('[data-name="Derby betting pedestal"]').count(),1);
 await page.locator('[data-name="Derby betting pedestal"]').click();assert.equal(await page.locator('#selection').textContent(),'Derby betting pedestal');
 await page.getByRole('button',{name:'Before',exact:true}).click();assert.equal(await page.locator('[data-name="Derby betting pedestal"]').count(),6);
 await page.getByRole('button',{name:'Updated layout',exact:true}).click();assert.equal(await page.locator('[data-name="Derby betting pedestal"]').count(),1);
 await page.goto(root+'design/casino-layout-top-down.svg');await page.locator('svg').waitFor();
 fs.mkdirSync('shots/layout-visual',{recursive:true});await page.locator('svg').screenshot({path:'shots/layout-visual/top-down.png'});
 assert.deepEqual(errors,[]);fs.writeFileSync('shots/layout-visual/report.json',JSON.stringify({at:new Date().toISOString(),updatedPedestals:1,previousPedestals:6,comparisonToggle:true,fixtureSelection:true,errors},null,2));
 console.log('PASS: actual top-down map, single pedestal, before/after comparison and fixture selection; PNG exported.');
}finally{await browser.close();}
