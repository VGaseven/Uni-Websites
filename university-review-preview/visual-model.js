/* Pure, deterministic teaching calculations. No storage, network or random data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.STUDY_VISUAL_MODEL=api})(typeof window==='object'?window:globalThis,function(){
'use strict';
function finite(value){if(typeof value!=='number'||!Number.isFinite(value))throw new TypeError('Expected a finite number');return value}
function linear(intercept,slope,x){return finite(intercept)+finite(slope)*finite(x)}
function matrix(rows){if(!Array.isArray(rows)||!rows.length||!Array.isArray(rows[0])||!rows[0].length)throw new TypeError('Expected a nonempty matrix');const n=rows[0].length;if(!rows.every(row=>Array.isArray(row)&&row.length===n))throw new TypeError('Matrix must be rectangular');rows.forEach(row=>row.forEach(finite));return rows}
function transpose(a){matrix(a);return a[0].map((_,j)=>a.map(row=>row[j]))}
function product(a,b){matrix(a);matrix(b);if(a[0].length!==b.length)throw new RangeError('Inner matrix dimensions must agree');return a.map(row=>b[0].map((_,j)=>row.reduce((sum,x,k)=>sum+x*b[k][j],0)))}
function dotTerms(a,b,row,col){matrix(a);matrix(b);if(a[0].length!==b.length||!Number.isInteger(row)||!Number.isInteger(col)||row<0||row>=a.length||col<0||col>=b[0].length)throw new RangeError('Invalid matrix entry');return a[row].map((x,k)=>({left:x,right:b[k][col],product:x*b[k][col]}))}
return Object.freeze({linear,transpose,product,dotTerms});
});
