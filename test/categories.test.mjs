import test from 'node:test';
import assert from 'node:assert/strict';
import {categories,eventCategory} from '../src/categories.mjs';
import {proensLayout} from '../web/print.mjs';
import {readFile} from 'node:fs/promises';
test('PROENS palette matches reference and simultaneous classifications remain visible',async()=>{
 const css=await readFile(new URL('../web/proens.css',import.meta.url),'utf8');
 assert.equal(categories.filter(c=>c[2]).length,10);
 for(const [key,,color] of categories.filter(c=>c[2]))assert(css.includes(`.cat-${key}{background:${color}`));
 assert.equal(eventCategory({id:'inst:ifpr2027-21',name:'Criação do IFPR e da Rede Federal de EPT',category:'institucional'}),'criacao');
 const events=categories.filter(c=>c[2]).map(([category],i)=>({id:String(i),name:category,start:'2027-02-06',end:'2027-02-06',kind:'note',category}));
 const html=proensLayout({year:2027,campus:'Foz',periods:[]},events,null,null);
 assert(html.includes('class="cat-feriado"'));assert(html.includes('color-mark cat-formacao'));assert(html.includes('color-mark cat-conselho'));
 assert.equal((html.match(/class="event-columns"/g)||[]).length,12);assert(html.includes('ifpr-logo'));
 for(const [,label,color] of categories)if(color)assert(html.includes(label));
});
