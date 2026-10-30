import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
test('website gives plain actions and explains clearing phone copies',()=>{
 const html=readFileSync(new URL('./web/index.html',import.meta.url),'utf8');
 for(const s of ['手机连接码','连接这台手机','选择一张图片','清除这里选中的图片和文字（不会删除相册原图）','断开连接并清除这里的图片和文字','不会删除相册原图'])assert.ok(html.includes(s),s);
 assert.doesNotMatch(html,/配对|暂存|凭据|Tunnel|OpenAI|状态查询权限/);
 const app=readFileSync(new URL('./web/app.js',import.meta.url),'utf8');
 for(const s of ['这次没有发出','还不能确定图片是否已收到','图片已提交','不会再次发送'])assert.ok(app.includes(s),s);
 assert.doesNotMatch(app,/UTF-8|收件回执无效|问题未能暂存/);
});
test('owner approval explains viewing scope and separates phone code',()=>{
 const s=readFileSync(new URL('./server.mjs',import.meta.url),'utf8');assert.ok(s.includes('本人确认码（不是手机连接码）'));assert.ok(s.includes('允许 ChatGPT 在 30 天内查看图片'));assert.ok(s.includes('你可以随时停止允许'));assert.ok(!s.includes('读取和事件访问授权30天'));
});
test('native draft does not display raw system error descriptions',()=>{
 for(const name of ['Shared/Inbox.swift','App/SendToDotApp.swift','ShareExtension/ShareViewController.swift']){
 const s=readFileSync(new URL('./ios/'+name,import.meta.url),'utf8');assert.ok(!s.includes('error.localizedDescription'));}
});
