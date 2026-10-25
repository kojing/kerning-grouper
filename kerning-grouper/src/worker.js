import {createEngine} from './engine.js';
const analyze=createEngine();let generation=0;
onmessage=async e=>{if(e.data.type==='cancel'){generation++;return;}const own=++generation;try{const result=await analyze(e.data.payload,(label,value)=>postMessage({id:e.data.id,progress:{label,value}}),()=>own!==generation);if(own===generation)postMessage({id:e.data.id,result});}catch(error){if(own===generation)postMessage({id:e.data.id,error:error.message});}};
postMessage({ready:true});
