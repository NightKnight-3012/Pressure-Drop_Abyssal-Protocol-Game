import assert from 'node:assert/strict';
import {createFrameStats} from '../client/src/frame-stats.js';
const stats=createFrameStats();let sample;for(let i=0;i<130;i++)sample=stats.sample(1/60)||sample;assert.equal(sample.fps,60);assert.equal(sample.p95,17);stats.sample(.01,false);sample=null;for(let i=0;i<40;i++)sample=stats.sample(.04)||sample;assert.equal(sample.fps,25);assert.equal(sample.p95,40);assert.equal(stats.sample(NaN),null);assert.equal(stats.sample(-1),null);console.log('PASS measured FPS, slow frames, hidden-tab reset and invalid frame inputs');
